# Synthetic Growth Retraining Results

Date: 2026-10-30. The dataset was regenerated and the calibrated RF/HGB ensemble retrained. All model publication gates and verification suites pass.

## Acceptance decision

The initial 65–80% Significant Delay band for scaled-all-1 Profile C failed in training-only evaluation. After reviewing that result, the user explicitly approved **65–90%** before any holdout evaluation. Runtime probability logic remains unchanged. The A/B probability thresholds and 90% holdout accuracy/Macro F1 requirements remain unchanged.

The initial five CV candidates, eight additional regularization probes, and recovery-factor probes at 0.38 and 0.42 are preserved in [the aggregate experiment record](backend/ml/artifacts/growth_retraining_experiments.json). The retained generation factor is the original default **0.40**. No profile-specific probability overrides, clipping, or recovery metric were introduced.

## Final metrics

| Evaluation | Records | Accuracy | Macro F1, three supported classes |
| --- | ---: | ---: | ---: |
| Combined holdout | 459 | 92.8104575163% (426/459) | 92.8205366477% |
| Synthetic holdout | 451 | 93.7915742794% (423/451) | 93.8044998879% |
| Real holdout | 8 | 37.5000000000% (3/8) | 18.1818181818% |
| Five-fold training CV, mean | 1,070 training rows | 90.2803738318% | 90.2798705328% |

The real holdout result declined from the preceding model's 4/8 to 3/8. All 29 real POST outcomes are Average, so an always-Average real-only baseline scores 100%. Student-excluded predictions across the real cohort achieve 10/29 (34.48%). The combined result is dominated by synthetic records; shared real generator anchors prevent interpreting it as independent validation on new real learners.

Holdout accuracy by PRE scoring bracket is 94.4% (125 records), 93.7931% (145 records), and 91.0053% (189 records), from youngest to oldest bracket.

Selected model: `soft_voting_rf_histogram`, sigmoid calibrated, with equal RF/HGB voting weights. The winner was selected using training data and evaluated on holdout once.

Current model SHA-256:

```text
835139f31887924c02f98c9d12878755885c4b476ae6ef54e3412b599d54ecc6
```

Full evaluation data: [evaluation_metrics.json](backend/ml/artifacts/evaluation_metrics.json). Generated research report: [ML_ACCURACY_REVIEW.md](ML_ACCURACY_REVIEW.md).

## Exact acceptance-profile probabilities

These are full-precision probability fractions from the saved model, for **FEMALE / Right** with blank household inputs. Filled household inputs produce identical distributions. Class order below is Average, Slight Delay, Significant Delay. All four gender/handedness combinations pass the corresponding gates; the JSON records each combination separately.

| Profile | PRE age, months | Average | Slight Delay | Significant Delay |
| --- | ---: | ---: | ---: | ---: |
| A | 38 | 0.9488389000240057 | 0.03166344457637091 | 0.019497655399623358 |
| A | 66 | 0.9488266587202285 | 0.03167209788203362 | 0.01950124339773769 |
| B | 38 | 0.948837327583586 | 0.03166446709199296 | 0.019498205324421022 |
| B | 66 | 0.9488162923231763 | 0.031677470701075815 | 0.0195062369757479 |
| C | 38 | 0.0792890660883052 | 0.07244959066853507 | 0.8482613432431597 |
| C | 66 | 0.07925420392718432 | 0.07147845971887903 | 0.8492673363539365 |

- **A:** scaled `[10,12,10,10,10,12,10]`, total 74, standard score 103; predicts Average above 75% at both ages.
- **B:** scaled `[11,12,11,11,6,12,12]`, total 75, standard score 104; predicts Average above 60% at both ages.
- **C:** seven scaled scores of 1, total 7, standard score 37; predicts Significant Delay within the user-approved 65–90% band at both ages.

Domain order is GM, FM, SH, RL, EL, Cognitive, Social-Emotional. Some literal scaled values cannot be produced by a raw score in a particular bracket; scaled-only requests remain supported and are tested separately from raw-input profiles.

### Table-attainable raw counterparts

| Profile | PRE months | Raw vector | Scaled vector | Total / standard | Average probability |
| --- | ---: | --- | --- | --- | ---: |
| A raw | 38 | `[10,9,20,4,7,11,20]` | `[10,12,10,10,11,12,10]` | 75 / 104 | 0.9488388290042253 |
| B raw | 38 | `[11,9,22,4,5,11,22]` | `[11,12,12,10,6,12,12]` | 75 / 104 | 0.9488368933109451 |
| A raw | 66 | `[13,11,25,5,8,20,22]` | `[11,12,10,11,11,12,10]` | 77 / 107 | 0.9488266587202285 |
| B raw | 66 | `[13,11,26,5,0,19,24]` | `[11,12,12,11,5,11,13]` | 75 / 104 | 0.9488170598246704 |

At 66 months EL can be scaled 5 or 11, so raw B uses EL=5. Raw-zero and raw-one inputs are separate scenarios, not scaled C. For FEMALE/Right, raw-zero Significant Delay probability is 0.9344749445744197 at 38 months and 0.9356437763265272 at 66 months. Those scenarios do not inherit C's band, and all three probabilities remain strictly between zero and one.

## Generation and compatibility

- Synthetic PRE age proposals cover integer months 36–71; every month occurs in the accepted dataset. Real records remain unchanged, including ages 59–80.
- Scaled >=8 uses a POST-age norm-preserving raw floor followed by simulated growth. Scaled 7 interpolates normal/constrained targets. Scaled <=6, and profiles with at least three delayed domains, retain constrained recovery.
- PRE/MID/POST raw counts remain bounded and nondecreasing. The official scorer derives all scores and labels. POST ages above 71 retain the existing oldest-bracket fallback.
- The 1,500 accepted synthetic records contain 500 of each supported POST class. The generator excluded and counted 466 slightly advanced and 200 highly advanced POST candidates, without relabeling them.
- Among accepted PRE-Average records, 340 remain Average and 13 become Slight Delay. The previous dataset had 249 remain Average, 14 become Slight Delay, and 2 become Significant Delay. These are different synthetic mixtures, not a controlled real-world comparison.
- The 18-feature contract, three-class response, official scoring assets, household invariance, permissions and durable drafts are preserved. No database migration or hosted deployment was performed.

## Verification

| Verification | Result |
| --- | --- |
| Required `test_ml_model` + `test_ml_api` | **25 passed**, 226.960 seconds |
| Scoring asset, pipeline, forecast, parent and growth suites | **34 passed**, 128.325 seconds |
| Sandbox Playwright, desktop + mobile | **20 passed**, 6.6 minutes |
| Parent/teacher Playwright, desktop + mobile | **12 passed**, 4.7 minutes |
| TypeScript app project | Passed |
| TypeScript node project | Passed |
| Additional sandbox browser-spec TypeScript check | Passed |
| Full frontend lint | Passed |
| Production frontend build | Passed |
| Sandbox-spec Prettier check and Git whitespace checks | Passed |

The backend suites total **59 passing tests**. Both browser wrappers removed their own disposable databases. Browser coverage includes A/B raw equivalents at both ages with exact API/inference probability parity, minimum raw scores with three nonzero probabilities, every raw conversion and supported month, age/capacity validation, unchanged scoring summaries, offline reload/reconnection, draft preservation, stale response isolation and parent permissions/privacy.

The new score-7 unit test initially compared against the score-8 preservation threshold; it was corrected to independently use score 7's attainable POST threshold, and the complete growth suite passes. An optional browser-spec type-check initially hit a sandboxed pnpm fetch failure and passed on the permitted network retry. Existing Starlette/httpx deprecation and terminal color warnings were non-fatal. No application behavior was changed to suppress failures.

## Rollback and runtime

The preceding datasets, model, associated reports and source are preserved in a verified 42-file archive at:

```text
backend/ml/artifacts/baseline_pre_missingness_weighting/before_growth_retraining_20261029_211422/active_before_growth.zip
```

Its adjacent `manifest.json` records the archive hash and individual file hashes. The snapshot and learner-level datasets remain ignored. Existing API processes must be restarted to refresh the cached model. No running hosted backend was restarted or deployed by this task.
