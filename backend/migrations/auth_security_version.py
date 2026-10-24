"""Add a persistent credential epoch so archived sessions cannot revive."""
import argparse

from sqlalchemy import Integer, inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema

VERSION = "012_auth_security_version"
COLUMN = "security_version"


def check_auth_security_version(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    column = next((item for item in inspect(connection).get_columns("users", schema=schema) if item["name"] == COLUMN), None)
    if column is None or not isinstance(column["type"], Integer) or column["nullable"] or column["default"] not in ("0", "'0'::integer"):
        raise MigrationError("Credential version missing/incompatible; run python -m backend.migrations.auth_security_version --apply")


def apply_auth_security_version(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    connection.execute(text("LOCK TABLE users IN ACCESS EXCLUSIVE MODE"))
    before = list(connection.execute(text(f"SELECT to_jsonb(u) - '{COLUMN}' FROM users u ORDER BY user_id")))
    if COLUMN not in {item["name"] for item in inspect(connection).get_columns("users", schema=schema)}:
        connection.execute(text(f"ALTER TABLE users ADD COLUMN {COLUMN} INTEGER NOT NULL DEFAULT 0"))
    check_auth_security_version(connection, schema)
    after = list(connection.execute(text(f"SELECT to_jsonb(u) - '{COLUMN}' FROM users u ORDER BY user_id")))
    if before != after:
        raise MigrationError("Account data preservation failed")
    return bool(connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version) ON CONFLICT DO NOTHING"), {"version": VERSION}).rowcount)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_auth_security_version if args.apply else check_auth_security_version)(connection)
        print("Credential version schema verified.")
        return 0
    except MigrationError as error:
        print(f"Credential version migration stopped: {error}. No changes committed.")
        return 1
    except Exception as error:
        print(f"Credential version migration stopped ({type(error).__name__}); no changes committed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
