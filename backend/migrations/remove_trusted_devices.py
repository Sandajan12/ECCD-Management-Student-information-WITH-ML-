"""020: explicitly drop retired OTP-bypass storage after deploying the matching app."""
import argparse

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema

VERSION = "020_remove_trusted_devices"
TABLE = "user_trusted_devices"


def dependencies(connection: Connection, schema: str) -> list[str]:
    # External views and foreign keys must be reviewed, never removed by CASCADE.
    return list(connection.execute(text("""
        SELECT DISTINCT pg_describe_object(d.classid, d.objid, d.objsubid)
        FROM pg_depend d
        JOIN pg_class t ON t.oid=d.refobjid
        JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname=:schema AND t.relname=:table
          AND d.refclassid='pg_class'::regclass AND d.deptype='n'
          AND NOT (d.classid='pg_constraint'::regclass AND EXISTS
              (SELECT 1 FROM pg_constraint c WHERE c.oid=d.objid AND c.conrelid=t.oid))
          AND NOT (d.classid='pg_policy'::regclass AND EXISTS
              (SELECT 1 FROM pg_policy p WHERE p.oid=d.objid AND p.polrelid=t.oid))
    """), {"schema": schema, "table": TABLE}).scalars())


def check_remove_trusted_devices(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    if inspect(connection).has_table(TABLE, schema=schema):
        external = dependencies(connection, schema)
        if external:
            raise MigrationError("Unexpected device-table dependencies: " + "; ".join(external))
        raise MigrationError("Device cleanup pending; deploy the matching app, back up and stop writers before --apply")
    if not connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:version)"),
                              {"version": VERSION}).scalar_one():
        raise MigrationError("Device table is absent but cleanup is not recorded; run --apply to record it")


def apply_remove_trusted_devices(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text("SET LOCAL lock_timeout='5s'"))
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    recorded = connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:version)"),
                                  {"version": VERSION}).scalar_one()
    if recorded:
        check_remove_trusted_devices(connection, schema)
        return False
    if inspect(connection).has_table(TABLE, schema=schema):
        connection.execute(text(f"LOCK TABLE {TABLE} IN ACCESS EXCLUSIVE MODE"))
        external = dependencies(connection, schema)
        if external:
            raise MigrationError("Unexpected device-table dependencies: " + "; ".join(external))
        connection.execute(text(f"DROP TABLE {TABLE} RESTRICT"))
    connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version)"), {"version": VERSION})
    check_remove_trusted_devices(connection, schema)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--apply", action="store_true")
    parser.add_argument("--schema", default="public")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_remove_trusted_devices if args.apply else check_remove_trusted_devices)(connection, args.schema)
        print("Retired device storage removed; migration verified.")
        return 0
    except MigrationError as error:
        print(f"Device cleanup stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Device cleanup stopped ({type(error).__name__}). No changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
