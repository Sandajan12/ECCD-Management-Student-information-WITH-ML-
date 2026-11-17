# AMES frontend

React + TypeScript + Vite, using MUI/Emotion and Tailwind CSS, connected to the
FastAPI/PostgreSQL backend. The active `src/` implementation and tracked tests
define current behavior; legacy folders are not required.

## Production deployment

The approved stack is **Vercel + Render + Brevo HTTPS API + Supabase**.
Use `frontend` as Vercel's Root Directory, `pnpm build`, and output `dist`;
`vercel.json` supplies SPA fallback routing and security headers. Render runs
the Python 3.12 Socket.IO/FastAPI wrapper `backend.main:app` from the repository
root using `render.yaml`, with `/ready` as its readiness endpoint.

The frontend pins pnpm 12.11.2 and carries its own `pnpm-workspace.yaml` so
isolated frontend installs retain the dependency security overrides. Keep those
overrides synchronized with the repository-root workspace configuration; pnpm 12
reads project settings from YAML ([migration guide](https://pnpm.io/migration)).

Set public `VITE_API_URL` and `VITE_SOCKET_URL` to the Render HTTPS origin
without `/api`, and configure the exact Vercel origin in backend `CORS_ORIGINS`.
Keep database, encryption, JWT, and email credentials out of `VITE_*` variables.
Production enables OTP with `EMAIL_TRANSPORT=brevo_api` and `BREVO_API_KEY`;
Supabase requires `sslmode=verify-full` and a trusted CA. Bootstrap the database
before API startup as described in [the deployment guide](../DEPLOYMENT.md).

The sandbox imports `src/assets/eccd_scoring_data.json` within the frontend
root. Copy updates from `backend/eccd_scoring_data.json` without reformatting;
`backend/tests/test_scoring_asset.py` verifies byte-for-byte parity. The build
does not import backend files.

Teacher ownership permits one active Primary Adviser section per teacher.
Assigning a new section retires the former ownership; transfers preserve
student records and evaluation history.

## Run locally

From the repository root, with PostgreSQL running, required migrations ready and
the existing backend/.env, start the API and UI in separate terminals:

```powershell
uv run --no-project --python .venv312 python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000 --env-file backend/.env
pnpm.cmd run frontend
```

Open http://localhost:5173. The API runs on http://localhost:8000.
Root `pnpm.cmd run dev` also starts both scripts; its backend command explicitly
uses `.venv312` through uv. Install backend dependencies in that same environment.
Set `VITE_API_URL` in frontend/.env.local only when changing the API origin;
`VITE_SOCKET_URL` optionally overrides the chat origin. Restart Vite after changes.
Keep database/email secrets in backend/.env. Local development may use
`ENABLE_OTP=false`; the UI follows actual backend challenge responses. Production
requires OTP enabled and configured email delivery.
Existing account credentials are preserved.

Parent home-observation photos need no remote storage setup when the backend uses
`ENVIRONMENT=development` and both `SUPABASE_STORAGE_URL` and
`SUPABASE_STORAGE_SERVICE_KEY` are blank. Sanitized photos stay in gitignored
`backend/.local_home_photos/` and are available only through the authenticated
no-store photo endpoint. Saved Teacher Accept/Decline deletes them; failed deletions
retain cleanup retries. Configured private Supabase storage remains active, and
partial configuration/provider outages never fall back. Restart the backend after
updating source/settings and restart Vite to load its explicit private-photo
filesystem deny rule, then manually resubmit the retained answer/photo draft.

## Migrated workflows

- Staff/parent dashboards, domain progress and released assessment results.
- Student enrollment, family details, child linking, archives and bulk transfers.
- Teacher/section management, Primary Adviser assignments/handovers and question access.
- PRE/MID/POST ECCD assessment, home-based parent answers and question configuration.
- Eight granular parent permissions, independent marks/score-release gates and protected editing.
- Excel import with per-row feedback, checklist/summary downloads and section exports.
- School branding, account changes, audit history, rollover/undo and encrypted backups.
- Authenticated chat, unread counts, mobile conversations and reconnect history.

Public student records display masked LRNs; API URLs and saved assessment state
use integer student IDs. LRNs are optional for enrollment/staff edits; supplied
values require 12 ASCII digits. Authorized staff student-detail reads return the
decrypted LRN for editing, and authorized staff exports include it. Parent/public
responses remain masked. Linking and workbook matching still require an LRN.

## Durable inputs

Forms use owner/record-scoped localStorage drafts. Assessment keys also include
student ID, period and domain. Automatic replay is limited to authenticated
teacher (`admin`) ECCD drafts for exactly `POST /api/eccd/evaluate`, with matching
owner, student, period and revision. Other forms, parent observations and old
queued records require manual online submission after reconnecting.
Only the exact server-confirmed revision is removed; newer edits survive an older
response. Logout and session expiry preserve drafts. Validation/permission failures
retain inputs for review rather than treating them as successful saves.

Credential fields survive reload in sessionStorage within the current browser tab.
Selected files survive reload in IndexedDB. Background images and import workbooks
require explicit online submission after reconnecting; partial workbook imports
retain the file and row errors. Other forms show: "Your draft is saved on this
device. Reconnect and submit again."
Restore and rollover are explicit, confirmed actions. No global localStorage clearing
is used. Keep the page open if the browser reports unavailable/full device storage.

## Verify

```powershell
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build
```

Select an existing Playwright configuration explicitly for browser work; there
is no default `playwright.config.ts`. For example:

```powershell
pnpm.cmd --dir frontend run test:e2e --config playwright.ml-sandbox.config.ts
```

The database-free parent sync/import regressions run with
`pnpm.cmd --dir frontend exec playwright test --config playwright.parent-sync.config.ts`.
Their shared `tests/helpers/session.ts` mocks `/api/auth/refresh` after broad API
routes so reloads restore the RAM session. Do not seed access tokens or user
objects in browser storage. Offline reloads retain drafts and wait for a
connection to restore authentication before teacher ECCD replay; other forms
and Excel uploads require manual submission.

The sandbox configuration starts a loopback test API on port 8774 and Vite on
5186, using disposable PostgreSQL schemas and synthetic accounts. PostgreSQL
must be running. Other current configurations cover audit logs, teacher
management, parent ML, teacher ML insights and terms/privacy; see
[AI_CONTEXT.md](../AI_CONTEXT.md) for their ports and server setup. These checks
use active source and do not require removed legacy visual harnesses.
Install the test browser once with:

```powershell
pnpm.cmd --dir frontend exec playwright install chromium
```

To run the test API manually from the repository root:

```powershell
uv run --no-project --python .venv312 python -m backend.tests.serve_phase3
```

Stop that server with Ctrl+C when finished so its temporary schema is removed.
Never deploy the test server. Test screenshots/traces and generated builds are
ignored by Git.


New password logins require email OTP. Remember-device controls are retired;
refresh cookies restore existing sessions. Initialization removes only legacy
device preference/token keys and credentials, preserving pending logout and
all durable drafts. Verify with `pnpm exec playwright test --config
playwright.auth-security.config.ts` (desktop/mobile OTP, refresh, and storage).
