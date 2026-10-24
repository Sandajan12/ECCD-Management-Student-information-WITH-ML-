# AMES Model Accuracy Review and Retraining Recommendation

Option A reconciliation (2026-10-24): retain the exact V1 **400-tree** model,
with **88.89% mixed holdout accuracy (408/459)**, **90.02% synthetic accuracy
(406/451)**, **88.98% three-class macro F1**, **88.41% five-fold training CV
accuracy** and **25% real holdout accuracy (2/8)**. The three dataset/split hashes
now match its metadata after byte-for-byte archive restoration, with matching
real/synthetic component CSVs, benchmark and plots. No retraining was performed.
The model SHA-256 is
`2de3f5d3b31831438b60936864322935e23d61c30a5df1aeb077509538384541`.
The 8/8 experiment, its tuning code and reports are preserved under
`backend/ml/artifacts/baseline_pre_missingness_weighting/tuned_8_of_8_20261024/`.
The 90%+ mixed-accuracy goal remains unmet. Authorized Option A regression gates
are >=0.88 mixed accuracy, >=0.90 synthetic accuracy and >=0.88 macro F1, with exact
counts and artifact hashes also checked. Passing these checks does not establish
a 90% mixed score or production validation. Exact hashes are recorded in the
[active evaluation report](backend/ml/artifacts/MODEL_EVALUATION_REPORT.md).

Original review: 2026-10-19; reconciled 2026-10-24. No model was retrained.

## Rejected weight=15 missingness experiment

The rejected 600-tree experiment used real-source sample weight 15 and explicit
missing-value markers/indicators. All real learners lack the five household
fields and all have Average POST outcomes. Recorded all-1 sandbox profiles were
predicted Average with blank household fields but Significant Delay with filled
household fields: missingness had become a proxy for the all-Average real source.
Its 8/8 real holdout result did not justify that behavior. Option A retains
median/mode imputation without source flags or source weighting. All-1 profiles
with consistent composites (total=7, standard score=37, delayed count=7) predict
Significant Delay for both household variants. This regression does not establish
clinical safety or independent real-world validity.

The sandbox now derives total, standard score and <=6 delayed count from its
seven domains using the existing official scoring table. Derived fields are
read-only, old drafts are reconciled without discarding inputs, and the backend
also normalizes stale composites before inference.

## Recommendation

Run another training experiment after reviewing the synthetic data and correcting the evaluation design. Keep the current Random Forest as a research baseline. Its real-student results do not support dependable student predictions yet.

Broader hyperparameter tuning is worth testing, but the strongest current explanation for poor real-student performance is a mismatch between simulated growth and observed student growth. Changing algorithms alone does not resolve that mismatch.

## Current measured performance

| Evaluation | Records | Accuracy | Interpretation |
| --- | ---: | ---: | --- |
| Combined real and synthetic holdout | 459 | 88.89% | Mostly reflects synthetic performance |
| Synthetic-only holdout | 451 | 90.02% | Good performance within the generated scenarios |
| Real-only holdout | 8 | 25.00% | Two correct predictions; insufficient performance and a very small sample |
| Training cross-validation | Five folds | 88.41% mean | Parameter-selection result on the mixed training data |

The dataset contains 29 real students and 1,500 synthetic students: approximately 98% synthetic. The saved model uses 1,070 training records and a 459-record holdout.

All real learners contributed to the synthetic generator before splitting. Consequently, neither the mixed holdout nor cross-validation establishes independent real-world accuracy.

## Why real-student accuracy is low

1. **Synthetic records dominate learning.** Their patterns substantially outweigh the 29 real records.
2. **The generator deliberately limits growth.** Its growth formula starts with 25% of observed remaining-capacity growth, subtracts simulated household penalties, and adds noise. Those household effects are assumptions rather than measured relationships.
3. **The real cohort shows a different trajectory.** Twenty-five of 29 students started in a delay category, but all 29 had Average POST outcomes. In the eight-student real holdout, the model predicted Significant Delay for three, Slight Delay for three, and Average for two.
4. **Class prevalence differs.** Synthetic data impose 500 records per supported class, while the real POST cohort contains only Average outcomes.
5. **Real household inputs are missing.** The model imputes them, while synthetic household values are generated explicitly. This is an additional difference to investigate; its contribution to the errors has not been isolated.

These findings support a data-mismatch explanation. Controlled experiments are still needed to measure each factor's contribution.

## Hyperparameter tuning already performed

The existing pipeline uses `GridSearchCV` with six parameter combinations and five-fold training-only cross-validation. Selection optimizes macro F1.

| Selected Random Forest parameter | Value |
| --- | --- |
| `n_estimators` | 400 |
| `max_depth` | None |
| `min_samples_split` | 6 |
| `min_samples_leaf` | 2 |

The model therefore already has a limited tuning search. A larger search may help,
but improvement to 90%+ real-student accuracy cannot be promised.

## Proposed next experiment

1. **Preserve the existing baseline.** Retain its model, metrics, dataset hashes, and split membership for comparison.
2. **Review data quality and generation assumptions.** Verify item marks, scoring, ages, missing values, and observed PRE-to-POST transitions. Test revised growth scenarios without choosing assumptions merely to raise test accuracy.
3. **Separate evaluation students before fitting the generator.** Fit generation, imputation, and tuning using development students only. Keep each student's records and derived synthetic information within the appropriate training fold.
4. **Compare training mixtures.** Test reduced synthetic influence and alternative real/synthetic weights. The current real-only cohort supports an Average baseline, but cannot train or validate discrimination among three POST classes.
5. **Compare models and tune candidates.** Compare the current Random Forest, a revised Random Forest, and a simpler classifier when sufficient real class coverage exists. Select settings using development validation or nested cross-validation.
6. **Evaluate on new real students.** The eight existing holdout students have already been inspected; reserve a new independent cohort for final confirmation. Collect genuine examples across supported POST outcomes without fabricating delayed cases.

This separation of model selection and final evaluation follows [scikit-learn's guidance on nested cross-validation](https://scikit-learn.org/stable/auto_examples/model_selection/plot_nested_cross_validation_iris.html) and [preventing data leakage](https://scikit-learn.org/stable/common_pitfalls.html).

## What a 90%+ target should mean

Agree with the professor whether 90%+ means mixed, synthetic or independent real
accuracy, and whether it means >=90% or strictly >90%. The current baseline meets
90% only on synthetic holdout records. A real-student target needs a new,
representative cohort with observed supported outcomes. Report sample size and
uncertainty, per-class precision/recall, macro F1 and a confusion matrix. Set an
acceptable recall for delayed students before selecting the final model.

Always predicting Average would achieve 100% on the current 29-student cohort. That result would provide no evidence of delay detection. Accuracy alone is therefore insufficient to establish usefulness.

## Project evidence

- [Saved evaluation metrics](backend/ml/artifacts/evaluation_metrics.json)
- [Dataset audit and simulation assumptions](backend/ml/artifacts/dataset_audit.json)
- [Existing evaluation report](backend/ml/artifacts/MODEL_EVALUATION_REPORT.md)
- [Synthetic dataset generator](backend/ml/dataset_builder.py)
- [Training and hyperparameter search](backend/ml/train_random_forest.py)
- [ML pipeline documentation](backend/ml/README.md)
