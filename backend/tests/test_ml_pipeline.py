"""Regressions for household invariance, fold isolation and projection uncertainty."""
import io
import json
import unittest
from unittest.mock import patch

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score

from backend.ml.common import ACTIVE_CLASSES, ARTIFACTS, DATA, FEATURES, TARGET, sha256
from backend.ml.pipeline import (DOMAIN_FEATURES, HOUSEHOLD, INTERNAL_NUMERIC,
                                 DomainFeatures, FoldWeightedClassifier, boundary_weights)
from backend.ml.train_random_forest import all_one_profiles, behavior_check, make_pipeline


class MLPipelineTests(unittest.TestCase):
    def test_household_values_never_reach_transformer_output(self):
        rows = all_one_profiles()
        transformed = DomainFeatures().fit_transform(rows)
        pd.testing.assert_series_equal(transformed.iloc[0], transformed.iloc[1], check_names=False)
        self.assertFalse(set(HOUSEHOLD) & set(transformed))

    def test_domain_composites_preserve_population_std_and_extremes(self):
        rows = all_one_profiles()
        rows.loc[0, DOMAIN_FEATURES] = [1, 3, 5, 7, 9, 11, 13]
        rows.loc[0, "pre_delayed_domains_count"] = 3
        result = DomainFeatures().fit_transform(rows).iloc[0]
        self.assertEqual(result.motor_composite, 2)
        self.assertEqual(result.language_composite, 8)
        self.assertEqual(result.cog_socio_composite, 12)
        self.assertAlmostEqual(result.delay_ratio, 3 / 7)
        self.assertAlmostEqual(result.domain_std, np.std([1, 3, 5, 7, 9, 11, 13]))
        self.assertEqual(result.min_domain_score, 1)

    def test_boundary_contradiction_is_downweighted_real_recovery_is_preserved(self):
        X = pd.concat([all_one_profiles().iloc[[0]]] * 30, ignore_index=True)
        X = X.astype(dict.fromkeys(DOMAIN_FEATURES, float))
        # Unique close points avoid duplicate-distance/self ordering assumptions.
        for index in range(len(X)):
            X.loc[index, DOMAIN_FEATURES] = 3 + index * .01
        labels = np.array([ACTIVE_CLASSES[0]] * 30, dtype=object)
        labels[10] = labels[20] = ACTIVE_CLASSES[2]
        supplied = np.ones(30)
        supplied[20] = 2.5
        weights = boundary_weights(X, labels, supplied)
        self.assertEqual(weights[10], .5)
        self.assertEqual(weights[20], 2.5)
        np.testing.assert_array_equal(supplied, np.where(np.arange(30) == 20, 2.5, 1))

    def test_capacity_intervals_use_fixed_pre_scoring_ranges(self):
        result = DomainFeatures().fit_transform(all_one_profiles()).iloc[0]
        counts = np.array([13, 11, 27, 5, 8, 21, 24])
        maximum_raw = np.array([10, 5, 19, 2, 7, 9, 15])
        midpoint = maximum_raw / counts / 2
        widths = (maximum_raw + 1) / counts
        self.assertAlmostEqual(result.capacity_interval_mean, np.average(midpoint, weights=1 / widths))
        self.assertEqual(result.capacity_interval_lower, 0)
        self.assertAlmostEqual(result.capacity_interval_upper, .4)

    def test_calibration_subfolds_refit_weights_and_preprocessing(self):
        rows = []
        for score in (1, 5, 10):
            for index in range(18):
                row = all_one_profiles().iloc[0].copy()
                row[DOMAIN_FEATURES] = score
                row["pre_total_scaled"] = score * 7
                row["pre_standard_score"] = 37 + score * 5
                rows.append(row)
        X = pd.DataFrame(rows)[FEATURES].reset_index(drop=True)
        y = np.repeat(ACTIVE_CLASSES, 18)
        X.loc[0, "age_months_pre"] = 150
        seen = []
        original_fit = FoldWeightedClassifier.fit

        def recording_fit(estimator, fit_X, fit_y, sample_weight=None):
            seen.append(set(fit_X.index))
            return original_fit(estimator, fit_X, fit_y, sample_weight)

        estimator = RandomForestClassifier(n_estimators=8, min_samples_leaf=3, random_state=42)
        pipeline = make_pipeline(estimator)
        with patch.object(FoldWeightedClassifier, "fit", recording_fit):
            pipeline.fit(X, y, classifier__sample_weight=np.ones(len(X)))
        self.assertEqual([len(indices) for indices in seen], [36, 36, 36, 54])
        # Each row is excluded from exactly one inner fit; final refit uses all 54.
        for index in X.index:
            self.assertEqual(sum(index in indices for indices in seen[:3]), 2)
        clone(pipeline)  # Persistence/clone relies on sklearn's estimator contract.
        stream = io.BytesIO()
        joblib.dump(pipeline, stream)
        stream.seek(0)
        np.testing.assert_allclose(joblib.load(stream).predict_proba(X), pipeline.predict_proba(X))

    def test_saved_model_household_invariance_for_all_holdout_rows(self):
        bundle = joblib.load(ARTIFACTS / "rf_post_test_model.joblib")
        model = bundle["pipeline"]
        X = pd.read_csv(DATA / "test_set_30.csv")[FEATURES]
        blank, filled = X.copy(), X.copy()
        blank[HOUSEHOLD] = np.nan
        for name, value in all_one_profiles().iloc[1][HOUSEHOLD].items():
            filled[name] = value
        np.testing.assert_array_equal(model.predict_proba(blank), model.predict_proba(filled))
        self.assertTrue(behavior_check(model)["passed"])
        probabilities = model.predict_proba(pd.concat([X, all_one_profiles()], ignore_index=True))
        self.assertTrue(np.all((probabilities > 0) & (probabilities < 1)))
        np.testing.assert_allclose(probabilities.sum(axis=1), 1)

    def test_extrapolation_prior_uses_training_rows_only(self):
        bundle = joblib.load(ARTIFACTS / "rf_post_test_model.joblib")
        calibration = bundle["pipeline"].named_steps["classifier"]
        train = pd.read_csv(DATA / "train_set_70.csv")
        np.testing.assert_array_equal(calibration.support_min_, train[FEATURES[:11]].min().to_numpy())
        np.testing.assert_array_equal(calibration.support_max_, train[FEATURES[:11]].max().to_numpy())
        np.testing.assert_array_equal(calibration.extrapolation_mass(train[FEATURES]), 0)
        self.assertGreater(calibration.extrapolation_mass(all_one_profiles())[0], 0)
        raw = calibration.calibrated_classifiers_[0].estimator.pipeline_
        self.assertEqual(raw.named_steps["preprocessor"].transformers_[0][2], INTERNAL_NUMERIC)
        self.assertIsNone(raw.named_steps["preprocessor"].named_transformers_["numeric"].named_steps["imputer"].indicator_)

    def test_all_one_risk_and_recovery_are_stable_across_sandbox_ages(self):
        model = joblib.load(ARTIFACTS / "rf_post_test_model.joblib")["pipeline"]
        calibration = model.named_steps["classifier"]
        baseline_mass = calibration.extrapolation_mass(all_one_profiles())
        for age in (1, 36, 48, 60, 66, 80, 216):
            with self.subTest(age=age):
                rows = all_one_profiles()
                rows["age_months_pre"] = age
                probabilities = model.predict_proba(rows)
                np.testing.assert_array_equal(probabilities[0], probabilities[1])
                np.testing.assert_allclose(calibration.extrapolation_mass(rows), baseline_mass)
                self.assertEqual(model.classes_[probabilities[0].argmax()], ACTIVE_CLASSES[0])
                self.assertTrue(.50 <= probabilities[0].max() <= .85)
                recovery = 1 - probabilities[0, model.classes_.tolist().index(ACTIVE_CLASSES[0])]
                self.assertTrue(.15 <= recovery <= .45)

    def test_saved_artifact_gates_are_independently_reproducible(self):
        model_path = ARTIFACTS / "rf_post_test_model.joblib"
        bundle = joblib.load(model_path)
        metrics = json.loads((ARTIFACTS / "evaluation_metrics.json").read_text())
        test = pd.read_csv(DATA / "test_set_30.csv")
        predicted = bundle["pipeline"].predict(test[FEATURES])
        accuracy = accuracy_score(test[TARGET], predicted)
        macro_f1 = f1_score(test[TARGET], predicted, labels=ACTIVE_CLASSES, average="macro")
        self.assertEqual(len(test), 459)
        self.assertEqual(bundle["metadata"]["features"], FEATURES)
        self.assertEqual(bundle["metadata"]["train_count"], 1070)
        self.assertEqual(bundle["metadata"], metrics["metadata"])
        self.assertEqual(metrics["model_sha256"], sha256(model_path))
        self.assertAlmostEqual(metrics["holdout"]["accuracy"], accuracy)
        self.assertAlmostEqual(metrics["holdout"]["macro_f1"], macro_f1)
        self.assertGreaterEqual(accuracy, .90)
        self.assertGreaterEqual(macro_f1, .90)
        self.assertGreaterEqual(metrics["cross_validation"]["mean_accuracy"], .90)
        self.assertTrue(all(metrics["acceptance_gates"].values()))


if __name__ == "__main__":
    unittest.main()
