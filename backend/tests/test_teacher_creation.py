"""Teacher provisioning contracts and real HTTP writes in disposable schemas."""
import unittest

from pydantic import ValidationError
from sqlalchemy import inspect

from backend.models import Section, SectionTeacher, Teacher, User
from backend.schemas.auth import RegisterParentRequest, UpdatePasswordRequest
from backend.schemas.teacher import TeacherProvisionRequest
from backend.tests import test_phase2
from backend.utils.security import verify_password


def payload(**changes):
    return {
        "first_name": " Ana-María ", "last_name": " O'Neill ",
        "email": "newteacher@example.com", "password": "temporary", "section_id": 1,
        **changes,
    }


class TeacherCreationSchemaTests(unittest.TestCase):
    def test_optional_employee_id_and_legacy_aliases(self):
        for employee in (None, "", "   ", " EMP-1 "):
            teacher = TeacherProvisionRequest.model_validate(payload(employee_id=employee))
            self.assertEqual(teacher.employee_id, "EMP-1" if employee == " EMP-1 " else None)
        self.assertIsNone(TeacherProvisionRequest.model_validate(payload()).employee_id)
        teacher = TeacherProvisionRequest.model_validate({
            "firstName": " Ana-María ", "lastName": " O'Neill ",
            "email": "alias@example.com", "initial_password": "temporary",
            "employeeId": " ", "sectionId": "1",
        })
        self.assertEqual((teacher.first_name, teacher.last_name, teacher.employee_id, teacher.section_id),
                         ("Ana-María", "O'Neill", None, 1))

    def test_first_name_required_optional_last_name_and_payload_types_stay_validated(self):
        for field in ("first_name", "last_name"):
            for invalid in ("Ana1", "Ana١", "Ana１", None, 123):
                with self.subTest(field=field, invalid=invalid), self.assertRaises(ValidationError):
                    TeacherProvisionRequest.model_validate(payload(**{field: invalid}))
        for invalid in ("", " "):
            with self.assertRaises(ValidationError):
                TeacherProvisionRequest.model_validate(payload(first_name=invalid))
        with self.assertRaises(ValidationError):
            TeacherProvisionRequest.model_validate({k: v for k, v in payload().items() if k != "first_name"})
        for optional in ({"last_name": ""}, {"last_name": " "}):
            self.assertEqual(TeacherProvisionRequest.model_validate(payload(**optional)).last_name, "")
        self.assertEqual(TeacherProvisionRequest.model_validate({k: v for k, v in payload().items() if k != "last_name"}).last_name, "")
        for changes in ({"section_id": True}, {"section_id": 0}, {"employee_id": 123},
                        {"employee_id": "x" * 51}, {"email": "invalid"}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                TeacherProvisionRequest.model_validate(payload(**changes))

    def test_temporary_password_policy_is_isolated_from_personal_passwords(self):
        for password in ("temporary", "Teacher123", "12345678", "Abcdefgh", "é" * 36):
            self.assertEqual(TeacherProvisionRequest.model_validate(payload(password=password)).password, password)
        for password in ("short", "1234567", " " * 8, "é" * 37, 12345678):
            with self.subTest(password=password), self.assertRaises(ValidationError):
                TeacherProvisionRequest.model_validate(payload(password=password))
        with self.assertRaises(ValidationError):
            UpdatePasswordRequest(newPassword="temporary", confirmPassword="temporary")
        with self.assertRaises(ValidationError):
            RegisterParentRequest(email="parent@example.com", firstName="Test", lastName="Parent", password="temporary")


class TeacherCreationApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)

    def test_create_aliases_store_multiple_null_ids_and_require_password_change(self):
        columns = inspect(self.fixture.test_engine).get_columns("teachers", schema=self.fixture.schema)
        self.assertTrue(next(column for column in columns if column["name"] == "employee_id")["nullable"])
        for index, (path, extra) in enumerate((
            ("/api/teachers/", {"employee_id": ""}),
            ("/api/teachers/create", {"employee_id": None}),
            ("/api/chairman/teachers", {}),
            ("/api/teachers/", {"employee_id": "   "}),
        )):
            email = f"newteacher{index}@example.com"
            response = self.fixture.call("POST", path, json=payload(email=email, **extra))
            self.assertEqual(response.status_code, 201, response.text)
            created = response.json()
            with self.fixture.sessions() as db:
                teacher = db.get(Teacher, created["teacher_id"])
                self.assertEqual((teacher.first_name, teacher.last_name, teacher.employee_id), ("Ana-María", "O'Neill", None))
                self.assertEqual(teacher.user_id, created["user_id"])
                self.assertTrue(teacher.user.is_first_login)
                self.assertTrue(verify_password("temporary", teacher.user.password_hash))
                self.assertEqual(db.query(SectionTeacher).filter_by(teacher_id=teacher.teacher_id, status="Active").one().section_id, 1)
            login = self.fixture.client.post("/api/auth/login", json={"email": email, "password": "temporary"})
            self.assertEqual(login.status_code, 200, login.text)
            self.assertTrue(login.json()["requiresPasswordChange"])

    def test_invalid_input_and_unauthorized_requests_do_not_create_accounts(self):
        with self.fixture.sessions() as db:
            before = db.query(User).count()
        for changes in ({"first_name": "Ana1"}, {"last_name": "Cruz١"}, {"password": "short"}):
            response = self.fixture.call("POST", "/api/teachers/", json=payload(**changes))
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.fixture.call("POST", "/api/teachers/", 2, json=payload()).status_code, 403)
        with self.fixture.sessions() as db:
            self.assertEqual(db.query(User).count(), before)

    def test_nonempty_employee_id_remains_unique(self):
        first = self.fixture.call("POST", "/api/teachers/", json=payload(employee_id=" EMP-1 "))
        self.assertEqual(first.status_code, 201, first.text)
        duplicate = self.fixture.call("POST", "/api/teachers/", json=payload(email="duplicate@example.com", employee_id="EMP-1"))
        self.assertEqual(duplicate.status_code, 400, duplicate.text)
        with self.fixture.sessions() as db:
            self.assertIsNone(db.query(User).filter_by(email="duplicate@example.com").first())

    def test_email_is_username_and_takeover_archive_restore_release_sections(self):
        self.assertEqual(self.fixture.evaluate().status_code, 200)
        created = self.fixture.call("POST", "/api/teachers/", json=payload(last_name="", username="ignored"))
        self.assertEqual(created.status_code, 201, created.text)
        incoming = created.json()
        with self.fixture.sessions() as db:
            self.assertEqual(db.get(User, incoming["user_id"]).username, "newteacher@example.com")
            self.assertFalse(db.get(User, 2).is_active)
            self.assertIsNone(db.get(Teacher, 1).class_name)
            self.assertEqual(db.get(Section, 1).adviser_teacher_id, incoming["teacher_id"])
        for path in ("/api/teachers/active", "/api/teachers/", "/api/chairman/teachers"):
            rows = self.fixture.call("GET", path).json()
            self.assertEqual(next(row for row in rows if row["teacher_id"] == incoming["teacher_id"])["class_name"], "Test A")
            self.assertFalse(any(row["teacher_id"] == 1 for row in rows))
            self.assertIsNone(next(row for row in rows if row["teacher_id"] == 3)["section_id"])
        archived = self.fixture.call("GET", "/api/teachers/archived").json()
        self.assertIsNone(next(row for row in archived if row["teacher_id"] == 1)["class_name"])
        changed = self.fixture.call("PUT", f'/api/teachers/{incoming["user_id"]}', json={"email": "changed@example.com", "username": ""})
        self.assertEqual(changed.status_code, 200, changed.text)
        with self.fixture.sessions() as db:
            self.assertEqual(db.get(User, incoming["user_id"]).username, "changed@example.com")
        for action in ("archive", "unarchive"):
            result = self.fixture.call("PUT", f'/api/teachers/{incoming["user_id"]}/{action}')
            self.assertEqual(result.status_code, 200, result.text)
        active = self.fixture.call("GET", "/api/teachers/active").json()
        restored = next(row for row in active if row["teacher_id"] == incoming["teacher_id"])
        self.assertIsNone(restored["section_id"])
        self.assertIsNone(restored["class_name"])
        with self.fixture.sessions() as db:
            self.assertIsNone(db.get(Section, 1).adviser_teacher_id)

    def test_failed_update_rolls_back_profile_and_section_handover(self):
        result = self.fixture.call("PUT", "/api/teachers/3", json={"employee_id": "USED"})
        self.assertEqual(result.status_code, 200, result.text)
        result = self.fixture.call("PUT", "/api/teachers/4", json={"first_name": "Changed", "employee_id": "USED", "section_id": 1})
        self.assertEqual(result.status_code, 400, result.text)
        with self.fixture.sessions() as db:
            self.assertEqual(db.get(Section, 1).adviser_teacher_id, 1)
            self.assertTrue(db.get(User, 2).is_active)
            self.assertEqual(db.get(Teacher, 3).first_name, "Test")
            self.assertEqual(db.query(SectionTeacher).filter_by(section_id=1, status="Active").one().teacher_id, 1)

    def test_directory_shows_new_assignment_instead_of_older_active_section(self):
        for section_id in (2, 1, 2):
            result = self.fixture.call("PUT", "/api/teachers/2", json={"section_id": section_id})
            self.assertEqual(result.status_code, 200, result.text)
            for path in ("/api/teachers/active", "/api/chairman/teachers"):
                rows = self.fixture.call("GET", path).json()
                row = next(row for row in rows if row["user_id"] == 2)
                self.assertEqual(row["section_id"], section_id)
        # A cached label alone cannot assign a teacher to a section.
        with self.fixture.sessions() as db:
            db.get(Teacher, 3).class_name = "Test A"
            db.commit()
        rows = self.fixture.call("GET", "/api/teachers/active").json()
        self.assertIsNone(next(row for row in rows if row["teacher_id"] == 3)["class_name"])
