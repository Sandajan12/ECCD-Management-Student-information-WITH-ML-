# AMES System: Current Codebase Context

Updated: **2026-10-27**. This document describes the active working tree in
`backend/` and `frontend/`, including existing uncommitted changes. Local
configuration observations are a snapshot, not deployment defaults or a claim
that every workflow has passed testing. Current-state descriptions were checked
against active source, manifests, migration modules, browser-test configurations,
installed Python metadata, and the trusted V1 artifact on this date. Update this
context when code changes.

Sections **1–11 are the authoritative current-state summary**. Section 12 is a
historical implementation and research archive: its dated behavior, commands,
experiments and test counts describe earlier work and do not override sections
1–11. Active source, manifests, schemas and migrations establish the contracts.
Dated delivery notes and test counts anywhere in this document describe their
recorded runs; they are not fresh verification of the current working tree.

The Node.js-to-Python and JavaScript-to-TypeScript migration is complete.
The legacy reference folders (`_legacy_reference/` and `AMES-SYSTEM-LEGACY/`)
have been removed. For feature work, maintenance, and code analysis, inspect the
current `backend/` and `frontend/` implementations and their related tests,
schemas, migrations, manifests, and configuration templates. Preserve the
current contracts and domain rules unless a requested change requires updating
them. Do not require legacy-file checks, legacy comparisons, or restoration of
removed folders, and do not ask for legacy files before proceeding. Search the
active codebase first; ask only when required current information or a material
requirement remains unresolved.

## 1. Purpose and implementation status

AMES manages early childhood student records and deterministic DepEd ECCD
assessments. Teachers enroll learners, assess PRE/MID/POST skills, manage assigned
sections, release results, and communicate with parents. Parents link children,
view permitted profiles/results, edit permitted family information, and submit
permitted home-based observations. The Chairman manages teachers, sections,
records, question access, school settings, audit history, exports, and backups.

These workflows exist in the active Python/FastAPI/PostgreSQL and React/TypeScript
code. **ML predictions are fully implemented for both Teacher and Parent
portals**, using the shared V1 18-feature Random Forest inference service and
`backend/ml/artifacts/rf_post_test_model.joblib`. Teachers have section-scoped
batch predictions, student detail modals and a sandbox; parents request a
prediction on demand for an authorized linked child. Feature implementation does
not establish independent real-world model validity. Predictions support research
and instructional planning; official ECCD scores remain deterministic (section 11).

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
| Workspace | Root `pnpm-workspace.yaml` includes frontend and retains separate lockfiles; frontend has matching pnpm 12 YAML overrides and its own package-manager pin for isolated installs; automatic dependency verification before scripts is disabled |
| Spreadsheets | openpyxl handles active workbook import/export; pandas is installed |
| ML | V1 fitted scikit-learn Random Forest pipeline, joblib artifact, 18 PRE/demographic inputs, three supported POST outcomes; shared teacher/parent inference |
| Migrations | Explicit Python migrations 001–014, including production query indexes, email-only identity and credential revocation versioning; no active Alembic setup, pyproject.toml, or uv.lock |

Observed on this Windows checkout on **2026-10-25**:

- `.venv312` contains **Python 3.12.13**. `.venv/pyvenv.cfg` reports **Python 3.14**;
  do not assume `.venv` meets the Python 3.12 requirement.
- Node **24.11.1** and uv **0.11.26** were observed. Root `package.json` pins
  pnpm **12.11.2** and the Node engine range `^20.19.0 || ^22.13.0 || >=24`.
- Installed metadata in `.venv312`: FastAPI **0.141.1**, SQLAlchemy **2.0.54**,
  Pydantic **2.13.5**, Uvicorn **0.53.0**, python-socketio **5.17.0**,
  scikit-learn **1.9.1**, and joblib **1.6.0**.
- `backend/.env` exists: `ENVIRONMENT=development`, **`ENABLE_OTP=False`**, HS256,
  60-minute access tokens, PostgreSQL at `localhost:5432/ames_parity_dev`.
  JWT, backup, and LRN secret values are present; their contents remain private.
- `frontend/.env.local` sets both `VITE_API_URL` and `VITE_SOCKET_URL` to
  `http://localhost:8000`. `frontend/.env` is absent.
- File/metadata inspection does not verify database connectivity, the applied
  migration ledger, SMTP delivery, or running servers.

### Commands and configuration

The approved deployment stack is **Vercel** for the static frontend (Root
Directory `frontend`), **Render** for Python 3.12/FastAPI/Socket.IO,
**Brevo HTTPS API** for OTP delivery, and **Supabase PostgreSQL** with
`sslmode=verify-full` and a trusted CA. See `DEPLOYMENT.md`,
`frontend/vercel.json`, and root `render.yaml`. Production requires OTP enabled;
provider secrets belong only in backend/provider settings. Vercel's public
`VITE_API_URL` and `VITE_SOCKET_URL` point at the Render HTTPS origin without
`/api`; backend CORS lists the exact frontend origin.

Teacher ownership is limited to one active Primary Adviser section per teacher.
Moving a teacher retires the previous ownership; it does not accumulate active
sections. Student records and evaluations survive section moves and transfers.

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
3.12. The explicit uv command above selects the intended interpreter without
depending on a globally available uvicorn executable.

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
Pydantic Settings; process variables override it. `utils/email.py` uses those
typed settings for Brevo HTTPS or SMTP. Copy templates only when files are absent.

| Setting | Contract |
| --- | --- |
| `DATABASE_URL` / `SUPABASE_DB_URL` | Required PostgreSQL URL; DATABASE_URL takes precedence; engine and SessionLocal are in `config/database.py` |
| `JWT_SECRET` / `SECRET_KEY`, `ALGORITHM` | JWT_SECRET alias has precedence; production requires a strong secret of at least 32 characters; algorithm defaults HS256 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Code default 30; template and observed local file use 60 |
| `ENABLE_OTP` | Defaults **true**; production requires true and configured email transport; local development can bypass OTP |
| `ENV` / `ENVIRONMENT` | ENV alias has precedence; defaults production; enables production deployment validation, shared rate limits, HSTS and secure cookies |
| `FRONTEND_URL`, `ALLOWED_ORIGINS`, `CORS_ORIGINS` | Combined comma-separated exact HTTP(S) origins plus localhost defaults for HTTP and Socket.IO; remote production origins require HTTPS |
| `DATABASE_SSL_ROOT_CERT` | Optional trusted CA path (or libpq system roots); production DATABASE_URL requires sslmode=verify-full and this setting or a URL sslrootcert |
| `BACKUP_ENCRYPTION_KEY` | Stable Fernet key, normally 44 URL-safe base64 characters; invalid keys are rejected |
| `BACKUP_IV` | Required by Settings, unused by the current Fernet implementation |
| `LRN_ENCRYPTION_KEY` | 64 hexadecimal characters; required for LRN protection operations |
| `LRN_HMAC_SECRET` | At least 32 characters; required for exact LRN lookup |
| `MAIL_*` | SMTP account/password/sender/server/port and STARTTLS/SSL settings |
| `EMAIL_TRANSPORT`, `BREVO_API_KEY` | smtp (local-compatible default) or brevo_api (HTTPS 443); production requires credentials and a real MAIL_FROM; Render blueprint selects brevo_api |
| `VITE_API_URL` | Public backend origin without /api; fallback http://localhost:8000 |
| `VITE_SOCKET_URL` | Optional chat-origin override; otherwise chat uses API origin |

Never print or regenerate existing secrets. Preserve LRN encryption/HMAC keys
and the backup key with backups. `scripts/configure_lrn.py` privately creates
missing keys and refuses unsafe replacement scenarios.

Lifespan in `backend/main.py` checks evaluator provenance (007), adviser takeover
(008), section parent editing windows (006), independent marks visibility (009),
parent predictions (010), parent linking (005), credential revocation version
(012), email-only identity (013), Phase 2 (002), and deployment
hardening (004, which also checks 003) in the connection's current schema.
Migration 011 is an explicit ownership-data cleanup; lifespan does not call its
checker or apply it. Missing or incompatible schema stops startup; it never
applies migrations automatically.
It then seeds `assets/reference/eccd.json` (7 domains, 109 questions) only if
**both** reference tables are empty and warms the cached V1 model and guides.
Unavailable/incompatible ML artifacts log a sanitized error and leave ordinary
school workflows available; prediction requests return HTTP 503. Startup does not
call create_all or provision users.

For a fresh PostgreSQL/Supabase database, explicitly run
`backend.scripts.seed_supabase --apply` as a module before API startup. It applies
pending migrations 001–014 in order and seeds the tracked 7-domain/109-question
ECCD fixture plus an environment-configured Chairman (`INITIAL_CHAIRMAN_EMAIL`,
`INITIAL_CHAIRMAN_PASSWORD`, `INITIAL_CHAIRMAN_NAME`). The name is stored in
`system_settings.chairman_name`. Repeated runs preserve existing accounts/reference rows;
conflicting ECCD data aborts. An explicit `--update-chairman` can update the
selected Chairman and revoke old credentials. All operations share a transaction;
no local account hashes or school records are exported. See
`backend/scripts/README.md` for provisioning and verification.

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

### Current teacher and parent presentation

- Chairman `SystemSettings.tsx` personalization places School Name across the
  full identity grid, with Principal and Chairman names paired below. Portal
  Logo and Color Theme share the next row above a separate Save action; both
  grids stack on mobile. Additional appearance settings and its background-upload
  handlers are removed. Existing branding payload fields and confirmation-safe
  drafts remain intact. Verified 2026-10-26: root/app TypeScript and full frontend
  lint pass; browser checks at 320/390/768/900/1024/1280/1440px confirm alignment,
  no card overflow and disclosure removal. Mocked API checks confirm preserved
  Save fields, reload/failed-save draft retention and confirmed-save cleanup;
  these checks do not establish real database persistence. Local screenshots and
  verification script are under `frontend/test-results/settings-personalization*`.
- Teacher `StudentManagement.tsx` resolves the signed-in teacher's First Last
  display name from `/api/teachers/active` by `user_id`, with an owner-scoped
  identity cache for offline reloads and profile-name/email-prefix fallbacks. Add and Edit
  Student show this name in a disabled Teacher field. The Edit Student photo
  uploader and local photo-preview state are removed; Personal Information and
  Family Background & Details use matching headers. Paired inputs and actions
  stack on small screens, with responsive card padding. Student saves remain JSON,
  enrollment retains `section_id`, and form drafts retain existing durability.
  Verified 2026-10-24: app/root TypeScript, focused ESLint/Prettier, and six
  real-API browser checks at 320/768/1280px pass, including HTTP 201 enrollment,
  HTTP 200 edits, header alignment, no modal overflow, failed-save draft recovery
  and cached-name reloads. Browser verification files are local under
  `frontend/test-results/student-modal-verification*`; APIs use disposable schemas.
- Chairman `SystemAuditLog.tsx` shows Timestamp, Actor, Action, Summary and Details,
  with friendly action badges, inline actor name/role pills and muted emails,
  wider two-line summaries and secondary View buttons. Name/email/summary search
  combines with actor roles and action categories (section reassignments, teacher
  management, student records, system settings). Pagination shows ten matching
  logs per page and resets on filter changes. CSV exports all matching rows across
  pages with full summaries, quoted UTF-8 fields and spreadsheet formula escaping.
  Its responsive details dialog repeats the badge and safely emphasizes participant
  names. Existing sidebar, font and outer card styles stay.
- `utils/audit.py` snapshots readable entity names plus ID/name metadata as a
  validated JSON envelope in the existing `system_logs.details` TEXT column.
  Handover, transfer, teacher creation/archive/restore, student lifecycle/profile,
  parent linking, assessment windows and teacher/parent assessment saves use named
  messages. Logs commit in the same transaction as their corresponding changes.
  Audit GET aliases preserve existing fields and readable string `details`, adding
  `actor_name`, `actor_email`, `role` and `metadata`; historical plain text remains
  readable. Internal rollover snapshots/chunks remain stored for undo and are
  excluded from audit listings by the current audit-listing implementation.
- Chairman `TeacherManagement.tsx` owns both Add/Edit Teacher forms. They have
  no separate username input: required first and last names share the first row,
  email/optional employee ID share the second, and section spans the third.
  Existing controls, typography, colors and table/sidebar styling are retained.
  Account requests, responses and inserts have no username field. Migration 013
  removes the old column, retains the Chairman name in school settings, normalizes
  existing emails and adds a case-insensitive unique email index. Namesakes are
  allowed independently of email identity. Creation requires nonblank first and
  last names; partial updates may omit names but cannot clear either name.
  Nonblank employee IDs belong to one teacher, including archived accounts;
  create/update checks provide clear errors and database uniqueness prevents races.
  IDs remain optional: whitespace is trimmed and blank IDs become null, allowing
  multiple teachers without IDs. Editing a teacher may retain their own ID but
  cannot take another teacher's ID. Duplicate checks include archived teachers
  and return HTTP 400 before account/profile/section changes are committed.
  Missing creation names or explicitly blank/null names on edits return HTTP 422.
  The Add/Edit forms require Last Name just like First Name, while failed saves
  preserve existing scoped drafts. Name requirements are request validation;
  existing nullable profile columns and historical records are preserved.
  Verification (2026-10-26): all 10 tests in
  `backend/tests/test_teacher_creation.py`, app TypeScript and full frontend lint
  pass. Tests cover required names, optional IDs, duplicate IDs, retaining an ID
  on edit, archived ownership and transaction rollback. Teacher-management
  browser expectations were updated for required last names but were not rerun
  for this follow-up; earlier browser results below describe their dated runs.
- Teacher directories use one LEFT JOIN query over active adviser assignments.
  They retain unassigned teachers and ignore stale cached labels. Chairman and
  teacher directory aliases share this query. Teacher moves now vacate every
  previous section pointer and deactivate the incoming teacher's old assignment
  rows within the same transaction; an advisory transaction lock serializes moves
  and handovers across sections. Migration 011 explicitly cleans existing duplicate
  ownership, preferring the displayed class when backed by an active assignment,
  otherwise the latest assignment date/ID. It retains historical rows and verifies
  school records, permissions and accounts unchanged. Applied and checked on local
  ames_parity_dev on 2026-10-24. The actual local browser save assigned a teacher
  to a vacated section with HTTP 200 and no handover; the other adviser retained
  their active assignment. Staff identities and section names are omitted from
  this verification record. Student/evaluation/family-link fingerprints were unchanged.
  Verified: 27 focused backend regressions plus six audit regressions pass; all
  18 desktop/mobile teacher-management browser cases pass across the initial run
  and a focused rerun after fixing a reload-data wait in an existing test.
  TypeScript, focused ESLint, Python compilation and whitespace checks pass.
  Current teacher lifecycle assertions use email-only accounts and profile names,
  with required first/last creation names as described above.
  Creation, edits and section handovers explicitly roll back all writes on errors.
  Existing takeover policy remains: displaced teachers with no other active
  section are archived, while teachers with another active section stay active.
- Teacher Management refreshes active teachers, archived teachers and sections
  together after saves and sync events, ignoring superseded refresh responses.
  Handover confirmation tolerates absent section/name properties. Archive/Restore
  Account confirmations have explicit release/manual-assignment notices, guarded
  submissions and loading spinners; restoration refreshes the active table even
  while View Archive remains open. Failed forms retain scoped drafts/credentials.
- Teacher `pages/teacher/MlInsights.tsx` mounts at `/teacher/ml-insights`. Its
  Student Evaluation tab has a responsive three-column table: **STUDENT NAME**,
  **PRE ASSESSMENT STATUS**, **PREDICTION RESULT**. **Predict All Students** runs
  predictions for PRE-ready learners in the active section through concurrent
  individual student requests. Rows expose readiness/pending/result availability;
  clicking a row or pressing Enter/Space opens the student evaluation detail
  modal. The modal shows learner/section identity, outcome probabilities, PRE
  baseline domains and classroom/home guides; **Run Prediction** can evaluate one
  ready learner. The separate Sandbox Simulator retains durable hypothetical inputs.
- Parent `pages/parent/ParentMlInsights.tsx` mounts at `/parent/ml-insights`, with
  an ML Insights navigation item. It supports one synced child without a redundant
  selector and two or more synced children with a selector. Prediction is an
  explicit **Predict Post-Test Outcome** action, gated by adviser permission,
  complete official PRE data and PRE release. See section 11 for access and results.
- Parent `pages/parent/Dashboard.tsx` uses a first-name greeting when the account's
  given name can be resolved, otherwise `Welcome back!`. Resolution uses session
  names or an unambiguous synced account-holder name, avoiding unrelated guardian
  records. Compact responsive cards show permission-aware period status and pending
  home observations; counts distinguish server-confirmed answers from local drafts.
  Recent-message previews include teacher messages only.
- Parent `pages/parent/ParentEccdAssessment.tsx` is the routed ECCD page. It uses
  compact Official Evaluation Summary/Home-Based Checklist tabs, a responsive
  domain grid and sticky Developmental Domains controls. Testing-period selection
  and **Save Assessment** share one row, including mobile. School questions remain
  read-only; marks, released scores and editing use their independent gates.
- `layouts/MainLayout.tsx` uses a mobile-first parent layout: below the 900px
  layout breakpoint, the redundant parent hamburger/drawer is removed, the fixed
  school header has a **top-right Logout button**, and bottom navigation remains
  available for pages. The desktop parent sidebar and teacher drawer remain.
  ML cards, probabilities, selectors and dialogs adapt to small screens with
  wrapping text, responsive grids, rounded controls and soft shadows.

### Production performance implementation (2026-10-26)

Portal layouts and pages use React.lazy with loading/error boundaries; the login
page remains eager. Predict All queues at most three requests concurrently,
preserves per-student failures and cancels queued work when its scope unmounts.
Twelve proven dead components/assets were removed; the active teacher password
validator, offline sync shim and licenses remain. See PRODUCTION_PERFORMANCE_AUDIT.md
for measured build sizes, fresh verification results and remaining limits.

Auth/password handlers run in FastAPI worker threads and use AnyIO's from_thread
bridge for async email. Async upload/settings/restore handlers offload DB work;
Socket.IO DB helpers own worker-local sessions, while emissions remain async.
Startup schema/model initialization also runs in a worker. Roster/children,
contacts, section advisers, transfers and workbook exports batch related data;
ML reuses its probability pass for the predicted class. Existing response and
permission contracts remain. The DB pool defaults to size 5, overflow 5, timeout
15s and recycle 300s with pre-ping; all four settings are configurable per process.
Migration 014 adds indexes explicitly and is checked by bootstrap, but is not
required or applied automatically by startup. It was tested in disposable schemas;
this audit did not upgrade the configured school database or a hosted deployment.
Fresh verification: all 329 backend unittest cases pass in one complete run;
TypeScript, full frontend lint and production build pass. Sixty-six browser cases
were verified across successful desktop/mobile runs and the documented OTP rerun.
Entry JS is 318.79 kB (102.13 kB gzip); including shared modulepreloads, initial JS
is 504.85 kB. The largest deferred chunk is 329.13 kB. See the audit for scope and
the two initial browser harness failures, their correction/rerun and local logs.

## 4. Current relational model

| Table / model file | Identity and important fields |
| --- | --- |
| users / `models/user.py` | user_id, case-insensitively unique email, password hash, role, active/pending/first-login flags; compatibility OTP columns remain; no username column |
| teachers / `models/teacher.py` | teacher_id, unique nullable user_id, optional unique employee ID, names/class label, eight granular parent flags, separate question-management permission |
| parents / `models/parent.py` | parent_id, unique nullable user_id, guardian name/age/education/occupation; guardian-only records can lack login accounts |
| sections / `models/section.py` | section_id, unique name, adviser compatibility pointer; non-null pre_test_parent_editable=true, mid_test_parent_editable=false, post_test_parent_editable=false |
| section_teachers / `models/section_teacher.py` | Assignment ID, section/teacher FKs, assigned date; Primary Adviser only, Active/Inactive, one active assignment per section (migration 008) |
| students / `models/student.py` | **Integer student_id PK**, encrypted LRN, unique HMAC hash, last four digits, names including middle name, DOB/gender, section, family/contact fields, school year, active flag |
| family_access / `models/parent.py` | Parent/student-ID FKs, relationship type, timezone-aware date_linked/requested_at; status constrained to PENDING/SYNCED, default SYNCED for compatibility |
| eccd_domains, eccd_questions / `models/eccd.py` | IDs, domain FK, question text, sequence_order, is_home_based |
| student_eccd_evaluations / `models/eccd.py` | Evaluation/student/question IDs, nullable teacher_id/parent_id, evaluator_role=teacher/parent, PRE/MID/POST, KAYA/DI-KAYA, compatibility evaluation_date, official teacher_evaluation_date, timezone-aware parent_submitted_at; unique (student_id, question_id, testing_period) |
| messages / `models/message.py` | Teacher/parent FKs, sender role, subject/body, read/archive flags, creation time |
| system_logs / `models/log.py` | User-linked actions, TEXT details including rollover snapshots/chunks, timestamp |
| system_settings / `models/settings.py` | Singleton ID 1; branding/images, school/principal/chairman names, opening month 1-12, current/previous year, rollover timestamp |
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

Stop API writers before upgrades and preserve accounts, backups and existing
encryption/HMAC keys. A fresh configured database needs Phase 1, Phase 2 and all
subsequent migrations. An existing Phase 2 database needs its missing feature
upgrades before the final current-schema check; rerunning Phase 2 alone does not
add the newer feature columns. The explicit migration inventory is:

| Version | Module in `backend.migrations` | Current responsibility |
| --- | --- | --- |
| 001 | phase1 | Protected identity foundations and historical compatibility schema |
| 002 | phase2 | ID-based final schema; remove plaintext LRN compatibility columns |
| 003 | parity_batch1 | Widen section/cached class labels to 100 characters |
| 004 | parity_batch2 | Performance indexes and production shared rate-limit storage |
| 005 | parent_linking | PENDING/SYNCED family links and request timestamps |
| 006 | parent_assessment_access | Section-scoped PRE/MID/POST parent editing windows |
| 007 | eccd_evaluator_tracking | Parent provenance, evaluator role and official teacher dates |
| 008 | adviser_takeover | Adviser-only assignments and one active adviser per section |
| 009 | parent_eccd_marks | Independent default-off checklist marks visibility |
| 010 | parent_predictions | Default-off parent prediction permission |
| 011 | section_ownership | Retire orphaned section ownership and synchronize adviser pointers |
| 012 | auth_security_version | Persistent credential revocation version |
| 013 | email_only_identity | Move Chairman name to settings, remove username, normalize emails and enforce case-insensitive uniqueness |
| 014 | production_performance | Add 18 supporting B-tree indexes; explicit transactional maintenance-window upgrade, included in fresh bootstrap |

Migration 013 was applied and checked on the configured local `ames_parity_dev`
database on 2026-10-25. Uvicorn startup, `/ready` and `/api/settings` pass with
the new schema. Chairman Name is editable below Principal Name, using the
existing durable settings draft/save flow. Seed, sessions, audit actors and
encrypted backups use settings/profile names without an account-name column.
Verification ran all 321 backend tests: 319 passed in the full run; the historical
backup fixture was upgraded to the current identity schema and the unchanged
scoring asset's CRLF/LF mismatch was normalized, after which both corrected tests
passed targeted reruns. Root/app TypeScript and full frontend lint pass.

```powershell
# Fresh database only, in order:
uv run --no-project --python .venv312 python -m backend.scripts.configure_lrn
uv run --no-project --python .venv312 python -m backend.migrations.phase1 --apply
uv run --no-project --python .venv312 python -m backend.migrations.phase2 --apply

# Fresh installs and existing Phase 2 databases: apply missing feature upgrades.
uv run --no-project --python .venv312 python -m backend.migrations.parity_batch1 --apply
uv run --no-project --python .venv312 python -m backend.migrations.parity_batch2 --apply
uv run --no-project --python .venv312 python -m backend.migrations.parent_linking --apply
uv run --no-project --python .venv312 python -m backend.migrations.parent_assessment_access --apply
uv run --no-project --python .venv312 python -m backend.migrations.eccd_evaluator_tracking --apply
uv run --no-project --python .venv312 python -m backend.migrations.adviser_takeover --apply
uv run --no-project --python .venv312 python -m backend.migrations.parent_eccd_marks --apply
uv run --no-project --python .venv312 python -m backend.migrations.parent_predictions --apply
uv run --no-project --python .venv312 python -m backend.migrations.section_ownership --apply

# Final checks after the feature upgrades; each module also supports --check.
uv run --no-project --python .venv312 python -m backend.migrations.phase2 --check
uv run --no-project --python .venv312 python -m backend.migrations.parity_batch2 --check
uv run --no-project --python .venv312 python -m backend.migrations.parent_linking --check
uv run --no-project --python .venv312 python -m backend.migrations.parent_assessment_access --check
uv run --no-project --python .venv312 python -m backend.migrations.eccd_evaluator_tracking --check
uv run --no-project --python .venv312 python -m backend.migrations.adviser_takeover --check
uv run --no-project --python .venv312 python -m backend.migrations.parent_eccd_marks --check
uv run --no-project --python .venv312 python -m backend.migrations.parent_predictions --check
uv run --no-project --python .venv312 python -m backend.migrations.section_ownership --check
```

Phase 2 records `002_student_identity_api` in ames_schema_migrations and checks
data preservation in the same transaction as schema changes. Do not run
historical Phase 1 checks against a final Phase 2 database.
For a historical Phase 1 installation, inspect its existing columns before
applying 002: that migration fingerprints current ORM fields, so an older
snapshot lacking later additive columns needs an explicitly reviewed upgrade
sequence. The fresh-install sequence above is not a universal historical repair.

`backend/scripts/setup_parity_dev.py` creates/selects local ames_parity_dev,
backs up and updates local environment files, disables OTP for that setup, and
runs Phase 1/2 preparation. Its final step invokes
`backend.scripts.seed_development`, but that module is **absent from this
checkout**. The helper is therefore incomplete and must not be presented as a
working bootstrap command. It also omits feature upgrades 003–011. Use the
explicit migration inventory for schema work; ordinary API startup provisions
no accounts. Setup and migration commands mutate state, so a documentation or
code review must not run them merely to inspect the system.

## 5. HTTP contract map

`backend/main.py` registers these families and aliases. JSON contracts live in
schemas; workbook/ZIP/backup endpoints stream bytes. Consult code/OpenAPI for
the complete method/path/query inventory.

| Area | Principal paths | Handler |
| --- | --- | --- |
| Authentication | /api/auth/login, /login-step1, /verify-otp, /register-parent, /update-password, /send-otp, /request-otp, /logout | `routes/auth.py` |
| Teacher CRUD/access | /api/teachers/, /active, /archived, /create, user-ID update/archive/unarchive/delete aliases, /me/access, /access-controls, /settings GET/PUT, password request/verify; POST /api/chairman/teachers provisioning alias | `routes/teachers.py`, `chairman.py` |
| Parent linking management | GET /api/teacher/students and /api/teachers/students; POST /api/teachers/students/{student_id}/approve-parent-link, /reject-parent-link, /unlink-parent | `routes/teachers.py` |
| Section parent editing windows | GET/PUT /api/teacher/settings/parent-assessment-access, optional section_id for assigned-section selection | `routes/teachers.py` |
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
| Teacher ML | GET /api/ml/students?section_id=N; POST /api/ml/predict/student/{student_id}, /api/ml/predict/sandbox | `routes/ml.py` |
| Parent ML | GET /api/ml/parent/readiness/{student_id}; POST /api/ml/parent/predict/{student_id} | `routes/ml.py` |

Shortened paths in each row are relative to that row's API prefix.

Axios uses localStorage bearer tokens, credentials, and a 60-second default
timeout (including login). Bearers attach only to the configured API origin,
including resolved relative URLs; foreign destinations lose Authorization.
Downloads use 120 seconds, decode blob-contained JSON errors, and honor
Content-Disposition. Relevant settings payloads convert to multipart. HTTP
errors expose detail/message; 422 responses retain location/type/message without
echoing sensitive inputs. Non-auth 401 responses trigger session expiry except
incorrect-current-password responses.

## 6. Authentication and access invariants

- Login and its aliases require email/password and look up `users.email`
  case-insensitively; username is neither accepted as a login alias nor returned
  in sessions, JWT claims, or teacher directories. Sessions include `first_name`,
  `last_name`, and `full_name` from teacher/parent profiles or the Chairman's
  configured real name; JWT `sub` is the user ID string. Greetings use First Last,
  then full name or email prefix. Chairman presentation uses the editable
  `system_settings.chairman_name`, falling back to `Chairman`. Migration 013
  removes `users.username` after preserving the existing Chairman name and
  rejects duplicate normalized email addresses before changing data. Routes
  normalize email inputs with strip/lower; the database enforces a unique
  lower(email) index. Encrypted backups export no retired account fields;
  older account snapshots are accepted but never restored over live accounts.
  Account creation and updates never generate or insert usernames. Login uses
  `one_or_none()` and rejects ambiguous matches instead of selecting an arbitrary
  account. `utils/account_identity.py` resolves profile/settings names;
  `frontend/src/utils/displayName.ts` uses settings for Chairman presentation.
  Audit actor queries resolve the Chairman from settings, teachers from their
  first/last names and parents from their profile full name, preserving search
  by readable names without using raw database IDs as display-name fallbacks.
  Backup schemas/export/restore do not require `users.username`; settings backups
  include `chairman_name`. Historical migrations and old-backup compatibility
  may still mention username. URL-parser `.username` checks refer to embedded
  URL credentials and must remain independent of the removed account column.
- `components/common/TermsAndPrivacyModal.tsx` provides the shared AMES Terms and
  Conditions and Data Privacy Notice, including the actual learner/family/ECCD
  data categories, advisory Random Forest limits, encrypted LRNs/backups,
  adviser-gated parent access, retention principles, user rights/responsibilities,
  and official RA 10173/DepEd references. `TermsPrivacyAcknowledgment.tsx` is used
  by login, registration, and both OTP recovery views. Checkboxes start unchecked;
  the modal's **I Agree & Accept** action checks them. Closing or pressing Escape
  does not accept, and nested privacy review preserves the native login OTP dialog.
  Unchecked submissions and OTP resends are blocked with explanatory feedback.
  Login, registration and OTP verification send `terms_accepted: true`. Explicit
  false/null or malformed values are rejected by the API; omission remains
  compatible with existing API helpers. This is not a stored consent ledger.
  Versioned, separate tab-scoped
  acknowledgment keys survive reloads/network failures and are removed only
  after a successful authenticated response, alongside the existing auth drafts.
  Enforcement is frontend-only; backend routes/schemas and database records have
  no new consent-history field or migration. Retention wording does not claim
  automatic deletion or invent a school retention schedule.
  Verification (2026-10-24): all 27 checks in
  `frontend/playwright.terms-privacy.config.ts` pass at 320/768/1280px using
  disposable PostgreSQL schemas. Registration and all three role logins use the
  real API; browser OTP scenarios mock challenge/verification responses. Five
  existing backend auth regressions separately verify actual OTP binding,
  expiry/retry, pending registration, and first-login behavior. Root/app
  TypeScript and changed-file ESLint passed at that stage. Batch 3 subsequently
  moved `useParentProfile.ts` ref access out of render; full frontend lint passed
  with zero errors and warnings on 2026-10-25.
  Login presentation follow-up (2026-10-25): the login/OTP label reads **I have
  read and agree to the Terms and Conditions.** Login's Remember Device and terms
  rows share native 16px checkboxes, `text-sm` typography and `text-gray-600`.
  Terms keeps its full privacy modal and acceptance checks; its helper remains
  accessible to screen readers without adding visible height. The subsequent
  registration follow-up applies this same short label and matching 16px/14px
  checkbox/text styling to registration and its OTP recovery view. Both pages
  retain the full privacy modal. Narrow screens wrap the text naturally.
  Follow-up verification: app TypeScript, focused ESLint/Prettier, and all nine
  login/registration review and login OTP browser checks pass. Browser layout
  measurements at 320/768/1280px confirm matching checkbox dimensions, font size,
  color and line height, with single-line rows at 768/1280px and no overflow.
  The registration follow-up passes app TypeScript, focused ESLint/Prettier and
  nine registration browser checks (review/acceptance, real account creation and
  OTP recovery). Registration layout measurements at the same three widths
  confirm both checkbox rows use matching 16px controls, 14px gray text and 20px
  line height without horizontal overflow.
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
  The production settings validator requires OTP and email credentials.
  Disabled-mode checks do not verify mail delivery.
- Credential changes return replacement sessions and revoke challenges/devices;
  prior credential-bound JWTs become invalid. Persistent users.security_version
  advances on revocation, including archive/restore and adviser deactivation;
  restored accounts cannot revive old sessions. New remembered tokens also bind
  to current credentials. Remembered devices store token
  hashes with 30-day expiry, not renewed by login. Ordinary logout preserves them;
  explicit forget-device revokes them.
- Teacher ownership uses active Primary Adviser SectionTeacher assignments.
  Each teacher holds at most one active section after migration 011; moving them
  clears old section adviser pointers and retires their previous active rows.
  Replacement deactivates the previous adviser atomically; Substitute is a retired
  historical role and grants no access. Displaced teachers with no other active
  assignments are deactivated. Handovers/transfers preserve student records,
  evaluation history, family links and section editing windows, and log actions.
- Question-management permission defaults false. verify_eccd_question_access
  permits Chairman writes and teachers with allow_eccd_question_management.
- `utils/rate_limits.py` defines fixed-window HTTP and Socket.IO budgets. The
  login budget is **15 requests per 15 minutes**, shared across login aliases;
  general API traffic is 120 requests per minute. Production counters use the
  PostgreSQL `api_rate_limits` table, except per-socket packet counters; development
  uses process-local counters. Exhaustion returns HTTP 429 with Retry-After;
  unavailable shared storage returns sanitized HTTP 503.

### Eight granular parent permissions

| Teacher column | Default |
| --- | --- |
| allow_parent_view_student_info | true |
| allow_parent_view_eccd_pre | false |
| allow_parent_view_eccd_mid | false |
| allow_parent_view_eccd_post | false |
| allow_parent_view_eccd_marks | false |
| allow_parent_predictions | false |
| allow_parent_edit_student_info | true |
| allow_parent_edit_home_based_eccd | false |

Inheritance uses the section's **active Primary Adviser with an active account**
via utils/access.py. Neither a substitute nor cached adviser pointer determines
permissions. No adviser means locked access. Coarse compatibility properties on
Teacher are not new permission columns; new flows use the eight flags above.
The question-management flag is a separate teacher permission, outside these eight.
Older six-permission and Substitute-assignment descriptions in other repository
documents, including the architectural examples in `AGENTS.md`, are stale
descriptions of implemented behavior. Current models, access helpers, schemas,
and the eight-flag table above describe the active contracts.

Teacher Settings places **Student Prediction** under **Student Record
Permissions**. It persists `allow_parent_predictions` through the existing
revision-safe settings autosave/offline queue. Default off denies parent
prediction generation with HTTP 403; enabling it does not release PRE scores,
expose checklist marks or allow editing. Parent inference independently requires
released PRE results and complete teacher-confirmed PRE data.

Score release and checklist marks are independent gates:

- Unreleased official scores, dates, ages, matrix values and progress remain
  null, with `is_published=false` and interpretation **Pending Adviser Release**.
  A locked latest phase cannot be exposed through an older released phase.
- `allow_parent_view_eccd_marks=true` permits recorded answers and evaluator roles
  across all seven domains and PRE/MID/POST, even for periods with unreleased
  official scores. It never enables parent submission or releases score metrics.
- With marks disabled, teacher-recorded answers and other linked parents'
  observations remain masked. Only the authenticated parent's own home-based
  observations remain visible when both global home editing and the section's
  corresponding editing window are enabled. Local unsaved inputs remain durable.

Parents must have a **SYNCED** family link; PENDING requests grant no child-data
access. All three parent link aliases (`/api/students/link`,
`/api/parents/children/link`, `/api/messages/link-lrn`) immediately create a
SYNCED link for a student's first account claim when there is no account-link
history. Teacher-entered guardian-only records do not count as prior account
access. After an unlink, rejection, or recorded account claim, a new claim is
PENDING until the assigned teacher approves it. The history lookup uses exact
audit metadata student IDs and conservatively requires approval for exact
student-name matches in the known historical plain-text unlink format,
including namesakes. Deleted logs and old name-only logs for renamed students
cannot reliably establish prior history; no migration or backfill is applied.
Student locking protects conflict/history checks and insertion; links and
ID-bearing claim audits commit together. A current claim blocks other accounts;
same-parent retries return the existing status without duplicates or promoting
pending requests. Existing PENDING records retain their status. The dedicated
ParentLinkResponse adds `status: SYNCED | PENDING` to the existing message,
student_id and masked_lrn fields, independently of enrollment responses.
Dashboard feedback follows this status for direct saves and offline replay;
background sync preserves the existing event's key detail and additionally
provides its server response for consumers that need it. Roster refresh and
revision-safe draft cleanup remain in place. Registration still links children
through the dashboard. Auto-sync does not bypass adviser permissions.
Profile/guardian reads mask locked fields, and updates/home
saves enforce their respective global permissions with HTTP 403. Section editing
windows (`PRE=true`, `MID=false`, `POST=false` defaults) are additional write
gates, controlled only by the active adviser. A closed period returns HTTP 403
with `Editing for [Pre-Test/Mid-Test/Post-Test] is currently closed by the teacher.`
Frontend locked states and disabled controls supplement backend enforcement.

## 7. Assessments, age, and analytics

- Periods are PRE/MID/POST; answers are KAYA/DI-KAYA; question order follows
  sequence_order. Teacher batches reject unknown/duplicate questions and mismatched
  periods, and enforce **PRE < MID < POST** dates before writes.
- Teacher saves lock the student, normalize existing teacher-confirmed dates in
  the selected period to the supplied date, upsert submitted answers with
  evaluator_role=teacher and teacher_evaluation_date, and commit. Untouched
  parent-only rows are not assigned an official teacher date. Earlier parent
  provenance remains available. Later-period answers are not saved automatically.
- Teacher UI carry-over in hooks/useTeacherAssessment.ts is virtual: earlier KAYA
  can prefill unsaved later periods; saved answers and deliberate drafts win.
  Each later period needs an explicit save and its own assessment date.
- Parent saves accept nonempty, unique home-based answers for one testing period,
  with matching top-level/row period identifiers. They record parent_id,
  evaluator_role=parent and parent_submitted_at without replacing teacher_id or
  teacher_evaluation_date. Rows without an official teacher date use today's
  compatibility evaluation_date. The global home-edit flag and section window
  are checked before any writes. This path is separate from teacher date validation.
- Assessment responses include all configured domains and school/home questions;
  homeBasedChecklist remains a home-only compatibility projection. Official
  periodDates/evaluationDates use the earliest teacher-confirmed date;
  gradingDates prefers that date and otherwise uses the earliest observation
  date, taking each row's parent submission timestamp before its compatibility
  evaluation_date. Marks and score dates retain the independent access rules in
  section 6. Parent-only dates do not make PRE ready for model inference.
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
  The frontend bundles an identical copy at
  `frontend/src/assets/eccd_scoring_data.json`, imported locally by `mlScoring.ts`
  so Vercel can build from `frontend` without backend source access. Update both
  copies together; `backend/tests/test_scoring_asset.py` checks exact bytes.
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

Workbook resource validation accepts up to **64 worksheets**, including hidden
tabs. The worksheet-limit error reports the supported maximum. Other limits
remain: 20 MiB upload, 50 MiB expanded archive, 128 ZIP members, 2,000 rows and
256 columns per sheet, and 250,000 workbook cells. XML validation, duplicate
relationship checks, separate byte streams, read-only loading and worksheet
dimension resets remain active. This supports extra EasyCD tabs around the
Info Sheet/domain import format; it does not add CHECKLIST-export import support
or establish acceptance of any particular production workbook.

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
  Replay permits only relative `/api/` paths and POST/PUT/PATCH/DELETE; invalid
  requests and unconfirmed saves stay stored for review.
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

## 11. Implemented V1 ML service and verification boundaries

### Runtime architecture and exact 18-feature contract

Teacher and Parent predictions are fully implemented on the shared **V1**
research inference path. `backend/ml/common.py` defines the feature order and
artifact directory; `backend/schemas/ml.py::MLFeatures` validates inputs.
`backend/ml/inference.py` loads the fitted preprocessing/Random Forest pipeline
from **`backend/ml/artifacts/rf_post_test_model.joblib`** and caches it with
`lru_cache`. After the 2026-10-24 baseline restoration, numeric missing values use
training-median imputation and the existing StandardScaler; categorical values use
training-mode imputation and unknown-safe one-hot encoding. The same cached service supplies
both portals. Inference does not train/refit or write official assessments.

| Feature group | Count | Exact inputs |
| --- | --- | --- |
| Seven PRE domain scaled scores | 7 | gm_pre_scaled, fm_pre_scaled, sh_pre_scaled, rl_pre_scaled, el_pre_scaled, cog_pre_scaled, se_pre_scaled |
| PRE composites | 3 | pre_total_scaled, pre_standard_score, pre_delayed_domains_count |
| Age at official PRE date | 1 | age_months_pre (completed months) |
| Child, parent and household demographics | 7 | gender, handedness, mother_education_level, father_education_level, household_occupation_tier, num_siblings, birth_order |

The three supported POST outcomes are **Suggests Significant Delay in Overall
Development**, **Suggests Slight Delay in Overall Development**, and **Average
Overall Development**. Advanced classes are unsupported. IDs, names, LRNs,
MID/POST scores and source labels are not predictor inputs. Load only trusted
locally generated joblib files. Deployments require the trusted V1 artifact and
`prescriptive_guides.json`. The active V1 binary is tracked through an explicit
root `.gitignore` exception; datasets, learner-level benchmarks, experimental
binaries and archived research outputs remain subject to their ignore rules.
Runtime does not select `rf_post_test_model_v2.joblib`; the V2
nested-CV experiment is archived in section 12.

### Teacher inference and batch workflow

`routes/ml.py` exposes teacher-only `GET /api/ml/students?section_id=N`,
`POST /api/ml/predict/student/{student_id}`, and `POST /api/ml/predict/sandbox`.
Roster and student inference enforce active section ownership and active students.
Student readiness requires all configured PRE questions, all seven domains, a
teacher-confirmed PRE date and a birth date before that date. The existing
deterministic scorer supplies scaled/standard scores at official PRE age;
completed-month age uses the same date. Parent answers may contribute to PRE
without their submission dates becoming an official teacher test date.

The three-column table and detail modal are described in section 3. **Predict
All Students** is client-side orchestration of individual authorized POSTs using
`Promise.allSettled`; there is no separate batch API or persistent prediction
table. Only PRE-ready learners are included. Per-learner pending state and errors
are displayed, successful results are held in component memory, and the modal can
request a single prediction. **PREDICTION RESULT** indicates result availability
(`Not Ready`, `Predicting...`, `Ready`); the predicted class is shown in details.

Teacher results include the three probabilities, confidence caveat, official
PRE date, seven baseline cards, model input/imputation disclosure and expandable
classroom/home activities. Parent education is mapped from canonical values in
SYNCED family records. Free-text occupations have no reviewed tier mapping and
remain missing rather than inventing family circumstances.

The debounced Sandbox Simulator preserves the 18-field API contract with
owner-scoped durable drafts. Domain edits recalculate total scaled score, standard
score and the count of domains <=6. The standard score comes from the existing
official scoring JSON and closest-lower fallback; all three composites are
read-only. The backend independently derives the same composites before sandbox
inference. Old drafts recalculate stale composites while retaining domain and
household inputs. Successful inference retains inputs; offline failures mark
pending state and retry on reconnection.

### Parent on-demand workflow and privacy

`GET /api/ml/parent/readiness/{student_id}` and
`POST /api/ml/parent/predict/{student_id}` require a signed-in parent, a SYNCED
family link and an active enrolled child. Readiness reports completion and access
flags without scores; a disabled prediction flag does not itself reject this
readiness request. Prediction generation additionally enforces:

1. The current active Primary Adviser's `allow_parent_predictions` flag, controlled
   by **Student Prediction** in Teacher Settings. Disabled access returns HTTP 403.
2. Complete PRE with an official teacher-confirmed date. Incomplete or parent-only
   unconfirmed PRE returns HTTP 400 with the completion message.
3. Independent PRE score release (`allow_parent_view_eccd_pre`). Closed release
   returns HTTP 403 **Results Pending Adviser Release** before scores or
   gap-derived guidance can leave the server.

The parent page supports a single synced child or multiple synced children and
requests inference only after **Predict Post-Test Outcome**. Restricted,
incomplete, unreleased, ready, loading and error states are explicit. Results
show probabilities, the official PRE date, seven scaled baseline domains, and
home activities with practice, scaffolding, review and success guidance.
`ParentPredictionResponse` excludes family model inputs, imputed-field details,
individual checklist marks/item numbers and teacher-only guide fields. The marks
permission never substitutes for PRE release or prediction access.

Child selection reuses `useChildren`. Requests are cancelled/version-checked so
late sibling responses cannot replace the selected child's results. Readiness
refreshes on focus, reconnection and every 20 seconds; failed access checks hide
predictions until successfully revalidated. Results are not persisted locally or
saved as assessment records.

### Guidance and research limits

`prescriptive_guides.json` supplies transparent PRE-based activities independently
of the predicted outcome: scaled score <=6 or explicit DI-KAYA items triggers
support. Planning tiers are <=3 Delay, 4–6 Slight Delay and >=7 Average. Item
numbers are positions within each domain. These locally authored suggestions
support teacher/parent planning; they are not clinical diagnoses or evidence of
treatment effectiveness.

The previous V1 baseline was restored on 2026-10-24 at the user's request, without
retraining or changing branches. The exact 18 features, unchanged 1,529-row dataset
and 70/30 stratified seed-42 split remain. The active forest uses 400 trees, gini,
max_depth=None, max_features='sqrt', min_samples_split=6, min_samples_leaf=2,
random_state=42 and class_weight='balanced', with median/mode preprocessing and
no extra source-based sample weights. Its original matching metrics, report,
real comparison CSV and all five plots were restored from the baseline archive;
the original trainer and teacher/parent notices were restored as well.

Active mixed-holdout accuracy is **88.89% (408/459)**, Macro F1 **88.98%**,
synthetic accuracy **90.02% (406/451)** and real holdout accuracy **25% (2/8)**.
Five-fold training CV accuracy is **88.41%**. The 90%+ mixed-accuracy goal
remains unmet. The accepted Option A regression gates are now >=0.88 mixed
accuracy, >=0.90 synthetic accuracy and >=0.88 three-class macro F1; tests also
pin exact artifact hashes and holdout counts. These consistency gates are not
production acceptance. Both portals disclose the baseline scores and limitations.
All 29 real POST outcomes are Average and contributed generator anchors, so neither
this baseline nor the 8/8 experiment establishes independent real-world validity
or real delay detection. Probabilities are not calibrated clinical confidence.

### Current verification setup (source checked 2026-10-25)

Run checks from the repository root and select those relevant to the change:

```powershell
uv pip check --python .venv312
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build

# Focused active backend regressions; these use disposable PostgreSQL schemas.
uv run --no-project --python .venv312 python -m unittest backend.tests.test_audit_logs backend.tests.test_section_ownership backend.tests.test_teacher_creation backend.tests.test_adviser_takeover backend.tests.test_parent_linking -v

# Teacher/parent ML API regressions.
uv run --no-project --python .venv312 python -m unittest backend.tests.test_ml_api backend.tests.test_parent_ml -v
```

`frontend/tsconfig.json` has project references and no root input files; plain
`tsc --noEmit` alone does not check the app and tooling projects. The frontend
build runs `tsc -b && vite build`. App configuration enables `resolveJsonModule`
for the shared ECCD scoring JSON. Frontend scripts are dev, build, lint, preview,
test:e2e, and format; there is no separate unit-test script in that manifest.

Backend regression files live in `backend/tests/` and use unittest. The Phase 1/2
fixtures prepare disposable schemas on the configured PostgreSQL server;
`backend/tests/serve_phase3.py` wraps those fixtures as a loopback-only browser
API, with reset/import helper routes and a default port of 8767. Never deploy
that test server or direct reset operations at school data.
`backend/tests/test_dev_otp.py` additionally contains a rollback-contained check
restricted to the local development database. SMTP diagnostic scripts can send
real mail and are not ordinary read-only checks.

The following Playwright configurations in `frontend/` support targeted checks;
each selects the correspondingly named spec in `frontend/tests/`:

| Configuration | Spec | UI origin | Test API | Server management |
| --- | --- | --- | --- | --- |
| `playwright.audit.config.ts` | `audit-logs.spec.ts` | http://127.0.0.1:5185 | 8773 | Starts disposable API and Vite; desktop/tablet/mobile |
| `playwright.teacher-management.config.ts` | `teacher-management.spec.ts` | http://127.0.0.1:5184 | 8772 | Starts disposable API and Vite; desktop/mobile |
| `playwright.parent-ml.config.ts` | `parent-ml.spec.ts` | http://127.0.0.1:5183 | 8771 | Starts disposable API and Vite; spec sets desktop/mobile sizes |
| `playwright.ml-sandbox.config.ts` | `ml-sandbox.spec.ts` | http://127.0.0.1:5186 | 8774 | Starts disposable API and Vite; desktop/mobile |
| `playwright.terms-privacy.config.ts` | `terms-privacy.spec.ts` | http://127.0.0.1:5188 | 8775 | Starts disposable API and Vite; desktop/tablet/mobile |
| `playwright.ml-insights.config.ts` | `ml-insights.spec.ts` | http://localhost:5173 | 8769, started separately | Starts/reuses Vite only; Desktop Chrome project, spec adjusts viewport |
| `playwright.parent-sync.config.ts` | `parent-sync.spec.ts` | http://127.0.0.1:5190 | Mocked API | CI starts Vite only; desktop/mobile, no school database |

Parent-sync/Excel verification on **2026-10-27**: 10 database-free backend
checks passed, including all three link response contracts and acceptance of
17/64 sheets with hidden tabs versus rejection of 65. Python compilation,
dependency consistency, frontend app/tooling TypeScript, explicit browser-test
type checking, full lint, formatting and production build passed. Playwright
discovery lists eight parent-sync cases; those browser cases have not been
executed. No local database/API/browser servers were started. These checks used
synthetic process-only settings; no local backend configuration was created.
`.github/workflows/parent-sync-excel.yml` prepares the six focused backend
modules against disposable PostgreSQL and frontend/browser checks using mocked
APIs. The workflow has not been executed in this session. Deployment acceptance,
including the exact production workbook, remains outstanding; see
`PARENT_SYNC_AND_EXCEL_IMPORT_FIX_PLAN.md`.

Use an explicit configuration, for example:

```powershell
pnpm.cmd --dir frontend exec playwright test --config playwright.ml-sandbox.config.ts
pnpm.cmd --dir frontend exec playwright test --config playwright.terms-privacy.config.ts

# Original teacher ML spec needs this API running in a separate terminal first:
uv run --no-project --python .venv312 python -m backend.tests.serve_phase3 --port 8769
pnpm.cmd --dir frontend exec playwright test --config playwright.ml-insights.config.ts
```

`frontend/playwright.config.ts` is **absent**. The manifest's `test:e2e` script
only runs `playwright test`; pass `--config` when using it. The `format` script
still names the absent default config, so use explicit existing file paths for
focused formatting. Historical teacher/parent parity, editing-window and visual
harness configurations in section 12 are not available in this checkout.

`backend/tests/test_parity.py::test_all_legacy_functional_routes_registered`
uses a self-contained route-contract list; it no longer reads legacy files.
Batch 3 reconciled section counts/access with single-section ownership and
released-question lists with the current contract while preserving masking,
session-revocation and score-preservation assertions. The three targeted modules
(`test_parent_assessment_access`, `test_parity`, `test_phase2`) passed all 72
tests on 2026-10-25; this is not a full-suite result.

`backend/tests/test_ml_model.py` is present locally but Git-ignored. It needs the
ignored datasets, matching split files, reports, plots and audit artifacts; it
is not guaranteed to run from a clean clone. Its current Option A consistency
gates are >=0.88 mixed accuracy, >=0.90 synthetic accuracy and >=0.88 three-class
macro F1, plus exact model/data/metrics hashes. They do not establish production
acceptance. Do not retrain or regenerate datasets as a documentation check.

Root and frontend `.gitignore` rules ignore generated browser reports/caches,
but **do not ignore browser test source or configuration files**. Existing audit,
teacher-management, parent-ML and teacher-ML specs/configs are tracked; the new
sandbox and terms/privacy specs/configs are currently untracked and eligible for
review/addition. The active V1 model is tracked; raw workbooks, CSV datasets,
learner-level benchmarks and the archived experiments remain ignored. Ignored
local files and generated screenshots are not guaranteed to accompany a clone.

### Verification of this documentation refresh (2026-10-25)

This refresh inspected active source and manifests, the migration inventory,
all six browser-test configurations, installed Python package metadata, and
selected non-secret local settings. The V1 artifact loads with 18 features,
median/mode preprocessing and the documented 400-tree parameters. Its SHA-256 is
`2de3f5d3b31831438b60936864322935e23d61c30a5df1aeb077509538384541`.
The hybrid dataset, `train_set_70.csv`, `test_set_30.csv` and official scoring JSON
match their hashes in the saved metrics metadata. Metrics in this document are
saved evaluation results; this refresh did not retrain or rerun holdout inference.

Frontend lint was rerun and still fails with **three `react-hooks/refs` errors**
in `frontend/src/hooks/useParentProfile.ts` at lines 20/23. These are existing
application issues; this documentation task does not fix the hook. No fresh
backend regression, browser acceptance, TypeScript, production build, database
connectivity, migration-ledger, SMTP, or deployment result is claimed by this
refresh. Earlier run counts and environment-specific successes are archived
below. `DEPLOYMENT_READINESS_AUDIT.md`, `ML_ACCURACY_REVIEW.md`, and
`MODEL_PRODUCTION_DEFENSE_AUDIT_AND_PLAN.md` provide separate dated assessments
and proposals; proposals in those files are not implemented runtime behavior.

## 12. Historical implementation and research archive

**Historical log only.** Entries below preserve earlier delivery notes, test
counts, experiments and then-current commands. Statements such as "fresh
verification", "six permissions", old release-coupled marks behavior, earlier
UI structure or "no ML implementation" apply only to that entry's phase. They
do not override sections 1–11, establish current deployment state, or imply that
those tests were rerun during the latest audit. In particular, independent marks
(009) superseded score-coupled checklist masking, and predictions (010) expanded
the teacher-level parent matrix to eight flags. Use the current migration
inventory and privacy rules above for present-day work. References below to
legacy paths, inspecting legacy controllers, read-only reference folders, parity
comparisons, or legacy-dependent test commands are historical records only.
Those folders have been removed; these entries do not require locating,
restoring, or requesting legacy files for any current task.


### Earlier baseline restoration and sandbox delivery evidence (2026-10-24)

The following records were moved from the former current-state section during
the 2026-10-25 refresh. Model-selection history, branch names and reported test
results apply to those earlier runs, not to the verification of this document.

The archived 8/8 experiment used constant missing-value markers, real-row weight
15 and a 600-tree forest. It measured 89.98% mixed-holdout accuracy, 90.09% Macro
F1 and 90.47% training CV accuracy. Read-only sandbox probes showed an all-1 domain
profile predicting Average with missing household values and Significant Delay
with household values populated, supporting concern about a source shortcut.
That extreme profile also lies below the training total-score range. Its artifacts,
reports, tuning code, preprocessing tests and source snapshots are preserved under
`backend/ml/artifacts/baseline_pre_missingness_weighting/tuned_8_of_8_20261024/`.
The original baseline archive is retained. Experiment-specific sentinel tests and
screening cache are archived; generic None/NaN runtime parity checks remain
active. No dependencies, scoring rules, API contracts,
school records or unrelated working-tree changes are changed by restoration.
Restart running backend processes after replacing the cached artifact.

Earlier restoration verification (2026-10-24, before Option A reconciliation): all nine restored artifact hashes match
the original archive, the comparison CSV again reports 2/8 real holdout matches,
and dataset/train/test hashes are unchanged. A fresh-process all-1 domain probe
with blank household fields predicts Significant Delay. Of 23 focused ML artifact,
teacher API and parent API checks, 22 pass; only the retained >90% accuracy gate
fails at 88.89%. None/NaN parity, sandbox inference, permissions, shared caching
and unchanged assessments pass. App TypeScript, focused TSX ESLint and whitespace
checks pass. The current Git branch remains `unsure-check-first`.

### Option A reconciliation and sandbox standard score sync (2026-10-24)

This verification supersedes the earlier failed metric-gate result above. The
active 400-tree V1 model remains byte-identical, SHA-256
`2de3f5d3b31831438b60936864322935e23d61c30a5df1aeb077509538384541`, as does its
original metrics JSON. The hybrid, train and test CSVs were restored from
`baseline_before_shortcut_removal/data/` to match all three metadata hashes;
the real/synthetic component CSVs were restored too. Their delayed-domain count
now consistently uses <=6. The model inside that archive is a different
experiment and was not promoted. The matching real benchmark and five plots
come from `baseline_pre_missingness_weighting/`. The active report now documents
Option A rather than the unrelated 500-tree, weight=2, <=3 experiment. The
weight=15 missingness experiment remains archived and rejected for its observed
all-1 household-missingness shortcut. No training was run.

Fresh holdout inference reproduces 408/459 (88.89%) mixed, 406/451 (90.02%)
synthetic and 2/8 real accuracy, with three-class macro F1 88.98%. Model/metrics
metadata and dataset/train/test/scoring hashes agree. Five-fold CV 88.41% is the
saved original result, not a new CV run. Active temporary screening files are
absent; historical archives and learner-data ignore rules remain intact.

`utils/eccd_scorer.py::lookup_standard_score` extracts the existing exact-entry
and closest-lower rules without changing norms. `ml/common.py::sandbox_composites`
uses it for authoritative sandbox inputs; the frontend imports the same scoring
JSON for immediate/offline calculation. Seven scores of 1 yield total=7,
standard score=37 and delayed count=7, with Significant Delay predictions for
blank and filled households at all five tested ages. Request/response fields,
assessment records, permissions and prediction caching are preserved.

Fresh verification: all **27** model/teacher API/parent API tests pass. All **4**
real-API browser checks in `frontend/playwright.ml-sandbox.config.ts` pass at
1280px and 320px, including every domain edit, stale draft migration, household
variants, offline persistence and reconnect. They use disposable PostgreSQL
schemas on API port 8774 and Vite port 5186. App TypeScript, focused ESLint,
production build and whitespace checks pass; the existing bundle-size advisory
and Starlette/httpx test-client deprecation remain. Browser screenshots are in
`frontend/test-results/ml-sandbox/`. No application school records, dependencies
or legacy sources were changed. Restart existing backend workers to refresh
cached artifacts/code before manual verification.

### Earlier verification and pre-push records (2026-10-20 to 2026-10-24)

The following notes preserve the original reported evidence and commands.
Current test inventory, Git inclusion rules, local OTP setting and available
commands are described in sections 2 and 11; older statements below do not
override them.

### Verification commands and isolation

Audit-log verification (2026-10-23): all six new PostgreSQL audit tests, 13
parent-linking regressions, the student lifecycle audit regression and audit
alias/history regression pass (21 total). The 17 teacher-creation/takeover tests
also pass. Six browser checks in `frontend/playwright.audit.config.ts` verify real
Teacher Accounts handovers, names, badges, search/role intersections and safe
modal highlighting at 320px/768px/1280px, using disposable schemas on API port
8773 and Vite port 5185. Screenshots are under `frontend/test-results/audit-logs/`.
App/root TypeScript, focused ESLint/Prettier, Python compilation and the production
build pass; the existing bundle-size advisory remains. The broader Batch 1 run
still fails three unrelated methods: older username/required-field expectations,
a long-section fixture without the widening migration, and obsolete parent
progress expectations. Those contracts are outside this audit change. No schema
migration, historical-log rewrite, dependency change or application school-record
mutation was performed.

Audit table polish (2026-10-24): all nine checks in
`frontend/playwright.audit.config.ts` pass at 320px/768px/1280px. The added cases
verify two-line summaries with at least 320px of readable width, inline actor
roles, all action categories combined with search/role filters, first/last/empty
pagination states and filter resets. Download checks verify exports include all
matching pages and complete multiline summaries, escape commas/quotes and guard
spreadsheet formulas. Desktop verification also checks that table headers do not
overlap and the table fits its content area. App/root TypeScript, focused
ESLint/Prettier, production build and Git whitespace checks pass; the existing
bundle-size advisory remains. Screenshots remain under
`frontend/test-results/audit-logs/`. This follow-up changes only the audit page,
its browser tests and this context document.

Teacher-management verification (2026-10-23): all 17 focused tests in
`backend.tests.test_teacher_creation` and `backend.tests.test_adviser_takeover`
pass. All eight real-API browser cases in
`frontend/playwright.teacher-management.config.ts` pass at 1280px and 320px,
covering Add/Edit field alignment, handovers, class-name refresh, archive/restore,
loading/error recovery, absent names and failed-save reload retention. That
configuration starts disposable PostgreSQL test schemas on API port 8772 and
Vite port 5184. Root/app/tooling TypeScript checks, changed-source ESLint,
focused Prettier, Python compilation and Git whitespace checks pass. Modal
screenshots are under `frontend/test-results/teacher-management/`. No schema
migration, legacy-source edits or application school-record changes were made.

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
to local ames_parity_dev. Older route-parity tests may still reference removed
legacy files. Such dependencies are obsolete migration checks, not prerequisites
for current work. Use active routes, schemas, and tests to verify current behavior;
report any unavailable legacy-dependent checks separately.

frontend/playwright.config.ts uses one worker, desktop/mobile Chromium, UI
port 5173, visual harness 5187, and backend.tests.serve_phase3 on loopback 8767
with disposable schemas. Older visual comparisons may depend on removed legacy
assets; select current-app checks for the task and report unavailable historical
comparisons separately. Never deploy the test API or direct reset operations at
school data. SMTP diagnostics can send real email and are not ordinary read-only
checks.

### Pre-push cleanup and verification (2026-10-24)

Removed real staff identities and section names from the local browser-verification
description above. Restored the branch's previous login budget of 15 attempts per
15 minutes; the uncommitted increase to 25 was reverted. Batch 1 regressions now
check email-derived usernames and optional last names. The long-class-name test
again reaches its existing widening migration before a valid account is created.
Parent-progress coverage checks score release and checklist-marks visibility
independently, including re-closing PRE results after enabling marks. Batch 2
coverage pins the 15-attempt limit, expiry and production counters shared across workers.

Fresh verification: all **81** tests across `test_batch1`, `test_batch2`,
`test_audit_logs`, `test_section_ownership`, `test_teacher_creation`,
`test_adviser_takeover` and `test_parent_linking` pass in disposable PostgreSQL
schemas. The immediately preceding review also passed the frontend production
build, changed-file ESLint and Git whitespace checks; frontend source was not
changed by this cleanup. A repeat redacted scan of 254 commit-eligible text files
found no exact matches for local live secrets or credential-token patterns, and
the previously identified staff details no longer appear. Environment files,
learner datasets, detailed benchmarks and the 8/8 experiment backup remain ignored.
This local review does not establish that historical commits or GitHub are clean;
the security plugin could not start its Python helper, so no formal plugin report
was produced. The restored 2/8 model and metrics are unchanged; its separate >90%
ML accuracy gate remains unmet and was not part of this 81-test run. No school
records, dependencies, Git staging, commits, pushes or branch switches were changed.

### Earlier pre-push audit evidence (2026-10-20)

The audit immediately preceding this synchronization verified the current working
tree with `pnpm.cmd --filter frontend build` (TypeScript build and Vite), explicit
`tsc --noEmit` for app/tooling projects, ESLint on all eight changed/new frontend
TypeScript files, and staged/unstaged Git whitespace checks: all passed. The
production build retains the advisory for chunks over 500 kB. Full frontend lint
still reports three existing `react-hooks/refs` errors at lines 20/23 of unchanged
`frontend/src/hooks/useParentProfile.ts`; changed-file lint passing does not mean
the whole frontend is lint-clean.

Secret/PII scans found no live tracked environment credentials or added hardcoded
student PII. The three tracked `.env.example` files contain placeholders. Root
and frontend `.gitignore` now exclude `.vscode/` completely. Existing localhost
port defaults (API 8000, SMTP fallback 587) mean configuration is not exclusively
environment-sourced for every port. Browser test sources/configuration remain
excluded by existing frontend ignore rules and are not guaranteed to travel
with a normal commit.

The audit identified 21 candidate files, including backend/schema/migration/test
work beyond the listed UI scope; the index was empty and no branch integration
was performed. This synchronization edits only `AI_CONTEXT.md`. It uses source
inspection and the preceding audit's actual frontend checks; it does not claim
fresh backend tests, browser tests, migrations, database connectivity or SMTP
verification. Historical pass counts and local migration-application reports
below are records of earlier work, not fresh verification of another checkout.


### Backend parity remediation Batch 1 (2026-10-14)

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

### Backend parity remediation Batch 2 (2026-10-14)

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

### Teacher parent link approval (2026-10-16)

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

### Parent assessment editing windows (2026-10-17)

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

### Teacher checklist provenance contract (2026-10-18)

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

### Teacher saved-only auto-fill (2026-10-18)

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

### Teacher checklist provenance and progress display (2026-10-18)

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

### Phase 3 teacher workflow regression coverage (2026-10-18)

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

### Legacy Teacher Settings home-based controls (2026-10-18)

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

### Phase 4 parent checklist and selected-period saves (2026-10-18)

Historical visibility policy below predates independent marks permission 009.
Current own-observation and marks access follows section 6, including access to
permitted marks independently of official score release.

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

### Adviser takeover and removal of Substitute access (2026-10-18)

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

### Independent parent ECCD marks visibility (2026-10-18)

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

### Teacher account creation validation (2026-10-18)

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

### Sticky parent ECCD controls (2026-10-18)

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

### Chairman enrolled-student advisers (2026-10-18)

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

### Parent ML Insights and Student Prediction permission (2026-10-20)

This feature-delivery record predates the subsequent UI/hygiene audit. Its
statement that teacher ML and `.gitignore` were preserved applies to that
delivery only; the current batch/modal UI and ignore rules are summarized above.

Teacher Settings includes Student Prediction under Student Record Permissions.
The granular `teachers.allow_parent_predictions` Boolean defaults off and uses
the existing owner-scoped, revision-safe settings autosave/offline queue through
`/api/teachers/me/access`. Settings/access aliases return and persist the flag;
older partial updates preserve its saved value. Backups retain it and default
older documents to false. The additive, idempotent migration
`010_parent_predictions` verifies all other teacher fields are unchanged. It
was applied and checked on local `ames_parity_dev`; startup validates it without
automatically changing schema. Other environments must explicitly apply it using
the commands in `backend/migrations/README.md`.

`GET /api/ml/parent/readiness/{student_id}` and
`POST /api/ml/parent/predict/{student_id}` accept authenticated parents only.
Both require a SYNCED family link and an active enrolled child. Prediction
permission inherits from the current active Primary Adviser with an active
account; absent/inactive advisers fail closed. Disabled permission returns the
requested HTTP 403 message. Incomplete PRE, including parent-only unconfirmed
assessment dates, returns the requested HTTP 400 message. Actual PRE scores and
gap-derived guidance also require the independent PRE release permission; closed
release returns HTTP 403 Results Pending Adviser Release. Readiness returns no
scores. Successful parent responses exclude family model inputs and individual
checklist marks, preserving independent score/marks privacy controls. Inference
shares the existing scorer/model path and never writes assessment records.
Teacher prediction and sandbox route contracts remain intact.

`/parent/ml-insights` and the sparkles ML Insights navigation link render the
research disclaimer/evaluation limits, child identity, a selector only for two
or more synced children, restricted/incomplete/unreleased/ready states, and the
explicit Predict Post-Test Outcome action. Results show the three probabilities,
confidence caveat, official PRE date, seven scaled baseline domains, and home
activities with practice, parenting support and review guidance. Child selection
reuses `useChildren`; late requests are cancelled/version-checked, and access
refreshes on focus, reconnection and every 20 seconds. Failed access checks hide
results until revalidated. No prediction persistence or assessment writes were
added. Existing changes in teacher `MlInsights.tsx`, including Sandbox Simulator,
and `.gitignore` were preserved without edits.

Fresh verification: all 41 focused backend ML/parent access tests pass in
disposable PostgreSQL schemas. All eight parent ML browser cases pass at 320px
and 1280px, including real API toggle persistence, actual model predictions,
revocation, PRE release gating, sibling request isolation, offline reload and
reconnection. The sibling case mocks the synthetic sibling's read endpoints;
ownership gates are covered separately by real API tests. Browser sources/config
remain local under the repository's existing frontend test ignore rules.
App TypeScript, production build, changed-file ESLint, Python compilation and
Git whitespace checks pass. Build retains the existing bundle-size advisory.
Local Uvicorn startup, `/healthz` and `/ready` pass after migration. Browser
screenshots are under `frontend/test-results/parent-ml/`. No legacy sources,
dependencies or school assessment records were changed.

### V1 teacher ML feature verification (2026-10-18; historical record)

The original teacher feature delivery recorded eight model acceptance tests,
six API/cache tests and four real-API desktop/mobile Playwright cases passing.
Coverage included section/role gates, incomplete/parent-only PRE sessions,
missing-field imputation, canonical demographics, sanitized unavailability,
cache reuse, unchanged assessments, 320px layouts, offline drafts and reconnect.
Python compilation, app TypeScript, changed-file ESLint and the production build
were reported passing, with the bundle-size advisory retained. Screenshots were
written under `frontend/test-results/ml-insights/` using
`playwright.ml-insights.config.ts`. These results belong to that delivery and
were not rerun as part of this documentation synchronization.

### V2 nested cross-validation review (archived experiment)

Source: the local `backend/ml/artifacts/retraining_v2/MODEL_EVALUATION_REPORT.md`,
reviewed during this synchronization. The experiment's separate
`backend/ml/artifacts/rf_post_test_model_v2.joblib` retains the 18-feature,
three-class contract but has **not replaced V1 runtime inference**. The active
default remains `backend/ml/artifacts/rf_post_test_model.joblib`.

The report describes five outer real-student folds and three-fold inner parameter
search. Synthetic augmentation and preprocessing are fitted within each training
partition; reported validation cases are real students only. For 29 pooled real
out-of-fold cases it reports 100% accuracy and balanced accuracy, but three-class
macro F1 is only 0.3333. All 29 observed outcomes are Average; an always-Average
baseline has the same reported accuracy. There is no observed delay-class support
with which to establish discrimination. Previously examined students are not a
new external cohort, and the saved-baseline comparison overlaps earlier research.

These are archived experimental findings, not the production model's metrics or
evidence of independent clinical/generalization validity. Promotion would require
a separate reviewed change; neither this report nor this documentation update
switches the runtime artifact. Fold membership, anchors and individual predictions
in local CSV/JSON files remain sensitive microdata; preserve the existing ignore
policy and do not copy learner-level records into this context document.
