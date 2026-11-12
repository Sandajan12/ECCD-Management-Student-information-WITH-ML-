"""019: add private browser refresh families; apply explicitly before deploying."""
import argparse
from sqlalchemy import inspect, text
from backend.config.database import engine
from backend.models import RefreshSession
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema

VERSION = "019_refresh_cookie_sessions"


def check_refresh_cookie_sessions(connection, schema="public"):
    select_schema(connection, schema)
    inspector = inspect(connection)
    if not inspector.has_table(RefreshSession.__tablename__, schema=schema):
        raise MigrationError("Run python -m backend.migrations.refresh_cookie_sessions --apply before deploying cookie authentication")
    table = RefreshSession.__table__
    actual = {column["name"]: column for column in inspector.get_columns(table.name, schema=schema)}
    if set(actual) != set(table.columns.keys()):
        raise MigrationError("Refresh cookie session schema is incompatible")
    for expected in table.columns:
        column = actual[expected.name]
        if (column["nullable"] != expected.nullable or
                column["type"].compile(dialect=connection.dialect) != expected.type.compile(dialect=connection.dialect)):
            raise MigrationError("Refresh cookie session column is incompatible")
    if inspector.get_pk_constraint(table.name, schema=schema)["constrained_columns"] != ["id"]:
        raise MigrationError("Refresh cookie session primary key is incompatible")
    foreign = inspector.get_foreign_keys(table.name, schema=schema)
    if not any(item["constrained_columns"] == ["user_id"] and item["referred_table"] == "users"
               and item["referred_columns"] == ["user_id"] and item["options"].get("ondelete") == "CASCADE" for item in foreign):
        raise MigrationError("Refresh cookie session account reference is incompatible")
    index = next((item for item in inspector.get_indexes(table.name, schema=schema)
                  if item["name"] == "idx_refresh_user_expiry"), None)
    if index is None or index["column_names"] != ["user_id", "expires_at"]:
        raise MigrationError("Refresh cookie session expiry index is missing")
    if not connection.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid='auth_refresh_sessions'::regclass")).scalar_one():
        raise MigrationError("Refresh cookie session RLS must be enabled")
    exposed = connection.execute(text("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') "
        "AND has_table_privilege(oid, 'auth_refresh_sessions', 'SELECT,INSERT,UPDATE,DELETE'))")).scalar_one()
    if exposed:
        raise MigrationError("Refresh cookie session storage must not be exposed to public API roles")


def apply_refresh_cookie_sessions(connection, schema="public"):
    select_schema(connection, schema)
    connection.execute(text("SET LOCAL lock_timeout='5s'"))
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    RefreshSession.__table__.create(connection, checkfirst=True)
    connection.execute(text("ALTER TABLE auth_refresh_sessions ENABLE ROW LEVEL SECURITY"))
    connection.execute(text("REVOKE ALL ON auth_refresh_sessions FROM PUBLIC"))
    # Local PostgreSQL may not have Supabase API roles.
    for role in ("anon", "authenticated"):
        if connection.execute(text("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=:role)"), {"role": role}).scalar_one():
            connection.execute(text(f"REVOKE ALL ON auth_refresh_sessions FROM {role}"))
    check_refresh_cookie_sessions(connection, schema)
    return bool(connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version) ON CONFLICT DO NOTHING"),
                                   {"version": VERSION}).rowcount)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--apply", action="store_true")
    action.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with engine.begin() as connection:
        (apply_refresh_cookie_sessions if args.apply else check_refresh_cookie_sessions)(connection)
    print("Refresh cookie session schema verified.")


if __name__ == "__main__":
    main()
