"""018: explicitly retire unused branding storage after deploying the matching app."""
import argparse

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema
from backend.migrations.phase2 import RETIRED_SETTINGS_COLUMNS, check_phase2
from backend.models import SystemSettings

VERSION = "018_retired_branding_settings"


def check_settings_cleanup(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    columns = {item["name"] for item in inspect(connection).get_columns("system_settings", schema=schema)}
    expected = set(SystemSettings.__table__.columns.keys())
    if "school_name" in columns and "system_name" not in columns:
        expected.remove("system_name")
        expected.add("school_name")
    if columns != expected:
        raise MigrationError("Retired settings columns remain or settings schema is incompatible; run backend.migrations.settings_cleanup --apply after deploying the matching app")
    check_phase2(connection, schema)


def apply_settings_cleanup(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text("SET LOCAL lock_timeout = '5s'"))
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    connection.execute(text("LOCK TABLE system_settings IN ACCESS EXCLUSIVE MODE"))
    if connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:version)"),
                          {"version": VERSION}).scalar_one():
        check_settings_cleanup(connection, schema)
        return False
    check_phase2(connection, schema)
    projection = "SELECT to_jsonb(s) - 'secondary_color' - 'profile_pic_url' - 'login_background' FROM system_settings s ORDER BY id"
    before = list(connection.execute(text(projection)))
    for name in RETIRED_SETTINGS_COLUMNS:
        # No CASCADE: dependent objects must stop the upgrade for explicit review.
        connection.execute(text(f"ALTER TABLE system_settings DROP COLUMN IF EXISTS {name}"))
    check_settings_cleanup(connection, schema)
    if before != list(connection.execute(text(projection))):
        raise MigrationError("Settings data preservation failed")
    connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version)"), {"version": VERSION})
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_settings_cleanup if args.apply else check_settings_cleanup)(connection)
        print("Retired branding settings schema verified.")
        return 0
    except MigrationError as error:
        print(f"Settings cleanup stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Settings cleanup stopped ({type(error).__name__}). No changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
