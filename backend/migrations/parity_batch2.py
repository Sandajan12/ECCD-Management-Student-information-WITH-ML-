"""Explicit transactional performance indexes and shared rate-counter storage."""
import argparse

from sqlalchemy import BigInteger, CheckConstraint, Column, Index, MetaData, String, Table, inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema
from backend.migrations.parity_batch1 import check_batch1
from backend.migrations.phase2 import digest_table
from backend.models import Message, SystemLog

VERSION = "004_batch2_deployment_hardening"
# Operational state is intentionally outside Base/BackupDocument and restore.
counter_metadata = MetaData()
counter_table = Table("api_rate_limits", counter_metadata,
    Column("bucket_key", String(100), primary_key=True),
    Column("total_hits", BigInteger, nullable=False),
    Column("reset_at", BigInteger, nullable=False),
    CheckConstraint("total_hits >= 0", name="ck_rate_hits_nonnegative"))
Index("idx_rate_limits_reset", counter_table.c.reset_at)
INDEXES = ((Message.__table__, "idx_messages_thread", ["parent_id", "teacher_id", "is_archived", "created_at"]),
           (SystemLog.__table__, "idx_logs_timestamp", ["timestamp"]))


def check_batch2(connection: Connection, schema: str = "public") -> None:
    check_batch1(connection, schema)
    inspector = inspect(connection)
    for table, name, columns in INDEXES:
        index = next((item for item in inspector.get_indexes(table.name, schema=schema) if item["name"] == name), None)
        if index is None or index["column_names"] != columns or index["unique"] or index.get("dialect_options", {}).get("postgresql_where"):
            raise MigrationError(f"Batch 2 index mismatch: {name}")
    if not inspector.has_table("api_rate_limits", schema=schema):
        raise MigrationError("Batch 2 rate-limit storage is missing")
    columns = {item["name"]: item for item in inspector.get_columns("api_rate_limits", schema=schema)}
    if set(columns) != {"bucket_key", "total_hits", "reset_at"} or any(item["nullable"] for item in columns.values()):
        raise MigrationError("Batch 2 rate-limit storage shape mismatch")
    if not isinstance(columns["bucket_key"]["type"], String) or columns["bucket_key"]["type"].length != 100 or any(not isinstance(columns[name]["type"], BigInteger) for name in ("total_hits", "reset_at")):
        raise MigrationError("Batch 2 rate-limit column type mismatch")
    if inspector.get_pk_constraint("api_rate_limits", schema=schema)["constrained_columns"] != ["bucket_key"]:
        raise MigrationError("Batch 2 rate-limit primary key mismatch")
    if not any(item["name"] == "ck_rate_hits_nonnegative" for item in inspector.get_check_constraints("api_rate_limits", schema=schema)):
        raise MigrationError("Batch 2 rate-limit constraint missing")
    if not any(index["name"] == "idx_rate_limits_reset" and index["column_names"] == ["reset_at"] for index in inspector.get_indexes("api_rate_limits", schema=schema)):
        raise MigrationError("Batch 2 rate-limit cleanup index missing")


def apply_batch2(connection: Connection, schema: str = "public") -> bool:
    check_batch1(connection, schema)
    select_schema(connection, schema)
    # Serialize repeated/concurrent applies including counter-table creation.
    connection.execute(text("LOCK TABLE ames_schema_migrations IN EXCLUSIVE MODE"))
    if connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:version)"), {"version": VERSION}).scalar_one():
        check_batch2(connection, schema)
        return False
    connection.execute(text("LOCK TABLE messages, system_logs IN SHARE MODE"))
    before = {table.name: digest_table(connection, table.name) for table, _, _ in INDEXES}
    for table, name, _ in INDEXES:
        index = next(item for item in table.indexes if item.name == name)
        index.create(connection, checkfirst=True)
    counter_table.create(connection, checkfirst=True)
    check_batch2(connection, schema)
    for table, digest in before.items():
        if digest_table(connection, table) != digest:
            raise MigrationError(f"Batch 2 data preservation failed: {table}")
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
                changed = apply_batch2(connection)
                print("Batch 2 migration applied." if changed else "Batch 2 already applied; indexes and storage verified.")
            else:
                check_batch2(connection)
                print("Batch 2 indexes and rate-limit storage verified.")
        return 0
    except MigrationError as error:
        print(f"Migration stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Migration stopped ({type(error).__name__}). No changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
