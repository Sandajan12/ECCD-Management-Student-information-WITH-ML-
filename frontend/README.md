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

From the repository root, with PostgreSQL running and the existing backend/.env:

```powershell
pnpm.cmd run dev
```

Open http://localhost:5173. The API runs on http://localhost:8000.
To start only the UI, use `pnpm.cmd run frontend`.
Set `VITE_API_URL` in frontend/.env.local only when changing the API origin;
`VITE_SOCKET_URL` optionally overrides the chat origin. Restart Vite after changes.
Keep database/email secrets in backend/.env. Local email verification follows
the backend's `ENABLE_OTP=false` setting and its actual challenge responses.
Existing account credentials are preserved.

## Migrated workflows

- Staff/parent dashboards, domain progress and released assessment results.
- Student enrollment, family details, child linking, archives and bulk transfers.
- Teacher/section management, adviser/substitute assignments and question access.
- PRE/MID/POST ECCD assessment, home-based parent answers and question configuration.
- Six parent access permissions, locked placeholders and protected editing.
- Excel import with per-row feedback, checklist/summary downloads and section exports.
- School branding, account changes, audit history, rollover/undo and encrypted backups.
- Authenticated chat, unread counts, mobile conversations and reconnect history.

Public student records display masked LRNs; API URLs and saved assessment state
use integer student IDs. Raw 12-digit LRNs are entered only for enrollment/linking.

## Durable inputs

Forms use owner/record-scoped localStorage drafts. Assessment keys also include
student ID, period and domain. Network failures queue submissions for reconnection.
Only the exact server-confirmed revision is removed; newer edits survive an older
response. Logout and session expiry preserve drafts. Validation/permission failures
retain inputs for review rather than treating them as successful saves.

Credential fields survive reload in sessionStorage within the current browser tab.
Selected files survive reload in IndexedDB. Background images and import workbooks
can sync after reconnect; partial workbook imports retain the file and row errors.
Restore and rollover are explicit, confirmed actions. No global localStorage clearing
is used. Keep the page open if the browser reports unavailable/full device storage.

## Verify

```powershell
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build
```

Select an existing Playwright configuration explicitly for browser work; there
is no default `playwright.config.ts`. For example:

```powershell
pnpm.cmd --dir frontend run test:e2e --config playwright.ml-sandbox.config.ts
```

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
