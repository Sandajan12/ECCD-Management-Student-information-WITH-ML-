"""Add approval state without changing existing family/account access.

Run before starting the updated API:
uv run --no-project --python .venv312 python -m backend.migrations.parent_linking --apply
"""
import argparse

from sqlalchemy import DateTime, String, inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.schema import AddConstraint

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema
from backend.models import FamilyAccess

VERSION = "005_parent_link_approval"


def check_parent_linking(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    inspector = inspect(connection)
    columns = {column["name"]: column for column in inspector.get_columns("family_access", schema=schema)}
    if not {"status", "requested_at"} <= columns.keys():
        raise MigrationError("Parent link approval migration is missing; run parent_linking --apply")
    if (columns["status"]["nullable"] or columns["requested_at"]["nullable"]
        or not isinstance(columns["status"]["type"], String) or columns["status"]["type"].length != 10
        or not isinstance(columns["requested_at"]["type"], DateTime) or not columns["requested_at"]["type"].timezone):
        raise MigrationError("Parent link approval columns have incompatible types/nullability")
    if not any(item["name"] == "ck_family_link_status" for item in inspector.get_check_constraints("family_access", schema=schema)):
        raise MigrationError("Parent link status constraint is missing")


def apply_parent_linking(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text("LOCK TABLE ames_schema_migrations IN EXCLUSIVE MODE"))
    connection.execute(text("LOCK TABLE family_access IN ACCESS EXCLUSIVE MODE"))
    before = list(connection.execute(text("SELECT id, parent_id, student_id, relationship_type, date_linked FROM family_access ORDER BY id")))
    columns = {column["name"] for column in inspect(connection).get_columns("family_access", schema=schema)}
    if "status" not in columns:
        connection.execute(text("ALTER TABLE family_access ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'SYNCED'"))
    if "requested_at" not in columns:
        connection.execute(text("ALTER TABLE family_access ADD COLUMN requested_at TIMESTAMPTZ"))
        connection.execute(text("UPDATE family_access SET requested_at = date_linked"))
        connection.execute(text("ALTER TABLE family_access ALTER COLUMN requested_at SET DEFAULT now(), ALTER COLUMN requested_at SET NOT NULL"))
    if not any(item["name"] == "ck_family_link_status" for item in inspect(connection).get_check_constraints("family_access", schema=schema)):
        constraint = next(item for item in FamilyAccess.__table__.constraints if item.name == "ck_family_link_status")
        connection.execute(AddConstraint(constraint, isolate_from_table=False))
    check_parent_linking(connection, schema)
    after = list(connection.execute(text("SELECT id, parent_id, student_id, relationship_type, date_linked FROM family_access ORDER BY id")))
    if before != after:
        raise MigrationError("Family access data preservation failed")
    changed = connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version) ON CONFLICT DO NOTHING"), {"version": VERSION}).rowcount
    return bool(changed)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_parent_linking if args.apply else check_parent_linking)(connection)
        print("Parent link approval schema verified.")
        return 0
    except MigrationError as error:
        print(f"Parent link migration stopped: {error}. No changes committed.")
        return 1
    except Exception as error:
        print(f"Parent link migration stopped ({type(error).__name__}); no changes committed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
