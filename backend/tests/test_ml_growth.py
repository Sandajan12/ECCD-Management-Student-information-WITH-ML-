"""Synthetic growth rules and fixed acceptance scenarios, without learner data."""
import unittest
from unittest.mock import Mock, patch

import numpy as np
import pandas as pd

from backend.ml.common import ACTIVE_CLASSES, DOMAINS, FEATURES, TARGET, score_raw
from backend.ml.dataset_builder import build_synthetic, decimal_from_months, raw_progression
from backend.ml.train_random_forest import acceptance_profiles, behavior_check, finalize
from backend.utils.eccd_scorer import get_age_bracket, scoring_data


class SyntheticGrowthTests(unittest.TestCase):
    def test_normal_domains_preserve_attainable_scaled_level_across_ages(self):
        sizes = np.array([count for _, count in DOMAINS.values()])
        for age in range(36, 72):
            post_age = decimal_from_months(age + 6)
            post_table = scoring_data[get_age_bracket(post_age)]["domains"]
            for index, code in enumerate(DOMAINS):
                for value in range(sizes[index] + 1):
                    raw = sizes.copy()
                    raw[index] = value
                    before = score_raw(dict(zip(DOMAINS, map(int, raw))), decimal_from_months(age))
                    scaled = np.array([before["scaled_scores"][key] for key in DOMAINS])
                    after_raw = raw_progression(raw, scaled, post_age, np.zeros(7))
                    after = score_raw(dict(zip(DOMAINS, map(int, after_raw))), post_age)
                    if scaled[index] >= 8:
                        expected = min(scaled[index], max(post_table[code].values()))
                        self.assertGreaterEqual(after["scaled_scores"][code], expected)
                    np.testing.assert_array_less(raw - 1, after_raw)
                    np.testing.assert_array_less(after_raw, sizes + 1)

    def test_three_delayed_domains_disable_normal_floor(self):
        raw = np.array([5, 5, 14, 3, 5, 12, 15])
        growth = np.full(7, .38)
        sizes = np.array([count for _, count in DOMAINS.values()])
        scaled = np.array([6, 6, 6, 8, 8, 8, 8])
        constrained = np.rint(raw + growth * (sizes - raw)).astype(int)
        np.testing.assert_array_equal(raw_progression(raw, scaled, 5.5, growth), constrained)

    def test_score_seven_bridges_normal_and_constrained_growth(self):
        raw = np.array([8, 8, 15, 3, 5, 12, 15])
        delayed = np.full(7, 8)
        delayed[0] = 6
        intermediate = delayed.copy()
        intermediate[0] = 7
        normal = delayed.copy()
        normal[0] = 8
        growth = np.full(7, .4)
        low = raw_progression(raw, delayed, 5.5, growth)[0]
        high = raw_progression(raw, normal, 5.5, growth)[0]
        actual = raw_progression(raw, intermediate, 5.5, growth)[0]
        self.assertGreater(high, low)
        lookup = scoring_data[get_age_bracket(5.5)]["domains"]["GM"]
        floor = max(raw[0], min(int(key) for key, value in lookup.items() if value >= 7))
        normal_for_seven = int(np.rint(floor + growth[0] * (13 - floor)))
        self.assertEqual(actual, int(np.rint((low + normal_for_seven) / 2)))
        self.assertTrue(low <= actual <= high)

    def test_seeded_generation_has_balanced_official_labels_and_monotone_counts(self):
        anchors = []
        for fraction in (.3, .6, .9):
            row = {"gender": "FEMALE", "handedness": "Right", "age_months_pre": 66,
                   "pre_age_decimal": 5.5, "mid_age_decimal": 5.7, "post_age_decimal": 6.0}
            for prefix, count in DOMAINS.values():
                row[f"{prefix}_pre_raw"] = int(round(fraction * count))
                row[f"{prefix}_post_raw"] = count
            anchors.append(row)
        first, audit = build_synthetic(pd.DataFrame(anchors), per_class=8)
        second, second_audit = build_synthetic(pd.DataFrame(anchors), per_class=8)
        pd.testing.assert_frame_equal(first, second)
        self.assertEqual(audit, second_audit)
        self.assertEqual(first[TARGET].value_counts().to_dict(), dict.fromkeys(ACTIVE_CLASSES, 8))
        self.assertTrue(first.age_months_pre.between(36, 71).all())
        self.assertEqual(sum(audit["candidate_age_counts"].values()), audit["candidates_generated"])
        self.assertGreater(sum(audit["excluded_advanced_post_counts"].values()), 0)
        for prefix, count in DOMAINS.values():
            self.assertTrue((first[f"{prefix}_pre_raw"] <= first[f"{prefix}_mid_raw"]).all())
            self.assertTrue((first[f"{prefix}_mid_raw"] <= first[f"{prefix}_post_raw"]).all())
            self.assertTrue(first[f"{prefix}_post_raw"].between(0, count).all())
        for row in first.to_dict("records"):
            raw = {code: row[f"{prefix}_post_raw"] for code, (prefix, _) in DOMAINS.items()}
            self.assertEqual(score_raw(raw, row["post_age_decimal"])["standard_score"], row["post_standard_score"])


class ProfileGateTests(unittest.TestCase):
    def test_failed_selection_or_profile_never_reaches_holdout(self):
        model = Mock()
        selection = {"manifest": {"fixture": True}, "eligible": False, "pipeline": model,
                     "selected": {"runtime_compatible": True}}
        with patch("backend.ml.train_random_forest.manifest", return_value=selection["manifest"]):
            with self.assertRaisesRegex(ValueError, "holdout not evaluated"):
                finalize(selection, None, None, None)
            selection["eligible"] = True
            with patch("backend.ml.train_random_forest.behavior_check", return_value={"passed": False}):
                with self.assertRaisesRegex(ValueError, "holdout not evaluated"):
                    finalize(selection, None, None, None)
        model.predict_proba.assert_not_called()

    def test_fixed_scaled_and_raw_profiles_have_authoritative_composites(self):
        profiles = acceptance_profiles()
        self.assertEqual(len(profiles), 56)
        for row in profiles:
            self.assertEqual(set(row["features"]), set(FEATURES))
            if row["name"] in ("A", "B", "C"):
                expected = {"A": (74, 103), "B": (75, 104), "C": (7, 37)}[row["name"]]
                self.assertEqual((row["features"]["pre_total_scaled"], row["features"]["pre_standard_score"]), expected)
            if row["raw_scores"] is not None:
                scores = score_raw(row["raw_scores"], decimal_from_months(row["age_months"]))
                self.assertEqual(row["features"]["pre_total_scaled"], scores["sum_of_scaled_scores"])
                if row["name"] == "B_raw":
                    self.assertEqual(row["features"]["pre_standard_score"], 104)

    def test_profile_probability_bands_block_publication(self):
        class ScenarioModel:
            classes_ = np.array(sorted(ACTIVE_CLASSES))

            def __init__(self, average=.90, severe=.70):
                self.average, self.severe = average, severe

            def predict_proba(self, X):
                probabilities = []
                for _, row in X.iterrows():
                    if row.pre_total_scaled == 7:
                        probabilities.append([(1-self.severe)/2, self.severe, (1-self.severe)/2])
                    else:
                        probabilities.append([self.average, (1-self.average)/2, (1-self.average)/2])
                return np.asarray(probabilities)

        self.assertTrue(behavior_check(ScenarioModel())["passed"])
        for average, severe in ((.7499, .70), (.90, .6499), (.90, .9001)):
            self.assertFalse(behavior_check(ScenarioModel(average, severe))["passed"])
        for severe in (.65, .90):
            self.assertTrue(behavior_check(ScenarioModel(severe=severe))["passed"])


if __name__ == "__main__":
    unittest.main()
