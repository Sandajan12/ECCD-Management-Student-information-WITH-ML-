# Machine-learning audit and proposed integration plan — `feat/feedbacks-changes`

Date: 2026-11-05

Status: Documentation only. Part I describes the current hybrid model and its recorded findings. Part II describes the selected future standalone Random Forest approach; it has not been implemented by this update. The active model's checksum was checked against the saved evaluation report. Accuracy figures below come from that report; this documentation update did not rerun predictions, training, or the full test suites.

| Item | Current branch | Proposed approach |
|---|---|---|
| Primary classifier | Random Forest + HistGradientBoosting hybrid | Standalone Random Forest as the primary classifier, with preprocessing/calibration disclosed |
| Available real data | 29 learners, all Average at POST | Use the same available records; no additional real dataset assumed |
| Prediction accuracy | Recorded hybrid results in Part I | New RF-specific measurements required; no accuracy promised |
| Deployment/integration status | Existing hybrid serves both portals | Future coordinated artifact, loader, and portal update |
| Research claim | Experimental forecasting; real-world usefulness unestablished | Retain that limitation unless new evidence supports a stronger claim |

## Part I — Current model: findings and limitations

### 1. Assessment and client-reported limitation

**AMES can be presented as a working assessment system with an experimental forecasting component. The current evidence does not establish reliable prediction of POST outcomes for new real learners.** Defense acceptance depends on the approved research objectives and the panel's rubric; this audit cannot guarantee it.

The project team reports that the client cannot provide additional historical datasets because earlier records and backups were lost. This is a client-reported constraint, not a fact independently established from repository files. It explains the limited available data, but it does not validate the model or make the synthetic benchmark representative of real children.

The available real dataset contains 29 learners, all with an Average POST outcome. This limits evaluation of real delay cases. **It does not impose a 34% accuracy ceiling:** always predicting Average would score 100% on these particular real records, while providing no evidence that delay cases can be detected.

### 2. Confirmed model

The app loads `backend/ml/artifacts/rf_post_test_model.joblib`: a **Random Forest + HistGradientBoosting soft-voting ensemble with sigmoid calibration**. The filename does not mean the active model is only a Random Forest. Teacher and parent inference use the same saved model.

Verified model SHA-256:

```text
835139f31887924c02f98c9d12878755885c4b476ae6ef54e3412b599d54ecc6
```

### 3. X: prediction inputs

**X means the information supplied to predict an outcome.** The API accepts 18 fields:

| Group | Exact fields |
|---|---|
| Seven PRE domain scores | `gm_pre_scaled`, `fm_pre_scaled`, `sh_pre_scaled`, `rl_pre_scaled`, `el_pre_scaled`, `cog_pre_scaled`, `se_pre_scaled` |
| PRE summaries | `pre_total_scaled`, `pre_standard_score`, `pre_delayed_domains_count` |
| Age and demographics | `age_months_pre`, `gender`, `handedness` |
| Household information | `mother_education_level`, `father_education_level`, `household_occupation_tier`, `num_siblings`, `birth_order` |

The seven domains are Gross Motor, Fine Motor, Self-Help, Receptive Language, Expressive Language, Cognitive, and Socio-Emotional.

**Important distinction:** the saved pipeline excludes all five household fields. It retains 13 supplied fields and creates additional internal features. Accepting 18 fields does not mean all 18 affect predictions.

IDs, names, LRNs, source labels, and MID/POST scores are not prediction inputs.

### 4. Y: prediction target

**Y is one target: `post_interpretation`.** It predicts one of three POST outcomes:

- Suggests Significant Delay in Overall Development
- Suggests Slight Delay in Overall Development
- Average Overall Development

Advanced outcomes are unsupported. This model predicts a category, not exact future checklist scores. Its activity recommendations come from separate PRE-based rules. Predictions do not change official assessments.

### 5. How PRE domain labels work in both portals

The labels on the PRE domain cards are calculated from existing assessment results using fixed planning rules:

1. Count KAYA answers separately for each domain to obtain raw scores.
2. Calculate the child's age at the official teacher-confirmed PRE assessment date.
3. Convert each raw score to a scaled score through the age group's ECCD lookup table.
4. Assign the domain's planning tier using its scaled score:

| PRE domain scaled score | Displayed tier |
|---|---|
| 0-3 | Delay |
| 4-6 | Slight Delay |
| 7 or higher | Average |

For example, a Gross Motor scaled score of 3 displays Delay, and a Cognitive scaled score of 8 displays Average. These thresholds apply to scaled scores, not raw KAYA counts or percentages. Raw-to-scaled conversion varies by domain and age group.

The backend supplies these values in `baseline_domains`. Both parent and teacher pages display the returned tiers. The parent endpoint calls the same student prediction function, with additional linked-child authorization, prediction permission, and independent PRE-release checks.

These are **local instructional-planning tiers**, separate from both the overall PRE interpretation and the model's predicted overall POST category. The overall PRE interpretation comes from the combined scaled total and standard-score table. Scores of 7 and above are grouped as Average on the domain cards, so those cards do not distinguish advanced domain performance. The tiers are not clinical diagnoses.

Support activities are also rule-based: a domain is included when its scaled score is 6 or below, or when it has explicitly recorded DI-KAYA items. An Average-tier domain can therefore still have a targeted activity. Activities do not demonstrate that an intervention will cause the predicted outcome or a particular recovery rate.

### 6. Training data and evaluation design

| Dataset | Real records | Synthetic records | Total |
|---|---:|---:|---:|
| Full dataset | 29 | 1,500 | 1,529 |
| Training split | 21 | 1,049 | 1,070 |
| Holdout split | 8 | 451 | 459 |

The split is 70/30, stratified by POST category, with seed 42. Five-fold cross-validation on the training split selects candidates. The saved model remains fitted using the training split; the holdout is used for evaluation.

Synthetic data represents approximately 98.1% of all records. There are 500 synthetic records per supported POST class. This balance is imposed by generation and rejection sampling; it is not measured class prevalence in the client's population. Advanced synthetic POST candidates are excluded, not relabeled.

Synthetic generation uses real learners' profiles, covariance, assessment spacing, and observed growth. Its conditional growth and household effects are declared simulation assumptions. Although household fields are excluded from the classifier, simulated household factors still influence generated outcomes.

All 29 real learners inform generation before splitting. Consequently, a learner being excluded from a classifier fit does not mean that learner was excluded from the entire data-generation process. Fold-local imputation and training do not remove this upstream dependence.

### 7. Recorded performance of the current hybrid

These are saved evaluation results, not freshly recomputed measurements. All model results in this section belong to the current RF/HistGradientBoosting hybrid, not the proposed standalone RF. The always-Average row is a separate baseline:

| Evaluation | Recorded accuracy | Records |
|---|---:|---:|
| Combined holdout | **92.81%** | 426/459 |
| Synthetic-only holdout | **93.79%** | 423/451 |
| Real-only holdout | **37.50%** | 3/8 |
| Five-fold training cross-validation | **90.28%** average | Training folds |
| Real student-excluded benchmark | **34.48%** | 10/29 |
| Final model on all real records, including training overlap | **79.31%** | 23/29 |
| Always-Average baseline on all real records | **100.00%** | 29/29 |

The real student-excluded benchmark combines training out-of-fold predictions with holdout predictions. It is not a separate independent cohort. The 79.31% result includes 21 real learners that overlap final-model training and must not be presented as unseen-data accuracy.

#### What 34.48% means

The student-excluded predictions match the recorded Average outcome for 10 of 29 real learners. For the other 19, the recorded predictions are delay categories despite the recorded Average outcome. On the real holdout alone, 3 of 8 match Average and 5 do not.

Two distinct problems must be reported:

- The model currently performs poorly on these real Average-outcome cases compared with the always-Average baseline.
- The absence of real delay outcomes prevents evaluation of how well the model detects true real-world delay cases.

Neither conclusion means higher real-record accuracy is mathematically impossible. Changes might improve it, but that is unproven, and repeatedly tuning against these same records would weaken their value as evaluation data. A mismatch between simulated growth assumptions and actual recorded outcomes is a plausible explanation for the errors, not a confirmed explanation for each child.

#### Combined holdout metrics

| Metric | Recorded value |
|---|---:|
| Accuracy | 92.81% |
| Macro precision, three supported classes | 92.85% |
| Macro recall, three supported classes | 92.82% |
| Macro F1, three supported classes | 92.82% |
| Weighted F1 | 92.82% |

Precision measures how often a predicted category is correct. Recall measures how many actual cases of that category are found. F1 combines precision and recall. Macro averages give each supported category equal weight; weighted averages account for category counts.

| Actual category | Precision | Recall | F1 | Holdout records |
|---|---:|---:|---:|---:|
| Significant Delay | 95.24% | 93.33% | 94.28% | 150 |
| Slight Delay | 89.68% | 92.67% | 91.15% | 150 |
| Average | 93.63% | 92.45% | 93.04% | 159 |

All actual delay cases in this benchmark are synthetic. These category-level figures therefore do not establish real-world delay detection.

Confusion matrix: rows are actual outcomes and columns are predictions.

| Actual / predicted | Significant Delay | Slight Delay | Average |
|---|---:|---:|---:|
| Significant Delay | 140 | 8 | 2 |
| Slight Delay | 3 | 139 | 8 |
| Average | 4 | 8 | 147 |

The saved report also contains a five-label classification report with two unsupported advanced categories. Its five-label macro F1 is 55.69%, because zero-support advanced categories are included with zero scores. This differs from the explicitly supported three-class macro F1 of 92.82%; the averaging scope must always be stated.

#### Probabilities and feature importance

Saved combined-holdout probability metrics are log loss 0.2264, multiclass Brier sum 0.1055, and top-label calibration error across ten bins 0.0483. These describe the mixed benchmark. They do not validate confidence percentages for real learners or turn model probabilities into measured recovery rates.

The saved normalized feature-importance figures are:

| Input | Reported importance |
|---|---:|
| PRE age in months | 46.12% |
| PRE total scaled score | 22.57% |
| Socio-Emotional PRE scaled score | 7.19% |
| Gross Motor PRE scaled score | 4.66% |
| Fine Motor PRE scaled score | 4.08% |
| Self-Help PRE scaled score | 4.03% |
| Cognitive PRE scaled score | 3.70% |
| Expressive Language PRE scaled score | 3.45% |
| Receptive Language PRE scaled score | 3.40% |
| PRE delayed-domain count | 0.79% |
| PRE standard score, gender, handedness, and each of the five excluded household inputs | 0.00% each |

These are descriptive training-data permutation importances calculated using the fitted voting estimator inside the first calibration component. Engineered-feature contributions are distributed back to input fields and normalized. They are not causal effects or a complete explanation of the final calibrated ensemble. A reported zero does not prove a retained input can never affect a prediction; the five household fields are separately known to be excluded by code.

### 8. Consolidated findings and limitations

1. **The mixed headline obscures weak real-record performance.** Report 92.81% alongside 37.50% real holdout and 34.48% student-excluded real accuracy. The current model does not outperform the always-Average comparator on these real records.
2. **Real outcomes cover only Average.** Delay sensitivity cannot be measured on this real cohort. More copies of Average records or additional simulated delay cases do not supply missing observed delay outcomes.
3. **Evaluation is not fully independent.** All 29 real learners anchor synthetic generation before splitting. Classifier-level fold exclusion therefore does not establish that a learner was excluded from generation or overall development.
4. **The real holdout is very small.** Each of its eight records changes accuracy by 12.5 percentage points. The result is informative about these cases but cannot establish a stable population accuracy.
5. **Synthetic assumptions shape the task.** Imposed class balance, constrained recovery, and age-dependent progression may differ from the client population. Generating additional rows under the same assumptions does not independently validate them.
6. **Advanced outcomes are unsupported.** The model always selects among its three supported classes. That limitation must be visible in the research scope.
7. **Domain badges, activities, and forecasts have different evidence.** PRE scoring and fixed planning rules can be checked for correctness separately. Correct scoring or useful activities do not establish accurate POST forecasts or effective treatment.
8. **Importance and confidence require qualification.** Training-based importance and calibrated mixed-benchmark probabilities are not individual causal explanations or validated clinical confidence.
9. **The active classifier differs from standalone Random Forest.** The current hybrid contains RF and HistGradientBoosting, and the runtime loader explicitly requires that combination. It must be described as a hybrid; replacing only its binary with an RF model would fail the current loader's compatibility checks.

The missing historical records are a legitimate limitation to document. They do not justify withholding weak results, changing real outcome labels, or claiming that synthetic validation establishes real-world effectiveness.

### 9. What the current evidence supports

The branch demonstrates an implemented forecasting pipeline with strong recorded agreement on its synthetic-dominated benchmark and weak performance on the available real records. It does not demonstrate superiority to the always-Average baseline on that real cohort, reliable real-world delay detection, intervention effectiveness, or validated recovery probabilities.

The data limitation does not make improvement mathematically impossible, nor does it mean 34.48% is an acceptable performance target. It means the current results must be reported honestly and their scope kept narrow. Switching algorithms or generating more scenarios cannot by itself establish real-world validity.

Completed for this documentation review: inspection of active feature, scoring, inference, training, generation, and portal display logic; reading saved evaluation metrics; and checking the active model checksum against that evaluation record. No completed fresh model prediction run or full software test run is claimed. The PRE-persistence baseline, detailed individual error explanations, and RF-specific future measurements remain unavailable in this audit.

## Part II — Proposed approach to integrate: not yet implemented

### 1. Approved research context and selected direction

Approved title provided by the project team:

> A Random Forest-Based System for Early Childhood Performance Analytics for Kindergarten Level at Apolinario Mabini Elementary School.

Relevant approved objective:

> To integrate machine learning, specifically the Random Forest algorithm, to predict post-test interpretation based on the pre-test data of the student.

The team selected **standalone Random Forest as the future primary classifier**, with the current hybrid retained as a separate comparison. This decision aligns the primary algorithm with the wording of the objective. It is not a claim that RF has already replaced the hybrid or that RF will achieve better accuracy.

The supplied objective does not state a minimum accuracy percentage. Nevertheless, implementing a predictor and demonstrating useful prediction are different achievements. The defense must not treat an implemented output as evidence of reliable forecasting.

This section focuses on the ML methodology, integration, and defense explanation. UAT and ISO software-quality evaluation are outside this ML-focused plan and are not substitutes for evidence of predictive accuracy.

### 2. Intended research position

Present the work as an implemented, transparently evaluated **experimental PRE-to-POST forecasting approach**. Explain the value of investigating this task without claiming that the existing evidence proves reliable prediction for new children.

Suggested opening statement, to use only once the RF-specific implementation and evaluation described below are completed:

> We implemented PRE-to-POST forecasting using Random Forest, available learner records, and explicitly defined synthetic scenarios. Our findings demonstrate the forecasting pipeline, but they do not establish reliable prediction across real developmental outcomes.

Before that work is completed, use the present-tense description in Part I: the active model is a hybrid and its recorded results are limited. Neither wording guarantees panel acceptance; the panel determines whether the contribution and limitations satisfy the approved study.

### 3. Planned model and integration changes

1. **Freeze the current hybrid baseline.** Preserve its artifact, reports, hashes, and dataset/split provenance before any new training. Keep its results labeled as hybrid results.
2. **Build the primary standalone RF experiment.** Start from the existing `rf_full_leaf3` candidate: 400 trees, minimum leaf size 3, `max_features=0.8`, balanced class weights, and seed 42. Use the existing training-only preprocessing/calibration components and document their roles, including any support-aware probability adjustment. Do not promise that the initial configuration is optimal.
3. **Preserve the prediction contract.** Retain the 18-field input interface, exclusion of the five household inputs, three supported POST categories, and independent deterministic PRE scoring. Do not change outcome labels or switch the target simply to obtain a higher reported score.
4. **Create separate RF evidence.** Save new RF-specific metadata, artifact hashes, probabilities, and evaluation reports. The hybrid's 92.81% cannot be reused as the RF's accuracy. Results may be lower, similar, or higher; report them regardless.
5. **Integrate the RF artifact coherently.** Update hybrid-only compatibility checks, relevant model assumptions, and parent/teacher model notices together. The trainer and loader currently constrain publication to the hybrid and must be explicitly adapted for the selected RF approach; do not swap only the binary or silently bypass existing requirements.
6. **Keep presentation honest.** Use an experimental-forecast label and describe percentages as estimated model probabilities. Maintain the distinction between existing PRE domain tiers, rule-based activity guides, and the predicted future overall interpretation. Preserve existing API paths, response shapes, authorization, release rules, assessment records, and durable drafts.

Hand-picked profile probability bands and synthetic accuracy gates must not be presented as evidence of real-world validity. Any future change to publication requirements must be recorded explicitly rather than made to conceal an unfavorable measurement.

### 4. Planned use of the same 29 real records

No additional real student dataset is assumed. The proposed work should:

- Reproduce the current hybrid figures and calculate separately attributable RF results on a documented comparison protocol.
- Show both the always-Average baseline and the PRE-category-persistence baseline. State that the first scores 100% on this real cohort and that the second has not yet been calculated in this audit.
- Review the 19 student-excluded hybrid errors for extraction, age, scoring, label, and generation-assumption issues. Record only explanations supported by evidence; do not relabel learners merely because a model disagrees.
- Conduct a separate exploratory five-fold real-learner evaluation with seed 42. Within each fold, estimate generation parameters only from training learners, generate training scenarios, and fit/calibrate the fixed RF pipeline within that training portion. Evaluate only against the held-out real learners.
- Report all fold results and aggregate counts. Because these 29 records already informed development, describe this as corrected exploratory evaluation, not a new untouched external validation cohort.
- Mark real delay sensitivity as not estimable because there are no observed real delay outcomes. Do not confuse zero observed support with measured zero sensitivity.

More synthetic rows may explore the declared assumptions, but they do not independently verify those assumptions or increase the number of observed children. Do not require the client to provide unavailable records as a prerequisite for this limited research contribution. Genuinely new prospective data can remain future work if it becomes available.

### 5. Panel explanation and anticipated questions

**Why use synthetic data?**

> To explore possible developmental scenarios absent from the available records. Synthetic outcomes follow declared scoring and growth assumptions. They expand experimental coverage but are not additional observed children.

**Is the model 92.81% accurate?**

> That is the current hybrid model's recorded mixed-holdout accuracy, mostly based on synthetic records. Its real-only results are substantially lower. We do not interpret 92.81% as real-world accuracy or attribute it to the future standalone RF.

**Why Random Forest?**

> The inputs are structured PRE assessment and demographic fields. Random Forest provides a way to investigate relationships and interactions between those inputs and later interpretation. The study does not establish that it is superior for this population.

**Why not always predict Average?**

> That baseline performs better than the current hybrid on our available real cohort. We acknowledge that the current model has not demonstrated an advantage there. A constant answer also cannot demonstrate detection of real delay outcomes when none are available.

**Are the PRE domain labels also predictions?**

> Those labels come from age-based ECCD scoring and fixed planning thresholds. The ML component predicts the later overall POST category. Activity guides follow separate PRE-based rules.

**What does the model contribute if real accuracy remains weak?**

> It contributes an implemented forecasting approach, transparent simulation assumptions, and documented evidence of its limitations. Reliable practical forecasting remains an unresolved research outcome.

### 6. Reporting boundary and completion status

After the RF work is completed, a supportable conclusion, if its findings remain limited, would be:

> Random Forest prediction was implemented and investigated. Reliable real-world predictive usefulness was not established with the available evidence.

Do not state that conclusion as an accomplished RF result before completing the proposed work. Do not claim that all three-class real-world prediction objectives have been validated merely because the pipeline returns a category. If stronger results emerge, explain their evaluation scope and remaining limitations before changing the conclusion.

| Planned item | Status at this update |
|---|---|
| Standalone RF selected as the proposed primary approach | Selected by the project team |
| Standalone RF trained and evaluated for this plan | Not performed by this update |
| RF-specific comparison and corrected exploratory evaluation | Pending |
| RF artifact integrated into parent and teacher inference | Not implemented |
| New RF accuracy or improved real-world validity established | No claim; results unavailable |
| Active model on this branch | Existing RF/HistGradientBoosting hybrid |

This update changes only this audit document. It does not change source code, model artifacts, datasets, official assessments, database records, or deployment state. No retraining was performed.

## Evidence sources

- [Feature contract and target](backend/ml/common.py)
- [Request and response schemas](backend/schemas/ml.py)
- [Active artifact loading and inference](backend/ml/inference.py)
- [Feature processing, household exclusion, and calibration](backend/ml/pipeline.py)
- [Dataset construction and synthetic assumptions](backend/ml/dataset_builder.py)
- [Training, evaluation, and importance calculation](backend/ml/train_random_forest.py)
- [Saved evaluation metrics](backend/ml/artifacts/evaluation_metrics.json)
- [ML implementation documentation](backend/ml/README.md)
- [Shared teacher and parent prediction routes](backend/routes/ml.py)
- [Deterministic ECCD scoring](backend/utils/eccd_scorer.py)
- [Rule-based support activities](backend/ml/prescriptions.py)
- [Teacher ML Insights display](frontend/src/pages/teacher/MlInsights.tsx)
- [Parent ML Insights display](frontend/src/pages/parent/ParentMlInsights.tsx)

Methodology references consulted for the interpretation of limitations:

- [Scikit-learn: simple classification baselines](https://scikit-learn.org/stable/modules/generated/sklearn.dummy.DummyClassifier.html)
- [Scikit-learn: data leakage and evaluation separation](https://scikit-learn.org/stable/common_pitfalls)
- [NIST AI RMF: validity, reliability, and representative evaluation](https://airc.nist.gov/airmf-resources/airmf/3-sec-characteristics/)
