# Standalone sigmoid-calibrated Random Forest evaluation

Primary classifier: **rf_full_leaf3**. RandomForestClassifier:
400 trees, min_samples_leaf=3, max_features=0.8, balanced class weights, seed 42.
This configuration was specified from prior screening. This run does not perform
a new hyperparameter search or establish that the configuration is optimal.
No HistGradientBoosting or VotingClassifier is present in the active pipeline.
Model SHA-256: `1ff4591f0f8e21bbaeb48f5617f61acd460f2953f6609cac52d5f86a6bdcec73`.

## Measured results

| Holdout source | n | Accuracy | Macro F1 (three supported classes) |
| --- | --- | --- | --- |
| Combined | 459 | 92.1569% | 92.1690% |
| real | 8 | 37.5000% | 18.1818% |
| synthetic | 451 | 93.1264% | 93.1429% |

Five-fold training CV accuracy: **88.5981%**;
macro F1: **88.6136%**. Fold results and all macro/weighted
precision, recall and F1 values are in evaluation_metrics.json. These are
non-nested development estimates on an already investigated dataset.
The final estimator fits 1,070 training rows; 459 holdout rows are not used by
its preprocessing, weighting, fitting or calibration. However, all 29 real
learners anchored synthetic generation before the mixed split. Therefore neither
mixed holdout nor mixed CV is independent future-cohort validation.

## Simple baselines

PRE-category persistence predicts the observed PRE overall interpretation without
learning from POST. Advanced PRE labels are retained, never collapsed. Accuracy
uses exact category matching; macro/weighted metrics retain the declared three
supported-label scope. The always-Average baseline is a constant predictor.

| Evaluation scope | n | Always Average accuracy | PRE persistence accuracy |
| --- | --- | --- | --- |
| holdout | 459 | 34.6405% | 57.0806% |
| real_holdout | 8 | 100.0000% | 12.5000% |
| synthetic_holdout | 451 | 33.4812% | 57.8714% |
| real_cohort | 29 | 100.0000% | 13.7931% |

## Real learner results

All 29 real POST outcomes are Average. Student-excluded mixed-experiment accuracy:
**31.0345%**. This combines
training OOF predictions and real holdout predictions; shared generator anchors
and prior development still limit independence. Final-model predictions over all
29 learners overlap training for 21
learners and must not be reported as unseen accuracy.

Separate exploratory five-fold real-learner accuracy:
**44.8276%**. Each fold regenerates 1,500 synthetic
training scenarios from its real training learners only, then refits preprocessing,
weighting, the fixed RF and three-fold sigmoid calibration within that training
portion. Only held-out real learners are evaluated.

| Fold | Real train n | Real test n | RF accuracy | Always Average | PRE persistence |
| --- | --- | --- | --- | --- | --- |
| 1 | 23 | 6 | 50.0000% | 100.0000% | 33.3333% |
| 2 | 23 | 6 | 66.6667% | 100.0000% | 16.6667% |
| 3 | 23 | 6 | 50.0000% | 100.0000% | 16.6667% |
| 4 | 23 | 6 | 16.6667% | 100.0000% | 0.0000% |
| 5 | 24 | 5 | 40.0000% | 100.0000% | 0.0000% |

These same 29 learners already informed model/generator development: this is
corrected exploratory evaluation, not external or untouched validation.
Real delay sensitivity is **not estimable** because no real delayed POST outcomes
were observed. Synthetic data do not add independent observed children.

## Calibration, probability handling and publication policy

CalibratedClassifierCV(method='sigmoid', cv=3, ensemble=False) wraps the entire
fold-local weighted preprocessing/RF estimator. Inner OOF predictions fit sigmoid
calibration and the base estimator refits the available training rows. The five
outer training folds evaluate the complete procedure. Real sample weight=2,
synthetic=1; isolated synthetic boundary contradictions receive weight 0.5 based
only on each fit's training neighbors. Labels are never changed or deleted.

The existing SupportAwareCalibration also mixes probabilities toward training
class priors outside age-normalized PRE score ranges. Its mass is
1-exp(-L2(range_overshoot/training_std)); age alone is excluded. This is a general
extrapolation safeguard, not empirically validated recovery or clinical confidence.
No profile-specific override, probability clipping or forced outcome is used.

Publication now checks standalone fitted RF architecture, sigmoid calibration,
three supported classes, household invariance, finite normalized probabilities
and dataset size. The previous >=90% accuracy/F1 requirements and hand-picked
A/B/C probability bands are **diagnostics only**, recorded even when they fail.
Their removal is explicit and does not establish useful real-world performance.
Historical diagnostics: `{'holdout_accuracy_90': True, 'holdout_macro_f1_90': True, 'cv_accuracy_90': False, 'cv_macro_f1_90': False, 'hybrid_profile_probability_bands': True}`.

| Probability diagnostic | Log loss | Brier sum | Top-label ECE (10 bins) |
| --- | --- | --- | --- |
| Uncalibrated training OOF | 0.282777 | 0.158880 | 0.031370 |
| Calibrated training OOF | 0.308223 | 0.161766 | 0.047990 |
| Calibrated holdout | 0.229011 | 0.113920 | 0.044941 |

## Contract and feature processing

The public input remains the exact 18-field contract. Five household fields are
excluded before imputation/encoding; no household value or missingness flag reaches
the classifier. Eleven numeric inputs use training medians/scaling; gender and
handedness use training modes/unknown-safe one-hot encoding. Six PRE composites
and three fixed official-table PRE interval proxies remain unchanged. POST/MID
scores, identities and source labels are never predictors.

All 18 importance keys remain. Importance is nonnegative normalized training-only
permutation macro F1 of the fitted base forest (not the whole calibrated wrapper),
with engineered contributions mapped equally to their source inputs. It is descriptive,
not causal. Predictions never change official assessments, PRE domain scoring,
rule-based activity guides, API schemas or parent/teacher permissions.

Three supported POST categories: Significant Delay, Slight Delay and Average.
Advanced POST candidates remain excluded and counted, never relabeled. The legacy
five-label classification report includes zero-support advanced labels; its macro
average differs from the three-supported-class headline. Both confusion-matrix
label orders are explicit in JSON.

## Generator and comparison provenance

Growth scenario: `g=clip(0.4*observed_capacity_growth - 0.035*risk + N(0,0.006),0,0.4); delayed: pre+g*(capacity-pre); normal: POST-age norm floor+g*(capacity-floor); score 7: midpoint; >=3 delayed domains: constrained throughout`.
PRE proposals span 36–71 months; real ages remain 59–80 months. Imposed synthetic
class balance is not observed prevalence. Household risk penalties in simulation
remain illustrative assumptions even though household predictors are pruned.

The previous hybrid metrics are preserved unmodified in
`hybrid_comparison_metrics.json`. Its model, reports, sources, data and checksums
are frozen locally in `hybrid_baseline_before_standalone_rf.local`, with
`hybrid_baseline_manifest.json`. The main mixed dataset/split is unchanged,
allowing a development comparison on the same rows. The corrected real-fold
experiment has a different evaluation design and must be labeled separately.

## Reproduction

```powershell
uv run --no-project --python .venv312 python -m backend.ml.train_random_forest
uv run --no-project --python .venv312 python -m unittest backend.tests.test_ml_model backend.tests.test_ml_pipeline backend.tests.test_ml_growth -v
```

Use the frozen local dataset to reproduce the comparison; rebuilding changes
provenance and requires a new audit. JSON records runtime versions, hashes,
parameters, fold metrics, baselines and aggregate error review. Individual real
learner comparisons remain in ignored local files. Load trusted joblib only.
Restart an already-running backend to clear its model cache. No hosted deployment
is implied. Python 3.12.13; scikit-learn 1.9.1.
