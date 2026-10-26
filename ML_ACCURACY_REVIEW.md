# AMES calibrated POST outcome experiment

Branch: `ml-accuracy-90plus-experiment`. Selected model: **soft_voting_rf_histogram**.
All acceptance gates: **PASS**.

## Measured results

| Holdout source | n | Accuracy | Macro F1 (three classes) |
| --- | --- | --- | --- |
| Combined | 459 | 91.2854% | 91.3412% |
| real | 8 | 50.0000% | 22.2222% |
| synthetic | 451 | 92.0177% | 92.0393% |

Five-fold training CV accuracy: **90.7477%**;
macro F1: **90.7939%**. Selection optimizes CV macro F1 among
candidates meeting CV accuracy and all-1 behavioral gates. These are model-selection
scores, not nested estimates. No holdout labels select or calibrate a model.

| Candidate (sigmoid calibrated) | CV accuracy | CV Macro F1 | Behavior pass |
| --- | --- | --- | --- |
| rf_full_leaf3 | 90.0000% | 90.0350% | True |
| rf_full_leaf5 | 90.4673% | 90.5033% | True |
| histogram_boosting | 90.4673% | 90.5165% | True |
| soft_voting_rf_histogram | 90.7477% | 90.7939% | True |
| soft_voting_forest_weight2 | 90.3738% | 90.4111% | True |

## All-1 PRE behavior

Seven scores=1; total=7; standard score=37; delayed domains=7; age=66 months;
gender=FEMALE, handedness=Right. Filled values: mother College, father High School,
occupation Skilled_Regular, siblings 2, birth order 1. Blank values use NaN.

| Household | Average | Slight Delay | Significant Delay |
| --- | --- | --- | --- |
| blank | 15.98057590% | 13.59085144% | 70.42857266% |
| filled | 15.98057590% | 13.59085144% | 70.42857266% |

Predicted class: **Suggests Significant Delay in Overall Development**. Household probabilities identical:
**True**. Average-or-Slight recovery probability:
**29.5714%**.
No clipping, forced class overrides, or profile-specific probability adjustments.
Outside age-normalized PRE score training ranges, probabilities blend toward training class
frequencies with mass `1-exp(-L2(range_overshoot/training_std))`. Within those
ranges this mass is exactly zero. This general safeguard expresses extrapolation
uncertainty; it is not an empirically calibrated estimate outside training support.
Age alone is excluded from this severity distance because PRE scores are already
age-normalized. All outer CV validation and holdout ages are within their corresponding
training ranges, so this correction for younger sandbox ages leaves benchmark
probabilities unchanged. No model parameters were selected using holdout results.
These research scenario probabilities do not measure intervention effectiveness.

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
| Uncalibrated training OOF | 0.268354 | 0.146838 | 0.032413 |
| Calibrated training OOF | 0.304231 | 0.152757 | 0.028055 |
| Calibrated holdout | 0.280168 | 0.142011 | 0.032450 |

Sigmoid calibration reduces OOF top-label ECE but increases OOF log loss and Brier
sum for this winner. It provides smoother probabilities without improving every
proper score. These diagnostics do not establish clinical or population calibration.
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

Generation: `clip(0.4*observed_capacity_growth - 0.035*risk + N(0,0.006),0,0.4)`. Gaussian std=
0.006
(variance=3.6e-05), previously 0.012. Source workbooks and scoring tables are
unchanged; scores are recomputed with the official scorer. Real household data
stay missing. Original individual illustrative household penalties are retained
in generation but all household predictors are pruned. An attempted prior-marginalized
scenario did not improve training CV and was not retained. Earlier training-only
comparisons are in `training_cv_experiments.json`; the recovery/weight screen is
in `scenario_cv_screen.json`. Hyperparameter/scenario selection examined training
folds only. High accuracy must not be presented as validation on new real learners.
All 29 real learners anchor simulation before splitting, including real holdout
learners. Results assess synthetic interpolation, not independent future-cohort
validity. Imposed 500-per-class balance is not observed population prevalence.
All 29 actual real POST labels are Average; an always-Average baseline scores 100%.
Real delay-class performance/calibration cannot be validated from this cohort.
Both advanced classes remain unsupported. Predictions never change official scores.

Student-excluded real benchmark accuracy: **44.8276%**.
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

## Verified execution (2026-10-26)

- Requested model/API/parent suite: **28 tests passed**.
- Additional pipeline regressions: **9 tests passed**, including household probability invariance, training/calibration fold isolation, exact holdout metrics, and all-1 risk/recovery across sandbox ages 1, 36, 48, 60, 66, 80 and 216 months.
- Frontend root/app TypeScript, changed-file ESLint and Prettier: **passed**.
- Uvicorn startup, `/healthz` and `/ready`: **passed** (HTTP 200); temporary server stopped.
- External feature contract, schemas and route sources unchanged from `main`.
- Final model SHA-256: `0c20bbd5536f6ffe0362f1e1b48be2105270686b5c1c200b5976e3f8970662a0`.

Datasets, dataset audit, learner-level benchmarks and plots retain their existing Git-ignore policy; the model and aggregate evaluation are reviewable branch artifacts.
