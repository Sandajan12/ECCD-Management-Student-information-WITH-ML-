# ECCD standalone Random Forest research model

Updated 2026-11-05. The primary artifact is a **standalone sigmoid-calibrated
RandomForestClassifier**, replacing the RF/HistGradientBoosting voting hybrid.
Both teacher and parent inference use `artifacts/rf_post_test_model.joblib`.

## Current measured results

| Evaluation | Accuracy |
| --- | ---: |
| Mixed holdout | 92.1569% (423/459) |
| Synthetic holdout | 93.1264% (420/451) |
| Real holdout | 37.5% (3/8) |
| Five-fold mixed training CV mean | 88.5981% |
| Student-excluded real benchmark with shared anchors | 31.0345% (9/29) |
| Separate exploratory real-fold evaluation | 44.8276% (13/29) |
| Always-Average, all 29 real learners | 100% (29/29) |
| PRE-category persistence, all 29 real learners | 13.7931% (4/29) |

Mixed-holdout macro F1 is 92.1690%; weighted F1 is 92.1727%. Five-fold mixed
training CV macro F1 is 88.6136%. The model does not beat the constant Average
baseline on the available real cohort. No independent real-world validity,
real delay sensitivity, clinical confidence or intervention effectiveness is established.

## Architecture and training

`rf_full_leaf3` uses 400 trees, `min_samples_leaf=3`, `max_features=0.8`,
`class_weight='balanced'`, `n_jobs=1`, `random_state=42`. This specified
configuration came from prior screening; this run evaluates that configuration
rather than performing a new hyperparameter search or claiming optimality.
Neither HistGradientBoostingClassifier nor VotingClassifier is in the primary model.

The existing `FoldWeightedClassifier` fits feature engineering and preprocessing
inside each training/calibration subfold. `SupportAwareCalibration` subclasses
`CalibratedClassifierCV(method='sigmoid', cv=3, ensemble=False)`. It fits inner
OOF sigmoid calibration and refits the base pipeline on the available training rows.
Outside PRE score training support, it also blends toward training class priors
with mass `1-exp(-L2(range_overshoot/training_std))`; age alone is excluded. This
unchanged safeguard is not an empirically calibrated recovery estimate.

Real sample weight is 2; synthetic weight is 1. Fit-local 12-neighbor consensus
down-weights isolated synthetic contradictions to 0.5. No labels are changed.
Five outer folds measure the complete procedure on the mixed training set.

The exact 18-field API remains in `common.py` and `schemas/ml.py`. Five household
inputs are excluded before preprocessing; no values or missingness flags reach
the estimator. Eleven numeric inputs use training-median imputation and scaling;
gender/handedness use training modes and unknown-safe one-hot encoding. Six PRE
composites and three fixed official-table interval proxies remain. IDs, source,
and MID/POST measurements are excluded from predictors. Only three POST classes
are supported; advanced POST candidates are counted and rejected, never relabeled.

## Evaluation design and limitations

The saved dataset remains unchanged: 29 real + 1,500 synthetic rows, split into
1,070 training and 459 holdout rows with stratification and seed 42. There are
21 real training and 8 real holdout learners. The final estimator fits only the
training portion. However, all 29 real learners anchored the original generator
before splitting, so mixed CV and holdout are not independent real-cohort validation.
All real observed POST labels are Average. Synthetic balance is imposed, not
population prevalence. Synthetic PRE ages span 36–71 months; real ages remain 59–80.
Growth factor 0.40, noise standard deviation 0.006, conditional norm preservation,
illustrative household penalties and official scoring rules remain unchanged.

A separate five-fold real-learner experiment regenerates 1,500 training scenarios
from only each fold's 23 or 24 training learners, fits/calibrates there, and scores
only the held-out real learners. Fold counts correct are 3/6, 4/6, 3/6, 1/6 and 2/5.
All 29 learners already informed development; 13/29 is exploratory, not external
validation or a directly comparable improvement over the hybrid's shared-anchor
benchmark. Real delay sensitivity is not estimable without observed delayed POST outcomes.

Both always-Average and PRE-category-persistence baselines are included for mixed,
real and synthetic holdouts and the real cohort. Persistence retains the observed
PRE category, including advanced categories. Macro/weighted headline metrics use
three supported labels; the five-label report includes zero-support advanced labels
and has a different macro denominator. JSON records both matrix label orders.

## Publication policy and frozen comparison

Publication checks fitted standalone RF architecture, sigmoid calibration, three
supported classes, household invariance and finite normalized probabilities. The
former >=90% accuracy/F1 gates and selected-profile A/B/C probability bands remain
**reported diagnostics only**. The current RF CV accuracy/F1 are below 90%; no
result is hidden or probabilities forced to satisfy these bands.

`artifacts/hybrid_comparison_metrics.json` preserves the original hybrid metrics
without modification: mixed holdout 92.8105%, mixed CV 90.2804%, real holdout 3/8,
shared-anchor student-excluded real benchmark 10/29. The 40-file verified local
snapshot `artifacts/hybrid_baseline_before_standalone_rf.local` preserves the old
artifact, reports, sources and dataset/splits. `hybrid_baseline_manifest.json`
records checksums. Learner datasets and the archive remain Git-ignored.

Active RF SHA-256:
`1ff4591f0f8e21bbaeb48f5617f61acd460f2953f6609cac52d5f86a6bdcec73`.
Hybrid SHA-256:
`835139f31887924c02f98c9d12878755885c4b476ae6ef54e3412b599d54ecc6`.

## Runtime contracts

Teacher routes remain `GET /api/ml/students?section_id=N`,
`POST /api/ml/predict/student/{student_id}` and `POST /api/ml/predict/sandbox`.
Parent routes remain `GET /api/ml/parent/readiness/{student_id}` and
`POST /api/ml/parent/predict/{student_id}`. Complete teacher-confirmed PRE,
section/child ownership, active-adviser permissions and independent PRE release
are preserved. Parent responses continue excluding family inputs and checklist
marks. Inference never refits or writes official assessments.

`baseline_domains` still uses deterministic PRE tiers: <=3 Delay, 4–6 Slight Delay,
>=7 Average. `prescriptions.py` still triggers local activity guides for scaled
scores <=6 or explicit DI-KAYA items, independently of the predicted category.
These are planning tools, not diagnoses or demonstrated effective interventions.
Sandbox raw-score conversion, 36–71 month sandbox age validation, 18 derived
features, official scoring tables and owner-scoped durable drafts are unchanged.
No portal layout, database schema, assessment route or permission was changed.

## Reproduction and verification

Use the existing Python 3.12 environment and frozen comparison dataset; no new
dependencies are required. Do not rebuild the main dataset for a controlled
comparison. `dataset_builder` remains available when a separately audited dataset
rebuild is explicitly intended; it needs the original local workbooks.

```powershell
uv run --no-project --python .venv312 python -m backend.ml.train_random_forest
uv run --no-project --python .venv312 python -m unittest backend.tests.test_ml_model backend.tests.test_ml_pipeline backend.tests.test_ml_growth -v
uv run --no-project --python .venv312 python -m pytest backend/tests/test_parent_ml.py -q
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build
```

`--cv-only` saves a training selection; `--finalize` requires a matching dataset,
trainer, component and scoring-table manifest. `evaluation_metrics.json` records
hashes, parameters, versions, baselines, probability diagnostics and every fold.
`MODEL_EVALUATION_REPORT.md` and root `ML_ACCURACY_REVIEW.md` summarize results.
`ML_MODEL_AUDIT.md` separates current findings, completed integration and future
research. Individual comparisons remain in ignored local files.

Load trusted joblib only. Restart an already-running backend to refresh its cached
artifact. This branch integration does not imply a hosted deployment. Offline
training/inference requires no application database; route tests use disposable schemas.
