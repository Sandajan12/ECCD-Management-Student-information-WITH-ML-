# AMES frontend

React + TypeScript + Vite + Tailwind CSS, connected to the FastAPI/PostgreSQL
backend. The read-only `AMES-SYSTEM-LEGACY/frontend/` guided the layout and flows:
dark sidebar, rounded cards, blue actions, assessment tabs and role dashboards.
The active frontend has no MUI/Emotion dependency.

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
pnpm.cmd --dir frontend run test:e2e --reporter=list
```

The browser suite runs the same 13 workflows on desktop and mobile Chromium, plus
visual comparisons against the original authentication and navigation components.
See [VISUAL_PARITY.md](VISUAL_PARITY.md) for the per-file reference audit.
Install the isolated visual harness once with:

```powershell
pnpm.cmd --dir frontend/tests/legacy-visual install --ignore-workspace
```

Final migration verification passed all 26 browser checks, 52 backend tests,
TypeScript, lint and the production build. The build reports a non-blocking
bundle-size warning.
It uses a loopback-only API on port 8767 with disposable PostgreSQL schemas and
synthetic accounts, separate from the school database tables. PostgreSQL must be
running. Install the test browser once with:

```powershell
pnpm.cmd --dir frontend exec playwright install chromium
```

Playwright starts missing Vite/test servers automatically. To run the test API
manually from the repository root:

```powershell
uv run --no-project --python 3.12 python -m backend.tests.serve_phase3
```

Stop that server with Ctrl+C when finished so its temporary schema is removed.
Never deploy the test server. Test screenshots/traces and generated builds are
ignored by Git.
