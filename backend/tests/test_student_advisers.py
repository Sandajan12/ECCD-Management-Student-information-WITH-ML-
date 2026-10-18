"""Student roster adviser serialization and bounded-query regressions."""
import unittest

from sqlalchemy import event

from backend.models import Section, Student, Teacher, User
from backend.tests import test_phase2


class StudentAdviserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call = self.fixture.call

    def roster(self):
        response = self.call("GET", "/api/chairman/students")
        self.assertEqual(response.status_code, 200, response.text)
        return {row["student_id"]: row for row in response.json()}

    def test_current_adviser_replaces_history_and_ignores_stale_section_pointer(self):
        rows = self.roster()
        self.assertEqual(rows[1]["adviser_name"], "Test Adviser")
        self.assertEqual(rows[2]["adviser_name"], "Test Adviser")
        self.assertEqual(rows[3]["adviser_name"], "Other Teacher")
        response = self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 3})
        self.assertEqual(response.status_code, 200, response.text)
        # A stale compatibility pointer must never override active assignments.
        with self.fixture.sessions() as db:
            db.get(Section, 1).adviser_teacher_id = 1
            db.commit()
        self.assertEqual(self.roster()[1]["adviser_name"], "Test Substitute")

    def test_no_assignment_or_section_returns_null_without_dropping_students(self):
        response = self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": None})
        self.assertEqual(response.status_code, 200, response.text)
        with self.fixture.sessions() as db:
            db.get(Section, 1).adviser_teacher_id = 1
            db.get(Student, 3).section_id = None
            db.commit()
        rows = self.roster()
        self.assertEqual(set(rows), {1, 2, 3})
        self.assertTrue(all(row["adviser_name"] is None for row in rows.values()))

    def test_names_handle_missing_parts_and_inactive_accounts(self):
        with self.fixture.sessions() as db:
            teacher = db.get(Teacher, 1)
            teacher.first_name, teacher.last_name = "  Ana  ", None
            db.commit()
        self.assertEqual(self.roster()[1]["adviser_name"], "Ana")
        with self.fixture.sessions() as db:
            db.get(Teacher, 1).first_name = None
            db.commit()
        self.assertIsNone(self.roster()[1]["adviser_name"])
        with self.fixture.sessions() as db:
            db.get(Teacher, 1).first_name = "Ana"
            db.get(User, 2).is_active = False
            db.commit()
        self.assertIsNone(self.roster()[1]["adviser_name"])

    def test_advisers_use_one_batch_query_as_roster_grows(self):
        queries = []

        def capture(connection, cursor, statement, parameters, context, executemany):
            if "section_teachers" in statement and "teachers.first_name" in statement:
                queries.append(statement)

        event.listen(self.fixture.test_engine, "before_cursor_execute", capture)
        self.addCleanup(event.remove, self.fixture.test_engine, "before_cursor_execute", capture)
        self.roster()
        self.assertEqual(len(queries), 1)
        with self.fixture.sessions() as db:
            for index in range(30):
                db.add(Student(
                    lrn_number=f"{700000000000 + index}", first_name="Batch", last_name="Learner",
                    section_id=1 if index % 2 else 2, school_year="2026-2027", is_active=True,
                ))
            db.commit()
        queries.clear()
        rows = self.roster()
        self.assertEqual(len(rows), 33)
        self.assertEqual(len(queries), 1)
        for row in rows.values():
            self.assertEqual(row["adviser_name"], "Test Adviser" if row["section_id"] == 1 else "Other Teacher")


if __name__ == "__main__":
    unittest.main()
