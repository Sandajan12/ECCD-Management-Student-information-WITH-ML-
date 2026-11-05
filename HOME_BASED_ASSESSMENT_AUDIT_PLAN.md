# Accurate dates for home-based assessments

Date: November 4, 2026  
Status: Implemented November 4, 2026. The audit findings below describe the
pre-implementation behavior. Parent offline handling follows
`TEACHER_ECCD_OFFLINE_SCOPE_PLAN.md`: retain drafts and submit manually online.

## Audit result

**The current behavior does not fully match the desired logic.**

- Each question has its own database record per testing period, but parent saves resend previously answered questions and replace their submission timestamps. The audit reproduced two November 4 answers becoming November 5 answers during the next save.
- Parents can currently change saved answers, and Save has no confirmation modal.
- Teacher saves include displayed parent answers. Even without changing a mark, saving changes those questions to teacher-assessed and replaces their active assessment dates. The original parent timestamp remains stored.
- The teacher's question data currently includes the parent tag but no per-question date.

These behaviors come from:

- [Parent submission logic](frontend/src/hooks/useParentAssessment.ts)
- [Teacher submission logic](frontend/src/hooks/useTeacherAssessment.ts)
- [Backend saving logic](backend/utils/assessments.py)

## Agreed behavior

- **Parent saves:** Each home question can be saved once per PRE, MID, or POST period. Any existing answer locks that question for all linked parents. Remaining unanswered questions stay available.
- **Independent dates:** Questions saved together share that save date. Questions saved tomorrow receive tomorrow's date without changing earlier answers or dates.
- **Confirmation:** Keep the parent overview design. Add a confirmation dialog explaining that submitted answers cannot be changed by parents. Cancel preserves the draft.
- **Teacher agreement:** Saving a domain confirms displayed parent answers for official completion while preserving their parent attribution and date.
- **Teacher correction:** Only an intentional change to the saved KAYA/DI-KAYA answer changes its active attribution. Show the actual teacher correction save date and retain the original parent date as labeled history. Switching away and back before saving does not count as a correction.
- **Date rules:** Display save dates in Philippine time. Offline submissions receive the date of their first successful server save.
- **Age and grades:** Preserve current behavior: the official teacher assessment date takes priority; before teacher confirmation, the earliest parent submission supplies the grading fallback.

## Implementation

- Enforce parent question locks in the backend transaction, using the existing student lock. Submit only unanswered home questions from the frontend; saved server answers take precedence over stale drafts.
- Make identical retries from the original parent harmless without updating timestamps. Reject conflicting submissions with HTTP 409 before any writes; preserve drafts and refresh the saved state.
- Add a nullable `teacher_marked_at` timestamp for actual home-question teacher saves/corrections. Keep it separate from the existing official teacher assessment date so later domain saves cannot change the displayed correction date.
- Add an explicit edited-question list to teacher save requests. Unchanged parent answers receive official teacher confirmation without losing parent provenance. Stale, conflicting answers without explicit edit intent return HTTP 409.
- Extend typed question responses with period-specific parent timestamps, teacher save timestamps, and parent lock status. Mask timestamps alongside the corresponding answers; lock status must not expose hidden marks.
- Display `Parent Assessed · Nov 4, 2026`. After correction, display `Teacher Assessed · Nov 6, 2026` with `Parent submitted · Nov 4, 2026` as history.
- Update the explicit migration inventory, startup/bootstrap checks, backup schemas, and workbook import handling for the new timestamp. Preserve official workbook dates, scoring formulas, permissions, and PRE mastery rules.
- Retain owner-scoped drafts, reconnect synchronization, and revision-safe clearing only after HTTP 200/201. Review the diff for unnecessary abstractions, state, or dependencies.

## Verification and limits

- Test two questions saved today and two tomorrow; earlier timestamps must remain unchanged.
- Test parent locks across reloads, linked parents, teacher-first answers, and separate testing periods.
- Test confirmation cancellation, offline synchronization, duplicate retries, conflicts, and newer drafts surviving older responses.
- Test unchanged teacher confirmation, one-question correction, reverted edits, stale teacher requests, and later saves preserving question dates.
- Verify Philippine midnight boundaries, permission masking, completion, decimal age, scores, exports, and backup round trips.
- Run both required frontend TypeScript checks and browser coverage at mobile, tablet, and desktop sizes using explicit configurations.

**Audit validation:** 22 existing backend date/lifecycle tests passed, plus the disposable-database reproduction. No application source files were changed during the audit. Previously overwritten dates cannot be reconstructed reliably; historical teacher save timestamps will remain unknown rather than being invented.

## Implementation verification (November 4, 2026)

- App and tooling TypeScript checks, changed browser-suite typing, frontend lint,
  production build, formatting and whitespace checks pass.
- 33 parent browser cases and 22 teacher/replay cases pass, including manual
  online submission, confirmation cancellation, locked rows, stale requests,
  revision preservation, Philippine dates and compact attribution/history.
- Seven new backend regressions pass against disposable PostgreSQL schemas,
  including repeated startup, backups and workbook timestamp comments.
- The full backend run completed with 493 passing and four failing cases.
  Three obsolete expectations were updated for no-op audits, transactional
  startup and preserved dates. The failed-case rerun passed eight cases and
  retained only the documented staff LRN masking failure outside this scope.
- No live assessment records or existing historical timestamps were rewritten.
