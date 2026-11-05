"""Audit snapshots and actor contracts against disposable PostgreSQL schemas."""
import json
import unittest

from backend.models import EccdQuestion, Section, SystemLog, Teacher
from backend.tests import test_phase2


class AuditLogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call, self.sessions = self.fixture.call, self.fixture.sessions

    def logs(self):
        response = self.call("GET", "/api/analytics/logs")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_handover_snapshots_names_ids_and_survives_renaming(self):
        response = self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 3})
        self.assertEqual(response.status_code, 200, response.text)
        log = self.logs()[0]
        self.assertIn('Teacher "Test Substitute" to Section "Test A"', log["details"])
        self.assertNotIn("Adviser 3", log["details"])
        self.assertEqual(log["metadata"], {"teacherId": 3, "teacherName": "Test Substitute", "sectionId": 1, "sectionName": "Test A", "role": "Primary Adviser"})
        self.assertEqual(log["role"], "Super Admin")
        self.assertEqual(log["actor_email"], "chairman@example.com")
        self.assertIsNotNone(log["timestamp"])
        with self.sessions() as db:
            raw = db.query(SystemLog).filter_by(log_id=log["id"]).one()
            self.assertEqual(json.loads(raw.details)["metadata"], log["metadata"])
            db.get(Teacher, 3).first_name = "Renamed"
            db.get(Section, 1).section_name = "Renamed Section"
            db.commit()
        self.assertEqual(self.logs()[0]["details"], log["details"])
        for path in ("/api/logs", "/api/logs/"):
            self.assertEqual(self.call("GET", path).json()[0]["details"], log["details"])

    def test_unassignment_and_failed_assignment_have_accurate_history(self):
        self.assertEqual(self.call("PUT", "/api/sections/1/assign", json={"teacher_id": 999999}).status_code, 404)
        self.assertEqual(self.logs(), [])
        self.assertEqual(self.call("PUT", "/api/sections/1/assign", json={"teacher_id": None}).status_code, 200)
        log = self.logs()[0]
        self.assertIn('Released the adviser assignment for Section "Test A"', log["details"])
        self.assertNotIn("None", log["details"])
        self.assertIsNone(log["metadata"]["teacherId"])

    def test_teacher_lifecycle_is_audited(self):
        response = self.call("POST", "/api/teachers/", json={"email": "audit.teacher@example.com", "password": "temporary", "first_name": "Audit", "last_name": "Teacher", "section_id": 1})
        self.assertEqual(response.status_code, 201, response.text)
        user_id = response.json()["user_id"]
        for suffix in ("archive", "unarchive"):
            self.assertEqual(self.call("PUT", f"/api/teachers/{user_id}/{suffix}").status_code, 200)
        logs = self.logs()
        self.assertEqual({row["action"] for row in logs}, {"TEACHER_CREATED", "TEACHER_ARCHIVED", "TEACHER_RESTORED", "SECTION_HANDOVER_REASSIGNMENT"})
        self.assertTrue(all(row["metadata"]["teacherName"] == "Audit Teacher" for row in logs))

    def test_evaluations_resolve_teacher_parent_and_student_and_failures_do_not_log(self):
        self.assertEqual(self.fixture.evaluate().status_code, 200)
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_edit_home_based_eccd = True
            unanswered_home = db.query(EccdQuestion).filter(
                EccdQuestion.is_home_based.is_(True),
                EccdQuestion.question_id != self.fixture.home).first().question_id
            db.commit()
        payload = {"student_id": 1, "evaluations": [{"question_id": unanswered_home, "testing_period": "PRE", "answer": "KAYA"}]}
        response = self.call("POST", "/api/eccd/parent/evaluate", 5, json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        logs = self.logs()
        parent = next(row for row in logs if row["action"] == "PARENT_ASSESSMENT_SUBMITTED")
        self.assertEqual((parent["actor_name"], parent["role"]), ("Test Parent", "Parent"))
        self.assertIn('Student "Test Middle Student"', parent["details"])
        teacher = next(row for row in logs if row["action"] == "STUDENT_EVALUATION_SAVED")
        self.assertEqual((teacher["actor_name"], teacher["role"]), ("Test Adviser", "Teacher"))
        self.assertEqual(self.call("POST", "/api/eccd/parent/evaluate", 5, json=payload).status_code, 200)
        self.assertEqual(len(self.logs()), 2)
        payload["evaluations"][0]["answer"] = "DI-KAYA"
        self.assertEqual(self.call("POST", "/api/eccd/parent/evaluate", 5, json=payload).status_code, 409)
        self.assertEqual(self.call("POST", "/api/eccd/parent/evaluate", 6, json=payload).status_code, 403)
        self.assertEqual(len(self.logs()), 2)
        for user in (2, 5):
            self.assertEqual(self.call("GET", "/api/analytics/logs", user).status_code, 403)

    def test_plain_history_retained_internal_rollover_hidden_and_missing_actor_safe(self):
        with self.sessions() as db:
            db.add_all([SystemLog(action_type="OLD_ACTION", details="Historical plain text"),
                        SystemLog(user_id=1, action_type="ROLLOVER_SNAPSHOT", details='{"batch":"test"}'),
                        SystemLog(user_id=1, action_type="ROLLOVER_RECORDS", details='{"ids":[1]}')])
            db.commit()
        logs = self.logs()
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]["details"], "Historical plain text")
        self.assertIsNone(logs[0]["metadata"])
        self.assertEqual((logs[0]["actor_name"], logs[0]["role"]), ("System", "System"))

    def test_transfer_and_student_archive_use_names(self):
        response = self.call("PUT", "/api/chairman/students/transfer", json={"student_ids": [1], "new_section_id": 2})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn('Section "Test B"', self.logs()[0]["details"])
        self.assertIn('"Test Middle Student"', self.logs()[0]["details"])
        self.assertEqual(self.call("PUT", "/api/students/1/archive").status_code, 200)
        self.assertIn('Student "Test Middle Student"', self.logs()[0]["details"])


if __name__ == "__main__":
    unittest.main()
