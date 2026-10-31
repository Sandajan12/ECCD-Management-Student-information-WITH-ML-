"""Allow enrollment before an LRN is assigned, preserving protected identifiers."""
import argparse

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema
from backend.migrations.phase2 import digest_table

VERSION = "015_optional_student_lrn"
COLUMNS = ("lrn_encrypted", "lrn_search_hash", "lrn_last4")


def check_optional_student_lrn(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    columns = {column["name"]: column for column in inspect(connection).get_columns("students", schema=schema)}
    if any(name not in columns or not columns[name]["nullable"] for name in COLUMNS):
        raise MigrationError("Optional student LRN schema missing; run python -m backend.migrations.optional_student_lrn --apply")


def apply_optional_student_lrn(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    connection.execute(text("LOCK TABLE students IN ACCESS EXCLUSIVE MODE"))
    before = digest_table(connection, "students")
    for name in COLUMNS:
        connection.execute(text(f"ALTER TABLE students ALTER COLUMN {name} DROP NOT NULL"))
    check_optional_student_lrn(connection, schema)
    if before != digest_table(connection, "students"):
        raise MigrationError("Student data preservation failed")
    return bool(connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version) ON CONFLICT DO NOTHING"), {"version": VERSION}).rowcount)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_optional_student_lrn if args.apply else check_optional_student_lrn)(connection)
        print("Optional student LRN schema verified.")
        return 0
    except MigrationError as error:
        print(f"Optional LRN migration stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Optional LRN migration stopped ({type(error).__name__}); no changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
