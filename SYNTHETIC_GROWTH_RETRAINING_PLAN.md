# Correct Synthetic Growth and Retrain the ECCD Model

Status: Implemented and verified on 2026-10-30. The selected model passes all revised publication gates, 59 backend tests and 32 Playwright tests; both TypeScript projects, lint and production build pass. See `SYNTHETIC_GROWTH_RETRAINING_RESULTS.md` for exact probabilities, measured metrics and verification details.

Execution revision (2026-10-30): the user approved widening Profile C's Significant Delay band from 65–80% to **65–90%**, after training-only candidates missed the original band and before holdout evaluation. Runtime probability logic remains unchanged. The gates below reflect that approved revision.

## Summary

Update the synthetic generator to preserve age-appropriate development in Average domains and sample synthetic PRE ages across 36–71 months. Retrain the calibrated RF/HGB ensemble, publishing it only after the requested behavioral and accuracy gates pass.

## Generation changes

- In `backend/ml/dataset_builder.py`, sample synthetic PRE age uniformly from integer months 36–71. Preserve real records unchanged, including their existing ages. Retain seeded generation, domain covariance, demographic sampling and observed assessment intervals.
- Score PRE raw counts before simulating growth. Use these domain rules:
  - **Scaled ≤6:** retain the existing constrained recovery formula, default factor 0.40.
  - **Scaled ≥8:** find the minimum raw count that preserves the PRE scaled level under the POST-age table, capped at that domain’s attainable maximum. Add constrained empirical growth over the remaining capacity.
  - **Scaled 7:** use the rounded midpoint between the constrained-recovery and normal-progression raw targets.
- Define severe multi-domain risk as **at least three PRE domains scoring ≤6**. For those profiles, use constrained recovery throughout without norm-preservation floors.
- Keep raw counts within capacities and enforce nondecreasing PRE/MID/POST counts. Derive all period scores and labels through the unchanged official scorer.
- Keep the three-class model. Count and exclude candidates with advanced POST outcomes rather than relabeling them. Retain 500 accepted synthetic records per supported class.
- Extend generation audits with age coverage, rejected advanced outcomes, growth assumptions and PRE→POST transitions overall and by age bracket. Compare these with the existing dataset.

## Training and compatibility

- In `backend/ml/train_random_forest.py`, add the agreed profile gates to training-time candidate eligibility and final publication checks. Only calibrated soft-voting RF/HGB candidates may become runtime artifacts.
- Preserve fold-local preprocessing/calibration, household invariance, seed 42, the stratified 70/30 split and the external 18-feature contract.
- Invalidate stale selection caches when generator configuration or profile gates change. Choose candidates using training CV; evaluate the frozen winner on holdout once.
- Preserve a checksummed rollback snapshot of the current datasets, model and associated reports. Publish a consistent replacement only when every gate passes. Retain diagnostics and restore the previous active artifact set if publication fails.
- Refresh model hashes, artifact-dependent tests, generated metrics and reports. Leave scoring assets, runtime probability logic, permissions and assessment records unchanged.

## Acceptance and verification

Run checks at **both 38 and 66 months**, using authoritative composites. Domain vectors follow GM, FM, SH, RL, EL, Cognitive and Social-Emotional order.

| Profile | Definition | Required result |
| --- | --- | --- |
| A | Scaled `[10,12,10,10,10,12,10]`; total 74, standard 103 | Average ≥75% |
| B | Scaled `[11,12,11,11,6,12,12]`; total 75, standard 104 | Average ≥60% |
| C | Seven scaled scores of 1; total 7, standard 37 | Significant Delay 65–90% |

- Add raw-input counterparts for A and B using attainable table values. At 66 months, B uses EL=5 because EL=6 is unavailable. Derive totals rather than forcing supplied values.
- Check gender/handedness combinations and blank/filled household invariance. Report raw-zero and raw-one predictions separately without imposing Profile C’s probability band.
- Require combined holdout **accuracy ≥90% and Macro F1 ≥90%**. Report real/synthetic and age-bracket results separately.
- Add regressions for deterministic generation, all 36 synthetic ages, age-bracket transitions, growth branches, capacities, official rescoring and advanced-candidate exclusion.
- Run the requested builder, trainer and `test_ml_model`/`test_ml_api` commands, plus scoring-asset, pipeline, forecast and parent regressions.
- Update and run both existing Playwright ML suites against disposable local databases, verifying displayed probabilities match inference. Run both TypeScript checks, lint and build after browser-test changes.

### Verification commands

Run from the repository root using the project’s Python 3.12 environment and pnpm. Complete the rollback snapshot and gate changes before running the commands that regenerate datasets or retrain the model.

```powershell
# Regenerate datasets and select/evaluate the model.
uv run --no-project --python .venv312 python -m backend.ml.dataset_builder
uv run --no-project --python .venv312 python -m backend.ml.train_random_forest

# Required model/API regression suite.
uv run --no-project --python .venv312 python -m unittest backend.tests.test_ml_model backend.tests.test_ml_api -v

# Related scoring, pipeline, forecast and parent regressions.
uv run --no-project --python .venv312 python -m unittest backend.tests.test_scoring_asset backend.tests.test_ml_pipeline backend.tests.test_ml_forecast_bounds backend.tests.test_parent_ml -v

# Browser suites: these wrappers create and remove their own disposable local databases.
uv run --no-project --python .venv312 python -m backend.tests.run_ml_forecast_checks sandbox
uv run --no-project --python .venv312 python -m backend.tests.run_ml_forecast_checks parent

# Frontend verification.
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build
```

## Documentation and defaults

Update `AI_CONTEXT.md` and ML documentation with the new growth rules, actual age support, model fingerprint, profile probabilities, metrics and test results.

Preserve the existing oldest-bracket fallback for simulated POST ages above 71 months. Score 7’s intermediate simulation rule does not change its current UI interpretation. Document that these synthetic benchmarks do not establish independent real-world accuracy or measured recovery rates.
