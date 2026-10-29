"""Serializable, fold-local training components; the public contract stays at 18 inputs.

Source is supplied only as training sample weights (2.0 real, 1 synthetic), never
as a predictor. No household value or missingness flag reaches an estimator.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, ClassifierMixin, TransformerMixin, clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.neighbors import NearestNeighbors
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.utils.validation import check_is_fitted

from backend.ml.common import DOMAINS, FEATURES
from backend.utils.eccd_scorer import get_age_bracket, scoring_data

HOUSEHOLD = ["mother_education_level", "father_education_level",
             "household_occupation_tier", "num_siblings", "birth_order"]
DOMAIN_FEATURES = [f"{prefix}_pre_scaled" for prefix, _ in DOMAINS.values()]
COMPOSITES = ["motor_composite", "language_composite", "cog_socio_composite",
              "delay_ratio", "domain_std", "min_domain_score"]
RETAINED_NUMERIC = FEATURES[:11]
CAPACITY_FEATURES = ["capacity_interval_mean", "capacity_interval_lower", "capacity_interval_upper"]
INTERNAL_NUMERIC = RETAINED_NUMERIC + COMPOSITES + CAPACITY_FEATURES
RETAINED_CATEGORICAL = ["gender", "handedness"]


class SupportAwareCalibration(CalibratedClassifierCV):
    """Sigmoid calibration with conservative extrapolation outside training ranges.

    Mix toward empirical priors only outside age-normalized PRE score support.
    The mixing mass is 1-exp(-||range overshoot / training std||_2), without a
    confidence cap or profile-specific rule. This expresses epistemic uncertainty;
    probabilities outside support are not empirically validated recovery rates.
    """

    def fit(self, X, y, sample_weight=None, **fit_params):
        numeric = X[RETAINED_NUMERIC].astype(float)
        self.support_min_ = numeric.min().to_numpy()
        self.support_max_ = numeric.max().to_numpy()
        self.support_scale_ = numeric.std(ddof=0).replace(0, 1).to_numpy()
        super().fit(X, y, sample_weight=sample_weight, **fit_params)
        weights = np.ones(len(X)) if sample_weight is None else np.asarray(sample_weight)
        self.class_prior_ = np.array([weights[np.asarray(y) == label].sum() for label in self.classes_])
        self.class_prior_ /= self.class_prior_.sum()
        return self

    def extrapolation_mass(self, X):
        values = X[RETAINED_NUMERIC].to_numpy(float)
        overshoot = (np.maximum(self.support_min_ - values, 0)
                     + np.maximum(values - self.support_max_, 0)) / self.support_scale_
        # The PRE domain/scoring features are already age-normalized. An unseen
        # age alone must not erase severe observed delays by mixing into a prior.
        return 1 - np.exp(-np.linalg.norm(np.nan_to_num(overshoot[:, :-1]), axis=1))

    def predict_proba(self, X):
        probabilities = super().predict_proba(X)
        mass = self.extrapolation_mass(X)[:, None]
        return (1 - mass) * probabilities + mass * self.class_prior_


class DomainFeatures(TransformerMixin, BaseEstimator):
    """Prune the five uncollected fields before any data-dependent processing."""

    def fit(self, X: pd.DataFrame, y=None):
        if list(X.columns) != FEATURES:
            raise ValueError("Expected the exact ordered 18-feature input contract")
        self.n_features_in_ = len(FEATURES)
        self.feature_names_in_ = np.asarray(FEATURES, dtype=object)
        # Invert fixed official lookup intervals, never POST values or labels.
        self.intervals_ = {}
        for bracket, table in scoring_data.items():
            intervals = {}
            for code, (_, count) in DOMAINS.items():
                lookup = table["domains"][code]
                intervals[code] = {scaled: (min(raw) / count, max(raw) / count,
                    (max(raw) - min(raw) + 1) / count)
                    for scaled in set(lookup.values())
                    for raw in [[int(key) for key, value in lookup.items() if value == scaled]]}
            self.intervals_[bracket] = intervals
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        result = X[RETAINED_NUMERIC + RETAINED_CATEGORICAL].copy()
        scores = result[DOMAIN_FEATURES].astype(float)
        result["motor_composite"] = (scores.gm_pre_scaled + scores.fm_pre_scaled) / 2.0
        result["language_composite"] = (scores.rl_pre_scaled + scores.el_pre_scaled) / 2.0
        result["cog_socio_composite"] = (scores.cog_pre_scaled + scores.se_pre_scaled) / 2.0
        result["delay_ratio"] = result.pre_delayed_domains_count / 7.0
        result["domain_std"] = scores.std(axis=1, ddof=0)
        result["min_domain_score"] = scores.min(axis=1)
        capacity = []
        for values in X[DOMAIN_FEATURES + ["age_months_pre"]].to_numpy(float):
            age = np.floor(values[-1] / 12 * 10 + .5) / 10
            intervals = self.intervals_[get_age_bracket(age)]
            bounds = []
            for code, score in zip(DOMAINS, values[:7]):
                known = intervals[code]
                nearest = min(known, key=lambda value: abs(value - score))
                bounds.append(known[nearest])
            lower, upper, widths = np.asarray(bounds).T
            # Midpoint is an interval proxy, not a recovered observed raw score.
            capacity.append([np.average((lower + upper) / 2, weights=1 / widths),
                             np.max(lower), np.min(upper)])
        result[CAPACITY_FEATURES] = np.asarray(capacity)
        return result


def boundary_weights(X: pd.DataFrame, y: np.ndarray, sample_weight: np.ndarray) -> np.ndarray:
    """Down-weight isolated synthetic contradictions using this fit's rows only.

    Neighbors exclude self. At least 75% must agree on a different outcome in a
    local PRE neighborhood (mean domain distance <=2 scaled points). Real cases
    retain their original weight, including observed classroom recoveries.
    Labels are never changed, and validation/holdout rows never enter this step.
    """
    weights = np.asarray(sample_weight, dtype=float).copy()
    if len(X) < 13:
        return weights
    scores = X[DOMAIN_FEATURES].to_numpy(float)
    scores = SimpleImputer(strategy="median", keep_empty_features=True).fit_transform(scores)
    distances, neighbors = NearestNeighbors(n_neighbors=13).fit(scores).kneighbors(scores)
    for index in range(len(X)):
        if weights[index] > 1:
            continue
        other = neighbors[index] != index
        nearby = neighbors[index][other][:12]
        distance = distances[index][other][:12]
        labels, counts = np.unique(y[nearby], return_counts=True)
        majority = int(counts.argmax())
        if (counts[majority] >= 9 and labels[majority] != y[index]
                and np.mean(distance) / np.sqrt(7) <= 2.0):
            weights[index] *= 0.5
    return weights


class FoldWeightedClassifier(ClassifierMixin, BaseEstimator):
    """Fit preprocessing and boundary weighting anew in every calibration/CV fold.

    Exposes sample_weight directly so CalibratedClassifierCV can safely split it.
    A pipeline nested inside calibration keeps imputation/encoding training-only.
    """

    def __init__(self, estimator):
        self.estimator = estimator

    def fit(self, X: pd.DataFrame, y, sample_weight=None):
        labels = np.asarray(y)
        supplied = np.ones(len(X)) if sample_weight is None else np.asarray(sample_weight)
        weights = boundary_weights(X, labels, supplied)
        processor = ColumnTransformer([
            ("numeric", Pipeline([
                ("imputer", SimpleImputer(strategy="median", add_indicator=False, keep_empty_features=True)),
                ("scaler", StandardScaler()),
            ]), INTERNAL_NUMERIC),
            ("categorical", Pipeline([
                ("imputer", SimpleImputer(strategy="most_frequent", add_indicator=False, keep_empty_features=True)),
                ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
            ]), RETAINED_CATEGORICAL),
        ])
        self.pipeline_ = Pipeline([("domains", DomainFeatures()),
                                   ("preprocessor", processor),
                                   ("classifier", clone(self.estimator))])
        self.pipeline_.fit(X, labels, classifier__sample_weight=weights)
        self.classes_ = self.pipeline_.classes_
        self.n_features_in_ = len(FEATURES)
        self.feature_names_in_ = np.asarray(FEATURES, dtype=object)
        self.weight_summary_ = {"real": int(np.sum(supplied > 1)),
                                "synthetic_downweighted": int(np.sum(weights < supplied)),
                                "min_weight": float(weights.min()), "max_weight": float(weights.max())}
        return self

    def predict_proba(self, X):
        check_is_fitted(self, "pipeline_")
        return self.pipeline_.predict_proba(X)

    def predict(self, X):
        return self.classes_[self.predict_proba(X).argmax(axis=1)]
