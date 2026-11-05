"""Add the actual teacher save time without inventing historical timestamps."""
import argparse

from sqlalchemy import DateTime, inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema

VERSION = "016_teacher_marked_at"
TABLE = "student_eccd_evaluations"


def check_teacher_marked_at(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    column = next((item for item in inspect(connection).get_columns(TABLE, schema=schema)
                   if item["name"] == "teacher_marked_at"), None)
    if (column is None or not column["nullable"] or column.get("default") is not None
            or not isinstance(column["type"], DateTime) or not column["type"].timezone):
        raise MigrationError("Missing/incompatible teacher_marked_at; run python -m backend.migrations.teacher_marked_at --apply")


def apply_teacher_marked_at(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    # Serialize cloud workers, including the first deployment of the column.
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    if "teacher_marked_at" not in {item["name"] for item in inspect(connection).get_columns(TABLE, schema=schema)}:
        connection.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN IF NOT EXISTS teacher_marked_at TIMESTAMPTZ NULL"))
    check_teacher_marked_at(connection, schema)
    return bool(connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version) ON CONFLICT DO NOTHING"),
                                   {"version": VERSION}).rowcount)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_teacher_marked_at if args.apply else check_teacher_marked_at)(connection)
        print("Teacher save timestamp schema verified.")
        return 0
    except MigrationError as error:
        print(f"Teacher timestamp migration stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Teacher timestamp migration stopped ({type(error).__name__}); no changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
