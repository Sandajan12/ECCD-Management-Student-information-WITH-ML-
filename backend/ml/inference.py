"""Local single-student inference only; never imports or registers an API route."""
from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from backend.ml.common import ARTIFACTS, CATEGORICAL_FEATURES, FEATURES, NUMERIC_FEATURES
from backend.ml.prescriptions import recommend


def predict_student(student: dict, model_path: Path = ARTIFACTS / "rf_post_test_model.joblib") -> dict:
    """Load only trusted locally generated joblib artifacts (pickle-based format)."""
    missing = set(FEATURES) - set(student)
    if missing:
        raise ValueError(f"Missing feature keys: {sorted(missing)}")
    bundle = joblib.load(model_path)
    frame = pd.DataFrame([{key: student[key] for key in FEATURES}]).replace({None: np.nan})
    for key in NUMERIC_FEATURES:
        frame[key] = pd.to_numeric(frame[key], errors="raise")
    for key in CATEGORICAL_FEATURES:
        frame[key] = frame[key].astype(object).where(frame[key].notna(), np.nan)
    pipeline = bundle["pipeline"]
    probabilities = pipeline.predict_proba(frame)[0]
    return {"predicted_post_interpretation": pipeline.predict(frame)[0],
        "class_probabilities": dict(zip(pipeline.classes_.tolist(), map(float, probabilities))),
        "unsupported_classes": bundle["metadata"]["unsupported_classes"],
        "interventions": recommend(student),
        "interpretation_note": "Research prediction; official assessments remain deterministic and unchanged"}
