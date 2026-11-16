# Parent Home-Observation Review, Partial Submissions, and Optional Photos

Updated: **2026-11-16**

Status: **Implemented in local source on `feat/parent-native-android`; no deployment or APK build.**

Confirmed implementation choices: private Supabase Storage accessed only by
FastAPI, `HOME_OBSERVATION_PHOTO_BUCKET=home-observation-proofs`, server-only
`SUPABASE_STORAGE_URL` / `SUPABASE_STORAGE_SERVICE_KEY`, and an injected in-memory
test adapter. Native uses pinned `react-native-image-picker` 8.3.0 system library
selection with local URI metadata only. Migration 021 is authorized/verified on
loopback `ames_parity_dev` and disposable test schemas only. Startup checks all
required schema without auto-applying migrations. Storage provisioning,
credentials, hourly cleanup scheduling and real Android acceptance remain
operational prerequisites; no remote infrastructure tools were called.

Baseline: current `feat/parent-native-android` source and
[ECCD assessment rules audit](ECCD_ASSESSMENT_RULES_AUDIT.md).

## 1. Scope and decisions

Apply teacher review to **new** parent home observations on the responsive
parent website and `mobile/parent-native-android`. Keep teacher review responsive
on desktop, tablet, and mobile.

- Offer only **KAYA / DI-KAYA**. Remove the proposed third answer entirely.
  Unanswered means no submitted answer, never DI-KAYA by default.
- Allow submission of **one or more answered questions**, without finishing a
  domain or all home questions. Parents can submit the remaining questions later.
- Store new submissions as pending; only explicit acceptance creates assessment
  records. Apply review requirements only to future submissions.
- Allow one **optional photo per submitted question**, according to section 4.
  Missing photos never block submission or acceptance.
- Delete photos from active storage after committed teacher acceptance. The
  approved cleanup policy also deletes photos after committed decline, since
  review is finished. Keep answers, provenance, and review history.
- Preserve historical assessments and every existing durable draft.

This revision supersedes the previous version of this file. The rules below are
the implementation contract; executed checks and limits are in AI_CONTEXT_HISTORY.md.

## 2. Preserve the current ECCD flow

### Saved KAYA, drafts, and corrections

- Saved teacher-marked or teacher-confirmed PRE KAYA prefills and locks MID/POST
  as KAYA for teachers and parents. Saved MID KAYA locks POST likewise.
- Inherited later answers remain **`draft-not save`** until that later period is
  explicitly submitted. Loading, refreshing, or accepting PRE never creates
  MID/POST records or changes their dates or completion counts.
- Historical unconfirmed parent home KAYA retains the teacher exemption:
  parents cannot downgrade inherited KAYA, but teachers can correct the parent
  source with the existing correction confirmation and provenance rules.
- Correcting an earlier KAYA to DI-KAYA removes inheritance from that source for
  unanswered later periods, unless another saved KAYA supplies the lock.
- **Keep already-saved MID/POST answers**, as confirmed in the audit. Correct
  them separately; never automatically delete or reopen them.
- New pending/declined observations supply **no carry-forward source**. A local
  KAYA selection or submission awaiting review does not establish mastery.

### Teacher acceptance versus the official testing date

Explicit teacher acceptance of new parent KAYA confirms that answer for
carry-forward: accepted PRE KAYA locks MID/POST, and accepted MID KAYA locks
POST. Acceptance alone never saves those later answers.

Preserve parent evaluator attribution, `parent_id`, and original submission time
on accepted assessment records. Store reviewer identity/time in the review
record. Extend the shared carry resolver and write guards to recognize a linked
accepted review as confirmation of the **current matching assessment answer**.
Never derive confirmation from a pending response or a stale review whose
accepted answer was subsequently corrected.

**Save Review does not assign an official teacher testing date.** Regular ECCD
Save still records that date under PRE < MID < POST validation. Do not fabricate
dates or change parent attribution merely to establish a lock. Corrections to an
accepted question itself retain parent-history confirmation and any independent
earlier confirmed KAYA restrictions.

This is a required implementation change: the current resolver recognizes teacher
attribution or an official teacher date, and has no pending-review confirmation.

### Gates, scoring, and dates

- Preserve eligible synced-family access, all eight adviser permissions,
  home-only checks, per-question locks, and section period editing windows.
- Parents remain independent of classmates' completion. Regular teacher MID/POST
  entry and saves retain section-wide PRE/MID prerequisites.
- Teachers may review existing pending submissions after a parent window closes.
  Review cannot complete a prerequisite without every required saved indicator
  and its official teacher date, or bypass regular teacher assessment gates.
- Pending/declined observations and virtual inheritance never affect scores,
  saved completion counts, dates, mastery, ML readiness/features, or exports.
  Display pending-review counts separately.
- Accepted answers may contribute to existing grading previews. Preserve scoring
  formulas and date fallbacks; ML still requires complete official-domain PRE
  answers and an official teacher-confirmed PRE date.

## 3. Parent partial submissions

1. Display eligible unanswered home questions with KAYA / DI-KAYA and an optional
   photo where allowed. Select nothing by default except valid inherited KAYA.
2. Submit only the selected subset for one child and period. Require at least
   one answer, not a completed domain/checklist. Include inherited KAYA only in
   an explicitly confirmed submission. A photo alone cannot submit an answer.
3. Confirm the exact question count. Save to pending storage; show
   **Submitted — awaiting teacher review** only after HTTP 200/201 confirmation.
4. Lock submitted questions for parents, including declined ones. Keep other
   questions available and preserve their answer/photo drafts.
5. Allow later manual submissions while permissions/windows permit. Never replay
   parent answers/photos or automatically submit inherited answers.

Later inherited KAYA also requires explicit submission and review under this
proposal, without a new photo. Existing saved assessment rows keep their current
saved/locked behavior.

## 4. Optional photo visibility

Compute eligibility **per question and period** from server carry-forward
metadata, not local selections. Preserve hidden-mark protection.

| Parent assessment row | Photo field |
| --- | --- |
| PRE, eligible and not submitted | Visible, optional |
| MID, earlier accepted/teacher-confirmed PRE KAYA | Hidden; inherited KAYA is locked |
| MID, PRE DI-KAYA and no other KAYA source | Visible, optional |
| POST, accepted/teacher-confirmed KAYA in PRE or MID | Hidden; inherited KAYA is locked |
| POST, PRE and MID DI-KAYA with no KAYA source | Visible, optional |
| No earlier saved answer, or only pending/declined earlier responses | Visible, optional, if the row is otherwise editable |
| Historical parent KAYA supplies an existing parent carry lock | Hidden; preserve that lock |
| Current row already submitted/saved, or access restricts it | No editable photo field |

Unanswered earlier periods do not introduce another gate: partial submissions
remain possible in the current permitted period. Current-period KAYA selection
does not itself hide the field; an applicable earlier saved source does.

If correction removes the only earlier KAYA source, optional upload becomes
available again for **unsubmitted** later rows. Keep saved/pending later responses
intact. An earlier review must not silently alter a later pending submission or
delete its evidence before its own review.

Revalidate on submission. If a new earlier acceptance makes a draft photo
unnecessary, return a clear refresh/conflict response without discarding work.
Hiding the field never silently deletes a local photo draft: offer removal or
clean only the exact revision after confirmed submission. Restricted carry
metadata must not reveal unreleased marks.

## 5. Photo storage and deletion

### Storage

The reviewed assessment source has no home-observation photo upload/storage
pipeline; this is new implementation work. Use private persistent object storage
with only an opaque reference and lifecycle metadata in pending storage. Keep
image bytes/base64 out of assessment/database rows, public URLs, logs, exports,
and encrypted school-record backups.

Use the approved private Supabase bucket and server-side HTTP adapter; this task
does not provision or contact remote storage. Do not rely on an ephemeral API
server filesystem. Pending images still consume file-storage capacity even though they
do not similarly enlarge the relational database.

Enforce 5 MiB input size, 8192 pixels per side and 20 megapixels, validate actual
JPEG/PNG/WebP MIME/content, and strip metadata by encoding a fresh JPEG within
2048 pixels. Generate no thumbnails or variants. Authorize upload/read/delete against
the current observation/student ownership. Restrict evidence to the submitting
parent and authorized reviewer, with authenticated private/no-store delivery.
Never authorize deletion from an arbitrary client-supplied object key.

### Cleanup after saved review

1. The teacher explicitly clicks **Save Review** with Accept or Decline selected.
   Selecting a button, switching a student, or closing the modal deletes nothing.
2. Validate and commit the review and accepted answer first. Mark its photo for
   deletion in the same database transaction.
3. Revoke application read access immediately, then delete the original file
   and every generated thumbnail/variant.
4. After confirmed storage deletion, clear the object reference and retain only
   non-image answer, provenance, review, and deletion metadata.
5. On failure, retain durable cleanup-pending state and retry idempotently using
   an existing worker, if available, or a small scheduled cleanup command. Surface
   failures; never claim physical deletion before storage confirms it. Cleanup
   failure does not undo an accepted answer.

The database and file store do not share one atomic transaction. Commit-first,
retryable cleanup prevents evidence loss on rejected review saves and survives
process crashes. Review retries must not recreate deleted photos.

Run `backend.scripts.cleanup_home_photos` hourly. Clean unattached temporary uploads
after 24 hours; student/question removal also makes objects cleanup-eligible. Submitted
still-pending evidence is not abandoned and remains until review unless another
retention rule is approved. Observation/student deletion must also queue cleanup.

**Complete removal means removal from active application-managed originals,
variants, and temporary copies.** Configure storage versioning/retention so old
versions do not persist indefinitely. App deletion cannot immediately erase
provider backups or copies downloaded onto personal devices. Confirm and disclose
provider retention; do not promise instant deletion from every backup. Completed
review photos cannot be inspected again; the non-image review history remains.

## 6. Teacher review UI

- Add **Pending Home-Based Assessments** with a pending-question count to teacher
  ECCD Management. Use a responsive, scrollable MUI dialog with student and
  PRE/MID/POST selectors; list current-section students with pending submissions.
- Group by existing domain/question order. Show KAYA / DI-KAYA, Philippine-time
  submission timestamp, and an optional private photo preview. Missing photos
  never require proof or prevent acceptance.
- Provide individual **Accept / Decline**, plus **Accept all in this domain**.
  Bulk acceptance skips explicit declines. There is no third response to resolve.
  Preserve earlier confirmed KAYA restrictions in backend review guards.
- **Save Review** commits only chosen decisions. Undecided questions/photos
  remain pending; closing/switching preserves unsaved review decisions locally.
- Pending questions show neither official answer selected in the regular
  checklist, with a pending badge. Block ordinary saves/imports for those questions.
- Decline creates no assessment answer/date. Teachers subsequently assess through
  the regular checklist using existing gates and date rules.

## 7. Storage, APIs, and safeguards

- Add `parent_home_observations` through explicit migration **021**. Store student/question/period, original KAYA or
  DI-KAYA, parent/submission time, review status/reviewer/time, accepted-evaluation
  linkage, optional photo reference, and durable deletion state. Enforce one
  submission per student/question/period.
- **This implementation requires migration 021**, verified locally only. Existing carry-forward/section gates remain migration-free; do not call
  the new pending table a schema-free change.
- Keep the official answer enum KAYA / DI-KAYA. Acceptance transactionally creates
  the matching assessment row with parent attribution and original submission
  time; never silently overwrite a conflicting existing answer.
- Preserve `POST /api/eccd/parent/evaluate` and identifier aliases. Extend typed
  contracts for per-question pending statuses; add narrowly scoped authenticated
  photo and pending-list/detail/review endpoints. Define compatibility with older
  native clients before implementation.
- Add separate observation/review/photo-eligibility metadata to reads. Never put
  pending answers into saved-answer fields or expose another parent's evidence.
- Validate and lock whole review batches before writes. Reject stale decisions,
  mismatched photo ownership, illegal downgrades, and changed retries without
  partial assessment writes. Identical retries retain original author/time.
- Pending work follows the student's current adviser after transfers. Preserve
  eight permission gates, marks masking, release rules, and archived-student checks.
- Workbook imports report pending conflicts per student; unrelated students may
  continue importing. Refresh AST callers before modifying shared helpers.
- Keep owner/student/period-scoped, revision-safe drafts for web/native and review
  decisions. Confirmed submissions clean only matching submitted answers/files;
  unsubmitted/newer work survives. Reviews/photos never enter ECCD auto-replay.
- Include observation/review metadata in encrypted backup/restore; old backups
  default to an empty collection. Exclude image bytes. Reconcile restored file
  references without restoring object keys; preserve the live deletion ledger,
  revoke image availability and queue remaining objects for cleanup. Never resurrect deleted
  evidence. Missing pending photos show as unavailable without deleting answers.
  Restrict direct public database access under the existing deny-by-default policy.
- Reuse existing helpers, MUI, drafts/file facilities, and native services. Avoid
  a general approval framework; confirm any unavoidable native photo-picker or
  storage dependency before adding it.

## 8. Implementation and verification

1. Recheck routes/models/schemas, AST freshness, imports/replay, both clients,
   backups, and migration inventory. Confirm storage, formats/limits, retention,
   and cleanup scheduling before implementing photos.
2. Implement pending/review storage, typed contracts, photo lifecycle, transactional
   acceptance, matching-review carry confirmation, and write guards.
3. Update responsive teacher/parent web and native flows together. Distinguish
   pending/saved/draft, allow partial submissions, and share server eligibility.
4. Add tests, run the suites below, then review the diff for unnecessary state,
   abstractions, and dependencies. Update AI_CONTEXT.md, affected AGENTS.md rules,
   native/migration docs, and dated verification history after implementation.

Required tests:

- Two answers only; third-value rejection; one-question/partial-domain submission;
  remaining questions later; empty rejection; photo alone creates no answer.
- Historical teacher exemption; accepted PRE/MID KAYA locks with parent attribution
  and no fabricated official testing date; unchanged section prerequisites.
- Corrections remove only virtual inheritance; saved/pending later answers remain;
  independent saved MID KAYA still carries into POST.
- Pending/declined/photos do not affect scores, dates, counts, readiness, exports;
  acceptance and ordinary testing-date confirmation are tested separately.
- Every photo-visibility case on web/native, including unanswered history, current
  KAYA after earlier DI-KAYA, hidden marks, corrections, and stale clients.
- No-photo submission/acceptance; invalid/oversized/unauthorized uploads; other
  parents' references; partial saves preserving all unrelated drafts.
- Committed versus selected review decisions; undecided evidence retained;
  original/variant deletion; failure/retry/crash; duplicate reviews; orphan cleanup;
  restore cannot resurrect finalized images.
- Transfers, permissions, archives, multiple parents, concurrent tabs, imports,
  old/new backups, historical records, and old native-client compatibility.
- Reload/network failure/reconnection preserves work and never automatically
  submits parent answers/photos or teacher review decisions.

Required implementation checks (dated results are recorded separately in history):

```powershell
# Confirm isolated loopback test database before backend integration tests.
uv run --no-project --python .venv312 python -m pytest backend/tests -q
pnpm.cmd --dir frontend exec node --experimental-transform-types --test tests/unit/eccdDrafts.unit.ts
pnpm.cmd --dir frontend exec playwright test --config playwright.parent-assessment.config.ts
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir mobile/parent-native-android exec tsc --noEmit
pnpm.cmd --dir mobile/parent-native-android test
```

Extend the relevant suites for review/photos. Exercise desktop, tablet, narrow
mobile web, and real Android photo selection/upload. Native unit tests or a signed
APK alone do not establish real-device or production authentication acceptance.

## 9. Rollout boundaries

Keep work local on `feat/parent-native-android`; leave `mobile/parent-android`
untouched. No main checkout/merge/push or remote infrastructure tools. The user
authorized source implementation, the native picker dependency and local-only
migration 021 verification; no remote migration, bucket provisioning, deployment
or APK build is authorized in this task.

Hosted migration/storage/deployment work still needs explicit authorization. Roll out
with a protected backup, stopped API writers, explicit migration
`--check → --apply → --check`, private storage, verified cleanup retries, and
coordinated backend/frontend/native compatibility. Startup checks but never
auto-applies the migration. Do not restore a backend that bypasses review after
new pending submissions exist.

**Acceptance criterion:** parents manually submit any answered subset with two
answer choices and optional photos only where needed; only accepted observations
become assessment records; accepted earlier KAYA supplies locked, unsaved later
KAYA without new proof; finalized photos are removed from active storage through
retryable cleanup; existing assessments, dates, gates, and drafts are preserved.
