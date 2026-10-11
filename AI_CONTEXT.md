# AMES SYSTEM - AI Context & System Architecture

## Phase 3 authentication/layout visual parity (2026-10-11)

The current authentication pages and core layout have been refactored from the
original legacy MUI sources into native React/TypeScript/Tailwind components.
Login, parent registration, first-login password setup, OTP, role drawers, mobile
app bar and parent bottom navigation retain the extracted legacy measurements,
Poppins typography, Material SVG paths, colors, elevation, focus/ripple behavior
and 600/900px responsive boundaries. Existing scoped durable drafts and backend
challenge responses remain authoritative. Legacy files are read-only.

The isolated `frontend/tests/legacy-visual/` harness renders the original JSX,
stylesheet, theme and Tailwind 3 configuration with synthetic API/settings data.
Its MUI/Emotion packages are test-only and are not dependencies of the active UI.
`frontend/tests/auth-parity.spec.ts` compares geometry and screenshots at five auth
widths and desktop/mobile dialog/OTP/navigation states. Per-file extraction details
and test commands are documented in `frontend/VISUAL_PARITY.md`. Other migrated
workspace pages and chat content still require individual visual parity audits.

## Phase 3 frontend migration (2026-10-11): current UI contract

This section supersedes the earlier frontend inventory and Phase 3 TODOs below.
The active UI uses React 19, TypeScript, Vite and Tailwind CSS through
`@tailwindcss/vite`. MUI and Emotion have been removed from the active frontend.
The read-only `AMES-SYSTEM-LEGACY/frontend/` guided the dark role sidebar, blue
actions, rounded cards/dialogs, dashboard charts, management flows and assessment
tabs. Mobile navigation, scrollable tables and chat remain responsive.

- Role workspaces cover staff/parent dashboards, student enrollment and family
  details, multi-child linking, teacher/section management, ID-based bulk transfers,
  archives, ECCD assessments/questions, audit history, school/account settings,
  six adviser parent-access switches, Excel import/export, encrypted backups,
  confirmed restore, school-year rollover/undo and authenticated Socket.IO chat.
- Legacy chairman URLs redirect to the current super-admin workspace. Student
  routes, assessment state and drafts use integer IDs; LRNs are masked for display
  and accepted as raw input only for enrollment/linking. Parent result masking and
  edit gates follow the API's active Primary Adviser permissions.
- Auth follows server challenge responses. `ENABLE_OTP=false` in backend/.env
  controls local verification bypass; no frontend OTP flag is needed. First-login
  password changes gate protected pages; credential changes replace the session.
  Ordinary logout preserves remembered devices and all drafts; forgetting the
  device explicitly revokes it. Expired/unauthorized sessions return to login.
- `utils/drafts.ts` stores owner/record-scoped form revisions. Assessment keys use
  `eccd_draft_<studentId>_<period>_<domainId>_<ownerId>`; home forms add a home suffix.
  Inputs survive reload. Failed network submissions stay pending and synchronize
  on reconnection; only the exact confirmed HTTP 200/201 revision is removed.
  In-flight responses cannot erase newer edits. Permissions/validation failures
  retain inputs for review. No global localStorage clearing is permitted.
- `utils/sessionDrafts.ts` retains credential inputs within the browser tab's
  sessionStorage. `utils/fileDrafts.ts` retains selected files in IndexedDB and
  queues background-image/workbook uploads; partially imported workbooks remain
  available alongside row errors. Backup restore always requires explicit manual
  confirmation. Selected files and record drafts are scoped to the signed-in owner.
- Chat joins authenticated teacher-parent rooms, persists through HTTP before
  broadcasting the returned message ID, deduplicates messages and recovers history
  after reconnect. The connected indicator waits for room acknowledgement.
- `frontend/tests/migration.spec.ts` exercises desktop and mobile workflows against
  the loopback-only `backend.tests.serve_phase3` API on port 8767. It creates and
  removes isolated PostgreSQL schemas and uses synthetic accounts. It never resets
  live school data. See `frontend/README.md` for local commands and verification.

Final verification passed all 26 desktop/mobile browser checks, the 52 Phase 1/2
backend tests, TypeScript, ESLint and the frontend production build. The build
reports a non-blocking bundle-size warning; production optimization is outside
this migration's feature scope. The local UI/API respond on ports 5173/8000.

## Phase 2 backend migration (2026-10-11): current runtime contract

This section supersedes the historical Phase 1 compatibility notes below.
The local PostgreSQL database has received version 002 and passed the final schema
integrity check. Verification passed 52 backend tests, Python compilation and the
existing frontend TypeScript check. The local API and Vite server started and
responded successfully; the extracted 7 domains/109 questions are initialized.
The active backend uses FastAPI, Pydantic V2, SQLAlchemy and PostgreSQL. The legacy
folder `AMES-SYSTEM-LEGACY/` is a read-only behavior reference. Phase 3 frontend
integration is complete as documented above, using React/TypeScript with Tailwind.

- Apply `backend.migrations.phase2` after Phase 1, with the dev server stopped.
  The transaction checks every preserved table's data, removes plaintext
  `students.lrn_number` and child `student_lrn` columns, verifies ID foreign keys,
  primary keys, unique constraints and protected LRNs, and records version 002.
  The historical Phase 1 schema builder now explicitly copies its foreign keys.
- Students use `student_id` in URLs, assessment payloads, transfers and messages.
  Valid 12-digit LRNs remain accepted as input through HMAC lookup. Public JSON
  returns masked aliases only. Full LRNs are decrypted in RAM for authorized
  DepEd spreadsheets. `Student.lrn_number` is a Python compatibility property,
  not a database column; SQL joins use integer student IDs.
- Both login aliases honor `ENABLE_OTP=false`. Registration then activates and
  signs in immediately; password/email updates still require the appropriate
  authenticated/current-password flow. Existing credentials and local secrets
  must never be reset or replaced. OTP-enabled behavior uses account/purpose/email
  bound, hashed challenges with expiry, limited attempts and replay rejection.
  Failed registration email delivery leaves a recoverable pending account.
- New teachers must change their initial password before protected APIs or chat
  become accessible. Password/email changes return a replacement session and
  revoke old credential-bound sessions, challenges and remembered devices.
  Remembered tokens are stored hashed, expire after 30 days without renewal on
  login, and survive ordinary logout unless the device is explicitly forgotten.
- Teacher ownership uses active `SectionTeacher` records. Parent permissions use
  only the six granular flags on the active Primary Adviser, never a substitute
  or cached adviser column. Locked edits return 403. Unreleased scores, answers,
  dates, ages, matrix values and progress are null; interpretation is
  `Pending Adviser Release`. Hidden student information and guardian data are
  masked. Student transfers and adviser handovers preserve evaluation rows.
- Assessment saves validate question IDs and PRE < MID < POST dates before writes.
  Parent saves accept home-based questions only, and unchanged answers retain
  their evaluation dates. Scoring retains the original ECCD lookup data; decimal
  age uses half-up rounding to match the legacy calculations. Latest-period
  parent statistics use POST > MID > PRE with alphabetical domain tie-breaking.
- School settings support official school/principal names and opening month.
  Rollover archives exactly the active students/unarchived messages and records
  chunked audit snapshots in the same transaction. Thirty-day undo restores only
  those IDs and the original month; older archives remain archived. A missing
  or invalid snapshot is rejected instead of globally reactivating records.
- Excel import preserves the legacy `Info Sheet` and GM/FM/SH/RL/EL/C/SE layouts,
  including Excel date epochs, guardian details and PRE-derived school years.
  Each student and their evaluations commit together; invalid rows roll back and
  return row errors while successful rows are retained. Cross-section updates
  are rejected. Checklist and summary exports use reviewed blank DepEd assets,
  individual cohort years and actual scores; sections exceeding 30 children
  produce multiple workbooks rather than discarding excess rows.
- Backups use the current Python project's authenticated Fernet `.enc` format
  and strict typed school-data document. Restore validates before deletion and
  commits once, preserves the live user registry/credentials, clears verification
  and device tables, and restarts school-data sequences transactionally. Invalid
  relationships roll back all changes. Legacy MySQL SQL/CBC/v2 containers and
  older schema documents are not accepted as current-format backups.
- `backend.main:app` is the Socket.IO ASGI wrapper; `backend.main:api` is FastAPI.
  HTTP persistence is authoritative. Socket connection and room events verify
  sessions and teacher-parent relationships; broadcasts load the sender-owned
  persisted message by ID and never trust client-supplied message bodies.
  Restoring a backup disconnects chat sessions. Legacy functional route aliases
  coexist with current URLs; deployment/readiness/rate-limit machinery is omitted.
- If both ECCD reference tables are empty, startup adds the 7 domains and 109
  questions from the extracted active reference JSON. Existing/custom reference
  data is preserved. Startup checks the schema; it does not upgrade tables or
  create accounts. Local OTP remains disabled; SMTP delivery is mocked in tests.

Verification is documented in `backend/migrations/README.md`. Tests use unique,
temporary PostgreSQL schemas and synthetic accounts; they never reset live data.
Phase 3 wires ID-based UI state and routes, challenge/replacement-session handling,
first-login gating, authenticated chat, school settings, rollover and import/export
feedback. Preserve scoped offline drafts until confirmed HTTP 200/201 responses.
Do not clear drafts or global localStorage on auth changes.

## Phase 1 migration state (2026-10-11): authoritative schema additions

The local PostgreSQL 18 database has received the transactional Phase 1 migration
in `backend/migrations/phase1.py`. Existing accounts, credentials and original data
are preserved. See `backend/migrations/README.md` for commands and verification.
The legacy source is `AMES-SYSTEM-LEGACY/`; it remains read-only. The active stack
remains FastAPI, SQLAlchemy/PostgreSQL and React/TypeScript. Future migrated UI uses
Tailwind per the user's migration instruction.

- `students.student_id` is now the integer identity primary key; new fields are
  `middle_name`, `lrn_encrypted`, `lrn_search_hash` (unique) and `lrn_last4`.
- `family_access` and `student_eccd_evaluations` now have required student-ID foreign
  keys. Evaluation uniqueness uses `(student_id, question_id, testing_period)`;
  family links include a timezone-aware `date_linked` timestamp.
- **Temporary compatibility:** existing routes retain `students.lrn_number` and
  child `student_lrn`. Composite constraints prevent mismatched ID/LRN references.
  ORM events populate IDs and protection fields for these old routes. Phase 2 must
  switch API contracts to IDs/masked LRNs and remove plaintext columns afterward.
  LRN protection is staged; plaintext storage has not yet been eliminated.
- `users` has `is_first_login` and `is_registration_pending`; existing accounts
  receive false flags. New teacher provisioning in Phase 2 must opt into first-login
  password changes. `user_trusted_devices` stores account-bound token hashes/expiry.
- `email_verifications` supports `user_id`, purpose, challenge/OTP hashes and
  attempts; compatibility OTP fields remain and expiry timestamps use UTC.
- `system_settings` adds `school_name`, `principal_name` and opening month (1–12,
  default 8). `system_logs.details` is `TEXT` for exact rollover snapshot/chunk JSON.
- The normalized Primary Adviser/Substitute assignment model and six granular
  parent permissions are preserved. No deprecated OJT roles or new coarse flags
  are introduced. Existing PostgreSQL enum storage conventions remain unchanged.
- Pydantic V2 contracts support migrated auth, ID-based students/assessments,
  granular access, school settings, rollover snapshots, notifications and a strict
  complete backup document. These new contracts are prepared for Phase 2 routes.

Only models, schemas and the data migration are delivered in Phase 1. Existing
auth, restore, rollover and UI behavior remains pending Phase 2/3 integration;
in particular, snapshot-based 30-day undo and credential-preserving atomic restore
are not enabled yet. LRN secrets live only in `backend/.env`, must be retained with
backups, and must not be printed or regenerated for existing encrypted records.
Older schema descriptions below represent the pre-migration API compatibility
baseline wherever they still describe an LRN primary key.

## Local development infrastructure: authoritative setup guide

**Audit date: 2026-10-11.** This setup guide describes the active Python/TypeScript project. Its runtime/configuration instructions take precedence over older infrastructure descriptions below. The existing domain, schema, assessment, offline durability and permission requirements are retained. No application logic, UI, routes or database schema was changed by this audit.

The backend must use **Python 3.12 in a repository-local `.venv` managed by Astral `uv`**. The frontend must use **pnpm**. Run root launch scripts from the repository root. Virtual-environment activation is unnecessary.

### A. Runtime requirements and workspace boundaries

| Layer | Required setup | Audited runtime / evidence |
| --- | --- | --- |
| Python | CPython **3.12.x**, root `.venv/` | Python 3.12.15, Windows x64 |
| Python manager | Astral `uv` executable on PATH | uv 0.13.0 |
| JavaScript runtime | Recommend **Node.js 24.x** | Node 24.21.0 |
| Supported Node engines | `^20.19.0 || ^22.13.0 || >=24` | Intersection of current Vite/ESLint requirements |
| JavaScript manager | **pnpm 12.11.2** | Pinned in root `packageManager` and `engines.pnpm` |
| Database | Running PostgreSQL; templates target **16+**, port 5432 | No local service/listener or credentials available during audit |
| Backend server | Uvicorn, default 127.0.0.1:8000 | CLI and isolated ASGI checks passed |
| Frontend server | Vite, default localhost:5173 | Live HTTP checks passed |
| Email | Configured/reachable SMTP for email-dependent features | Not exercised |

Vite 8 permits Node 22.12+, but ESLint 10 requires Node 22.13+ on that release line. Node 24 is the tested choice. The PostgreSQL package `psycopg2-binary` is a client driver, not a database server.

```text
root/
  package.json                  private orchestration package; no app dependencies
  pnpm-workspace.yaml           includes only frontend; separate lockfiles
  pnpm-lock.yaml                root pnpm tool metadata / empty app dependency set
  .python-version              interpreter request: 3.12
  .venv/                        uv-managed backend environment, ignored
  .env.example                  duplicate backend template, not an active env file
  AI_CONTEXT.md                 setup guide and retained business context
  backend/
    requirements.txt            60 exact Python package pins
    .env.example                canonical backend configuration template
    .env                        required local settings, ignored; create locally
    main.py                     ASGI target: backend.main:app
    config/settings.py          absolute backend/.env path; required settings
    config/database.py          SQLAlchemy engine/session factory
    models/ schemas/ routes/ utils/   existing application layers
    eccd_scoring_data.json       existing file-relative scoring resource
    assets/templates/           externally supplied spreadsheet assets
  frontend/
    package.json                React/Vite dependencies and scripts
    pnpm-lock.yaml              exact frontend resolutions/peers/integrities
    node_modules/               frontend dependencies, ignored
    .env.example                public VITE_API_URL template
    .env.local                  recommended local public overrides, ignored
    vite.config.ts              React plugin; no API proxy configured
    tsconfig*.json              application and Vite-tooling TS projects
```

No active `pyproject.toml`, `uv.lock`, Alembic configuration, Docker configuration, or Python seed/bootstrap command was found. The backend is requirements-based: **`uv run` does not automatically install `requirements.txt`**. Keep dependency installation explicit. The repository root makes backend namespace/package directories importable, including directories without `__init__.py`.

Root package boundaries:

- `package.json` pins pnpm as a tool, with no application dependencies. The removed npm `uv@1.4.0` is a UTF-8 validation library, unrelated to Astral uv. Astral uv is installed separately.
- pnpm 12 can record its own executable/platform binaries in `packageManagerDependencies` tool metadata in the root lockfile. This is distinct from application dependencies.
- Workspace `packages: [frontend]` selects the active frontend only. `sharedWorkspaceLockfile: false` preserves the existing frontend lockfile. A root frozen install installs the selected projects.
- `verifyDepsBeforeRun: false` prevents server launch from triggering competing automatic installs. Bootstrap explicitly, and reinstall after manifest changes.
- An untracked root `package-lock.json` existed before this task and was left intact. It is not authoritative for this project; do not use `npm install` for project dependencies.
- `_legacy_reference/` is absent. An independent `AMES-SYSTEM-LEGACY/` directory became available during the audit; its backend/frontend manifests and Vite config were read without modification. It uses Node 24/pnpm 10.30.0, Express/MySQL and a different frontend toolchain. It is excluded from this pnpm workspace. Its migrations/settings are not the active PostgreSQL setup.
- Existing ignore rules exclude `.env`, environments, node_modules, generated exports, spreadsheets and ML binaries. A fresh clone does not provide private spreadsheet templates or local secrets.

### B. Backend dependency chains and exact version constraints

The frozen requirements list includes both directly used packages and transitives, without distinguishing dependency intent. All 60 pins were preserved, including the user's pre-existing removal of optional `httptools`. Uvicorn can use h11; Windows does not require uvloop. This workflow does not request `uvicorn[standard]` extras.

These chains were checked against installed package metadata. Optional docs/test/provider extras are not automatically installed. The database row describes the application/dialect chain, rather than claiming SQLAlchemy always installs a PostgreSQL driver.

| Role | Dependency chain with installed versions |
| --- | --- |
| HTTP API | `fastapi 0.141.1` -> `starlette 1.6.0`, `pydantic 2.13.5`, `typing-extensions 4.16.0`, `typing-inspection 0.4.4`, `annotated-doc 0.0.5` |
| ASGI concurrency | `starlette` -> `anyio 4.15.1` -> `idna 3.20`, `typing-extensions` on Python 3.12 |
| Validation | `pydantic` -> **`pydantic-core 2.46.5` exactly**, `annotated-types 0.8.0`, typing packages |
| Settings | `pydantic-settings 2.15.0` -> `pydantic`, `python-dotenv 1.2.3`, `typing-inspection` |
| Server/reload | `uvicorn 0.53.0` -> `click 8.5.0`, `h11 0.16.0`; explicitly pinned `watchfiles 1.2.0` -> `anyio` |
| Database | app -> `sqlalchemy 2.0.54` -> PostgreSQL dialect driver `psycopg2-binary 2.9.13` -> external PostgreSQL; SQLAlchemy also requires `greenlet 3.5.6` on this architecture and `typing-extensions` |
| Password/JWT | app directly imports `bcrypt 5.0.0`; `python-jose 3.5.0` -> `ecdsa 0.19.2` -> `six 1.17.0`, `rsa 4.9.1` -> `pyasn1 0.6.4` |
| Encryption | `cryptography 50.0.1` -> `cffi 2.1.1` -> `pycparser 3.0` on CPython |
| Email | `fastapi-mail 1.6.8` -> `aiosmtplib 5.1.3`, `blinker 1.9.0`, cryptography, `email-validator 2.3.0`, `httpx 0.28.1`, `jinja2 3.1.6`, pydantic/settings, `regex 2026.9.10`, starlette, typing-extensions |
| Email/templates | `email-validator` -> `dnspython 2.8.0`, idna; `jinja2` -> `markupsafe 3.0.3` |
| HTTP client | `httpx` -> anyio, `certifi 2026.7.22`, `httpcore 1.0.9`, idna; httpcore -> certifi/h11 |
| Excel/tabular data | `openpyxl 3.1.5` -> `et-xmlfile 2.0.0`; `pandas 3.0.6` -> `numpy 2.5.3`, `python-dateutil 2.9.0.post0` -> six, plus `tzdata 2026.4` on Windows |
| ML packages | `scikit-learn 1.9.1` -> numpy, `scipy 1.18.1` -> numpy, `joblib 1.6.0` -> `cloudpickle 3.1.2`, `narwhals 2.26.0`, `threadpoolctl 3.7.0` |
| Socket transport packages | `python-socketio 5.17.0` -> `bidict 0.24.1`, `python-engineio 4.14.0` -> `simple-websocket 1.1.0` -> `wsproto 1.3.2` -> h11 |
| Remaining explicit pins | `passlib 1.7.4`, `python-multipart 0.0.32`, `pyyaml 6.0.3`, `websockets 17.1` |

Important compatibility intersections: FastAPI-Mail requires cryptography `>=50,<51` and Starlette `>=1,<2`; the pins satisfy both. SciPy requires NumPy `>=2.0,<2.8`; NumPy 2.5.3 also satisfies the pinned pandas/scikit-learn requirements. Keep Pydantic aligned with its exact compiled-core version.

Installed Socket.IO packages do not establish that an ASGI Socket.IO service is mounted. No `backend/ml/` implementation directory was found: ML libraries are installed, while retained domain context describes the ML goals. Infrastructure installation does not prove every business feature exists.

Inspect the complete live tree and all exact pins from root:

```text
uv pip list --python .venv
uv pip tree --python .venv
uv pip check --python .venv
```

`backend/requirements.txt` remains the version authority; do not freeze an unrelated interpreter over it. Version pins are not a hash-locked, platform-universal artifact: platform markers and wheel availability still apply. Python 3.12 Windows x64 was tested; other architectures require the same installation/import checks.

### C. Frontend dependency tree and configuration

| Package | Manifest range | Exact frontend lockfile version |
| --- | --- | --- |
| @emotion/react | ^11.14.0 | 11.14.0 |
| @emotion/styled | ^11.14.1 | 11.14.1 |
| @mui/icons-material | ^9.4.0 | 9.4.0 |
| @mui/material | ^9.4.0 | 9.4.0 |
| axios | ^1.20.0 | 1.20.0 |
| react | ^19.2.8 | 19.3.0 |
| react-dom | ^19.2.8 | 19.3.0 |
| react-router-dom | ^7.18.4 | 7.18.4 |
| recharts | ^3.10.1 | 3.10.1 |
| socket.io-client | ^4.8.3 | 4.8.3 |
| @eslint/js (dev) | ^10.0.1 | 10.0.1 |
| @types/node (dev) | ^24.13.3 | 24.13.5 |
| @types/react (dev) | ^19.2.18 | 19.3.0 |
| @types/react-dom (dev) | ^19.2.7 | 19.3.0 |
| @vitejs/plugin-react (dev) | ^6.1.1 | 6.1.1 |
| eslint (dev) | ^10.10.0 | 10.10.0 |
| eslint-plugin-react-hooks (dev) | ^7.1.1 | 7.1.1 |
| eslint-plugin-react-refresh (dev) | ^0.5.6 | 0.5.7 |
| globals (dev) | ^17.12.0 | 17.12.0 |
| typescript (dev) | ~6.0.2 | 6.0.3 |
| typescript-eslint (dev) | ^8.69.0 | 8.70.0 |
| vite (dev) | ^8.3.0 | 8.3.0 |

There are 10 application and 12 development dependencies. The frozen frontend installation retained the existing lockfile unchanged. React DOM depends on React; MUI/icons depend on MUI/React peers and the Emotion styling engine; Recharts uses charting/state dependencies and React peers; Socket.IO client uses Engine.IO/client parsers. Vite 8 uses Rolldown and an OS/architecture-specific native binding; plugin-react has a Vite peer; typescript-eslint links its parser/plugin and TypeScript/ESLint peers.

Exact transitive versions, optional native bindings and peer-qualified snapshots live in `frontend/pnpm-lock.yaml`. Inspect with `pnpm --dir frontend list --depth Infinity` and `pnpm --dir frontend why <package>`. Do not suppress all optional dependencies: Vite's matching platform binding must be installed.

- `frontend/package.json` is ESM (`type: module`). Scripts: `dev` = vite; `build` = **tsc -b && vite build**; `lint` = eslint .; `preview` = vite preview.
- `vite.config.ts` enables `@vitejs/plugin-react`, with no API proxy, custom port, or backend dotenv loader.
- `tsconfig.json` has empty `files` and references application/tooling projects. Run the required `pnpm tsc --noEmit`, **and** `pnpm exec tsc -b`; the root-only command does not fully check referenced projects.
- Application TS config uses ES2023, bundler resolution, React JSX, noEmit and unused-variable/parameter checks. Tooling config checks vite.config.ts and includes Node types. Compiler settings and application types were not edited.
- Axios and the chat component read `VITE_API_URL`, falling back to `http://localhost:8000`. Use the backend origin **without `/api` appended**.
- Vite reads frontend environment files; root `.env` does not configure Vite. VITE variables are public browser/build values. Backend secrets must remain backend-only.

### D. Fresh-checkout bootstrap, in order

#### D1. Install tools and external services once

Install Node.js 24.x from the [official Node.js downloads](https://nodejs.org/en/download). Install/start PostgreSQL 16+ from the [official PostgreSQL downloads](https://www.postgresql.org/download/). Retain the actual credentials chosen during PostgreSQL installation. Put its bin directory on PATH to use the client commands below. OS permissions/network access are prerequisites for tool installation.

Windows PowerShell, if uv is absent:

```powershell
winget install --exact --id astral-sh.uv
```

For the exact audited uv version, the alternative official installer is:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/0.13.0/install.ps1 | iex"
```

That alternative scopes policy to the installer process; routine development needs no policy change. Reopen the terminal to refresh PATH. If pnpm is absent, install only the pinned tool using Node's npm executable:

```powershell
npm.cmd install --global pnpm@12.11.2
node --version
pnpm.cmd --version
uv --version
Get-Command node,pnpm.cmd,uv
```

This npm command installs the tool only; all project dependencies use pnpm. An npm-free alternative is the matching standalone binary from [official pnpm installation options](https://pnpm.io/installation). Do not install pnpm as an application dependency.

macOS/Linux, with Node.js 24 and PostgreSQL installed:

```bash
curl -LsSf https://astral.sh/uv/0.13.0/install.sh | sh
# Reopen the terminal to load the uv PATH changes.
npm install --global pnpm@12.11.2
node --version
pnpm --version
uv --version
command -v node pnpm uv
```

Expected pnpm version: 12.11.2. Audited uv: 0.13.0. Repeat verification when upgrading tools/runtimes.

#### D2. Create the repository-local Python 3.12 environment

Windows PowerShell, from a fresh checkout:

```powershell
Set-Location -LiteralPath 'C:\Users\Administrator\Desktop\ECCD-Management-Student-information-WITH-ML-'
uv python install 3.12
uv venv --python 3.12 .venv
uv pip sync --python .venv backend/requirements.txt
uv pip check --python .venv
uv run --no-project --python 3.12 python -c "import sys; assert sys.version_info[:2] == (3, 12); print(sys.version); print(sys.executable)"
```

macOS/Linux, substitute the actual checkout location:

```bash
cd '/absolute/path/to/ECCD-Management-Student-information-WITH-ML-'
uv python install 3.12
uv venv --python 3.12 .venv
uv pip sync --python .venv backend/requirements.txt
uv pip check --python .venv
uv run --no-project --python 3.12 python -c "import sys; assert sys.version_info[:2] == (3, 12); print(sys.version); print(sys.executable)"
```

The printed executable must be under root `.venv`: Scripts/python.exe on Windows, bin/python on POSIX. uv accepts the environment directory in `--python .venv`, making install commands portable. **uv pip sync uses a positional requirements file, without -r**; it installs the frozen set and may remove extras from that dedicated environment. An additive alternative is `uv pip install --python .venv -r backend/requirements.txt`.

For an existing checkout, inspect .venv/pyvenv.cfg/interpreter and skip venv creation if already correct. Do not delete an environment or clear caches blindly. Stop when any command fails and fix the cause before proceeding. PowerShell sequences do not automatically stop on every native-command failure; check `$LASTEXITCODE` when scripting these steps.

#### D3. Install JavaScript dependencies with pnpm

From root, Windows:

```powershell
pnpm.cmd install --frozen-lockfile
```

From root, POSIX:

```bash
pnpm install --frozen-lockfile
```

The root workspace includes frontend, retaining separate lockfiles. Include dev dependencies: Vite/TypeScript are dev dependencies. A production-only install cannot run dev/build. First bootstrap requires registry access; offline mode only works after archives and pnpm verification metadata have been cached.

#### D4. Create local environment files and replace placeholders

Windows, from root; do not overwrite existing local settings:

```powershell
if (-not (Test-Path -LiteralPath 'backend/.env')) {
    Copy-Item -LiteralPath 'backend/.env.example' -Destination 'backend/.env'
}
if (-not (Test-Path -LiteralPath 'frontend/.env.local')) {
    Copy-Item -LiteralPath 'frontend/.env.example' -Destination 'frontend/.env.local'
}
```

POSIX, from root:

```bash
if [ ! -f backend/.env ]; then cp backend/.env.example backend/.env; fi
if [ ! -f frontend/.env.local ]; then cp frontend/.env.example frontend/.env.local; fi
```

Generate local secrets once by replacing **only exact template placeholders**. This command neither prints secrets nor rotates existing values:

```text
uv run --no-project --python 3.12 python -c "from pathlib import Path; import secrets; from cryptography.fernet import Fernet; p = Path('backend/.env'); s = p.read_text(encoding='utf-8'); s = s.replace('your_secure_random_secret_key_here', secrets.token_hex(32)).replace('replace_with_generated_fernet_key', Fernet.generate_key().decode()).replace('replace_with_generated_32_hex_characters', secrets.token_hex(16)); p.write_text(s, encoding='utf-8')"
```

Then edit backend/.env with actual PostgreSQL credentials and SMTP settings. Windows can use `notepad.exe backend\.env`. Edit frontend/.env.local if changing the API origin. Preserve existing secrets, especially the backup key required to decrypt historical exports.

| Variable | Actual requirement/behavior |
| --- | --- |
| DATABASE_URL | Required. Template: `postgresql+psycopg2://postgres:your_password_here@localhost:5432/ames_db`. Replace credentials; percent-encode reserved characters in URI username/password components. |
| SECRET_KEY | Required JWT secret; placeholder replacement supplies 32 random bytes as 64 hex characters. |
| ALGORITHM | Code/template use HS256. |
| ACCESS_TOKEN_EXPIRE_MINUTES | Code default **30**; template explicitly sets **60**. |
| BACKUP_ENCRYPTION_KEY | Required; actual backup implementation needs a **44-character URL-safe base64 Fernet key** generated by Fernet.generate_key(). |
| BACKUP_IV | Required by current Settings, but unused by the current Fernet backup code; replacement supplies 16 random bytes as 32 hex characters. |
| MAIL_USERNAME / MAIL_PASSWORD | Actual SMTP credentials for sending mail. Existing loader removes whitespace from MAIL_PASSWORD. |
| MAIL_SERVER / MAIL_PORT / MAIL_FROM | SMTP host, numeric port, sender; template uses smtp.gmail.com/587 and a placeholder sender. |
| MAIL_STARTTLS / MAIL_SSL_TLS | Template True/False; match actual provider transport requirements. Loader accepts common true values case-insensitively. |
| VITE_API_URL | Public frontend API/socket origin; defaults to http://localhost:8000, with no /api suffix. Restart Vite after changes. |

Settings computes the absolute backend/.env path from backend/config/settings.py. Root .env.example is a duplicate template, not an independently loaded file. Existing process environment values take precedence. Prefer frontend/.env.local for local overrides; keep it consistent with frontend/.env if both exist. Never put backend secrets in VITE variables.

**Backup correction:** backend/routes/backup.py uses Fernet rather than AES-CBC/raw key plus IV. It replaces a non-44-character environment key with a process-local generated key, so using the old placeholder could make exports undecryptable after restart. Both templates now describe the actual format. The backend launch script loads dotenv into the process environment before app import, covering both Pydantic and os.environ consumers. No encryption business logic was modified.

#### D5. Prepare PostgreSQL before a real backend launch

Provision an empty development database using the account in DATABASE_URL. These commands use the template's postgres/ames_db names and prompt for your actual password; adapt host/account/port to your installation:

```text
pg_isready -h localhost -p 5432
createdb -h localhost -p 5432 -U postgres -W ames_db
psql -h localhost -p 5432 -U postgres -W -d ames_db -c "SELECT current_database(), current_user;"
```

Skip createdb if the intended database exists. No database provisioning, schema change, data import, restore or seed was executed by this infrastructure audit.

Existing **Base.metadata.create_all(bind=engine) executes during import of backend.main**. Real startup therefore needs a reachable PostgreSQL database and table-creation permissions for an empty dev database. Existing startup may create tables; it does not create the database, migrate existing columns, or seed accounts/questions. No migrated account/seed command was found; authorized baseline data is a separate prerequisite for interactive business workflows.

After configuring your own environment, check connectivity without writing data:

```text
uv run --no-project --python 3.12 python -c "from backend.config.database import engine; from sqlalchemy import text; c = engine.connect(); print(c.execute(text('SELECT 1')).scalar()); c.close()"
```

Expected output is 1. This imports the database configuration, not backend.main, so it does not invoke startup create_all.

### E. Exact launch scripts and execution flow

Root scripts:

```json
{
  "backend": "uv run --no-project --python 3.12 python -m uvicorn backend.main:app --reload --env-file backend/.env",
  "frontend": "pnpm --dir frontend dev",
  "dev": "pnpm run \"/^(backend|frontend)$/\""
}
```

Backend flow: root working directory -> uv local Python 3.12 environment -> python imports that environment's Uvicorn -> dotenv loaded before app import -> backend.main imports existing layers -> PostgreSQL startup create_all -> HTTP service/reload. Keeping root as the working directory also preserves current workbook paths such as backend/assets/templates/....

Frontend flow: root script -> pnpm --dir frontend -> local Vite binary, frontend manifest/config/index.html/env -> browser requests -> VITE_API_URL -> Uvicorn. The directory option avoids a cd/shell-operator chain; there is no Vite API proxy.

Combined flow: root dev -> anchored regex selecting exactly backend/frontend -> concurrent scripts under pnpm 12.11.2. It does not select root dev or recurse into frontend dev directly; the frontend wrapper invokes it normally. Watch both outputs. A Uvicorn reload supervisor can remain alive after a child import failure, so a running process alone is not an API readiness check.

Windows PowerShell, from root after bootstrap/environment/database setup:

```powershell
# Both servers in one terminal:
pnpm.cmd run dev
```

Or independently, using two root terminals:

```powershell
# Terminal A:
pnpm.cmd run backend
```

```powershell
# Terminal B:
pnpm.cmd run frontend
```

Direct commands, also from root:

```powershell
uv run --no-project --python 3.12 python -m uvicorn backend.main:app --reload --env-file backend/.env
```

```powershell
pnpm.cmd --dir frontend dev
```

macOS/Linux uses the same commands with pnpm instead of pnpm.cmd:

```bash
pnpm run dev
# Or in separate root terminals:
# pnpm run backend
# pnpm run frontend
```

Ctrl+C stops the development session. Avoid multiple reload supervisors/Vite processes on the same ports. Extra arguments to combined dev are forwarded to both scripts; set server-specific flags with the individual scripts instead.

**Windows execution policy:** invoke pnpm.cmd rather than pnpm.ps1. Package scripts use normal package-script shells/native uv; no Activate.ps1, source, Bash-only environment assignment or machine-wide policy change is required. This host's LocalMachine policy is Restricted, and .cmd checks passed. Organization-enforced application controls/permissions remain external constraints.

The agent sandbox initially denied user-cache access for uv/pnpm; checks passed after approved cache access. This was a filesystem permission issue, not a dependency or execution-policy defect. Use permitted cache/store locations or approved access in constrained environments; changing machine policy does not fix filesystem access.

| Service | Default URL | Notes |
| --- | --- | --- |
| Vite UI | http://localhost:5173 | May select another port if busy; read startup output |
| API root | http://127.0.0.1:8000/ | Existing welcome response |
| API docs/schema | http://127.0.0.1:8000/docs and /openapi.json | Require successful backend import/startup |
| Vite preview | http://localhost:4173 | Build preview only; backend remains separate |

Predictable frontend port: `pnpm.cmd run frontend --host 127.0.0.1 --port 5173 --strictPort`. Alternate backend port: `pnpm.cmd run backend --port 8001`, then change VITE_API_URL to http://localhost:8001 and restart Vite. For a LAN phone, bind both servers to 0.0.0.0 and configure the development computer's actual reachable address: localhost on a phone means the phone. Network/firewall access must permit the ports.

### F. Verification results and remaining prerequisites

| Check | Observed result |
| --- | --- |
| Existing local backend environment | Python 3.12.15; uv pip check reported all 60 packages compatible |
| Fresh Python installation | Separate ignored node_modules/.infra-check/python312 created with uv/Python 3.12; all 60 requirements resolved/installed and uv pip check passed; working .venv unchanged; temporary audit environment removed afterward |
| pnpm frozen install | Succeeded from root; frontend lockfile unchanged; registry-metadata policy verification passed |
| TypeScript | pnpm --dir frontend tsc --noEmit and pnpm --dir frontend exec tsc -b passed after installation |
| Frontend build | tsc -b and Vite 8.3.0 production build passed |
| Combined root dispatch | pnpm.cmd run dev --help displayed Uvicorn/Vite help concurrently, exit 0 with approved cache access |
| Live frontend | Root frontend script started Vite in 385 ms; GET / and /src/main.tsx returned HTTP 200 on 127.0.0.1:5173; temporary server stopped afterward |
| Backend syntax/imports | All 48 backend Python files parsed; 16 runtime/native modules imported, including psycopg2/cryptography/pandas/NumPy/SciPy/scikit-learn |
| Isolated backend HTTP | App imports/OpenAPI generation succeeded; GET / and /openapi.json returned HTTP 200 with temporary process settings and mocked startup create_all; no database contacted |
| Real PostgreSQL-backed backend startup | **Not verified**: backend/.env, local PostgreSQL listener/service and configured credentials were absent |
| OS execution coverage | Windows x64; POSIX instructions are documented equivalents, not claimed as locally executed |

Nonfatal warnings: the frontend build reported a roughly 1.27 MB main JavaScript bundle before gzip; the isolated backend TestClient check reported Starlette's deprecation of its httpx adapter. Both passed; no app changes or dependency upgrades were made to suppress warnings.

**Readiness boundary:** installs, dependency consistency, module resolution, TypeScript, frontend build, live frontend and launch dispatch were verified. A completely healthy concurrent session still requires actual backend settings and PostgreSQL. SMTP, populated database contents, exports, authenticated flows and Socket.IO behavior were not validated. Error-free operation cannot be guaranteed across absent private assets/services or untested platforms.

Additional prerequisites:

- Export code requires `backend/assets/templates/EasyCD-Checklist-2024-V3.-violet-FEMALE-2024-2025-.xlsx`; that workbook is absent and spreadsheets are ignored. Obtain the authorized existing template before exercising the export.
- No migrated administrator/seed command was found. A server starting does not prove that accounts, sections, questions or historical records exist.
- The legacy repositories and application source were left unchanged; unrelated pre-existing edits/files were preserved.

After supplying your local settings, run from root:

```powershell
uv pip check --python .venv
pnpm.cmd --dir frontend tsc --noEmit
pnpm.cmd --dir frontend exec tsc -b
pnpm.cmd --dir frontend build
pnpm.cmd run dev --help
# With backend/.env and PostgreSQL ready:
pnpm.cmd run dev
```

In another terminal while the real servers are running:

```powershell
(Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 10).StatusCode
(Invoke-WebRequest -Uri 'http://127.0.0.1:8000/' -UseBasicParsing -TimeoutSec 10).StatusCode
(Invoke-WebRequest -Uri 'http://127.0.0.1:8000/openapi.json' -UseBasicParsing -TimeoutSec 10).StatusCode
```

POSIX equivalents:

```bash
curl --fail --max-time 10 http://localhost:5173/
curl --fail --max-time 10 http://127.0.0.1:8000/
curl --fail --max-time 10 http://127.0.0.1:8000/openapi.json
```

### G. Failure-to-remedy map

| Symptom | Inspect | Infrastructure remedy |
| --- | --- | --- |
| pnpm.ps1 blocked | PowerShell script policy | Use pnpm.cmd; activation/policy changes are unnecessary |
| uv not recognized | Astral uv missing/stale PATH | Install official executable and reopen terminal |
| No module named uvicorn | Wrong/incomplete environment | Check printed interpreter; sync requirements into root .venv |
| No module named backend | Wrong working directory | Launch from root with backend.main:app |
| Missing env/Pydantic fields | Missing/incomplete backend/.env | Copy canonical template only when absent; configure required values |
| Database refused/auth failed | Service, database, URI/credentials | Verify pg_isready and SELECT 1; package installation cannot start a database |
| Existing DB missing columns | create_all is not a migration system | Obtain approved migration procedure; do not invent schema changes |
| Backup key/restore error | Wrong format/lost or changed key | Preserve original valid 44-character Fernet key; do not rotate to fix startup |
| vite/tsc missing | Frontend deps absent/dev deps omitted | Root pnpm install --frozen-lockfile, including dev dependencies |
| Frozen lockfile mismatch | Manifest versus corresponding lockfile | Review intended dependency edits; regenerate deliberately with pinned pnpm |
| Native Rolldown binding absent | Incomplete install/optional deps excluded | Install for actual platform and retain matching optional bindings |
| Cache Access denied | Sandbox/directory permissions | Approved cache/store access; execution policy is unrelated |
| Offline metadata miss | Fresh cache lacks archives/policy metadata | Bootstrap with network access; do not bypass checks to claim a pass |
| Vite ready, API unavailable | Backend worker/configuration/service | Check worker output and /openapi.json separately |
| Wrong API destination | VITE_API_URL or stale Vite env | Configure origin in frontend/.env.local, restart Vite |
| Workbook FileNotFoundError | Missing private template | Obtain existing template at the existing path |

CLI references: [uv installation](https://docs.astral.sh/uv/getting-started/installation/), [uv environment selection](https://docs.astral.sh/uv/pip/environments/), [uv commands](https://docs.astral.sh/uv/reference/cli/), [pnpm installation](https://pnpm.io/installation), and [pnpm concurrent script selection](https://pnpm.io/cli/run). Exact package versions and application loader behavior were derived from this checkout.

---

The existing domain context follows. Keep its business requirements intact; use the audited infrastructure setup above for local configuration and execution.

## 1. Project Overview & Objectives

The AMES System is a comprehensive School Management and Early Childhood Care and Development (ECCD) Assessment platform. The primary objective is to allow educators (Teachers) to manage student records, conduct and track ECCD evaluations (PRE, MID, POST periods), and maintain open, real-time communication with Parents. Parents are provided with dedicated access to view their children's profiles, monitor their progress, and message teachers directly. The system is now integrated with a machine learning pipeline to perform predictive analytics on student performance and early risk detection without altering the core DepEd-compliant scoring workflows.

## 2. Tech Stack

### Frontend (Client-Side)

* **Core:** React (v19.2), Vite (Build Tool), TypeScript (ES modules)
* **UI Framework:** Material UI (`@mui/material`), `@emotion/styled`, `@emotion/react`

* **Routing:** React Router DOM (`react-router-dom` v7)


* **State/Data Fetching:** Axios for typed REST API calls


* **Real-Time:** Socket.io-client for live messaging


* **Charting/Visuals:** Recharts (`recharts`)


* **Linting:** ESLint with React Hooks/Refresh plugins (configured for strict TypeScript)



### Backend (Server-Side)

* **Core:** Python 3.12 in a root-local uv-managed virtual environment, FastAPI framework
* **Database Connection:** SQLAlchemy 2.0 ORM, psycopg2-binary
* **Authentication/Security:** JSON Web Tokens (`python-jose`), Bcrypt (`passlib`), CORS middleware


* **Validation:** Pydantic v2 for payload validation and serialization
* **Real-Time:** FastAPI WebSockets (matching the client-side Socket.io/WS implementation)


* **File Management:** FastAPI `UploadFile` (for file/profile uploads)


* **Email/Notifications:** `fastapi-mail` or smtplib (used for OTP and email verification)


* **Development Tooling:** `uv` (dependency management), Uvicorn, Dotenv (`python-dotenv`)



### Database

* **Engine:** PostgreSQL (v16+)
* **Architecture:** Relational database with strictly defined foreign keys, composite unique indexes, and cascading deletions.



### Machine Learning & Analytics Pipeline

* **Core Libraries:** `scikit-learn`, `numpy`, `pandas`, `joblib`
* **Architecture:** Decoupled ML inference modules residing in `backend/ml/` for evaluating developmental delay risks based on ECCD domain scores and dynamic decimal age.

## 3. System Architecture & Data Flow

The application follows a standard Client-Server architecture utilizing a RESTful API with WebSockets for real-time features.

1. **Frontend to Backend (REST):** The React client uses Axios to hit FastAPI endpoints located in the backend's `routes/` directory for standard CRUD operations (e.g., updating student records, submitting ECCD evaluations).


2. **Real-Time Communication (WebSockets):** WebSocket endpoints establish persistent connections between the frontend and backend to facilitate instant message delivery between Parents and Teachers.


3. **Authentication Flow:** Users authenticate via email/username and password (hashed with bcrypt). The server issues a JWT, which the client stores and sends via headers for protected routes. Roles (`super-admin`, `admin`, `user`) dictate authorization levels.


4. **File Handling:** Uploads (like profile pictures or documents) are processed by FastAPI endpoints and saved locally in the `uploads/` directory.


5. **Machine Learning Flow:** Assessment data is extracted, formatted into feature arrays, and evaluated by pre-trained models. Inference results are returned via non-blocking API endpoints and do not overwrite standard DepEd records.

## 4. Database Schema & Core Entities

*(Business logic sourced directly from the legacy architecture, adapted for SQLAlchemy)*

* **`users`**: The central authentication table. Stores `username`, `password_hash`, `email`, and `role` (`super-admin`, `admin`, `user`).


* **`teachers`**: The educator entity, tied to `users` via `user_id`. Manages `employee_id`, `class_name`, and toggles for parent interaction permissions (`allow_parent_view`, `allow_parent_edit`, and `allow_parent_home_based_edit`).


* **`parents`**: The guardian entity, tied to `users` via `user_id`. Stores personal demographic information (occupation, educational attainment). It also legacy-stores `relationship_type` directly, though this is primarily handled by the junction table.


* **`students`**: The core subject entity. Uniquely identified by `lrn_number` (Primary Key). Contains exhaustive demographic data (name, DOB, gender, address, handedness, siblings), and `school_year` tracking (automatically assigned strictly server-side upon creation by querying the active `current_school_year` from the global `system_settings` table). Supports both individual and mass archiving workflows (toggling `is_active` flag).


* **`family_access`**: A junction table that links `parents` to `students` (via `student_lrn`) establishing the `relationship_type` (Mother, Father, Guardian). This allows multiple guardians to access a single student's records. Note: The backend may occasionally query the redundant `relationship_type` column on the `parents` table.


* **`eccd_domains` & `eccd_questions**`: Look-up tables establishing the 7 domains of development and the specific assessment questions linked to those domains, ordered by `sequence_order`. Includes an `is_home_based` boolean flag to designate questions suitable for parent evaluations.


* **`student_eccd_evaluations`**: The transactional table for assessment results. Links `student_lrn`, `teacher_id`, and `question_id`. It records the `testing_period` (PRE, MID, POST), the boolean `answer` (KAYA, DI-KAYA), and the `evaluation_date`. Features a unique composite key (`student_lrn`, `question_id`, `testing_period`) to prevent duplicate entries per period.


* **`messages`**: Facilitates the inbox system. Links `parent_id` and `teacher_id`, tracking the `sender_role`, `subject`, message body, and read receipts (`is_read`). Message threads are strictly filtered by `messages.is_archived = 0` to prevent displaying old conversations after a system rollover.


* **`system_logs`**: An audit trail tracking user actions (`action_type`, `details`, `timestamp`) mapped to a `user_id`.


* **`email_verifications`**: Stores temporary OTPs and expiration times for the email validation process.


* **`system_settings`**: Global configuration table storing both dynamic UI branding (`system_title`, `primary_color`, `secondary_color`, `logo_url`, `profile_pic_url`) and school year rollover metadata (`current_school_year`, `previous_school_year`, `last_rollover_timestamp`).

* **`section_teachers`**: Normalized junction table linking `sections` to `teachers`.
  - Columns: `id`, `section_id`, `teacher_id`, `role` (`Primary Adviser` | `Substitute`), `status` (`Active` | `Inactive`), `assigned_date`.
  - Relational mapping allows multi-tenancy per section over academic cycles without overwriting historic data.
  - Legacy roles like `'OJT'` are strictly deprecated in favor of `'Primary Adviser'` and `'Substitute'`.

* **`teachers.allow_eccd_question_management`**: Boolean column (`default = False`) on `teachers` representing granular RBAC permissions toggled exclusively by the Chairman (`super-admin`), delegating permission to manage ECCD domains and checklist questions to specific teachers (`admin`).


### Normalized Section-Teacher & Substitution Architecture

To facilitate mid-year teacher resignations, leaves of absence, and dynamic class restructuring without loss of assessment history:

1. **Substitution & Swap Logic (`POST /api/chairman/sections/{section_id}/assign-teacher`):**
   - When the Chairman assigns a new `Primary Adviser`, the system automatically marks existing active adviser records in `section_teachers` for that section as `'Inactive'`.
   - If assigning a `Substitute`, the substitute teacher receives active access to the section roster, messaging inbox, and analytics while preserving the prior adviser's record.
   - All student rosters and assessment records remain 100% intact within `students` and `student_eccd_evaluations`.

2. **Bulk "Transfer Students" Tool (`PUT /api/chairman/students/transfer`):**
   - Allows the Chairman to dissolve a section or rebalance classrooms by selecting multiple students and reassigning them to a target `new_section_id`.
   - **Evaluation Preservation Guarantee:** Since all ECCD assessment answers in `student_eccd_evaluations` are linked by `student_lrn`, updating `students.section_id` preserves 100% of historical PRE, MID, and POST evaluation entries, timestamps, and DepEd scaled/standard scores.
   - Automatically writes an audit entry to `system_logs`.

3. **Granular Teacher RBAC for ECCD Question Management:**
   - **Backend Guard (`verify_eccd_question_access`):** Guards all ECCD checklist modifications (`POST`, `PUT`, `DELETE` routes on `/api/eccd/questions*` and `/api/eccd/domains*`). Allows `super-admin`/`chairman` unconditionally, and allows `admin`/`teacher` only when `allow_eccd_question_management == True`.
   - **Chairman Delegation Tool:** In the Chairman's Teacher Management UI (`TeacherManagement.tsx`), clicking "Manage Access" exposes a switch for "Enable ECCD Question Management", sending `PUT /api/chairman/teachers/{teacher_id}/permissions`.
   - **Teacher UI Adaptation:** `MainLayout.tsx` conditionally reveals "ECCD Questions" in the sidebar, and `ProtectedRoute.tsx` guards `/teacher/eccd-questions` via `requiredPermission="allow_eccd_question_management"`, redirecting unauthorized users to `/teacher/dashboard`.

4. **Parent Dashboard Analytics & Grade 1 Readiness Logic (`GET /api/eccd/parent/dashboard-stats/{student_lrn}`):**
   - **Testing Period Isolation:** Detects the student's latest evaluated testing period in strict priority order (`POST` > `MID` > `PRE`). Computes stats exclusively within that latest phase, never aggregating answer counts across multiple periods.
   - **Excels In / Needs Support In:** Identifies the domain with highest KAYA count and lowest KAYA / highest DI-KAYA count with deterministic alphabetical tie-breaking (`domain_name ASC`).
   - **Assessment Mastery Milestone:** If `latestPhase == 'POST'`, `totalDiKaya == 0`, and evaluations exist, `assessmentMastered: True` is emitted. (Mastery is strictly an end-of-year milestone; zero DI-KAYA in PRE/MID does not trigger mastery).
   - **Dynamic Frontend Card:** On `Dashboard.tsx`, Card 2 dynamically renders "Assessment Complete / All Skills Mastered / Ready for Grade 1" with checkmark icon on soft green (`#f0fdf4`, border `#bbf7d0`) when mastered, or "Needs Support In / {domain} / Priority for improvement" on soft orange (`#ffedd5`) when further practice is needed.



## 5. Development Rules & Conventions

* **Component Design:** Utilize Material UI for all new components to maintain design consistency. Ensure accessibility standards are met (high contrast, legible text) as the end-users include older educators and parents.


* **State Management:** Keep local state within React components using hooks (`useState`, `useEffect`). For complex forms (like the 119-item ECCD Checklist), manage state efficiently to prevent excessive re-renders when toggling "KAYA/DI-KAYA" buttons.


* **API Integration:** All backend routes must be consumed via Axios with strictly defined TypeScript generic interfaces. Ensure appropriate error handling (try/catch blocks) and UI feedback (loading spinners, error snackbars) for all network requests.


* **Real-Time Consistency:** Any updates to the messaging UI should instantly reflect WebSocket events without requiring a hard page refresh.


* **Security:** Never expose JWT tokens or password hashes in the frontend. Ensure all sensitive backend routes utilize authentication dependencies to verify JWT validity and user roles.


* **Strong Password Policy:** All user passwords (e.g., Chairman, Teacher) must be validated strictly on both the frontend (using dynamic visual checklists via `PasswordValidator`) and the backend via Pydantic validators (returning a `400 Bad Request` error upon failure). Passwords must evaluate to `true` against the following criteria: minimum 8 characters (`length >= 8`), at least one uppercase letter (`/[A-Z]/`), at least one lowercase letter (`/[a-z]/`), and at least one number (`/[0-9]/`).


* **SQL Integrity:** When writing backend queries, respect the existing cascading deletes and foreign key constraints. Never bypass the `user_id` linkage between the `users` table and the respective `teachers`/`parents` tables.


* **Dynamic Age Calculation:** Never rely on a static `age` column. Always calculate the student's age dynamically on-the-fly. The decimal age is calculated by dividing the months elapsed between birthdate and the target date by 12, adding it to the elapsed years, and rounding to one decimal place (e.g., 4.8). For general profiles, calculate this relative to the current date. For ECCD records, calculate this relative to the specific assessment completion date (`evaluation_date`). Always return this as `decimal_age` from APIs.



## 6. ECCD Scoring Architecture

* **Lookup Tables:** The official ECCD scoring matrices (mapping raw scores to scaled scores based on exact decimal age brackets like 3.1-4.0, 4.1-5.0, 5.1-5.11) are extracted into `backend/eccd_scoring_data.json`.


* **Scoring Utility (`backend/utils/eccd_scorer.py`):** A dedicated Python service intercepts the raw student evaluations (`KAYA` counts per domain) and the student's dynamic decimal age at the time of evaluation. It derives the domain-specific Scaled Scores, Sum of Scaled Scores, Standard Score, and final Interpretation (e.g., "Delay", "Average Development").


* **Home-Based Assessment Flow:** The system supports Parents conducting specific at-home evaluations. Certain `eccd_questions` are flagged with `is_home_based = true`. Teachers grant access via the `allow_parent_home_based_edit` toggle in their settings. The frontend (`ParentEccdAssessment.tsx`) and backend dynamically serve and record these specific questions for Parent-users separately from the comprehensive Teacher evaluation.


* **File Export Integration:** During the generation of the ECCD Excel file by teachers, the scoring utility computes the exact historical scores per testing period (PRE, MID, POST) and injects them directly into the "Summary Table" on the `CHECKLIST` sheet (Cells `N9` to `S18`), guaranteeing parity with the official DepEd Excel formulas. The FastAPI endpoints for these exports utilize Python libraries like `openpyxl`.


* **Chairman Batch Export:** The Chairman can trigger a bulk export of ECCD records via FastAPI.


* Generates exact Excel files matching the official DepEd template, handling up to 30 students per file.


* Automatically clears existing template placeholders and injects demographic data into the `Info Sheet`.


* Injects raw `1`s for KAYA/DI-KAYA into the domain sheets (`GM`, `FM`, `SH`, `RL`, `EL`, `SE`, `C`).


* Precisely calculates domain-specific decimal ages and scores, injecting them directly into the `PR`, `M`, and `PO` sheets to override static Excel formulas and guarantee data parity.


* **Dynamic Interpretation Summary:** Automatically tallies the interpretations (e.g. "Highly Advanced", "Delay") segregated by gender (Male/Female) during the PR, M, and PO sheet generation. It dynamically appends a summary table with these consolidated totals at the bottom of each respective worksheet, preserving system scalability if rubric definitions change.


* Generates a `.zip` archive when "All Sections" is chosen.




* **Teacher Advanced ECCD Import:** Teachers can simultaneously bulk import student demographic records and full ECCD Assessment scores by parsing the multi-sheet Excel format (`openpyxl` / `pandas`).


* **Excel Parsing & Multi-Sheet Navigation:** Targets the `Info Sheet` alongside 7 distinct Domain Sheets (`GM`, `FM`, `SH`, `RL`, `EL`, `SE`, `C`). Data is relationally mapped by matching the student's name from the Info Sheet to their corresponding row in the Domain Sheets.


* **Critical Pre-Flight Validation:**
1. **Section Validation:** Scans the `Info Sheet` metadata area for the exact `section_name` assigned to the importing teacher. Aborts with a 400 error to prevent accidental wrong-section imports if a mismatch occurs.


2. **School Year Calculation:** Dynamically determines the importing school year string (e.g., "2024-2025") by parsing the `TESTING DATE PRETEST` from the first valid student row, eliminating reliance on hardcoded server flags for imported data accuracy.




* **Strict Transactions:** Enforces PostgreSQL Transactions (`BEGIN`, `COMMIT`, `ROLLBACK`) via SQLAlchemy on a per-student basis. Ensures that if an individual's demographic insert or their bulk score insert fails, no orphaned scores or partial profiles remain.


* **Data Transformations:** Extracts `KAYA` and `DI-KAYA` Boolean scores for the `PRE`, `MID`, and `POST` periods mapped securely against backend `eccd_questions` and `sequence_order` parameters while handling Date serialization automatically.


* **System Safety:** Provides a structured `{ successCount, failedCount, errors }` payload gracefully mapping SQL duplicates or formatting errors row-by-row to the frontend UI without crashing the server.




* **Score Cascading vs Date Independence:** In the frontend evaluation view (`EccdAssessment.tsx`), scoring "KAYA" on a Pre-test cascades to Mid-test and Post-test to speed up input. To support this without violating database integrity, a **Virtual Cascade (Wait-to-be-saved)** architecture is used. When reading student data, if a previous period has "KAYA", the UI automatically inherits it into the subsequent periods' state. These "ghost" answers wait in the frontend until the teacher explicitly switches to the "Mid-Test" or "Post-Test" period and clicks Save, at which point they are officially committed to the database with the user-selected independent Assessment Date.


* **Chronological Validation:** The backend API strictly validates testing periods upon submission. It rejects payloads (400 Bad Request) if a Mid-test date is on/before a Pre-test date, or a Post-test date is on/before a Mid-test date.



## 7. Machine Learning & Predictive Analytics Pipeline

* **Decoupled Architecture:** All ML training and inference logic is securely isolated in the `backend/ml/` directory, operating asynchronously alongside the standard FastAPI routes to avoid blocking the main event loop.
* **Feature Extraction:** The pipeline extracts structured feature sets from the relational database, heavily utilizing the dynamic decimal age, the 7-domain historical ECCD scores, and inter-period progression deltas ($\Delta_{\text{raw}} = \text{Score}_{\text{MID}} - \text{Score}_{\text{PRE}}$).
* **Classification Output:** The system deploys trained supervised classification models (e.g., Random Forest) to predict early developmental delay risks, returning a standard label and confidence probability percentage.
* **Workflow Integrity:** The predictive insights are surfaced contextually within the UI for Teachers, but they **never** mutate, alter, or replace the deterministic scoring logic required by the DepEd grading rubrics.

## 8. Responsive UI & Mobile Accessibility

* **Mobile-First Parent Portal:** The Parent view is heavily optimized for mobile usage (smartphones), ensuring parents have an accessible experience.


* **Responsive Navigation:** The main layout (`MainLayout.tsx`) uses MUI's `useMediaQuery` to dynamically switch from a permanent desktop drawer (width > 900px, `md` breakpoint) to a collapsible hamburger navigation menu nested within a fixed Top AppBar on mobile (`xs`, `sm` breakpoints).


* **Component Adjustments:**
* Standard container layouts (like child dashboards and forms) utilize `Grid` and `flexDirection: { xs: 'column', md: 'row' }` to ensure all cards and forms stack into a single vertical column on narrow viewports.


* Data-heavy views like `ParentEccdAssessment.tsx` wrap their `<Table>` in a `<TableContainer '100%', 'auto', 'touch' WebkitOverflowScrolling: overflowX: sx="{{" width: }}>` so that complex assessment matrices scroll horizontally rather than breaking page bounds.


* The real-time messaging interface (`ChatInterface.tsx`) dynamically toggles between the contact list and the active chat view on mobile screens using the `md` breakpoint (`activeContact` state toggles display visibility). This guarantees the text input box and send buttons remain anchored and usable when the mobile on-screen keyboard is triggered.





## 9. Data Backup & System Restore

* **Encryption Standards:** Full PostgreSQL database exports are encrypted using Python's `cryptography` module (e.g., Fernet or AES-256-CBC).

* **Data Parity & Duplication Prevention (JSON Architecture):** To ensure 100% compatibility with PostgreSQL and avoid SQL-dialect mismatches, the backup system generates an encrypted **JSON payload** using SQLAlchemy rather than a raw SQL dump. 

* **Safe Restoration:** During restoration, the system gracefully purges existing tables using SQLAlchemy's metadata dependency graph (deleting tables in reverse topological order to respect foreign keys) before cleanly inserting the decrypted JSON rows. This guarantees safe overwrites without triggering constraint violations.

* **Environment Keys:** The current backup implementation requires a persistent `BACKUP_ENCRYPTION_KEY` containing a 44-character URL-safe base64 Fernet key. `BACKUP_IV` is also required by Settings but is currently unused by Fernet backup code. Store both in `backend/.env`; see the audited setup guide above for generation commands. Keep these values secure and preserve the backup key across restarts.


* **Access Control:** The Backup and Restore functions are exclusively available to the `super-admin` (Chairman) role. The backend API endpoints are strictly guarded by the FastAPI authentication dependencies (`get_current_user` and `verify_role(["super-admin"])`).


* **File Management:** The encrypted backups utilize `.enc` format and are directly streamed for downloading, and processed securely into memory upon upload utilizing FastAPI's `UploadFile`.



## 10. System Rollover & School Year Management

* **School Year Tracking:** The system globally tracks the current active school year (e.g., "2026-2027") via a `current_school_year` flag in the `system_settings` table. This value is served to the frontend via the Settings Context.


* **Automated Rollover Process:** The Chairman can advance the system to the next school year via the "School Year Management" settings panel. The backend API automatically mathematically calculates the next school year (e.g., parsing "2026-2027" to "2027-2028") to eliminate human input errors.


* **Soft-Archiving Strategy:** The system prioritizes data integrity and historical preservation. Instead of hard-deleting records during a rollover, the system uses "Soft-Archiving" flags:


1. **Students:** All active student records are marked `is_active = false`. This clears active teacher rosters and prevents old students from appearing in current academic reports, while allowing the Chairman to view historical rosters.


2. **Messages:** All current parent-teacher communications are marked `is_archived = true`. This effectively resets the chat interface for the new school year.




* **24-Hour Undo Safety Mechanism:** To prevent accidental data loss, the rollover process explicitly stores the `previous_school_year` and a `last_rollover_timestamp` in `system_settings`. The Chairman is provided with an "Undo Last Rollover" button within a strict 24-hour window, which will reverse the transaction (restoring `is_active = true` and `is_archived = false` respectively) via the `/api/chairman/undo-rollover` endpoint.

## 11. ECCD Assessment Offline-First Resilience Architecture

To ensure uninterrupted grading in rural and low-connectivity classroom environments, the AMES ECCD evaluation module implements an offline-first draft auto-caching and background synchronization protocol.

### 11.1 Scoped Local Caching Key Schema
Draft assessments are persisted in `localStorage` under isolated composite keys:
```
eccd_draft_${studentLrn}_${testingPeriod}_${domainId}
```
* **Example:** `eccd_draft_123456789012_PRE_1`
* **Zero-Assumption Isolation Rule:** Global `localStorage.clear()` is strictly forbidden across the codebase. Only the exact composite key matching a successfully confirmed assessment evaluation is ever removed upon database acknowledgment.

### 11.2 Draft Data Payload Schema
The cached draft format stored in `localStorage` adheres to the following structure:
```json
{
  "student_lrn": "123456789012",
  "testing_period": "PRE",
  "domain_id": 1,
  "evaluation_date": "2026-09-27",
  "answers": {
    "1": "KAYA",
    "2": "DI-KAYA"
  },
  "is_pending_sync": true,
  "updated_at": "2026-09-27T13:00:00.000Z"
}
```

### 11.3 Offline-to-Online Synchronization Lifecycle
1. **Real-Time Auto-Caching:** Every question toggle (KAYA / DI-KAYA) and assessment date modification is written to `localStorage` immediately, shielding teachers against accidental browser reloads or tab closures.
2. **Offline Intent-to-Save:** When the teacher submits the assessment without internet connectivity (`navigator.onLine === false`), network dispatch is suppressed. The draft is tagged with `is_pending_sync: true` and an informative non-blocking toast notifies the teacher: *"Saved locally on device. Will automatically sync once reconnected."*
3. **Reconnection Detection:** The frontend registers window listeners for the `'online'` event. Upon reconnection (or upon mounting when online), the background synchronization engine scans for all `eccd_draft_*` keys where `is_pending_sync === true`.
4. **Queue Dispatch:** Queued drafts are sent sequentially to `POST /api/eccd/evaluate`.
5. **Targeted Key Eviction:** Upon receiving HTTP 200/201 from FastAPI, the exact draft key is removed from `localStorage`. A success toast notifies the teacher: *"Connection restored. Offline assessment synced successfully."*

### 11.4 Failure-Recovery & Error Handling Rules
* **Transient Disconnections:** If an active save request encounters a network drop mid-flight (`!err.response`), the payload is captured and saved locally as `is_pending_sync: true`.
* **Preservation on Server Error:** If a payload encounters a server error during background sync, the draft is kept intact in `localStorage` with `is_pending_sync: true` for the next retry interval. User inputs are never discarded without explicit server confirmation.

## 12. Granular Parent Access & Result Release Architecture

### 12.1 Overview & Schema Separation
To replace coarse all-or-nothing parent access controls, the system implements a 6-permission granular matrix stored directly on the `teachers` table. Since each section is assigned a Primary Adviser (teacher), enrolled students inherit parent access permissions from their active section adviser.

The 6 granular boolean columns are:
- **View Permissions:**
  - `allow_parent_view_student_info` (Boolean, default: `True`): Controls parent access to view child demographics, health profiles, and family background.
  - `allow_parent_view_eccd_pre` (Boolean, default: `False`): Controls parent visibility of Pre-Test ECCD assessment scaled scores, standard scores, and interpretations.
  - `allow_parent_view_eccd_mid` (Boolean, default: `False`): Controls parent visibility of Mid-Test ECCD assessment scaled scores, standard scores, and interpretations.
  - `allow_parent_view_eccd_post` (Boolean, default: `False`): Controls parent visibility of Post-Test ECCD assessment scaled scores, standard scores, and interpretations.
- **Edit Permissions:**
  - `allow_parent_edit_student_info` (Boolean, default: `True`): Controls parent ability to edit family background fields (home address, emergency contact, parent occupations/education, siblings, handedness).
  - `allow_parent_edit_home_based_eccd` (Boolean, default: `False`): Controls parent ability to toggle and submit home-based ECCD checklist evaluations.

### 12.2 Adviser Inheritance & Gating Protocol
1. **Adviser Resolution:** When evaluating permissions for a student (`student_lrn`), the backend resolves the student's assigned section and retrieves the active Primary Adviser via `get_active_adviser_for_student(student, db)`.
2. **View Gating & Data Masking:**
   - When a testing period is unreleased (`allow_parent_view_eccd_{period} == False`), endpoints (e.g. `GET /api/parents/children/{lrn}/eccd-summary`) mask raw scores, standard scores, sums of scaled scores, and domain breakdowns with `None`/`null`.
   - The period object is flagged with `is_published: false` and `interpretation: "Pending Adviser Release"`. Unreleased evaluation data is strictly withheld at the API layer.
3. **Edit Enforcement (HTTP 403 Forbidden):**
   - Attempting to update student details (`PUT /api/parents/children/{lrn}` or `PUT /api/students/{lrn}`) when `allow_parent_edit_student_info == False` raises `HTTPException(status_code=403, detail="Student information editing is currently locked by the class adviser.")`.
   - Attempting to submit home-based evaluations (`POST /api/eccd/parent/evaluate`) when `allow_parent_edit_home_based_eccd == False` raises `HTTPException(status_code=403, detail="Home-based ECCD checklist submission is currently locked by the class adviser.")`.

### 12.3 Teacher Management & UI Controls
- Accessible in `/teacher/settings`, structured into two independent Material-UI cards:
  - **View Access Control:** Master switch for Student Information View + Independent switches for Pre-Test, Mid-Test, and Post-Test result releases.
  - **Edit Access Control:** Independent switches for Student Information Editing and Home-Based ECCD Checklist Editing.
- State changes persist automatically via `PUT /api/teachers/me/access` with instant feedback notifications.
