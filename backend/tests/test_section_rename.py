"""Section renames use disposable PostgreSQL schemas, never school records."""
import unittest

from backend.models import Section, SectionTeacher, Student, StudentEccdEvaluation, Teacher, SystemLog
from backend.tests import test_phase2


class SectionRenameTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)

    def rename(self, name, section_id=1, user=1):
        return self.fixture.call("PUT", f"/api/sections/{section_id}", user, json={"section_name": name})

    def test_rename_preserves_assignments_assessments_and_updates_cached_labels(self):
        self.assertEqual(self.fixture.evaluate().status_code, 200)
        with self.fixture.sessions() as db:
            before = [(row.id, row.section_id, row.teacher_id, row.status, row.assigned_date)
                      for row in db.query(SectionTeacher).order_by(SectionTeacher.id)]
            scores = [(row.evaluation_id, row.student_id, row.question_id, row.answer)
                      for row in db.query(StudentEccdEvaluation)]
            windows = (db.get(Section, 1).pre_test_parent_editable,
                       db.get(Section, 1).mid_test_parent_editable,
                       db.get(Section, 1).post_test_parent_editable)
        response = self.rename("  Mabini  ")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["section_name"], "Mabini")
        with self.fixture.sessions() as db:
            self.assertEqual([(row.id, row.section_id, row.teacher_id, row.status, row.assigned_date)
                              for row in db.query(SectionTeacher).order_by(SectionTeacher.id)], before)
            self.assertEqual([(row.evaluation_id, row.student_id, row.question_id, row.answer)
                              for row in db.query(StudentEccdEvaluation)], scores)
            self.assertEqual([row.section_name for row in db.query(Student).filter_by(section_id=1)], ["Mabini", "Mabini"])
            self.assertEqual(db.get(Teacher, 1).class_name, "Mabini")
            self.assertIsNone(db.get(Teacher, 3).class_name)  # historical, inactive assignment
            section = db.get(Section, 1)
            self.assertEqual((section.pre_test_parent_editable, section.mid_test_parent_editable,
                              section.post_test_parent_editable), windows)
            self.assertEqual(db.query(SystemLog).filter_by(action_type="UPDATE_SECTION").count(), 1)
        directory = self.fixture.call("GET", "/api/teachers/active").json()
        self.assertEqual(next(row for row in directory if row["teacher_id"] == 1)["section_name"], "Mabini")

    def test_duplicate_names_and_validation_do_not_mutate(self):
        for name in ("Test B", "  test b  "):
            response = self.rename(name)
            self.assertEqual(response.status_code, 409, response.text)
            self.assertEqual(response.json()["detail"], "Section name already exists.")
        for name in ("", "   ", None, 7, "x" * 101):
            response = self.rename(name)
            self.assertEqual(response.status_code, 422, response.text)
        for data in ({}, {"section_name": "Changed", "adviser_teacher_id": 2}):
            self.assertEqual(self.fixture.call("PUT", "/api/sections/1", json=data).status_code, 422)
        with self.fixture.sessions() as db:
            self.assertEqual(db.get(Section, 1).section_name, "Test A")
            self.assertEqual(db.get(Section, 1).adviser_teacher_id, 1)
            self.assertEqual(db.query(SystemLog).filter_by(action_type="UPDATE_SECTION").count(), 0)
        self.assertEqual(self.rename("Test A").status_code, 200)

    def test_permissions_and_missing_section(self):
        for user in (2, 5):
            self.assertEqual(self.rename("Changed", user=user).status_code, 403)
        self.assertEqual(self.fixture.client.put("/api/sections/1", json={"section_name": "Changed"}).status_code, 401)
        self.assertEqual(self.rename("Changed", section_id=999999).status_code, 404)


if __name__ == "__main__":
    unittest.main()
