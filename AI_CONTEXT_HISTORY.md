# AMES Context History

## 2026-11-14 — Section Summary PDF header, bottom counts and capacity refinement

On `feat/pdf-export-options`, changed only `backend/utils/pdf.py`, its targeted
`backend/tests/test_pdf_exports.py`, and the three context guides. Summary pages
now consolidate school/optional school number, report/period (PRETEST, MID,
POSTTEST), section, school year, teacher and official testing date at the top.
Removed the duplicate metadata beneath the student table. Word wrapping keeps
column-header words intact. The aligned HA/SA/A/SD/D male/female/total table is
anchored near the bottom of the period's final page, above the unchanged Manila
timestamp/page-number footer. Student-table pagination reserves space for that
box and repeats metadata and column headings on continuation pages.

Renderer-only synthetic inputs verify 1, 26, 30 and 32 pupils produce exactly
three landscape pages, while 50 pupils produce six pages (two per period),
preserving every student and placing counts only on the period's final page.
Assertions read actual PDF text coordinates to check top-only metadata, intact
headings, aligned count values, clearance between students/counts/footer and
unchanged workbook cells/styles/tabs. Long wrapped names also repeat headers.
Actual exports keep existing 30-child workbook/ZIP batching. Excel generation,
individual checklist PDFs, Teacher download handlers/UI and authentication
remain unchanged; no new dependencies or Playwright spec changes were needed.

Executed only the two requested targeted checks:
- `uv run --no-project --python .venv312 python -m pytest backend/tests/test_pdf_exports.py -q`: **14 passed** (72.40s). Two earlier same-file runs exposed mistakes in the new assertions (a fixture teacher-name mismatch and a suffix matching a complete word); corrected the assertions before the passing rerun. uv initially required access to its existing external cache; reran with approved access, without changing dependencies.
- `pnpm.cmd --dir frontend exec playwright test --config playwright.pdf-exports.config.ts`: **3 passed** (1.3m). The unchanged `frontend/tests/pdf-exports.spec.ts` verified Chairman Student Records' three-page summary, Chairman Sections PDF/Excel downloads, Teacher individual/summary PDF/Excel downloads, RAM bearer requests and session integrity using the isolated synthetic API.

`git diff --check` passed. No unrelated tests, frontend build, hosting tools,
migrations, school database access, pushes or merges ran. Cookie renewal and
production behavior remain unverified. The unrelated untracked
`PARENT_HOME_OBSERVATION_REVIEW_PLAN.md` is preserved outside this commit.

## 2026-11-14 — Three-page Section Summary PDF scope resolution

The placement of metadata/counts described in this earlier delivery is
superseded by the layout refinement above; its score-only scope remains active.

The user explicitly selected score-only Section Summary PDFs, superseding the
earlier full-workbook PDF requirement and resolving the initial 36-versus-3 page
failure below. Changed only `backend/utils/pdf.py`, its targeted
`backend/tests/test_pdf_exports.py` and the three context guides during this
resolution. The previously prepared PDF-only Playwright spec/configuration and
synthetic API fixture remain part of the local verification changes.

Both Chairman and Teacher section-summary PDFs now render only PR/PRE, M/MID
and PO/POST: one landscape page per period for a normal 30-child summary part.
The 7pt, tightly padded table combines seven raw/scaled score pairs into the
requested 17 columns without horizontal slices. Deduplicated school/section/
adviser details and male/female/total HA/SA/A/SD/D interpretation counts follow
the table on the same page. Vertical overflow repeats the period and table
headings. Domain question-mark tabs, custom tabs and domain continuations are
omitted only from summary PDFs. Individual portrait PDFs retain full checklists;
Excel generation and all workbook tabs remain unchanged. Existing role checks,
cohort selection, 30-child batching, ZIP behavior and RAM bearer downloads remain
in place. No dependencies or frontend application changes were needed.

Executed only the requested targeted checks:
- `uv run --no-project --python .venv312 python -m pytest backend/tests/test_pdf_exports.py -q`: **10 passed** (126.31s). An initial run had 9 passes and one new overflow assertion reading compressed bytes; corrected that test's compression setup before this passing rerun. Tests cover valid PDF responses, role/cohort enforcement, three-page output, a complete 30-pupil table with official scores/counts on each page, unchanged workbook cells/styles/tabs, full individual custom checklists and repeating vertical-overflow headers.
- `pnpm.cmd --dir frontend exec playwright test --config playwright.pdf-exports.config.ts`: **3 passed** (1.8m), selecting only `frontend/tests/pdf-exports.spec.ts`. Chairman Student Records passed the exact three-landscape-page assertion; Chairman Sections and Teacher individual/section downloads passed for both PDF and Excel. Checked file signatures, response types, RAM bearer authorization, protected follow-up access, unchanged HttpOnly cookies and absent stored credentials.

`git diff --check` passed. No unrelated specs, full backend suite, frontend build,
hosting tools, migrations, school database access, remote pushes or merges ran.
Cookie renewal and production behavior remain unverified. Kept the unrelated
untracked `PARENT_HOME_OBSERVATION_REVIEW_PLAN.md` out of the commit.

## 2026-11-14 — Initial focused PDF Playwright verification (superseded scope)

The scope conflict and pending decision recorded in this initial run were
resolved by the user's score-summary-only instruction documented above. These
original results remain historical evidence, not the current PDF specification.

On `feat/pdf-export-options`, added only a PDF-specific Chromium configuration,
`frontend/tests/pdf-exports.spec.ts`, and a loopback-only synthetic SQLite API
fixture. Reused `tests/helpers/session.ts::setRamSession` with real signed
sessions and HttpOnly/Strict refresh-cookie delivery. Export handlers, workbook
generation, PDF rendering, JWT validation and role checks run without export
mocks; unrelated roster/dashboard responses are mocked. The fixture overrides
the configured database URL with an unused loopback address and never imports
the production API startup or connects to school data.

Executed only the new spec via `pnpm.cmd --dir frontend exec playwright test
tests/pdf-exports.spec.ts --config playwright.pdf-exports.config.ts`, with
same-spec filtered reruns while correcting fixture navigation, menu interaction
and teacher access-control data. The complete run produced **2 passed, 1 failed**:
Chairman Sections PDF/Excel and Teacher checklist/summary PDF/Excel passed.
Chairman Student Records downloaded a valid PDF, but its requested page-count
assertion found **36 landscape pages instead of 3**. A filtered rerun using a
soft assertion also completed its Excel download and session checks; the page
count remained its sole failure. Checked response types, non-empty download
bytes, PDF signature/EOF/orientation, XLSX ZIP members, RAM bearer headers,
protected follow-up API access, unchanged HttpOnly cookies and absence of stored
credentials. The full report includes all PRE/MID/POST and domain marks, matching
the earlier approved Excel-content scope. Asked whether to preserve that scope
or omit detail for three score-summary pages; no application change or commit
was made while clarification is pending.

`git diff --check` passed. No other Playwright specs/configurations, regression
suites, hosting tools, migrations, school databases, remote pushes or merges ran.
Cookie renewal and production behavior were not verified. Preserved the unrelated
untracked `PARENT_HOME_OBSERVATION_REVIEW_PLAN.md`.

## 2026-11-13 — PDF dependency environment correction

Investigated `ModuleNotFoundError: No module named 'fpdf'` locally on
`feat/pdf-export-options`. Python process paths showed `.venv`/Python 3.14;
the approved `fpdf2==2.9.0` installation exists in `.venv312`/Python 3.12.
The root backend script used bare `uvicorn`, allowing PATH to select the other
environment. Changed only that script to explicitly use uv with `.venv312` and
updated current launcher guidance. No additional packages were installed.

Verified fpdf2 import, renderer import and a valid synthetic in-memory PDF under
`.venv312`. `pnpm.cmd run backend --help` passed and displayed the explicit
Python 3.12 launcher; it did not start the API or access school data.
`git diff --check` passed. Existing dev processes were left running; the user
must stop/restart their dev command to select the corrected interpreter.
No browser checks, hosting tools, migrations, deployment or remote push ran.

## 2026-11-13 — Local staff PDF export option

At the user's request, committed the existing `PARENT_ANDROID_APP_PLAN.md` on
`main` as `2e3a773`, then based `feat/pdf-export-options` on that clean commit.
All PDF implementation work remains on the feature branch. Added and installed
the explicitly approved `fpdf2==2.9.0` in `.venv312`; existing Matplotlib DejaVu
font files supply portable Unicode text without system font packages.

Chairman Student Records/section summaries and Teacher ECCD records/summary
dialogs now offer Excel or PDF. All nine existing staff export routes accept
`format=pdf`, sharing existing authorization, workbook data and cohort selection.
Excel remains the default. PDFs retain all PRE/MID/POST content, official scores,
custom/overflow questions and timestamp comments; bulk PDF downloads remain
ZIPs and summary parts retain the 30-child limit. Printable tables use portrait
checklists, landscape summaries, repeated headers, long-row continuations,
school/report/scope headers, page totals and Philippine-Time export timestamps.
The later 2026-11-14 scope resolution supersedes full question-mark content in
Section Summary PDFs only; full individual checklists and Excel tabs remain.

Executed only local targeted verification: the combined
`test_pdf_exports.py`, `test_eccd_exports.py`, `test_eccd_card_exports.py` run
passed 23 tests before the final pagination test was added. After renderer
refinements, the seven PDF route/content tests passed again; the added eighth
PDF pagination/footer test passed separately after its assertions were adapted
to fpdf2's content-stream wrapper and separate page-total text operator. These
cover 24 distinct backend export cases, using synthetic SQLite data rather than
school databases. The non-browser Node format-selection tests passed 3 cases;
both explicit frontend tsconfig checks and the frontend production build passed.
The existing FastAPI/Starlette deprecation warnings and imported TestingPeriod
pytest collection warning remain. The Ponytail/React diff review kept existing
download/auth logic and added no unrelated abstractions or frontend dependencies.

No full backend suite, Playwright/browser checks, migrations, hosting/database
tools, deployment, merge into main, or remote push was performed. Visual print
review remains for the user's local browser.

## 2026-11-13 — Audit UTC serialization and staff sidebar labels

Created `fix/audit-timezone-and-sidebar-label` in an isolated clean worktree
from main `408d743`, preserving the unrelated untracked Android plan. Inspected
`chairman.py`, the audit helper/model/schema, and the active analytics log route:
`AuditLogItem` is the actual response boundary for `/api/analytics/logs` and
both `/api/logs` aliases. Its timestamp validator now treats historical naive
values as UTC and normalizes aware values to UTC before ISO serialization.
No database timestamps, models, routes, migrations or ML artifacts changed.

The System Audit Logs page and CSV share the existing formatter, which now
treats missing offsets as UTC and explicitly formats date/time in Asia/Manila.
Only Chairman Portal and Teacher Portal label styles changed in the shared
desktop/mobile drawer: 16px, weight 700, white. Parent styling is preserved.

Executed against localhost PostgreSQL disposable schemas:
`uv run --no-project --python .venv312 python -m pytest backend/tests/test_audit_logs.py -q`
passed **8 tests and 4 subtests**. Two existing Starlette/httpx/anyio deprecation
warnings remain. Both explicit frontend tsconfig checks, pnpm lint, production
build and `git diff --check` passed. A local Playwright harness passed **60
checks**, using mocked API/session responses against the changed Vite app:
naive/Z/offset timestamps, midnight rollover, null/invalid values, downloaded
CSV, and both staff labels at 1280/768/320 widths in Manila/UTC/Los Angeles
browser timezones. Browser mocks establish rendering/export behavior, not live
production audit data. The Ponytail/React diff review found no new dependencies,
state or unnecessary abstractions.

Merged/pushed application commit `6ab34dd` to origin main. Verified Render
`Apolinario Mabini School System` deploy `dep-dbrhine1egvs73fs3upg` live and
Vercel `eccd-management-student-information-with-ml` deployment
`dpl_8UMwbin3cZBXmTk5xPXJVDNB9343` READY on that exact commit, assigned to both
custom UI domains. `/ready` returned HTTP 200 with database connected; both
custom audit-page URLs returned HTTP 200. The same **60 browser checks** also
passed against the deployed frontend with synthetic API/session responses;
this did not authenticate to or read real production audit records. The Render
error-log scan from deployment start through 14:08 UTC returned no errors.
No Supabase operations or changes to the excluded legacy services were made.

## 2026-11-13 — Parent sync/import CI session fixtures corrected

Inspected failed main Actions run `43416122412` of **Parent sync and Excel
import regressions**. Its browser step failed 100 of 102 cases after the
RAM-only session release. Reproduced the parent-link failure locally: the
storage-seeded session was purged and the browser showed login instead of the
parent portal, before any reconnect assertion ran.

Updated all six specs in `playwright.parent-sync.config.ts` to restore mocked
sessions through `/api/auth/refresh`, using a shared typed fixture. Replay
isolation/account-switch tests use the real RAM session functions; obsolete
browser credentials alone cannot authorize replay. Storage assertions cover
both browser stores and retired remembered-device keys. Fully offline reload
now checks the session-restoration waiting state and preserved draft, followed
by authenticated teacher ECCD replay on reconnect. Parent forms and Excel
uploads retain their manual-submission assertions. No application runtime,
database schema, dependencies, or production configuration changed.

Expanded the workflow type check from three browser specs to all six, with
React JSX and Vite types. Executed locally: the complete explicit parent-sync
Playwright configuration passed **102/102** desktop/mobile cases; application
and Node tsconfig checks, the expanded six-spec type check, frontend ESLint,
production build, and changed-test formatting checks passed. These browser
tests mock the API and do not establish live database persistence. Preserved
the unrelated untracked Android plan.

## 2026-11-13 — Remembered-device application release verified

Fast-forwarded main and pushed application release `c570b2c` after user local
acceptance. The only changes after verified code commit `5a2f35c` were Markdown
release notes. The unrelated untracked Android plan was preserved.

Render deploy `dep-dbrf26u8bjmc73bnsrtg` on Apolinario Mabini School System
became live at 11:16:44 UTC. Vercel production deploy
`dpl_J2iTd7Zzer8cYSDJUMUDBLzn86kX` is READY and assigned to both custom domains.
Both providers identify application commit `c570b2c`. Render startup confirms
email OTP enabled with brevo_api and successful application initialization;
no error-level application logs were returned for the release window.

Executed anonymous live checks: apex redirects to www, both serve HTTP 200,
API health/readiness return 200 with production HSTS, session responses omit
deviceToken/refresh_token, legacy request properties remain accepted, all four
approved origins pass credentialed CORS, cookie-less refresh returns structured
401 INVALID_TOKEN, untrusted-origin refresh returns 403, and logout expires
both legacy device cookies plus the secure HttpOnly Strict refresh cookie at
their matching paths. Desktop 1280px/mobile 320px login and registration have
no remember controls, overflow or page errors. Legacy storage cleanup preserves
synthetic unsaved drafts in both browser stores. Reports/screenshots are ignored
under `.tools/removal-release-*` and `.tools/removal-live-login-*`.

AMES_SYSTEM_ML still retains the unused device table; refresh-session storage
and shared rate-limit storage are present, with active counters. No production
schema/policy changes were made. Explicit cleanup 020 remains pending a verified
protected backup and stopped API writers; no production connection configuration
is available locally. Existing refresh sessions need not be revoked. Real
credentialed production OTP/refresh login was not repeated without account
credentials; local automated authentication coverage and user acceptance passed.
The application works with the retired table retained. AMES-SYSTEM-1 and
ames-system were not changed.

This follow-up commit records the completed release only. Its documented
`[skip render]` marker avoids restarting the identical backend for Markdown.

## 2026-11-13 — Local acceptance and application release authorization

The user confirmed the remembered-device branch works in local testing and
explicitly authorized merging and deploying it. This lifts the local-only hold
recorded below. The verified application commit is `5a2f35c`; the release
preparation changes only this history and the plan status. Existing verification
remains 561 backend tests/693 subtests, 62 browser cases, both frontend TypeScript
projects, lint, build and whitespace checks, all passing.

Fetched origin and confirmed main is still `71de882` with no tracked edits.
Preserve the unrelated untracked Android plan. Reverified the exact production
targets: Render `srv-dbfm4p4s728c73dctvf0` (Apolinario Mabini School System,
`uvicorn backend.main:app`) and Vercel `prj_New0XVlLSCtfDSXaEIRKkoeAJnXN`
(eccd-management-student-information-with-ml, ameskinder.com/www.ameskinder.com).
Do not operate on AMES-SYSTEM-1 or ames-system.

Read-only inspection of AMES_SYSTEM_ML (`gqywhrytxzkhpidqxhff`) confirms 019 is
recorded and 020 is not. Application deployment can proceed with the unused
device table retained. No production cleanup is claimed here: its protected
backup/writer-stop requirements still apply. No production connection file is
available locally. Deployment completion and live behavior must be established
from the provider status and HTTP/browser checks, not inferred from this note.

## 2026-11-13 — Remembered-device removal: local acceptance checkpoint

Work is isolated on `refactor/remove-remembered-devices`, created from fetched
`main` at `71de882`. The user subsequently limited delivery to local testing:
do not merge, push, deploy, or change production Supabase until instructed.
The unrelated untracked Android plan remains untouched. Hosted resources were
identified read-only before this restriction; no hosted mutation occurred.

Removed the optional 30-day OTP bypass, device-token issuance and active ORM
model/relationship. Existing request aliases remain inert, old OTP challenge
remember claims are ignored, and successful session/logout responses expire
both legacy device cookies. Browser initialization deletes only retired device
keys and legacy credentials, retaining pending logout and all work drafts.
Refresh rotation, OTP checks, rate limiting, account preservation, school rules
and ML behavior remain intact. Old encrypted backups discard only the retired
top-level device collection before strict validation. Historical migration
metadata is retained separately from active ORM models.

Migration 020 uses a transactional ledger/table lock, five-second lock timeout,
external dependency preflight and DROP TABLE RESTRICT. The table's own policies
are allowed; external views/foreign keys block cleanup. Fresh bootstrap includes
001–020 and historical performance checks tolerate the recorded retirement.
Startup never applies 020. AST extraction was refreshed before shared edits and
again after removal; SQL extraction was unavailable without tree_sitter_sql.
No dependency was added. Simplicity review: “Did this change introduce
unnecessary abstractions, extra state, or new dependencies that existing code
already handles?” No; existing authentication and backup paths were simplified.

Local `backend/.env` targets `localhost/ames_parity_dev`. Its ledger initially
ended at 018. No API writer was listening on 8000/5000 during migration.
Created an encrypted pg_dump public-schema snapshot (excluding refresh storage),
verified decryption and pg_restore catalog, then explicitly applied/checked the
missing additive 019 prerequisite and ran 020 --check (expected pending),
--apply, --check successfully. The maintenance snapshot and its separate key
are ignored under `.tools/remove-remembered-devices/`; application keys were
not replaced. All other school-table row counts were preserved. Required schema
checks, database readiness and rate-limit storage checks passed. The updated
local API starts at 127.0.0.1:8000; health/ready return 200, absent-cookie refresh
returns 401 INVALID_TOKEN, the response schema omits deviceToken, and logout
expires all three relevant cookies.

Pre-existing local configuration issues were preserved: the school-backup
Fernet key is invalid and `idx_students_school_year` is missing despite the
014 ledger entry. The encrypted pre-migration snapshot confirms the index was
already absent. These do not prevent current API startup; the optional 014
integrity checker reports the missing index. Local ENABLE_OTP=false retains
the development bypass; tests explicitly enable OTP and capture synthetic mail.
Real email delivery was not tested.

Executed checks at this checkpoint: **561 backend tests and 693 subtests passed**
in 1698.76 seconds (28:18), with ten existing dependency/collection warnings.
Both frontend TypeScript projects, ESLint, production build, git diff --check
and **62 desktop/mobile auth browser cases** passed. Six isolated cleanup/
backup/CLI tests and 57 targeted security/bootstrap/index/refresh tests also
passed separately before the complete run. Interrupted earlier runs are not
reported as passes. Final output is saved locally in
`.tools/remove-device-pytest.log` and `.tools/remove-device-playwright.log`.
Actual localhost login/registration also rendered at 1280px and 320px without
remember controls, horizontal overflow or page errors. Staged secret checking
reported zero findings. The local API is left running for user acceptance;
main and origin/main remain at 71de882. No merge, push or deployment was done.
The RF artifact checksum still matches the current guide. No dataset/model
was regenerated or replaced.

Archived: **2026-11-07** from the pre-consolidation `AI_CONTEXT.md` at commit
**a836697**. The original document is preserved in full below, including dated
delivery notes, test outcomes, local observations, and hybrid/V2 experiments.
Retaining the former summaries alongside their notes preserves their context.

**Historical reference only.** Labels such as "current", "fresh", "authoritative",
and "pending" below belong to the original snapshot. They do not establish the
current implementation, test status, local database state, or deployment health.
Use [AI_CONTEXT.md](AI_CONTEXT.md), [AGENTS.md](AGENTS.md), and active source for
current work. Normal onboarding does not require reading this archive.

Known superseded claims in this snapshot include generic form/file reconnect
replay, an incomplete migration inventory, unconditional teacher attribution,
ignored diagnostic plots, older Playwright counts, and hybrid-model fingerprints.
Current guidance resolves these in AI_CONTEXT.md. Dated test failures and results
remain evidence of their recorded runs, not fresh findings or ongoing blockers.

For research history, consult the former section 11's hybrid retraining and
promotion notes and section 12's implementation/V2 archive below. The standalone
RF evaluation has its current reference in `backend/ml/README.md`.

## 2026-11-13: Bundled Supabase CA for production TLS

The user supplied the Supabase Dashboard download `prod-ca-2021.crt` after
Render's production connection to the Singapore Supabase pooler failed with
certificate verification against system roots. Copied only the public CA to
`backend/certs/`; no private key or environment credentials are included.
Verified its CA constraints, self-signature, validity through April 2031 and
DER SHA-256 fingerprint. A PostgreSQL STARTTLS probe to
`aws-0-ap-southeast-1.pooler.supabase.com:5432` completed TLS 1.3 with this CA
and hostname verification; no database login or query was performed by that probe.

Production settings now resolve absent/empty or `system` roots to the absolute
bundled CA path. Explicit CA paths keep their existing service-setting-over-URL
precedence; development and mandatory production `sslmode=verify-full` remain.
Missing bundled files fail closed. The existing SQLAlchemy connection options
consume the resolved path, so no engine wrapper or new dependency was added.

Executed targeted TLS, deployment guard and deployment security suites:
**25 tests and 58 subtests passed**. Updated the obsolete assertion that
verify-full without an explicit root must fail; the bundle now supplies it.
These pre-push results do not establish hosted deployment acceptance.

Review checkpoint: "Did this change introduce unnecessary abstractions, extra
state, or new dependencies that existing code already handles?" No: selection
uses the existing Settings validator and database connect_args.

## 2026-11-12: Refresh authentication production release verification

The user authorized committing all valid pending work on `fix/refresh-token-auth`,
pushing it, merging updated `origin/main`, and deploying only Render
`Apolinario Mabini School System`, Vercel
`eccd-management-student-information-with-ml`, and Supabase `AMES_SYSTEM_ML`.
The older Node.js hosting resources are excluded.

Pre-commit review covered all 25 pending files, including the existing model audit
and DFD guide. No secret-bearing environment file, private key, provider token,
or credential URL was found in the candidate changes. `backend/.env.example`
contains placeholders and public lifetime defaults; local environments remain
ignored. No model artifact, dependency, migration or business rule was changed.

Executed again before this release: requested backend suites and refresh tests
passed **99 tests and 173 subtests** against local disposable PostgreSQL schemas.
Three warnings concern Starlette/httpx, AnyIO and pytest's `TestingPeriod` enum
collection. `npm run build` in frontend and both explicit TypeScript project
checks passed. The refresh browser spec passed **36 desktop/mobile checks** using
`playwright.auth-security.config.ts`, including renewal, outages, revocation,
race guards and draft preservation. `git diff --check` passed.

Review checkpoint: "Did this change introduce unnecessary abstractions, extra
state, or new dependencies that existing code already handles?" The existing
API service and AuthProvider own renewal; no extra layer or dependency is needed.
These are pre-commit results. Hosted deployment/configuration acceptance is
reported separately after the main push; these local checks do not establish it.

## 2026-11-12: Renewal recovery fixes and merge-readiness review

Inspected the existing uncommitted branch and remote `main`; both pointed to
`d5fc07e`, with no branch divergence. The user requested fixes and a deployment
verdict. Work remains on `fix/refresh-token-auth`; no commit, push, merge,
production configuration change or deployment was performed. Preserved the
pre-existing model-audit report and DFD guide work.

Review reproduced two frontend gaps: renewal network/429/503 errors cleared
otherwise valid credentials, and protected `403 ACCOUNT_INACTIVE` responses
left the browser signed in until renewal. PostgreSQL continued to reject the
archived account; this was stale browser state, not an authorization bypass.
The user selected keeping credentials/drafts and retrying temporary failures.

Updated `frontend/src/services/api.ts` and `context/AuthContext.tsx` to retain
credentials for network/timeouts and HTTP 408/425/429/5xx. Account-scoped retries
use 30/60/120-second backoff, honor a longer Retry-After, and share the cooldown
across timer/expired-request/focus/clock triggers. Offline tabs pause renewal;
reconnection rechecks the schedule. Successful renewal/logout/replacement resets
retry state. Exact protected ACCOUNT_INACTIVE responses end the current browser
session as revoked; ordinary permission 403s stay local to the failed action.
Existing token-type/live-database checks, trusted devices, one-retry limits,
late-response guards and durable drafts remain intact. No generic form replay,
service layer or dependency was added.

Extended `frontend/tests/refresh-auth.spec.ts` with temporary failure recovery,
cooldown/backoff, logout/reset, offline reconnection and real archive/ordinary
403 cases. Updated AI_CONTEXT.md, AGENTS.md, DEPLOYMENT.md and the ignored local
authentication findings summary with current behavior and rollout checks.

Executed the requested backend suites plus refresh tests: **99 passed**, 173
subtests, using disposable PostgreSQL schemas. Initial new desktop checks had
six passes and one fixture failure: the mocked cross-origin 429 omitted CORS
exposure of Retry-After. Corrected that fixture to match the actual backend's
existing exposed-header configuration. The offline fixture now waits for the
actual dashboard to load before disconnecting.

The first complete extended browser run had 57 passes and three fixture
failures. Explicitly simulate server TOKEN_EXPIRED after reconnection, because
successful API responses can correct the advanced browser clock and the real
server-issued access token has not aged 31 minutes. The archive fixture now
allows the expected navigation to destroy its pending browser-script context,
while asserting the exact revoked URL/message and retained draft. Added an
absolute Retry-After/server-Date case with browser clock skew; the retry uses
the response Date before falling back to the compensated client time. The
corrected targeted desktop/mobile run passed all **8 checks**.

Final production build (`npm run build` from frontend), both explicit frontend
TypeScript checks, strict standalone type-checking of the refresh browser spec
and config, full frontend lint, targeted lint, formatting and whitespace checks
passed. Some pnpm commands initially failed to fetch tooling inside the sandbox;
the same checks passed with authorized network access. The final complete
authentication/terms/refresh browser run passed **62 tests** across desktop and
mobile (6.4 minutes), using `pnpm.cmd exec playwright test --config
playwright.auth-security.config.ts` from frontend. The earlier targeted eight
checks overlap this final complete suite and are separate runs.
The fixture can emit the previously observed Engine.IO REQUEST_METHOD teardown
trace during token/socket replacement; no corresponding authentication failure
was established by that log.

Hosted settings/health are not established by local checks. Render discovery
became available, but no workspace was selected; the optional identification
question was unanswered during this task. The connected Vercel personal/team project listings
were empty. No provider settings were changed or deployments triggered. The
original reported hosted logout under ten minutes remains unreproduced. No
database migration is required for these session changes.

Verdict: the reviewed authentication changes are ready to commit and merge into
main based on local verification. The feature branch still has no commits ahead
of main, so a merge before committing these working changes would deploy nothing.
Include the new backend/browser regression files in that commit, preserve the
unrelated report/DFD work, and do not include ignored local environment secrets.
Production acceptance still requires actual 30/1440 lifetime configuration,
backend-before-frontend rollout and HTTPS-origin smoke checks in DEPLOYMENT.md.

Review checkpoint: "Did this change introduce unnecessary abstractions, extra
state, or new dependencies that existing code already handles?" One retry
record and the existing AuthProvider timer handle recovery. The same API
service and request/account guards remain in use; no additional dependency.
Graphify's AST map was refreshed before shared changes and inbound callers were
inspected. Diagnostics reported zero missing/dangling endpoints, three self-loops
and 385 potentially collapsed undirected same-endpoint edges; active source and
tests supplied caller evidence. Optional SQL extraction was unavailable without
tree_sitter_sql; no dependency was installed.

## 2026-11-12: Sliding refresh authentication on `fix/refresh-token-auth`

Created the branch from `main` at `d5fc07e` after inspecting Git status.
Preserved the pre-existing model-audit report and DFD guide work. No commit,
push, merge, migration, production account write or hosted deployment was part
of this task. The earlier investigation of the reported hosted logout under
ten minutes remains a diagnostic baseline, not a reproduced root cause.

Added 30-minute access JWTs plus configurable 1440-minute sliding refresh JWTs,
with a JSON-body `/api/auth/refresh` endpoint. Login/OTP/registration and
self-service credential replacement return both tokens while preserving the
legacy `token` access alias. Refresh validates the live PostgreSQL account,
profile, role and credential version under the account lock; token types cannot
be interchanged. First-login restrictions and 30-day trusted-device semantics
remain intact. Refresh rotation issues a unique new JWT but has no used-token
ledger: old copies remain valid until expiry or account revocation. Ordinary
logout removes local credentials without blacklisting separately retained JWTs.

The frontend shares renewal across timer/expired HTTP requests, retries a
rejected protected call only once, compensates with exposed HTTP Date headers,
rechecks on tab wake and preserves the logout reason. Logout and failed renewal
preserve durable drafts. Late refreshes cannot restore a logged-out/replaced
session, and expired requests cannot retry as another stored account. Messaging
reconnects without remounting portal children; teacher access updates preserve
both tokens. No new dependencies or generic offline replay mechanisms were added.

### Modified file inventory

| Files | Change |
| --- | --- |
| `backend/config/settings.py`, `backend/.env.example`, `render.yaml` | Positive refresh lifetime exceeding access lifetime; 30/1440 defaults and templates |
| Local ignored `backend/.env` | Changed only token lifetime settings to 30/1440; no secret changes |
| `backend/utils/security.py`, `backend/utils/authentication.py` | Refresh JWT creation, paired session issuance, live refresh validation and structured rejection codes |
| `backend/routes/auth.py`, `backend/schemas/auth.py`, `backend/utils/account_changes.py` | Typed refresh endpoint/response fields, optional logout body, credential replacement documentation |
| `backend/main.py` | Expose HTTP Date through CORS for clock compensation |
| `frontend/src/services/api.ts`, `frontend/src/types.ts` | Token persistence/types, single renewal promise, clock offset, one retry, stale-session guards and reason events |
| `frontend/src/context/AuthContext.tsx` | Proactive renewal/wake scheduling, current user updates, scoped authentication cleanup |
| `frontend/src/context/TeacherContext.tsx`, `frontend/src/context/MessagingContext.tsx` | Update teacher context without replacing tokens; preserve mounted portal/forms on token renewal |
| `frontend/src/pages/LoginPage.tsx` | Accurate expired/revoked/invalid messages |
| New `backend/tests/test_refresh_tokens.py` | Settings, issuance, isolation, renewal, expiration, live revocation, credential replacement and first-login regressions |
| New `frontend/tests/refresh-auth.spec.ts`, `frontend/playwright.auth-security.config.ts` | Desktop/mobile renewal, clock, retry, reason, race and draft regression coverage |
| `frontend/tests/auth-security.spec.ts` | Wait for React mount before manually seeding auth in the isolated draft-replay test |
| `AI_CONTEXT.md`, `AGENTS.md`, `AI_CONTEXT_HISTORY.md` | Current architecture/rules and this dated delivery record |
| Local ignored `docs/AUTHENTICATION_SESSION_FINDINGS.md` | Marked the prior investigation as a historical baseline with links to current guidance |

### Executed verification

- Requested PostgreSQL suites plus refresh tests: **99 passed**, 173 subtests.
  Command: `uv run --no-project --python .venv312 python -m pytest backend/tests/test_batch1.py backend/tests/test_phase2.py backend/tests/test_security_batch2.py backend/tests/test_refresh_tokens.py -q`.
  After extending the expired-access assertion, reran refresh tests: **10 passed**,
  four subtests. Tests create/drop randomized disposable schemas; no school
  records were changed. Existing deprecation/collection warnings were emitted.
- Complete authentication/terms/refresh browser suite: **44 passed** on desktop
  and mobile using `playwright.auth-security.config.ts`. Initial failures exposed
  test seeding races; fixtures were corrected without changing replay rules.
  Browser fixture runs also emitted Engine.IO/Windows connection teardown errors;
  these did not fail the final complete suite.
- Final targeted refresh browser run: **20 passed** across desktop/mobile after
  the page-mount preservation assertion and malformed legacy-token reason check
  were added. Command: `pnpm.cmd exec playwright test --config playwright.auth-security.config.ts refresh-auth.spec.ts`
  from `frontend/`. This overlaps the full suite; the counts are separate runs.
- `npm run build` in `frontend/` passed, including TypeScript and Vite production
  compilation. Both explicit frontend tsconfig checks, targeted ESLint and
  `git diff --check` passed. Final changed frontend files also passed Prettier.
- Refreshed the ignored Graphify AST map before shared changes and inspected
  inbound callers. Graph diagnostics reported zero missing/dangling endpoints,
  three self-loops and 377 potentially collapsed undirected same-endpoint edges;
  source/tests supplied the final caller evidence. SQL extraction was unavailable
  without optional `tree_sitter_sql`; no dependency was installed.

Operational boundary: Render/Vercel were not changed or tested. Deployment needs
matching backend/frontend and backend lifetime configuration, followed by fresh
login to obtain refresh credentials; older access-only sessions retain their
original lifetime. The signed refresh JWTs are browser-readable bearer secrets.

Review checkpoint: "Did this change introduce unnecessary abstractions, extra
state, or new dependencies that existing code already handles?" The shared API
and auth context were reused; request-generation/owner guards prevent cross-session
retries, clock state supports skew compensation, and one promise coalesces renewal.
No additional service layer or dependency was introduced.

## 2026-11-09: Retired branding settings cleanup

Removed `secondary_color`, `profile_pic_url` and `login_background` from the
active ORM, settings responses/updates, Chairman form and frontend context.
The login/registration backdrop now uses the existing bundled image; the
background-upload endpoint is removed. Portal logo uploads and primary-color
customization remain supported. Existing school-settings drafts retain their
values through offline saves/reloads; manual submissions use only current
fields and confirmation still clears only the matching revision.

Prepared explicit `018_retired_branding_settings` in
`backend/migrations/settings_cleanup.py` and registered it in fresh bootstrap.
The new backend tolerates the three old columns until the ledger records 018,
so the matching backend/frontend can be deployed before dropping columns.
Historical Phase 1 retains the old shape for upgrade compatibility. Migration
018 locks the ledger/settings table, drops only the named columns without
CASCADE, verifies all remaining settings values and commits its ledger entry
transactionally. Dependency conflicts and caller rollback preserve the old
columns/data. Repeat applies validate without additional writes. Older
encrypted backups discard exactly the three retired settings keys; other
unknown settings keys remain invalid.

Updated current guidance and the four ERD artifacts. The intended full schema
has 17 tables/135 columns/18 foreign keys after 018; the defense diagrams omit
only the migration ledger and contain 16 tables/133 columns/18 foreign keys.
The existing `.gitignore` change was preserved; `docs/` remains ignored.

Executed verification:

- Focused `backend/tests/test_settings_cleanup.py`: **6 passed**, covering
  pending/applied schemas, settings/logo behavior, migration repeatability,
  preservation of other tables, dependent-object refusal, transaction rollback,
  old encrypted backup imports and strict rejection of unknown settings keys.
- Full `uv run --no-project --python .venv312 python -m pytest backend/tests -q`:
  **534 passed, 666 subtests passed** in 1312.51 seconds. Ten warnings concern
  Starlette deprecations and imported `TestingPeriod` enum collection; no test
  failures occurred.
- Playwright `playwright.parent-sync.config.ts`, `offline-scope.spec.ts`,
  `--grep 'retired branding'`: **4 passed** across desktop and mobile, covering
  the bundled background and old draft preservation/manual submission.
- Both explicit TypeScript project checks, scoped ESLint (the four changed
  source files and browser spec), and `pnpm.cmd --dir frontend run build`: passed.
- Offline PostgreSQL DDL compilation and model-to-ERD table/column/FK checks:
  passed. Current Python AST imports and TypeScript AST mapping (82 files,
  50 inbound imports to affected shared modules) were inspected; no retired
  frontend property accesses remain. `git diff --check`: passed.

No production migration, deployment, dataset regeneration, model retraining,
artifact replacement or dependency installation was performed. Tests used
disposable PostgreSQL schemas and mocked browser APIs. No ERD renderer/import
was run. Apply 018 only after deploying the matching code, retaining a protected
database backup and stopping API writers; the check/apply/check procedure is in
`backend/migrations/README.md`. An older backend cannot run after the drop;
recovering retired branding values requires the pre-upgrade database backup.

---

# AMES System: Current Codebase Context

Appended checklist sections and supplementary results (2026-11-07): individual
student workbooks now contain one CHECKLIST sheet. Overflow questions in the
seven standard domains appear first, followed by custom domains, in copied
Gross Motor panels with up to 13 questions. Pages fill the three native panel
positions, repeat school/year/student/section/adviser identification, retain
answer timestamp comments, and extend the print area with horizontal breaks.
Long questions increase row heights and can leave unused panel slots to keep
the panel together. Custom ISKOR rows contain literal KAYA/configured-question
ratios or an em dash for unassessed periods. The appended Custom Domain Results
— Supplementary table shows configured counts and KAYA/answered counts for
each period; unanswered questions are never inferred as DI-KAYA. These counts
include saved parent observations visible to staff and require no official date
or birth date. Official DepEd conversion tables and original-domain scoring are
unchanged. Custom records cannot supply official checklist/summary score dates
or summary header dates, block ML readiness, confirm official PRE completion,
or enter prediction dates, features or item positions. Summary layouts and
custom continuation sheets remain otherwise unchanged. No migration, template
asset, API shape, assessment record or durable-draft change is part of this work.

Append verification: the final full active backend run passed 528 tests and 667
subtests; the requested two workbook modules passed all six tests. All 33 export
browser cases passed across desktop/tablet/mobile, including the extended
preview. Both frontend TypeScript projects, standalone browser-test typing,
changed-file ESLint/Prettier and git diff --check passed. Native Excel opened
the final synthetic workbook normally in read-only mode, with one CHECKLIST
sheet and six printed pages; appended panels and the supplementary table were
inspected in the exported PDF. Review artifacts are in the ignored
frontend/test-results/eccd-append-verification directory. Tests used synthetic
SQLite records and disposable PostgreSQL schemas. Existing dependency
deprecation and enum collection warnings remain.

Automatic question ordering and continuation exports (2026-11-07): question
management no longer accepts manual ordering through the form. Create and
cross-domain moves allocate max(sequence_order)+1 under a destination-domain
row lock; legacy API sequence inputs are optional and ignored. Text/home edits
keep their position; gaps are preserved. Migration 017 explicitly upgrades
idx_questions_domain_sequence to a unique domain/sequence index, reports
existing duplicate IDs without changing records, and is registered by bootstrap.
Startup checks 017 and still automatically applies only 016. See
backend/migrations/README.md before restarting an existing database.
Individual downloads bound the original checklist mappings and append native
panels within the main CHECKLIST, as described above. Summary exports retain their
ten base sheets and append copied domain layouts for overflow groups, with
whole-domain totals. Custom domains appear on continuation sheets without new
official scoring codes. Preview HTML includes the extended main CHECKLIST. Existing
IDs, evaluations, draft keys, template assets and scoring rules are preserved.
Verification: the full active backend suite passed 520 tests and 667 subtests;
the subsequently added external-writer conflict regression passed separately
(521 distinct tests overall). All 34 browser cases passed: four chairman/teacher
ordering/draft checks on desktop/mobile and 30 existing export checks on
desktop/tablet/mobile. Both frontend TypeScript projects, standalone browser-test
typing, changed-file ESLint/Prettier, production build and git diff --check pass.
Native Excel opened the generated synthetic checklist (8 sheets) and summary
(17 sheets) normally in read-only mode. Migration 017 was applied and checked
on the configured local development database after finding no duplicate groups;
existing question numbering and school records were preserved. Other databases
still require the explicit migration before starting this version. Existing
dependency deprecation and enum collection warnings remain.

ECCD summary domain sheets (2026-11-07): the summary template and shared
`backend/utils/excel.py` generator now export PR, M, PO, GMF, FMF, SHF, RLF,
ELF, CF, SEF, in that order. The seven domain sheets include all genders,
repeat the cohort roster and metadata across horizontal page blocks, and use
numeric 1 for recorded K/D marks in PRE/MID/POST. Parent observations appear
as marks; official raw scores reuse PR/M/PO's teacher-date and birth-date
requirements and scorer. Section/year filtering, archived cohorts, ownership,
30-student ZIP batching, API contracts and database schemas are unchanged.
The blank asset preserves the source layouts, removes Info Sheet formulas and
sample marks, corrects FMF/RLF raw-score period labels, and registers copied
cell and dimension styles in the destination workbook. Its SHA-256 is recorded
in `backend/assets/templates/manifest.json`. Regressions are in
`backend/tests/test_checklist_workbook.py` and `backend/tests/test_eccd_exports.py`.
Native Excel opened both the template and a generated synthetic export normally;
the existing export browser suite passed all 30 desktop/tablet/mobile cases.
Final verification: the clean full backend run passed 512 tests and 667
subtests; all 18 workbook/card export regressions passed. Both frontend
TypeScript projects and `git diff --check` passed. Existing dependency
deprecation and enum collection warnings remain.

Updated: **2026-11-07**. This document describes the active working tree in
`backend/` and `frontend/`, including existing uncommitted changes. Local
configuration observations are a snapshot, not deployment defaults or a claim
that every workflow has passed testing. This refresh checked active source,
manifests, migration modules, browser-test configurations, and Git tracking.
Installed Python metadata, local settings, model inspection, and earlier test
results retain their explicitly recorded dates. Update this context when code
changes.

Sections **1–11 are the authoritative current-state summary**. Section 12 is a
historical implementation and research archive: its dated behavior, commands,
experiments and test counts describe earlier work and do not override sections
1–11. Active source, manifests, schemas and migrations establish the contracts.
Dated delivery notes and test counts anywhere in this document describe their
recorded runs; they are not fresh verification of the current working tree.

The 2026-11-05 branch review and current verification outcomes are recorded in
`MERGE_READINESS_AUDIT.md`. Earlier results below remain historical observations.

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

Staff LRN parity follow-up (2026-11-05): the staff correction regression now
asserts that authorized student-detail responses return the corrected
`lrn_number`, matching the documented staff-only plaintext exception. The
requested `backend/tests/test_parity.py` run passes all 11 tests and 90 subtests
with two dependency deprecation warnings. No application behavior changed.

Teacher-to-parent ACL repair (2026-11-04): Teacher Settings hydrates from the
server response and overlays only explicitly present boolean fields from a
matching-owner draft. New drafts and PUT payloads contain accumulated pending
permission changes; legacy full/partial drafts remain readable. Missing fields
preserve server values, explicit false remains false, and revision/owner guards
preserve newer work across stale responses and account changes. Manual retries
remain required after failures or reconnection; only HTTP 200/201 can confirm a
matching revision. `ChildPublicResponse` now includes `allow_parent_predictions`
with default false, matching the existing enrolled-section adviser resolver.
Regressions cover draft hydration, partial saves, unconfirmed responses, all eight
persisted flags, child-response parity, transfers, handovers and unchanged
assessment history. Layouts, markup, database models, routes, score formulas and
Philippine-time rules are unchanged.

ACL verification: both frontend TypeScript projects, standalone typing of the
changed browser tests, full lint and production build pass. The parent-sync suite
passes 94 cases and parent-assessment passes 33. Parent-ML passes 10 initially;
two inference/test-timeout cases pass on a focused rerun, including all 12 unique
ML cases overall. The updated manual-retry case passes on desktop and mobile in
the initial run. Full `backend/tests` finishes with 499 passed, 655 subtests
passed and the previously documented
`test_staff_lrn_correction_retains_student_links_and_masking` failure. Its staff
LRN response is outside this ACL repair. Database-backed tests use disposable
schemas; no live school records or migrations were changed.

Home assessment locks and dates (2026-11-04): parent home answers are immutable
per question/period for all linked parents. Identical retries are no-ops;
conflicts return 409 before writes. Separate batches retain separate server save
timestamps. Parent confirmation cancellation and failures retain device drafts;
reconnection never submits parent work automatically. The Overview shows neutral
locks even when another parent's mark is masked. Teacher saves compare final
marks with database records: equal marks confirm officially while retaining
parent provenance; changed marks require explicit `edited_question_ids` when
parent history exists, and record `teacher_marked_at`. Later equal saves do not
change that timestamp. Parent history remains in `parent_submitted_at`.
Timestamps and parent-only grading fallback dates use Philippine time; official
teacher dates still take priority and age/scoring/mastery formulas are unchanged.
Migration 016 is the sole automatic additive startup migration (nullable
TIMESTAMPTZ); bootstrap also registers it. Other migrations remain explicit.
Backups accept the optional timestamp and checklist exports include timestamps
as answer-cell comments without changing official cells. Imported equal marks
preserve attribution; imported corrections record actual server save time.
This supersedes the older overwrite/startup descriptions below.

Verification for this change: both frontend TypeScript projects, standalone
typing of the changed browser suites, full lint, production build and formatting
pass. The 33 parent browser cases and 22 teacher/replay cases pass, with parent
coverage and teacher attribution checks at desktop/tablet/mobile sizes.
Seven new PostgreSQL regressions pass, including actual startup migration,
immutable dates/locks, stale requests, permission masking and backup/workbook
provenance. The full 497-case backend run completed with 493 passes and four
failures; after updating three obsolete audit/startup/retry assertions, the
failed-case rerun passed eight cases and retained only the previously documented
`test_staff_lrn_correction_retains_student_links_and_masking` failure. No live
school records were changed; PostgreSQL checks use disposable schemas and
browser checks mock APIs.

Offline submission scope (2026-11-04): automatic replay is restricted inside
`utils/drafts.ts` to authenticated teacher sessions (`admin`) and owner-scoped
teacher ECCD keys targeting exactly `POST /api/eccd/evaluate`. Key owner, student
and period must match the stored request. Parent/chairman sessions, home
observations, other forms and uploads never replay on login or reconnection.
Existing records remain untouched in localStorage/IndexedDB and require manual
review and submission. Non-ECCD failures show "Your draft is saved on this device.
Reconnect and submit again." Teacher access/period settings expose explicit retry
buttons while retaining immediate saves for deliberate online switch changes.
Sandbox failures also wait for explicit retry, including after reload. The shared
status banner reserves automatic-sync wording and its sync button for eligible
teacher ECCD submissions. Teacher answers, dates, student switching, reload
recovery, revision-safe confirmation and the online/offline pill are preserved.
No backend routes, schemas or database changes are part of this scope restriction.
This scope supersedes earlier reconnect-sync descriptions for non-ECCD forms.

Scope verification: both frontend TypeScript projects, standalone browser-test
typing, lint and production build pass. All 110 relevant browser checks pass,
including teacher offline recovery/replay, non-ECCD manual retries, retained
legacy queues/files, parent permission guards and newer-revision preservation.
Root pytest collection encounters duplicate archived ML test modules; active
`backend/tests` completes with 489 passing and the previously documented staff
LRN masking test failure. No backend source was changed for this scope task.

Shared dashboard requests (2026-11-01): `TeacherProvider` owns teacher access
controls, section inventory and dashboard filters, exposes their cached state
and a shared `refresh`, and updates session assignment/permission fields without
restarting its loading effect. Teacher dashboard filters reuse that context.
Analytics wait for validated assignment/filter initialization even when an old
section is cached locally. The super-admin dashboard remains in
`pages/chairman/Dashboard.tsx`; its analytics wait for filters and, when needed,
the settings school-year fallback. Both dashboards keep explicit PRE defaults.

`services/sharedGet.ts` coalesces concurrent GETs by session token, path and
parameters, including Strict Mode effect replay. Providers retain loaded data;
the helper evicts settled requests (including failures), so later refreshes
reach the server. Consumers independently ignore superseded responses instead
of cancelling a shared request. `SettingsContext` remains the single global
settings owner and keeps its existing explicit refresh contract. Backend paths,
response shapes, scoring, component props and durable drafts are unchanged.
Request-count regressions live in the existing teacher/chairman dashboard
browser suites and cover delayed filters, cached assignment changes, session
updates, overlapping focus/online refreshes and a delayed settings fallback.
Verification: both frontend TypeScript projects, full lint, production build,
formatting and whitespace checks pass. All 24 teacher/chairman dashboard browser
cases pass across desktop and 320px phone runs using mocked APIs. Existing
transient Recharts zero-size warnings remain; no live database was used.

Teacher dashboard cards and period insights (2026-11-01): the dashboard now has
four centered, equal-height cards: Total Students, Assessment Progress, Domain
of Excellence and Critical Domain Focus. Priority Intervention is removed from
this view; its existing API field remains compatible. Shared Tailwind
card utilities use a 1/2/4-column grid at base/sm/lg; the redundant unlayered
teacher grid-cols-1 rule was removed because it overrode responsive utilities.
The duplicate unread-message KPI and read-only Section filter are removed.
The header owns the PRE/MID/POST selector; ECCD Development retains only Domain.
School Year shows the configured current year; historical year filtering is not
supported by the teacher dashboard hook. Requests send the assigned section ID;
owner/section/period/domain keys and request guards prevent stale responses from
crossing selections.

Teacher dashboard polish (2026-11-01): the two domain badges share percentage
formatting, borders and padding: excellence shows masteryRate% Kaya; critical
shows totalDiKaya / totalItems as a percentage rounded to two decimal places.
Both use existing exact-period teacher insight fields without changing backend
schemas or ranking. ECCD Development reserves a non-shrinking responsive square
for the donut, with chart margins and an aspect-based ResponsiveContainer.
Separate Total Kaya / Total Di-Kaya pills replace the in-chart legend and use
the existing selected-section/domain/period chart counts. Confirmed empty chart
responses show zero totals; loading and errors do not show confirmed count pills.

Polish verification: both frontend TypeScript projects, standalone browser-test
typing, full lint, production build and changed-file formatting pass. All 40
mocked-API teacher dashboard browser cases pass at 320/640/768/1024/1440px,
including four-card sizing, percentage badges, donut sector bounds, reactive
count pills, all three completion subtitles and existing scope/draft guards.
Desktop, laptop and mobile screenshots were inspected. No live records or
backend/schema changes were needed.

Teacher dashboard pending evaluations (2026-11-01): `PendingEvaluations.tsx`
replaces the lower unread-message feed. The two lower panels share equal-width,
equal-height columns at lg and stack below it. The section badge matches the
40px header controls, and empty KPI captions use "No period data". Compact footers wrap without ellipses;
semantic badges use smaller type at narrow desktop widths.
`usePendingEvaluations.ts` reads the existing `/api/eccd/students`,
`/api/eccd/domains-progress` and `/api/eccd/student/{student_id}` contracts;
there are no backend or database changes. It waits for assignment initialization,
filters active students to the assigned section, and requires a teacher date on
every configured question, matching the progress KPI. Partial and parent-only
records remain pending. All three periods are derived from the same records;
period and domain changes do not refetch the pending roster. Student reads use
at most four concurrent workers, coalesce overlapping GETs, and ignore superseded
owner/section responses. Focus, reconnection and confirmed draft sync revalidate.
Loading, failed reads, no students, no configured questions and all-complete
states remain distinct. Nonempty rosters with all configured questions
teacher-confirmed show a centered check-circle, "All Evaluations Completed"
and a subtitle naming the selected period; empty rosters never claim completion.
The max-h-64 scrolling list displays masked LRNs only.
Assess links pass student ID, period and the first incomplete domain to
`EccdAssessment.tsx`; it validates the student against the current roster before
opening the sheet once. Existing draft loading/saving and manual selection are
preserved.

Verification: both frontend TypeScript projects, browser-test typing, full lint,
production build, formatting and whitespace checks pass. Browser coverage uses
mocked APIs at 320/640/768/1024/1440px: 30 status/scope/request/scrolling cases
passed, and all 10 layout/navigation cases passed after the compact-caption
adjustment. Checks include partial and parent-only work, exact-period links,
empty/error/loading states, bounded concurrent reads, section reassignment,
equal panel dimensions, unclipped captions and draft preservation. Desktop,
laptop and mobile screenshots were inspected. No live school records were used.

The existing teacher stats aliases add optional typed `teacherInsights` when
`period` is supplied. Queries reuse the current ECCD evaluation/question/domain
joins, restrict active students to active Primary Adviser assignments and the
requested section, and never fall back to another period. Progress counts
students with every configured question teacher-dated in that period, divided
by active enrollees. Domain mastery uses Kaya / recorded items (including partial
and parent observations, matching the existing pie query); critical focus ranks
recorded Di-Kaya counts. Domain ties resolve alphabetically, then by domain ID.
Priority selects the student with the most recorded Di-Kaya items, with stable
surname/first-name/ID ties; it is a checklist support indicator, not an official
developmental interpretation. Empty periods and zero Di-Kaya states are distinct.
Existing legacy stats/critical-domain fields and omitted-period behavior remain
compatible. No database fields, migrations, official scores or drafts changed.

Verification: 40 isolated SQLite ORM/HTTP/scoring-asset checks and 20 mocked-API
browser checks pass across 320/640/768/1024/1440px, including active assignment
and section gates, period isolation, completion/date requirements, rankings,
filter changes, stale/error protection, equal cards and draft preservation.
Both frontend TypeScript projects, full lint and production build pass. Browser
sources/config are `frontend/tests/teacher-dashboard.spec.ts` and
`frontend/playwright.teacher-dashboard.config.ts`; screenshots are in ignored
`frontend/test-results/teacher-dashboard/`. No live PostgreSQL or school records
were used for verification.

Chairman dashboard personalization (2026-11-01): branding reuses the existing
Tailwind `brand` token (`--primary-color`, fallback #2563eb). System Personalization
continues saving `primary_color` through `/api/settings/update` and refreshing
SettingsContext, which updates the root CSS variable. Count-card icons/tints/top
borders, all five dashboard selects, the Section Totals header and active Chairman
navigation now follow that color. Shared Chairman primary buttons also use brand;
select branding is opt-in so unrelated form appearances remain compatible.
Tailwind opacity utilities supply theme tints/rings without new inline styles.
The Chairman canvas is slate-50; dashboard cards retain white surfaces with
slate-200/80 borders, rounded-2xl corners and soft shadows. Excellence/Kaya stay
emerald, critical/Di-Kaya stay rose/red and intervention stays amber. Analytics,
filter state, settings persistence and scoring formulas are unchanged.
Verification: both frontend TypeScript projects, standalone browser-test typing,
lint, production build, formatting and whitespace checks pass. Eight existing
mocked-API desktop/mobile dashboard cases pass; two new theme cases pass after
correcting test locators and browser color normalization. They cover live color
updates, settings reloads, fallback, selector focus/selected states, navigation,
table tint and stable semantic colors. Desktop/mobile screenshots were inspected.
No live school data or backend changes were needed for this presentation work.

Teacher section picker (2026-11-01): Add/Edit Teacher uses the extracted
`components/chairman/SectionPicker.tsx`. Its popover keeps Select a Section
and + Add New Section outside a max-h-56 scrolling list, with viewport bounds,
thin scrollbar, keyboard navigation and selected-item highlighting. Per-row
Edit/Delete actions do not select the section. Inline name editing supports
Save/Cancel, Enter/Escape, focus restoration and a saving lock. Owner/section
scoped `section_rename_{id}` durable drafts retain failed/offline inputs and use
the existing reconnection queue; newer revisions survive older confirmations.
Manage Access retains its assignment selector with bounded scrolling.

New super-admin-only `PUT /api/sections/{section_id}` accepts a name-only
`SectionRename` payload, trims whitespace, requires 1–100 characters and rejects
case-insensitive existing names with HTTP 409. It updates the section and cached
student/current-adviser labels and records UPDATE_SECTION in the same transaction.
Section IDs, assignments, students, assessments and editing windows stay intact;
there are no schema or scoring changes. Teacher/section directories refresh only
after confirmation. Existing create/delete/assignment paths remain unchanged.
Verification: both frontend TypeScript projects, standalone browser-test typing,
full lint, production build, formatting and whitespace checks pass. Three new
real-API backend tests and all 22 teacher-management browser cases pass against
disposable PostgreSQL schemas at desktop/mobile sizes. Coverage includes a
14-section list with a 600px viewport, pinned header/footer, keyboard selection,
rename validation/conflicts, loading isolation, reload/offline draft recovery,
real reconnection persistence and existing account/handover regressions. Desktop
and mobile popup screenshots were inspected. No school records or migrations
were changed.


Chairman unified assessment filters (2026-11-01): the header now owns the
School Year, Section and Assessment Period (PRE default, MID, POST) selectors.
Both stats and pie requests send the same period; card-level period controls
and Latest Completed are removed from this view. Only Interpretation remains
on Developmental Summary and Domain on ECCD Progress Overview. Header filters
stack on narrow phones, share three columns from sm, and share the title row
from xl so labels do not collide at laptop widths.

The stats API adds optional validated `period` using TestingPeriod. When supplied,
all Chairman assessment KPIs and the developmental summary use that period,
active students and the selected year/section. Total Students counts active
enrollees with any recorded assessment in that period; no assessment means no
contribution. Teacher counts retain active-account/section-assignment semantics.
Domain of Excellence keeps its full teacher-confirmed completion rule, limited
to the chosen period, without falling back. Critical/priority KPIs and the donut
retain recorded-item aggregation, limited to the selected period. Omitted
`period` preserves existing behavior and `delay_period` compatibility; an explicit
global period takes precedence. Teacher dashboard behavior is unchanged.

Summary interpretation tiers (2026-11-01 follow-up) now use the five official
`eccd_scoring_data.json` keys: Delay, Slight Delay, Average (default), Slight
Advance and Highly Advance. A shared frontend constants map displays the last
two as Slight Advancement and Highly Advancement while sending the exact JSON
keys. The API matches each tier separately in the existing scoring pass; the
advancement bands are no longer combined in this view. Existing query aliases
(including Average Development, Significant Delay, Advanced Development and
Delayed / Needs Support) remain compatible; the two Advancement display names
are also accepted aliases. Canonical values are case-sensitive and invalid
casing is rejected by query validation. No scoring formula, database field or
migration changes. Both All Sections and selected-section views show the
same Section Name/Male/Female table, including zero rows, filtered count summary
and bounded max-h-72 scrolling. The selected-student response remains compatible
but is no longer rendered here. The redundant scope helper note is removed.
All five dashboard selects opt into the shared Select's constrained menu mode:
max-h-48, vertical scrolling, thin scrollbar, viewport width cap and wrapped long
options. Existing keyboard navigation, focus restoration and selected highlighting
remain; other Chairman views retain their previous menu size behavior.
Five-tier follow-up verification: both frontend TypeScript projects, standalone
browser-test typing, lint, production build and formatting pass. All 34 isolated
dashboard/scoring-asset tests pass, covering JSON tier parity, exact/alias query
validation, disjoint advancement bands, gender totals and period/year/section
scope. Eight distinct mocked-API browser cases pass across desktop/mobile
runs, including every tier's request key and count, default Average, global
filters, stale/error protection and keyboard-visible selections in bounded
menus. Default desktop/mobile screenshots were inspected. No live database or
migration was used.
Verification: both frontend TypeScript projects, standalone browser-test typing,
full lint, production build, formatting and whitespace checks pass. All 32
isolated SQLite dashboard regressions and all 20 mocked-API browser cases pass
at 320/640/768/1024/1440px. Coverage includes global period/year/section requests,
period-specific KPI cohorts, completion/no-fallback rules, grouped delay labels,
single-section gender rows, stale/error protection and bounded keyboard-operated
menus. Desktop, laptop, mobile and scrolled-menu screenshots were inspected.
Existing transient Recharts zero-size warnings remain; final geometry checks
pass. No live PostgreSQL verification or migrations were needed.


Chairman dashboard filters (2026-11-01): School Year and Section controls now
live in the dashboard header and scope every statistics/chart request and the
delay summary. The year defaults to the active setting; All Years remains
available. Analytics filters preserve the existing name lists and add typed
`sectionOptions` (ID/name) and `currentSchoolYear`. Stats and pie routes accept
an optional positive `section_id`, taking precedence over the compatibility
section name; teacher assignment restrictions still apply. Section has no
active-status or grade column, so the dropdown uses the current section inventory.

The fifth card, Domain of Excellence, reads typed `excellingDomain` from the
existing analytics stats endpoint. It ranks domains by KAYA items / total items
across active, assigned students' latest completed teacher-confirmed assessments
(POST > MID > PRE), reusing `latest_completed_periods` in dashboard_analytics.py.
Section/year filters apply, ties resolve alphabetically, and no completed data
returns no domain/rate; genuine zero mastery remains 0%. The five cards use a
responsive 1/2/3/5-column Tailwind grid (base/sm/md/xl), with equal-height cards
and shared header, metric and footer slots, including hidden count-card footers.
Delay counts retain official scoring and replace
the section card list with a scrollable, keyboard-accessible table. Failed or
superseded requests cannot display prior-scope metrics. No migration is needed.
Regression sources: `backend/tests/test_dashboard_analytics.py`,
`frontend/tests/chairman-dashboard.spec.ts`, and the explicit
`frontend/playwright.chairman-dashboard.config.ts` (mocked API, three viewports).
Verification: 18 isolated SQLite ORM/route/scoring regressions and all six
mocked-API browser checks pass at 320/768/1440px. Both frontend TypeScript
projects, standalone browser-test typing, full lint, production build and Git
whitespace checks pass. No live PostgreSQL integration run was performed.

Chairman dashboard layout follow-up (2026-11-01): the domain performance
breakdown, its types/state and per-domain fan-out requests are removed. Delay
summary and ECCD progress share equal-width, equal-height columns at lg and
stack below it. Delay gender badges stay in two columns; the keyboard-accessible
section table is bounded by max-h-56 with smooth vertical scrolling. The donut
uses a responsive square wrapper centered in the remaining progress-card area.
Layout rules use Tailwind utilities; analytics calculations and API contracts
are unchanged. Browser regressions cover all four stat-column counts and the
lg two-panel breakpoint using mocked responses.
Follow-up verification: both frontend TypeScript projects, standalone browser
test typing, full lint, production build and all ten browser checks pass at
320/640/768/1024/1440px. Browser captures use reduced motion. The run emits
Recharts zero-size warnings during updates; final chart size/centering checks
and screenshots pass. No backend changes were required for this layout work.

Chairman stat-card follow-up (2026-11-01): cards now appear as Total Students,
Total Teachers, Domain of Excellence, Critical Domain Focus, Priority Intervention.
The two domain badges share percentage formatting and compact border/padding;
green shows Kaya and rose shows Di-Kaya. The optional calculated analytics field
`criticalDomainDiKayaRate` uses the existing critical-domain selection and its
domain-specific total, with the same section/year/period scope as that selection.
It does not change the existing critical ranking or the excellence calculation.
No critical domain returns no percentage rather than a fabricated zero. Card
footers reserve a compact shared slot; no schema migration is required.
Verification: 20 isolated SQLite analytics regressions and ten mocked-API browser
checks pass at 320/640/768/1024/1440px, including badge symmetry, card order,
section/year updates, empty results and stale/error handling. Both frontend
TypeScript projects, full lint and production build pass. No live database
verification was performed.

Chairman presentation polish (2026-11-01): the global School Year/Section pair
shares the heading row on desktop and remains side-by-side below the heading
on smaller screens. Student/teacher count cards center their content and show
Active Enrollees/Assigned Advisers captions. The centered ECCD donut now displays
exact recorded checklist-item counts from the existing pie response; these are
items, not unique-student counts. With explicit approval to extend the existing
summary API, `delaySummary.students` contains student ID, name, assessment-date
decimal age and official delay interpretation for a selected section; All
Sections returns an empty detail list and retains the compact section totals.
Details reuse the exact existing scoring/count loop and latest completed,
teacher-confirmed period selection, with no extra requests or database fields.
The UI labels the official `Delay` interpretation as Significant Delay. Empty,
unavailable and loading states remain distinct. No migration is required.
Verification: 22 isolated SQLite analytics tests and ten mocked-API browser
checks pass at 320/640/768/1024/1440px, including the context-sensitive student
list, empty results, header placement, captions and exact item totals. Both
frontend TypeScript projects, full lint, production build and whitespace checks
pass. No live PostgreSQL verification was performed.

Chairman delay-period selector (2026-11-01): Developmental Delay Summary defaults
to Pre-Test (BoSY), with Mid-Test (MoSY), Post-Test (EoSY) and Latest Completed
options. The existing stats endpoint accepts optional `delay_period`, validated
with the existing TestingPeriod enum. Explicit periods use the summary export's
recorded-answer scoring, official teacher date and assessment-date decimal age;
partial recorded periods can be scored, while absent periods, missing birth
dates and parent-only dates are excluded. Counts and selected-section student
details share the same scoring loop. Omitting the parameter retains the existing
latest completed, teacher-confirmed POST > MID > PRE behavior for compatibility.
The parameter affects only delaySummary; other cards and the donut keep their
existing scopes. Section/year filters always apply and inactive students remain
excluded from delays. The shared MainLayout sidebar and desktop content offset
now use w-60/ml-60 with compact navigation, 18px icons and a 40px logo; the
existing 900px desktop breakpoint and mobile drawer behavior remain in place.
No database fields or migration are required.
Verification: 26 isolated SQLite analytics regressions pass, including direct
PRE/MID/POST comparisons with the actual summary workbook, missing/partial
periods, scope preservation and enum rejection. Fifteen mocked-API browser
checks pass at 320/640/768/1024/1440px, covering sidebar geometry/mobile drawer,
default PRE, period-specific totals/details, independent donut filters, stale
responses and failed requests. Both frontend TypeScript projects, full lint,
production build and whitespace checks pass. Desktop/mobile screenshots were
reviewed. No live PostgreSQL integration run was performed.

Chairman interpretation selector (2026-11-01): the card is now Developmental
Summary and defaults to PRE + Average Development. Its four interpretation
options are Average Development, Slight Delay, Significant Delay and Advanced
Development; there are no combined/all options. The optional validated
`interpretation` query parameter on the existing stats API filters the scored
cohort, gender counts, zero-inclusive section rows and selected-section student
details in the same aggregation pass. Display categories map to the unchanged
official scoring labels: Average, Slight Delay, Delay, and both Slight Advance
and Highly Advance (including the export's Advanced aliases), respectively.
Explicit period export scoring and latest-completed selection remain unchanged.
School year/section and active-student scope still apply. Only delaySummary is
affected; other cards and donut calculations/requests are independent.
`totalMatched` is additive and counts the selected category; `totalDelayed`
continues to count actual matching delay results and is zero for development
categories. Selected students retain official labels in the compatibility
`delayStatus` response field, now a string as in the evaluation schema. Omitted
interpretation preserves the previous delay-only API behavior. UI labels,
subtitle, summary text and emerald/rose badge tones follow the selected category.
The section table retains max-h-56 scrolling. No tables, formulas or migrations
changed.
Verification: 28 isolated SQLite analytics tests pass, including category/period
comparisons with the actual export workbook, official-label mapping, scope
preservation and invalid interpretation rejection. All 20 mocked-API browser
cases pass across the initial run and a focused rerun after correcting a test's
ambiguous Males/Females locator. Coverage spans 320/640/768/1024/1440px, the four
options/defaults, paired filters, section details, independent donut requests,
late/error handling, bounded tables and responsive symmetry. Both TypeScript
projects, full lint, production build, formatting and whitespace checks pass.
Desktop/mobile default-state screenshots were inspected. The existing transient
Recharts zero-size warnings remain; final chart checks pass. No live PostgreSQL
integration run was performed.

Chairman section gender breakdown (2026-11-01): Developmental Summary's
All Sections table now shows Section Name, Male and Female, replacing Student
Count. The existing stats API's `delaySummary.bySection` maps each section name
to a typed `{male, female}` object instead of a scalar total. Both counts use
the existing Student.gender enum (Male/Female), accumulated in the same scoring
pass as the overall badges after period/interpretation matching; no additional
queries, scoring calls or frontend student-data fetches are required. Zero-count
sections remain present. Unknown genders are not guessed into either column;
`totalMatched` still counts all matched students, so the summary text remains
accurate. School year, section, active-student scope, official scoring and the
selected-section student list remain unchanged. The table retains max-h-56
scrolling and uses aligned numeric columns with subtle uppercase headers. No
database schemas or scoring formulas changed.
Verification: 29 isolated SQLite analytics tests and all 20 mocked-API dashboard
browser cases pass. After applying Tailwind typography to the header cells to
override inherited shared-table styling, all five focused interpretation/table
cases also pass at 320/640/768/1024/1440px, covering per-section gender values,
zero rows, sums matching badges, paired filters, header typography/alignment and
responsive bounds. Both TypeScript projects, full lint, production build,
formatting and whitespace checks pass. Desktop/mobile screenshots were reviewed.
The existing transient Recharts size warnings remain; no live PostgreSQL
integration run was performed.

Chairman summary presentation (2026-11-01): the standalone Males/Females
badges are removed. Section Totals (or Matching Students for a selected section)
now follows the dynamic subtitle directly, retaining the filtered count summary
and using max-h-72 vertical scrolling. The shared equal-height two-column layout
with ECCD Progress Overview remains. Badge-only background tone logic and its
redundant layout wrapper are removed; selected-student interpretation colors,
API payloads, filters, gender aggregation and backend queries are unchanged.
Verification: both frontend TypeScript projects, full lint, production build,
formatting and whitespace checks pass. All 20 mocked-API browser cases pass at
320/640/768/1024/1440px, including badge absence, bounded table scrolling,
filtered counts/details and equal desktop panel heights. Desktop/mobile
screenshots were inspected. Existing transient Recharts size warnings remain;
no backend changes or live database verification were needed for this UI work.

Batch 4 (2026-10-31): Parent Overview now ends with a unified Home-Based
Assessment form. It groups every configured home item by domain, repeats a
domain badge per question, and submits the selected open period through the
existing `useParentAssessment` hook and `/api/eccd/parent/evaluate` endpoint.
The Home Checklist shortcut scrolls to this form. Existing owner/student/period/
domain draft keys, revision-safe confirmations and reconnect synchronization
remain in use. Global home-edit permission and section period windows both gate
submissions; denied requests retain answers.

Parent ECCD Assessment keeps the official summary and replaces the editable
checklist with read-only ECCD Checklists. Domain cards contain only domain names
and View Domain actions. Details group that domain's home and school questions
and show only server-saved results, without draft overlays or inferred answers.
Independent checklist-marks permission gates the complete breakdown; score
release remains independent. Both parent pages refresh assessment access every
20 seconds in visible tabs and on focus, visibility and reconnection. No backend
route, schema, permission-column or database changes are required.

Verification: all 24 mocked-API browser checks pass at 320/768/1280px, covering
home-only batches, child isolation, reload/reconnect, denied saves, revision-safe
confirmation, saved-only domain results and access revocation. App/tooling
TypeScript, full frontend lint and production build pass. Requested full backend
discovery was attempted and reports 36 errors among 50 discovered cases due to
missing required application settings and missing ML dataset files. This is not
a configured PostgreSQL integration run. Browser configuration and regressions
are in `frontend/playwright.parent-assessment.config.ts` and
`frontend/tests/parent-assessment.spec.ts`; screenshots are under
`frontend/test-results/parent-assessment/`.

ECCD card preview framing (2026-11-03): `EccdCardPreviewDialog.tsx` uses
`w-[92vw] max-w-6xl max-h-[92vh]` with a compact `h-8` student selector and
Previous/Next buttons in the header beside the dismiss button. Navigation uses
the existing roster order and student-ID selection state, disables both buttons
without an eligible selection and stops at the first/last student. The toolbar
wraps below the title on phones; the separate body selector and helper text are
removed to expand the document viewport. The slate viewer is the sole scrolling
container around a `w-fit min-w-[980px]` white sheet. The extracted
`EccdCardPreviewDocument.tsx` applies isolated compiled Tailwind utilities inside
the existing iframe. Its dimensions fit the loaded document, and `zoom-50`
frames the wide workbook within desktop dialog bounds. The sandbox grants only
same-origin document access for measurement; scripts remain disabled and the
server CSP stays intact. Compact headers, workbook content, merged spans,
colgroup values, saved-record reads, request cancellation, scoring and durable
drafts are preserved. Small screens scroll the complete sheet in the outer
viewer. The browser login fixture runs only in the top-level page so iframe
loads do not reset its mock session.

Header-navigation verification: app/tooling and browser-test TypeScript, lint,
build, all 30 mocked-API browser cases and official-template framing checks at
320/768/1280/1920px pass. Full backend pytest reports 489 passed and one unrelated
failure in `test_staff_lrn_correction_retains_student_links_and_masking`: the
existing staff student-detail response includes a raw `lrn_number`. This UI task
does not modify that response or backend source.

Batch 3 (2026-10-31): Teacher ECCD Assessment adds **Preview ECCD Card** with
student selection, loading/error/retry states and a responsive, scrollable dialog.
Staff-only `GET /api/eccd/card-preview/{student_id}` authorizes section ownership
and renders the existing populated CHECKLIST workbook as escaped HTML, preserving
the template's merged layout, marks, dates and deterministic scores across all
periods. The response is typed and `no-store`; the iframe is sandboxed and starts
no download. Preview shows server-saved records and never edits assessment drafts.
The primary **Download** menu offers **ECCD Records** (one student or all-student
ZIP) and **Section Summary Record**. Summary reuses the existing
`/api/eccd/section/{section_id}/export` route and Chairman summary builder, including
active-student filtering, school-year cohorts and batches of at most 30 students.
The route now rejects unassigned sections before querying export records.
Verification: seven isolated SQLite ORM/HTTP regressions pass, including card
renderer parity, Chairman workbook values/styles, ownership and large cohorts.
Fifteen mocked-API browser cases pass at 320/768/1280px. Both app/tooling TypeScript
checks, full frontend lint and production build pass. Requested full backend
discovery fails on missing application settings (`backend/.env` is absent) and
missing ML dataset CSVs. No migration or school-data changes are required.

Batch 2 (2026-10-31): Existing dashboard stats routes now expose a typed teacher
`criticalDomain` summary (domain name, total Di-Kaya items, completed student
count) and Chairman `delaySummary` (male/female counts, total delayed/scored
students, and zero-inclusive section counts). Both select each active student's
latest completed, teacher-confirmed period, POST > MID > PRE. Every configured
question, including home-based questions, must have an official teacher date;
partial later periods do not displace a completed earlier period. Teacher metrics
remain scoped to active Primary Adviser assignments. Chairman delays use the
existing official scorer at the assessment-date age, counting its `Slight Delay`
and `Delay` (significant-delay band) labels. Missing birth dates cannot be scored.
Section and school-year filters apply; these new summaries always exclude
inactive students, even when selecting a historical school year.

Teacher Dashboard's Most Critical Domain card displays the name and item count;
the browser-side priority override and unused sectionPriority helper are removed.
Chairman Dashboard adds Delayed Males/Females cards and a section breakdown with
loading/error/empty states. No schema migration or form/draft changes are needed.
Verification: 12 isolated ORM/query/scoring/route regressions pass using synthetic
SQLite data and process-local test settings. Both TypeScript projects, full lint
and production build pass. Full backend unittest discovery was attempted but is
blocked by missing application settings (backend/.env is absent) and missing ML
dataset CSVs; no configured PostgreSQL integration run was performed.

Batch 1 (2026-10-31): Student enrollment and staff edits accept absent/null/blank
LRNs, normalizing blanks to null across the encrypted value, HMAC lookup and
last-four fields. Supplied LRNs still require 12 ASCII digits. Explicit migration
015 (`backend.migrations.optional_student_lrn`) drops only their NOT NULL
requirements, preserving the unique HMAC constraint and existing student data.
Startup checks it; fresh bootstrap includes it. No configured database or
migration application is established by this checkout. Backups accept complete
null identities and reject partial identities; exports leave absent LRNs blank.
Workbook imports retain required LRNs for record matching. Authorized staff
`GET /api/students/{identifier}` returns decrypted `lrn_number` for editing;
parent responses and other public profiles remain masked. The Edit Student
LRN input and optional Add Student validation preserve owner-scoped drafts.

Completed PRE mastery is now cumulative in teacher MID/POST drafts. Completion
for this lock requires a teacher-confirmed date on every configured PRE item.
`utils/mastery.py` shares that definition between reads and save guards.
Staff assessments expose `pre_kaya_question_ids`; teacher draft resolution
forces those later-period answers to KAYA above conflicting old drafts/saves,
and disables both scoring buttons for those items. Inherited values remain
unsaved until explicit Save; dates and unmastered items remain editable. Both
teacher and parent save endpoints reject conflicting later-period answers before
any writes. Parent responses never expose mastery IDs. Saved conflicting old
answers are not silently rewritten; they require an explicit corrective save.

Verification for this batch: both frontend TypeScript projects, full lint,
production build and Git whitespace checks pass. All 19 focused backend checks
(12 new regressions, six existing validation tests, scoring-asset parity) and
five standalone draft tests pass; the standalone TypeScript test also type-checks.
The requested test_ml_model module is absent. Supplemental ML modules ran 34
checks, with 30 passing and four blocked by absent synthetic/holdout CSVs.
No PostgreSQL-backed integration run or migration application was performed;
backend/.env and a configured database are absent in this checkout. Unit checks
used process-local test settings and did not create application configuration.


Parent child visibility (2026-10-29): synced children are listed and accessible
only while the student is active and the section has an Active Primary Adviser
whose account is active. `utils/access.py` shares this eligibility rule between
child-list aliases and direct parent authorization, including ECCD summaries,
home submissions and ML endpoints. Unavailable existing children return HTTP 403;
deleted students return HTTP 404. Links and assessments survive hiding, allowing
automatic visibility restoration once student and adviser eligibility return.
Restoring a teacher account still requires explicitly assigning a section.
`useChildren` refreshes every 20 seconds in visible tabs and on visibility/focus/
reconnection; selection falls back to an eligible sibling or the empty state.
Drafts and pending submissions remain intact. No schema migration is required.

AMES manages early childhood student records and deterministic DepEd ECCD
assessments. Teachers enroll learners, assess PRE/MID/POST skills, manage assigned
sections, release results, and communicate with parents. Parents link children,
view permitted profiles/results, edit permitted family information, and submit
permitted home-based observations. The Chairman manages teachers, sections,
records, question access, school settings, audit history, exports, and backups.

These workflows exist in the active Python/FastAPI/PostgreSQL and React/TypeScript
code. **ML predictions are fully implemented for both Teacher and Parent
portals**, using the shared V1 18-feature sigmoid-calibrated standalone Random Forest inference service and
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
| ML | V1 sigmoid-calibrated standalone Random Forest, joblib artifact, 18 PRE/demographic inputs (five household fields excluded), three supported POST outcomes; shared teacher/parent inference |
| Migrations | Python migrations 001–017; only the nullable teacher timestamp (016) is applied automatically at startup. Other required upgrades are explicit; no active Alembic setup, pyproject.toml, or uv.lock |

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
checker or apply it. Startup checks optional-LRN schema (015) and transactionally
applies only migration 016 (`teacher_marked_at`) after checking evaluator
provenance. This adds a nullable timestamp without a default or historical
backfill and serializes concurrent workers on the migration ledger. Other
missing or incompatible required schema stops startup; those upgrades remain
explicit. Migration 014 remains optional for startup. Migration 017's unique
question sequence index is checked but must be applied explicitly.
It then seeds `assets/reference/eccd.json` (7 domains, 109 questions) only if
**both** reference tables are empty and warms the cached V1 model and guides.
Unavailable/incompatible ML artifacts log a sanitized error and leave ordinary
school workflows available; prediction requests return HTTP 503. Startup does not
call create_all or provision users.

For a fresh PostgreSQL/Supabase database, explicitly run
`backend.scripts.seed_supabase --apply` as a module before API startup. It applies
pending migrations 001–017 in order and seeds the tracked 7-domain/109-question
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
  Official Evaluation Summary/ECCD Checklists tabs and a responsive domain grid.
  `components/parent/ReadOnlyDomainChecklist.tsx` renders saved home/school results
  under independent marks access. Home editing is on Overview through
  `components/parent/HomeAssessmentForm.tsx`, using the shared parent hook and
  existing durable save endpoint. Marks, score release and editing remain separate.
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

Assigned LRNs are exactly 12 digits, AES-GCM encrypted as iv:tag:ciphertext hex, indexed by
HMAC, and publicly masked as eight bullets plus four digits. Public aliases
`lrn`, `lrn_number`, and `student_lrn` contain masked values or "Pending".
The authorized staff student-detail `lrn_number` is the plaintext/null exception. Frontend
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
| 015 | optional_student_lrn | Allow null protected LRNs while preserving assigned-LRN uniqueness and existing student data |
| 016 | teacher_marked_at | Nullable teacher save timestamp; additive startup/bootstrap migration with no historical backfill |

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
uv run --no-project --python .venv312 python -m backend.migrations.auth_security_version --apply
uv run --no-project --python .venv312 python -m backend.migrations.email_only_identity --apply
uv run --no-project --python .venv312 python -m backend.migrations.production_performance --apply
uv run --no-project --python .venv312 python -m backend.migrations.optional_student_lrn --apply
uv run --no-project --python .venv312 python -m backend.migrations.teacher_marked_at --apply

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
uv run --no-project --python .venv312 python -m backend.migrations.auth_security_version --check
uv run --no-project --python .venv312 python -m backend.migrations.email_only_identity --check
uv run --no-project --python .venv312 python -m backend.migrations.production_performance --check
uv run --no-project --python .venv312 python -m backend.migrations.optional_student_lrn --check
uv run --no-project --python .venv312 python -m backend.migrations.teacher_marked_at --check
```

Migration 014 uses transactional index creation and needs a maintenance window;
it is included in fresh bootstrap but is not required by API startup. For a
fresh database that also needs reference data and its initial Chairman, prefer
`uv run --no-project --python .venv312 python -m backend.scripts.seed_supabase --apply`
after configuring the required settings and `INITIAL_CHAIRMAN_*` values. The
manual migration sequence above prepares schema only; it does not create accounts.

Phase 2 records `002_student_identity_api` in ames_schema_migrations and checks
data preservation in the same transaction as schema changes. Do not run
historical Phase 1 checks against a final Phase 2 database.
For a historical Phase 1 installation, inspect its existing columns before
applying 002: that migration fingerprints actual intermediate columns, excluding
the retired plaintext LRN columns, rather than the evolving ORM. Its schema
checker uses the migration ledger to distinguish pre-/post-013 identity and
still expects the applicable current columns and constraints. A historical
snapshot lacking later additive columns needs an explicitly reviewed upgrade
sequence. The fresh-install sequence above is not a universal historical repair.

`backend/scripts/setup_parity_dev.py` creates/selects local ames_parity_dev,
backs up and updates local environment files, disables OTP for that setup, and
runs Phase 1/2 preparation. Its final step invokes
`backend.scripts.seed_development`, but that module is **absent from this
checkout**. The helper is therefore incomplete and must not be presented as a
working bootstrap command. It also omits feature upgrades 003–014. Use the
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
| Year-scoped ECCD exports | GET /api/eccd/export/cards-zip, /card-single, /section-summary; required school_year plus section_id or student_id | `routes/eccd.py`, `schemas/eccd.py`, `utils/excel.py` |
| Messaging | /api/messages/contacts, /history, /send, POST /, /notify-student, /unread-count, /unread, /read, /mark-read; /link-lrn linking alias | `routes/messages.py`, `students.py` |
| Settings/year | /api/settings, /update, /upload-background, /rollover, /undo-rollover, /revert-school-year; /api/chairman/rollover-year, /undo-rollover | `routes/settings.py` |
| Chairman account | /api/chairman/verify-password, /account | `routes/chairman.py` |
| Backup | /api/backup/export, /restore; /api/chairman/backup/export, /restore | `routes/backup.py` |
| Teacher ML | GET /api/ml/students?section_id=N; POST /api/ml/predict/student/{student_id}, /api/ml/predict/sandbox | `routes/ml.py` |
| Staff ML diagnostics | GET /api/ml/plots/{filename}; allowlisted static PNGs, teacher/Chairman only, no-store | `routes/ml.py` |
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
  Browsers require acknowledgment; the backend validates an explicitly supplied
  `terms_accepted` value while allowing omission for existing clients. There is
  no database consent-history field or migration. Retention wording does not claim
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
  general API traffic is 120 requests per minute. Exact messaging GETs
  (contacts/history/unread aliases), read-receipt PUTs, and send/notify POSTs
  instead use independent shared-IP budgets of 240, 120, and 60 per minute.
  Aliases share their operation's bucket; malformed/unauthenticated requests
  count. `/api/messages/link-lrn` retains the general and student-link policies.
  Production counters use the
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
`AGENTS.md` follows this eight-permission, Primary-Adviser-only contract. Older
six-permission and Substitute-assignment descriptions in the historical archive
describe earlier phases; current models, access helpers, schemas, and the table
above describe the active contracts.

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

Parent profile saves use changed fields compared with a baseline persisted in
the owner/student-scoped draft. Omitted guardian fields are preserved; explicit
nulls clear optional details. Existing guardian names cannot be cleared, and new
guardian details require a name (HTTP 422). An absent blank guardian is a no-op.
M6 checks every linked sibling, including pending/archived links, only when the
merged guardian record changes; rejected requests roll back student, guardian
and audit writes together. Shared records are never forked. Workbook callers
retain complete-record semantics. Parent feedback distinguishes confirmed HTTP
200/201 saves, pending device-only saves and persisted rejection details. Legacy
drafts remain readable and queued requests are replayed without rewriting them.
Teacher rosters ignore superseded responses; clean open details refresh on
focus/reconnection, while unsaved teacher drafts are preserved and labelled.
Regressions are in `backend/tests/test_parent_student_updates.py` and
`frontend/tests/parent-profile.spec.ts`, included in parent-sync CI.
Verified locally on 2026-10-27: 70 focused backend tests and full discovery of
369 tests pass against disposable PostgreSQL schemas; all 48 desktop/mobile
parent-sync browser cases pass (46 initially, two after correcting an existing
import-alert locator). Both TypeScript projects, browser-test type checks, full
frontend lint and production build pass. Application/deployment environment
files and production data were not changed.

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
  can prefill unsaved later periods. Completed-PRE KAYA always wins and locks
  corresponding MID/POST items; other saved answers and deliberate drafts win.
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
  Teacher queries stay within active assignments. Teacher critical-domain uses
  active students' latest completed, teacher-confirmed periods. Chairman developmental summaries
  always use active students: explicit delay_period uses export-equivalent
  period scoring; omitted delay_period uses latest completed (see selector note
  above). Optional interpretation selects a single display category (Average,
  Slight Delay, Significant Delay or Advanced); omitted interpretation retains
  delay-only aggregation. `delaySummary.bySection` contains per-section male and
  female counts; the overall `totalMatched` includes students without a recorded
  gender. Completion still divides submitted
  rows by students × questions × three periods. Other Chairman summary cards
  aggregate answer counts. These percentages are distinct from scaled/standard scores.
- frontend/src/utils/teacherMetrics.ts calculates selected-section domain
  completion from committed assessments. Dashboard critical-domain calculation
  lives in backend/utils/dashboard_analytics.py alongside the delay summary.

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

`POST /api/teachers/import-students` accepts optional multipart
`overwrite_section` (Boolean, default false). A section-name mismatch returns
HTTP 409 with top-level `detail`, `code: "SECTION_MISMATCH"`, `file_section`
and `assigned_section`, before any student writes. Section/class labels in the
first two Info Sheet rows and the legacy standalone A1 header supply the file
name; ambiguous/missing names display `"Not identified"`. Labelled matching
headers and the existing case-insensitive metadata match are accepted.
Confirmation bypasses only this name check: active Primary Adviser ownership
of the target section and rejection of existing students in other sections
remain enforced. All imported records use the authorized section ID/name.

Teacher Student Management displays a responsive **Section Mismatch Detected**
confirmation with Cancel and **Overwrite & Import**. Cancel retains the file;
confirmation is bound to its revision and target section. File replacement or
section reassignment invalidates it. Re-import uses the existing durable upload
pipeline, preserving the explicit overwrite flag and target for offline retry.
Pending uploads lock controls and show progress. Completed requests refresh the
roster and show the existing row summary; only imports without failed rows show
the section-specific success toast and clear the confirmed file. Partial failures
retain the workbook for correction.

Section-confirmation verification (2026-10-27): 15 database-free backend tests,
Python compilation, app/tooling and browser-test TypeScript checks, full frontend
lint and production build pass. Requested backend modules discover 82 tests;
the CI browser configuration lists 24 desktop/mobile cases, including 16 new
teacher-import cases. Discovery is not execution: the four new database-backed
multipart regressions and browser cases await the existing CI workflow. No local
database, API or browser server was started for this change.

Workbook resource validation accepts up to **64 worksheets**, including hidden
tabs. The worksheet-limit error reports the supported maximum. Other limits
remain: 20 MiB upload, 50 MiB expanded archive, 128 ZIP members, 2,000 rows and
250,000 explicit workbook cells (including empty styled cells). XML dimensions,
cell references, merged ranges and column styling may extend through Excel's
native **XFD / 16,384-column** ceiling. Import iteration is separately bounded
to **100 columns for Info Sheet and 256 for assessment sheets**; SH, C and SE
answers extend beyond column 100 (the reference SH checklist requires 164).
The existing layout retains names in B and LRN in F, date/guardian mappings,
and dynamically derived age. XML validation, duplicate relationship checks,
separate byte streams, read-only loading and worksheet dimension resets remain
active. Blank trailing student rows are skipped. This supports extra EasyCD tabs around the
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

School-year downloads (2026-11-02): `EccdAssessment.tsx` uses the extracted
`components/teacher/EccdDownloadDialog.tsx` for both ECCD Records and Section
Summary Record. School Year defaults to the teacher filters' current year, with
the existing global settings fallback; historical choices reuse the teacher
filters, which include inactive cohorts. Current-year individual choices require
an active student in the selected section/year. Other years hide individual
selection, display the Archived Cohort notice and download a section ZIP.
Summary downloads also prompt for School Year. Failed downloads show an
accessible error inside the dialog and retain selections for retry.

The three `/api/eccd/export/` routes validate identifiers and consecutive school
years with Pydantic query schemas and reuse the existing checklist, ZIP and
summary generators. Explicit section/year cohorts include both active and
inactive students (`is_active=False` represents archives; there is no
`is_archived` column). Section ownership is checked before cohort queries,
including empty sections. Missing cohorts return HTTP 404 naming the year;
ZIP names are `ECCD_[SECTION]_[SchoolYear].zip`. The new individual route allows
only active current-year records; historical individual requests return HTTP
400 directing staff to the section ZIP. Existing teacher download aliases keep
their compatibility behavior, while `/api/eccd/section/{section_id}/export`
also accepts optional `school_year`. Summary batching beyond 30 students and
all PRE/MID/POST sheets remain intact. No schema migration, assessment write or
draft-storage change is required.

Verification: both frontend TypeScript projects, full lint and production build
pass. All 12 isolated SQLite export tests and 39 dashboard analytics tests pass
with Python 3.12's unittest runner (pytest was not installed for that recorded run). All 15 download
browser cases pass with mocked APIs at 320/768/1280px, covering current-year
individual/ZIP requests, archived ZIP-only selection, year-scoped summaries,
error retention/retry, roster filtering and existing draft preservation.
Desktop/mobile dialog screenshots were inspected. No live school database or
records were used for these checks.

## 9. Messaging, settings, rollover, and backups

Conversations require active teacher/parent accounts linked through an active
student in an active teacher assignment. Contacts/history/unread/read receipts
respect access and archived-message filtering. Messages accept content/body
aliases; saved responses include IDs and body/content. notify-student persists
notices for active linked parents.

Socket.IO uses `auth: { token }`, authorized rooms `teacher-N-parent-M`, and
room acknowledgement for existing clients. **HTTP persistence is authoritative**:
committed REST sends (including offline replay) and profile notifications push
the saved message to every currently authorized participant session, including
other tabs, without a sender-side socket event. Delivery reloads live credentials,
relationships and saved records in worker threads; transport failures do not turn
confirmed saves into HTTP failures. The existing `send_message` interface with
`{ room, message_id }` remains compatible and still rejects spoofed bodies.
Committed read receipts push `messages_read` only to the reader's authorized tabs,
with conversation IDs, reader role and the exact confirmed message IDs. An older
receipt cannot mark a newer arrival read. Restore disconnects active chat sessions.

`context/MessagingContext.tsx` and `services/messaging.ts` own one connection per
authenticated portal tab, inside the lazy portal bundle. The layout's 3-second
unread timer and chat's 15-second history timer are removed. Healthy connections
hydrate unread count/contacts/selected history once, then merge/deduplicate push
messages locally and order contacts without refetching. Read requests coalesce
over 250ms for incoming unread messages in the visible selected thread; unread
refreshes coalesce across delivery/read events. Reconnect recovers the current
thread, contacts and badge; requests deduplicate in flight and account cleanup
aborts outstanding reads. Focus/visibility and unrelated draft-sync events cause
no healthy-socket refreshes.

When push is unavailable, one coordinator runs HTTP fallback after 30 seconds,
backs failed cycles off to 60/120 seconds, and pauses while hidden/offline.
Socket cooldown reconnects take precedence over fallback to prevent overlapping
recovery cycles. HTTP `Retry-After`, handshake 429s and socket `retryAfter` share
cooldown controls; allowed origins can read the retry header. Rejected direct or
queued message sends retain their scoped draft and require explicit submission;
network failures remain queued. Other forms retain their existing replay rules.
Composer cleanup remains revision-safe and HTTP-confirmation-bound.
Push delivery remains process-local, matching the current single-process
deployment assumption. Multiple API processes would require a shared event
transport; the PostgreSQL rate counters are already shared independently.

Messaging verification (2026-10-27): **37 focused backend regressions** and the
complete **22 desktop/mobile browser cases** pass against disposable PostgreSQL
schemas. At 1280px and 375px, separate Teacher/Parent contexts each make one
initial contacts/history/unread GET, retain one messaging socket, and make
**zero additional messaging REST requests over two real idle minutes**. Live
sends/notifications, multi-tab reads, delayed history, drafts/replay/revisions,
account cleanup, fallback/backoff and HTTP/handshake/socket cooldowns pass.
Browser rate responses are controlled injections; backend regressions separately
enforce actual quotas, alias sharing and production PostgreSQL counters. Both
TypeScript projects, browser-test typing, full frontend lint, production build,
formatting and Python compilation pass. See `MESSAGES_REQUEST_LOOP_FIX_PLAN.md`,
`backend/tests/test_messaging_push.py`, and `frontend/tests/messaging.spec.ts`.
No database migration or application school-data change was required.

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

### Teacher sandbox diagnostic gallery (2026-11-05)

The Sandbox Simulator in `pages/teacher/MlInsights.tsx` includes a collapsed
**Technical Model Evaluation & Defense Diagnostics** accordion with six saved
plots in three responsive pairs, captions grounded in the current evaluation
metrics, and accessible enlarged dialogs. Expanding fetches authenticated image
blobs through the shared API client; collapse cancels requests and revokes object
URLs. Failed reads offer a manual retry without changing prediction inputs or
durable drafts. Parent views have no diagnostic gallery or links.

`GET /api/ml/plots/{filename}` accepts only the six offline plot filenames from
`backend/ml/artifacts/plots/`, allowing `admin` and `super-admin` sessions only.
The last two requested `.jpg` names alias the existing `.png` files and return
the actual `image/png` content type; no image conversion, training, or plot
generation runs during requests. Responses use `Cache-Control: no-store`;
unknown or missing plots return sanitized 404 errors. The plot directory remains
ignored by Git under the existing research-data rules; deployments must provision
the six approved staff-only assets separately to display all six charts.

Verification: the requested ML API pytest module passes 17 tests and 96 subtests;
all 24 sandbox browser cases pass at 1280px and 320px using disposable PostgreSQL
fixtures. Both frontend TypeScript projects, standalone browser-test typing,
full lint, production build, changed-file formatting and whitespace checks pass.
No model retraining, application migrations, live school-data writes or deployment
were performed for this gallery.

### Standalone Random Forest integration (2026-11-05; current model)

The active artifact is now a standalone RandomForestClassifier (`rf_full_leaf3`:
400 trees, minimum leaf size 3, max_features 0.8, balanced class weights, seed 42),
wrapped by the existing fold-local preprocessing/weighting and three-fold sigmoid
SupportAwareCalibration. No RF/HGB voting ensemble remains in the primary model.
The specified configuration came from prior screening; this run is not a new
hyperparameter search or a claim of optimality. The original hybrid is frozen in
`backend/ml/artifacts/hybrid_comparison_metrics.json` and a verified 40-file local
archive, with `hybrid_baseline_manifest.json` recording source/data/model hashes.

Active RF SHA-256:
`1ff4591f0f8e21bbaeb48f5617f61acd460f2953f6609cac52d5f86a6bdcec73`.
Mixed holdout accuracy is 423/459 (92.1569%); macro F1 92.1690%; synthetic accuracy
420/451 (93.1264%); real holdout 3/8 (37.5%). Five-fold mixed training CV accuracy
is 88.5981%, macro F1 88.6136%. Shared-anchor student-excluded real accuracy is
9/29 (31.0345%). All 29 real POST labels are Average: always-Average is 29/29,
PRE-category persistence 4/29. The main dataset and 70/30 split are unchanged.

A separate five-fold real-learner evaluation regenerates scenarios using each
fold's real training learners only, then refits preprocessing/calibration/RF there.
Its held-out results are 3/6, 4/6, 3/6, 1/6 and 2/5: pooled 13/29 (44.8276%).
It is exploratory because these learners already informed development, not new
external validation or a controlled improvement over the hybrid's differently
designed real benchmark. Real delay sensitivity is not estimable. No real-world
predictive usefulness, clinical confidence or treatment effect is established.

Loader/publication now validate a fitted sigmoid-calibrated standalone RF,
supported classes, household invariance and finite normalized probabilities.
The former >=90% metric gates and hand-picked probability bands remain diagnostics
only; the RF's below-90% CV results are explicitly reported. The 18-field input,
five excluded household fields, deterministic PRE tiers, rule-based guides, access
controls, schemas and assessment routes are unchanged. Both portals update only
the existing accuracy/methodology notices. Restart a running API to refresh its
model cache; no hosted deployment or migration was performed.

Fresh integration verification: 31 ML unit tests passed; parent ML pytest passed
10 tests; shared ML API/forecast checks passed 21 tests and 96 subtests. Both
frontend TypeScript projects, lint and production build passed. Archive/model
checksums and unchanged main datasets/splits were verified. Exact comparisons
against archived portal files confirmed notice-text-only changes. Dependency
deprecations and an enum collection warning did not fail the checks.

The following dated hybrid training/promotion notes are historical comparison
records. Their metrics, fingerprints and old acceptance policies do not describe
the active standalone RF; the current subsection and evaluation JSON supersede them.

### Conditional growth retraining (2026-10-30; historical hybrid)

The approved `SYNTHETIC_GROWTH_RETRAINING_PLAN.md` is implemented. Synthetic PRE
age proposals are uniformly sampled from completed months 36–71; all 36 ages
occur in the accepted 1,500 synthetic rows. Rejection sampling means the accepted
age distribution is not uniform. The 29 real records remain unchanged, including
ages 59–80; the combined fitted age range is now 36–80, not a new norm policy.
The sandbox still validates 36–71 months; shared student/parent age validation
and the oldest-bracket fallback for POST ages above 71 remain unchanged.

`dataset_builder.raw_progression` applies default recovery growth
`clip(0.40*observed_growth - 0.035*risk + N(0,0.006),0,0.4)` to raw capacity.
For a PRE domain scaled >=8, the POST-age table supplies the smallest raw count
preserving its PRE scaled level (capped at the future domain's attainable ceiling),
then growth applies to remaining capacity. Scaled <=6 uses constrained recovery;
scaled 7 uses the rounded midpoint of normal and constrained raw targets. At
least three domains <=6 disable norm-preservation floors throughout the profile.
MID counts interpolate 65% of PRE→POST progress. Counts remain bounded and
nondecreasing; official scores and labels are always recomputed, never overridden.
Advanced POST candidates are counted and excluded, not relabeled: this run
excluded 466 slightly advanced and 200 highly advanced candidates. The final
synthetic dataset retains 500 records for each of the three supported outcomes.
Its accepted PRE-Average records yield 340 Average and 13 Slight Delay POST
outcomes; the previous dataset yielded 249 Average, 14 Slight Delay and 2
Significant Delay. These are different synthetic mixtures, not controlled
real-world outcome comparisons. Dataset audit preserves both aggregate summaries.

The user explicitly revised Profile C's required Significant Delay band from
65–80% to **65–90%** after training-only candidates missed the original band and
before any holdout evaluation. The default 0.40 scenario is retained. The initial
five CV candidates, eight additional regularization probes and 0.38/0.42 recovery
probes are recorded in `backend/ml/artifacts/growth_retraining_experiments.json`.
Runtime calibration/extrapolation probability logic was not changed. No clipping,
forced class overrides or separate recovery metric were introduced.

The selected sigmoid-calibrated soft-voting RF/HGB ensemble is
`soft_voting_rf_histogram`. Five-fold training CV accuracy is **90.28037383%**
and Macro F1 **90.27987053%**. The frozen winner's one-time 459-row holdout has
**92.81045752% accuracy (426/459)** and **92.82053665% Macro F1**. Synthetic holdout
accuracy is **93.79157428% (423/451)**; real holdout accuracy is **37.5% (3/8)**,
down from the preceding model's 4/8. Real student-excluded accuracy across 29
records is 10/29 (34.48%); all real POST labels are Average, so an always-Average
baseline is 100%. These synthetic-dominated benchmarks and shared real anchors
do not establish independent real-world accuracy or measured recovery rates.
Teacher and parent ML Insights notices display **92.81%** mixed-holdout and
**37.5%** real-holdout accuracy, matching this active evaluation record.
All ten publication gates pass. Only runtime-compatible calibrated RF/HGB
ensembles passing the behavioral, CV and holdout gates can be published.

Current model SHA-256:
`835139f31887924c02f98c9d12878755885c4b476ae6ef54e3412b599d54ecc6`.
The prior model/datasets/reports/source are preserved in a verified 42-file
snapshot at
`backend/ml/artifacts/baseline_pre_missingness_weighting/before_growth_retraining_20261029_211422/active_before_growth.zip`
with an adjacent checksummed manifest. Learner datasets and the snapshot remain
ignored. The active V1 artifact and aggregate evaluation metrics are updated.
Restart an existing backend process to reload its cached model; no hosted
deployment or database migration is part of this change.

Fixed scaled acceptance profiles (FEMALE/Right, blank households; filled
households produce identical probabilities):

| Profile | PRE months | Average % | Slight Delay % | Significant Delay % |
| --- | --- | --- | --- | --- |
| A | 38 | 94.8838900024 | 3.1663444576 | 1.9497655400 |
| A | 66 | 94.8826658720 | 3.1672097882 | 1.9501243398 |
| B | 38 | 94.8837327584 | 3.1664467092 | 1.9498205324 |
| B | 66 | 94.8816292323 | 3.1677470701 | 1.9506236976 |
| C | 38 | 7.9289066088 | 7.2449590669 | 84.8261343243 |
| C | 66 | 7.9254203927 | 7.1478459719 | 84.9267336354 |

A=[10,12,10,10,10,12,10], total 74/standard 103. B=[11,12,11,11,6,12,12],
total 75/standard 104. C=seven scaled 1s, total 7/standard 37. All four
gender/handedness combinations, both household variants and table-attainable
raw A/B counterparts pass. At 66 months EL can only be scaled 5 or 11, so raw B
uses EL=5 while preserving total 75/standard 104. Raw-zero/raw-one counts are
different profiles from scaled C and are reported without its probability band.
Full-precision distributions are in `backend/ml/artifacts/evaluation_metrics.json`;
the human-readable delivery record is `SYNTHETIC_GROWTH_RETRAINING_RESULTS.md`.

Fresh verification after retraining (2026-10-30): **59 backend tests pass**:
25 in `test_ml_model`/`test_ml_api` (226.960 seconds), and 34 in scoring-asset,
pipeline, forecast, parent and growth suites (128.325 seconds). **20 sandbox
Playwright tests pass** in 6.6 minutes and **12 parent/teacher Playwright tests
pass** in 4.7 minutes, across desktop/mobile. Both wrappers removed their own
disposable local databases. Raw A/B equivalents at 38/66 months match saved-model
probabilities exactly through the real API and display Average above the gates.
Coverage also retains raw conversion/capacity/age checks, non-100% minimum-profile
probabilities, household invariance, parent privacy/permissions, offline drafts,
reconnection and stale responses. Both app/node TypeScript checks, additional
sandbox-spec typing, full lint, production build, focused Prettier and Git
whitespace checks pass. The score-7 test's initial incorrect reference threshold
was corrected before its full passing rerun. A sandboxed pnpm fetch failure in
the optional spec type-check passed after the permitted network retry. Existing
deprecation/color warnings were non-fatal. No scoring asset or database schema
changes were needed.

### Forecast bounds gate removed at user request (2026-10-29)

The shared inference wrapper no longer withholds forecasts based on fitted
numeric ranges, including PRE age. The insufficient-support notice, related
badges and fitted-bounds messaging have been removed from parent, teacher and
Sandbox ML Insights. Successful responses retain the existing JSON fields with
`prediction_status: "available"` and `support_reason: null`, and return the saved
model's outcome and probabilities. Normal input validation, model availability,
authorization, active-child, PRE completion and independent PRE-release checks
remain in force. Parents retain their narrower privacy projection. PRE baseline
information and activities remain available, with overall PRE table
interpretation separate from the simplified domain planning tiers.

The 44-month maximum raw-score example now shows the artifact's forecast again,
alongside total 103 / standard 138 / `Highly Advance` PRE information. The same
flow serves the recalculated 60/66/72-month examples. Removing the gate does not
establish training or joint-profile support: fitted PRE ages at that time were
59–80 months. The 2026-10-30 growth retraining above describes current support.
The artifact's own saved calibration/extrapolation behavior, raw-score interface,
scoring tables, age policies and probabilities remain unchanged; no retraining
was performed. Sandbox results remain bound to the
submitted owner-key/input snapshot revision, with synchronous edit invalidation,
request-version checks and cancellation. Durable drafts remain intact.

The builder checksum difference is explained by line endings: the current LF
source hashes to `3b239b78631aae9b6d0a90205c856a2d0a72551d43f06c07d6af22de47cdf6ac`;
converting those bytes to CRLF gives the recorded
`d72e6ab992e6bddd6368431f6db87bd6dfe263c511c46c6fe755da05dbec8806`.
Historical hashes are preserved. See `ML_MAXIMUM_RAW_SCORE_INVESTIGATION.md` for
implementation, verification and remaining limitations. The earlier 70.6%
screenshot's cause remains unestablished. Integration checks use newly created
disposable loopback databases through `backend.tests.run_ml_forecast_checks`,
which refuses production/remote settings and removes only its own database.

Historical safeguard verification before its removal (2026-10-29): 11 focused database-free checks, 19 checks in
the disposable-database API suite, 16 Sandbox and 12 parent/teacher browser cases
pass. Browser coverage includes desktop/mobile, all raw-score conversions,
unsupported-age PRE guidance, permissions, draft durability and stale responses
during debounce. Both TypeScript projects, browser-spec typing, focused ESLint
and the production build pass. Initial browser timing/mock-cleanup failures were
corrected in the test harness; complete reruns pass. All disposable databases
were removed. The artifact checksum remains unchanged; no model refit or hosted
deployment was performed.

### Runtime architecture and exact 18-feature contract

Teacher and Parent predictions are fully implemented on the shared **V1**
research inference path. `backend/ml/common.py` defines the feature order and
artifact directory; `backend/schemas/ml.py::MLFeatures` validates inputs.
`backend/ml/inference.py` loads the fitted sigmoid-calibrated standalone RF pipeline
from **`backend/ml/artifacts/rf_post_test_model.joblib`** and caches it with
`lru_cache`. The experimental artifact was promoted to local `main` on 2026-10-29.
Its custom `backend/ml/pipeline.py` prunes all five household fields, engineers
internal PRE domain composites and scoring-interval summaries, and applies a
sigmoid-calibrated standalone Random Forest. Retained missing numeric values
use training medians; categorical values use training modes and unknown-safe
one-hot encoding. Outside PRE score support, probabilities blend toward training
priors; this is not measured intervention recovery. The same cached service supplies
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

The debounced Sandbox Simulator accepts raw KAYA counts (GM 0–13, FM 0–11,
SH 0–27, RL 0–5, EL 0–8, C 0–21, SE 0–24). Its completed-month PRE age must be
an integer from **36–71**, entered before domain counts. Age is rounded HALF_UP
to one decimal year; 36 months uses the youngest bracket. The UI shows decimal
age and scoring bracket. This sandbox policy does not change shared student/
parent age validation or claim that the model was trained across this range.
`utils/mlScoring.ts` converts raw scores through the bundled official tables
with the backend's closest-lower fallback, then derives scaled totals, standard
score and the count of domains <=6. A responsive live summary above the inputs
shows each raw count/maximum and scaled value, all three composites, and the
table's exact DepEd interpretation. Incomplete/invalid scores leave aggregate
placeholders. Calculated scaled scores also appear beneath raw inputs; all three
composites are read-only. The standard-score tables are
identical across brackets, while raw-to-scaled tables differ; age changes within
a bracket can correctly leave scores unchanged. Invalid raw scores/ages block
prediction without clearing inputs. The sandbox request uses
`SandboxPredictionRequest`, extending the existing 18 ML features with optional
`raw_scores` containing all seven domain codes and strictly validated integer
capacities. The frontend sends the derived features and raw counts. The server
converts raw counts through `eccd_scorer.calculate_raw_scores` (also used by
checklist scoring), overrides conflicting scaled values, and always recomputes
total, standard score and delayed count before constructing the unchanged
18-field `MLFeatures` inference input. Scaled-only requests remain supported;
invalid sandbox ages/counts return 422. Response shape and authoritative
`features` remain unchanged; `raw_scores` is never an additional model feature.
Owner-scoped `ml_sandbox_raw_v2` drafts persist raw/age/household inputs. Old
`ml_sandbox_v1` scaled drafts remain untouched and visible for reference; their
age/demographics initialize the new form with blank raw scores. Existing v2
drafts take precedence. Successful inference retains inputs; offline failures
mark pending state and retry on reconnection. No student/parent scoring, model
artifact or official assessment records are changed by this sandbox behavior.

Cached artifact loading additionally requires a fitted sigmoid-calibrated standalone
Random Forest; hybrid or incompatible models retain sanitized
503 responses. Regression tests verify the active artifact SHA-256 against the
matching evaluation record; the current retraining fingerprint is listed above.
Probabilities come directly from the saved model. Exact table entries, including
zero scaled scores, are preserved. Before the 2026-10-30 retraining, at 66 months,
MALE/Left and unknown household
fields, all-zero raw counts yield scaled `[1,1,2,1,5,1,1]`, total 12, standard 37
and about 92.9% Significant Delay. Seven supplied scaled scores of 1 yield total
7, standard 37 and about 70.4% Significant Delay. These are different profiles;
the UI retains the three class probabilities without a separate recovery metric.

Approved raw-score sandbox implementation verification (2026-10-29): **50 backend
tests pass**: 25 across `test_scoring_asset`, `test_ml_model`, `test_ml_api`, and
25 across `test_ml_pipeline`, `test_ml_forecast_bounds`, `test_parent_ml`.
**All 18 Playwright sandbox cases pass** (nine desktop, nine mobile) using
`playwright.ml-sandbox.config.ts` and disposable PostgreSQL fixtures. Coverage
includes every valid raw count at months 36–71, exact/fallback standard scores
and interpretations, boundary validation, raw/scaled conflicts, stale
composites, calibrated probability fixtures, legacy drafts, offline reloads,
reconnection, HTTP 503 recovery and late success/error isolation. The browser
confirms GM raw 13 gives scaled 14 at 44 months and minimum raw counts display
92.9% Significant Delay with three nonzero probabilities. Summary screenshots
and overflow checks cover 320/768/1280px under
`frontend/test-results/ml-sandbox/`. Both app/node TypeScript checks, full frontend
lint, production build, focused Prettier and Git whitespace checks pass. The new
probability browser test initially used a mismatched dropdown selector; after
correcting it to the accessible combobox role, the complete suite passed.
No scoring-table/model artifact changes, retraining or application migrations
were required for this implementation.

Earlier sandbox raw-score verification (2026-10-29, before sandbox age restriction): all 19 focused ML/parent/scoring-asset
backend tests and all 10 desktop/mobile sandbox checks pass using disposable
PostgreSQL schemas. Conversion parity checks cover every valid raw score in all
seven domains and the then-accepted completed-month ages (1–216), plus standard-score
totals 0–133. Browser checks cover actual inference, age boundaries, invalid
inputs, older drafts, offline/reconnection, simulated HTTP 503, and late responses;
layout checks cover 320/768/1280px. Both TypeScript projects, sandbox test typing,
focused ESLint and the production build pass. Screenshots are under
`frontend/test-results/ml-sandbox/`. No school assessment records were changed.

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

Before the growth retraining described above, the experimental model was promoted to the local `main` working tree on
2026-10-29 at the user's request, without retraining. The previous model, metrics,
source and workspace snapshot are preserved locally in
`backend/ml/artifacts/baseline_pre_missingness_weighting/main_before_90plus_20261029_213830/main_model_and_workspace.zip`,
with a verified SHA-256 manifest. Existing ignored datasets already matched the
experiment; no regeneration was needed. That preceding model SHA-256 was
`0c20bbd5536f6ffe0362f1e1b48be2105270686b5c1c200b5976e3f8970662a0`.
The previous model SHA-256 is
`2de3f5d3b31831438b60936864322935e23d61c30a5df1aeb077509538384541`.

That preceding model's mixed-holdout accuracy was **91.29% (419/459)**, Macro F1 **91.34%**,
synthetic accuracy **92.02% (415/451)** and real holdout accuracy **50% (4/8)**.
Five-fold training CV accuracy is **90.75%**. All-1 scaled PRE inputs at 66 months
yield Average **15.98057590%**, Slight Delay **13.59085144%**, Significant Delay
**70.42857266%**, identical for blank/filled households. These hypothetical inputs
are outside training support. The generator changed, so the metric comparison
with the baseline is not a controlled model comparison. The API, official scores,
permissions, and durable raw-score sandbox are preserved. Restart the backend to
clear cached inference. No hosted deployment was performed. These consistency gates
are not production acceptance. Both portals disclose active scores and limitations.
All 29 real POST outcomes are Average and contributed generator anchors, so neither
this model nor the previous experiments establish independent real-world validity
or real delay detection. Probabilities are not calibrated clinical confidence.

### Current verification setup (source checked 2026-10-29)

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
`backend/tests/test_dev_otp.py` uses the disposable `BackendTests` fixture for
its login/challenge check and mocks email delivery. SMTP diagnostic scripts can
send real mail and are not ordinary read-only checks.

For current pytest verification, target only active modules:
`uv run --no-project --python .venv312 python -m pytest backend/tests -q`.
Do not collect from the repository root, which also contains archived modules.

The following fourteen tracked Playwright configurations in `frontend/` support
targeted checks, selecting the listed specs in `frontend/tests/`:

| Configuration | Spec | UI origin | Test API | Server management |
| --- | --- | --- | --- | --- |
| `playwright.audit.config.ts` | `audit-logs.spec.ts` | http://127.0.0.1:5185 | 8773 | Starts disposable API and Vite; desktop/tablet/mobile |
| `playwright.teacher-management.config.ts` | `teacher-management.spec.ts` | http://127.0.0.1:5184 | 8772 | Starts disposable API and Vite; desktop/mobile |
| `playwright.parent-ml.config.ts` | `parent-ml.spec.ts` | http://127.0.0.1:5183 | 8771 | Starts disposable API and Vite; spec sets desktop/mobile sizes |
| `playwright.ml-sandbox.config.ts` | `ml-sandbox.spec.ts` | http://127.0.0.1:5186 | 8774 | Starts disposable API and Vite; desktop/mobile |
| `playwright.terms-privacy.config.ts` | `terms-privacy.spec.ts` | http://127.0.0.1:5188 | 8775 | Starts disposable API and Vite; desktop/tablet/mobile |
| `playwright.ml-insights.config.ts` | `ml-insights.spec.ts` | http://localhost:5173 | 8769, started separately | Starts/reuses Vite only; Desktop Chrome project, spec adjusts viewport |
| `playwright.parent-sync.config.ts` | `parent-sync.spec.ts`, `parent-profile.spec.ts`, `teacher-import.spec.ts`, `offline-scope.spec.ts`, `offline-settings.spec.ts` | http://127.0.0.1:5190 | Mocked API | Starts Vite; desktop/mobile, no school database |
| `playwright.auth-security.config.ts` | `auth-security.spec.ts`, `terms-privacy.spec.ts` | http://127.0.0.1:5188 | 8775 | Starts disposable auth-security API and Vite; desktop/mobile |
| `playwright.messaging.config.ts` | `messaging.spec.ts` | http://127.0.0.1:5191 | 8768 | Starts disposable API and Vite; desktop/mobile |
| `playwright.performance.config.ts` | `performance.spec.ts` | http://127.0.0.1:5190 | Mocked API | Starts Vite preview of an existing production build; desktop/mobile |
| `playwright.parent-assessment.config.ts` | `parent-assessment.spec.ts` | http://127.0.0.1:5192 | Mocked API | Starts/reuses Vite; desktop/tablet/mobile |
| `playwright.eccd-exports.config.ts` | `teacher-eccd-exports.spec.ts` | http://127.0.0.1:5191 | Mocked API | Starts Vite; desktop/tablet/mobile |
| `playwright.teacher-dashboard.config.ts` | `teacher-dashboard.spec.ts` | http://127.0.0.1:5194 | Mocked API | Starts/reuses Vite; desktop/laptop/tablet/small-tablet/mobile |
| `playwright.chairman-dashboard.config.ts` | `chairman-dashboard.spec.ts` | http://127.0.0.1:5193 | Mocked API | Starts/reuses Vite; desktop/laptop/tablet/small-tablet/mobile |

Run configurations separately when they share ports, including messaging and
ECCD exports on 5191. Messaging uses `uv` on PATH with `.venv312` and the
configured backend PostgreSQL connection; its fixture creates isolated schemas.
It no longer hardcodes port 55432 or a temporary uv executable. Verify fixture
isolation before running any database-backed browser suite.

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

EasyCD XFD-formatting follow-up on **2026-10-27**: 11 database-free backend
tests passed, covering native-grid styling/dimensions, bounded reads including
assessment column 164, malformed cells, styled-cell budgets, 65-sheet rejection,
129-member rejection, and a genuinely compressed archive exceeding 50 MiB when
expanded. The two requested backend modules discover 74 tests; discovery does
not execute their database integrations. Python compilation, frontend app/tooling
TypeScript, full lint and production build passed. A multipart integration test
also covers demographics, both guardians, late assessment marks, blank trailing
rows and repeat imports; its execution remains scheduled in the existing CI
workflow. No local servers or database connections were used, and the exact
production workbook has not been tested.

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
but **do not ignore browser test source or configuration files**. All ten current
Playwright configurations and their twelve selected specs are tracked, including
sandbox, terms/privacy, auth-security, messaging, performance, and the parent-sync
profile/import specs. The active V1 model is tracked; raw workbooks, CSV datasets,
learner-level benchmarks and the archived experiments remain ignored. Ignored
local files and generated screenshots are not guaranteed to accompany a clone.

### Verification of this documentation refresh (2026-10-29)

Compared AI_CONTEXT.md and AGENTS.md with active source, manifests, migrations,
all ten tracked Playwright configurations, their selected specs, and Git tracking.
Updated the migration sequence through 014 and reconciled adviser roles, parent
permissions, student-ID/owner-scoped drafts, routed component names, and explicit
TypeScript project checks. Focused ESLint for `useParentProfile.ts` passes; the
older three-error report is preserved as history in section 12. The documentation
diff and referenced migration/config/spec paths were checked.

This refresh did not rerun full frontend lint, backend regressions, browser
acceptance, TypeScript, the production build, model evaluation, database
connectivity, migration-ledger checks, SMTP, or deployment verification. Earlier
results retain their dates and environments. `DEPLOYMENT_READINESS_AUDIT.md`,
`ML_ACCURACY_REVIEW.md`, and `MODEL_PRODUCTION_DEFENSE_AUDIT_AND_PLAN.md` provide
separate dated assessments and proposals; proposals in those files are not
implemented runtime behavior.

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

### Earlier documentation verification (2026-10-25)

The following is the earlier refresh's verification record. Its lint failure was
subsequently resolved; it does not describe the current hook or lint status.

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


## 2026-11-13 — Custom-domain HttpOnly authentication: pre-release verification

Branch: feature/custom-domain-httponly-auth, based on a6ebfa7. The initial
main working tree was clean; no refresh-branch checkpoint was needed. Only the
FastAPI + ML resources are authorized: Render Apolinario Mabini School System,
Vercel eccd-management-student-information-with-ml, Supabase AMES_SYSTEM_ML.

The refresh cookie is host-only ames_refresh_token, HttpOnly, Secure in
production, SameSite=Strict, Path=/api/auth, sliding24 hours. Access tokens and
user context remain only in RAM. Login/OTP/registration/credential replacement
never return refresh JWTs in JSON. Refresh validates exact Origin/Referer and live
account/credential state. Explicit additive migration019 creates private refresh
families with a10-second shared-successor rotation grace; logout revokes that
family and credential changes revoke all account families. Backups exclude and
restore clears these sessions. No school-data migration001–018 or ML artifact
change is part of this release.

Production uses www.ameskinder.com (apex redirects with308), with API/Socket.IO at
api.ameskinder.com. The API initially returned DNS NXDOMAIN. After the user
confirmed adding/verifying the Spaceship CNAME and Render custom domain, HTTPS
health/readiness both returned200. Deployment remains a separate acceptance step.

Executed locally against verified loopback PostgreSQL, with disposable schemas:

- Full `pytest backend/tests -q --maxfail=5`:545 passed,3 failed,663 subtests
  passed,10 warnings in1539.43s. All three failures were old test expectations:
  exact CORS origins and two assumptions that every model belongs in backups.
  Updated the expectations for custom domains and deliberate refresh-session
  exclusion; exact three-case rerun:3 passed,7 subtests in9.89s.
- Current cookie/CORS suites:33 passed,31 subtests in115.84s, including the new
  migration-idempotency/backup privacy test added during the full run.
- Entire Phase1 schema/backup suite after correction:19 passed,11 subtests.
  Across the full run and focused reruns, all549 current backend cases have
  passing coverage; this was not one clean549-case run.
- Auth/refresh Playwright, desktop and320px mobile:40 passed in5.7m. Consent and
  privacy suite:18 passed in2.8m. Covers real synthetic OTP, RAM-only storage,
  Strict/HttpOnly local cookies, F5, concurrent tabs, BroadcastChannel login and
  logout, proactive renewal using a real short-lived test JWT, outage/cooldown,
  late response rejection, and durable teacher ECCD draft boundaries.
- `npm run build` (tsc-b + Vite), both explicit TypeScript projects, changed-file
  ESLint and Git whitespace checks passed. No dependencies were installed.
- Secret scan of reviewed candidate files and exact staged blobs found no
  configured secrets, provider tokens or private keys. Only .env.example
  placeholders are included; actual environment files remain ignored.

Warnings are test-library deprecations, pytest Enum collection notices and
occasional Windows test-server connection-reset diagnostics during tab closure.
A new real production login/OTP and authenticated ML prediction are not claimed
by these local checks. Live production acceptance is recorded in the local
release report after deploy.


### 2026-11-13 — Live production-mode check and safe startup errors

After 5ede302 deployed, the real browser check on www.ameskinder.com passed:
secure context, no JavaScript/CORS/failed-request errors, no stored auth keys,
and structured401 INVALID_TOKEN from credentialed refresh without a cookie.
The API still accepted a missing Origin and lacked HSTS, indicating development
mode. Set both Render ENV aliases to production on the approved service.
The resulting deployment correctly failed closed on the pre-existing database
TLS configuration: verify-full and a trusted sslrootcert are required. The last
healthy deployment remains serving. The connector cannot read the private
Render database URL, so the user was asked to preserve its credentials while
updating only TLS options in the Dashboard; no connection URL was requested in
chat and no certificate verification was disabled.

Added Settings hide_input_in_errors=True after observing validation input values
in startup tracebacks (tool output redacted them). New synthetic-secret coverage
and all deployment-settings tests passed:8 tests,21 subtests in8.55s. No auth
behavior or dependencies changed. Production readiness is pending the TLS fix
and final smoke/log verification, not established by this note.
