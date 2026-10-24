# AMES model audit and improvement plan for capstone defense and production

Audit date: **2026-10-24**  
Audited checkout: `16c7d59` (`Fix teacher section ownership and audit workflows`)  
Scope: the current PRE-to-POST prediction model, research data, evaluation, inference integration, and readiness evidence.

**This is an audit and proposed plan only. No application code, model, dataset, dependency, configuration, or database record was changed.** Existing reports were preserved. Only this Markdown file was added.

## 1. Direct answer

Your concern is justified, but the main problem is the **training data and validation evidence**, rather than insufficient model complexity. Random Forest is a reasonable candidate for this tabular prediction task. Replacing it with a neural network, adding more trees, or adding more synthetic learners would not establish that it works on new real learners.

AMES already has useful application foundations: validated inputs, shared teacher/parent inference, ownership and release permissions, and separation between predictions and official ECCD scoring. These are worth retaining.

My assessment is:

| Intended claim | Assessment |
| --- | --- |
| Demonstrate an integrated educational research prototype | Supportable, provided the artifact inconsistency below is resolved and limitations are presented clearly |
| Claim a dependable three-class prediction model for real learners | Not supported by the present evidence |
| Claim production readiness for predictive decisions | Not established; real validation and operational acceptance remain necessary |
| Achieve 90%+ on a synthetic or mixed benchmark | Possible to investigate, without any guarantee; this would remain a scenario benchmark |
| Demonstrate 90%+ on genuinely unseen real learners across supported outcomes | A legitimate research goal, but feasibility cannot be established from the current data |

**The first action should be reconciling the model and evaluation artifacts. The next should be improving real outcome coverage and evaluation design. Broader tuning comes afterward.** A capstone can be defensible as a carefully evaluated prototype without claiming production validity; the professor determines whether that scope satisfies the grading requirement.

## 2. What was actually audited

The audit read [AI_CONTEXT.md](AI_CONTEXT.md), the ML builder and trainer, saved metrics and reports, the fitted V1 artifact, research CSVs, inference and API code, Pydantic contracts, model/API tests, both portal notices, dependency pins, and Git tracking rules. It also consulted the primary methodology references linked below.

Fresh checks loaded the existing trusted local artifact and computed predictions, aggregate counts, file hashes, and a feature-consistency probe. **No fitting, retraining, dataset regeneration, or parameter search was run.** The probe changed a DataFrame in memory only.

The initial `uv` invocation could not access its existing cache inside the sandbox. The same read-only verification was subsequently run with elevated execution permission. Python bytecode writing was disabled with `-B`.

This was not a fresh deployed application, browser, database, security, or load test. V2 and historical experiments were reviewed from their saved reports, not rerun. The reference directories `_legacy_reference/` and `AMES-SYSTEM-LEGACY/` were absent inside this checkout; no legacy parity claim is made or needed for this documentation-only audit. No learner-level records or family details are reproduced here.

## 3. Current model and measured results

### 3.1. What the model does

The active default is [rf_post_test_model.joblib](backend/ml/artifacts/rf_post_test_model.joblib), loaded by [inference.py](backend/ml/inference.py), rather than the separate V2 artifact. It uses a fitted preprocessing pipeline and a 400-tree Random Forest with balanced class weights, seed 42, unrestricted depth, minimum split size 6, and minimum leaf size 2.

Its 18 predictors are seven PRE scaled domain scores; PRE total, standard score and delayed-domain count; PRE age in months; gender and handedness; both parents' education; household occupation tier; sibling count; and birth order. Names, identifiers, source labels, and MID/POST measurements are excluded from the predictor list. Imputation is fitted during training, with median numeric and mode categorical values.

The target is the later **POST interpretation**: Significant Delay, Slight Delay, or Average. This differs from computing an interpretation from an already completed POST checklist, which is deterministic scoring and does not require ML. Two advanced outcomes are explicitly unsupported in this model's current scoring/data scope.

Sources: [feature contract](backend/ml/common.py), [training pipeline](backend/ml/train_random_forest.py), [inference](backend/ml/inference.py), [request/response schemas](backend/schemas/ml.py).

### 3.2. Recorded results versus fresh verification

| Evaluation | Saved baseline evidence | Fresh audit result | Meaning |
| --- | --- | --- | --- |
| Mixed holdout, 459 rows | 408/459 = **88.89%** accuracy; **88.98%** three-class macro F1 | Current CSV as found: 402/459 = **87.58%** accuracy; **87.64%** macro F1 | Model and local evaluation data do not currently form a consistent release |
| Synthetic holdout, 451 rows | 406/451 = **90.02%** accuracy | Current CSV as found: 400/451 = **88.69%** accuracy | Measures generated scenarios, not real deployment validity |
| Real holdout, 8 learners | 2/8 = **25.00%** accuracy | **2/8 = 25.00%**, unchanged | Six Average outcomes predicted as delay; too small and not independent of generator construction |
| Mixed holdout with baseline feature definition restored in memory | 88.89% accuracy; 88.98% macro F1 | **408/459 = 88.89%; 88.98% macro F1** | Reproduces the saved baseline, without modifying files |
| Archived holdout whose hash matches model metadata | 88.89% accuracy | **88.89%** using the active artifact | Further confirms an artifact/data mismatch |
| Five-fold training CV | **88.41%** mean accuracy | Not rerun | Parameter-selection score, not independent external validation |
| Archived V2 real out-of-fold evaluation | **100%** accuracy; **33.33%** three-class macro F1 | Not rerun | All 29 actual outcomes are Average; an always-Average baseline has the same results |

The full dataset contains **29 real and 1,500 synthetic rows**, so **98.10%** of rows are synthetic. The holdout contains 451 synthetic and eight real rows. All 29 real POST outcomes are Average; 25 of those learners had delayed PRE interpretations. The fresh check also found five household predictors missing for every real learner.

Sources: [saved V1 metrics](backend/ml/artifacts/evaluation_metrics.json), [dataset audit](backend/ml/artifacts/dataset_audit.json), [saved V2 report](backend/ml/artifacts/retraining_v2/MODEL_EVALUATION_REPORT.md), and the fresh read-only computations described above. Local research files may be Git-ignored and unavailable in another checkout.

## 4. Audit findings, in priority order

### P0 — Model, CSVs, reports, and feature definitions are inconsistent

This is a concrete reproducibility issue, not just a statistical limitation.

- The active artifact and saved metrics match the original baseline archive byte for byte, and their metadata agree.
- The current hybrid, training, and test CSV hashes **all differ** from those stored with that artifact.
- Every current CSV row uses `pre_delayed_domains_count = number of PRE domain scores <= 3`.
- The restored [builder](backend/ml/dataset_builder.py) through [common.add_scores](backend/ml/common.py), and the live [student feature extraction](backend/routes/ml.py), use **<= 6**.
- Recomputing that one column using <=6 in memory restores the saved aggregate accuracy and macro F1. The archived test file under `baseline_before_shortcut_removal/data/` also matches the artifact's expected test hash and reproduces 88.89%.
- The current local [MODEL_EVALUATION_REPORT.md](backend/ml/artifacts/MODEL_EVALUATION_REPORT.md) describes another experiment: **88.45%**, a **500-tree entropy** forest, and real-record weight **2**. That is not the loaded 400-tree baseline or its matching JSON metrics.

The active model SHA-256 is:

```text
2de3f5d3b31831438b60936864322935e23d61c30a5df1aeb077509538384541
```

The expected test-file SHA-256 in model metadata is:

```text
5eb147cac61a4e5e3e8aab07c9efe05e2d0b199509b243103a7191812d0e0081
```

The current test-file SHA-256 is:

```text
5774e80b3b3f4e54a616ae54c31cb9b49a27dda0c15060bfc9a183dc579b7cd1
```

**Proposed action:** assemble a consistent versioned baseline bundle containing its exact dataset/splits, derived feature definitions, preprocessing, model, metrics, report, and plots. Verify all hashes before reproducing results. Preserve other experiments separately. Do not change a derived feature's definition independently of the fitted model. If <=3 is desired for a future model, evaluate it as a distinct version across training and serving.

This finding does **not** mean the running API necessarily scores 87.58%: the fresh 87.58% used mismatched offline CSVs, whereas live extraction uses <=6. No running worker was inspected, and cached workers can retain previously loaded artifacts.

### P0 — No real delayed POST examples exist to validate the core distinction

All **29/29** real targets are Average. An always-Average rule therefore gets **100%** accuracy on this cohort. Neither a perfect V2 result nor an 8/8 experiment can demonstrate recognition of a delayed real outcome when no such outcomes are present.

**Proposed action:** collect verified longitudinal records spanning all supported POST outcomes. Keep the current 29 as development evidence. Report missing-class recall as **not estimable**, alongside zero support; filling an undefined metric with zero is a reporting convention, not a measured failure rate. Preserve a new real cohort for final evaluation.

### P0 — Held-out learners influenced synthetic training-data construction

[build_synthetic](backend/ml/dataset_builder.py) derives covariance, age/spacing anchors and observed PRE-to-POST growth from the full real cohort before the hybrid 70/30 split. Consequently, a real learner can be excluded from direct forest fitting while still influencing training through generator statistics, including outcome-derived growth.

**Proposed action:** split real learners first. Fit every data-dependent step, including generation, within training partitions only. Exclude final-test learners from generator development and statistics. Merely checking that train/test IDs do not overlap does not address this indirect information flow. This follows the separation principle in [scikit-learn's leakage guidance](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage).

### P1 — Simulated growth and class prevalence differ from observed learners

The generator limits growth with `0.25 * observed_growth - 0.035 * risk + noise`, and imposes 500 synthetic examples per outcome through rejection sampling. Its household penalties are explicit assumptions, not measured family effects. The real cohort instead moves from mostly delayed PRE interpretations to entirely Average POST interpretations.

**Interpretation:** this supports a distribution-mismatch explanation for poor real predictions; it does not prove how much each assumption contributes. A model can learn a simulator well while failing on the school population.

**Proposed action:** compare real-only learning with modest augmentation using real validation cases. Validate generator assumptions on development data. Do not adjust simulated growth, class quotas, or noise merely until a desired accuracy appears. Keep synthetic scenario results separate from real generalization claims.

### P1 — Data eligibility, missingness, and score ceilings need review

- **11 real learners** have unanswered PRE items in the research CSV. The builder accepts some marked items in every domain/period; the live API requires every configured PRE question. Align the intended eligible population and document exclusions. Never turn unknown answers into fabricated DI-KAYA observations.
- Five household fields are missing in all real records, while they are generated for synthetic records. Test whether these features help on real validation cases or encode source differences. The active API deliberately leaves occupation tier missing because no reviewed mapping exists.
- Real PRE ages span **59–80 months**. The scorer routes older ages to its oldest bracket; the schema permits **1–216 months**. Accepting an input does not establish empirical validity at that age.
- **15/29** real learners have all 109 raw POST items marked KAYA. This ceiling can limit the usefulness of predicting the broad overall category. It warrants a teacher review of original observations, checklist administration and carry-over practices; it is not evidence that the observations are incorrect.
- Current scripts enforce exactly **29 real / 1,529 total** rows. Future collection will require a reviewed dataset-version workflow rather than changing a CSV and expecting the old research scripts and tests to support it.

Sources: [builder](backend/ml/dataset_builder.py), [scoring helpers](backend/ml/common.py), [official scorer](backend/utils/eccd_scorer.py), [API readiness/extraction](backend/routes/ml.py), [input schema](backend/schemas/ml.py). Official scoring rules should remain unchanged while applicability and source quality are reviewed.

### P1 — Probability, explanation, and recommendation claims need boundaries

The pipeline returns raw forest probabilities; no calibration stage appears in the audited fitted pipeline. Both portals already display a caveat, although prominent labels still say “Model confidence.” A 90% probability is not the same as 90% measured accuracy or a validated guarantee for an individual child.

**Proposed action:** evaluate reliability, multiclass Brier score and log loss on real validation cases; compare calibration fitted only within development data. If an abstention/manual-review policy is introduced, predefine its threshold and report both accepted-case accuracy and the proportion of learners receiving predictions. Calibration and abstention do not automatically improve overall accuracy. See [scikit-learn's calibration documentation](https://scikit-learn.org/stable/modules/calibration.html).

The activity guides are transparent PRE-gap rules, independent of the predicted POST class. Their practical value should be reviewed with teachers and domain advisers separately. The current observations do not establish that the activities cause improved POST outcomes. Feature importance likewise describes model behavior, not causal family effects. With correlated domain totals, grouped ablations and held-out importance are more informative than treating an impurity ranking as proof; see [permutation importance guidance](https://scikit-learn.org/stable/modules/permutation_importance.html).

### P1 — Acceptance evidence is not yet portable and internally aligned

The current [model acceptance test](backend/tests/test_ml_model.py), inspected but not rerun here, requires accuracy **and** macro F1 strictly above 0.90 and checks split hashes. Those checks would fail on the presently observed artifacts. The restored trainer's report template still prints an older **>0.85** gate. Align requirements before reporting a pass.

Git tracks the active model, metrics, guides and core ML source. However, research CSVs and several detailed reports are ignored; `backend/tests/test_ml_model.py` is also ignored and was absent from the inspected tracked-file inventory. A clean clone cannot be assumed to reproduce this checkout's research validation. The two inspected teacher/parent ML browser test files **are tracked**.

**Proposed action:** retain a portable, non-sensitive automated inference test suite, provide access-controlled research data/version manifests for authorized reproducibility, and unify the metric gate. Do not publish sensitive learner CSVs or remove privacy protections to make CI pass.

## 5. What “90%+” should mean

Before another experiment, agree with the professor on the following protocol decisions:

1. **Task:** predict the existing three POST outcomes using information available at the official PRE cutoff.
2. **Population:** eligible real learners, with complete official PRE data, within a documented age and school/cohort scope.
3. **Threshold:** at least 90%, or strictly above 90%; whether macro F1 must also exceed 90%; and whether the target is a sample result or a confidence bound.
4. **Evidence:** independent real final-test performance, with synthetic performance shown separately. If the grading target concerns simulation only, explicitly label that narrower claim.
5. **Additional criteria:** baseline comparisons, per-class support, delayed-class recall, false reassurance and overflagging rates, uncertainty, and calibration where probabilities are presented.

For perspective, the recorded 408/459 baseline would need **414 correct** to exceed 90% on that same denominator: six additional correct predictions. The current mismatched-file result would need twelve. This is arithmetic, not a recommended optimization target: repeated tuning on that inspected holdout would bias its use as a final test.

### Small samples can make high percentages misleading

These two-sided 95% Wilson intervals were calculated during the audit:

| Correct / evaluated | Observed accuracy | Approximate 95% interval |
| --- | --- | --- |
| 2/8 | 25.00% | 7.15%–59.07% |
| 8/8 | 100% | 67.56%–100% |
| 29/29 | 100% | 88.30%–100% |
| 90/100 | 90% | 82.56%–94.48% |
| 180/200 | 90% | 85.06%–93.43% |

These examples assume independent binomial observations. They do not repair shared generator anchors, inspected test sets, absent classes, or correlated learners from the same cohort. In particular, the 29/29 row is illustrative, not a valid population-confidence claim for pooled V2 cross-validation. Method reference: [NIST confidence intervals for proportions](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm).

An approximate planning calculation at an expected 90% accuracy gives **139 independent test learners** for roughly ±5 percentage points at 95% confidence: `1.96² × 0.9 × 0.1 / 0.05²`, rounded up. This is a precision illustration, not a universal minimum, training-size recommendation, or guarantee of class coverage. Clustering and rare outcomes require additional planning. For example, an assumed 5% delayed-outcome prevalence would yield only about seven delayed cases in 139 learners; that prevalence is hypothetical, not measured for AMES.

Collect development examples of all classes, a representative final cohort for overall accuracy, and, if necessary, a separate enriched real delay challenge set for class-specific sensitivity. Do not present raw accuracy from an artificially balanced challenge set as population accuracy. Never withhold educational support to obtain delayed outcomes.

## 6. Proposed implementation and research plan

Everything below is future work. The audit did not perform these changes.

### Phase A — Stabilize the baseline and evaluation protocol

**Owners:** ML developer and thesis lead, with professor review of requirements.

1. Preserve all existing experiments; choose the exact restored baseline bundle for reproduction.
2. Reconcile the <=3/<=6 derived-feature discrepancy and mismatched report through a separate reviewed change. Verify consistency across builder, trainer, saved data, live student extraction and sandbox behavior.
3. Record dataset and split hashes, feature definitions/order, scoring-table version, code revision, package versions, seed and model hash in one release manifest. Keep research data in access-controlled storage.
4. Reproduce predictions, metrics and plots from that exact bundle. Identify API worker/model versions after any later approved deployment; cached workers need a deliberate reload.
5. Finalize the protocol in section 5 before choosing candidates. Treat all previously examined holdouts as development evidence.

**Exit evidence:** one reproducible baseline with matching hashes, clear limits, and one agreed acceptance definition. A reproducible 88.89% is more defensible than inconsistent higher percentages.

### Phase B — Establish real data quality and outcome coverage

**Owners:** authorized school data custodian, teacher/domain adviser and ML developer.

1. Obtain appropriately authorized longitudinal PRE/POST data from additional cohorts, sections or partner schools; document what may be used for research and evaluation.
2. Verify duplicate learners across files/years, chronology, age at assessment, item completeness, evaluator provenance and target recomputation. Independently review the observed POST ceilings and transitions with teachers.
3. Preserve unknowns and document inclusion/exclusion decisions. Match official PRE readiness or report a separate incomplete-data research population.
4. Inventory which household fields are actually known at PRE. Use reviewed canonical mappings; compare a reduced feature set instead of inventing missing family values.
5. Define the intended PRE-to-POST horizon and document variation in the interval, teaching context and assessment practices. A future horizon predictor must be known/planned at PRE; the eventual POST date must not silently become future information.
6. Size collection around both overall precision and genuine per-class support. Do not promise three-class validity while either delayed outcome remains absent.

**Exit evidence:** a de-identified data dictionary and aggregate audit with class support, missingness, age/horizon coverage, quality decisions, and a prospectively reserved final cohort. If coverage cannot be obtained before defense, retain the research-only claim.

### Phase C — Separate model selection from final evaluation

**Owner:** ML developer, with protocol review by the thesis adviser.

1. Reserve a new real final cohort before learning from it. Keep repeated records of a learner together; consider household, section, school and cohort grouping according to the intended deployment claim.
2. Use grouped/nested development validation where feasible. Inner folds select features, model settings, weights and calibration; outer folds estimate the selection procedure's performance. Choose fold counts according to the smallest class and number of independent groups, rather than forcing five folds.
3. Generate synthetic rows and fit all preprocessing inside each training fold only. Validation and final-test cases used for real accuracy must be genuine learners.
4. Compare candidates on the same real splits. If classes/groups are too sparse for valid folds, collect more data or report the limitation instead of substituting synthetic validation cases.
5. Freeze the complete candidate before accessing final-test labels. A failed final test may inform another development cycle, but the next final confirmation requires fresh evidence.

**Exit evidence:** saved split manifests, fold-level class counts and leakage checks, with no final-test influence on generator design or candidate selection. References: [nested CV](https://scikit-learn.org/stable/auto_examples/model_selection/plot_nested_cross_validation_iris.html) and [group/time-aware validation](https://scikit-learn.org/stable/modules/cross_validation.html).

### Phase D — Run a small, controlled experiment program

**Owner:** ML developer. Start after Phase B makes real class comparisons possible.

| Order | Comparison | Question answered |
| --- | --- | --- |
| 1 | Always-Average/most-frequent baseline, PRE-category persistence, and a small regularized classifier | Does forecasting add value over simple rules? |
| 2 | Real-only training versus real plus limited training-fold synthetic augmentation | Does simulation improve real validation performance? |
| 3 | Existing 18 inputs versus PRE domain scores and age; then add composites and household groups separately | Which inputs provide repeatable real predictive value? |
| 4 | Consistent alternative delayed-domain definitions in distinct offline versions | Does the derived count help, without training/serving mismatch? |
| 5 | Random Forest versus regularized logistic regression, Extra Trees and a gradient-boosted tree candidate | Does another model help under identical evidence conditions? |
| 6 | Selected model with/without development-fitted calibration and predefined review rules | Are probabilities and review coverage useful and reliable? |

For the forest, a bounded initial randomized search could compare 300–800 trees, depth 4/8/12/unrestricted, minimum leaves 1/2/4/8, minimum split sizes 2/6/12, feature sampling `sqrt`/0.5, and alternative class weights. Start with roughly **30–50 sampled configurations per promising setup**, subject to runtime; this is an experiment budget, not an evidence-based guarantee of improvement. The existing trainer already searches six configurations, so “add hyperparameter tuning” alone is not a novel remedy.

Select using predefined real validation metrics and delay-recall requirements. Analyze source weights jointly with class weights. Keep a complete experiment ledger, including negative results. Optional later features such as prior preschool exposure or attendance must be documented, available at the prediction cutoff, justified by a specific error pattern and evaluated as a separate model version.

Feature subsets and new inputs here are offline research proposals. They do not authorize changing the current 18-feature API, schemas or official scoring. Additional algorithm packages would also require a separately reviewed dependency change. Parameter references: [RandomForestClassifier](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html), [RandomizedSearchCV](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.RandomizedSearchCV.html).

**Exit evidence:** a comparison table with real accuracy, macro F1, balanced accuracy, per-class recall/support, baseline differences, uncertainty and operational cost. Prefer the simplest candidate with reproducible useful performance; more complexity is not an acceptance criterion.

### Phase E — Demonstrate the target and defend the result

**Owners:** ML developer, thesis lead and teacher/domain reviewer.

1. Evaluate the frozen candidate once on the reserved real cohort.
2. Report exact correct/total counts, three-class confusion matrix, macro F1, balanced accuracy, per-class precision/recall and suitable uncertainty estimates. Report support as zero and performance as not estimable for any absent class.
3. Separately report delay predicted as Average, Average incorrectly flagged as delay, and severe class errors. Include missing-input and age/cohort subgroups when support permits; sparse groups remain inconclusive.
4. Compare with all simple baselines. Accuracy above 90% is insufficient if a majority baseline matches it or delayed learners are systematically missed.
5. If using manual review, report coverage and errors for the complete policy, not only the easiest accepted cases. Present synthetic stress tests in a separate table.

**Proposed starting gates for discussion, not established school policy:** independent real accuracy >=90%; macro F1 >=0.85; balanced accuracy >=0.85; Significant Delay recall >=0.90; Slight Delay recall >=0.85; meaningful support and uncertainty for every supported outcome. The professor may require stricter thresholds, including macro F1 >90%. The school/domain reviewer must judge acceptable false reassurance and overflagging costs before selection.

**Exit evidence:** a frozen evaluation report supporting exactly the claim made. If the requirement is missed, report it honestly and identify the next data/experiment need.

### Phase F — Qualify a supervised production pilot

**Owners:** backend/frontend maintainers, deployment owner, ML developer and authorized school reviewer.

| Area | Existing foundation observed | Evidence or improvement needed before predictive production use |
| --- | --- | --- |
| Official assessments | ML inference is separate from deterministic ECCD scoring | Preserve this separation; no predictions overwrite observations, dates, labels or assessment history |
| Access/privacy | Teacher section checks; synced parent ownership; independent prediction and PRE release gates | Reverify real deployed denial/revocation flows and parent response filtering; preserve granular permissions and durable drafts |
| Input support | Pydantic bounds, complete-PRE readiness, missing-value handling | Define supported ages, cohorts, score combinations and missingness; route unsupported cases to teacher review rather than imply validity |
| Artifact release | Trusted local joblib, caching and feature/class checks | Version/hash manifest, trusted delivery, compatibility checks and atomic promotion/rollback; reload workers consistently |
| Service availability | Sanitized prediction-unavailable responses and startup warm-up | Monitor ML capability separately from database readiness; verify predictions can fail without losing ordinary school workflows |
| Performance | Cached inference; client orchestrates per-learner prediction requests | Measure realistic section-size concurrency, latency, CPU/memory, timeout/error rates and deployment-worker limits |
| Prediction provenance | Model metadata exists; current responses do not identify a release version | Plan a privacy-reviewed record of release ID, feature/scoring version, timestamp and decision policy; avoid raw child-data logging |
| Monitoring | No outcome-linked monitoring was established in this audit | Track input missingness, drift, class proportions, review rates and delayed outcomes once POST labels arrive; define who responds |
| Human oversight | Research notices and PRE-based guides | Teacher review process, documented scope and clear explanation that output is not a diagnosis; separate guide usefulness review |
| Reproducibility | Pinned dependencies, metadata and some tracked tests | Clean-environment replay with authorized data access; portable test coverage; aligned reports/metrics and artifact provenance |

Only trusted joblib artifacts should be loaded: pickle-based persistence can execute code, and version compatibility must be managed. Reference: [scikit-learn model persistence](https://scikit-learn.org/stable/model_persistence.html). This is a deployment-design recommendation, not a claim of an exploited vulnerability.

Start any pilot in **shadow mode**: generate predictions for authorized research comparison without using them to change educational decisions. Review prospective outcomes, class errors and workload before broader use. Freeze explicit pause/rollback criteria for artifact mismatches, failed access checks, unsupported inputs or unacceptable error rates. Production monitoring cannot retrospectively make an invalid benchmark valid.

## 7. Defense preparation and suggested answers

Prepare these items in the presentation or appendix:

1. A task diagram showing PRE-only inputs, the three POST outputs, and separate official scoring/guidance paths.
2. Real/synthetic counts and real class distribution, with the all-Average limitation visible.
3. A reproducible baseline/model manifest and consistent metrics table.
4. Baseline and candidate confusion matrices, exact denominators, class support and uncertainty.
5. A concise experiment/ablation table, including unsuccessful attempts.
6. A leakage-control explanation, model limitations and the prospective validation plan.
7. A demonstration of ownership/release gates and how unavailable predictions preserve school workflows.
8. Teacher/domain review of guide relevance and usability, explicitly separated from model accuracy and intervention efficacy.

| Likely panel question | Defensible answer |
| --- | --- |
| Why Random Forest? | It is a reasonable tabular baseline that can represent nonlinear relationships. We compare it with simpler and alternative models under the same real validation procedure. |
| You have 1,529 records. Why is that not enough? | Only 29 are real, and all real POST outcomes are Average. Simulated volume does not provide independent evidence of real delay recognition. |
| Does the V2 100% result prove success? | It equals an always-Average baseline on this cohort. Both delayed classes have zero real support, so their detection remains unvalidated. |
| Is a displayed 90% confidence the requested 90% accuracy? | No. It is a model probability for one prediction; measured accuracy comes from comparison with actual outcomes, and calibration is evaluated separately. |
| Are interventions learned or proven effective? | Current activities are explicit PRE-gap rules. Their relevance can be reviewed, but the available data do not establish causal effectiveness. |
| Why did fresh accuracy differ from the saved report? | The offline CSV used a different delayed-domain definition from the restored model. An in-memory consistency check and the hash-matching archived holdout reproduced 88.89%. The release bundle must be reconciled. |
| Is this ready for production? | The integrated research feature exists. Predictive production validity requires independent real evaluation, supported-use boundaries and a monitored supervised pilot. |

A suitable scope statement is: **“AMES implements deterministic ECCD assessment management and a PRE-based research model for later POST outcomes. Current mixed-data results demonstrate scenario performance; real three-class predictive validity remains under evaluation.”** Update that statement only when new evidence supports a stronger claim.

## 8. If the defense is soon

Prioritize the reproducibility mismatch, honest result tables, baseline comparisons, and a clear explanation of the actual prediction task. Assemble the evaluation protocol and show the integrated workflow. Document what new real evidence is needed and discuss the grading scope with the professor.

If new representative outcomes cannot be obtained in time, no tuning trick can turn the current 29 all-Average records into convincing evidence of three-class real prediction. A narrower approved simulation-study claim is possible, but it must be named as such. An alternative future research question, such as domain-level POST mastery forecasting, would need professor approval and a label-variation audit; it must not be substituted silently just to obtain a higher percentage.

Do not present training accuracy, selected favorable folds, changed seeds, copied learners, simulator simplification, redefined labels, or post-cutoff information as independent 90%+ accuracy. Do not promote V2 or the archived 8/8 experiment solely because its headline is higher. Do not suppress the existing accuracy gate or change official scoring to satisfy it.

The recommended sequence is **consistent baseline → verified real outcomes across classes → independent evaluation → controlled model comparison → frozen confirmation → supervised pilot**. This offers a credible route toward 90%+ while keeping the capstone's claims tied to evidence.
