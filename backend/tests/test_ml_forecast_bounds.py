"""Database-free regression checks after removing the forecast bounds gate."""
from datetime import date
import json
from decimal import Decimal, ROUND_HALF_UP
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import numpy as np
import pandas as pd

from backend.ml.common import ARTIFACTS, DOMAINS, FEATURES, score_raw, sha256
from backend.ml.inference import load_model
from backend.routes import ml
from backend.schemas.ml import MLFeatures, ParentPredictionResponse


def maximum_profile(months):
    age = float((Decimal(months) / 12).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
    scores = score_raw({code: maximum for code, (_, maximum) in DOMAINS.items()}, age)
    return {**{f"{prefix}_pre_scaled": scores["scaled_scores"][code]
               for code, (prefix, _) in DOMAINS.items()},
            "pre_total_scaled": scores["sum_of_scaled_scores"],
            "pre_standard_score": scores["standard_score"],
            "pre_delayed_domains_count": sum(value <= 6 for value in scores["scaled_scores"].values()),
            "age_months_pre": months, "gender": "MALE", "handedness": "Left",
            "mother_education_level": "College", "father_education_level": "College",
            "household_occupation_tier": "Informal_Daily_Wage", "num_siblings": 10, "birth_order": 2}


class ForecastInferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle = load_model()

    def setUp(self):
        app = FastAPI()
        app.include_router(ml.router)
        app.dependency_overrides[ml.teacher_only] = lambda: object()
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_maximum_raw_cases_and_unchanged_artifact_probabilities(self):
        expected = {
            44: ([14, 15, 16, 12, 13, 19, 14], 103, 138, "Highly Advance"),
            60: ([13, 14, 14, 11, 11, 16, 13], 92, 129, "Slight Advance"),
            66: ([11, 12, 13, 11, 11, 13, 13], 84, 117, "Average"),
        }
        for months, (scaled, total, standard, interpretation) in expected.items():
            with self.subTest(months=months):
                profile = maximum_profile(months)
                self.assertEqual([profile[key] for key in FEATURES[:7]], scaled)
                self.assertEqual(profile["pre_total_scaled"], total)
                self.assertEqual(profile["pre_standard_score"], standard)
                self.assertEqual(profile["pre_delayed_domains_count"], 0)
                pipeline = self.bundle["pipeline"]
                raw = dict(zip(pipeline.classes_, pipeline.predict_proba(pd.DataFrame([profile])[FEATURES])[0]))
                self.assertTrue(all(0 < probability < 1 for probability in raw.values()))
                # Stale composites are normalized by the actual Sandbox endpoint.
                response = self.client.post("/api/ml/predict/sandbox", json={**profile, "pre_total_scaled": 0})
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()
                self.assertEqual(result["features"], profile)
                self.assertEqual(result["pre_interpretation"], interpretation)
                self.assertTrue(all(domain["tier"] == "Average" for domain in result["baseline_domains"]))
                self.assertEqual(result["prediction_status"], "available")
                self.assertIsNone(result["support_reason"])
                self.assertEqual(result["class_probabilities"], raw)
                self.assertEqual(result["confidence_percentages"], {k: v * 100 for k, v in raw.items()})
                # Deliberately compare to inference, without requiring an Average outcome.
                self.assertEqual(result["predicted_post_interpretation"], max(raw, key=raw.get))
        metrics = json.loads((ARTIFACTS / "evaluation_metrics.json").read_text(encoding="utf-8"))
        self.assertEqual(sha256(ARTIFACTS / "rf_post_test_model.joblib"), metrics["model_sha256"])

    def test_valid_sandbox_ages_outside_training_range_are_not_blocked(self):
        for months in (36, 44, 58, 71):
            with self.subTest(months=months):
                response = self.client.post("/api/ml/predict/sandbox", json=maximum_profile(months))
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["prediction_status"], "available")
                self.assertAlmostEqual(sum(response.json()["confidence_percentages"].values()), 100)
        for months in (1, 35, 72, 81, 216):
            with self.subTest(months=months):
                profile = maximum_profile(months)
                response = self.client.post("/api/ml/predict/sandbox", json=profile)
                self.assertEqual(response.status_code, 422)
                # The sandbox age policy does not narrow student/parent features.
                result = ml.prediction_response(MLFeatures(**profile))
                self.assertEqual(result["prediction_status"], "available")

    def test_inference_wrapper_does_not_require_classifier_bounds_metadata(self):
        # The wrapper must delegate to predict_proba rather than inspect fitted bounds.
        # The real estimator retains its own saved calibration metadata unchanged.
        pipeline = SimpleNamespace(classes_=self.bundle["pipeline"].classes_,
                                   predict_proba=Mock(return_value=np.array([[0.2, 0.3, 0.5]])))
        with patch("backend.ml.inference.load_model", return_value={**self.bundle, "pipeline": pipeline}):
            result = ml.prediction_response(MLFeatures(**maximum_profile(44)), {"gm_pre_di_kaya_items": "2"})
        pipeline.predict_proba.assert_called_once()
        self.assertEqual(result["prediction_status"], "available")
        self.assertIsNone(result["support_reason"])
        self.assertEqual(list(result["class_probabilities"].values()), [0.2, 0.3, 0.5])
        self.assertEqual(result["interventions"][0]["di_kaya_items"], [2])

    def test_age_outside_training_range_keeps_forecast_guides_and_parent_projection(self):
        profile = {**maximum_profile(66), "age_months_pre": 44}
        result = ml.prediction_response(MLFeatures(**profile), {"gm_pre_di_kaya_items": "2;3"})
        self.assertEqual(result["prediction_status"], "available")
        self.assertIsNone(result["support_reason"])
        parent = ParentPredictionResponse.model_validate({**result, "student_id": 1,
            "student_name": "Test", "assessment_date": date(2026, 8, 10)}).model_dump()
        self.assertEqual(parent["confidence_percentages"], result["confidence_percentages"])
        self.assertAlmostEqual(sum(parent["confidence_percentages"].values()), 100)
        self.assertNotIn("features", parent)
        self.assertNotIn("imputed_fields", parent)
        self.assertNotIn("class_probabilities", parent)
        self.assertNotIn("di_kaya_items", parent["interventions"][0])
        self.assertTrue(parent["interventions"][0]["home_activity"])

    def test_invalid_or_incomplete_required_inputs_are_not_zero(self):
        for change in ({"gm_pre_scaled": ""}, {"age_months_pre": None}, {"gm_pre_scaled": 1.5},
                       {"age_months_pre": 0}, {"age_months_pre": 217}, {"pre_standard_score": "NaN"}):
            response = self.client.post("/api/ml/predict/sandbox", json={**maximum_profile(44), **change})
            self.assertEqual(response.status_code, 422)

    def test_parent_permission_and_pre_release_gates_precede_forecast(self):
        # No database: exercise route guards with explicitly supplied dependency doubles.
        for predictions, published, complete, expected in (
                (False, True, True, 403), (True, False, True, 403), (True, True, False, 400)):
            db = Mock()
            db.query.return_value.all.return_value = []
            db.query.return_value.filter_by.return_value.all.return_value = []
            with patch.object(ml, "parent_prediction_student", return_value=object()), \
                 patch.object(ml, "permissions_for_student", return_value=SimpleNamespace(
                     allow_parent_predictions=predictions, allow_parent_view_eccd_pre=published)), \
                 patch.object(ml, "pre_readiness", return_value=(complete, "")), \
                 patch.object(ml, "predict_student_record") as forecast:
                with self.assertRaises(HTTPException) as error:
                    ml.predict_parent_record(1, db, object())
                self.assertEqual(error.exception.status_code, expected)
                forecast.assert_not_called()


if __name__ == "__main__":
    unittest.main()
