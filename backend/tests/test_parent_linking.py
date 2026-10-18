"""Parent approval/access regressions in disposable PostgreSQL schemas."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import unittest
from unittest.mock import patch

from sqlalchemy import text

from backend.migrations.parent_linking import apply_parent_linking, check_parent_linking
from backend.models import FamilyAccess, Parent, SectionTeacher, Student, StudentEccdEvaluation, SystemLog
from backend.tests import test_phase2
from backend.utils.backups import export_backup, restore_backup
from backend.routes.teachers import change_parent_link
from backend.schemas.student import ParentLinkActionRequest


class ParentLinkingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call = self.fixture.call
        self.sessions = self.fixture.sessions

    def request_link(self, user=6, lrn="001111111111", path="/api/students/link"):
        return self.call("POST", path, user, json={"lrn_number": lrn, "relationship_type": "Father"})

    def action(self, action, student=1, teacher=2, parent=1):
        return self.call("POST", f"/api/teachers/students/{student}/{action}", teacher, json={"parent_id": parent})

    def test_roster_aliases_report_all_states_without_parent_phone_or_raw_lrn(self):
        self.assertEqual(self.request_link().status_code, 200)
        for route, teacher, student, expected in (("/api/teacher/students", 2, 1, "SYNCED"), ("/api/teachers/students", 3, 3, "PENDING"), ("/api/students/", 2, 1, "SYNCED")):
            response = self.call("GET", route, teacher)
            self.assertEqual(response.status_code, 200, response.text)
            row = next(row for row in response.json() if row["student_id"] == student)
            self.assertEqual(row["parent_link_status"], expected)
            self.assertEqual(set(row["parent_info"]), {"parent_id", "full_name", "email", "relationship", "linked_at", "requested_at"})
            self.assertNotIn("001111111111", response.text)
            self.assertNotIn(test_phase2.LRN, response.text)
            datetime.fromisoformat(row["parent_info"]["requested_at"])
        self.assertEqual(self.action("unlink-parent").status_code, 200)
        row = self.call("GET", "/api/teachers/students", 2).json()[0]
        self.assertEqual((row["parent_link_status"], row["parent_info"]), ("NONE", None))

    def test_teacher_assignment_and_role_required_for_every_action(self):
        for action in ("unlink-parent", "approve-parent-link", "reject-parent-link"):
            for actor in (3, 5, 6):
                response = self.action(action, teacher=actor)
                self.assertEqual(response.status_code, 403, response.text)
        with self.sessions() as db:
            db.query(SectionTeacher).filter_by(teacher_id=1).update({"status": "Inactive"})
            db.commit()
        self.assertEqual(self.action("unlink-parent").status_code, 403)
        for route in ("/api/teacher/students", "/api/teachers/students"):
            self.assertEqual(self.call("GET", route, 5).status_code, 403)
        with self.sessions() as db:
            self.assertEqual(db.query(SystemLog).filter(SystemLog.action_type.like("%Parent%")).count(), 0)

    def test_replacement_adviser_can_manage_assigned_section(self):
        self.assertEqual(self.action("unlink-parent", teacher=4).status_code, 403)
        self.assertEqual(self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 3}).status_code, 200)
        self.assertEqual(self.action("unlink-parent", teacher=4).status_code, 200)

    def test_unlink_revokes_access_preserves_evaluations_and_guardians_and_audits(self):
        self.assertEqual(self.fixture.evaluate().status_code, 200)
        with self.sessions() as db:
            before = list(db.execute(StudentEccdEvaluation.__table__.select()))
            guardian = Parent(fullname="School Guardian")
            db.add(guardian)
            db.flush()
            db.add(FamilyAccess(parent_id=guardian.parent_id, student_id=1, relationship_type="Guardian"))
            db.commit()
        response = self.action("unlink-parent")
        self.assertEqual(response.json(), {"success": True, "message": "Parent account successfully unlinked."})
        self.assert_parent_denied(5, 1)
        with self.sessions() as db:
            self.assertEqual(list(db.execute(StudentEccdEvaluation.__table__.select())), before)
            self.assertEqual(db.query(FamilyAccess).filter_by(student_id=1).count(), 1)
            event = db.query(SystemLog).filter_by(action_type="Unlinked Parent").one()
            self.assertEqual(event.details, "Unlinked Parent: Test Parent from student Test Middle Student")
            self.assertEqual(event.user_id, 2)

    def assert_parent_denied(self, parent, student):
        paths = [f"/api/students/{student}", f"/api/parents/children/{student}/eccd-summary",
                 f"/api/eccd/parent/assessment/{student}", f"/api/eccd/parent/dashboard-stats/{student}",
                 f"/api/eccd/parent/domains-progress/{student}", f"/api/eccd/parent/progress/{student}"]
        for path in paths:
            response = self.call("GET", path, parent)
            self.assertEqual(response.status_code, 403, (path, response.text))
        self.assertEqual(self.call("PUT", f"/api/parents/children/{student}", parent, json={"address": "Blocked"}).status_code, 403)
        self.assertEqual(self.call("POST", "/api/eccd/parent/evaluate", parent, json={"student_lrn": str(student), "evaluations": [{"question_id": self.fixture.home, "answer": "KAYA", "testing_period": "PRE"}]}).status_code, 403)
        children = self.call("GET", "/api/parents/children", parent)
        self.assertNotIn(student, [row["student_id"] for row in children.json()])

    def test_pending_request_grants_no_access_and_retries_do_not_duplicate(self):
        for path in ("/api/students/link", "/api/parents/children/link", "/api/messages/link-lrn"):
            response = self.request_link(path=path)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn("awaiting teacher approval", response.json()["message"])
        self.assert_parent_denied(6, 3)
        self.assertEqual(self.call("GET", "/api/messages/history", 6, params={"teacher_id": 2, "parent_id": 2}).status_code, 403)
        self.assertEqual(self.call("GET", "/api/messages/contacts", 6).json()["contacts"], [])
        self.assertEqual(self.request_link(user=5).status_code, 400)
        with self.sessions() as db:
            self.assertEqual(db.query(FamilyAccess).filter_by(student_id=3).count(), 1)
            self.assertEqual(db.query(FamilyAccess).filter_by(student_id=3).one().status, "PENDING")

    def test_approve_grants_access_and_logs_name(self):
        self.assertEqual(self.request_link().status_code, 200)
        result = self.action("approve-parent-link", student=3, teacher=3, parent=2)
        self.assertEqual(result.json(), {"success": True, "message": "Parent link approved successfully."})
        self.assertEqual(self.call("GET", "/api/students/3", 6).status_code, 200)
        summary = self.call("GET", "/api/parents/children/3/eccd-summary", 6)
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertEqual(summary.json()["periods"]["PRE"]["interpretation"], "Pending Adviser Release")
        self.assertEqual(self.call("GET", "/api/messages/history", 6, params={"teacher_id": 2, "parent_id": 2}).status_code, 200)
        with self.sessions() as db:
            link = db.query(FamilyAccess).filter_by(student_id=3).one()
            self.assertEqual(link.status, "SYNCED")
            self.assertGreaterEqual(link.date_linked, link.requested_at)
            self.assertEqual(db.query(SystemLog).filter_by(action_type="Approved Parent Link").one().details, "Approved Parent Link: Stranger for student Other Class")

    def test_rejection_clears_request_and_relink_requires_new_approval(self):
        self.assertEqual(self.request_link().status_code, 200)
        result = self.action("reject-parent-link", student=3, teacher=3, parent=2)
        self.assertEqual(result.json(), {"success": True, "message": "Parent link request declined."})
        self.assert_parent_denied(6, 3)
        with self.sessions() as db:
            self.assertEqual(db.query(FamilyAccess).filter_by(student_id=3).count(), 0)
            self.assertEqual(db.query(SystemLog).filter_by(action_type="Rejected Parent Link").one().details, "Rejected Parent Link: Stranger for student Other Class")
        self.assertEqual(self.request_link().status_code, 200)
        self.assert_parent_denied(6, 3)

    def test_unlinked_child_relink_is_pending_even_for_original_parent(self):
        self.assertEqual(self.action("unlink-parent").status_code, 200)
        self.assertEqual(self.request_link(user=5, lrn=test_phase2.LRN).status_code, 200)
        self.assert_parent_denied(5, 1)
        self.assertEqual(self.action("approve-parent-link").status_code, 200)
        self.assertEqual(self.call("GET", "/api/students/1", 5).status_code, 200)

    def test_wrong_state_stale_target_and_archived_student_rejected(self):
        for action in ("approve-parent-link", "reject-parent-link"):
            self.assertEqual(self.action(action).status_code, 409)
        self.assertEqual(self.action("unlink-parent", parent=2).status_code, 409)
        self.assertEqual(self.action("unlink-parent", student=999).status_code, 404)
        self.assertEqual(self.request_link().status_code, 200)
        self.assertEqual(self.action("unlink-parent", student=3, teacher=3, parent=2).status_code, 409)
        with self.sessions() as db:
            db.get(Student, 3).is_active = False
            db.commit()
        self.assertEqual(self.action("approve-parent-link", student=3, teacher=3, parent=2).status_code, 409)
        self.assertEqual(self.request_link().status_code, 403)

    def test_concurrent_requests_allow_only_one_parent_account(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda actor: self.request_link(user=actor), (5, 6)))
        self.assertEqual(sorted(response.status_code for response in responses), [200, 400])
        with self.sessions() as db:
            self.assertEqual(db.query(FamilyAccess).filter_by(student_id=3).count(), 1)

    def test_failed_commit_rolls_back_unlink_and_audit(self):
        with self.sessions() as db:
            user = db.get(test_phase2.User, 2)
            with patch.object(db, "commit", side_effect=RuntimeError("Synthetic commit failure")):
                with self.assertRaises(RuntimeError):
                    change_parent_link(db, user, 1, ParentLinkActionRequest(parent_id=1), "unlink")
            self.assertEqual(db.query(FamilyAccess).filter_by(student_id=1, status="SYNCED").count(), 1)
            self.assertEqual(db.query(SystemLog).filter_by(action_type="Unlinked Parent").count(), 0)

    def test_migration_preserves_old_links_and_is_idempotent(self):
        with self.fixture.test_engine.begin() as connection:
            before = list(connection.execute(text("SELECT id, parent_id, student_id, relationship_type, date_linked FROM family_access")))
            connection.execute(text("ALTER TABLE family_access DROP CONSTRAINT ck_family_link_status, DROP COLUMN status, DROP COLUMN requested_at"))
            self.assertTrue(apply_parent_linking(connection, self.fixture.schema))
            self.assertFalse(apply_parent_linking(connection, self.fixture.schema))
            check_parent_linking(connection, self.fixture.schema)
            self.assertEqual(list(connection.execute(text("SELECT id, parent_id, student_id, relationship_type, date_linked FROM family_access"))), before)
            row = connection.execute(text("SELECT status, requested_at, date_linked FROM family_access")).one()
            self.assertEqual(row.status, "SYNCED")
            self.assertEqual(row.requested_at, row.date_linked)

    def test_backup_restore_retains_pending_status_without_granting_access(self):
        self.assertEqual(self.request_link().status_code, 200)
        with self.sessions() as db:
            payload = export_backup(db)
            restore_backup(db, payload)
            self.assertEqual(db.query(FamilyAccess).filter_by(student_id=3).one().status, "PENDING")
        self.assert_parent_denied(6, 3)
