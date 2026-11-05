# Branch Merge-Readiness Audit

Date: **2026-11-05**  
Branch: **`feat/feedbacks-changes`**  
Verdict: **Readiness Unverified — local test blockers are resolved; external deployment checks remain outstanding.**

No confirmed application security vulnerability or merge-blocking backend correctness defect was found in the reviewed changes. The targeted follow-up resolved FE-C01, FE-N02 and FE-N03. Auth/privacy passed all 26 tests; the final messaging run passed all 22 tests, including desktop/mobile fallback recovery. All requested local verification checks pass. The previous **Not Ready** verdict no longer applies to those local blockers. Provider-side deployment and production checks in section 5 remain unverified; this report does not certify automatic deployment.

## 1. Review scope and priority definitions

AMES manages child records, adviser ownership, parent access, ECCD evaluations, private messaging and research predictions. This review assumes the single API process configured in `render.yaml`, concurrent school users and unreliable client connections. It does not establish production load capacity.

| Scope item | Reviewed state |
| --- | --- |
| HEAD | `46ac7e9c78f4b862482070982a49d58637323c63` |
| Merge base / remote main | `24bd95dbf56acf6d461ac88ad8d590c55fbdaf80`; `git ls-remote origin refs/heads/main` confirmed the same remote revision during this audit |
| Working tree at entry | 76 dirty entries: 64 tracked modifications and 12 untracked files, including the audit plan; the actual inventory, rather than the requested approximate count, was preserved |
| Source review | All 25 changed/untracked backend application files and 48 frontend source files relative to main; changed behavior was traced into supporting code |
| Other material | Deployment/CI configuration, manifests, lockfiles, migrations, related tests, `.gitignore`, `AGENTS.md`, authoritative `AI_CONTEXT.md` sections and historical-note boundaries |
| Method | Graphify graph query, current-source/diff review, Ponytail review, Codex Security diff workflow, dependency advisory checks, targeted tests and Git hygiene inspection |
| Targeted follow-up | Same HEAD; only three browser tests, layout trailing whitespace, the unused card implementation and this report changed. No backend logic, active frontend behavior, configuration, manifest or dependency changes |

**Critical** means a merge-blocking issue under the agreed readiness policy. **Not Critical** means a confirmed issue that does not establish unsafe application operation. Security severity is recorded separately. Unresolved questions and incomplete verification are listed as coverage gaps, not invented vulnerabilities.

The reviewed deliverable is the complete working tree, including its untracked migration, preview components and tests. HEAD alone is not the tested release. Before merging, the intended source must be included in a concrete commit and its CI/deployment checks verified. This audit did not stage, commit, push, merge or deploy.

The plugin accepted the uncommitted diff against HEAD, not the combined main-to-working-tree baseline. Its 47 source/config entries were all reviewed; committed branch changes were additionally reviewed against main outside that inventory. The plugin scan completed with **zero reportable security findings** and **partial verification coverage**, because runtime verification was still running when its source review was sealed. The completed results below supersede that runtime snapshot for this consolidated report. No candidate required a separate security validation or attack-path phase.

## 2. Critical

### Frontend findings

#### FE-C01 — Required auth/offline regression tests contradicted the current behavior (resolved)

- **Category / status:** Critical readiness gate; confirmed test defects; **resolved in the targeted test-only follow-up**. **Security severity:** not applicable; no application exploit demonstrated.
- **Locations:** `frontend/tests/auth-security.spec.ts:175`, especially assertions at line 252; `frontend/tests/terms-privacy.spec.ts:215`, especially line 227. Connected behavior: `frontend/src/utils/drafts.ts:121` and the network-error branch of `frontend/src/services/api.ts`.
- **Reproduce:** `pnpm.cmd --dir frontend exec playwright test --config playwright.auth-security.config.ts`.
- **Original audit result:** **22 passed, 4 failed**, with the same two failures on desktop and mobile. The queue test expected five non-ECCD requests and deletion of their drafts; the implementation correctly made zero such requests. The registration test expected `Your draft has been kept`, but received the mandated `Your draft is saved on this device. Reconnect and submit again.`
- **Original cause and impact:** The tests retained their older contracts when shared replay and network messaging changed. The queue fixture had no teacher role or valid teacher ECCD draft, so it could not exercise the permitted replay path. The registration test aborted before checking reload/retry durability. These test defects prevented verification; reverting application behavior to satisfy the old assertions would violate the offline-scope rules.
- **Resolution:** Updated only the two test files. The queue test obtains a real authenticated teacher session, checks hostile-path/method validation, asserts zero non-ECCD replay requests and retained inputs, and exercises an owner-scoped `POST /api/eccd/evaluate` control. HTTP 202/204 retain the teacher draft; HTTP 200 confirms it. The registration test expects the mandated message and retains its reload, acceptance, input and successful-retry assertions. No application behavior changed.
- **Follow-up verification:** The complete auth/privacy configuration passed **26 tests** across desktop/mobile. After completing the control's assessment request fields, a focused `--grep "queue retains"` rerun passed **both projects**. Standalone typing of all three edited browser test files passed.
- **Origin / evidence:** Existing tests became stale against this branch's uncommitted replay/message changes. The dedicated offline suite passed its owner, role, route, revision and manual-retry scenarios; the failing assertions were inspected directly.

### Backend findings

**No confirmed Critical backend finding.** The requested targeted backend run passed all 500 tests and 655 subtests, including ACL, home-observation integrity, schema/startup and export coverage. This does not verify the deployed database or runtime role.

### Documentation / repository / deployment findings

**No additional confirmed Critical defect.** Deployment readiness remains conditional on the external checks in section 5. Documentation discrepancies were corrected as described below. A green subset of GitHub CI must not be treated as evidence that omitted checks passed; the local browser results are recorded separately.

## 3. Not Critical

### Frontend findings

#### FE-N01 — Frontend lockfile still resolves two advisory-affected dependencies

- **Category / status:** Dependency maintenance; unresolved. **Advisory severity:** High for `follow-redirects`, Moderate for `minimatch`. **Application exploit:** not demonstrated.
- **Locations:** `frontend/pnpm-lock.yaml:1249` (`follow-redirects@1.16.1`) and `frontend/pnpm-lock.yaml:1583` (`minimatch@10.2.6`); related overrides at `pnpm-workspace.yaml:13` and `frontend/pnpm-workspace.yaml:6`.
- **Reproduce / evidence:** `pnpm.cmd --dir frontend audit --json` exits 1 with one High and one Moderate advisory. The separate root audit exits 0 for its own dependency graph; it does not clear frontend findings.
- **Exposure:** `follow-redirects` is the Node HTTP path behind Axios. The deployed frontend is a browser SPA, and Axios maps its browser build away from that adapter. The advisory also reports that Axios 1.20.0 normalizes the relevant array. `minimatch` is reached through development lint tooling; no application path accepts attacker-provided glob patterns. These controls support maintenance priority rather than a demonstrated production credential leak or denial of service.
- **Smallest proposed fix:** Refresh the mirrored override/lockfile resolutions to supported patched packages, using `follow-redirects >=1.16.2` and upstream tooling that resolves patched `minimatch >=11.0.1`. Verify compatibility rather than forcing an untested major override. Rerun audit, lint and build. Dependencies were not changed.
- **Origin:** Both versions already exist in main; neither package manifest nor lockfile was changed by this branch's audited source work.
- **Sources:** [follow-redirects advisory](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p), [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).

#### FE-N02 — Existing layout edits failed the whitespace check (resolved)

- **Category / status:** Repository quality; **resolved in the targeted follow-up**. **Security severity:** not applicable.
- **Locations:** `frontend/src/layouts/MainLayout.tsx:123`, line 124 and line 136.
- **Original reproduction / impact:** `git diff --check` exited 2 and reported trailing whitespace on these three added lines. Types, lint and build still passed; no user-facing defect was established.
- **Resolution / verification:** Removed only the trailing whitespace on lines 123, 124 and 136. `git diff --check` now exits **0**. The layout's JSX and behavior were preserved.
- **Origin:** Present in the uncommitted edits at audit entry; not introduced by this audit.

#### FE-N03 — Unused dashboard component duplicated the active card markup (resolved)

- **Category / status:** Maintenance; **resolved in the targeted follow-up**. **Security severity:** not applicable.
- **Locations:** `frontend/src/components/teacher/DashboardStatCard.tsx:13`; its props type is imported at `frontend/src/pages/teacher/Dashboard.tsx:23`.
- **Evidence / impact:** Repository reference inspection found the component declaration and type-only references, with no runtime caller. The teacher dashboard renders its own card markup. This leaves two implementations that can drift; there is no confirmed user-visible error.
- **Resolution / verification:** Removed the 46-line unused component implementation and retained the exported `DashboardStatCardProps` interface and its existing import path. Graphify inbound edges and current source searches show only type imports; no backend or frontend test references the component. App typing, lint and production build passed. The active dashboard markup was not changed.
- **Origin:** Introduced by committed branch changes relative to main.

### Backend findings

#### BE-N01 — Pinned Python packages have advisories outside the demonstrated request paths

- **Category / status:** Dependency maintenance; unresolved. **Upstream severity:** Critical for the JOSE advisory; High for the DNS, ECDSA and ASN.1 advisories. **Application exploit:** not demonstrated.
- **Location / reproduction:** `backend/requirements.txt`; an OSV batch query checked all **61 pinned package/version pairs** without installing a scanner. It identified four packages and seven distinct issues after resolving duplicate advisory aliases. `uv pip check --python .venv312` passed for 78 installed packages, but checks compatibility rather than vulnerabilities.

| Pinned package | Advisory / affected behavior | Current exposure evidence | Minimal follow-up |
| --- | --- | --- | --- |
| `dnspython==2.8.0` | [DNS message decompression CPU exhaustion](https://github.com/advisories/GHSA-45c3-73f7-pv4m) | No backend DNS resolver calls found; installed Pydantic email validation explicitly sets `check_deliverability=False` | Upgrade to a compatible patched version, at least 2.9.0 |
| `python-jose==3.5.0` | [DER public-key / HMAC algorithm confusion](https://github.com/advisories/GHSA-3qf3-8w2g-rqmx) | Session and OTP verification explicitly restrict `algorithms=["HS256"]` at `backend/utils/authentication.py:72` and line 167; configuration allows only HS256, and no asymmetric public key is used as the secret | Preserve algorithm/key restrictions; monitor an upstream fix or separately review a supported replacement; the advisory currently lists no patched version |
| `ecdsa==0.19.2` | [P-256 signing timing exposure](https://github.com/advisories/GHSA-wj6h-64fc-37mp) | No application ECDSA signing/key-generation path found; current tokens use HMAC | Keep asymmetric signing unreachable and review dependency necessity with its parent packages; upstream lists no planned timing fix |
| `pyasn1==0.6.4` | Four decoder CPU-exhaustion issues: [BIT STRING](https://github.com/advisories/GHSA-2qm8-x737-gmw5), [constructed strings / ANY](https://github.com/advisories/GHSA-9m75-vc3g-4x39), [containers](https://github.com/advisories/GHSA-fm9c-5rcf-2q5p), [REAL](https://github.com/advisories/GHSA-mm57-4v3p-rchx) | No application ASN.1 decoding entry point found; asymmetric JOSE paths are not selected by the current JWT routes | Upgrade to a compatible patched version, at least 0.6.5 |

- **Impact / limits:** These are affected dependency versions, not proof that arbitrary JWTs can be forged or that a request can reach the vulnerable decoders. A future change enabling these paths would require renewed triage. No untrusted PoC or production exploit was executed.
- **Origin:** All four pins already exist in main. No requirements changes were made.

### Documentation / repository / deployment findings

#### DOC-N01 — Migration and browser-harness instructions had drifted

- **Category / status:** Documentation accuracy; **corrected in this audit**. **Security severity:** not applicable.
- **Original locations:** `AI_CONTEXT.md:681`, line 788, line 798 and its Playwright inventory near line 2043; `AGENTS.md:23`; `DEPLOYMENT.md:15` and line 41; `backend/scripts/README.md:37`; `backend/migrations/README.md:328`. Line numbers describe the entry snapshot where applicable.
- **Trigger / impact:** Following the old instructions omitted migration 015 from the manual upgrade sequence, understated fresh bootstrap as 001–014, claimed startup never applies migrations, and pointed the messaging harness at a removed temporary uv executable/database override. The live code checks 015 and automatically applies only 016. Those discrepancies can misdirect upgrade/testing work.
- **Correction / evidence:** Reconciled the instructions with `backend/main.py:69`, `backend/migrations/teacher_marked_at.py` and `backend/scripts/seed_supabase.py`; documented nullable timestamps without backfill, all 14 Playwright configurations, current messaging prerequisites and the targeted pytest command. Preserved dated earlier test results as historical observations. The five modified Markdown files pass their scoped whitespace check.
- **Origin:** A mix of documentation predating committed migration 015 and uncommitted migration 016/harness changes. No runtime behavior was altered.

## 4. Security, ACL, migration 016 and offline-scope evidence

| Surface | Reviewed controls and result |
| --- | --- |
| Authentication / sessions | Live account/session checks, OTP binding, credential revocation, remembered-device boundaries, explicit HS256 verification, role separation and Socket.IO authorization inspected. Real OTP/device flows and bearer-origin isolation passed browser tests. FE-C01's stale assertions were corrected; all 26 auth/privacy cases passed in the follow-up. |
| Record ACL | `backend/utils/access.py:71` and connected dependencies resolve an active Primary Adviser. Parents require a SYNCED family link, active student and eligible adviser; permissions come from that adviser. Teacher/student/section routes check ownership before returning records or exports. Backend regression run passed. |
| Eight parent permissions | Score release, marks visibility, predictions and editing remain independent. Locked latest-period results are masked rather than replaced with an older released period. Parent response schemas exclude staff-only mastery IDs. Home editing also checks section/period windows. |
| Saved home observations | `backend/utils/assessments.py:78` locks student, section and questions before validating parent writes. Changed saved observations conflict; identical retries preserve author/time. Teacher corrections explicitly identify edited questions. Both backend tests and browser home-lock scenarios passed. |
| Migration 016 | Exclusive migration-ledger lock; nullable timezone-aware timestamp without default/backfill; idempotent ledger insertion and shape validation; transaction inside startup. `test_home_assessment_locks.py:173` exercises row preservation, repeated application and the actual `initialize_runtime()` path twice on its disposable schema. Full backend run passed. No live schema was upgraded by this audit. |
| Offline replay | `frontend/src/utils/drafts.ts:96` and line 121 require the exact teacher-owned key, `admin` role, current owner/token/revision and exact `POST /api/eccd/evaluate`. Other forms/uploads stay manual. Owner/account-change, stale-confirmation, reload, offline/reconnect and HTTP 204/500 preservation checks passed in the 94-case suite. |
| Draft confirmation | Deletion requires HTTP 200/201 plus the matching revision. Parent child-switch responses and omitted locked drafts are protected. IndexedDB file confirmation compares revisions transactionally. No global localStorage clearing was found in the reviewed flow. |
| Preview / files | Ownership checks precede workbook/HTML generation. Preview cells are HTML-escaped and constrained by CSP; the iframe has no script permission. Spreadsheet string cells are explicitly typed as strings (`backend/utils/excel.py:157`). Import bounds/parser protections and backup compatibility were reviewed and tested. |
| Analytics / predictions | Shared requests and late responses are scoped to their selected section/period/account. Backend and desktop dashboard/sandbox checks passed. Parent access/revocation passed its isolated rerun; the initial timeout is retained in the verification record. Predictions do not replace official scores. |

One **unconfirmed business-scope question** remains: the PRE mastery guard is enforced by teacher/parent evaluate endpoints, while spreadsheet imports can carry historical MID/POST answers directly. `AI_CONTEXT.md` explicitly scopes the new guard to those save/draft paths and preserves historical conflicts. This is not reported as an import defect without a requirement extending that rule to historical imports.

## 5. Verification results and coverage gaps

### Build, types and backend

The following table records the **original audit**. Fresh checks for the targeted follow-up are listed separately below; the backend was not rerun because no backend file changed.

| Executed command | Result |
| --- | --- |
| `pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json` | Passed |
| `pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json` | Passed |
| `pnpm.cmd --dir frontend run lint` | Passed |
| `pnpm.cmd --dir frontend run build` | Passed; Vite production build completed |
| `uv pip check --python .venv312` | Passed; 78 installed packages compatible |
| `uv run --no-project --python .venv312 python -m pytest backend/tests -q` | **500 passed, 655 subtests passed, 10 warnings; 1830.59 seconds** |
| `pnpm.cmd --dir frontend exec node --test --experimental-strip-types tests/unit/eccdDrafts.unit.ts` | 5 passed |
| Exact standalone browser TypeScript command currently in CI | Passed |
| Standalone typing for the new offline specs with JSX and `node,vite/client` types | Passed |
| `git diff --check` | Initially failed: three existing trailing-whitespace lines; FE-N02. Resolved in follow-up; current exit 0 |
| Scoped `git diff --check` for the five documentation edits | Passed |

The exact CI typing command was:

```powershell
pnpm.cmd --dir frontend exec tsc --ignoreConfig --noEmit --target es2023 --lib es2023,dom --module esnext --moduleResolution bundler --types node --skipLibCheck tests/parent-sync.spec.ts tests/parent-profile.spec.ts tests/teacher-import.spec.ts playwright.parent-sync.config.ts
```

New offline specs import application types, so their standalone check used:

```powershell
pnpm.cmd --dir frontend exec tsc --ignoreConfig --noEmit --target es2023 --lib es2023,dom --module esnext --moduleResolution bundler --types node,vite/client --skipLibCheck --jsx react-jsx tests/offline-scope.spec.ts tests/offline-settings.spec.ts playwright.parent-sync.config.ts
```

An initial expanded standalone invocation without JSX/Vite types failed with configuration errors; the corrected command above passed. Some uv/pnpm sandbox cache/network attempts required approved retries. They were not application failures and no project dependency was installed or updated.

### Targeted Playwright runs

Every row used `pnpm.cmd --dir frontend exec playwright test --config <configuration>` and an existing configuration. An omitted project selector means all configured projects ran.

| Configuration / selection | Initial result | Follow-up |
| --- | --- | --- |
| `playwright.parent-sync.config.ts` | **94 passed**, desktop/mobile, including both new offline specs and import/profile/link retries | None needed |
| `playwright.parent-assessment.config.ts` | 32 passed, 1 tablet timeout | Same test, `--project tablet --grep "drafts survive reload"`: **1 passed** without changing source or timeout |
| `playwright.auth-security.config.ts` | 22 passed, 4 failed, desktop/mobile | FE-C01 resolved in follow-up: **26 passed**, plus final teacher-control rerun **2 passed** |
| `playwright.eccd-exports.config.ts` | **30 passed**, desktop/tablet/mobile | None needed |
| `playwright.messaging.config.ts` | 20 passed, 2 failed, desktop/mobile | Original focused rerun still failed on mobile. Targeted follow-up corrected recovery synchronization; final full run **22 passed** |
| `playwright.teacher-management.config.ts --project desktop` | **11 passed** | None needed |
| `playwright.teacher-dashboard.config.ts --project desktop` | **8 passed** | None needed |
| `playwright.chairman-dashboard.config.ts --project desktop` | **7 passed** | None needed |
| `playwright.parent-ml.config.ts --project desktop` | 5 passed, 1 timeout | `--grep "teacher switch persists"`: **1 passed**, including revocation hiding results |
| `playwright.ml-sandbox.config.ts --project desktop` | **10 passed** | None needed |

Initial failures remain visible here even when a rerun passed. Successful suites sometimes printed a Vite web-server shutdown `ELIFECYCLE` message; the reported suite exit code and final Playwright summary, not that shutdown message, determine the row's result.

### Targeted blocker-resolution follow-up (2026-11-05)

| Executed command | Follow-up result |
| --- | --- |
| `git diff --check` | **Passed, exit 0** |
| `pnpm.cmd --dir frontend exec playwright test --config playwright.auth-security.config.ts` | **26 passed**, desktop/mobile, 4.8 minutes |
| Same auth configuration with `--grep "queue retains" --output test-results/merge-blocker-auth-control` | **2 passed** after completing the valid ECCD control payload, 53.9 seconds |
| `pnpm.cmd --dir frontend exec playwright test --config playwright.messaging.config.ts` | First follow-up: **21 passed, 1 failed**; unrelated desktop handshake count expected 3 reads, observed 4 |
| Same messaging configuration with `--output test-results/merge-blocker-messaging-confirmation` | **22 passed**, desktop/mobile, 7.5 minutes; final complete run exited 0 |
| `pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json` | **Passed** |
| `pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json` | **Passed** |
| `pnpm.cmd --dir frontend run lint` | **Passed**, including a final rerun after the test edits |
| `pnpm.cmd --dir frontend run build` | **Passed**, 1,689 modules transformed |
| Standalone typing of the three edited browser tests, below | **Passed** |

```powershell
pnpm.cmd --dir frontend exec tsc --ignoreConfig --noEmit --target es2023 --lib es2023,dom --module esnext --moduleResolution bundler --types node,vite/client --skipLibCheck --jsx react-jsx tests/auth-security.spec.ts tests/terms-privacy.spec.ts tests/messaging.spec.ts
```

The standalone check initially encountered pnpm metadata access failure; its approved retry exposed a generic return-type error in the test-only observation wrapper. That type was corrected and the final check passed. No dependency installation or update was needed.

The fallback test now observes the existing client's recovery promise through a test-only request wrapper that forwards the original call and restores the method on first use. Each recovery settles, including its scheduling `finally`, before the next clock advance. Service source and timing constants are unchanged. The fallback case passed in both complete follow-up runs on desktop and mobile, without increasing timeouts or weakening request-count assertions.

### Remaining verification gaps

1. **The original mobile fallback gap is resolved; a separate handshake test showed run variability.** Awaiting recovery completion fixed the original fallback test, which passed twice per viewport. The first follow-up full messaging run had a desktop failure in `a rejected socket handshake respects Retry-After before hydration and reconnect`: expected three reads, observed four. Its trace shows two contacts reads, one history read and one unread-count read. The unchanged handshake test passed in the subsequent full 22-case run. Its failure cause was not conclusively established, so repeatability is not guaranteed by the successful rerun. The first follow-up trace remains under ignored `frontend/test-results/messaging/`; the complete confirmation run used a separate ignored output directory. No application fix or unrelated test assertion change was made.
2. **Initial parent-assessment and parent-prediction timeouts did not recur in focused reruns.** Their causes were not conclusively established. The reruns did not alter application files or test timeouts.
3. **CI is narrower than this audit.** `.github/workflows/parent-sync-excel.yml` runs a focused backend unittest list and the parent-sync browser configuration. It does not execute the whole backend suite, migration-016/home-lock module, auth suite or messaging suite. The newly added offline specs run via the modified parent-sync config, but the explicit CI browser typing list does not yet name them. CI and branch-protection settings were not changed.
4. **Production remains unverified.** No live database ledger, runtime role, deployed frontend environment, actual provider auto-deploy branch, required-status policy, email delivery, backup restoration or deployment smoke test was inspected. In particular, confirm migration 015 is applied; migration 016's startup role must have the required table/ledger privileges. Verify production OTP, TLS, exact CORS origins and public frontend API/socket origins from the provider settings before deployment.
5. **Coverage is bounded.** This was a changed-code review with supporting-code tracing, not an exhaustive reread or fuzz/load test of every unchanged line. Remaining browser configurations/projects, including mobile ML/teacher-management and additional dashboard widths, were not run. No claim of complete cross-device coverage is made.
6. **Dependency and secret checks have limits.** OSV checked the pinned requirements, not every extra installed Python package. `pip_audit` was absent and was not installed. Git scanning used targeted redacted patterns, not a full entropy/PII scanner; binary/model internals and large historical blobs were excluded. No claim that Git history or the trained model is universally free of sensitive information is made.
7. **A clean-checkout run may have different prerequisites and counts.** The local `backend/tests/test_ml_model.py` is intentionally ignored and was available to targeted local collection. Pytest is present in this environment but is not pinned in production requirements; CI currently uses unittest. The 500-case result describes this local active-test directory, not a promise that a fresh deployment checkout contains the same research tests or development tools.

## 6. Repository hygiene and documentation changes

### Sensitive data / tracking checks

- Scanned **351 current text files** with redacted key/token/credential patterns. Candidate matches were inspected as template placeholders or synthetic test/CI credentials; no live credential was confirmed. No secret values are included in this report.
- Scanned **1,083 reachable text blobs across 47 commits** for private-key markers, common provider tokens and remote credential URLs; no matches. Excluded 21 binary/large blobs. Historical filename inspection found templates/test fixtures rather than tracked live `.env` files.
- `git ls-files --cached --ignored --exclude-standard` returned no files. Existing ignore rules cover local environment files, raw spreadsheets, caches, generated exports/builds and browser results. `backend/.env` and `frontend/.env.local` still exist locally and remain ignored.
- The two **tracked blank templates** contained no email or 12-digit-identifier matches in their cells. A separate local raw workbook had identifier-shaped cells and is already ignored; it was not added, deleted or included in report content. The tracked inference model, scoring/reference assets and blank export templates were retained.
- Generated build/test outputs remain in ignored output directories. The pre-existing reports, plans, research material and all source files were retained. No `.gitignore`, index or tracking changes were needed or made by this audit.

### Original audit documentation-only edit log

| File | Changes made by this audit |
| --- | --- |
| `AGENTS.md` | Documented sole startup migration 016, targeted backend test collection, compatibility parameter names versus student-ID callers, and immutable home-observation / teacher-correction timestamp rules |
| `AI_CONTEXT.md` | Updated current review date; linked this report; reconciled startup/bootstrap and manual 015/016 commands; preserved dated test notes; updated all 14 Playwright configurations, current messaging prerequisites and the disposable OTP fixture description |
| `DEPLOYMENT.md` | Corrected bootstrap range, added explicit 015/016 apply/check instructions, and documented the startup exception |
| `backend/migrations/README.md` | Corrected the remaining stale bootstrap range to 001–016 |
| `backend/scripts/README.md` | Reconciled the current bootstrap range and nullable timestamp behavior |
| `MERGE_READINESS_AUDIT.md` | Created this consolidated report |

During the original audit, file hashes taken before testing and compared afterward confirmed that **the only changed pre-existing files were the five Markdown documents above**. No pre-existing file was deleted. All application, migration, test, configuration, manifest, lockfile and binary assets stayed byte-for-byte unchanged, including `EccdCardPreviewDocument.tsx`, `EccdDownloadDialog.tsx` and `eccdCardPreview.css`. No destructive Git command, live migration or school-data mutation was performed. Database tests used their existing isolated-schema fixtures; inspection/checks and test-server startup were confined to those fixtures.

### Targeted follow-up edit log

| File | Authorized change |
| --- | --- |
| `frontend/tests/auth-security.spec.ts` | Assert retained non-ECCD queues and zero automatic requests; validate hostile requests; add an authenticated teacher ECCD replay control with unconfirmed/confirmed responses |
| `frontend/tests/terms-privacy.spec.ts` | Update only the offline alert text assertion; preserve reload/retry durability checks |
| `frontend/tests/messaging.spec.ts` | Await the recovery completion promise before subsequent fake-clock advances in the disconnected fallback test |
| `frontend/src/layouts/MainLayout.tsx` | Remove trailing whitespace on exactly lines 123, 124 and 136 |
| `frontend/src/components/teacher/DashboardStatCard.tsx` | Remove only the unused implementation; retain the exported props type and its import path |
| `MERGE_READINESS_AUDIT.md` | Mark resolved findings, record fresh checks and retained failures, and update the verdict |

Task-entry SHA-256 hashes covered 356 existing Git-visible files. The final comparison permits changes only to these six files; every other pre-existing file is preserved. No files were deleted or untracked. Backend files, active frontend services/hooks/components, configuration, manifests, lockfiles and requirements were not modified, apart from the explicitly authorized whitespace and unused-code cleanup above. Preview assets and all other existing work remain intact. No commit, push, merge, deployment or live migration was performed. The browser configurations used their existing disposable database fixtures.

Ponytail checkpoint: **Did this change introduce unnecessary abstractions, extra state, or new dependencies that existing code already handles?** No application abstraction, state or dependency was added. The small test-only observer awaits the existing promise without adding a production test hook or changing service behavior.

### Retained security-scan provenance

Codex Security scan ID: `ed44b085-022c-43bf-bf74-aaa8df029675`. Canonical artifacts are outside the repository at:

```text
C:\Users\user\.codex\state\plugins\codex-security\scans\AMES-with-ML\46ac7e9c78f4b862482070982a49d58637323c63_20261105T055740Z_2ss_vhgu
```

The sealed `report.md`, `findings.json`, `coverage.json`, threat model and SARIF belong to the source-security scan. This Markdown file is the consolidated readiness decision. The plugin reported measured usage at sealing: **15,426,142 total tokens; 15,399,867 input tokens; 15,081,728 cached input tokens; 26,275 output tokens**, across three threads. These are the tool's measured rollout totals, including cached input, not an estimated cost or a claim of unique source size. Daybreak access was not granted; local scan artifacts were nevertheless finalized and read successfully.

## 7. Reviewed application-source inventory

Review used each file's changes plus the supporting current behavior; it did not reread every unchanged presentation line. Related tests were inspected selectively and executed as recorded above.

### Backend — 25 files

```text
backend/main.py
backend/migrations/optional_student_lrn.py
backend/migrations/phase2.py
backend/migrations/teacher_marked_at.py
backend/models/eccd.py
backend/models/student.py
backend/routes/analytics.py
backend/routes/eccd.py
backend/routes/sections.py
backend/routes/students.py
backend/schemas/analytics.py
backend/schemas/backup.py
backend/schemas/eccd.py
backend/schemas/operations.py
backend/schemas/section.py
backend/schemas/student.py
backend/scripts/seed_supabase.py
backend/utils/assessments.py
backend/utils/checklist_workbook.py
backend/utils/dashboard_analytics.py
backend/utils/eccd_dates.py
backend/utils/excel.py
backend/utils/lrn.py
backend/utils/mastery.py
backend/utils/workbook_preview.py
```

### Frontend — 48 files

```text
frontend/src/components/ChatInterface.tsx
frontend/src/components/SyncStatus.tsx
frontend/src/components/chairman/DelaySummary.tsx
frontend/src/components/chairman/SectionPicker.tsx
frontend/src/components/chairman/dashboardFilters.ts
frontend/src/components/chairman/ui.tsx
frontend/src/components/parent/HomeAssessmentForm.tsx
frontend/src/components/parent/ReadOnlyDomainChecklist.tsx
frontend/src/components/teacher/DashboardStatCard.tsx
frontend/src/components/teacher/EccdCardPreviewDialog.tsx
frontend/src/components/teacher/EccdCardPreviewDocument.tsx
frontend/src/components/teacher/EccdDownloadDialog.tsx
frontend/src/components/teacher/ParentAssessmentAccessSettings.tsx
frontend/src/components/teacher/PendingEvaluations.tsx
frontend/src/components/teacher/eccdCardPreview.css
frontend/src/components/teacher/reference-utilities.css
frontend/src/context/MessagingContext.tsx
frontend/src/context/SettingsContext.tsx
frontend/src/context/TeacherContext.tsx
frontend/src/hooks/assessmentRefresh.ts
frontend/src/hooks/useParentAssessment.ts
frontend/src/hooks/usePendingEvaluations.ts
frontend/src/hooks/useTeacherAssessment.ts
frontend/src/hooks/useTeacherDashboard.ts
frontend/src/layouts/MainLayout.tsx
frontend/src/pages/chairman/Dashboard.tsx
frontend/src/pages/chairman/EccdQuestionsManagement.tsx
frontend/src/pages/chairman/StudentRecords.tsx
frontend/src/pages/chairman/SystemSettings.tsx
frontend/src/pages/chairman/TeacherManagement.tsx
frontend/src/pages/parent/ChildManagement.tsx
frontend/src/pages/parent/Dashboard.tsx
frontend/src/pages/parent/ParentEccdAssessment.tsx
frontend/src/pages/teacher/Dashboard.tsx
frontend/src/pages/teacher/EccdAssessment.tsx
frontend/src/pages/teacher/MessageParent.tsx
frontend/src/pages/teacher/MlInsights.tsx
frontend/src/pages/teacher/StudentManagement.tsx
frontend/src/pages/teacher/TeacherSettings.tsx
frontend/src/services/api.ts
frontend/src/services/messaging.ts
frontend/src/services/sharedGet.ts
frontend/src/types.ts
frontend/src/utils/drafts.ts
frontend/src/utils/eccdDrafts.ts
frontend/src/utils/eccdOfflineSync.ts
frontend/src/utils/fileDrafts.ts
frontend/src/utils/teacherMetrics.ts
```
