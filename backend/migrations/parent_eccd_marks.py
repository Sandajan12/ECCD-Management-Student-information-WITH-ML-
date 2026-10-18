"""Add the independent, default-off parent checklist marks permission.

uv run --no-project --python .venv312 python -m backend.migrations.parent_eccd_marks --apply
"""
import argparse

from sqlalchemy import Boolean, inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema

VERSION = "009_parent_eccd_marks"
COLUMN = "allow_parent_view_eccd_marks"


def check_parent_eccd_marks(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    columns = {column["name"]: column for column in inspect(connection).get_columns("teachers", schema=schema)}
    column = columns.get(COLUMN)
    if column is None or not isinstance(column["type"], Boolean) or column["nullable"] or column["default"] not in ("false", "'0'::boolean"):
        raise MigrationError("Parent checklist marks permission missing/incompatible; run python -m backend.migrations.parent_eccd_marks --apply")


def apply_parent_eccd_marks(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    connection.execute(text("LOCK TABLE teachers IN ACCESS EXCLUSIVE MODE"))
    # Compare every existing teacher field, including all independent permissions.
    before = list(connection.execute(text(f"SELECT to_jsonb(t) - '{COLUMN}' FROM teachers t ORDER BY teacher_id")))
    columns = {column["name"] for column in inspect(connection).get_columns("teachers", schema=schema)}
    if COLUMN not in columns:
        connection.execute(text(f"ALTER TABLE teachers ADD COLUMN {COLUMN} BOOLEAN NOT NULL DEFAULT false"))
    check_parent_eccd_marks(connection, schema)
    after = list(connection.execute(text(f"SELECT to_jsonb(t) - '{COLUMN}' FROM teachers t ORDER BY teacher_id")))
    if before != after:
        raise MigrationError("Teacher data preservation failed")
    return bool(connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version) ON CONFLICT DO NOTHING"), {"version": VERSION}).rowcount)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_parent_eccd_marks if args.apply else check_parent_eccd_marks)(connection)
        print("Parent ECCD marks schema verified.")
        return 0
    except MigrationError as error:
        print(f"Parent ECCD marks migration stopped: {error}. No changes committed.")
        return 1
    except Exception as error:
        print(f"Parent ECCD marks migration stopped ({type(error).__name__}); no changes committed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
