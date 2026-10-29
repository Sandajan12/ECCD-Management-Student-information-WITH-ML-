"""Cached inference using the trusted, fitted research artifacts; no model refits."""
from __future__ import annotations

from pathlib import Path
from functools import lru_cache
import json

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier, VotingClassifier

from backend.ml.common import ACTIVE_CLASSES, ARTIFACTS, CATEGORICAL_FEATURES, FEATURES, NUMERIC_FEATURES
from backend.ml.prescriptions import recommend


@lru_cache(maxsize=4)
def load_model(model_path: Path = ARTIFACTS / "rf_post_test_model.joblib") -> dict:
    bundle = joblib.load(model_path)
    if bundle["metadata"]["features"] != FEATURES or set(bundle["pipeline"].classes_) != set(ACTIVE_CLASSES):
        raise ValueError("The model does not match the supported 18-feature, three-class contract")
    classifier = getattr(bundle["pipeline"], "named_steps", {}).get("classifier")
    fitted = getattr(classifier, "calibrated_classifiers_", [])
    if not isinstance(classifier, CalibratedClassifierCV) or classifier.method != "sigmoid" or not fitted:
        raise ValueError("The model must be a fitted sigmoid-calibrated ensemble")
    for calibrated in fitted:
        nested = getattr(getattr(calibrated, "estimator", None), "pipeline_", None)
        ensemble = getattr(nested, "named_steps", {}).get("classifier")
        members = getattr(ensemble, "estimators_", [])
        if (not isinstance(ensemble, VotingClassifier) or ensemble.voting != "soft"
                or len(members) != 2
                or not any(isinstance(member, RandomForestClassifier) for member in members)
                or not any(isinstance(member, HistGradientBoostingClassifier) for member in members)):
            raise ValueError("The calibrated model must contain the fitted RF/HGB ensemble")
    return bundle


@lru_cache(maxsize=1)
def load_guides() -> dict:
    return json.loads((ARTIFACTS / "prescriptive_guides.json").read_text(encoding="utf-8"))


def warm_inference() -> None:
    load_model(ARTIFACTS / "rf_post_test_model.joblib")
    load_guides()


def predict_student(student: dict, model_path: Path = ARTIFACTS / "rf_post_test_model.joblib") -> dict:
    """Load only trusted locally generated joblib artifacts (pickle-based format)."""
    missing = set(FEATURES) - set(student)
    if missing:
        raise ValueError(f"Missing feature keys: {sorted(missing)}")
    bundle = load_model(model_path)
    result = {
        "prediction_status": "available",
        "support_reason": None,
        "unsupported_classes": bundle["metadata"]["unsupported_classes"],
        "interventions": recommend(student, load_guides()),
        "interpretation_note": "Research prediction; official assessments remain deterministic and unchanged",
    }
    frame = pd.DataFrame([{key: student[key] for key in FEATURES}]).replace({None: np.nan})
    for key in NUMERIC_FEATURES:
        frame[key] = pd.to_numeric(frame[key], errors="raise")
    for key in CATEGORICAL_FEATURES:
        frame[key] = frame[key].astype(object).where(frame[key].notna(), np.nan)
    pipeline = bundle["pipeline"]
    probabilities = pipeline.predict_proba(frame)[0]
    # Classifier.predict selects the maximum probability too. Reuse this pass
    # instead of preprocessing the frame and walking the forest a second time.
    return {**result, "predicted_post_interpretation": pipeline.classes_[int(np.argmax(probabilities))],
        "class_probabilities": dict(zip(pipeline.classes_.tolist(), map(float, probabilities)))}
