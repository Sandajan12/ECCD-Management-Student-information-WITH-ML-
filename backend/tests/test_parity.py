"""Legacy/client contract regressions using the existing isolated DB fixture."""
from datetime import date
import re
import unittest

from sqlalchemy import event

from backend.main import api
from backend.models import FamilyAccess, Message, Parent, SectionTeacher, Student, StudentEccdEvaluation, SystemLog, Teacher, User
from backend.models.message import SenderRole
from backend.routes.messages import unread
from backend.tests import test_phase2
from backend.utils.lrn import hash_lrn
from backend.utils.teachers import assign_teacher


class ParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.call = self.fixture.call
        self.sessions = self.fixture.sessions

    def tearDown(self):
        self.fixture.tearDown()

    def test_all_legacy_functional_routes_registered(self):
        # Portable client contract: independent of removed historical source files.
        routes = {
            "auth": {
                "post": ["/login", "/login-step1", "/verify-otp", "/register-parent", "/send-otp", "/request-otp", "/logout"],
                "put": ["/update-password"],
            },
            "teachers": {
                "get": ["/", "/active", "/archived", "/dashboard-filters", "/dashboard-stats", "/dashboard-pie", "/download/{lrn}", "/download-all", "/access-controls"],
                "post": ["/create", "/import-students", "/change-password-request", "/change-password-verify"],
                "put": ["/update/{user_id}", "/archive/{user_id}", "/unarchive/{user_id}", "/access-controls"],
                "delete": ["/delete/{user_id}"],
            },
            "students": {
                "get": ["/all", "/archived", "/section/{section_id}", "/my-child", "/{identifier}"],
                "post": ["/create", "/link"],
                "put": ["/archive-all", "/update/{identifier}", "/archive/{identifier}", "/unarchive/{identifier}"],
                "delete": ["/delete/{identifier}"],
            },
            "messages": {
                "get": ["/contacts", "/history", "/unread-count"],
                "post": ["/send", "/notify-student", "/link-lrn"],
                "put": ["/mark-read"],
            },
            "logs": {"get": ["/"]},
            "settings": {
                "get": ["/"], "put": ["/update"],
                "post": ["/upload-background", "/rollover", "/undo-rollover", "/revert-school-year"],
            },
            "eccd": {
                "get": ["/students", "/domains-progress", "/assessment/{lrn}", "/student/{student_lrn}", "/section/{section_id}/summary", "/section/{section_id}/export", "/export-all", "/parent/assessment/{student_lrn}", "/parent/domains-progress/{student_lrn}", "/parent/dashboard-stats/{student_lrn}", "/parent/progress/{student_lrn}"],
                "post": ["/evaluate", "/parent/evaluate"],
            },
            "chairman": {
                "get": ["/students", "/sections", "/teachers", "/dashboard-filters", "/dashboard-stats", "/dashboard-pie", "/export-eccd", "/sections/{section_id}/export-summary", "/eccd-data", "/backup/export"],
                "post": ["/sections", "/teachers", "/verify-password", "/eccd-questions", "/backup/restore", "/rollover-year", "/undo-rollover"],
                "put": ["/account", "/sections/{section_id}/assign", "/teachers/{teacher_id}/permissions", "/students/transfer", "/eccd-questions/{question_id}", "/eccd-questions/{question_id}/home-based"],
                "delete": ["/sections/{section_id}", "/eccd-questions/{question_id}"],
            },
        }
        def normalize(path):
            return re.sub(r"\{[^}]+\}|:[A-Za-z_][A-Za-z_0-9]*", "{}", path).rstrip("/")
        actual = {(method, normalize(path)) for path, operations in api.openapi()["paths"].items() for method in operations}
        for prefix, methods in routes.items():
            for method, suffixes in methods.items():
                for suffix in suffixes:
                    with self.subTest(method=method, path=suffix, prefix=prefix):
                        self.assertIn((method, normalize(f"/api/{prefix}{suffix}")), actual)

    def test_teacher_filters_stats_and_pie_use_assigned_sections_and_years(self):
        with self.sessions() as db:
            assign_teacher(db, db.get(User, 1), 2, 1)
            db.add(Student(student_id=4, lrn_number="001234560004", first_name="Earlier", last_name="Active", section_id=1, school_year="2025-2026", is_active=True))
            db.get(Teacher, 1).allow_eccd_question_management = True
            db.commit()
        filters = self.call("GET", "/api/teachers/dashboard-filters", 2).json()
        self.assertEqual(filters["sections"], ["Test B"])
        self.assertEqual(filters["schoolYears"], ["2026-2027"])
        progress = self.call("GET", "/api/eccd/domains-progress", 2)
        self.assertEqual(progress.status_code, 200, progress.text)
        self.assertTrue(all(question["domain_id"] == domain["domain_id"] and "is_home_based" in question for domain in progress.json() for question in domain["questions"]))
        for section, year, count in [("Test A", "All", "0"), ("Test B", "All", "1"), ("Test A", "2025-2026", "0"), ("Test A", "2026-2027", "0"), ("Not Assigned", "All", "0")]:
            response = self.call("GET", "/api/teachers/dashboard-stats", 2, params={"section": section, "schoolYear": year})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["stats"]["totalStudents"], count)
            self.assertTrue(response.json()["allow_eccd_question_management"])
        self.assertEqual(self.fixture.evaluate().status_code, 403)
        own = self.call("GET", "/api/teachers/dashboard-pie", 2, params={"section": "Test A", "schoolYear": "2026-2027"}).json()
        other = self.call("GET", "/api/teachers/dashboard-pie", 2, params={"section": "Test B"}).json()
        self.assertEqual(sum(row["value"] for row in own), 0)
        self.assertEqual(sum(row["value"] for row in other), 0)
        # The configured year remains selectable when this teacher has no records.
        with self.sessions() as db:
            db.query(Student).filter(Student.section_id.in_([1, 2])).delete(synchronize_session=False)
            db.commit()
        self.assertEqual(self.call("GET", "/api/teachers/dashboard-filters", 2).json()["schoolYears"], ["2026-2027"])

    def test_teacher_priority_uses_latest_answer_per_question(self):
        with self.sessions() as db:
            db.add_all([
                StudentEccdEvaluation(student_id=1, teacher_id=1, question_id=1, testing_period="PRE", answer="DI-KAYA", evaluation_date=date(2026, 8, 10)),
                StudentEccdEvaluation(student_id=1, teacher_id=1, question_id=14, testing_period="POST", answer="KAYA", evaluation_date=date(2026, 10, 10)),
            ])
            db.commit()
        response = self.call("GET", "/api/teachers/dashboard-stats", 2)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["stats"]["priorityDomain"], "Gross Motor")

    def test_legacy_handover_field_preserves_scores_and_assignment_history(self):
        self.assertEqual(self.fixture.evaluate().status_code, 200)
        with self.sessions() as db:
            original = list(db.execute(StudentEccdEvaluation.__table__.select()))
        result = self.call("PUT", "/api/chairman/sections/1/assign", json={"adviser_teacher_id": 2})
        self.assertEqual(result.status_code, 200, result.text)
        with self.sessions() as db:
            self.assertFalse(db.get(User, 2).is_active)
            self.assertTrue(db.get(User, 3).is_active)
            self.assertEqual(db.query(SectionTeacher).filter_by(section_id=1, teacher_id=3, role="Primary Adviser", status="Inactive").count(), 1)
            self.assertEqual(list(db.execute(StudentEccdEvaluation.__table__.select())), original)
        self.assertEqual(self.call("PUT", "/api/chairman/sections/1/assign", json={"adviser_teacher_id": None}).status_code, 200)
        with self.sessions() as db:
            self.assertEqual(db.query(SectionTeacher).filter_by(section_id=1, role="Primary Adviser", status="Active").count(), 0)

    def test_teacher_update_accepts_section_id(self):
        invalid = self.call("PUT", "/api/teachers/update/4", json={"section_id": 999999, "first_name": "Must Roll Back"})
        self.assertEqual(invalid.status_code, 404)
        with self.sessions() as db:
            self.assertEqual(db.get(Teacher, 3).first_name, "Test")
            credentials = db.get(User, 4).password_hash
        result = self.call("PUT", "/api/teachers/update/4", json={"section_id": 2})
        self.assertEqual(result.status_code, 200, result.text)
        with self.sessions() as db:
            self.assertEqual(db.query(SectionTeacher).filter_by(section_id=2, teacher_id=3, role="Primary Adviser", status="Active").count(), 1)
            self.assertFalse(db.get(User, 3).is_active)
            self.assertEqual(db.get(User, 4).password_hash, credentials)

    def test_teacher_archive_detaches_assignments_without_restoring_ownership(self):
        self.assertEqual(self.fixture.evaluate().status_code, 200)
        with self.sessions() as db:
            assign_teacher(db, db.get(User, 1), 2, 1)
            db.commit()
            original = list(db.execute(StudentEccdEvaluation.__table__.select()))
        self.assertEqual(self.call("PUT", "/api/teachers/archive/2").status_code, 200)
        self.assertEqual(self.call("PUT", "/api/teachers/unarchive/2").status_code, 200)
        with self.sessions() as db:
            self.assertTrue(db.get(User, 2).is_active)
            self.assertIsNone(db.get(Teacher, 1).class_name)
            self.assertEqual(db.query(SectionTeacher).filter_by(teacher_id=1, status="Active").count(), 0)
            self.assertIsNone(db.get(test_phase2.Section, 1).adviser_teacher_id)
            self.assertEqual(list(db.execute(StudentEccdEvaluation.__table__.select())), original)
        login = self.fixture.login().json()
        response = self.fixture.client.get("/api/teachers/dashboard-filters", headers={"Authorization": f"Bearer {login['token']}"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["sections"], [])
        self.assertTrue(all(section["adviser_teacher_id"] != 1 for section in self.call("GET", "/api/chairman/sections").json()))

    def test_parent_link_and_guardian_fields_and_edit_lock(self):
        with self.sessions() as db:
            db.get(Parent, 1).relationship_type = "Father"
            db.commit()
        result = self.call("POST", "/api/parents/children/link", 5, json={"lrn_number": "001111111111"})
        self.assertEqual(result.status_code, 200, result.text)
        with self.sessions() as db:
            self.assertEqual(db.query(FamilyAccess).filter_by(student_id=3, parent_id=1).one().relationship_type, "Father")
        payload = {"legal_guardian_name": "Test Guardian", "legal_guardian_age": "32", "legal_guardian_occ": "Teacher", "legal_guardian_educ": "College"}
        result = self.call("PUT", "/api/parents/children/1", 5, json=payload)
        self.assertEqual(result.status_code, 200, result.text)
        profile = self.call("GET", "/api/students/1", 5).json()
        for key, value in payload.items():
            self.assertEqual(str(profile[key]), value)
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_edit_student_info = False
            db.get(Teacher, 1).allow_parent_view_student_info = False
            db.commit()
        self.assertEqual(self.call("PUT", "/api/parents/children/1", 5, json={"legal_guardian_name": "Locked"}).status_code, 403)
        self.assertIsNone(self.call("GET", "/api/students/1", 5).json()["legal_guardian_name"])

    def test_staff_lrn_correction_retains_student_links_and_masking(self):
        self.assertEqual(self.fixture.evaluate().status_code, 200)
        replacement = "000000007654"
        result = self.call("PUT", "/api/students/update/1", 2, json={"lrn_number": replacement})
        self.assertEqual(result.status_code, 200, result.text)
        with self.sessions() as db:
            self.assertEqual(db.get(Student, 1).lrn_search_hash, hash_lrn(replacement))
            self.assertEqual(db.query(FamilyAccess).filter_by(student_id=1).count(), 1)
            self.assertEqual(db.query(StudentEccdEvaluation).filter_by(student_id=1).count(), 1)
        profile = self.call("GET", f"/api/students/{replacement}", 2)
        self.assertEqual(profile.status_code, 200)
        self.assertNotIn(replacement, profile.text)
        self.assertEqual(profile.json()["student_id"], 1)
        self.assertTrue(profile.json()["masked_lrn"].endswith("7654"))
        duplicate = self.call("PUT", "/api/students/1", 2, json={"lrn_number": "001111111111", "first_name": "Must Roll Back"})
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(self.call("GET", "/api/students/1", 2).json()["first_name"], "Test")
        self.assertEqual(self.call("PUT", "/api/students/1", 5, json={"lrn_number": "000000001234"}).status_code, 403)

    def test_parent_period_summary_and_legacy_cards_never_leak_locks(self):
        for period, when in [("PRE", "2026-08-10"), ("MID", "2026-09-10"), ("POST", "2026-10-10")]:
            self.assertEqual(self.fixture.evaluate(period, when).status_code, 200)
        locked = self.call("GET", "/api/eccd/parent/dashboard-stats/1", 5)
        self.assertEqual(locked.status_code, 200, locked.text)
        for card in locked.json()["domainCards"]:
            self.assertIsNone(card["progress"])
            self.assertEqual(card["scoreText"], "Pending Adviser Release")
        summary = self.call("GET", "/api/parents/children/1/eccd-summary", 5)
        self.assertEqual(summary.status_code, 200, summary.text)
        for period in summary.json()["periods"].values():
            self.assertFalse(period["is_published"])
            for key in ("evaluation_date", "decimal_age", "standard_score", "sum_of_scaled_scores"):
                self.assertIsNone(period[key])
        with self.sessions() as db:
            teacher = db.get(Teacher, 1)
            teacher.allow_parent_view_eccd_pre = teacher.allow_parent_view_eccd_mid = teacher.allow_parent_view_eccd_post = True
            db.commit()
        summary = self.call("GET", "/api/parents/children/1/eccd-summary", 5).json()
        assessment = self.call("GET", "/api/eccd/parent/assessment/1", 5).json()
        for period in ("PRE", "MID", "POST"):
            self.assertEqual(summary["periods"][period]["standard_score"], assessment["summary"][period]["standardScore"])
            self.assertEqual(summary["periods"][period]["interpretation"], assessment["summary"][period]["interpretation"])
        dashboard = self.call("GET", "/api/eccd/parent/dashboard-stats/1", 5).json()
        self.assertTrue(dashboard["is_published"])
        self.assertTrue(dashboard["assessmentMastered"])
        self.assertTrue(any(card["progress"] == 100 for card in dashboard["domainCards"]))
        progress = self.call("GET", "/api/eccd/parent/domains-progress/1", 5).json()
        fields = ("question_id", "domain_id", "question_text", "sequence_order", "is_home_based")
        self.assertEqual(
            [(domain["domain_id"], [tuple(question[field] for field in fields) for question in domain["questions"]]) for domain in progress],
            [(domain["domain_id"], [tuple(question[field] for field in fields) for question in domain["questions"]]) for domain in assessment["domains"]],
        )
        self.assertEqual(self.call("GET", "/api/parents/children/3/eccd-summary", 5).status_code, 403)

    def test_audit_aliases_full_history_and_teacher_names(self):
        with self.sessions() as db:
            db.add_all(SystemLog(user_id=2, action_type="PARITY", details=f"Synthetic {index}") for index in range(101))
            db.add(SystemLog(user_id=None, action_type="SYSTEM", details="Synthetic system action"))
            db.commit()
        current = self.call("GET", "/api/analytics/logs").json()
        self.assertEqual(len(current), 102)
        for path in ("/api/logs", "/api/logs/"):
            response = self.call("GET", path)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), current)
            self.assertEqual(self.call("GET", path, 2).status_code, 403)
        teacher = next(row for row in current if row["action"] == "PARITY")
        self.assertEqual(teacher["id"], teacher["log_id"])
        self.assertEqual(teacher["action"], teacher["action_type"])
        self.assertEqual(teacher["teacher_name"], "Test Adviser")
        self.assertEqual(teacher["performed_by"], "adviser")

    def test_unread_one_count_handles_siblings_accounts_and_transfers(self):
        with self.sessions() as db:
            db.add(FamilyAccess(parent_id=1, student_id=3, relationship_type="Mother"))
            assign_teacher(db, db.get(User, 1), 2, 1)
            db.add_all(Message(parent_id=1, teacher_id=1, sender_role=SenderRole.PARENT, body="Synthetic unread") for _ in range(25))
            db.add_all([
                Message(parent_id=1, teacher_id=1, sender_role=SenderRole.TEACHER, body="Reply"),
                Message(parent_id=1, teacher_id=1, sender_role=SenderRole.PARENT, body="Read", is_read=True),
                Message(parent_id=1, teacher_id=1, sender_role=SenderRole.PARENT, body="Archived", is_archived=True),
                Message(parent_id=2, teacher_id=1, sender_role=SenderRole.PARENT, body="Unlinked"),
            ])
            db.commit()
            user = db.get(User, 2)
            statements = []
            def record(connection, cursor, statement, parameters, context, executemany):
                statements.append(statement)
            event.listen(self.fixture.test_engine, "before_cursor_execute", record)
            try:
                self.assertEqual(unread(db, user), {"unreadCount": 25})
            finally:
                event.remove(self.fixture.test_engine, "before_cursor_execute", record)
            self.assertEqual(len(statements), 1)
            self.assertIn("count(", statements[0].lower())
            self.assertNotIn("messages.body", statements[0].lower())
        for path in ("/api/messages/unread-count", "/api/messages/unread"):
            self.assertEqual(self.call("GET", path, 2).json(), {"unreadCount": 25})
            self.assertEqual(self.call("GET", path, 5).json(), {"unreadCount": 1})
            self.assertEqual(self.call("GET", path, 6).json(), {"unreadCount": 0})
        with self.sessions() as db:
            db.get(User, 5).is_active = False
            db.commit()
        self.assertEqual(self.call("GET", "/api/messages/unread-count", 2).json(), {"unreadCount": 0})
        with self.sessions() as db:
            db.get(User, 5).is_active = True
            db.get(Student, 1).is_active = False
            db.get(Student, 3).is_active = False
            db.commit()
        self.assertEqual(self.call("GET", "/api/messages/unread-count", 2).json(), {"unreadCount": 0})
        self.assertEqual(self.call("GET", "/api/messages/unread-count", 5).json(), {"unreadCount": 0})
