# AMES Legacy Migration Architectural Audit

**Audit date:** 18 October 2026 (Asia/Singapore).  
**Deliverable:** Source-based, read-only comparison and proposed implementation plan; no migration or remediation has been executed.  
**Reference:** `AMES-SYSTEM-LEGACY/` (reference Git HEAD `57993ba`).  
**Active:** `backend/` and `frontend/` (root Git HEAD `2a5c661`, branch `unsure-check-first`, including existing working-tree changes).

## 1. Executive Summary Matrix

| Audited module / boundary | Legacy file path and lines | Active file path and lines | Parity status | Risk |
| --- | --- | --- | --- | --- |
| Evaluation provenance schema: four new attributes, parent FK, historical backfill | `AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql:1-36` | `backend/models/eccd.py:65-104`; `backend/migrations/phase2.py:23-43` | Missing in Active | High |
| Existing evaluation identity, uniqueness, teacher/student/question FK deletion behavior | `AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql:133-149` | `backend/models/eccd.py:65-91` | 100% Match | Low |
| Physical answer enum representation | `AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql:138-139` | `backend/models/eccd.py:28-30,78-79`; `backend/tests/fixtures/phase1_baseline.sql:3-11` | Partially Divergent | Medium |
| Teacher ECCD assessment: dates, writer identity, auto-fill, badges, responses | `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:65-259`; `AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx:578-694` | `backend/utils/assessments.py:21-48,80-114`; `frontend/src/hooks/useTeacherAssessment.ts:90-164` | Partially Divergent | High |
| Teacher domain completion formula, within an equivalent single section | `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:414-478` | `backend/routes/eccd.py:44-134`; `frontend/src/utils/teacherMetrics.ts:14-25` | 100% Match | Low |
| Assessment imports, workbook dates and age-dependent scoring | `AMES-SYSTEM-LEGACY/backend/controllers/teacherEccdImportController.js:370-392`; `AMES-SYSTEM-LEGACY/backend/controllers/teacherEccdExportController.js:139-185` | `backend/utils/excel.py:123-143,287-303`; `backend/utils/checklist_workbook.py:74-103` | Partially Divergent | High |
| Parent ECCD assessment: home-only writes, provenance, visibility, carry-over, selected-period saves | `AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:13-128`; `AMES-SYSTEM-LEGACY/frontend/src/pages/users/ParentEccdAssessment.jsx:154-205,280-290,728-753` | `backend/utils/assessments.py:51-125`; `frontend/src/hooks/useParentAssessment.ts:86-274`; `frontend/src/pages/parent/ParentEccdAssessment.tsx:562-717` | Partially Divergent | High |
| Teacher settings: six permissions and three editing windows | `AMES-SYSTEM-LEGACY/backend/controllers/teacherController.js:246-304`; `AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/TeacherSettings.jsx:16-25,306-352` | `backend/routes/teachers.py:29-44,209-232`; `backend/models/section.py:10-18`; `frontend/src/pages/teacher/TeacherSettings.tsx:657-662` | Partially Divergent | Medium |
| Chairman audit: actor display, event filtering, event detail and retention | `AMES-SYSTEM-LEGACY/backend/controllers/logController.js:5-35`; `AMES-SYSTEM-LEGACY/frontend/src/pages/chairman/SystemAuditLog.jsx:68-71,126-175` | `backend/routes/analytics.py:391-410`; `frontend/src/pages/chairman/SystemAuditLog.tsx:7-57,85-134` | Partially Divergent | High |
| Evaluation backup representation | `AMES-SYSTEM-LEGACY/backend/database/backup-schema.json:89-101` | `backend/schemas/backup.py:146-153`; `backend/utils/backups.py:20-46` | Partially Divergent | High |

**Conclusion:** The active system has the five requested modules, but does not implement the new evaluator/date model. Parent observations can become the dates used for official scoring, and teacher saves can rewrite dates on unrelated parent observations. Correcting only the ORM would leave save semantics, response contracts, imports, exports, backups and UI attribution inconsistent. These conclusions are substantiated in D1-D5, T1-T7 and P1-P5 below.

Editing windows are **already present** in the active working tree. They are section-owned rather than teacher-owned. This is a deliberate architectural distinction to preserve and review, not an absent implementation (S1-S3). Actor-role display and exclusion of internal rollover records are actual audit-viewer gaps (A1-A2). Assessment-submission logging is absent on **both** sides; it is not a legacy feature lost in migration (A4).

### 1.1 Method, evidence rules and limits

- Read `AI_CONTEXT.md` and repository instructions before analysis. Inspected actual legacy source before its active counterparts. The requested reference folder takes precedence over the instructions' historical `_legacy_reference/` name.
- Paths and line ranges refer to the inspected **working files**, not solely committed HEAD. Existing uncommitted edits include the parent assessment access feature. Do not use earlier audit documents or context verification counts as fresh test results.
- `[MISSING IN ACTIVE]` means a legacy feature has no corresponding implementation in the inspected active source. A missing feature has no truthful active definition line; its citation identifies the exact active class/function where it is absent, supplemented by the negative-search boundary in D1. `[DIVERGENT LOGIC]` means an implementation exists but differs. `MATCH`, `ACTIVE EXTENSION` and `SHARED LIMITATION` distinguish parity, intentional additions and deficiencies common to both.
- No database connection, schema query, API call, server startup, application test, package install, branch creation/switch, or application-file edit was performed. Runtime schema/application state, production migration completion, live data counts and deployed behavior are **not verified**. Findings describe code paths and their consequences, not reproduced production incidents.
- Relevant source/configuration/reference files in the three trees were SHA-256 fingerprinted for final preservation verification; dependencies, Git internals, caches and generated test/build output are excluded. No secrets or student records are reproduced.
- This is a file-by-file audit of the **five specified workflows and their schema/import/export/backup/test dependencies**. Authentication, messaging, ML, deployment configuration and unrelated screens are not independently certified by this report.

### 1.2 Actual file and route resolution

| Requested conceptual location | Verified implementation and routing evidence |
| --- | --- |
| Legacy teacher checklist | Main routed assessment is `AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx:578-694,1418-1420`; active counterpart is `frontend/src/pages/teacher/EccdAssessment.tsx:33,138` with `frontend/src/hooks/useTeacherAssessment.ts:42-55`. Active route imports/mounts that page in `frontend/src/App.tsx:19,117-120`. |
| Active `Settings.tsx` | Actual file is `frontend/src/pages/teacher/TeacherSettings.tsx:67-68,657-662`, mounted by `frontend/src/App.tsx:21,121-122`. Legacy uses `AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/TeacherSettings.jsx:16-25,75-101`. |
| Active `backend/routes/parent.py` | Actual profile router is plural `backend/routes/parents.py:28-56`. Assessment handlers are in `backend/routes/eccd.py:147-184` and `backend/utils/assessments.py:51-125`. Do not create a duplicate singular router to address a naming difference. Legacy uses `AMES-SYSTEM-LEGACY/backend/routes/parentEccdRoutes.js:1-8` and `AMES-SYSTEM-LEGACY/backend/routes/eccdRoutes.js:19-30`. |
| Chairman audit handler | Actual active handler is `backend/routes/analytics.py:391-410`, with `/api/logs` aliases, mounted in `backend/main.py:65-71`. It is not implemented in `backend/routes/chairman.py`. Legacy mounts `/api/logs` in `AMES-SYSTEM-LEGACY/backend/index.js:114` and routes it in `AMES-SYSTEM-LEGACY/backend/routes/logRoutes.js:1-9`. |
| Effective legacy parent assessment GET | `AMES-SYSTEM-LEGACY/backend/index.js:117-118` mounts `/api/eccd/parent` **before** `/api/eccd`. Therefore `AMES-SYSTEM-LEGACY/backend/routes/parentEccdRoutes.js:5` reaches the newer `parentEccdController.getAssessment`; the home-only response in `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:678-712` is an internally reused base response, not the final response. |

This mounting order is material: comparing only `eccdController.getParentAssessmentData` would incorrectly conclude that legacy hides school questions. The newer controller replaces its `domains` array with all questions (`AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:63-78`); active still filters to home questions (`backend/utils/assessments.py:99-111`).

## 2. Deep-Dive Gap Analysis

### 2.1 Database Schema and ORM Models

Legacy uses SQL DDL and raw SQL, not an evaluation ORM. Its baseline table is in `AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql:133-149`; migration 005 is the additive schema authority. Active SQLAlchemy authority is `backend/models/eccd.py:65-104`.

#### File-by-file comparison

| ID / classification | Legacy evidence | Active evidence | Finding, consequence and required disposition |
| --- | --- | --- | --- |
| D1 — `[MISSING IN ACTIVE]` | `AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql:2-25` | `backend/models/eccd.py:65-91`; `backend/schemas/eccd.py:35-64,145-151`; `backend/schemas/backup.py:146-153` | All four fields are absent from the active evaluation model and its public/backup representations. There is no evaluation-to-parent FK. Add persistence, serialization and backup support together. Searches for `evaluator_role`, `teacher_evaluation_date` and `parent_submitted_at` across active backend/frontend source returned no implementations. `parent_id` exists in other tables; that does not establish evaluation provenance. |
| D2 — `[MISSING IN ACTIVE]` | `AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql:27-36`; `AMES-SYSTEM-LEGACY/backend/scripts/migrate-eccd-evaluators.js:6-16` | `backend/migrations/phase2.py:23-43`; `backend/migrations/parent_assessment_access.py:12-38`; `backend/main.py:23-40` | No equivalent evaluator migration/backfill or evaluator readiness check exists. Active uses explicit Python migrations and `ames_schema_migrations`, not an Alembic environment. Inspected all files under `backend/migrations/` and searched backend/frontend for the three provenance-specific names and `alembic`; no such implementation/configuration was found. Add a new versioned Python migration using existing conventions. |
| D3 — MATCH for identity/uniqueness/FKs | `AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql:133-149` | `backend/models/eccd.py:68-88` | Both use integer evaluation/student/question IDs, one row per `(student_id, question_id, testing_period)`, PRE/MID/POST and a required compatibility `evaluation_date`. Student/question deletion cascades; nullable teacher FK uses `ON DELETE SET NULL`. Retain these invariants. Provenance is not a reason to add evaluator identity to the unique key. Physical answer enum spelling differs (D7), although public answer values agree. |
| D4 — `[MISSING IN ACTIVE]` | `AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql:22-25`; `AMES-SYSTEM-LEGACY/backend/utils/eccdEvaluations.js:6-13` | `backend/models/eccd.py:70-91`; `backend/models/parent.py:44-66` | Parent deletion should null the evaluation's `parent_id` without deleting the answer. The active Parent relationships cover family links/messages only; evaluations have no parent relationship. The teacher FK exists, but there is no named evaluation-to-teacher ORM relationship; this is not itself a missing FK. Add parent association without `delete-orphan`/delete cascade. |
| D5 — `[DIVERGENT LOGIC]` | `AMES-SYSTEM-LEGACY/backend/database/backup-schema.json:89-101` | `backend/schemas/backup.py:24-25,146-153`; `backend/utils/backups.py:20-46` | Legacy backup evaluation rows contain all four new columns. Active backup rows omit them and forbid extras. Merely adding ORM fields would make active export validation reject the new columns. Extend backup schema/defaults and test old/new round-trips before rollout. Existing encrypted backup formats are separate: do not imply that a legacy encrypted container is directly restorable by the active Fernet loader. |
| D6 — `[DIVERGENT LOGIC]` / deployment coupling | `AMES-SYSTEM-LEGACY/backend/scripts/migrate-eccd-evaluators.js:6-16` | `backend/migrations/phase2.py:23-29,32-43`; `backend/main.py:31-42`; `backend/migrations/phase1_schema.py:6-28` | Active Phase 2 readiness compares actual column names to the current ORM with exact equality. New DDL plus old ORM, or new ORM plus old DDL, fails this check. Historical/fresh migrations also derive metadata from the current ORM. Coordinate migration/model/startup changes and test both upgrade and fresh installation; do not assume a rolling mixed-version deployment will work. |
| D7 — `[DIVERGENT LOGIC]` physical answer enum | `AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql:138-139` | `backend/models/eccd.py:28-30,78-79`; `backend/tests/fixtures/phase1_baseline.sql:3-11` | MySQL stores `DI-KAYA`; active SQLAlchemy `Enum(EccdAnswer)` persists the member name `DI_KAYA`, explicitly corroborated by the PostgreSQL fixture. Python/API values remain `DI-KAYA`. A raw cross-engine INSERT cannot blindly copy enum text. Use the ORM's value conversion or an explicit verified `DI-KAYA` to `DI_KAYA` mapping. Do not alter this existing PostgreSQL enum as part of the additive evaluator migration. Actual deployed enum labels still require read-only catalog verification before transfer. |

#### Attribute-level contract

| Attribute | Legacy definition / behavior | Active definition / behavior |
| --- | --- | --- |
| `parent_id` | Nullable integer; FK `parents(parent_id) ON DELETE SET NULL`: `AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql:2,22-25` | `[MISSING IN ACTIVE]` in `backend/models/eccd.py:68-91`. |
| `evaluator_role` | Non-null enum, lowercase `teacher`/`parent`, default `teacher`: `AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql:7-10` | `[MISSING IN ACTIVE]` in `backend/models/eccd.py:68-80`. |
| `teacher_evaluation_date` | Nullable DATE; official teacher date: `AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql:12-15`; `AMES-SYSTEM-LEGACY/backend/utils/eccdDates.js:14-26` | `[MISSING IN ACTIVE]`; only required `evaluation_date` exists in `backend/models/eccd.py:78-80`. |
| `parent_submitted_at` | Nullable TIMESTAMP, no insertion default: `AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql:17-20`. Parent writer assigns `CURRENT_DATE()` on every submitted row: `AMES-SYSTEM-LEGACY/backend/utils/eccdEvaluations.js:7-12`. | `[MISSING IN ACTIVE]`; parent writer changes compatibility date only when answer changes: `backend/utils/assessments.py:69-75`. |
| Historical backfill | Only non-home rows with teacher role, no parent timestamp, no existing teacher date; uses `COALESCE(q.is_home_based,0)=0`: `AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql:30-36`. | `[MISSING IN ACTIVE]`; model remains a single-date representation: `backend/models/eccd.py:78-80`; migration checker has no corresponding backfill: `backend/migrations/phase2.py:23-50`. |

**Important historical limit:** Defaulting `evaluator_role` to `teacher` is a compatibility default, not proof that an old home answer was teacher-authored. Active home inserts already set the adviser `teacher_id` (`backend/utils/assessments.py:64-75`), whereas new legacy parent inserts omit it (`AMES-SYSTEM-LEGACY/backend/utils/eccdEvaluations.js:8-13`). Do not infer historical parent identity from today's family link or infer teacher authorship from that active teacher ID. Migration 005 explicitly leaves ambiguous historical home dates unresolved (`AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql:27-36`).

### 2.2 Teacher ECCD Assessment Module

#### File-by-file comparison

| ID / classification | Legacy evidence | Active evidence | Finding and impact |
| --- | --- | --- | --- |
| T1 — `[DIVERGENT LOGIC]` official-date validation and updates | `AMES-SYSTEM-LEGACY/backend/utils/eccdDates.js:45-61`; `AMES-SYSTEM-LEGACY/backend/utils/eccdEvaluations.js:16-22`; `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:218-243` | `backend/utils/assessments.py:29-46` | Legacy checks chronological ordering using only non-null teacher dates, then normalizes only already teacher-dated rows in the period. Active checks **every** row's compatibility date across periods and rewrites **every** row's compatibility date in the selected period. A parent-only MID observation can prevent a legitimate PRE teacher save; a teacher save of school questions can also overwrite dates on untouched parent-only home rows. |
| T2 — `[DIVERGENT LOGIC]` existing-row authorship | `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:224-235` | `backend/utils/assessments.py:36-46` | Legacy insert/update sets the acting teacher ID, `evaluator_role='teacher'`, teacher date and answer, preserving existing parent ID/submission timestamp. Active sets teacher ID only on insert; an existing row's answer update does not change its teacher ID. Substitute/handover confirmation can retain a previous teacher's attribution, and parent-entered rows cannot be distinguished. |
| T3 — `[DIVERGENT LOGIC]` assessment read/save response dates and age | `AMES-SYSTEM-LEGACY/backend/utils/eccdDates.js:14-26`; `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:89-112,143-150,245-251` | `backend/utils/assessments.py:48,86-114`; `backend/schemas/eccd.py:138-151,181-188`; `frontend/src/hooks/useTeacherAssessment.ts:121-133` | Legacy exposes `periodDates` and `gradingDates` from the minimum explicit teacher date per period and uses that grading date for every domain's age. Active returns maximum compatibility date as `periodDates`/`evaluationDates` and uses the first stored domain row's compatibility date for teacher `evalAges`. Dates/ages can disagree between domains and between parent and teacher views. Active has no `gradingDates`, and its save response omits both date maps returned by the legacy save. |
| T4 — `[DIVERGENT LOGIC]` virtual auto-fill | `AMES-SYSTEM-LEGACY/frontend/src/utils/eccdDrafts.js:37-71`; `AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx:621-625,650-694` | `frontend/src/hooks/useTeacherAssessment.ts:90-119,146-164` | Legacy tracks saved answers, explicit drafts and inherited values separately, per question. Only saved KAYA starts inheritance; saved DI-KAYA replaces that source; draft DI-KAYA blocks dependent carry until an independent later save. Active overlays drafts into one answer map, inherits unsaved KAYA, persists generated later-period drafts, and has no DI-KAYA clearing branch. It also suppresses fill for an entire domain/period after **any** saved answer, instead of resolving per question. |
| T5 — `[DIVERGENT LOGIC]` progress/status granularity | `AMES-SYSTEM-LEGACY/frontend/src/utils/eccdDrafts.js:4-10`; `AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx:1255-1285,1502-1518` | `frontend/src/hooks/useTeacherAssessment.ts:80-104,213-225`; `frontend/src/pages/teacher/EccdAssessment.tsx:605-649,928-940` | Legacy shows saved/total, changed-draft count and completion defined as all questions saved with zero changed drafts. Active exposes a boolean derived from at least one saved answer and absence of a draft record; it lacks those counts. Active still requires all displayed answers and `isSaved` for Completed; do not claim that one saved answer alone produces Completed. Draft presence, including a no-op draft, can suppress Saved. |
| T6 — `[MISSING IN ACTIVE]` teacher checklist provenance badges | `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:127-136`; `AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx:627-629,1418-1420` | `backend/schemas/eccd.py:145-151`; `backend/utils/assessments.py:107-109`; `frontend/src/types.ts:169-176`; `frontend/src/pages/teacher/EccdAssessment.tsx:715-867` | Legacy returns `is_home_based` and `evaluator_roles` and shows Home-based / Parent Assessed. Active question serializer omits both properties from assessment rows; TypeScript has optional `is_home_based` but no evaluator map. The active routed teacher page cannot show who supplied the answer. |
| T7 — `[DIVERGENT LOGIC]` import/export date consumers | `AMES-SYSTEM-LEGACY/backend/controllers/teacherEccdImportController.js:370-392`; `AMES-SYSTEM-LEGACY/backend/controllers/teacherEccdExportController.js:139-185`; `AMES-SYSTEM-LEGACY/backend/controllers/chairmanEccdExportController.js:86-92,138-149` | `backend/utils/excel.py:123-143,287-303`; `backend/utils/checklist_workbook.py:79-103`; `backend/routes/eccd.py:242-255`; `backend/routes/parents.py:177-194` | Legacy import writes teacher provenance, normalizes teacher session dates and validates final cross-period order before per-student commit. Active import lacks those steps. Legacy official exports require an explicit grading/teacher date; active exports use minimum compatibility dates, section summary uses the first row's date, and parent summary uses maximum compatibility date. A parent-only period can receive official dates, ages and scores in active. All these consumers must migrate together. |
| T8 — `[DIVERGENT LOGIC]` empty batch | `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:211-219` | `backend/schemas/eccd.py:89-93,118-123`; `backend/utils/assessments.py:25-48` | Legacy rejects zero answers before saving. Active teacher batch defaults to an empty list and does not reject emptiness; its same-period normalization still runs and commits. Thus an empty teacher request can redate existing records. Require nonempty input for parity. |
| T9 — MATCH within equivalent scope; ACTIVE EXTENSION across assignments | `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:418-466` | `backend/routes/eccd.py:53-115`; `frontend/src/utils/teacherMetrics.ts:14-25`; `frontend/src/pages/teacher/EccdAssessment.tsx:65-86` | Progress is the rounded percentage of active students who have answered **every** required question in a domain/period; both KAYA and DI-KAYA count as completed. It is not a mastery ratio. Legacy uses one `teachers.section_id`; active uses active normalized assignments and recomputes selected-section completion in the UI when needed. Keep the current assignment model. |
| T10 — `[DIVERGENT LOGIC]` progress computation cost | `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:422-466` | `backend/routes/eccd.py:65-115`; `backend/models/eccd.py:93-95`; `backend/models/student.py:71-74`; `frontend/src/utils/teacherMetrics.ts:7-11` | Legacy aggregates completed students with a grouped SQL CTE and indexes the result. Active scans evaluations inside every domain/student loop; compatibility-property comparisons can repeatedly decrypt student LRNs even though stable student IDs exist. Its multi-section UI additionally fetches each selected student's whole assessment. This is a source-derived scaling concern, not measured latency. Prefer ID-indexed/grouped counts and benchmark representative class sizes before optimizing; preserve T9's formula. |

#### Side-by-side save/date excerpts

| Legacy | Active |
| --- | --- |
| `AMES-SYSTEM-LEGACY/backend/utils/eccdDates.js:47-51`: `MIN(e.teacher_evaluation_date)` / `MAX(e.teacher_evaluation_date)` with `teacher_evaluation_date IS NOT NULL` | `backend/utils/assessments.py:30-35`: compares `record.evaluation_date` for all other-period rows |
| `AMES-SYSTEM-LEGACY/backend/utils/eccdEvaluations.js:19-21`: `SET teacher_evaluation_date = ? ... AND teacher_evaluation_date IS NOT NULL` | `backend/utils/assessments.py:37-39`: `if record.testing_period == payload.testing_period: record.evaluation_date = payload.assessment_date` |
| `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:232-235`: update compatibility date, acting teacher, teacher role/date and answer | `backend/utils/assessments.py:41-46`: insert with teacher/date when absent; otherwise assign `record.answer` only |

**Concrete source-derived cases, not executed scenarios:**

1. Parent-only MID has a compatibility date of 10 October; teacher selects PRE 20 October. Active rejects because 10 October is an earlier later-period row (T1). Legacy ignores this unconfirmed row because it has no teacher date.
2. PRE is saved KAYA, MID is independently saved DI-KAYA, POST is empty. Legacy leaves POST empty because MID becomes the saved source. Active's POST condition can still inherit PRE KAYA (`frontend/src/hooks/useTeacherAssessment.ts:113-119` versus `AMES-SYSTEM-LEGACY/frontend/src/utils/eccdDrafts.js:48-68`).
3. One MID question is already saved; another question has saved PRE KAYA and no MID value. Legacy can fill the second question per-question. Active `!saved.MID` disables inheritance throughout the selected domain (`frontend/src/hooks/useTeacherAssessment.ts:90-112` versus `AMES-SYSTEM-LEGACY/frontend/src/utils/eccdDrafts.js:47-65`).

Both servers save the selected teacher period only, without automatically persisting later-period answers (`AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:221-236`; `backend/utils/assessments.py:40-46`). Preserve that separation even when changing virtual selections.

**Component ownership note:** `frontend/src/components/teacher/TeacherChecklist.tsx:29-34` contains another checklist implementation, but source search found no import of it in active `frontend/src`. The routed page uses `useTeacherAssessment` (`frontend/src/pages/teacher/EccdAssessment.tsx:33,138`). Changes to the unused component alone would not remediate T4-T6; do not assign its behavior to the routed page. The legacy equivalent is the page's checklist itself (`AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx:1418-1465`).

### 2.3 Parent ECCD Assessment Module

#### File-by-file comparison

| ID / classification | Legacy evidence | Active evidence | Finding and impact |
| --- | --- | --- | --- |
| P1 — `[MISSING IN ACTIVE]` parent identity and independent submission time | `AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:101-120`; `AMES-SYSTEM-LEGACY/backend/utils/eccdEvaluations.js:6-13` | `backend/routes/eccd.py:153-162`; `backend/utils/assessments.py:64-75`; `backend/models/eccd.py:68-80` | Legacy resolves parent ID from the authenticated family join, writes parent ID/role/submission time, and omits teacher ID on new parent rows. Active validates linked ownership but drops parent identity when saving and inserts the active adviser as teacher. Changed answers overwrite compatibility dates; unchanged answers never refresh a submission timestamp. |
| P2 — `[DIVERGENT LOGIC]` selected-period request/response | `AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:84-93,120-122`; `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:720-724`; `AMES-SYSTEM-LEGACY/frontend/src/pages/users/ParentEccdAssessment.jsx:172-198` | `backend/schemas/eccd.py:126-135`; `backend/utils/assessments.py:57-77`; `frontend/src/hooks/useParentAssessment.ts:192-257` | Effective legacy endpoint requires a top-level selected period, same-period nonempty rows and returns `testing_period`; the compatibility handler can infer a single period. Active accepts mixed-period rows, no top-level selected period, and an empty list; its UI submits all open-period drafts together, and response contains only `message`. This is contract and workflow divergence even though active checks all windows before mutation. |
| P3 — `[DIVERGENT LOGIC]` school question visibility and priority | `AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:29-32,63-76`; `AMES-SYSTEM-LEGACY/frontend/src/pages/users/ParentEccdAssessment.jsx:280-290,728-753` | `backend/utils/assessments.py:99-112,125`; `frontend/src/pages/parent/ParentEccdAssessment.tsx:123-133,562-628` | Legacy returns all domains/questions, sorts home items first and home-containing domain cards first, then renders school items in a view-only group. Active removes school items server-side, omits domains with no home items, and renders a flat home checklist in sequence order. The school view-only group, domain prioritization and domain checklist navigation are missing from the active parent page. |
| P4 — `[DIVERGENT LOGIC]` parent carry-over | `AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:45-61,70-73`; `AMES-SYSTEM-LEGACY/frontend/src/utils/eccdDrafts.js:39-91`; `AMES-SYSTEM-LEGACY/frontend/src/pages/users/ParentEccdAssessment.jsx:156-169` | `frontend/src/hooks/useParentAssessment.ts:122-145,147-188`; `backend/schemas/eccd.py:145-151`; `frontend/src/types.ts:169-176` | Legacy sends authorized carry-over/source-period projections for open destinations and resolves inheritance from saved home answers, even across hidden intermediate periods. Active lacks `carry_over`/`carry_over_sources`, automatically writes KAYA drafts into later open periods, can overwrite their existing values, and can backfill earlier empty open periods. DI-KAYA changes do not remove those generated later drafts. |
| P5 — `[DIVERGENT LOGIC]` read-after-save visibility and date meaning | `AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:33-43,76-78`; `AMES-SYSTEM-LEGACY/backend/utils/eccdDates.js:14-26` | `backend/utils/assessments.py:87-114`; `frontend/src/hooks/useParentAssessment.ts:122-145,254-274`; `backend/tests/test_parent_assessment_access.py:37-46` | Legacy allows home answers when the period is editable even if results are unreleased, and parent `periodDates` come from parent timestamps. Active masks all server answers until release; after a confirmed save it evicts that draft, so an unreleased saved observation is no longer displayed by `getAnswer`. Active dates remain compatibility-derived official-looking dates. **Retain active release masking required by project instructions**; do not copy legacy's broader visibility without an approved separate own-observation contract. |
| P6 — MATCH for home-only write protection and permission layering | `AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:101-116` | `backend/routes/eccd.py:157-160`; `backend/utils/assessments.py:51-68`; `backend/utils/access.py:43-60` | Both require authenticated child association, global home edit permission, an open period and home-only question IDs; disallowed writes return 403 and non-home items are rejected. Active strengthens approval/assignment handling using SYNCED links and active Primary Adviser inheritance. Keep that active model and six granular permissions. |
| P7 — `[DIVERGENT LOGIC]` progress denominators and visibility | `AMES-SYSTEM-LEGACY/frontend/src/pages/users/ParentEccdAssessment.jsx:283-290`; `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:745-785` | `backend/routes/eccd.py:165-178`; `backend/utils/assessments.py:99-111`; `frontend/src/pages/parent/ParentEccdAssessment.tsx:562-628` | Legacy interactive domain cards count all domain questions and may include local/inherited home selections. Its separate progress API counts only home questions; locked releases produce zero completed counts. Active has no corresponding parent domain-card checklist; its progress API counts saved visible home answers, returns null for locked periods and omits non-home domains. Preserve null masking while keeping completion distinct from mastery and from provisional UI answers. |
| P8 — ACTIVE EXTENSION / durability to preserve | `AMES-SYSTEM-LEGACY/frontend/src/pages/users/ParentEccdAssessment.jsx:111-132,156-169,186-204` | `frontend/src/hooks/useParentAssessment.ts:108-120,215-267,279-305`; `frontend/src/utils/drafts.ts:5-38,57-87`; `frontend/src/components/SyncStatus.tsx:38-53` | Legacy parent drafts live in component state and reset on loads/failures; active persists owner/student/domain/period/revision-scoped drafts and queues failed network submissions. Do not port legacy resets when implementing its checklist/period selection. Preserve exact-key eviction only after HTTP 200/201 and revision equality. |
| P9 — `[DIVERGENT LOGIC]` dashboard phase resolution / MATCH in mastery badges | `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:284-317,345-405` | `backend/utils/assessments.py:129-167` | Legacy selects the latest **released** populated phase, because its SQL removes locked periods first. Active first selects the latest recorded phase and masks the entire dashboard if that phase is unreleased; it does not fall back to an older release. For a visible phase both calculate KAYA/recorded-answer ratio, round to integer and use 80% Excelling, 50% Developing, below 50% Needs Support. Active adds alphabetically resolved strongest/weakest domains and POST-with-no-DI-KAYA `assessmentMastered`; neither its condition nor the legacy ratio establishes all questions are answered. Preserve the explicitly required active latest-recorded masking and avoid confusing mastery with completion. |

#### Side-by-side parent upsert

Legacy, `AMES-SYSTEM-LEGACY/backend/utils/eccdEvaluations.js:8-12`:

```sql
INSERT INTO student_eccd_evaluations
    (student_id, parent_id, question_id, testing_period, answer,
     evaluator_role, evaluation_date, parent_submitted_at)
-- values include 'parent', CURRENT_DATE(), CURRENT_DATE()
ON DUPLICATE KEY UPDATE
    answer = VALUES(answer), parent_id = VALUES(parent_id),
    evaluator_role = 'parent', parent_submitted_at = CURRENT_DATE()
```

Active, `backend/utils/assessments.py:69-75`:

```python
if record:
    if record.answer != answer.answer:
        record.answer, record.evaluation_date = answer.answer, date.today()
else:
    db.add(StudentEccdEvaluation(
        student_id=student.student_id, teacher_id=teacher.teacher_id,
        question_id=answer.question_id, testing_period=answer.testing_period,
        answer=answer.answer, evaluation_date=date.today()))
```

These snippets are abbreviated source comparisons. Legacy does **not** clear `teacher_id` or an existing teacher date on a parent correction; it retains teacher confirmation history while changing the last writer role. Likewise, a subsequent teacher confirmation retains parent ID/timestamp (`AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:231-235`). This is one current answer with two provenance/date tracks, **not** two independent answers or a complete revision history. Active has only the current answer and compatibility date (`backend/models/eccd.py:68-80`).

**Timestamp precision:** The legacy column is TIMESTAMP, but the writer stores `CURRENT_DATE()`, i.e. date-granularity midnight, not the exact submission instant (`AMES-SYSTEM-LEGACY/backend/utils/eccdEvaluations.js:7-12`). Its read API formats the timestamp as `YYYY-MM-DD` (`AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:39-41`). A new `now()` writer would be an improvement requiring explicit approval, not literal legacy parity; active has neither representation (`backend/utils/assessments.py:69-75`).

### 2.4 Teacher Settings Module

#### File-by-file comparison

| ID / classification | Legacy evidence | Active evidence | Finding and disposition |
| --- | --- | --- | --- |
| S1 — `[DIVERGENT LOGIC]` ownership of editing windows | `AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql:40-62`; `AMES-SYSTEM-LEGACY/backend/controllers/teacherController.js:249-263` | `backend/models/section.py:10-18`; `backend/models/section_teacher.py:20-39`; `backend/utils/assessment_access.py:16-33` | Legacy windows `parent_can_edit_pre/mid/post` belong to a teacher with one section pointer. Active equivalent windows belong to the section and survive adviser replacement; both active advisers/substitutes can manage assigned section windows. No additional legacy section-owned window columns were found in its section definition (`001_initial_schema.sql:19-25`). Preserve normalized ownership, and explicitly map imported settings. |
| S2 — `[DIVERGENT LOGIC]` names, endpoint and payload | `AMES-SYSTEM-LEGACY/backend/routes/teacherRoutes.js:44-47`; `AMES-SYSTEM-LEGACY/backend/controllers/teacherController.js:247-300`; `AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/TeacherSettings.jsx:75-101` | `backend/routes/teachers.py:29-44,209-232`; `backend/schemas/teacher.py:97-111`; `frontend/src/components/teacher/ParentAssessmentAccessSettings.tsx:55-59,115-137` | Legacy partial PUT `/api/teachers/access-controls` accepts global flags and each period window. Active global endpoint rejects extra `parent_can_edit_*` names, while separate GET/PUT `/api/teacher/settings/parent-assessment-access?section_id=...` handles all three section windows. UI functionality exists, but a legacy settings client is not wire-compatible. Add a thin alias/adapter only if legacy-client compatibility is approved; do not add duplicate permission columns. |
| S3 — MATCH in window defaults / ACTIVE EXTENSION in persistence | `AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql:47-49`; `AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/TeacherSettings.jsx:23-25,75-101,330-352` | `backend/models/section.py:12-14`; `backend/migrations/parent_assessment_access.py:24-38`; `frontend/src/pages/teacher/TeacherSettings.tsx:657-662`; `frontend/src/components/teacher/ParentAssessmentAccessSettings.tsx:32-35,115-159` | PRE open, MID/POST closed defaults match. Active migration and mounted three-switch UI already exist. Active adds owner/section-scoped durable autosave and reconnection instead of reverting the toggle on network failure. Do not recreate or remove this feature. |
| S4 — `[DIVERGENT LOGIC]` global edit default and spelling | `AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql:46,53-57`; `AMES-SYSTEM-LEGACY/backend/controllers/teacherController.js:249-253` | `backend/models/teacher.py:21-26,37-39`; `backend/schemas/teacher.py:97-104`; `frontend/src/pages/teacher/TeacherSettings.tsx:51-65` | Legacy default `allow_parent_edit_student_info` is false; active default is true. Home-edit spelling changes from `allow_parent_home_based_edit` to granular `allow_parent_edit_home_based_eccd` (an active read compatibility property exists). Preserve the required six-field active matrix; explicitly map stored legacy values during any data import rather than substituting active defaults or restoring coarse flags. |
| S5 — ACTIVE EXTENSION in audit; SHARED LIMITATION for global settings | `AMES-SYSTEM-LEGACY/backend/controllers/teacherController.js:247-269` | `backend/routes/teachers.py:35-44,222-232` | Legacy access-control saves do not write system logs. Active section window updates log `PARENT_ASSESSMENT_ACCESS` transactionally; active six-permission saves still do not log. Full teacher settings audit coverage is a proposed enhancement, not a missing legacy feature. |

#### Window mapping for an eventual approved data transfer

| Legacy teacher column | Active section column | Default | Additional required gate |
| --- | --- | --- | --- |
| `parent_can_edit_pre` | `pre_test_parent_editable` | true | Active Primary Adviser's `allow_parent_edit_home_based_eccd` |
| `parent_can_edit_mid` | `mid_test_parent_editable` | false | Same |
| `parent_can_edit_post` | `post_test_parent_editable` | false | Same |

Mapping evidence: `AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:10-11,101-111`; `backend/utils/assessment_access.py:8-13`; `backend/utils/assessments.py:55-63`. Resolve legacy teacher-to-section conflicts before importing: multiple active legacy teachers cannot be arbitrarily collapsed into one section value. Active is capable of multiple assigned sections (`backend/utils/assessment_access.py:18-23`), while legacy uses `teachers.section_id` (`AMES-SYSTEM-LEGACY/backend/controllers/teacherController.js:291-293`).

Keep result release independent from edit permission. Active explicitly verifies that saving into an open window does not publish results (`backend/tests/test_parent_assessment_access.py:37-46`); legacy queries independently calculate released and editable periods (`AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:33-38`).

### 2.5 Chairman Audit Log Module

#### File-by-file comparison

| ID / classification | Legacy evidence | Active evidence | Finding and impact |
| --- | --- | --- | --- |
| A1 — `[DIVERGENT LOGIC]` actor identity and role | `AMES-SYSTEM-LEGACY/backend/controllers/logController.js:14-25,31`; `AMES-SYSTEM-LEGACY/frontend/src/pages/chairman/SystemAuditLog.jsx:12-25,132-156,202-217` | `backend/routes/analytics.py:399-408`; `backend/schemas/operations.py:98-114`; `frontend/src/pages/chairman/SystemAuditLog.tsx:7-36,85-122,148-160` | Legacy actor display falls back from teacher full name to parent fullname to username/Unknown User and returns Chairman/Teacher/Parent/Unknown. Active joins no Parent profile, returns no `actor_name` or `role`, and the UI has no Role column/badge or role in details. Compatibility aliases for log/action IDs exist, but do not repair these missing fields. |
| A2 — `[DIVERGENT LOGIC]` internal-event filtering | `AMES-SYSTEM-LEGACY/backend/controllers/logController.js:26-27` | `backend/routes/analytics.py:399-409`; `backend/utils/rollover.py:44-48` | Legacy excludes `ROLLOVER_SNAPSHOT` and `ROLLOVER_RECORDS`. Active returns them, including stored batch snapshots and record-ID arrays. This adds noise and exposes implementation payloads in the normal Chairman viewer. Filter these events from public audit retrieval while retaining stored data for undo. Chairman authorization still applies; this is not an unauthenticated disclosure. |
| A3 — MATCH / SHARED LIMITATION in search, pagination and export | `AMES-SYSTEM-LEGACY/backend/controllers/logController.js:5-31`; `AMES-SYSTEM-LEGACY/frontend/src/pages/chairman/SystemAuditLog.jsx:35-71,126-175` | `backend/routes/analytics.py:395-410`; `frontend/src/pages/chairman/SystemAuditLog.tsx:46-67,85-134` | Both fetch the full history, order descending by timestamp then ID, and filter actor/action text client-side. Neither inspected viewer/API implements server-side paging, date/role/action filter controls, details-text search or audit export. Do not label these as missing legacy features. They are scalability enhancements requiring a separate compatible contract. |
| A4 — event coverage: ACTIVE EXTENSION / SHARED LIMITATION | `AMES-SYSTEM-LEGACY/backend/controllers/parentSyncController.js:44-75`; `AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:99-125`; `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:206-253`; `AMES-SYSTEM-LEGACY/backend/controllers/teacherController.js:247-269` | `backend/routes/teachers.py:35-44,56-87,224-232`; `backend/utils/assessments.py:21-77` | Legacy parent accept/unlink/reject, assessment submits and teacher access changes do not emit audit events in those paths. Active logs parent approve/unlink/reject and section-window changes; neither active assessment save nor six-permission save emits an event. Avoid inventing legacy assessment audit behavior. |
| A5 — `[DIVERGENT LOGIC]` actor retention and timestamp representation | `AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql:169-178` | `backend/models/log.py:11-20` | Legacy log FK is `ON DELETE CASCADE`; active is nullable `ON DELETE SET NULL`, preserving logs after actor deletion. This is an active retention improvement. Legacy TIMESTAMP and active timezone-naive SQLAlchemy DateTime do not establish a common displayed timezone; no deployed DB/session timezone was inspected. Preserve timestamps and define normalization separately before historic transfer. |
| A6 — `[DIVERGENT LOGIC]` system-settings event detail/no-op behavior | `AMES-SYSTEM-LEGACY/backend/controllers/settingsController.js:103-121` | `backend/routes/settings.py:37-55` | Legacy skips write/log on unchanged settings and records school, principal and opening month for changed settings. Active always adds `UPDATE_SYSTEM_SETTINGS` with opening month only and commits. Redundant saves create audit noise; the event has less configuration detail. The legacy generic logger is best-effort; active emits this event in the same transaction as the settings write. |
| A7 — `[DIVERGENT LOGIC]` transfer metadata | `AMES-SYSTEM-LEGACY/backend/controllers/chairmanController.js:652-666` | `backend/routes/chairman.py:124-135` | Legacy transfer details enumerate affected student labels and original section labels plus destination name. Active records count and destination section ID only. Both log transactionally, but active loses per-student/from-section traceability in this event. Add masked student IDs/labels and original/destination sections without changing assessment rows. |
| A8 — SHARED LIMITATION / ACTIVE EXTENSION in log structure and transactions | `AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql:169-178`; `AMES-SYSTEM-LEGACY/backend/utils/logger.js:5-14`; `AMES-SYSTEM-LEGACY/backend/controllers/chairmanController.js:663-666` | `backend/models/log.py:11-18`; `backend/routes/teachers.py:81-86`; `backend/routes/chairman.py:109-115` | Neither log table stores immutable actor-role snapshots, dedicated target IDs, structured metadata or before/after JSON fields. Both store action, user FK, timestamp and text details (occasionally JSON snapshots). Legacy roles are derived at read time. Generic legacy logging can fail without failing the business action; active inspected paths commit log and business state together. Structured event history would be an explicit extension, not schema parity. |

#### Explicit event coverage ledger

| Action | Legacy emission | Active emission | Evidence |
| --- | --- | --- | --- |
| Parent link approved/unlinked/rejected | None in inspected action handler | `Approved Parent Link`, `Unlinked Parent`, `Rejected Parent Link` | `AMES-SYSTEM-LEGACY/backend/controllers/parentSyncController.js:44-75`; `backend/routes/teachers.py:65-86` |
| Teacher assessment submit | None | None | `AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:206-253`; `backend/utils/assessments.py:21-48` |
| Parent assessment submit | None | None | `AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:99-125`; `backend/utils/assessments.py:51-77` |
| Six global parent permissions changed | None | None | `AMES-SYSTEM-LEGACY/backend/controllers/teacherController.js:247-269`; `backend/routes/teachers.py:222-232` |
| Period editing windows changed | None | `PARENT_ASSESSMENT_ACCESS` | `AMES-SYSTEM-LEGACY/backend/controllers/teacherController.js:249-265`; `backend/routes/teachers.py:35-44` |
| School settings changed | `UPDATE_SYSTEM_SETTINGS`, changed values only | Same action name; every save | `AMES-SYSTEM-LEGACY/backend/controllers/settingsController.js:103-121`; `backend/routes/settings.py:37-55` |
| Student transfer | `TRANSFER_STUDENTS`, enumerated detail | Same action, aggregate detail | `AMES-SYSTEM-LEGACY/backend/controllers/chairmanController.js:652-666`; `backend/routes/chairman.py:124-135` |
| ECCD question-management permission | `UPDATE_TEACHER_PERMISSION`, best-effort helper | Same action, transactional and includes target teacher ID | `AMES-SYSTEM-LEGACY/backend/controllers/chairmanController.js:702-713`; `backend/routes/chairman.py:106-115` |
| Rollover internals | Stored, excluded from viewer | Stored, included in viewer | `AMES-SYSTEM-LEGACY/backend/controllers/logController.js:26`; `backend/utils/rollover.py:44-48`; `backend/routes/analytics.py:399-409` |

Dedicated audit export, immutable actor-role snapshots and structured targets must not be represented as legacy capabilities in an implementation approval request. A successful assessment save is also not equivalent to a system-log audit trail: provenance records identify current/previous involvement but do not retain every answer revision (D1, P1 and A4/A8).

### 2.6 Existing Tests: Coverage Evidence and Gaps

These are **inspected test definitions**, not fresh test results.

| Area | Legacy evidence | Active evidence | Assessment |
| --- | --- | --- | --- |
| Evaluator migration and parent/teacher correction lifecycle | `AMES-SYSTEM-LEGACY/backend/tests/eccd-evaluators-integration.test.js:80-149` | `backend/tests/test_phase2.py:278-337,529-565`; `backend/tests/test_parent_assessment_access.py:37-78` | Legacy explicitly tests conservative backfill, identity spoofing, no official scoring before teacher confirmation, retained parent history and parent deletion. Active tests use its single-date model and have no provenance attributes. Add PostgreSQL lifecycle/backup/export regressions. |
| Carry-over | `AMES-SYSTEM-LEGACY/backend/tests/eccd-drafts-frontend.test.js:12-84,103-110` | `frontend/tests/teacher-portal-parity.spec.ts:718-805,1262-1327`; `frontend/tests/parent-portal-parity.spec.ts:709-767` | Existing active tests cover its carry-forward/offline behavior; that does not prove the newer saved-only/per-question legacy semantics. Add cases for independently saved intermediate DI-KAYA, draft KAYA not propagating, generated draft invalidation and partial later-domain saves. |
| Editing windows | `AMES-SYSTEM-LEGACY/frontend/src/utils/eccdDrafts.js:13-20`; `AMES-SYSTEM-LEGACY/backend/controllers/parentEccdController.js:110-116` | `backend/tests/test_parent_assessment_access.py:37-141`; `frontend/tests/parent-assessment-access.spec.ts:51-187` | Existing active tests cover gate combinations, mixed-period atomicity, adviser/substitute management, ownership, migration, backup and offline UI. Preserve/extend them; do not declare the window feature absent. |
| Audit response compatibility | `AMES-SYSTEM-LEGACY/backend/controllers/logController.js:14-31` | `backend/tests/test_parity.py:200-216` | Active asserts full history, aliases and teacher names, but not parent fullname, role, actor_name or snapshot exclusion. Add these before changing response mapping. |
| Route completeness scanner | `AMES-SYSTEM-LEGACY/backend/routes/teacherRoutes.js:16-18`; `AMES-SYSTEM-LEGACY/backend/routes/parentEccdRoutes.js:1-8` | `backend/tests/test_parity.py:31-41`; `backend/routes/teachers.py:90-102` | Scanner parses only get/post/put/delete and a fixed mount list; it misses PATCH and the newer dedicated parent router. Parent-link GET/DELETE/PATCH legacy paths differ from active POST actions. Treat as a bounded adjacent contract gap; expand route evidence/adapter tests rather than claiming the scanner certifies all parity. |

## 3. Database Migration Strategy

**Everything in this section is proposed only. No SQL below was run, and no migration/module was created.** The new Python file paths are proposed additions and intentionally have no existing line citations. Existing extension points and legacy requirements are cited above and below.

### 3.1 Target representation and migration ownership

Use the current explicit transactional migration system. Proposed file: `backend/migrations/eccd_evaluator_tracking.py`, proposed ledger version **`007_eccd_evaluator_tracking`**, following current `006_parent_assessment_access` (`backend/migrations/parent_assessment_access.py:12,24-38`). Reconfirm version availability during implementation.

| Column | Proposed PostgreSQL type / constraint | SQLAlchemy mapping | Rationale |
| --- | --- | --- | --- |
| `parent_id` | `INTEGER NULL`; named FK to `parents(parent_id) ON DELETE SET NULL` | `Column(Integer, ForeignKey("parents.parent_id", name="fk_eccd_evaluator_parent", ondelete="SET NULL"), nullable=True)` | Match nullable legacy provenance and preserve evaluations on parent deletion (D1/D4). |
| `evaluator_role` | `VARCHAR(7) NOT NULL DEFAULT 'teacher'`; named CHECK permitting only lowercase `teacher`,`parent` | `Column(String(7), nullable=False, default="teacher", server_default="teacher")` plus `CheckConstraint` | Preserve enum's allowed values/default without a PostgreSQL named-type lifecycle. This is an intentional storage-type adaptation with equivalent value constraints. |
| `teacher_evaluation_date` | `DATE NULL`, no default | `Column(Date, nullable=True)` | Unconfirmed parent rows must not acquire an official date. |
| `parent_submitted_at` | `TIMESTAMP WITH TIME ZONE NULL`, no default | `Column(DateTime(timezone=True), nullable=True)` | Preserve an actual timestamp during transfer; expose date-only legacy projections where required. Match current legacy writer's calendar-day behavior unless exact-time behavior is approved. |

A String-plus-CHECK role is the proposed decision, not a claim that it exists. If a native PostgreSQL enum is selected instead, use exact lowercase persisted values and explicitly manage its migration lifecycle. SQLAlchemy's Python Enum handling can persist member names unless configured with `values_callable`; do not accidentally store uppercase role names. See [SQLAlchemy Enum documentation](https://docs.sqlalchemy.org/en/20/core/type_basics.html#sqlalchemy.types.Enum).

Timezone mapping is a declared migration decision. MySQL timestamp export must use a verified source session timezone or UTC extraction; PostgreSQL `timestamptz` retains instants and displays them in the selected session timezone. Date-only teacher values must remain calendar dates. The source pool sets `dateStrings: true` but no explicit timezone here (`AMES-SYSTEM-LEGACY/backend/config/db.js:7-13`; `AMES-SYSTEM-LEGACY/backend/config/dbConnection.js:19-22`). Do not infer the actual source server timezone from the developer workstation. See [PostgreSQL date/time types](https://www.postgresql.org/docs/current/datatype-datetime.html).

### 3.2 Preflight and preservation contract

After this plan is approved, before deployment:

1. Stop active assessment writers/importers and plan a coordinated backend restart. Inventory the **actual target schema**, migration ledger and PostgreSQL version using the configured schema, without printing secrets or LRNs. Source files alone cannot establish whether someone applied manual DDL.
2. Take a verified target-native database backup and preserve established encryption/HMAC/backup keys. Do not rely on the currently incomplete application evaluation backup schema (D5). Rehearse restoring into a disposable database. This audit has not established that any configured backup key or production backup works.
3. Snapshot row count and a stable digest of all original evaluation columns, ordered by `evaluation_id`; preserve PKs, unique keys, answers, compatibility dates and teacher IDs. Record orphan/duplicate counts and the exact eligible backfill ID/date set. Do not output student data in logs.
4. Inspect any already-existing new columns, their types/defaults/nullability and FK/check definitions. If compatible, preserve values; if incompatible, stop with a sanitized diagnostic. `ADD COLUMN IF NOT EXISTS` alone is not a compatibility check.
5. Keep `student_id` identity and protected LRNs. No plaintext LRN columns, answer deletion, unique-key widening or schema replacement is needed (`backend/models/eccd.py:69,83-87`; `backend/migrations/phase2.py:66-85`).

### 3.3 Exact additive PostgreSQL operation

The following is the **fresh-absent-column SQL body** for the proposed migration. It shows the `public` target explicitly; the implemented Python runner must use validated `select_schema(connection, schema)` for the actual selected schema (`backend/migrations/phase1.py:39-48`). Never redirect a configured database to an assumed schema.

```sql
BEGIN;
SET LOCAL search_path TO public;
SET LOCAL lock_timeout = '5s';

LOCK TABLE ames_schema_migrations IN EXCLUSIVE MODE;
LOCK TABLE student_eccd_evaluations IN ACCESS EXCLUSIVE MODE;
LOCK TABLE eccd_questions, parents IN SHARE MODE;

ALTER TABLE student_eccd_evaluations
    ADD COLUMN IF NOT EXISTS parent_id INTEGER DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS evaluator_role VARCHAR(7) NOT NULL DEFAULT 'teacher',
    ADD COLUMN IF NOT EXISTS teacher_evaluation_date DATE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS parent_submitted_at TIMESTAMPTZ DEFAULT NULL;

-- Add only after inspector confirms there is no equivalent constraint.
ALTER TABLE student_eccd_evaluations
    ADD CONSTRAINT ck_eccd_evaluator_role
        CHECK (evaluator_role IN ('teacher', 'parent')) NOT VALID;

ALTER TABLE student_eccd_evaluations
    ADD CONSTRAINT fk_eccd_evaluator_parent
        FOREIGN KEY (parent_id) REFERENCES parents(parent_id)
        ON DELETE SET NULL NOT VALID;

UPDATE student_eccd_evaluations AS e
SET teacher_evaluation_date = e.evaluation_date
FROM eccd_questions AS q
WHERE q.question_id = e.question_id
  AND COALESCE(q.is_home_based, FALSE) = FALSE
  AND e.evaluator_role = 'teacher'
  AND e.parent_submitted_at IS NULL
  AND e.teacher_evaluation_date IS NULL;

ALTER TABLE student_eccd_evaluations
    VALIDATE CONSTRAINT ck_eccd_evaluator_role;
ALTER TABLE student_eccd_evaluations
    VALIDATE CONSTRAINT fk_eccd_evaluator_parent;

-- Python performs preservation/compatibility checks before this insertion.
INSERT INTO ames_schema_migrations(version)
VALUES ('007_eccd_evaluator_tracking')
ON CONFLICT (version) DO NOTHING;
COMMIT;
```

The lock timeout is a proposed deployment guard, not observed configuration. The Python wrapper must inspect constraint signatures and skip equivalent constraints on rerun; incompatible same-name constraints are errors. The SQL body alone is not a complete idempotent executable migration. Keep DDL, backfill, preservation checks and ledger insertion in one `engine.begin()` transaction, following `backend/migrations/parent_assessment_access.py:24-38,47-56`.

The backfill exactly preserves legacy's null-home handling and four predicates (`AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql:30-36`). Do not fill parent IDs, parent timestamps or ambiguous home teacher dates. Already populated teacher dates must survive repeat execution. If the ledger version already exists, perform schema/integrity verification and return without repeating a backfill on records created later. PostgreSQL supports unvalidated FK/CHECK addition followed by validation; this does not remove the locks chosen for this coordinated migration. See [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html).

### 3.4 SQLAlchemy and schema edits

Proposed additions inside `StudentEccdEvaluation` in `backend/models/eccd.py` (current insertion area `:68-91`):

```python
parent_id = Column(
    Integer,
    ForeignKey("parents.parent_id", name="fk_eccd_evaluator_parent",
               ondelete="SET NULL"),
    nullable=True,
)
evaluator_role = Column(
    String(7), nullable=False, default="teacher", server_default="teacher"
)
teacher_evaluation_date = Column(Date, nullable=True)
parent_submitted_at = Column(DateTime(timezone=True), nullable=True)
```

Extend the existing `__table_args__` with `CheckConstraint("evaluator_role IN ('teacher', 'parent')", name="ck_eccd_evaluator_role")`; retain the existing `UniqueConstraint` and period index unchanged. Add required SQLAlchemy imports. If bidirectional parent navigation is added, use `parent = relationship("Parent", back_populates="evaluations")` and `Parent.evaluations = relationship("StudentEccdEvaluation", back_populates="parent", passive_deletes=True)`. **No evaluation delete cascade or delete-orphan on parent relationships.** Existing parent family/message cascade behavior is separate (`backend/models/parent.py:60-66`).

Extend Pydantic evaluation/read/backup models with typed nullable provenance and `Literal['teacher','parent']` role values. Resolve writer IDs/roles on the server; do not accept those as authoritative user payload fields. Update teacher question responses with `is_home_based`, per-period evaluator roles and `gradingDates` (legacy references T3/T6). Keep active compatibility aliases and add fields without dropping existing clients' fields.

Old active backups need defaults: `parent_id=None`, `evaluator_role='teacher'`, `teacher_evaluation_date=None`, `parent_submitted_at=None`. Old-backup restoration must apply the same conservative non-home backfill in its restore transaction, or clearly flag unresolved dates for a separate approved conversion; otherwise the migration's one-time backfill will never repair later restored historical rows. Never assign a parent from the current link. New backups must round-trip every provenance value. Restore's existing validation-before-delete, preserved live accounts and single commit remain intact (`backend/utils/backups.py:28-63`).

### 3.5 Migration verification and cutover

The proposed migration's `--check` must verify selected schema, ledger presence, types, nullability, role default/check, parent FK with `SET NULL`, unchanged unique key and original FK deletion behaviors. For migrated data, compare original-column digests and exact backfill results before commit; assert ambiguous home rows and populated dates are unchanged. Test two consecutive applications and a failed/mismatched partial schema.

Add a **read-only** evaluator readiness check in `backend/main.py` next to the existing checks (`:23-40`); startup must never apply DDL. Review `backend/migrations/phase1_schema.py:6-28` and `backend/migrations/phase2.py:15-43,53-90`, because both derive requirements from current metadata. Support the explicitly tested installation chain and document the order; do not casually rewrite historical migrations to make an individual test pass.

Proposed commands after implementation/approval, **not run in this audit**:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.eccd_evaluator_tracking --apply
uv run --no-project --python .venv312 python -m backend.migrations.eccd_evaluator_tracking --check
```

No automatic destructive down migration is recommended. Preserve the additive columns on application rollback; take account of the old startup check's exact-column comparison (D6). An old backend restart is not an adequate rollback procedure. Rehearse a compatible rollback artifact or restore a verified pre-migration database only under a separate approved recovery action, reconciling any subsequent writes first.

### 3.6 Optional legacy-to-PostgreSQL data transfer boundary

Adding columns to existing PostgreSQL records is not the same as importing legacy MySQL data. If transfer is approved later:

- Export timestamps with a verified source timezone, preserve existing provenance verbatim, and map parent/teacher/student/question IDs through verified identity mappings. Do not match parents by names or assume numeric IDs are globally identical.
- Import prerequisite identities/questions/sections before evaluations. Map legacy teacher window flags to section windows as in S1-S4, with conflict detection.
- Preserve required `evaluation_date`, role values and the original composite unique key. Convert physical answer enum labels through the ORM or explicit mapping (D7); preserve public answer meaning. Stop on answer/key conflicts; do not silently use last-write-wins or invent a second evaluation row.
- Validate orphan counts, row counts, protected LRN hashes/envelopes, provenance values and exported workbook/summary equivalence on synthetic or appropriately controlled data before any production transfer.

These are prospective transfer requirements derived from legacy FK/unique definitions (`AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql:133-148`; `AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql:22-36`) and active ID/constraint mappings (`backend/models/eccd.py:68-91`; `backend/utils/access.py:23-33`). No transfer scripts or data export are part of this deliverable.

## 4. Step-by-Step Implementation Plan

All edits below require subsequent migration-plan approval. They have **not** been made. Proposed new files are explicitly identified; existing file locations are verified in Section 2.

### Phase 0 — Approve contracts and freeze a reproducible baseline

1. Review D1-D7, T1-T10, P1-P9, S1-S5 and A1-A8. Decide saved-only carry-over and selected-period behavior against the current legacy source. Preserve active normalized assignments, six granular flags, SYNCED ownership, unpublished-result null masking and durable drafts.
2. Decide how to handle parent read-after-save visibility without exposing unreleased evaluation data (P5). Default plan retains strict masking. A separate own-observation response, if wanted, needs an explicit authorized contract and tests; copying the legacy editable-window query is not approved by existing masking rules.
3. Decide date-granularity legacy timestamp parity versus exact instant tracking; record source/target timezone treatment. Do not silently change `CURRENT_DATE()` semantics.
4. Decide whether legacy settings and parent-link HTTP aliases must remain available. They differ from active normalized APIs (S2 and Section 2.6). Decide whether paging/export and new submission-audit events are in scope; neither is a missing legacy implementation.
5. Capture a fresh working-tree baseline and preserve the current uncommitted editing-window implementation. No branch switching or unrelated changes are necessary.

**Exit criteria:** Approved contract matrix, migration version, visibility rules, timestamp semantics, maintenance/cutover procedure and rollback rehearsal scope. No unresolved rule permits unmasking unreleased scores.

### Phase 1 — Implement evaluator schema, backup and installation compatibility

| Exact proposed file edits | Required verification |
| --- | --- |
| Add `backend/migrations/eccd_evaluator_tracking.py` with `--apply`/`--check`, ledger version, semantic inspection, locked additive DDL, exact conservative backfill, preservation verification and sanitized errors. | Existing-data upgrade, fresh installation, rerun no-op, incompatible existing field/constraint, interrupted/failing migration rollback, retained counts/IDs/answers/dates, unambiguous school-only backfill. |
| Edit `backend/models/eccd.py` and optionally `backend/models/parent.py` for fields/check/FK/navigation; keep unique key and existing teacher FK. | Parent deletion nulls only parent provenance; teacher deletion nulls only teacher FK; no answer deletion; invalid role/parent ID rejected; original composite uniqueness unchanged. |
| Edit `backend/schemas/eccd.py`, `backend/schemas/backup.py` and `backend/utils/backups.py` for typed provenance, old backup defaults and conservative restore conversion. | New encrypted round-trip retains all four fields; old backup still restores with conservative dates; malformed role/orphan parent rejected without committing deletion; users/keys preserved. |
| Edit `backend/main.py` and `backend/migrations/README.md`; review/update `backend/migrations/phase1_schema.py` and `backend/migrations/phase2.py` only as required for a documented fresh/upgrade chain. | Old/new schema combinations fail clearly; migration precedes the updated strict readiness checker; startup performs checks only. No `create_all` or automatic DDL. |
| Add proposed `backend/tests/test_eccd_evaluator_tracking.py`; extend existing migration fixtures in `backend/tests/test_phase1.py`, `backend/tests/test_phase2.py`, and isolated server `backend/tests/serve_phase3.py` if their setup chain requires it. | Disposable PostgreSQL schemas only; no writes to school data. Assert original-column digests and dates on repeated migration. |

### Phase 2 — Fix persistence and every official-date consumer

| Exact proposed file edits | Required verification |
| --- | --- |
| Edit `backend/utils/assessments.py`: teacher dates/chronology use explicit teacher-date fields; teacher upserts update acting teacher and role, preserve parent history; normalize only already teacher-dated session rows; reject empty batches. | Parent-only later rows do not constrain official chronology; confirmed PRE < MID < POST remains strict; partial domain saves preserve parent-only rows and their timestamps; substitute confirmation changes teacher attribution; invalid batch leaves all rows unchanged. |
| Edit `backend/routes/eccd.py` and `backend/schemas/eccd.py`: parent saves resolve authenticated Parent identity, support the approved single-period contract, home-only validation and independent parent timestamp; preserve all gates. | Forged parent/teacher/role data cannot override identity; non-home/unknown questions rejected; unchanged parent resubmission updates parent timestamp according to approved clock semantics; parent correction preserves teacher date and compatibility date; teacher confirmation preserves parent metadata. |
| Add proposed `backend/utils/eccd_dates.py` or a clearly isolated equivalent helper within `backend/utils/assessments.py`, using explicit teacher/parent/official-date projections. | No fallback from parent timestamp or compatibility date to an official teacher date; minimum teacher session resolution is consistent across clients and exports; unconfirmed periods keep official age/score null. |
| Edit `backend/utils/excel.py`, `backend/utils/checklist_workbook.py`, `backend/routes/eccd.py` section summary and `backend/routes/parents.py` ECCD summary to use that shared resolver. | Parent-only marks may appear as marks where permitted, but official dates/age/scaled/standard scores remain blank until a teacher date exists; confirmed outputs agree across checklist, matrix, APIs and ages; keep 30-student batching and protected LRNs. |
| Edit import logic in `backend/utils/excel.py`: teacher provenance, session normalization and final multi-period chronological validation before per-student commit. | Invalid date order rolls back that student's demographics/guardians/evaluations and retains other students' successes; existing parent metadata survives teacher import; chosen dates propagate only to teacher-dated rows. |
| Extend `backend/tests/test_phase2.py`, `backend/tests/test_parent_assessment_access.py`, `backend/tests/test_parent_linking.py` and proposed lifecycle test module. | Cover parent → teacher → parent → teacher transitions, parent/teacher deletion, chronology, import, export, released/unreleased reads and all open/closed permission combinations. |

### Phase 3 — Restore teacher checklist provenance and saved-only auto-fill

1. Edit `frontend/src/types.ts` for evaluator roles, `is_home_based`, `gradingDates` and any approved carry projections; extend matching backend response schemas. Preserve existing response aliases.
2. Edit `frontend/src/hooks/useTeacherAssessment.ts` to separate committed answers, explicit drafts and computed inherited values per question. Use a shared pure helper if appropriate (proposed new `frontend/src/utils/eccdDrafts.ts`). Generated carry-over must not be indistinguishable from manual edits or become queued writes by itself.
3. Edit `frontend/src/pages/teacher/EccdAssessment.tsx` to render parent/home provenance and saved/draft counts, and use official date/age projections. Keep explicit selected-period save and the active layout's responsive controls. Do not patch only the unused `TeacherChecklist.tsx`.
4. Extend `frontend/tests/teacher-portal-parity.spec.ts` or add proposed `frontend/tests/eccd-evaluator-tracking.spec.ts`. Test partial saved domains, independent MID DI-KAYA, changed earlier DI-KAYA, no propagation of unsaved KAYA, teacher override of a parent answer, two teacher actors, reload and lost responses.

**Exit criteria:** Virtual carry-over never changes database counts or official dates; only explicit save changes a selected period. Later independent committed answers survive earlier edits. Confirmed response handling cannot erase a newer draft revision. Test mobile/tablet/desktop in the existing harness; report console/network failures rather than relying only on screenshots.

### Phase 4 — Restore parent checklist organization and selected-period saving

1. Edit parent response construction in `backend/utils/assessments.py` and schemas in `backend/schemas/eccd.py` to return school questions for read-only display, with unreleased answers/metrics still null. Preserve `homeBasedChecklist` as the home-only compatibility list. Do not broaden the write validator.
2. Edit `frontend/src/hooks/useParentAssessment.ts` and `frontend/src/pages/parent/ParentEccdAssessment.tsx` for selected open period, home-first groups/domain navigation, school view-only rows, approved carry projections and single-period save. Bind controls to `canEditPeriod`; select the first open period when the prior selection closes.
3. Scope saved observations/drafts by current owner/student/domain/period. Preserve queued requests, manual later answers, drafts for closed periods, stale-response guards and retry after teacher reopens access. Do not adopt the legacy component's state-reset or storage-deletion behavior.
4. Reconcile old active mixed-period pending request payloads when introducing single-period contracts. Either accept an explicit transitional adapter with all-period prevalidation, or migrate/split each stored request by period without clearing it. Confirm each exact submitted revision independently. A new 400/422 response must not silently discard old offline work.
5. Extend `frontend/tests/parent-portal-parity.spec.ts`, `frontend/tests/parent-assessment-access.spec.ts`, and backend access/lifecycle tests. Test all-closed/one-open/multiple-open, teacher closes while offline, no school-row submission, own unreleased observation display policy, hidden intermediate carry sources, user/child switching and refresh after confirmation.

**Exit criteria:** Parent cannot edit school questions or closed periods. Saves apply only to the approved period. All required release masking remains intact. Reload/network failure does not lose inputs; global `localStorage.clear()` is prohibited.

### Phase 5 — Reconcile teacher settings contracts without duplicating storage

1. Keep existing section window implementation in `backend/models/section.py`, `backend/utils/assessment_access.py`, `backend/routes/teachers.py`, `frontend/src/components/teacher/ParentAssessmentAccessSettings.tsx` and its mounted `TeacherSettings.tsx` integration.
2. If legacy API compatibility is approved, edit `backend/schemas/teacher.py` and `backend/routes/teachers.py` to map legacy window names and the home-edit alias to the existing canonical six fields/section windows. Explicitly require section selection for ambiguous multiple assignments. Do not add coarse permission columns or teacher-owned duplicate windows.
3. Any legacy data conversion maps stored permission values rather than applying changed active defaults. Reject ambiguous section ownership instead of taking the first teacher record.
4. Extend `backend/tests/test_parent_assessment_access.py`, `backend/tests/test_parity.py`, `frontend/tests/teacher-portal-parity.spec.ts` and `frontend/tests/parent-assessment-access.spec.ts` for both canonical and approved legacy contracts.

**Exit criteria:** Three working period switches; values persist across adviser replacement; inactive assignments cannot manage windows; six granular Primary Adviser permissions independently apply; toggles do not publish results; offline intent survives errors.

### Phase 6 — Restore audit response/display parity and event detail

1. Edit `backend/routes/analytics.py` to derive actor names using Teacher/Parent/User fallbacks, return `actor_name`/`role`, retain active and legacy ID/action aliases, exclude internal rollover events, and preserve timestamp/ID ordering and Chairman-only access.
2. Edit `backend/schemas/operations.py` (`AuditLogItem`) and `frontend/src/pages/chairman/SystemAuditLog.tsx` for the typed fields, Role column/badges and detail preview/dialog. Preserve full details, keyboard-accessible row activation and error feedback.
3. Edit `backend/routes/chairman.py` transfer event details for affected students and source/destination sections. Edit `backend/routes/settings.py` to detect unchanged saves and log appropriate changed-field context in the same transaction. Use masked labels/IDs, never raw LRNs, credentials or entire request bodies.
4. Keep active parent-link and section-window transactional events. Assessment/global-permission audit events, structured target columns, immutable role snapshots, server-side pagination/filter/export are separate approved enhancements; if adopted, add typed contracts and targeted tests instead of calling them parity fixes.
5. Extend `backend/tests/test_parity.py` and `frontend/tests/chairman-parity.spec.ts` for parent and teacher full names, Chairman role, missing/deleted actor fallback, suppressed snapshot/chunk events, identical alias responses, chronological ties, search behavior, multiline details and no-op settings/transfer detail.

**Exit criteria:** Response aliases agree; roles/actors display correctly; internal undo data remains stored but absent from the normal audit viewer; failures roll back both action and log; unauthorized roles get 403. Parent deletion/actor retention tests preserve the active `SET NULL` improvement.

### Phase 7 — Full verification and controlled deployment

Only after implementation and approval, use existing tools/dependencies and disposable database fixtures:

```powershell
# Type checks: root references alone do not check both projects fully.
pnpm.cmd --dir frontend exec tsc --noEmit
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build

# Existing backend test runner; fixture isolation must be checked first.
uv run --no-project --python .venv312 python -m unittest discover -s backend/tests -t . -v

# Existing dedicated window acceptance harness.
pnpm.cmd --dir frontend exec playwright test --config playwright.parent-assessment-access.config.ts
```

Run new lifecycle/UI tests through the repository's appropriate existing harness as configured during implementation. Do not claim previous context test counts as current results. Investigate failures against the fresh baseline and report unrelated failures explicitly.

Rehearse the upgrade and fresh-install chains, schema `--check`, backup/restore and rollback in isolated PostgreSQL schemas first. Then schedule the approved cutover: stop writers, take verified backups, apply additive migration, deploy matching backend/model/serializer changes, run readiness checks, deploy compatible frontend, and perform teacher/parent/Chairman acceptance with approved test accounts. Ensure offline old-client submissions survive the transition. Never launch test reset/seed endpoints against school records.

### Final review gates

| Gate | Acceptance evidence required before migration sign-off |
| --- | --- |
| Data preservation | Original evaluation columns/rows unchanged by schema migration; only eligible teacher dates filled; no invented parent identity; all populated metadata survives rerun and restore. |
| Independent provenance | Parent and teacher lifecycle tests prove separate dates/IDs, safe override behavior and `SET NULL` deletion. No official date/age/scaled score from a parent-only timestamp. |
| Workflow parity | Saved-only per-question inheritance and selected-period save match approved semantics; unrelated committed answers remain; school questions remain read-only. |
| Permission integrity | Six canonical adviser flags, SYNCED ownership and section windows enforce 403 independently; unreleased metrics/answers stay masked. |
| Offline durability | Reload, disconnect, 403/422, stale HTTP response and older queued payload cases retain exact owner/student/period/domain revisions until explicitly confirmed. |
| Audit integrity | Actor/role fields and internal-event exclusion match approved contract; existing transactional link/window logs remain; no implied historical submission logs. |
| Deployment compatibility | Updated ORM, explicit migration, backup schema, fresh-install adapters and strict startup checker operate as a tested release unit; rollback is rehearsed. |

**Audit verification record:** Source inspection and citation/preservation checks only. No application tests, migrations, database reads/writes, server startup, branch creation/switching or deployment were performed for this report. The only intended new project artifact is `LEGACY_MIGRATION_AUDIT_REPORT.md`.

Final static validation found **39 classified findings**, **318 valid source-path/line references across 80 cited files**, and no missing cited file or out-of-range citation. SHA-256 comparison of **420 files** in the inspected active/reference trees found **zero changed, added or removed files** within that preservation set. Final root Git status retains the original working-tree changes and adds only this report; the branch remains `unsure-check-first`. These checks establish source preservation and reference validity, not runtime acceptance.
