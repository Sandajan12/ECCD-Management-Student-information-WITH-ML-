"""Feature contract and deterministic scoring shared by offline ML scripts."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

from backend.utils.eccd_scorer import calculate_scores

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
ARTIFACTS = ROOT / "artifacts"
SEED = 42
DOMAINS = {"GM": ("gm", 13), "FM": ("fm", 11), "SH": ("sh", 27),
           "RL": ("rl", 5), "EL": ("el", 8), "C": ("cog", 21), "SE": ("se", 24)}
DOMAIN_NAMES = dict(zip(DOMAINS, ("Gross Motor", "Fine Motor", "Self-Help",
    "Receptive Language", "Expressive Language", "Cognitive", "Socio-Emotional")))
CLASSES = ["Suggests Significant Delay in Overall Development",
           "Suggests Slight Delay in Overall Development", "Average Overall Development",
           "Suggests Slightly Advanced Development", "Suggests Highly Advanced Development"]
ACTIVE_CLASSES = CLASSES[:3]
SHORT_CLASSES = ["Significant delay", "Slight delay", "Average", "Slightly advanced", "Highly advanced"]
NUMERIC_FEATURES = [f"{prefix}_pre_scaled" for prefix, _ in DOMAINS.values()] + [
    "pre_total_scaled", "pre_standard_score", "pre_delayed_domains_count", "age_months_pre",
    "num_siblings", "birth_order"]
CATEGORICAL_FEATURES = ["gender", "handedness", "mother_education_level",
                        "father_education_level", "household_occupation_tier"]
# Public order follows the requested baseline / demographic / household groups.
FEATURES = NUMERIC_FEATURES[:11] + ["gender", "handedness", "mother_education_level",
    "father_education_level", "household_occupation_tier", "num_siblings", "birth_order"]
TARGET = "post_interpretation"


def interpretation(score: int | float) -> str:
    return CLASSES[int(np.searchsorted([69, 79, 119, 129], score, side="left"))]


def score_raw(raw: dict[str, int], decimal_age: float) -> dict:
    """Call the application scorer, including its closest-lower lookup fallback."""
    evaluations = []
    for index, code in enumerate(DOMAINS, 1):
        if not 0 <= raw[code] <= DOMAINS[code][1]:
            raise ValueError(f"Invalid raw score for {code}: {raw[code]}")
        evaluations.extend({"domain_id": index, "answer": "KAYA"} for _ in range(raw[code]))
    return calculate_scores(evaluations, decimal_age)


def add_scores(row: dict, period: str, raw: dict[str, int], decimal_age: float) -> dict:
    scores = score_raw(raw, decimal_age)
    for code, (prefix, _) in DOMAINS.items():
        row[f"{prefix}_{period}_raw"] = raw[code]
        row[f"{prefix}_{period}_scaled"] = scores["scaled_scores"][code]
    row[f"{period}_total_scaled"] = scores["sum_of_scaled_scores"]
    row[f"{period}_standard_score"] = scores["standard_score"]
    row[f"{period}_interpretation"] = interpretation(scores["standard_score"])
    row[f"{period}_scorer_interpretation"] = scores["interpretation"]
    row[f"{period}_age_decimal"] = decimal_age
    row[f"{period}_age_bracket"] = scores["bracket"]
    if period == "pre":
        row["pre_delayed_domains_count"] = sum(v <= 6 for v in scores["scaled_scores"].values())
    return scores


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
