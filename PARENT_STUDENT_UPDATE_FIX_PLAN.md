# Fix Parent Record Saves and Teacher Visibility

Status: Approved plan implemented and locally verified on 2026-10-27. Production deployment has not been performed.

## Diagnosis

**Confirmed defects are in guardian field handling. The exact production trigger remains unconfirmed because the failing save response was not recorded.**

The active flow is:

`ChildManagement.handleSave` → `useParentProfile.save` → `PUT /api/parents/children/{student_id}` → `parents.update_child_details` → `students.update` → PostgreSQL commit.

The parent sends all 13 editable fields: emergency contact, address, handedness, sibling count, birth order, and father/mother name, age, occupation, and education. Numeric inputs become numbers; blank inputs become `null`. Student names, DOB, gender, and LRN are read-only in this form.

| Finding | Evidence and implication |
|---|---|
| Guardian edits can succeed without applying changes | [`upsert_guardian`](backend/utils/students.py) returns immediately when the submitted name is blank or absent. Clearing a name or submitting an age-only update can therefore return HTTP 200 without changing the guardian. |
| Partial guardian updates can erase omitted fields | A name-only update assigns `None` to omitted age, occupation, and education. Database-free handler probes reproduced this behavior. |
| M6 can reject the entire save | Existing shared guardians require authorization over **every linked child**, including pending and archived siblings. A forbidden guardian edit raises HTTP 403 before commit, also preventing accompanying address changes from persisting. Existing security tests explicitly require this rejection. |
| Full-form requests can submit unintended guardian changes | Because every field is sent, stale guardian values can make an address-only edit attempt to overwrite newer guardian data and trigger M6. |
| Commit and relationship linkage are present | `students.update` explicitly flushes and commits. Existing guardians are updated in place; new guardians receive a `FamilyAccess` link. **Current M6 does not fork records**, and `Student` has no guardian foreign key to re-point. |
| Error responses are not treated as confirmed saves | Axios rejects HTTP errors. Direct saves retain drafts and display errors; network/5xx failures remain pending. However, pending saves use a success-colored notice, and direct-save errors are not persistently visible after reload. |
| Teacher reads have no demonstrated ORM cache defect | Roster and detail endpoints use request-scoped sessions. Batched relationship loading reads the same stored records. Teacher-side drafts and already-open edit dialogs can display older values despite a fresh roster fetch. |

`public_student`/`public_students` are the active staff serializers; there is no `serialize_student_for_staff` function. The roster's `parent_names` represents linked account names; guardian details are available through `parents` and the detail endpoint.

**Verification completed during the investigation:** app TypeScript and focused ESLint passed. Mocked-session probes confirmed the guardian defects. PostgreSQL integration tests could not start because required backend environment configuration is absent; these probes do not establish database persistence. No application files were changed during the investigation.

## Implementation Plan

### 1. Capture the production failure before attributing it

Record the deployed frontend/backend versions, target API origin, HTTP status, and sanitized error detail. After a confirmed save, immediately compare parent and teacher detail responses for the same student ID. If an ordinary address update returns 200 but a fresh teacher API read remains unchanged, investigate that deployment/database path separately.

### 2. Fix backend guardian update semantics while preserving M6

| File / functions | Planned change |
|---|---|
| [`backend/routes/students.py`](backend/routes/students.py) — `update` | Use `payload.model_fields_set` to distinguish omitted guardian fields from explicit clears. Process only submitted guardian groups. Enclose student changes, guardian operations, audit creation, flush, and commit in one error-handling boundary that explicitly rolls back before propagating failures. |
| [`backend/utils/students.py`](backend/utils/students.py) — `upsert_guardian` | Add an optional supplied-field set for API partial updates; retain compatibility with existing workbook-import callers. Merge supplied fields with existing values before comparison and authorization. Preserve omitted values; apply explicit `null` to optional details. Reject clearing an existing guardian's name, or supplying details for a new unnamed guardian, with descriptive HTTP 422. An absent, entirely blank guardian remains a no-op. |
| [`backend/utils/students.py`](backend/utils/students.py) — M6 checks | Compare the merged record before checking siblings. Unchanged guardian data must not block student edits. Actual changes retain every existing sibling authorization check and atomic HTTP 403 rejection. Preserve account IDs and family links. |

[`parents.update_child_details`](backend/routes/parents.py) already preserves supplied fields when forwarding requests. Keep that forwarding, route aliases, response schemas, student-field permissions, and successful `{message}` response unchanged. No schema migration is needed.

### 3. Send deliberate parent edits and make save state durable and clear

| File / functions | Planned change |
|---|---|
| [`frontend/src/utils/parentProfile.ts`](frontend/src/utils/parentProfile.ts) — payload types, `profilePayload`, `validateProfile` | Define a typed partial update payload. Normalize values before comparing them with the form's baseline, and send only changed fields. Validate the chosen guardian-name requirement while allowing optional details to be cleared. |
| [`frontend/src/hooks/useParentProfile.ts`](frontend/src/hooks/useParentProfile.ts) — draft storage, `change`, `save` | Persist a profile-specific baseline alongside draft values so reloads retain which fields were edited. Preserve exact owner/student keys and revision-safe cleanup. Expose pending/error state to the page. Keep older drafts readable; never silently rewrite an already-queued request. For older drafts without a baseline, use the fetched record when the user manually saves. |
| [`frontend/src/pages/parent/ChildManagement.tsx`](frontend/src/pages/parent/ChildManagement.tsx) — `handleSave`, status rendering | Display persistent pending and rejection notices for the selected child. Use informational feedback for device-only saves and success feedback only after HTTP 200/201. Show "No changes to save" without sending an empty request. Preserve inputs on failure and refresh parent data after confirmation. |

Keep [`drafts.ts`](frontend/src/utils/drafts.ts) and [`api.ts`](frontend/src/services/api.ts) behavior unless regression tests expose a necessary change. `RecordSyncedEvent` already triggers refetching after confirmed background saves; it is not evidence that unconfirmed changes reached the database.

### 4. Make teacher refresh behavior reliable without replacing drafts

In [`frontend/src/pages/teacher/StudentManagement.tsx`](frontend/src/pages/teacher/StudentManagement.tsx), retain mount/focus/reconnection refreshes. Ignore superseded roster responses and clear stale fetch errors after a successful refresh. Refresh an open detail form on focus/reconnection only when it has no unsaved draft; otherwise preserve the draft and clearly identify it as locally edited data. Opening a clean detail form must always use the fresh API response.

Keep existing batched backend serializers unless persistence regressions demonstrate an actual serialization defect.

## Verification and Regression Tests

### Backend

Add `backend/tests/test_parent_student_updates.py` using the existing disposable PostgreSQL-schema fixture:

- Parent updates every supported student field and father/mother details; inspect committed values in a new session, then immediately fetch teacher detail, roster, section roster, and ECCD roster.
- Age-only and name-only guardian updates preserve omitted details; explicit optional-field clears persist.
- Clearing an existing guardian name or creating unnamed guardian details returns 422 and rolls back accompanying student changes and audit writes.
- Address-only updates succeed with a locked sibling when guardian data is unchanged or omitted.
- Actual shared-guardian changes remain denied across all update aliases when any sibling is unauthorized; verify pending/archived sibling coverage and unchanged account/family links.
- Shared updates remain permitted when every linked child is authorized.
- Inject a transaction failure and verify that no student, guardian, or audit changes persist.

### Frontend and CI

Add `frontend/tests/parent-profile.spec.ts`, include it in [`playwright.parent-sync.config.ts`](frontend/playwright.parent-sync.config.ts), and update [`.github/workflows/parent-sync-excel.yml`](.github/workflows/parent-sync-excel.yml) to execute/type-check the new coverage:

- Address-only saves exclude unchanged guardians.
- HTTP 400/403/422 never show confirmed success and retain drafts across reload.
- Offline/network/5xx saves remain pending and synchronize after reconnection.
- Older confirmations cannot delete newer edits or another child's draft.
- Teacher focus refresh and clean detail reopening show updated values; unsaved teacher drafts remain intact.
- Run at the existing desktop and mobile sizes.

### Commands

From the repository root, with disposable-test backend settings configured:

```powershell
uv run --no-project --python .venv312 python -m unittest backend.tests.test_parent_student_updates backend.tests.test_security_batch1 backend.tests.test_parity backend.tests.test_production_performance -v
uv run --no-project --python .venv312 python -m unittest discover -s backend/tests -v

corepack.cmd pnpm --dir frontend exec tsc --noEmit -p tsconfig.app.json
corepack.cmd pnpm --dir frontend exec tsc --noEmit -p tsconfig.node.json
corepack.cmd pnpm --dir frontend run lint
corepack.cmd pnpm --dir frontend exec playwright test --config playwright.parent-sync.config.ts
corepack.cmd pnpm --dir frontend run build
```

These commands require configured test settings. The new tests now exist and are included in CI. Local verification used process-only synthetic settings and a disposable PostgreSQL instance; application environment files were not created or changed.

### Implementation verification (2026-10-27)

- Both frontend TypeScript projects, browser-test TypeScript, full frontend lint, production build, and Git whitespace checks passed.
- All 70 focused backend tests passed, including the 14 new unit/persistence regressions and the existing M6, parity and query-performance tests.
- Full backend discovery passed: **369 tests**, using isolated schemas in a workspace-local PostgreSQL instance with synthetic test settings.
- All **48 browser cases** passed across desktop and mobile (24 new profile/teacher cases and 24 existing link/import cases). The first combined run passed 46; two existing import cases matched duplicate alerts during a dialog transition. Their locator was scoped to the visible alert, and both reruns passed.
- New coverage verifies partial guardian merging, optional clears, required names, atomic rollback, locked/pending/archived sibling protections, committed values followed by immediate staff reads, baseline durability, HTTP rejection retention, network/offline/5xx retry, revision-safe cleanup, legacy draft compatibility and teacher focus refreshes.
- CI now includes the new backend module and browser spec. `AI_CONTEXT.md` documents the implemented behavior. No database migration is required.

## Acceptance Criteria and Chosen Defaults

- Preserve M6 rejection; do not introduce guardian forking.
- Require names for existing guardians; optional guardian details remain clearable.
- Teacher freshness means immediate fresh API reads and refresh on reload/focus, as selected.
- Preserve existing parent-edit permissions, account links, assessment history, response shapes, and offline durability.
- Release after regression checks pass, then verify one authorized save through a fresh teacher read and one locked-sibling rejection. Report production attribution separately from local test results.
