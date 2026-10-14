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
| section_teachers / `models/section_teacher.py` | Assignment ID, section/teacher FKs, assigned date; constrained Primary Adviser/Substitute and Active/Inactive |
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

- Passwords require 8+ characters, uppercase, lowercase, a number, and at most
  72 UTF-8 bytes for bcrypt. Pydantic failures normally return 422; route business
  failures use explicit statuses.
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

## 11. ML goals and verification boundaries

No active backend/ml directory, training pipeline, model integration, or inference
endpoint was found. NumPy, pandas, SciPy, scikit-learn, and joblib are installed.
Current analytics are SQL aggregations and deterministic ECCD scores.

Future ML should remain isolated from HTTP/domain logic, use historical
seven-domain scores, assessment-date ages and inter-period progression, and
return risk labels/confidence. It must never mutate or replace official DepEd
answers, scores, or interpretations. These are goals, not delivered features.

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
