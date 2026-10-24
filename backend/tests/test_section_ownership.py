"""Orphan cleanup, teacher moves and handover regressions in disposable schemas."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import unittest
from unittest.mock import patch

from sqlalchemy import text

from backend.migrations.section_ownership import apply_section_ownership, check_section_ownership
from backend.models import Section, SectionTeacher, Teacher, User
from backend.tests import test_phase2
from backend.utils.teachers import assign_teacher


class SectionOwnershipTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call = self.fixture.call
        self.sessions = self.fixture.sessions

    def test_migration_keeps_current_class_even_when_orphan_has_larger_id(self):
        self.assertEqual(self.fixture.evaluate().status_code, 200)
        with self.sessions() as db:
            db.get(Teacher, 1).class_name = "Test A"
            db.add(Section(section_id=7, section_name="Example", adviser_teacher_id=1))
            db.flush()
            db.add(SectionTeacher(section_id=7, teacher_id=1))
            db.commit()
            before = list(db.execute(text("SELECT * FROM student_eccd_evaluations ORDER BY evaluation_id")))
            history = [(a.id, a.section_id, a.teacher_id, a.assigned_date) for a in db.query(SectionTeacher).order_by(SectionTeacher.id)]
        with self.fixture.test_engine.begin() as connection:
            self.assertTrue(apply_section_ownership(connection, self.fixture.schema))
            self.assertFalse(apply_section_ownership(connection, self.fixture.schema))
            check_section_ownership(connection, self.fixture.schema)
        with self.sessions() as db:
            self.assertIsNone(db.get(Section, 7).adviser_teacher_id)
            self.assertEqual(db.get(Section, 1).adviser_teacher_id, 1)
            self.assertEqual(db.query(SectionTeacher).filter_by(teacher_id=1, status="Active").one().section_id, 1)
            self.assertTrue(db.get(User, 2).is_active)
            self.assertEqual(list(db.execute(text("SELECT * FROM student_eccd_evaluations ORDER BY evaluation_id"))), before)
            self.assertEqual([(a.id, a.section_id, a.teacher_id, a.assigned_date) for a in db.query(SectionTeacher).order_by(SectionTeacher.id)], history)
        sections = self.call("GET", "/api/chairman/sections").json()
        self.assertIsNone(next(s for s in sections if s["section_id"] == 7)["adviser_teacher_id"])
        response = self.call("PUT", "/api/teachers/4", json={"section_id": 7})
        self.assertEqual(response.status_code, 200, response.text)
        with self.sessions() as db:
            self.assertEqual(db.get(Section, 7).adviser_teacher_id, 3)
            self.assertEqual(db.get(Section, 1).adviser_teacher_id, 1)
            self.assertTrue(db.get(User, 2).is_active)

    def test_migration_falls_back_to_latest_assignment_and_clears_pointer_only_orphans(self):
        with self.sessions() as db:
            db.get(Teacher, 1).class_name = "Stale label"
            db.add_all([Section(section_id=7, section_name="Recent", adviser_teacher_id=1),
                        Section(section_id=8, section_name="Pointer only", adviser_teacher_id=2)])
            db.flush()
            db.add(SectionTeacher(section_id=7, teacher_id=1, assigned_date=datetime(2099, 1, 1)))
            db.commit()
        with self.fixture.test_engine.begin() as connection:
            apply_section_ownership(connection, self.fixture.schema)
        with self.sessions() as db:
            self.assertIsNone(db.get(Section, 1).adviser_teacher_id)
            self.assertIsNone(db.get(Section, 8).adviser_teacher_id)
            self.assertEqual(db.get(Section, 7).adviser_teacher_id, 1)
            self.assertEqual(db.get(Section, 2).adviser_teacher_id, 2)

    def test_all_assignment_aliases_vacate_old_pointers_and_active_history(self):
        for method, path in (("POST", "/api/chairman/sections/2/assign-teacher"),
                             ("PUT", "/api/chairman/sections/1/assign"),
                             ("PUT", "/api/sections/2/assign"),
                             ("PUT", "/api/teachers/2"),
                             ("PUT", "/api/teachers/update/2")):
            target = 1 if path in ("/api/teachers/2", "/api/chairman/sections/1/assign") else 2
            payload = {"class_name": "Test A"} if path == "/api/teachers/2" else {"section_id": target} if "teachers/update" in path else {"teacher_id": 1}
            response = self.call(method, path, json=payload)
            self.assertEqual(response.status_code, 200, response.text)
            with self.sessions() as db:
                self.assertEqual(db.query(Section).filter_by(adviser_teacher_id=1).one().section_id, target)
                self.assertIsNone(db.get(Section, 3 - target).adviser_teacher_id)
                self.assertEqual(db.query(SectionTeacher).filter_by(teacher_id=1, status="Active").one().section_id, target)
                self.assertTrue(db.get(User, 2).is_active)

    def test_handover_does_not_archive_teacher_with_another_active_section(self):
        with self.sessions() as db:
            # Reproduce pre-cleanup data so even a direct handover is safe.
            db.add(Section(section_id=7, section_name="Example", adviser_teacher_id=1))
            db.flush()
            db.add(SectionTeacher(section_id=7, teacher_id=1))
            db.get(Teacher, 1).class_name = "Test A"
            db.commit()
        response = self.call("POST", "/api/chairman/sections/7/assign-teacher", json={"teacher_id": 3})
        self.assertEqual(response.status_code, 200, response.text)
        with self.sessions() as db:
            self.assertTrue(db.get(User, 2).is_active)
            self.assertEqual(db.get(Teacher, 1).class_name, "Test A")
            self.assertEqual(db.get(Section, 1).adviser_teacher_id, 1)

    def test_failed_move_rolls_back_vacated_section_and_handover(self):
        def fail_after_assignment(*args, **kwargs):
            assign_teacher(*args, **kwargs)
            raise RuntimeError("Simulated failure after assignment")

        with patch("backend.utils.teachers.assign_teacher", side_effect=fail_after_assignment):
            with self.assertRaisesRegex(RuntimeError, "Simulated failure"):
                self.call("PUT", "/api/teachers/2", json={"section_id": 2})
        with self.sessions() as db:
            self.assertEqual(db.get(Section, 1).adviser_teacher_id, 1)
            self.assertEqual(db.get(Section, 2).adviser_teacher_id, 2)
            self.assertTrue(db.get(User, 3).is_active)
            self.assertEqual(db.query(SectionTeacher).filter_by(teacher_id=1, status="Active").one().section_id, 1)

    def test_concurrent_moves_of_same_teacher_leave_one_section(self):
        def move(section_id):
            with self.sessions() as db:
                assign_teacher(db, db.get(User, 1), section_id, 1)
                db.commit()
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(move, (1, 2)))
        with self.sessions() as db:
            owner = db.query(Section).filter_by(adviser_teacher_id=1).one()
            self.assertEqual(db.query(SectionTeacher).filter_by(teacher_id=1, status="Active").one().section_id, owner.section_id)
            self.assertTrue(db.get(User, 2).is_active)
