# Backend parity read-only audit

Audit date: **2026-10-14**.

Reference: `AMES-SYSTEM-LEGACY/backend/`.
Current implementation: `backend/` and `frontend/src/services/api.ts`.
Architecture authority: [AI_CONTEXT.md](AI_CONTEXT.md).

All **80 legacy router method/path pairs** and the three direct health/readiness routes (`/healthz`, `/ready`, `/api/health`) now exist in the current backend. All compatibility gaps identified below are **Verified** after Batches 1 and 2, with the intentional architecture upgrades retained.

The original audit was strictly read-only: no files or database records were changed during inspection. Its descriptions below capture the pre-remediation findings. **Batches 1 and 2 were subsequently implemented and verified on 2026-10-14**; repaired findings carry a Verified label. Current implementation and verification evidence appear in the remediation sections below.

**True Missing Feature** includes incomplete ports and compatibility regressions. Differences are classified as intentional only where `AI_CONTEXT.md` establishes the replacement behavior.

## Missing features and compatibility gaps

| Area | Missing feature, rule, or response contract | Classification | Exact backend fix location |
| --- | --- | --- | --- |
| Health routes | Legacy `index.js` provides `GET /healthz` and `/api/health`, returning `status` and `timestamp`. Both are absent. | **True Missing Feature - Verified (Batch 2)** | `backend/main.py` |
| Readiness route | Legacy `GET /ready` checks database connectivity and returns `status`, `database`, `timestamp`, or a 503 failure. No equivalent exists. | **True Missing Feature - Verified (Batch 2)** | `backend/main.py`, `backend/config/database.py` |
| HTTP rate limits | Legacy global, login, OTP generation/verification, registration, password, provisioning, linking, heavy-operation, and probe limits are absent, including shared production counters and 429 responses. The five-attempt OTP challenge limit remains, but does not replace these limits. | **True Missing Feature - Verified (Batch 2)** | `backend/main.py`, `backend/routes/auth.py`, `backend/routes/teachers.py`, `backend/routes/chairman.py`, `backend/routes/students.py`, `backend/routes/backup.py` |
| Socket rate limits | Legacy handshake limits, per-socket packet ceilings, shared event counters, and `rate_limit_error` behavior have no counterpart. | **True Missing Feature - Verified (Batch 2)** | `backend/utils/realtime.py` |
| Security headers | Legacy Helmet supplies CSP, HSTS, Referrer-Policy, and other security headers. Current application middleware supplies CORS only. | **True Missing Feature - Verified (Batch 2)** | `backend/main.py` |
| Response compression | Legacy enables HTTP compression; the current application has no corresponding middleware. | **True Missing Feature - Verified (Batch 2)** | `backend/main.py` |
| Request/upload limits | Explicit legacy limits are missing: 50 KB JSON bodies, 20 MB Excel imports, 5 MB branding images, and 50 MB encrypted backups. Backup export also lacks the legacy restore-size ceiling check. | **True Missing Feature - Verified (Batch 2)** | `backend/main.py`, `backend/routes/teachers.py`, `backend/routes/settings.py`, `backend/routes/backup.py`, `backend/utils/backups.py` |
| Image validation | Legacy uploads accept only JPEG, PNG, and WebP. Current settings handlers accept any MIME type beginning with `image/`, including SVG. | **True Missing Feature - Verified (Batch 2)** | `backend/routes/settings.py` |
| Production validation | Legacy validates production secret strength and requires verified database TLS. Current settings validate LRN keys, but have no equivalent production checks for JWT secret strength or database TLS. MySQL-specific configuration itself should remain replaced. | **True Missing Feature - Verified (Batch 2)** | `backend/config/settings.py`, `backend/config/database.py` |
| Deployment origin configuration | Legacy HTTP and Socket.IO use configured `FRONTEND_URL`. Current origins are hardcoded to localhost. The context documents this limitation but does not designate removal of configurable origins as an upgrade. | **True Missing Feature - Verified (Batch 2)** | `backend/config/settings.py`, `backend/main.py`, `backend/utils/realtime.py` |
| Unexpected-error handling | Legacy provides sanitized JSON handling for unexpected application errors. Current handlers cover HTTP and validation exceptions, but no general exception handler guarantees a JSON error response for uncaught failures. | **True Missing Feature - Verified (Batch 2)** | `backend/main.py` |
| Authentication request aliases | Legacy accepts `rememberMe` alongside `rememberDevice`, and body `trusted_device_token` alongside `deviceToken`. Current request schemas silently discard these aliases, including the token alias during explicit device forgetting. | **True Missing Feature - Verified (Batch 1)** | `backend/schemas/auth.py`, `backend/routes/auth.py`, `backend/utils/authentication.py` |
| Remembered-device cookies | Legacy sets both supported cookie names and uses `Secure` plus `SameSite=None` in production. Current login sets only `device_token`, always with `secure=False` and `SameSite=lax`. | **True Missing Feature - Verified (Batch 1)** | `backend/utils/authentication.py` |
| Cookie cleanup after credential changes | Legacy Chairman account changes and ordinary teacher password changes clear both device cookies. Current equivalents revoke database trust correctly but leave the browser cookies. | **True Missing Feature - Verified (Batch 1)** | `backend/routes/chairman.py`, `backend/routes/teachers.py`, `backend/utils/account_changes.py` |
| Authentication error fields | Legacy failures include `success:false` and defined codes such as `ACCOUNT_INACTIVE`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `SESSION_REVOKED`, and `PASSWORD_CHANGE_REQUIRED`. Current exceptions lose these fields/codes. | **True Missing Feature - Verified (Batch 1)** | `backend/utils/authentication.py`, `backend/main.py` |
| Chairman account response | Legacy `PUT /api/chairman/account` returns top-level `email` in addition to `user.email`. Current `LoginResponse` and handler omit top-level `email`. | **True Missing Feature - Verified (Batch 1)** | `backend/schemas/auth.py`, `backend/routes/chairman.py`, `backend/utils/account_changes.py` |
| Password-change email binding | Legacy teacher password verification checks the supplied optional `email` against the challenge. Current `PasswordChangeVerify.email` exists, but `change_password()` never passes it to `consume_challenge()`. Account/purpose binding otherwise remains implemented. | **True Missing Feature - Verified (Batch 1)** | `backend/utils/account_changes.py` |
| Person-name validation | Legacy `nameError()` rejects digits, unsupported characters, and names without letters. Current `Name` checks length only; enrollment uses ordinary strings, and guardian/import names also lack equivalent validation. Examples such as `Alex2` and `---` are accepted. | **True Missing Feature - Verified (Batch 1)** | `backend/schemas/common.py`, `backend/schemas/student.py`, `backend/schemas/teacher.py`, `backend/schemas/parent.py`, `backend/utils/excel.py` |
| Required teacher provisioning fields | Legacy requires first name, last name, email, employee ID, and a section/class. Current provisioning permits an empty default last name, missing employee ID, and no assignment. | **True Missing Feature - Verified (Batch 1)** | `backend/schemas/teacher.py`, `backend/utils/teachers.py` |
| Teacher input normalization | Legacy normalizes/trims names and usernames and accepts `firstName`/`lastName`. Current provisioning lacks those two aliases; update also lacks legacy `fullName`, `employeeId`, and `sectionId` aliases. | **True Missing Feature - Verified (Batch 1)** | `backend/schemas/teacher.py` |
| Emergency-contact validation | Legacy requires nonempty phone values to match `09` followed by nine digits. Current schemas enforce only a maximum length. | **True Missing Feature - Verified (Batch 1)** | `backend/schemas/student.py`, `backend/schemas/parent.py` |
| Student input normalization | Legacy maps `emergencyContactNumber`, `emergency_contact_number`, and `guardian_name` to emergency contact and normalizes lowercase gender/handedness on update. Current schemas drop those aliases and reject lowercase update enum values. | **True Missing Feature - Verified (Batch 1)** | `backend/schemas/student.py`, `backend/schemas/parent.py` |
| Section-name capacity | Legacy supports section names up to 100 characters. Current section/teacher request schemas and cached teacher/student section labels impose 50-character limits, despite `Section.section_name` still allowing 100. | **True Missing Feature - Verified (Batch 1)** | `backend/schemas/section.py`, `backend/schemas/teacher.py`, `backend/schemas/student.py`, `backend/models/teacher.py`, `backend/models/student.py`, `backend/schemas/backup.py`, `backend/migrations/parity_batch1.py` |
| Student lifecycle audit logs | Legacy individual archive, restore, and permanent-delete operations record `Archived Student`, `Student Restored`, and `Deleted Student`. Current handlers commit without recording those events. | **True Missing Feature - Verified (Batch 1)** | `backend/routes/students.py` |
| Detailed student-change history | Legacy update logs contain actor identity, field-level before/after changes, guardian-name changes, and an explicit unchanged-save description. Current logging records only that the student was updated. | **True Missing Feature - Verified (Batch 1)** | `backend/routes/students.py` |
| Backup audit events | Legacy successful export/restore records `BACKUP_EXPORT` and `BACKUP_RESTORE`. Current backup routes record neither. | **True Missing Feature - Verified (Batch 1)** | `backend/routes/backup.py` |
| Section-list response field | Legacy `GET /api/chairman/sections` includes adviser `is_active`, nullable when absent. Current handler and `ChairmanSectionItem` omit it. | **True Missing Feature - Verified (Batch 1)** | `backend/routes/chairman.py`, `backend/schemas/operations.py` |
| Adviser selection in section lists | Current section listing can place a substitute into `adviser_teacher_id` when no Primary Adviser exists, and does not filter inactive accounts. Preserve the legacy active-adviser meaning using the normalized model. | **True Missing Feature - Verified (Batch 1)** | `backend/routes/chairman.py` |
| Section-creation response | Legacy `POST /api/chairman/sections` returns `message` and `section_id`. Current alias returns a `SectionResponse` without `message`. | **True Missing Feature - Verified (Batch 1)** | `backend/routes/chairman.py`, `backend/schemas/section.py` |
| Section dissolution (G07 exception) | Retain HTTP 409 when any student, including an archived student, is assigned to the section. The user's Batch 1 guardrail explicitly overrides the original audit recommendation to port legacy detachment. | **Intentional Architecture Upgrade - Verified (retained)** | `backend/routes/sections.py`; protected deletion unchanged; regression in `backend/tests/test_batch1.py` |
| Legacy route role declarations | Current routes remove legacy `super-admin` eligibility from ECCD student listing, teacher domain progress, parent evaluation, and `/students/my-child`. Legacy handlers still require the relevant teacher/parent profile, so this is a declaration mismatch rather than unrestricted Chairman access. | **True Missing Feature - Verified (Batch 1)** | `backend/routes/eccd.py`, `backend/routes/students.py` |
| Percentage rounding | Legacy uses `Math.round`; current Chairman mastery and teacher/parent progress use Python `round`. At a midpoint, `12.5%` becomes `12%` instead of legacy `13%`. | **True Missing Feature - Verified (Batch 1)** | `backend/routes/analytics.py`, `backend/routes/eccd.py` |
| Unassigned-student intervention analytics | Legacy Chairman priority intervention uses a left section join, retaining DI-KAYA records for unassigned students. Current inner join drops them and can incorrectly report `Perfect / Fully on Track`. | **True Missing Feature - Verified (Batch 1)** | `backend/routes/analytics.py` |
| Scorer domain fallback | Legacy resolves a valid `domain_id` when `domain_name` is unrecognized. Current scorer selects the nonempty name first and never falls back to the ID. Verified example: unknown name plus ID 1 produces legacy GM raw score 1, current 0. | **True Missing Feature - Verified (Batch 1)** | `backend/utils/eccd_scorer.py` |
| Import date-string support | Legacy accepts JavaScript-parseable date strings, including ISO timestamps with milliseconds and `Z`. Current `parse_date()` accepts four fixed formats and rejects those ISO timestamps. | **True Missing Feature - Verified (Batch 1)** | `backend/utils/excel.py` |
| Import row-error isolation | Legacy catches failures per student and continues. Current row handling catches only `ValueError`, `ValidationError`, and `IntegrityError`; database failures such as an out-of-range guardian age can abort the remaining import instead of producing a row error. | **True Missing Feature - Verified (Batch 1)** | `backend/utils/excel.py` |
| Checklist guardian fallback | Legacy uses the parent's relationship when the family-link relationship is null, trims relationship labels, and falls back to other linked guardians for missing father/mother entries. Current export loses those fallbacks and can leave linked guardian information blank. | **True Missing Feature - Verified (Batch 1)** | `backend/utils/excel.py`, `backend/utils/checklist_workbook.py` |
| Legacy performance indexes | No current equivalent was found for legacy `idx_messages_thread` or `idx_logs_timestamp`. These support conversation-history and audit-history queries. | **True Missing Feature - Verified (Batch 2)** | `backend/models/message.py`, `backend/models/log.py`, `backend/migrations/parity_batch2.py` |
| Unread polling log noise | Routine GET `/api/messages/unread-count` HTTP 200 access lines are suppressed; non-200 responses, other methods and all other endpoints remain logged. | **Verified (Batch 2)** | `backend/main.py`, `backend/utils/http_middleware.py` |

## Intentional architecture upgrades

The following differences should retain their current architecture.

| Legacy difference | Classification and context authority | Backend location; fix disposition |
| --- | --- | --- |
| `teachers.section_id` and separate teacher activation state replaced by active `SectionTeacher` assignments and live account activation | **Intentional Architecture Upgrade** — §§4 and 6 establish normalized assignments, substitutes, and handover rules. | `backend/models/teacher.py`, `backend/models/section_teacher.py`, `backend/utils/teachers.py`; **do not restore legacy columns** |
| Legacy permission names such as `allow_parent_home_based_edit`, coarse profile flags, and shorthand permission fields replaced by the six canonical flags | **Intentional Architecture Upgrade** — §6 mandates the granular matrix and Primary Adviser inheritance. | `backend/schemas/common.py`, `backend/utils/access.py`, `backend/utils/assessments.py`; **retain canonical permissions** |
| Locked parent profiles now mask names and guardian details more strictly; parent edits are limited to permitted family/contact fields | **Intentional Architecture Upgrade** — §§1 and 6 define permitted parent information and masking. | `backend/utils/students.py`, `backend/routes/students.py`; **retain restrictions** |
| Parent dashboard no longer falls back to an older released period when the latest evaluated period is locked | **Intentional Architecture Upgrade** — §7 explicitly requires latest-period release gating and defines mastery/ranking behavior. | `backend/utils/assessments.py`; **retain behavior** |
| Teacher batches reject duplicates/mismatched periods, lock the student, and enforce chronology against existing records | **Intentional Architecture Upgrade** — §7 explicitly establishes these assessment rules. | `backend/schemas/eccd.py`, `backend/utils/assessments.py`; **retain validation** |
| Teacher passwords, including provisioned initial passwords, must satisfy the strong-password policy; OTP behavior follows `ENABLE_OTP`, including `/login-step1` | **Intentional Architecture Upgrade** — §6 specifies password requirements and server-controlled OTP behavior. | `backend/schemas/common.py`, `backend/schemas/teacher.py`, `backend/routes/auth.py`; **retain policy** |
| Legacy AES-GCM `ames-data-backup-v2` envelope replaced by strict Fernet backup documents | **Intentional Architecture Upgrade** — §9 explicitly establishes Fernet and rejects historical-format restores. | `backend/utils/backups.py`, `backend/schemas/backup.py`; **do not port the old envelope** |
| Summary exports split cohorts by section **and school year**, and safely handle more than 30 students in all export modes | **Intentional Architecture Upgrade** — §8 mandates these grouping and capacity rules. | `backend/utils/excel.py`; **retain grouping/chunking** |
| Legacy MySQL query/identifier helpers replaced by SQLAlchemy and PostgreSQL; LRN helper operations are implemented through current primitives and model properties | **Intentional Architecture Upgrade** — §§2 and 4 establish the stack and protected identity model. | `backend/config/database.py`, `backend/utils/lrn.py`, `backend/models/student_identity.py`; **no duplicate utility port needed** |
| Legacy `/uploads` static hosting replaced by branding images stored as data URLs | **Intentional Architecture Upgrade** — §9 explicitly establishes database-backed branding. | `backend/routes/settings.py`, `backend/models/settings.py`; **no static uploads route needed** |
| Legacy `{error: ...}` responses and request-validation statuses normalized to `message`/`detail` and Pydantic 422 responses | **Intentional Architecture Upgrade** — §§5 and 6 document these contracts. This does not account for the missing authentication codes listed above. | `backend/main.py`; **retain normalization** |

## Original audit verification and preserved behavior

The scoring JSON and ECCD reference JSON are identical, and both workbook templates are byte-identical. **910 pure scoring comparisons matched**; the separate fallback case above differed. Assessment saves, home-only parent submissions, evaluation preservation during transfers, persisted-message authorization, unread/read handling, and exact-batch rollover/undo are implemented.

The route comparison normalized dynamic parameter names and trailing slashes while retaining HTTP methods. The 80 legacy router routes were distributed as follows:

| Legacy router | Route count |
| --- | ---: |
| `authRoutes.js` | 7 |
| `teacherRoutes.js` | 17 |
| `studentRoutes.js` | 10 |
| `messageRoutes.js` | 7 |
| `logRoutes.js` | 1 |
| `settingsRoutes.js` | 3 |
| `eccdRoutes.js` | 8 |
| `chairmanRoutes.js` | 27 |
| **Total** | **80** |

Route presence is a source-level result, not proof of runtime or semantic parity. The three direct health/readiness routes were checked separately from these routers. No database connectivity checks, migrations, application startup, SMTP delivery, or HTTP integration tests were performed for this audit.

## Frontend API service

`frontend/src/services/api.ts` is a shared Axios transport, not an endpoint-method inventory. Its bearer authentication, multipart settings conversion, `message`/`detail` handling, and download handling fit the current documented contracts. No independent missing service method was found in that file.

## Batch 1 remediation - Verified, 2026-10-14

All **25 requested compatibility findings are Verified**. The **G07 section deletion exception is Verified as retained**: sections containing active or archived students still reject deletion with HTTP 409. Health/readiness, rate limits, headers, compression, upload limits, production configuration and performance indexes remain outside this batch.

Implemented auth aliases and both device cookies with production Secure/SameSite=None versus development SameSite=Lax, cookie cleanup after credential changes, legacy session error codes with success:false and existing message/detail, top-level Chairman email and optional challenge email binding. Added Unicode letter/mark name validation, phone validation and aliases, required/normalized teacher provisioning and update aliases, lowercase student enums, 100-character section labels and active-Primary-Adviser section responses.

Analytics/progress use half-up integer rounding; Chairman intervention retains unassigned students. Scoring falls back from unknown domain names to valid IDs. Restored role eligibility retains teacher/parent profile and linked-child ownership checks. Workbook imports accept ISO timestamps and isolate database/runtime failures per row without exposing SQL or exception internals; checklist exports trim relationship labels, use parent relationships for null links and fill missing father/mother slots from other linked guardians.

Student archive/restore/delete events and actual before/after student/guardian field diffs are committed with the changes. Unchanged saves are explicit and LRNs remain masked in logs. Successful backup export/restore events are recorded; restore and its audit event share one transaction. Fernet, live account preservation, canonical permissions, locked masking, latest-period gating, chronology, strong passwords, cohort splitting and data-URL branding remain intact.

Verification evidence:

- `uv run --no-project --python .venv312 python -m py_compile <all backend Python paths>`: **85 files passed**, exit 0.
- `uv run --no-project --python .venv312 python -m unittest discover -s backend/tests -t . -v`: **92/92 passed**, exit 0, 162.418 seconds, no skipped tests. Includes **21 new Batch 1 tests** in `backend/tests/test_batch1.py`, all existing migration/auth/HTTP/scoring/workbook/backup/socket checks, and the protected archived-section case.
- **User-authorized verification adjustment:** neither existing environment contains pytest, so the user explicitly selected the existing unittest runner instead of adding a dependency. No packages, requirements or lockfiles changed.
- Historical Phase 1 widths are frozen to avoid changing the previous migration contract. The explicit Batch 1 migration widens only teachers.class_name and students.section_name, verifies row preservation, and passes repeated-application checks in disposable PostgreSQL schemas. Backup row schemas also accept 100-character labels; long-label provisioning, transfer and Fernet backup/restore pass.
- Backup tests use a temporary test-only Fernet key because the local configured key is invalid. Existing secrets/environment files were neither changed nor regenerated. The suite's PostgreSQL fixtures use disposable schemas; its pre-existing local OTP HTTP check is rollback-contained and restricted to the parity development database.
- `git diff --check` passed; protected frontend/legacy paths and dependency files have no diff. Pre-existing unrelated working-tree changes were preserved.

Batch 1 deployment commands (not applied during Batch 1; explicitly applied to the configured local database during Batch 2):

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.parity_batch1 --apply
uv run --no-project --python .venv312 python -m backend.migrations.parity_batch1 --check
```

Startup continues to avoid automatic schema mutation. This gate establishes backend source and isolated test behavior; it does not claim live SMTP or deployed-browser acceptance.

## Batch 2 remediation - Verified, 2026-10-14

All **12 remaining compatibility findings are Verified**, along with unread-count polling log suppression. Together, Batches 1 and 2 close all **37 missing-feature findings** in this audit. The G07 section-deletion exception and every intentional architecture upgrade remain intact.

Implemented liveness (`/healthz`, `/api/health`) and database readiness (`/ready`) with epoch-millisecond timestamps, 200 ready/connected and sanitized 503 unready/disconnected responses. Production readiness also verifies the shared rate-counter table exists. Startup checks the explicitly migrated schema and never applies migrations automatically.

`ENV` aliases `ENVIRONMENT`; `JWT_SECRET` aliases `SECRET_KEY`. Production requires a strong secret of at least 32 characters, PostgreSQL `sslmode=verify-full`, and a trusted `sslrootcert` URL option or `DATABASE_SSL_ROOT_CERT`. HTTP and Socket.IO share deduplicated exact origins from comma-separated `FRONTEND_URL` and `ALLOWED_ORIGINS`, retaining both localhost defaults. Remote production origins require HTTPS; wildcard/path/credential/invalid-port origins are rejected. Reverse-proxy IP resolution remains Uvicorn's responsibility: configure `--proxy-headers --forwarded-allow-ips` with the deployment's trusted proxy addresses. Application code does not accept arbitrary forwarded IP headers.

GZip response compression, safe CSP and Helmet-equivalent headers are active, including nosniff, DENY, strict-origin-when-cross-origin and production HSTS. Uncaught HTTP exceptions return exactly `{ "success": false, "message": "Internal server error" }` without exception/SQL contents, retaining security and allowed-origin CORS headers.

Actual incoming bytes are bounded even without Content-Length, with false lengths and chunked bodies covered. General request bodies have a **50 KiB** ceiling; upload handlers bound each Excel file to **20 MiB**, each branding image to **5 MiB**, and encrypted backups to **50 MiB**. Multipart envelopes permit bounded framing overhead and at most two branding files on settings updates. Oversize payloads return 413 before processing; Fernet export verifies its output fits the restore ceiling, and direct restore also checks size before decryption or mutation. Uploaded branding MIME types are restricted to JPEG, PNG and WebP; SVG is rejected. Data-URL branding and the existing Fernet format remain unchanged. Multipart settings resources close on success and validation failure.

HTTP budgets match legacy thresholds and apply before request parsing/authentication, including invalid requests and aliases sharing one budget:

| Budget | Maximum / window |
| --- | --- |
| Global API | 120 / minute |
| Login, OTP verify, password, student linking | 10 / 15 minutes each |
| OTP send, parent registration, teacher provisioning | 5 / 15 minutes each |
| Backup, import/export and other heavy operations | 5 / 10 minutes |
| Readiness probes | 60 / minute |
| Socket handshakes | 30 / minute per IP |
| Socket events | 100 / minute per IP, plus 25 / 10 seconds per socket |

HTTP exhaustion returns sanitized 429 JSON and Retry-After. Socket event exhaustion emits `rate_limit_error` and disconnects; handshake exhaustion rejects transport establishment. Unknown socket events also consume the packet budget. Production uses atomic PostgreSQL upserts for shared HTTP/socket counters and fails closed with sanitized 503 responses if storage fails. IPv6 clients share /56 buckets. Python-only fixture bypass/reset hooks have no HTTP or environment activation, and the bypass flag cannot disable production enforcement. Production-cookie tests mock counters explicitly, while concurrency tests exercise real production counters in disposable schemas.

The explicit transactional `004_batch2_deployment_hardening` migration creates `idx_messages_thread` on `(parent_id, teacher_id, is_archived, created_at)`, `idx_logs_timestamp` on `timestamp`, and operational `api_rate_limits` storage with a cleanup index. It verifies index/storage shape and school-row preservation, serializes repeated applies, and rolls back incompatible-index failures. Operational counters are outside school backup/restore metadata and are preserved by restores. Historical Phase 1 metadata stays frozen; the browser-test harness explicitly prepares both parity migrations in its disposable schema.

Fresh verification evidence:

- `uv run --no-project --python .venv312 python -m py_compile <all backend Python paths>`: **all 92 files passed**, exit 0.
- `uv run --no-project --python .venv312 python -m unittest -v`: **110/110 passed**, 127.140 seconds, no failures, errors or skipped tests. Includes **18 Batch 2 tests**, 21 Batch 1 tests and all earlier regressions. The backend package marker enables the requested standard root discovery. No pytest or new dependencies were used.
- Both `backend.migrations.parity_batch1 --apply` and `backend.migrations.parity_batch2 --apply` succeeded on the configured **local `ames_parity_dev` database**; both `--check` commands passed. The migrations preserve school records and credentials. No remote production deployment is claimed.
- `git diff --check` passed. Frontend, legacy, dependencies, lockfiles and environment/secret files have no diff. Existing verified backend/context/audit changes are included in the requested parity completion commit on `unsure-check-first`; `main` is untouched.
- The existing invalid local Fernet backup key remains unchanged. Backup tests use temporary test-only keys; operational backup success with that invalid local key is not claimed. Live SMTP and deployed-browser acceptance remain outside this verification gate.
