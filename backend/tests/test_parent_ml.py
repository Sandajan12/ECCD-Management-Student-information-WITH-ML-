"""Parent ML gates, persistence and additive migration in disposable schemas."""
import unittest
from unittest.mock import patch

from sqlalchemy import text

from backend.migrations.parent_predictions import apply_parent_predictions, check_parent_predictions
from backend.models import FamilyAccess, Section, SectionTeacher, Student, StudentEccdEvaluation, Teacher, User
from backend.schemas.backup import TeacherBackupRow
from backend.tests import test_ml_api, test_phase2
from backend.utils.teachers import assign_teacher


class ParentMLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    setUp = test_ml_api.MLApiTests.setUp
    complete_pre = test_ml_api.MLApiTests.complete_pre

    def settings(self, **changes):
        response = self.call("PUT", "/api/teachers/me/access", 2, json=changes)
        self.assertEqual(response.status_code, 200, response.text)
        return response

    def test_default_off_and_only_synced_owner_with_parent_role(self):
        for path, method in (("/api/ml/parent/readiness/1", "GET"), ("/api/ml/parent/predict/1", "POST")):
            for actor in (1, 2, 6):
                self.assertEqual(self.call(method, path, actor).status_code, 403)
        readiness = self.call("GET", "/api/ml/parent/readiness/1", 5)
        self.assertEqual(readiness.status_code, 200, readiness.text)
        self.assertFalse(readiness.json()["allow_parent_predictions"])
        response = self.call("POST", "/api/ml/parent/predict/1", 5)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "Prediction access is currently disabled by your child's adviser.")
        self.assertEqual(self.call("POST", "/api/ml/parent/predict/3", 5).status_code, 403)
        with self.fixture.sessions() as db:
            db.query(FamilyAccess).filter_by(parent_id=1, student_id=1).one().status = "PENDING"
            db.commit()
        self.assertEqual(self.call("GET", "/api/ml/parent/readiness/1", 5).status_code, 403)
        self.assertEqual(self.call("POST", "/api/ml/parent/predict/1", 5).status_code, 403)

    def test_settings_aliases_persist_and_omitted_flag_is_preserved(self):
        self.settings(allow_parent_predictions=True)
        for path in ("/api/teachers/me/access", "/api/teachers/access-controls", "/api/teachers/settings"):
            response = self.call("GET", path, 2)
            self.assertTrue(response.json()["allow_parent_predictions"], response.text)
        self.settings(allow_parent_view_eccd_pre=True)
        with self.fixture.sessions() as db:
            teacher = db.get(Teacher, 1)
            self.assertTrue(teacher.allow_parent_predictions)
            self.assertTrue(teacher.allow_parent_view_eccd_pre)
        self.assertTrue(self.call("GET", "/api/ml/parent/readiness/1", 5).json()["allow_parent_predictions"])
        response = self.call("PUT", "/api/teachers/settings", 2, json={"allow_parent_predictions": False})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["allow_parent_predictions"])
        self.assertFalse(self.call("GET", "/api/ml/parent/readiness/1", 5).json()["allow_parent_predictions"])

    def test_incomplete_and_parent_only_pre_return_requested_400(self):
        self.settings(allow_parent_predictions=True)
        for complete_parent_only in (False, True):
            if complete_parent_only:
                self.complete_pre(teacher_date=False)
            response = self.call("POST", "/api/ml/parent/predict/1", 5)
            self.assertEqual(response.status_code, 400, response.text)
            self.assertEqual(response.json()["detail"], "PRE assessment must be completed before generating a prediction.")
            self.assertFalse(self.call("GET", "/api/ml/parent/readiness/1", 5).json()["pre_complete"])

    def test_unreleased_pre_never_leaks_scores_or_invokes_model(self):
        self.complete_pre()
        self.settings(allow_parent_predictions=True)
        with patch("backend.routes.ml.predict_student") as inference:
            response = self.call("POST", "/api/ml/parent/predict/1", 5)
            self.assertEqual(response.status_code, 403, response.text)
            self.assertIn("Results Pending Adviser Release", response.json()["detail"])
            inference.assert_not_called()
        readiness = self.call("GET", "/api/ml/parent/readiness/1", 5).json()
        self.assertFalse(readiness["is_published"])
        self.assertTrue(readiness["pre_complete"])
        self.assertNotIn("baseline_domains", readiness)

    def test_real_prediction_matches_teacher_and_preserves_evaluations(self):
        self.complete_pre()
        self.settings(allow_parent_predictions=True, allow_parent_view_eccd_pre=True)
        with self.fixture.sessions() as db:
            before = list(db.execute(StudentEccdEvaluation.__table__.select().order_by(StudentEccdEvaluation.evaluation_id)))
        response = self.call("POST", "/api/ml/parent/predict/1", 5)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        teacher = self.call("POST", "/api/ml/predict/student/1", 2).json()
        self.assertEqual(result["confidence_percentages"], teacher["confidence_percentages"])
        self.assertEqual(result["baseline_domains"], teacher["baseline_domains"])
        self.assertEqual(len(result["baseline_domains"]), 7)
        self.assertAlmostEqual(sum(result["confidence_percentages"].values()), 100)
        self.assertEqual(result["assessment_date"], "2026-08-10")
        self.assertNotIn("features", result)
        for guide in result["interventions"]:
            self.assertTrue(guide["home_activity"])
            self.assertNotIn("di_kaya_items", guide)
            self.assertNotIn("unmarked_items", guide)
        with self.fixture.sessions() as db:
            after = list(db.execute(StudentEccdEvaluation.__table__.select().order_by(StudentEccdEvaluation.evaluation_id)))
        self.assertEqual(before, after)
        self.settings(allow_parent_predictions=False)
        self.assertEqual(self.call("POST", "/api/ml/parent/predict/1", 5).status_code, 403)

    def test_profile_name_masking_is_independent_of_prediction_and_pre_release(self):
        self.complete_pre()
        self.settings(allow_parent_predictions=True, allow_parent_view_eccd_pre=True,
                      allow_parent_view_student_info=False)
        for method, path in (("GET", "/api/ml/parent/readiness/1"), ("POST", "/api/ml/parent/predict/1")):
            response = self.call(method, path, 5)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["student_name"], "")
            self.assertNotIn("Test Middle Student", response.text)
        teacher = self.call("POST", "/api/ml/predict/student/1", 2)
        self.assertEqual(teacher.status_code, 200, teacher.text)
        self.assertEqual(teacher.json()["student_name"], "Test Middle Student")
        self.settings(allow_parent_view_student_info=True)
        for method, path in (("GET", "/api/ml/parent/readiness/1"), ("POST", "/api/ml/parent/predict/1")):
            response = self.call(method, path, 5)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["student_name"], "Test Middle Student")

    def test_age_outside_training_range_keeps_forecast_permitted_pre_and_guides(self):
        from datetime import date
        self.complete_pre()
        self.settings(allow_parent_predictions=True, allow_parent_view_eccd_pre=True,
                      allow_parent_view_student_info=False, allow_parent_view_eccd_marks=False)
        with self.fixture.sessions() as db:
            db.get(Student, 1).date_of_birth = date(2022, 12, 10)  # PRE age 44 months
            db.commit()
            before = list(db.execute(StudentEccdEvaluation.__table__.select()))
        teacher = self.call("POST", "/api/ml/predict/student/1", 2).json()
        response = self.call("POST", "/api/ml/parent/predict/1", 5)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["student_name"], "")
        self.assertEqual(result["prediction_status"], "available")
        self.assertIsNone(result["support_reason"])
        self.assertEqual(result["predicted_post_interpretation"], teacher["predicted_post_interpretation"])
        self.assertEqual(result["confidence_percentages"], teacher["confidence_percentages"])
        self.assertAlmostEqual(sum(result["confidence_percentages"].values()), 100)
        self.assertEqual(result["baseline_domains"], teacher["baseline_domains"])
        self.assertEqual(result["pre_interpretation"], teacher["pre_interpretation"])
        self.assertTrue(result["interventions"][0]["home_activity"])
        self.assertNotIn("features", result)
        self.assertNotIn("di_kaya_items", result["interventions"][0])
        with self.fixture.sessions() as db:
            self.assertEqual(before, list(db.execute(StudentEccdEvaluation.__table__.select())))
        for changes in ({"allow_parent_view_eccd_pre": False},
                        {"allow_parent_view_eccd_pre": True, "allow_parent_predictions": False}):
            self.settings(**changes)
            response = self.call("POST", "/api/ml/parent/predict/1", 5)
            self.assertEqual(response.status_code, 403)
            self.assertNotIn("baseline_domains", response.json())

    def test_active_adviser_inheritance_and_no_adviser_fail_closed(self):
        self.settings(allow_parent_predictions=True)
        with self.fixture.sessions() as db:
            assign_teacher(db, db.get(User, 1), 1, 2)
            db.commit()
        self.assertFalse(self.call("GET", "/api/ml/parent/readiness/1", 5).json()["allow_parent_predictions"])
        with self.fixture.sessions() as db:
            db.get(Teacher, 2).allow_parent_predictions = True
            db.commit()
        self.assertTrue(self.call("GET", "/api/ml/parent/readiness/1", 5).json()["allow_parent_predictions"])
        with self.fixture.sessions() as db:
            db.get(User, 3).is_active = False
            db.commit()
        self.assertEqual(self.call("GET", "/api/ml/parent/readiness/1", 5).status_code, 403)
        with self.fixture.sessions() as db:
            db.query(SectionTeacher).filter_by(section_id=1, status="Active").one().status = "Inactive"
            db.get(Section, 1).adviser_teacher_id = 1
            db.commit()
        self.assertEqual(self.call("GET", "/api/ml/parent/readiness/1", 5).status_code, 403)

    def test_additive_migration_idempotence_preservation_and_older_backups(self):
        with self.fixture.test_engine.begin() as connection:
            connection.execute(text("ALTER TABLE teachers DROP COLUMN allow_parent_predictions"))
            before = list(connection.execute(text("SELECT to_jsonb(t) FROM teachers t ORDER BY teacher_id")))
            self.assertTrue(apply_parent_predictions(connection, self.fixture.schema))
            self.assertEqual(before, list(connection.execute(text("SELECT to_jsonb(t) - 'allow_parent_predictions' FROM teachers t ORDER BY teacher_id"))))
            self.assertEqual(connection.execute(text("SELECT count(*) FROM teachers WHERE allow_parent_predictions")).scalar_one(), 0)
            connection.execute(text("UPDATE teachers SET allow_parent_predictions = true WHERE teacher_id = 1"))
            self.assertFalse(apply_parent_predictions(connection, self.fixture.schema))
            check_parent_predictions(connection, self.fixture.schema)
        with self.fixture.sessions() as db:
            row = dict(db.execute(Teacher.__table__.select().where(Teacher.teacher_id == 1)).mappings().one())
        self.assertTrue(TeacherBackupRow.model_validate(row).allow_parent_predictions)
        row.pop("allow_parent_predictions")
        self.assertFalse(TeacherBackupRow.model_validate(row).allow_parent_predictions)

    def test_unavailable_model_is_sanitized_for_parent(self):
        self.complete_pre()
        self.settings(allow_parent_predictions=True, allow_parent_view_eccd_pre=True)
        with patch("backend.routes.ml.predict_student", side_effect=OSError("private artifact path")):
            response = self.call("POST", "/api/ml/parent/predict/1", 5)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private artifact path", response.text)
