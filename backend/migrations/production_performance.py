"""014: additive production query indexes; run explicitly with writers stopped."""
import argparse

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema
from backend.migrations.email_only_identity import check_email_only_identity
from backend.models import Base

VERSION = "014_production_performance"
# Deliberately explicit: future ORM indexes belong to their own migrations.
INDEX_NAMES = (
    "idx_users_role_active", "idx_students_school_year", "idx_students_active_roster",
    "idx_questions_domain_sequence", "idx_evaluations_teacher", "idx_evaluations_parent",
    "idx_evaluations_question", "idx_family_parent_status_student", "idx_assignments_teacher_status",
    "idx_sections_adviser", "idx_messages_teacher_recent", "idx_messages_teacher_unread",
    "idx_logs_user", "idx_logs_action_id", "idx_device_token", "idx_device_user_expiry",
    "idx_otp_user_purpose", "idx_otp_expiry",
)
INDEXES = tuple(next(index for table in Base.metadata.tables.values()
                     for index in table.indexes if index.name == name) for name in INDEX_NAMES)


def check_production_performance(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    inspector = inspect(connection)
    by_table = {}
    for expected in INDEXES:
        table = expected.table.name
        if table not in by_table:
            by_table[table] = {index["name"]: index for index in inspector.get_indexes(table, schema=schema)}
        actual = by_table[table].get(expected.name)
        if (actual is None or actual["column_names"] != [column.name for column in expected.columns]
                or actual["unique"] or actual.get("dialect_options", {}).get("postgresql_where")):
            raise MigrationError(f"Production index mismatch: {expected.name}")
    valid = set(connection.execute(text(
        "SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid "
        "JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_am a ON a.oid=c.relam "
        "WHERE n.nspname=:schema AND i.indisvalid AND i.indisready AND a.amname='btree'"
    ), {"schema": schema}).scalars())
    if set(INDEX_NAMES) - valid:
        raise MigrationError("Production indexes must be valid, ready B-tree indexes")


def apply_production_performance(connection: Connection, schema: str = "public") -> bool:
    check_email_only_identity(connection, schema)
    # Transactional CREATE INDEX intentionally requires a maintenance window.
    # Fail instead of indefinitely waiting behind application writers.
    connection.execute(text("SET LOCAL lock_timeout = '5s'"))
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    if connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:version)"),
                          {"version": VERSION}).scalar_one():
        check_production_performance(connection, schema)
        return False
    for index in INDEXES:
        index.create(connection, checkfirst=True)
    check_production_performance(connection, schema)
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
            (apply_production_performance if args.apply else check_production_performance)(connection)
        print("Production performance indexes verified.")
        return 0
    except MigrationError as error:
        print(f"Performance migration stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Performance migration stopped ({type(error).__name__}). No changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
