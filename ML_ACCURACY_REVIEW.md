# AMES calibrated POST outcome experiment

Experiment: table-aligned conditional growth and synthetic PRE ages 36–71 months.
Selected model: **soft_voting_rf_histogram**.
All acceptance gates: **PASS**.

## Measured results

| Holdout source | n | Accuracy | Macro F1 (three classes) |
| --- | --- | --- | --- |
| Combined | 459 | 92.8105% | 92.8205% |
| real | 8 | 37.5000% | 18.1818% |
| synthetic | 451 | 93.7916% | 93.8045% |

Five-fold training CV accuracy: **90.2804%**;
macro F1: **90.2799%**. Selection optimizes CV macro F1 among
candidates meeting CV accuracy, macro F1, runtime compatibility and all profile gates. These are model-selection
scores, not nested estimates. No holdout labels select or calibrate a model.

| Candidate (sigmoid calibrated) | CV accuracy | CV Macro F1 | Behavior pass |
| --- | --- | --- | --- |
| rf_full_leaf3 | 88.5981% | 88.6136% | True |
| rf_full_leaf5 | 88.4112% | 88.4137% | True |
| histogram_boosting | 89.9065% | 89.8901% | True |
| soft_voting_rf_histogram | 90.2804% | 90.2799% | True |
| soft_voting_forest_weight2 | 89.7196% | 89.7005% | True |

## All-1 PRE behavior

Seven scores=1; total=7; standard score=37; delayed domains=7; age=66 months;
gender=FEMALE, handedness=Right. Filled values: mother College, father High School,
occupation Skilled_Regular, siblings 2, birth order 1. Blank values use NaN.

| Household | Average | Slight Delay | Significant Delay |
| --- | --- | --- | --- |
| blank | 7.92542039% | 7.14784597% | 84.92673364% |
| filled | 7.92542039% | 7.14784597% | 84.92673364% |

Predicted class: **Suggests Significant Delay in Overall Development**. Household probabilities identical:
**True**. Average-or-Slight recovery probability:
**15.0733%**.
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

| Profile | Age months | Input path | Total | Standard | Average | Slight Delay | Significant Delay | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 38 | scaled | 74 | 103 | 94.8838900024% | 3.1663444576% | 1.9497655400% | True |
| B | 38 | scaled | 75 | 104 | 94.8837327584% | 3.1664467092% | 1.9498205324% | True |
| C | 38 | scaled | 7 | 37 | 7.9289066088% | 7.2449590669% | 84.8261343243% | True |
| A_raw | 38 | raw | 75 | 104 | 94.8838829004% | 3.1663526816% | 1.9497644180% | True |
| B_raw | 38 | raw | 75 | 104 | 94.8836893311% | 3.1664882132% | 1.9498224557% | True |
| raw_zero | 38 | raw | 12 | 37 | 3.3668749289% | 3.1856306137% | 93.4474944574% | True |
| raw_one | 38 | raw | 13 | 37 | 3.3668749289% | 3.1856306137% | 93.4474944574% | True |
| A | 66 | scaled | 74 | 103 | 94.8826658720% | 3.1672097882% | 1.9501243398% | True |
| B | 66 | scaled | 75 | 104 | 94.8816292323% | 3.1677470701% | 1.9506236976% | True |
| C | 66 | scaled | 7 | 37 | 7.9254203927% | 7.1478459719% | 84.9267336354% | True |
| A_raw | 66 | raw | 77 | 107 | 94.8826658720% | 3.1672097882% | 1.9501243398% | True |
| B_raw | 66 | raw | 75 | 104 | 94.8817059825% | 3.1677706723% | 1.9505233453% | True |
| raw_zero | 66 | raw | 12 | 37 | 3.3630521993% | 3.0725701681% | 93.5643776327% | True |
| raw_one | 66 | raw | 12 | 37 | 3.3630521993% | 3.0725701681% | 93.5643776327% | True |

The table uses FEMALE/Right with blank households; full-precision distributions,
raw counts, scaled vectors and all demographic checks are in evaluation_metrics.json.

| PRE age bracket | Holdout n | Accuracy | Macro F1 |
| --- | --- | --- | --- |
| AGE 3.1 - 4.0 | 125 | 94.4000% | 94.1196% |
| AGE 4.1 - 5.0 | 145 | 93.7931% | 93.1046% |
| AGE 5.1 - 5.11 | 189 | 91.0053% | 90.1593% |

## Training and calibration

`train_test_split(test_size=0.30, stratify=y, random_state=42)` gives 1,070 training
and 459 test rows. Real weight=2.0; synthetic weight=1. Each fit checks
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

| Probability evaluation | Log loss | Brier sum | Top-label ECE |
| --- | --- | --- | --- |
| Uncalibrated training OOF | 0.258854 | 0.143652 | 0.015331 |
| Calibrated training OOF | 0.296869 | 0.150799 | 0.037003 |
| Calibrated holdout | 0.226398 | 0.105535 | 0.048305 |

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

Generation: `g=clip(0.4*observed_capacity_growth - 0.035*risk + N(0,0.006),0,0.4); delayed: pre+g*(capacity-pre); normal: POST-age norm floor+g*(capacity-floor); score 7: midpoint; >=3 delayed domains: constrained throughout`. Gaussian std=
0.006
(variance=3.6e-05). Source workbooks and scoring tables are
unchanged; scores are recomputed with the official scorer. Real household data
stay missing. Illustrative household penalties are retained in generation but all
household predictors are pruned. Synthetic PRE ages are sampled uniformly from
36 through 71 completed months; real ages remain unchanged. POST ages above 71
retain the application's oldest-bracket fallback. Advanced POST candidates are
counted and excluded, never relabeled. Excluded counts:
`{'Suggests Slightly Advanced Development': 466, 'Suggests Highly Advanced Development': 200}`.
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

Student-excluded real benchmark accuracy: **34.4828%**.
21 real learners overlap final-model
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

Python 3.12.13; scikit-learn 1.9.1; seed 42.
Test results require running the suite and are not inferred from metric gates.
