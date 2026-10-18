# Teacher Fetch Performance Audit

Audit date: 2026-10-18. Scope: the current working tree, including pre-existing uncommitted changes, for the Teacher Dashboard and Teacher ECCD Assessment pages.

## 1. Executive Summary & Primary Root Causes

**The main demonstrated cause is repeated LRN decryption in a quadratic Python loop, followed by frontend request amplification. Missing student/period indexes and asynchronous GET handlers are not the primary causes in this checkout.**

The shared `GET /api/eccd/domains-progress` handler loads a teacher's students and evaluations, then scans **all evaluations for every student in every domain**. Its inner comparison reads `evaluation.student_lrn`, a compatibility property that decrypts the associated student's encrypted LRN on every access. The initial student list also decrypts each LRN. This work is unnecessary for comparing integer student identities. See [backend/routes/eccd.py:53-99](backend/routes/eccd.py#L53), [backend/models/eccd.py:105-107](backend/models/eccd.py#L105), and [backend/models/student.py:71-74](backend/models/student.py#L71).

**Read-only measurements reproduced a 5.34-5.47 second handler time for just 12 students**, with **328,620 decryptions** and only **five SQL statements taking 6.69-14.16 ms** at the cursor. The local database contains 13 active students across two sections, not the reported 14-student cohort. The report therefore distinguishes local measurements from source-derived projections for 14 students.

For 14 students, seven domains, and 109 questions answered in three periods, this single endpoint executes **448,658 LRN decryptions**. Even one fully recorded period produces **149,562 decryptions**. The inspected legacy controller instead obtains completion counts using a grouped SQL CTE and formats small maps without decrypting LRNs: [AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js:418-466](AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js#L418).

The prioritized findings are:

| Priority | Finding | Practical effect | Evidence and legacy comparison |
| --- | --- | --- | --- |
| Critical | Repeated cryptography inside the progress aggregation loop | Seconds of application work despite millisecond SQL; shared by both pages | Active: [backend/routes/eccd.py:66-99](backend/routes/eccd.py#L66), [backend/models/eccd.py:105-107](backend/models/eccd.py#L105). Legacy: grouped completion CTE at [eccdController.js:431-466](AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js#L431). |
| High | ECCD overview fetches every student's full checklist before publishing domain cards | 14 additional HTTP requests and 98 handler SQL statements; the overview waits for the slowest request | Active: [EccdAssessment.tsx:78-110](frontend/src/pages/teacher/EccdAssessment.tsx#L78), [teacherMetrics.ts:7-11](frontend/src/utils/teacherMetrics.ts#L7). Legacy: overview uses just roster and aggregate progress, with detail fetched on selection, at [EccdAssessment.jsx:185-187](AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx#L185) and [487-529](AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx#L487). |
| High | Dashboard puts the same slow progress endpoint on its metrics critical path | Even the single-section dashboard waits for progress work merely to count reference questions | Active: [Dashboard.tsx:116-162](frontend/src/pages/teacher/Dashboard.tsx#L116). Legacy: stats and filters start together at [TeacherDashboard.jsx:61-103](AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/TeacherDashboard.jsx#L61). |
| Medium | Roster serialization performs settings and relationship reads per student | Locally, 28 SQL statements per 12-student roster; two such roster loaders run on the assessment page | Active: [backend/utils/students.py:8-17](backend/utils/students.py#L8), [backend/utils/access.py:63-68](backend/utils/access.py#L63). Legacy: narrow ECCD roster at [eccdController.js:40-55](AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js#L40); joined age/family roster at [studentController.js:155-201](AMES-SYSTEM-LEGACY/backend/controllers/studentController.js#L155). |
| Medium | Duplicate reloads and no HTTP cancellation/deduplication across these loaders | Reconnect/sync/focus can repeat expensive work already in flight | Active: [EccdAssessment.tsx:264-276](frontend/src/pages/teacher/EccdAssessment.tsx#L264), [useTeacherAssessment.ts:348-365](frontend/src/hooks/useTeacherAssessment.ts#L348), [TeacherContext.tsx:82-92](frontend/src/context/TeacherContext.tsx#L82). Legacy dashboard explicitly aborts discarded requests at [TeacherDashboard.jsx:102-115](AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/TeacherDashboard.jsx#L102). |
| Medium, separate path | Section summary runs one evaluation query per student | 17 handler queries for 14 students; not invoked by these two page loaders | Active: [backend/routes/eccd.py:202-232](backend/routes/eccd.py#L202). The cited legacy CTE at [eccdController.js:431-446](AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js#L431) belongs to progress, not section summary; the inspected legacy ECCD route table has no equivalent summary route: [eccdRoutes.js:6-32](AMES-SYSTEM-LEGACY/backend/routes/eccdRoutes.js#L6). |
| Lower immediate impact | Dashboard priority uses a correlated latest-period subquery and several serial aggregate queries | Additional database work, but only milliseconds locally | Active: [backend/routes/analytics.py:278-367](backend/routes/analytics.py#L278). Legacy combines scalar counts and uses a window CTE with parallel independent reads at [teacherController.js:403-447](AMES-SYSTEM-LEGACY/backend/controllers/teacherController.js#L403). |

### Audit method and evidence boundaries

- Read active sources and legacy references only. The named `_legacy_reference/` directory is absent; the available legacy reference is `AMES-SYSTEM-LEGACY/`. It was inspected without edits. No branch commands, migrations, application tests, application server startup, login, save, seed, or application HTTP requests were executed.
- Database inspection used the existing SQLAlchemy engine against local `localhost/ames_parity_dev`, with `SET TRANSACTION READ ONLY`, an eight-second per-statement timeout, and rollback. `SHOW transaction_read_only` returned `on`. Handler instrumentation rejected non-SELECT application statements. No school records or schema were changed.
- Measurements invoke existing read handlers directly using an existing teacher selected internally by cohort size. They exclude JWT authentication, ASGI middleware, connection acquisition, browser scheduling, network transfer, and normal response serialization except where explicitly measured. Student identities, plaintext LRNs, credentials, and assessment answers were not printed.
- The configured local data had **13 students, all active; 3,950 evaluation rows; seven domains; 109 questions**. The measured teacher's section had **12 students and 3,912 evaluations**. The other section had one student and 38 evaluations. No synthetic 14-student records were created.
- Source-derived counts describe a successful, settled load. They are not a captured browser HAR. Browser CPU, connection queueing, deployed latency, and multi-user saturation were not measured. Two local progress timings demonstrate the hotspot, not a production percentile distribution.
- References cite current file line numbers. Legacy behavior is a source comparison, not a benchmark of a running legacy server. The opaque `[cite: 1]` in the request was not treated as evidence.

## 2. API Endpoint & Query Bottleneck Map

### Query accounting conventions

`N` = active students in the requested scope; `D` = domains; `Q` = total questions; `E` = evaluation rows across the scope; `P` = testing periods, currently three. For progress, scope includes **all active assigned sections**, not only the section selected in the UI. `T` = distinct parent records lazily fetched during roster serialization; `U` = extra parent-user reads for the username fallback.

Counts below exclude request authentication and transaction/setup statements. For a normal authenticated teacher request, authentication adds **two SELECTs**: user lookup and teacher-profile existence check, at [backend/utils/authentication.py:54-79](backend/utils/authentication.py#L54). Explicit ORM queries still execute even when a matching object is already in the session; identity-map reuse is relevant to relationship/`db.get` loads, not a blanket query cache.

| Endpoint | Backend handler and delegated source | SQL for 14 students | Local observed SQL / handler duration | Complexity and assessment |
| --- | --- | --- | --- | --- |
| `GET /api/eccd/domains-progress` | [backend/routes/eccd.py:44-135](backend/routes/eccd.py#L44) | **5** when students exist; 4 for an empty scope | **5 / 5,336.064 ms**, repeat **5 / 5,467.163 ms** for 12 students | SQL statement count `O(1)`. Application scan `O(D*N*E)` plus question membership checks; with `E=N*Q*P`, `O(D*N²*Q*P)` before accounting for list-membership cost. Dominant crypto hotspot. |
| `GET /api/eccd/students` | [backend/routes/eccd.py:33-41](backend/routes/eccd.py#L33), [backend/utils/students.py:8-17](backend/utils/students.py#L8) | Locally observed pattern projects to **32**, plus `T+U` if links exist; general formula below | **28 / 46.826 ms** for 12 students | `O(N)` query growth through settings and lazy family loads; scope is all assigned sections. |
| `GET /api/students/section/{section_id}` | [backend/routes/students.py:47-51](backend/routes/students.py#L47) | Same one-section projection: **32 + T + U** | **28 / 33.752 ms** | `O(N)` serializer queries despite one roster SELECT. |
| `GET /api/eccd/assessment/{id}` | [backend/routes/eccd.py:138-141](backend/routes/eccd.py#L138), [backend/utils/assessments.py:100-166](backend/utils/assessments.py#L100) | **7 per student; 98 across 14 HTTP requests** | **7 / 44.922 ms** for one student; first-call overhead included | Per request, fixed query count and `O(D*Q + Q*P + E_student)` application work. All-class detail loading scales with `N`. |
| `GET /api/eccd/section/{section_id}/summary?testing_period=PRE` | [backend/routes/eccd.py:202-265](backend/routes/eccd.py#L202) | **N+3 = 17** for teacher access; super-admin uses `N+1 = 15` | **15 / 69.505 ms** for 12 students | Genuine evaluation-query N+1: teacher lookup, assignment query, roster, then `N` joined evaluation queries. Scoring adds work proportional to returned period rows. Not a request in the audited page flows. |
| `GET /api/teachers/dashboard-filters` | Aliases: [backend/routes/teachers.py:104-111](backend/routes/teachers.py#L104); handler: [backend/routes/analytics.py:29-77](backend/routes/analytics.py#L29) | **6** | **6 / 7.856 ms** | Fixed six serial SELECTs: domains, teacher, assignment IDs, section names, school years, settings. |
| `GET /api/teachers/dashboard-stats?section=...` | Same alias registration; [backend/routes/analytics.py:257-389](backend/routes/analytics.py#L257) | **8** for an assigned teacher | **8 / 49.452 ms** | Fixed statement count, not student-query N+1. Priority query includes a correlated subplan; aggregate SQL reads scale with scoped rows. |
| `GET /api/teachers/dashboard-pie?...` | Same alias registration; [backend/routes/analytics.py:81-149](backend/routes/analytics.py#L81) | **3 per call** | **3 / 10.853 ms** for `period=All` | Teacher, assignments, grouped answer count. Dashboard issues both all-period and selected-period calls. |
| `GET /api/sections/` | [backend/routes/sections.py:14-19](backend/routes/sections.py#L14) | **1** | Source-derived; not timed | Provider obtains all section records, then filters them using dashboard-filter names. |
| `GET /api/eccd/student/{id}` | [backend/routes/eccd.py:194-199](backend/routes/eccd.py#L194) | **4** before response serialization | Source-derived; not timed | Student resolution + teacher + assignment + evaluations. Not used by these page loaders. This count excludes any computed response-field behavior. |

**Why each checklist is seven queries, not hundreds:** student lookup (1), teacher authorization lookup (1), assignment lookup (1), active-adviser permission lookup (1), domains (1), questions (1), evaluations (1). `record.question` in the scoring loop reuses the question objects already retained by the `questions` list; measured execution contained **no extra question SELECTs**. The answer map is already indexed by `(question_id, testing_period)`. Evidence: [backend/utils/assessments.py:101-117](backend/utils/assessments.py#L101), [backend/utils/assessments.py:123-148](backend/utils/assessments.py#L123), and [backend/utils/access.py:23-60](backend/utils/access.py#L23). Legacy also indexes answers in memory: [eccdController.js:84-105](AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js#L84).

**Roster formula:** three initial SELECTs (teacher, assignments, students), `N` family-link collection loads, `A` settings loads, `K` section relationship loads, plus `T+U` parent/user reads: **`3 + N + A + K + T + U`**. Locally `A=N`, `K=1`, and `T=U=0`, so this becomes `2N+4`. Instrumentation observed 12 independent settings SELECTs; do not assume `db.get(SystemSettings, 1)` guarantees one database read across this loop. General counts vary with retained ORM objects and family data. Source: [backend/utils/students.py:9-17](backend/utils/students.py#L9), [backend/utils/access.py:63-68](backend/utils/access.py#L63), [backend/models/student.py:50-57](backend/models/student.py#L50), and [backend/models/parent.py:27-28](backend/models/parent.py#L27). Legacy computes ages in a joined roster query and groups parent data: [studentController.js:155-201](AMES-SYSTEM-LEGACY/backend/controllers/studentController.js#L155).

### Logical page totals for a 14-student, one-section scope

These projections assume one settled load, no family links, and the observed roster settings-load pattern. They exclude provider bootstrap, shell requests, Strict Mode replay, selection changes, reconnects, errors, and retries.

| Flow | Page HTTP requests | Handler SELECTs | Including two authentication SELECTs per request |
| --- | --- | --- | --- |
| ECCD overview | `N+3 = 17` | `32 + 5 + 32 + 14*7 = 167` | **201** |
| Dashboard, one assigned section | **6** | `6 + 8 + 32 + 5 + 3 + 3 = 57` | **69** |
| Dashboard, multiple assignments, 14 students in selected section | **20** | Previous dashboard total plus 98 = **155** | **195** |

The provider bootstrap separately contributes two HTTP requests, seven handler SELECTs and four authentication SELECTs, when mounted: [TeacherContext.tsx:50-82](frontend/src/context/TeacherContext.tsx#L50). The multi-assignment row assumes 14 students in the selected section; progress may process additional assigned students, increasing its CPU cost. These totals are accounting examples, not universal request counts.

### FastAPI execution and connection pooling

**The suspected `async def` + synchronous SQLAlchemy mismatch is absent from the audited GET handlers.** Progress, checklist, section summary, roster, filters, stats and pie handlers are ordinary `def`, as shown in the endpoint table. Their database dependency is also synchronous: [backend/config/database.py:19-24](backend/config/database.py#L19). Installed FastAPI dispatches synchronous endpoints through `run_in_threadpool`: [.venv312/Lib/site-packages/fastapi/routing.py:344-354](.venv312/Lib/site-packages/fastapi/routing.py#L344). An `async def` handler that directly blocks would block the event loop; it would not automatically become a thread-pool task.

The engine uses synchronous psycopg2, pre-ping and a five-second **connection-establishment** timeout, with no explicit pool-size/overflow/checkout-timeout arguments: [backend/config/database.py:5-9](backend/config/database.py#L5). Runtime inspection confirmed **QueuePool size 5, max overflow 10, checkout timeout 30 seconds**, consistent with installed defaults at [.venv312/Lib/site-packages/sqlalchemy/pool/impl.py:72-77](.venv312/Lib/site-packages/sqlalchemy/pool/impl.py#L72). Thus this process permits up to 15 checked-out connections, not just five. Installed AnyIO's default limiter is 40 tokens: [.venv312/Lib/site-packages/anyio/_backends/_asyncio.py:3162](.venv312/Lib/site-packages/anyio/_backends/_asyncio.py#L3162). Deployment overrides and worker counts were not established.

The progress request keeps its session/transaction open through the multi-second Python loop; cleanup closes it only when the dependency exits. Consequently a CPU-heavy request can also hold a scarce connection. A 14-request fan-out, overlapping overview work, and other sessions can create connection/worker pressure. **Saturation was not measured and is a secondary risk, not the explanation needed to reproduce the five-second delay.** Legacy has an explicit 15-connection pool and 50-request queue at [AMES-SYSTEM-LEGACY/backend/config/db.js:7-13](AMES-SYSTEM-LEGACY/backend/config/db.js#L7).

Two out-of-scope async handlers do call blocking work: workbook import and password-change request at [backend/routes/teachers.py:114-120](backend/routes/teachers.py#L114) and [185-200](backend/routes/teachers.py#L185). Concurrent import could affect the service, but no such concurrency was observed. Middleware correctly offloads rate-limit work at [backend/utils/http_middleware.py:55-63](backend/utils/http_middleware.py#L55). Production API rate limiting uses the same engine for counter writes at [backend/utils/rate_limits.py:82-100](backend/utils/rate_limits.py#L82); this adds operational database work outside the query counts above. The local development probes bypassed middleware and did not execute those writes.

## 3. Cryptographic & CPU Overhead Analysis

### Exact decryption chain and work count

1. `student_lrns = [s.lrn_number for s in students]` decrypts every student once: [backend/routes/eccd.py:66](backend/routes/eccd.py#L66).
2. For each domain, the handler loops over every student LRN and then every evaluation: [backend/routes/eccd.py:83-99](backend/routes/eccd.py#L83).
3. The first operand of `e.student_lrn == lrn and ...` always runs, even for an evaluation belonging to another student. `StudentEccdEvaluation.student_lrn` accesses `self.student.lrn_number`: [backend/models/eccd.py:105-107](backend/models/eccd.py#L105).
4. That property calls `decrypt_lrn` without caching: [backend/models/student.py:71-74](backend/models/student.py#L71). Each call parses hex, obtains key bytes, constructs an `AESGCM` instance, decrypts/authenticates, decodes and validates 12 digits: [backend/utils/lrn.py:23-26](backend/utils/lrn.py#L23), [37-46](backend/utils/lrn.py#L37).

For nonempty configured domains, the resulting count is:

```text
decryptions = N + D * N * E
E = N * Q * recorded_periods       # fully populated illustration only
```

| Scenario | Evaluations processed | Exact decryptions per progress response |
| --- | ---: | ---: |
| Local measured: 12 students, seven domains | 3,912 | `12 + 7*12*3912 = 328,620` |
| Projected: 14 students, no evaluations | 0 | 14 |
| Projected: 14 students, 109 questions, one complete period | 1,526 | **149,562** |
| Projected: 14 students, 109 questions, three complete periods | 4,578 | **448,658** |

This is evaluation-density dependent. Fourteen empty student records do not reproduce the fully assessed workload. With three complete periods, growing from seven to 14 students nearly quadruples the inner-loop work. Multiple assignments further increase `N` and `E` because the handler has no selected-section parameter.

The compatibility lookup in the evaluation SQL also re-hashes all `N` decrypted LRNs and constructs a student subselect with OR-ed identity conditions: [backend/routes/eccd.py:73-76](backend/routes/eccd.py#L73), [backend/models/student_identity.py:8-14](backend/models/student_identity.py#L8), [32-36](backend/models/student_identity.py#L32). This adds `N` HMAC operations and avoidable SQL expression complexity, though its measured SQL runtime is small. Legacy joins integer IDs directly in its completion query: [eccdController.js:435-442](AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js#L435).

The associated student relationship did **not** produce evaluation-level SQL N+1 in this handler: the `students` list retains the relevant ORM student instances, and measured SQL remained five statements. Cryptography repeats even though relationship resolution reuses the same objects. There is no evidence of repeated LRN decryption in the audited sort operations; the proven issue is this comparison loop.

### Measured time distribution

| Local 12-student progress run | Handler elapsed | Sum of SQL cursor execute times | Decryptions |
| --- | ---: | ---: | ---: |
| First | 5,336.064 ms | 14.159 ms | 328,620 |
| Repeat, fresh session | 5,467.163 ms | 6.688 ms | 328,620 |

Over **99.7% of measured handler elapsed time was outside cursor execution**. That includes row materialization, Python loops, ORM property resolution and cryptography; it is not a claim that cryptography alone consumed 99.7%. Instrumentation counted decryptions in memory and added some overhead. SQL execute measurements exclude result materialization, so they must not be interpreted as complete database-client time. Nevertheless, the source chain, exact call count and millisecond plans isolate the dominant avoidable application work.

### Checklist calculation, serialization and browser CPU

The checklist helper computes three period score summaries even for teacher responses, where only ages/date maps and domains are ultimately returned. `calculate_scores` runs before the `parent_view` branch: [backend/utils/assessments.py:112-121](backend/utils/assessments.py#L112), [152-166](backend/utils/assessments.py#L152). This can mean up to **42 scoring passes** when loading 14 complete checklists. Each period also separately resolves official and grading dates. The scorer reads its JSON tables at module initialization, not per student/request: [backend/utils/eccd_scorer.py:7-15](backend/utils/eccd_scorer.py#L7). This is secondary CPU work, not repeated model loading or ML inference. Legacy teacher detail resolves dates and ages without the active helper's full score-summary computation: [eccdController.js:92-114](AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js#L92).

One local complete checklist serialized to **33,774 UTF-8 bytes** in **1.882 ms** using `AssessmentResponse.model_validate(...).model_dump_json()`. Fourteen similar responses would be approximately **473 KB uncompressed**, with the same question descriptions repeated. That is an illustration, not an observed all-class wire size; HTTP gzip is enabled at [backend/main.py:81](backend/main.py#L81). Fourteen checklists contain 1,526 question objects, 4,578 answer slots and another 4,578 evaluator-role slots. Evidence for repeated payload construction: [backend/utils/assessments.py:123-153](backend/utils/assessments.py#L123).

The assessment page then JSON-stringifies the full class snapshot into synchronous localStorage: [EccdAssessment.tsx:107-115](frontend/src/pages/teacher/EccdAssessment.tsx#L107). Rendering seven domain cards iterates class assessments, performs nested `.find()` question matching and reads one draft per student/domain: [EccdAssessment.tsx:181-218](frontend/src/pages/teacher/EccdAssessment.tsx#L181), [518-524](frontend/src/pages/teacher/EccdAssessment.tsx#L518). That is **98 draft reads per full card-grid render** for 14 students, with matching work bounded by `O(N * sum(domain_question_count²))`. Browser timings were not measured; this is a secondary source-confirmed cost. Legacy domain cards use already returned aggregate percentages: [EccdAssessment.jsx:1105-1110](AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx#L1105). Any optimization must retain the active UI's explicit-draft and saved-only progress behavior.

## 4. Database Indexing Audit

The following compares active model declarations with the **actual local `public` schema catalog** and legacy schema sources. Model declarations alone do not prove indexes have been applied elsewhere.

| Table / access pattern | Active model and local catalog | Legacy source | Assessment |
| --- | --- | --- | --- |
| Evaluations by student and period | **Present:** `idx_student_period(student_id, testing_period)`; [backend/models/eccd.py:93-99](backend/models/eccd.py#L93) | Same index: [001_initial_schema.sql:141-145](AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql#L141) | The principal suspected missing composite index already exists and is used by the summary plan. Do not add a duplicate. |
| Evaluation uniqueness / latest answer lookup | **Present:** unique `(student_id, question_id, testing_period)` | Same unique key: [001_initial_schema.sql:142](AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql#L142) | Supports per-question correlated lookup; active source [backend/models/eccd.py:94-96](backend/models/eccd.py#L94). |
| Students by section and active flag | **Present:** `idx_students_section_active(section_id, is_active)`; [backend/models/student.py:60-63](backend/models/student.py#L60) | Same composite plus a separate section FK index: [001_initial_schema.sql:84-88](AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql#L84) | Leading `section_id` also supports section-only selection. Missing a separate single-column section index is not demonstrated to hurt these reads. |
| Protected LRN lookup | **Present:** unique `lrn_search_hash`, plus `lrn_last4`; [backend/models/student.py:60-63](backend/models/student.py#L60) | Nonunique search-hash and last-four indexes: [001_initial_schema.sql:86-87](AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql#L86) | Hash lookup is indexed; decryption is happening in Python, not an unindexed SQL decryption predicate. |
| Active adviser by section | **Present:** unique partial `uq_section_active_adviser(section_id) WHERE status='Active'`; [backend/models/section_teacher.py:36-40](backend/models/section_teacher.py#L36) | Legacy assignment lives on teacher `section_id`, indexed at [001_initial_schema.sql:61-62](AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql#L61) | Different normalized schema; not a missing legacy junction-table index. |
| Assignments by teacher/status/role | **Absent:** no index beginning with `teacher_id` in local `section_teachers`; only PK and active-section partial index | Legacy has a unique teacher `user_id`, and direct section ownership: [001_initial_schema.sql:58-62](AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql#L58) | A partial index beginning with teacher ID for active advisers is a candidate as assignment history grows. Repeated lookup predicate: [backend/utils/access.py:12-17](backend/utils/access.py#L12). No evidence this tiny table caused seconds of latency. |
| Evaluations by teacher/question foreign keys | **Absent:** standalone `teacher_id` and `question_id` indexes; active FK definitions at [backend/models/eccd.py:72-84](backend/models/eccd.py#L72) | **Present** in legacy: [001_initial_schema.sql:143-144](AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql#L143) | A genuine schema/index difference. PostgreSQL does not automatically index referencing FK columns. These page queries filter by student; do not claim these absent indexes cause the measured progress delay. Evaluate for question-centric queries and FK maintenance separately. |
| Evaluations by evaluator role | **Absent:** role is constrained, not indexed; [backend/models/eccd.py:80-98](backend/models/eccd.py#L80) | Role added in [005_eccd_evaluator_tracking.sql:7-10](AMES-SYSTEM-LEGACY/backend/database/migrations/005_eccd_evaluator_tracking.sql#L7), without a role index there | Audited teacher reads do not use evaluator role as a selective WHERE predicate. A two-value standalone role index has no demonstrated benefit here. |
| Questions by domain | **Absent:** only question PK locally; [backend/models/eccd.py:49-64](backend/models/eccd.py#L49) | **Present:** domain FK index at [001_initial_schema.sql:104-106](AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql#L104) | Candidate for domain-restricted operations; audited checklist reads intentionally load all 109 questions. |
| Family links by student | **Present:** `idx_family_student(student_id)`; [backend/models/parent.py:22-24](backend/models/parent.py#L22) | Same student index: [001_initial_schema.sql:115-119](AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql#L115) | Indexing does not remove the `N` separate relationship queries. Batch loading is the relevant remedy. |

There is **no evaluation-table `section_id` column** in either inspected final schema. Section access goes through `students.student_id/section_id`; an evaluation-table section index cannot simply be added without changing the schema. Active columns: [backend/models/eccd.py:70-90](backend/models/eccd.py#L70); legacy columns/keys: [001_initial_schema.sql:133-148](AMES-SYSTEM-LEGACY/backend/database/migrations/001_initial_schema.sql#L133).

### Actual local query plans

Captured SELECTs from existing handlers were replayed with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` inside read-only transactions. Values were supplied as parameters and not printed. Results are warm local observations, not production plans.

| Captured query | Observed plan / work | Planning / execution time | Interpretation |
| --- | --- | --- | --- |
| Progress evaluations through compatibility identity subselect, [backend/routes/eccd.py:73-76](backend/routes/eccd.py#L73) | Hash join; evaluation **Seq Scan of 3,950 rows**, returns 3,912; student scan keeps 12 of 13 | **0.335 / 1.688 ms** | Sequential scan is observed, but nearly the entire evaluation table is needed. The required indexes exist. This scan does not explain the five-second response. |
| One summary student's PRE evaluations joined to questions, [backend/routes/eccd.py:221-231](backend/routes/eccd.py#L221) | Bitmap index/heap scan using **`idx_student_period`**, returns 108 evaluations; question scan of 109 rows | **0.221 / 0.187 ms** | Existing composite index works. Repeating this query `N` times is the issue. |
| Selected section's student roster, [backend/routes/students.py:51](backend/routes/students.py#L51) | **Index Scan on `idx_students_section_active`**, returns 12 students | **0.077 / 0.031 ms** | Base roster lookup is inexpensive; per-student serialization adds round trips. |
| Dashboard priority, [backend/routes/analytics.py:322-348](backend/routes/analytics.py#L322) | Evaluation bitmap access on `idx_student_period`; correlated subplan performs **308 loops**, each using an index-only scan on `unique_student_eval` and sorting up to three periods; 748 shared buffer hits | **0.649 / 2.068 ms** | Not 308 network queries: these are internal subplan executions within one SQL statement. A scoped window/grouped approach is a scaling improvement, but this query is fast locally. |

No `enable_seqscan` override, DDL, `ANALYZE`, `VACUUM`, migration or index creation was executed. There is no evidence that missing `(student_id, testing_period)` or `(section_id, is_active)` indexes cause full-table scans in this installation.

## 5. Frontend Request Waterfall

### Teacher context bootstrap

The shared provider starts `/api/sections/` and `/api/teachers/dashboard-filters` in parallel, waits for both, then resolves the selected assigned section: [TeacherContext.tsx:50-79](frontend/src/context/TeacherContext.tsx#L50). Cached section choices can make a section available earlier, but do not suppress these network requests. The provider refetches on focus/online: [TeacherContext.tsx:82-92](frontend/src/context/TeacherContext.tsx#L82).

The dashboard independently requests `/dashboard-filters` again. This is a real same-endpoint overlap across consumers. It is not evidence that every React rerender triggers HTTP. The provider refresh can change section choices/count and cause page effects to run again. Legacy dashboard loads filters once on mount as part of its initial parallel pair: [TeacherDashboard.jsx:87-104](AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/TeacherDashboard.jsx#L87).

### Teacher Dashboard

```text
Provider: sections || dashboard-filters -> resolve selected section

Page metrics effect:
  dashboard-filters
    -> parallel [dashboard-stats, section-roster,
                 domains-progress, dashboard-pie(period=All)]
    -> if multiple assignments: parallel N * assessment/{student_id}
    -> publish cards, demographics and recent messages

Separate chart effect:
  selected section/domain/period -> dashboard-pie(period=selected period)
```

Evidence: [Dashboard.tsx:95-182](frontend/src/pages/teacher/Dashboard.tsx#L95), [183-217](frontend/src/pages/teacher/Dashboard.tsx#L183), and [teacherMetrics.ts:7-11](frontend/src/utils/teacherMetrics.ts#L7).

- The two pie requests normally differ (`All` versus default `PRE`), so they are overlapping aggregation work, not necessarily identical requests.
- On a one-section teacher, there is **no initial 14-checklist fan-out** from this dashboard. It still waits for `domains-progress`, used to obtain question counts. `Promise.all` holds stats, student count and messages until that CPU-heavy response completes, even though other responses can already be ready.
- For multiple assignments, `sectionAssessments(active)` adds `N` checklist requests after the four-response barrier. These compute client priority using the latest populated period per student, whereas backend priority uses latest per student/question. Those semantics differ: [teacherMetrics.ts:27-37](frontend/src/utils/teacherMetrics.ts#L27) versus [backend/routes/analytics.py:322-345](backend/routes/analytics.py#L322). Removing the fallback requires an explicit compatibility decision; do not silently switch definitions.
- Metrics and pie effects refetch on focus, online, and `ames-record-synced`. Version checks suppress stale state updates, but the shown Axios requests receive no `AbortSignal`; already running HTTP/SQL/CPU work continues. Legacy dashboard does supply cancellation: [TeacherDashboard.jsx:102-115](AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/TeacherDashboard.jsx#L102).

### Teacher ECCD Assessment

```text
Page roster lane: /api/eccd/students -> filter chosen section

Progress lane, started alongside roster:
  /api/eccd/domains-progress
    -> /api/students/section/{id}
      -> parallel N * /api/eccd/assessment/{student_id}
        -> store full class snapshot + domains
          -> clear loading -> display domain cards

After user selects a student:
  useTeacherAssessment -> useAssessment -> assessment/{same student_id} again
```

Evidence: [EccdAssessment.tsx:78-115](frontend/src/pages/teacher/EccdAssessment.tsx#L78), [239-276](frontend/src/pages/teacher/EccdAssessment.tsx#L239), [511-524](frontend/src/pages/teacher/EccdAssessment.tsx#L511); selected detail: [useTeacherAssessment.ts:49-56](frontend/src/hooks/useTeacherAssessment.ts#L49), [useAssessment.ts:12-26](frontend/src/hooks/useAssessment.ts#L12).

The `N` requests are started in **parallel `Promise.all`**, not an `await` loop issuing one request after another. The actual waterfall is **progress -> roster -> checklist batch**. Browser transport/server capacity can still limit how much of that batch runs simultaneously. The card display waits for the entire batch, including for teachers with only one section; the condition `sections.length > 1` only controls a subsequent `domainCompletion` calculation, not the fetch itself.

The first roster fetch covers all assigned sections and is filtered in the browser; the second roster fetch covers the selected section. Both serialize full student records. Loading the selected student's checklist repeats a detail request already made for the class snapshot, because `useAssessment` uses its own state and only uses its disk cache after network failure. There is no shared in-flight result between it and `sectionAssessments`: [useAssessment.ts:19-41](frontend/src/hooks/useAssessment.ts#L19). Legacy requests only the selected student's checklist and independently displays aggregate progress: [EccdAssessment.jsx:487-529](AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx#L487).

### Reload amplification, memoization and offline handling

`fetchDomainsProgress` is already a `useCallback` with primitive scope dependencies, and `useAssessment.refresh` is also memoized: [EccdAssessment.tsx:78-79](frontend/src/pages/teacher/EccdAssessment.tsx#L78), [147](frontend/src/pages/teacher/EccdAssessment.tsx#L147), [useAssessment.ts:12-55](frontend/src/hooks/useAssessment.ts#L12). There is no basis for claiming an infinite fetch loop caused by every rerender.

However, each queued ECCD record confirmation dispatches `ames-record-synced`: [frontend/src/utils/drafts.ts:61-77](frontend/src/utils/drafts.ts#L61). Two assessment-page paths then start the full class progress load:

1. The page's listener calls `load()` and `fetchDomainsProgress()`: [EccdAssessment.tsx:264-269](frontend/src/pages/teacher/EccdAssessment.tsx#L264).
2. The teacher hook's listener calls `onSaved()` for ECCD draft keys; `onSaved` is that same progress callback: [useTeacherAssessment.ts:348-365](frontend/src/hooks/useTeacherAssessment.ts#L348), [EccdAssessment.tsx:171-175](frontend/src/pages/teacher/EccdAssessment.tsx#L171).

For a settled 14-student section, one sync event can therefore initiate **two progress + two selected-roster + 28 checklist requests**, plus one all-assignment roster and one selected-detail refresh: **up to 34 read requests per confirmation**. These are source-derived initiated calls if requests succeed and scope stays stable. Multiple queued records can overlap these reloads. The late version check occurs after the checklist batch, so rejecting an old result does not prevent its intermediate requests or CPU work. Legacy assessment refresh uses one aggregate refresh plus optional selected detail: [EccdAssessment.jsx:968-973](AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx#L968).

An ordinary foreground save calls selected-detail `refresh()` and then one `onSaved()` after HTTP confirmation: [useTeacherAssessment.ts:275-281](frontend/src/hooks/useTeacherAssessment.ts#L275). `confirmDraft` itself emits `ames-drafts-changed`, not `ames-record-synced`: [frontend/src/utils/drafts.ts:33-37](frontend/src/utils/drafts.ts#L33). Thus the duplicate confirmation-listener finding specifically concerns queued-sync events; it is not an assertion that every normal save emits that event twice.

React Strict Mode is enabled at [frontend/src/main.tsx:1-9](frontend/src/main.tsx#L1). Development effect replay can add requests because these loaders lack cancellation. This is an additional development amplifier, not a guaranteed production multiplier or the demonstrated root cause.

The progress cache is read only after a network error, and the page waits before publishing its existing cached class state: [EccdAssessment.tsx:116-144](frontend/src/pages/teacher/EccdAssessment.tsx#L116). Axios has a **20-second default timeout**: [frontend/src/services/api.ts:2-5](frontend/src/services/api.ts#L2). Neither extending that timeout nor clearing durable drafts addresses the work amplification. Preserve all pending inputs, owner/section isolation and confirmation-safe eviction during any future change.

## 6. Prioritized Action Plan

These are proposals for review. **No remediation code, index, configuration, schema or database record was changed by this audit.**

1. **Phase 1 — Remove the demonstrated CPU hotspot; highest impact.** Replace plaintext-LRN aggregation identities with `student_id`. Group evaluations once by student/domain/period, or translate the legacy required-question/completed-student CTE to PostgreSQL/SQLAlchemy. Preserve active-adviser scope, distinct-question completion, all three periods, empty-domain behavior and half-up percentage rounding. Target: **zero decryptions for progress**, a fixed number of reads, and application work proportional to scoped records rather than `D*N*E`. Review anchors: [backend/routes/eccd.py:53-135](backend/routes/eccd.py#L53), legacy [eccdController.js:431-466](AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js#L431).

2. **Phase 1 — Remove progress from unrelated dashboard display barriers.** Use cheap reference question counts or an authorized aggregate result for completion denominators. Publish independent stats/messages without waiting for class detail. Return section-correct metrics through compatible server behavior so multiple assignments do not require full checklist downloads. First reconcile latest-period-per-student versus latest-period-per-question priority semantics; preserve deliberate tie-breaking. Review anchors: [Dashboard.tsx:116-162](frontend/src/pages/teacher/Dashboard.tsx#L116), [teacherMetrics.ts:27-37](frontend/src/utils/teacherMetrics.ts#L27), legacy [teacherController.js:403-447](AMES-SYSTEM-LEGACY/backend/controllers/teacherController.js#L403).

3. **Phase 2 — Replace overview checklist fan-out with compact batch data.** Retain selected-student detail loading, while obtaining class domain progress/saved-count metadata in one authorized request. If draft overlays require per-question committed answers, provide a compact batch representation that sends question definitions once, or build on a shared scoped snapshot without making domain cards wait. Preserve existing endpoint paths/JSON shapes for consumers; review any additive endpoint separately. Target: no `N` full detail requests on overview and no duplicate selected-detail fetch when an equivalent fresh authorized record exists. Review anchors: [EccdAssessment.tsx:78-110](frontend/src/pages/teacher/EccdAssessment.tsx#L78), [teacherMetrics.ts:7-11](frontend/src/utils/teacherMetrics.ts#L7), legacy [EccdAssessment.jsx:487-529](AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/EccdAssessment.jsx#L487).

4. **Phase 2 — Coalesce reloads and share request state.** Choose one class-refresh owner per successful sync batch; refresh changed students/aggregates once after confirmations. Deduplicate provider/dashboard filters and roster consumers; add cancellation and checks before dependent fetch stages. Use scoped cached committed data during revalidation, with permission-safe freshness rules. Preserve queued writes, composite draft keys, pending flags, revision checks and HTTP 200/201 confirmation requirements. Target: one intentional class revalidation per sync batch, and no stale request launching another full student batch. Review anchors: [EccdAssessment.tsx:264-276](frontend/src/pages/teacher/EccdAssessment.tsx#L264), [useTeacherAssessment.ts:348-365](frontend/src/hooks/useTeacherAssessment.ts#L348), legacy cancellation [TeacherDashboard.jsx:102-115](AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/TeacherDashboard.jsx#L102).

5. **Phase 3 — Eliminate roster and summary SQL N+1 patterns.** Load settings once per roster request; batch/eager-load sections, family links, parents and necessary users, retaining SYNCED filtering and response masking. Scope ECCD dropdown data server-side where compatible. For section summary, fetch joined evaluations for all selected student IDs and the requested period in one query, then group/scorer in memory or aggregate carefully. Target: roster query count independent of `N`; summary evaluation retrieval one batch rather than `N` statements. Keep official teacher dates versus parent-only grading dates unchanged. Review anchors: [backend/utils/students.py:8-17](backend/utils/students.py#L8), [backend/routes/eccd.py:220-252](backend/routes/eccd.py#L220), legacy joined roster [studentController.js:155-201](AMES-SYSTEM-LEGACY/backend/controllers/studentController.js#L155) and grouped evaluation pattern [eccdController.js:435-445](AMES-SYSTEM-LEGACY/backend/controllers/eccdController.js#L435).

6. **Phase 3 — Consolidate dashboard SQL and avoid unused teacher scoring work.** Consider combined scalar counts and a scoped window/ranking CTE for latest-per-question priority. Reuse loaded question/domain maps; calculate only summaries needed by each response while preserving dates and teacher/parent contracts. These changes follow removal of the five-second hotspot, because current dashboard SQL and serialization are already small locally. Review anchors: [backend/routes/analytics.py:278-367](backend/routes/analytics.py#L278), [backend/utils/assessments.py:112-121](backend/utils/assessments.py#L112), legacy [teacherController.js:403-447](AMES-SYSTEM-LEGACY/backend/controllers/teacherController.js#L403).

7. **Phase 4 — Tune indexes and capacity using representative plans.** Verify the deployed catalog before proposing DDL. Retain the existing student/period and section/active composites. Evaluate an active-adviser teacher-ID index when assignment history justifies it; assess absent question/teacher FK indexes for their actual workloads. Do not add a standalone evaluator-role index without selective-query evidence. Then measure pool checkout wait, held-connection duration, worker use and deployment connection limits before choosing explicit pool/timeout settings. Keep blocking synchronous GET handlers on the supported synchronous execution path; merely changing them to `async def` would worsen event-loop blocking. Review anchors: [backend/config/database.py:5-24](backend/config/database.py#L5), [backend/models/section_teacher.py:36-40](backend/models/section_teacher.py#L36), legacy pool [db.js:7-13](AMES-SYSTEM-LEGACY/backend/config/db.js#L7).

8. **Phase 5 — Validate performance and business invariants after approved changes.** Use isolated fixtures with 14/30/larger cohorts, empty/partial/full PRE-MID-POST data, multiple sections, archived students and parent-only observations. Measure request count, SQL count, decryptions, payload bytes, first useful render, handler p50/p95 and pool checkout wait. Check full-domain completion versus mastery, latest-period rules, date/age scoring, adviser ownership, parent masking, evaluator provenance, and reload/offline draft retention. Compare outputs before/after; treat latency budgets as agreed targets, not guaranteed improvements inferred from this audit. No such fixture or browser tests were executed against school records during this read-only task.

### Read-only measurement reproducibility and preservation record

The probes used `uv run --no-project --python .venv312 python -B -` with inline Python; no audit script was written into application directories. Each selected handler ran in a fresh SQLAlchemy session bound to a connection whose transaction was already read-only. The user lookup was outside the measured interval. SQLAlchemy `before_cursor_execute`/`after_cursor_execute` listeners counted statements/times, and an in-memory wrapper around `backend.utils.lrn.decrypt_lrn` counted calls without recording inputs/outputs. Listeners and the wrapper were restored after each probe; each transaction rolled back. Query-plan probes captured existing SELECT text/parameters and replayed that exact SELECT with the EXPLAIN prefix. No planner settings were forced.

The catalog check used this read-only shape:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '8s';
SHOW transaction_read_only;
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = current_schema()
  AND tablename IN ('students', 'student_eccd_evaluations',
                    'section_teachers', 'family_access', 'eccd_questions')
ORDER BY tablename, indexname;
-- Aggregate row counts and EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
-- for the captured SELECTs only.
ROLLBACK;
```

Application and legacy source preservation was checked using a SHA-256 digest over sorted paths and file bytes: `backend/`, `frontend/src/`, and `AMES-SYSTEM-LEGACY/`; suffixes `.py`, `.ts`, `.tsx`, `.js`, `.jsx`, `.sql`, `.json`; excluding `node_modules`, `.git`, and `__pycache__`. The 347-file source snapshot digest was `554b64ad9a20abfb887dcc973384cf7066b4b32a6ce7cad5ea18c111f45d78e6`. Existing working-tree changes belong to earlier work and were preserved. This report is the sole intended file addition.
