# ECCD model research and teacher insights

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

The approved target scope is **three attainable classes**. At the observed ages,
the existing scoring tables cannot yield advanced outcomes, even for perfect raw
scores. Five-label reports retain those classes as unsupported. No scoring tables
or application behavior are changed.

The generator uses real ages, covariance and observed growth as anchors. Household
priors, household effects and the limited-support growth scenario are explicit
simulation assumptions. They are not estimates about individual AMES families.
Real household fields remain missing, and preprocessing is fitted within training.

Both scripts use seed 42. The forest uses exactly 18 PRE/demographic/household
inputs; all POST/MID scores, source labels and IDs are excluded from predictors.
The 70/30 split is stratified, with five-fold training-only parameter selection.
The serialized model remains fitted on the 1,070 training records.

`artifacts/MODEL_EVALUATION_REPORT.md` documents actual metrics, all 18 importances,
the confusion matrix, all 29 real comparisons, source overlap and limitations.
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
The sandbox accepts all 18 model inputs; its total and delayed-domain controls
are calculated from the seven domains, while standard score is independently
adjustable for hypothetical testing. Inconsistent scenarios may be unrealistic.
No predictions alter official assessments. Startup caches artifacts in memory;
missing artifacts return HTTP 503 for prediction requests.

Additional integration checks:

```powershell
uv run --no-project --python .venv312 python -m unittest backend.tests.test_ml_api -v
pnpm.cmd --dir frontend exec playwright test --config playwright.ml-insights.config.ts
```

Load only trusted joblib artifacts. Names and LRNs never enter exported CSVs, but
pseudonymous developmental records are still sensitive. Workbooks, CSVs and the
model binary remain Git-ignored by existing project policy. Generated reports and
figures are reproducible locally. Offline training and local inference require no
database or API server; the teacher integration uses the existing application DB.
