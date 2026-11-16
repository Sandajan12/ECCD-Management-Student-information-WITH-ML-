# AMES System: Current Codebase Context

Reviewed: **2026-11-07**, against code commit **a836697**. Read
[AGENTS.md](AGENTS.md) before planning or changes. Active source, schemas,
migrations, manifests and tests establish contracts; identify and resolve
documentation/code conflicts using the relevant implementation.

Authentication and custom-domain guidance updated **2026-11-13** for the
HttpOnly cookie release and remembered-device removal; see section 6 and explicit migrations 019/020.

## 1. Purpose and account handoff

AMES manages early childhood student records, deterministic DepEd ECCD
assessments, teacher/parent access, exports and educational research predictions.
The Node.js-to-Python and JavaScript-to-TypeScript migration is complete. Work
in `backend/` and `frontend/`; removed legacy folders are never prerequisites.

This refresh checked the disputed behavior against source, migration modules,
tracked browser configurations/assets and the active model checksum. It is a
documentation update, not a new application test run. It establishes neither
the configured database's migration ledger nor hosted deployment health.

Dated delivery notes, local observations, test outcomes and hybrid/V2 experiments
are preserved in [AI_CONTEXT_HISTORY.md](AI_CONTEXT_HISTORY.md). The archive
includes the complete prior context snapshot to preserve the notes' context.
Its old "current", "fresh" and "pending" labels do not override this guide. Audit
and plan files elsewhere also retain their original dates/scope. Do not turn an
old test failure into a current blocker without checking it. No pending code
repair or deployment is established by this documentation pass.

For a new account/session, open this repository and start with:

> Read AGENTS.md and AI_CONTEXT.md first. Inspect Git status and the active code
> relevant to my request. Summarize applicable business rules and any
> documentation/code conflicts before proposing changes. Verify paths and
> commands, preserve existing work, and state what you cannot establish.

A clone supplies committed files. Preserve uncommitted work separately. Ignored
environment files, database contents, encryption keys, private datasets, local
skills and connected-service credentials are separate resources. Never put
secret values in Markdown or prompts. Keep stable LRN encryption/HMAC and backup
keys with protected backups; do not regenerate them during routine setup.

| Detailed guide | Use |
| --- | --- |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Approved hosting and production configuration |
| [backend/migrations/README.md](backend/migrations/README.md) | Schema upgrades and safeguards |
| [backend/scripts/README.md](backend/scripts/README.md) | Explicit fresh database provisioning |
| [frontend/README.md](frontend/README.md) | Frontend setup and targeted checks |
| [backend/ml/README.md](backend/ml/README.md) | Current RF architecture, evaluation and limits |
| [TEACHER_ECCD_OFFLINE_SCOPE_PLAN.md](TEACHER_ECCD_OFFLINE_SCOPE_PLAN.md) | Teacher-only replay boundary |

## 2. Stack and operation

The isolated Android parent client is now React Native + TypeScript under
`mobile/parent-native-android`; it does not reuse or modify the web frontend or
the older `mobile/parent-android` TWA. Phases 1–2 cover authentication/OTP, eligible
child selection, permission-aware ECCD results/Overview, manual ML insights,
LRN linking, changed-field household profiles, home observations and messaging.
Its native OkHttp bridge persists only the refresh cookie in Keystore-backed
encrypted preferences; access JWT/user state remains in RAM. AsyncStorage holds
child selection, logout pending and account-scoped link/profile/composer/home
drafts using the audited keys/envelopes. Parent drafts never auto-submit or replay;
confirmed saves clean only matching revisions/answers. Home edits require global,
section-period and per-question gates. Messaging payloads use contacts.myId as
parent profile ID, not the account ID; socket auth uses only the RAM access JWT
and reconnects on renewal. Build/signing instructions, API configuration and
validation boundaries are in that directory's README.
Its native UI follows the responsive parent website: bundled Poppins/vector icons,
dynamic school branding, dark header, five bottom tabs, child/link dialogs,
permission-aware status/results cards, structured household forms, sticky manual
saves and keyboard-safe chat. UI_PARITY.md records source references and phone
acceptance limits; native storage/auth/permission services retain their contracts.
Overview owns collapsed home-based editing and assessment progress; ECCD is
read-only, and messaging stays in its own tab. Child Information derives Adviser
from the current detail's teacher first/last name, with a nonblank fallback.
Data screens use pull-to-refresh without refresh buttons, preserving drafts and
live updates; ML refresh reloads readiness only. Registration offers Father/Mother/
Guardian, and LRN linking omits relationship so the server inherits the account's.
ECCD filtering is read-only (All/DI-KAYA/KAYA, DI-KAYA first per domain) and uses
only permitted marks. Overview highlights retain latest-period server aggregates
across home/school questions and teacher release gates. Assess Home-Based Questions
hides confirmed rows/domains with account/child/period RAM confirmations cleared
on logout; drafts remain revision-safe/manual-only. Only its header collapses the
expanded form. Native permission locks say Locked by teacher; unread remains on
bottom Messages, with compact titles and one home instruction.
Native login is compact, with an inline blue registration link and the website's
Terms acknowledgment/full privacy dialog. Checkbox and Terms link are separate;
Close never accepts, and login/OTP require agreement before sending
`terms_accepted: true`. Only the notice's browser/device wording differs.
Authentication, schema, scoring and ML artifacts retain their contracts. Home
carry-forward uses the per-question rules in section 7 on both parent clients.

| Layer | Implementation / authority |
| --- | --- |
| Backend | FastAPI, Pydantic V2, SQLAlchemy 2 ORM, synchronous PostgreSQL sessions through psycopg2; exact pins in `backend/requirements.txt` |
| Python | Project requests Python 3.12 in `.python-version`; package management uses Astral uv |
| Server | Uvicorn; `backend.main:app` is the Socket.IO ASGI wrapper; `backend.main:api` is FastAPI |
| Security | JWT through python-jose, direct bcrypt hashing, account-bound OTP challenges and rotating refresh-cookie sessions |
| Encryption | AES-256-GCM for LRNs, HMAC-SHA256 for exact LRN lookup, Fernet for encrypted JSON backups |
| Frontend | React 19, TypeScript 6, React Router 7, Vite 8, Axios, Recharts, Socket.IO client |
| Styling | **MUI 9 and Emotion are active**, alongside Tailwind CSS 4, scoped CSS, native components, and Poppins fonts |
| UI architecture | Teacher/parent layouts use MUI ThemeProvider/CssBaseline and `components/teacher/theme.ts`; Chairman/auth/shared UI also use native/Tailwind components |
| JS tooling | pnpm **12.11.2** pinned in root `package.json`; ESLint, Prettier, Playwright |
| Workspace | Root `pnpm-workspace.yaml` includes frontend and retains separate lockfiles; frontend has matching pnpm 12 YAML overrides and its own package-manager pin for isolated installs; automatic dependency verification before scripts is disabled |
| Spreadsheets | openpyxl handles active workbook import/export; pandas is installed |
| ML | V1 sigmoid-calibrated standalone Random Forest, joblib artifact, 18 PRE/demographic inputs (five household fields excluded), three supported POST outcomes; shared teacher/parent inference |
| Migrations | Python migrations 001–020; only the nullable teacher timestamp (016) is applied automatically at startup. Other upgrades are explicit; 018 retires three branding columns after the matching app is deployed. No active Alembic setup, pyproject.toml, or uv.lock |

Exact dependency versions belong to manifests/lockfiles. Do not assume another
environment named `.venv` uses Python 3.12. Root and frontend workspace YAML
carry pnpm overrides; keep them aligned. Inspect existing environments before
creating/syncing them; `uv pip sync` can remove extras, and
`uv run --no-project` does not automatically install requirements. New
dependencies require explicit approval.

The approved deployment stack is **Vercel + Render + Brevo HTTPS API + Supabase**.
Target only Render **Apolinario Mabini School System** (`backend.main:app`),
Vercel **eccd-management-student-information-with-ml** (ameskinder.com and
www.ameskinder.com), and Supabase **AMES_SYSTEM_ML**. Do not operate on
**AMES-SYSTEM-1** or **ames-system**.
See [DEPLOYMENT.md](DEPLOYMENT.md), `render.yaml` and `frontend/vercel.json`.
Vercel builds from `frontend`; public API/socket URLs point at the Render HTTPS
origin without `/api`. Backend CORS uses exact origins. Private credentials
belong only in backend/provider settings.

From the repository root, with PostgreSQL and required schema ready, use
separate terminals:

```powershell
uv run --no-project --python .venv312 python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000 --env-file backend/.env
pnpm.cmd run frontend
```

The UI defaults to http://localhost:5173; the API uses port 8000. On Windows,
`pnpm.cmd` avoids a blocked PowerShell launcher. Root `pnpm.cmd run dev`
dispatches both scripts; its backend script explicitly selects `.venv312`
through `uv run --no-project --python .venv312 python -m uvicorn`. Install
backend requirements into that same environment. The separate `.venv` may use
another Python version and does not share `.venv312`'s packages.

`backend/config/settings.py` loads `backend/.env`; process variables override
it. Preserve existing configuration and copy templates only when files are absent.

| Setting | Contract |
| --- | --- |
| `DATABASE_URL` / `SUPABASE_DB_URL` | Required PostgreSQL URL; DATABASE_URL takes precedence; engine and SessionLocal are in `config/database.py` |
| `JWT_SECRET` / `SECRET_KEY`, `ALGORITHM` | JWT_SECRET alias has precedence; production requires a strong secret of at least 32 characters; algorithm defaults HS256 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Default/template/Render blueprint 30 minutes; deployed environment overrides must be checked |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | Default/template/Render blueprint 1440 minutes (24 hours); positive and greater than the access lifetime |
| `ENABLE_OTP` | Defaults **true**; production requires true and configured email transport; local development can bypass OTP |
| `ENV` / `ENVIRONMENT` | ENV alias has precedence; defaults production; enables production deployment validation, shared rate limits, HSTS and secure cookies |
| `FRONTEND_URL`, `ALLOWED_ORIGINS`, `CORS_ORIGINS` | Combined comma-separated exact HTTP(S) origins plus localhost defaults for HTTP and Socket.IO; remote production origins require HTTPS |
| `DATABASE_SSL_ROOT_CERT` | Optional explicit trusted CA path; production uses bundled `backend/certs/prod-ca-2021.crt` when the effective setting is absent/empty or `system`. A setting path takes precedence over a URL `sslrootcert` path; explicit URL paths remain supported. Production still requires `sslmode=verify-full`; development is unchanged |
| `BACKUP_ENCRYPTION_KEY` | Stable Fernet key, normally 44 URL-safe base64 characters; invalid keys are rejected |
| `BACKUP_IV` | Required by Settings, unused by the current Fernet implementation |
| `LRN_ENCRYPTION_KEY` | 64 hexadecimal characters; required for LRN protection operations |
| `LRN_HMAC_SECRET` | At least 32 characters; required for exact LRN lookup |
| `MAIL_*` | SMTP account/password/sender/server/port and STARTTLS/SSL settings |
| `EMAIL_TRANSPORT`, `BREVO_API_KEY` | smtp (local-compatible default) or brevo_api (HTTPS 443); production requires credentials and a real MAIL_FROM; Render blueprint selects brevo_api |
| `VITE_API_URL` | Public backend origin without /api; fallback https://api.ameskinder.com |
| `VITE_SOCKET_URL` | Optional chat-origin override; otherwise chat uses API origin |

Never print or regenerate existing secrets. Preserve LRN encryption/HMAC keys
and the Fernet backup key. Local OTP bypass is a development option, not a
production default or proof of email delivery.
Settings validation hides input values in exception text to keep startup
tracebacks from echoing database credentials or other configured secrets.

Startup checks required schema and transactionally applies **only migration 016**;
017 is checked but explicitly applied (section 4). It seeds the tracked
7-domain/109-question fixture only if both reference tables are empty, and warms
cached ML artifacts. It never calls `create_all` or provisions accounts.
Unavailable/incompatible ML artifacts leave ordinary school workflows available;
prediction requests return sanitized HTTP 503.
`/healthz` and `/api/health` report liveness; `/ready` checks database availability.
None establishes complete deployment acceptance.

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

The shared `MainLayout.tsx` drawer renders Chairman Portal and Teacher Portal
at `text-base font-bold text-white` on desktop and mobile; Parent Portal keeps
its existing styling. Limit portal-label styling changes to the intended roles.

System Audit Logs (`/super-admin/audit`) receive explicit ISO-8601 UTC timestamps
through `AuditLogItem` in `schemas/operations.py`, used by `/api/analytics/logs`
and `/api/logs` aliases. Historical naive system-log timestamps mean UTC;
normalize offsets at the response boundary without rewriting stored records.
The page and its CSV share a formatter that treats missing offsets as UTC and
formats both date and time explicitly in `Asia/Manila`, regardless of device zone.

Important routed workflows:

- Teacher Management supports Primary Adviser assignment/handover, account
  archive/restore and the separate question-management toggle; no role selector.
- Student Records supports multi-student transfers without deleting evaluations.
- Teacher/Chairman dashboard filters share validated section/year/period scopes.
  Providers/shared GETs coalesce requests without overwriting unsaved drafts.
- Parent Overview contains home observations; Parent ECCD Checklists shows saved
  results under independent marks access. Score release and editing remain separate.
- `useChildren` refreshes eligible children every 20 seconds in visible tabs and
  on focus/visibility/reconnection; selection falls back to an eligible sibling
  or empty state. Access loss preserves drafts.

The ignored local `graphify-out/graph.json` predates recent changes. Check
freshness and refresh the relevant AST mapping before shared-code refactors;
do not treat stale graph edges as an exact current caller inventory.

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
| eccd_domains, eccd_questions / `models/eccd.py` | IDs, domain FK, question text, sequence_order, is_home_based; unique (domain_id, sequence_order) |
| student_eccd_evaluations / `models/eccd.py` | Evaluation/student/question IDs, nullable teacher_id/parent_id, evaluator_role=teacher/parent, PRE/MID/POST, KAYA/DI-KAYA, compatibility evaluation_date, official teacher_evaluation_date, timezone-aware parent_submitted_at and nullable teacher_marked_at; unique (student_id, question_id, testing_period) |
| messages / `models/message.py` | Teacher/parent FKs, sender role, subject/body, read/archive flags, creation time |
| system_logs / `models/log.py` | User-linked actions, TEXT details including rollover snapshots/chunks, timestamp |
| system_settings / `models/settings.py` | Singleton ID 1; title, primary color and logo, school/principal/chairman names, opening month 1-12, current/previous year, rollover timestamp; secondary_color/profile_pic_url/login_background retired by explicit 018 |
| email_verifications / `models/email_verification.py` | Account/email/purpose-bound hashed challenge/OTP, expiry, attempts; login/registration/password-change/email-change purposes |

Final schema has **no plaintext students.lrn_number or child student_lrn database
columns**. Hybrid Python compatibility properties in student.py,
student_identity.py, and student_reference.py map operations onto protected
identity. Do not restore plaintext SQL columns. Keep FK/cascade integrity.

Blank enrollment/staff-edit LRNs normalize to null in encrypted/hash/last-four
fields; supplied values require exactly 12 ASCII digits. Workbook import still
requires LRNs for matching, and exports leave absent LRNs blank.
Assigned LRNs are AES-GCM encrypted as iv:tag:ciphertext hex, indexed by
HMAC, and publicly masked as eight bullets plus four digits. Public aliases
`lrn`, `lrn_number`, and `student_lrn` contain masked values or "Pending".
The authorized staff student-detail `lrn_number` is the plaintext/null exception. Frontend
URLs/payloads/drafts use student_id; raw LRNs are enrollment/linking and authorized staff-correction inputs.
Some backend path parameters still say lrn and accept valid LRNs or IDs;
preserve those routes and their protection.

### Migration inventory and safeguards

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
| 015 | optional_student_lrn | Allow null protected LRNs while preserving assigned-LRN uniqueness and existing student data |
| 016 | teacher_marked_at | Nullable teacher save timestamp; additive startup/bootstrap migration with no historical backfill |
| 017 | eccd_question_sequence | Unique idx_questions_domain_sequence on (domain_id, sequence_order); explicit upgrade preserving question rows |
| 018 | settings_cleanup | Explicitly drop secondary_color/profile_pic_url/login_background, preserving every remaining settings field; deploy matching application before upgrading |
| 019 | refresh_cookie_sessions | Private refresh families, 10-second rotation grace; explicit additive upgrade before deployment |
| 020 | remove_trusted_devices | Explicit removal of retired OTP-bypass table after matching app deployment |

`backend/main.py::initialize_runtime` checks evaluator provenance first, then
transactionally applies **only 016** with migration-ledger serialization. The
timestamp is nullable, without a default or historical backfill. Other missing
or incompatible required schema stops startup; upgrades remain explicit.
Migration 011 is an explicit ownership cleanup rather than a startup repair;
014 is explicit and optional for startup. 017 is checked and never auto-applied.

Migration 018 is explicit and never auto-applied. The new backend accepts the
three retired settings columns while its ledger entry is absent, so deploy the
matching backend/frontend before taking a protected database backup and stopping
writers for the check/apply/check workflow in `backend/migrations/README.md`.
After 018 is recorded, startup rejects reintroduced retired columns. The old
backend cannot run after the drop; recovering the removed branding values
requires a pre-upgrade database backup. Do not infer that Supabase has been
upgraded merely because the migration file exists.

Before upgrading 017, stop API writers and inspect the configured database.
When performing an authorized upgrade, use:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.eccd_question_sequence --check
uv run --no-project --python .venv312 python -m backend.migrations.eccd_question_sequence --apply
uv run --no-project --python .venv312 python -m backend.migrations.eccd_question_sequence --check
```

An awaiting database can fail the first check because uniqueness is missing.
Duplicate groups report domain IDs, sequence values and question IDs. Stop and
review intended unused sequences; never delete questions/evaluations or
automatically renumber records to force an upgrade. The migration refuses
duplicates, locks the ledger/question table, upgrades the index transactionally
and verifies preserved question data. It does not rewrite question rows.
Migration 014 accepts the unique index installed by 017.

For a fresh database, after private settings and `INITIAL_CHAIRMAN_*` values
are configured, the explicit bootstrap is:

```powershell
uv run --no-project --python .venv312 python -m backend.scripts.seed_supabase --apply
```

It applies pending **001–020** in order, seeds matching reference data and
provisions the environment-configured Chairman in one transaction. Repeated
runs preserve accounts/reference rows; conflicting reference data aborts.
Existing databases need missing feature upgrades in order; use the migration
README and modules in the inventory above with `--check`/`--apply`. Phase 2
alone does not add newer feature columns. Do not run historical Phase 1 checks
against the final schema or assume a fresh-install sequence repairs every
historical intermediate schema. Preserve backups and stable keys before upgrades.

`backend/scripts/setup_parity_dev.py` references an absent `seed_development`
module and is not a complete current bootstrap. Use the explicit documented
workflow. Documentation checks must not run provisioning, migrations or resets.

## 5. HTTP contract map

`backend/main.py` registers these families and aliases. JSON contracts live in
schemas; workbook/ZIP/backup endpoints stream bytes. Consult code/OpenAPI for
the complete method/path/query inventory.

| Area | Principal paths | Handler |
| --- | --- | --- |
| Authentication | /api/auth/login, /login-step1, /verify-otp, /register-parent, /update-password, /refresh, /send-otp, /request-otp, /logout | `routes/auth.py` |
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
| Year-scoped ECCD exports | GET /api/eccd/export/cards-zip, /card-single, /section-summary; required school_year plus section_id or student_id | `routes/eccd.py`, `schemas/eccd.py`, `utils/excel.py` |
| Messaging | /api/messages/contacts, /history, /send, POST /, /notify-student, /unread-count, /unread, /read, /mark-read; /link-lrn linking alias | `routes/messages.py`, `students.py` |
| Settings/year | /api/settings, /update, /rollover, /undo-rollover, /revert-school-year; /api/chairman/rollover-year, /undo-rollover | `routes/settings.py` |
| Chairman account | /api/chairman/verify-password, /account | `routes/chairman.py` |
| Backup | /api/backup/export, /restore; /api/chairman/backup/export, /restore | `routes/backup.py` |
| Teacher ML | GET /api/ml/students?section_id=N; POST /api/ml/predict/student/{student_id}, /api/ml/predict/sandbox | `routes/ml.py` |
| Staff ML diagnostics | GET /api/ml/plots/{filename}; allowlisted static PNGs, teacher/Chairman only, no-store | `routes/ml.py` |
| Parent ML | GET /api/ml/parent/readiness/{student_id}; POST /api/ml/parent/predict/{student_id} | `routes/ml.py` |

Shortened paths in each row are relative to that row's API prefix.

Axios uses in-memory bearer tokens, credentials, and a 60-second default
timeout (including login). Bearers attach only to the configured API origin,
including resolved relative URLs; foreign destinations lose Authorization.
Downloads use 120 seconds, decode blob-contained JSON errors, and honor
Content-Disposition. Relevant settings payloads convert to multipart. HTTP
errors expose detail/message; 422 responses retain location/type/message without
echoing sensitive inputs. Protected API 401 `TOKEN_EXPIRED` responses (or an
expired access JWT) use one shared in-flight refresh and retry each rejected
request at most once; incorrect-current-password responses are excluded.
`SESSION_REVOKED`/`INVALID_TOKEN` never trigger renewal. Auth endpoints never
recursively retry; foreign API origins never receive these tokens.

## 6. Authentication, ownership and parent access

Email is the account identity, normalized case-insensitively; profile/settings
names supply greetings/audit actors. No new username fields. Personal passwords
require 8+ characters, uppercase/lowercase and a number, within bcrypt's 72-byte
limit. Teacher temporary passwords use their own 8-character minimum and
mandatory first-login replacement; restricted sessions cannot access ordinary
protected APIs/chat.

The production UI is https://ameskinder.com (and www.ameskinder.com); API and
Socket.IO use https://api.ameskinder.com. CORS explicitly permits both UI origins,
https://ames-ml.vercel.app and localhost:5173, with credentials, explicit methods
and headers, and exposed Date/Retry-After. Production vercel.app visits redirect
to the custom site: Strict cookies cannot authenticate a cross-site preview.

Access JWTs use `tokenType: "session"` and a 30-minute lifetime. React/API service
hold the access token and user profile only in RAM. No token, refresh_token, user
or role goes into localStorage/sessionStorage; exact legacy keys are purged.
Durable drafts remain; retired device-token/preference keys are removed. Axios sends credentials and the RAM
bearer only to the configured API origin; Socket.IO uses that same RAM token.

Login, registration, OTP and credential replacement return `access_token`, its
compatibility alias `token`, and `user`. They deliver refresh JWTs only through
ames_refresh_token: host-only, HttpOnly, Secure in production, SameSite=Strict,
Path=/api/auth, Max-Age=86400 (REFRESH_TOKEN_EXPIRE_MINUTES defaults to 1440).
Secure is disabled only for plain HTTP loopback in development. Refresh JWTs
include sub, credentialVersion, role, sid, jti and exp; they cannot authenticate
protected HTTP/Socket.IO routes. Access JWTs cannot renew sessions.

POST /api/auth/refresh reads only the cookie (no JSON credential), checks exact
Origin or Referer, and reloads/locks the PostgreSQL account and cookie family.
Production rejects missing/untrusted origins. It validates signature, token type,
active/pending state, required profile, role and credential version. The private
auth_refresh_sessions table stores family IDs/current and previous random JTIs,
a 10-second predecessor deadline and expiry; it never stores JWT strings.
During grace, parallel predecessor/current requests receive the same successor
cookie; after grace, predecessors fail. Rotation slides the 24-hour expiry;
there is no absolute login-age cap. First-login restrictions remain enforced.

On F5, AuthProvider shows a loading state and calls credentialed refresh before
mounting protected pages. BroadcastChannel("ames-auth") synchronizes login,
renewal and logout within the same UI origin, without persistent credentials.
Proactive renewal occurs about two minutes before expiry with exposed HTTP Date
clock compensation, focus/visibility/reconnection checks and a shared in-flight
promise. Protected expired 401s retry at most once. SESSION_REVOKED/INVALID_TOKEN,
auth routes and foreign origins never recursively renew. Late responses cannot
restore logged-out/replaced memory. Messaging renewal preserves form subtrees.

Network/timeouts and 408/425/429/5xx preserve memory and drafts and share a
30/60/120-second cooldown, honoring a longer Retry-After; offline renewal pauses.
Startup outages show a recoverable loading state instead of assuming logout.
Confirmed rejection ends the session with session=expired|revoked|invalid;
ACCOUNT_INACTIVE revokes while ordinary permission 403s do not log users out.
No generic form replay is introduced: only authorized teacher ECCD drafts replay.

POST /api/auth/logout revokes the cookie family and deletes the matching cookie
attributes/path, and expires both legacy device cookies; the next password login requires OTP.
An offline logout sets only the non-sensitive ames_logout_pending helper so F5
cannot resurrect the cookie before server logout succeeds. Credential revocation
deletes all account refresh families. Copied access JWTs can finish their short
lifetime unless account credentials are revoked. Existing browser-storage sessions
must sign in once after this release. Refresh families are excluded from encrypted
backups and cleared on restore, never restored as active sessions.

Migration 019_refresh_cookie_sessions is explicit and additive: apply/check it
before deploying this backend; startup checks and never auto-applies it. Enable
RLS and revoke PUBLIC/anon/authenticated access; only the direct database backend
uses this table. Fresh bootstrap includes 001–020.

JWTs bind to live credentials and persistent security version. Inactive/pending
accounts cannot use protected services. Credential changes, archive/restore and
adviser deactivation revoke prior sessions. OTP challenges are account/email/
purpose-bound, hashed, expire after 10 minutes and allow five incorrect attempts.
Every new production password login requires OTP. Device trust and the 30-day
bypass are removed. Obsolete remember/device/forget fields remain inert API
inputs. New challenges omit remembered-device claims; older claims are ignored.
Successful session delivery/logout expires host-only device_token and
trusted_device_token cookies at their historical root path. Frontend initialization
deletes only ames_device_token, ames_login_remember_device and
ames_registration_remember_device (plus legacy credentials) from both browser
stores, preserving ames_logout_pending and every work draft. Valid refresh
sessions continue working without another OTP until expiry/revocation.
Migration 020_remove_trusted_devices is explicit and never run at startup.
Deploy the matching app first; retain a protected backup, stop API writers, then
run --check, --apply, --check. DROP TABLE RESTRICT refuses external dependencies;
only user_trusted_devices and its own objects are removed. The app works before
and after cleanup. Never run an old backend against the post-020 database. Browser terms acknowledgments persist in
tab storage; supplied `terms_accepted` values are validated while omission
remains API-compatible. This is not a stored database consent ledger.

Ownership uses **Primary Adviser** only: at most one active adviser per section
and one active section per teacher. Moves retire incoming teachers' old active
assignments and clear old pointers. Handovers deactivate displaced advisers
without another active assignment. Restoring an account requires explicit
section reassignment. Substitute/OJT are retired roles and grant no access.
Moves/transfers preserve student records, evaluations, family links and section
editing windows. Assignment changes and audit writes commit atomically.

Question writes use `verify_eccd_question_access`: Chairman unconditionally,
teacher only with `allow_eccd_question_management` (default false).

Parent access inherits through `get_active_adviser_for_student` from the
section's **active Primary Adviser with an active account**. Cached pointers or
historical assignments cannot grant access. Use these eight flags; the staff
question-management flag is separate. Do not add coarse parent booleans.

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

Parents require a SYNCED family link, an active student and an eligible adviser.
Unavailable existing children return 403; deleted students return 404. Hiding
preserves links, evaluations and device drafts.

First account claims without account-link history become SYNCED; guardian-only
records do not count as prior claims. Following an account claim, unlink or
rejection, new claims become PENDING pending adviser approval. Existing claims
block competing accounts; identical retries retain status. Exact audit metadata
IDs and conservative historical name matching establish history where available.
Deleted logs/renamed learners can leave gaps; do not invent history or backfill.

Score release, marks, editing and prediction are independent gates:

- Unreleased official scores/dates/ages/progress are null, with
  `is_published=false` and **Pending Adviser Release**. A locked latest period
  cannot expose an older released period as a substitute.
- Marks permission allows recorded answers/evaluator roles across configured
  domains/periods without releasing scores or enabling editing. Without it, only
  the authenticated parent's own home observations in globally and section-enabled
  windows may be visible; teacher/other-parent marks remain masked.
- Home writes require global edit permission **and** the section's period window
  (PRE=true, MID=false, POST=false by default). Backend 403 enforcement remains
  mandatory; locked placeholders/disabled frontend actions supplement it.
- Prediction generation requires its separate flag, PRE readiness and independent
  PRE release (section 11); marks permission is not a substitute.

Parent profile saves send changed fields against a persisted baseline. Omitted
fields preserve values; explicit null may clear optional details. Guardian names
cannot be cleared; a new guardian needs a name. Changes to shared guardians check
sibling access and roll back all writes on rejection rather than forking records.
Teacher Settings overlays only explicitly present matching-owner draft booleans
and submits accumulated pending changes. Other fields retain server values.
Settings/links/profile saves require explicit online retry after failures.

Production rate limits use shared PostgreSQL counters; development uses
process-local counters. Login aliases share 15 requests/15 minutes; general API
traffic is 120/minute. Messaging has separate read/read-receipt/send buckets.
Use `backend/utils/rate_limits.py` for exact budgets/alias mapping; preserve
Retry-After/cooldowns and sanitized storage-unavailable 503 behavior.

## 7. Assessments, provenance, dates and analytics

Periods are PRE/MID/POST and answers KAYA/DI-KAYA. Teacher batches validate
questions/periods, lock the student and enforce **PRE < MID < POST** dates before
writes. `backend/utils/assessments.py` separates confirmation from editing:

- Equal-answer teacher saves set official teacher/date fields but preserve
  `evaluator_role` and `teacher_marked_at`, including existing parent
  attribution. They do not invent a new teacher-edit timestamp.
- New/changed teacher marks set teacher provenance and the actual server
  `teacher_marked_at`. Changing an answer with parent submission history requires
  that question in `edited_question_ids`, otherwise 409 before any writes.
  `parent_id` and `parent_submitted_at` remain historical provenance.
- Existing teacher-dated rows in the selected period have official dates normalized
  to the submitted date. Untouched parent-only rows remain without official dates.
- Parent submissions create only new permitted home answers. Identical retries
  are no-ops preserving author/time; changed saved answers return 409, including
  attempts by another linked parent. The whole batch is validated before writes.
  Parent observations never replace teacher identity or official dates.

`now_pht` and date helpers use Philippine time (UTC+8). Official testing dates
are the earliest explicit `teacher_evaluation_date`. Grading display prefers
that date, otherwise parent submission/compatibility dates; fallback never
confirms an official test. Actual save timestamps differ from chosen assessment
dates. Unknown historical teacher timestamps remain null. Import and backup
compatibility retain this distinction.

Carry-forward is virtual and per question: saved PRE KAYA prefills MID/POST;
saved MID KAYA prefills POST. Parents cannot downgrade inherited KAYA. Teachers
are locked only by earlier teacher-marked/confirmed KAYA, using evaluator role
`teacher` OR a non-null `teacher_evaluation_date` (equal-answer confirmation
retains parent attribution). Unconfirmed parent home KAYA remains editable by
teachers, including the original period with existing correction confirmation.
A saved teacher MID DI-KAYA resets an earlier unconfirmed parent PRE source into
unanswered POST; it cannot bypass a separate earlier confirmed KAYA lock.
`ChecklistQuestion.carry_forward` contains role-specific `locked`, `editable`,
`restricted` or null values by period. Hidden sources yield neutral restrictions,
preserving independent marks access and all editing gates. Saved `answers`,
scores, dates, exports and completion counts never include virtual answers.
Inherited-only submissions require explicit Save; native rows say "Carried
forward — not saved" and stay visible until HTTP 200/201. Drafts cannot bypass
locks and remain revision-safe through failures. Existing conflicting records
require reviewed saves. The older `pre_kaya_question_ids` response field remains
for compatibility; current clients use per-question metadata. This rule requires
no migration and is independent of official-domain ML readiness (section 11).

Official scoring uses `backend/eccd_scoring_data.json` for GM/FM/SH/RL/EL/C/SE
and closest-lower lookup fallback. Decimal age uses elapsed years/completed
months and one-decimal ROUND_HALF_UP at the assessment date. Roster/profile age
uses the school-year opening-month baseline where valid, otherwise today.
Never use a static stored age or replace official scores with predictions.
The frontend JSON must remain byte-identical; `test_scoring_asset.py` checks it.

Parent dashboards choose latest evaluated POST > MID > PRE with release gating.
Domains rank by KAYA/recorded answers with alphabetical ties.
`assessmentMastered` requires POST, records and zero DI-KAYA; it does not itself
prove all configured questions are answered. Recorded-item ratios are distinct
from official scaled/standard scores and teacher-confirmed completion.

Teacher dashboards default to explicit PRE and the active section, with no
period fallback. Progress counts active students with every configured question
teacher-dated. Excellence uses recorded KAYA ratio; critical focus uses recorded
DI-KAYA counts. Pending evaluations retain partial/parent-only states and link
by student ID/period/domain. Chairman year/section/period filters share scope.
Developmental Summary uses the official five keys Delay, Slight Delay, Average,
Slight Advance, Highly Advance (UI expands Advancement wording); active-student
totals and per-section male/female counts use scoped official scoring. Preserve
omitted-period/interpretation compatibility in `dashboard_analytics.py` and
route validation. Dashboard ratios/support rankings are not official diagnoses.

## 8. Question ordering and Excel import/export

`routes/eccd_config.py` allocates `max(sequence_order)+1` under a
destination-domain row lock for create/cross-domain moves. Text/home edits keep
position; gaps remain. Legacy sequence inputs are optional and ignored. The UI
has no editable sequence field. Migration 017's unique index protects external
writers. Preserve IDs, existing sequences and evaluation references.

Official domains are IDs 1–7 (GM/FM/SH/RL/EL/C/SE). Custom domains are
supplementary: their records cannot supply official checklist/summary dates or
summary header dates, or enter ML readiness, prediction dates/features/item
positions. Never invent official scoring codes for them.

`utils/excel.py` imports .xlsx **Info Sheet** and GM/FM/SH/RL/EL/C/SE tabs,
matches LRNs/domain names/question order, handles Excel date epochs and commits
demographics/guardians/evaluations per student. Invalid students roll back
individually; successful rows remain. Result:
`{ successCount, failedCount, errors: [{ row, error }] }`.
Cross-section updates remain forbidden. Do not assume teacher interactive
batch-date validation also runs in this separate importer.

Section mismatch returns 409/`SECTION_MISMATCH` before writes. Explicit
`overwrite_section` confirmation bypasses only the file-name check, never
ownership/cross-section protection. Confirmation binds file revision and target
section. Cancel/failure/partial import retains workbook/errors; retry requires
explicit online submission.

Limits: 20 MiB upload, 50 MiB expanded ZIP, 128 members, 64 worksheets (including
hidden), 2,000 rows and 250,000 explicit workbook cells. Dimensions/formatting
can reach Excel XFD; bounded reads use 100 Info Sheet and 256 assessment columns.
Extra EasyCD tabs are supported around the import format; this does not add
CHECKLIST-export reimport or establish acceptance of an untested production file.

Tracked blank assets and `backend/assets/templates/manifest.json` define layouts
and hashes:

- Individual `ECCD_Checklist_Blank_Template.xlsx` exports contain **one CHECKLIST
  sheet**. Original-domain mappings remain bounded. Overflow standard questions,
  then custom domains, append copied Gross Motor panels with up to 13 questions
  within that sheet. Repeated identification, row-height adjustment, page breaks
  and extended print area keep panels readable. Answer-cell comments retain save
  timestamps. Preview HTML includes the extended CHECKLIST and reads saved records.
- Custom ISKOR rows show literal KAYA/configured-question ratios, or an em dash
  for unassessed periods. **Custom Domain Results — Supplementary** lists
  configured counts and KAYA/answered counts per period, including saved parent
  observations visible to staff. It requires neither official date nor birth
  date. Unanswered questions are never inferred as DI-KAYA.
- `ECCD_Summary_Matrix_Template.xlsx` exports ten base sheets in order:
  **PR, M, PO, GMF, FMF, SHF, RLF, ELF, CF, SEF**. Domain sheets repeat the cohort,
  include all genders and record numeric 1 for saved K/D marks. Official raw
  scores retain teacher-date/birth-date requirements and the deterministic scorer.
  Overflow groups use copied domain continuation layouts with whole-domain
  totals; custom domains use supplementary continuations without official codes.

Authorized staff exports decrypt LRNs in memory; absent LRNs stay blank.
Cohorts group by section **and individual school year**, batch at most **30
children** per summary workbook and ZIP multiple workbooks. Never drop children
beyond 30. Year-scoped ZIP/summary routes include active/inactive cohorts.
Individual year-scoped downloads require active current-year students; historical
individual requests return 400 directing staff to the section ZIP. Ownership is
checked even for empty sections; absent cohorts return 404. Preserve compatibility
download routes and all PRE/MID/POST content.

Relevant regressions in `backend/tests/`: `test_eccd_question_order.py`,
`test_eccd_card_exports.py`, `test_checklist_workbook.py`, `test_eccd_exports.py`.

### Staff PDF export option

Chairman Student Records' Download ECCD Records, Teacher Management's section
Export summary, and Teacher ECCD's records/summary dialogs offer Excel (.xlsx)
or PDF (.pdf). The existing authenticated `downloadFile` client handles both;
bearers remain in RAM and downloads use blob responses. Excel remains the
default and its workbook generation, filenames and ZIP behavior are unchanged.

All existing staff Excel routes also accept validated `format=pdf`: Chairman
`/api/chairman/export-eccd` and `/sections/{section_id}/export-summary`, ECCD
`/api/eccd/export/card-single`, `/export/cards-zip`, `/export/section-summary`,
`/section/{section_id}/export` and `/export-all`, plus teacher compatibility
`/api/teachers/download/{lrn}` and `/download-all` (shortened paths retain their
family prefix). Authorization and cohort selection run before PDF generation.
PDF cohort scope matches Excel, including all PRE/MID/POST periods, archived-year
rules, and section/year cohorts with 30-child summary parts. Chairman Student
Records' export remains independent of roster year/search filters. Bulk
downloads remain ZIPs containing PDFs; a single summary part for a specific
section is a PDF, while multiple parts/cohorts remain a ZIP.

`utils/pdf.py` uses fpdf2 and the already-installed Matplotlib DejaVu fonts,
without OS font packages. It reads populated Excel workbooks without modifying
them. Chairman individual PDFs retain their existing portrait full-content layout.
Teacher individual and bulk checklist PDFs use the template's landscape,
three-panel front/back structure and its saved break after row 33: the front
contains Social-Emotional, demographics/family details, PRE/MID/POST dates/ages
and official raw/scaled/overall scores; the back contains the other six domains
and a bottom Parent/Teacher Remarks & Signature block. Preserve every KAYA /
DI-KAYA mark and all official scores. Measure merged cells and wrap text within
clean borders using compact 5.5-7pt type so the standard 109-question checklist
occupies exactly two pages. The latest two-page-only requirement supersedes the
earlier supplement approval: omit custom/extra panels and saved-mark timestamp
appendices from Teacher PDFs. Keep header words intact (DI-KAYA breaks only at
its hyphen; RAW/SCALED SCORE break between words). Unusually long edited text may
use an ellipsis in the print copy to enforce the cap; stored data and Excel
content remain intact. Teacher bulk exports remain
ZIPs of each student's PDF, using the identical Excel authorization/cohort rules
(including inactive records when a school-year cohort is selected). Only Teacher
PDF branches in `utils/excel.py` select `teacher_checklist_pdf`; Chairman PDFs,
Excel generation and the shared Section Summary renderer remain unchanged.
The Teacher Download ECCD Records modal places File Format and School Year
side-by-side on desktop and stacked on mobile. A full-width searchable student
Autocomplete defaults to All Students in Section (ZIP), shows all eligible
current-year students in the section when opened, and filters by name or
available LRN (including the displayed masked suffix). Clearing search restores
all choices. Archived years retain section ZIP-only behavior. Individual,
section ZIP and summary downloads continue through the RAM bearer/blob client.
Chairman and Teacher Section Summary PDFs contain only the three official
score-summary sheets PR/PRE, M/MID and PO/POST, one landscape A4 page per period
for a normal 30-child part. Omit all domain question-mark tabs (including custom
and continuation tabs) from summary PDFs; Excel keeps every original tab.
Use 7pt text, tight cell padding and one 17-column table without horizontal
slicing: identity/dates/age, seven raw/scaled pairs, total scaled, standard score
and interpretation; wrap headers at words. Summary metadata appears only at
the top of every page: school and optional school number; report and
PRETEST/MID/POSTTEST; section, school year, teacher and official testing date.
Do not repeat metadata below the student table. Anchor the aligned male/female/
total HA/SA/A/SD/D counts table near the bottom of each period's final page,
above the footer. Reserve bottom space so student rows cannot collide with it.
The renderer fits ordinary 26–32-row inputs on one page per period and supports
50-row vertical overflow with repeated metadata/column headers and counts only
on the final continuation. Actual export cohort batching remains 30 children;
these larger inputs are renderer capacity tests, not a change to downloads.
Each page has Page X of Y and an export timestamp
in Philippine Time (Asia/Manila, UTC+8). Every Teacher checklist, including each
bulk ZIP member, shows Page 1 of 2 / Page 2 of 2. Targeted checks are
`backend/tests/test_pdf_exports.py` and the non-browser
`node --test frontend/tests/pdf-export-options.test.cjs`.

The focused browser spec is `frontend/tests/pdf-exports.spec.ts`, run with
`pnpm.cmd --dir frontend exec playwright test --config playwright.pdf-exports.config.ts`.
It uses synthetic SQLite records, real signed bearer validation/PDF/XLSX routes,
the existing RAM session helper and HttpOnly cookie delivery; unrelated UI data
is mocked. The original 2026-11-14 run exposed a 36-versus-3 page conflict;
the user resolved it in favor of score-only, three-page section summaries. The
focused rerun passed all three Playwright checks, including the exact page count,
PDF/Excel downloads and RAM bearer/session integrity.
The header/bottom-count refinement also passed all three focused browser checks.
The strict two-page/modal refinement passed all three browser checks, including
desktop side-by-side/mobile stacked format/year fields, ZIP-default student
selection, live name/LRN search and clearing, individual/summary/bulk PDF/Excel
downloads, ZIP member page counts and session integrity. Frontend app TypeScript
checking (`tsc --noEmit -p tsconfig.app.json`) also passed.
`backend/tests/test_pdf_exports.py` passed 19 tests: summary placement/capacity,
all 109 official checklist questions and 327 period checkmarks on exactly two
pages, scores/dates/footer/signature clearance, omitted Teacher custom/timestamp
appendices (including oversized edited text), ZIP scope, role
checks, unchanged Chairman rendering and unchanged workbook content/styles.
This check does not verify cookie renewal or production data/deployments.

Release `2109496` was merged into main and observed live on Render and Vercel on
2026-11-14. Production health/readiness, export schemas, unauthenticated role
protection and CORS passed; deployed UI smoke passed with synthetic API/PDF data.
No authenticated school-data downloads or production inference were tested.
See the dated production-verification entry in AI_CONTEXT_HISTORY.md for exact
deployment IDs, log windows and the distinction from real-JWT local PDF checks.

## 9. Messaging, settings, rollover and backups

Messaging requires active teacher/parent accounts linked through an active child
and active assignment. Socket.IO uses `auth: { token }` and authorized rooms
`teacher-N-parent-M`. **HTTP persistence is authoritative**: committed messages
and exact read receipts push to currently authorized sessions/tabs. Failed
transport delivery does not turn a confirmed save into failure. One connection
per portal tab deduplicates messages; reconnect and bounded/backed-off HTTP
fallback recover reads. Failed sends retain scoped drafts for explicit manual
retry. Read recovery never authorizes automatic replay of message writes.

Push is process-local under the current single-process assumption. Multiple
API processes would need shared event transport; production rate counters are
already shared independently. Preserve cooldowns/Retry-After and live credential/
relationship checks. See `utils/messaging.py`, `realtime.py` and frontend
`MessagingContext.tsx`.

Settings contain the title, primary color, portal logo, school/principal/chairman
names, current year and opening month (default August). Public settings GET can
create singleton defaults, so is not guaranteed read-only. Logos are base64 data
URLs. Secondary color and profile-picture settings are retired; login and
registration always use the bundled `background_pic.webp`. The former background
upload endpoint is removed. New enrollment uses the configured school year.

Rollover archives exactly its active batch and records snapshots transactionally.
Undo has a **30-day window**, restores only that batch's IDs and original month
and never globally reactivates older archives. Restore/rollover are explicit
confirmed actions and never automatically replay offline.

Current backups are strict typed JSON in a **Fernet .enc** envelope.
`utils/backups.py` validates before replacing school data, preserves **live users/
credentials**, clears OTP challenges and refresh families, restarts school-data sequences and
commits atomically. Invalid keys/relationships abort. Never generate replacement
keys to bypass failure or accept historical SQL/CBC formats as current restores.
Backup routes remain Chairman-only. New backups omit user_trusted_devices;
old backups discard only that retired top-level collection before strict
validation. No trusted-device or refresh records are imported.

New encrypted backups omit the three retired branding settings. Older backups
remain importable: `SettingsBackupRow` discards exactly `secondary_color`,
`profile_pic_url` and `login_background` before strict validation, while unknown
settings keys are still rejected. Current school-settings submissions use an
explicit field list so old durable drafts cannot resend retired values; drafts
are otherwise retained until revision-matched server confirmation.

## 10. Offline durability and development rules

Preserve inputs across reload, network drops, session expiry and access changes.
**Never call `localStorage.clear()`.** Evict only the exact key/revision after
HTTP 200/201 confirmation. Older responses must not erase newer edits. Logout,
child hiding and permission revocation preserve work drafts. Refetches must not
replace unsaved inputs or cross owner/student/section selections.

| Draft | Owner-scoped key |
| --- | --- |
| Teacher ECCD | `eccd_draft_${studentId}_${testingPeriod}_${domainId}_${ownerId}` |
| Parent ECCD | `eccd_draft_${studentId}_${testingPeriod}_${domainId}_home_${ownerId}` |
| Generic form | `ames_draft_${ownerId}_${resource}` |

`frontend/src/utils/drafts.ts` stores owner, values, revision and pending/error
state. `syncDrafts`/`isTeacherEccdDraft` permit automatic replay only with:

1. An online authenticated **teacher (`admin`)** session whose user ID matches
   the owner and that still has a token.
2. A matching teacher ECCD key with positive student/domain/owner IDs and a
   PRE/MID/POST period; parent `_home_` keys do not qualify.
3. Exactly **`POST /api/eccd/evaluate`**, with payload student ID and period
   matching the key, and stored revision still matching the pending snapshot.
4. Server authorization and HTTP 200/201 confirmation before revision-safe cleanup.

The generic relative-`/api/` mutation path/method validator supports manual saves;
it is **not** automatic replay authorization. `SyncStatus.tsx` calls only eligible
teacher ECCD replay on mount/reconnection and reserves its sync action/wording for
those drafts. Parent/Chairman sessions, home observations, settings, links,
messages, sandbox predictions, other forms and uploads require **manual online
submission**, including legacy queued records. Show:

> Your draft is saved on this device. Reconnect and submit again.

Credentials persist in tab-scoped sessionStorage. `fileDrafts.ts` retains selected
files/revisions in IndexedDB; files survive reload but never auto-upload after
reconnect. Partial imports retain workbook/errors. Storage-full feedback must
tell users to keep the page open. Do not add a generic replay worker or purge
old queues. `eccdOfflineSync.ts` is a shared-primitives re-export, not broader
replay permission.

Use explicit TypeScript contracts, avoid `any`, and preserve parent gates.
MUI custom styling belongs in `sx`, with responsive sizing, rounded controls,
soft depth, whitespace and readable typography. Native/Tailwind components remain
supported. Preserve route aliases, response shapes, database constraints,
evaluation history, permission masking, official scoring and durable drafts.

## 11. Current ML service and verification

### Standalone Random Forest and exact input contract

Both portals use `backend/ml/inference.py` and the cached trusted artifact
**`backend/ml/artifacts/rf_post_test_model.joblib`**, a fitted sigmoid-calibrated
**standalone RandomForestClassifier**. No RF/HGB voting ensemble remains in the
primary model; runtime does not select V2. Loader checks require sigmoid
calibration and a fitted nested standalone RF. Inference never trains/refits or
writes official assessment records. Restart a running API after an authorized
artifact replacement to refresh the cache.

Active SHA-256, rechecked against the local binary and the **top-level**
`model_sha256` in `backend/ml/artifacts/evaluation_metrics.json`:

```text
1ff4591f0f8e21bbaeb48f5617f61acd460f2953f6609cac52d5f86a6bdcec73
```

Older hashes in frozen comparison records identify historical hybrid artifacts,
not this RF. Architecture/metrics are detailed in `backend/ml/README.md`;
experimental narratives remain in `AI_CONTEXT_HISTORY.md`.

`rf_full_leaf3` uses 400 trees, minimum leaf size 3, max_features 0.8, balanced
class weights and seed 42, with fold-local preprocessing/weighting and three-fold
sigmoid SupportAwareCalibration. Retained missing inputs use training medians/
modes and unknown-safe encoding. Outside PRE score training support,
probabilities blend toward training priors; this is not measured recovery.

The **18-field API contract** is defined in `backend/ml/common.py` and
`backend/schemas/ml.py`:

| Feature group | Count | Exact inputs |
| --- | --- | --- |
| Seven PRE domain scaled scores | 7 | gm_pre_scaled, fm_pre_scaled, sh_pre_scaled, rl_pre_scaled, el_pre_scaled, cog_pre_scaled, se_pre_scaled |
| PRE composites | 3 | pre_total_scaled, pre_standard_score, pre_delayed_domains_count |
| Age at official PRE date | 1 | age_months_pre (completed months) |
| Child, parent and household demographics | 7 | gender, handedness, mother_education_level, father_education_level, household_occupation_tier, num_siblings, birth_order |

Five household fields (parent education, occupation tier, siblings and birth
order) are excluded before estimator preprocessing; their values and missingness
do not influence the estimator. IDs, names, LRNs, MID/POST measurements and source
labels are excluded. Only three POST classes are supported: Suggests Significant
Delay in Overall Development, Suggests Slight Delay in Overall Development, and
Average Overall Development. Advanced outcomes are unsupported.

### Authorization, readiness and sandbox

Student inference enforces active ownership and all configured PRE answers in
the **seven official domains (IDs 1–7)**, an explicit teacher-confirmed PRE date
and birth date before it. This requires complete official-domain answers and an
official date, not invented teacher dates on every parent row. Custom answers
cannot supply that date or block readiness. Official-domain records alone feed
scores/features; item identifiers for guides are local positions within each
domain. Teacher Predict All orchestrates bounded concurrent individual requests;
there is no batch API or persistent prediction table.

Teacher ML Insights paginates Student Evaluation locally at 10 learners per page,
using the complete authorized `/api/ml/students` response. The default shows all
learners; the Ready PRE only switch filters on the existing `pre_complete` flag,
not prediction-result availability. Apply filtering before pagination, show the
filtered range/count and a specific empty state, and reset to page 1 on filter
changes or roster refresh. Predict All still processes every PRE-ready learner
in the section across all pages. Page/filter changes never run predictions or
clear selected-student drafts/results. The focused non-browser control tests are
`node --test frontend/tests/ml-student-list.test.cjs`.

Parent prediction additionally requires SYNCED/active eligible child access,
`allow_parent_predictions`, PRE readiness and independent
`allow_parent_view_eccd_pre`. Disabled access/unreleased scores return 403;
incomplete PRE returns 400. Readiness reports flags without scores. Parent
responses exclude family inputs/imputation details, checklist marks/item numbers
and teacher-only guide fields. Results are on-demand and not locally persisted
as assessments. Readiness revalidation and stale-sibling guards remain required.

The sandbox accepts raw counts GM13/FM11/SH27/RL5/EL8/C21/SE24 and integer age
**36–71 months**. Official conversion and server-recomputed composites remain
authoritative; compatible scaled-only requests remain supported.
`raw_scores` is not an extra estimator feature. Owner-scoped
`ml_sandbox_raw_v2` drafts survive failures and success; old scaled drafts remain
for reference. Failed predictions await explicit retry, including after reconnect.

`prescriptive_guides.json` supplies PRE-based classroom/home planning activities
independently of the predicted category. Scaled <=6 or explicit DI-KAYA triggers
support; planning tiers are <=3 Delay, 4–6 Slight Delay, >=7 Average. These are not
official developmental scores, diagnoses or evidence of treatment effectiveness.

### Tracked diagnostic assets and research limits

The active model and guides are tracked, as are **six approved PNGs** through
explicit root `.gitignore` exceptions in `backend/ml/artifacts/plots/`:

- `01_confusion_matrix.png`
- `02_classification_metrics_f1.png`
- `03_feature_importance.png`
- `04_class_distribution_70_30.png`
- `05_real_beneficiary_pre_vs_post_comparison.png`
- `06_probability_reliability.png`

Normal checkouts carry these approved assets. Other research outputs/datasets
retain their ignore rules. `GET /api/ml/plots/{filename}` serves only the
allowlist to teacher/Chairman sessions with `no-store`; the final two `.jpg`
aliases return existing PNGs. Requests never generate plots or train. Parents
have no gallery; missing/unknown assets return sanitized 404s.

Recorded RF evaluation, **not rerun for this documentation update**: mixed
holdout 423/459 (92.1569%), macro F1 92.1690%; real holdout 3/8 (37.5%); mixed
training CV accuracy 88.5981%; shared-anchor student-excluded real 9/29; separate
exploratory real-fold evaluation 13/29. All 29 real POST labels are Average and
informed development/generator anchors; always-Average is 29/29. Synthetic
balance is not population prevalence. Independent real-world validity, real
delay sensitivity, clinical confidence and intervention effectiveness are not
established. Former >=90% metric gates and selected probability bands are
diagnostics, not current publication requirements. Preserve portal disclosures.

### Verification commands and tracked inventory

Run relevant checks from the repository root:

```powershell
uv run --no-project --python .venv312 python -m pytest backend/tests -q
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build
git diff --check
```

Do not collect pytest from the repository root; archived modules can collide.
The frontend root tsconfig only references projects; plain `tsc --noEmit`
does not check them. Use explicit browser configurations: there is no
`frontend/playwright.config.ts`. There are **15 tracked configurations**
selecting **20 distinct specs**; some configurations share specs. This is an
inventory, not an executed test count.

| Configuration | Spec | UI origin | Test API | Server management |
| --- | --- | --- | --- | --- |
| `playwright.audit.config.ts` | `audit-logs.spec.ts` | http://127.0.0.1:5185 | 8773 | Starts disposable API and Vite; desktop/tablet/mobile |
| `playwright.teacher-management.config.ts` | `teacher-management.spec.ts` | http://127.0.0.1:5184 | 8772 | Starts disposable API and Vite; desktop/mobile |
| `playwright.parent-ml.config.ts` | `parent-ml.spec.ts` | http://127.0.0.1:5183 | 8771 | Starts disposable API and Vite; spec sets desktop/mobile sizes |
| `playwright.ml-sandbox.config.ts` | `ml-sandbox.spec.ts` | http://127.0.0.1:5186 | 8774 | Starts disposable API and Vite; desktop/mobile |
| `playwright.terms-privacy.config.ts` | `terms-privacy.spec.ts` | http://127.0.0.1:5188 | 8775 | Starts disposable API and Vite; desktop/tablet/mobile |
| `playwright.ml-insights.config.ts` | `ml-insights.spec.ts` | http://localhost:5173 | 8769, started separately | Starts/reuses Vite only; Desktop Chrome project, spec adjusts viewport |
| `playwright.parent-sync.config.ts` | `parent-sync.spec.ts`, `parent-profile.spec.ts`, `teacher-import.spec.ts`, `offline-scope.spec.ts`, `offline-settings.spec.ts`, `eccd-question-order.spec.ts` | http://127.0.0.1:5190 | Mocked API | Starts Vite; desktop/mobile, no school database |
| `playwright.auth-security.config.ts` | `auth-security.spec.ts`, `terms-privacy.spec.ts`, `refresh-auth.spec.ts` | http://127.0.0.1:5188 | 8775 | Starts disposable auth-security API and Vite; desktop/mobile |
| `playwright.messaging.config.ts` | `messaging.spec.ts` | http://127.0.0.1:5191 | 8768 | Starts disposable API and Vite; desktop/mobile |
| `playwright.performance.config.ts` | `performance.spec.ts` | http://127.0.0.1:5190 | Mocked API | Starts Vite preview of an existing production build; desktop/mobile |
| `playwright.parent-assessment.config.ts` | `parent-assessment.spec.ts` | http://127.0.0.1:5192 | Mocked API | Starts/reuses Vite; desktop/tablet/mobile |
| `playwright.eccd-exports.config.ts` | `teacher-eccd-exports.spec.ts` | http://127.0.0.1:5191 | Mocked API | Starts Vite; desktop/tablet/mobile |
| `playwright.pdf-exports.config.ts` | `pdf-exports.spec.ts` | http://127.0.0.1:5195 | 8776, synthetic SQLite | Starts isolated export API and Vite; Chromium desktop; real export/auth checks, mocked unrelated UI data |
| `playwright.teacher-dashboard.config.ts` | `teacher-dashboard.spec.ts` | http://127.0.0.1:5194 | Mocked API | Starts/reuses Vite; desktop/laptop/tablet/small-tablet/mobile |
| `playwright.chairman-dashboard.config.ts` | `chairman-dashboard.spec.ts` | http://127.0.0.1:5193 | Mocked API | Starts/reuses Vite; desktop/laptop/tablet/small-tablet/mobile |

Run configurations separately when ports overlap, including messaging/exports
on 5191. Most real-API suites start disposable API/Vite servers; `ml-insights`
needs its API started separately. Example:

```powershell
pnpm.cmd --dir frontend exec playwright test --config playwright.ml-sandbox.config.ts
```

The parent-sync suite uses `tests/helpers/session.ts` to mock session restoration
through `/api/auth/refresh`; register it after broad API routes. Seed only durable
drafts in browser storage. Replay isolation tests set sessions through the API
module's RAM session functions. A fully offline reload waits for session
restoration while retaining drafts; reconnect restores the session before teacher
ECCD replay. Parent forms and Excel uploads still require manual submission.

Database-backed fixtures require configured PostgreSQL and isolated schemas;
inspect isolation before execution. Never deploy `backend/tests/serve_phase3.py`
or aim reset helpers at school data. Mocked browser checks do not establish real
database persistence. SMTP diagnostic scripts can send real mail and are not
ordinary read-only checks.

`backend/tests/test_ml_model.py` and reproduction resources may exist only as
ignored local files. Do not promise clean-clone reproduction of those checks or
retrain/regenerate datasets as documentation verification. Ignored screenshots,
reports and private workbooks are not portable repository memory.

This documentation pass used source inspection and file/hash inventories;
application tests, builds, migrations and model evaluation were not rerun.
Keep dated outcomes in history. Future behavior changes must update matching
current guidance and AGENTS operational rules, record remaining work/checks
honestly and keep delivery narratives out of this current guide.
