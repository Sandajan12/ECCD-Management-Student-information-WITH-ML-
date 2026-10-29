# ECCD model research and teacher insights

On 2026-10-30 the conditional-growth model replaced the preceding saved experiment:
92.8105% combined holdout accuracy (426/459), 92.8205% Macro F1, 90.2804%
five-fold CV accuracy, 93.7916% synthetic accuracy and 3/8 real holdout predictions
correct. All real POST outcomes are Average; the real-only always-Average
baseline is 100%. The synthetic-dominated combined result does not establish
independent real-world validity. The sigmoid-calibrated soft-voting ensemble
combines Random Forest and HistGradientBoosting. Internal domain composites and
official PRE scoring-interval summaries preserve the 18-input API. All five
household fields are excluded before preprocessing; retained missing inputs use
training median/mode defaults. Training folds use real weight 2.0 and down-weight
contradictory synthetic boundaries. Outside PRE score support, probabilities blend
toward training priors; this is not measured intervention recovery.

The immediately preceding model, datasets, metrics and source are preserved in
`artifacts/baseline_pre_missingness_weighting/before_growth_retraining_20261029_211422/active_before_growth.zip`
with a verified 42-file SHA-256 manifest. Generated datasets and the snapshot
remain ignored. The current model SHA-256 is
`835139f31887924c02f98c9d12878755885c4b476ae6ef54e3412b599d54ecc6`.
Restart the backend after switching artifacts because inference caches the model.

Run from the repository root with Python 3.12 and the project's environment:

```powershell
uv pip install --python .venv312 -r backend/requirements.txt
uv run --no-project --python .venv312 python -m backend.ml.dataset_builder
uv run --no-project --python .venv312 python -m backend.ml.train_random_forest
uv run --no-project --python .venv312 python -m unittest backend.tests.test_ml_model -v
```

The two named beneficiary workbooks must be present in `raw_data/`. The builder
never edits them. It produces 29 anonymous real rows, 1,500 synthetic rows and
1,529 hybrid rows. Direct execution of either script is also supported.

The target scope remains **three supported classes**. Younger scoring brackets
can produce advanced POST outcomes; those candidates are counted and excluded,
never relabeled. Five-label reports retain advanced classes as unsupported. No
scoring tables or application interpretation rules are changed.

Synthetic PRE age proposals are uniform across integer months 36–71; real ages
remain unchanged (59–80). Gender/handedness, covariance and assessment intervals
retain real anchors. At PRE scaled >=8, the future-age table supplies a raw count
preserving the scaled level before growth over remaining capacity. Scaled <=6
uses constrained recovery; 7 interpolates normal/constrained targets. At least
three delayed domains disable preservation floors throughout the profile.
Counts remain bounded and nondecreasing; official scoring derives every label.
Household priors, household effects and conditional growth rules are explicit
simulation assumptions. They are not estimates about individual AMES families.
Real household fields remain missing, and preprocessing is fitted within training.

Both scripts use seed 42. The pipeline accepts exactly 18 PRE/demographic/household
inputs; all POST/MID scores, source labels and IDs are excluded from predictors.
The 70/30 split is stratified, with five-fold training-only parameter selection.
The serialized model remains fitted on the 1,070 training records.

Publication requires Average >=75% for scaled Profile A, >=60% for B, and
Significant Delay 65–90% for all-scaled-1 Profile C, at 38 and 66 months. All
gender/handedness combinations and blank/filled households must pass, including
table-attainable raw A/B counterparts. The original 65–80% C band failed and the
user approved 65–90% before holdout evaluation. Runtime probability logic is
unchanged. Raw minima are separate reported profiles without C's band.
Both holdout accuracy and Macro F1 must be >=90%; incompatible models cannot
replace the calibrated RF/HGB ensemble. `growth_retraining_experiments.json`
records the training-only screens and approved gate revision. See the root
`SYNTHETIC_GROWTH_RETRAINING_RESULTS.md` for exact probabilities and test results.

`artifacts/MODEL_EVALUATION_REPORT.md` documents experimental metrics, exact bundle
hashes, the confusion matrix, source overlap and limitations. All 18 feature
importances remain in `evaluation_metrics.json`; individual real comparisons
remain local in `real_beneficiary_benchmark.csv`.
`dataset_audit.json` records input hashes, repair decisions and generator parameters.
All real learners anchor the generator before splitting, so the holdout does not
constitute independent real-cohort validation. All 29 real POST outcomes are Average;
an always-Average baseline is therefore essential to interpreting that benchmark.

The interventions are transparent PRE-based rules, independent of predictions.
They include all seven domains and three local support tiers. Activities are
locally authored, aligned at domain level to the linked DepEd curriculum; they
are not official prescriptions, diagnoses or evidence of treatment effectiveness.
Student-excluded real predictions combine training OOF and holdout predictions,
with method and final-model training overlap shown per learner.

Local single-student inference:

```python
import pandas as pd
from backend.ml.common import DATA
from backend.ml.inference import predict_student

student = pd.read_csv(DATA / "real_beneficiary_cleaned.csv").iloc[0].to_dict()
result = predict_student(student)
```

The Teacher Portal integrates this saved model at `/teacher/ml-insights`.
Teacher-authenticated routes are `GET /api/ml/students?section_id=N`,
`POST /api/ml/predict/student/{student_id}`, and `POST /api/ml/predict/sandbox`.
Pydantic request/response contracts live in `backend/schemas/ml.py`. Student
inference checks section ownership and complete PRE data, uses the official
teacher PRE date for age/scoring, and discloses missing imputed demographics.
Free-text occupations remain missing because no reviewed tier mapping exists.
The sandbox accepts raw KAYA counts for seven domains and converts them to
scaled scores using completed-month PRE age, rounded to one decimal year with
HALF_UP, and the existing official scoring JSON/closest-lower fallback. Raw
limits are GM=13, FM=11, SH=27, RL=5, EL=8, C=21 and SE=24. The UI shows decimal
age, scoring bracket and calculated scaled scores; composites are read-only.
The sandbox validates PRE ages 36–71 months and sends 18 derived features plus
strict `raw_scores` request metadata. The backend authoritatively converts raw
counts and normalizes composites before passing exactly 18 fields to inference.
Scaled-only requests remain supported. Standard-score tables are identical across brackets, but
raw-to-scaled tables differ: age changes within a bracket can leave scores unchanged.
Owner-scoped `ml_sandbox_raw_v2` drafts retain raw/age/household inputs across
reloads and failures. Old `ml_sandbox_v1` scaled drafts remain untouched and
visible for reference; their age/demographics initialize the new form, but raw
scores start blank. New-format drafts take precedence. Successful inference
retains inputs; offline failures mark pending state and retry on reconnection.
No predictions alter official assessments. Startup caches artifacts in memory;
missing artifacts return HTTP 503 for prediction requests.

Additional integration checks:

```powershell
uv run --no-project --python .venv312 python -m unittest backend.tests.test_ml_api -v
pnpm.cmd --dir frontend exec playwright test --config playwright.ml-sandbox.config.ts
```

Load only trusted joblib artifacts. Names and LRNs never enter exported CSVs, but
pseudonymous developmental records are still sensitive. Workbooks and datasets
remain Git-ignored by existing project policy. The active V1 binary is explicitly
tracked for deployment. Generated reports and figures are reproducible locally.
Offline training and local inference require no
database or API server; the teacher integration uses the existing application DB.
