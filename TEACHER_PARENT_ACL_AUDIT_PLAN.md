# Teacher-to-Parent ACL Audit and Repair

## Summary

Fix the confirmed settings-reload defect and complete permission-key parity, while preserving all layouts, styling, component structures and domain rules.

Current evidence from planning verification on 2026-11-04:

- All 44 focused backend ACL, visibility and prediction tests pass.
- Local marks, prediction and section-window schema checks pass.
- A saved partial settings draft can replace server values and normalize omitted marks/prediction permissions to OFF.
- `ChildPublicResponse` omits `allow_parent_predictions`, although the child resolver supplies it.

The scoped repairs below were implemented on 2026-11-04: server-first hydration,
owner-checked boolean draft overlays, partial pending updates, child prediction
schema parity and manual-retry regression coverage. Verification results are
recorded separately from the earlier planning evidence above.

## Permission Contracts and Resolution

Retain these canonical keys throughout frontend state, Pydantic schemas, API responses and database columns:

| Capability | Canonical teacher column/key |
|---|---|
| View student profile | `allow_parent_view_student_info` |
| Release PRE scores | `allow_parent_view_eccd_pre` |
| Release MID scores | `allow_parent_view_eccd_mid` |
| Release POST scores | `allow_parent_view_eccd_post` |
| View recorded checklist marks | `allow_parent_view_eccd_marks` |
| View predictions | `allow_parent_predictions` |
| Edit student profile | `allow_parent_edit_student_info` |
| Submit home observations | `allow_parent_edit_home_based_eccd` |

The eight flags belong to `teachers`, keyed by `teacher_id`; they are not school-year or student overrides. Editing windows belong to the enrolled section: `pre_test_parent_editable`, `mid_test_parent_editable` and `post_test_parent_editable`, defaulting to true/false/false.

Preserve this resolution pipeline:

**Authenticated parent → SYNCED family link → active student → enrolled section → active Primary Adviser with active account → adviser permissions plus section editing windows.**

Do not fall back to historical evaluators, cached adviser pointers, another section or permissive defaults.

| Parent view | Existing API checks |
|---|---|
| `/parent/ml-insights` | GET `/api/ml/parent/readiness/{id}`; POST `/api/ml/parent/predict/{id}` |
| `/parent/childinformation` | GET `/api/students/{id}`; PUT `/api/parents/children/{id}` |
| `/parent/eccdassessment` | GET `/api/eccd/parent/assessment/{id}` |
| `/parent/dashboard` home checklist | Assessment GET above; POST `/api/eccd/parent/evaluate` |
| Dashboard score summaries | GET `/api/eccd/parent/dashboard-stats/{id}` and `/api/eccd/parent/domains-progress/{id}` |

Keep existing routes and aliases. `/parent/child-info` is not the current profile route. Use student IDs in frontend URLs and payload references.

## Implementation Changes

- Repair permission hydration in `frontend/src/pages/teacher/TeacherSettings.tsx`: start from the successful server GET and overlay only explicitly present boolean fields from a matching-owner draft. Preserve explicit `false`; omitted draft fields must retain server values.
- Store new permission drafts as `Partial<Permissions>` containing accumulated pending changes. Send those fields through the existing partial PUT instead of resending unrelated permission snapshots. Continue reading existing full and partial drafts.
- Preserve revision guards, owner-scoped keys and manual retry behavior. Clear only the matching draft revision after HTTP 200/201. Reloads, failed requests, reconnection and permission revocation must preserve drafts.
- Add `allow_parent_predictions: bool = False` to `ChildPublicResponse` in `backend/schemas/student.py`, completing the eight-key child response contract. Keep existing teacher GET/PUT aliases and response envelopes.
- Retain the verified database persistence and adviser-resolution logic. No model changes, migrations, new endpoints, dependencies or authorization abstractions are planned.
- Verify existing parent conditions without changing markup: marks access remains independent of score release; home submission requires both the master permission and selected section window; saved-answer locks remain enforced. Prediction access additionally requires released, complete teacher-confirmed PRE data.
- Update the existing parent-ML offline regression that still expects automatic settings replay to require the established explicit retry.

Review the proposed diff with: **“Did this change introduce unnecessary abstractions, extra state, or new dependencies that existing code already handles?”**

## Tests and Acceptance

Extend existing suites with these cases:

- **Settings persistence:** toggle each of the eight flags both ways; inspect committed teacher values in a fresh session; retrieve through all three teacher GET aliases (`/api/teachers/me/access`, `/api/teachers/access-controls`, `/api/teachers/settings`). Unrelated partial updates preserve marks and predictions.
- **Reload regression:** server marks/predictions ON with an older draft omitting them; explicit draft OFF; successful save followed by reload; failed save followed by reload and manual retry. Verify stale responses cannot clear newer revisions or affect another owner.
- **Child parity:** child-list, child-detail, assessment and prediction-readiness responses return matching applicable booleans from the enrolled section’s adviser. Include siblings in different sections, transfers, handovers and unavailable advisers.
- **Gate matrix:** independently vary marks and score release; vary the home-edit master and each period window. Verify existing banners/control states and direct backend denial of forbidden submissions.
- **Preservation:** snapshot assessments before ACL updates and compare afterward, including answers, evaluator attribution, parent and teacher timestamps, official dates and historical records. Retain scoring-asset and Philippine-time boundary regressions.
- **Browser coverage:** extend existing settings, assessment, profile and ML suites; verify desktop/mobile behavior without presentation changes.

Run from the repository root:

```powershell
uv run --no-project --python .venv312 python -m pytest backend/tests/test_parent_assessment_access.py backend/tests/test_parent_visibility.py backend/tests/test_parent_ml.py backend/tests/test_parent_student_updates.py backend/tests/test_home_assessment_locks.py backend/tests/test_eccd_dates.py backend/tests/test_scoring_asset.py -q
uv run --no-project --python .venv312 python -m pytest backend/tests -q

pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build

pnpm.cmd --dir frontend exec playwright test --config playwright.parent-sync.config.ts
pnpm.cmd --dir frontend exec playwright test --config playwright.parent-assessment.config.ts
pnpm.cmd --dir frontend exec playwright test --config playwright.parent-ml.config.ts
```

Use disposable PostgreSQL schemas and synthetic children. Preserve existing working-tree changes and report unrelated baseline failures separately. Target `backend/tests` for pytest to avoid duplicate archived ML test modules collected from the repository root.

## Assumptions and Verification Limits

- The reported reset occurs after reloading Teacher Settings in the local app.
- Existing permission inheritance, independent score/marks gates, immutable home answers, scoring formulas and Philippine-time behavior remain authoritative.
- Implementation is limited to existing ACL data flow, persistence, schemas, permission queries and related tests; no UI layout, styling or component-structure changes are authorized by this plan.
- Planning verification covered the focused backend suites and schema checks.
  Frontend and browser verification completed during implementation is recorded
  below. The original affected browser's storage remains uninspected; the
  partial-draft defect is a confirmed reset path, not a confirmed diagnosis of
  that specific browser session.

## Implementation Verification — 2026-11-04

- Full `backend/tests`: **499 passed, 655 subtests passed, 1 failed**. The failure
  is the previously documented
  `test_parity.py::ParityTests::test_staff_lrn_correction_retains_student_links_and_masking`:
  a staff student-detail response includes the raw LRN. That unrelated response
  was not changed. Both new ACL backend tests pass, including persistence through
  all aliases, enrolled-section child parity, transfers, adviser handovers and
  exact preservation of assessment rows and timestamps.
- Both requested TypeScript project checks, frontend lint and production build
  **pass**. Standalone TypeScript checking of the changed browser tests also
  passes with TypeScript 6's `--ignoreConfig` flag.
- `playwright.parent-sync.config.ts`: **94 passed**, including 24 settings cases
  covering full/partial legacy drafts, explicit false, invalid fields, owner
  isolation, accumulated partial writes, confirmed-save reloads, HTTP 204/500
  retention, stale revisions and manual retry.
- `playwright.parent-assessment.config.ts`: **33 passed** across desktop, tablet
  and mobile, retaining independent marks/score gates and home editing locks.
- `playwright.parent-ml.config.ts`: **10 passed initially; 2 timing failures
  passed on focused rerun** with `--last-failed`, covering all 12 unique cases.
  The updated offline settings/manual-retry regression passes on both viewport
  projects in the initial run. No ML code or timeout settings were changed.
- Scoped Git whitespace checks pass. A repository-wide check reports existing
  trailing spaces in `frontend/src/layouts/MainLayout.tsx`; that file was not
  edited for this task.
- Verification used mocked APIs and disposable PostgreSQL schemas. No UI markup,
  styles, database models, migrations or endpoints were modified. The original
  affected browser's storage was not inspected; that incident-specific limit
  remains, while the identified hydration path is now repaired and covered.
