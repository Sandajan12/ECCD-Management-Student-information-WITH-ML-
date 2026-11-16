"""Adviser takeover regressions in disposable PostgreSQL schemas."""
from concurrent.futures import ThreadPoolExecutor
import json
import unittest
from unittest.mock import patch

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from backend.migrations.adviser_takeover import VERSION, apply_adviser_takeover, check_adviser_takeover
from backend.migrations.phase1 import MigrationError
from backend.models import EccdQuestion, FamilyAccess, Section, SectionTeacher, Student, StudentEccdEvaluation, Teacher, User
from backend.schemas.backup import BackupDocument
from backend.tests import test_phase2
from backend.utils.backups import cipher, export_backup, restore_backup
from backend.utils.teachers import assign_teacher

WINDOWS = "/api/teacher/settings/parent-assessment-access"


class AdviserTakeoverTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call = self.fixture.call
        self.sessions = self.fixture.sessions

    def school_records(self, db):
        return [list(db.execute(model.__table__.select().order_by(list(model.__table__.primary_key)[0])))
                for model in (Student, StudentEccdEvaluation, FamilyAccess)]

    def test_takeover_preserves_records_windows_and_teacher_permission_matrix(self):
        with self.sessions() as db:
            answers = {str(q): 1 for (q,) in db.query(EccdQuestion.question_id)}
        for period, when in (("PRE", "2026-08-10"), ("MID", "2026-09-10"), ("POST", "2026-10-10")):
            self.assertEqual(self.fixture.evaluate(period, when, answers=answers).status_code, 200)
        flags = {"pre_test_parent_editable": False, "mid_test_parent_editable": True, "post_test_parent_editable": True}
        self.assertEqual(self.call("PUT", WINDOWS, 2, params={"section_id": 1}, json=flags).status_code, 200)
        # Keep the outgoing teacher active in another section to test ownership
        # denial independently of account archiving.
        with self.sessions() as db:
            assign_teacher(db, db.get(User, 1), 2, 1)
            db.commit()
            before = self.school_records(db)
            from backend.schemas.common import ParentPermissions
            permissions = {t.teacher_id: {key: getattr(t, key) for key in ParentPermissions.model_fields}
                           for t in db.query(Teacher)}
        result = self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 3})
        self.assertEqual(result.status_code, 200, result.text)
        with self.sessions() as db:
            self.assertEqual(self.school_records(db), before)
            self.assertEqual(db.get(Section, 1).adviser_teacher_id, 3)
            self.assertTrue(db.get(User, 2).is_active)
            self.assertEqual(db.get(Teacher, 1).class_name, "Test B")
            self.assertEqual(db.query(SectionTeacher).filter_by(section_id=1, status="Active").one().teacher_id, 3)
            for teacher_id, values in permissions.items():
                self.assertEqual({key: getattr(db.get(Teacher, teacher_id), key) for key in values}, values)
        self.assertEqual(self.call("GET", "/api/eccd/assessment/1", 2).status_code, 403)
        self.assertEqual(self.call("GET", "/api/eccd/assessment/1", 4).status_code, 200)
        self.assertEqual(self.call("GET", "/api/students/section/1", 4).status_code, 200)
        self.assertEqual(self.call("GET", WINDOWS, 4, params={"section_id": 1}).json(), {"section_id": 1, **flags})
        self.assertEqual(self.call("PUT", WINDOWS, 2, params={"section_id": 1}, json=flags).status_code, 403)
        self.assertEqual(self.call("PUT", WINDOWS, 4, params={"section_id": 1}, json=flags).status_code, 200)
        response = self.call("POST", "/api/eccd/evaluate", 4, json={"student_id": 1, "period": "PRE", "evaluation_date": "2026-08-10", "answers": {str(self.fixture.nonhome): 1}})
        self.assertEqual(response.status_code, 200, response.text)
        parent = self.call("GET", "/api/parents/children", 5).json()[0]
        self.assertTrue(parent["allow_parent_view_eccd_post"])
        self.assertTrue(parent["allow_parent_edit_home_based_eccd"])

    def test_aliases_reject_removed_roles_and_invalid_teacher_without_changes(self):
        for method, path in (("POST", "/api/chairman/sections/1/assign-teacher"),
                             ("PUT", "/api/chairman/sections/1/assign"),
                             ("PUT", "/api/sections/1/assign")):
            for role in ("Substitute", "substitute", "OJT"):
                response = self.call(method, path, json={"teacher_id": 3, "role": role})
                self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(self.call(method, path, json={"teacher_id": 3, "is_substitute": True}).status_code, 422)
            self.assertEqual(self.call(method, path, json={"teacher_id": 999999}).status_code, 404)
        with self.sessions() as db:
            self.assertEqual(db.get(Section, 1).adviser_teacher_id, 1)
            self.assertTrue(db.get(User, 2).is_active)

    def test_unassigned_section_repeat_assignment_and_unassignment(self):
        self.assertEqual(self.call("PUT", "/api/sections/1/assign", json={"teacher_id": None}).status_code, 200)
        for attempt in range(2):
            self.assertEqual(self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 3}).status_code, 200)
            if attempt == 0:
                with self.sessions() as db:
                    db.add(SectionTeacher(section_id=1, teacher_id=3, status="Inactive"))
                    db.commit()
        with self.sessions() as db:
            self.assertEqual(db.query(SectionTeacher).filter_by(section_id=1, status="Active").count(), 1)
            with self.assertRaises(IntegrityError):
                db.add(SectionTeacher(section_id=1, teacher_id=2))
                db.flush()
            db.rollback()
        self.assertEqual(self.call("PUT", "/api/chairman/sections/1/assign", json={"adviser_teacher_id": None}).status_code, 200)
        with self.sessions() as db:
            self.assertIsNone(db.get(Section, 1).adviser_teacher_id)
            self.assertEqual(db.query(SectionTeacher).filter_by(section_id=1, status="Active").count(), 0)

    def test_concurrent_takeovers_leave_one_active_adviser(self):
        def takeover(teacher_id):
            with self.sessions() as db:
                assign_teacher(db, db.get(User, 1), 1, teacher_id)
                db.commit()
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(takeover, (2, 3)))
        with self.sessions() as db:
            active = db.query(SectionTeacher).filter_by(section_id=1, status="Active").one()
            self.assertEqual(db.get(Section, 1).adviser_teacher_id, active.teacher_id)
            self.assertTrue(db.get(Teacher, active.teacher_id).user.is_active)

    def test_migration_retires_old_access_preserves_history_and_is_idempotent(self):
        self.assertEqual(self.fixture.evaluate().status_code, 200)
        with self.sessions() as db:
            before = self.school_records(db)
        with self.fixture.test_engine.begin() as connection:
            connection.execute(text("DROP INDEX uq_section_active_adviser"))
            connection.execute(text("ALTER TABLE section_teachers DROP CONSTRAINT ck_section_teacher_role"))
            connection.execute(text("ALTER TABLE section_teachers ADD CONSTRAINT ck_section_teacher_role CHECK (role IN ('Primary Adviser', 'Substitute'))"))
            connection.execute(text("UPDATE section_teachers SET role = 'Substitute', status = 'Active' WHERE teacher_id = 3"))
            connection.execute(text("DELETE FROM ames_schema_migrations WHERE version = :version"), {"version": VERSION})
            self.assertTrue(apply_adviser_takeover(connection, self.fixture.schema))
            self.assertFalse(apply_adviser_takeover(connection, self.fixture.schema))
            check_adviser_takeover(connection, self.fixture.schema)
        with self.sessions() as db:
            self.assertEqual(self.school_records(db), before)
            retired = db.query(SectionTeacher).filter_by(teacher_id=3).one()
            self.assertEqual((retired.role, retired.status), ("Primary Adviser", "Inactive"))
            self.assertEqual(db.query(SectionTeacher).count(), 3)
        self.assertEqual(self.call("GET", "/api/eccd/assessment/1", 4).status_code, 403)
        self.assertEqual(self.call("GET", WINDOWS, 4, params={"section_id": 1}).status_code, 403)

    def test_old_backup_preserves_retired_rows_without_restoring_access(self):
        with self.sessions() as db:
            document = BackupDocument.model_validate_json(cipher().decrypt(export_backup(db))).model_dump(mode="json")
            retired = next(row for row in document["section_teachers"] if row["teacher_id"] == 3)
            retired.update(role="Substitute", status="Active")
            restore_backup(db, cipher().encrypt(json.dumps(document).encode()))
            self.assertEqual(db.query(SectionTeacher).filter_by(teacher_id=3).one().status, "Inactive")
        self.assertEqual(self.call("GET", "/api/eccd/assessment/1", 4).status_code, 403)

    def test_ambiguous_ownership_aborts_migration_without_partial_changes(self):
        with self.assertRaisesRegex(MigrationError, "Multiple active advisers"):
            with self.fixture.test_engine.begin() as connection:
                connection.execute(text("DROP INDEX uq_section_active_adviser"))
                connection.execute(text("DELETE FROM ames_schema_migrations WHERE version = :version"), {"version": VERSION})
                connection.execute(text("UPDATE section_teachers SET status = 'Active' WHERE teacher_id = 3"))
                apply_adviser_takeover(connection, self.fixture.schema)
        with self.fixture.test_engine.begin() as connection:
            check_adviser_takeover(connection, self.fixture.schema)
        with self.sessions() as db:
            self.assertEqual(db.query(SectionTeacher).filter_by(section_id=1, status="Active").one().teacher_id, 1)

    def test_application_startup_and_health_with_upgraded_schema(self):
        import importlib
        from fastapi.testclient import TestClient
        from backend.migrations.parity_batch1 import apply_batch1
        from backend.migrations.parity_batch2 import apply_batch2
        from backend.migrations.parent_assessment_access import apply_parent_assessment_access
        main = importlib.import_module("backend.main")
        with self.fixture.test_engine.begin() as connection:
            apply_batch1(connection, self.fixture.schema)
            apply_batch2(connection, self.fixture.schema)
            apply_parent_assessment_access(connection, self.fixture.schema)
        with patch.object(main, "engine", self.fixture.test_engine), patch.object(main, "SessionLocal", self.sessions):
            with TestClient(main.app) as client:
                response = client.get("/healthz")
                self.assertEqual(response.status_code, 200, response.text)
