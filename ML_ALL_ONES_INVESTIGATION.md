# AMES ML Insights: Investigation of the All-1 PRE Profile

Evidence snapshot: **2026-10-29**. This document records the completed read-only investigation; saving it did not rerun the analysis or change the application.

## Summary

**The local model can produce the reported display, but the screenshot cannot be reproduced exactly without its missing inputs.** In one diagnostic scenario, Significant Delay is exactly `1.0`; in another, it is slightly below `1.0` and rounds to `100.0%`. The strongest concern is that the all-1 profile has no matching training support, while nearby severe synthetic profiles consistently have delayed POST labels.

Production parity remains **unverified**. No fixes, retraining, dataset regeneration, database operations, branch changes, commits, pushes, or deployments were performed. Existing uncommitted changes were preserved. This Markdown report is the only addition authorized after the investigation.

The beneficiary is a kindergarten school. The screenshot reports:

- “Suggests Significant Delay in Overall Development”
- “100.0% Model confidence”
- Average 0.0%, Slight Delay 0.0%, Significant Delay 100.0%

All seven PRE domain scaled scores were set to 1. The screenshot does not establish the submitted age or other inputs. Severe PRE difficulties do not guarantee a delayed POST outcome; this investigation concerns the actual estimator and application behavior.

## 1. Active model identity and deployment parity

### Verified local identity

| Item | Verified local finding |
| --- | --- |
| Branch | `main` |
| HEAD | `608823d7abdaec8f607f9b66c7eda875645d076c` |
| Runtime artifact | `backend/ml/artifacts/rf_post_test_model.joblib` |
| Model SHA-256 | `2de3f5d3b31831438b60936864322935e23d61c30a5df1aeb077509538384541` |
| Git correspondence | Artifact bytes equal the artifact committed at HEAD |
| Estimator | `Pipeline` → `ColumnTransformer` → `RandomForestClassifier` |
| Main parameters | 400 trees; `gini`; `max_depth=None`; `max_features="sqrt"`; `min_samples_split=6`; `min_samples_leaf=2`; `bootstrap=True`; `class_weight="balanced"`; `random_state=42` |
| Numeric preprocessing | Training-median imputation, then `StandardScaler` |
| Categorical preprocessing | Training-mode imputation, then `OneHotEncoder(handle_unknown="ignore")` |
| Training metadata | 1,070 training rows; 459 test rows; seed 42; Python 3.12.13; scikit-learn 1.9.1 |
| Calibration/support adjustment | Neither exists in this loaded pipeline |

Other inspected forest settings include `max_samples=None`, `ccp_alpha=0.0`, `oob_score=False`, `n_jobs=1`, and `warm_start=False`.

The actual estimator class order is:

1. `Average Overall Development`
2. `Suggests Significant Delay in Overall Development`
3. `Suggests Slight Delay in Overall Development`

The runtime explicitly loads this filename; it does not select `rf_post_test_model_v2.joblib`. The two advanced-development classes are unsupported.

Sources: [inference.py:16](backend/ml/inference.py#L16), [training pipeline:33](backend/ml/train_random_forest.py#L33), [saved metadata:283](backend/ml/artifacts/evaluation_metrics.json#L283).

The exact external feature order is:

```text
gm_pre_scaled, fm_pre_scaled, sh_pre_scaled, rl_pre_scaled,
el_pre_scaled, cog_pre_scaled, se_pre_scaled,
pre_total_scaled, pre_standard_score, pre_delayed_domains_count,
age_months_pre, gender, handedness, mother_education_level,
father_education_level, household_occupation_tier,
num_siblings, birth_order
```

The fitted transformer selects numeric and categorical columns by name. Its numeric block includes siblings and birth order before the encoded categorical block. Names, student identifiers, LRNs, source labels, and MID/POST measurements are not predictor inputs. [Feature contract:26](backend/ml/common.py#L26).

### Working-tree differences

At investigation time, these five files had existing uncommitted modifications:

```text
AI_CONTEXT.md
backend/ml/README.md
frontend/src/pages/teacher/MlInsights.tsx
frontend/src/utils/mlScoring.ts
frontend/tests/ml-sandbox.spec.ts
```

The committed Sandbox at HEAD accepts scaled scores. The working copy instead accepts raw KAYA counts and derives scaled scores. The probability display logic is unchanged. These frontend edits cannot be assumed deployed. Existing modifications were preserved.

### Experiment correspondence

The local files do not all describe the same experiment:

- The active artifact and `evaluation_metrics.json` match the original baseline archive byte for byte; their metadata agree.
- The current CSVs under `backend/ml/data/` do **not** match the artifact’s dataset/split hashes.
- Exact hash-matching datasets exist under `backend/ml/artifacts/baseline_before_shortcut_removal/data/`. These were used for the training-support investigation.
- The current `MODEL_EVALUATION_REPORT.md` describes a different, calibrated `soft_voting_rf_histogram` experiment. Its reported all-1 percentages are **not** outputs of the active forest.
- The current `dataset_audit.json` also describes different generation/training settings, including recovery factor `0.4` and additional weighting. Those are not the active baseline’s settings.

The artifact’s expected dataset hashes, matched by the archived files, are:

| Dataset | SHA-256 |
| --- | --- |
| `hybrid_eccd_dataset.csv` | `900f270b44b436f04da38f49130811b047aa0c1142c50c9ba85b71fa4bd01e19` |
| `train_set_70.csv` | `b0f7ee5192fddfbae144fc320e167e7557902f929b7125bba348f6d2d378ccf4` |
| `test_set_30.csv` | `5eb147cac61a4e5e3e8aab07c9efe05e2d0b199509b243103a7191812d0e0081` |

Evidence: [active dataset metadata:319](backend/ml/artifacts/evaluation_metrics.json#L319), [conflicting report:1](backend/ml/artifacts/MODEL_EVALUATION_REPORT.md#L1), [conflicting audit:463](backend/ml/artifacts/dataset_audit.json#L463), [matching archived audit:463](backend/ml/artifacts/baseline_before_shortcut_removal/dataset_audit.json#L463).

Fresh inference reproduced **408/459 = 88.89%** accuracy on the hash-matching archived holdout. Using the current mismatched holdout CSV instead produced **326/459 = 71.02%**. These are different datasets, not evidence that runtime probabilities changed.

The active source recipe is consistent with the baseline parameters and original generation assumptions. The bundle does not record an immutable training-source commit or training timestamp, so exact training-source provenance cannot be established from its metadata alone.

### Production parity: unverified

GitHub/deployment verification was unavailable, and no deployed commit IDs, frontend bundle, or running-worker artifact hash were supplied. Local `main`, including its local `origin/main` reference, cannot establish production identity.

The loader caches models by path without checking file modification time or hash. Replacing a file can leave existing workers using the previously loaded object until they restart or explicitly invalidate the cache. Startup warms the model, but health/readiness responses do not expose its identity. This is a possible deployment discrepancy—not an established cause of the screenshot.

Sources: [model cache:16](backend/ml/inference.py#L16), [startup:80](backend/main.py#L80), [health responses:124](backend/main.py#L124), [deployment configuration](render.yaml).

## 2. Complete prediction path

### Frontend inputs and derived values

The committed Sandbox at HEAD accepts seven **scaled scores**. Its relevant code is `frontend/src/pages/teacher/MlInsights.tsx`, **HEAD lines 778–895**. Those line numbers refer to the committed version read with `git show HEAD:frontend/src/pages/teacher/MlInsights.tsx`, not the modified working-copy line numbers.

The committed implementation:

1. Converts domain inputs to numbers.
2. Sums them into `pre_total_scaled`.
3. Counts domains `<=6`.
4. Derives the standard score using the age-selected scoring table.
5. Converts blank optional fields to JSON `null`.
6. Posts to `/api/ml/predict/sandbox`.

The uncommitted working copy instead accepts **raw KAYA counts**, derives scaled scores, and sends the same 18-field API contract. Its probability display logic is unchanged. These frontend edits cannot be assumed deployed. [Working-copy derivation:836](frontend/src/pages/teacher/MlInsights.tsx#L836), [payload:950](frontend/src/pages/teacher/MlInsights.tsx#L950).

The Sandbox preserves owner-scoped inputs across reloads, so the committed default age of 66 months does not establish the screenshot’s submitted age.

### Backend validation, preprocessing, and response

On the backend:

- Pydantic validates ranges, categories, missing optional values, and rejects extra fields.
- The Sandbox independently recomputes the three composites, overriding stale client totals.
- `None` becomes `NaN`; the fitted pipeline imputes missing inputs.
- `predict_proba` supplies probabilities.
- `argmax` chooses the predicted class; probabilities are associated with `pipeline.classes_`.
- The response multiplies probabilities by **100 once**.
- The frontend uses `.toFixed(1)` for confidence and individual percentages.

There is no application probability clipping, renormalization, forced Significant Delay outcome, confidence cap, or profile-specific override in this path. The frontend looks up probabilities by complete class name, so its different visual ordering does not swap classes. The frontend’s missing-key fallback to zero is not responsible for the inspected results: all three class keys are present.

Sources: [validation:12](backend/schemas/ml.py#L12), [Sandbox and response:87](backend/routes/ml.py#L87), [inference:34](backend/ml/inference.py#L34), [display:239](frontend/src/pages/teacher/MlInsights.tsx#L239).

### Composites for seven scaled scores of 1

The application derives:

```text
PRE total scaled             = 7
PRE delayed-domain count     = 7
PRE standard score           = 37
```

The standard-score tables begin at total **29**, whose standard score is **37**. Total 7 receives that lowest entry through the existing lookup fallback. This produces a model input; it does not directly force the predicted POST class.

The backend function and inspected frontend helper agree on standard score 37 for the diagnostic ages. Sources: [composite calculation:37](backend/ml/common.py#L37), [lookup fallback:40](backend/utils/eccd_scorer.py#L40), [table minimum:135](backend/eccd_scoring_data.json#L135), [working-copy frontend scoring:46](frontend/src/utils/mlScoring.ts#L46).

## 3. Full-precision local diagnostic results

These are explicitly hypothetical scenarios, **not exact reproductions of the screenshot**. The user confirmed that its exact Sandbox age and request/response JSON were unavailable.

### Exact inputs

Scenario B used this complete payload:

```json
{
  "gm_pre_scaled": 1,
  "fm_pre_scaled": 1,
  "sh_pre_scaled": 1,
  "rl_pre_scaled": 1,
  "el_pre_scaled": 1,
  "cog_pre_scaled": 1,
  "se_pre_scaled": 1,
  "pre_total_scaled": 7,
  "pre_standard_score": 37,
  "pre_delayed_domains_count": 7,
  "age_months_pre": 66,
  "gender": null,
  "handedness": null,
  "mother_education_level": null,
  "father_education_level": null,
  "household_occupation_tier": null,
  "num_siblings": null,
  "birth_order": null
}
```

The other scenarios used precisely these differences; every field not listed remains identical to B:

| Scenario | Differences from B |
| --- | --- |
| A | `age_months_pre=60` |
| B | None |
| C | `age_months_pre=72` |
| D | Age remains 66; `gender="FEMALE"`, `handedness="Left"`, both education fields `"College"`, occupation `"Professional"`, `num_siblings=0`, `birth_order=1` |

Composites were calculated with the existing `sandbox_composites` function. The existing Sandbox handler was called directly, its response schema was validated, and pipeline probabilities were inspected separately. This was not an HTTP request to production. Database connections were explicitly blocked during the diagnostic.

For A–C, missing values become these fitted imputation values:

```text
gender=MALE
handedness=Right
mother_education_level=High School
father_education_level=High School
household_occupation_tier=Informal_Daily_Wage
num_siblings=2
birth_order=2
```

These are imputer defaults, not assertions about any learner. Scenario D has no missing fields.

### Raw estimator probabilities

Raw probabilities below use 17 significant digits. Columns follow the UI order; their complete class names are:

- Average: `Average Overall Development`
- Slight Delay: `Suggests Slight Delay in Overall Development`
- Significant Delay: `Suggests Significant Delay in Overall Development`

| Scenario | Average raw | Slight Delay raw | Significant Delay raw |
| --- | ---: | ---: | ---: |
| A | `0.00041666666666666664` | `0` | `0.99958333333333338` |
| B | `0` | `0` | `1` |
| C | `0.012785714285714284` | `0.00041666666666666664` | `0.98679761904761909` |
| D | `0.0001020408163265306` | `0.0050000000000000001` | `0.99489795918367352` |

Each raw probability vector sums to 1 in the diagnostic. Only B has a Significant Delay raw probability exactly equal to 1.

### API percentages and frontend formatting

The corresponding API percentage values and JavaScript-formatted displays are:

| Scenario | API Average % | API Slight % | API Significant % | Display: Average / Slight / Significant |
| --- | ---: | ---: | ---: | --- |
| A | `0.041666666666666664` | `0.0` | `99.95833333333334` | `0.0% / 0.0% / 100.0%` |
| B | `0.0` | `0.0` | `100.0` | `0.0% / 0.0% / 100.0%` |
| C | `1.2785714285714285` | `0.041666666666666664` | `98.6797619047619` | `1.3% / 0.0% / 98.7%` |
| D | `0.01020408163265306` | `0.5` | `99.48979591836735` | `0.0% / 0.5% / 99.5%` |

All four predict `Suggests Significant Delay in Overall Development`. Their `confidence_percentage` field equals the Significant Delay API percentage, and its formatted confidence display equals the final percentage in the last column.

Thus **A and B produce the screenshot’s displayed percentages through different raw results**. Age and optional inputs materially affect the result. The screenshot alone cannot distinguish estimator certainty from a value rounded to 100.0%.

## 4. Estimator behavior and reached-leaf support

Random Forest probabilities average the individual trees’ class-probability vectors; they are not simply percentages of winning tree votes. [scikit-learn RandomForestClassifier documentation](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html).

### Scenario B: exact probability 1

For **B, age 66 with optional inputs missing**:

- All **400 trees** return `[Average=0, Significant=1, Slight=0]`.
- Each reached leaf contains only Significant Delay training outcomes.
- Reached leaves contain **9–190 distinct in-bag training records**, median **110.5**.
- Their bootstrap multiplicity counts range **11–321**, median **179**.
- Across those overlapping leaves, the union contains **323 distinct training records—all synthetic**.

The forest therefore averages to exactly `[0,1,0]`. The large leaf counts do not establish that the unsupported all-1 input is represented: trees route it into regions containing less extreme synthetic examples. The 400 trees and overlapping leaf memberships are not 400 independent cohorts.

### Scenario A: rounded probability below 1

For **A, age 60**:

- 399 trees return Significant Delay probability `1`.
- One returns Significant Delay `5/6` and Average `1/6`.
- Every tree’s winning class is still Significant Delay, but:

```text
P(Significant Delay) = (399 + 5/6) / 400
                     = 0.9995833333333334
```

This directly demonstrates why unanimous winning classes need not mean probability 1.

### Weighting and uncertainty adjustments

Stored balanced-class weights are approximately **0.963964 for Average** and **1.019048 for each delay class**. No additional real-versus-synthetic sample weights were present. In the installed scikit-learn 1.9.1 implementation, these weights govern bootstrap sampling; reconstruction of the reached leaf counts and probabilities matched exactly.

Local implementation evidence: `.venv312/Lib/site-packages/sklearn/ensemble/_forest.py`, lines **95–111** for weighted bootstrap sampling, **150–168** for bootstrap multiplicity weights, and **921–965** for probability averaging. The active trainer’s class-weight configuration is in [train_random_forest.py:40](backend/ml/train_random_forest.py#L40).

The active artifact contains no `CalibratedClassifierCV`, calibrated ensemble, conformal wrapper, range-distance blending, or other support-dependent uncertainty adjustment. The adjustments described in the conflicting local experiment report are not applied by this runtime pipeline.

## 5. Training support and synthetic-generation findings

### Matching training data

The matching training split contains **21 real and 1,049 synthetic records**. Selected ranges are:

| PRE feature | Real training range | Synthetic training range |
| --- | ---: | ---: |
| Gross Motor | 1–11 | 1–13 |
| Fine Motor | 1–12 | 1–14 |
| Self-Help | 2–13 | 1–14 |
| Receptive Language | 1–8 | 1–11 |
| Expressive Language | 5–11 | 2–11 |
| Cognitive | 1–15 | 1–16 |
| Socio-Emotional | 2–13 | 1–13 |
| Total scaled | 24–74 | 11–91 |
| Standard score | 37–103 | 37–127 |
| Delayed-domain count | 1–6 | 0–7 |
| Age, completed months | 59–80 | 59–80 |

Aggregate calculations used the hash-matching [training CSV](backend/ml/artifacts/baseline_before_shortcut_removal/data/train_set_70.csv#L1), whose expected hash is recorded in [active metadata:320](backend/ml/artifacts/evaluation_metrics.json#L320). These local datasets may be Git-ignored and unavailable in a clean clone; no learner-level records are reproduced here.

Findings:

- **Zero** real or synthetic training records have seven scores equal to 1.
- Total **7** is below the training minimum **11**.
- Expressive Language **1** is below even the synthetic training minimum **2**.
- Using sum of absolute differences across the seven domains, the nearest synthetic training profiles are distance **4** away: two records, both Significant Delay POST.
- The nearest real training profile is distance **17** away and has an Average POST outcome.
- All **190 synthetic training records with every domain ≤6** have Significant Delay POST labels.

The same absence of exact all-1 profiles holds in the full matching dataset. Across all 1,500 synthetic records, all **263 profiles with every domain ≤6** have Significant Delay POST labels. These neighborhood descriptions are descriptive aggregate checks, not validated clinical similarity measures or recovery probabilities.

### Scoring feasibility

At age 66, the current oldest-bracket lookup cannot produce Self-Help below **2** or Expressive Language below **5**. Consequently, all seven scaled scores equal to 1 cannot arise from that bracket’s normal raw-score conversion, although the committed scaled-input Sandbox and API permit the values.

Sources: [Self-Help table:866](backend/eccd_scoring_data.json#L866), [Expressive Language table:904](backend/eccd_scoring_data.json#L904), [API score range:7](backend/schemas/ml.py#L7).

This is stronger than merely finding an unusual combination of individually valid training values: the diagnostic profile is outside observed ranges for at least one domain and its total, and it also conflicts with age-specific score attainability.

### Influence of synthetic generation

Synthetic generation strongly explains the severe-profile association, without proving a real-world prognosis.

The matching baseline generator:

- Bootstraps real ages, gender, handedness, and assessment spacing.
- Generates 30% beneficiary-shaped candidate baselines and broadens the remainder.
- Uses this limited-growth assumption:

```text
growth = clip(
    0.25 × observed_capacity_growth
    − 0.035 × assumed_household_risk
    + Normal(0, 0.012),
    0, 0.4
)
```

- Simulates POST raw scores, applies application scoring, then rejection-samples **500 outcomes per class**.

Household effects and restricted recovery are declared assumptions. Equal class counts are imposed rather than observed school prevalence. The matching audit records observed median capacity growth of 1.0 in each domain, but the synthetic scenario uses only a fraction of that quantity before its risk penalty and noise. The resulting nearby synthetic severe profiles consistently remain delayed.

Sources: [generator:176](backend/ml/dataset_builder.py#L176), [matching generation audit:454](backend/ml/artifacts/baseline_before_shortcut_removal/dataset_audit.json#L454).

The full matching dataset contains **29 real students and 1,500 synthetic records**. All 29 real POST outcomes are Average, including **21 with Significant Delay PRE and four with Slight Delay PRE**. Those recoveries concern less extreme profiles; they do not establish recovery rates for all-1 profiles.

All real students contributed generator anchors, covariance, growth estimates, or timing **before splitting**. Validation students therefore influenced data generation. Although POST fields are excluded from inference features and preprocessing is fitted within training, this evaluation is not independent cohort validation.

Sources: [generation sequence:252](backend/ml/dataset_builder.py#L252), [subsequent split:255](backend/ml/train_random_forest.py#L255).

The matching model’s real holdout accuracy is **2/8**, and there are **no real delayed POST outcomes** to validate delay-class detection. The saved mixed-holdout accuracy is **408/459**, dominated by synthetic cases; synthetic holdout accuracy is **406/451**. An always-Average predictor is correct on all 29 observed real POST outcomes.

Sources: [source-specific metrics:234](backend/ml/artifacts/evaluation_metrics.json#L234), [real benchmark:256](backend/ml/artifacts/evaluation_metrics.json#L256).

## 6. Confirmed findings versus unresolved hypotheses

### Confirmed locally

- The active forest can output exact Significant Delay probability **1**.
- One-decimal formatting can also display **100.0%** for a probability below 1.
- Class mapping and percentage multiplication are correct in the inspected path.
- The all-1 profile lacks training support and can violate age-specific scoring feasibility.
- Scenario B’s reached leaves are supported entirely by synthetic outcomes.
- The active model has no calibration or support-based uncertainty adjustment.
- Several local research files describe a different experiment.
- The current uncommitted raw-input Sandbox changes the route from user inputs to scaled features, but does not change probability formatting or the active model artifact.

### Still unresolved

- The screenshot’s actual age and seven optional inputs.
- Its raw response and whether its `100.0%` was exact or rounded.
- The deployed frontend/backend commits and loaded model hash.
- Whether production workers retained a previously cached artifact.
- The real POST outcome distribution for children with comparable extreme PRE profiles.

The cached-model explanation is a deployment possibility, not an established cause. The local reproduction establishes estimator/application behavior, not the exact provenance of the screenshot.

## 7. Prioritized recommendations for review

These are proposals only. None were implemented.

### 1. Reconcile model provenance and evaluation files

Associate the artifact, datasets, scoring tables, source revision, preprocessing, and metrics with one immutable release manifest. Expose a non-sensitive release/model identifier and verify it in running workers. Preserve other experiments under clearly separate identities.

This addresses reproducibility and deployment verification; it does not improve model validity by itself.

### 2. Review application input feasibility and support handling

No probability-mapping correction is indicated. Separately assess age-specific attainable scores and joint training support. For unsupported profiles, consider reporting insufficient evidence or abstaining from an outcome forecast while retaining PRE-based teaching guidance.

Thresholds need validation on representative real data. Being within individual feature ranges does not establish joint support, and a distance score alone is not a calibrated error probability. Any validation change should preserve existing draft durability and avoid silently changing the submitted profile.

### 3. Rebuild the evaluation design around real kindergarten outcomes

Obtain representative longitudinal cohorts, including delayed and recovered POST outcomes and severe PRE profiles. Split real students/cohorts before fitting generators or preprocessing. Report real-only class support, class-specific errors, baseline comparisons, and probability metrics.

The existing all-Average cohort cannot establish three-class discrimination. Synthetic assumptions should be reviewed against observed developmental trajectories rather than selected to produce preferred all-1 outcomes.

### 4. Evaluate calibration only with adequate independent data

Compare sigmoid calibration, or isotonic calibration when sufficient data exist, using out-of-sample predictions and a separate final evaluation. Include reliability plots, log loss, and Brier scores.

Calibration requires representative outcomes across classes. Synthetic-only calibration cannot establish school-population probabilities, and neither method establishes correctness outside training support. Calibration may improve some probability diagnostics while worsening others; no accuracy improvement is promised. [scikit-learn calibration guidance](https://scikit-learn.org/stable/modules/calibration.html).

### 5. Clarify presentation of uncertainty

Present the value as an uncalibrated model probability, show support limitations beside it, and make rounding transparent when a value below 100% displays as `100.0%`. Tree agreement should not be presented as certainty about a child’s future.

Do not arbitrarily cap confidence at 99%, assign invented recovery percentages, force another outcome, or change outcome labels to make the result appear realistic.

## 8. Missing information for an exact reproduction

An exact screenshot reproduction still requires:

- The submitted `age_months_pre`.
- Gender and handedness, including whether each was missing.
- Both parental education values, household occupation tier, sibling count, and birth order, including missingness.
- The sanitized Sandbox request and raw response, if recoverable.
- The deployed frontend/backend commit IDs and the model hash actually loaded by the serving worker or workers.

No particular accuracy improvement or recovery percentage is established by this investigation. Further implementation requires a separate reviewed request.
