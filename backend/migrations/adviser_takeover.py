"""Retire legacy Substitute access and enforce one active adviser per section.

Run explicitly with --apply, then --check. Startup only validates the schema.
Assignment rows/IDs/dates and all student, evaluation and permission data survive.
"""
import argparse
import hashlib
import re

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema, serialize_row

VERSION = "008_adviser_takeover"
INDEX = "uq_section_active_adviser"


def check_adviser_takeover(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    indexes = {item["name"]: item for item in inspect(connection).get_indexes("section_teachers", schema=schema)}
    index = indexes.get(INDEX)
    normalize = lambda sql: re.sub(r"\s|[()]|::text|::character varying", "", sql or "")
    checks = {item["name"]: item["sqltext"] for item in inspect(connection).get_check_constraints("section_teachers", schema=schema)}
    migrated = connection.execute(text(f"SELECT 1 FROM {LEDGER} WHERE version = :version"), {"version": VERSION}).scalar()
    if (not migrated or not index or not index["unique"] or index["column_names"] != ["section_id"]
            or normalize(index.get("dialect_options", {}).get("postgresql_where")) != "status='Active'"
            or normalize(checks.get("ck_section_teacher_role")) != "role='PrimaryAdviser'"):
        raise MigrationError("Adviser ownership schema is not ready; run python -m backend.migrations.adviser_takeover --apply")
    if connection.execute(text("SELECT 1 FROM section_teachers WHERE role <> 'Primary Adviser' LIMIT 1")).scalar():
        raise MigrationError("Removed assignment roles remain; run adviser_takeover --apply")


def preservation_digest(connection: Connection, schema: str) -> str:
    """Fingerprint untouched school data without logging any protected values."""
    digest = hashlib.sha256()
    inspector = inspect(connection)
    for table in ("students", "student_eccd_evaluations", "family_access", "parents", "teachers", "users"):
        primary = inspector.get_pk_constraint(table, schema=schema)["constrained_columns"][0]
        for row in connection.execute(text(f"SELECT * FROM {table} ORDER BY {primary}")):
            digest.update(serialize_row(row))
    return digest.hexdigest()


def apply_adviser_takeover(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text("LOCK TABLE ames_schema_migrations IN EXCLUSIVE MODE"))
    connection.execute(text("LOCK TABLE sections, section_teachers IN ACCESS EXCLUSIVE MODE"))
    if connection.execute(text(f"SELECT 1 FROM {LEDGER} WHERE version = :version"), {"version": VERSION}).scalar():
        check_adviser_takeover(connection, schema)
        return False
    if connection.execute(text("SELECT section_id FROM section_teachers WHERE role = 'Primary Adviser' AND status = 'Active' GROUP BY section_id HAVING count(*) > 1 LIMIT 1")).scalar():
        raise MigrationError("Multiple active advisers exist; resolve section ownership before migration")
    before = preservation_digest(connection, schema)
    section_columns = [column["name"] for column in inspect(connection).get_columns("sections", schema=schema) if column["name"] != "adviser_teacher_id"]
    projection = ", ".join(section_columns)
    sections_before = list(connection.execute(text(f"SELECT {projection} FROM sections ORDER BY section_id")))
    history_before = list(connection.execute(text("SELECT id, section_id, teacher_id, assigned_date FROM section_teachers ORDER BY id")))
    # Preserve the retired role in the audit trail before normalizing its rows.
    connection.execute(text("""
        INSERT INTO system_logs (action_type, details)
        SELECT 'RETIRED_SECTION_ROLE', 'Retired Substitute assignment ' || id ||
            ' for teacher ' || teacher_id || ' in section ' || section_id || '; previous status: ' || status
        FROM section_teachers WHERE role = 'Substitute'
    """))
    connection.execute(text("UPDATE section_teachers SET status = 'Inactive', role = 'Primary Adviser' WHERE role = 'Substitute'"))
    connection.execute(text("ALTER TABLE section_teachers DROP CONSTRAINT IF EXISTS ck_section_teacher_role"))
    connection.execute(text("ALTER TABLE section_teachers ADD CONSTRAINT ck_section_teacher_role CHECK (role = 'Primary Adviser')"))
    connection.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS {INDEX} ON section_teachers (section_id) WHERE status = 'Active'"))
    connection.execute(text("""
        UPDATE sections s SET adviser_teacher_id = (
            SELECT teacher_id FROM section_teachers a
            WHERE a.section_id = s.section_id AND a.status = 'Active'
        )
    """))
    if before != preservation_digest(connection, schema):
        raise MigrationError("School data preservation failed")
    if sections_before != list(connection.execute(text(f"SELECT {projection} FROM sections ORDER BY section_id"))):
        raise MigrationError("Section settings preservation failed")
    if history_before != list(connection.execute(text("SELECT id, section_id, teacher_id, assigned_date FROM section_teachers ORDER BY id"))):
        raise MigrationError("Assignment history preservation failed")
    connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version)"), {"version": VERSION})
    check_adviser_takeover(connection, schema)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_adviser_takeover if args.apply else check_adviser_takeover)(connection)
        print("Adviser ownership schema verified.")
        return 0
    except MigrationError as error:
        print(f"Adviser migration stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Adviser migration stopped ({type(error).__name__}); no changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
