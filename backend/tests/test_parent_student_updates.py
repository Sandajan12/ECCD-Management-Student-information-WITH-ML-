"""Partial guardian semantics and parent-save -> fresh staff-read regressions."""
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from backend.models import FamilyAccess, Parent, Student, SystemLog, Teacher
from backend.routes import students
from backend.schemas.student import StudentUpdate
from backend.utils.students import upsert_guardian


class GuardianUpdateUnitTests(unittest.TestCase):
    """Exercise merge/authorization and rollback without a database connection."""

    def setUp(self):
        self.db = Mock()
        self.parent = Parent(parent_id=1, fullname="Test Parent", age=35,
                             occupation="Teacher", educational_attainment="College")
        self.student = Student(student_id=1)
        self.user = SimpleNamespace(role=SimpleNamespace(value="user"))
        query = self.db.query.return_value
        query.join.return_value.filter.return_value.with_for_update.return_value.first.return_value = self.parent
        query.join.return_value.filter.return_value.distinct.return_value.all.return_value = [self.student, Student(student_id=2)]

    def update(self, **fields):
        return upsert_guardian(self.db, self.student, "Mother", fields.get("name"), fields.get("age"),
                               fields.get("occ"), fields.get("educ"), user=self.user, supplied_fields=set(fields))

    def test_partial_changes_merge_and_optional_nulls_clear(self):
        with patch("backend.utils.students.authorize_student") as authorize:
            self.update(age=36)
            self.assertEqual((self.parent.fullname, self.parent.age, self.parent.occupation,
                              self.parent.educational_attainment), ("Test Parent", 36, "Teacher", "College"))
            self.assertEqual(authorize.call_count, 2)
            self.update(name="Renamed Parent")
            self.assertEqual((self.parent.age, self.parent.occupation), (36, "Teacher"))
            self.update(age=None, occ=None, educ=None)
            self.assertEqual((self.parent.age, self.parent.occupation, self.parent.educational_attainment), (None, None, None))

    def test_omitted_and_unchanged_guardians_skip_sibling_authorization(self):
        with patch("backend.utils.students.authorize_student") as authorize:
            self.update()
            self.db.query.assert_not_called()
            self.update(name=" Test Parent ")
            self.update(age=35)
            authorize.assert_not_called()

    def test_actual_change_keeps_m6_rejection_and_does_not_mutate_guardian(self):
        with patch("backend.utils.students.authorize_student", side_effect=HTTPException(403, "Locked sibling")):
            with self.assertRaises(HTTPException) as caught:
                self.update(age=36)
            self.assertEqual(caught.exception.status_code, 403)
            self.assertEqual(self.parent.age, 35)

    def test_existing_name_cannot_be_cleared(self):
        for name in (None, "", " "):
            with self.subTest(name=name), self.assertRaises(HTTPException) as caught:
                self.update(name=name)
            self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(self.parent.fullname, "Test Parent")

    def test_new_guardian_requires_name_but_empty_group_is_noop(self):
        self.db.query.return_value.join.return_value.filter.return_value.with_for_update.return_value.first.return_value = None
        self.update(name=None, age=None, occ="", educ=None)
        self.db.add.assert_not_called()
        with self.assertRaises(HTTPException) as caught:
            self.update(age=35)
        self.assertEqual(caught.exception.status_code, 422)
        self.update(name="New Father", age=35)
        self.assertEqual(self.db.add.call_count, 2)
        self.assertIsInstance(self.db.add.call_args.args[0], FamilyAccess)

    def test_workbook_complete_record_contract_is_preserved(self):
        with patch("backend.utils.students.authorize_student"):
            upsert_guardian(self.db, self.student, "Mother", "Imported Parent", None, None, None, user=self.user)
        self.assertEqual((self.parent.fullname, self.parent.age, self.parent.occupation), ("Imported Parent", None, None))
        self.db.reset_mock()
        upsert_guardian(self.db, self.student, "Mother", "", 35, None, None, user=self.user)
        self.db.query.assert_not_called()

    def test_handler_rolls_back_guardian_and_unexpected_errors(self):
        for failure in (HTTPException(403, "Locked sibling"), RuntimeError("Injected failure")):
            with self.subTest(failure=failure), patch.object(students, "resolve_student", return_value=self.student), \
                    patch.object(students, "authorize_student"), patch.object(students, "student_change_snapshot", return_value={}), \
                    patch.object(students, "upsert_guardian", side_effect=failure):
                self.db.reset_mock()
                with self.assertRaises(type(failure)):
                    students.update("1", StudentUpdate(address="Must roll back", mother_age=36), self.db, self.user)
                self.db.rollback.assert_called_once()
                self.db.commit.assert_not_called()


class ParentStudentPersistenceTests(unittest.TestCase):
    """The shared fixture creates/drops unique PostgreSQL schemas, never school rows."""

    @classmethod
    def setUpClass(cls):
        from backend.tests.test_phase2 import BackendTests
        BackendTests.setUpClass()

    def setUp(self):
        from backend.tests.test_phase2 import BackendTests
        self.fixture = BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.sessions, self.call = self.fixture.sessions, self.fixture.call
        with self.sessions() as db:
            parent = db.get(Parent, 1)
            parent.age, parent.occupation, parent.educational_attainment = 35, "Teacher", "College"
            db.commit()

    def save(self, data, path="/api/parents/children/1", status=200):
        response = self.call("PUT", path, 5, json=data)
        self.assertEqual(response.status_code, status, response.text)
        return response

    def test_parent_save_commits_and_immediate_teacher_reads_see_values(self):
        payload = dict(address="Updated address", emergency_contact="09123456789", handedness="Left",
                       num_of_siblings=2, birth_order="First", father_name="New Father", father_age=40,
                       father_occ="Farmer", father_educ="College", mother_name="Updated Mother",
                       mother_age=36, mother_occ="Nurse", mother_educ="College")
        self.save(payload)
        with self.sessions() as db:
            student, mother = db.get(Student, 1), db.get(Parent, 1)
            self.assertEqual((student.address, mother.age, mother.fullname), ("Updated address", 36, "Updated Mother"))
            self.assertEqual(mother.user_id, 5)
            self.assertEqual(db.query(FamilyAccess).filter_by(student_id=1).count(), 2)
        for path in ("/api/students/1", "/api/students/", "/api/students/section/1", "/api/eccd/students"):
            with self.subTest(path=path):
                response = self.call("GET", path, 2)
                self.assertEqual(response.status_code, 200, response.text)
                data = response.json()
                record = data if isinstance(data, dict) else next(row for row in data if row["student_id"] == 1)
                for field in ("address", "emergency_contact", "handedness", "num_of_siblings", "birth_order"):
                    self.assertEqual(record[field], payload[field])
                mother = next(parent for parent in record["parents"] if parent["relationship"] == "Mother")
                self.assertEqual((mother["fullname"], mother["age"], mother["occupation"]), ("Updated Mother", 36, "Nurse"))
                if path == "/api/students/1":
                    for field, value in payload.items():
                        self.assertEqual(record[field], value)

    def test_partial_and_explicit_clear_semantics_through_all_aliases(self):
        for path in ("/api/parents/children/1", "/api/students/1", "/api/students/update/1"):
            with self.subTest(path=path):
                self.save({"mother_age": 36}, path)
                self.save({"mother_name": "Renamed Mother"}, path)
                with self.sessions() as db:
                    mother = db.get(Parent, 1)
                    self.assertEqual((mother.age, mother.occupation, mother.educational_attainment), (36, "Teacher", "College"))
                self.save({"mother_age": None, "mother_occ": None, "mother_educ": None}, path)
                with self.sessions() as db:
                    mother = db.get(Parent, 1)
                    self.assertEqual((mother.age, mother.occupation, mother.educational_attainment), (None, None, None))
                    mother.occupation, mother.educational_attainment = "Teacher", "College"
                    db.commit()

    def test_invalid_guardian_name_rolls_back_student_guardian_and_audit(self):
        for fields in ({"mother_name": None}, {"mother_name": " "}, {"father_age": 40}):
            self.save({"address": "Must roll back", **fields}, status=422)
        with self.sessions() as db:
            self.assertIsNone(db.get(Student, 1).address)
            self.assertEqual(db.get(Parent, 1).fullname, "Test Parent")
            self.assertEqual(db.query(Parent).count(), 2)
            self.assertEqual(db.query(SystemLog).filter_by(action_type="Updated Student Info").count(), 0)

    def test_locked_shared_guardian_allows_unchanged_or_omitted_fields_only(self):
        with self.sessions() as db:
            db.add(FamilyAccess(parent_id=1, student_id=3, relationship_type="Mother"))
            db.get(Teacher, 2).allow_parent_edit_student_info = False
            db.commit()
        for path in ("/api/parents/children/1", "/api/students/1", "/api/students/update/1"):
            self.save({"address": "Allowed", "mother_name": "Test Parent", "mother_age": 35}, path)
            self.save({"address": "Still allowed"}, path)
            self.save({"address": "Must roll back", "mother_age": 36}, path, 403)
        with self.sessions() as db:
            self.assertEqual((db.get(Student, 1).address, db.get(Parent, 1).age), ("Still allowed", 35))
            self.assertEqual(db.get(Parent, 1).user_id, 5)
            self.assertEqual(db.query(FamilyAccess).filter_by(parent_id=1).count(), 2)

    def test_pending_and_archived_siblings_remain_protected(self):
        for status, active in (("PENDING", True), ("SYNCED", False)):
            with self.subTest(status=status, active=active):
                with self.sessions() as db:
                    link = db.query(FamilyAccess).filter_by(parent_id=1, student_id=3).first()
                    if link:
                        link.status = status
                    else:
                        db.add(FamilyAccess(parent_id=1, student_id=3, relationship_type="Mother", status=status))
                    db.get(Student, 3).is_active = active
                    db.get(Teacher, 2).allow_parent_edit_student_info = False
                    db.commit()
                self.save({"mother_occ": "Changed"}, status=403)

    def test_shared_update_succeeds_when_all_children_are_authorized(self):
        with self.sessions() as db:
            db.add(FamilyAccess(parent_id=1, student_id=3, relationship_type="Mother"))
            db.get(Teacher, 2).allow_parent_edit_student_info = True
            db.commit()
        self.save({"mother_age": 36})
        with self.sessions() as db:
            self.assertEqual(db.get(Parent, 1).age, 36)
            self.assertEqual(db.query(FamilyAccess).filter_by(parent_id=1).count(), 2)

    def test_failed_commit_rolls_back_all_changes(self):
        from sqlalchemy.orm import Session
        with patch.object(Session, "commit", side_effect=RuntimeError("Injected commit failure")):
            with self.assertRaisesRegex(RuntimeError, "Injected commit failure"):
                self.call("PUT", "/api/parents/children/1", 5, json={"address": "Must roll back", "mother_age": 36})
        with self.sessions() as db:
            self.assertIsNone(db.get(Student, 1).address)
            self.assertEqual(db.get(Parent, 1).age, 35)
            self.assertEqual(db.query(SystemLog).filter_by(action_type="Updated Student Info").count(), 0)


if __name__ == "__main__":
    unittest.main()
