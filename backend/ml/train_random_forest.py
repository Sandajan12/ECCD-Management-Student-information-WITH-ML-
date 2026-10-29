"""Select calibrated ensembles on training CV; evaluate the 30% holdout once."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import platform
import sys

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier, VotingClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix,
                            log_loss, precision_recall_fscore_support)
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from threadpoolctl import threadpool_limits

from backend.ml.common import (ACTIVE_CLASSES, ARTIFACTS, CLASSES, DATA, DOMAINS, FEATURES,
                               ROOT, SEED, TARGET, sandbox_composites, score_raw, sha256, write_json)
from backend.ml.dataset_builder import decimal_from_months
from backend.ml.pipeline import (CAPACITY_FEATURES, COMPOSITES, DOMAIN_FEATURES, HOUSEHOLD, INTERNAL_NUMERIC,
                                 RETAINED_CATEGORICAL, FoldWeightedClassifier, SupportAwareCalibration)
from backend.ml.plots import make_plots
from backend.ml.prescriptions import recommend, save_guides
from backend.utils.eccd_scorer import get_age_bracket, scoring_data

SELECTION = ARTIFACTS / "accuracy_90plus_selection.local"
REAL_WEIGHT = 2.0
PROFILE_GATES = {"A": .75, "B": .60, "C_significant_delay_min": .65, "C_significant_delay_max": .90}


def acceptance_profiles() -> list[dict]:
    """Fixed research scenarios, never appended to training or used as labels."""
    profiles = []
    scaled_targets = {"A": [10, 12, 10, 10, 10, 12, 10],
                      "B": [11, 12, 11, 11, 6, 12, 12], "C": [1] * 7}
    raw_targets = {38: {"A_raw": [10, 12, 10, 10, 11, 12, 10],
                        "B_raw": [11, 12, 12, 10, 6, 12, 12]},
                   66: {"A_raw": [11, 12, 10, 11, 11, 12, 10],
                        "B_raw": [11, 12, 12, 11, 5, 11, 13]}}
    for age in (38, 66):
        table = scoring_data[get_age_bracket(decimal_from_months(age))]["domains"]
        for name in (*scaled_targets, "A_raw", "B_raw", "raw_zero", "raw_one"):
            raw = None
            if name in raw_targets[age]:
                raw = {code: min(int(key) for key, value in table[code].items() if value == target)
                       for code, target in zip(DOMAINS, raw_targets[age][name])}
            elif name in ("raw_zero", "raw_one"):
                raw = dict.fromkeys(DOMAINS, 0 if name == "raw_zero" else 1)
            scaled = scaled_targets.get(name)
            if raw is not None:
                scores = score_raw(raw, decimal_from_months(age))
                scaled = [scores["scaled_scores"][code] for code in DOMAINS]
            for gender in ("FEMALE", "MALE"):
                for handedness in ("Right", "Left"):
                    row = {**dict(zip(DOMAIN_FEATURES, scaled)), "age_months_pre": age,
                           "gender": gender, "handedness": handedness, **dict.fromkeys(HOUSEHOLD, np.nan)}
                    row.update(sandbox_composites(row))
                    profiles.append({"name": name, "age_months": age, "gender": gender,
                                     "handedness": handedness, "raw_scores": raw, "features": row})
    return profiles


def make_pipeline(estimator=None) -> Pipeline:
    if estimator is None:
        estimator = RandomForestClassifier(n_estimators=300, min_samples_leaf=3,
            max_features=0.8, class_weight="balanced", n_jobs=1, random_state=SEED)
    calibration = SupportAwareCalibration(FoldWeightedClassifier(estimator), method="sigmoid",
        cv=StratifiedKFold(3, shuffle=True, random_state=SEED), ensemble=False, n_jobs=1)
    return Pipeline([("classifier", calibration)])


def candidates() -> dict:
    forests = {
        "rf_full_leaf3": RandomForestClassifier(n_estimators=400,
            min_samples_leaf=3, max_features=0.8, class_weight="balanced", n_jobs=1, random_state=SEED),
        "rf_full_leaf5": RandomForestClassifier(n_estimators=400, min_samples_leaf=5,
            max_features=0.8, class_weight="balanced", n_jobs=1, random_state=SEED),
    }
    histogram = HistGradientBoostingClassifier(max_iter=250, learning_rate=0.10,
        max_leaf_nodes=7, min_samples_leaf=20, l2_regularization=5.0,
        early_stopping=False, random_state=SEED)
    return {**forests, "histogram_boosting": histogram,
        "soft_voting_rf_histogram": VotingClassifier(
            [("forest", forests["rf_full_leaf3"]), ("histogram", histogram)],
            voting="soft", weights=[1, 1], n_jobs=1),
        "soft_voting_forest_weight2": VotingClassifier(
            [("forest", forests["rf_full_leaf3"]), ("histogram", histogram)],
            voting="soft", weights=[2, 1], n_jobs=1)}


def evaluate(actual, predicted, labels=ACTIVE_CLASSES) -> dict:
    result = {"accuracy": float(accuracy_score(actual, predicted)), "n": len(actual)}
    for average in ("macro", "weighted"):
        p, r, f, _ = precision_recall_fscore_support(actual, predicted, labels=labels,
            average=average, zero_division=0)
        result.update({f"{average}_precision": float(p), f"{average}_recall": float(r),
                       f"{average}_f1": float(f)})
    return result


def probability_metrics(actual, probabilities, classes) -> dict:
    labels = np.asarray(actual)
    one_hot = (labels[:, None] == np.asarray(classes)[None, :]).astype(float)
    confidence = probabilities.max(axis=1)
    correct = np.asarray(classes)[probabilities.argmax(axis=1)] == labels
    bins = []
    for index in range(10):
        mask = np.minimum((confidence * 10).astype(int), 9) == index
        if mask.any():
            bins.append({"n": int(mask.sum()), "confidence": float(confidence[mask].mean()),
                         "accuracy": float(correct[mask].mean())})
    return {"log_loss": float(log_loss(labels, probabilities, labels=classes)),
        "multiclass_brier_sum": float(np.mean(np.sum((probabilities - one_hot)**2, axis=1))),
        "top_label_ece_10_bins": float(sum(b["n"] * abs(b["confidence"] - b["accuracy"])
                                           for b in bins) / len(labels)),
        "maximum_probability": float(confidence.max()), "reliability_bins": bins}


def all_one_profiles() -> pd.DataFrame:
    blank = {**dict.fromkeys(DOMAIN_FEATURES, 1), "pre_total_scaled": 7,
        "pre_standard_score": 37, "pre_delayed_domains_count": 7,
        "age_months_pre": 66, "gender": "FEMALE", "handedness": "Right",
        **dict.fromkeys(HOUSEHOLD, np.nan)}
    filled = {**blank, "mother_education_level": "College", "father_education_level": "High School",
              "household_occupation_tier": "Skilled_Regular", "num_siblings": 2, "birth_order": 1}
    return pd.DataFrame([blank, filled])[FEATURES]


def behavior_check(pipeline: Pipeline) -> dict:
    scenarios = acceptance_profiles()
    rows = []
    for scenario in scenarios:
        blank = scenario["features"]
        filled = {**blank, **all_one_profiles().iloc[1][HOUSEHOLD].to_dict()}
        rows.extend([blank, filled])
    probabilities = pipeline.predict_proba(pd.DataFrame(rows)[FEATURES])
    classes = pipeline.classes_.tolist()
    checks = []
    for index, scenario in enumerate(scenarios):
        blank, filled = probabilities[index * 2:index * 2 + 2]
        name = scenario["name"]
        predicted = classes[int(blank.argmax())]
        invariant = bool(np.array_equal(blank, filled))
        valid = bool(np.all((blank > 0) & (blank < 1)) and np.isclose(blank.sum(), 1))
        if name.startswith(("A", "B")):
            gate = predicted == ACTIVE_CLASSES[2] and blank[classes.index(ACTIVE_CLASSES[2])] >= PROFILE_GATES[name[0]]
        elif name == "C":
            gate = (predicted == ACTIVE_CLASSES[0] and PROFILE_GATES["C_significant_delay_min"]
                    <= blank[classes.index(ACTIVE_CLASSES[0])] <= PROFILE_GATES["C_significant_delay_max"])
        else:
            gate = True  # Raw minima are reported separately from scaled all-1.
        checks.append({**{key: value for key, value in scenario.items() if key != "features"},
            "scaled": [int(scenario["features"][key]) for key in DOMAIN_FEATURES],
            "total": scenario["features"]["pre_total_scaled"],
            "standard_score": scenario["features"]["pre_standard_score"],
            "blank": dict(zip(classes, map(float, blank))), "filled": dict(zip(classes, map(float, filled))),
            "predicted_class": predicted, "household_invariant": invariant,
            "passed": bool(invariant and valid and gate)})
    reference = next(row for row in checks if row["name"] == "C" and row["age_months"] == 66
                     and row["gender"] == "FEMALE" and row["handedness"] == "Right")
    confidence = max(reference["blank"].values())
    recovery = 1 - reference["blank"][ACTIVE_CLASSES[0]]
    return {"profile": {"domains": 1, "total": 7, "standard_score": 37, "age_months": 66,
                         "gender": "FEMALE", "handedness": "Right"},
        "blank": reference["blank"], "filled": reference["filled"],
        "predicted_class": reference["predicted_class"], "household_invariant": all(row["household_invariant"] for row in checks),
        "confidence": confidence, "recovery_probability_average_or_slight": recovery,
        "thresholds": PROFILE_GATES, "profiles": checks, "passed": all(row["passed"] for row in checks)}


def manifest() -> dict:
    return {"dataset": sha256(DATA / "hybrid_eccd_dataset.csv"),
            "training": sha256(DATA / "train_set_70.csv"),
            "trainer": sha256(Path(__file__)), "components": sha256(ROOT / "pipeline.py"),
            "builder": sha256(ROOT / "dataset_builder.py"),
            "scoring_table": sha256(ROOT.parent / "eccd_scoring_data.json"), "profile_gates": PROFILE_GATES,
            "sklearn": sklearn.__version__}


def select_on_training(train: pd.DataFrame) -> dict:
    folds = list(StratifiedKFold(5, shuffle=True, random_state=SEED).split(train, train[TARGET]))
    X, y = train[FEATURES], train[TARGET]
    weights = np.where(train.source == "real", REAL_WEIGHT, 1.0)
    summaries, fitted = [], {}
    for name, estimator in candidates().items():
        print(f"Training-only CV: {name}", flush=True)
        scores, oof, raw_oof = [], np.zeros((len(train), 3)), np.zeros((len(train), 3))
        for number, (fit_index, validation_index) in enumerate(folds, 1):
            pipeline = make_pipeline(estimator)
            pipeline.fit(X.iloc[fit_index], y.iloc[fit_index], classifier__sample_weight=weights[fit_index])
            probabilities = pipeline.predict_proba(X.iloc[validation_index])
            oof[validation_index] = probabilities
            raw = pipeline.named_steps["classifier"].calibrated_classifiers_[0].estimator
            raw_oof[validation_index] = raw.predict_proba(X.iloc[validation_index])
            scores.append(evaluate(y.iloc[validation_index], pipeline.classes_[probabilities.argmax(axis=1)]))
            print(f"  fold {number}: accuracy={scores[-1]['accuracy']:.4f}, F1={scores[-1]['macro_f1']:.4f}", flush=True)
        pipeline = make_pipeline(estimator)
        pipeline.fit(X, y, classifier__sample_weight=weights)
        behavior = behavior_check(pipeline)
        row = {"name": name, "params": {"candidate": name, "real_weight": REAL_WEIGHT,
                "calibration": "sigmoid", "calibration_folds": 3,
                "estimator_parameters": {key: value for key, value in estimator.get_params(deep=True).items()
                    if value is None or isinstance(value, (str, int, float, bool))}},
            "mean_accuracy": float(np.mean([s["accuracy"] for s in scores])),
            "std_accuracy": float(np.std([s["accuracy"] for s in scores])),
            "mean_macro_f1": float(np.mean([s["macro_f1"] for s in scores])),
            "std_macro_f1": float(np.std([s["macro_f1"] for s in scores])),
            "fold_accuracy": [s["accuracy"] for s in scores],
            "fold_macro_f1": [s["macro_f1"] for s in scores],
            "calibrated_oof": probability_metrics(y, oof, pipeline.classes_),
            "uncalibrated_oof": probability_metrics(y, raw_oof, pipeline.classes_),
            "runtime_compatible": isinstance(estimator, VotingClassifier), "behavior": behavior}
        summaries.append(row)
        fitted[name] = {"pipeline": pipeline, "oof": oof}
        print(json.dumps({"candidate": name, "CV_accuracy": row["mean_accuracy"],
            "CV_macro_f1": row["mean_macro_f1"], "profiles_passed": behavior["passed"],
            "failed_profiles": [{key: r[key] for key in ("name", "age_months", "gender", "handedness", "blank")}
                                for r in behavior["profiles"] if not r["passed"]]}), flush=True)
    eligible = [s for s in summaries if s["runtime_compatible"] and s["behavior"]["passed"]
                and s["mean_accuracy"] >= .90 and s["mean_macro_f1"] >= .90]
    winner = max(eligible or summaries, key=lambda row: (row["mean_macro_f1"], row["mean_accuracy"],
                                                       -row["calibrated_oof"]["log_loss"]))
    selection = {**fitted[winner["name"]], "selected": winner, "candidates": summaries,
                 "eligible": bool(eligible), "manifest": manifest()}
    joblib.dump(selection, SELECTION, compress=3)
    return selection


def feature_importances(pipeline: Pipeline, train: pd.DataFrame) -> tuple[dict, dict]:
    """Training-only descriptive permutation importance, mapped through composites."""
    nested = pipeline.named_steps["classifier"].calibrated_classifiers_[0].estimator.pipeline_
    transformed = nested[:-1].transform(train[FEATURES])
    processor = nested.named_steps["preprocessor"]
    values = permutation_importance(nested.named_steps["classifier"], transformed, train[TARGET],
        scoring="f1_macro", n_repeats=5, random_state=SEED, n_jobs=1).importances_mean
    values = np.maximum(values, 0)
    internal = dict(zip(INTERNAL_NUMERIC, map(float, values[processor.output_indices_["numeric"]])))
    encoded = values[processor.output_indices_["categorical"]]
    encoder = processor.named_transformers_["categorical"].named_steps["encoder"]
    offset = 0
    for name, categories in zip(RETAINED_CATEGORICAL, encoder.categories_):
        internal[name] = float(encoded[offset:offset + len(categories)].sum())
        offset += len(categories)
    result = dict.fromkeys(FEATURES, 0.0)
    parents = {"motor_composite": DOMAIN_FEATURES[:2],
        "language_composite": ["rl_pre_scaled", "el_pre_scaled"],
        "cog_socio_composite": ["cog_pre_scaled", "se_pre_scaled"],
        "delay_ratio": ["pre_delayed_domains_count"],
        "domain_std": DOMAIN_FEATURES, "min_domain_score": DOMAIN_FEATURES}
    parents.update({name: DOMAIN_FEATURES + ["age_months_pre"] for name in CAPACITY_FEATURES})
    for name, value in internal.items():
        sources = parents.get(name, [name])
        for source in sources:
            result[source] += value / len(sources)
    total = sum(result.values())
    if total <= 0:
        raise ValueError("No positive permutation importance")
    return {name: value / total for name, value in result.items()}, internal


def table(headers, rows) -> str:
    return "\n".join(["| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |"] +
        ["| " + " | ".join(map(str, row)) + " |" for row in rows])


def report(metrics: dict, audit: dict) -> str:
    holdout, cv, behavior = metrics["holdout"], metrics["cross_validation"], metrics["behavioral_checks"]
    return f"""# AMES calibrated POST outcome experiment

Experiment: table-aligned conditional growth and synthetic PRE ages 36–71 months.
Selected model: **{metrics['selected_candidate']}**.
All acceptance gates: **{'PASS' if all(metrics['acceptance_gates'].values()) else 'FAIL'}**.

## Measured results

{table(['Holdout source', 'n', 'Accuracy', 'Macro F1 (three classes)'],
[[name, data['n'], f"{data['accuracy']:.4%}", f"{data['macro_f1']:.4%}"]
for name, data in {'Combined': holdout, **metrics['by_source']}.items()])}

Five-fold training CV accuracy: **{cv['mean_accuracy']:.4%}**;
macro F1: **{cv['mean_macro_f1']:.4%}**. Selection optimizes CV macro F1 among
candidates meeting CV accuracy, macro F1, runtime compatibility and all profile gates. These are model-selection
scores, not nested estimates. No holdout labels select or calibrate a model.

{table(['Candidate (sigmoid calibrated)', 'CV accuracy', 'CV Macro F1', 'Behavior pass'],
[[r['name'], f"{r['mean_accuracy']:.4%}", f"{r['mean_macro_f1']:.4%}", r['behavior']['passed']] for r in cv['candidates']])}

## All-1 PRE behavior

Seven scores=1; total=7; standard score=37; delayed domains=7; age=66 months;
gender=FEMALE, handedness=Right. Filled values: mother College, father High School,
occupation Skilled_Regular, siblings 2, birth order 1. Blank values use NaN.

{table(['Household', 'Average', 'Slight Delay', 'Significant Delay'],
[[variant, *[f"{behavior[variant][c] * 100:.8f}%" for c in reversed(ACTIVE_CLASSES)]] for variant in ('blank', 'filled')])}

Predicted class: **{behavior['predicted_class']}**. Household probabilities identical:
**{behavior['household_invariant']}**. Average-or-Slight recovery probability:
**{behavior['recovery_probability_average_or_slight']:.4%}**.
No clipping, forced class overrides, or profile-specific probability adjustments.
Outside age-normalized PRE score training ranges, probabilities blend toward training class
frequencies with mass `1-exp(-L2(range_overshoot/training_std))`. Within those
ranges this mass is exactly zero. This general safeguard expresses extrapolation
uncertainty; it is not an empirically calibrated estimate outside training support.
Age alone is excluded from this severity distance because PRE scores are already
age-normalized. Expanding synthetic ages does not make every joint score profile
supported. No model parameters were selected using holdout results.
These research scenario probabilities do not measure intervention effectiveness.

## Acceptance profiles at both ages

Scaled A=[10,12,10,10,10,12,10] (total 74, standard 103); scaled
B=[11,12,11,11,6,12,12] (total 75, standard 104); C=seven scaled 1s.
A requires Average >=75%, B >=60%, and C Significant Delay 65–90%.
The original 65–80% C band was not met; the user approved 65–90% on 2026-10-30
before any holdout evaluation. No probability logic was changed to meet this band.
The same Average thresholds apply to table-attainable raw A/B counterparts.
All four gender/handedness combinations and blank/filled households must pass.
Raw minima are separate reported scenarios, without C's probability-band gate.

{table(['Profile', 'Age months', 'Input path', 'Total', 'Standard', 'Average', 'Slight Delay', 'Significant Delay', 'Pass'],
[[r['name'], r['age_months'], 'raw' if r['raw_scores'] is not None else 'scaled', r['total'], r['standard_score'],
  *[f"{r['blank'][c] * 100:.10f}%" for c in reversed(ACTIVE_CLASSES)], r['passed']]
 for r in behavior['profiles'] if r['gender'] == 'FEMALE' and r['handedness'] == 'Right'])}

The table uses FEMALE/Right with blank households; full-precision distributions,
raw counts, scaled vectors and all demographic checks are in evaluation_metrics.json.

{table(['PRE age bracket', 'Holdout n', 'Accuracy', 'Macro F1'],
[[name, data['n'], f"{data['accuracy']:.4%}", f"{data['macro_f1']:.4%}"]
 for name, data in metrics['by_age_bracket'].items()])}

## Training and calibration

`train_test_split(test_size=0.30, stratify=y, random_state=42)` gives 1,070 training
and 459 test rows. Real weight={REAL_WEIGHT}; synthetic weight=1. Each fit checks
leave-self-out neighbors using only its training rows. Synthetic contradictions
with >=9 of 12 neighbors agreeing on another class and mean domain distance <=2
receive weight=0.5. Real recoveries keep their weights. No rows or labels are
deleted. Validation/holdout metrics use original labels and no sample weighting.

`CalibratedClassifierCV(method='sigmoid', cv=3, ensemble=False)` wraps the complete
preprocessing/weighted estimator. Inner OOF predictions fit calibration; a base
pipeline then fits all available training rows. All calibration subfolds refit
imputation, encoding and boundary weighting. Calibration uses declared weights;
diagnostics are unweighted. Five outer folds evaluate the complete procedure.
JSON includes uncalibrated/calibrated OOF log loss, multiclass Brier sum, and
10-bin top-label reliability/ECE, plus held-out probability diagnostics.

{table(['Probability evaluation', 'Log loss', 'Brier sum', 'Top-label ECE'],
[[name, *[f"{values[key]:.6f}" for key in ('log_loss', 'multiclass_brier_sum', 'top_label_ece_10_bins')]]
for name, values in [
('Uncalibrated training OOF', next(row for row in cv['candidates'] if row['name'] == metrics['selected_candidate'])['uncalibrated_oof']),
('Calibrated training OOF', next(row for row in cv['candidates'] if row['name'] == metrics['selected_candidate'])['calibrated_oof']),
('Calibrated holdout', metrics['probability_evaluation'])]])}

The measured diagnostics above compare raw and calibrated OOF probabilities;
calibration need not improve every proper score. These diagnostics do not
establish clinical or population calibration.
Method reference: [scikit-learn probability calibration](https://scikit-learn.org/stable/modules/calibration.html).

## Features and compatibility

The external 18-column contract and API routes/schemas remain unchanged. Five
uncollected household fields are pruned before any imputation/encoding, giving
exactly zero importance and strict probability invariance. No missingness flags.
Eleven retained numeric inputs use training-median imputation and scaling;
gender/handedness use training-mode imputation and unknown-safe one-hot encoding.
Six composites: motor mean, language mean, cognitive/socio-emotional mean, delayed
fraction, population domain std (ddof=0), domain minimum. Three additional fixed-table
interval summaries describe PRE capacity: inverse-width-weighted midpoint mean,
maximum lower bound and minimum upper bound across seven possible raw-score
fractions. These are interval proxies, not reconstructed observed raw scores.
Only official age-bracket/PRE lookup intervals are used, never POST data. Their
importance shares map equally to the seven domains and PRE age. Official scores are unchanged.
Importance is nonnegative normalized training permutation macro F1; categorical
columns are summed and composites share contributions equally with their inputs.
All 18 original importance keys remain. Rankings are descriptive, not causal.

## Generator and evidence limits

Generation: `{audit['synthetic_generation']['growth_scenario']}`. Gaussian std=
{audit['synthetic_generation']['growth_parameters']['noise_standard_deviation']}
(variance={audit['synthetic_generation']['growth_parameters']['noise_variance']}). Source workbooks and scoring tables are
unchanged; scores are recomputed with the official scorer. Real household data
stay missing. Illustrative household penalties are retained in generation but all
household predictors are pruned. Synthetic PRE ages are sampled uniformly from
36 through 71 completed months; real ages remain unchanged. POST ages above 71
retain the application's oldest-bracket fallback. Advanced POST candidates are
counted and excluded, never relabeled. Excluded counts:
`{audit['synthetic_generation']['excluded_advanced_post_counts']}`.
Rejection sampling means accepted ages need not be uniformly distributed.
Dataset audit includes accepted PRE→POST transitions by age bracket and the
previous generator's aggregate summary. Historical screens describe earlier
scenarios, not selection evidence for this run. Model selection examined training
folds only. High accuracy must not be presented as validation on new real learners.
All 29 real learners anchor simulation before splitting, including real holdout
learners. Results assess synthetic interpolation, not independent future-cohort
validity. Imposed 500-per-class balance is not observed population prevalence.
All 29 actual real POST labels are Average; an always-Average baseline scores 100%.
Real delay-class performance/calibration cannot be validated from this cohort.
Both advanced classes remain unsupported. Predictions never change official scores.

Student-excluded real benchmark accuracy: **{metrics['real_benchmark']['student_excluded']['accuracy']:.4%}**.
{metrics['real_benchmark']['training_overlap']} real learners overlap final-model
training; their benchmark predictions use five-fold OOF estimates. Shared anchors
and selected parameters still limit independence. Individual records remain local.

## Reproduction

`evaluation_metrics.json` records dataset/split/model hashes, runtime versions,
parameters and gates. `dataset_audit.json` records source hashes, repairs and
generator assumptions. Model: `rf_post_test_model.joblib` (trusted joblib only).
Plots include reliability curves. Restart a running backend to refresh its cache.

```powershell
uv run --no-project --python .venv312 python -m backend.ml.dataset_builder
uv run --no-project --python .venv312 python -m backend.ml.train_random_forest
uv run --no-project --python .venv312 python -m unittest backend.tests.test_ml_model backend.tests.test_ml_api backend.tests.test_parent_ml -v
```

Python {platform.python_version()}; scikit-learn {sklearn.__version__}; seed 42.
Test results require running the suite and are not inferred from metric gates.
"""


def finalize(selection: dict, frame: pd.DataFrame, train: pd.DataFrame, test: pd.DataFrame) -> dict:
    if selection["manifest"] != manifest():
        raise ValueError("Stale selection cache; rerun training CV before holdout evaluation")
    if not selection["eligible"]:
        raise ValueError("No candidate passed training CV and behavior gates; holdout not evaluated")
    pipeline, selected = selection["pipeline"], selection["selected"]
    behavior = behavior_check(pipeline)
    if not selected["runtime_compatible"] or not behavior["passed"]:
        raise ValueError("Selected model failed runtime compatibility/profile gates; holdout not evaluated")
    probabilities = pipeline.predict_proba(test[FEATURES])
    predicted = pipeline.classes_[probabilities.argmax(axis=1)]
    holdout = evaluate(test[TARGET], predicted)
    gates = {"holdout_n_459": len(test) == 459, "holdout_accuracy_90": holdout["accuracy"] >= .90,
        "holdout_macro_f1_90": holdout["macro_f1"] >= .90, "cv_accuracy_90": selected["mean_accuracy"] >= .90,
        "cv_macro_f1_90": selected["mean_macro_f1"] >= .90,
        "all_ones_behavior": all(row["passed"] for row in behavior["profiles"] if row["name"] == "C"),
        "average_profiles": all(row["passed"] for row in behavior["profiles"] if row["name"].startswith(("A", "B"))),
        "all_profile_checks": behavior["passed"], "calibrated_rf_hgb_ensemble": selected["runtime_compatible"],
        "no_100_percent_holdout": bool(np.all((probabilities > 0) & (probabilities < 1)))}
    write_json(ARTIFACTS / "accuracy_90plus_holdout.local", {"holdout": holdout, "gates": gates})
    if not all(gates.values()):
        raise ValueError(f"Holdout gates failed; runtime model not replaced: {gates}; {holdout}")
    metrics = {"seed": SEED, "supported_classes": ACTIVE_CLASSES, "unsupported_classes": CLASSES[3:],
        "metric_label_scope": "Macro/weighted averages use three supported classes",
        "split": {"train": len(train), "test": len(test), "test_size": .30, "stratify": TARGET},
        "class_distribution": {"train": train[TARGET].value_counts().to_dict(), "test": test[TARGET].value_counts().to_dict()},
        "selected_candidate": selected["name"], "selected_parameters": selected["params"],
        "cross_validation": {"folds": 5, "random_state": SEED, "selection_metric": "macro_f1",
            **{key: selected[key] for key in ("mean_accuracy", "std_accuracy", "mean_macro_f1",
                "std_macro_f1", "fold_accuracy", "fold_macro_f1")}, "candidates": selection["candidates"]},
        "holdout": holdout, "acceptance_gates": gates, "behavioral_checks": behavior,
        "probability_evaluation": probability_metrics(test[TARGET], probabilities, pipeline.classes_),
        "classification_report": classification_report(test[TARGET], predicted, labels=CLASSES, output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(test[TARGET], predicted, labels=CLASSES).tolist(),
        "by_source": {source: evaluate(test.loc[test.source == source, TARGET], predicted[test.source == source])
                      for source in ("real", "synthetic")}}
    metrics["by_age_bracket"] = {str(bracket): evaluate(test.loc[mask, TARGET], predicted[mask])
        for bracket in sorted(test.pre_age_bracket.unique())
        for mask in [test.pre_age_bracket == bracket]}
    metrics["feature_importances"], metrics["internal_feature_importances"] = feature_importances(pipeline, train)
    metrics["feature_importance_method"] = "Nonnegative training permutation macro F1; composite shares mapped equally; normalized"
    real = frame.loc[frame.source == "real"].copy()
    real["model_prediction"] = pipeline.predict(real[FEATURES])
    oof_by_id = dict(zip(train.student_id, pipeline.classes_[selection["oof"].argmax(axis=1)]))
    real["fit_membership"] = np.where(real.student_id.isin(train.student_id), "training", "holdout")
    real["unseen_prediction"] = [oof_by_id.get(sid, pred) for sid, pred in zip(real.student_id, real.model_prediction)]
    real["unseen_method"] = np.where(real.fit_membership == "training", "5-fold training OOF", "30% holdout")
    metrics["real_benchmark"] = {"final_model": evaluate(real[TARGET], real.model_prediction),
        "student_excluded": evaluate(real[TARGET], real.unseen_prediction), "always_average_accuracy": 1.0,
        "training_overlap": int((real.fit_membership == "training").sum())}
    audit = json.loads((ARTIFACTS / "dataset_audit.json").read_text(encoding="utf-8"))
    metadata = {"features": FEATURES, "target": TARGET, "supported_classes": ACTIVE_CLASSES,
        "unsupported_classes": CLASSES[3:], "seed": SEED, "train_count": len(train), "test_count": len(test),
        "python_version": platform.python_version(), "sklearn_version": sklearn.__version__,
        "dataset_sha256": sha256(DATA / "hybrid_eccd_dataset.csv"),
        "train_sha256": sha256(DATA / "train_set_70.csv"), "test_sha256": sha256(DATA / "test_set_30.csv"),
        "scoring_table_sha256": audit["scoring_table_sha256"], "selected_parameters": selected["params"],
        "pruned_features": HOUSEHOLD, "internal_composites": COMPOSITES + CAPACITY_FEATURES,
        "uncertainty_support_features": FEATURES[:10],
        "limitations": "Synthetic scenario research; shared real anchors; no independent cohort validation"}
    metrics["metadata"] = metadata
    joblib.dump({"pipeline": pipeline, "metadata": metadata}, ARTIFACTS / "rf_post_test_model.joblib", compress=3)
    metrics["model_sha256"] = sha256(ARTIFACTS / "rf_post_test_model.joblib")
    write_json(ARTIFACTS / "evaluation_metrics.json", metrics)
    audit["experiment_training"] = {"real_sample_weight": REAL_WEIGHT,
        "boundary_policy": "Fit-local 12-neighbor consensus; synthetic contradictions weight=0.5",
        "household_policy": "Five uncollected fields pruned; no missingness flags", "split": metrics["split"],
        "acceptance_gates": gates}
    write_json(ARTIFACTS / "dataset_audit.json", audit)
    real.to_csv(ARTIFACTS / "real_beneficiary_benchmark.csv", index=False)
    guides = save_guides()
    write_json(ARTIFACTS / "real_beneficiary_interventions.json",
        [{"student_id": row["student_id"], "recommendations": recommend(row, guides)} for row in real.to_dict("records")])
    make_plots(metrics, train, test, real)
    content = report(metrics, audit)
    (ARTIFACTS / "MODEL_EVALUATION_REPORT.md").write_text(content, encoding="utf-8")
    (ROOT.parents[1] / "ML_ACCURACY_REVIEW.md").write_text(content, encoding="utf-8")
    print(json.dumps({"holdout": holdout, "by_source": metrics["by_source"], "gates": gates,
                      "behavior": selected["behavior"]}, indent=2))
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--cv-only", action="store_true", help="Select without evaluating holdout")
    mode.add_argument("--finalize", action="store_true", help="Evaluate the fixed CV selection")
    args = parser.parse_args()
    frame = pd.read_csv(DATA / "hybrid_eccd_dataset.csv")
    if len(FEATURES) != 18 or len(frame) != 1529 or set(frame[TARGET]) != set(ACTIVE_CLASSES):
        raise ValueError("Dataset does not match the 18-feature, 1529-row, three-class contract")
    train, test = train_test_split(frame, test_size=.30, stratify=frame[TARGET], random_state=SEED)
    train.to_csv(DATA / "train_set_70.csv", index=False)
    test.to_csv(DATA / "test_set_30.csv", index=False)
    with threadpool_limits(limits=1):
        selection = joblib.load(SELECTION) if args.finalize else select_on_training(train)
        if not args.cv_only:
            finalize(selection, frame, train, test)


if __name__ == "__main__":
    main()
