# DepEd Raw-Score Sandbox Conversion

Date: 2026-10-29

Status: Approved, implemented and verified on 2026-10-29. Final contracts and verification evidence are recorded in `AI_CONTEXT.md`.

## Summary

Complete the existing raw-score simulator at `/teacher/ml-insights` with a live scoring summary, authoritative server conversion, and sandbox-only age validation.

Use the supplied lookup tables exactly, including zero scaled values where present. Keep the three outcome probabilities without adding a recovery metric. Baseline verification passed: 20 backend tests and frontend app TypeScript.

## Frontend changes

- In `frontend/src/pages/teacher/MlInsights.tsx`, place completed-month age before domain inputs and restrict it to integers **36–71**. Preserve existing rounding and bracket selection; 36 months uses the youngest bracket.
- Retain integer raw-score limits: **GM 13, FM 11, SH 27, RL 5, EL 8, C 21, SE 24**. Invalid or incomplete inputs remain editable and persisted, but block inference.
- Extend `frontend/src/utils/mlScoring.ts` to expose the table interpretation alongside the standard score. Preserve exact lookup and closest-lower fallback behavior.
- Add a responsive live summary above the form containing each domain’s raw count, maximum and scaled score, plus total scaled score, standard score, table interpretation and delayed-domain count (`<=6`). Incomplete aggregates display placeholders.
- Send the existing 18 derived features plus a typed `raw_scores` object. Preserve debouncing, request cancellation, revision checks, owner-scoped drafts, legacy draft references and reconnection retries. Successful inference retains inputs.

## Backend and inference changes

- Add a sandbox-specific request schema extending `MLFeatures` with optional `raw_scores`, containing all seven domain codes and their integer capacity limits. Override age validation to **36–71** only for this endpoint.
- Preserve scaled-only requests. When raw scores are supplied, derive all seven scaled scores from them; otherwise use the validated supplied scaled scores. Always recompute total, standard score and delayed-domain count before constructing the unchanged `MLFeatures` inference input.
- Expose shared raw-score conversion through `backend/utils/eccd_scorer.py`, reusing the existing deterministic lookup rules without changing either scoring asset.
- Preserve the `/api/ml/predict/sandbox` response shape and return the authoritative normalized features. Invalid requests return 422.
- Extend cached model compatibility checks to require the fitted sigmoid-calibrated RF/HistGradientBoosting ensemble. Incompatible artifacts retain the sanitized 503 response.
- Assert the active artifact fingerprint in regression tests: `0c20bbd5536f6ffe0362f1e1b48be2105270686b5c1c200b5976e3f8970662a0`. Return its probabilities directly without caps or profile-specific adjustments.

## Verification and acceptance

- Test every valid domain raw value across months 36–71 for client/server parity, including closest-lower lookups, exact interpretations and asset byte equality.
- Cover age boundaries **35/36, 48/49, 60/61, 71/72**, invalid raw values, incomplete raw objects, stale composites, conflicting raw/scaled inputs and scaled-only compatibility.
- Browser acceptance includes **GM raw 13 → scaled 14 at 44 months**, immediate summary updates, responsive layouts at 320/768/1280px, offline reloads, reconnection, failed requests and late responses.
- Keep minimum-raw and all-scaled-1 fixtures separate. At 66 months with MALE/Left demographics and household fields null:
  - All-zero raw scores produce scaled `[1,1,2,1,5,1,1]`, total **12**, standard **37**, and approximately **92.9% Significant Delay**.
  - Seven supplied scaled scores of 1 produce total **7**, standard **37**, and approximately **70.4% Significant Delay**.
- Update existing sandbox regressions that currently expect ages above 71 to succeed. Preserve shared student/parent age behavior.
- Run the requested backend suite, related pipeline/forecast/parent regressions, both TypeScript project checks, frontend lint/build, and browser tests using the existing explicit ML sandbox configuration.
- Update `AI_CONTEXT.md` with the final request contract, age policy and verification results after implementation.

### Verification commands

Run from the repository root:

```powershell
uv run --no-project --python .venv312 python -m unittest backend.tests.test_scoring_asset backend.tests.test_ml_model backend.tests.test_ml_api -v
uv run --no-project --python .venv312 python -m unittest backend.tests.test_ml_pipeline backend.tests.test_ml_forecast_bounds backend.tests.test_parent_ml -v
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build
pnpm.cmd --dir frontend exec playwright test --config playwright.ml-sandbox.config.ts
```

Backend integration and browser tests use the existing disposable PostgreSQL fixtures. No application schema migration is needed for this feature.

## Assumptions and confirmed decisions

- Existing uncommitted work remains the implementation baseline.
- The supplied scoring tables are authoritative, even where they conflict with the original task’s stated 1–19 range or its assumption that minimum raw scores yield seven scaled scores of 1.
- Display Average, Slight Delay and Significant Delay probabilities only; do not add a recovery metric.
- The 36–71-month restriction is a sandbox input policy. It does not change the model’s actual fitted training support or the shared student/parent age policy.
- The frontend continues sending all existing ML features; `raw_scores` is an optional addition to the sandbox request, not an additional model feature.
- No model retraining, scoring-table changes or database migration is required.

## Implementation results

- Both backend verification commands pass: **25 + 25 = 50 tests**.
- Both TypeScript project checks, full frontend lint and production build pass.
- Playwright sandbox verification passes: **18 tests**, covering desktop/mobile, conversion parity, calibrated probabilities, input validation, draft durability and request isolation.
- Browser checks confirm **GM raw 13 → scaled 14 at 44 months** and responsive summary layouts at **320/768/1280px**.
- Minimum raw counts and all-scaled-1 fixtures retain their distinct calibrated probabilities described above.
- Focused formatting and Git whitespace checks pass. Screenshots are under `frontend/test-results/ml-sandbox/`.
