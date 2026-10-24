"""Retire orphaned section ownership, preserving each teacher's current class.

Apply explicitly with --apply; --check verifies ownership without changing data.
Only assignment status and section adviser pointers change; history is retained.
"""
import argparse

from sqlalchemy import text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.adviser_takeover import preservation_digest
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema

VERSION = "011_section_ownership"


def check_section_ownership(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    duplicates = connection.execute(text("""
        SELECT teacher_id FROM section_teachers
        WHERE status = 'Active' AND role = 'Primary Adviser'
        GROUP BY teacher_id HAVING count(*) > 1
    """)).first()
    mismatch = connection.execute(text("""
        SELECT s.section_id FROM sections s
        LEFT JOIN section_teachers a ON a.section_id = s.section_id
            AND a.status = 'Active' AND a.role = 'Primary Adviser'
        WHERE s.adviser_teacher_id IS DISTINCT FROM a.teacher_id LIMIT 1
    """)).first()
    if duplicates or mismatch:
        raise MigrationError("Orphaned section ownership remains; run python -m backend.migrations.section_ownership --apply")


def apply_section_ownership(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    connection.execute(text("LOCK TABLE sections, section_teachers, teachers IN ACCESS EXCLUSIVE MODE"))
    before = preservation_digest(connection, schema)
    sections_before = list(connection.execute(text(
        "SELECT to_jsonb(s) - 'adviser_teacher_id' FROM sections s ORDER BY section_id"
    )))
    history_before = list(connection.execute(text(
        "SELECT to_jsonb(a) - 'status' FROM section_teachers a ORDER BY id"
    )))
    # The displayed current class is backed by an active assignment, rather than
    # inferred from a larger section ID (which can be the orphaned section).
    retired = connection.execute(text("""
        WITH ranked AS (
            SELECT a.id, row_number() OVER (
                PARTITION BY a.teacher_id
                ORDER BY (s.section_name = t.class_name) DESC NULLS LAST,
                         a.assigned_date DESC NULLS LAST, a.id DESC
            ) AS position
            FROM section_teachers a
            JOIN sections s ON s.section_id = a.section_id
            JOIN teachers t ON t.teacher_id = a.teacher_id
            WHERE a.status = 'Active' AND a.role = 'Primary Adviser'
        )
        UPDATE section_teachers a SET status = 'Inactive'
        FROM ranked r WHERE a.id = r.id AND r.position > 1
    """)).rowcount
    repaired = connection.execute(text("""
        UPDATE sections s SET adviser_teacher_id = (
            SELECT a.teacher_id FROM section_teachers a
            WHERE a.section_id = s.section_id AND a.status = 'Active'
                AND a.role = 'Primary Adviser'
        ) WHERE s.adviser_teacher_id IS DISTINCT FROM (
            SELECT a.teacher_id FROM section_teachers a
            WHERE a.section_id = s.section_id AND a.status = 'Active'
                AND a.role = 'Primary Adviser'
        )
    """)).rowcount
    if before != preservation_digest(connection, schema):
        raise MigrationError("School data preservation failed")
    if sections_before != list(connection.execute(text(
        "SELECT to_jsonb(s) - 'adviser_teacher_id' FROM sections s ORDER BY section_id"
    ))):
        raise MigrationError("Section settings preservation failed")
    if history_before != list(connection.execute(text(
        "SELECT to_jsonb(a) - 'status' FROM section_teachers a ORDER BY id"
    ))):
        raise MigrationError("Assignment history preservation failed")
    check_section_ownership(connection, schema)
    recorded = connection.execute(text(
        f"INSERT INTO {LEDGER} (version) VALUES (:version) ON CONFLICT DO NOTHING"
    ), {"version": VERSION}).rowcount
    return bool(retired or repaired or recorded)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_section_ownership if args.apply else check_section_ownership)(connection)
        print("Section ownership verified.")
        return 0
    except MigrationError as error:
        print(f"Section ownership cleanup stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Section ownership cleanup stopped ({type(error).__name__}); no changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
