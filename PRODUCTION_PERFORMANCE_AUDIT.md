# AMES: complete audit of the 61 performance-task changes

**Reviewed: 2026-10-26. Comparison: the current working tree against Git HEAD
`93654b3`.** This document accounts for every file changed during the production
performance task. It explains the implementation, deletions, tests, measured
results and deployment work still required.

## Start here: why Git shows 61 changes

Git is counting **61 files**, including this report:

| Git state | Files | Meaning |
| --- | ---: | --- |
| Modified (`M`) | 42 | Existing files with edits |
| New (`??` in Git; `New` below) | 7 | New files, currently untracked |
| Deleted (`D`) | 12 | Unreferenced frontend components/assets removed |
| **Total** | **61** | **42 + 7 + 12** |

The work spans several related layers. For example, the 18 indexes require model
declarations, an explicit migration, bootstrap integration, configuration/docs and
tests. Route splitting touches the app router, its three layouts, a loading/error
component and browser tests. These related edits explain much of the file count.

The largest frontend deletions are unused form/checklist components. Much of the
large `App.tsx` diff is indentation after wrapping its routes; route URLs and role
guards remain. There were no package/version upgrades or model retraining in this
patch. No commit, push or hosted deployment was performed for the task.

This follow-up expands this existing Markdown file only, so the count remains 61.
The file-by-file ledger is followed by the original findings, implementation
details, test evidence and remaining limits, all in this one document.

## Complete file-by-file change ledger

Each changed path appears once in the following numbered inventory. Status is
relative to the HEAD snapshot above; `New` corresponds to Git's `??` state.

| # | Status | File | What I changed and why |
| ---: | --- | --- | --- |
| 1 | M | `AI_CONTEXT.md` | Updated the migration inventory from 001–013 to 001–014. Added the implemented concurrency, batching, pooling, lazy-loading and cleanup summary, measured bundle sizes and verification results so later work uses the current architecture. |
| 2 | M | `DEPLOYMENT.md` | Updated fresh-bootstrap coverage to 001–014; added explicit apply/check commands for migrations 013 and 014. Documented the pool defaults, connection budget per process, maintenance-window index creation and lazy-page recovery. |
| 3 | M | `backend/.env.example` | Added four non-secret pool settings with defaults: size 5, overflow 5, timeout 15 seconds and recycle 300 seconds. Existing runtime `.env` credentials were not edited. |
| 4 | M | `backend/config/database.py` | Passed those four settings into `create_engine`. Kept pre-ping, connection timeout and existing TLS/root-certificate handling. This makes connection capacity and stale-idle recycling explicit. |
| 5 | M | `backend/config/settings.py` | Added validated integer settings for pool size (1–50), overflow (0–50), timeout (1–120 seconds) and recycle (30–3600 seconds), with the template defaults. This rejects unbounded/invalid configuration values. |
| 6 | M | `backend/main.py` | Extracted synchronous startup checks, reference initialization and model warming into `initialize_runtime()`. The async lifespan awaits it through `run_in_threadpool`, keeping startup's blocking work off the event loop. |
| 7 | M | `backend/migrations/README.md` | Documented migration 014, its apply/check commands, idempotence, five-second lock timeout and writer-blocking transactional index creation. Updated the bootstrap version range. |
| 8 | M | `backend/ml/inference.py` | Reused the already-calculated probability array to select the maximum-probability class. Removed the second `pipeline.predict(frame)` traversal. The saved Random Forest artifact, features and scoring tables are unchanged. |
| 9 | M | `backend/models/eccd.py` | Declared four supporting indexes: question domain/sequence, evaluation teacher, evaluation parent and evaluation question. Existing student/period and unique evaluation constraints remain. |
| 10 | M | `backend/models/email_verification.py` | Declared indexes on account/purpose and expiry to support challenge lookup/operational expiry access. Retained challenge-hash uniqueness and attempt validation. |
| 11 | M | `backend/models/log.py` | Declared indexes on audit actor and action/log-ID. Kept the existing timestamp index. These support actor relationships and action-specific rollover history queries. |
| 12 | M | `backend/models/message.py` | Declared teacher/recent-message and teacher/unread-filter indexes. Kept the parent/teacher/thread index and the existing message columns. |
| 13 | M | `backend/models/parent.py` | Declared the family-link composite index `(parent_id, status, student_id)` for parent-scoped SYNCED/PENDING lookup. Link status rules and relationships are unchanged. |
| 14 | M | `backend/models/section.py` | Declared an index on the compatibility adviser foreign key `adviser_teacher_id`. It does not replace active `SectionTeacher` ownership or permission inheritance. |
| 15 | M | `backend/models/section_teacher.py` | Declared `(teacher_id, status, role, section_id)` to support active-adviser section lookup. Kept role/status constraints and active-adviser uniqueness. |
| 16 | M | `backend/models/student.py` | Declared a school-year index and `(is_active, last_name, first_name, student_id)` for roster filtering/order. Existing encrypted LRN fields, unique HMAC lookup and section/active index remain. |
| 17 | M | `backend/models/trusted_device.py` | Declared indexes on device-token hash and account/expiry. The former supports explicit forgetting by token; the latter supports account-scoped expired-device cleanup. Existing account/token indexing remains. |
| 18 | M | `backend/models/user.py` | Declared `(role, is_active)` for account filtering. Existing case-insensitive email uniqueness, credentials and role values are unchanged. |
| 19 | M | `backend/routes/auth.py` | Converted login, parent registration and OTP-send handlers from `async def` to `def`, moving their synchronous ORM/password work into FastAPI workers. Replaced awaited mail calls with AnyIO's worker-to-loop bridge, retaining async delivery and existing failure cleanup. |
| 20 | M | `backend/routes/backup.py` | Kept the upload read asynchronous, then offloaded the complete `restore_backup` operation. Chat disconnection remains awaited after successful restore. Backup validation, preservation and transaction behavior remain in the existing restore utility. |
| 21 | M | `backend/routes/chairman.py` | Batched student transfer lookup by IDs or protected LRN hashes; missing students are rejected before assignment changes. Replaced per-section adviser/teacher queries with one adviser batch while preserving newest-active-assignment selection. |
| 22 | M | `backend/routes/eccd.py` | Updated the teacher ECCD student list to eager-load profile relationships and use shared batch serialization. This removes per-student profile queries without changing assessment-save logic. |
| 23 | M | `backend/routes/messages.py` | Rewrote contact listing to batch linked children/accounts and aggregate latest-message timestamps. Parent listing queries eligible current advisers directly instead of checking every teacher individually. Active-account, role, SYNCED-link and active-child filters remain. |
| 24 | M | `backend/routes/settings.py` | Separated async request/upload preparation from synchronous persistence. Added `persist_settings()` and `persist_background()`, called through the threadpool, so database writes/serialization execute in a worker. |
| 25 | M | `backend/routes/students.py` | Applied eager-loading and batch profile serialization to staff rosters, section lists and parent linked-child lists. Existing adviser/link projections, ordering, response fields and access checks remain. |
| 26 | M | `backend/routes/teachers.py` | Converted the password-change request handler to `def` and bridged its async OTP email from the worker. Existing Excel-import offloading and teacher CRUD logic were preserved. |
| 27 | M | `backend/scripts/README.md` | Corrected the documented fresh-bootstrap range to 001–014 to match the seed runner. |
| 28 | M | `backend/scripts/seed_supabase.py` | Registered migration 014 in the ordered migration list and added its final index check. Fresh/upgrade bootstrap can create the indexes, and repeated bootstrap validates them. |
| 29 | M | `backend/tests/test_batch1.py` | Corrected an older test that accepted missing/blank teacher last names. It now expects validation errors, matching the existing production schema and newer teacher-creation tests. No production name-validation rule was weakened. |
| 30 | M | `backend/utils/access.py` | Extracted pure `permissions_for_adviser()` and `age_at_school_year()` helpers. Existing database-backed wrappers delegate to them, allowing batch callers to reuse already-loaded advisers/settings with the same permission/age rules. |
| 31 | M | `backend/utils/excel.py` | Added `ChecklistData` and a batch loader for advisers, guardians, evaluations, questions and settings. ZIP exports reuse that data; summary workbooks load all three periods together per 30-learner workbook. Kept templates, protected-LRN export, date/scoring rules and workbook splitting. |
| 32 | M | `backend/utils/parent_links.py` | Added `contains_eager(User.parent)` to the existing joined account-link query. Display-name resolution can reuse the fetched parent profile instead of triggering extra lazy loads. |
| 33 | M | `backend/utils/realtime.py` | Added synchronous socket authentication, authorization and saved-message helpers with worker-owned sessions. Async events offload those helpers, keep emissions async, recheck recipient membership after waits and use generation checks to reject stale room joins/leaves. |
| 34 | M | `backend/utils/students.py` | Added shared eager-loading options, batch staff/parent serializers and optional preloaded settings/adviser inputs. Parent guardians reuse loaded family links. Existing masked profile fields and fail-closed permissions remain. |
| 35 | M | `frontend/eslint.config.js` | Excluded generated `test-results`, `playwright-report` and Playwright cache output from lint, alongside `dist`. Application source, test source and configuration still receive lint checks. |
| 36 | M | `frontend/src/App.tsx` | Replaced eager page/layout imports with module-scope `React.lazy()` imports; kept login eager. Wrapped routes in `RouteContent` and reused one ECCD-question component import for both roles. The large diff also includes route-block indentation. |
| 37 | D | `frontend/src/assets/hero.png` | Removed an unused image after reference checks found no runtime/test consumers. The active `background_pic.webp` asset remains. |
| 38 | D | `frontend/src/assets/react.svg` | Removed an unused starter React asset with no runtime/test references. |
| 39 | D | `frontend/src/assets/vite.svg` | Removed an unused starter Vite asset with no runtime/test references. |
| 40 | D | `frontend/src/components/PasswordValidator.tsx` | Removed the unused generic validator component. The separately located, actively imported `components/teacher/PasswordValidator.tsx` remains. |
| 41 | D | `frontend/src/components/StatCard.tsx` | Removed an unreferenced standalone statistics-card component. Active dashboard cards remain in their routed pages. |
| 42 | D | `frontend/src/components/StudentForm.tsx` | Removed an unreferenced standalone student form. Active routed student-management forms and their durable draft logic remain. |
| 43 | D | `frontend/src/components/eccd/AssessmentChecklist.tsx` | Removed an unreferenced checklist component. Routed teacher/parent ECCD pages and assessment hooks remain. |
| 44 | D | `frontend/src/components/parent/ChildSelection.tsx` | Removed an unreferenced child-selection component. Current child selection through active parent pages/hooks remains. |
| 45 | D | `frontend/src/components/teacher/TeacherChecklist.tsx` | Removed an unreferenced teacher checklist component. The active teacher ECCD assessment page remains. |
| 46 | D | `frontend/src/components/teacher/TeacherDialog.tsx` | Removed an unreferenced dialog wrapper. Routed pages' active dialogs remain. |
| 47 | D | `frontend/src/components/teacher/TeacherSkeleton.tsx` | Removed an unreferenced loading-placeholder component. Active page loading states remain. |
| 48 | D | `frontend/src/components/teacher/TeacherStudentForm.tsx` | Removed an unreferenced teacher student-form component. Active student enrollment/edit forms remain in the current student-management implementation. |
| 49 | M | `frontend/src/layouts/ChairmanLayout.tsx` | Rendered a `RouteContent` child inside `MainLayout`. Child pages can load/suspend within the portal layout, rather than replacing the whole shell during navigation. |
| 50 | M | `frontend/src/layouts/ParentLayout.tsx` | Replaced the direct child `Outlet` with `RouteContent`, adding the same page loading/recovery boundary inside the parent layout. |
| 51 | M | `frontend/src/layouts/TeacherLayout.tsx` | Replaced the direct child `Outlet` with `RouteContent`, preserving the teacher provider/section controls around lazily loaded pages. |
| 52 | M | `frontend/src/pages/teacher/MlInsights.tsx` | Replaced unbounded `Promise.allSettled` fan-out in Predict All with the new queue at a concurrency limit of three. Existing result/error handling and AbortController feed into the queue. |
| 53 | M | `frontend/tests/teacher-management.spec.ts` | Added `await page.unrouteAll({ behavior: "wait" })` during teardown before checking page errors. This lets intercepted post-save refreshes finish before Playwright disposes their response context. |
| 54 | M | `render.yaml` | Added the four pool defaults to Render's environment blueprint so deployment settings agree with backend defaults and the example template. |
| 55 | New | `PRODUCTION_PERFORMANCE_AUDIT.md` | Created the original findings/action plan and implementation/verification report. Expanded it in this documentation follow-up to account explicitly for all 61 Git paths. |
| 56 | New | `backend/migrations/production_performance.py` | Added explicit migration `014_production_performance` for 18 non-unique B-tree indexes. It uses the migration ledger, transactional creation, a lock timeout and schema/index validity checks; repeated application validates instead of rewriting data. |
| 57 | New | `backend/tests/test_production_performance.py` | Added seven regressions covering list-query growth, contact revocation, missing-ID transfer atomicity, auth SQL/email thread separation, migration preservation/idempotence, wrong-index rejection and a stale socket-leave race. Database tests use disposable schemas. |
| 58 | New | `frontend/playwright.performance.config.ts` | Added desktop/mobile test configuration using the built site's Vite preview on loopback port 5190. It isolates the new production-build tests and stores generated results under the ignored test-results directory. |
| 59 | New | `frontend/src/components/RouteContent.tsx` | Added a reusable Suspense loading state and error boundary with a manual Reload page button. It can render children or a router Outlet and does not clear locally saved inputs. |
| 60 | New | `frontend/src/utils/concurrency.ts` | Added typed `settleWithConcurrency()`: validates the worker limit, preserves result order and individual failures, and stops starting queued tasks after cancellation. In-flight request cancellation still uses the supplied AbortController in the caller. |
| 61 | New | `frontend/tests/performance.spec.ts` | Added five scenarios run on desktop/mobile: queue limits/order/failures, cancellation, deferred login chunks, protected production deep links, and failed-chunk reload with input preservation. Browser API responses in this suite are mocked. |

### How the changes fit together

1. **Database concurrency:** files 3–6, 19–20, 24, 26, 33 and 54 configure a
   bounded pool and move blocking work into workers while preserving asynchronous
   upload, email and socket operations.
2. **Fewer network round trips:** files 21–23, 25 and 30–34 batch related records
   and reuse them during serialization/export. The measured query-count table
   later in this report shows their behavior as the synthetic dataset grows.
3. **Supporting indexes:** files 9–18 declare the 18 indexes; files 28 and 56
   integrate their explicit application/checking. Documentation covers rollout.
4. **Smaller initial frontend load:** files 36, 49–51 and 59 defer pages while
   supplying loading/error states. Files 52 and 60 also bound Predict All traffic.
5. **Cleanup and evidence:** files 37–48 remove verified unused frontend files;
   files 29, 53, 57–58 and 61 adjust/add validation. The remaining docs explain
   the implementation and deployment responsibilities.

### Changes that deserve the closest review

| Area | Behavior/review implication |
| --- | --- |
| Pool settings | The default permits up to 10 connections per API process. Workers/replicas multiply this number; the selected Supabase plan still needs a connection budget. |
| Async-to-sync auth handlers | SQL/password work moves to workers. AnyIO schedules the async mail coroutine on the loop; that worker waits for the delivery result. This frees the event loop but still consumes a bounded worker slot during email delivery. |
| Batched contacts/profiles | These replace per-record lookup paths. Existing role, active-account/child, SYNCED-link, adviser and masking conditions must continue to match authorization rules; regressions cover the exercised revocation/scoping cases. |
| Batched exports | They reduce round trips by holding related records in memory. Large exports still need production memory/load measurement and are not background jobs. |
| ML inference | The class label now comes from the maximum of the probabilities already computed by the same classifier. Existing ML tests pass; no artifact replacement or model-validity claim is involved. |
| Lazy routes | A first visit needs that route's chunk. Failed loads offer manual reload. This does not install a service worker or guarantee first-time offline page availability. |
| Prediction queue | At most three requests run per browser batch. This is a client limit; it is not a global server-wide inference scheduler across all users. |
| Index rollout | Migration 014 uses ordinary transactional CREATE INDEX and can block writers. It has no automated down-migration; a rollback of deployed indexes would need an explicit reviewed database change. |

### Exactly what was preserved

Existing HTTP paths and response contracts, school/assessment records, permissions,
encrypted LRN handling, scoring tables, blank export templates, model artifacts,
offline draft/sync utilities, dependency manifests/lockfiles and license files
remain. No new coarse parent-permission flag was introduced. The 12 deleted
frontend files are recoverable from the comparison commit if needed.

The database migration was exercised in disposable schemas. It was **not applied
to the configured school database or a hosted Supabase database** during this
task. No Vercel/Render site was deployed. Before deploying an existing database,
run migration 014's apply/check steps in the maintenance window documented below.

### What this follow-up verified

I re-read the actual Git diffs/new files and existing verification logs, rather
than deriving this list from filenames alone. The inventory is checked against
all 61 Git paths for omissions, duplicates and status mismatches. The prior full
test result is **329/329 backend tests**, and prior TypeScript/lint/build results
and the 66 exercised browser cases are detailed below, including initial failures
and their fixes/rerun. These are recorded results from the implementation task;
the test suites were not rerun for this Markdown-only follow-up.

Ignored generated logs and measurement helpers live under `frontend/test-results/`;
19 generated logs were moved into its `production-performance/` subdirectory.
They are local evidence, outside the 61 Git-visible changes. No historical audit
document, environment, dependency store or school-data artifact was deleted as
part of that log organization.

## Phase 1: findings and implementation plan

Scope: active backend/frontend, models, explicit migrations, seed bootstrap,
tracked tests, browser configurations, imports, subscriptions and repository files.
No deployed Render/Supabase credentials or production workload are used.

| Finding | Evidence | Safe action |
| --- | --- | --- |
| Blocking auth/password operations in async handlers | routes/auth.py; teachers.py password request: synchronous ORM, bcrypt and commits surrounding awaited email | Use sync FastAPI handlers; invoke async mail through AnyIO's worker-to-loop bridge |
| Blocking settings/restore and Socket.IO DB work | routes/settings.py, backup.py; utils/realtime.py | Await upload/network I/O; offload complete synchronous DB units, keeping socket sessions inside their worker |
| Roster serialization N+1 | public_student accesses section, family links, parent/user profiles and settings per student | Eager-load collections and scalar relationships; load settings once per response |
| Messaging contact N+1 | children, teacher_sections, latest message and identity queries per contact; parent scans every teacher | Batch authorized contacts, children and aggregate latest timestamps; retain active relationship/role gates |
| Section/transfer/export N+1 | chairman section loop, per-ID transfer resolution, summary workbook student/period loop | Batch queries while retaining missing-ID errors and ordering |
| Pool relies on defaults | config/database.py only sets pre_ping and connect timeout | Validated small bounded size/overflow, checkout timeout and recycle settings |
| Missing supporting indexes | metadata and migration review | Add 014 additive index migration, seed integration and explicit deployment instructions |
| All route pages eagerly imported | App.tsx; baseline Vite build | React.lazy/Suspense for pages and portal layouts; measure generated chunks before considering vendor overrides |
| Dead component/assets candidates | readiness audit L3 and repository reference scan | Remove only zero-runtime/test-reference candidates; preserve offline utility and licenses |

Existing lower(email) uniqueness, protected LRN unique hash, student/period index,
message-thread and timestamp indexes must not be duplicated. The real schema uses
is_active (not is_archived), teacher_id/parent_id (not sender_id/receiver_id),
testing_period, system_logs.timestamp, email_verifications and user_trusted_devices.
Single-column low-cardinality indexes are not automatically useful; use observed
query prefixes. PostgreSQL B-trees can scan backwards for descending timestamps.

Analytics already aggregates in SQL; audit actors already use outer joins. ML
readiness already batches evaluations; inference routes and spreadsheet exports
are sync def, and import parsing already uses run_in_threadpool. Brevo uses
httpx.AsyncClient with bounded timeouts. Preserve these paths and all JSON/API,
masking, ownership, evaluation, encryption and offline durability contracts.

Validation plan: baseline build/backend discovery; regression tests for bounded
query growth, index migration repeatability/integrity and worker/event-loop
behavior; full TypeScript/lint/build/unittest gates; representative desktop/mobile
Playwright workflows. Use disposable schemas for data-changing tests. Report
failures and limits honestly; do not substitute old test results.

Baseline build: entry **1,406.76 kB / 417.42 kB gzip**, CSS **136.30 kB /
22.25 kB gzip** (Vite 8.3.5). Backend baseline running at plan publication.

## Phase 2: implemented changes

### Backend concurrency and query behavior

- Auth login/register/OTP and teacher password requests are `def` handlers.
  Synchronous SQL, bcrypt, commits, rollback/cleanup and serialization execute
  in FastAPI workers. `anyio.from_thread.run` schedules the existing async mail
  coroutine on the application loop and propagates delivery errors to the worker.
  It does not schedule mail as an unconfirmed background task. Brevo/SMTP timeouts
  and failed-challenge behavior remain intact.
- Settings parse/await uploads first, then offload the complete persistence unit.
  Backup restore/decryption/validation/DB work runs through run_in_threadpool;
  socket disconnects remain awaited afterwards. Excel import was already offloaded.
- Socket auth, room authorization, persisted-message loading and recipient checks
  use worker-owned sessions and return plain data. Emits/room operations stay
  async. Room generations and recipient membership are rechecked after worker waits.
  Startup schema inspection/reference initialization/model warming is offloaded too.
- Student rosters eager-load sections/family/parent/account relationships and load
  school settings once. Parent children batch advisers and preserve fail-closed
  permission masking. Account-link identity projection eager-loads the profile.
- Message contacts batch eligible children/accounts and aggregate timestamps;
  parent contacts query linked current advisers instead of probing every teacher.
  PENDING links, archived learners and inactive/wrong-role accounts remain excluded.
- Chairman sections batch current advisers; transfers fetch identifiers together
  and fail before changing any student if an identifier is missing. Existing
  hashed-LRN lookup and requested order are retained.
- Checklist ZIPs batch advisers, guardians, evaluations/questions and settings;
  summary workbooks fetch evaluations once per 30-learner workbook, including all
  periods and joined question data. Existing templates/formula safety, dates,
  grouping and pagination beyond 30 learners are preserved.
- ML uses its already-computed probabilities to select the maximum-probability
  class instead of preprocessing/traversing the forest twice. The artifact and
  model parameters are unchanged. Browser Predict All limits requests to three,
  preserves input order and independent errors, and stops queued work on abort.

Every route module was checked: auth, analytics, backup, chairman, eccd,
eccd_config, messages, ml, parents, sections, settings, students and teachers.
All remaining async route handlers await upload/body I/O and offload DB units.
The synchronous ORM session is never used concurrently by multiple worker tasks.

Pool defaults are explicitly size=5, max_overflow=5, timeout=15s, recycle=300s,
pre_ping=true, connect_timeout=5s. Typed settings, backend template and Render
blueprint agree. These are per-process limits; multiply by workers and replicas.
Pre-ping/recycle recover stale checkouts, not interrupted transactions; no unsafe
automatic retry of writes was added.

### Schema/index matrix

Migration `014_production_performance` adds the following non-unique indexes.
Existing unique constraints/FKs/identity sequences are untouched.

| Table | Added index columns |
| --- | --- |
| users | role, is_active |
| students | school_year; is_active, last_name, first_name, student_id |
| eccd_questions | domain_id, sequence_order |
| student_eccd_evaluations | teacher_id; parent_id; question_id |
| family_access | parent_id, status, student_id |
| section_teachers | teacher_id, status, role, section_id |
| sections | adviser_teacher_id |
| messages | teacher_id, is_archived, created_at; teacher_id, is_archived, is_read, sender_role |
| system_logs | user_id; action_type, log_id |
| user_trusted_devices | device_token_hash; user_id, expires_at |
| email_verifications | user_id, purpose; expires_at |

Already covered: users lower(email) unique and normalized email unique; students
LRN HMAC unique and (section_id,is_active); evaluations (student_id,testing_period)
plus unique (student_id,question_id,testing_period); family student_id; teacher/
parent unique user_id; active-adviser section uniqueness; messages
(parent_id,teacher_id,is_archived,created_at); audit timestamp; user/device token
composite; OTP challenge hash unique. The device expiry index intentionally begins
with user_id because current expiry cleanup is account-scoped. There is no
student_id on messages, so no invented message/student index or schema change.

The 014 checker validates columns, non-uniqueness, absence of partial predicates,
PostgreSQL index readiness/validity and B-tree access method. Ledger locking and
transactional DDL make repeat applies safe; a conflicting definition fails instead
of being silently accepted. Seed tests cover fresh/resumed/concurrent bootstrap,
sequence advancement, reference fixtures, existing account preservation and repeats.
New migration tests drop the new indexes, apply twice and compare every school
table's data digest; a wrong existing definition is rejected.

Deployment: run 014 --apply then --check after 013 with writers stopped. Standard
CREATE INDEX blocks writers and uses a five-second lock timeout. This audit only
applied migrations to disposable test schemas, never the configured school schema
or a hosted database. Startup does not silently apply or require optional 014.

### Frontend health and cleanup

All protected page/layout modules and registration load via React.lazy; login
remains eager. Suspense boundaries inside layouts preserve the surrounding portal
while a page loads. An error boundary offers manual reload on chunk failure and
does not evict drafts. Default Vite 8/Rolldown splitting separates charting/chat/MUI
pieces without manual vendor grouping or a raised warning threshold.

Imports resolve through TypeScript/build checks. Reviewed auth expiry timers,
layout polling/media listeners, assessment refresh timers, parent ML refresh/abort
logic, student/settings online listeners and chat connection/room handlers have
matching cleanup. Chat disconnects its connection and unregisters room handlers.
Current API paths were checked against routes and exercised through browser/API
regressions. Lint excludes generated test-results/playwright-report/cache output,
while continuing to lint application source, test source and configuration.

Removed after exact-name/path scans across TS/TSX/CSS, configs and all available
Playwright sources (including ignored local verification scripts):

- assets/hero.png, assets/react.svg, assets/vite.svg
- components/PasswordValidator.tsx, StatCard.tsx, StudentForm.tsx
- components/eccd/AssessmentChecklist.tsx
- components/parent/ChildSelection.tsx
- components/teacher/TeacherChecklist.tsx, TeacherDialog.tsx,
  TeacherSkeleton.tsx, TeacherStudentForm.tsx

The teacher-specific PasswordValidator is referenced by TeacherSettings and stays.
eccdOfflineSync.ts is retained as the offline compatibility surface. License files,
blank workbooks, scoring data copies, ML artifacts, migrations, env templates and
required operational/research docs stay. No tracked backend/root scratch artifact
was proven disposable. Historical audit markdown files record different work and
are preserved rather than deleted as assumed duplicates. Local ignored test outputs
and environments do not ship through Git; deleting them is not a deployment fix.

### Follow-up items and practical limits

- Student directories, conversation history and audit responses remain full lists
  to preserve existing contracts and complete client-side filtering/CSV exports.
  Server pagination requires an explicit API/client change as data grows.
- Workbook import retains per-row locking/transactions and guardian authorization
  checks to preserve partial-success and cross-child permission behavior. Large
  imports/exports remain CPU/memory work in bounded threads, not background jobs.
- `setup_parity_dev.py` still references the absent development seeder already
  documented in AI_CONTEXT; use the supported seed_supabase runner. It was not
  deleted or invoked because it is a separately documented environment helper.
- `schemas/user.py` has no current runtime/test imports, but contains standalone
  account validation/response declarations; it is retained as a contract candidate
  for a separate cleanup. `schemas/log.py` must stay: AuditDetails is imported by
  the live audit serializer even though its older SystemLog* declarations are idle.
- Chairman domain charts make one request per configured domain (seven in the
  reference fixture). Teacher dashboard checklist fan-out only runs for historical
  multi-section ownership; current single-section views avoid those payloads.
  Changing these to aggregate APIs would require a separate response/client change.
- No production EXPLAIN/ANALYZE, Render cold-start/load benchmark or Supabase
  cardinality/connection-limit measurement was available. Index coverage and
  bounded query growth do not establish hosted latency or guaranteed planner use.
  Validate actual plans/latency and choose connection budgets on deployed data.
- The older ml-insights Playwright config references an independently running API
  and prior UI controls; it is not a portable full-suite runner. Current parent ML,
  teacher management, auth and production-build regressions provide the recorded
  browser evidence below; no unrun browser suite is claimed green.

### Verification results

The required TypeScript command (`pnpm --dir frontend exec tsc --noEmit`), full
frontend lint and production build all pass. Build also runs `tsc -b`, checking
the app/config project references rather than only the root solution tsconfig.
Git whitespace checks pass. Commands use pnpm.cmd on Windows.

The baseline full backend discovery ran 322 tests and found one pre-existing
error: test_batch1 expected missing/blank teacher last names to be accepted,
contradicting the current request schema and newer teacher-creation tests. Its
assertions now require ValidationError; no production validation was relaxed.
After implementation and this correction, full discovery passed **328/328**.
The definitive run including the socket race regression then passed **329/329**
in 642.470 seconds, with no errors, failures or skips. It uses the final backend
code and disposable schemas throughout:

```sh
uv run --no-project --python .venv312 python -m unittest discover -s backend/tests -v
pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend run lint
pnpm --dir frontend run build
```

All four requested gates pass. Use `--python 3.12` instead of `.venv312` outside
this Windows checkout. Required migrations, hosted TLS/email delivery and actual
provider performance remain deployment checks, not outcomes claimed by these tests.

Fresh browser evidence:

| Suite | Result |
| --- | --- |
| Teacher management, desktop/mobile | 18/18 pass in full rerun |
| Parent ML, desktop/mobile | 8/8 pass |
| Teacher ML sandbox, desktop/mobile | 4/4 pass |
| Production-build performance/recovery, desktop/mobile | 10/10 pass |
| Auth/terms, desktop/mobile | 25/26 in full run; interrupted desktop OTP case passes targeted rerun (all 26 cases verified across runs) |

Teacher management's initial 17/18 run revealed a test teardown race: an
intercepted post-save directory refresh was still fetching JSON when Playwright
disposed the request context. afterEach now waits for intercepted handlers before
page-error assertions/disposal. The full rerun passes. Auth's single first-run
failure was ECONNRESET on the loopback OTP-inspection GET, not an assertion or
mail-flow error; it passes on rerun without application changes. Windows fixture
shutdown logs include connection-reset/lifecycle noise; the results above come
from Playwright's test summaries. No production email was sent.

New backend regressions verify query growth with 12 added learners/accounts,
authorization revocation, missing-ID transfer atomicity, auth SQL outside the
mail event loop, data-preserving/idempotent indexes, wrong-index rejection and
stale Socket.IO leave protection. Existing workbook tests verify actual cells,
dates/scores and exports beyond 30 learners. The production preview tests verify
login requests no chart/chat chunks, protected deep links, chunk-failure recovery
without input eviction, queue ordering/failure isolation and abort behavior.
Their API data is mocked; real API/DB boundaries are covered by the other suites.

Measured SELECT counts include authentication/dependency queries. A separate
disposable-schema run compared the three-student baseline against 12 additional
active learners, parent accounts and unassigned sections:

| Endpoint / actor | Before growth | After growth |
| --- | ---: | ---: |
| /api/chairman/students / Chairman | 6 | 6 |
| /api/eccd/students / Teacher | 7 | 7 |
| /api/students/section/1 / Teacher | 7 | 7 |
| /api/students/linked / Parent | 6 | 6 |
| /api/messages/contacts / Teacher | 6 | 6 |
| /api/messages/contacts / Parent | 4 | 4 |
| /api/chairman/sections / Chairman | 3 | 3 |

These are post-change counts before/after data growth, not historical pre-change
counts or a hosted latency benchmark. Very large selectinload collections still
use bounded batches. Test/build runs overlapped; their wall times are not API
throughput measurements. Local measurement helpers are ignored files under
frontend/test-results, not deployment code.

Local logs are archived under `frontend/test-results/production-performance/`:
backend-test-baseline.log, backend-test-verified.log,
backend-test-complete.log, frontend-build-verified.log,
playwright-teacher-verified.log, playwright-parent-ml-performance.log,
playwright-ml-sandbox-performance.log, playwright-auth-performance.log,
playwright-auth-rerun.log and playwright-production-performance.log. These ignored
outputs are local evidence, not deployment inputs.

Production Vite build (decimal kB; gzip sizes from Vite):

| Asset | Minified kB | Gzip kB |
| --- | ---: | ---: |
| Previous entry | 1,406.76 | 417.42 |
| New entry | 318.79 | 102.13 |
| Deferred charts (largest chunk) | 329.13 | 96.27 |
| Deferred chat | 53.61 | 17.46 |
| Teacher ML page | 37.24 | 9.45 |
| Parent ML page | 14.79 | 4.98 |
| Teacher ECCD page | 62.68 | 20.13 |
| Parent ECCD page | 32.50 | 9.14 |
| Initial CSS | 99.75 | 17.20 |

The entry alone shrank 77.3%; this is not a claim that initial transfer is only
318.79 kB. HTML includes 11 shared modulepreloads. Including these, the initial
JavaScript graph totals **504.85 kB** (64.1% smaller than the former single entry).
Independent Node gzip calculation estimates **169.36 kB** across those files;
compression settings differ from Vite's per-chunk display. This excludes CSS,
fonts, images and protocol overhead. All generated JS chunks are below 500 kB.
Portal CSS now loads with its layout (Chairman 1.51 kB; Parent 14.35 kB;
Teacher 19.13 kB). Total installed application code is not reduced by lazy loading;
the benefit is deferring code until its route is needed.

Implementation choices follow the documented FastAPI worker behavior,
AnyIO worker-to-loop coroutine bridge, SQLAlchemy checkout/recycle semantics,
and React's lazy/Suspense/error-boundary behavior:
[FastAPI concurrency](https://fastapi.tiangolo.com/async/),
[AnyIO threads](https://anyio.readthedocs.io/en/stable/threads.html),
[SQLAlchemy pooling](https://docs.sqlalchemy.org/en/20/core/pooling.html),
[React lazy](https://react.dev/reference/react/lazy).
