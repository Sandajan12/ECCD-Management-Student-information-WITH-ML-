# AMES System Understanding

Prepared: **2026-11-08**. Source baseline: **c3261e8**.

This file consolidates my understanding of the current AMES system for a developer,
maintainer, or project stakeholder. It describes the active implementation and the
business rules that changes must preserve. It is a dated reference, not a replacement
for [AGENTS.md](AGENTS.md), [AI_CONTEXT.md](AI_CONTEXT.md), or current source and tests.
Recheck the relevant implementation when this snapshot becomes older than the code.

Historical notes, experiments, and previous test outcomes in
[AI_CONTEXT_HISTORY.md](AI_CONTEXT_HISTORY.md) provide background. They do not establish
current deployment health, database state, failures, or unfinished work.

## 1. What the system does

AMES supports early childhood student records and DepEd ECCD assessment workflows.
It connects school administration, class advisers, and families around the same
student records while controlling which information each person can see or change.

Its main capabilities are:

- Student enrollment, demographics, guardian information, sections, and archives.
- Teacher accounts, Primary Adviser assignments, handovers, and student transfers.
- PRE, MID, and POST ECCD assessments with teacher marks and parent home observations.
- Deterministic official scoring, progress views, and scoped school dashboards.
- Independent parent permissions for information, scores, marks, editing, and predictions.
- Excel imports, individual checklists, section summaries, and ZIP downloads.
- Teacher-parent messaging, audit logs, school settings, school-year rollover and undo.
- Encrypted school-data backup and restore.
- Educational research predictions and suggested activities based on PRE data.
- Durable device drafts that protect unsaved work during network and session failures.

Official assessment results and research predictions are separate. A prediction does
not replace an ECCD score, create an official evaluation, or establish a diagnosis.

## 2. Architecture and request flow

The Node.js-to-Python and JavaScript-to-TypeScript migration is complete. The active
application is in `backend/` and `frontend/`; removed legacy folders are not needed.

| Area | Current implementation |
| --- | --- |
| Backend runtime | Python 3.12, FastAPI, Uvicorn |
| Validation | Pydantic V2 request and response schemas |
| Persistence | SQLAlchemy 2 ORM, synchronous PostgreSQL sessions through psycopg2 |
| Authentication | JWT, bcrypt, email OTP challenges, remembered devices |
| Realtime | Socket.IO alongside HTTP APIs |
| Frontend | React 19, TypeScript 6, React Router 7, Vite 8 |
| Frontend services | Axios, Socket.IO client, Recharts |
| UI | MUI 9, Emotion, Tailwind CSS 4, scoped CSS, native elements, Poppins |
| Workbooks | openpyxl for active Excel import/export; pandas is also installed |
| ML | Cached sigmoid-calibrated standalone Random Forest loaded through joblib |
| Tooling | uv for Python; pnpm 12.11.2 for the JavaScript workspace |

These major versions describe the inspected manifests. Exact versions and dependency
overrides belong to the current requirements, package manifests, and lockfiles.

The ordinary data path is:

```text
React page / hook
  -> shared Axios service
  -> FastAPI route and Pydantic validation
  -> session, role, ownership, and permission checks
  -> domain utilities and SQLAlchemy session
  -> PostgreSQL transaction
  -> response contract
  -> UI refresh and revision-safe draft confirmation
```

`backend.main:api` is the FastAPI application. `backend.main:app` wraps it with
Socket.IO and security middleware and is the server entrypoint used by Uvicorn.
HTTP persistence is authoritative even when realtime delivery fails.

### Backend ownership

| Location | Responsibility |
| --- | --- |
| `backend/config/` | Environment settings, engine, sessions, database dependency |
| `backend/models/` | ORM entities, relationships, constraints, protected identity |
| `backend/schemas/` | Incoming/outgoing contracts and typed backup documents |
| `backend/routes/` | HTTP handlers, dependencies, and compatibility aliases |
| `backend/utils/` | Access, assessments, scoring, identity, imports/exports, messaging, backups, rollover |
| `backend/migrations/` | Explicit schema transitions and schema checks |
| `backend/ml/` | Inference, research resources, model artifact, and activity guides |
| `backend/tests/` | Active backend tests, including isolated database fixtures |
| `backend/scripts/` | Explicit provisioning and operational/diagnostic utilities |

### Frontend ownership

| Location | Responsibility |
| --- | --- |
| `frontend/src/App.tsx` | Lazy role routes, guards, and route aliases |
| `frontend/src/services/api.ts` | Axios, bearer attachment, downloads, error handling |
| `frontend/src/types.ts` | Shared frontend API/domain contracts |
| `frontend/src/context/` | Authentication, settings, teacher sections, messaging |
| `frontend/src/hooks/` | Assessment flows, child selection, profiles, loading |
| `frontend/src/pages/` | Chairman, teacher, parent, and authentication screens |
| `frontend/src/layouts/` | Portal shells and navigation |
| `frontend/src/components/` | Shared UI, forms, checklist, chat, sync feedback |
| `frontend/src/utils/` | Durable drafts, file storage, credential drafts, display helpers |
| `frontend/tests/` | Browser tests selected through explicit Playwright configurations |

Teacher and parent layouts apply the MUI theme. `TeacherLayout` wraps `MainLayout`;
`MainLayout` owns shared navigation, including the permission-gated ECCD Questions
item. Existing native/Tailwind components are part of the current architecture.

## 3. People, roles, and ownership

| Person | Backend role | Main frontend route prefix | Responsibility |
| --- | --- | --- | --- |
| Chairman | `super-admin` | `/super-admin/` | School administration, teachers, sections, records, configuration, audit, backups |
| Teacher | `admin` | `/teacher/` | Assigned students, assessments, parent permissions, communication, research insights |
| Parent | `user` | `/parent/` | Eligible linked children, permitted information, home observations, communication |

Frontend guards also recognize descriptive role aliases. Existing Chairman redirects
and API aliases remain compatibility contracts.

### Primary Adviser rules

- `section_teachers` is the normalized ownership junction; the only accepted role
  is `Primary Adviser`, with `Active` or `Inactive` status.
- Each section has at most one active adviser. Assignment operations enforce one
  active section per teacher; the database also uniquely constrains active section ownership.
- Moving an incoming teacher retires their previous assignments and clears old
  section adviser pointers.
- A handover retires the displaced adviser. If they have no other active assignment,
  their account is deactivated and credentials are revoked.
- Restoring an account does not silently restore section ownership; reassignment is explicit.
- Assignment changes preserve students, evaluations, family links, and editing windows.
- Student transfers change section membership without deleting assessment history.
- Cached section pointers and historical assignments cannot grant parent access.
- Retired Substitute/OJT roles cannot be accepted or grant access.

Shared assignment operations serialize ownership changes and record audit metadata.
The route transaction commits the assignment and associated audit together.

## 4. Relational model and protected student identity

| Entity | Meaning and important contracts |
| --- | --- |
| `users` | Email-based account, password hash, role, active/pending/first-login state, credential security version |
| `teachers` | Teacher profile, optional employee ID, eight parent permissions, separate question-management flag |
| `parents` | Guardian profile; guardian-only records may exist without login accounts |
| `sections` | Class section, adviser compatibility pointer, PRE/MID/POST parent-editing windows |
| `section_teachers` | Adviser assignment history and active ownership |
| `students` | Integer ID, protected optional LRN, demographics, section, school year, active state |
| `family_access` | Parent/student relationship with `PENDING` or `SYNCED` status |
| `eccd_domains` | Assessment domains; IDs 1–7 are the official domains |
| `eccd_questions` | Domain, text, sequence, home-based flag; unique domain/sequence pair |
| `student_eccd_evaluations` | One answer per student/question/period, teacher and parent provenance, dates |
| `messages` | Teacher-parent messages, read/archive state, timestamps |
| `system_logs` | Audit events, structured details, rollover snapshots |
| `system_settings` | Singleton branding, school leadership names, school year, opening month |
| `email_verifications` | Hashed account/email/purpose-bound OTP challenges |
| `user_trusted_devices` | Hashed remembered-device tokens and expiry |

### LRN protection

`students.student_id` is the integer primary key. Frontend URLs, payload references,
and assessment draft keys use this ID even where a compatibility parameter is named
`student_lrn` or `lrn`.

LRNs are optional for enrollment and authorized staff edits. A supplied LRN requires
exactly 12 ASCII digits. Blank values normalize to null protected fields.

- AES-256-GCM encrypts the LRN.
- HMAC-SHA256 supports exact lookup without a plaintext lookup column.
- A last-four field supports masked display.
- Public/parent responses expose masked values or `Pending`.
- Authorized staff student-detail reads return decrypted `lrn_number` for editing.
- Authorized staff workbook exports decrypt LRNs in memory; absent LRNs stay blank.
- Linking and workbook import matching still require an LRN.
- Compatibility Python properties do not mean plaintext LRN database columns exist.

Never restore plaintext LRN SQL columns or replace existing encryption/HMAC keys
during routine setup. Existing protected data depends on stable keys.

## 5. Authentication and API security

Email is the account identity and is normalized case-insensitively. There is no
current username column. Names for greetings and audit display come from profiles
and school settings.

- Personal passwords require at least eight characters, uppercase/lowercase and a
  number, within bcrypt's 72-byte limit.
- Teacher temporary passwords have their own minimum and require first-login replacement.
- Restricted first-login sessions cannot use ordinary protected APIs or chat.
- JWT access checks consult current credentials and persistent security version.
- Inactive/pending accounts cannot use protected services.
- Credential changes, archive/restore, and adviser deactivation revoke previous access.
- OTP challenges are hashed, account/email/purpose-bound, expire after ten minutes,
  and permit five incorrect attempts.
- Remembered-device tokens are hashed and expire after 30 days. Ordinary logout
  preserves device trust; explicit forget-device revokes it.
- Ordinary logout does not introduce a JWT blacklist; copied access tokens remain
  subject to expiry and live credential revocation.
- Browser terms acceptance is required by the UI. Supplied API values are validated;
  omission remains compatible. This is not a persisted consent ledger.

Production rate limits use shared PostgreSQL counters; development counters are
process-local. The documented general API budget is 120 requests/minute and login
aliases share 15 requests/15 minutes. Messaging has separate budgets. Exact current
budgets and alias mapping belong to `backend/utils/rate_limits.py`.

Axios attaches authorization only to the configured API origin. Ordinary requests
have a 60-second timeout; downloads use 120 seconds. Validation responses omit
sensitive submitted values, and unexpected errors return sanitized messages.

## 6. Parent access and family linking

A parent needs a `SYNCED` family link, an active student, and an active Primary
Adviser whose account is active. An unavailable existing child returns HTTP 403;
a deleted/nonexistent student returns HTTP 404. Hiding a child preserves links,
evaluations, and device drafts.

The child inherits these permissions from the eligible adviser:

| Permission | Default | Controls |
| --- | --- | --- |
| `allow_parent_view_student_info` | true | Student-information visibility |
| `allow_parent_view_eccd_pre` | false | Official PRE result release |
| `allow_parent_view_eccd_mid` | false | Official MID result release |
| `allow_parent_view_eccd_post` | false | Official POST result release |
| `allow_parent_view_eccd_marks` | false | Recorded checklist marks and evaluator roles |
| `allow_parent_predictions` | false | Parent research prediction access |
| `allow_parent_edit_student_info` | true | Student-information editing |
| `allow_parent_edit_home_based_eccd` | false | Home-observation editing, also subject to section windows |

`allow_eccd_question_management` is a separate default-false staff permission.
Chairman question writes are allowed unconditionally; teachers need this flag.
Legacy coarse compatibility properties must not become authorization for new features.

### Independent gates

- Unreleased official scores, dates, ages, and progress are null, with
  `is_published=false` and `Pending Adviser Release`.
- A locked latest period cannot fall back to an older released result.
- Marks permission does not release scores or permit editing.
- Without marks permission, only the authenticated parent's own home observations
  may be visible within globally and section-enabled editing windows.
- Home submissions require the global edit permission and the relevant section
  window. Section defaults are PRE enabled, MID disabled, POST disabled.
- Backend HTTP 403 checks enforce locked edits; disabled UI controls supplement them.
- Predictions require their own permission and independent PRE score release.

First account claims without account-link history become `SYNCED`; guardian-only
records do not count as prior claims. Subsequent claims after account-link history
need adviser approval and become `PENDING`. Existing claims block competing accounts,
and identical retries preserve status. Historical evidence can be incomplete; do not
invent claim history when logs or names cannot establish it.

Parent profile updates send changed fields against a saved baseline. Omitted fields
preserve values; explicit null can clear optional details. Guardian names cannot
be cleared, and shared-guardian edits must pass sibling-access checks atomically.

`useChildren` refreshes eligible children every 20 seconds in visible tabs and on
focus, visibility, and reconnection. Selection falls back to an eligible sibling
or an empty state without deleting assessment drafts.

## 7. ECCD assessment lifecycle and official scoring

Periods are `PRE`, `MID`, and `POST`; recorded answers are `KAYA` or `DI-KAYA`.
Evaluations are unique by student, question, and testing period.

### Teacher saves

Teacher batches authorize ownership, lock the student, validate question IDs and
periods, and enforce **PRE < MID < POST** official dates before writes.

- An equal-answer save confirms teacher identity and official assessment date while
  preserving evaluator role and existing teacher-edit timestamp, including parent attribution.
- New or changed marks record teacher provenance and actual server `teacher_marked_at`.
- Changing an answer with parent history requires the question ID in
  `edited_question_ids`; otherwise the batch returns HTTP 409 before writes.
- Parent ID and original parent submission timestamp remain historical provenance.
- Existing teacher-dated rows in the selected period receive the chosen official date.
  Untouched parent-only rows do not acquire an invented official date.

### Parent saves

Parents may submit only permitted home-based questions within open windows.
The whole batch is validated before new rows are written.

- Successful submission locks that question/period observation.
- Identical retries are no-ops preserving the original author and timestamp.
- Changed saved answers conflict with HTTP 409, including another linked parent's attempt.
- Parent observations cannot replace teacher identity or official teacher dates.

### Dates, completion, and carry-over

Philippine-time helpers use UTC+8. The chosen official assessment date, actual
save timestamp, and parent-only display fallback are distinct concepts.
Official testing dates use explicit teacher dates; parent fallback dates do not
confirm an official test. Unknown historical teacher timestamps remain null.

Earlier KAYA answers can virtually prefill unsaved later periods. Completed-PRE
mastery locks corresponding KAYA items for MID/POST; this completion rule checks
teacher dates for every configured question. Later periods still need explicit saves
and dates, and conflicting saved records are not silently rewritten.

### Official score calculation

The official domains are:

| ID | Code | Domain |
| --- | --- | --- |
| 1 | GM | Gross Motor |
| 2 | FM | Fine Motor |
| 3 | SH | Self-Help |
| 4 | RL | Receptive Language |
| 5 | EL | Expressive Language |
| 6 | C | Cognitive |
| 7 | SE | Socio-Emotional |

`backend/eccd_scoring_data.json` and the deterministic scorer define official
conversion, including closest-lower lookup fallback. Age uses elapsed years and
completed months with one-decimal ROUND_HALF_UP at the assessment date.
Roster/profile age instead uses the school-year opening-month baseline where valid,
otherwise today. A static stored age is not authoritative.

The frontend scoring JSON must remain byte-identical to the backend asset.
Custom domains remain supplementary: no invented official domain codes, score dates,
summary header dates, prediction features, or ML readiness requirements.

## 8. Dashboard meaning

Dashboards include several measurements that must not be conflated:

- Parent dashboards choose the latest evaluated period: POST, then MID, then PRE,
  and apply release masking to that selected period.
- Domain rankings use KAYA/recorded-answer ratios with alphabetical tie-breaking.
- `assessmentMastered` requires POST records with zero DI-KAYA; that alone does not
  prove all configured questions were answered.
- Teacher dashboards default to explicit PRE and the active section, without period fallback.
- Teacher completion counts require every configured question to have a teacher date.
- Excellence uses recorded KAYA ratio; critical focus uses recorded DI-KAYA counts.
- Partial and parent-only evaluations remain distinguishable from teacher completion.
- Chairman analytics share validated school-year, section, and period scopes.
- Developmental Summary uses the five official keys: Delay, Slight Delay, Average,
  Slight Advance, Highly Advance; UI wording can expand Advancement.

Recorded-item ratios, official scaled/standard scores, completion, and research
predictions answer different questions. Support rankings are not diagnoses.

## 9. Questions, Excel imports, and exports

### Question configuration

Creation and cross-domain moves append after the destination domain's highest
sequence under its row lock. Text/home-based edits preserve position and gaps.
Legacy sequence inputs are ignored. Migration 017 uniquely constrains the
domain/sequence pair; existing IDs and evaluation references must remain stable.

### Workbook import

The importer accepts `.xlsx` with an `Info Sheet` and official-domain tabs,
matching LRNs, domain names, and question order. It handles Excel date epochs.
Each student's demographics, guardians, and evaluations commit together; invalid
students roll back independently while successful students remain saved.

```json
{ "successCount": 0, "failedCount": 0, "errors": [{ "row": 0, "error": "..." }] }
```

Cross-section updates remain forbidden. A section-name mismatch returns
HTTP 409/`SECTION_MISMATCH` before writes. Confirmed `overwrite_section` bypasses
only the file-name check, never ownership or cross-section protection. Confirmation
binds the file revision and destination section.

Documented limits: 20 MiB upload, 50 MiB expanded ZIP, 128 members, 64 worksheets,
2,000 rows, and 250,000 explicit cells. Reads are bounded to 100 Info Sheet columns
and 256 assessment columns even when workbook dimensions extend farther.

Import is a separate write path; interactive teacher date validation must not be
assumed to run there. CHECKLIST exports are not an established reimport format.
Partial imports retain their workbook and errors for explicit online retry.

### Individual checklist export

The tracked blank template produces one `CHECKLIST` sheet. Standard-domain overflow
and then custom domains append copied native panels of up to 13 questions within
that sheet. Print areas, page breaks, repeated identification, and row heights
support readable output. Answer-cell comments preserve save timestamps.

Custom results report configured counts and KAYA/answered ratios. Unanswered items
are not inferred as DI-KAYA. Supplementary custom results do not need official
assessment dates or birth dates. HTML previews include extended saved content.

### Summary export

The ten base sheets remain `PR`, `M`, `PO`, `GMF`, `FMF`, `SHF`, `RLF`, `ELF`,
`CF`, and `SEF`. Continuations handle overflow and custom domains. Domain sheets
include all genders and numeric 1 for saved K/D marks. Official raw scoring retains
its teacher-date and birth-date requirements.

Cohorts group by section and each student's school year, with at most 30 children
per summary workbook. Multiple workbooks are zipped rather than dropping students.
Year-scoped ZIP/summary exports include active and inactive cohorts. Historical
individual requests direct staff to section ZIP downloads. Ownership is checked
even for empty sections, and absent cohorts return 404.

## 10. Offline durability and device storage

Durability protects inputs across reloads, network loss, session expiry, child
hiding, and access changes. Refetching must not overwrite unsaved values or mix
owners, students, sections, periods, or domains.

| Draft | Key |
| --- | --- |
| Teacher assessment | `eccd_draft_${studentId}_${testingPeriod}_${domainId}_${ownerId}` |
| Parent assessment | `eccd_draft_${studentId}_${testingPeriod}_${domainId}_home_${ownerId}` |
| Generic form | `ames_draft_${ownerId}_${resource}` |

`frontend/src/utils/drafts.ts` tracks owner, values, revision, pending state, and
errors. Only the exact server-confirmed key/revision may be removed. An older
response must never erase newer edits. Never call `localStorage.clear()`.

Automatic replay requires all of the following:

1. An online authenticated teacher session with role `admin`, matching owner ID,
   and a token.
2. A valid teacher ECCD key with matching positive student/domain/owner IDs and
   PRE/MID/POST period; parent `_home_` keys are excluded.
3. Exactly `POST /api/eccd/evaluate`, with payload student ID and period matching
   the key and the pending revision still current.
4. Successful server authorization and HTTP 200/201 before revision-safe cleanup.

Generic API-path validation does not authorize replay. Parent/Chairman sessions,
home observations, messages, profile/settings/link saves, sandbox predictions,
rollover/restore, uploads, and older unrelated queued records need manual online
submission. Do not add a generic background replay worker or purge old queues.

The shared user-facing message is:

> Your draft is saved on this device. Reconnect and submit again.

Credential form drafts use tab-scoped sessionStorage. Selected files use IndexedDB
and survive reload but never automatically upload. Storage-full feedback asks the
user to keep the page open. Logout preserves work drafts.

## 11. Messaging, settings, rollover, and backups

### Messaging

Conversations require active teacher/parent accounts connected through an active
child and active assignment. Socket.IO authenticates with `auth: { token }` and
uses authorized teacher-parent rooms.

HTTP commits are authoritative. Committed messages and exact read receipts push
to currently authorized tabs; transport failure does not reverse a confirmed save.
Each portal tab deduplicates messages and recovers reads through reconnect and
bounded/backed-off HTTP fallback. Failed message writes retain drafts for manual retry.

Realtime push is process-local under the current single-process deployment
assumption. Multiple API processes would require shared event transport; shared
production rate counters are a separate mechanism.

### Settings and rollover

School settings contain branding/images, leadership names, school year, and
opening month, defaulting to August. Enrollment uses the configured year.
The public settings GET can create singleton defaults; it is not guaranteed to
be a side-effect-free database operation.

Rollover archives exactly its active batch and stores transactional snapshots.
Undo is available for 30 days and restores that batch's IDs and original opening
month. It must not globally reactivate unrelated older archives.

### Backups

Chairman-only backup operations use strict typed JSON inside a Fernet `.enc`
envelope. Restore validates keys and relationships before replacing school data,
preserves live users and credentials, clears OTP/device records, restarts school-data
sequences, and commits atomically. Invalid documents abort rather than partially restore.

Existing backup keys remain essential. Do not generate replacement keys to bypass
decryption failure or accept historical SQL/CBC formats as current backups.

## 12. Machine learning: contract and limits

Both portals use `backend/ml/inference.py` and the trusted artifact
`backend/ml/artifacts/rf_post_test_model.joblib`. The loader requires a fitted
sigmoid-calibrated standalone Random Forest. It does not select the historical
hybrid/V2 model. Inference never trains, refits, or writes official assessments.

Verified artifact SHA-256:

```text
1ff4591f0f8e21bbaeb48f5617f61acd460f2953f6609cac52d5f86a6bdcec73
```

The checksum matches the top-level `model_sha256` in `evaluation_metrics.json`.
An authorized artifact replacement requires an API restart to refresh the cache.

### Inputs and outputs

The API retains 18 fields:

| Group | Fields |
| --- | --- |
| Seven PRE scaled scores | `gm_pre_scaled`, `fm_pre_scaled`, `sh_pre_scaled`, `rl_pre_scaled`, `el_pre_scaled`, `cog_pre_scaled`, `se_pre_scaled` |
| PRE composites | `pre_total_scaled`, `pre_standard_score`, `pre_delayed_domains_count` |
| Age | `age_months_pre` |
| Demographics/household | `gender`, `handedness`, `mother_education_level`, `father_education_level`, `household_occupation_tier`, `num_siblings`, `birth_order` |

Five household fields are excluded before estimator preprocessing: both parent
education fields, occupation tier, siblings, and birth order. Their values and
missingness do not affect the estimator. IDs, names, LRNs, MID/POST measurements,
and source labels are not estimator features.

Supported POST classes are Significant Delay, Slight Delay, and Average using
their full developmental interpretation strings. Advanced outcomes are unsupported.

The current guide describes 400 trees, minimum leaf size 3, max_features 0.8,
balanced class weights, seed 42, fold-local preprocessing, and three-fold sigmoid
support-aware calibration. Outside PRE training support, probabilities blend toward
training priors; this is not measured recovery or clinical confidence.

### Readiness and authorization

Student inference requires active ownership, complete configured PRE answers in
official domains 1–7, an explicit teacher-confirmed PRE date, and a valid birth date
before that assessment date. Custom domains cannot block readiness or supply dates,
features, or item positions. This differs from completed-PRE mastery's requirement
for teacher dates on every configured question.

Parent inference additionally requires eligible linked-child access,
`allow_parent_predictions`, and independent PRE release. Disabled/unreleased access
returns 403; incomplete readiness returns 400. Parent responses omit family model
inputs, checklist marks/item numbers, and teacher-only guide details.

Teacher Predict All coordinates bounded individual requests; there is no batch
prediction API or persistent prediction table.

### Sandbox and suggested activities

The sandbox accepts integer age 36–71 months and official raw-count maxima
GM13/FM11/SH27/RL5/EL8/C21/SE24. Server scoring and recomputed composites remain
authoritative; compatible scaled-only input is supported. Raw counts are not an
extra estimator feature. Owner-scoped sandbox drafts survive failures and success;
failed requests need explicit retry.

`prescriptive_guides.json` supplies PRE-based classroom/home activities independently
of predicted class. Scaled scores <=6 or explicit DI-KAYA trigger support. Planning
tiers are <=3 Delay, 4–6 Slight Delay, and >=7 Average. These tiers do not replace
official developmental scores or establish intervention effectiveness.

### Research evidence

The following are recorded results in the current guide, not evaluations rerun
for this document: mixed holdout 423/459 (92.1569%), macro F1 92.1690%, real holdout
3/8, mixed training CV accuracy 88.5981%, shared-anchor student-excluded real 9/29,
and a separate exploratory real-fold result of 13/29.

All 29 real POST labels are Average and informed development/generator anchors;
an always-Average baseline is 29/29. Synthetic class balance is not population
prevalence. Independent real-world validity, real delay sensitivity, clinical
confidence, and intervention effectiveness remain unestablished.

Six approved diagnostic PNGs are tracked and served through a staff-only allowlist
with `no-store`. Requests do not train or generate plots. Parents have no gallery;
missing/unknown assets return sanitized 404s. Private datasets and older experiments
may remain ignored and are not guaranteed in a clean clone.

## 13. Important API surfaces

This is a navigation map, not an exhaustive OpenAPI listing. Preserve existing
paths, compatibility parameter names, request semantics, and response shapes.

| Area | Important routes |
| --- | --- |
| Authentication | `/api/auth/login`, `/api/auth/login-step1`, `/api/auth/verify-otp`, registration, account changes, logout |
| Students | `/api/students/`, `/api/students/{identifier}`, `/api/students/my-child`, link/archive/update aliases |
| Teachers | `/api/teachers/`, `/api/teachers/active`, `/api/teachers/me/access`, settings and linking-management routes |
| Chairman permissions | `PUT /api/chairman/teachers/{teacher_id}/permissions` |
| Transfers | `PUT /api/chairman/students/transfer` |
| Adviser assignment | `POST /api/chairman/sections/{section_id}/assign-teacher`; null teacher unassigns |
| Teacher ECCD | `POST /api/eccd/evaluate`, assessment/domain-progress routes |
| Parent ECCD | `/api/eccd/parent/assessment/{student_lrn}`, `/evaluate`, `/dashboard-stats/{student_lrn}`, `/domains-progress/{student_lrn}` under the parent prefix |
| Question configuration | `/api/eccd-config/` and Chairman ECCD configuration aliases |
| Import | `POST /api/teachers/import-students` |
| Year-scoped exports | `/api/eccd/export/cards-zip`, `/card-single`, `/section-summary` under the export prefix |
| Messaging | `/api/messages/contacts`, `/history`, `/send`, unread/read routes under the messages prefix |
| School operations | `/api/settings`, update, rollover/undo, Chairman aliases |
| Backup | `/api/backup/export`, `/api/backup/restore`, Chairman aliases |
| Teacher ML | `/api/ml/students`, `/api/ml/predict/student/{student_id}`, `/api/ml/predict/sandbox` |
| Parent ML | `/api/ml/parent/readiness/{student_id}`, `/api/ml/parent/predict/{student_id}` |
| Staff plots | `/api/ml/plots/{filename}` |
| Health | `/healthz`, `/api/health`, `/ready` |

Compatibility path names such as `{student_lrn}` do not require callers to send a
plaintext LRN; active frontend references use the integer student ID.

## 14. Startup, migrations, and local operation

Settings load `backend/.env`, with process environment taking precedence. A clone
does not supply private secrets, database contents, or all ignored local resources.
Preserve existing environment files and keys; copy templates only when absent.

### Migration inventory

| Version | Module | Purpose |
| --- | --- | --- |
| 001 | `phase1` | Protected identity foundations, historical intermediate schema |
| 002 | `phase2` | ID-based final schema, plaintext LRN column removal |
| 003 | `parity_batch1` | Wider section/class labels |
| 004 | `parity_batch2` | Indexes and production shared rate-limit storage |
| 005 | `parent_linking` | PENDING/SYNCED links and request timestamps |
| 006 | `parent_assessment_access` | Section-specific editing windows |
| 007 | `eccd_evaluator_tracking` | Parent provenance and official teacher dates |
| 008 | `adviser_takeover` | Adviser-only ownership and unique active section adviser |
| 009 | `parent_eccd_marks` | Independent marks visibility |
| 010 | `parent_predictions` | Independent parent prediction permission |
| 011 | `section_ownership` | Explicit ownership cleanup and pointer synchronization |
| 012 | `auth_security_version` | Persistent credential revocation version |
| 013 | `email_only_identity` | Email identity, username removal, Chairman settings name |
| 014 | `production_performance` | Supporting indexes; explicit maintenance-window upgrade |
| 015 | `optional_student_lrn` | Nullable protected LRN fields |
| 016 | `teacher_marked_at` | Nullable actual teacher-save timestamp, no historical backfill |
| 017 | `eccd_question_sequence` | Unique domain/question sequence index |

Startup checks provenance readiness, transactionally applies only 016, then checks
required schema, including 017. Missing incompatible required schema stops startup.
Migration 014 is optional for startup; 011 remains explicit cleanup. Startup does
not call `create_all` or provision accounts. It conditionally seeds the tracked
7-domain/109-question fixture only when both reference tables are empty, then warms ML.
Unavailable/incompatible model resources leave school workflows available while
prediction endpoints return sanitized 503 responses.

Fresh bootstrap explicitly registers migrations 001–017 and initial Chairman
provisioning. It is not an ordinary startup or documentation-check command.

For an authorized 017 upgrade, stop API writers, run check/apply/check, and review
any duplicate domain/sequence/question IDs. Never delete questions/evaluations or
automatically renumber them to force the upgrade.

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.eccd_question_sequence --check
uv run --no-project --python .venv312 python -m backend.migrations.eccd_question_sequence --apply
uv run --no-project --python .venv312 python -m backend.migrations.eccd_question_sequence --check
```

With PostgreSQL and required schema ready, start these in separate terminals from
the repository root:

```powershell
uv run --no-project --python .venv312 python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000 --env-file backend/.env
pnpm.cmd run frontend
```

The UI defaults to localhost:5173 and API to port 8000. `pnpm.cmd` avoids a blocked
PowerShell launcher. Root `pnpm run dev` calls a backend script using `uvicorn`
from PATH, so it does not guarantee the project's Python environment.
`uv run --no-project` does not install requirements automatically. Do not assume
another environment named `.venv` is Python 3.12, or run destructive dependency
syncs merely to inspect documentation.

## 15. Configuration and deployment boundaries

The tracked deployment target is Vercel frontend, Render backend, Supabase
PostgreSQL, and Brevo HTTPS email. Configuration files describe intended hosting;
they do not establish that those services are currently healthy or deployed.

| Setting group | Important contract |
| --- | --- |
| Database | `DATABASE_URL` takes precedence over `SUPABASE_DB_URL` |
| Runtime | `ENV` takes precedence over `ENVIRONMENT`; default is production |
| JWT | `JWT_SECRET` alias has precedence; strong production secret; HS256 default |
| OTP | Enabled by default; required in production with configured mail delivery |
| Origins | Exact configured HTTP(S) origins; remote production origins require HTTPS |
| Database TLS | Production requires `sslmode=verify-full` and trusted roots |
| Identity keys | Stable `LRN_ENCRYPTION_KEY` and `LRN_HMAC_SECRET` |
| Backup keys | Stable Fernet key; `BACKUP_IV` remains required by settings but unused by current Fernet implementation |
| Email | `EMAIL_TRANSPORT=smtp` or `brevo_api`; credentials remain private |
| Frontend | Public `VITE_API_URL` and optional `VITE_SOCKET_URL` contain backend origin without `/api` |

Render starts `backend.main:app` from the repository root. Vercel builds from
`frontend` and uses SPA rewrites for deep links. Private database, JWT, encryption,
and email credentials must never enter `VITE_*` variables or committed documentation.

Database pool defaults are size 5, overflow 5, timeout 15 seconds, recycle 300 seconds
per API process. Capacity must account for replicas and workers. Pre-ping/recycling
do not make interrupted transactions safe to retry automatically.

`/healthz` and `/api/health` establish liveness. `/ready` checks database readiness,
including access to shared rate-limit storage in production. None alone proves
OTP delivery, full schema acceptance, correct permissions, or end-to-end operation.

## 16. Development and verification rules

Before changing behavior, read the current guidance, inspect Git status, trace the
active implementation and tests, and prepare a structured implementation plan.
Preserve existing work and compatibility unless the requested change requires it.

- Inspect fresh AST dependency mapping before shared-service/hook/model refactors;
  the existing ignored graph is older than current source.
- Use uv with the explicit Python 3.12 environment and pnpm for frontend commands.
- New dependencies require explicit approval.
- Prefer existing utilities, ordinary language features, and established components.
  New abstractions need real duplication across three unrelated files.
- Keep TypeScript contracts explicit and avoid `any`.
- MUI custom styling belongs in `sx`; responsive layouts, rounded controls, soft
  shadows, whitespace, and readable typography are the UI requirements.
- Preserve offline inputs, authorization, data masking, official scoring, and provenance.
- Update matching current guidance when behavior changes; put dated delivery/test
  narratives in history rather than presenting them as permanent operational truth.
- Review whether a change adds unnecessary abstractions, extra state, or dependencies
  that existing code already handles.

Relevant verification commands from the repository root:

```powershell
uv run --no-project --python .venv312 python -m pytest backend/tests -q
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build
git diff --check
```

The frontend root tsconfig contains project references; plain `tsc --noEmit` does
not check both projects. Backend collection targets `backend/tests`, not the repo
root where archived modules may collide.

Browser tests require an explicit existing configuration, for example:

```powershell
pnpm.cmd --dir frontend exec playwright test --config playwright.parent-sync.config.ts
```

There are 14 tracked Playwright configurations selecting 19 distinct specs in this
snapshot. Some use mocked APIs; others start disposable database-backed test APIs.
Inspect each configuration, isolation, and ports before execution. The ML-insights
suite requires its test API separately. Mocked checks cannot prove real persistence.
Never aim reset helpers at school data or deploy test-server modules.

Relevant regression areas include parent permissions/masking, adviser ownership,
evaluator provenance, question ordering, workbook exports, scoring-asset parity,
and offline replay scope. Some ML reproduction resources are ignored and cannot
be promised as clean-clone test coverage.

## 17. Evidence, documentation gaps, and unknowns

### Established during this conversation

- Initial working tree was clean on `main` at `c3261e8`, with no ahead/behind count
  against the local `origin/main` reference. This was not a remote fetch.
- Active entrypoints, manifests, ownership/access helpers, models, assessment saves,
  question allocation, draft replay, routing, ML loading/readiness, and relevant
  test source were inspected. This was not an exhaustive security or correctness audit.
- The documented uv interpreter selection reported Python **3.12.13**.
- Both frontend TypeScript commands above completed successfully before this
  documentation-only addition. They were not rerun as application tests for this file.
- `git diff --check` passed before this addition; document checks are reported separately.
- The model checksum matched both current guidance and top-level metrics metadata.
- The 14 browser configurations and 19 specs were inventoried, not executed.
- `backend/.env`, the project Python executable, and local TypeScript launcher exist.
  Their presence does not prove valid provider credentials or database connectivity.

### Confirmed gaps and distinctions

1. **Deployment migration wording:** `DEPLOYMENT.md` still says fresh bootstrap
   applies 001–016 and omits 017 from its displayed existing-database upgrade list.
   The active `seed_supabase.py` migration inventory, migration README, scripts README,
   and current context include **017**; startup checks it. Use the active inventory
   and explicit migration safeguards rather than treating that older deployment
   paragraph as a complete migration list.
2. **Formatter target:** `frontend/package.json` names `playwright.config.ts` in its
   formatting script, but that file is absent. Explicit named browser configurations
   are present. This is a stale script target; the formatting command was not run.
3. **Graph freshness:** local `graphify-out/graph.json` was dated 2026-11-03 while
   inspected source includes later edits. A broad graph query was budget-truncated.
   It helped locate areas but cannot establish exact current caller coverage.
4. **Layout naming is consistent:** `TeacherLayout` uses `MainLayout`; the documented
   permission-gated navigation in `MainLayout` exists. This is not a code/docs conflict.
5. **No inspected business-rule conflict was established.** This statement is limited
   to the inspected paths and does not claim complete repository compliance.

This file records the gaps without changing runtime behavior or repairing other files.

### Not established

- Actual configured database connectivity, contents, migration ledger, or backups.
- Which local or hosted API instances are running, deployed revision, or hosted health.
- Provider credentials, real OTP/email delivery, sender verification, or browser cookie behavior.
- Backend test, browser test, lint, production build, or full end-to-end acceptance results.
- Independent ML validation, real-world delay sensitivity, or intervention effectiveness.
- Availability of ignored datasets, old screenshots, private workbooks, or connected credentials.

No migrations, provisioning, data restores, deployments, model training, dataset
generation, real email sends, or application behavior changes were performed to
produce this understanding document.

## 18. Further source references

- [AGENTS.md](AGENTS.md): working rules and preservation requirements.
- [AI_CONTEXT.md](AI_CONTEXT.md): maintained current operational/domain context.
- [Deployment guide](DEPLOYMENT.md): hosting configuration, subject to the noted migration gap.
- [Migration guide](backend/migrations/README.md): explicit upgrades and safeguards.
- [Bootstrap guide](backend/scripts/README.md): explicit fresh database provisioning.
- [Frontend guide](frontend/README.md): frontend operation and test setup.
- [ML guide](backend/ml/README.md): current model, evaluation, and research limits.
- [Offline scope plan](TEACHER_ECCD_OFFLINE_SCOPE_PLAN.md): teacher-only automatic replay.
- [Historical context](AI_CONTEXT_HISTORY.md): dated evidence and superseded experiments.
