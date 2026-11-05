# Branch Merge-Readiness Audit Plan

Date: 2026-11-05  
Target branch: `feat/feedbacks-changes`  
Status: Planned; this document does not contain confirmed audit findings.

## Objective and scope

Audit the active frontend and backend, including committed branch changes, uncommitted edits, and relevant untracked source files. Check security, correctness, deployment readiness, documentation accuracy, and repository hygiene before merging into `main` triggers automatic deployment.

Compare the working tree against the merge base with `origin/main`, recording the reviewed commit and whether the remote baseline was verified as current. Review every changed source file and trace connected behavior into unchanged code. Use the existing Graphify dependency graph, verify it against active source, and apply Ponytail Audit and the Codex Security diff workflow after its required preflight.

The agreed scope is **audit report, documentation updates, and conservative repository cleanup**. Application fixes remain recommendations in the report.

## Priority definitions

| Category | Meaning |
| --- | --- |
| **Critical** | Merge-blocking security, privacy, data-loss, incorrect official results, broken essential workflows, build/startup failures, or unsafe deployment behavior. This is a merge priority, not a claim that every issue has a Critical security severity. |
| **Not Critical** | Confirmed problems that do not block safe operation or deployment, such as minor usability issues, non-blocking documentation drift, and demonstrated maintenance or performance problems without an essential-workflow impact. |

Assign priorities only after validation. Record a security finding's actual severity separately. Keep unverified concerns and unavailable checks distinct from confirmed findings; a missing essential check may prevent a readiness verdict.

## Critical

### Frontend checks

- Check session handling, logout/account changes, protected routes, and authorization headers so credentials and cached records cannot cross accounts or reach unintended API origins.
- Trace all eight parent permissions, independent checklist-mark access, unpublished-period masking, prediction access, and editing locks through services, hooks, and screens.
- Check unsafe rendering, untrusted links, file handling, and sensitive data in browser storage or generated bundles.
- Verify draft survival across reloads, failed requests, disconnection, logout, access revocation, and child hiding. Confirm only the exact server-confirmed owner/revision is cleared after HTTP 200/201.
- Verify automatic replay is restricted to authenticated teacher-owned ECCD drafts targeting exactly `POST /api/eccd/evaluate`. Parent work, other forms, and uploads must require manual submission.
- Check stale-response handling, student switching, duplicate saves, and owner-scoped draft keys for data loss or submission to the wrong record.
- Verify both TypeScript projects, lint, production build, and essential browser workflows.

### Backend checks

- Review authentication, OTP binding and replay protection, remembered devices, credential revocation, inactive accounts, first-login restrictions, rate limits, and Socket.IO authorization.
- Verify role and record-level authorization, active Primary Adviser ownership, handovers, student transfers, and preservation of assessment and family history.
- Verify all eight parent permissions, SYNCED family links, active-child eligibility, descriptive HTTP 403 responses, score masking, independent checklist visibility, and prediction prerequisites.
- Check encrypted LRN storage and lookup, public masking, authorized staff exceptions, request/response validation, and error/log output for sensitive-data exposure.
- Review uploads, spreadsheet imports/exports, backup restore, SQL execution, and ML artifact loading for exploitable input paths or destructive behavior.
- Check assessment dates, immutable parent observations, teacher correction attribution, official scoring, transaction boundaries, and concurrent writes.
- Review startup, migration inventory including migration 016, production settings, TLS, CORS, secrets, health checks, and required model/template/scoring assets.
- Validate dependency advisories against exact resolved versions and actual affected paths. Distinguish production exposure from development-only exposure.

### Documentation and repository checks

- Check tracked files, untracked candidates, ignore exceptions, and reachable Git history for credentials, learner/family data, raw datasets, uploads, backups, and unintended binaries. Never reproduce sensitive values in the report.
- Add narrowly scoped ignore rules and untrack confirmed sensitive or local-only files while preserving local copies. Ignoring a file does not remove earlier Git-history exposure; report any required credential rotation or separate history remediation.
- Correct documentation that could cause unsafe deployment, missed migrations, broken startup, weakened permissions, or lost drafts.
- Check CI and Render/Vercel configuration against the actual build and startup requirements. Report provider-side settings that cannot be verified from the checkout.

## Not Critical

### Frontend checks

- Review mobile/tablet/desktop layout, accessibility, loading/error/empty states, and feedback where an issue does not compromise security or essential functionality.
- Identify reproducible redundant requests, unnecessary state, dead imports, unused code, and avoidable complexity. Trace usage before recommending removal.
- Report smaller usability and performance defects with a concrete trigger and practical impact.

### Backend checks

- Identify demonstrated slow queries, redundant work, unused helpers, duplicated behavior, and unnecessary layers at the expected school workload.
- Identify missing regression coverage for risky logic; explain the specific failure that the missing test should detect.
- Treat performance or maintenance issues as Critical when evidence shows essential workflows, security, or data integrity are affected.

### Documentation and conservative cleanup

- Reconcile `AI_CONTEXT.md` and `AGENTS.md` with current routes, schemas, models, settings, manifests, tests, and migrations. Clearly separate historical verification from fresh results.
- Clarify compatibility parameter names such as `{student_lrn}` using the actual accepted identifiers; preserve existing route paths and response contracts.
- Correct related deployment or migration instructions where they contradict active source. Preserve useful historical material with clear historical labeling.
- Delete only proven disposable outputs or unnecessary files after checking runtime, build, test, documentation, and dynamic references.
- Preserve existing work, useful reports, research, blank templates, scoring tables, and production inference assets. Do not delete files solely because they are old, ignored, or untracked.
- Record the exact files deleted or untracked and the evidence for each action.

## Verification plan

Run from the repository root using existing dependencies and the project's Python 3.12 environment:

```powershell
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build
uv pip check --python .venv312
uv run --no-project --python .venv312 python -m unittest discover -s backend/tests -t . -v
git diff --check
```

Inspect database-test isolation before running integration suites. Use disposable PostgreSQL schemas and test fixtures; do not modify live school records. Execute applicable existing Playwright configurations explicitly, covering authentication, parent permissions, home-assessment locks, manual retries, teacher ECCD replay, messaging, imports, exports, and dashboards. There is no default `frontend/playwright.config.ts`.

Check dependencies against current authoritative advisories without exposing repository data or secrets. Record exact commands, outcomes, skipped checks, and missing prerequisites. Inspect failures and distinguish application defects from environment failures; application fixes remain outside this task.

After documentation and cleanup edits, verify final tracking, required deployment assets, preserved local sensitive files, and the final diff. Ask: **Did this change introduce unnecessary abstractions, extra state, or new dependencies that existing code already handles?**

## Final audit deliverable

Produce one root-level `MERGE_READINESS_AUDIT.md` with this structure:

1. **Review scope and merge verdict**: branch, revision, baseline, working-tree coverage, and Ready / Not Ready / Readiness Unverified.
2. **Critical**: separate Frontend Findings, Backend Findings, and Documentation / Repository / Deployment Findings.
3. **Not Critical**: the same separate groups, omitting empty groups or explicitly stating that no findings were confirmed.
4. **Verification and coverage gaps**: actual checks and results, unresolved concerns, and external deployment checks still required.
5. **Documentation and cleanup changes**: exact corrections, deleted/untracked paths, and reasons.

Each confirmed finding must include a stable ID, category, actual security severity where applicable, file and line location, reproducible trigger, impact, smallest proposed fix, validation evidence, and whether it was introduced by this branch or already existed when determinable. Do not invent findings to populate a category.

Unresolved Critical findings prevent a Ready verdict. Missing essential verification results require Readiness Unverified unless a confirmed blocker already establishes Not Ready. Successful builds alone do not establish merge readiness.

## Boundaries

- Preserve business logic, API contracts, assessment formulas, protected identity rules, and offline durability.
- Do not fix application defects, install new dependencies, rotate existing keys, rewrite Git history, or apply live migrations in this task.
- Do not commit, push, merge, or deploy. Keep temporary scanner artifacts outside tracked repository content.
- This file records the plan only; creating it does not mean the audit, tests, documentation corrections, or cleanup have been performed.
