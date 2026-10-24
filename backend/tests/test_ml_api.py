"""Inference and authorization regressions in disposable PostgreSQL schemas."""
from datetime import date
import unittest
from unittest.mock import patch

from backend.ml.common import ACTIVE_CLASSES, ARTIFACTS, DOMAINS, sandbox_composites
from backend.ml.inference import load_model, predict_student, warm_inference
from backend.models import EccdQuestion, Parent, StudentEccdEvaluation
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.tests import test_phase2
from backend.utils.eccd_scorer import lookup_standard_score, scoring_data


def sandbox_features():
    return {**{f"{prefix}_pre_scaled": 9 for prefix, _ in DOMAINS.values()},
            "pre_standard_score": 90, "pre_total_scaled": 63,
            "pre_delayed_domains_count": 0, "age_months_pre": 66,
            "gender": "FEMALE", "handedness": None, "father_education_level": None,
            "mother_education_level": None, "household_occupation_tier": None,
            "num_siblings": None, "birth_order": None}


class MLApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call = self.fixture.call

    def complete_pre(self, teacher_date=True):
        with self.fixture.sessions() as db:
            for question in db.query(EccdQuestion).all():
                db.add(StudentEccdEvaluation(student_id=1, teacher_id=1 if teacher_date else None,
                    question_id=question.question_id, testing_period=TestingPeriod.PRE,
                    answer=EccdAnswer.DI_KAYA if question.domain_id == 1 else EccdAnswer.KAYA,
                    evaluation_date=date(2026, 8, 10),
                    teacher_evaluation_date=date(2026, 8, 10) if teacher_date else None,
                    evaluator_role="teacher" if teacher_date else "parent"))
            db.commit()

    def test_student_access_roster_scoping_and_incomplete_pre(self):
        for actor in (1, 5, 6):
            self.assertEqual(self.call("POST", "/api/ml/predict/sandbox", actor, json=sandbox_features()).status_code, 403)
            self.assertEqual(self.call("POST", "/api/ml/predict/student/1", actor).status_code, 403)
            self.assertEqual(self.call("GET", "/api/ml/students?section_id=1", actor).status_code, 403)
        self.assertEqual(self.call("POST", "/api/ml/predict/student/3", 2).status_code, 403)
        self.assertEqual(self.call("GET", "/api/ml/students?section_id=2", 2).status_code, 403)
        self.assertEqual(self.call("POST", "/api/ml/predict/student/9999", 2).status_code, 404)
        self.assertEqual(self.call("POST", "/api/ml/predict/student/2", 2).status_code, 409)
        self.assertEqual(self.call("POST", "/api/ml/predict/student/1", 2).status_code, 409)
        roster = self.call("GET", "/api/ml/students?section_id=1", 2).json()
        self.assertEqual([row["student_id"] for row in roster], [1])
        self.assertFalse(roster[0]["pre_complete"])

    def test_complete_pre_matches_application_scores_and_does_not_write(self):
        self.complete_pre()
        before = self.call("GET", "/api/eccd/assessment/1", 2).json()
        response = self.call("POST", "/api/ml/predict/student/1", 2)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["student_id"], 1)
        self.assertEqual(result["assessment_date"], "2026-08-10")
        self.assertEqual(result["features"]["age_months_pre"], 67)
        self.assertEqual(result["features"]["gender"], "FEMALE")
        self.assertEqual(result["features"]["gm_pre_scaled"], 1)
        self.assertIn("household_occupation_tier", result["imputed_fields"])
        self.assertEqual(len(result["baseline_domains"]), 7)
        self.assertEqual(set(result["class_probabilities"]), set(ACTIVE_CLASSES))
        self.assertAlmostEqual(sum(result["confidence_percentages"].values()), 100)
        self.assertEqual(result["interventions"][0]["di_kaya_items"], list(range(1, 14)))
        self.assertIn("not a formal clinical diagnosis", result["research_notice"])
        after = self.call("GET", "/api/eccd/assessment/1", 2).json()
        self.assertEqual(before, after)
        self.assertTrue(self.call("GET", "/api/ml/students?section_id=1", 2).json()[0]["pre_complete"])

    def test_parent_only_pre_is_not_a_confirmed_teacher_session(self):
        self.complete_pre(teacher_date=False)
        response = self.call("POST", "/api/ml/predict/student/1", 2)
        self.assertEqual(response.status_code, 409)
        self.assertIn("teacher-confirmed", response.json()["detail"])

    def test_sandbox_validation_imputation_and_observed_item_trigger(self):
        features = sandbox_features()
        response = self.call("POST", "/api/ml/predict/sandbox", 2, json=features)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()["student_id"])
        self.assertEqual(response.json()["interventions"], [])
        self.assertIn("birth_order", response.json()["imputed_fields"])
        local = predict_student({**features, "gm_pre_di_kaya_items": "2;3"})
        self.assertEqual(local["interventions"][0]["di_kaya_items"], [2, 3])
        for changes in ({"gm_pre_scaled": 20}, {"pre_delayed_domains_count": 8},
                        {"age_months_pre": -1}, {"gender": "unknown"},
                        {"mother_education_level": "Invented"}, {"gm_pre_scaled": 3.5},
                        {"unrecognized_feature": 1}):
            self.assertEqual(self.call("POST", "/api/ml/predict/sandbox", 2, json={**features, **changes}).status_code, 422)

    def test_model_unavailability_is_sanitized_and_household_not_invented(self):
        with patch("backend.routes.ml.predict_student", side_effect=OSError("private artifact path")):
            response = self.call("POST", "/api/ml/predict/sandbox", 2, json=sandbox_features())
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private artifact path", response.text)
        self.complete_pre()
        with self.fixture.sessions() as db:
            parent = db.get(Parent, 1)
            parent.educational_attainment = "High School"
            parent.occupation = "Unreviewed free-text occupation"
            db.commit()
        result = self.call("POST", "/api/ml/predict/student/1", 2).json()
        self.assertEqual(result["features"]["mother_education_level"], "High School")
        self.assertIsNone(result["features"]["household_occupation_tier"])

    def test_sandbox_normalizes_stale_composites_and_all_one_households(self):
        for months in (36, 48, 60, 66, 80):
            for household in ({}, {"mother_education_level": "College",
                    "father_education_level": "College", "household_occupation_tier": "Professional",
                    "num_siblings": 2, "birth_order": 1}):
                with self.subTest(months=months, household=bool(household)):
                    payload = {**sandbox_features(), **dict.fromkeys(
                        [f"{prefix}_pre_scaled" for prefix, _ in DOMAINS.values()], 1),
                        "pre_standard_score": 80, "pre_total_scaled": 49,
                        "pre_delayed_domains_count": 0, "age_months_pre": months, **household}
                    response = self.call("POST", "/api/ml/predict/sandbox", 2, json=payload)
                    self.assertEqual(response.status_code, 200, response.text)
                    result = response.json()
                    for name, expected in (("pre_total_scaled", 7), ("pre_standard_score", 37),
                                           ("pre_delayed_domains_count", 7)):
                        self.assertEqual(result["features"][name], expected)
                    self.assertEqual(result["predicted_post_interpretation"], ACTIVE_CLASSES[0])


class MLSandboxScoringTests(unittest.TestCase):
    def test_standard_lookup_matches_existing_exact_and_fallback_rules(self):
        for age, bracket in ((3.5, "AGE 3.1 - 4.0"), (4.5, "AGE 4.1 - 5.0"),
                             (5.5, "AGE 5.1 - 5.11")):
            entries = scoring_data[bracket]["standardScores"]
            sums = sorted(map(int, entries))
            for total in range(134):
                closest = max((value for value in sums if value <= total), default=sums[0])
                self.assertEqual(lookup_standard_score(total, age), entries[str(closest)])

    def test_sandbox_composites_match_table_for_domain_and_age_changes(self):
        for months in (1, 36, 48, 49, 60, 61, 66, 80, 216):
            for score in (0, 1, 3, 6, 7, 12, 19):
                features = {**sandbox_features(), **dict.fromkeys(
                    [f"{prefix}_pre_scaled" for prefix, _ in DOMAINS.values()], score),
                    "age_months_pre": months}
                result = sandbox_composites(features)
                self.assertEqual(result["pre_total_scaled"], score * 7)
                self.assertEqual(result["pre_delayed_domains_count"], 7 if score <= 6 else 0)
                # Score tables are currently identical across age brackets.
                self.assertEqual(result["pre_standard_score"],
                                 lookup_standard_score(score * 7, 5.5)["standardScore"])


class MLCacheTests(unittest.TestCase):
    def test_startup_and_predictions_share_one_loaded_model(self):
        import joblib
        load_model.cache_clear()
        try:
            with patch("backend.ml.inference.joblib.load", wraps=joblib.load) as loader:
                warm_inference()
                predict_student(sandbox_features())
                predict_student(sandbox_features())
                loader.assert_called_once_with(ARTIFACTS / "rf_post_test_model.joblib")
        finally:
            load_model.cache_clear()
