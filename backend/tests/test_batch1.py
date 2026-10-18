"""Batch 1 regressions: pure validation and disposable PostgreSQL/HTTP checks."""
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
import unittest
from unittest.mock import patch

import openpyxl
from openpyxl.utils.datetime import CALENDAR_WINDOWS_1900
from jose import jwt
from pydantic import TypeAdapter, ValidationError

from backend.config.settings import settings
from backend.migrations.parity_batch1 import apply_batch1, check_batch1
from backend.models import EccdDomain, EccdQuestion, FamilyAccess, Parent, SectionTeacher, Student, StudentEccdEvaluation, SystemLog, Teacher, User, UserTrustedDevice
from backend.models.email_verification import OtpPurpose
from backend.schemas.auth import LoginRequest, LogoutRequest
from backend.schemas.common import Name
from backend.schemas.parent import ParentChildUpdateRequest, ParentUpdate
from backend.schemas.section import SectionCreate
from backend.schemas.student import EnrollmentRequest, StudentUpdate
from backend.schemas.teacher import TeacherProvisionRequest, TeacherUpdate
from backend.tests import test_phase2
from backend.utils.authentication import digest, issue_challenge
from backend.utils.eccd_scorer import calculate_scores
from backend.utils.excel import parse_date, student_workbook, workbook_bytes
from backend.utils.lrn import hash_lrn


class Batch1ValidationTests(unittest.TestCase):
    def test_unicode_names_and_invalid_names_across_person_requests(self):
        adapter = TypeAdapter(Name)
        for name in ("José", "Jose\u0301", "O'Connor", "Anne-Marie", "Ma. Ana"):
            self.assertEqual(adapter.validate_python(f" {name} "), name)
        for name in ("Alex2", "---", "...", "123", "Alex@", "Alex_", "Alex２"):
            for schema, payload in (
                (StudentUpdate, {"first_name": name}),
                (StudentUpdate, {"legal_guardian_name": name}),
                (TeacherUpdate, {"firstName": name}),
                (ParentUpdate, {"fullname": name}),
                (ParentChildUpdateRequest, {"father_name": name}),
                (EnrollmentRequest, {"first_name": name, "last_name": "Child", "lrn_number": test_phase2.LRN, "date_of_birth": "2021-01-01", "gender": "female"}),
            ):
                with self.subTest(schema=schema.__name__, name=name), self.assertRaises(ValidationError):
                    schema.model_validate(payload)
        self.assertEqual(StudentUpdate(middle_name="").middle_name, "")

    def test_contact_aliases_and_lowercase_enums(self):
        for schema in (StudentUpdate, ParentChildUpdateRequest):
            for alias in ("emergency_contact", "emergencyContactNumber", "emergency_contact_number", "guardian_name"):
                self.assertEqual(schema.model_validate({alias: "09123456789"}).emergency_contact, "09123456789")
                for phone in ("08123456789", "0912345678", "091234567890", "09abcdefghj", 9123456789):
                    with self.subTest(schema=schema.__name__, alias=alias, phone=phone), self.assertRaises(ValidationError):
                        schema.model_validate({alias: phone})
                self.assertEqual(schema.model_validate({alias: ""}).emergency_contact, "")
        update = StudentUpdate(gender=" female ", handedness="left")
        self.assertEqual(update.gender, "Female")
        self.assertEqual(update.handedness, "Left")
        self.assertEqual(ParentChildUpdateRequest(handedness="right").handedness, "Right")

    def test_teacher_required_fields_aliases_and_normalization(self):
        payload = {"email": " teacher@example.com ", "password": test_phase2.PASSWORD, "firstName": " Ada ", "lastName": " Cruz ", "employeeId": " EMP-1 ", "sectionId": 1, "username": " teacher "}
        teacher = TeacherProvisionRequest.model_validate(payload)
        self.assertEqual((teacher.first_name, teacher.last_name, teacher.employee_id, teacher.username), ("Ada", "Cruz", "EMP-1", "teacher"))
        for key in ("email", "firstName", "lastName", "sectionId"):
            with self.subTest(key=key), self.assertRaises(ValidationError):
                TeacherProvisionRequest.model_validate({field: value for field, value in payload.items() if field != key})
        for key in ("firstName", "lastName"):
            with self.assertRaises(ValidationError):
                TeacherProvisionRequest.model_validate({**payload, key: " "})
        with self.assertRaises(ValidationError):
            TeacherProvisionRequest.model_validate({**payload, "password": "weak"})
        self.assertEqual(TeacherUpdate(fullName=" Ada ", lastName="Cruz", employeeId=" E ", sectionId=2).first_name, "Ada")
        long_name = "Section " + "A" * 92
        self.assertEqual(len(SectionCreate(section_name=long_name).section_name), 100)
        self.assertEqual(TeacherUpdate(class_name=long_name).class_name, long_name)
        self.assertEqual(StudentUpdate(section_name=long_name).section_name, long_name)
        with self.assertRaises(ValidationError):
            SectionCreate(section_name=long_name + "A")

    def test_auth_aliases_and_multiple_device_transports(self):
        request = LoginRequest(email="teacher", password="anything", rememberDevice=False, rememberMe="true", trusted_device_token="legacy")
        self.assertTrue(request.rememberDevice)
        self.assertEqual(request.trusted_device_token, "legacy")
        self.assertEqual(LogoutRequest(forgetDevice=True, trusted_device_token="legacy").trusted_device_token, "legacy")

    def test_scorer_falls_back_to_id_but_recognized_name_wins(self):
        for domain_id in (1, "1"):
            scores = calculate_scores([{"domain_name": "Unknown", "domain_id": domain_id, "answer": "KAYA"}], 4.5)
            self.assertEqual(scores["raw_scores"]["GM"], 1)
        scores = calculate_scores([{"domain_name": "Fine Motor Domain", "domain_id": 1, "answer": "KAYA"}], 4.5)
        self.assertEqual(scores["raw_scores"]["FM"], 1)
        self.assertEqual(scores["raw_scores"]["GM"], 0)

    def test_import_iso_timestamps_and_legacy_dates(self):
        for value in ("2026-08-10T12:30:40.123Z", "2026-08-10T12:30:40Z", "2026-08-10T12:30:40.123+08:00", "08/10/2026", "08/10/26", "2026-08-10"):
            self.assertEqual(parse_date(value, CALENDAR_WINDOWS_1900), date(2026, 8, 10))
        self.assertIsNone(parse_date("2026-99-10T12:30:40Z", CALENDAR_WINDOWS_1900))


class Batch1BackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.call, self.sessions = self.fixture.call, self.fixture.sessions

    def tearDown(self):
        self.fixture.tearDown()

    def assert_cookies(self, response, production=False, cleared=False):
        cookies = response.headers.get_list("set-cookie")
        self.assertEqual(len(cookies), 2)
        for name in ("device_token", "trusted_device_token"):
            cookie = next(item for item in cookies if item.startswith(name + "="))
            self.assertIn("HttpOnly", cookie)
            self.assertIn("SameSite=none" if production else "SameSite=lax", cookie)
            self.assertEqual("; Secure" in cookie, production)
            if cleared:
                self.assertIn("Max-Age=0", cookie)

    def test_login_cookie_modes_alias_token_and_explicit_forgetting(self):
        from backend.utils.rate_limits import limits
        for environment in ("development", "production"):
            # Cookie-mode regression does not use production's live counters.
            # Batch 2 separately verifies real PostgreSQL counters in isolation.
            with patch.object(settings, "ENVIRONMENT", environment), patch.object(limits, "hit", return_value=0):
                result = self.fixture.login(rememberMe=True)
                self.assertEqual(result.status_code, 200, result.text)
                self.assert_cookies(result, production=environment == "production")
        token = result.json()["deviceToken"]
        self.fixture.client.cookies.clear()
        with patch.object(settings, "ENABLE_OTP", True):
            result = self.fixture.login(deviceToken="stale", trusted_device_token=token)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertFalse(result.json()["requireOtp"])
        self.fixture.client.cookies.clear()
        result = self.fixture.client.post("/api/auth/logout", json={"forgetDevice": True, "trusted_device_token": token})
        self.assertEqual(result.status_code, 200)
        self.assert_cookies(result, cleared=True)
        with self.sessions() as db:
            self.assertEqual(db.query(UserTrustedDevice).filter_by(device_token_hash=digest(token)).count(), 0)

    def test_credential_changes_clear_cookies_and_account_email(self):
        self.fixture.login(rememberMe=True)
        result = self.call("POST", "/api/teachers/change-password-verify", 2, json={"oldPassword": test_phase2.PASSWORD, "newPassword": "Changed456"})
        self.assertEqual(result.status_code, 200, result.text)
        self.assert_cookies(result, cleared=True)
        result = self.call("PUT", "/api/chairman/account", json={"currentPassword": test_phase2.PASSWORD, "newEmail": "updated@example.com"})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["email"], "updated@example.com")
        self.assertEqual(result.json()["user"]["email"], "updated@example.com")
        self.assert_cookies(result, cleared=True)
        with self.sessions() as db:
            self.assertEqual(db.query(UserTrustedDevice).filter_by(user_id=2).count(), 0)

    def test_password_verification_binds_optional_email(self):
        with self.sessions() as db:
            token, otp = issue_challenge(db, db.get(User, 2), OtpPurpose.PASSWORD_CHANGE)
            db.commit()
        payload = {"newPassword": "Changed456", "challengeToken": token, "otp": otp, "email": "other@example.com"}
        with patch.object(settings, "ENABLE_OTP", True):
            rejected = self.call("POST", "/api/teachers/change-password-verify", 2, json=payload)
            self.assertEqual(rejected.status_code, 400)
            payload["email"] = "adviser@example.com"
            accepted = self.call("POST", "/api/teachers/change-password-verify", 2, json=payload)
            self.assertEqual(accepted.status_code, 200, accepted.text)

    def test_session_error_codes_and_compatibility_keys(self):
        claims = jwt.get_unverified_claims(self.fixture.tokens[2])
        variants = [("invalid", "INVALID_TOKEN"),
                    (jwt.encode({**claims, "exp": datetime.now(timezone.utc) - timedelta(seconds=1)}, settings.SECRET_KEY, algorithm=settings.ALGORITHM), "TOKEN_EXPIRED"),
                    (jwt.encode({**claims, "credentialVersion": "old"}, settings.SECRET_KEY, algorithm=settings.ALGORITHM), "SESSION_REVOKED"),
                    (jwt.encode({**claims, "tokenType": "otp-challenge"}, settings.SECRET_KEY, algorithm=settings.ALGORITHM), "SESSION_REVOKED")]
        for token, code in variants:
            result = self.fixture.client.get("/api/students/all", headers={"Authorization": f"Bearer {token}"})
            self.assertEqual(result.status_code, 401)
            self.assertEqual(result.json()["code"], code)
            self.assertFalse(result.json()["success"])
            self.assertEqual(result.json()["message"], result.json()["detail"])
        with self.sessions() as db:
            db.get(User, 2).is_first_login = True
            db.commit()
        self.assertEqual(self.call("GET", "/api/students/all", 2).json()["code"], "PASSWORD_CHANGE_REQUIRED")
        with self.sessions() as db:
            db.get(User, 2).is_active = False
            db.commit()
        self.assertEqual(self.call("GET", "/api/students/all", 2).json()["code"], "ACCOUNT_INACTIVE")
        self.assertEqual(self.fixture.login().json()["code"], "ACCOUNT_INACTIVE")

    def test_section_list_requires_active_primary_and_creation_contract(self):
        self.assertTrue(self.call("GET", "/api/chairman/sections").json()[0]["is_active"])
        with self.sessions() as db:
            db.query(SectionTeacher).filter_by(section_id=1, role="Primary Adviser").update({"status": "Inactive"})
            db.get(User, 3).is_active = False
            db.commit()
        for section in self.call("GET", "/api/chairman/sections").json():
            self.assertIsNone(section["adviser_teacher_id"])
            self.assertIsNone(section["is_active"])
        result = self.call("POST", "/api/chairman/sections", json={"section_name": "New Section"})
        self.assertEqual(result.status_code, 201, result.text)
        self.assertEqual(set(result.json()), {"message", "section_id", "section_name", "adviser_teacher_id", "created_at"})

    def test_teacher_provisioning_requires_names_and_assigns_long_class(self):
        payload = {"email": " newteacher@example.com ", "initial_password": test_phase2.PASSWORD, "fullName": " Ada ", "lastName": " Cruz ", "employeeId": " EMP-1 ", "class_name": "Section " + "A" * 92}
        for field in ("email", "fullName", "lastName", "class_name"):
            rejected = self.call("POST", "/api/chairman/teachers", json={key: value for key, value in payload.items() if key != field})
            self.assertEqual(rejected.status_code, 422, rejected.text)
        with self.fixture.test_engine.begin() as connection:
            apply_batch1(connection, self.fixture.schema)
        created = self.call("POST", "/api/chairman/teachers", json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        with self.sessions() as db:
            teacher = db.get(Teacher, created.json()["teacher_id"])
            self.assertEqual((teacher.first_name, teacher.last_name, teacher.employee_id), ("Ada", "Cruz", "EMP-1"))
            self.assertEqual(teacher.class_name, payload["class_name"])
            self.assertTrue(teacher.user.is_first_login)
            self.assertEqual(db.query(SectionTeacher).filter_by(teacher_id=teacher.teacher_id, role="Primary Adviser", status="Active").count(), 1)

    def test_section_widening_migration_preserves_records_and_long_backups(self):
        with self.fixture.test_engine.begin() as connection:
            self.assertTrue(apply_batch1(connection, self.fixture.schema))
            self.assertFalse(apply_batch1(connection, self.fixture.schema))
            check_batch1(connection, self.fixture.schema)
        name = "Section " + "A" * 92
        result = self.call("POST", "/api/chairman/sections", json={"section_name": name, "teacher_id": 3})
        self.assertEqual(result.status_code, 201, result.text)
        result = self.call("PUT", "/api/chairman/students/transfer", json={"student_ids": [1], "new_section_id": result.json()["section_id"]})
        self.assertEqual(result.status_code, 200, result.text)
        with self.sessions() as db:
            self.assertEqual(db.get(Student, 1).section_name, name)
            self.assertEqual(db.get(Teacher, 3).class_name, name)
        backup = self.call("GET", "/api/backup/export")
        self.assertEqual(backup.status_code, 200, backup.text if backup.status_code != 200 else "")
        restored = self.call("POST", "/api/backup/restore", files={"file": ("backup.enc", backup.content, "application/octet-stream")})
        self.assertEqual(restored.status_code, 200, restored.text)

    def test_chairman_rounding_and_unassigned_intervention(self):
        with self.sessions() as db:
            db.get(Student, 1).section_id = None
            for question_id in range(1, 9):
                db.add(StudentEccdEvaluation(student_id=1, teacher_id=1, question_id=question_id, testing_period="PRE", answer="KAYA" if question_id == 1 else "DI-KAYA", evaluation_date=date(2026, 8, 10)))
            db.commit()
        result = self.call("GET", "/api/chairman/dashboard-stats")
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["functionalMastery"], {"kaya": 13, "dikaya": 88})
        self.assertEqual(result.json()["stats"]["priorityIntervention"], "None")
        self.assertEqual(result.json()["stats"]["priorityInterventionSubtitle"], "Requires Support")

    def test_teacher_and_parent_progress_midpoint_rounding_and_release_mask(self):
        with self.sessions() as db:
            db.add_all(Student(student_id=i, lrn_number=f"{700000000000 + i}", first_name="Extra", last_name="Learner", section_id=1, is_active=True) for i in range(4, 11))
            db.add(EccdDomain(domain_id=8, domain_name="Custom Domain"))
            db.flush()
            db.add_all(EccdQuestion(question_id=200+i, domain_id=8, question_text="Custom skill", sequence_order=i+1, is_home_based=True) for i in range(8))
            db.flush()
            db.add_all(StudentEccdEvaluation(student_id=1, teacher_id=1, question_id=200+i, testing_period="PRE", answer="KAYA" if i == 0 else "DI-KAYA", evaluation_date=date(2026, 8, 10)) for i in range(8))
            db.commit()
        teacher = self.call("GET", "/api/eccd/domains-progress", 2)
        self.assertEqual(teacher.status_code, 200, teacher.text)
        self.assertEqual(next(row for row in teacher.json() if row["domain_id"] == 8)["pre_progress"], 13)
        with self.sessions() as db:
            db.query(StudentEccdEvaluation).filter(StudentEccdEvaluation.question_id.in_(range(201, 208))).delete(synchronize_session=False)
            db.commit()
        parent = self.call("GET", "/api/eccd/parent/domains-progress/1", 5).json()
        self.assertIsNone(next(row for row in parent if row["domain_id"] == 8)["pre_progress"])
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_view_eccd_pre = True
            db.commit()
        parent = self.call("GET", "/api/eccd/parent/domains-progress/1", 5).json()
        self.assertEqual(next(row for row in parent if row["domain_id"] == 8)["pre_progress"], 13)

    def test_super_admin_role_declarations_preserve_profile_ownership(self):
        self.assertEqual(self.call("GET", "/api/eccd/students").json(), [])
        self.assertEqual(self.call("GET", "/api/students/my-child").json(), [])
        self.assertEqual(self.call("GET", "/api/eccd/domains-progress").status_code, 403)
        payload = {"student_id": 1, "evaluations": [{"question_id": self.fixture.home, "testing_period": "PRE", "answer": "KAYA"}]}
        self.assertEqual(self.call("POST", "/api/eccd/parent/evaluate", json=payload).status_code, 403)
        with self.sessions() as db:
            db.add(Parent(parent_id=3, user_id=1, fullname="Linked Chairman"))
            db.flush()
            db.add(FamilyAccess(parent_id=3, student_id=1, relationship_type="Guardian"))
            db.get(Teacher, 1).allow_parent_edit_home_based_eccd = True
            db.commit()
        self.assertEqual([row["student_id"] for row in self.call("GET", "/api/students/my-child").json()], [1])
        self.assertEqual(self.call("POST", "/api/eccd/parent/evaluate", json=payload).status_code, 200)
        payload["student_id"] = 3
        self.assertEqual(self.call("POST", "/api/eccd/parent/evaluate", json=payload).status_code, 403)

    def test_lifecycle_and_field_level_audit_logs_mask_identifiers(self):
        changed = self.call("PUT", "/api/students/1", 2, json={"first_name": "Changed", "legal_guardian_name": "New Guardian", "gender": "female", "guardian_name": "09123456789"})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(self.call("PUT", "/api/students/1", 2, json={"first_name": "Changed"}).status_code, 200)
        for method, path in (("PUT", "/api/students/1/archive"), ("PUT", "/api/students/1/unarchive"), ("DELETE", "/api/students/1")):
            self.assertEqual(self.call(method, path, 2).status_code, 200)
        with self.sessions() as db:
            logs = db.query(SystemLog).order_by(SystemLog.log_id).all()
            self.assertEqual([log.action_type for log in logs], ["Updated Student Info", "Updated Student Info", "Archived Student", "Student Restored", "Deleted Student"])
            self.assertIn("First Name: 'Test' -> 'Changed'", logs[0].details)
            self.assertIn("Guardian's Name: '' -> 'New Guardian'", logs[0].details)
            self.assertIn("User ID: 2", logs[0].details)
            self.assertIn("no data was changed", logs[1].details)
            self.assertTrue(all(test_phase2.LRN not in log.details for log in logs))

    def test_protected_section_deletion_includes_archived_students(self):
        with self.sessions() as db:
            db.get(Student, 1).section_id = 2
            db.commit()
        self.assertEqual(self.call("DELETE", "/api/chairman/sections/1").status_code, 409)
        with self.sessions() as db:
            self.assertFalse(db.get(Student, 2).is_active)
            self.assertEqual(db.get(Student, 2).section_id, 1)

    def test_import_database_failure_runtime_failure_and_invalid_names_are_row_local(self):
        wb = openpyxl.load_workbook(BytesIO(self.fixture.make_import()))
        info = wb["Info Sheet"]
        info.cell(3, 19, 2147483648)  # PostgreSQL INTEGER overflow at guardian insert.
        info.cell(3, 11, "2026-08-10T00:00:00.123Z")
        original = [cell.value for cell in info[3]]
        for name, lrn, guardian in (("Bad2, New", "001555555556", "Valid Father"), ("Valid, New", "001555555557", "Bad2"), ("Later, New", "001555555558", "Valid Father")):
            row = list(original)
            row[1], row[5], row[17], row[18] = name, lrn, guardian, 35
            info.append(row)
        result = self.call("POST", "/api/teachers/import-students", 2, files={"file": ("students.xlsx", workbook_bytes(wb), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual((result.json()["successCount"], result.json()["failedCount"]), (1, 3))
        self.assertEqual([row["row"] for row in result.json()["errors"]], [3, 4, 5])
        self.assertNotIn("INSERT INTO", result.text)
        with self.sessions() as db:
            self.assertIsNotNone(db.query(Student).filter_by(lrn_search_hash=hash_lrn("001555555558")).first())
            self.assertIsNone(db.query(Student).filter_by(lrn_search_hash=hash_lrn("001555555555")).first())
        # An unrelated runtime exception must also roll back its row and continue.
        info.delete_rows(4, 3)
        info.cell(3, 19, 35)
        info.append([*original[:1], "After, New", *original[2:5], "001555555559", *original[6:]])
        with patch("backend.utils.excel.upsert_guardian", side_effect=[RuntimeError("private runtime details"), None, None]):
            result = self.call("POST", "/api/teachers/import-students", 2, files={"file": ("students.xlsx", workbook_bytes(wb), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        self.assertEqual((result.json()["successCount"], result.json()["failedCount"]), (1, 1))
        self.assertNotIn("private runtime details", result.text)

    def test_checklist_relationship_null_trim_and_fallback(self):
        with self.sessions() as db:
            link = db.query(FamilyAccess).filter_by(student_id=1, parent_id=1).one()
            link.relationship_type = None
            db.get(Parent, 1).relationship_type = " Mother "
            db.add(Parent(parent_id=3, fullname="Fallback Guardian", relationship_type="Guardian"))
            db.flush()
            db.add(FamilyAccess(parent_id=3, student_id=1, relationship_type="Guardian"))
            db.commit()
            wb = student_workbook(db, db.get(Student, 1))
            self.assertEqual(wb["CHECKLIST"]["W20"].value, "Fallback Guardian")
            self.assertEqual(wb["CHECKLIST"]["W22"].value, "Test Parent")
            self.assertIsNone(link.relationship_type)
            wb.close()

    def test_backup_success_events_and_failed_restore_does_not_log_success(self):
        backup = self.call("GET", "/api/backup/export")
        self.assertEqual(backup.status_code, 200)
        with self.sessions() as db:
            self.assertEqual(db.query(SystemLog).filter_by(action_type="BACKUP_EXPORT").count(), 1)
        invalid = self.call("POST", "/api/backup/restore", files={"file": ("bad.enc", b"bad", "application/octet-stream")})
        self.assertEqual(invalid.status_code, 400)
        restored = self.call("POST", "/api/backup/restore", files={"file": ("backup.enc", backup.content, "application/octet-stream")})
        self.assertEqual(restored.status_code, 200, restored.text)
        with self.sessions() as db:
            log = db.query(SystemLog).filter_by(action_type="BACKUP_RESTORE").one()
            self.assertEqual(log.user_id, 1)
