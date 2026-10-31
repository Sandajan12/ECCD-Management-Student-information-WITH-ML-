"""Remove Phase 1 plaintext compatibility columns after ID-based APIs are ready."""
import argparse
import hashlib
from sqlalchemy import CheckConstraint, UniqueConstraint, inspect, text
from sqlalchemy.schema import AddConstraint
from sqlalchemy.engine import Connection
from backend.config.database import engine
from backend.models import Base
from backend.migrations.phase1 import LEDGER, MigrationError, quote, select_schema, serialize_row
from backend.utils.lrn import decrypt_lrn, hash_lrn

VERSION = "002_student_identity_api"


def digest_table(connection: Connection, name: str) -> str:
    table = Base.metadata.tables[name]
    digest = hashlib.sha256()
    # Digest the actual intermediate schema, independent of later ORM changes.
    columns = [item["name"] for item in inspect(connection).get_columns(name)
               if item["name"] not in ("lrn_number", "student_lrn")]
    q = connection.dialect.identifier_preparer.quote
    projection = ", ".join(q(column) for column in columns)
    ordering = ", ".join(q(column.name) for column in table.primary_key.columns)
    for row in connection.execute(text(f"SELECT {projection} FROM {q(name)} ORDER BY {ordering}")):
        digest.update(serialize_row(row))
    return digest.hexdigest()


def check_phase2(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    inspector = inspect(connection)
    # Unversioned ORM-created test schemas already describe the current model.
    historical_identity = inspector.has_table(LEDGER, schema=schema) and not connection.execute(text(
        f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version='013_email_only_identity')"
    )).scalar_one()
    for name, table in Base.metadata.tables.items():
        actual = {column["name"] for column in inspector.get_columns(name, schema=schema)}
        expected = set(table.columns.keys())
        if historical_identity and name == "users":
            expected.add("username")
        if historical_identity and name == "system_settings":
            expected.discard("chairman_name")
        if actual != expected:
            raise MigrationError(f"Phase 2 columns mismatch: {name}")
        if inspector.get_pk_constraint(name, schema=schema)["constrained_columns"] != list(table.primary_key.columns.keys()):
            raise MigrationError(f"Phase 2 primary key mismatch: {name}")
        foreign_keys = {(tuple(item['constrained_columns']), item['referred_table'], tuple(item['referred_columns']), item['options'].get('ondelete')) for item in inspector.get_foreign_keys(name, schema=schema)}
        for constraint in table.foreign_key_constraints:
            targets = list(constraint.elements)
            signature = (tuple(constraint.column_keys), targets[0].column.table.name, tuple(target.column.name for target in targets), constraint.ondelete)
            if signature not in foreign_keys:
                raise MigrationError(f"Phase 2 foreign key mismatch: {name}")
        unique = {tuple(item['column_names']) for item in inspector.get_unique_constraints(name, schema=schema)}
        if any(tuple(constraint.columns.keys()) not in unique for constraint in table.constraints if isinstance(constraint, UniqueConstraint)):
            raise MigrationError(f"Phase 2 unique constraint mismatch: {name}")
        checks = {item['name'] for item in inspector.get_check_constraints(name, schema=schema)}
        if any(constraint.name not in checks for constraint in table.constraints if isinstance(constraint, CheckConstraint)):
            raise MigrationError(f"Phase 2 check constraint mismatch: {name}")
    for row in connection.execute(text("SELECT lrn_encrypted, lrn_search_hash, lrn_last4 FROM students")):
        if all(value is None for value in row):
            continue
        try:
            value = decrypt_lrn(row.lrn_encrypted)
            if hash_lrn(value) != row.lrn_search_hash or value[-4:] != row.lrn_last4:
                raise ValueError()
        except ValueError:
            raise MigrationError("Protected LRN integrity check failed") from None


def apply_phase2(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    inspector = inspect(connection)
    if not inspector.has_table(LEDGER, schema=schema):
        raise MigrationError("Apply Phase 1 before Phase 2")
    if connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:version)"), {"version": VERSION}).scalar_one():
        check_phase2(connection, schema)
        return False
    connection.execute(text("LOCK TABLE students, family_access, student_eccd_evaluations IN ACCESS EXCLUSIVE MODE"))
    before = {name: digest_table(connection, name) for name in Base.metadata.tables}
    for row in connection.execute(text("SELECT lrn_number, lrn_encrypted, lrn_search_hash FROM students")):
        if decrypt_lrn(row.lrn_encrypted) != row.lrn_number or hash_lrn(row.lrn_number) != row.lrn_search_hash:
            raise MigrationError("LRN migration integrity check failed")
    for name in ("family_access", "student_eccd_evaluations"):
        for constraint in inspector.get_foreign_keys(name, schema=schema):
            if "student_lrn" in constraint["constrained_columns"]:
                connection.execute(text(f"ALTER TABLE {name} DROP CONSTRAINT {quote(connection, constraint['name'])}"))
        connection.execute(text(f"ALTER TABLE {name} DROP COLUMN student_lrn"))
    for constraint in inspector.get_unique_constraints("students", schema=schema):
        if "lrn_number" in constraint["column_names"]:
            connection.execute(text(f"ALTER TABLE students DROP CONSTRAINT {quote(connection, constraint['name'])}"))
    connection.execute(text("ALTER TABLE students DROP COLUMN lrn_number"))
    # Verify/recreate all ID-based FK relationships, including fresh installations.
    for name, table in Base.metadata.tables.items():
        existing = inspect(connection).get_foreign_keys(name, schema=schema)
        for constraint in table.foreign_key_constraints:
            targets = list(constraint.elements)
            matches = [item for item in existing if tuple(item['constrained_columns']) == tuple(constraint.column_keys) and item['referred_table'] == targets[0].column.table.name and item['referred_columns'] == [target.column.name for target in targets]]
            if matches and all(item['options'].get('ondelete') == constraint.ondelete for item in matches):
                continue
            for item in matches:
                connection.execute(text(f"ALTER TABLE {name} DROP CONSTRAINT {quote(connection, item['name'])}"))
            connection.execute(AddConstraint(constraint, isolate_from_table=False))
    check_phase2(connection, schema)
    for name in before:
        if digest_table(connection, name) != before[name]:
            raise MigrationError(f"Phase 2 data preservation check failed: {name}")
    connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version)"), {"version": VERSION})
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true")
    group.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    try:
        with engine.begin() as connection:
            if arguments.apply:
                changed = apply_phase2(connection)
                print("Phase 2 migration applied." if changed else "Phase 2 already applied; integrity checks passed.")
            else:
                check_phase2(connection)
                print("Phase 2 schema and protected LRNs verified.")
        return 0
    except MigrationError as error:
        print(f"Migration stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Migration stopped ({type(error).__name__}). No changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
