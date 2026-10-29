"""Parent visibility lifecycle through real routes in disposable PostgreSQL schemas."""
import unittest

from backend.models import FamilyAccess, SectionTeacher, StudentEccdEvaluation, User
from backend.tests import test_phase2


class ParentVisibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call, self.sessions = self.fixture.call, self.fixture.sessions

    def assert_visible(self, visible):
        for path in ("/api/students/my-child", "/api/students/linked", "/api/parents/children"):
            response = self.call("GET", path, 5)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(1 in [row["student_id"] for row in response.json()], visible, path)

    def assert_denied(self, status=403):
        self.assert_visible(False)
        for path in ("/api/students/1", "/api/parents/children/1/eccd-summary",
                     "/api/eccd/parent/assessment/1", "/api/eccd/parent/dashboard-stats/1",
                     "/api/eccd/parent/domains-progress/1", "/api/eccd/parent/progress/1",
                     "/api/ml/parent/readiness/1"):
            response = self.call("GET", path, 5)
            self.assertEqual(response.status_code, status, (path, response.text))
        for method, path, payload in (
            ("PUT", "/api/parents/children/1", {"address": "Blocked"}),
            ("POST", "/api/ml/parent/predict/1", {}),
            ("POST", "/api/eccd/parent/evaluate", {"student_id": 1, "evaluations": [
                {"question_id": self.fixture.home, "testing_period": "PRE", "answer": "KAYA"}]}),
        ):
            response = self.call(method, path, 5, json=payload)
            self.assertEqual(response.status_code, status, (path, response.text))

    def test_student_archive_restore_preserves_link_and_assessments(self):
        self.assertEqual(self.fixture.evaluate().status_code, 200)
        with self.sessions() as db:
            before = list(db.execute(StudentEccdEvaluation.__table__.select()))
        self.assert_visible(True)
        self.assertEqual(self.call("PUT", "/api/students/1/archive", 2).status_code, 200)
        self.assert_denied()
        with self.sessions() as db:
            self.assertEqual(db.query(FamilyAccess).filter_by(student_id=1).one().status, "SYNCED")
            self.assertEqual(list(db.execute(StudentEccdEvaluation.__table__.select())), before)
        self.assertEqual(self.call("PUT", "/api/students/1/unarchive", 2).status_code, 200)
        self.assert_visible(True)
        self.assertEqual(self.call("GET", "/api/students/1", 5).status_code, 200)

    def test_bulk_archive_and_student_deletion(self):
        self.assertEqual(self.call("PUT", "/api/students/archive-all", 2).status_code, 200)
        self.assert_denied()
        self.assertEqual(self.call("DELETE", "/api/students/1", 2).status_code, 200)
        self.assert_denied(404)

    def test_teacher_archive_requires_reassignment_after_restore(self):
        self.assertEqual(self.call("PUT", "/api/teachers/2/archive").status_code, 200)
        self.assert_denied()
        self.assertEqual(self.call("PUT", "/api/teachers/2/unarchive").status_code, 200)
        self.assert_denied()
        self.assertEqual(self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 1}).status_code, 200)
        self.assert_visible(True)

    def test_teacher_deletion_and_replacement(self):
        self.assertEqual(self.fixture.evaluate().status_code, 200)
        with self.sessions() as db:
            count = db.query(StudentEccdEvaluation).filter_by(student_id=1).count()
        self.assertEqual(self.call("DELETE", "/api/teachers/2").status_code, 200)
        self.assert_denied()
        with self.sessions() as db:
            self.assertEqual(db.query(FamilyAccess).filter_by(student_id=1).one().status, "SYNCED")
            self.assertEqual(db.query(StudentEccdEvaluation).filter_by(student_id=1).count(), count)
        self.assertEqual(self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 3}).status_code, 200)
        self.assert_visible(True)
        child = self.call("GET", "/api/students/1", 5).json()
        self.assertTrue(child["allow_parent_view_eccd_post"])

    def test_inactive_account_and_historical_assignment_do_not_qualify(self):
        with self.sessions() as db:
            db.get(User, 2).is_active = False
            db.commit()
        self.assert_denied()

    def test_transfer_to_active_adviser_keeps_child_visible(self):
        self.assertEqual(self.fixture.evaluate().status_code, 200)
        response = self.call("PUT", "/api/chairman/students/transfer", json={"student_ids": [1], "new_section_id": 2})
        self.assertEqual(response.status_code, 200, response.text)
        self.assert_visible(True)
        self.assertEqual(self.call("PUT", "/api/teachers/2/archive").status_code, 200)
        self.assert_visible(True)
        with self.sessions() as db:
            self.assertGreater(db.query(StudentEccdEvaluation).filter_by(student_id=1).count(), 0)


if __name__ == "__main__":
    unittest.main()
