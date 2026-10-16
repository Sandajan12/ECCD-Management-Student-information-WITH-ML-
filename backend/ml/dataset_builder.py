"""Anonymize beneficiary workbooks and generate a seeded three-class hybrid dataset.

Run from repository root: uv run --no-project --python .venv312 python -m backend.ml.dataset_builder
Synthetic household effects are scenario assumptions, not estimates about AMES families.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import sys
import warnings

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
import pandas as pd
from openpyxl import load_workbook
from openpyxl.utils.datetime import from_excel

from backend.ml.common import (ACTIVE_CLASSES, ARTIFACTS, DATA, DOMAINS, FEATURES,
    ROOT, SEED, TARGET, add_scores, sha256, write_json)
from backend.utils.eccd_scorer import calculate_decimal_age, scoring_data

WORKBOOKS = {"MALE": "EasyCD-Checklist-2024-V3. violet MALE 2024-2025.xlsx",
             "FEMALE": "EasyCD-Checklist-2024-V3. violet FEMALE 2024-2025  -.xlsx"}
PERIODS = [("pre", "PR", 11), ("mid", "M", 13), ("post", "PO", 15)]
EDUCATION = ["Elementary", "High School", "Vocational", "College"]
OCCUPATIONS = ["Unemployed", "Informal_Daily_Wage", "Skilled_Regular", "Professional"]


def normalized(value: object) -> str:
    return " ".join(str(value or "").split()).casefold()


def as_date(value: object, epoch: datetime) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (float, int)):
        converted = from_excel(value, epoch)
        return converted.date() if isinstance(converted, datetime) else None
    return None


def completed_months(birth: date, assessed: date) -> int:
    return (assessed.year - birth.year) * 12 + assessed.month - birth.month - (assessed.day < birth.day)


def build_real(raw_dir: Path = ROOT / "raw_data") -> tuple[pd.DataFrame, dict]:
    records: list[dict] = []
    audit: dict = {"seed": SEED, "workbooks": {}, "excluded": [], "deduplications": [],
        "formula_repairs": [], "unmarked_items": [], "duplicate_domain_rows": [],
        "summary_discrepancies": [], "conflicting_marks": [],
        "household_missing_policy": "Preserve missing; training-only imputation"}
    for gender, filename in WORKBOOKS.items():
        path = raw_dir / filename
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="Data Validation extension is not supported")
            workbook = load_workbook(path, data_only=True)
        required = ["Info Sheet", "PR", "M", "PO", *DOMAINS]
        if set(required) - set(workbook.sheetnames):
            raise ValueError(f"Missing required sheet in {gender} workbook")
        info = workbook["Info Sheet"]
        groups: dict[str, list[int]] = defaultdict(list)
        for r in range(4, info.max_row + 1):
            if info.cell(r, 2).value:
                groups[normalized(info.cell(r, 2).value)].append(r)
        audit["workbooks"][gender] = {"sha256": sha256(path), "named_info_rows": sum(map(len, groups.values()))}
        for ordinal, (name, rows) in enumerate(groups.items(), 1):
            student_id = f"REAL-{gender[0]}-{ordinal:02d}"
            # The last valid demographic record supersedes the incomplete duplicate.
            valid = [r for r in rows if as_date(info.cell(r, 10).value, workbook.epoch)]
            if not valid:
                audit["excluded"].append({"student_id": student_id, "reason": "missing birth date"})
                continue
            r = valid[-1]
            if len(rows) > 1:
                audit["deduplications"].append({"student_id": student_id, "info_rows": rows, "kept_info_row": r})
            birth = as_date(info.cell(r, 10).value, workbook.epoch)
            dates = {period: as_date(info.cell(r, col).value, workbook.epoch) for period, _, col in PERIODS}
            if any(d is None for d in dates.values()) or not birth < dates["pre"] < dates["mid"] < dates["post"]:
                raise ValueError(f"Invalid assessment chronology for {student_id}")
            row = {"student_id": student_id, "source": "real", "gender": gender,
                "handedness": {"kanan": "Right", "kaliwa": "Left"}[normalized(info.cell(r, 9).value)],
                "age_months_pre": completed_months(birth, dates["pre"]),
                "mother_education_level": info.cell(r, 25).value,
                "father_education_level": info.cell(r, 21).value,
                "household_occupation_tier": None,
                "num_siblings": info.cell(r, 26).value, "birth_order": info.cell(r, 27).value}
            # Occupations require a reviewed mapping if future real data populates them.
            if info.cell(r, 20).value or info.cell(r, 24).value:
                raise ValueError("Nonblank real occupation requires a reviewed tier mapping")
            domain_rows: dict[str, int] = {}
            missing = []
            for code, (_, count) in DOMAINS.items():
                sheet = workbook[code]
                matches = [dr for dr in range(6, sheet.max_row + 1) if normalized(sheet.cell(dr, 2).value) == name]
                if not matches:
                    missing.append(code)
                    continue
                # Duplicate domain rows follow the same last-occurrence policy as Info Sheet.
                dr = matches[-1]
                if len(matches) > 1:
                    audit["duplicate_domain_rows"].append({"student_id": student_id, "domain": code,
                        "rows": matches, "kept_row": dr, "policy": "last occurrence; not merged"})
                if any(not any(sheet.cell(dr, 3 + 6*i + 2*t + j).value == 1
                    for i in range(count) for j in (0, 1)) for t in range(3)):
                    missing.append(code)
                domain_rows[code] = dr
            if missing:
                audit["excluded"].append({"student_id": student_id, "reason": "no item marks for full domain/period",
                    "domains": missing})
                continue
            for t, (period, sheet_name, _) in enumerate(PERIODS):
                raw = {}
                for code, (prefix, count) in DOMAINS.items():
                    sheet, dr = workbook[code], domain_rows[code]
                    kaya, di_kaya, unmarked = [], [], []
                    for i in range(count):
                        k = sheet.cell(dr, 3 + 6*i + 2*t).value
                        d = sheet.cell(dr, 4 + 6*i + 2*t).value
                        if k == 1 and d == 1:
                            audit["conflicting_marks"].append({"student_id": student_id, "period": period,
                                "domain": code, "item": i+1,
                                "policy": "KAYA takes precedence, matching backend/utils/excel.py importer"})
                        if k not in (None, "", 0, 1) or d not in (None, "", 0, 1):
                            raise ValueError(f"Unknown item mark for {student_id}/{period}/{code}")
                        (kaya if k == 1 else di_kaya if d == 1 else unmarked).append(i+1)
                    raw[code] = len(kaya)
                    row[f"{prefix}_{period}_di_kaya_items"] = ";".join(map(str, di_kaya))
                    row[f"{prefix}_{period}_unmarked_items"] = ";".join(map(str, unmarked))
                    if unmarked:
                        audit["unmarked_items"].append({"student_id": student_id, "period": period,
                            "domain": code, "items": unmarked})
                add_scores(row, period, raw, calculate_decimal_age(birth, dates[period]))
                matrix = workbook[sheet_name]
                matches = [mr for mr in range(14, 44) if normalized(matrix.cell(mr, 4).value) == name]
                if not matches:
                    raise ValueError(f"Missing {sheet_name} summary for {student_id}")
                mr = matches[-1]
                row[f"{period}_teacher_standard_score"] = matrix.cell(mr, 26).value
                row[f"{period}_teacher_interpretation"] = matrix.cell(mr, 27).value
                for offset, code in enumerate(DOMAINS):
                    prefix = DOMAINS[code][0]
                    cached = matrix.cell(mr, 11 + offset*2).value
                    if raw[code] == 0 and cached in (None, ""):
                        audit["formula_repairs"].append({"student_id": student_id, "period": period,
                            "domain": code, "recomputed_raw": 0,
                            "recomputed_scaled": row[f"{prefix}_{period}_scaled"]})
                expected = row[f"{period}_standard_score"]
                cached = row[f"{period}_teacher_standard_score"]
                if cached != expected:
                    audit["summary_discrepancies"].append({"student_id": student_id, "period": period,
                        "cached_standard_score": cached, "recomputed_standard_score": expected})
            records.append(row)
        workbook.close()
    real = pd.DataFrame(records)
    if len(real) != 29 or real.student_id.duplicated().any():
        raise ValueError(f"Expected exactly 29 unique complete beneficiaries, found {len(real)}")
    audit["real_records"] = len(real)
    audit["real_age_months_pre"] = real.age_months_pre.describe().to_dict()
    audit["real_post_class_counts"] = real[TARGET].value_counts().to_dict()
    audit["age_limit_note"] = "Ages above 5.11 use the existing scorer's oldest bracket; no new norms extrapolated."
    return real, audit


def decimal_from_months(months: int) -> float:
    return float((Decimal(int(months)) / 12).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def build_synthetic(real: pd.DataFrame, per_class: int = 500) -> tuple[pd.DataFrame, dict]:
    """Forward simulation then class-balanced rejection sampling; no labels fed into X.

    Age/gender/handedness and period spacing are bootstrapped jointly. A shrunken
    empirical raw-domain covariance provides correlated domain variation. Readiness
    is broadened for stress scenarios; limited-support growth is deliberately below
    observed classroom growth. Neither household priors nor effects are measured.
    """
    rng = np.random.default_rng(SEED)
    sizes = np.array([n for _, n in DOMAINS.values()])
    pre_cols = [f"{p}_pre_raw" for p, _ in DOMAINS.values()]
    post_cols = [f"{p}_post_raw" for p, _ in DOMAINS.values()]
    pre = real[pre_cols].to_numpy(float) / sizes
    post = real[post_cols].to_numpy(float) / sizes
    covariance = np.cov(pre, rowvar=False)
    covariance = 0.8*covariance + 0.2*np.diag(np.diag(covariance)) + np.eye(7)*1e-6
    observed_growth = np.nanmedian(np.divide(post-pre, 1-pre,
        out=np.full_like(pre, np.nan), where=(1-pre) > 0), axis=0)
    observed_growth = np.nan_to_num(observed_growth, nan=0.0)
    counts = dict.fromkeys(ACTIVE_CLASSES, 0)
    records = []
    attempted = 0
    while min(counts.values()) < per_class:
        attempted += 1
        if attempted > 300_000:
            raise RuntimeError("Could not fill attainable-class quotas without changing scoring")
        anchor_index = int(rng.integers(len(real)))
        anchor = real.iloc[anchor_index]
        row = {"source": "synthetic", "gender": anchor.gender, "handedness": anchor.handedness,
            "age_months_pre": int(anchor.age_months_pre)}
        for field in ("mother_education_level", "father_education_level"):
            row[field] = rng.choice(EDUCATION, p=[0.20, 0.50, 0.12, 0.18])
        tier = int(rng.choice(4, p=[0.10, 0.50, 0.30, 0.10]))
        row["household_occupation_tier"] = OCCUPATIONS[tier]
        row["num_siblings"] = int(min(rng.poisson(2.0), 7))
        row["birth_order"] = int(rng.integers(1, row["num_siblings"] + 2))
        residual = rng.multivariate_normal(np.zeros(7), covariance) * 0.25
        # Mixture preserves beneficiary-shaped profiles and extends severity coverage.
        base = pre[anchor_index] if rng.random() < 0.30 else np.full(7, rng.uniform(0.20, 1.0))
        pre_fraction = np.clip(base + residual, 0, 1)
        raw_pre = np.rint(pre_fraction*sizes).astype(int)
        risk = (3-tier)/3 + row["num_siblings"]/7
        risk += sum(EDUCATION.index(row[f]) == 0 for f in ("mother_education_level", "father_education_level"))*0.2
        # Fixed, declared limited-support scenario; no causal claim or real imputation.
        growth = np.clip(0.25*observed_growth - 0.035*risk + rng.normal(0, 0.012, 7), 0, 0.4)
        raw_post = np.maximum(raw_pre, np.rint((pre_fraction + growth*(1-pre_fraction))*sizes).astype(int))
        raw_mid = np.rint(raw_pre + 0.65*(raw_post-raw_pre)).astype(int)
        for period, vector in (("pre", raw_pre), ("mid", raw_mid), ("post", raw_post)):
            offset = int(round((anchor[f"{period}_age_decimal"]-anchor.pre_age_decimal)*12))
            add_scores(row, period, dict(zip(DOMAINS, map(int, vector))),
                       decimal_from_months(row["age_months_pre"]+offset))
        label = row[TARGET]
        if label not in counts:
            raise ValueError("Synthetic outcome outside approved attainable classes")
        if counts[label] >= per_class:
            continue
        counts[label] += 1
        row["student_id"] = f"SYN-{len(records)+1:04d}"
        records.append(row)
    metadata = {"seed": SEED, "synthetic_class_counts": counts, "candidates_generated": attempted,
        "age_anchor": "Joint bootstrap of real PRE age, gender, handedness and inter-period age offsets",
        "raw_domain_covariance": covariance.tolist(), "observed_median_capacity_growth": observed_growth.tolist(),
        "growth_scenario": "clip(0.25*observed_capacity_growth - 0.035*risk + N(0,0.012),0,0.4)",
        "risk_scenario": "(3-occupation_index)/3 + siblings/7 + 0.2 per elementary-educated parent",
        "household_priors": {"education_probabilities": [0.20, 0.50, 0.12, 0.18],
            "occupation_probabilities": [0.10, 0.50, 0.30, 0.10], "siblings": "min(Poisson(2),7)",
            "birth_order": "Uniform integer 1..siblings+1"},
        "assumptions": ["Household priors/effects are illustrative, not measured public-school statistics.",
            "70% of candidate profiles broaden readiness to stress-test attainable outcomes.",
            "Class balance is imposed by rejection sampling after scoring; it is not population prevalence.",
            "Growth is an assumed limited-support scenario, not an estimated untreated trajectory.",
            "All 29 real records anchor simulation: hybrid test/CV are not independent cohort validation."],
        "unsupported_classes": ["Suggests Slightly Advanced Development", "Suggests Highly Advanced Development"]}
    return pd.DataFrame(records), metadata


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=ROOT / "raw_data")
    args = parser.parse_args()
    real, audit = build_real(args.raw_dir)
    synthetic, metadata = build_synthetic(real)
    hybrid = pd.concat([real, synthetic], ignore_index=True)
    if len(hybrid) != 1529 or set(FEATURES) - set(hybrid.columns):
        raise ValueError("Hybrid size or feature contract mismatch")
    DATA.mkdir(parents=True, exist_ok=True)
    for name, frame in (("real_beneficiary_cleaned", real), ("synthetic_eccd_data", synthetic),
                        ("hybrid_eccd_dataset", hybrid)):
        frame.to_csv(DATA / f"{name}.csv", index=False)
    audit["scoring_table_sha256"] = sha256(ROOT.parent / "eccd_scoring_data.json")
    audit["scorer_sha256"] = sha256(ROOT.parent / "utils" / "eccd_scorer.py")
    audit["synthetic_generation"] = metadata
    write_json(ARTIFACTS / "dataset_audit.json", audit)
    print(f"Created {len(real)} real + {len(synthetic)} synthetic = {len(hybrid)} hybrid records")
    print("Synthetic outcomes:", metadata["synthetic_class_counts"])


if __name__ == "__main__":
    main()
