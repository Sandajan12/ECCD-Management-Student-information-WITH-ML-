"""Explicit, transactional widening of cached section labels for Batch 1.

Run with --apply on an existing Phase 2 database, or --check to inspect it.
Startup never applies this migration automatically.
"""
import argparse

from sqlalchemy import String, inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema
from backend.migrations.phase2 import check_phase2, digest_table

VERSION = "003_batch1_section_labels"
COLUMNS = (("teachers", "class_name"), ("students", "section_name"))


def check_batch1(connection: Connection, schema: str = "public") -> None:
    check_phase2(connection, schema)
    for table, name in COLUMNS:
        column = next(item for item in inspect(connection).get_columns(table, schema=schema) if item["name"] == name)
        data_type = column["type"]
        if not isinstance(data_type, String) or (data_type.length is not None and data_type.length < 100):
            raise MigrationError(f"Batch 1 section-label capacity mismatch: {table}.{name}")


def apply_batch1(connection: Connection, schema: str = "public") -> bool:
    check_phase2(connection, schema)
    select_schema(connection, schema)
    if connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:version)"), {"version": VERSION}).scalar_one():
        check_batch1(connection, schema)
        return False
    connection.execute(text("LOCK TABLE teachers, students IN ACCESS EXCLUSIVE MODE"))
    before = {table: digest_table(connection, table) for table, _ in COLUMNS}
    for table, name in COLUMNS:
        column = next(item for item in inspect(connection).get_columns(table, schema=schema) if item["name"] == name)
        if not isinstance(column["type"], String):
            raise MigrationError(f"Unexpected section-label column type: {table}.{name}")
        if column["type"].length is not None and column["type"].length < 100:
            # Identifiers come only from the fixed COLUMNS tuple.
            connection.execute(text(f"ALTER TABLE {table} ALTER COLUMN {name} TYPE VARCHAR(100)"))
    check_batch1(connection, schema)
    for table, digest in before.items():
        if digest_table(connection, table) != digest:
            raise MigrationError(f"Batch 1 data preservation check failed: {table}")
    connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version)"), {"version": VERSION})
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true")
    group.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    try:
        with engine.begin() as connection:
            if arguments.apply:
                changed = apply_batch1(connection)
                print("Batch 1 migration applied." if changed else "Batch 1 already applied; capacity verified.")
            else:
                check_batch1(connection)
                print("Batch 1 section-label capacity verified.")
        return 0
    except MigrationError as error:
        print(f"Migration stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Migration stopped ({type(error).__name__}). No changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
