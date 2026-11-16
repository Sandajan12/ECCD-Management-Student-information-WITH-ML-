# KAYA carry-forward with teacher override

Status: Implemented and locally verified on `feat/parent-native-android`; awaiting user localhost/device review before any release.

The requested `_2.md` was absent at implementation start. This file preserves the
approved revised rules from `ECCD_KAYA_CARRY_FORWARD_PLAN.md` under the requested
name. Local commits only; no branch switch, push, merge or deployment is included.

## Summary

Implement per-question KAYA carry-forward across `backend/`, `frontend/`, and `mobile/parent-native-android`, with a teacher override exemption for unconfirmed parent-submitted home-based observations.

**No database schema change is required.** Existing answer, evaluator, teacher-confirmation, and parent-provenance fields support this behavior.

## Rules

- **Parents:** Saved PRE KAYA carries into MID/POST; saved MID KAYA carries into POST. Parents cannot change inherited KAYA to DI-KAYA, regardless of whether the earlier answer came from a parent or teacher, subject to the teacher override reset below.
- **Teachers:** Earlier teacher-marked or teacher-confirmed KAYA locks later periods. Earlier unconfirmed parent KAYA on a home question prefills later periods but remains editable by teachers. Teachers may correct that original parent answer or choose DI-KAYA in a later period, unless a separate earlier teacher-confirmed KAYA requires a lock.
- Identify teacher confirmation using `evaluator_role == "teacher"` **or** a non-null `teacher_evaluation_date`. Equal-answer confirmation deliberately preserves `"parent"` attribution; evaluator role alone cannot identify unconfirmed parent observations.
- A teacher's saved MID DI-KAYA overrides an earlier unconfirmed parent PRE KAYA and resets carry-forward into unanswered POST for both parent and teacher. POST then requires a fresh answer. An earlier teacher-marked or teacher-confirmed KAYA cannot be bypassed using this exemption.
- Preserve authorized corrections to the original period, parent history, and explicit correction confirmation. Parents cannot overwrite submitted observations or teacher corrections.
- Inherited answers display **"Carried forward — not saved"** until that period is explicitly submitted. Native home questions remain visible with KAYA selected and DI-KAYA disabled until HTTP 200/201 confirmation. Keep the Save/Submit action available for eligible inherited-only submissions.
- Only server-confirmed saved answers trigger carry-forward; unsaved earlier selections do not. Opening a screen, changing periods, refreshing, or reconnecting must not create assessment records.
- Existing conflicting records require reviewed teacher saves; never rewrite historical records automatically. A valid teacher override of an unconfirmed parent observation is not a conflict to force back to KAYA.

## Implementation

- Before implementation, read `AI_CONTEXT.md`, `AGENTS.md`, and this plan; inspect current Git status and preserve unrelated work. Check graph freshness and refresh the relevant AST dependency mapping before changing shared assessment helpers.
- Update the shared backend carry-forward calculation and both save handlers. Validate whole batches before writes, using current records under the existing student lock. Apply role-specific locks and the teacher exemption consistently to reads and writes.
- Return optional, typed carry-forward and editing-lock metadata tailored to the requesting role. Preserve existing routes, saved-answer fields, request formats, and compatibility fields.
- Keep parent mark visibility and all eight permissions intact; hidden sources receive neutral restrictions without exposing answers or teacher details. Parents remain limited to permitted home questions and open section-period editing windows.
- Update website parent/teacher controls and native home-observation rendering/submission. Distinguish an inherited answer lock from an already-saved observation lock so inherited questions remain visible and submittable. Include inherited-only answers in explicit saves without counting them as saved beforehand.
- Preserve conflicting local drafts until a confirmed save. Prevent old drafts from bypassing required locks while retaining revision-safe cleanup, attribution, assessment-date ordering, and existing teacher-only offline replay restrictions. Parent submissions remain manual-only.
- Update current context guidance, native-app documentation, and affected operational rules when behavior is implemented. Record dated delivery evidence separately in `AI_CONTEXT_HISTORY.md`.
- Review the proposed diff against the existing anti-over-engineering rules: "Did this change introduce unnecessary abstractions, extra state, or new dependencies that existing code already handles?" Add no dependencies or migrations.

## Verification

Executed results (2026-11-16): full backend **587 passed / 697 subtests**;
final affected assessment rerun **55 passed / 36 subtests**; frontend unit
**7 passed**, focused browser **39 passed** across desktop/tablet/mobile;
native **52 passed**; both frontend TypeScript projects and native TypeScript
passed. See `AI_CONTEXT_HISTORY.md` for scope, warnings and the final refinement.
No real-device acceptance or deployment is claimed.

- Test teacher PRE KAYA locking MID/POST for both teacher and parent, and teacher MID KAYA locking POST for both.
- Test unconfirmed parent PRE KAYA on home questions locking parents while permitting teacher corrections in PRE, MID, and POST. Cover the equivalent MID-to-POST exemption.
- Test equal-answer teacher confirmation: the role remains `"parent"`, but the teacher-confirmation date makes the answer a locking source for later periods.
- Test teacher MID DI-KAYA resetting provisional parent PRE carry-forward into unanswered POST, while preserving teacher-confirmed KAYA locks.
- Test explicit correction confirmation, direct API downgrade attempts, home and school questions, unrelated questions, hidden marks, closed windows, existing conflicts, failed saves, and stale responses.
- Verify inherited questions remain visible until confirmed saves, inherited-only submissions work, and draft cleanup removes only matching confirmed revisions/answers.
- Verify unsaved carry-forward leaves scores, dates, exports, and completion counts unchanged.
- Run the isolated backend pytest suite using the project's Python 3.12 environment: `uv run --no-project --python .venv312 python -m pytest backend/tests -q`. Verify test database isolation before running database-backed tests.
- Run relevant frontend unit tests, focused assessment browser tests with an explicit existing configuration, and both TypeScript projects: `pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json` and `pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json`.
- Inside `mobile/parent-native-android`, run `pnpm.cmd exec tsc --noEmit` and `pnpm.cmd test`.
- Report actual results and unavailable checks separately. Check native controls on Android before claiming real-device acceptance.

### Prior baseline evidence

Checks executed on 2026-11-16 against the existing implementation before this revision:

- `uv run --no-project --python .venv312 python -m pytest backend/tests/test_batch1_updates.py -q`: **12 passed**, with 12 subtests passed and one collection warning.
- `pnpm.cmd --dir mobile/parent-native-android test`: **45 passed**.

These checks establish the prior baseline, not implementation or verification of the revised rule. Production and real-device behavior were not tested. Saving this revised plan did not rerun those checks.

## Boundaries

- Do **not** call Render, Vercel, or Supabase tools.
- No database schema changes, migrations, automatic historical cleanup, deployment, or APK release are included.
- Preserve existing authentication, parent visibility, manual submission, and offline durability contracts.
