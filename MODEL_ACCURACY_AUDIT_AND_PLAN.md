# AMES Model Accuracy Audit and Improvement Plan

Audit date: 2026-10-24
Status: Research audit and proposed plan; implementation has not started.

## 1. Recommendation and scope

Target at least 90% accuracy on previously unseen, representative real learners, with additional requirements for detecting delayed outcomes. Hyperparameter tuning is worth investigating, but the current evidence points first to limited real data, synthetic-data assumptions, and evaluation design.

The audit reviewed existing training code, saved reports, and read-only dataset summaries. It did not retrain models or change application code, datasets, model artifacts, database records, scoring rules, or runtime configuration. This Markdown document is the only file created for the documentation request.

Achieving 90%+ cannot be guaranteed from the available evidence. A high score on synthetic data or an all-Average cohort does not establish useful prediction across the three supported outcomes.

## 2. Current model and saved performance

The active teacher and parent prediction service uses the V1 Random Forest pipeline at `backend/ml/artifacts/rf_post_test_model.joblib`. It accepts 18 PRE assessment and demographic inputs and predicts three POST outcomes:

- Suggests Significant Delay in Overall Development.
- Suggests Slight Delay in Overall Development.
- Average Overall Development.

The separate V2 artifact has not replaced V1 runtime inference. Official ECCD scores remain deterministic and independent of model predictions.

| Saved evaluation | Cases | Accuracy | Interpretation |
| --- | ---: | ---: | --- |
| Active V1: mixed holdout | 459 | 88.89% | Performance mainly on synthetic examples |
| Active V1: synthetic-only holdout | 451 | 90.02% | Performance within generated scenarios |
| Active V1: real-only holdout | 8 | 25.00% | Two correct real-student predictions |
| Experimental V2: real out-of-fold predictions | 29 | 100.00% | Correct predictions on an entirely Average-outcome cohort |
| Always predict Average | Same 29 | 100.00% | Same accuracy without learning to distinguish outcomes |

These are saved evaluation results, not newly rerun training results. The V1 real holdout is very small and shares generator information with training, so its 25% result is not an independent estimate of population accuracy either.

The V2 report gives three-class macro F1 of 0.3333 despite 100% accuracy. Both delay classes have zero real support. Their detection performance is unestablished. Its reported balanced accuracy of 100% also reflects evaluation on the single observed class; it does not establish three-class discrimination.

Evidence: [V1 evaluation metrics](backend/ml/artifacts/evaluation_metrics.json), [V2 evaluation report](backend/ml/artifacts/retraining_v2/MODEL_EVALUATION_REPORT.md), and [runtime inference](backend/ml/inference.py).

## 3. Audit findings

### 3.1. Synthetic data dominate the research dataset

The dataset contains 1,500 synthetic learners and 29 real learners: 1,529 total, approximately 98% synthetic. The combined holdout therefore measures simulated patterns much more heavily than actual AMES learner outcomes.

### 3.2. There are no real delayed POST outcomes

The real PRE outcomes comprise 21 Significant Delay, four Slight Delay, and four Average cases. All 29 real POST outcomes are Average. These records cannot establish whether the model distinguishes Significant Delay, Slight Delay, and Average at POST.

Always predicting Average already achieves 100% on this cohort. This baseline must remain visible in every model comparison.

### 3.3. V1 generator information crosses evaluation boundaries

V1 generates synthetic data before separating training and evaluation learners. All real learners influence generator anchors, covariance, and observed growth calculations. Their information can therefore influence training indirectly even when their own rows are held out.

V1 preprocessing is fitted within training folds, which is appropriate, but that does not remove the earlier generator overlap.

### 3.4. Simulated growth differs from observed growth

The V1 generator starts with 25% of observed remaining-capacity growth, subtracts assumed household penalties, adds noise, and clips growth. It also imposes equal synthetic class counts through rejection sampling.

Those growth and household effects are declared simulation assumptions, not measured relationships about AMES families. They plausibly contribute to overpredicting delay relative to the observed all-Average POST cohort. Controlled experiments are needed to establish each factor's contribution.

### 3.5. Five household inputs are missing for every real learner

All 29 real research records lack:

- Mother education level.
- Father education level.
- Household occupation tier.
- Number of siblings.
- Birth order.

Synthetic records contain generated values for those same inputs. Imputation permits inference but does not establish that these inputs improve real prediction. Their missingness creates a distribution difference that should be tested explicitly.

### 3.6. Research eligibility differs from application eligibility

Eleven real learners have unanswered PRE items in the research dataset. The research builder admits records with domain marks without requiring every checklist item to be answered, while application predictions require complete PRE assessments.

The real PRE ages range from 59 to 80 months. The existing scorer routes older ages to its oldest bracket. The age coverage and fallback behavior need to be documented when interpreting model validity; this plan does not propose changing official scoring rules.

### 3.7. Tuning and a second experiment already exist

V1 searches six Random Forest configurations using five-fold cross-validation and selects by macro F1. Its selected parameters are:

| Parameter | Saved V1 value |
| --- | --- |
| `n_estimators` | 400 |
| `max_depth` | `None` |
| `min_samples_split` | 6 |
| `min_samples_leaf` | 2 |
| `class_weight` | `balanced` |

The V2 report describes nested cross-validation, 100 synthetic records per class, real-record weight 8 versus synthetic-record weight 1, and generation within training partitions. Those are useful experimental changes, but V2's perfect accuracy still matches the constant Average baseline. The saved V2 report was reviewed; its training experiment was not rerun for this audit.

Evidence: [dataset builder](backend/ml/dataset_builder.py), [dataset audit](backend/ml/artifacts/dataset_audit.json), [training pipeline](backend/ml/train_random_forest.py), [ML routes](backend/routes/ml.py), and [V2 report](backend/ml/artifacts/retraining_v2/MODEL_EVALUATION_REPORT.md).

## 4. Proposed improvement plan

### Phase 1: Define the acceptance criteria

Use at least 90% accuracy on previously unseen, representative real learners as the primary target. Report synthetic performance separately.

Before experiments, agree with the professor on:

- The prediction task: PRE inputs predicting the existing three POST outcomes.
- Whether the requirement means at least 90% or strictly greater than 90%.
- Minimum acceptable recall for each delayed class, including the rate of delayed learners incorrectly predicted Average.
- Supporting macro F1 and balanced accuracy requirements.
- Test-set class counts, a confusion matrix, and 95% confidence intervals.
- Whether the requirement concerns a measured sample accuracy or a confidence bound for population accuracy; these require different evidence.

**Deliverable:** A written evaluation protocol fixed before model selection.

### Phase 2: Strengthen and verify the real dataset

1. Collect additional genuine PRE-to-POST records across sections or school years, including naturally occurring examples of all three supported POST outcomes.
2. Verify assessment chronology, ages, duplicate learners, item marks, and target labels using the existing deterministic scorer.
3. Match research eligibility to the application's complete-PRE requirement, or explicitly evaluate incomplete records as a separate research scenario. Preserve unknown answers as unknown.
4. Review household-field availability and canonical category mappings. Do not fabricate family circumstances or an occupation mapping.
5. Document age coverage and the existing oldest-bracket fallback without altering official scoring rules.
6. Determine collection targets from class prevalence and the desired precision of accuracy and per-class recall estimates. More records alone do not resolve absent delayed outcomes.

**Deliverable:** An audited dataset summary with class counts, missingness, age coverage, and exclusions.

**Dependency:** Meaningful three-class selection and validation require real examples of all supported outcomes. If these remain unavailable, document that constraint and restrict claims accordingly.

### Phase 3: Separate evaluation learners before learning from their data

1. Reserve a new real cohort for final testing. Treat the previously examined 29 learners as development evidence.
2. Within development data, use nested cross-validation: inner folds select settings; outer folds estimate performance. Choose fold counts according to the available class and group counts.
3. Fit preprocessing, feature selection, synthetic generation, and weighting decisions using each training partition only.
4. Keep repeated records from the same learner together. Consider section or school-year separation where the intended deployment requires generalization to new groups or later cohorts.
5. Evaluate validation and final-test predictions on real learners only. Retain synthetic evaluation as a separate scenario benchmark.
6. Preserve dataset hashes, split membership, seeds, software versions, and experiment settings for reproducibility.

**Deliverable:** A reproducible evaluation procedure with explicit separation between model selection and final testing.

This follows scikit-learn guidance on [preventing leakage](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage) and [nested cross-validation](https://scikit-learn.org/stable/auto_examples/model_selection/plot_nested_cross_validation_iris.html).

### Phase 4: Compare data mixtures and feature sets

Once real class coverage permits meaningful comparisons, run controlled experiments:

| Experiment | Purpose |
| --- | --- |
| Real-only training | Establish performance without simulation assumptions |
| Real data plus limited synthetic augmentation | Test whether augmentation improves real predictions |
| Different real/synthetic sample weights | Measure sensitivity to synthetic influence |
| Existing 18 inputs versus PRE scores and age | Test whether demographic inputs add useful information |
| Household inputs included versus excluded | Investigate missingness and assumed household effects |
| Domain scores with versus without redundant composites | Test whether correlated inputs help generalization |
| Documented alternative generator assumptions | Assess sensitivity to the simulated growth process |

Change one factor at a time initially. Any revised generator must have a documented rationale grounded in training data. Matching already-inspected test outcomes would bias evaluation. Do not treat simulated delayed examples as real evidence of delay detection.

Keep MID and POST measurements excluded from the PRE prediction model. Feature-subset comparisons are offline research proposals; they do not authorize changes to the application's current 18-feature contract.

**Deliverable:** An experiment table showing which changes improve real validation performance and whether they outperform the constant baseline.

### Phase 5: Expand hyperparameter tuning and compare models

After the evaluation foundation is sound, use a bounded randomized search. A proposed starting budget is 50-100 configurations per promising setup; this is an experiment budget, not a guarantee of improvement.

Suggested Random Forest search space:

| Parameter | Proposed candidates |
| --- | --- |
| `n_estimators` | 200, 400, 800 |
| `max_depth` | 4, 8, 12, 20, `None` |
| `min_samples_split` | 2, 5, 10, 20 |
| `min_samples_leaf` | 1, 2, 4, 8 |
| `max_features` | `sqrt`, `log2`, 0.5, `None` |
| `class_weight` | `None`, `balanced`, `balanced_subsample` |

Evaluate class weights jointly with real/synthetic sample weights because their effects combine. Select candidates using real validation metrics and the agreed delay-recall requirements. Do not select settings using final-test results.

Compare the strongest forest with regularized logistic regression, Extra Trees, and gradient boosting under the same splits and evaluation procedure. Retain the always-Average baseline throughout. Evaluate probability calibration separately if the displayed probabilities will be interpreted as confidence.

**Deliverable:** A reproducible model comparison with selected settings, per-class performance, variability, and uncertainty estimates.

References: [Random Forest parameters](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html) and [RandomizedSearchCV](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.RandomizedSearchCV.html).

### Phase 6: Confirm performance on the new real cohort

1. Freeze the selected model, preprocessing, feature choices, and decision rules before opening final-test results.
2. Report accuracy, per-class support and recall, macro F1, balanced accuracy, confusion matrix, and uncertainty.
3. Count the 90% target as demonstrated only alongside the agreed class-performance requirements. State the exact claim the sample supports.
4. If delayed cases are absent, explicitly report that delay detection remains unvalidated.
5. If the target is missed, use the findings for another development cycle and obtain a fresh cohort for subsequent final confirmation. Repeatedly optimizing against the same test cohort turns it into development data.

**Deliverable:** A defensible evaluation report suitable for discussion with the professor. Any later deployment requires a separate implementation change preserving API contracts, permissions, deterministic ECCD scoring, and assessment history.

## 5. Definition of success and practical limits

A credible success claim requires more than a displayed accuracy above 90%:

- The result comes from previously unseen real learners representative of intended use.
- The model's discrimination is evaluated across the three supported outcomes.
- It meets the predefined requirements for delayed-class recall and other metrics.
- It is compared against simple baselines, with class prevalence and sample size visible.
- Confidence intervals and limits are reported honestly.
- Model selection and final evaluation remain separate.

The highest-value next step is obtaining and validating real outcomes across the three classes. Broader tuning can then test whether 90%+ is achievable. With the current 29 all-Average outcomes, even 100% accuracy cannot demonstrate recognition of children who may need additional support.

## 6. Evidence and methodology references

### Local project evidence

- [Current system context](AI_CONTEXT.md).
- [Earlier accuracy review](ML_ACCURACY_REVIEW.md).
- [ML pipeline documentation](backend/ml/README.md).
- [Feature contract and scoring helpers](backend/ml/common.py).
- [Dataset builder and generator assumptions](backend/ml/dataset_builder.py).
- [Dataset audit](backend/ml/artifacts/dataset_audit.json).
- [V1 training and hyperparameter search](backend/ml/train_random_forest.py).
- [V1 saved evaluation metrics](backend/ml/artifacts/evaluation_metrics.json).
- [V1 evaluation report](backend/ml/artifacts/MODEL_EVALUATION_REPORT.md).
- [V2 saved evaluation metrics](backend/ml/artifacts/retraining_v2/evaluation_metrics.json).
- [V2 evaluation report](backend/ml/artifacts/retraining_v2/MODEL_EVALUATION_REPORT.md).
- [Runtime inference and default artifact](backend/ml/inference.py).
- [Application readiness and feature extraction](backend/routes/ml.py).
- [Model artifact acceptance tests, inspected but not rerun](backend/tests/test_ml_model.py).
- [Read-only legacy scorer reference](AMES-SYSTEM-LEGACY/backend/utils/eccdScorer.js).

Research data and generated artifacts are local and may be Git-ignored. Some links therefore require access to the audited checkout. Individual learner records are intentionally excluded from this document.

### Primary methodology references

- [Scikit-learn: Common pitfalls and recommended practices](https://scikit-learn.org/stable/common_pitfalls.html).
- [Scikit-learn: Nested versus non-nested cross-validation](https://scikit-learn.org/stable/auto_examples/model_selection/plot_nested_cross_validation_iris.html).
- [Scikit-learn: Metrics and scoring](https://scikit-learn.org/stable/modules/model_evaluation.html).
- [Scikit-learn: RandomForestClassifier](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html).
- [Scikit-learn: RandomizedSearchCV](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.RandomizedSearchCV.html).
