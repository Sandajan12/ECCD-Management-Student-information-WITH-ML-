# AMES System: Current Codebase Context

Updated: **2026-10-14**. This document describes the active working tree in
`backend/` and `frontend/`, including existing uncommitted changes. Local
configuration observations are a snapshot, not deployment defaults or a claim
that every workflow has passed testing. Update this context when code changes.

`AMES-SYSTEM-LEGACY/` is a read-only reference folder, excluded from the active
workspace. Its code and configuration were not used for this update. Active
source, manifests, schemas, and migrations establish the current contracts.
Other documents may retain historical migration descriptions.

## 1. Purpose and implementation status

AMES manages early childhood student records and deterministic DepEd ECCD
assessments. Teachers enroll learners, assess PRE/MID/POST skills, manage assigned
sections, release results, and communicate with parents. Parents link children,
view permitted profiles/results, edit permitted family information, and submit
permitted home-based observations. The Chairman manages teachers, sections,
records, question access, school settings, audit history, exports, and backups.

These workflows exist in the active Python/FastAPI/PostgreSQL and React/TypeScript
code. Predictive machine learning remains a goal, not an implemented service.
Installed ML libraries do not establish that models or inference endpoints exist.

## 2. Active stack and observed local setup

| Layer | Implementation / authority |
| --- | --- |
| Backend | FastAPI, Pydantic V2, SQLAlchemy 2 ORM, synchronous PostgreSQL sessions through psycopg2; exact pins in `backend/requirements.txt` |
| Python | Project requests Python 3.12 in `.python-version`; package management uses Astral uv |
| Server | Uvicorn; `backend.main:app` is the Socket.IO ASGI wrapper; `backend.main:api` is FastAPI |
| Security | JWT through python-jose, direct bcrypt hashing, account-bound OTP challenges and remembered devices |
| Encryption | AES-256-GCM for LRNs, HMAC-SHA256 for exact LRN lookup, Fernet for encrypted JSON backups |
| Frontend | React 19, TypeScript 6, React Router 7, Vite 8, Axios, Recharts, Socket.IO client |
| Styling | **MUI 9 and Emotion are active**, alongside Tailwind CSS 4, scoped CSS, native components, and Poppins fonts |
| UI architecture | Teacher/parent layouts use MUI ThemeProvider/CssBaseline and `components/teacher/theme.ts`; Chairman/auth/shared UI also use native/Tailwind components |
| JS tooling | pnpm **12.11.2** pinned in root `package.json`; ESLint, Prettier, Playwright |
| Workspace | `pnpm-workspace.yaml` includes only frontend, retains separate lockfiles, disables automatic dependency verification before script execution |
| Spreadsheets | openpyxl handles active workbook import/export; pandas is installed |
| Migrations | Explicit Python Phase 1/2 migrations; no active Alembic setup, pyproject.toml, or uv.lock |

Observed on this Windows checkout:

- `.venv312` contains **Python 3.12.13**. `.venv/pyvenv.cfg` reports **Python 3.14**;
  do not assume `.venv` meets the Python 3.12 requirement.
- Node **24.11.1**, uv **0.11.26**, pnpm **12.11.2** were observed. Root Node
  engine range: `^20.19.0 || ^22.13.0 || >=24`.
- Installed metadata in `.venv312`: FastAPI **0.141.1**, SQLAlchemy **2.0.54**,
  Pydantic **2.13.5**, Uvicorn **0.53.0**, python-socketio **5.17.0**.
- `backend/.env` exists: `ENVIRONMENT=development`, **`ENABLE_OTP=true`**, HS256,
  60-minute access tokens, PostgreSQL at `localhost:5432/ames_parity_dev`.
  JWT, backup, and LRN secret values are present; their contents remain private.
- `frontend/.env.local` sets both `VITE_API_URL` and `VITE_SOCKET_URL` to
  `http://localhost:8000`. `frontend/.env` is absent.
- File/metadata inspection does not verify database connectivity, the applied
  migration ledger, SMTP delivery, or running servers.

### Commands and configuration

Run from the repository root. Use pnpm for JavaScript dependencies; on Windows,
`pnpm.cmd` avoids PowerShell restrictions on the .ps1 launcher.

```powershell
# Explicitly select the observed Python 3.12 environment.
uv run --no-project --python .venv312 python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000 --env-file backend/.env

# In another root terminal:
pnpm.cmd run frontend
```

Root scripts currently define:

```json
{
  "backend": "uvicorn backend.main:app --reload --port 8000",
  "frontend": "pnpm --dir frontend dev",
  "dev": "pnpm run \"/^(backend|frontend)$/\""
}
```

`pnpm.cmd run dev` dispatches both scripts, but the backend script needs uvicorn
on PATH from the intended interpreter. It does **not** invoke uv or select Python
3.12. uvicorn was not resolved by the current shell's Get-Command inspection;
the explicit uv command above avoids that dependency.

For dependency preparation, inspect existing environments first:

```powershell
# Create only if .venv312 is absent; preserve existing environments.
uv venv --python 3.12 .venv312
uv pip sync --python .venv312 backend/requirements.txt
uv pip check --python .venv312
pnpm.cmd install --frozen-lockfile
```

`uv pip sync` takes the requirements file positionally and can remove extras.
`uv run --no-project` does not automatically install requirements.txt.
Manifests/lockfiles establish versions; never freeze an unrelated interpreter
over the project's requirements.

`backend/config/settings.py` loads the absolute backend/.env path through
Pydantic Settings; process variables override it. `utils/email.py` also loads
that file for SMTP. Copy environment templates only when local files are absent.

| Setting | Contract |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL URL; engine and SessionLocal are in `config/database.py` |
| `JWT_SECRET` / `SECRET_KEY`, `ALGORITHM` | JWT_SECRET alias has precedence; production requires a strong secret of at least 32 characters; algorithm defaults HS256 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Code default 30; template and observed local file use 60 |
| `ENABLE_OTP` | Defaults **true**, independently of ENVIRONMENT; controls OTP and SMTP |
| `ENV` / `ENVIRONMENT` | ENV alias has precedence; defaults production; enables production deployment validation, shared rate limits, HSTS and secure cookies |
| `FRONTEND_URL`, `ALLOWED_ORIGINS` | Comma-separated exact HTTP(S) origins; combined with localhost defaults for HTTP and Socket.IO; remote production origins require HTTPS |
| `DATABASE_SSL_ROOT_CERT` | Optional trusted CA path (or libpq system roots); production DATABASE_URL requires sslmode=verify-full and this setting or a URL sslrootcert |
| `BACKUP_ENCRYPTION_KEY` | Stable Fernet key, normally 44 URL-safe base64 characters; invalid keys are rejected |
| `BACKUP_IV` | Required by Settings, unused by the current Fernet implementation |
| `LRN_ENCRYPTION_KEY` | 64 hexadecimal characters; required for LRN protection operations |
| `LRN_HMAC_SECRET` | At least 32 characters; required for exact LRN lookup |
| `MAIL_*` | SMTP account/password/sender/server/port and STARTTLS/SSL settings |
| `VITE_API_URL` | Public backend origin without /api; fallback http://localhost:8000 |
| `VITE_SOCKET_URL` | Optional chat-origin override; otherwise chat uses API origin |

Never print or regenerate existing secrets. Preserve LRN encryption/HMAC keys
and the backup key with backups. `scripts/configure_lrn.py` privately creates
missing keys and refuses unsafe replacement scenarios.

Lifespan in `backend/main.py` checks Phase 2 and both parity migrations in the connection's current schema, then seeds
`assets/reference/eccd.json` (7 domains, 109 questions) only if **both** reference
tables are empty. Existing/custom data stays intact. Startup does not call
create_all, apply migrations, or provision users.

HTTP and Socket.IO CORS share configured FRONTEND_URL/ALLOWED_ORIGINS and retain
http://localhost:5173 and http://127.0.0.1:5173 defaults. Vite enables React/Tailwind
plugins, with no API proxy or custom port. Default UI port is 5173; the documented
API launch uses 8000. FastAPI exposes /docs, /openapi.json, and an API welcome at /.
/healthz and /api/health report liveness with epoch-millisecond timestamps;
/ready checks SELECT 1 (and shared rate storage in production), returning 200
ready/connected or sanitized 503 unready/disconnected.

## 3. Code ownership and frontend navigation

| Location | Responsibility |
| --- | --- |
| `backend/config/` | Settings, database engine/session dependency |
| `backend/models/` | ORM entities, constraints, protected identity compatibility |
| `backend/schemas/` | Pydantic requests/responses, operation results, strict backup document |
| `backend/routes/` | HTTP handlers and aliases |
| `backend/utils/access.py`, `deps.py` | Ownership, active adviser inheritance, role/question gates |
| `backend/utils/authentication.py`, `account_changes.py`, `security.py`, `email.py` | Sessions, OTP/device lifecycle, credentials, hashing, mail |
| `backend/utils/students.py`, `teachers.py`, `lrn.py` | Masked profiles, guardians, provisioning/assignments, LRN primitives |
| `backend/utils/assessments.py`, `eccd_scorer.py` | Assessment saves, parent masking/cards, deterministic scores |
| `backend/utils/excel.py`, `checklist_workbook.py` | Import, checklist/matrix export, ZIP downloads |
| `backend/utils/rollover.py`, `backups.py` | Archive snapshots/undo and encrypted backup/restore |
| `backend/utils/messaging.py`, `realtime.py` | Conversation authorization and Socket.IO |
| `backend/utils/reference_data.py` | Conditional initialization of existing ECCD JSON |
| `backend/migrations/`, `tests/`, `scripts/` | Schema transitions, tests, local setup/diagnostics |
| `frontend/src/services/api.ts`, `types.ts` | Shared Axios/download/error handling and frontend contracts |
| `frontend/src/context/` | Authentication, school settings, assigned teacher sections |
| `frontend/src/hooks/` | Assessment loading, teacher/parent assessment flows, children/profiles |
| `frontend/src/pages/chairman/`, `teacher/`, `parent/` | Active role-page implementations |
| `frontend/src/layouts/`, `components/` | Role layouts, forms, auth, chat, checklist, sync feedback |
| `frontend/src/utils/` | Durable drafts/files, credential drafts, age display, section metrics |

`App.tsx` mounts /super-admin/*, /teacher/*, /parent/* through role guards.
Backend roles are `super-admin` (Chairman), `admin` (Teacher), `user` (Parent);
frontend guard lists also accept descriptive aliases. Chairman redirects remain.
The teacher question route requires `allow_eccd_question_management`.
Old workspace/shim page directories are absent.

## 4. Current relational model

| Table / model file | Identity and important fields |
| --- | --- |
| users / `models/user.py` | user_id, unique username/email, password hash, role, active/pending/first-login flags; compatibility OTP columns remain |
| teachers / `models/teacher.py` | teacher_id, unique nullable user_id, employee ID, names/class label, six parent flags, question-management permission |
| parents / `models/parent.py` | parent_id, unique nullable user_id, guardian name/age/education/occupation; guardian-only records can lack login accounts |
| sections / `models/section.py` | section_id, unique name, adviser compatibility pointer |
| section_teachers / `models/section_teacher.py` | Assignment ID, section/teacher FKs, assigned date; Primary Adviser only, Active/Inactive, one active assignment per section (migration 008) |
| students / `models/student.py` | **Integer student_id PK**, encrypted LRN, unique HMAC hash, last four digits, names including middle name, DOB/gender, section, family/contact fields, school year, active flag |
| family_access / `models/parent.py` | Parent/student-ID FKs, relationship type, timezone-aware date_linked |
| eccd_domains, eccd_questions / `models/eccd.py` | IDs, domain FK, question text, sequence_order, is_home_based |
| student_eccd_evaluations / `models/eccd.py` | Evaluation/student/teacher/question IDs, PRE/MID/POST, KAYA/DI-KAYA, date; unique (student_id, question_id, testing_period) |
| messages / `models/message.py` | Teacher/parent FKs, sender role, subject/body, read/archive flags, creation time |
| system_logs / `models/log.py` | User-linked actions, TEXT details including rollover snapshots/chunks, timestamp |
| system_settings / `models/settings.py` | Singleton ID 1; branding/images, school/principal, opening month 1-12, current/previous year, rollover timestamp |
| email_verifications / `models/email_verification.py` | Account/email/purpose-bound hashed challenge/OTP, expiry, attempts; login/registration/password-change/email-change purposes |
| user_trusted_devices / `models/trusted_device.py` | Account FK, hashed token, user agent, UTC expiry/creation |

Final schema has **no plaintext students.lrn_number or child student_lrn database
columns**. Hybrid Python compatibility properties in student.py,
student_identity.py, and student_reference.py map operations onto protected
identity. Do not restore plaintext SQL columns. Keep FK/cascade integrity.

LRNs are exactly 12 digits, AES-GCM encrypted as iv:tag:ciphertext hex, indexed by
HMAC, and publicly masked as eight bullets plus four digits. Public aliases
`lrn`, `lrn_number`, and `student_lrn` contain masked values. Frontend
URLs/payloads/drafts use student_id; raw LRNs are enrollment/linking inputs.
Some backend path parameters still say lrn and accept valid LRNs or IDs;
preserve those routes and their protection.

### Schema preparation and development tooling

For a fresh configured database, create missing LRN keys, apply Phase 1, then
Phase 2. For an existing Phase 1 database, apply only Phase 2. Stop dev servers
before migration and preserve accounts/secrets.

```powershell
# Fresh database only, in order:
uv run --no-project --python .venv312 python -m backend.scripts.configure_lrn
uv run --no-project --python .venv312 python -m backend.migrations.phase1 --apply
uv run --no-project --python .venv312 python -m backend.migrations.phase2 --apply

# After Phase 2, widen cached section labels on both fresh/existing databases.
uv run --no-project --python .venv312 python -m backend.migrations.parity_batch1 --apply
uv run --no-project --python .venv312 python -m backend.migrations.parity_batch1 --check

# Performance indexes and shared production rate-limit storage:
uv run --no-project --python .venv312 python -m backend.migrations.parity_batch2 --apply
uv run --no-project --python .venv312 python -m backend.migrations.parity_batch2 --check

# Read-only final-schema/integrity check:
uv run --no-project --python .venv312 python -m backend.migrations.phase2 --check
```

Phase 2 records `002_student_identity_api` in ames_schema_migrations and checks
data preservation in the same transaction as schema changes. Do not run
historical Phase 1 checks against a final Phase 2 database.

`scripts/setup_parity_dev.py` explicitly creates/selects local ames_parity_dev,
updates local environment files, runs preparation, and invokes
`scripts/seed_development.py`. Seeding is guarded to that loopback development
database and preserves differing existing accounts. These utilities mutate
state; they are not ordinary startup or read-only checks.

## 5. HTTP contract map

`backend/main.py` registers these families and aliases. JSON contracts live in
schemas; workbook/ZIP/backup endpoints stream bytes. Consult code/OpenAPI for
the complete method/path/query inventory.

| Area | Principal paths | Handler |
| --- | --- | --- |
| Authentication | /api/auth/login, /login-step1, /verify-otp, /register-parent, /update-password, /send-otp, /request-otp, /logout | `routes/auth.py` |
| Teacher CRUD/access | /api/teachers/, /active, /archived, /create, user-ID update/archive/unarchive/delete aliases, /me/access, /access-controls, password request/verify | `routes/teachers.py` |
| Teacher analytics | GET /api/teachers/dashboard-filters, /dashboard-pie, /dashboard-stats reuse teacher-gated analytics handlers | `routes/teachers.py`, `analytics.py` |
| Students | /api/students/, /all, /create, /archived, /section/{section_id}, /archive-all, /my-child, /linked, /link, identifier read/update/archive/unarchive/delete aliases | `routes/students.py` |
| Chairman records | /api/chairman/students, /students/transfer, /teachers, /teachers/{teacher_id}/permissions | `routes/students.py`, `chairman.py` |
| Sections | /api/sections/, /{section_id}/assign; /api/chairman/sections, /{section_id}/assign-teacher, /{section_id}/assign | `routes/sections.py`, `chairman.py` |
| Teacher ECCD | /api/eccd/students, /domains-progress, /assessment/{lrn}, /evaluate, /student/{student_lrn}, /section/{section_id}/summary | `routes/eccd.py` |
| Parent ECCD | /api/eccd/parent/assessment/{student_lrn}, /evaluate, /domains-progress/{student_lrn}, /dashboard-stats/{student_lrn}, /progress/{student_lrn} | `routes/eccd.py` |
| Parent children | /api/parents/children, /children/link, /children/{lrn}, /children/{lrn}/eccd-summary | `routes/parents.py` |
| ECCD configuration | /api/eccd-config/ domain/question CRUD and home-based switch; /api/chairman/eccd-data, /eccd-domains, /eccd-questions aliases | `routes/eccd_config.py` |
| Analytics/audit | /api/analytics/filters, /pie-data, /stats, /logs; /api/logs aliases | `routes/analytics.py` |
| Import/checklists | POST /api/teachers/import-students; GET /download/{lrn}, /download-all | `routes/teachers.py` |
| Summary exports | /api/chairman/export-eccd, /sections/{section_id}/export-summary; /api/eccd/section/{section_id}/export, /export-all | `routes/chairman.py`, `eccd.py` |
| Messaging | /api/messages/contacts, /history, /send, POST /, /notify-student, /unread-count, /unread, /read, /mark-read; /link-lrn linking alias | `routes/messages.py`, `students.py` |
| Settings/year | /api/settings, /update, /upload-background, /rollover, /undo-rollover, /revert-school-year; /api/chairman/rollover-year, /undo-rollover | `routes/settings.py` |
| Chairman account | /api/chairman/verify-password, /account | `routes/chairman.py` |
| Backup | /api/backup/export, /restore; /api/chairman/backup/export, /restore | `routes/backup.py` |

Shortened paths in each row are relative to that row's API prefix.

Axios uses localStorage bearer tokens, credentials, and a 20-second default
timeout. Downloads use 120 seconds, decode blob-contained JSON errors, and honor
Content-Disposition. Relevant settings payloads convert to multipart. HTTP
errors expose detail/message; 422 responses retain location/type/message without
echoing sensitive inputs. Non-auth 401 responses trigger session expiry except
incorrect-current-password responses.

## 6. Authentication and access invariants

- Personal passwords require 8+ characters, uppercase, lowercase, a number, and
  at most 72 UTF-8 bytes for bcrypt. Chairman-provisioned teacher temporary
  passwords require only 8+ characters (not whitespace-only) within the same
  byte limit; mandatory first-login password replacement remains enforced.
  Pydantic failures normally return 422; route business failures use explicit statuses.
- JWT sessions bind to live user role/email/password hash via credentialVersion.
  Inactive/pending accounts cannot access protected services.
- New teachers must change their initial password before protected APIs/chat.
  Only the initial-password flow accepts the restricted first-login session.
- OTP enabled: 10-minute account/email/purpose-bound hashed challenges/codes,
  five allowed incorrect attempts, replay rejection. Failed registration email
  leaves a recoverable pending account.
- OTP disabled: login/registration sign in without SMTP. The challenge utility
  uses 123456 only in this disabled mode; verification still requires a valid
  bound challenge. Frontend follows server responses, not a separate OTP flag.
- Credential changes return replacement sessions and revoke challenges/devices;
  prior credential-bound JWTs become invalid. Remembered devices store token
  hashes with 30-day expiry, not renewed by login. Ordinary logout preserves them;
  explicit forget-device revokes them.
- Teacher ownership uses active SectionTeacher assignments. Primary Adviser
  replacement deactivates previous adviser assignments; substitutes preserve the
  adviser. Displaced teachers with no other active assignments are deactivated.
  Handovers/transfers preserve evaluation rows and log actions.
- Question-management permission defaults false. verify_eccd_question_access
  permits Chairman writes and teachers with allow_eccd_question_management.

### Six granular parent permissions

| Teacher column | Default |
| --- | --- |
| allow_parent_view_student_info | true |
| allow_parent_view_eccd_pre | false |
| allow_parent_view_eccd_mid | false |
| allow_parent_view_eccd_post | false |
| allow_parent_edit_student_info | true |
| allow_parent_edit_home_based_eccd | false |

Inheritance uses the section's **active Primary Adviser with an active account**
via utils/access.py. Neither a substitute nor cached adviser pointer determines
permissions. No adviser means locked access. Coarse compatibility properties on
Teacher are not new permission columns; new flows use the six flags above.

Unreleased scores, answers, dates, ages, matrix values, and progress must remain
null, with is_published=false and interpretation **Pending Adviser Release**.
Locked profile/guardian fields are masked. Parent updates/home saves enforce the
respective permission with HTTP 403. Frontend placeholders/disabled controls
supplement backend enforcement.

## 7. Assessments, age, and analytics

- Periods are PRE/MID/POST; answers are KAYA/DI-KAYA; question order follows
  sequence_order. Teacher batches reject unknown/duplicate questions and mismatched
  periods, and enforce **PRE < MID < POST** dates before writes.
- Teacher saves lock the student, normalize existing dates in the selected period
  to the supplied date, upsert submitted answers, and commit. They do not save
  later-period answers automatically.
- Teacher UI carry-over in hooks/useTeacherAssessment.ts is virtual: earlier KAYA
  can prefill unsaved later periods; saved answers and deliberate drafts win.
  Each later period needs an explicit save and its own assessment date.
- Parent saves accept only is_home_based questions. Changed/new answers use today's
  date; unchanged answers retain their dates. This path is separate from teacher
  batch-date validation.
- Student age is dynamically derived, never read from a static stored age.
  utils/eccd_scorer.py uses elapsed years/completed months and one-decimal
  **ROUND_HALF_UP**. Scores use assessment-date age. Roster/profile decimal_age
  currently uses the student's **school-year opening-month baseline** through
  utils/access.py::student_age, falling back to today without a valid year.
  Frontend utils/dateUtils.ts is for display; backend scoring is authoritative.
- backend/eccd_scoring_data.json contains age-bracket raw/scaled/standard-score
  and interpretation tables for GM/FM/SH/RL/EL/C/SE. The scorer falls back to the
  closest lower available raw/sum lookup entry when the exact entry is absent.
  Preserve these deterministic tables and rules.
- Parent dashboard selects latest evaluated **POST > MID > PRE**, with release
  gating that does not expose a locked latest period through an older one.
  Current parent_dashboard ranks domains by **KAYA ratio among recorded answers**,
  with alphabetical tie-breaking. assessmentMastered requires POST, at least one
  record, and zero DI-KAYA; it does not independently verify all 109 answers.
  Responses include totalKaya/totalDiKaya, overallStatus, domainCards/publication.
- Staff analytics filter by section/domain/period/school year. schoolYear=All
  generally uses active students; a specified year permits historical cohorts.
  Teacher queries stay within active assignments. Backend teacher priority uses
  latest period **per student/question**; completion divides submitted rows by
  students × questions × three periods. Chairman summaries aggregate answer counts.
  These percentages are distinct from scaled/standard scores.
- frontend/src/utils/teacherMetrics.ts calculates selected-section display
  metrics from committed assessments: full-domain completion and priority from
  each student's latest populated period. Distinguish these from backend aggregates.

## 8. Excel import/export

utils/excel.py imports .xlsx using **Info Sheet** and GM/FM/SH/RL/EL/C/SE tabs.
It checks teacher-section metadata, derives the cohort year from the first valid
PRE date, handles Excel date epochs, matches domain rows by normalized names,
and maps questions by sequence_order. Demographics, father/mother records, and
evaluations commit together per student. Invalid rows roll back while successful
rows remain; return shape is
`{ successCount, failedCount, errors: [{ row, error }] }`.
Cross-section updates are rejected. Do not assume teacher batch-date validation
also runs in this separate importer.

Exports use supplied blank assets, both present in this checkout:

- `backend/assets/templates/ECCD_Checklist_Blank_Template.xlsx`: CHECKLIST,
  demographics/guardians, period marks, raw/scaled totals, standard scores, and
  interpretation. utils/checklist_workbook.py handles fixed mappings/merged cells;
  row 16 contains scaled totals.
- `backend/assets/templates/ECCD_Summary_Matrix_Template.xlsx`: PR/M/PO,
  cohort demographics, dates/ages/scores, and gender interpretation totals.
  manifest.json records asset hashes/sheets.

Both blank assets have explicit Git ignore exceptions. Authorized staff exports
decrypt full LRNs in memory. Cohorts group by section **and individual school
year**, split into batches of at most **30 children**, and produce ZIPs for
multiple workbooks/all sections. Never silently discard children beyond 30.
Compatibility export endpoints accept testing_period but currently generate the
workbook with all three period sheets.

## 9. Messaging, settings, rollover, and backups

Conversations require active teacher/parent accounts linked through an active
student in an active teacher assignment. Contacts/history/unread/read receipts
respect access and archived-message filtering. Messages accept content/body
aliases; saved responses include IDs and body/content. notify-student persists
notices for active linked parents.

Socket.IO uses `auth: { token }`, authorized rooms `teacher-N-parent-M`, and
room acknowledgement. **HTTP persistence is authoritative**: save first, then
emit send_message with `{ room, message_id }`. Server reloads the sender-owned
saved message and rechecks recipient access; client bodies cannot override it.
Chat deduplicates IDs, recovers HTTP history on reconnect, and polls open threads.
Restore disconnects active chat sessions.

Settings include school/principal names, branding, current year, and opening
month (default August). Public settings GET creates singleton defaults if absent;
it is not guaranteed to be a read-only database operation. Branding images are
base64 data URLs in settings, not files in an active uploads directory.

New enrollment takes its school year from server settings. Rollover calculates
the next year, archives exactly active students/unarchived messages, and records
a batch snapshot/ID chunks transactionally. Undo uses a **30-day window** and
restores only that batch's IDs and original month; older archives stay archived.
Missing/invalid snapshots are rejected. Never reactivate all records globally.
Frontend restore/rollover require explicit confirmation; restore is not queued
for automatic offline replay.

utils/backups.py exports strict schemas/backup.py::BackupDocument JSON through
**Fernet .enc**. Other SQL/CBC/historical-schema containers are not current-format
restores. Restore validates before deletion, replaces school records in dependency
order, retains **live users/credentials**, clears verification/device records,
restarts school-data sequences transactionally, and commits once. Invalid
relationships/missing accounts roll back all changes. Invalid keys are errors,
not reasons to generate temporary replacement keys. Backup routes are Chairman-only.

## 10. Offline durability and development rules

Preserve inputs across reload, network failure, offline operation, and session
expiry. **Never call localStorage.clear().** Evict only the exact confirmed record
and revision after HTTP 200/201; older responses cannot erase newer edits.
Validation/permission failures retain inputs for review.

- utils/drafts.ts stores owner_id, values, revision, is_pending_sync, optional
  request/error in owner-scoped localStorage. Sequential sync checks owner/revision.
- Teacher keys: `eccd_draft_<studentId>_<period>_<domainId>_<ownerId>`.
  Parent keys: `eccd_draft_<studentId>_<period>_<domainId>_home_<ownerId>`.
  Generic keys: `ames_draft_<ownerId>_<resource>`.
- utils/eccdOfflineSync.ts re-exports shared confirmation/sync primitives.
  components/SyncStatus.tsx runs form/file sync on mount/reconnection, shows
  non-blocking network/storage feedback, and offers retry.
- utils/sessionDrafts.ts persists credentials in tab-scoped sessionStorage.
  utils/fileDrafts.ts persists files/revisions in IndexedDB; workbook/background
  uploads can retry on reconnect. Partial imports retain the workbook and errors.
- Logout clears session state, not work drafts. Child/teacher-section selections
  and caches are owner scoped. Refetches must not replace unsaved inputs; stale
  responses must not cross child/section selections.
- Maintain explicit TypeScript contracts; avoid any. Parent gates follow server
  permissions. Custom MUI styling uses **sx**, with responsive sizing, rounded
  controls, soft depth, whitespace, and readable typography. Native/Tailwind
  components remain supported alongside MUI.
- Preserve route aliases, response shapes, database constraints, deterministic
  scoring, evaluation history, permission masking, and confirmation-safe drafts
  when changing features. Do not infer behavior solely from historical docs.

## 11. ML research inference and verification boundaries

The active `backend/ml/` training pipeline uses exactly 18 PRE and demographic
features to predict three supported POST classes. Trusted artifacts, including
`rf_post_test_model.joblib`, `prescriptive_guides.json`, and
`MODEL_EVALUATION_REPORT.md`, live in `backend/ml/artifacts/`, as established by
`common.py`. Model binaries and research datasets follow existing Git-ignore
policy; deployments need the trusted locally generated artifacts.

`inference.py` caches the fitted pipeline and JSON guides. FastAPI lifespan warms
the cache; unavailable/incompatible artifacts produce a sanitized HTTP 503 for
predictions without disabling ordinary school workflows. No inference refits,
database migrations, assessment writes, or scoring-rule changes are introduced.

Teacher-only routes in `routes/ml.py` expose `GET /api/ml/students?section_id=N`,
`POST /api/ml/predict/student/{student_id}`, and `POST /api/ml/predict/sandbox`.
The roster and student inference enforce active section assignments. Student
inference requires all configured PRE questions, all seven domains, a teacher-
confirmed PRE date, and a valid birth date. Existing deterministic scoring and
completed-month age use that PRE date. Parent observations can contribute answers
without turning their submission dates into an official teacher test date.

Missing demographics go through the saved median/mode imputers. Canonical parent
education values come only from synced family records. Free-text occupations have
no reviewed training mapping and remain missing, rather than inferring household
tiers. Imputed fields are disclosed. Returned baseline tiers and interventions
follow the existing rules: scaled <=6 or explicit DI-KAYA items, independently of
the predicted outcome. DI-KAYA item numbers are positions within each domain.

`/teacher/ml-insights` provides section-scoped student testing, probabilities,
seven baseline cards, expandable classroom/home activities, and a debounced
18-input sandbox. It reuses Tailwind cards, MUI Stack structure, and installed
Material icons (Lucide is not installed). Sandbox values persist in owner-scoped
drafts, remain after successful inference, and retry on reconnection; failed
requests never discard inputs. No prediction is persisted as an assessment.

The page explicitly identifies educational research use, not clinical diagnosis,
and documents the report's mixed-holdout 88.9% accuracy versus 25% on eight real
holdout learners. All 29 observed real POST outcomes are Average; all contribute
generator anchors, so there is no independent real-world validation. Probabilities
are not calibrated clinical confidence; activities do not establish treatment
effectiveness. Advanced developmental classes remain unsupported.

Fresh feature verification (2026-10-18): all 8 existing model acceptance tests
and 6 new API/cache tests pass. API checks use disposable PostgreSQL schemas and
cover section/role gates, incomplete/parent-only PRE sessions, missing-field
imputation, canonical demographics, sanitized unavailability, cache reuse, and
unchanged assessments. All 4 real-API desktop/mobile Playwright cases pass via
`playwright.ml-insights.config.ts`, including readable 320px field widths,
probabilities/activities, offline draft retention, reconnection, and reload.
Screenshots are in `frontend/test-results/ml-insights/`. Changed Python files
compile; app TypeScript and changed-file ESLint pass. Production build passes
with the existing large-bundle advisory. No dependencies or branches were added.

### Verification commands and isolation

Use checks appropriate to the change, from root:

```powershell
uv pip check --python .venv312
pnpm.cmd --dir frontend exec tsc --noEmit
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build

uv run --no-project --python .venv312 python -m unittest backend.tests.test_phase1 backend.tests.test_phase2 -v
uv run --no-project --python .venv312 python -m unittest backend.tests.test_dev_otp -v
pnpm.cmd --dir frontend run test:e2e --reporter=list
```

Root frontend TS config uses references; root-only tsc --noEmit does not fully
check app/tooling projects. Build runs tsc -b && vite build.

Phase 1/2 tests use disposable PostgreSQL schemas, synthetic accounts, mocked
mail. tests/test_dev_otp.py includes a rollback-contained HTTP check restricted
to local ames_parity_dev. Working-tree tests/test_parity.py includes a route
comparison that reads the reference folder, outside this update's review scope.

frontend/playwright.config.ts uses one worker, desktop/mobile Chromium, UI
port 5173, visual harness 5187, and backend.tests.serve_phase3 on loopback 8767
with disposable schemas. Some visual tests need reference assets. Never deploy
the test API or direct reset operations at school data. SMTP diagnostics can
send real email and are not ordinary read-only checks.

**This documentation refresh performed source/configuration inspection and
tool/package metadata checks, not application tests, migrations, database
connectivity, SMTP delivery, or browser verification.** Previous pass counts
are not evidence for the current working tree. Preserve unrelated changes and
report fresh verification results only when actually run.

## 12. Backend parity remediation Batch 1 (2026-10-14)

Batch 1 repairs are implemented and **Verified** in
`BACKEND_PARITY_READ_ONLY_AUDIT.md`. Authentication accepts rememberMe and both
device token body names; both HTTP-only device cookies use Secure/SameSite=None
in production and SameSite=Lax in development and are cleared after credential
changes. Auth errors include success:false and applicable legacy session codes,
preserving message/detail. Chairman account updates expose email at the top
level; teacher password OTP verification binds optional supplied email.

Person inputs trim and validate Unicode letters/marks plus spaces, periods,
hyphens and apostrophes. Nonempty emergency phones require 09 plus nine digits;
legacy contact aliases and lowercase gender/handedness are normalized. Teacher
provisioning requires first/last names, email, employee ID and section/class;
strong passwords remain mandatory. Existing stored profiles can still be read
without imposing new input rules retroactively on historical records.

Section names/cached labels and backup row labels accept 100 characters.
`migrations/parity_batch1.py` explicitly widens the two cached PostgreSQL
columns after Phase 2, preserving records and the frozen historical Phase 1
contract. It was tested in disposable schemas during Batch 1 and subsequently
applied to the configured local database during Batch 2. Section deletion intentionally retains HTTP 409 whenever any
student, including archived students, is assigned. Chairman section lists use
only active Primary Adviser assignments with active accounts and expose nullable
is_active; section creation includes message and existing fields.

Chairman mastery and teacher/parent integer progress use half-up rounding.
Unassigned students remain in intervention analytics; unknown scorer domain
names fall back to IDs. Restored super-admin route eligibility still requires
the relevant teacher/parent profile and linked-child ownership for home saves.
Workbook imports accept ISO timestamps and continue after row database/runtime
failures; exports restore trimmed/null-relationship and linked-guardian fallbacks.
Individual student lifecycle logs and actual field diffs/unchanged-save text
are transactional and mask LRNs. Backup success events are recorded, with the
restore event in the restore transaction; the Fernet format is preserved.

Fresh verification: `python -m py_compile` passed for all **85 backend Python
files**, and `uv run --no-project --python .venv312 python -m unittest discover
-s backend/tests -t . -v` passed **92/92 tests**, including 21 Batch 1 regressions.
The user explicitly selected unittest because pytest is absent and no new
dependencies are allowed. Backup fixtures patch a temporary Fernet key solely
for tests; real secrets remain unchanged. Frontend/legacy files, dependency
manifests and lockfiles were untouched; intentional architectural upgrades and
pre-existing unrelated work remain intact. No deployment or live SMTP/browser
acceptance is claimed.

## 13. Backend parity remediation Batch 2 (2026-10-14)

All remaining parity audit findings and unread-count polling log noise are
Verified in `BACKEND_PARITY_READ_ONLY_AUDIT.md`. Health/readiness, configurable
deployment CORS, production JWT/verified PostgreSQL TLS checks, compression,
security headers, sanitized unexpected-error responses and bounded uploads are
implemented. General bodies are capped at 50 KiB, Excel files at 20 MiB, each
JPEG/PNG/WebP branding file at 5 MiB, and Fernet backups at 50 MiB; encrypted
exports verify the same restore ceiling. SVG uploads are rejected.

Legacy HTTP budgets and Socket.IO handshake/event ceilings now use shared
PostgreSQL counters in production, with process-local counters in development.
Exhaustion returns HTTP 429/Retry-After or socket rate_limit_error/disconnect.
Counter storage failures fail closed with sanitized 503 responses. Test bypass
and reset hooks are Python-only and cannot disable production via request/env.
Configure Uvicorn's trusted reverse-proxy addresses for accurate client IPs;
application code ignores arbitrary client-provided forwarded IP headers.

`migrations/parity_batch2.py` explicitly adds the conversation and audit timestamp
indexes plus operational api_rate_limits storage. Counter metadata is separate
from school backups and survives restore. Both parity migrations were applied
to the configured local ames_parity_dev database and passed --check. Startup
checks readiness of the existing migrated schema without applying migrations.
The isolated browser-test server prepares the same explicit migrations.

Fresh verification: all **92 backend Python files** pass py_compile and the
standard `uv run --no-project --python .venv312 python -m unittest -v` runner
passes **110/110 tests** (18 new Batch 2 tests), with no skips or regressions.
Frontend/legacy/dependency/environment files remain unchanged. The existing
invalid local backup key is unchanged; temporary keys are confined to tests.
All Batch 1 and intentional architecture upgrades, including protected section
deletion for archived students, remain intact. This verifies backend behavior
and local migrations, not remote deployment, SMTP or deployed-browser acceptance.

## 14. Teacher parent link approval (2026-10-16)

`family_access` now includes constrained `status` (`PENDING` or `SYNCED`) and
timezone-aware `requested_at`. No account association means roster status `NONE`.
Existing associations and non-account guardian records default to `SYNCED`.
All parent-initiated link aliases create `PENDING` requests, including re-links
after rejection/unlinking. Repeating the same pending request is idempotent;
another account cannot replace it. Student row locks serialize linking/actions.

Parent ownership, child lists, profile reads/updates, ECCD reads/home saves,
messaging authorization/contacts/unread counts, notifications, guardian profile
lookups and exports require `SYNCED` associations. Pending requests grant no
access. Existing adviser release masking and six parent permissions still apply
after approval. Unlink/reject deletes only the selected account association;
evaluations, account records, unrelated children and guardian-only records stay.
Backup validation/export/restore includes both new fields; old backup rows default
to synced status and use their original `date_linked` as `requested_at`.

`GET /api/teacher/students`, `GET /api/teachers/students`, and the existing active
`/api/students/` roster return `parent_link_status` and nullable `parent_info`
(ID, full name, email, relationship, linked/requested timestamps). Teacher actions:

- `POST /api/teachers/students/{student_id}/unlink-parent`
- `POST /api/teachers/students/{student_id}/approve-parent-link`
- `POST /api/teachers/students/{student_id}/reject-parent-link`

Actions require an active teacher assignment to the student's section, commit
the change and audit event together, and return `{success, message}`. The optional
Pydantic request body accepts `parent_id`; the UI supplies it so an outdated
modal cannot act on a replacement account. Wrong states/targets return HTTP 409.

Teacher StudentManagement displays No Parent, Synced Parent and Pending badges.
Responsive account/request dialogs show name/email/relationship/dates, explicit
unlink confirmation, action spinners, disabled controls during writes, server
errors without dismissing the dialog, and success feedback after confirmation.
No parent phone field is added. Parent link submission feedback explains that
teacher approval is required; existing durable drafts remain intact.

Before starting the updated API on another existing database, apply explicitly:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.parent_linking --apply
uv run --no-project --python .venv312 python -m backend.migrations.parent_linking --check
```

The additive migration preserves original association fields/dates and is
idempotent. It was applied and checked on the configured local development DB;
startup checks the schema without applying migrations. The Phase 1 metadata
adapter now copies family-access check constraints into fresh migration fixtures.

Verification: 13 new isolated PostgreSQL tests in `test_parent_linking.py` pass;
17 changed backend files pass py_compile. App TypeScript checking passes, as do
ESLint for changed frontend files and Prettier checks for the feature files.
All 10 desktop/mobile Playwright cases pass via
`pnpm.cmd --dir frontend exec playwright test --config playwright.parent-linking.config.ts`;
these use API mocks to check UI behavior, while backend tests exercise real
isolated database schemas. Local Uvicorn startup, health and readiness pass.

The requested full `uv run --no-project --python .venv312 python -m unittest`
run executed 124 tests: 122 passed, with two unrelated environment errors. The
pre-existing untracked `test_ml_model.py` imports `backend.ml.common`, absent
on this feature's base branch. The existing legacy route parity test requires
`AMES-SYSTEM-LEGACY/backend/routes/authRoutes.js`, absent from the partially
available read-only reference checkout. Those unrelated files and all legacy
files were left untouched. No new dependencies or deployment are involved.

## 15. Parent assessment editing windows (2026-10-17)

Section-scoped non-null Boolean windows are `pre_test_parent_editable` (default
true), `mid_test_parent_editable` and `post_test_parent_editable` (default false).
These match legacy defaults while using the normalized section assignments.
Only the section's active Adviser can manage its windows after migration 008.
Teacher replacement/archiving behavior is retained; windows remain on the
section. The six existing adviser permissions remain independent.

`GET` and `PUT /api/teacher/settings/parent-assessment-access` are teacher-only;
optional `section_id` selects an actively assigned section and is required for
multiple assignments. PUT accepts all three strict Boolean fields and returns
them with `section_id`. Teacher Settings adds the matching switches with auto-save,
success feedback and owner/section-scoped durable drafts. Existing layout/styles
are retained. Parent assessment responses expose `parent_assessment_access`.

Home saves lock the student and section, validate every submitted period before
writing, and return HTTP 403 with `Editing for [Pre-Test/Mid-Test/Post-Test] is
currently closed by the teacher.` when a window is closed. Global home editing,
synced child ownership and home-question validation still apply. A mixed-period
request cannot partially commit. Result-release flags/masking are unchanged.
Parent checklist controls disable closed periods, display `Editing Closed by
Teacher`, and save only open-period drafts. Closed-period drafts are retained;
carry-forward writes only to open periods. Both save buttons disable when all
periods are closed. Backup schemas retain the windows and accept older backups
with legacy defaults.

Before starting against another database, explicitly run
`uv run --no-project --python .venv312 python -m backend.migrations.parent_assessment_access --apply`
and the corresponding `--check`. Startup only validates this additive migration.
Feature tests use disposable PostgreSQL schemas; the dedicated Playwright config
`frontend/playwright.parent-assessment-access.config.ts` starts an isolated real
API and Vite instance for desktop/mobile acceptance checks. No legacy files,
dependencies, secrets or ML implementation are changed by this feature.

Verification: all 11 feature backend tests pass, as do all 6 real-API Playwright
checks across desktop/mobile (including offline teacher toggle synchronization).
App TypeScript, changed-file ESLint and Prettier checks pass. The additive
migration was applied and checked on the configured local database. Local
Uvicorn startup, `/healthz` and `/ready` pass; the temporary server was stopped.
Full backend discovery runs 142 tests: 140 pass, with two existing Batch 2
rate-limit assertions failing independently. Those tests expect 10 allowed login
attempts, while the unchanged HEAD policy allows 15. Rate-limit code/tests remain
untouched. Tests do not claim deployment or live-parent-account acceptance.

## 16. Teacher checklist provenance contract (2026-10-18)

Assessment checklist questions expose Boolean `is_home_based` and
`evaluator_roles` keyed by the existing `PRE`, `MID`, `POST` period values.
Roles come from saved evaluation rows; absent rows return null. Shared parent
responses mask roles alongside answers for unreleased periods. `gradingDates`
uses the shared grading-date resolver; `periodDates` and `evaluationDates`
remain official teacher-date aliases. Frontend shared types expose these maps
without changing assessment components, layouts, or draft behavior.

Verification: backend compilation and app TypeScript checking pass. All 10
`backend.tests.test_eccd_phase2_lifecycle` integration tests pass in disposable
PostgreSQL schemas, including provenance transitions, mixed evaluator roles,
empty periods, nullable legacy home flags, and unreleased parent masking.

## 17. Teacher saved-only auto-fill (2026-10-18)

`utils/eccdDrafts.ts` resolves each question independently into `savedAnswers`,
`draftAnswers`, `inheritedAnswers`, and displayed `answers`. Only saved KAYA
starts carry-over. Saved DI-KAYA replaces that source; draft DI-KAYA blocks
dependent carry until an independent later saved answer starts a new chain.
Independent later drafts and records remain intact. Domain metadata without
student answer maps is safe while selecting/loading a student.

`useTeacherAssessment` persists only explicit selections/date edits in the
selected period. Date edits never snapshot virtual answers. Explicit Save may
confirm displayed inherited answers for that selected period; it never queues
future periods. Existing owner-scoped keys, offline submission requests, and
revision-checked confirmation remain. Historical stored drafts lack provenance
markers, so ambiguous values are retained rather than deleting potential manual
work. Newly calculated carry-over is never stored as an answer draft.

Focused verification commands are `node --test frontend/tests/eccd-drafts.test.ts`
and `pnpm.cmd --dir frontend exec playwright test --config playwright.eccd-drafts.config.ts`.
The browser config uses mocked APIs on the active app and does not start legacy
servers or use school data. Assessment layouts/styles/components are unchanged.

Verification: all 11 resolver tests and 7 Chromium browser tests pass, including
320px/1280px layouts, reload/offline saves, and delayed response revision safety.
App TypeScript, changed-file ESLint, and all 10 backend Phase 2 lifecycle tests
also pass. No backend application or legacy files changed in this step.

## 18. Teacher checklist provenance and progress display (2026-10-18)

The routed `pages/teacher/EccdAssessment.tsx` uses loaded student checklist
questions for Home-Based and selected-period Parent Assessed pills. Badges wrap
within the existing question cell; the table, responsive containers, navigation,
theme, and unused `TeacherChecklist.tsx` remain unchanged.

`teacherDomainProgress` counts verified saved answers and explicit drafts whose
answers differ from saved records. Inherited answers are displayed separately
and do not count as saved or dirty work. Completion requires every question saved,
zero changed answers, and no changed date. Date-only edits have a separate pending
label; no-op selections retain completion. Per-period headers, period options,
and the save dock share these counts. Domain cards aggregate saved question
records and owner-scoped drafts for active students in the current section and
selected period; their existing class completion percentage bars are preserved.
Class assessment snapshots are cached under an owner/section-scoped key for
offline display. Existing draft persistence and confirmation logic is unchanged.

The teacher hook exposes `gradingDates` and computes header age displays from
those dates, including the server's parent-only preview fallback. Unsaved date
picker changes do not replace the resolved grading date. Null grading periods
show no age; old cached responses without the grading map retain their server
`evalAges`. Official testing dates still use `periodDates` and stay blank for
parent-only observations.

Verification: app TypeScript checking, changed-file ESLint and Prettier pass,
as do all 13 native Node draft/progress tests and all 12 teacher browser cases in
`playwright.eccd-drafts.config.ts`. Browser cases cover 320px/1280px provenance,
teacher confirmation, partial/no-op/changed drafts, date-only completion,
grading fallback, reload/offline persistence, date bounds, and revision safety
using mocked APIs. Full `pnpm.cmd --dir frontend run lint` reports three existing
`react-hooks/refs` errors in unchanged `hooks/useParentProfile.ts` (lines 20/23).
That separate parent-profile hook is outside this change. No backend or legacy
files, application database records, or dependency manifests are modified.

## 19. Phase 3 teacher workflow regression coverage (2026-10-18)

`tests/teacher-portal-parity.spec.ts` adds nine browser lifecycle cases across
320px, 768px and 1280px. They observe actual PRE save requests independently of
the mock persistence handler, check partial saved counts and changed-draft counts,
then confirm completion only after both questions are saved. Both downstream
answer buttons must be unselected immediately after PRE DI-KAYA, before saving.
Independent committed MID KAYA and DI-KAYA each survive PRE resets and reload;
another question in the same partially saved domain still inherits separately.
Future-period draft keys remain absent and PRE saves contain only PRE answers.
Existing provenance/progress and grading-date cases also run at tablet width.

The tests retain the audited saved-only contract: selecting an unsaved KAYA does
not start carry-over; confirming that selected period with Save enables virtual
MID/POST KAYA. Saving a later period remains an explicit separate action. The
saved-assessment fixture now leaves PRE's official date null when PRE is empty.
No component, hook, stylesheet, backend application or legacy source is changed.

The legacy visual harness resolves relative imports before selecting its existing
API/auth/settings adapters. This makes service-local `./api` imports use the same
mock as page-level `../services/api`, avoiding legacy Axios dependency resolution
without installing dependencies or editing the read-only reference.

Fresh focused verification: all 23 browser cases pass with
`pnpm.cmd --dir frontend exec playwright test --config playwright.eccd-drafts.config.ts`,
all 13 native Node draft/progress tests pass, and all 10
`backend.tests.test_eccd_phase2_lifecycle` integration tests pass in disposable
PostgreSQL schemas. App TypeScript, changed-spec ESLint, and both changed test
files' Prettier checks pass. The requested default Playwright command cannot
start its API because its generic Python 3.12 environment lacks uvicorn; the
existing `playwright.teacher-portal.config.ts` instead runs this spec against
mocked APIs and the read-only legacy visual harness.

The entire teacher spec was also run with
`pnpm.cmd --dir frontend exec playwright test tests/teacher-portal-parity.spec.ts --config playwright.teacher-portal.config.ts`:
75 of 118 cases passed, including every focused Phase 3 workflow case; 43 failed.
Failures comprise 40 legacy screenshot comparisons, two dashboard-loading
assertions expecting `Loading...`, and one mobile settings assertion expecting
six switches where the updated page has nine. Existing screenshot tolerances and
those assertions remain unchanged; this is not a claim of full portal parity.
The generated review artifacts are `frontend/test-results/teacher-portal-report/index.html`,
`frontend/test-results/teacher-portal-report.json`, and individual traces/diffs
under `frontend/test-results/teacher-portal/`. No school records were written;
browser tests use mocks and backend tests use disposable schemas.

## 20. Legacy Teacher Settings home-based controls (2026-10-18)

The legacy reference is `AMES-SYSTEM-LEGACY/frontend/src/pages/teacher/TeacherSettings.jsx`
(editing controls at lines 301-355). The active Teacher Settings now separates
ECCD Assessment Visibility from ECCD Assessment Editing inside the same Global
Parent Access panel. The editing group contains Home-Based Checklist Edit and
Pre-Test/Mid-Test/Post-Test Home-Based Edit with the legacy descriptions, order,
responsive grid, and success/info/warning/success switch colors. The independent
period defaults remain Pre enabled, Mid/Post disabled. The master and period
choices auto-save; disabling the master does not reset any period choice.

Controls wait for access loading and lock during saves. Inline success/error
feedback matches the legacy panel; pending edits clear the previous message.
Owner/section-scoped drafts, revision-checked confirmation and offline retry are
preserved. Failed saves retain input instead of copying the legacy rollback.
The existing six teacher permissions and normalized section editing windows keep
their current API and database contracts; no new columns or migrations are used.
The section selector continues to choose which section's windows are edited.

Focused browser checks are reproducible with
`pnpm.cmd --dir frontend exec playwright test --config playwright.teacher-settings.config.ts`
(legacy comparisons plus global permission offline/403 retention), and
`pnpm.cmd --dir frontend exec playwright test --config playwright.parent-assessment-access.config.ts`
(real API in disposable schemas). The legacy reference remains read-only.

Verification: all six teacher-settings browser cases and all ten real-API parent
window cases pass (16 total). Editing-card screenshots match legacy with zero
different pixels at 320px, 768px and 1280px, including enabled master/Mid/Post
colors. Real-API cases verify each period independently, master-off blocking
without resetting windows, reload retention and offline synchronization.
All 18 backend parent-assessment-access tests pass. App TypeScript, ESLint for
all changed frontend files and Prettier checks pass. No application database
records, backend files, legacy sources or dependency manifests changed.

## 21. Phase 4 parent checklist and selected-period saves (2026-10-18)

The inspected legacy references are `backend/controllers/parentEccdController.js`,
`frontend/src/pages/users/ParentEccdAssessment.jsx`, and `frontend/src/utils/eccdDrafts.js`
under the read-only `AMES-SYSTEM-LEGACY/` directory. This phase implements audit
Section 2.3 and Phase 4 while retaining the stricter active release policy.

`backend/utils/assessments.py` returns every configured ECCD domain and all its
questions, including school-only and empty domains. Checklist questions retain
Boolean `is_home_based` and per-period answers/roles. `homeBasedChecklist` remains
a home-only compatibility projection. Parent progress endpoints use all domain
questions as the completion denominator, preserve the real home flags, handle
empty domains safely and return null progress for unreleased periods. Dashboard
phase selection still masks an unreleased latest recorded period instead of
falling back to an older release. Completion is distinct from KAYA mastery.

Parent request validation requires nonempty, unique answers for one period.
The frontend sends top-level `testing_period`; the server infers it for older
queued requests whose rows already identify one period. The previous hook stored
one period per domain's queued request even though its foreground aggregate POST
could contain multiple periods. Those old single-period queue records still
restore/sync without conversion or deletion. Mixed-period, mismatched-period,
empty and duplicate payloads now fail validation before writes. Success retains
`message` and adds typed `testing_period`. Existing SYNCED ownership, authenticated
parent provenance, home-only HTTP 403 guard, global permission and section-window
HTTP 403 checks remain. Parent saves preserve teacher IDs/dates and other periods.

The active parent page retains its official summary, outer containers, navigation,
typography and theme. Its checklist now uses the existing domain card/progress
styles, home-containing domains first, followed by school-only view cards. An
enabled-period-only selector uses the existing `PRE`, `MID`, `POST` identifiers;
closing the selected window falls back to the first open period after refresh.
With none open, editing and Save are disabled and the checklist stays read-only.
Opening a domain shows home questions first and a separate school section with
`Teacher Assessed — View Only` labels and status pills, without editable controls.

`useParentAssessment` scopes explicit drafts and feedback by owner/student, with
domain/period in each durable key. Only selected-period home answers are sent or
queued by Save. Other-period drafts remain byte-for-byte intact. Confirmations
evict only exact submitted keys/revisions after HTTP 200/201; newer work survives.
Late responses confirm the original child without changing a selected sibling's
work or displaying success feedback on that sibling's page. Closed-period drafts
and failed/offline submissions survive reload, and the existing shared sync queue
retries when access reopens. No global storage clearing is introduced.

Carry-over is virtual, per question and saved-only. Unsaved KAYA does not generate
future writes; DI-KAYA blocks dependent inheritance while independent later
drafts/records remain. Unlike legacy's broader editable-window visibility, masked
records are never returned as answers, roles or carry projections. Inheritance
stops at masked periods. Confirmed unreleased parent observations also remain
masked until release; the page explains that only local unsaved observations are
shown. Card percentages include visible answers/local observations with a
provisional label; hidden saved progress stays Pending Adviser Release. Official
scores, ages, dates and teacher answers retain existing release masking.

Verification: all 22 `backend.tests.test_parent_assessment_access` tests and all
10 `backend.tests.test_eccd_phase2_lifecycle` tests pass in disposable PostgreSQL
schemas. App TypeScript, changed-file ESLint, Prettier and backend compilation
pass. The expanded `playwright.parent-assessment-access.config.ts` covers 24
desktop/mobile cases at 1280px/320px: delivery, sorting, school-only navigation,
release masking, full denominators, period-isolated saves, live window fallback,
offline closure/reopening, older queued requests, saved-only inheritance,
revision safety and child/account isolation. The full expanded run passed 22;
two confirmation-listener tests initially timed out due to a test registration
race. After explicitly registering their listener before releasing the response,
both passed in a focused rerun (all 24 cases verified across those runs).
Teacher views, legacy sources, dependency files, schema migrations and application
database records were not changed in this phase. The browser suite uses the
disposable real API; the synthetic sibling/account isolation reads are mocked.

## 22. Adviser takeover and removal of Substitute access (2026-10-18)

Section assignments now have only `Primary Adviser` and Active/Inactive status.
The assignment helper locks the section, deactivates the outgoing assignment,
flushes it before activating the replacement, and updates the compatibility
pointer atomically. Repeated assignments reuse an active assignment before an
inactive historical row. An outgoing teacher with another active section stays
active; otherwise the existing legacy account-archiving behavior is retained.
Student demographics, evaluations/provenance, family links and section parent
editing windows are not reassigned, deleted or reset. The incoming Adviser can
read/evaluate all section students and manage its existing editing windows.
The six teacher-level parent flags remain on their teachers, unchanged; parent
permissions continue to inherit from the current active Adviser.

All ownership consumers (student/ECCD access, settings, authentication section
selection, imports, analytics, messaging and teacher listings) require active
Adviser assignments. Assignment aliases and response shapes are retained.
Requests need only `teacher_id` (or legacy `adviser_teacher_id`); null unassigns.
Older queued `Primary Adviser` roles remain valid, while removed roles and
unknown substitute flags return HTTP 422 rather than triggering a takeover.

Migration `008_adviser_takeover` must be applied explicitly before updated API
startup; startup validates it without applying changes. It retires Substitute
rows as inactive Adviser history, preserves their IDs/dates, records their former
role/status in the audit trail, and adds the single-active-adviser unique index
and adviser-only role constraint. Ambiguous duplicate active Advisers stop the
transaction for explicit resolution. Preservation checks cover school records,
accounts, teacher flags and section windows. Historical Phase 1 metadata retains
its original roles so this upgrade remains explicit. Old encrypted backups keep
retired assignment rows without restoring removed access. See
`backend/migrations/README.md` for the apply/check commands.

Manage Teacher Access retains its modal structure, styles, buttons and question
permission switch. Its Section assignment panel contains the section selector,
an incumbent-specific transfer note and the existing handover confirmation; the
role selector is removed. Owner-scoped drafts and confirmed-save eviction remain.
There are no Substitute checks or labels in active frontend source.

Fresh focused verification: all eight `backend.tests.test_adviser_takeover` tests
pass, covering concurrency, authorization, preserved records/windows/permissions,
invalid payloads, migration rollback/idempotence, backup compatibility and API
startup/health. All four browser cases in
`frontend/playwright.adviser-takeover.config.ts` pass at 320px/768px/1280px and
verify confirmation, unassigned saves and failed-draft reload retention. App
TypeScript has zero errors; changed-file ESLint, Prettier and backend compilation
pass. The two existing evaluator lifecycle tests now explicitly transfer the
adviser role before the replacement teacher saves/imports; both focused reruns
pass. No legacy sources, dependencies or application database records were
modified; backend tests use disposable PostgreSQL schemas and browser tests use
mocked APIs.

Final full backend discovery ran 198 tests. Four unrelated test methods remain
failing (10 assertion failures): two unchanged rate-limit tests expect a login
budget of 10 while policy permits 15; the legacy-route inventory expects seven
routes absent from the active application; and the older parent-progress parity
test still expects home-only questions despite Phase 4's all-domain contract.
Every takeover test and the updated evaluator lifecycle tests pass in that full
run. Full output is in
`frontend/test-results/adviser-takeover-backend-tests.log`. The migration was not
applied to the configured application database in this task.

Startup follow-up (2026-10-18): the configured local `ames_parity_dev` database
was missing migration 008. Applied `backend.migrations.adviser_takeover --apply`
successfully, including its transactional data-preservation checks; `--check`
then passed. The actual application lifespan now starts against that database,
and `/healthz` and `/ready` both return HTTP 200 (`database: connected`). No
application code or legacy files changed in this follow-up.

## 23. Independent parent ECCD marks visibility (2026-10-18)

`teachers.allow_parent_view_eccd_marks` is a seventh granular permission, a
non-null Boolean with Python/server defaults of false. The earlier descriptions
of score-release-gated checklist marks are superseded by this independent gate.
The current active Adviser's flag controls question answers and evaluator roles
across all seven domains and PRE/MID/POST. With marks enabled, recorded answers
are returned even when official scores are unreleased. With marks disabled,
teacher-recorded answers (including home questions) are masked; only the signed-in
parent's own home observations in globally and section-enabled editing windows
are returned. Another linked parent's observations remain masked. School marks
are also guarded in the client. Official summaries, matrix scores, ages, dates,
dashboard releases and write access retain their separate permission checks.

Teacher Settings adds Viewing of ECCD Marks as the fourth card in the existing
ECCD Assessment Visibility grid, with the requested title/description and the
same switches, spacing and typography. It uses the existing owner-scoped,
revision-checked auto-save queue and offline recovery. The parent checklist
supports read-only PRE/MID/POST selection when marks are enabled, shows green
KAYA/amber DI-KAYA school badges, and shows Marks hidden by class adviser when
disabled. Read access does not enable submissions or erase durable inputs.

The existing `/api/teachers/me/access` and `/access-controls` GET/PUT aliases
include the flag. `/api/teachers/settings` GET/PUT uses the same transactional
settings logic; PUT returns the normalized settings. Omitted fields in older
updates preserve existing permissions. Backups retain the flag and default
older documents to false. Parent assessment responses include the flag both
at the top level and in `permissions`.

Migration `009_parent_eccd_marks` is explicit, additive and idempotent, verifies
preservation of every previous teacher field and is checked during startup.
It was applied and checked on the configured local development database; all
existing teachers default off. Apply/check commands are documented in
`backend/migrations/README.md`. No legacy sources or dependencies changed.

Fresh verification: 37 backend access/evaluator lifecycle tests pass in disposable
PostgreSQL schemas. All four new desktop/mobile marks browser cases pass via
`playwright.eccd-marks.config.ts`, including all seven domains in all three
periods, default-off behavior, independent scores/write permissions, reload and
failed-save synchronization. The broader parent suite passed 22 of 24 cases;
its remaining two score-coupled carry-over assertions were updated to test the
independent score/marks/editing boundaries; both pass in a focused rerun (all 24
parent regression cases verified across those runs). App TypeScript,
changed-file ESLint, Prettier and Python compilation pass. Local Uvicorn startup,
`/healthz` and `/ready` pass; the temporary verification server was stopped.

## 24. Teacher account creation validation (2026-10-18)

The active Add Teacher form previously rendered one Full Name field and sent
`last_name: ""`, while `TeacherProvisionRequest` requires both names. This caused
HTTP 422. The read-only references inspected were the legacy chairman
`TeacherManagement.jsx`, `teacherController.js` and `utils/personValidation.js`.
The legacy form has separate names; its controller permits Chairman-issued
temporary credentials and stores missing employee IDs as null, although its
person validator still requires an employee ID. The requested active contract
now explicitly makes that ID optional.

Add Teacher uses separate required First Name and Last Name inputs. Changes strip
Unicode decimal digits; the existing backend `Name` validator requires letters
and permits Unicode accents/marks, spaces, hyphens, apostrophes and periods while
rejecting digits. Existing Tailwind field/grid/modal classes, icons and theme
remain intact. Teacher response/create/update TypeScript contracts support null
employee IDs; input state remains a string. Blank IDs become JSON null, and the
shared update/provision schema normalizes empty or whitespace IDs to None. The
ORM and configured PostgreSQL column already allow NULL with uniqueness for
nonempty IDs, verified through read-only inspection; no migration was needed.

Teacher provisioning alone uses `TemporaryPassword`: at least eight characters,
not whitespace-only, at most 72 UTF-8 bytes. Personal registration/password
changes retain the strong policy, and new teachers must still replace their
temporary credential on first login. Existing snake_case requests, camelCase
aliases, `initial_password`, API route aliases and response shapes are retained.
Creation drafts and tab-scoped credentials survive failed requests and reload;
only confirmed HTTP 200/201 clears their exact storage keys.

`backend/tests/test_teacher_creation.py` covers request validation, multiple null
IDs, duplicate nonempty IDs/transaction rollback, Unicode names, creation aliases,
authorization and first-login login behavior in disposable PostgreSQL schemas.
`frontend/playwright.teacher-creation.config.ts` runs real API creation checks
and mocked teacher-management regressions at desktop/mobile sizes. It reuses the
disposable API server from the parent-access test configuration and excludes the
legacy screenshot case that requires a separate visual harness. Legacy sources,
dependencies, application school records and Git branches remain unchanged.

Fresh verification: all six new backend regressions and all 30 desktop/mobile
teacher browser cases pass, including real HTTP 201 creation, a subsequent API
read of the saved teacher, login requiring password replacement, and failed-save
reload retention. Requested backend compilation, app TypeScript, changed-file
ESLint and focused Prettier checks pass. The standalone older teacher browser
configuration could not start its Corepack launcher because its cached pnpm.cjs
was absent; the new configuration uses the working pnpm.cmd launcher and passed.

Full requested backend discovery completed: 209 tests, with 11 assertion failures
across five existing unrelated methods. Two rate-limit tests expect 10 requests
where current policy allows 15; the legacy-route inventory has seven missing
route subtests; two parent-progress tests retain obsolete home-only/visibility
expectations. All six teacher-creation tests pass in this full run. Full output:
`frontend/test-results/teacher-creation-backend-tests.log`. Those unrelated
contracts and assertions were left unchanged.

## 25. Sticky parent ECCD controls (2026-10-18)

The existing Developmental Domains control card in `ParentEccdAssessment.tsx`
uses `sticky top-14 z-20 legacy-md:top-0`, preserving its background, shadow,
spacing and controls. Parent mobile layout overflow uses clip/visible so the
card follows window scrolling beneath the fixed school header; desktop retains
the existing scrollable main panel. Assessment behavior and drafts are unchanged.

Verification: app TypeScript and ESLint for both changed frontend files pass.
Mocked Chromium checks at 320/400/768/899/900/1280px verify sticky positioning,
unclipped controls, navigation clearance, period switching and saves while
scrolled. Screenshots and results are under `frontend/test-results/parent-sticky/`;
the verification script is `frontend/test-results/parent-sticky-check.cjs`.
Full frontend lint reports three existing `react-hooks/refs` errors in the
untouched `useParentProfile.ts`. Legacy sources and school records are unchanged.

## 26. Chairman enrolled-student advisers (2026-10-18)

`GET /api/chairman/students` uses `routes/students.py::roster`. The roster now
batch-resolves `adviser_name` with one query joining SectionTeacher, Teacher and
User for the listed section IDs. Only Active Primary Adviser assignments with
active accounts qualify, matching the existing ownership helper. Inactive
history and the section's compatibility adviser pointer cannot supply stale
names. Names use the teacher directory's First Last order, skipping missing
parts; unassigned sections return null. `StudentPublicResponse` and the shared
frontend Student interface expose the nullable field. No schema migration is
required.

`StudentRecords.tsx` displays Adviser immediately after Class Name and uses an
em dash for missing/null names. It reuses adjacent header/cell styles, keeps
adviser names on one line and reserves an additional 10rem in the table's
existing scrollable minimum width to preserve row heights on small screens.
The empty state spans six columns, including the unchanged checkbox column.
Existing filtering, selection, details, action buttons and durable drafts stay
intact. The inspected read-only references were legacy `StudentRecords.jsx`,
`chairmanController.js` and `studentController.js` under AMES-SYSTEM-LEGACY.

`backend/tests/test_student_advisers.py` covers current assignments, takeover,
stale pointers, unassigned/sectionless students, missing names, inactive accounts
and one adviser query as the roster grows. The browser checks in
`playwright.student-advisers.config.ts` use the disposable real API and verify
column order, takeover/unassignment, styles, row heights and scrolling at
320px/768px/1280px, plus missing/null fields and existing roster interactions.

Fresh verification: all four adviser backend tests and all four browser cases
pass, including the explicit row-height comparisons. App TypeScript,
changed-file ESLint, focused Prettier checks and Python compilation pass.
Full requested backend discovery ran 213 tests and reports the same 11 existing
assertion failures across five unrelated methods: two rate-limit expectations,
the seven missing legacy-route subtests, and two obsolete parent-progress
expectations. All four adviser tests pass in that run. Full output is in
`frontend/test-results/student-advisers-backend-tests.log`; browser screenshots
are under `frontend/test-results/student-advisers/`. Legacy files, dependencies,
application school records and Git branches were not changed.
