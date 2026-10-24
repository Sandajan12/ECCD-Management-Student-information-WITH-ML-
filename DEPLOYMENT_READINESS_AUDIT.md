# AMES deployment readiness audit

Audit date: 2026-10-24; refreshed after retesting Codex Security and rerunning verification. Target: the current working tree, including uncommitted changes, on `unsure-check-first` at `16c7d5971b2a35a36c68655038885bbeca0c280a`.

## Verdict

**Not ready for an unrestricted production launch.** Vercel for the frontend, Render for the backend, and Supabase for PostgreSQL fit the current architecture. The production build, local database integrity checks, and four ML sandbox browser tests pass. Remaining release concerns include OTP delivery, production configuration, database recovery, release selection, dependency advisories, failing verification gates, and the permission inconsistencies documented below.

If you choose **free hosting tiers**, treat the initial deployment as a controlled pilot with accepted interruptions. The current request does not specify paid or free plans; SMTP restrictions and cold starts below explicitly identify the affected tier. An always-on backend and dependable database recovery are the first operational upgrades to budget for. Hosting compatibility does not establish production reliability or validate the ML predictions.

This document is an audit, not a deployment or a code fix. No application source, environment file, school record, Git index, branch, or history was changed. Integration/browser tests and synthetic security reproductions used disposable local database schemas. Build, browser and temporary diagnostic outputs were generated in ignored locations. No credentials or learner identities are included here.

Warning ranks combine security, reliability and release readiness. They are **not CVSS scores**. The source review retained **five application-security findings: one medium (M6) and four low (L1, L2, L5, L6)**. No critical/high application exploit was established within the reviewed boundaries. Published dependency advisory ratings and conditional hosting hazards are reported separately; absence of a demonstrated exploit is not a clean bill of health.

## Coverage and limits

- Inventoried 259 tracked files; the managed scan's current non-ignored worktree inventory counted 265 files, including new documentation/tests. Examined deployment configuration, manifests, migrations, required ML assets, and all current changed/new application and test files. Codex Security skill-guided independent baseline and frontend reviewers examined all active backend HTTP route modules and the main authentication, authorization, assessment, backup, import/export, realtime, browser rendering and storage boundaries; an independent architecture reviewer mapped consumers and trust boundaries. This is broad repository review, not exhaustive line-by-line review of every presentational component, test, document, binary or dependency.
- Examined 29 commits reachable from local refs and 695 unique UTF-8 text blobs through Git object inspection. Searched for current secret values without displaying them, common token/private-key patterns, static credential assignments, and sensitive filenames. Binary files were not comprehensively secret-scanned; the two current workbook templates received additional identifier-pattern checks.
- Used a read-only transaction against the configured **local** PostgreSQL database for schema and integrity checks. No Supabase project connection, grants, API settings, production database, or hosting dashboard was available for inspection.
- **Codex Security now starts through a fresh plugin process:** the registered scan-start tools still returned the Python-helper error in this session. Launching the installed MCP server with a process-only `PYTHON` pointing to the existing Python 3.12 environment successfully created Standard scan `e929b552-d646-47c2-ae61-930ecdc2b471`. Preflight returned `ready`; the available worker capacity was used without changing configuration. The independent source reviews and synthetic validations below were completed, but the managed workflow could not save its semantic checkpoint: Windows secure file handling returned `CreateFileW ... Access is denied`, and an elevated retry returned `Codex Security scan artifact root is not a safe regular directory`. **The managed scan remains resumable/running; no sealed managed report or SARIF was produced.** This supersedes the old claim that no scan could start, but does not establish that the whole plugin workflow completed. No persistent Codex/plugin configuration or permission check was altered.
- Daybreak account access was `not_granted`. The plugin explicitly treats that as advisory, not a scan blocker; it is separate from the Windows artifact-access failure. Protected outputs may not be displayable. [Daybreak access](https://chatgpt.com/cyber).
- **GitHub plugin was retried:** `github.get_repo` again returned `Mcp error: -32001: Unknown tool`. Separately authenticated Git transport successfully rechecked remote branch tips. GitHub API alerts, repository visibility, branch protections, Actions artifacts/logs, PR-only refs, forks, deleted/unreachable objects, and remote secret-scanning results remain unverified. This dispatch error does not prove bad GitHub credentials or missing repository permissions. The earlier unauthenticated 404 is not a visibility determination.
- No SonarQube MCP tools or `sonar` CLI were available, so no SonarQube project analysis was run. SQL Expert guidance is not a live PostgreSQL connection; actual local database checks used the application's existing SQLAlchemy connection in a read-only transaction. Dependency checks reran `pnpm audit` and isolated `pip-audit`; their advisory severity is distinguished below from demonstrated application exposure.

The managed scan artifacts are bound to a temporary fallback state directory and may disappear with OS cleanup. Its last confirmed state is discovery, with no accepted semantic draft. The five findings in this document are independently reviewed and validated source findings, **not a projection of a completed managed scanner report**. A functional plugin installation, a successful scan launch and successful report finalization are distinct checks.

## Findings: high warning

### H1. Render Free blocks the current OTP mail transport, and production accepts OTP being disabled

**Confirmed code/configuration behavior; deployment blocker.**

`backend/utils/email.py:13-23` configures FastAPI-Mail SMTP, defaulting to Gmail on port 587. There is no HTTPS email-provider adapter. Render Free blocks outbound ports 25, 465, and 587; changing between these SMTP ports will not solve delivery on that tier. [Render restrictions](https://render.com/docs/free).

Private configuration inspection found `ENVIRONMENT=development` and `ENABLE_OTP=False` locally. Secret values were not printed. This contradicts the current local snapshot in `AI_CONTEXT.md`.

`backend/config/settings.py:29-30` returns the OTP flag unchanged, and its production validator does not require OTP. A synthetic configuration test confirmed that `ENVIRONMENT=production` with `ENABLE_OTP=False` is accepted. `backend/routes/auth.py:40-45` can then complete login without the email challenge; registration also follows the configured bypass. This is an operator configuration risk, not an attacker-controlled switch.

**Before launch:** use an email provider's authenticated HTTPS API for Render Free, preserve the existing OTP challenge/hash/expiry/attempt contracts, and explicitly enable OTP in production. Add a production guard against accidental bypass. Verify real delivery, sender/domain verification, resend limits, expiry, invalid codes, and provider failure handling in staging. Do not disable verification to work around blocked SMTP. No email was sent during this audit.

### H2. Production boot and frontend routing are not reproducibly configured

**Confirmed repository gap; hosted configuration remains unverified.**

- No `render.yaml`, Dockerfile, Vercel routing configuration, or tracked GitHub Actions workflow was found. These files are not individually mandatory, but there is no checked-in equivalent deployment recipe that establishes the required settings.
- Root `package.json` starts the backend with `--reload --port 8000`, without Render's required host binding. Production must run the Socket.IO wrapper, for example `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`, from the repository root. `backend.main:api` omits the Socket.IO wrapper; the test server must never be deployed. [Render port binding](https://render.com/docs/web-services#port-binding).
- Python 3.12 is requested in `.python-version`; preserve that choice. There is no `pyproject.toml` or `uv.lock`. Render automatically provisions native uv support when a root `uv.lock` is present. A deployment that assumes `uv sync` already works is unsupported by this checkout. Establish a real uv project/lock workflow or explicitly provision uv for the requirements-based build; verify it on Linux. [Render uv support](https://render.com/docs/uv-version).
- Production settings correctly require a strong JWT secret and PostgreSQL `sslmode=verify-full` with a trusted root certificate. The backend environment template lacks the complete Supabase TLS and frontend-origin configuration. Copying it verbatim is insufficient. Do not weaken TLS validation to make startup pass.
- The React app uses browser routes. Deep links need an SPA fallback to `index.html`, otherwise refreshing a nested route can return a hosting 404. [Vercel Vite SPA configuration](https://vercel.com/docs/frameworks/frontend/vite).
- The uncommitted `frontend/src/utils/mlScoring.ts:1` imports `backend/eccd_scoring_data.json` outside the frontend folder. The frontend build therefore needs access to that tracked backend file. Building with the repository as the Vercel project root avoids excluding it; output remains `frontend/dist`.

**Before launch:** document and test the exact build/start commands, repository root, runtime/tool versions, production variables, certificate installation, SPA fallback, and `/ready` health check. Set public `VITE_API_URL`/`VITE_SOCKET_URL` to the HTTPS backend origin without `/api`; set exact frontend origins in backend CORS. Keep all database/mail/encryption secrets out of `VITE_*` variables.

### H3. Git-based deployment can select the wrong code or omit required new files

**Confirmed remote and working-tree mismatch.**

Remote ref inspection returned:

| Ref | Commit |
| --- | --- |
| Remote HEAD and `main` tip | `171f45c` — initial platform commit |
| Remote `unsure-check-first` tip | `16c7d59` — current committed work |

The current branch is 25 commits ahead of local `main`. At refresh start, ten tracked files were modified and six files were untracked, including this report and `PLUGIN_HEALTH_CHECK.md` from the earlier audit. Git hosting cannot deploy those working-tree changes until they are included in a reviewed commit.

In particular, modified `MlInsights.tsx` imports the **untracked** `frontend/src/utils/mlScoring.ts`. Committing only the modified component would produce a missing-module build failure. The new browser configuration/test should accompany the feature. The untracked `MODEL_PRODUCTION_DEFENSE_AUDIT_AND_PLAN.md` is documentation, not a runtime dependency.

**Before launch:** choose an explicit release branch/commit containing the complete feature and required assets. Build from a clean checkout of that commit. Verify that both hosting services deploy the intended compatible versions. Do not assume their default branch contains the code reviewed here. No branch was switched, merged, committed, or pushed.

### H4. Supabase's Data API must not become a second route around FastAPI authorization

**Conditional deployment hazard, not an observed hosted data leak.**

The application enforces user roles, section ownership, synced parent relationships, eight current parent permissions, and result masking in FastAPI. Its migrations do not define an equivalent Supabase RLS policy system. Putting these tables in an API-exposed schema with permissive grants could expose records through Supabase independently of those Python checks.

**Before launch:** since this application only needs hosted PostgreSQL, disable the Supabase Data API for this project, or explicitly isolate/revoke access to AMES objects and verify the resulting grants. If the Data API is intentionally used later, design and test RLS policies rather than assuming backend checks protect it. Supabase documents the interaction of exposed schemas, grants, default privileges, and RLS. [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).

Test that anonymous and ordinary API keys cannot read or modify AMES tables outside FastAPI. No Supabase dashboard setting, exposure, or key was tested here; do not interpret this finding as proof that a hosted database is currently exposed.

### H5. Full database migration and disaster recovery are not yet demonstrated

**Unresolved production gate; existing backup implementation has an important boundary.**

Local database integrity passed, but there is no verified restore into Supabase, full disaster-recovery drill, or inspected offsite backup schedule.

`backend/utils/backups.py:31-47` intentionally preserves the destination's live `users` table during application restore and does not recreate users from the encrypted backup. This is useful for restoring school data into a working installation, but the application's Restore button is **not a complete replacement for recovering an empty/lost database with its account registry**.

**Before launch:** rehearse a full PostgreSQL transfer/restore into an isolated Supabase staging target, including accounts, IDs/sequences, evaluation provenance, parent links, permissions, and migration ledger. Preserve the original LRN encryption key, HMAC secret, and Fernet backup key securely with the recovery materials. Do not regenerate them during a host move. Configure encrypted offsite database backups and verify that an empty replacement database can actually be recovered. Supabase recommends independent dumps for free projects. [Supabase backups](https://supabase.com/docs/guides/platform/backups).

Do not run destructive migrations against the only copy of school data, and do not deploy the local-only setup/test utilities as production bootstrap commands.

### H6. The Python CA bundle has a published security advisory

**Confirmed vulnerable dependency version; application exploitation was not demonstrated.**

`backend/requirements.txt:8` pins `certifi==2026.7.22`. `pip-audit` flags `GHSA-6q48-6c7w-9gw2`; the advisory rates the affected trust bundle critical and identifies `2026.10.19` as patched. The described attack requires compromised intermediate keys and an attacker positioned to intercept TLS connections that trust the affected bundle. This is not evidence that AMES traffic has been intercepted. [Reviewed certifi advisory](https://github.com/advisories/GHSA-6q48-6c7w-9gw2).

**Before launch:** update the pin to a reviewed patched release, rebuild the runtime, and repeat the dependency audit. PostgreSQL's explicit libpq root-certificate configuration is a separate trust path; this finding does not establish that its TLS verification is bypassed.

### H7. The deployed ML feature must remain research guidance

**Confirmed model-validation limitation; high importance if school decisions rely on predictions.**

The tracked metrics report approximately 88.89% mixed holdout accuracy, versus 25% on eight real holdout cases. The saved metadata explicitly says that real learners anchor synthetic generation and that there is no independent cohort validation. These are saved artifact results, not newly rerun training results. The mixed metric does not establish real-world predictive accuracy.

The model artifact loads successfully and the inference/browser checks pass. Those checks establish functionality, not educational validity. `ML_ACCURACY_REVIEW.md` documents the limitations; existing research notices should remain visible.

**Before launch:** obtain domain review of the intended use, keep predictions advisory, preserve deterministic official ECCD scoring, and avoid claims of validated high real-world accuracy. Disable or restrict predictive access if the intended deployment would use these results for consequential decisions before independent validation. Do not replace the model with an experimental branch merely for a better headline score.

## Findings: medium warning

### M1. Verification gates fail despite successful builds

**Confirmed again.** The refreshed complete tracked backend run executed **237 tests: 232 passed, four failed, one errored**, in approximately **429 seconds**. Source review traced these particular failures to outdated test expectations or missing reference files, rather than using them as evidence of the distinct security findings in M6/L5/L6:

| Failing test | Observed mismatch | Required reconciliation |
| --- | --- | --- |
| `test_parent_assessment_access...test_strict_flags_and_explicit_selection_for_multiple_sections` | Expected implicit selection 400; received 200 | Current teacher moves retire previous ownership. Test the retained section and forbidden former section under that contract. |
| `test_parity...test_teacher_filters_stats_and_pie_use_assigned_sections_and_years` | Expected two sections; received the retained section | Align dashboard expectations with current single-owner move behavior. |
| `test_parity...test_parent_period_summary_and_legacy_cards_never_leak_locks` | Expected every progress question to be home based | Current full domain lists and separate home checklist/marks permissions are intentional. This assertion occurs after all periods are released; it does not demonstrate an unreleased-score leak. Retain real masking assertions. |
| `test_phase2...test_teacher_account_edit_archive_and_delete_preserve_scores` | Expected a custom username; received the email-derived username | Align with the current account contract while retaining session revocation/data-preservation coverage. |
| `test_parity...test_all_legacy_functional_routes_registered` | Missing `AMES-SYSTEM-LEGACY/backend/routes/authRoutes.js` | Supply the read-only reference to the parity job or an approved route-contract fixture. Do not fabricate legacy files or silently drop required coverage. |

Frontend `pnpm run lint` also fails with **three `react-hooks/refs` errors** in `frontend/src/hooks/useParentProfile.ts:20,23`: refs are read/written during render. Fix the hook while preserving child-switch race handling and scoped durable drafts.

**Before launch:** restore a meaningful green regression/lint gate. Do not change business logic to satisfy stale assertions or suppress coverage merely to get a pass. The separately ignored real-beneficiary model acceptance test was deliberately excluded from the portable tracked test run.

### M2. Additional dependency advisories need contextual treatment

**Confirmed package advisories; no matching deployed exploit demonstrated.**

The frontend audit reports **10 advisories: five high, four moderate, one low**. It is not reporting ten proven exploitable production flaws.

| Package | Installed/pinned | Audit result and deployment relevance |
| --- | --- | --- |
| `follow-redirects` through Axios | `1.16.0` | Two high credential-header advisories; patched at `1.16.1`. These affect the Node adapter. Axios maps that adapter away for browser builds; a static Vercel frontend is not the same exposure as a Node HTTP client. [Advisory one](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8), [advisory two](https://github.com/advisories/GHSA-8r9p-f939-6h3c). |
| `source-map-js` | `1.2.1` | High resource-exhaustion advisory in tooling; patched at `1.2.2`. [Advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). |
| Vite | `8.3.0` | Six advisories: one high, four moderate, one low; audit identifies `8.3.3` as patched. They concern development-server/editor/file-serving paths. Deploy static output; do not expose `vite dev` as the production frontend. |
| Zod through ESLint tooling | `4.6.5` | One high constrained-collection memory advisory; patched at `4.6.6`. This is a development dependency. |
| `python-jose` | `3.5.0` | Critical upstream algorithm-confusion advisory with no patched version listed. AMES decoders explicitly restrict algorithms and currently use a symmetric HS256 secret, which does not establish the advisory's asymmetric-public-key attack path. Track a supported remediation and retain an explicit algorithm allowlist. [Advisory](https://github.com/advisories/GHSA-3qf3-8w2g-rqmx). |
| `ecdsa` | `0.19.2` | Timing-attack advisory affecting ECDSA signing/key operations, not HS256 signing. No matching current AMES signing path was found; no patched version listed. [Advisory](https://github.com/advisories/GHSA-wj6h-64fc-37mp). |

The Python audit reported four advisory entries across three packages; it duplicated the same ECDSA advisory. There are **three distinct Python advisories**, including certifi in H6. `uv pip check` passing means installed dependencies are compatible, not vulnerability-free.

**Action:** update reviewed patch releases and lockfiles, then rerun build/tests/audits. Record explicit exposure decisions for unpatched advisories; do not blindly apply breaking upgrades or describe every advisory as reachable in the browser.

### M3. Free-tier cold starts, synchronous work, and external database latency need capacity testing

**Provider constraint plus observed application limits.** Render Free idles after 15 minutes without inbound traffic and can take roughly a minute to wake. Axios defaults to a 20-second request timeout (`frontend/src/services/api.ts:5`), so a cold start can outlast the first login/data request. An SMTP attempt also has a 30-second outer deadline. [Render free behavior](https://render.com/docs/free).

Supabase Free includes a 500 MB database and can pause after a week of inactivity. The refreshed local database measured about **70.5 MiB**, but that includes database/test overhead and concurrent disposable-schema activity, not a clean production-capacity estimate. Long-term messages, audit history, evaluations, and database-stored branding require monitoring. [Supabase limits](https://supabase.com/pricing).

The backend uses synchronous SQLAlchemy/psycopg2, in-memory Socket.IO rooms, and shared PostgreSQL rate counters in production. A separate provider adds network round trips. SQLAlchemy pool capacity is not explicitly configured. Warm inference alone measured about 152 MiB working set and 318 MiB private commit on Windows; that is not a Linux/server/import concurrency benchmark.

**Action:** keep Render and Supabase geographically close, begin with one backend worker, and test realistic class-size prediction batches, chat, imports/exports, and reconnects. Provide clear startup/retry feedback while retaining drafts; do not blindly retry non-idempotent writes. Measure pool wait, database latency, memory peaks, request deadlines, and actual client IPs behind Render's proxy. Shared school NAT addresses can also affect IP-based rate budgets. Validate proxy trust rather than trusting arbitrary forwarded headers.

### M4. Database least privilege and connection mode remain deployment tasks

**Confirmed locally; hosted settings unknown.** The configured local PostgreSQL role has superuser, role-creation, database-creation, and RLS-bypass privileges. That is not evidence that Supabase uses those privileges, but it is unsuitable as the production runtime permission model.

**Action:** use separate migration/administration and application roles. Grant the application only the required schema/table/sequence privileges. Include its real backup/restore needs in this design: current restore restarts sequences transactionally, and ordinary table grants alone do not necessarily authorize that operation. Test role permissions instead of discovering this during an emergency restore.

For this persistent backend, use Supabase direct PostgreSQL when network addressing permits, otherwise the IPv4-compatible session pooler. Copy the actual endpoint credentials from Supabase, use the trust root appropriate to that endpoint, and preserve `verify-full`. Do not assume the transaction pooler is a drop-in replacement for every session/migration operation. Test the connection from Render. [Supabase connection choices](https://supabase.com/docs/guides/database/connecting-to-postgres).

### M5. Hosted security and browser boundaries are not yet verified

**Coverage gap, not a demonstrated failure.** No staging URL was supplied or deployed. Local tests cannot prove production CORS, HTTPS, certificate trust, proxy headers, remembered-device behavior across provider domains, real email delivery, backup scheduling, or hosted WebSocket reconnects.

**Action:** perform the release smoke scenarios below against the actual HTTPS origins. Complete the managed Codex Security workflow after resolving the documented artifact-access failure, and restore GitHub connector dispatch before inspecting secret-scanning/Dependabot results, protections, and relevant workflow artifacts. SonarQube can add static-analysis coverage if a project is configured; it would not replace these functional checks. Backend security headers apply to backend responses; configure and verify suitable headers on Vercel's actual HTML/static responses too.

### M6. Editing a shared guardian through one child bypasses another child's editing lock

**Confirmed application-security finding; medium severity, high confidence; CWE-863.** This was identified during the refreshed independent security review and reproduced through the real API against a disposable schema.

`backend/routes/students.py:195-212` authorizes only the child in the URL, then calls `upsert_guardian`. `backend/utils/students.py:39-49` selects an existing linked `Parent` and updates its name, age, occupation and education in place. A `Parent` can be shared by multiple `FamilyAccess` rows (`backend/models/parent.py`). The update never checks authorization or editing locks for the other children affected by that shared row.

**Reproduction:** two synthetic children shared a mother, with profile editing enabled by child A's adviser and disabled by child B's adviser. Directly editing B returned **403**. Editing A's `mother_name` and `mother_educ` returned **200**, and a subsequent staff read of B showed both values changed. The school database's real records were not touched. Shared education is also consumed by ML demographic feature extraction (`backend/routes/ml.py:67-82`); no independent model-accuracy impact was measured.

The same shared-row design permits an assigned teacher editing one child's guardian to affect children outside that teacher's section. Preconditions are an existing shared guardian and permission to edit at least one linked child. It does not grant new family links, alter credentials, or allow arbitrary unrelated-parent selection. The authorization failure is concrete and easy to trigger once those conditions exist; the affected data is bounded family-profile information.

**Fix before production:** define the ownership boundary for shared guardian identity and per-child school records. Either authorize all affected children before a shared mutation, or keep per-child guardian details separate while preserving account/family links. Add opposite-lock sibling and cross-section teacher regressions, and audit every affected record. Do not silently weaken adviser locks to accommodate shared rows.

## Findings: low warning

### L1. Parent-editable text becomes formulas in staff Excel downloads

**Confirmed application-security finding; low severity, high confidence; CWE-1236.** Repeated a harmless in-memory reproduction during this refresh. A permitted linked parent can set free-text fields such as address through `backend/routes/students.py:195-212`. `backend/utils/checklist_workbook.py:31,42` assigns that text directly to workbook cells. A synthetic address `=1+1` survived save/reload at W18 with openpyxl cell type `f` (formula), not string. Birth order and guardian occupation/education use the same writer.

The parent already needs a synced relationship and adviser editing permission, and staff must export/open the workbook. External-request formulas could target workbook data, which includes an authorized plaintext LRN at W10, but transmission depends on the spreadsheet client's supported functions and content policies. No external request or spreadsheet execution was attempted, and automatic code execution was not established. These prerequisites limit the demonstrated likelihood and keep the finding low rather than treating formula storage as proven remote code execution.

**Fix:** export untrusted values as explicit string cells while preserving stored text. Add a regression confirming formula-like profile text remains a string in the generated workbook. This is distinct from the audit CSV's existing formula escaping.

### L2. XLSX import bounds compressed uploads but not expanded workbook resources

**Confirmed application-security finding; low severity, high confidence; CWE-770.** No resource-exhaustion payload was executed. `backend/utils/uploads.py:5` caps the uploaded XLSX at 20 MiB. `backend/utils/excel.py:224,229` then loads it without read-only streaming and materializes `list(wb["Info Sheet"].values)`. There are no explicit expanded-ZIP-size, member-count, worksheet-dimension, or cell-count budgets before parsing. `backend/routes/teachers.py:119-124` calls this synchronous parser directly inside an async endpoint, so expensive parsing can also block that worker's event loop.

Import requires an authenticated assigned teacher; heavy-operation rate limits reduce frequency. They do not bound memory/CPU consumed by one accepted workbook. Accidental oversized files can have the same availability impact as a malicious file on a small backend. The trusted staff prerequisite and absence of a measured exhaustion result limit the demonstrated attack likelihood; treat this as a concrete parser-boundary issue, not a claimed unauthenticated denial of service.

**Fix:** enforce archive/expanded-resource and worksheet budgets before expensive parsing; use bounded processing and avoid blocking the event loop with large synchronous work. Test with safe synthetic files that exceed budgets, not a live resource-exhaustion attack.

### L3. Cleanup candidates exist, but deleting Markdown or adding broad ignores is not the readiness fix

**Static candidates only; no deletion authorized or performed.** An import graph rooted at `frontend/src/main.tsx` found no runtime import path to these tracked files:

- Assets: `frontend/src/assets/hero.png`, `react.svg`, `vite.svg`.
- Shared components: `frontend/src/components/PasswordValidator.tsx`, `StatCard.tsx`, `StudentForm.tsx`, and `eccd/AssessmentChecklist.tsx`.
- Other components: `frontend/src/components/parent/ChildSelection.tsx`; `frontend/src/components/teacher/TeacherChecklist.tsx`, `TeacherDialog.tsx`, `TeacherSkeleton.tsx`, `TeacherStudentForm.tsx`.
- Utility: `frontend/src/utils/eccdOfflineSync.ts`.

Confirm these against tests, CSS/public references, and intended reuse before removing them. Do not delete offline/draft code merely because a simple import graph does not reach it. Retain third-party license files; a license is not an unused component.

The root has multiple historical migration/accuracy/performance audits. They can be organized under an audit archive with links and dates; they are not inherently sensitive or unnecessary. Keep `AI_CONTEXT.md`, `AGENTS.md`, migration instructions, model limitations, and operational documentation. The ignored `.venv` and `.venv312` environments, dependency stores, caches, and test reports do not ship through a Git-based deployment. Reclaim local disk separately after confirming which interpreter/tools use them.

The frontend production build also emits a **1,395 kB minified JavaScript entry chunk, about 413 kB gzip**, plus approximately 136 kB CSS. Route/page code splitting is worthwhile for mobile users, but this warning did not fail the build.

### L4. Several documents describe obsolete behavior

**Confirmed.** `AI_CONTEXT.md` says local OTP is enabled while the inspected environment has it disabled. `frontend/README.md` says MUI/Emotion are absent, although both are active dependencies, and describes older permission/assignment behavior. Some test instructions expect legacy files or manually running servers; there is no single portable Linux CI recipe covering all current browser configurations.

**Action:** update authoritative deployment/verification instructions after the implementation decisions are made. Preserve historical reports as dated evidence; do not present old passing test counts as current results. Existing Windows-specific `.venv312`/`pnpm.cmd` browser-server commands need a portable CI equivalent.

### L5. Teacher dashboard previews bypass revoked conversation access

**Confirmed application-security finding; low severity, high confidence; CWE-863.** `backend/utils/messaging.py:7-14` requires a current SYNCED family link, active child and active adviser relationship for conversation reads. `backend/routes/messages.py` applies that check to history and relationship-aware unread counts. However, `backend/routes/analytics.py:287-296,358-378` selects the teacher's own unarchived parent messages without those relationship checks, then returns full bodies as dashboard previews and joins the parent's current name. Teacher dashboard aliases call the same analytics handler.

**Reproduction:** created a synthetic authorized parent message, then revoked the family link. `/api/messages/history` returned **403**, while `/api/analytics/stats` returned **200**, included that message body and reported an unread count of `1`. This used a disposable schema. Unlinking, transfers, student archiving and adviser moves can remove the relationship without necessarily archiving its message rows.

Only messages bearing the still-active teacher's own ID are exposed, with at most five preview bodies; no arbitrary conversation access or interception of another teacher's new messages was shown. Prior participation and potentially already-known historical content keep severity low. The current parent name and continued access still contradict the canonical revocation boundary.

**Fix:** use one authorization-aware message query for dashboard previews, unread counts and canonical messaging. Test unlink, transfer, archive and reassignment while the former teacher remains active, plus account deactivation.

### L6. Parent ML responses bypass the separate profile-name visibility permission

**Confirmed application-security finding; low severity, high confidence; CWE-863.** `backend/utils/students.py:26-31` deliberately masks names when `allow_parent_view_student_info` is false. In contrast, `backend/routes/ml.py:159-168` returns `student_name(student)` regardless of that flag, prediction access or PRE release. `student_name` includes first, middle and last names (`:63-64`). Successful parent predictions also reuse the unconditional identity from `:146-147`.

**Reproduction:** with profile viewing disabled and prediction access still false, the normal child profile masked its full name, but `GET /api/ml/parent/readiness/1` returned **200** with a nonempty student name. A SYNCED linked parent is required. No unrelated child, baseline score or unreleased prediction was retrieved. Since the parent is already linked and often knows the child's name, the incremental confidentiality impact is narrow.

**Fix:** serialize parent-visible identity through one permission-aware projection in readiness and prediction responses. Preserve stable child IDs and existing response contracts using a suitable masked/generic name; do not alter authorized teacher identity output. Test profile visibility separately from prediction permission and PRE release.

### L7. Session and shared-browser behavior needs an explicit operating policy

**Design/hardening observations, not additional validated remote vulnerabilities.** Logout clears the browser session but does not revoke an already copied access JWT; expiry or a live account/credential change is needed to invalidate it (`backend/routes/auth.py:152`, `backend/utils/authentication.py:64`). Decide whether production requires per-session immediate revocation, especially on shared school devices.

Persistent draft replay uses stored `owner_id` and `request.path`, while the Axios interceptor attaches the current token even to an absolute request URL (`frontend/src/utils/drafts.ts:51-71`, `frontend/src/services/api.ts:9`). All inspected normal producers use fixed relative application paths, and no remote storage-write or XSS primitive was found. A hostile user controlling the same browser profile could plant a queued request for a later user's ID; this is a local/shared-browser prerequisite, not an established remote attack. Restrict replay paths/methods and bearer destinations as proportionate hardening. Keep the required offline durability and never globally clear unrelated drafts as a workaround.

## Git, sensitive files, and history results

**No additional currently tracked file was proven to contain live credentials or raw learner microdata that requires immediate untracking.** This is a bounded result, not a guarantee about every historical secret or every remote surface.

| Check | Result |
| --- | --- |
| Current runtime `.env` files in Git index | Not tracked; ignored |
| History for `.env`, `backend/.env`, `frontend/.env`, `frontend/.env.local` | No commits found among reachable local refs |
| Exact matches to current JWT, backup, LRN and mail secrets | None in the inspected historical text blobs; values were never printed. A database password was not eligible for the at-least-eight-character exact-match filter, so this result does not clear short/local database passwords. |
| Static credential/private-key/common token pattern review | No confirmed live secret; database-URL matches were placeholders |
| Current tracked environment files | Three `.env.example` templates with placeholders; retain them |
| Raw ML data and beneficiary artifact paths | Ignored and not currently tracked |
| Tracked SQL fixture | Synthetic baseline schema/test fixture; retain it |
| Tracked workbook templates | Required blank assets; no 12-digit identifier/email pattern matches in current cell strings; not a forensic certification of every metadata field |
| Other current 12-digit text matches | Template SHA-256 digits and migration self-test identifiers, not established learner exports |
| Previously removed ML figures | Four aggregate training figures were removed in `2632228` but remain in history; their presence alone does not prove sensitive raw-record exposure |
| GitHub repository alerts, logs, visibility and deleted history | Not verified because the connector was unavailable |

Keep ignoring actual environments, private keys, dumps, encrypted backups, raw research data, generated exports, browser traces/storage state, and caches. **Keep tracking** the production model, official score/reference JSON, blank templates, application source, portable tests, lockfiles, and sanitized documentation. Removing those required assets would break deployment or verification.

The current `.gitignore` broadly permits `**/ca.pem`; only a public CA certificate belongs under such a whitelist. Never place private keys in an allowed CA filename. Prefer a narrowly identified public trust-root file or provider-mounted certificate.

Do not rewrite history or rotate working encryption keys solely because a scanner was unavailable. If a real exposure is later confirmed, revoke/rotate affected credentials first and plan any key/data re-encryption and history cleanup explicitly. `.gitignore` does not remove secrets already committed.

### Current uncommitted changes reviewed

The working changes are not included in remote commit `16c7d59`. They were included in this worktree review:

| Files | Result |
| --- | --- |
| `backend/ml/common.py`, `backend/routes/ml.py`, `backend/utils/eccd_scorer.py` | Sandbox totals, delayed-domain count and standard score are recomputed on the server from bounded domain scores and the official lookup table. No new caller-selected model path or assessment write was found. Official exact/closest-lower lookup behavior is retained. |
| `frontend/src/pages/teacher/MlInsights.tsx`, new `frontend/src/utils/mlScoring.ts`, `frontend/tsconfig.app.json` | Client composites normalize after domain/age changes and stale draft reloads; required JSON import crosses into the backend tree. Draft durability and desktop/mobile scenarios passed. Commit the new helper with its importing component. |
| `backend/tests/test_ml_api.py`, new `frontend/playwright.ml-sandbox.config.ts`, new `frontend/tests/ml-sandbox.spec.ts` | Additional scoring and real API/model browser coverage. Four browser scenarios pass. The Playwright launcher still contains Windows-specific `pnpm.cmd` and needs a Linux CI equivalent. |
| `backend/ml/train_random_forest.py` | Training report gate text changes; no model was retrained/replaced during this audit. It does not establish independent model accuracy. |
| `AI_CONTEXT.md`, `ML_ACCURACY_REVIEW.md`, `backend/ml/README.md`, new `MODEL_PRODUCTION_DEFENSE_AUDIT_AND_PLAN.md` | Documentation/research context, not runtime deployment configuration. Local OTP snapshot remains inconsistent with actual settings. |
| This report and `PLUGIN_HEALTH_CHECK.md` | Audit documents are untracked. The plugin-health file is an earlier dated snapshot; this report contains the fresh scan-launch/artifact-access outcome. Temporary diagnostics remain ignored. |

## PostgreSQL health results

The inspected database is local PostgreSQL **18.6**. All checks below ran read-only; only aggregate results were returned.

| Check | Result |
| --- | --- |
| Migration ledger | Versions 001–011 recorded |
| Current schema checks | Phase 2, batches 1/2, linking, editing windows, evaluator tracking, takeover, marks, predictions, ownership: all pass |
| Foreign-key anti-joins | No orphaned references found |
| Unvalidated constraints / invalid indexes | 0 / 0 |
| Duplicate evaluation keys / parent-child links / LRN hashes | 0 / 0 / 0 groups |
| Protected LRN consistency | All 11 inspected records decrypt and match their HMAC and suffix |
| Primary-key sequences | 14 checked; none behind existing record maxima |
| Database size | 73,971,391 bytes, approximately 70.5 MiB at refresh; includes local database overhead/test activity |
| Runtime role | Overprivileged locally; see M4 |

These results show no identified local relational-integrity failure. They do not certify a future Supabase restore, its PostgreSQL-version compatibility, role grants, Data API exposure, network reachability, query plans under load, or provider backups. Re-run equivalent checks after migration. In particular, verify restore/tool compatibility if the target PostgreSQL major version differs from local version 18.

## Checks executed

| Check | Outcome |
| --- | --- |
| App TypeScript: `pnpm exec tsc --noEmit -p tsconfig.app.json` | Pass |
| Vite configuration TypeScript: `pnpm exec tsc --noEmit -p tsconfig.node.json` | Pass |
| Frontend production build: `pnpm run build` | Pass; bundle-size warning |
| Frontend lint: `pnpm run lint` | Fail: three ref-access errors |
| Frontend dependency audit: `pnpm audit --json` | 10 advisories; contextual assessment in M2 |
| Python installed dependency consistency: `uv pip check --python .venv312` | Pass, 74 installed packages checked |
| Python pinned dependency audit: isolated `pip-audit -r backend/requirements.txt --no-deps --disable-pip --format json` | Four entries, three distinct advisories across three packages |
| All tracked backend test modules, loaded through unittest | 237 tests; 232 pass, four failures, one error |
| New ML sandbox Playwright suite | Four pass, desktop and 320px mobile; actual local API/inference, derived scores, stale drafts, reload/offline/reconnect |
| Synthetic formula export reproduction, rerun | Confirmed `CHECKLIST!W18` is a formula cell; no external requests or spreadsheet execution |
| Synthetic production OTP guard, rerun | Confirmed production accepts OTP disabled |
| Synthetic shared-guardian authorization reproduction | Direct locked-child edit 403; editable-sibling edit 200 changed the locked child's shared guardian name/education |
| Synthetic revoked-conversation reproduction | History 403; dashboard 200 still returned the historical body and unread count |
| Synthetic ML profile-visibility reproduction | Normal profile name masked; readiness 200 still returned a name while prediction access was false |
| `git diff --check` | Pass; existing LF/CRLF conversion notices only |
| Reachable history secret checks / remote ref listing, rerun | 29 commits, 714 blobs including 695 UTF-8 text blobs; no current-secret/common-token/private-key matches; remote tips unchanged |
| Codex Security managed workflow | Preflight ready and Standard scan started through process-only Python selection; checkpoint persistence blocked by Windows directory/file checks; no sealed report/SARIF |
| GitHub plugin retry | `github.get_repo`: `Mcp error: -32001: Unknown tool`; API-level review incomplete |
| Live Supabase, hosted browser smoke tests, SMTP delivery | Not performed |

Expected error-path logs appeared during backend tests; they are not evidence of live school database outages. The missing legacy-reference test and stale assertions are reported rather than silently excluded. No training experiment was rerun and no model artifact was replaced.

## Recommended deployment arrangement and release gates

| Component | Recommended arrangement for this codebase |
| --- | --- |
| Frontend | Vercel static Vite build; repository root available; build `pnpm --dir frontend run build`, output `frontend/dist`; pinned pnpm/compatible Node; SPA fallback; HTTPS API/socket origins |
| Backend | Render Python web service; repository root, Python 3.12, reproducible uv build; `backend.main:app`, one worker initially, no reload, host `0.0.0.0`, provider `$PORT`, `/ready` health check |
| Database | Supabase PostgreSQL accessed only by FastAPI; direct/session connection as appropriate, verified TLS, restricted runtime role, protected API exposure, explicit migration/recovery procedure |
| OTP | HTTPS email-provider API for Render Free; a paid service may retain SMTP on a permitted port after real delivery tests; secrets only in backend provider configuration; production verification enabled |
| Long-term data | PostgreSQL and encrypted offsite backups; retain required model/templates in Git; no dependency on runtime local-disk writes |

Render supports WebSockets, so keeping Socket.IO on the backend is compatible. [Render web-service capabilities](https://render.com/docs/web-services). Supabase can be used as ordinary PostgreSQL; changing to Supabase Auth or replacing the existing API is not required by this hosting choice. See its [PostgreSQL connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

The proposed three-provider arrangement is a suitable destination for this codebase. It adds cross-provider database connectivity and three sets of operational settings, so keep regions close and validate the connection from Render. Hosting PostgreSQL on Render is also compatible and offers same-provider private networking; it is an alternative operational choice, not a requirement to fix application compatibility. The current evidence does not justify switching away from Supabase solely because it is a different provider. [Render networking](https://render.com/docs/web-services).

Before inviting real users:

1. Resolve OTP transport and production bypass/configuration issues, remediate the confirmed authorization/projection/parser/export findings with preserved business contracts, patch reviewed dependencies, and restore green verification gates.
2. Prepare a reviewed release commit containing all required files; prove a clean Linux build and explicitly select the correct branch for both hosts.
3. Configure Supabase TLS, connection mode, role privileges and Data API isolation. Restore into staging, verify accounts/data/keys/sequences, and complete an offsite disaster-recovery drill.
4. Exercise real HTTPS login/registration/OTP, password changes and remembered devices; confirm blocked users, CORS rejection and rate limits work through the provider proxy.
5. Exercise teacher section moves, student transfers with preserved evaluations, parent ownership and all permission locks, unreleased score masking, chat reconnects, imports/exports, and authorized ML requests.
6. Exercise deep-link refreshes and form editing across cold starts, failed saves, reloads and network reconnects. Confirm only server-confirmed draft revisions are removed and unrelated drafts survive.
7. Measure realistic concurrency and monitor database size, pool pressure, latency, memory, email failures and recovery status. Keep ML use within its documented research limitations.
8. Resolve the managed scanner's Windows artifact-access failure and complete a source-matched scan; restore GitHub API dispatch and inspect repository alerts/protections. Do not mark either review complete based only on plugin installation or scan initiation. This report itself was updated after the managed scan's initial snapshot, so account for that documentation drift when resuming its original contract.

**Acceptance:** a reviewed reproducible release, working production OTP, protected Supabase access, green meaningful checks, successful hosted smoke tests, and a demonstrated full restore. Until these are evidenced, the proposed stack is a suitable destination but this checkout is not production-approved.
