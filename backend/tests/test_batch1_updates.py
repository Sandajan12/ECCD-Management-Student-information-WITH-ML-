"""Database-free regressions for optional identity and cumulative PRE mastery."""
from datetime import date
from unittest import TestCase
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pydantic import SecretStr, ValidationError

from backend.config.settings import settings
from backend.models import EccdQuestion, Student, StudentEccdEvaluation
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.schemas.backup import StudentBackupRow
from backend.schemas.eccd import AssessmentAnswer, EvaluationBatch, ParentAssessmentResponse
from backend.schemas.student import EnrollmentRequest, StudentUpdate
from backend.utils.assessments import save_evaluation
from backend.utils.mastery import completed_pre_kaya, guard_pre_mastery


class OptionalLrnTests(TestCase):
    def test_enrollment_accepts_missing_null_and_blank_lrn(self):
        required = dict(first_name="Test", last_name="Child", date_of_birth="2021-01-10", gender="Female")
        for optional in ({}, {"lrn": None}, {"lrn_number": ""}, {"lrn": "  "}):
            with self.subTest(optional=optional):
                self.assertIsNone(EnrollmentRequest(**required, **optional).lrn_number)

    def test_nonempty_lrn_requires_twelve_ascii_digits(self):
        for value in ("123", "12345678901a", "????????????"):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                StudentUpdate(lrn_number=value)
        self.assertEqual(StudentUpdate(lrn=" 001234567890 ").lrn_number, "001234567890")

    def test_update_distinguishes_omission_and_explicit_clear(self):
        self.assertNotIn("lrn_number", StudentUpdate().model_fields_set)
        update = StudentUpdate(lrn="")
        self.assertIn("lrn_number", update.model_fields_set)
        self.assertIsNone(update.lrn_number)

    def test_model_preserves_encryption_and_clears_all_protected_fields(self):
        with patch.object(settings, "LRN_ENCRYPTION_KEY", SecretStr("ab" * 32)), patch.object(settings, "LRN_HMAC_SECRET", SecretStr("test-secret-" * 4)):
            student = Student(lrn_number="001234567890")
            self.assertEqual(student.lrn_number, "001234567890")
            self.assertNotIn(student.lrn_number, student.lrn_encrypted)
            student.lrn_number = None
            self.assertIsNone(student.lrn_encrypted)
            self.assertIsNone(student.lrn_search_hash)
            self.assertIsNone(student.lrn_last4)
            self.assertIsNone(student.lrn_number)
            self.assertEqual(student.masked_lrn, "Pending")

    def test_backup_allows_unassigned_lrn_but_rejects_partial_identity(self):
        values = {name: None for name, field in StudentBackupRow.model_fields.items() if field.is_required()}
        values["student_id"] = 1
        self.assertIsNone(StudentBackupRow(**values).lrn_encrypted)
        with self.assertRaises(ValidationError):
            StudentBackupRow(**{**values, "lrn_last4": "7890"})


class CumulativeMasteryTests(TestCase):
    def record(self, question_id=1, answer=EccdAnswer.KAYA, period=TestingPeriod.PRE, confirmed=True):
        return StudentEccdEvaluation(student_id=1, question_id=question_id, testing_period=period,
                                     answer=answer, evaluator_role="teacher" if confirmed else "parent", teacher_evaluation_date=date(2026, 8, 10) if confirmed else None)

    def completed(self):
        return [self.record(), self.record(2, EccdAnswer.DI_KAYA)]

    def test_only_completed_teacher_confirmed_pre_provides_locks(self):
        self.assertEqual(completed_pre_kaya({1, 2}, self.completed()), {1})
        self.assertEqual(completed_pre_kaya({1, 2}, [self.record()]), set())
        self.assertEqual(completed_pre_kaya({1, 2}, [self.record(), self.record(2, confirmed=False)]), set())
        self.assertEqual(completed_pre_kaya({1}, [self.record(period=TestingPeriod.MID)]), set())
        self.assertEqual(completed_pre_kaya(set(), []), set())

    def test_both_later_periods_reject_downgrade(self):
        db = MagicMock()
        db.query.return_value.filter.return_value = [(1,), (2,)]
        for period in (TestingPeriod.MID, TestingPeriod.POST):
            answer = AssessmentAnswer(question_id=1, testing_period=period, answer="DI-KAYA")
            with self.subTest(period=period), self.assertRaises(HTTPException) as raised:
                guard_pre_mastery(db, self.completed(), [answer])
            self.assertEqual(raised.exception.status_code, 400)
        db.commit.assert_not_called()

    def test_pre_corrections_and_unmastered_later_items_remain_editable(self):
        db = MagicMock()
        db.query.return_value.filter.return_value = [(1,), (2,)]
        for question, period, value in ((1, "PRE", "DI-KAYA"), (2, "MID", "DI-KAYA"), (1, "POST", "KAYA")):
            guard_pre_mastery(db, self.completed(), [AssessmentAnswer(question_id=question, testing_period=period, answer=value)])

    def test_incomplete_pre_does_not_lock_parent_observations(self):
        db = MagicMock()
        db.query.return_value.filter.return_value = [(1,), (2,)]
        guard_pre_mastery(db, [self.record(confirmed=False)], [
            AssessmentAnswer(question_id=1, testing_period="MID", answer="DI-KAYA")])

    def test_rejected_teacher_batch_does_not_change_answers_or_dates(self):
        db = MagicMock()
        existing = self.completed() + [self.record(1, period=TestingPeriod.MID)]
        student_query, question_query, evaluation_query = MagicMock(), MagicMock(), MagicMock()
        question_query.filter.return_value = [(1,), (2,)]
        question_query.__iter__.return_value = iter([(1,), (2,)])
        evaluation_query.filter_by.return_value.all.return_value = existing
        evaluation_query.options.return_value = evaluation_query
        db.query.side_effect = lambda model: (
            student_query if model is Student else question_query if model is EccdQuestion.question_id else evaluation_query)
        payload = EvaluationBatch(student_id=1, period="MID", assessment_date="2026-09-10",
                                  answers={"1": 0, "2": 1})
        with patch("backend.utils.assessments.resolve_student", return_value=Student(student_id=1)), patch("backend.utils.assessments.authorize_student"), patch("backend.utils.assessments.guard_section_period"):
            with self.assertRaises(HTTPException):
                save_evaluation(db, MagicMock(), payload)
        self.assertEqual(existing[-1].teacher_evaluation_date, date(2026, 8, 10))
        self.assertEqual(existing[-1].answer, EccdAnswer.KAYA)
        db.add.assert_not_called()
        db.commit.assert_not_called()


class StaffLrnResponseTests(TestCase):
    def test_staff_detail_returns_full_lrn_and_parent_detail_stays_masked(self):
        from backend.routes.students import get_student
        student = MagicMock(lrn_number="001234567890")
        db = MagicMock()
        db.query.return_value.join.return_value.filter.return_value.first.return_value = None
        for role in ("admin", "super-admin", "user"):
            user = MagicMock()
            user.role.value = role
            with self.subTest(role=role), patch("backend.routes.students.resolve_student", return_value=student), patch("backend.routes.students.authorize_student") as authorize, patch("backend.routes.students.public_student", return_value={"lrn_number": "masked"}), patch("backend.routes.students.child_profile", return_value={"lrn_number": "masked"}):
                result = get_student("1", db, user)
                self.assertEqual(result["lrn_number"], "masked" if role == "user" else "001234567890")
                authorize.assert_called_once_with(db, user, student)

    def test_parent_assessment_contract_excludes_teacher_mastery_metadata(self):
        self.assertNotIn("pre_kaya_question_ids", ParentAssessmentResponse.model_fields)
