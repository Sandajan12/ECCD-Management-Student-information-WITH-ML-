# Fix Parent First-Time Sync and EasyCD Excel Import

Status (2026-10-27): Application changes and regression coverage are implemented. Local checks passed; CI integration/browser execution and deployment acceptance remain pending.

## Implementation and verification record

- [x] First-account auto-sync with audit-backed re-link approval, guardian-only exclusion, conflict checks and idempotent retries.
- [x] Transactional claim audits and dedicated typed link responses across all three aliases.
- [x] Status-aware dashboard feedback for direct submissions and background replay. Existing sync-event key details and revision-safe draft cleanup are preserved; the event additionally carries the server response.
- [x] Worksheet maximum raised to 64, including hidden sheets; archive, row and cell budgets retained.
- [x] Follow-up: accept dimensions, cell references, merged ranges and column styling through XFD (16,384). Bound iteration to 100 Info Sheet columns and 256 assessment columns, preserving answers beyond column 100.
- [x] Follow-up: structured section-mismatch confirmation with an authorized overwrite flag, responsive teacher dialog and durable retry support.
- [x] Parent-link, backup/history, atomicity, concurrent-claim, import/identity/guardian and row-isolation regression coverage added or updated.
- [x] Current behavior documented in AI_CONTEXT.md.
- [x] Added `.github/workflows/parent-sync-excel.yml` for the six focused backend modules against disposable PostgreSQL and frontend checks plus mocked-API Playwright coverage.
- [x] Local verification: 10 database-free backend tests passed (link alias contracts, worksheet boundaries, workbook text safety, existing validation regressions); Python compilation and dependency consistency passed.
- [x] Frontend app/tooling TypeScript, dedicated browser-test/config type checking, full lint, formatting and production build passed. Playwright discovery lists eight desktop/mobile cases; discovery does not execute them.
- [ ] Execute the CI workflow after these changes reach GitHub. It has not been run during this session; no code was pushed.
- [ ] Verify the authorized production workbook and first-link/re-link flows in a deployment test environment.

Local checks used synthetic process-only backend settings, without a school database or a local API/browser server. Missing pinned Python dependencies were installed into the existing `.venv312`; no configuration files or credentials were created or changed. PostgreSQL-dependent tests and browser execution were intentionally left for CI, as required by this plan.

### XFD formatting follow-up verification (2026-10-27)

- [x] 11 database-free backend tests pass: XFD dimensions/full-width styling, bounded reads including assessment column 164, malformed cells, explicit styled-cell budgets, 65-sheet rejection, 129-member rejection and expanded archives exceeding 50 MiB.
- [x] Both requested backend modules discover successfully (74 tests); Python compilation passes.
- [x] Frontend app/tooling TypeScript, full lint and production build pass.
- [x] Added multipart import coverage for full-width styling, names in B/LRN in F, protected identity, birthdate/sex, both guardians, assessment column 164, blank trailing rows and idempotent repeat imports.
- [ ] Execute database integrations in the existing CI workflow and verify the authorized production workbook. Neither has been executed during this follow-up.

### Section mismatch confirmation follow-up (2026-10-27)

- [x] Add multipart `overwrite_section=false` to the existing teacher import endpoint. Return HTTP 409 with top-level `detail`, `code: SECTION_MISMATCH`, `file_section` and `assigned_section` before student writes. Unknown file headers display "Not identified".
- [x] Confirmation bypasses only the section-name check. Target ownership, existing-student section restrictions, workbook limits, mappings and per-student transactions remain enforced.
- [x] Add the teacher confirmation dialog, cancellation with file retention, locked loading controls, section-specific success feedback, existing partial-failure summary and roster refresh. Consent is bound to the file revision and target; the durable queue preserves the flag only after explicit confirmation.
- [x] 15 database-free backend tests pass. Both requested modules discover successfully (82 tests); Python compilation passes.
- [x] Frontend app/tooling/browser-test TypeScript, full lint and production build pass. The existing CI browser configuration lists 24 cases across desktop/mobile, including 16 new teacher-import cases.
- [x] Add four database-backed multipart regressions for mismatch/no writes, confirmed idempotent import, unknown/matching headers and section authorization/ownership protection. Extend the existing CI workflow to type-check and execute the new browser cases.
- [ ] Execute the database-backed and browser regressions in CI and perform deployment acceptance. These were not run locally; no database, API or browser server was started, and no configuration files or credentials were changed.

## Summary

The pre-change diagnosis identified two code defects:

- Parent linking explicitly creates every account claim as `PENDING`, without checking whether it is the student's first account link.
- Excel validation caps workbooks at **16 worksheets**, producing the exact production error reported: **"Excel workbook exceeds the worksheet limit."** The teacher's EasyCD workbook needs support for **17–64 tabs**.

The original diagnosis used read-only inspection of the active backend, frontend, tests, and workbook assets. The findings below describe that pre-change state; completed implementation and checks are recorded above.

## Confirmed decisions

- Only parent **account** links count as prior linking history. Teacher-entered guardian-only records do not prevent first-account auto-syncing.
- Keep one current account claim per child. Another account's claim remains rejected while an existing claim is present.
- Keep child linking on the parent dashboard after registration; do not add child fields to registration.
- Support up to **64 worksheets**, including hidden sheets, subject to the other existing resource limits.
- The failing production upload uses `Info Sheet` and domain tabs, rather than the system's downloaded `CHECKLIST` export.

## Root-cause diagnosis

| File/function | Current behavior and finding |
| --- | --- |
| `backend/routes/students.py` — `link_child()` | Locks the student, validates the claim, checks current account links, then unconditionally inserts `status="PENDING"`. It never consults unlink history. This causes the first-time syncing bug. |
| `backend/routes/parents.py` — `link_child_to_parent()` | Delegates to `link_child()`, inheriting the bug. `/api/messages/link-lrn` also uses that handler. |
| `backend/routes/auth.py` — `register_parent()` | Creates the account/profile only. Its request schema has no child LRN field. Registration and login already route parents into the dashboard, where linking occurs. |
| `backend/routes/teachers.py` — `change_parent_link()` | Unlinking and rejection **delete** the targeted `FamilyAccess` row. They also record transactional `Unlinked Parent` / `Rejected Parent Link` audit events containing `studentId` and `parentId`. These events can preserve history without a migration. |
| `backend/models/parent.py` — `FamilyAccess` | Supports only `PENDING` and `SYNCED`; `REVOKED`/`UNLINKED` would require changing database constraints. Guardian-only records also use this table, so row existence alone does not establish prior account access. |
| `backend/utils/parent_links.py` | Already distinguishes account links from guardian-only records, but has no historical-link lookup. |
| `frontend/src/pages/parent/Dashboard.tsx` — `handleLinkLrn()` | Hardcodes "teacher must approve" after every successful link response. It refreshes the child roster, but its message would remain incorrect after backend auto-syncing is fixed. |
| `backend/utils/excel.py` — `validate_xlsx_resources()` | `MAX_WORKBOOK_SHEETS = 16`; exceeding it raises HTTP 413 with **"Excel workbook exceeds the worksheet limit."** This happens before openpyxl loading and row import. |
| `backend/routes/teachers.py` — `import_student_records()` | Reads the bounded upload into bytes and passes those bytes to `import_students()` through `run_in_threadpool`. No shared upload cursor is passed to the parser. |
| `backend/utils/uploads.py`, `backend/utils/excel.py` | ZIP validation and openpyxl use separate `BytesIO(content)` instances. A missing `seek(0)` is not the cause on this path. Read-only worksheets already reset dimensions before iteration. |
| `backend/utils/students.py` — `upsert_guardian()` | Enforces shared-guardian authorization. Import catches row exceptions, rolls back that student, and reports failure. No evidence ties this to the worksheet-limit error. |
| Frontend `StudentManagement.tsx`, `utils/fileDrafts.ts`, `services/api.ts` | Sends `file` and `section_id` through `FormData`, without manually setting its multipart boundary. Uploads override Axios's default with a **120-second timeout**. Backend error details reach the import dialog. |

### Parent linking entry points

The following routes converge on `backend/routes/students.py::link_child()`:

- `POST /api/students/link`
- `POST /api/parents/children/link`
- `POST /api/messages/link-lrn`

Parent child-list endpoints return active children with `SYNCED` links only. `PENDING` requests therefore grant no child-data access. The backend must select the correct status before the frontend refresh can expose the child.

### Excel failure boundary

The reported error identifies the immediate failure in resource validation. The request has not reached openpyxl workbook loading or per-student writes when this limit rejects it. Section ownership is checked before workbook validation, so a request reaching this error has also passed that ownership check.

The downloaded `CHECKLIST` export differs from the batch import format. Inspection also found that its formatting extends to column 16,384 despite populated cells ending at `AF`, exceeding the import validator's 256-column budget. These are separate export/import compatibility observations; they do not explain the reported worksheet-limit error. Adding checklist-export import support is outside this fix.

## Implementation changes

### 1. Parent history lookup

Modify `backend/utils/parent_links.py` to add a history lookup that:

- Detects existing account links through `Parent.user_id IS NOT NULL`; guardian-only rows do not count.
- Checks relevant account-link audit events using exact `metadata.studentId`.
- Recognizes the known historical plain-text format through exact student-name matching; ambiguous matches remain approval-required. Never use substring matches or guess identities.
- Supports future successful-claim audit events with stable student/parent IDs, preserving history if an account link later disappears.

Use the existing audit detail parser for structured events. Audit history is student-wide, regardless of which parent makes the new claim.

### 2. Status selection and transactional linking

Modify `backend/routes/students.py::link_child()` to:

- Keep the student row lock around conflict checks, history lookup, insertion, and audit creation.
- Create `SYNCED` when no prior account-link history exists.
- Create `PENDING` after an unlink, rejection, or other recorded account-link history.
- Preserve rejection of another account's claim while a current claim exists.
- Make same-parent retries return the existing status without inserting duplicates or promoting pending requests.
- Commit the link and its audit event together; roll back both on failure.

Expected behavior:

| Student state | Claim result |
| --- | --- |
| No previous account link or account-link history | New claim is immediately `SYNCED`. |
| Guardian-only records, but no account-link history | First account claim is immediately `SYNCED`. |
| Previously unlinked or rejected, with no current account claim | New claim is `PENDING`. |
| Same parent retries an existing pending claim | Return existing `PENDING`; do not duplicate or promote it. |
| Same parent retries an existing synced claim | Return existing `SYNCED`; do not duplicate it. |
| Another account claims a child with a current account claim | Preserve the current conflict response. |

### 3. Typed link responses across aliases

Modify `backend/schemas/student.py`, `backend/routes/parents.py`, and `frontend/src/types.ts`:

- Add a dedicated `ParentLinkResponse` containing the existing `message`, `student_id`, and `masked_lrn`, plus `status: "SYNCED" | "PENDING"`.
- Apply the dedicated response model to all three linking aliases, including the decorators in `backend/routes/students.py`.
- Keep enrollment response contracts separate.

### 4. Parent dashboard feedback

Modify `frontend/src/pages/parent/Dashboard.tsx::handleLinkLrn()`:

- Read the typed response status.
- For `SYNCED`, show successful connection feedback and refresh the roster immediately so child content becomes available.
- For `PENDING`, show the approval notice.
- Preserve durable inputs, reconnect replay, and revision-safe cleanup after HTTP 200/201.

No changes are required to registration/login, `ParentLayout`, the `FamilyAccess` schema, or teacher unlink deletion semantics. Existing teacher actions already persist ID-bearing history transactionally.

### 5. EasyCD worksheet limit

Modify `backend/utils/excel.py`:

- Raise `MAX_WORKBOOK_SHEETS` from **16 to 64**, counting hidden sheets too.
- Include the supported maximum in the worksheet-limit error.
- Retain the existing 128-member archive cap, 20 MiB upload cap, 50 MiB expanded cap, cell/row budgets, XML checks, and duplicate-relationship protections. The XFD follow-up uses Excel's native 16,384-column validation ceiling with separate bounded import reads (100 demographic / 256 assessment columns).
- Preserve read-only loading, dimension resets, worksheet-resource validation, and per-student transactions.

No speculative cursor, ownership, encryption, guardian, Axios, or timeout changes are planned.

### 6. Current-codebase documentation

Update `AI_CONTEXT.md` to document first-account auto-syncing, audit-backed re-link approval, and the updated worksheet limit after implementing the changes.

## Tests and acceptance criteria

### Parent linking regressions

Update `backend/tests/test_parent_linking.py` to cover:

- First claim through each linking alias returns `SYNCED` and immediately appears in parent children.
- Guardian-only rows do not prevent first-account auto-syncing.
- Original and different parents receive `PENDING` after teacher unlinking.
- Rejection followed by another claim remains `PENDING`.
- Pending retries remain pending; synced retries remain synced; neither duplicates rows.
- Concurrent first claims produce exactly one account link.
- Unlink/history commit failure rolls back atomically.
- Backup/restore preserves unlink history and subsequent approval requirements.
- Existing pending-only tests explicitly establish prior history before asserting pending behavior.
- Structured history uses exact student IDs; ambiguous historical name matches do not grant automatic access.
- Assessment records and guardian-only records survive unlinking.

Update `backend/tests/test_parity.py` first-link expectations while retaining relationship, masking, and permission assertions.

### Excel validation regressions

Update `backend/tests/test_security_batch1.py` to:

- Accept valid 17-sheet and 64-sheet batch workbooks containing import data plus extra visible/hidden tabs.
- Reject 65 sheets before openpyxl loading or database writes.
- Accept A1:XFD50 dimensions, full-width column styling, empty styled XFD cells and XFD-wide merges; reject columns beyond XFD. Verify bounded row widths and retain answers through assessment column 164.
- Preserve existing archive, XML, sparse-dimension, malformed-cell, worker-thread, and shared-guardian regressions.

### Teacher import integration

Update `backend/tests/test_phase2.py` to:

- Exercise multipart import with explicit `section_id` and extra EasyCD-style tabs.
- Exercise full-width styling with blank trailing rows, both guardians, and late assessment columns; preserve the current name-in-B/LRN-in-F layout and derived age.
- Verify saved encrypted identity, guardian records, and assessment marks.
- Verify repeat imports avoid duplicates and invalid neighboring rows roll back independently.
- Retain rejection of imports into a section the teacher does not own.

### Verification without local manual servers

- Run focused backend integration tests in CI against a disposable PostgreSQL database, using `uv` and Python 3.12.
- Run frontend TypeScript checks for both app and tooling projects, lint, and production build using pnpm.
- UI verification should cover synced versus pending feedback, failed-request draft retention, and reconnect refresh in CI.
- Do not require local browser/database servers on the user's device.
- Do not run test reset helpers or schema fixtures against production school data.

Suggested focused commands for a prepared CI environment:

```text
uv run --no-project --python 3.12 python -m unittest backend.tests.test_parent_linking backend.tests.test_parity backend.tests.test_security_batch1 backend.tests.test_phase2 backend.tests.test_batch1 backend.tests.test_eccd_phase2_lifecycle -v
pnpm --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm --dir frontend run lint
pnpm --dir frontend run build
```

The frontend checks above have passed locally. The full six-module backend command remains scheduled in the new CI workflow. That workflow also runs `pnpm --dir frontend exec playwright test --config playwright.parent-sync.config.ts`, covering direct SYNCED/PENDING feedback, child roster refresh, failed-request draft recovery after reload, and reconnect synchronization at desktop/mobile widths using mocked APIs.

## Defaults, rollout, and limits

- **No database migration or automatic data backfill.** Existing `PENDING` records retain their status; retries do not silently approve them.
- Registration continues to link children through the dashboard.
- Auto-sync grants the family relationship; adviser-controlled visibility and editing permissions still apply.
- Existing routes, enrollment contracts, deterministic scoring, evaluation provenance, and offline draft durability remain intact except for the intentional additive link response status and changed first-claim behavior.
- ID-bearing audit events reliably preserve current unlink history. Deleted logs or old name-only records for renamed students cannot always establish identity; disclose those limits rather than treating them as proof of no history.
- The exact production workbook has not been executed here. Removing the confirmed 16-sheet blocker does not establish that it passes every remaining validation.
- After CI verification, verify an authorized EasyCD upload and both parent-link scenarios in a deployment test environment before claiming production success. Deployment itself is outside this implementation task.
