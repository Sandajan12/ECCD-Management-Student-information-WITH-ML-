"""017: enforce domain question ordering without renumbering existing records."""
import argparse

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, select_schema
from backend.migrations.phase2 import digest_table

VERSION = "017_eccd_question_sequence"
INDEX = "idx_questions_domain_sequence"


def check_duplicates(connection: Connection) -> None:
    duplicates = connection.execute(text(
        "SELECT domain_id, sequence_order, array_agg(question_id ORDER BY question_id) AS ids "
        "FROM eccd_questions GROUP BY domain_id, sequence_order HAVING COUNT(*) > 1 "
        "ORDER BY domain_id, sequence_order"
    )).mappings().all()
    if duplicates:
        groups = "; ".join(f"domain_id={row['domain_id']}, sequence_order={row['sequence_order']}, question_ids={row['ids']}"
                           for row in duplicates)
        raise MigrationError(f"Duplicate question sequences: {groups}. Correct these manually before applying 017; no records were changed")


def check_eccd_question_sequence(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    check_duplicates(connection)
    index = next((item for item in inspect(connection).get_indexes("eccd_questions", schema=schema)
                  if item["name"] == INDEX), None)
    valid = connection.execute(text(
        "SELECT i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL "
        "AND i.indexprs IS NULL AND a.amname='btree' "
        "FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid "
        "JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_am a ON a.oid=c.relam "
        "WHERE n.nspname=:schema AND c.relname=:index"
    ), {"schema": schema, "index": INDEX}).scalar_one_or_none()
    if index is None or index["column_names"] != ["domain_id", "sequence_order"] or not valid:
        raise MigrationError("Question sequence uniqueness missing; run python -m backend.migrations.eccd_question_sequence --apply")


def apply_eccd_question_sequence(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text("SET LOCAL lock_timeout = '5s'"))
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    connection.execute(text("LOCK TABLE eccd_questions IN ACCESS EXCLUSIVE MODE"))
    check_duplicates(connection)
    before = digest_table(connection, "eccd_questions")
    index = next((item for item in inspect(connection).get_indexes("eccd_questions", schema=schema)
                  if item["name"] == INDEX), None)
    if index is None or not index["unique"]:
        connection.execute(text(f"DROP INDEX IF EXISTS {INDEX}"))
        connection.execute(text(f"CREATE UNIQUE INDEX {INDEX} ON eccd_questions (domain_id, sequence_order)"))
    check_eccd_question_sequence(connection, schema)
    if before != digest_table(connection, "eccd_questions"):
        raise MigrationError("Question data preservation failed")
    return bool(connection.execute(text(f"INSERT INTO {LEDGER} (version) VALUES (:version) ON CONFLICT DO NOTHING"),
                                   {"version": VERSION}).rowcount)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--apply", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        with engine.begin() as connection:
            (apply_eccd_question_sequence if args.apply else check_eccd_question_sequence)(connection)
        print("Question sequence uniqueness verified.")
        return 0
    except MigrationError as error:
        print(f"Question sequence migration stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Question sequence migration stopped ({type(error).__name__}); no changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
