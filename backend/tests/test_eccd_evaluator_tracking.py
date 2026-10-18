"""Evaluator provenance checks using unittest and disposable PostgreSQL schemas.

The real migration and encrypted backup functions run only in a uniquely named
test schema. No migration is applied to the configured application's schema.
"""

import asyncio
from datetime import date, datetime, timedelta, timezone
import importlib
import json
import re
import secrets
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from cryptography.fernet import Fernet
from pydantic import SecretStr
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.config.database import connect_args, engine
from backend.config.settings import settings
from backend.migrations import eccd_evaluator_tracking as migration
from backend.migrations.phase1 import LEDGER, MigrationError
from backend.models import Base, EccdDomain, EccdQuestion, Parent, Student, StudentEccdEvaluation, Teacher
from backend.schemas.backup import BackupStudentEccdEvaluation
from backend.utils.backups import cipher, export_backup, restore_backup
from backend.utils.lrn import encrypt_lrn, hash_lrn

main = importlib.import_module("backend.main")
TABLE = "student_eccd_evaluations"
DEFAULTS = {
    "parent_id": None,
    "evaluator_role": "teacher",
    "teacher_evaluation_date": None,
    "parent_submitted_at": None,
}
APPLY_COMMAND = "python -m backend.migrations.eccd_evaluator_tracking --apply"
HISTORICAL_DATE = date(2026, 8, 10)


class EvaluatorReadinessTests(unittest.TestCase):
    def test_each_missing_column_is_logged_with_explicit_command(self):
        for missing in DEFAULTS:
            with self.subTest(missing=missing), patch.object(main, "inspect") as inspection, \
                    patch.object(main, "check_eccd_evaluator_tracking") as check:
                inspection.return_value.get_columns.return_value = [
                    {"name": name} for name in DEFAULTS if name != missing
                ]
                with self.assertLogs("uvicorn.error", level="ERROR") as logs, \
                        self.assertRaisesRegex(MigrationError, APPLY_COMMAND):
                    main.check_evaluator_tracking_readiness(MagicMock(), "public")
                self.assertIn(missing, logs.output[0])
                self.assertIn(APPLY_COMMAND, logs.output[0])
                inspection.return_value.get_columns.assert_called_once_with(TABLE, schema="public")
                check.assert_not_called()

    def test_absent_table_reports_all_four_columns(self):
        with patch.object(main, "inspect") as inspection:
            inspection.return_value.has_table.return_value = False
            with self.assertLogs("uvicorn.error", level="ERROR") as logs, self.assertRaises(MigrationError):
                main.check_evaluator_tracking_readiness(MagicMock(), "public")
            for name in DEFAULTS:
                self.assertIn(name, logs.output[0])
            inspection.return_value.get_columns.assert_not_called()

    def test_incompatible_constraint_also_reports_explicit_command(self):
        with patch.object(main, "inspect") as inspection, \
                patch.object(main, "check_eccd_evaluator_tracking", side_effect=MigrationError("Invalid parent FK")):
            inspection.return_value.get_columns.return_value = [{"name": name} for name in DEFAULTS]
            with self.assertLogs("uvicorn.error", level="ERROR") as logs, self.assertRaises(MigrationError):
                main.check_evaluator_tracking_readiness(MagicMock(), "public")
            self.assertIn("Invalid parent FK", logs.output[0])
            self.assertIn(APPLY_COMMAND, logs.output[0])

    def test_missing_schema_stops_lifespan_before_other_checks_or_seeding(self):
        async def start():
            async with main.lifespan(main.api):
                self.fail("Startup must reject missing evaluator columns")

        with patch.object(main, "engine") as startup_engine, patch.object(main, "inspect") as inspection, \
                patch.object(main, "check_phase2") as generic_check, patch.object(main, "SessionLocal") as sessions, \
                patch.object(main, "seed_reference_data") as seed:
            inspection.return_value.has_table.return_value = False
            with self.assertLogs("uvicorn.error", level="ERROR"), self.assertRaises(MigrationError):
                asyncio.run(start())
            statements = startup_engine.connect.return_value.__enter__.return_value.execute.call_args_list
            self.assertEqual([str(call.args[0]) for call in statements], ["SELECT current_schema()"])
            generic_check.assert_not_called()
            sessions.assert_not_called()
            seed.assert_not_called()


class EvaluatorMigrationTests(unittest.TestCase):
    def setUp(self):
        # Secrets are temporary and confined to this fixture, never written to .env.
        for name, value in {
            "BACKUP_ENCRYPTION_KEY": Fernet.generate_key().decode(),
            "LRN_ENCRYPTION_KEY": SecretStr(secrets.token_hex(32)),
            "LRN_HMAC_SECRET": SecretStr(secrets.token_hex(32)),
        }.items():
            setting = patch.object(settings, name, value)
            setting.start()
            self.addCleanup(setting.stop)
        self.schema = "eccd_tracking_test_" + uuid4().hex
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.addCleanup(self.drop_schema)
        self.test_engine = create_engine(
            engine.url, connect_args={**connect_args, "options": f"-csearch_path={self.schema}"}
        )
        self.addCleanup(self.test_engine.dispose)
        with self.test_engine.begin() as connection:
            Base.metadata.create_all(connection)
            connection.execute(text(f"CREATE TABLE {LEDGER} (version VARCHAR(100) PRIMARY KEY)"))
            # Recreate the actual pre-007 column layout without changing ORM metadata.
            for name in DEFAULTS:
                connection.execute(text(f"ALTER TABLE {TABLE} DROP COLUMN {name}"))
            connection.execute(Parent.__table__.insert().values(parent_id=1, fullname="Test Parent"))
            connection.execute(Teacher.__table__.insert().values(teacher_id=1, first_name="Test", last_name="Teacher"))
            lrn = "001234567890"
            connection.execute(Student.__table__.insert().values(
                student_id=1, lrn_encrypted=encrypt_lrn(lrn), lrn_search_hash=hash_lrn(lrn),
                lrn_last4=lrn[-4:], first_name="Test", last_name="Student",
            ))
            connection.execute(EccdDomain.__table__.insert().values(domain_id=1, domain_name="Test Domain"))
            connection.execute(EccdQuestion.__table__.insert(), [
                {"question_id": number, "domain_id": 1, "question_text": f"Question {number}",
                 "sequence_order": number, "is_home_based": home}
                for number, home in ((1, False), (2, True), (3, None))
            ])
            connection.execute(text(f"""
                INSERT INTO {TABLE}
                    (evaluation_id, student_id, teacher_id, question_id, testing_period, answer, evaluation_date)
                VALUES (:id, 1, 1, :id, 'PRE', 'KAYA', :date)
            """), [{"id": number, "date": HISTORICAL_DATE} for number in (1, 2, 3)])

    def drop_schema(self):
        if not re.fullmatch(r"eccd_tracking_test_[a-f0-9]{32}", self.schema):
            raise AssertionError("Unsafe test schema cleanup target")
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))

    def apply(self):
        with self.test_engine.begin() as connection:
            return migration.apply_eccd_evaluator_tracking(connection, self.schema)

    def rows(self):
        with self.test_engine.connect() as connection:
            return [dict(row) for row in connection.execute(text(f"SELECT * FROM {TABLE} ORDER BY evaluation_id")).mappings()]

    def test_schema_types_nullability_defaults_and_named_constraints(self):
        self.assertTrue(self.apply())
        with self.test_engine.connect() as connection:
            migration.check_eccd_evaluator_tracking(connection, self.schema)
            inspector = inspect(connection)
            columns = {column["name"]: column for column in inspector.get_columns(TABLE, schema=self.schema)}
            expected = {
                "parent_id": ("INTEGER", True),
                "evaluator_role": ("VARCHAR(7)", False),
                "teacher_evaluation_date": ("DATE", True),
                "parent_submitted_at": ("TIMESTAMP WITH TIME ZONE", True),
            }
            for name, (type_name, nullable) in expected.items():
                with self.subTest(column=name):
                    self.assertEqual(columns[name]["type"].compile(dialect=connection.dialect), type_name)
                    self.assertEqual(columns[name]["nullable"], nullable)
            self.assertIn("'teacher'", columns["evaluator_role"]["default"])
            fk = next(item for item in inspector.get_foreign_keys(TABLE, schema=self.schema)
                      if item["name"] == "fk_eccd_evaluator_parent")
            self.assertEqual((fk["constrained_columns"], fk["referred_table"], fk["referred_columns"], fk["options"]["ondelete"]),
                             (["parent_id"], "parents", ["parent_id"], "SET NULL"))
            self.assertIn("ck_eccd_evaluator_role", {item["name"] for item in inspector.get_check_constraints(TABLE, schema=self.schema)})
            unique = next(item for item in inspector.get_unique_constraints(TABLE, schema=self.schema)
                          if item["name"] == "unique_student_eval")
            self.assertEqual(unique["column_names"], ["student_id", "question_id", "testing_period"])

    def test_role_check_accepts_teacher_parent_and_rejects_invalid_roles(self):
        self.apply()
        sql = text(f"""INSERT INTO {TABLE}
            (evaluation_id, student_id, question_id, testing_period, answer, evaluation_date, evaluator_role)
            VALUES (:id, 1, :question, 'MID', 'KAYA', :date, :role)""")
        for number, role in enumerate(("teacher", "parent"), 1):
            with self.subTest(role=role), self.test_engine.begin() as connection:
                connection.execute(sql, {"id": 10 + number, "question": number, "date": HISTORICAL_DATE, "role": role})
        for role in ("admin", "", "Teacher", None):
            with self.subTest(role=role), self.assertRaises(IntegrityError) as error:
                with self.test_engine.begin() as connection:
                    connection.execute(sql, {"id": 20, "question": 3, "date": HISTORICAL_DATE, "role": role})
            self.assertEqual(error.exception.orig.pgcode, "23502" if role is None else "23514")
        self.assertEqual(len(self.rows()), 5)

    def test_parent_deletion_sets_null_and_preserves_evaluation(self):
        self.apply()
        submitted = datetime(2026, 8, 11, 9, 30, tzinfo=timezone.utc)
        with self.test_engine.begin() as connection:
            connection.execute(text(f"UPDATE {TABLE} SET parent_id=1, evaluator_role='parent', parent_submitted_at=:submitted WHERE evaluation_id=2"),
                               {"submitted": submitted})
        before = self.rows()
        # Exercise both passive ORM deletion (unloaded collection) and a loaded collection.
        for loaded in (False, True):
            with self.subTest(loaded_collection=loaded):
                with Session(self.test_engine) as db:
                    parent = db.get(Parent, 1)
                    if loaded:
                        self.assertEqual(len(parent.evaluations), 1)
                    db.delete(parent)
                    db.commit()
                expected = [{**row, "parent_id": None} for row in before]
                self.assertEqual(self.rows(), expected)
                if not loaded:
                    with self.test_engine.begin() as connection:
                        connection.execute(Parent.__table__.insert().values(parent_id=1, fullname="Test Parent"))
                        connection.execute(text(f"UPDATE {TABLE} SET parent_id=1 WHERE evaluation_id=2"))
        self.assertTrue(Parent.evaluations.property.passive_deletes)
        self.assertNotIn("delete", Parent.evaluations.property.cascade)
        self.assertNotIn("delete-orphan", Parent.evaluations.property.cascade)

    def test_unknown_parent_is_rejected_by_foreign_key(self):
        self.apply()
        with self.assertRaises(IntegrityError) as error:
            with self.test_engine.begin() as connection:
                connection.execute(text(f"UPDATE {TABLE} SET parent_id=999 WHERE evaluation_id=1"))
        self.assertEqual(error.exception.orig.pgcode, "23503")
        self.assertIsNone(self.rows()[0]["parent_id"])

    def test_backfill_only_non_home_rows_preserves_all_original_values(self):
        before = self.rows()
        self.apply()
        after = self.rows()
        self.assertEqual([{name: row[name] for name in before[0]} for row in after], before)
        for row in after:
            with self.subTest(question=row["question_id"]):
                self.assertEqual(row["teacher_evaluation_date"], None if row["question_id"] == 2 else HISTORICAL_DATE)
                self.assertEqual(row["evaluator_role"], "teacher")
                self.assertIsNone(row["parent_id"])
                self.assertIsNone(row["parent_submitted_at"])

    def test_partial_install_preserves_parent_submissions_and_explicit_teacher_dates(self):
        # Simulate additive columns installed before the migration ledger was written.
        with self.test_engine.begin() as connection:
            for name, (_, _, definition) in migration.COLUMNS.items():
                connection.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN {name} {definition}"))
            connection.execute(text(f"UPDATE {TABLE} SET parent_id=1, evaluator_role='parent' WHERE evaluation_id=1"))
            connection.execute(text(f"UPDATE {TABLE} SET parent_submitted_at='2026-08-11T09:30:00Z' WHERE evaluation_id=3"))
            connection.execute(text(f"""INSERT INTO {TABLE}
                (evaluation_id, student_id, teacher_id, question_id, testing_period, answer, evaluation_date, teacher_evaluation_date)
                VALUES (4, 1, 1, 1, 'MID', 'DI_KAYA', :date, '2026-08-09')"""), {"date": HISTORICAL_DATE})
        before = self.rows()
        self.apply()
        self.assertEqual(self.rows(), before)

    def test_reapplying_does_not_backfill_later_writes_or_duplicate_ledger(self):
        self.apply()
        with self.test_engine.begin() as connection:
            connection.execute(text(f"UPDATE {TABLE} SET teacher_evaluation_date=NULL WHERE evaluation_id=1"))
        before = self.rows()
        self.assertFalse(self.apply())
        self.assertEqual(self.rows(), before)
        with self.test_engine.connect() as connection:
            self.assertEqual(connection.execute(text(f"SELECT COUNT(*) FROM {LEDGER} WHERE version=:version"),
                                                {"version": "007_eccd_evaluator_tracking"}).scalar_one(), 1)

    def test_migration_failure_rolls_back_ddl_backfill_and_ledger(self):
        before = self.rows()
        original = migration._fingerprint
        calls = 0

        def failed_preservation(connection, columns):
            nonlocal calls
            calls += 1
            fingerprint = original(connection, columns)
            return fingerprint if calls == 1 else (fingerprint[0], "simulated corruption")

        with patch.object(migration, "_fingerprint", side_effect=failed_preservation):
            with self.assertRaisesRegex(MigrationError, "preservation failed"):
                self.apply()
        self.assertEqual(self.rows(), before)
        with self.test_engine.connect() as connection:
            self.assertTrue(set(DEFAULTS).isdisjoint(
                {column["name"] for column in inspect(connection).get_columns(TABLE, schema=self.schema)}))
            self.assertEqual(connection.execute(text(f"SELECT COUNT(*) FROM {LEDGER}")).scalar_one(), 0)

    def test_encrypted_backup_round_trip_retains_all_provenance(self):
        self.apply()
        submitted = datetime(2026, 8, 11, 17, 30, 12, 345678, tzinfo=timezone(timedelta(hours=8)))
        with self.test_engine.begin() as connection:
            connection.execute(text(f"UPDATE {TABLE} SET parent_id=1, evaluator_role='parent', teacher_evaluation_date=:date, parent_submitted_at=:submitted WHERE evaluation_id=2"),
                               {"date": date(2026, 8, 9), "submitted": submitted})
        before = self.rows()
        with Session(self.test_engine) as db:
            payload = export_backup(db)
        document = json.loads(cipher().decrypt(payload))
        exported = {row["evaluation_id"]: row for row in document[TABLE]}
        self.assertTrue(set(DEFAULTS).issubset(exported[2]))
        self.assertEqual(exported[2]["parent_id"], 1)
        self.assertEqual(exported[2]["evaluator_role"], "parent")
        self.assertEqual(exported[2]["teacher_evaluation_date"], "2026-08-09")
        self.assertEqual(datetime.fromisoformat(exported[2]["parent_submitted_at"].replace("Z", "+00:00")), submitted)
        with self.test_engine.begin() as connection:
            connection.execute(text(f"DELETE FROM {TABLE}"))
        with Session(self.test_engine) as db:
            restore_backup(db, payload)
        self.assertEqual(self.rows(), before)
        with Session(self.test_engine) as db:
            restored = db.get(StudentEccdEvaluation, 2)
            self.assertEqual(restored.parent.parent_id, 1)
            self.assertEqual(restored.parent_submitted_at, submitted)

    def test_historical_backup_without_provenance_restores_explicit_defaults(self):
        self.apply()
        with Session(self.test_engine) as db:
            document = json.loads(cipher().decrypt(export_backup(db)))
        for row in document[TABLE]:
            for name in DEFAULTS:
                row.pop(name)
            legacy = BackupStudentEccdEvaluation.model_validate(row)
            self.assertEqual({name: getattr(legacy, name) for name in DEFAULTS}, DEFAULTS)
        payload = cipher().encrypt(json.dumps(document).encode())
        with Session(self.test_engine) as db:
            restore_backup(db, payload)
        restored = self.rows()
        self.assertEqual(len(restored), 3)
        for row in restored:
            self.assertEqual({name: row[name] for name in DEFAULTS}, DEFAULTS)
            self.assertEqual(row["evaluation_date"], HISTORICAL_DATE)
            self.assertEqual(row["answer"], "KAYA")

    def test_readiness_executes_only_selects_and_preserves_data(self):
        self.apply()
        before = self.rows()
        statements = []

        def capture(connection, cursor, statement, parameters, context, executemany):
            statements.append(statement)
            self.assertTrue(statement.lstrip().upper().startswith("SELECT"), statement)

        with self.test_engine.connect() as connection:
            event.listen(connection, "before_cursor_execute", capture)
            try:
                main.check_evaluator_tracking_readiness(connection, self.schema)
            finally:
                event.remove(connection, "before_cursor_execute", capture)
        self.assertTrue(statements)
        self.assertEqual(self.rows(), before)


if __name__ == "__main__":
    unittest.main()
