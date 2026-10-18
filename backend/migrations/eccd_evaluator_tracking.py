"""Add evaluator provenance without guessing historical parent authorship.

uv run --no-project --python .venv312 python -m backend.migrations.eccd_evaluator_tracking --apply
uv run --no-project --python .venv312 python -m backend.migrations.eccd_evaluator_tracking --check

DDL, the conservative backfill, preservation checks and ledger entry commit
together. Coordinate application model changes before deploying this schema:
the existing Phase 2 startup check rejects columns absent from ORM metadata.
"""

import argparse
import hashlib
import re

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from backend.config.database import engine
from backend.migrations.phase1 import LEDGER, MigrationError, quote, select_schema, serialize_row

VERSION = "007_eccd_evaluator_tracking"
TABLE = "student_eccd_evaluations"
PARENT_FK = "fk_eccd_evaluator_parent"
ROLE_CHECK = "ck_eccd_evaluator_role"
COLUMNS = {
    "parent_id": ("INTEGER", True, "INTEGER NULL"),
    "evaluator_role": ("VARCHAR(7)", False, "VARCHAR(7) NOT NULL DEFAULT 'teacher'"),
    "teacher_evaluation_date": ("DATE", True, "DATE NULL"),
    "parent_submitted_at": ("TIMESTAMP WITH TIME ZONE", True, "TIMESTAMPTZ NULL"),
}
BACKFILL = """
UPDATE student_eccd_evaluations AS e
SET teacher_evaluation_date = e.evaluation_date
FROM eccd_questions AS q
WHERE q.question_id = e.question_id
  AND COALESCE(q.is_home_based, FALSE) = FALSE
  AND e.evaluator_role = 'teacher'
  AND e.parent_submitted_at IS NULL
  AND e.teacher_evaluation_date IS NULL;
"""


def _sql_shape(expression: str) -> str:
    """Normalize PostgreSQL reflection formatting, preserving string literals."""
    parts = re.split(r"('(?:[^']|'')*')", expression)
    for index in range(0, len(parts), 2):
        value = re.sub(r"::(?:text|character varying)(?:\(\d+\))?(?:\[\])?", "", parts[index])
        parts[index] = re.sub(r'[\s()"]', "", value).lower()
    return "".join(parts)


def _check_columns(connection: Connection, schema: str, *, allow_missing: bool = False) -> None:
    columns = {column["name"]: column for column in inspect(connection).get_columns(TABLE, schema=schema)}
    for name, (expected_type, nullable, _) in COLUMNS.items():
        column = columns.get(name)
        if column is None:
            if allow_missing:
                continue
            raise MigrationError(f"Evaluator provenance column missing: {name}; run eccd_evaluator_tracking --apply")
        actual_type = column["type"].compile(dialect=connection.dialect)
        default = _sql_shape(column.get("default") or "NULL")
        expected_default = "'teacher'" if name == "evaluator_role" else "null"
        if actual_type != expected_type or column["nullable"] != nullable or default != expected_default:
            raise MigrationError(f"Evaluator provenance column incompatible: {name}")


def check_eccd_evaluator_tracking(connection: Connection, schema: str = "public") -> None:
    select_schema(connection, schema)
    _check_columns(connection, schema)
    inspector = inspect(connection)
    foreign_key = next((item for item in inspector.get_foreign_keys(TABLE, schema=schema)
                        if item["name"] == PARENT_FK), None)
    if (foreign_key is None
            or foreign_key["constrained_columns"] != ["parent_id"]
            or foreign_key["referred_table"] != "parents"
            or foreign_key["referred_columns"] != ["parent_id"]
            or foreign_key.get("referred_schema") not in (None, schema)
            or foreign_key.get("options", {}).get("ondelete") != "SET NULL"
            or foreign_key.get("options", {}).get("onupdate", "NO ACTION") != "NO ACTION"
            or foreign_key.get("options", {}).get("deferrable", False)):
        raise MigrationError("Evaluator parent foreign key missing/incompatible")
    constraints = {
        row["conname"]: row for row in connection.execute(text("""
            SELECT conname, contype, convalidated, pg_get_expr(conbin, conrelid) AS expression
            FROM pg_constraint
            WHERE conrelid = to_regclass(:table) AND conname IN (:foreign_key, :role_check)
        """), {"table": f"{schema}.{TABLE}", "foreign_key": PARENT_FK, "role_check": ROLE_CHECK}).mappings()
    }
    parent = constraints.get(PARENT_FK)
    role = constraints.get(ROLE_CHECK)
    valid_checks = {
        "evaluator_role=anyarray['teacher','parent']",
        "evaluator_role=anyarray['parent','teacher']",
        "evaluator_rolein'teacher','parent'",
        "evaluator_rolein'parent','teacher'",
    }
    if parent is None or parent["contype"] != "f" or not parent["convalidated"]:
        raise MigrationError("Evaluator parent foreign key is not validated")
    if (role is None or role["contype"] != "c" or not role["convalidated"]
            or _sql_shape(role["expression"] or "") not in valid_checks):
        raise MigrationError("Evaluator role check missing/incompatible or not validated")


def _fingerprint(connection: Connection, columns: list[str]) -> tuple[int, str]:
    projection = ", ".join(quote(connection, name) for name in columns)
    digest = hashlib.sha256()
    count = 0
    for row in connection.execute(text(f"SELECT {projection} FROM {TABLE} ORDER BY evaluation_id")):
        digest.update(serialize_row(row))
        digest.update(b"\n")
        count += 1
    return count, digest.hexdigest()


def apply_eccd_evaluator_tracking(connection: Connection, schema: str = "public") -> bool:
    select_schema(connection, schema)
    connection.execute(text(f"LOCK TABLE {LEDGER} IN EXCLUSIVE MODE"))
    if connection.execute(text(f"SELECT EXISTS (SELECT 1 FROM {LEDGER} WHERE version=:version)"),
                          {"version": VERSION}).scalar_one():
        # Never backfill later application writes when repeating an applied migration.
        check_eccd_evaluator_tracking(connection, schema)
        return False
    connection.execute(text(f"LOCK TABLE {TABLE} IN ACCESS EXCLUSIVE MODE"))
    connection.execute(text("LOCK TABLE eccd_questions, parents IN SHARE MODE"))
    _check_columns(connection, schema, allow_missing=True)
    inspector = inspect(connection)
    existing = {column["name"] for column in inspector.get_columns(TABLE, schema=schema)}
    # Preserve every pre-existing value except the one explicitly backfilled.
    preserved = sorted(existing - {"teacher_evaluation_date"})
    before = _fingerprint(connection, preserved)
    for name, (_, _, definition) in COLUMNS.items():
        if name not in existing:
            connection.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN {name} {definition}"))
    constraint_names = set(connection.execute(text("""
        SELECT conname FROM pg_constraint WHERE conrelid = to_regclass(:table)
    """), {"table": f"{schema}.{TABLE}"}).scalars())
    if PARENT_FK not in constraint_names:
        connection.execute(text(f"""
            ALTER TABLE {TABLE} ADD CONSTRAINT {PARENT_FK}
            FOREIGN KEY (parent_id) REFERENCES parents(parent_id) ON DELETE SET NULL NOT VALID
        """))
    if ROLE_CHECK not in constraint_names:
        connection.execute(text(f"""
            ALTER TABLE {TABLE} ADD CONSTRAINT {ROLE_CHECK}
            CHECK (evaluator_role IN ('teacher', 'parent')) NOT VALID
        """))
    for name in (PARENT_FK, ROLE_CHECK):
        connection.execute(text(f"ALTER TABLE {TABLE} VALIDATE CONSTRAINT {name}"))
    check_eccd_evaluator_tracking(connection, schema)
    connection.execute(text(BACKFILL))
    if _fingerprint(connection, preserved) != before:
        raise MigrationError("Evaluation data preservation failed")
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
            if args.apply:
                changed = apply_eccd_evaluator_tracking(connection)
                message = "Evaluator tracking migration applied." if changed else "Evaluator tracking already applied; schema verified."
            else:
                check_eccd_evaluator_tracking(connection)
                message = "Evaluator tracking schema verified."
        print(message)
        return 0
    except MigrationError as error:
        print(f"Evaluator tracking migration stopped: {error}. No changes committed.")
    except Exception as error:
        print(f"Evaluator tracking migration stopped ({type(error).__name__}); no changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
