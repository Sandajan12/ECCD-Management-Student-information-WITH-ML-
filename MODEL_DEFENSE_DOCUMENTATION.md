# Model Defense Documentation: Active Standalone Random Forest

Prepared: **2026-11-05**

Scope: the active standalone, sigmoid-calibrated Random Forest on this branch.

All numerical model results below come from the active
[evaluation record](backend/ml/artifacts/evaluation_metrics.json).
Unrounded recorded values accompany rounded percentages where useful. Dataset
constraints and the client’s account of missing historical records follow
[ML_MODEL_AUDIT.md](ML_MODEL_AUDIT.md). Source code establishes implementation
behavior; neither successful software tests nor model publication proves
real-world predictive validity.

## 1. Executive overview and thesis alignment

**Approved research title:**

> A Random Forest-Based System for Early Childhood Performance Analytics for Kindergarten Level at Apolinario Mabini Elementary School

**Machine-learning objective:** predict the student’s post-test developmental
interpretation from pre-test data using Random Forest.

The implemented classifier matches this objective at the algorithm and integration
level. Its mixed-holdout accuracy is **92.16%**, but real-holdout accuracy is only
**37.50% (3/8)**. All 29 available real learners have Average POST outcomes;
predicting Average for everyone scores **100%** on this cohort. Consequently,
**reliable real-world predictive usefulness and real delay detection are not
established**. The defensible contribution is an implemented, evaluated
experimental forecasting system with explicitly bounded findings.

### 1.1 Active artifact and reproducibility

| Property | Verified value or provenance |
| --- | --- |
| Artifact | [backend/ml/artifacts/rf_post_test_model.joblib](backend/ml/artifacts/rf_post_test_model.joblib) |
| SHA-256, evaluation record and actual file | `1ff4591f0f8e21bbaeb48f5617f61acd460f2953f6609cac52d5f86a6bdcec73` |
| Candidate identifier | `rf_full_leaf3` |
| Recorded Python / scikit-learn versions | 3.12.13 / 1.9.1 |
| Documented integration/training date | 2026-11-05, recorded in the current-model section of [AI_CONTEXT.md](AI_CONTEXT.md) |
| Exact training timestamp | **Not recorded** in the evaluation JSON or serialized bundle metadata |
| Observed artifact file modification time | 2026-11-05 07:24:16 UTC; filesystem metadata, **not proof of training completion time** |
| Runtime integration | Shared cached loader and inference service for teacher and parent predictions |
| Hosted deployment status | Not established by branch integration or this documentation |

The checksum identifies the exact artifact evaluated here. A precise training
time cannot be reconstructed reliably from modification time; it must not be
invented or backfilled as an observed training event.

### 1.2 Architecture and training procedure

The base classifier is a standalone `RandomForestClassifier` with:

| Parameter | Recorded value |
| --- | --- |
| `n_estimators` | `400` |
| `min_samples_leaf` | `3` |
| `max_features` | `0.8` |
| `class_weight` | `balanced` |
| `random_state` | `42` |
| `n_jobs` | `1` |

The selected configuration came from prior screening. This run evaluates that
specified configuration; it does not document a fresh hyperparameter search,
optimality, or superiority over alternative algorithms.

The saved outer pipeline contains `SupportAwareCalibration`, a subclass of
`CalibratedClassifierCV`, using `method='sigmoid'`, three shuffled stratified
calibration folds, seed 42, and `ensemble=False`. Inside it,
`FoldWeightedClassifier` fits feature engineering, imputation, encoding, and
the Random Forest separately within training/calibration folds. Inner out-of-fold
predictions fit the sigmoid calibration; the base estimator is then refit on the
available training portion. The final deployed base forest contains 400 trees;
the calibration procedure also fits temporary forests.

Real rows receive sample weight 2 and synthetic rows weight 1. A fit-local
12-neighbor consistency rule halves the weight of isolated synthetic
contradictions; real outcomes retain their labels and original weights.
`class_weight='balanced'` is an additional estimator setting, distinct from
these real/synthetic sample weights.

The calibration wrapper also blends probabilities toward weighted training
class priors when PRE score inputs exceed training support. The blend mass is
`1 - exp(-L2(range_overshoot / training_std))`; age alone does not trigger it.
This additional safeguard is part of the actual deployed probability method.
It does not establish valid recovery probabilities outside the observed data.

See [training code](backend/ml/train_random_forest.py),
[pipeline components](backend/ml/pipeline.py), and
[artifact loader](backend/ml/inference.py). Runtime inference loads and caches
the artifact; it does not retrain or write official assessment results.

## 2. Feature space: X and Y

### 2.1 Target Y

The supervised target is `post_interpretation`, with these exact supported labels:

- `Suggests Significant Delay in Overall Development`
- `Suggests Slight Delay in Overall Development`
- `Average Overall Development`

“Significant Delay,” “Slight Delay,” and “Average” below abbreviate those labels.
The target is the later **overall POST interpretation**, not a predicted PRE
domain badge, individual checklist answer, diagnosis, or treatment effect.
The two advanced developmental POST categories are unsupported; generated
advanced POST candidates are excluded, not relabeled into the supported classes.

### 2.2 Received X: exact 18-field API contract

The public feature object contains 18 fields. Five are pruned, leaving **13
retained fields: 11 numeric and two categorical**. The two summary features
`pre_total_scaled` and `pre_delayed_domains_count` are already included in
those 13; they are not two additional public inputs.

| Input | Meaning | Used by classifier? |
| --- | --- | --- |
| `gm_pre_scaled` | Gross Motor PRE scaled score | Retained |
| `fm_pre_scaled` | Fine Motor PRE scaled score | Retained |
| `sh_pre_scaled` | Self-Help PRE scaled score | Retained |
| `rl_pre_scaled` | Receptive Language PRE scaled score | Retained |
| `el_pre_scaled` | Expressive Language PRE scaled score | Retained |
| `cog_pre_scaled` | Cognitive PRE scaled score | Retained |
| `se_pre_scaled` | Socio-Emotional PRE scaled score | Retained |
| `pre_total_scaled` | Sum of the seven PRE domain scaled scores | Retained |
| `pre_standard_score` | Official PRE standard score from total and age lookup | Retained |
| `pre_delayed_domains_count` | Number of PRE domains with scaled score ≤6 | Retained |
| `age_months_pre` | Completed age in months at PRE | Retained |
| `gender` | Child gender (MALE/FEMALE; nullable) | Retained |
| `handedness` | Child handedness (Left/Right; nullable) | Retained |
| `mother_education_level` | Mother’s education category (nullable) | Excluded before preprocessing |
| `father_education_level` | Father’s education category (nullable) | Excluded before preprocessing |
| `household_occupation_tier` | Household occupation category (nullable) | Excluded before preprocessing |
| `num_siblings` | Number of siblings (nullable) | Excluded before preprocessing |
| `birth_order` | Birth order (nullable) | Excluded before preprocessing |

The seven domain scaled scores allow integers 0–19; PRE total 0–133; standard
score 0–200; delayed-domain count 0–7. General feature validation accepts age
1–216 months, while the sandbox restricts it to 36–71 completed months.
These API bounds describe accepted inputs, not evidence of predictive validity
throughout those ranges.

The total is the sum of seven scaled scores. The delayed-domain count includes
**both** Delay and Slight Delay planning tiers because its threshold is ≤6.
The standard score uses the official age/total lookup. Sandbox processing
recomputes these summaries from PRE inputs rather than trusting stale totals.
Child identity, names, LRNs, data-source labels, and MID/POST measurements do
not enter X. POST information supplies training labels and generator-development
anchors, not runtime predictors.

Sources: [feature order and derived summaries](backend/ml/common.py),
[validated API schema](backend/schemas/ml.py), and
[shared prediction routes](backend/routes/ml.py).

### 2.3 Household exclusion and the anti-bias rationale

The five excluded fields are `mother_education_level`,
`father_education_level`, `household_occupation_tier`, `num_siblings`, and
`birth_order`. They remain accepted for contract compatibility, but their
values and missingness indicators never reach the estimator. Each has exactly
**0.0** recorded model importance. Household income is **not** one of the 18
fields; occupation tier must not be described as measured income.

The pedagogical rationale is to base forecasting on recorded developmental
evidence and basic child demographics, without allowing unavailable family
background values or socioeconomic status to directly determine predictions.
This reduces a specific source of proxy dependence and avoids treating absent
family information as a risk signal. It is **not proof of fairness**: age,
gender, correlated developmental features, and data-generation assumptions
can still introduce disparities, and no subgroup fairness validation is established.

The current generator also contains illustrative household-related assumptions.
Pruning these fields from X does not prove their indirect influence on synthetic
outcomes has disappeared. Synthetic-label validity and fairness remain limitations.

### 2.4 Internal engineering and preprocessing

Beyond the 13 retained fields, preprocessing derives six PRE summaries:

| Internal feature | Computation |
| --- | --- |
| `motor_composite` | Mean of Gross Motor and Fine Motor scaled scores |
| `language_composite` | Mean of Receptive and Expressive Language scaled scores |
| `cog_socio_composite` | Mean of Cognitive and Socio-Emotional scaled scores |
| `delay_ratio` | `pre_delayed_domains_count / 7` |
| `domain_std` | Population standard deviation across seven domain scores |
| `min_domain_score` | Minimum of the seven domain scores |

Three additional features—`capacity_interval_mean`,
`capacity_interval_lower`, and `capacity_interval_upper`—use fixed official
raw-to-scaled lookup intervals and PRE age. They are interval proxies, not
recovered observed raw scores or measurements of true latent capacity.

Numeric imputation uses training medians followed by standard scaling.
Gender and handedness use training modes and unknown-safe one-hot encoding.
These operations are fit within each relevant training fold. The encoded design
matrix therefore has a different width from the 18-field public API.
All these transformations are defined in [pipeline.py](backend/ml/pipeline.py).

### 2.5 Deterministic PRE interpretation versus ML forecasting

The official [ECCD scorer](backend/utils/eccd_scorer.py) converts recorded
checklist marks using fixed [scoring tables](backend/eccd_scoring_data.json).
The prediction response then assigns the same `baseline_domains` planning
tiers in both portals:

| PRE domain scaled score | Displayed planning tier |
| --- | --- |
| 0–3 | Delay |
| 4–6 | Slight Delay |
| 7 or above | Average |

**These PRE badges are deterministic rules, not Random Forest predictions.**
They describe current recorded PRE performance. The official DepEd scoring
lookup and these local planning tiers should be distinguished: the tiers and
locally authored activities are not an independently validated DepEd diagnostic
classification for individual domains.

[Activity prescriptions](backend/ml/prescriptions.py) and the
[guide artifact](backend/ml/artifacts/prescriptive_guides.json) are also
deterministic: a domain triggers guidance when its PRE scaled score is ≤6 or
when explicit PRE DI-KAYA items are present. A higher-tier domain may still
receive item-specific guidance. The predicted POST category does not determine
these triggers. This keeps observed support needs visible even when the
experimental forecast is inaccurate.

Teachers and parents use the same model and PRE-tier rules. Parent inference
additionally requires an eligible linked child, complete teacher-confirmed PRE,
the active adviser’s prediction permission, and independent PRE score release.
Parent responses omit family inputs and individual checklist marks. Predictions
never replace official scores or modify assessment records.

## 3. Evaluation design and measured performance

### 3.1 Dataset composition and independence

The saved experiment contains **1,529 rows: 29 real learners and 1,500 synthetic
scenarios**. The main stratified 70/30 split uses seed 42:

| Partition | Real | Synthetic | Total |
| --- | ---: | ---: | ---: |
| Training | 21 | 1,049 | 1,070 |
| Holdout | 8 | 451 | 459 |
| Total | 29 | 1,500 | 1,529 |

The synthetic scenarios impose 500 supported POST outcomes per class. Therefore,
the whole cohort contains 500 Significant Delay, 500 Slight Delay, and 529 Average
rows; **all 29 observed real POST outcomes are Average**. Synthetic balance is a
research design, not the school’s measured outcome prevalence.

All 29 real learners anchored the main generator **before** the saved split.
Training-only preprocessing prevents one kind of leakage but does not remove
this shared-anchor dependence. Main mixed holdout and CV results therefore
measure consistency with the constructed scenario distribution, not independent
real-cohort forecasting.

### 3.2 Accuracy breakdown

| Evaluation | Accuracy (rounded) | Correct / evaluated | Interpretation |
| --- | --- | --- | --- |
| Mixed holdout | 92.1569% | 423/459 | 451 synthetic and 8 real rows; main generator used all real anchors |
| Five-fold mixed training CV (mean) | 88.5981% | 5 folds × 214 validation rows | Measures the full procedure on the mixed training distribution |
| Synthetic holdout | 93.1264% | 420/451 | Generated scenarios; no additional observed children |
| Real holdout | 37.5000% | 3/8 | All eight observed POST outcomes are Average; shared generator anchors |
| Shared-anchor real benchmark | 31.0345% | 9/29 | 21 training OOF predictions + 8 real holdout predictions |
| Separate exploratory real-fold evaluation (pooled) | 44.8276% | 13/29 | Fold-local generation; learners already used in development |
| Always-Average baseline, real cohort | 100.0000% | 29/29 | Specific to this all-Average cohort |

The exact accuracy values, in the same order as the table, are:
`0.9215686274509803`, `0.8859813084112149`, `0.9312638580931264`, `0.375`, `0.3103448275862069`, `0.4482758620689655`, `1`.

The shared-anchor real benchmark combines out-of-fold predictions for the 21
real training learners with held-out predictions for the other eight. Each
learner is excluded from its relevant estimator fit, but remains among the
main generator’s original anchors. It is not a new external cohort.

Scoring the final saved estimator on all 29 real learners gives
75.8621% (22/29), but includes 21 training
learners. This is a descriptive reuse result and must not be cited as unseen
real-world accuracy.

### 3.3 Mixed-holdout classification metrics

The headline macro metrics average the **three supported labels equally**.
Weighted metrics use their observed supports: 150, 150, and 159.

| Metric | Unrounded recorded value | Percentage (rounded) |
| --- | --- | --- |
| `macro_precision` | 0.921887854513964 | 92.188785% |
| `macro_recall` | 0.9217610062893081 | 92.176101% |
| `macro_f1` | 0.9216904491425423 | 92.169045% |
| `weighted_precision` | 0.9221544430718813 | 92.215444% |
| `weighted_recall` | 0.9215686274509803 | 92.156863% |
| `weighted_f1` | 0.9217272418844707 | 92.172724% |

Accuracy is correct predictions divided by all evaluated rows. Precision is the
fraction correct among predictions of a class; recall is the fraction recovered
among actual members of that class. F1 is their harmonic mean. A high value on
mostly synthetic rows cannot establish real delay sensitivity.

The JSON also retains a five-label classification report whose two unsupported
advanced labels have zero support. Its five-label macro F1 is
0.5530142694855253, unlike the three-supported-label
headline. These denominators must not be interchanged.

### 3.4 Per-class mixed-holdout metrics

Values below reproduce the recorded proportions without percentage rounding.

| Actual class | Precision | Recall | F1 | Support |
| --- | --- | --- | --- | --- |
| Significant Delay | 0.9463087248322147 | 0.94 | 0.9431438127090301 | 150 |
| Slight Delay | 0.8838709677419355 | 0.9133333333333333 | 0.898360655737705 | 150 |
| Average | 0.9354838709677419 | 0.9119496855345912 | 0.9235668789808917 | 159 |

### 3.5 Confusion matrix: actual versus predicted

Rows are actual classes; columns are predicted classes. This is the full
supported three-class mixed-holdout matrix, from `supported_confusion_matrix`.

| Actual / Predicted | Significant Delay | Slight Delay | Average | Actual total |
| --- | --- | --- | --- | --- |
| Significant Delay | 141 | 8 | 1 | 150 |
| Slight Delay | 4 | 137 | 9 | 150 |
| Average | 4 | 10 | 145 | 159 |
| Predicted total | 149 | 155 | 155 | 459 |

The diagonal gives **141 + 137 + 145 = 423 correct**, leaving 36 errors.
The first two rows are entirely synthetic because no real delayed POST
outcomes exist in the available cohort.

### 3.6 Five-fold mixed training cross-validation

The five outer stratified folds each validate 214 of the 1,070 training rows.
Each repeats preprocessing, weighting, RF fitting, and inner sigmoid calibration.

| Fold | Accuracy, recorded | Accuracy (rounded) | Macro F1, recorded |
| --- | --- | --- | --- |
| 1 | 0.8504672897196262 | 85.0467% | 0.8517189438242069 |
| 2 | 0.8878504672897196 | 88.7850% | 0.8888127849142551 |
| 3 | 0.9018691588785047 | 90.1869% | 0.9012058035046541 |
| 4 | 0.9112149532710281 | 91.1215% | 0.9116402116402117 |
| 5 | 0.8785046728971962 | 87.8505% | 0.8773047120205248 |

Mean accuracy is `0.8859813084112149` (88.5981%),
with population fold standard deviation `0.02102284463402244`
(2.1023 percentage points).
Mean macro F1 is `0.8861364911807705` (88.6136%).
These fold variation statistics are not confidence intervals or independent
external validation. Historical development and configuration screening also
limit claims of an untouched estimate.

### 3.7 Calibration and probability diagnostics

These values refer to calibrated probabilities on the 459-row mixed holdout:

| Diagnostic | Exact recorded value | Definition |
| --- | --- | --- |
| Log loss | 0.2290108590409 | Mean negative log probability of the actual class |
| Multiclass Brier sum | 0.11392011641560165 | Mean sum of squared class-probability errors; no division by class count |
| Top-label ECE, 10 bins | 0.04494113297076451 | Sample-weighted absolute confidence–accuracy gap across bins |
| Maximum predicted probability | 0.9519808813698627 | Largest top-class probability on this holdout |

Lower log loss and Brier score indicate smaller probability errors; ECE depends
on binning. The ECE is about 4.4941%
on this constructed holdout. Sigmoid calibration is a fitted probability
transformation, not proof of improved accuracy, real-world calibration, or
clinical confidence. No individual probability should be described as the
validated chance that a child will recover or respond to an intervention.

### 3.8 Baselines

Always-Average outputs the Average category without reading X.
PRE-category persistence predicts that POST will equal the observed overall
PRE category; it preserves advanced PRE categories rather than coercing them.

| Evaluation set | Always-Average accuracy | PRE-persistence accuracy |
| --- | --- | --- |
| Mixed holdout (459) | 34.6405% | 57.0806% |
| Real holdout (8) | 100.0000% | 12.5000% |
| All real learners (29) | 100.0000% | 13.7931% |

Always-Average is 8/8 on the real holdout and 29/29 on the full real cohort.
PRE persistence is 1/8 and 4/29 respectively. The RF does not outperform the
constant baseline on available real outcomes. The baseline’s 100% does not prove
it can detect delayed learners or generalize to a different cohort.

### 3.9 Separate exploratory real-fold evaluation

A separate five-fold shuffled real-learner experiment uses only each fold’s
23 or 24 real training learners to regenerate 1,500 synthetic training scenarios.
The held-out real learners do not contribute to that fold’s generator, fitted
preprocessing, RF, or calibration. All five folds use the same specified RF
configuration; only held-out real learners are scored.

| Fold | Real training n | Synthetic training n | Held-out real n | Correct | Accuracy |
| --- | --- | --- | --- | --- | --- |
| 1 | 23 | 1500 | 6 | 3 | 50.0000% |
| 2 | 23 | 1500 | 6 | 4 | 66.6667% |
| 3 | 23 | 1500 | 6 | 3 | 50.0000% |
| 4 | 23 | 1500 | 6 | 1 | 16.6667% |
| 5 | 24 | 1500 | 5 | 2 | 40.0000% |

Pooled accuracy is `0.4482758620689655`:
**13/29 = 44.8276%**. The unweighted fold mean is
`0.44666666666666666` (44.6667%);
the two differ because one fold contains five learners and the others six.

| Actual / Predicted | Significant Delay | Slight Delay | Average |
| --- | --- | --- | --- |
| Significant Delay | 0 | 0 | 0 |
| Slight Delay | 0 | 0 | 0 |
| Average | 9 | 7 | 13 |

Thus 16 observed Average learners received a delayed-category forecast:
nine Significant Delay and seven Slight Delay.

| Pooled exploratory real metric | Recorded value |
| --- | --- |
| `macro_precision` | 0.3333333333333333 |
| `macro_recall` | 0.14942528735632185 |
| `macro_f1` | 0.20634920634920637 |
| `weighted_precision` | 1 |
| `weighted_recall` | 0.4482758620689655 |
| `weighted_f1` | 0.6190476190476191 |

Weighted precision of 1.0 here is a single-class artifact: only Average has
actual support. It does not mean all predictions are correct. Real delay
sensitivity is recorded as **null / not estimable**.

This design isolates fold generation more carefully, but all 29 learners had
already informed system and generator development. It remains exploratory,
not independent, prospective, external, or untouched validation. It refits
the active RF procedure across folds; 13/29 is not an additional score of
one unchanged saved estimator.

### 3.10 Feature importance ranking

The recorded method is:

> Nonnegative training permutation macro F1; composite shares mapped equally; normalized.

The implementation permutes transformed training columns of the fitted base
forest, scores macro F1 over five repeats, clips negative mean importance to
zero, distributes engineered-feature contributions equally to their originating
inputs, and normalizes the resulting input shares. These are **descriptive
training permutation shares**, not impurity importances, causal effects,
individual-child explanations, or percentage contributions to a prediction.

| Rank | Input | Recorded normalized importance | Share (rounded) |
| --- | --- | --- | --- |
| 1 | `age_months_pre` | 0.38439569800353063 | 38.43956980% |
| 2 | `pre_total_scaled` | 0.2641538122267079 | 26.41538122% |
| 3 | `pre_standard_score` | 0.05988271040254506 | 5.98827104% |
| 4 | `se_pre_scaled` | 0.050057115981504606 | 5.00571160% |
| 5 | `cog_pre_scaled` | 0.041376959537641526 | 4.13769595% |
| 6 | `fm_pre_scaled` | 0.038114948240237145 | 3.81149482% |
| 7 | `gm_pre_scaled` | 0.03730132657537131 | 3.73013266% |
| 8 | `rl_pre_scaled` | 0.037175373313586994 | 3.71753733% |
| 9 | `el_pre_scaled` | 0.036362231520336775 | 3.63622315% |
| 10 | `sh_pre_scaled` | 0.03410991705729589 | 3.41099171% |
| 11 | `pre_delayed_domains_count` | 0.016223651155038783 | 1.62236512% |
| 12 | `gender` | 0.0008357988472025128 | 0.08357988% |
| 13 | `handedness` | 0.000010457139000880293 | 0.00104571% |

All five excluded household fields have exactly 0.0 importance. The 13 retained
shares sum to approximately 100%; displayed rounding may affect the final sum.
PRE age and total dominate this particular engineered/synthetic training
distribution. This does not establish their biological causal importance or
performance across age subgroups. Correlated inputs and equal redistribution
of internal composite importance affect the ranking.

## 4. Data constraints, limitations, and academic interpretation

### 4.1 Why synthetic augmentation was used

The client reported that historical records and backups were lost and that no
additional historical learner dataset could be provided. The repository contains
29 real learners; it cannot independently establish the cause of record loss.
Record-loss statements should therefore be attributed to the client.

Synthetic augmentation supplies explicit scenarios for POST categories absent
from the real data and enables experimentation with the three-class pipeline.
The 1,500 generated rows do not become 1,500 newly observed children. Ethical
privacy considerations favor keeping learner-level records local and reporting
aggregates; they do not establish that additional data collection was legally
impossible or that artificial labels are empirically correct. No such legal or
consent determination is evidenced by this evaluation record.

The [generator](backend/ml/dataset_builder.py) uses observed anchors plus
declared growth and noise assumptions, including a growth factor of 0.40 and
noise standard deviation 0.006. It applies official scoring to generated
outcomes. Correct application of a scoring table does not validate the assumed
developmental trajectories.

### 4.2 Why real-holdout accuracy is 37.50%

Only three of the eight real holdout learners were predicted as their actual
Average outcome; five were misclassified. That is the direct mathematical
reason for 3/8. All-Average outcomes alone do not force poor accuracy or impose
a 34% ceiling—the constant Average baseline achieves 8/8.

The lack of observed delayed POST outcomes prevents estimating real delay
recall, learning representative observed between-class boundaries, or validating
three-class probabilities on real children. The gap between mixed and real
scores is consistent with a mismatch between synthetic scenarios and observed
learners, but this evaluation does not isolate a single causal explanation.

The shared-anchor real error review also records 20/29 errors: 11 Slight Delay
and nine Significant Delay predictions, all among learners with Significant
Delay PRE categories who actually had Average POST outcomes. These errors are
model disagreements with official outcomes, not grounds to alter labels, infer
a specific intervention caused improvement, or assert extraction errors.

### 4.3 Boundaries of the defensible claim

- Only 29 independent observed learners are available; all have the same POST class.
- The eight-real-learner holdout is small; one additional correct learner changes
  its accuracy by 12.5 percentage points.
- Synthetic labels, imposed balance, shared anchors, and repeated development
  restrict generalization claims.
- Real PRE ages (59–80 months) differ from the synthetic age range (36–71 months);
  accepted API ages do not establish validity for those ages.
- Two advanced POST categories are unsupported.
- Household exclusion demonstrates direct input invariance, not comprehensive fairness.
- Calibration and support blending do not establish clinical reliability or
  intervention effectiveness.
- The RF underperforms Always-Average on observed real outcomes. Predictive
  usefulness remains unproven.

The research objective’s implementation is demonstrable. Its practical forecasting
benefit remains unresolved. UAT or software-quality results cannot substitute
for independent model evaluation.

## 5. Panel Q&A script

**Q: Why Random Forest?**

> Our approved study investigates Random Forest for structured PRE data. Its
> decision trees can represent nonlinear relationships and interactions among
> developmental scores and demographics. We implemented the specified 400-tree
> configuration with fold-local processing and sigmoid calibration. We do not
> claim it is optimal or that its usefulness in this school population has
> been demonstrated.

**Q: Why use synthetic data?**

> We had 29 observed learners, all with Average POST outcomes. According to the
> client, historical records and backups were unavailable. Synthetic scenarios
> let us investigate the three-class pipeline under explicit assumptions. We
> report the 1,500 scenarios separately from real learners and do not treat
> synthetic accuracy as evidence of real delay detection.

**Q: Why did you exclude household income and parental education?**

> Income is not an input in our contract. The accepted household fields include
> occupation tier, parental education, sibling count, and birth order. We
> exclude all five before preprocessing so these values or their absence cannot
> directly drive predictions. The forecast instead uses recorded PRE development
> and basic child demographics. This is a targeted precaution, not proof that
> the whole system is bias-free.

**Q: How does this assist teachers without making automated clinical decisions?**

> The system organizes teacher-confirmed PRE results, shows transparent
> deterministic domain tiers, and suggests locally authored activities based
> on PRE support needs. The RF adds an explicitly experimental POST forecast.
> Teachers review the information; the forecast does not diagnose a child,
> change official ECCD scores, or establish that an activity will be effective.
> Parents receive permission-controlled results and home guidance.

**Q: Is the model 92% accurate for actual kindergarten learners?**

> No. The 92.16% result is from a mostly synthetic mixed holdout. Actual real
> holdout accuracy is 37.50%, or three of eight learners. The separate exploratory
> real-fold evaluation predicts 13 of 29 correctly. We disclose all three
> evaluation designs and do not substitute the synthetic-dominated result
> for real-world validation.

**Q: Why not always predict Average?**

> That baseline scores 100% on this specific cohort and outperforms our RF on
> observed real outcomes. It also cannot establish delay detection because
> no actual delayed POST cases were observed. Our contribution is implementation
> and transparent investigation; we have not established a practical predictive
> advantage over that baseline.

**Q: Does sigmoid calibration make the probabilities trustworthy?**

> It fits a probability transformation using training-fold predictions. We
> report log loss, Brier sum, and calibration error on the mixed holdout.
> These measurements do not validate probabilities for actual delayed learners
> or make them clinical confidence estimates.

**Q: Is this defensible with the approved title?**

> The implemented primary classifier is Random Forest and predicts POST
> interpretation from PRE data, matching the stated ML objective. The findings
> include negative results and data limitations. We can defend what was
> implemented and measured; we cannot claim reliable real-world prediction
> or guarantee that the panel’s acceptance criteria are satisfied.

**Suggested opening statement:**

> We developed a Random Forest-based educational analytics system and evaluated
> its experimental POST forecasting component. It achieved 92.16% on a mostly
> synthetic mixed holdout, 37.50% on eight real holdout learners, and 44.83% in a
> separate exploratory real-fold evaluation. All 29 real POST outcomes were
> Average, so the Always-Average baseline achieved 100%. We present the forecast
> as exploratory teacher decision support, while official scoring and PRE-based
> activity guidance remain deterministic.

## 6. Repository hygiene and verification record

This documentation task inspected all **356 tracked files**, the root/backend/
frontend ignore rules, the staging area, and filename patterns for disposable
scratch files, caches, coverage outputs, and test dumps.

No tracked file matched the current ignore rules, no disposable tracked output
was identified, and the staging area was empty. **No untracking or deletion was
needed.** Existing branch changes and aggregate evaluation records are retained.
Active source, API routes, migrations, tests, scoring tables, blank workbook
templates, guide resources, and the active model artifact are preserved.

The existing local `backend/tests/test_ml_model.py` is already ignored under
the repository’s learner-data policy. This task leaves it intact and runs it;
it does not untrack tests or change ignore rules.

| Requested verification | Result |
| --- | --- |
| `git status` | Reviewed; existing branch work plus this document; nothing staged or deleted |
| `git diff --check` | Passed; existing line-ending notices only |
| `uv run --no-project --python .venv312 python -m unittest backend.tests.test_ml_model -v` | 12 tests passed |

An additional read-only check matched the document’s numerical tables to the
evaluation JSON, resolved all 29 local evidence links, and verified the active
artifact checksum. SHA-256 comparisons confirmed all 356 existing tracked files
are byte-for-byte unchanged by this documentation task. The only new working-tree
entry from this task is `MODEL_DEFENSE_DOCUMENTATION.md`; pre-existing branch
changes remain intact.

The model suite verifies artifact architecture/parameters, metric and checksum
consistency, feature pruning, deterministic scoring, split provenance, inference,
and guide behavior. Passing these checks establishes implementation consistency,
not predictive validity. This task does not retrain, change application behavior,
or publish a hosted deployment.

## 7. Evidence map

| Claim | Repository evidence |
| --- | --- |
| Authoritative runtime/domain context | [AI_CONTEXT.md](AI_CONTEXT.md), current sections 1–11 |
| Thesis alignment, constraints and integration status | [ML_MODEL_AUDIT.md](ML_MODEL_AUDIT.md), Parts I–II |
| Exact active metrics and model SHA-256 | [evaluation_metrics.json](backend/ml/artifacts/evaluation_metrics.json): `model_sha256`, `metadata`, `holdout`, `cross_validation` |
| Class metrics, matrices and probabilities | Same record: `classification_report`, `supported_confusion_matrix`, `probability_evaluation` |
| Baselines and real-only findings | Same record: `by_source`, `baselines`, `real_benchmark`, `real_error_review`, `exploratory_real_cross_validation` |
| Exact importance values and methodology | Same record: `feature_importances`, `feature_importance_method`; [trainer](backend/ml/train_random_forest.py) |
| 18 input fields and target | [common.py](backend/ml/common.py), [ML schemas](backend/schemas/ml.py) |
| Household pruning, preprocessing, engineered features, calibration | [pipeline.py](backend/ml/pipeline.py) |
| Shared inference and deterministic PRE badges | [inference.py](backend/ml/inference.py), [ML routes](backend/routes/ml.py) |
| Official scoring and local activity rules | [ECCD scorer](backend/utils/eccd_scorer.py), [prescriptions.py](backend/ml/prescriptions.py), [guide artifact](backend/ml/artifacts/prescriptive_guides.json) |
| Synthetic construction assumptions | [dataset_builder.py](backend/ml/dataset_builder.py) |
