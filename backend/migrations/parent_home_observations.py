"""021: pending parent observations and private photo cleanup ledger (explicit only)."""
import argparse
from sqlalchemy import inspect, text
from backend.config.database import engine
from backend.models import HomeObservationPhoto, ParentHomeObservation
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema

VERSION = "021_parent_home_observations"
TABLES = (HomeObservationPhoto.__table__, ParentHomeObservation.__table__)


def check_parent_home_observations(connection, schema="public"):
    select_schema(connection, schema)
    inspector = inspect(connection)
    for table in TABLES:
        if not inspector.has_table(table.name, schema=schema):
            raise MigrationError("Parent review schema missing; explicitly apply migration 021 before starting the API")
        if set(table.columns.keys()) != {c["name"] for c in inspector.get_columns(table.name, schema=schema)}:
            raise MigrationError("Parent review columns differ: " + table.name)
        if inspector.get_pk_constraint(table.name, schema=schema)["constrained_columns"] != list(table.primary_key.columns.keys()):
            raise MigrationError("Parent review primary key differs: " + table.name)
        fks = {(tuple(c["constrained_columns"]), c["referred_table"], tuple(c["referred_columns"]), c["options"].get("ondelete"))
               for c in inspector.get_foreign_keys(table.name, schema=schema)}
        for constraint in table.foreign_key_constraints:
            elements = list(constraint.elements)
            if (tuple(constraint.column_keys), elements[0].column.table.name, tuple(e.column.name for e in elements), constraint.ondelete) not in fks:
                raise MigrationError("Parent review foreign key differs: " + table.name)
        if not connection.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass(:name)"), {"name": table.name}).scalar_one():
            raise MigrationError("Parent review RLS must be enabled: " + table.name)
        if connection.execute(text("SELECT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass(:name))"), {"name": table.name}).scalar_one():
            raise MigrationError("Parent review tables must have no public API policies: " + table.name)
        from sqlalchemy import UniqueConstraint, CheckConstraint
        unique = {tuple(c["column_names"]) for c in inspector.get_unique_constraints(table.name, schema=schema)}
        checks = {c["name"] for c in inspector.get_check_constraints(table.name, schema=schema)}
        if any(tuple(c.columns.keys()) not in unique for c in table.constraints if isinstance(c, UniqueConstraint)):
            raise MigrationError("Parent review uniqueness differs: " + table.name)
        if any(c.name not in checks for c in table.constraints if isinstance(c, CheckConstraint)):
            raise MigrationError("Parent review check constraints differ: " + table.name)
    if not connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:v)"), {"v": VERSION}).scalar_one():
        raise MigrationError("Migration 021 is not recorded")


def apply_parent_home_observations(connection, schema="public"):
    select_schema(connection, schema)
    connection.execute(text("SET LOCAL lock_timeout='5s'"))
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    recorded = connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:v)"), {"v": VERSION}).scalar_one()
    if recorded:
        check_parent_home_observations(connection, schema)
        return False
    for table in TABLES:
        table.create(connection, checkfirst=True)
        connection.execute(text(f'ALTER TABLE "{table.name}" ENABLE ROW LEVEL SECURITY'))
        connection.execute(text(f'REVOKE ALL ON "{table.name}" FROM PUBLIC'))
        # No public policies: only the backend database role can access these rows.
        for role in ("anon", "authenticated"):
            if connection.execute(text("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:r)"), {"r": role}).scalar_one():
                connection.execute(text(f'REVOKE ALL ON "{table.name}" FROM {role}'))
    connection.execute(text(f"INSERT INTO {LEDGER}(version) VALUES (:v)"), {"v": VERSION})
    check_parent_home_observations(connection, schema)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--schema", default="public")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_parent_home_observations if args.apply else check_parent_home_observations)(connection, args.schema)
        print("Migration 021 verified.")
        return 0
    except MigrationError as error:
        print(f"Migration 021 stopped: {error}. No changes committed.")
        return 1
    except Exception as error:
        print(f"Migration 021 stopped ({type(error).__name__}). No changes committed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
