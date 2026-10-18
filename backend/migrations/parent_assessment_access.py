"""Add section assessment windows; PRE open, MID/POST closed as in legacy.

uv run --no-project --python .venv312 python -m backend.migrations.parent_assessment_access --apply
"""
import argparse
from sqlalchemy import Boolean, inspect, text
from sqlalchemy.engine import Connection
from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema
from backend.utils.assessment_access import PERIOD_FLAGS

VERSION = "006_parent_assessment_access"


def check_parent_assessment_access(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    columns = {column["name"]: column for column in inspect(connection).get_columns("sections", schema=schema)}
    for name in PERIOD_FLAGS.values():
        column = columns.get(name)
        if column is None or not isinstance(column["type"], Boolean) or column["nullable"]:
            raise MigrationError("Parent assessment windows are missing/incompatible; run parent_assessment_access --apply")


def apply_parent_assessment_access(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text("LOCK TABLE ames_schema_migrations IN EXCLUSIVE MODE"))
    connection.execute(text("LOCK TABLE sections IN ACCESS EXCLUSIVE MODE"))
    before = list(connection.execute(text("SELECT section_id, section_name, adviser_teacher_id, created_at FROM sections ORDER BY section_id")))
    columns = {column["name"] for column in inspect(connection).get_columns("sections", schema=schema)}
    for period, name in PERIOD_FLAGS.items():
        if name not in columns:
            default = "true" if period == "PRE" else "false"
            connection.execute(text(f"ALTER TABLE sections ADD COLUMN {name} BOOLEAN NOT NULL DEFAULT {default}"))
    check_parent_assessment_access(connection, schema)
    after = list(connection.execute(text("SELECT section_id, section_name, adviser_teacher_id, created_at FROM sections ORDER BY section_id")))
    if before != after:
        raise MigrationError("Section data preservation failed")
    return bool(connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version) ON CONFLICT DO NOTHING"), {"version": VERSION}).rowcount)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_parent_assessment_access if args.apply else check_parent_assessment_access)(connection)
        print("Parent assessment access schema verified.")
        return 0
    except MigrationError as error:
        print(f"Parent assessment migration stopped: {error}. No changes committed.")
        return 1
    except Exception as error:
        print(f"Parent assessment migration stopped ({type(error).__name__}); no changes committed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
