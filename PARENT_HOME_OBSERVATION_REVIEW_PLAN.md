# Parent Home-Observation Review and Unsure Option

Status: Proposed implementation plan; not implemented or deployed.

## Summary

Add a teacher review step for **new** parent home observations. Parents submit KAYA, DI-KAYA, or Unsure; only teacher-accepted observations enter assessment records.

This can preserve existing assessments, scoring rules, exports, and predictions through separate pending storage and targeted compatibility checks. Compatibility must be demonstrated through tests before deployment.

## Parent and teacher behavior

- Parents see **Unsure** beside KAYA/DI-KAYA. Submission saves observations and their original submission timestamps into pending storage, with the message **“Submitted — awaiting teacher review.”**
- Submitted questions remain locked for parents, including declined questions. Parents may still submit other unanswered questions when permissions and editing windows permit.
- Add **Pending Home-Based Assessments** with a pending-question count to the teacher ECCD page.
- Open a responsive, scrollable MUI dialog with student and PRE/MID/POST selectors. List only students with pending submissions in the teacher’s current section.
- Group submitted questions by domain, preserving domain/question order. Display the parent’s response and Philippine-time submission date.
- Provide individual **Accept / Decline** decisions and **Accept all in this domain**. Bulk acceptance skips Unsure responses and questions already explicitly declined.
- Unsure requires the teacher to assess the skill and choose KAYA or DI-KAYA before accepting. It cannot become an official third answer.
- **Save Review** saves explicitly chosen decisions; undecided questions remain pending. Closing or switching selections preserves unsaved review decisions locally.
- Pending questions show neither official answer selected in the regular checklist, with an explanatory pending/unsure badge. They must be reviewed before ordinary teacher entry for those questions.

## Storage, dates, and API changes

- Add one `parent_home_observations` table through explicit migration 021. Store student/question/period, original parent response, parent identity, submission timestamp, pending/accepted/declined status, reviewer identity/time, and any teacher-resolved answer. Enforce one submission per student/question/period.
- Keep the existing official answer enum strictly **KAYA / DI-KAYA**. Pending and declined observations never contribute to assessment counts, grading, mastery, carry-over, ML inputs, or workbook/PDF marks.
- On acceptance, transactionally create the corresponding assessment record with the original parent identity and submission date. Accepted concrete parent answers retain parent attribution; teacher-resolved Unsure answers have teacher attribution and the actual teacher save timestamp.
- **Save Review does not assign an official teacher assessment date.** The regular ECCD Save continues to do that under existing date-order rules. Accepted observations can contribute to existing grading previews; ML still requires complete official-domain answers and a teacher-confirmed PRE date.
- Decline creates no assessment answer or assessment date. Preserve the original submission and review history separately; the teacher subsequently answers through the regular checklist.
- Extend `POST /api/eccd/parent/evaluate` to accept the parent-only Unsure value and return pending status. Preserve existing route paths and identifier aliases.
- Add typed endpoints to list pending student/period groups, fetch their domain-grouped observations, and save per-observation review decisions. Add separate observation/status metadata to assessment responses without changing existing answer fields.
- Keep parent status visibility owner-scoped. Existing marks permissions still control visibility of teacher answers, including resolutions of Unsure.

## Compatibility and safeguards

- Preserve all existing assessment rows, dates, and attribution. Apply review requirements only to future submissions.
- Preserve current family-link, home-question, editing-window, adviser ownership, and completed-PRE mastery restrictions.
- Pending work follows the student’s current adviser after transfers. Closing parent editing does not prevent the authorized teacher from reviewing submissions already received.
- Lock and validate review batches before writing. Identical submission/review retries are harmless; conflicting or stale decisions return a clear conflict without partial writes.
- Block ordinary assessment saves and workbook-import marks targeting pending questions. Imports report the affected student through their existing per-student error handling; unrelated students can continue importing.
- Preserve every existing parent/teacher draft. Review decisions use owner/student/period-scoped durable drafts and manual online submission; never extend automatic offline replay to reviews.
- Include observations in encrypted backup/restore, accepting older backups with an empty observation collection. Restrict direct public database access using [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Reuse existing assessment utilities, MUI components, and draft storage. Add no dependencies or general approval framework.

## Verification and rollout

- Test all three parent responses, partial submissions/reviews, domain bulk acceptance, decline-and-teacher-entry, timestamp preservation, duplicate requests, stale tabs, and multiple linked parents.
- Verify pending/declined observations cannot affect scores, readiness, mastery, carry-over, progress counts, or exports. Test acceptance and subsequent ordinary teacher confirmation separately.
- Cover transfers, permission changes, archived students, conflicting offline drafts/imports, old/new backups, and unchanged historical assessments.
- Exercise reload/network failure and desktop/tablet/mobile dialogs using explicit Playwright configurations; run backend tests and both frontend TypeScript projects.
- Update AI_CONTEXT.md, relevant AGENTS.md rules, migration guidance, and dated verification history.
- Roll out with a protected backup, stopped API writers, explicit migration `--check → --apply → --check`, and coordinated backend/frontend deployment. Startup checks the migration and never applies it automatically. Do not restore an older backend that bypasses pending review once new submissions exist.

**Acceptance criterion:** no new parent observation becomes an assessment answer until explicitly accepted, while existing assessments and durable drafts remain preserved.
