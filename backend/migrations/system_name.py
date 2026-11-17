"""022: rename customizable branding without changing any stored settings values."""
import argparse

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.constants import DEFAULT_SYSTEM_NAME
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema
from backend.migrations.phase2 import check_phase2

VERSION = "022_system_name"


def check_system_name(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    columns = {column["name"]: column for column in inspect(connection).get_columns("system_settings", schema=schema)}
    column = columns.get("system_name")
    if column is None or "school_name" in columns:
        raise MigrationError("Explicitly apply migration 022 (backend.migrations.system_name --apply) before starting the API")
    if column["nullable"] or str(column["type"]) != "VARCHAR(255)" or column["default"] != f"'{DEFAULT_SYSTEM_NAME}'::character varying":
        raise MigrationError("System name type, nullability or default differs from migration 022")
    if not connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:v)"), {"v": VERSION}).scalar_one():
        raise MigrationError("Migration 022 is not recorded")


def apply_system_name(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text("SET LOCAL lock_timeout='5s'"))
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    connection.execute(text("LOCK TABLE system_settings IN ACCESS EXCLUSIVE MODE"))
    if connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:v)"), {"v": VERSION}).scalar_one():
        check_system_name(connection, schema)
        return False
    columns = {column["name"] for column in inspect(connection).get_columns("system_settings", schema=schema)}
    if "school_name" not in columns or "system_name" in columns:
        raise MigrationError("Expected only the historical school_name column; review schema before applying 022")
    check_phase2(connection, schema)
    before = list(connection.execute(text("SELECT to_jsonb(s) - 'school_name', school_name FROM system_settings s ORDER BY id")))
    connection.execute(text("ALTER TABLE system_settings RENAME COLUMN school_name TO system_name"))
    # Change only the future-row default, preserving every existing custom name.
    connection.execute(text("ALTER TABLE system_settings ALTER COLUMN system_name SET DEFAULT 'ECCD Management System'"))
    after = list(connection.execute(text("SELECT to_jsonb(s) - 'system_name', system_name FROM system_settings s ORDER BY id")))
    if before != after:
        raise MigrationError("Settings data preservation failed")
    connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:v)"), {"v": VERSION})
    check_system_name(connection, schema)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--schema", default="public")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_system_name if args.apply else check_system_name)(connection, args.schema)
        print("Migration 022 verified.")
        return 0
    except MigrationError as error:
        print(f"Migration 022 stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Migration 022 stopped ({type(error).__name__}). No changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
