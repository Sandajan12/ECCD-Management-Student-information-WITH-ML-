"""Phase 1: add migration features while keeping the existing API columns.

Run from the repository root with --check or --apply. All DDL and backfills
commit together; an error rolls back the complete migration.
"""

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, ForeignKeyConstraint, UniqueConstraint, inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.schema import AddConstraint, CreateColumn

from backend.config.database import engine
from backend.migrations.phase1_schema import phase1_metadata
from backend.models.email_verification import EmailVerification
from backend.utils.lrn import decrypt_lrn, encrypt_lrn, hash_lrn, validate_lrn

VERSION = "001_legacy_features"
class Base:
    metadata = phase1_metadata()

LEDGER = "ames_schema_migrations"
BASELINE_TABLES = set(Base.metadata.tables) - {"user_trusted_devices"}


def serialize_row(row: object) -> bytes:
    values = [value.astimezone(timezone.utc).replace(tzinfo=None) if isinstance(value, datetime) and value.tzinfo is not None else value for value in row]
    return json.dumps(values, default=str, ensure_ascii=True).encode()


class MigrationError(Exception):
    """A safe diagnostic containing no database values or connection secrets."""


def select_schema(connection: Connection, schema: str) -> None:
    if not re.fullmatch(r"[a-z][a-z0-9_]*", schema):
        raise MigrationError("Invalid migration schema identifier")
    if schema not in inspect(connection).get_schema_names():
        raise MigrationError("Migration schema does not exist")
    connection.execute(text("SELECT set_config('search_path', :schema, true)"), {"schema": schema})


def quote(connection: Connection, name: str) -> str:
    return connection.dialect.identifier_preparer.quote(name)


def fingerprints(connection: Connection, schema: str) -> dict[str, tuple[list[str], str]]:
    """Verify all original columns and rows, including credential hashes, survive."""
    result = {}
    inspector = inspect(connection)
    for name in sorted(BASELINE_TABLES):
        columns = [column["name"] for column in inspector.get_columns(name, schema=schema)]
        primary = inspector.get_pk_constraint(name, schema=schema)["constrained_columns"]
        projection = ", ".join(quote(connection, column) for column in columns)
        ordering = ", ".join(quote(connection, column) for column in primary)
        digest = hashlib.sha256()
        for row in connection.execute(text(f"SELECT {projection} FROM {quote(connection, name)} ORDER BY {ordering}")):
            digest.update(serialize_row(row))
            digest.update(b"\n")
        result[name] = (columns, digest.hexdigest())
    return result


def verify_preservation(connection: Connection, before: dict[str, tuple[list[str], str]]) -> None:
    for name, (columns, expected) in before.items():
        projection = ", ".join(quote(connection, column) for column in columns)
        # Preserve the old ordering after the student primary key changes.
        primary = "lrn_number" if name == "students" else Base.metadata.tables[name].primary_key.columns.keys()[0]
        digest = hashlib.sha256()
        for row in connection.execute(text(f"SELECT {projection} FROM {quote(connection, name)} ORDER BY {quote(connection, primary)}")):
            digest.update(serialize_row(row))
            digest.update(b"\n")
        if digest.hexdigest() != expected:
            raise MigrationError(f"Original data preservation check failed for {name}")


def backfill_lrn(connection: Connection) -> None:
    for row in connection.execute(text("SELECT student_id, lrn_number, lrn_encrypted, lrn_search_hash, lrn_last4 FROM students")).mappings():
        try:
            lrn = validate_lrn(row["lrn_number"])
            encrypted = row["lrn_encrypted"] or encrypt_lrn(lrn)
            expected_hash = hash_lrn(lrn)
            if decrypt_lrn(encrypted) != lrn:
                raise ValueError("LRN envelope mismatch")
            if row["lrn_search_hash"] not in (None, expected_hash) or row["lrn_last4"] not in (None, lrn[-4:]):
                raise ValueError("LRN search index mismatch")
        except ValueError:
            raise MigrationError("Student LRN validation failed; verify 12-digit LRNs and original keys") from None
        if row["lrn_encrypted"] is None or row["lrn_search_hash"] is None or row["lrn_last4"] is None:
            connection.execute(text("UPDATE students SET lrn_encrypted=:encrypted, lrn_search_hash=:hashed, lrn_last4=:suffix WHERE student_id=:id"),
                               {"encrypted": encrypted, "hashed": expected_hash, "suffix": lrn[-4:], "id": row["student_id"]})


def add_constraints(connection: Connection, schema: str) -> None:
    for table in Base.metadata.sorted_tables:
        inspector = inspect(connection)
        existing_unique = {tuple(item["column_names"]) for item in inspector.get_unique_constraints(table.name, schema=schema)}
        existing_fk = {
            (tuple(item["constrained_columns"]), item["referred_table"], tuple(item["referred_columns"]))
            for item in inspector.get_foreign_keys(table.name, schema=schema)
        }
        existing_checks = {item["name"] for item in inspector.get_check_constraints(table.name, schema=schema)}
        for constraint in table.constraints:
            if isinstance(constraint, UniqueConstraint):
                columns = tuple(constraint.columns.keys())
                if columns not in existing_unique:
                    connection.execute(AddConstraint(constraint, isolate_from_table=False))
                    existing_unique.add(columns)
            elif isinstance(constraint, ForeignKeyConstraint):
                targets = list(constraint.elements)
                signature = (tuple(constraint.columns.keys()), targets[0].column.table.name, tuple(item.column.name for item in targets))
                if signature not in existing_fk:
                    connection.execute(AddConstraint(constraint, isolate_from_table=False))
                    existing_fk.add(signature)
            elif isinstance(constraint, CheckConstraint) and constraint.name not in existing_checks:
                connection.execute(AddConstraint(constraint, isolate_from_table=False))
        for index in table.indexes:
            index.create(connection, checkfirst=True)


def check_phase1(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    inspector = inspect(connection)
    tables = set(inspector.get_table_names(schema=schema))
    if not set(Base.metadata.tables) <= tables:
        raise MigrationError("Phase 1 tables are missing; run the migration with --apply")
    for table in Base.metadata.sorted_tables:
        columns = {column["name"]: column for column in inspector.get_columns(table.name, schema=schema)}
        for column in table.columns:
            if column.name not in columns:
                raise MigrationError(f"Phase 1 column missing: {table.name}.{column.name}")
            if not column.nullable and columns[column.name]["nullable"]:
                raise MigrationError(f"Required column is nullable: {table.name}.{column.name}")
            if column.type.compile(dialect=connection.dialect) != columns[column.name]["type"].compile(dialect=connection.dialect):
                raise MigrationError(f"Phase 1 column type mismatch: {table.name}.{column.name}")
        primary = inspector.get_pk_constraint(table.name, schema=schema)["constrained_columns"]
        if primary != list(table.primary_key.columns.keys()):
            raise MigrationError(f"Phase 1 primary key mismatch: {table.name}")
        unique = {tuple(item["column_names"]) for item in inspector.get_unique_constraints(table.name, schema=schema)}
        foreign = {
            (tuple(item["constrained_columns"]), item["referred_table"], tuple(item["referred_columns"]))
            for item in inspector.get_foreign_keys(table.name, schema=schema)
        }
        checks = {item["name"] for item in inspector.get_check_constraints(table.name, schema=schema)}
        for constraint in table.constraints:
            if isinstance(constraint, UniqueConstraint) and tuple(constraint.columns.keys()) not in unique:
                raise MigrationError(f"Phase 1 unique constraint missing: {table.name}")
            if isinstance(constraint, ForeignKeyConstraint):
                targets = list(constraint.elements)
                signature = (tuple(constraint.columns.keys()), targets[0].column.table.name, tuple(item.column.name for item in targets))
                if signature not in foreign:
                    raise MigrationError(f"Phase 1 foreign key missing: {table.name}")
            if isinstance(constraint, CheckConstraint) and constraint.name not in checks:
                raise MigrationError(f"Phase 1 check constraint missing: {table.name}")
        indexes = {item["name"]: item["column_names"] for item in inspector.get_indexes(table.name, schema=schema)}
        for index in table.indexes:
            if indexes.get(index.name) != list(index.columns.keys()):
                raise MigrationError(f"Phase 1 index missing: {table.name}.{index.name}")
    expires = next(item for item in inspector.get_columns("email_verifications", schema=schema) if item["name"] == "expires_at")
    if not expires["type"].timezone:
        raise MigrationError("OTP expiry timestamps must include a timezone")
    for row in connection.execute(text("SELECT lrn_number, lrn_encrypted, lrn_search_hash, lrn_last4 FROM students")).mappings():
        try:
            if decrypt_lrn(row["lrn_encrypted"]) != row["lrn_number"] or hash_lrn(row["lrn_number"]) != row["lrn_search_hash"] or row["lrn_last4"] != row["lrn_number"][-4:]:
                raise ValueError("LRN mismatch")
        except ValueError:
            raise MigrationError("Student LRN integrity check failed; restore the original keys") from None


def apply_phase1(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    # Fail before DDL if encryption configuration is incomplete.
    encrypt_lrn("000000000001")
    hash_lrn("000000000001")
    inspector = inspect(connection)
    tables = set(inspector.get_table_names(schema=schema))
    if LEDGER in tables and connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:version)"), {"version": VERSION}).scalar_one():
        check_phase1(connection, schema)
        return False
    if tables & BASELINE_TABLES and not BASELINE_TABLES <= tables:
        raise MigrationError("Incomplete existing schema; restore its missing baseline tables first")
    if not tables & BASELINE_TABLES:
        Base.metadata.create_all(connection)
    else:
        # Prevent concurrent writes between original-data checks and backfill.
        connection.execute(text("LOCK TABLE " + ", ".join(quote(connection, name) for name in sorted(BASELINE_TABLES)) + " IN SHARE ROW EXCLUSIVE MODE"))
        before = fingerprints(connection, schema)
        old_columns = {name: {item["name"] for item in inspect(connection).get_columns(name, schema=schema)} for name in BASELINE_TABLES}
        if "student_id" in old_columns["students"]:
            raise MigrationError("Unversioned student-ID schema detected; review it before applying")
        EmailVerification.__table__.c.purpose.type.create(connection, checkfirst=True)
        for table in Base.metadata.sorted_tables:
            if table.name not in tables:
                table.create(connection)
                continue
            for column in table.columns:
                if column.name in old_columns[table.name]:
                    continue
                ddl = str(CreateColumn(column).compile(dialect=connection.dialect))
                if table.name == "students" and column.name in ("lrn_encrypted", "lrn_search_hash", "lrn_last4"):
                    ddl = ddl.replace(" NOT NULL", "")
                if table.name in ("family_access", "student_eccd_evaluations") and column.name == "student_id":
                    ddl = "student_id INTEGER"
                connection.execute(text(f"ALTER TABLE {quote(connection, table.name)} ADD COLUMN {ddl}"))
        backfill_lrn(connection)
        for name in ("lrn_encrypted", "lrn_search_hash", "lrn_last4"):
            connection.execute(text(f"ALTER TABLE students ALTER COLUMN {name} SET NOT NULL"))
        # Preserve uniqueness for the temporary old LRN foreign-key pair.
        for constraint in Base.metadata.tables["students"].constraints:
            if isinstance(constraint, UniqueConstraint):
                connection.execute(AddConstraint(constraint, isolate_from_table=False))
        for name in ("family_access", "student_eccd_evaluations"):
            for foreign_key in inspect(connection).get_foreign_keys(name, schema=schema):
                if foreign_key["referred_table"] == "students":
                    connection.execute(text(f"ALTER TABLE {name} DROP CONSTRAINT {quote(connection, foreign_key['name'])}"))
            connection.execute(text(f"UPDATE {name} AS child SET student_id=student.student_id FROM students AS student WHERE child.student_lrn=student.lrn_number"))
            connection.execute(text(f"ALTER TABLE {name} ALTER COLUMN student_id SET NOT NULL"))
        primary = inspect(connection).get_pk_constraint("students", schema=schema)["name"]
        connection.execute(text(f"ALTER TABLE students DROP CONSTRAINT {quote(connection, primary)}"))
        connection.execute(text("ALTER TABLE students ADD PRIMARY KEY (student_id)"))
        for constraint in inspect(connection).get_unique_constraints("student_eccd_evaluations", schema=schema):
            if "student_lrn" in constraint["column_names"]:
                connection.execute(text(f"ALTER TABLE student_eccd_evaluations DROP CONSTRAINT {quote(connection, constraint['name'])}"))
        connection.execute(text("ALTER TABLE system_logs ALTER COLUMN details TYPE TEXT"))
        connection.execute(text("ALTER TABLE email_verifications ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC'"))
        add_constraints(connection, schema)
        verify_preservation(connection, before)
    connection.execute(text(f"CREATE TABLE IF NOT EXISTS {LEDGER} (version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"))
    check_phase1(connection, schema)
    connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version)"), {"version": VERSION})
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check", action="store_true", help="Read-only schema and LRN integrity check")
    action.add_argument("--apply", action="store_true", help="Apply Phase 1 atomically")
    arguments = parser.parse_args()
    try:
        with engine.begin() as connection:
            if arguments.apply:
                changed = apply_phase1(connection)
                print("Phase 1 migration applied." if changed else "Phase 1 already applied; integrity checks passed.")
            else:
                check_phase1(connection)
                print("Phase 1 schema and LRN integrity checks passed.")
        return 0
    except MigrationError as error:
        print(f"Migration stopped: {error}. No changes committed.")
    except Exception as error:
        # Database exceptions can include parameter values or the URL; never print them.
        print(f"Migration stopped ({type(error).__name__}). No changes committed. Check PostgreSQL availability and schema compatibility.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
