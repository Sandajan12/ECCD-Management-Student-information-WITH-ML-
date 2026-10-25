"""013: preserve accounts while replacing username identity with normalized email."""
import argparse
import re

from sqlalchemy import String, inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.dialects.postgresql import insert

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema
from backend.models import SystemSettings

VERSION = "013_email_only_identity"
INDEX = "ux_users_email_lower"


def check_email_only_identity(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    inspector = inspect(connection)
    users = {item["name"] for item in inspector.get_columns("users", schema=schema)}
    column = next((item for item in inspector.get_columns("system_settings", schema=schema)
                   if item["name"] == "chairman_name"), None)
    index = next((item for item in inspector.get_indexes("users", schema=schema)
                  if item["name"] == INDEX), None)
    expression = re.sub(r'[\s()"]', '', ''.join(index.get("expressions", []))) if index else ""
    if ("username" in users or column is None or not isinstance(column["type"], String)
            or column["type"].length != 255 or not column["nullable"]
            or index is None or not index["unique"]
            or expression not in ("loweremail::text", "loweremail")
            or index.get("dialect_options", {}).get("postgresql_where")):
        raise MigrationError("Email identity schema incompatible; run python -m backend.migrations.email_only_identity --apply")
    if connection.execute(text("SELECT EXISTS (SELECT 1 FROM users WHERE email IS DISTINCT FROM lower(btrim(email)))")).scalar_one():
        raise MigrationError("Account emails are not normalized")


def apply_email_only_identity(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    connection.execute(text("LOCK TABLE users, system_settings IN ACCESS EXCLUSIVE MODE"))
    if connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:version)"), {"version": VERSION}).scalar_one():
        check_email_only_identity(connection, schema)
        return False
    if connection.execute(text("SELECT EXISTS (SELECT 1 FROM users WHERE email IS NOT NULL GROUP BY lower(btrim(email)) HAVING count(*) > 1)")).scalar_one():
        raise MigrationError("Normalized duplicate emails exist; resolve account emails explicitly before retrying")
    before = list(connection.execute(text("SELECT to_jsonb(u) - 'username' - 'email', lower(btrim(email)) FROM users u ORDER BY user_id")))
    columns = {item["name"] for item in inspect(connection).get_columns("system_settings", schema=schema)}
    if "chairman_name" not in columns:
        connection.execute(text("ALTER TABLE system_settings ADD COLUMN chairman_name VARCHAR(255) NULL"))
    if "username" in {item["name"] for item in inspect(connection).get_columns("users", schema=schema)}:
        # Settings is a singleton. With historical multiple Chairmen, retain the
        # oldest account's name deterministically; no account is removed/merged.
        if connection.execute(text("SELECT EXISTS (SELECT 1 FROM users WHERE role='super-admin')")).scalar_one():
            connection.execute(insert(SystemSettings.__table__).values(id=1).on_conflict_do_nothing(index_elements=["id"]))
        connection.execute(text("UPDATE system_settings SET chairman_name = (SELECT username FROM users WHERE role='super-admin' ORDER BY user_id LIMIT 1) WHERE id=1 AND chairman_name IS NULL"))
    connection.execute(text("UPDATE users SET email=lower(btrim(email)) WHERE email IS DISTINCT FROM lower(btrim(email))"))
    connection.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS {INDEX} ON users (lower(email))"))
    connection.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS username"))
    check_email_only_identity(connection, schema)
    after = list(connection.execute(text("SELECT to_jsonb(u) - 'email', email FROM users u ORDER BY user_id")))
    if before != after:
        raise MigrationError("Account data preservation failed")
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
            (apply_email_only_identity if args.apply else check_email_only_identity)(connection)
        print("Email identity schema verified.")
        return 0
    except MigrationError as error:
        print(f"Email identity migration stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Email identity migration stopped ({type(error).__name__}); no changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
