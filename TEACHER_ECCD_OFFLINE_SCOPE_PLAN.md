# Restrict offline submissions to teacher ECCD assessment

Status: Implemented in the frontend (2026-11-04). Verification results are recorded below.

## Summary

Shared synchronization previously retried parent forms, chairman actions, other teacher forms and uploads after reconnection.

As agreed, keep unfinished drafts everywhere, but allow queued saves and automatic synchronization **only for teacher ECCD assessments**.

## Changes

- Keep teacher ECCD assessment's offline answers, dates, student switching, reload recovery, and automatic synchronization.
- Restrict shared replay to authenticated teacher-owned ECCD drafts targeting `POST /api/eccd/evaluate`. Apply this restriction inside the synchronization function so every caller follows it.
- Require an online connection for parent assessments, profiles, child linking, messages, chairman actions, and other teacher forms/uploads.
- Outside teacher ECCD, failed or offline saves retain inputs and display: "Your draft is saved on this device. Reconnect and submit again." Reconnection alone must not submit them.
- Preserve existing online interactions, including settings that save immediately when deliberately changed. Failed changes require an explicit retry.
- Stop automatic upload retries outside teacher ECCD. Preserve selected files for manual retry.
- Preserve existing non-ECCD queued records as drafts, without replaying or deleting them. Users review and submit them manually.
- Update shared status messages so parents and chairman users are never told their changes will automatically sync.
- No backend API or database changes are required for this restriction.

## Verification

- Teacher ECCD saves offline, survives reload/student switching, and synchronizes only the matching owner and revision.
- Parent, chairman, and other teacher drafts survive reload, but generate no submission requests on reconnection or login.
- Existing queued non-ECCD forms/uploads remain recoverable without automatic submission.
- Manual online retries save successfully; older responses cannot clear newer edits.
- Run both frontend TypeScript checks and relevant browser suites using explicit configurations.

Verified 2026-11-04:

- Both frontend TypeScript projects, standalone browser-test typing, full lint
  and the production build pass.
- 110 distinct browser checks pass: 74 draft/scope/settings/profile/link/import
  checks using `playwright.parent-sync.config.ts`, 24 parent assessment checks,
  eight targeted messaging checks, two section rename checks and two ML sandbox
  retry checks. Coverage includes desktop/mobile; parent assessments also cover
  tablet. The latter three suites use disposable PostgreSQL schemas.
- `uv run --no-project --python .venv312 python -m pytest` encounters duplicate
  archived ML preprocessing test modules during collection. Scoping collection
  to active `backend/tests` completes with **489 passed, one failed**. The failure,
  `test_staff_lrn_correction_retains_student_links_and_masking`, was already
  documented in `AI_CONTEXT.md`: staff student details include raw `lrn_number`.
  Backend behavior was not changed for this frontend task.
- Whitespace checks pass for task changes. The pre-existing whitespace in
  `frontend/src/layouts/MainLayout.tsx` remains untouched.

The review checkpoint found no new dependencies, draft stores or generic replay
framework. Existing stores and revision guards are reused; the replay predicate
is shared by the engine, status banner and assessment refresh/count logic.

## Relationship to the assessment-date plan

Retain the agreed question locks, confirmation dialog, independent dates, teacher attribution, and age/scoring rules in [HOME_BASED_ASSESSMENT_AUDIT_PLAN.md](HOME_BASED_ASSESSMENT_AUDIT_PLAN.md).

Replace that plan's parent offline-sync behavior with **draft preservation plus manual online submission**. Parent dates remain the first successful server-save date. Where the two documents differ about offline submissions, this document takes precedence.

The frontend now enforces this scope in the shared replay function. Non-ECCD
records remain in their existing device stores for manual review and submission.
Teacher access/period settings and chairman permission/home-based switches have
explicit retry buttons; deliberate online
switch changes still save immediately. Failed sandbox simulations also require an
explicit retry. File replay and non-ECCD replay callbacks have been removed.
No backend route, response schema or database change was made for this task.
