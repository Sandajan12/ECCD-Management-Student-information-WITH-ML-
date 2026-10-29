# Maximum-Raw-Score Sandbox Investigation and Focused Fix Plan

Date: 2026-10-29

Status: The fitted-bounds forecast safeguard was subsequently removed at the user's explicit request on 2026-10-29. Current behavior is recorded in section 7; section 6 preserves the preceding implementation and its verification history.

## 1. Findings

**The visible 44-month PRE calculation is reproducible. Direct inference through the unchanged on-disk artifact yields Average at 49.3%, not Slight Delay at 70.6%. Following removal of the bounds gate, the API returns this forecast again with permitted PRE information and activities. Removing the gate does not establish training or joint-profile support.**

The initial investigation ran the actual TypeScript conversion functions, Python scoring/inference functions, and Sandbox endpoint through an isolated in-memory FastAPI app with authentication overridden; that investigation used no database and changed no implementation code. The subsequent authorized implementation is recorded in section 6. Existing uncommitted work, datasets, scoring tables, age policies and the model artifact are preserved. No retraining, commit, push or deployment was performed.

## 2. Exact Reproduction and Age Comparisons

Domain order throughout: **GM, FM, SH, RL, EL, C, SE**.

### Supplied visible inputs

- PRE age: 44 completed months.
- Gender: MALE.
- Handedness: Left.
- Raw KAYA counts: GM=13, FM=11, SH=27, RL=5, EL=8, C=21, SE=24.
- Both parents' education: College.
- Household occupation: Informal Daily Wage.
- Siblings: 10.
- Birth order: 2.

The supplied screenshot description reports decimal age 3.7, AGE 3.1–4.0 bracket, scaled scores `14,15,16,12,13,19,14`, total scaled 103, standard score 138, and delayed-domain count 0. A preceding screenshot description reports different scaled scores, `10,12,10,10,9,17,10`, and a Slight Delay POST prediction of 70.6%. These are not assumed to represent the same request.

### Exact 44-month request

The request constructed by the current UI is:

```json
{
  "gm_pre_scaled": 14,
  "fm_pre_scaled": 15,
  "sh_pre_scaled": 16,
  "rl_pre_scaled": 12,
  "el_pre_scaled": 13,
  "cog_pre_scaled": 19,
  "se_pre_scaled": 14,
  "pre_total_scaled": 103,
  "pre_standard_score": 138,
  "pre_delayed_domains_count": 0,
  "age_months_pre": 44,
  "gender": "MALE",
  "handedness": "Left",
  "mother_education_level": "College",
  "father_education_level": "College",
  "household_occupation_tier": "Informal_Daily_Wage",
  "num_siblings": 10,
  "birth_order": 2
}
```

Raw counts are converted locally; they are not sent to this endpoint. The backend recomputes all three composites from scaled scores and age. **None changes for this request.** See [payload construction](frontend/src/pages/teacher/MlInsights.tsx#L951), [endpoint normalization](backend/routes/ml.py#L105), and [composite calculation](backend/ml/common.py#L37).

### Recalculated age comparisons

All comparisons retain the supplied demographics, household inputs, and raw counts `13,11,27,5,8,21,24`. Every feature was recalculated independently.

| PRE months | Decimal age / current bracket | Scaled scores | Total | Standard | Delayed domains | Table PRE interpretation |
|---|---|---|---:|---:|---:|---|
| 44 | 3.7 / AGE 3.1–4.0 | 14,15,16,12,13,19,14 | 103 | 138 | 0 | `Highly Advance` |
| 60 | 5.0 / AGE 4.1–5.0 | 13,14,14,11,11,16,13 | 92 | 129 | 0 | `Slight Advance` |
| 66 | 5.5 / AGE 5.1–5.11 | 11,12,13,11,11,13,13 | 84 | 117 | 0 | `Average` |
| 72 | 6.0 / AGE 5.1–5.11 | 11,12,13,11,11,13,13 | 84 | 117 | 0 | `Average` |

The 72-month bracket is the **existing implementation's behavior**: all decimal ages above 5 use its oldest bracket. This investigation does not validate or propose changing that policy. TypeScript and Python results matched. See [frontend conversion](frontend/src/utils/mlScoring.ts#L15) and [backend bracket selection](backend/utils/eccd_scorer.py#L17).

The artifact also engineers these nine numeric features before preprocessing:

| Months | Motor composite | Language composite | Cognitive/social composite | Delay ratio | Domain SD | Minimum domain | Capacity mean | Capacity lower | Capacity upper |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 44 | 14.5 | 12.5 | 16.5 | 0 | 2.1189138535 | 12 | 0.9964912281 | 1 | 1 |
| 60 | 13.5 | 11 | 14.5 | 0 | 1.6413036133 | 11 | 1 | 1 | 1 |
| 66 | 11.5 | 11 | 13 | 0 | 0.9258200998 | 11 | 1 | 1 | 1 |
| 72 | 11.5 | 11 | 13 | 0 | 0.9258200998 | 11 | 1 | 1 | 1 |

Capacity values are inverse-table interval proxies, not recovered raw observations. All five household fields are pruned before estimator preprocessing; these supplied household values therefore do not affect predictions. See [feature engineering](backend/ml/pipeline.py#L88).

### Raw inference probabilities

Unrounded probabilities from direct inference through the unchanged artifact (the API now withholds the 44-month row):

| Months | Average | Slight Delay | Significant Delay |
|---|---:|---:|---:|
| 44 | 0.4929837598483221 | 0.2542970302983701 | 0.2527192098533078 |
| 60 | 0.947779679669775 | 0.029519005467963443 | 0.022701314862261533 |
| 66 | 0.9483447740858886 | 0.02896627933762245 | 0.022688946576489 |
| 72 | 0.948345175581979 | 0.02896627390741594 | 0.02268855051060508 |

These results were observed, not forced.

For 44 months, the calibrated probabilities **before the artifact's existing support blend** are:

- Average: `0.9476385242860826`.
- Slight Delay: `0.029634506147032592`.
- Significant Delay: `0.022726969566884785`.

The artifact then blends `0.7715798640000111` toward its weighted training priors:

- Average: `0.35838680109990834`.
- Slight Delay: `0.3208065994500458`.
- Significant Delay: `0.3208065994500458`.

That produces the returned probabilities above. Age alone is explicitly excluded from this blending calculation. For the other three comparisons, blend mass is zero. See [support-aware calibration](backend/ml/pipeline.py#L33).

### Reproduced response and UI presentation

Before implementation, the reproduced HTTP response was **200**, with Average selected, no imputed fields, and no interventions. Its rendering shows **49.3% Average, 25.4% Slight Delay, and 25.3% Significant Delay**. Each baseline card shows its returned scaled score and the local tier “Average.” The initial safeguard implementation withheld the forecast. Following the user's subsequent removal request (section 7), HTTP 200 again includes `prediction_status: "available"`, `support_reason: null`, the model outcome and unchanged probability maps. See [response assembly](backend/routes/ml.py) and [UI formatting](frontend/src/pages/teacher/MlInsights.tsx).

The pre-change UI presentation was traced from source; no rendered screenshot was captured during the initial investigation. Implementation verification subsequently captured and inspected the new insufficient-support presentation, as recorded in section 6.

## 3. Support, Scoring, and Stale-Result Evidence

### Artifact and matching data

The freshly loaded artifact is `backend/ml/artifacts/rf_post_test_model.joblib`, with SHA-256:

```text
0c20bbd5536f6ffe0362f1e1b48be2105270686b5c1c200b5976e3f8970662a0
```

The current hybrid dataset, training split, test split, and scoring-table hashes match the artifact metadata:

| File | SHA-256 |
|---|---|
| `backend/ml/data/hybrid_eccd_dataset.csv` | `109dfd5d83ddab922e9183b57c346438cc5231fc709bb85954740ffc650969bd` |
| `backend/ml/data/train_set_70.csv` | `3140cc4af331ca63ea077ffb670c3fb38da08fdc14510027ef351d5b94b70599` |
| `backend/ml/data/test_set_30.csv` | `a700d7728744cd324abef89bf73fa84f6bd51e0bd05e508bc0131280490421ce` |
| `backend/eccd_scoring_data.json` | `dd66c79092cbaeab0d9da39c6ed0380fb6b79987e4278279f38014a1521d22d2` |

Training contains **1,070 rows: 21 real and 1,049 synthetic**. Both real and synthetic training ages span **59–80 completed months**. The full hybrid dataset contains 29 real and 1,500 synthetic rows. The test split contains 459 rows: 8 real and 451 synthetic.

At initial investigation, the pipeline, trainer, and feature-contract source hashes matched the artifact metadata; this implementation leaves those sources untouched. The dataset-builder's byte hash differs from its recorded source hash solely because of line endings:

```text
Current dataset_builder.py:
3b239b78631aae9b6d0a90205c856a2d0a72551d43f06c07d6af22de47cdf6ac

Recorded in artifact metadata:
d72e6ab992e6bddd6368431f6db87bd6dfe263c511c46c6fe755da05dbec8806
```

**Verified explanation:** the current builder already uses LF. Replacing CRLF with LF therefore leaves its hash unchanged; the initial normalization check was incomplete. Converting those LF bytes to CRLF gives exactly `d72e6ab992e6bddd6368431f6db87bd6dfe263c511c46c6fe755da05dbec8806`, the recorded hash. The current builder content is consistent with the historical CRLF version. No historical hashes, builder bytes, artifact or evaluation metadata were rewritten. The actual dataset and split hashes also match. Metadata references are in [evaluation metrics](backend/ml/artifacts/evaluation_metrics.json#L1329).

| Months | Training rows at that age | Matching seven-score profiles across all ages | Matching profile at exact age | Assessment |
|---|---:|---:|---:|---|
| 44 | 0 | 0 | 0 | Outside age and score ranges |
| 60 | 29 | 1 synthetic | 0 | Within marginal ranges; sparse profile support |
| 66 | 35 | 7 synthetic | 0 | Within marginal ranges; synthetic profile matches |
| 72 | 30 | 7 synthetic | 1 synthetic | Within marginal ranges; one exact joint match |

Profile matches above compare the seven scaled domain scores; exact-age matches additionally require the same completed-month age. They do not establish matches on every demographic input or independent real-world validity. All 29 real POST outcomes are Average.

The fitted numeric training bounds are:

| Feature | Minimum | Maximum | 44-month case |
|---|---:|---:|---:|
| GM scaled | 1 | 13 | 14 |
| FM scaled | 1 | 14 | 15 |
| SH scaled | 1 | 14 | 16 |
| RL scaled | 1 | 11 | 12 |
| EL scaled | 2 | 11 | 13 |
| C scaled | 1 | 16 | 19 |
| SE scaled | 1 | 13 | 14 |
| PRE total scaled | 11 | 92 | 103 |
| PRE standard score | 37 | 129 | 138 |
| PRE delayed-domain count | 0 | 7 | 0 |
| PRE age, completed months | 59 | 80 | 44 |

For 44 months, all seven domain scores exceed training maxima. Total `103` exceeds `92`; standard score `138` exceeds `129`. Acceptance by the scoring functions and Pydantic's broad input limits is not evidence of predictive support.

### Target coverage and scoring fallback

The model supports only these POST classes:

- Suggests Significant Delay in Overall Development.
- Suggests Slight Delay in Overall Development.
- Average Overall Development.

It cannot predict either advanced POST class. An advanced PRE interpretation does not require an identical POST outcome, but this three-class output is incomplete coverage of possible developmental outcomes. Its probabilities must not be presented as covering all five classes. See [class definitions](backend/ml/common.py#L22).

There is no standard-score entry for total `103`. The highest listed total is `98`, whose entry is standard score `138`, interpretation `Highly Advance`. The closest-lower fallback therefore returns that entry. This is confirmed existing behavior, not a newly established scoring defect. See [fallback](backend/utils/eccd_scorer.py#L40).

The baseline cards use simplified **support tiers**: ≤3 Delay, 4–6 Slight Delay, ≥7 Average. Those domain tiers do not replace the overall table interpretation. Thus seven “Average” support badges can coexist with an overall advanced PRE interpretation.

### Stale predictions and incomplete inputs

No persistent stale-response or conversion defect was confirmed in the source inspected before implementation:

- Raw-score or age edits trigger result clearing and a new 450 ms debounce.
- Cleanup aborts the previous request; success, failure, and completion handlers check the abort signal.
- Baseline cards and probabilities come from the same response object.
- Blank, fractional, negative, or excessive raw scores and invalid ages block submission. Intermediate `Number("")` conversions do not become submitted zero scores because validation blocks the request.
- Blank optional household numbers become `null`.
- Draft pending-state updates require the matching stored revision.

See [validation](frontend/src/pages/teacher/MlInsights.tsx#L826), [request lifecycle](frontend/src/pages/teacher/MlInsights.tsx#L921), and [durable form storage](frontend/src/utils/drafts.ts#L170). In-memory HTTP checks also rejected blank scaled scores and null age with HTTP 422.

Previously, result clearing occurred in a React effect, which did not prove instantaneous render-level isolation immediately upon editing. The implementation now binds results to the complete owner-key/input snapshot and synchronously invalidates them on edits, with additional request-version and abort checks. This defensive change is not an established explanation for the screenshots.

### Difference between screenshots

The earlier vector `10,12,10,10,9,17,10` cannot result from these maximum raw counts at **any currently accepted completed-month age, 1–216**. Its total would be `78`, versus `103` in the supplied case.

That establishes different calculated profiles. It does not establish which inputs, code version, request, or cached artifact produced the earlier 70.6% result.

### Missing evidence and limits

- The screenshots themselves, their request/response captures and timestamps, and the model identity loaded by the process that served them were not available.
- Model loading is cached, so replacing an on-disk artifact does not prove an already-running process loaded it. This reproduction used a fresh process. See [model cache](backend/ml/inference.py#L16).
- Browser race tests were initially inspected without execution. Subsequent authorized verification uses newly created disposable loopback databases, with results in section 6. Cases cover [conversion parity, invalid inputs and late responses](frontend/tests/ml-sandbox.spec.ts).
- The dataset-builder checksum difference is now verified as LF versus CRLF serialization, as explained above.
- Matching scoring implementations does not independently validate the reference tables, age policies, or model generalization.

## 4. Focused Implementation Plan (now implemented)

1. **Add a shared forecast eligibility check before inference.** Use the loaded artifact's fitted minima/maxima for all eleven retained numeric inputs, including age. Withhold forecasts outside any range. Do not gate on the five pruned household fields or invent a nearest-neighbor threshold. Missing or incompatible support metadata must also withhold the forecast.
2. **Extend teacher/Sandbox and parent response contracts explicitly.** Add `prediction_status: "available" | "insufficient_support"` and a support reason. For insufficient support, return null predicted outcome/confidence and empty probability maps, while retaining permitted PRE baseline information and independently generated PRE activities. Parent responses retain their privacy projection.
3. **Display “Insufficient training support for a POST forecast.”** Explain the applicable age/score-range reason. For in-range requests, describe eligibility as being within observed training bounds, not validated individual-profile support. Disclose that advanced POST classes are unavailable.
4. **Separate PRE presentation from forecast availability.** Preserve calculated scores and show the overall PRE table interpretation separately from domain support tiers. Keep current scoring tables, fallback behavior, and age policies unchanged. PRE-based activities continue to depend on observed gaps, not forecast status.
5. **Bind Sandbox results to an input revision.** Store the submitted revision with the response; render results only while it matches current inputs. Invalidate synchronously on edits and check revision plus cancellation in asynchronous handlers. Preserve owner-scoped drafts, revision-safe pending updates, offline retry, and all current authorization/release checks.

This changes forecast eligibility and response/UI contracts only. It requires no migration, retraining, artifact replacement, probability adjustment, or confidence cap.

## 5. Verification Cases and Defaults

- Reproduce all four age-comparison rows with TypeScript/Python parity and unchanged underlying artifact probabilities.
- Confirm 44 months returns insufficient support, with no forecast percentages, while preserving its PRE calculations.
- Confirm 60/66/72 remain eligible under the stated bounds policy; do not assert that predictions must be Average.
- Test inclusive fitted boundaries, values immediately outside each bound, and missing support metadata.
- Test total `103` still falls back to entry `98`; advanced PRE interpretation remains distinct from domain tiers.
- Test rapid raw/age edits, invalid intermediate inputs, delayed old successes/errors, and an old response released during the newest debounce.
- Test blank versus genuine zero raw counts, offline/reload/reconnect, and newer draft revisions surviving older responses.
- Verify teacher ownership, parent prediction permission, PRE release, parent privacy, and PRE-based activities for unsupported profiles.
- Run both required TypeScript project checks and focused database-free tests. Any later browser/API integration run must use an explicitly authorized disposable database.

Required TypeScript commands from the repository root:

```powershell
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
```

**Default:** fitted-range eligibility is a minimal, transparent safeguard, not a declaration of model validity. Broader support criteria require separate evidence and review.

The subsequent user instruction authorized the focused implementation and isolated disposable-database verification. Retraining, artifact replacement, commits, pushes and deployment remain outside this change.

Source line references describe the working tree inspected on 2026-10-29 and may move after later edits.

## 6. Historical Safeguard Implementation and Verification

This section records the preceding implementation. Its fitted-bounds gate and insufficient-support UI were subsequently removed as described in section 7. The Sandbox revision protection, permissions, privacy, scoring and draft preservation remain active.

### Changes

- [Shared inference eligibility](backend/ml/inference.py): `forecast_bounds_reason` checks the loaded classifier's saved `support_min_` / `support_max_` in its fitted feature order for all eleven retained numeric inputs, including completed-month PRE age. Bounds are inclusive. Missing, malformed, nonfinite, reversed or incompatible metadata withholds the forecast. It does not inspect household values, invent proximity thresholds, change calibration or call `predict_proba` for ineligible profiles. This is a **marginal bounds safeguard**, not validated support for a joint profile.
- [Response contracts](backend/schemas/ml.py) and [routes](backend/routes/ml.py): teacher, parent and Sandbox results share `prediction_status`, `support_reason`, nullable outcome/confidence and `pre_interpretation`. Insufficient support returns no outcome percentages; teacher/Sandbox raw probability maps are empty. The parent projection continues to exclude raw probability maps, family inputs, imputation details, individual marks and teacher-only activity fields. Existing role, ownership, active-child, completion and PRE-release checks still run before inference.
- [Shared forecast notice](frontend/src/components/common/ForecastSupportNotice.tsx), [teacher/Sandbox presentation](frontend/src/pages/teacher/MlInsights.tsx) and [parent presentation](frontend/src/pages/parent/ParentMlInsights.tsx): no probability chart, percentages or outcome badge appears for insufficient support. Permitted baseline domains, overall PRE table interpretation, dates and PRE-based activities remain. The three-class limitation is explicit. Domain planning tiers are labelled separately from overall PRE interpretation; no scoring conversion changed.
- Sandbox responses carry their submitted owner-key/input snapshot revision. Rendering requires a current revision match; edits synchronously clear results/errors and increment the request version. Asynchronous success, failure and completion handlers check both version and cancellation. Draft keys, stored input values, pending-revision checks, legacy drafts and online retry behavior are preserved.
- [Disposable integration runner](backend/tests/run_ml_forecast_checks.py): creates a uniquely named local test database, passes its URL only to child test processes and removes that exact database afterward. It refuses production settings and non-loopback hosts. API/browser fixture schema resets occur only inside that disposable database; the configured school database is never used for test data.

### Verification results

Database-free checks ran first. Final results on 2026-10-29:

| Check | Result | Evidence / scope |
|---|---|---|
| Database-free bounds, scoring and cache tests | **9 passed** | `test_ml_forecast_bounds` (6), `MLSandboxScoringTests` (2), `MLCacheTests` (1). The six bounds tests passed again after adding malformed-overflow metadata coverage. |
| Database-free existing real-cohort inference checks | **2 passed** | `test_runtime_none_and_nan_match_saved_pipeline_for_real_cohort` and `test_load_single_student_inference_and_guides`; saved probabilities and household pruning remain unchanged. |
| Disposable-database API/permission suite | **19 passed** | `run_ml_forecast_checks api`: role/section ownership, active adviser/child, PRE completion/date/release, parent privacy, unsupported-age activities, no assessment writes and existing settings/migration regressions. |
| Sandbox browser suite | **16 passed** | `run_ml_forecast_checks sandbox`: desktop/mobile, all valid raw conversions at months 1–216 and totals 0–133, exact maximum-score ages 44/60/66/72, blank versus zero, invalid inputs, offline/reconnect/reload, legacy/unrelated drafts, HTTP 503, older success/error during the newest debounce and newer draft revisions. Layout checks include 320/768/1280px. |
| Parent and teacher browser suite | **12 passed** | `run_ml_forecast_checks parent`: desktop/mobile real inference, permission revocation, unreleased/incomplete PRE, sibling races, hidden/restored children, offline preference drafts, and insufficient-support teacher/parent displays retaining PRE activities. No page errors in the added unsupported-age flow. |
| TypeScript app and node projects | **Passed** | Both explicit `tsconfig.app.json` and `tsconfig.node.json` checks. |
| Browser test TypeScript | **Passed** | Both changed browser specs checked with explicit bundler options and TypeScript 6 `--ignoreConfig`. |
| Focused ESLint | **Passed** | Shared notice, both edited pages and both browser specs; no warnings/errors. |
| Production frontend build | **Passed** | `pnpm.cmd --dir frontend run build`. |
| Patch whitespace and artifact identity | **Passed** | `git diff --check`; artifact SHA-256 remains `0c20bbd5536f6ffe0362f1e1b48be2105270686b5c1c200b5976e3f8970662a0`. |

The initial browser runs had one Sandbox reconnect assertion and one parent inference assertion expire at the default five-second DOM timeout while responses were still pending. An existing sibling-response mock also left a `route.fetch` in flight, which surfaced during two later parent tests. The test harness now awaits the matching prediction responses and delayed mock completion; the disposable runner constrains numerical worker threads. Both complete browser suites passed on rerun. These test-harness failures do not establish a product stale-response defect. Existing TestClient deprecation and terminal color warnings were nonblocking. No model was refitted by these checks.

All five databases created by the initial/final API/browser runs were removed by the runner after their subprocesses exited. Application and production databases were not used for test records. Screenshots/traces remain in ignored `frontend/test-results/ml-sandbox/` and `frontend/test-results/parent-ml/`; the insufficient-support parent screenshot was visually inspected.

Reproduce integration checks from the repository root, using a local development PostgreSQL account with `CREATEDB`:

```powershell
uv run --no-project --python .venv312 python -m backend.tests.run_ml_forecast_checks api
uv run --no-project --python .venv312 python -m backend.tests.run_ml_forecast_checks sandbox
uv run --no-project --python .venv312 python -m backend.tests.run_ml_forecast_checks parent
```

The browser runner supplies the existing explicit Playwright configurations. Do not bypass the disposable runner to point fixture resets at school or production databases.

### Remaining limitations

- Fitted minima/maxima are marginal training summaries, heavily influenced by synthetic rows. Passing this gate does not establish empirical support for the combined profile or independent real-world validity.
- Advanced POST classes remain outside the artifact's target coverage. An advanced PRE interpretation does not determine POST.
- The historical 70.6% screenshot's request, serving-process artifact and cause remain unestablished. This implementation does not attribute it to a stale response or conversion bug.
- Table fallback and age-bracket behavior remain unchanged and are not independently validated by these software checks.
- That implementation required a server reload to apply its safeguard. No hosted deployment was performed.

## 7. User-requested Removal of the Forecast Bounds Gate

The user explicitly requested removal of both the “Insufficient training support for a POST forecast.” message and its safeguard from parent and teacher ML Insights. The shared inference change also applies to teacher Sandbox.

- Removed `forecast_bounds_reason` and its early return from `backend/ml/inference.py`. Validated requests now reach the existing artifact's `predict_proba` directly, including ages and scores outside fitted numeric ranges. Successful responses retain their JSON field names with `prediction_status: "available"` and `support_reason: null`.
- Removed the insufficient-support alert, range explanation, fitted-bounds eligibility message and related parent/teacher badges. Existing research and three-class coverage information remains.
- Preserved the saved estimator and its own calibration/extrapolation behavior, scoring tables, accepted input ages, raw-score interface, actual probabilities, PRE interpretation/domain distinction, activities, permissions, privacy, Sandbox revision checks and durable drafts.
- Updated the existing database-free, API and browser regressions to expect real forecasts for the maximum-score cases at 44/60/66/72 months, and to verify permission/draft protection still applies.

Verification results for this removal are recorded below after execution. Earlier results in section 6 describe the former gate and are not evidence for this change.

The 44-month maximum-score profile remains outside the fitted PRE age range of 59–80 months. Returning a forecast does not establish empirical support. Advanced POST classes remain unavailable, and the earlier 70.6% screenshot's cause remains unresolved. No retraining, artifact replacement, production database modification, commit, push or deployment is part of this removal.
