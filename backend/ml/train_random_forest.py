"""Train offline, select parameters within 70%, evaluate once on untouched 30%."""
from __future__ import annotations

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
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix,
                            precision_recall_fscore_support)
from sklearn.model_selection import (GridSearchCV, StratifiedKFold, cross_val_predict,
                                     train_test_split)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from backend.ml.common import (ACTIVE_CLASSES, ARTIFACTS, CATEGORICAL_FEATURES, CLASSES,
    DATA, FEATURES, NUMERIC_FEATURES, ROOT, SEED, SHORT_CLASSES, TARGET, sha256, write_json)
from backend.ml.plots import make_plots
from backend.ml.prescriptions import recommend, save_guides


def make_pipeline() -> Pipeline:
    numeric = Pipeline([("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                        ("scaler", StandardScaler())])
    categorical = Pipeline([("imputer", SimpleImputer(strategy="most_frequent", keep_empty_features=True)),
                            ("encoder", OneHotEncoder(handle_unknown="ignore"))])
    transform = ColumnTransformer([("numeric", numeric, NUMERIC_FEATURES),
                                   ("categorical", categorical, CATEGORICAL_FEATURES)])
    return Pipeline([("preprocessor", transform), ("classifier", RandomForestClassifier(
        random_state=SEED, class_weight="balanced", n_jobs=1))])


def evaluate(actual: pd.Series, predicted: np.ndarray, labels: list[str] = ACTIVE_CLASSES) -> dict:
    result = {"accuracy": float(accuracy_score(actual, predicted)), "n": len(actual)}
    for average in ("macro", "weighted"):
        p, r, f, _ = precision_recall_fscore_support(actual, predicted, labels=labels,
                                                   average=average, zero_division=0)
        result.update({f"{average}_precision": float(p), f"{average}_recall": float(r),
                       f"{average}_f1": float(f)})
    return result


def feature_importances(pipeline: Pipeline) -> dict[str, float]:
    values = pipeline.named_steps["classifier"].feature_importances_
    processor = pipeline.named_steps["preprocessor"]
    numeric_values = values[processor.output_indices_["numeric"]]
    result = dict(zip(NUMERIC_FEATURES, map(float, numeric_values)))
    categorical_values = values[processor.output_indices_["categorical"]]
    encoder = processor.named_transformers_["categorical"].named_steps["encoder"]
    offset = 0
    for name, categories in zip(CATEGORICAL_FEATURES, encoder.categories_):
        result[name] = float(categorical_values[offset:offset+len(categories)].sum())
        offset += len(categories)
    if set(result) != set(FEATURES) or not np.isclose(sum(result.values()), 1):
        raise ValueError("Feature importance aggregation failed")
    return result


def markdown_table(headers: list[str], rows: list[list[object]]) -> str:
    def clean(value: object) -> str:
        return str(value).replace("|", "/").replace("\n", " ")
    return "\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"] +
                      ["| " + " | ".join(map(clean, row)) + " |" for row in rows])


def report(metrics: dict, audit: dict, benchmark: pd.DataFrame, interventions: list[dict]) -> str:
    holdout, cv = metrics["holdout"], metrics["cross_validation"]
    short = dict(zip(CLASSES, SHORT_CLASSES))
    class_rows = []
    for label in CLASSES:
        values = metrics["classification_report"][label]
        class_rows.append([label, int(values["support"]), *[
            f"{values[k]:.4f}" if values["support"] else "N/A (unsupported)"
            for k in ("precision", "recall", "f1-score")]])
    comparison_rows = [[r.student_id, short[r.pre_interpretation], r.post_teacher_interpretation,
        short[r.post_interpretation], short[r.model_prediction], r.fit_membership,
        short[r.unseen_prediction], r.unseen_method, "; ".join(
            f"{g['domain']} ({g['tier']})" for g in interventions[i]["recommendations"])]
        for i, r in enumerate(benchmark.itertuples(index=False))]
    distribution = [[short[c], metrics["class_distribution"]["train"].get(c, 0),
        metrics["class_distribution"]["test"].get(c, 0)] for c in CLASSES]
    importance = sorted(metrics["feature_importances"].items(), key=lambda kv: kv[1], reverse=True)
    cv_rows = [[r["params"], f"{r['mean_accuracy']:.4f}", f"{r['mean_macro_f1']:.4f}"]
               for r in cv["candidates"]]
    return f"""# AMES standalone Random Forest evaluation

## Scope and approved target change

This is an offline research prototype with no UI, router, database or scoring-rule changes.
The user approved retaining observed ages and existing scoring tables, so training covers
three attainable labels: Significant Delay, Slight Delay and Average. Both advanced labels
remain documented but unsupported. Perfect oldest-bracket raw scores sum to 84 scaled points
and yield standard score 117 (Average). Five-class performance is not claimed.

## Data and scoring audit

- Real beneficiaries: **29** (16 male, 13 female); synthetic: **1,500** (500 per supported class); hybrid: **1,529**.
- {len(audit['deduplications'])} duplicate demographic identity removed; the last valid Info Sheet row is retained.
  The corresponding duplicate domain records use the last occurrence consistently; differing marks are not merged.
- {len(audit['excluded'])} learner excluded for missing a full Cognitive domain ({audit['excluded'][0]['student_id']}).
- {len(audit['formula_repairs'])} zero-raw blank summary cells repaired; {len(audit['summary_discrepancies'])} cached
  standard-score discrepancies found. Every PRE/MID/POST raw, scaled, total and standard score is recomputed
  from item-level KAYA counts through the existing scorer, not Excel formula caches.
- {len(audit['conflicting_marks'])} dual-marked items follow the existing importer's KAYA precedence.
  {len(audit['unmarked_items'])} domain/period entries contain unmarked items; these remain unknown, not fabricated DI-KAYA.
  A complete record here means all seven domain rows have marks in all three periods, not 109 fully answered items.
- Names, LRNs, addresses and birth dates are absent from exported CSVs. IDs are pseudonyms; individual
  developmental records remain sensitive and local. Source workbooks are never rewritten.
- Household data are missing for all real learners. Imputers are fitted inside each training fold;
  imputed values are not claimed as actual family circumstances.
- PRE completed-month age: mean {audit['real_age_months_pre']['mean']:.2f}, range
  {audit['real_age_months_pre']['min']:.0f}–{audit['real_age_months_pre']['max']:.0f} months.
  The existing scorer routes children older than its named 5.11 bracket to that bracket; no norms were extended.
- All 29 actual POST labels are **Average**; all cached teacher POST standard scores agree with recomputation.

Detailed anonymous repairs, input SHA-256 hashes and generation parameters: `dataset_audit.json`.

## Synthetic design and evaluation limits

Age, gender, handedness and period spacing are jointly bootstrapped from the real cohort.
Domain variation uses a regularized empirical raw-domain covariance. Thirty percent of candidates
use beneficiary-shaped baselines; the rest broaden readiness to cover stress scenarios.
Post raw scores are simulated forward using a fixed limited-support growth rule, then scored
with official application lookups. Rejection sampling balances the resulting supported labels.
No target label or POST/MID feature enters the 18-feature predictor.

Education probabilities (Elementary/High School/Vocational/College) are 0.20/0.50/0.12/0.18.
Occupation probabilities (Unemployed/Informal/Skilled/Professional) are 0.10/0.50/0.30/0.10.
Sibling counts are capped Poisson(2); birth order is bounded by family size. These are declared
illustrative priors, not verified public-school distributions. Lower occupation tiers and more
siblings reduce simulated growth; this is an assumed scenario, not a causal finding.

All real learners contribute to generator anchors before splitting. Consequently, holdout and
CV results assess interpolation within this synthetic construction, not independent real-world
predictive validity. Broadening baseline severity and imposing equal class prevalence create
distribution shift from the actual all-Average POST cohort. High synthetic accuracy cannot establish
benefit from interventions, causal household effects, diagnostic validity or readiness for deployment.

## Reproducible training and 70/30 split

`train_test_split(test_size=0.30, stratify=y, random_state=42)` produces **1,070 training** and
**459 test** records. Saved split files reproduce membership exactly; no student ID enters X.
Numeric pipeline: median imputation then StandardScaler. Categorical pipeline: most-frequent
imputation then OneHotEncoder(handle_unknown='ignore'). Random Forest uses seed 42 and
balanced class weights. Parameter selection uses five stratified, shuffled folds within training
only; refit optimizes macro F1. The saved model is fitted on the 70% set only.

Selected parameters: `{metrics['selected_parameters']}`.

{markdown_table(['Interpretation', 'Train (70%)', 'Test (30%)'], distribution)}

## Untouched 30% holdout metrics

Accuracy: **{holdout['accuracy']:.4f}**.

{markdown_table(['Average', 'Precision', 'Recall', 'F1'], [[kind.title(), *[f"{holdout[kind+'_'+metric]:.4f}" for metric in ('precision','recall','f1')]] for kind in ('macro','weighted')])}

Macro and weighted averages cover the three supported classes. JSON uses zero for undefined
advanced-class metrics; the following table marks them N/A instead of implying measured performance.

{markdown_table(['Official interpretation', 'Support', 'Precision', 'Recall', 'F1'], class_rows)}

The holdout contains both real and synthetic records, with substantially different performance:

{markdown_table(['Source', 'Holdout records', 'Accuracy', 'Macro F1 (3 trained classes)'], [[source, values['n'], f"{values['accuracy']:.4f}", f"{values['macro_f1']:.4f}"] for source, values in metrics['by_source'].items()])}

The small real holdout contains only Average outcomes. Its source-specific result and the
29-student benchmark show that this model underperforms the always-Average real-cohort baseline.
The hybrid threshold passing does not establish suitability for use with AMES beneficiaries.

Confusion matrix (rows=actual, columns=predicted, class order follows the table):

{markdown_table(['Actual / Predicted', *SHORT_CLASSES], [[SHORT_CLASSES[i], *row] for i, row in enumerate(metrics['confusion_matrix'])])}

## Five-fold training cross-validation

Selected candidate accuracy: **{cv['mean_accuracy']:.4f} ± {cv['std_accuracy']:.4f}**;
macro F1: **{cv['mean_macro_f1']:.4f} ± {cv['std_macro_f1']:.4f}**.
These are model-selection CV scores, not nested-CV estimates; the holdout is the separate test.

{markdown_table(['Candidate parameters', 'Mean accuracy', 'Mean macro F1'], cv_rows)}

## Feature importances (all 18 original inputs)

One-hot category importances are summed back to their source feature. Impurity importance is
descriptive; correlated baseline totals compete for importance and household effects reflect
generator assumptions. No causal or fairness conclusion follows from the ranking.

{markdown_table(['Feature', 'Importance'], [[name, f'{value:.6f}'] for name, value in importance])}

## Real beneficiary comparison and intervention benchmark

Final-model comparison accuracy: **{metrics['real_benchmark']['final_model']['accuracy']:.4f}**;
{metrics['real_benchmark']['training_overlap']} of these 29 learners are in final-model training.
For the student-excluded comparison, training learners receive out-of-fold predictions from
the 70% training set with selected parameters; test learners receive the final model's holdout
prediction. Student-excluded accuracy: **{metrics['real_benchmark']['student_excluded']['accuracy']:.4f}**.
This comparison still shares generator anchors and selected hyperparameters. It is not external validation.
An always-Average baseline scores **1.0000** on these 29 students. Delay-class discrimination
cannot be validated from a cohort with no delayed POST cases.

The table distinguishes teacher cached labels, recomputed actual outcomes, fitted-model predictions
and student-excluded predictions. Full activities and item IDs are in `real_beneficiary_interventions.json`.

{markdown_table(['ID', 'Actual PRE', 'Teacher POST', 'Recomputed POST', 'Final model POST', 'Final fit membership', 'Student-excluded POST', 'Method', 'Prescribed domains'], comparison_rows)}

Guides trigger for a PRE domain scaled score <=6 or explicitly marked DI-KAYA items.
Local support tiers use <=3 Delay, 4..6 Slight Delay, >=7 Average; these are planning rules,
not official overall-development labels or diagnoses. Unknown items are retained for review.
Each guide includes classroom/home activities, a practice schedule, review interval and observation goal.
The recommendations use PRE observations independently of the forest, so an Average prediction
does not suppress support for an observed skill gap. No intervention efficacy benchmark is claimed
because treatment assignments and untreated outcomes are absent.

Activities are locally authored and aligned at domain level to the
[DepEd Kindergarten Curriculum Guide (May 2016)](https://www.deped.gov.ph/wp-content/uploads/2019/01/Kinder-CG_0.pdf),
which draws on the National Early Learning Framework. The seven ECCD domains are mapped to related
curriculum areas; exact ELDS indicator equivalence and official endorsement are not claimed.

## Artifacts and verification

- Datasets: `real_beneficiary_cleaned.csv`, `synthetic_eccd_data.csv`, `hybrid_eccd_dataset.csv`,
  `train_set_70.csv`, `test_set_30.csv` under `../data/` (local, Git-ignored).
- Model: `rf_post_test_model.joblib` with fitted pipeline, features, class support, versions and hashes.
- Metrics/audit: `evaluation_metrics.json`, `dataset_audit.json`.
- Interventions: `prescriptive_guides.json`, `real_beneficiary_interventions.json`, `real_beneficiary_benchmark.csv`.
- Figures: five numbered, headless matplotlib PNGs at 300 dpi under `plots/`.
- Option A regression gates (mixed accuracy >=0.88, macro F1 >=0.88,
  synthetic accuracy >=0.90): **{'PASS' if holdout['accuracy'] >= .88 and holdout['macro_f1'] >= .88 and metrics['by_source']['synthetic']['accuracy'] >= .90 else 'FAIL'}**.
  These preserve the research baseline; a 90%+ mixed/real target is separate.
  Unit-test results are established by running the command below, not by this report alone.

```powershell
uv run --no-project --python .venv312 python -m backend.ml.dataset_builder
uv run --no-project --python .venv312 python -m backend.ml.train_random_forest
uv run --no-project --python .venv312 python -m unittest backend.tests.test_ml_model -v
```

Python {platform.python_version()}; scikit-learn {sklearn.__version__}; NumPy {np.__version__};
pandas {pd.__version__}; joblib {joblib.__version__}. Seed: 42. Only load trusted joblib files.
"""


def main() -> None:
    frame = pd.read_csv(DATA / "hybrid_eccd_dataset.csv")
    if len(FEATURES) != 18 or len(frame) != 1529 or set(frame[TARGET]) != set(ACTIVE_CLASSES):
        raise ValueError("Dataset does not match approved 18-feature, 1529-row, three-class contract")
    audit = json.loads((ARTIFACTS / "dataset_audit.json").read_text(encoding="utf-8"))
    train, test = train_test_split(frame, test_size=0.30, stratify=frame[TARGET], random_state=SEED)
    train.to_csv(DATA / "train_set_70.csv", index=False)
    test.to_csv(DATA / "test_set_30.csv", index=False)
    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    parameters = [
        {"classifier__n_estimators": [240], "classifier__max_depth": [None, 12],
         "classifier__min_samples_split": [2], "classifier__min_samples_leaf": [1, 3]},
        {"classifier__n_estimators": [400], "classifier__max_depth": [None, 12],
         "classifier__min_samples_split": [6], "classifier__min_samples_leaf": [2]},
    ]
    search = GridSearchCV(make_pipeline(), parameters, scoring={"accuracy": "accuracy", "macro_f1": "f1_macro"},
                          refit="macro_f1", cv=folds, n_jobs=1, error_score="raise")
    print("Selecting forest parameters using five folds within the 1,070 training records...", flush=True)
    search.fit(train[FEATURES], train[TARGET])
    pipeline = search.best_estimator_
    predicted = pipeline.predict(test[FEATURES])
    selected = search.best_index_
    results = search.cv_results_
    cv = {"folds": 5, "random_state": SEED, "selection_metric": "macro_f1",
        "mean_accuracy": float(results["mean_test_accuracy"][selected]),
        "std_accuracy": float(results["std_test_accuracy"][selected]),
        "mean_macro_f1": float(results["mean_test_macro_f1"][selected]),
        "std_macro_f1": float(results["std_test_macro_f1"][selected]),
        "fold_accuracy": [float(results[f"split{i}_test_accuracy"][selected]) for i in range(5)],
        "fold_macro_f1": [float(results[f"split{i}_test_macro_f1"][selected]) for i in range(5)],
        "candidates": [{"params": p, "mean_accuracy": float(results["mean_test_accuracy"][i]),
                         "mean_macro_f1": float(results["mean_test_macro_f1"][i])}
                        for i, p in enumerate(results["params"])]}
    metrics = {"seed": SEED, "supported_classes": ACTIVE_CLASSES, "unsupported_classes": CLASSES[3:],
        "metric_label_scope": "Macro/weighted averages use three supported classes; five-class report uses zero_division=0",
        "split": {"train": len(train), "test": len(test), "test_size": .30, "stratify": TARGET},
        "class_distribution": {"train": train[TARGET].value_counts().to_dict(),
                               "test": test[TARGET].value_counts().to_dict()},
        "selected_parameters": search.best_params_, "cross_validation": cv,
        "holdout": evaluate(test[TARGET], predicted),
        "classification_report": classification_report(test[TARGET], predicted, labels=CLASSES,
                                                        output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(test[TARGET], predicted, labels=CLASSES).tolist(),
        "feature_importances": feature_importances(pipeline),
        "by_source": {source: evaluate(test.loc[test.source == source, TARGET], predicted[test.source == source])
                      for source in ("real", "synthetic")}}
    # No real learner is evaluated solely on a model fitted to that learner's own label.
    print("Computing student-excluded real benchmark and saving figures...", flush=True)
    oof = cross_val_predict(clone(pipeline), train[FEATURES], train[TARGET], cv=folds, n_jobs=1)
    oof_by_id = dict(zip(train.student_id, oof))
    real = frame.loc[frame.source == "real"].copy()
    real["model_prediction"] = pipeline.predict(real[FEATURES])
    real["fit_membership"] = np.where(real.student_id.isin(train.student_id), "training", "holdout")
    real["unseen_prediction"] = [oof_by_id.get(sid, pred) for sid, pred in zip(real.student_id, real.model_prediction)]
    real["unseen_method"] = np.where(real.fit_membership == "training", "5-fold training OOF", "30% holdout")
    guides = save_guides()
    interventions = [{"student_id": row["student_id"], "recommendations": recommend(row, guides)}
                     for row in real.to_dict("records")]
    metrics["real_benchmark"] = {"final_model": evaluate(real[TARGET], real.model_prediction.to_numpy()),
        "student_excluded": evaluate(real[TARGET], real.unseen_prediction.to_numpy()),
        "supported_observed_class": "Average Overall Development", "always_average_accuracy": 1.0,
        "training_overlap": int((real.fit_membership == "training").sum()),
        "teacher_post_score_agreement": int((real.post_standard_score == real.post_teacher_standard_score).sum()),
        "note": "Macro metrics include all 3 trained classes but the real cohort contains only Average. Shared generator anchors prevent independent validation."}
    real.to_csv(ARTIFACTS / "real_beneficiary_benchmark.csv", index=False)
    write_json(ARTIFACTS / "real_beneficiary_interventions.json", interventions)
    metadata = {"features": FEATURES, "target": TARGET, "supported_classes": ACTIVE_CLASSES,
        "unsupported_classes": CLASSES[3:], "seed": SEED, "train_count": len(train), "test_count": len(test),
        "python_version": platform.python_version(), "sklearn_version": sklearn.__version__,
        "dataset_sha256": sha256(DATA / "hybrid_eccd_dataset.csv"),
        "train_sha256": sha256(DATA / "train_set_70.csv"), "test_sha256": sha256(DATA / "test_set_30.csv"),
        "scoring_table_sha256": audit["scoring_table_sha256"], "selected_parameters": search.best_params_,
        "limitations": "Synthetic scenario research only; all real students anchor generation; no independent cohort validation"}
    joblib.dump({"pipeline": pipeline, "metadata": metadata}, ARTIFACTS / "rf_post_test_model.joblib", compress=3)
    metrics["metadata"] = metadata
    write_json(ARTIFACTS / "evaluation_metrics.json", metrics)
    make_plots(metrics, train, test, real)
    (ARTIFACTS / "MODEL_EVALUATION_REPORT.md").write_text(report(metrics, audit, real, interventions), encoding="utf-8")
    print(json.dumps({"holdout": metrics["holdout"], "real_benchmark": metrics["real_benchmark"]}, indent=2))


if __name__ == "__main__":
    main()
