# Machine-learning audit and integration status — feat/feedbacks-changes

Updated: **2026-11-05**. Active model: **standalone sigmoid-calibrated Random Forest**.
This report separates measured findings from integration status and remaining research work.

## Part I — Current model: verified findings and limitations

### 1. Assessment and dataset constraint

The Random Forest forecasting pipeline is implemented and evaluated. **Reliable
real-world predictive usefulness is not established.** There are only 29 real
learners and every observed POST outcome is Average. The team reports that the
client lost earlier records/backups and cannot provide more historical data;
that explanation is client-reported, not independently verified by the repository.

All-Average outcomes do not impose a 34% accuracy ceiling. A constant Average
answer scores 100% here. Lower model accuracy means the model incorrectly forecasts
delay for some observed Average outcomes. Separately, absent real delayed outcomes
make real delay sensitivity and three-class population performance unidentifiable.

### 2. Active architecture and provenance

The deployed artifact path is `backend/ml/artifacts/rf_post_test_model.joblib`.
Its fitted base classifier is **RandomForestClassifier**, with no VotingClassifier
or HistGradientBoostingClassifier. Configuration `rf_full_leaf3` uses 400 trees,
minimum leaf size 3, `max_features=0.8`, balanced class weights, `n_jobs=1` and seed 42.
This specified configuration came from prior screening. This integration run
**does not perform a new hyperparameter search or establish optimality**.

The full estimator is wrapped in three-fold sigmoid `CalibratedClassifierCV`
(`ensemble=False`). Preprocessing, boundary weighting and imputation refit inside
each calibration/training fold. The existing `SupportAwareCalibration` also blends
probabilities toward training class priors outside age-normalized PRE score support;
age alone is excluded from that distance. This is an extrapolation safeguard,
not measured recovery or calibrated clinical confidence. No scenario-specific
class override or probability clipping was added.

Active RF SHA-256:
`1ff4591f0f8e21bbaeb48f5617f61acd460f2953f6609cac52d5f86a6bdcec73`.

The former sigmoid-calibrated RF/HGB hybrid has SHA-256
`835139f31887924c02f98c9d12878755885c4b476ae6ef54e3412b599d54ecc6`.
Its original metrics remain unmodified in
[hybrid_comparison_metrics.json](backend/ml/artifacts/hybrid_comparison_metrics.json).
A verified 40-file local archive, `hybrid_baseline_before_standalone_rf.local`,
contains its artifact, reports, sources, datasets and split provenance. Checksums
are in [hybrid_baseline_manifest.json](backend/ml/artifacts/hybrid_baseline_manifest.json).
The archive and learner-level datasets remain local/ignored; aggregate metrics
and the active inference artifact are available for version control.

### 3. Features X: exact public input contract

| Group | Exact fields | Processing |
| --- | --- | --- |
| Seven PRE domain scores | `gm_pre_scaled`, `fm_pre_scaled`, `sh_pre_scaled`, `rl_pre_scaled`, `el_pre_scaled`, `cog_pre_scaled`, `se_pre_scaled` | Retained |
| PRE summary fields | `pre_total_scaled`, `pre_standard_score`, `pre_delayed_domains_count` | Retained |
| PRE age | `age_months_pre` | Retained |
| Demographics | `gender`, `handedness` | Retained |
| Household inputs | `mother_education_level`, `father_education_level`, `household_occupation_tier`, `num_siblings`, `birth_order` | Accepted for compatibility, excluded before preprocessing |

The API still accepts **18 fields**. Only **13 supplied fields** can influence
the estimator. No household values or household missingness flags reach the forest.
Eleven numeric fields use training-median imputation/scaling; the two retained
categorical fields use training-mode imputation and unknown-safe one-hot encoding.

Internal engineering retains motor, language and cognitive/socio-emotional means,
delayed-domain fraction, population domain standard deviation and minimum domain
score. Three additional interval summaries use fixed official PRE scoring tables
and age; these are capacity proxies, not recovered observed raw scores.
Names, LRNs, student IDs, source labels, and MID/POST measurements are excluded from X.

### 4. Target Y

`post_interpretation` is the future overall POST interpretation, with three supported categories:

1. Suggests Significant Delay in Overall Development.
2. Suggests Slight Delay in Overall Development.
3. Average Overall Development.

Slightly Advanced and Highly Advanced outcomes remain unsupported. The generator
counts and rejects advanced POST candidates; it does not relabel them as Average.
The model predicts an overall category, not a raw score or future domain scores.

### 5. Why a PRE domain displays Delay or Average on either portal

Both portals receive the same `baseline_domains` from the shared ML route.
For actual students, the system counts teacher-confirmed PRE KAYA answers,
calculates assessment age from birth date and official PRE date, and uses the
existing official age-bracket tables to convert raw counts into scaled scores.
The following fixed local planning thresholds then label each domain:

| PRE scaled score | Domain planning tier |
| --- | --- |
| 0–3 | Delay |
| 4–6 | Slight Delay |
| 7 or higher | Average |

These tiers are **deterministic PRE summaries**, not Random Forest predictions
or clinical diagnoses. The local Average tier includes high scores and does not
create separate advanced-domain tiers. Overall PRE interpretation is calculated
separately from total scaled score → standard score → official interpretation.

`prescriptions.py` remains rule-based: a domain score <=6 or an explicit DI-KAYA
item triggers activity guidance. An Average domain may therefore still receive
an activity for an observed item gap. The guides are not learned interventions
and provide no evidence of treatment effectiveness. Parent privacy, active-adviser
permissions, linked-child ownership, complete teacher-confirmed PRE and independent
PRE release gates remain unchanged. Predictions never write official assessments.

### 6. Dataset and evaluation design

| Source | All rows | Training | Mixed holdout |
| --- | ---: | ---: | ---: |
| Real | 29 | 21 | 8 |
| Synthetic | 1,500 | 1,049 | 451 |
| Total | 1,529 | 1,070 | 459 |

The existing comparison dataset is unchanged. Synthetic data form approximately
98.1% of all records, with 500 records per supported POST class. This imposed
balance is not observed school prevalence. The mixed split is stratified 70/30,
seed 42. Synthetic PRE proposals span 36–71 months; real PRE ages remain 59–80.

The main dataset was generated from all 29 real learners before splitting. PRE
covariance, observed POST growth, demographics and period-spacing anchors therefore
include later real holdout learners. Classifier-local fold isolation does not
remove this end-to-end dependence. Mixed holdout and CV measure the declared
simulation experiment, not independent forecasting accuracy on new real learners.

The generator retains the 0.40 recovery-factor scenario, Gaussian POST noise
standard deviation 0.006, norm-preserving rules and bounded nondecreasing raw
counts. Official scoring derives labels. Household penalties are illustrative
simulation assumptions even though household predictors are excluded.

### 7. Measured RF results and frozen hybrid comparison

| Evaluation | Active standalone RF | Archived hybrid |
| --- | ---: | ---: |
| Mixed holdout accuracy | **92.1569% (423/459)** | 92.8105% (426/459) |
| Synthetic holdout accuracy | 93.1264% (420/451) | 93.7916% (423/451) |
| Real holdout accuracy | **37.5% (3/8)** | 37.5% (3/8) |
| Five-fold mixed training CV mean accuracy | 88.5981% | 90.2804% |
| Five-fold mixed training CV mean macro F1 | 88.6136% | 90.2799% |
| Student-excluded real benchmark, shared anchors | **31.0345% (9/29)** | 34.4828% (10/29) |
| Final-model predictions across all 29 real learners | 75.8621% (22/29) | 79.3103% (23/29) |

The last row overlaps final-model training for 21 learners; it is **not unseen
accuracy**. Student-excluded predictions combine training OOF predictions and the
real holdout, but generator anchors and prior development remain shared.
The RF does not outperform the hybrid on these headline development measurements;
its primary role aligns the implemented classifier with the approved RF objective.

| Active RF mixed-holdout metric | Macro | Weighted |
| --- | ---: | ---: |
| Precision | 92.1888% | 92.2154% |
| Recall | 92.1761% | 92.1569% |
| F1 | 92.1690% | 92.1727% |

| Class | Precision | Recall | F1 | Support |
| --- | ---: | ---: | ---: | ---: |
| Significant Delay | 94.6309% | 94.0000% | 94.3144% | 150 |
| Slight Delay | 88.3871% | 91.3333% | 89.8361% | 150 |
| Average | 93.5484% | 91.1950% | 92.3567% | 159 |

Confusion matrix: actual rows and predicted columns in the displayed order.

| Actual / Predicted | Significant Delay | Slight Delay | Average |
| --- | ---: | ---: | ---: |
| Significant Delay | 141 | 8 | 1 |
| Slight Delay | 4 | 137 | 9 |
| Average | 4 | 10 | 145 |

Headline macro metrics use three supported labels. The retained five-label JSON
classification report includes two zero-support advanced labels, giving macro F1
55.3014%; this different denominator must not be confused with three-class 92.1690%.

Mixed-holdout log loss is **0.229011**, multiclass Brier sum **0.113920** and ten-bin
top-label ECE **0.044941**. Maximum holdout probability is approximately **95.20%**.
These describe the experimental mixture, not population or clinical calibration.

### 8. Baselines and separate corrected exploratory real-fold evaluation

| Scope | RF accuracy | Always Average | PRE-category persistence |
| --- | ---: | ---: | ---: |
| Mixed holdout (459) | 92.1569% | 34.6405% | 57.0806% |
| Real holdout (8) | 37.5% | 100% | 12.5% |
| All-real student-excluded mixed benchmark (29) | 31.0345% | 100% | 13.7931% |
| Separate fold-local generation experiment (29) | **44.8276% (13/29)** | **100% (29/29)** | **13.7931% (4/29)** |

PRE persistence predicts the observed PRE overall category unchanged, including
advanced labels. Both baselines are calculated without learning from POST.
Their full macro/weighted metrics are in the evaluation JSON.

The separate experiment uses five shuffled real-learner folds, seed 42. In each
fold, only its 23 or 24 training learners anchor 1,500 newly generated training
scenarios. Preprocessing, weighting, RF fitting and sigmoid calibration then use
that training portion. Only held-out real learners are scored.

| Fold | Real training learners | Real test learners | Correct RF predictions | RF accuracy |
| --- | ---: | ---: | ---: | ---: |
| 1 | 23 | 6 | 3 | 50.00% |
| 2 | 23 | 6 | 4 | 66.67% |
| 3 | 23 | 6 | 3 | 50.00% |
| 4 | 23 | 6 | 1 | 16.67% |
| 5 | 24 | 5 | 2 | 40.00% |

Pooled accuracy is 13/29 (44.8276%); the unweighted fold mean is 44.6667% because
fold sizes differ. Of the 29 observed Average outcomes, this experiment predicts
9 Significant Delay, 7 Slight Delay and 13 Average. All 29 already informed
research development, so this remains **exploratory**, not new external validation.
It must not be compared to the hybrid's 34.48% as a controlled accuracy improvement:
the evaluation designs differ. Real delay sensitivity is **not estimable**.

The active RF's mixed student-excluded benchmark has 20 errors: 9 Significant
Delay and 11 Slight Delay predictions against actual Average outcomes. All 20
have Significant Delay PRE interpretations. The hybrid had 19 errors. Official
scores are independently recomputed by the model verification suite; disagreement
alone does not prove a data error or identify a causal explanation for a child.
Simulated and observed growth may differ, but that is a research hypothesis.

### 9. Descriptive feature importance

Importance uses nonnegative training permutation macro F1 of the fitted base
forest, normalized after sharing engineered-feature contributions with their
original inputs. It does not explain the entire calibrated wrapper or imply causality.

| Input | Normalized importance |
| --- | ---: |
| PRE age | 38.4396% |
| PRE total scaled | 26.4154% |
| PRE standard score | 5.9883% |
| Socio-Emotional | 5.0057% |
| Cognitive | 4.1377% |
| Fine Motor | 3.8115% |
| Gross Motor | 3.7301% |
| Receptive Language | 3.7175% |
| Expressive Language | 3.6362% |
| Self-Help | 3.4110% |
| Delayed-domain count | 1.6224% |
| Gender | 0.0836% |
| Handedness | 0.0010% |
| Each of the five excluded household fields | 0% |

### 10. Remaining limitations

- Only 29 independent observed learners; no real delayed POST cases or external cohort.
- Synthetic outcomes depend on declared growth assumptions and imposed class balance.
- Shared real anchors limit the main mixed experiment; corrected real-fold evaluation still reuses development records.
- Historical tuning and repeated investigation mean no untouched or nested performance estimate is claimed.
- RF underperforms always-Average on available real labels; three-class practical utility is unproven.
- Sigmoid calibration and support-aware blending do not establish clinical confidence, intervention effects, or reliability outside support.
- Advanced POST classes are unsupported; PRE planning tiers and guides must remain distinct from forecasting.
- Matching the RF title resolves algorithm-description consistency, not empirical predictive validity.

## Part II — Integrated plan, completion status and future research boundary

### 1. Alignment with approved research

Approved title:

> A Random Forest-Based System for Early Childhood Performance Analytics for Kindergarten Level at Apolinario Mabini Elementary School.

Relevant objective:

> To integrate machine learning, specifically the Random Forest algorithm, to predict post-test interpretation based on the pre-test data of the student.

The primary base classifier now directly matches that algorithm. The objective
provides no minimum accuracy, but implementation and useful forecasting remain
different achievements. UAT and ISO software-quality evaluation are outside this
ML-focused implementation and do not replace predictive evaluation.

### 2. Plan implemented in this branch

| Integration item | Status |
| --- | --- |
| Freeze original hybrid artifact, metrics, reports, sources and splits | Complete; verified 40-file archive and separate original metrics |
| Fit specified standalone `rf_full_leaf3` with sigmoid calibration | Complete; new checksum and measurements recorded |
| Preserve 18 inputs, exclude five household inputs, retain three POST classes | Complete |
| Preserve deterministic PRE tiers and rule-based guides | Complete; scoring/guide source unchanged |
| Adapt hybrid-only loader and publication gates | Complete; only fitted sigmoid-calibrated RF accepted |
| Mixed holdout, five-fold training CV and probability diagnostics | Complete |
| Always-Average and PRE-persistence baselines | Complete |
| Separate real-fold evaluation with fold-local generation | Complete; exploratory 13/29 |
| Report errors without relabeling learners | Complete; aggregate review above |
| Refresh both existing UI methodology/accuracy notices | Complete; text changes only |
| Verify model tests, parent prediction gates and frontend checks | See verification record below |
| Establish independent real-world predictive validity | Not established |
| Deploy to hosted service | Not performed |

The former >=90% holdout/CV requirements and hand-picked A/B/C probability bands
are no longer publication gates. They remain visible diagnostics. **RF CV accuracy
and macro F1 fall below 90%; this is reported openly.** The old profile bands happen
to pass, but they are not used to select or publish the model. Publication checks
architecture, sigmoid calibration, supported classes, household invariance,
dataset size and finite normalized probabilities. This policy supports honest
experimental reporting; passing it does not mean production predictive readiness.

No database schemas, assessment routes, permissions, input/response contracts,
scoring rules or page layouts were changed. The primary dataset and 70/30 split
remain unchanged. Extra scenarios generated for real CV are fold-local and do
not replace the saved comparison dataset. An existing running backend must restart
to reload its cached artifact. No hosted deployment is implied.

### 3. Defensible panel explanation

> We implemented a standalone Random Forest forecasting pipeline with sigmoid
> calibration. It scored 92.16% on a mostly synthetic mixed holdout, but only 3 of
> 8 real holdout learners were predicted correctly. A separate exploratory
> evaluation with fold-local generation predicted 13 of 29 real outcomes correctly.
> All observed real POST outcomes were Average, so the always-Average baseline
> scored 100%. We report these limitations and do not claim reliable real-world
> delay detection or superior performance over that baseline.

**Why use synthetic data?** To explore explicitly defined scenarios absent from
the available records, not to create additional observed children or validate the
assumptions used to generate them.

**Why Random Forest?** It investigates relationships in structured PRE inputs and
matches the approved algorithm. This study does not prove it is the best algorithm
for this population. The specified configuration was previously screened; no new
optimal tuning result is claimed.

**Why not always predict Average?** That baseline is better on this cohort and is
reported as such. A single-class cohort cannot establish detection of real delay.
The RF contributes an implemented experimental approach; useful forecasting is
an unresolved research outcome.

**Are domain labels and activities ML predictions?** No. PRE domain labels follow
fixed scoring/planning rules, and activity guides follow PRE support needs. The
RF predicts the later overall POST category.

**Is it ready for defense?** It can be presented as an implemented, transparently
evaluated experimental RF system with clear negative findings. It cannot honestly
be presented as a validated, highly accurate real-world predictor. Panel acceptance
depends on the study's standards and the panel's assessment; this audit cannot guarantee it.

### 4. Future research: not implemented or established by this work

Independent prospective evaluation, if new observations become available, remains
future work. No unavailable historical dataset is required to finish this limited
implementation. More synthetic rows or a different split cannot establish missing
real delay performance. Do not tune against the 29 records and then describe them
as untouched validation. Do not alter official outcomes or conceal failed diagnostics
to obtain a desired accuracy.

The supportable conclusion is: **Random Forest prediction was implemented and
investigated; reliable real-world predictive usefulness was not established.**

### 5. Verification record

The model was actually retrained for this integration; metrics above are from
that run, not copied from the hybrid. Fresh verification on this branch:

| Command | Result |
| --- | --- |
| `uv run --no-project --python .venv312 python -m unittest backend.tests.test_ml_model backend.tests.test_ml_pipeline backend.tests.test_ml_growth -v` | 31 tests passed |
| `uv run --no-project --python .venv312 python -m pytest backend/tests/test_parent_ml.py -q` | 10 tests passed |
| `uv run --no-project --python .venv312 python -m pytest backend/tests/test_ml_api.py backend/tests/test_ml_forecast_bounds.py -q` | 21 tests and 96 subtests passed |
| `pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json` | Passed |
| `pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json` | Passed |
| `pnpm.cmd --dir frontend run lint` | Passed |
| `pnpm.cmd --dir frontend run build` | Passed |

Backend checks reported dependency deprecation warnings and an enum collection
warning, with no test failures. Tests cover architecture, metric/hash reproduction,
household invariance, calibration-fold isolation, real-fold generation separation,
unchanged deterministic scoring and authorized parent response projection.
The previously ignored `test_ml_model.py` remains a local test file under the
existing repository privacy policy; tracked pipeline/API/growth tests also cover
artifact integrity and architecture. No new dependencies were added.

Final integrity checks verified every archived file, the active model checksum,
metadata and trainer fingerprint, unchanged dataset/split checksums, and unchanged
feature, calibration, generator and guide components. Both portal files were
compared with their archived originals: their only differences are the permitted
methodology/accuracy notice text. All 17 evidence links resolve locally and
`git diff --check` passes.

## Evidence sources

- [Feature contract and target](backend/ml/common.py)
- [Input and response schemas](backend/schemas/ml.py)
- [Loader and runtime inference](backend/ml/inference.py)
- [Preprocessing, household exclusion and calibration](backend/ml/pipeline.py)
- [Synthetic construction and growth assumptions](backend/ml/dataset_builder.py)
- [RF training, baselines and evaluation](backend/ml/train_random_forest.py)
- [Active RF evaluation metrics](backend/ml/artifacts/evaluation_metrics.json)
- [Archived original hybrid metrics](backend/ml/artifacts/hybrid_comparison_metrics.json)
- [Hybrid archive manifest](backend/ml/artifacts/hybrid_baseline_manifest.json)
- [Shared teacher and parent prediction routes](backend/routes/ml.py)
- [Official ECCD scorer](backend/utils/eccd_scorer.py)
- [Independent PRE-based guides](backend/ml/prescriptions.py)
- [Teacher prediction page](frontend/src/pages/teacher/MlInsights.tsx)
- [Parent prediction page](frontend/src/pages/parent/ParentMlInsights.tsx)
- [Model evaluation report](ML_ACCURACY_REVIEW.md)
