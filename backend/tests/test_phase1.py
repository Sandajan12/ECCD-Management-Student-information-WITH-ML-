"""Functional Phase 1 checks using disposable schemas in the local PostgreSQL DB.

No live school records are modified. Each test schema is uniquely named and
removed after its test. Run: python -m unittest backend.tests.test_phase1 -v
"""

from datetime import date, datetime, timezone
from pathlib import Path
import re
import unittest
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, configure_mappers

from backend.config.database import engine
from backend.migrations.phase1 import MigrationError, apply_phase1, check_phase1, select_schema
from backend.models import Base, FamilyAccess, Student, StudentEccdEvaluation, User
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.schemas.auth import RegisterParentRequest, UpdatePasswordRequest
from backend.schemas.backup import BackupDocument
from backend.schemas.eccd import AssessmentSaveRequest
from backend.schemas.settings import RolloverRecordChunk, RolloverSnapshot, SchoolSettingsUpdate
from backend.schemas.student import StudentCreate, StudentIdTransferRequest, StudentRecordResponse
from backend.schemas.teacher import ParentPermissionUpdate
from backend.utils.lrn import decrypt_lrn, encrypt_lrn, hash_lrn, mask_lrn

BASELINE = Path(__file__).parent / "fixtures" / "phase1_baseline.sql"


class SchemaTests(unittest.TestCase):
    def test_backup_schema_matches_model_columns(self) -> None:
        self.assertEqual(set(BackupDocument.model_fields), set(Base.metadata.tables))
        for name, table in Base.metadata.tables.items():
            row_type = BackupDocument.model_fields[name].annotation.__args__[0]
            self.assertEqual(set(row_type.model_fields), set(table.columns.keys()), name)
    def test_mapper_relationships(self) -> None:
        configure_mappers()

    def test_lrn_roundtrip_leading_zero_and_nonce(self) -> None:
        first, second = encrypt_lrn("001234567890"), encrypt_lrn("001234567890")
        self.assertNotEqual(first, second)
        self.assertEqual(decrypt_lrn(first), "001234567890")
        self.assertEqual([len(part) for part in first.split(":")], [32, 32, 24])
        self.assertEqual(hash_lrn("001234567890"), hash_lrn("001234567890"))
        self.assertNotEqual(hash_lrn("001234567890"), hash_lrn("001234567891"))
        self.assertEqual(mask_lrn("7890"), "\u2022" * 8 + "7890")

    def test_invalid_and_tampered_lrns_rejected(self) -> None:
        for value in ("123", "１２３４５６７８９０１２", " 001234567890", 123456789012):
            with self.subTest(value_type=type(value).__name__), self.assertRaises(ValueError):
                encrypt_lrn(value)
        payload = encrypt_lrn("001234567890")
        tampered = ("0" if payload[0] != "0" else "1") + payload[1:]
        with self.assertRaises(ValueError):
            decrypt_lrn(tampered)

    def test_student_ids_and_limits(self) -> None:
        request = StudentIdTransferRequest(student_ids=["1", 2], new_section_id="3")
        self.assertEqual(request.student_ids, [1, 2])
        for ids in ([], [True], [0], [-1], [1, 1], list(range(1, 1002)), [1.5]):
            with self.subTest(ids_count=len(ids)), self.assertRaises(ValidationError):
                StudentIdTransferRequest(student_ids=ids, new_section_id=3)
        with self.assertRaises(ValidationError):
            StudentCreate(lrn_number="001234567890", num_of_siblings=-1)

    def test_safe_student_response(self) -> None:
        record = StudentRecordResponse.model_validate({"student_id": 1, "lrn_last4": "7890", "lrn_number": "001234567890", "lrn_encrypted": "private", "lrn_search_hash": "private"})
        payload = record.model_dump()
        for key in ("lrn_number", "lrn_encrypted", "lrn_search_hash"):
            self.assertNotIn(key, payload)
        self.assertEqual(payload["masked_lrn"], "\u2022" * 8 + "7890")

    def test_assessment_period_and_question_consistency(self) -> None:
        payload = {"student_id": 1, "testing_period": "PRE", "assessment_date": "2026-08-01", "evaluations": [{"question_id": 1, "testing_period": "PRE", "answer": "KAYA"}]}
        self.assertEqual(AssessmentSaveRequest.model_validate(payload).student_id, 1)
        for answers in ([payload["evaluations"][0]] * 2, [{"question_id": 1, "testing_period": "MID", "answer": "KAYA"}], []):
            with self.assertRaises(ValidationError):
                AssessmentSaveRequest.model_validate({**payload, "evaluations": answers})

    def test_password_policy_and_registration_aliases(self) -> None:
        account = RegisterParentRequest(email="parent@example.com", password="Example123", first_name="Test", last_name="Parent", relationship_type="Mother")
        self.assertEqual(account.firstName, "Test")
        self.assertEqual(account.relationship, "Mother")
        self.assertEqual(account.otp, "")
        for password in ("short", "lowercase123", "UPPERCASE123", "NoNumbers", "Ab1" + "é" * 35):
            with self.assertRaises(ValidationError):
                UpdatePasswordRequest(newPassword=password, confirmPassword=password)
        with self.assertRaises(ValidationError):
            UpdatePasswordRequest(newPassword="Example123", confirmPassword="Mismatch123")

    def test_granular_permissions(self) -> None:
        permissions = ParentPermissionUpdate(allow_parent_view_eccd_pre=True)
        self.assertEqual(permissions.model_dump(exclude_unset=True), {"allow_parent_view_eccd_pre": True})
        for name in ("allow_parent_view", "allow_parent_edit", "allow_parent_home_based_edit"):
            with self.assertRaises(ValidationError):
                ParentPermissionUpdate.model_validate({name: True})

    def test_rollover_snapshots_and_months(self) -> None:
        batch = uuid4()
        snapshot = RolloverSnapshot(batch=batch, previousYear="2026-2027", nextYear="2027-2028", startMonth=8)
        self.assertEqual(RolloverSnapshot.model_validate_json(snapshot.model_dump_json()), snapshot)
        chunk = RolloverRecordChunk(batch=batch, kind="students", ids=list(range(1, 501)))
        self.assertGreater(len(chunk.model_dump_json()), 255)
        for month in (0, 13, True, 8.5):
            with self.assertRaises(ValidationError):
                SchoolSettingsUpdate(school_year_start_month=month)
        with self.assertRaises(ValidationError):
            RolloverSnapshot(batch=batch, previousYear="2026-2027", nextYear="2029-2030", startMonth=8)


class MigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.schema = "phase1_test_" + uuid4().hex
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))

    def tearDown(self) -> None:
        # The only recursive database cleanup is this verified, test-owned schema.
        if not re.fullmatch(r"phase1_test_[a-f0-9]{32}", self.schema):
            raise AssertionError("Unsafe test schema cleanup target")
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))

    def baseline(self, lrn: str = "001234567890") -> None:
        with engine.begin() as connection:
            select_schema(connection, self.schema)
            connection.exec_driver_sql(BASELINE.read_text(encoding="utf-8"))
            statements = [
                "INSERT INTO users (user_id, username, password_hash, email, role, is_active) VALUES (1, 'test-admin', 'unchanged-admin-hash', 'admin@example.com', 'super-admin', true), (2, 'test-teacher', 'unchanged-teacher-hash', 'teacher@example.com', 'admin', true), (3, 'test-parent', 'unchanged-parent-hash', 'parent@example.com', 'user', true)",
                "INSERT INTO teachers (teacher_id, user_id, first_name, allow_eccd_question_management, allow_parent_view_student_info, allow_parent_edit_student_info) VALUES (1, 2, 'Test Teacher', true, true, true)",
                "INSERT INTO parents (parent_id, user_id, fullname) VALUES (1, 3, 'Test Parent')",
                "INSERT INTO sections (section_id, section_name, adviser_teacher_id) VALUES (1, 'Test A', 1), (2, 'Test B', null)",
                "INSERT INTO section_teachers (section_id, teacher_id, role, status) VALUES (1, 1, 'Primary Adviser', 'Active')",
                "INSERT INTO eccd_domains (domain_id, domain_name) VALUES (1, 'Gross Motor')",
                "INSERT INTO eccd_questions (question_id, domain_id, question_text, sequence_order) VALUES (1, 1, 'Test question', 1)",
                "INSERT INTO system_settings (id, current_school_year, system_title) VALUES (1, '2026-2027', 'Local School')",
                "INSERT INTO system_logs (user_id, action_type, details) VALUES (1, 'TEST', 'Existing audit log')",
                "INSERT INTO messages (parent_id, teacher_id, sender_role, body, is_archived, is_read) VALUES (1, 1, 'TEACHER', 'Active message', false, false), (1, 1, 'PARENT', 'Earlier archive', true, true)",
                "INSERT INTO email_verifications (email, otp, expires_at) VALUES ('parent@example.com', '123456', '2026-10-11 00:00:00')",
            ]
            for statement in statements:
                connection.execute(text(statement))
            connection.execute(text("INSERT INTO students (lrn_number, first_name, section_id, is_active, school_year) VALUES (:lrn, 'Test Student', 1, true, '2026-2027'), ('009876543210', 'Earlier Archive', 1, false, '2025-2026')"), {"lrn": lrn})
            connection.execute(text("INSERT INTO family_access (parent_id, student_lrn, relationship_type) VALUES (1, :lrn, 'Mother')"), {"lrn": lrn})
            for period in ("PRE", "MID", "POST"):
                connection.execute(text("INSERT INTO student_eccd_evaluations (student_lrn, teacher_id, question_id, testing_period, answer, evaluation_date) VALUES (:lrn, 1, 1, :period, 'KAYA', '2026-08-01')"), {"lrn": lrn, "period": period})

    def apply(self) -> bool:
        with engine.begin() as connection:
            return apply_phase1(connection, self.schema)

    def test_migration_preserves_all_original_data_and_history(self) -> None:
        self.baseline()
        self.assertTrue(self.apply())
        with engine.begin() as connection:
            check_phase1(connection, self.schema)
            student = connection.execute(text("SELECT * FROM students WHERE lrn_number='001234567890'")).mappings().one()
            self.assertGreater(student["student_id"], 0)
            self.assertEqual(decrypt_lrn(student["lrn_encrypted"]), student["lrn_number"])
            self.assertEqual(student["lrn_search_hash"], hash_lrn(student["lrn_number"]))
            self.assertEqual(connection.execute(text("SELECT student_id FROM family_access")).scalar_one(), student["student_id"])
            answers = connection.execute(text("SELECT student_id, testing_period, answer, evaluation_date FROM student_eccd_evaluations ORDER BY testing_period::text")).all()
            self.assertEqual({row.testing_period for row in answers}, {"PRE", "MID", "POST"})
            self.assertTrue(all(row.student_id == student["student_id"] and row.answer == "KAYA" and row.evaluation_date == date(2026, 8, 1) for row in answers))
            connection.execute(text("UPDATE students SET section_id=2 WHERE student_id=:id"), {"id": student["student_id"]})
            self.assertEqual(connection.execute(text("SELECT count(*) FROM student_eccd_evaluations WHERE student_id=:id"), {"id": student["student_id"]}).scalar_one(), 3)
            self.assertFalse(connection.execute(text("SELECT is_active FROM students WHERE lrn_number='009876543210'")).scalar_one())
            users = connection.execute(text("SELECT password_hash, is_first_login, is_registration_pending FROM users ORDER BY user_id")).all()
            self.assertEqual([row.password_hash for row in users], ["unchanged-admin-hash", "unchanged-teacher-hash", "unchanged-parent-hash"])
            self.assertTrue(all(not row.is_first_login and not row.is_registration_pending for row in users))
            self.assertEqual(connection.execute(text("SELECT school_year_start_month FROM system_settings")).scalar_one(), 8)
            self.assertEqual(connection.execute(text("SELECT expires_at FROM email_verifications")).scalar_one().astimezone(timezone.utc), datetime(2026, 10, 11, tzinfo=timezone.utc))

    def test_migration_idempotence(self) -> None:
        self.baseline()
        self.apply()
        with engine.begin() as connection:
            select_schema(connection, self.schema)
            original = connection.execute(text("SELECT student_id, lrn_encrypted, lrn_search_hash FROM students ORDER BY student_id")).all()
        self.assertFalse(self.apply())
        with engine.begin() as connection:
            select_schema(connection, self.schema)
            self.assertEqual(connection.execute(text("SELECT student_id, lrn_encrypted, lrn_search_hash FROM students ORDER BY student_id")).all(), original)
            self.assertEqual(connection.execute(text("SELECT count(*) FROM ames_schema_migrations")).scalar_one(), 1)

    def test_invalid_lrn_rolls_back_schema_and_data(self) -> None:
        self.baseline("invalid-lrn")
        with self.assertRaises(MigrationError):
            self.apply()
        with engine.begin() as connection:
            select_schema(connection, self.schema)
            self.assertEqual(inspect(connection).get_pk_constraint("students", schema=self.schema)["constrained_columns"], ["lrn_number"])
            self.assertNotIn("student_id", {item["name"] for item in inspect(connection).get_columns("students", schema=self.schema)})
            self.assertNotIn("ames_schema_migrations", inspect(connection).get_table_names(schema=self.schema))
            self.assertEqual(connection.execute(text("SELECT count(*) FROM student_eccd_evaluations")).scalar_one(), 3)

    def test_fresh_database(self) -> None:
        self.assertTrue(self.apply())
        self.assertFalse(self.apply())
        with engine.begin() as connection:
            check_phase1(connection, self.schema)
            self.assertEqual(connection.execute(text("SELECT count(*) FROM users")).scalar_one(), 0)

    def test_legacy_and_id_only_orm_inserts(self) -> None:
        self.baseline()
        self.apply()
        from backend.migrations.phase2 import apply_phase2
        with engine.begin() as connection:
            apply_phase2(connection, self.schema)
        with engine.begin() as connection:
            select_schema(connection, self.schema)
            with Session(connection) as session:
                student = Student(lrn_number="000000000003", first_name="New Student", middle_name="Middle", section_id=1, school_year="2026-2027")
                session.add(student)
                session.flush()
                self.assertGreater(student.student_id, 2)
                family = FamilyAccess(parent_id=1, student_lrn=student.lrn_number)
                answer = StudentEccdEvaluation(student_id=student.student_id, question_id=1, testing_period=TestingPeriod.PRE, answer=EccdAnswer.DI_KAYA, evaluation_date=date(2026, 8, 2))
                session.add_all([family, answer])
                session.flush()
                self.assertEqual(family.student_id, student.student_id)
                self.assertEqual(answer.student_lrn, student.lrn_number)
                self.assertEqual(decrypt_lrn(student.lrn_encrypted), student.lrn_number)
                record = StudentRecordResponse.model_validate(student)
                self.assertEqual(record.masked_lrn, "\u2022" * 8 + "0003")
                # Existing account queries still work with the expanded User model.
                self.assertEqual(session.scalar(select(User).where(User.user_id == 1)).password_hash, "unchanged-admin-hash")

    def test_database_identity_and_unique_answer_constraints(self) -> None:
        self.baseline()
        self.apply()
        with self.assertRaises(IntegrityError), engine.begin() as connection:
            select_schema(connection, self.schema)
            connection.execute(text("INSERT INTO family_access (parent_id, student_id, student_lrn) SELECT 1, student_id, '009876543210' FROM students WHERE lrn_number='001234567890'"))
        with self.assertRaises(IntegrityError), engine.begin() as connection:
            select_schema(connection, self.schema)
            connection.execute(text("INSERT INTO student_eccd_evaluations (student_id, student_lrn, question_id, testing_period, answer, evaluation_date) SELECT student_id, lrn_number, 1, 'PRE', 'DI_KAYA', '2026-08-02' FROM students WHERE lrn_number='001234567890'"))

    def test_assignment_and_opening_month_checks(self) -> None:
        self.baseline()
        self.apply()
        for statement in ("UPDATE system_settings SET school_year_start_month=13", "UPDATE section_teachers SET role='OJT'", "UPDATE section_teachers SET status='Other'"):
            with self.assertRaises(IntegrityError), engine.begin() as connection:
                select_schema(connection, self.schema)
                connection.execute(text(statement))

    def test_cascades_and_large_snapshot_storage(self) -> None:
        self.baseline()
        self.apply()
        with engine.begin() as connection:
            select_schema(connection, self.schema)
            chunk = RolloverRecordChunk(batch=uuid4(), kind="students", ids=list(range(1, 501)))
            connection.execute(text("INSERT INTO system_logs (action_type, details) VALUES ('ROLLOVER_RECORDS', :details)"), {"details": chunk.model_dump_json()})
            self.assertEqual(connection.execute(text("SELECT details FROM system_logs WHERE action_type='ROLLOVER_RECORDS'")).scalar_one(), chunk.model_dump_json())
            connection.execute(text("DELETE FROM students WHERE lrn_number='001234567890'"))
            self.assertEqual(connection.execute(text("SELECT count(*) FROM family_access")).scalar_one(), 0)
            self.assertEqual(connection.execute(text("SELECT count(*) FROM student_eccd_evaluations")).scalar_one(), 0)
            self.assertEqual(connection.execute(text("SELECT count(*) FROM users")).scalar_one(), 3)

    def test_typed_backup_rejects_invalid_rows_before_restore(self) -> None:
        self.baseline()
        self.apply()
        # Current backup exports use current identity columns, even when this
        # fixture starts from the historical Phase 1 baseline.
        from backend.migrations.email_only_identity import apply_email_only_identity
        with engine.begin() as connection:
            apply_email_only_identity(connection, self.schema)
        with engine.begin() as connection:
            select_schema(connection, self.schema)
            document = {name: [dict(row) for row in connection.execute(table.select()).mappings()] for name, table in Base.metadata.tables.items()}
        parsed = BackupDocument.model_validate(document)
        self.assertEqual(len(parsed.student_eccd_evaluations), 3)
        self.assertEqual(BackupDocument.model_validate_json(parsed.model_dump_json()), parsed)
        with self.assertRaises(ValidationError):
            BackupDocument.model_validate({**document, "unexpected_table": []})
        with self.assertRaises(ValidationError):
            BackupDocument.model_validate({key: value for key, value in document.items() if key != "users"})
        bad_reference = {**document, "family_access": [{**document["family_access"][0], "student_id": 999}]}
        with self.assertRaises(ValidationError):
            BackupDocument.model_validate(bad_reference)
        duplicate = {**document, "students": document["students"] + [document["students"][0]]}
        with self.assertRaises(ValidationError):
            BackupDocument.model_validate(duplicate)
        tampered = {**document, "students": [{**document["students"][0], "lrn_search_hash": "a" * 64}] + document["students"][1:]}
        with self.assertRaises(ValidationError):
            BackupDocument.model_validate(tampered)


if __name__ == "__main__":
    unittest.main()
