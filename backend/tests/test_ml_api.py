"""Inference and authorization regressions in disposable PostgreSQL schemas."""
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from backend.ml.common import ACTIVE_CLASSES, ARTIFACTS, DOMAINS, sandbox_composites, sha256
from backend.ml.train_random_forest import acceptance_profiles
from backend.ml.inference import load_model, predict_student, warm_inference
from backend.models import EccdDomain, EccdQuestion, Parent, StudentEccdEvaluation
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.tests import test_phase2
from backend.utils.eccd_scorer import calculate_raw_scores, calculate_scores, lookup_standard_score, scoring_data


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

    def test_diagnostic_plots_are_static_staff_only_and_allowlisted(self):
        filenames = (
            "01_confusion_matrix.png", "02_classification_metrics_f1.png",
            "03_feature_importance.png", "04_class_distribution_70_30.png",
            "05_real_beneficiary_pre_vs_post_comparison.jpg", "06_probability_reliability.jpg",
        )
        directory = Path(self.enterContext(TemporaryDirectory()))
        self.enterContext(patch("backend.routes.ml.PLOT_DIRECTORY", directory))
        for filename in filenames:
            source = directory / filename.replace(".jpg", ".png")
            source.write_bytes(b"\x89PNG\r\n\x1a\nstatic plot fixture: " + filename.encode())
            path = f"/api/ml/plots/{filename}"
            self.assertEqual(self.fixture.client.get(path).status_code, 401)
            for actor in (5, 6):
                self.assertEqual(self.call("GET", path, actor).status_code, 403)
            for actor in (1, 2):
                with self.subTest(filename=filename, actor=actor):
                    response = self.call("GET", path, actor)
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.headers["content-type"], "image/png")
                    self.assertEqual(response.headers["cache-control"], "no-store")
                    self.assertEqual(response.content, source.read_bytes())
            if filename.endswith(".jpg"):
                original = self.call("GET", path.replace(".jpg", ".png"), 2)
                self.assertEqual(original.status_code, 200)
                self.assertEqual(original.content, source.read_bytes())
        for filename in ("evaluation_metrics.json", "rf_post_test_model.joblib", "unknown.png",
                         "%2e%2e%2fevaluation_metrics.json"):
            self.assertEqual(self.call("GET", f"/api/ml/plots/{filename}", 2).status_code, 404)

    def test_missing_diagnostic_plot_returns_sanitized_404(self):
        with TemporaryDirectory() as directory, patch("backend.routes.ml.PLOT_DIRECTORY", Path(directory)):
            response = self.call("GET", "/api/ml/plots/01_confusion_matrix.png", 2)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"success": False, "detail": "Diagnostic plot not found.",
                                          "message": "Diagnostic plot not found."})

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

    def test_custom_domains_never_change_ml_readiness_dates_or_inputs(self):
        self.complete_pre()
        before = self.call("POST", "/api/ml/predict/student/1", 2)
        self.assertEqual(before.status_code, 200, before.text)
        with self.fixture.sessions() as db:
            db.add(EccdDomain(domain_id=8, domain_name="Custom domain"))
            db.add(EccdQuestion(question_id=8000, domain_id=8, sequence_order=1,
                                question_text="Supplementary question"))
            db.commit()
        # An unanswered custom question does not make an official PRE incomplete.
        for path in ("/api/ml/students?section_id=1", "/api/ml/parent/readiness/1"):
            response = self.call("GET", path, 2 if "students?" in path else 5)
            self.assertEqual(response.status_code, 200, response.text)
            data = response.json()
            self.assertTrue((data[0] if isinstance(data, list) else data)["pre_complete"])
        after = self.call("POST", "/api/ml/predict/student/1", 2)
        self.assertEqual(after.status_code, 200, after.text)
        for key in ("features", "baseline_domains", "interventions", "assessment_date", "class_probabilities"):
            self.assertEqual(before.json()[key], after.json()[key], key)
        with self.fixture.sessions() as db:
            db.add(StudentEccdEvaluation(student_id=1, question_id=8000, teacher_id=1,
                testing_period=TestingPeriod.PRE, answer=EccdAnswer.KAYA,
                evaluation_date=date(2026, 7, 7), teacher_evaluation_date=date(2026, 7, 7),
                evaluator_role="teacher"))
            db.commit()
        answered = self.call("POST", "/api/ml/predict/student/1", 2)
        self.assertEqual(answered.status_code, 200, answered.text)
        for key in ("features", "baseline_domains", "interventions", "assessment_date", "class_probabilities"):
            self.assertEqual(before.json()[key], answered.json()[key], key)
        settings = self.call("PUT", "/api/teachers/me/access", 2, json={
            "allow_parent_predictions": True, "allow_parent_view_eccd_pre": True})
        self.assertEqual(settings.status_code, 200, settings.text)
        parent_result = self.call("POST", "/api/ml/parent/predict/1", 5)
        self.assertEqual(parent_result.status_code, 200, parent_result.text)
        self.assertEqual(parent_result.json()["assessment_date"], before.json()["assessment_date"])
        # A teacher date on a custom question cannot confirm parent-only official answers.
        with self.fixture.sessions() as db:
            for record in db.query(StudentEccdEvaluation).filter(StudentEccdEvaluation.question_id != 8000):
                record.teacher_evaluation_date = None
                record.evaluator_role = "parent"
            db.commit()
        self.assertEqual(self.call("POST", "/api/ml/predict/student/1", 2).status_code, 409)
        self.assertEqual(self.call("POST", "/api/ml/parent/predict/1", 5).status_code, 400)
        self.assertFalse(self.call("GET", "/api/ml/parent/readiness/1", 5).json()["pre_complete"])

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
        for failure in (OSError("private artifact path"), ValueError("private artifact path")):
            with patch("backend.routes.ml.predict_student", side_effect=failure):
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
        for months in (36, 48, 60, 66, 71):
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
                    self.assertEqual(result["prediction_status"], "available")
                    self.assertIn(result["predicted_post_interpretation"], ACTIVE_CLASSES)
                    self.assertAlmostEqual(sum(result["class_probabilities"].values()), 1)
                    self.assertEqual(len(result["interventions"]), 7)

    def test_sandbox_raw_scores_override_scaled_and_stale_composites(self):
        from decimal import Decimal, ROUND_HALF_UP
        raw = {code: maximum for code, (_, maximum) in DOMAINS.items()}
        for months in (36, 37, 44, 48, 49, 60, 61, 71):
            with self.subTest(months=months):
                response = self.call("POST", "/api/ml/predict/sandbox", 2, json={
                    **sandbox_features(), "age_months_pre": months, "raw_scores": raw})
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()
                age = float((Decimal(months) / 12).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
                expected = calculate_raw_scores(raw, age)
                features = result["features"]
                self.assertNotIn("raw_scores", features)
                self.assertEqual(len(features), 18)
                for code, (prefix, _) in DOMAINS.items():
                    self.assertEqual(features[f"{prefix}_pre_scaled"], expected["scaled_scores"][code])
                self.assertEqual(features["pre_total_scaled"], expected["sum_of_scaled_scores"])
                self.assertEqual(features["pre_standard_score"], expected["standard_score"])
                self.assertEqual(features["pre_delayed_domains_count"], 0)
                self.assertEqual(result["pre_interpretation"], expected["interpretation"])

    def test_sandbox_age_policy_and_strict_raw_capacities(self):
        raw = dict.fromkeys(DOMAINS, 0)
        invalid = [{"age_months_pre": months} for months in (35, 72, 80, 36.5, True, "66")]
        for code, (_, maximum) in DOMAINS.items():
            for value in (-1, maximum + 1, 1.5, "1", True, None):
                invalid.append({"raw_scores": {**raw, code: value}})
        invalid.extend([{"raw_scores": {key: value for key, value in raw.items() if key != "GM"}},
                        {"raw_scores": {**raw, "unknown": 0}}])
        for changes in invalid:
            with self.subTest(changes=changes):
                response = self.call("POST", "/api/ml/predict/sandbox", 2,
                                     json={**sandbox_features(), **changes})
                self.assertEqual(response.status_code, 422, response.text)

    def test_minimum_raw_and_all_one_scaled_use_actual_calibrated_probabilities(self):
        base = {**sandbox_features(), "gender": "MALE", "handedness": "Left"}
        fixtures = [({"raw_scores": dict.fromkeys(DOMAINS, 0)}, [1, 1, 2, 1, 5, 1, 1], 12),
                    (dict.fromkeys([f"{prefix}_pre_scaled" for prefix, _ in DOMAINS.values()], 1),
                     [1] * 7, 7)]
        for changes, scaled, total in fixtures:
            with self.subTest(raw="raw_scores" in changes):
                response = self.call("POST", "/api/ml/predict/sandbox", 2, json={**base, **changes})
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()
                self.assertEqual([result["features"][f"{p}_pre_scaled"] for p, _ in DOMAINS.values()], scaled)
                self.assertEqual(result["features"]["pre_total_scaled"], total)
                self.assertEqual(result["features"]["pre_standard_score"], 37)
                self.assertEqual(result["features"]["pre_delayed_domains_count"], 7)
                self.assertEqual(result["predicted_post_interpretation"], ACTIVE_CLASSES[0])
                expected = predict_student(result["features"])["class_probabilities"]
                self.assertEqual(result["class_probabilities"], expected)
                self.assertAlmostEqual(sum(result["confidence_percentages"].values()), 100)
                self.assertTrue(all(0 < value < 100 for value in result["confidence_percentages"].values()))

    def test_average_and_severe_acceptance_profiles_through_sandbox(self):
        for scenario in acceptance_profiles():
            if scenario["gender"] != "FEMALE" or scenario["handedness"] != "Right":
                continue
            with self.subTest(name=scenario["name"], age=scenario["age_months"]):
                features = {key: None if key in ("mother_education_level", "father_education_level",
                            "household_occupation_tier", "num_siblings", "birth_order") else value
                            for key, value in scenario["features"].items()}
                payload = {**features, "pre_total_scaled": 0, "pre_standard_score": 37,
                           "pre_delayed_domains_count": 0}
                if scenario["raw_scores"] is not None:
                    payload["raw_scores"] = scenario["raw_scores"]
                response = self.call("POST", "/api/ml/predict/sandbox", 2, json=payload)
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()
                self.assertEqual(result["features"], features)
                self.assertEqual(result["class_probabilities"], predict_student(features)["class_probabilities"])
                if scenario["name"].startswith(("A", "B")):
                    self.assertEqual(result["predicted_post_interpretation"], ACTIVE_CLASSES[2])
                elif scenario["name"] == "C":
                    self.assertEqual(result["predicted_post_interpretation"], ACTIVE_CLASSES[0])


class MLSandboxScoringTests(unittest.TestCase):
    def test_raw_conversion_matches_checklist_for_every_supported_month_and_count(self):
        from decimal import Decimal, ROUND_HALF_UP
        for months in range(36, 72):
            age = float((Decimal(months) / 12).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
            for index, (code, (_, maximum)) in enumerate(DOMAINS.items(), 1):
                for count in range(maximum + 1):
                    raw = {**dict.fromkeys(DOMAINS, 0), code: count}
                    records = [{"domain_id": index, "answer": "KAYA"}] * count
                    self.assertEqual(calculate_raw_scores(raw, age), calculate_scores(records, age))

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
    def test_loader_rejects_uncalibrated_unfitted_and_hybrid_estimators(self):
        import copy
        from types import SimpleNamespace
        from sklearn.ensemble import RandomForestClassifier, VotingClassifier
        bundle = load_model()
        original = bundle["pipeline"].named_steps["classifier"]
        isotonic = copy.copy(original)
        isotonic.method = "isotonic"
        unfitted = copy.copy(original)
        unfitted.calibrated_classifiers_ = []
        wrong_ensemble = copy.copy(original)
        wrong_ensemble.calibrated_classifiers_ = [SimpleNamespace(estimator=SimpleNamespace(
            pipeline_=SimpleNamespace(named_steps={"classifier": object()})))]
        malformed = copy.copy(original)
        malformed.calibrated_classifiers_ = [object()]
        invalid_estimators = []
        for estimator in (RandomForestClassifier(), VotingClassifier([("forest", RandomForestClassifier())])):
            invalid = copy.copy(original)
            invalid.calibrated_classifiers_ = [SimpleNamespace(estimator=SimpleNamespace(
                pipeline_=SimpleNamespace(named_steps={"classifier": estimator}))) ]
            invalid_estimators.append(invalid)
        for classifier in (object(), isotonic, unfitted, wrong_ensemble, malformed, *invalid_estimators):
            load_model.cache_clear()
            pipeline = SimpleNamespace(classes_=bundle["pipeline"].classes_, named_steps={"classifier": classifier})
            with patch("backend.ml.inference.joblib.load", return_value={**bundle, "pipeline": pipeline}):
                with self.assertRaises(ValueError):
                    load_model()
        load_model.cache_clear()

    def test_startup_and_predictions_share_one_loaded_model(self):
        import joblib
        import json
        metrics = json.loads((ARTIFACTS / "evaluation_metrics.json").read_text(encoding="utf-8"))
        self.assertEqual(sha256(ARTIFACTS / "rf_post_test_model.joblib"), metrics["model_sha256"])
        load_model.cache_clear()
        try:
            with patch("backend.ml.inference.joblib.load", wraps=joblib.load) as loader:
                warm_inference()
                predict_student(sandbox_features())
                predict_student(sandbox_features())
                loader.assert_called_once_with(ARTIFACTS / "rf_post_test_model.joblib")
        finally:
            load_model.cache_clear()
