# Frontend Parity Audit and Migration Roadmap

Audit date: **2026-10-12** (Asia/Shanghai). Last document update: **2026-10-12**.

Audit baseline commit: `374b1668270482d947424a301add63de06efe5c7`.
The audited working tree also contained the pre-existing deletion of `AMES-SYSTEM-LEGACY` and the untracked `AMES-SYSTEM/` reference directory. The commit alone therefore does not capture the complete audited reference.

Current position: **Plan 1, Batches 1 and 2 complete: ECCD configuration, Teacher Management and access controls.** Batch 2 implements the authorized Step 4 findings G04-G07. Those findings and the shared-select lint correction G27 are verified within the recorded scope; G12/G13 regression checks still pass. Archive/account-deletion confirmation visuals, other Chairman screens and full application acceptance remain pending. Teacher and Parent portal migration remain deferred.

This is the single progress document for the three role-based frontend parity batches. Resume using the [progress tracker and source-update instructions](#progress-tracker-and-source-update-instructions) at the bottom.

## Audit basis and verification limits

The migration should proceed as **three isolated role batches**, with Chairman first. The current frontend already contains substantial Chairman parity work; the remaining task is targeted correction and verification.

The original audit was read-only. No application source files were modified.

- Current application: `frontend/`.
- Available legacy reference: [AMES-SYSTEM/frontend](AMES-SYSTEM/frontend). `legacy/`, `_legacy_reference/`, and `AMES-SYSTEM-LEGACY/` were absent at audit time.
- The active UI uses React, TypeScript, and Tailwind 4. The reference combines MUI, its theme, and Tailwind 3.
- At audit time, visual tests imported the missing `AMES-SYSTEM-LEGACY/`. Batch 1 corrected the harness to `AMES-SYSTEM/frontend/` and verified ECCD reference rendering.
- At audit time, `pnpm.cmd` and installed frontend dependencies were unavailable. Batch 1 restored the pinned tool through Corepack, dependencies, and Chromium. Current verification evidence appears in the tracker below; baseline findings remain a historical source audit.

The current runtime requirements in [AI_CONTEXT.md](AI_CONTEXT.md) remain authoritative: student IDs, masked LRNs, granular permissions, durable drafts, server-controlled authentication, and credential-preserving restore must survive the visual migration. Read that context before planning or coding, and inspect the matching legacy implementation before edits. Legacy reference files remain read-only.

## 1. Parity gap analysis

These are the findings at the audit baseline. Stable finding IDs connect this analysis to the live status table at the bottom. Implementation and verification updates belong in that tracker and its chronological log; do not mistake this baseline analysis for a later verification result.

| ID | Area | Legacy implementation | Current implementation | Finding |
| --- | --- | --- | --- | --- |
| G01 | Shared navigation | Dark role drawer, mobile app bar, parent bottom navigation; MUI `md` boundary at 900px | Dedicated legacy icons, ripple behavior, 900px navigation boundary | Already substantially reproduced. Reverify against the available reference before changing it. |
| G02 | Shared controls | MUI outlined fields, floating labels, menus, switches, component-specific dialogs | Separate generic, authentication, and Chairman control implementations | Generic workspace controls differ in padding, typography, colors, and modal treatment. Avoid applying generic controls to parity screens. |
| G03 | Chairman dashboard | Four icon statistic cards; filters inside the chart card; chart/performance split of 8/4 columns | Closely mirrors these structures | Targeted verification needed, especially populated charts and filter effects. Current requests are grouped together, whereas legacy statistics, pie data, and domain performance load independently. |
| G04 | Teacher accounts | Immediately persisted ECCD permission switch | Checkbox followed by **Save question access** | Confirmed visual and interaction mismatch. |
| G05 | Teacher create/edit | Required field validation and incumbent-adviser handover confirmation | Some fields are optional; no equivalent handover confirmation | Confirmed functional gap. Legacy also supplies the email as the new username; current creation omits an empty username. Verify resulting account behavior. |
| G06 | Section creation | Section Identifier field, Cancel/Create actions; newly created section automatically selected in the originating teacher form | Section name plus optional adviser; creation refreshes records without selecting the new section | Confirmed field, layout, and workflow differences. |
| G07 | Section deletion | Delete action inside the teacher form's section menu | Separate **Manage Sections** flow | Confirmed navigation and interaction difference. Current backend restrictions must still be respected. |
| G08 | Chairman student records | Search/filter panel, selectable roster, details/download/transfer dialogs | Similar structure and most fields retained | No broad field omission found. Filter options, selection resets, export scope, fallback labels, and feedback differ. |
| G09 | Student export | Legacy export request sends the selected section | Current request also applies the roster's school-year filter | Observable behavior change requiring an explicit parity decision. |
| G10 | Student feedback | Snackbar/toast after transfer/export | Persistent inline notices | Confirmed behavior and placement mismatch. |
| G11 | Chairman audit | Name/action search; three-column table; details dialog | Similar layout, but search also matches details | Confirmed search behavior difference. API field names also differ and need a typed mapping. |
| G12 | ECCD configuration | Loading spinner, domain cards, question table, add/edit dialogs | Mostly reproduced | Loading state is missing; table headers and empty-state wording differ. Domain card sizing differs below 1200px. |
| G13 | ECCD configuration save | Working home-based toggle and controlled save interactions | Undefined `onBusyChange` call in the toggle; editor does not signal busy when submission starts | Confirmed execution defects. Fix before visual verification. |
| G14 | Chairman settings | Four sections: personalization, account, backup/restore, school year | Same main sections plus additional appearance settings | Main page is close, but modal geometry, OTP styling, feedback placement, and additional content differ. |
| G15 | Opening month | Default August; local selection updates when settings load | Context defaults to June; rollover form initializes before asynchronous settings complete | Confirmed initialization mismatch. It can display the fallback month instead of the loaded month. |
| G16 | Teacher dashboard | "Educational Overview," icon statistics, development chart beside unread messages | Generic "Dashboard," separate filters, extra domain-performance section, messages below | Major layout and content mismatch. |
| G17 | Teacher roster/profile | Avatar roster, distinct age/guardian columns, detailed profile workspace | Generic table and shared form inside a modal | Major presentation mismatch. |
| G18 | Teacher assessments | Domain overview cards followed by a PRE/MID/POST matrix and sticky save controls | Domain sidebar with one selected-period checklist | Major interaction and layout mismatch. |
| G19 | Teacher settings | Separate View/Edit access groups using immediately persisted switches | Combined checkbox form with explicit Save | Confirmed visual and functional mismatch. |
| G20 | Parent dashboard | Colored child header with SYNC, four summary cards, domain overview and recent-message cards | Separate selector, pale profile panel, three summary cards, per-period progress rows | Major layout/content mismatch. Assessment Task and its locked/open presentation are missing from the summary grid. |
| G21 | Parent profile | Separate profile and family panels, responsive save actions | Shared generic student form | Major presentation mismatch. |
| G22 | Parent assessments | Official summary/matrix and home checklist with legacy table structure | Similar capabilities through generic cards, domain selector, and selected-period checklist | Functional coverage exists; screen structure and controls differ. |
| G23 | Messaging | MUI contact/chat split changes at 900px | Tailwind `lg` split changes at 1024px | Confirmed responsive mismatch between 900-1023px, plus bubble, composer, avatar, and spacing differences. |
| G24 | Unread badges | Poll every 3 seconds | Poll every 15 seconds, with additional read-event refresh | Observable timing difference. |
| G25 | Routes and guards | Chairman URLs remain `/chairman/*`; parent overview alias; shared public/protected guards | Chairman URLs redirect to `/super-admin/*`; public redirects live within auth pages | Chairman access works through aliases, but URL behavior differs. `/parent/overview` alias is missing. |
| G26 | Application feedback | Shared `RequestFeedback` and `ErrorBoundary` | No equivalent wrappers in `App.tsx` | Shared error/feedback behavior needs inventory and restoration where applicable. |

Primary evidence: [Teacher workspace](frontend/src/pages/TeachersWorkspace.tsx), [Chairman questions](frontend/src/pages/super-admin/EccdQuestionsManagement.tsx), [Chairman settings](frontend/src/pages/super-admin/SystemSettings.tsx), and [generic dashboards](frontend/src/pages/Dashboards.tsx). Source line numbers can change; recheck the code before resolving a finding.

### Responsive parity requires two breakpoint systems

The reference uses MUI boundaries at **600/900/1200px**, while its native Tailwind screens also use **640/768/1024px**. Migration must preserve the breakpoint belonging to each original component. Replacing every breakpoint with either system would introduce new discrepancies.

Some legacy layouts themselves overflow on narrow screens. For example, the ECCD domain cards enforce a 300px minimum width inside a three-column layout. Under the repository's responsive requirement, preserve desktop appearance and document the narrow-screen correction rather than reproduce overflow.

## 2. Three-phase architectural roadmap

These inventories describe observed screen responsibilities, not components that have already been scaffolded.

Paths in this inventory are relative to the respective frontend `src/` directories.

| Phase | Legacy screens -> current entry points | Component responsibilities |
| --- | --- | --- |
| **Plan 1: Chairman** | `pages/chairman/Dashboard.jsx` -> `pages/super-admin/Dashboard.tsx` | School-year/section badges; four statistic cards; four-filter toolbar; doughnut chart; ranked domain progress. |
| | `pages/chairman/TeacherManagement.jsx` -> `pages/super-admin/TeacherManagement.tsx` -> `pages/TeachersWorkspace.tsx` | Active/archive tables; create/edit forms; section creation/menu; access switch; archive/delete confirmations; adviser handover confirmation. |
| | `pages/chairman/StudentRecords.jsx` -> `pages/super-admin/StudentRecords.tsx` | Roster filters/table; row selection; academic/personal/family details; transfer dialog; export dialog; toast feedback. |
| | `pages/chairman/SystemAuditLog.jsx` -> `pages/super-admin/SystemAuditLog.tsx` -> `pages/AuditWorkspace.tsx` | Search; timestamp/name/action table; action-details dialog. |
| | `pages/chairman/EccdQuestionsManagement.jsx` -> `pages/super-admin/EccdQuestionsManagement.tsx` | Domain cards; question table; domain/question editors; home-based toggle; deletion confirmation; loading/error states. |
| | `pages/chairman/SystemSettings.jsx` -> `pages/super-admin/SystemSettings.tsx` | Identity/logo/theme; account/password criteria/OTP; encrypted export/restore; opening month; rollover/revert confirmations. |
| **Plan 2: Teacher** | `pages/teacher/TeacherDashboard.jsx` -> `pages/admin/Dashboard.tsx` -> `pages/Dashboards.tsx` | Class/year header; statistic cards; development filters/chart; unread-message panel. |
| | `pages/teacher/StudentManagement.jsx` -> `pages/admin/StudentManagement.tsx` -> `pages/StudentsWorkspace.tsx` | Avatar roster; enrollment; profile/family editing; archives; notifications; workbook import and row-error feedback. |
| | `pages/teacher/EccdAssessment.jsx` -> `pages/admin/EccdAssessment.tsx` -> `pages/AssessmentsWorkspace.tsx` | Domain overview; student selection; three-period matrix; evaluation dates/ages; cascade presentation; sticky save controls; exports. |
| | `pages/teacher/TeacherSettings.jsx` -> `pages/admin/TeacherSettings.tsx` -> `pages/SettingsWorkspace.tsx` | Four view switches, two edit switches; password challenge/verification. |
| | `pages/teacher/MessageParent.jsx` -> `pages/admin/MessageParent.tsx` | Messaging page wrapper and shared chat. |
| | Shared ECCD management -> `pages/QuestionsWorkspace.tsx` | Permission-gated reuse of the configuration engine, with the same visual contract. |
| **Plan 3: Parent** | `pages/users/ParentDashboard.jsx` -> `pages/user/Dashboard.tsx` -> `pages/Dashboards.tsx` | Child header/switching; Connect Child dialog; assessment-task status; mastery/support/excellence/phase cards; domain progress; recent messages. |
| | `pages/users/ChildManagement.jsx` -> `pages/user/ChildManagement.tsx` -> `pages/ChildrenWorkspace.tsx` | Child selector; profile panel; family editor; locked/read-only states; responsive save actions. |
| | `pages/users/ParentEccdAssessment.jsx` -> `pages/user/ParentEccdAssessment.tsx` -> `pages/AssessmentsWorkspace.tsx` | Official period summaries; score matrix; publication locks; home-based checklist; durable saves. |
| | `pages/users/MessageTeacher.jsx` -> `pages/user/MessageTeacher.tsx` | Messaging wrapper and shared chat. |

The reference contains domain progress visualizations. A separate standalone "developmental milestone chart" component has not been established by this audit; do not invent one to fill the inventory.

### Shared dependencies and ownership

| Foundation | Execution strategy |
| --- | --- |
| Navigation/authentication | Retain `MainLayout.tsx`, auth contexts, icons, ripples, and first-login handling. Chairman changes require regression coverage for all role shells. |
| Inputs/buttons/dialogs | Use existing Chairman primitives during Plan 1. Add missing switch, tooltip, loading, and toast behavior there; avoid creating another control library. Promote reusable primitives only after parity passes. |
| Tables | Share scrolling, selection, and accessibility behavior. Keep role-specific columns, row density, and headers. |
| Charts | Share chart mechanics and typed data. Preserve each role's layout, filter semantics, radii, colors, and labels. |
| API integration | Keep `services/api.ts` as the authenticated client. Add explicit response/view-model interfaces rather than unchecked field assumptions. |
| Durability | Retain `drafts.ts`, `sessionDrafts.ts`, `fileDrafts.ts`, and synchronization events. Presentation changes must preserve owner/record/revision scoping. |
| Student/family data | Reuse data mapping and save logic; provide role-specific presentation instead of forcing all profiles into one generic form. |
| Assessment engine | Reuse dates, answers, cascades, permissions, and synchronization. Teacher and Parent presentations remain separate. |
| Messaging | One shared chat implementation, corrected in Plan 2 and reused in Plan 3. |

Each phase ends with its own acceptance gate. Teacher and Parent screen rewrites should not begin during Chairman implementation.

## 3. Execution Plan 1: Chairman

### Step 1 - Restore a trustworthy comparison baseline

| Exact current file | Required action |
| --- | --- |
| `frontend/tests/legacy-visual/entry.tsx` | Point reference imports to the available `AMES-SYSTEM/frontend/` sources. |
| `frontend/tests/legacy-visual/vite.config.mjs` | Correct the reference root and importer matching used for mocked contexts/API services. |
| `frontend/tests/chairman-parity.spec.ts` | Expand fixtures beyond one teacher/student and empty charts. Cover all six pages, populated states, permissions, handovers, and failures. |
| `frontend/playwright.config.ts` | Add Chairman breakpoint coverage and ensure tests use the intended servers rather than stale reused processes. |
| `frontend/VISUAL_PARITY.md` | Record the actual reference, tested states, unresolved differences, and results. |

Restore the pinned pnpm tool and dependencies before validation. Do not mark historical visual results as evidence for this checkout. Keep this document synchronized with any evidence recorded in `VISUAL_PARITY.md`.

**Batch 1 completion:** both reference paths and normalized importer matching are corrected. `frontend/playwright.eccd.config.ts` provides an isolated mocked-API run through Corepack on Windows; `frontend/tests/eccd-configuration.spec.ts` adds loading, empty/error, write concurrency, durability, access, edit/delete, and breakpoint fixtures. Existing comparison tests now tolerate cancelled finite animations while still requiring zero screenshot differences. Fixtures and full verification for the other Chairman screens remain pending.

### Step 2 - Correct Chairman foundations and route behavior

| Exact current file | Required action |
| --- | --- |
| `frontend/src/components/chairman/ui.tsx` | Complete switch, tooltip, loading, and toast behavior; reproduce dialog focus, dismissal, menu placement, and busy states. Support distinct legacy Dialog and centered Modal geometry. |
| `frontend/src/components/chairman/chairman.css` | Keep table typography scoped to Chairman; add only measured Chairman overrides. |
| `frontend/src/components/chairman/Icon.tsx` | Verify the Material paths and dimensions required by missing confirmations/controls. |
| `frontend/src/layouts/ChairmanLayout.tsx` | Retain portal scoping; verify styles also reach portaled menus/dialogs. |
| `frontend/src/layouts/MainLayout.tsx` | Verify existing shell parity. Limit changes to confirmed shared-shell issues. |
| `frontend/src/App.tsx` | Restore Chairman URL behavior if strict URL parity is required, preserving existing `/super-admin/*` compatibility. Inventory shared error/feedback wrappers. |
| `frontend/src/components/ProtectedRoute.tsx` | Verify unauthenticated, wrong-role, and first-login behavior; ensure accepted role aliases agree with shell/home resolution. |

Authentication pages already implement signed-in redirects, so a missing `PublicRoute.tsx` filename alone is not a functional gap.

### Step 3 - Repair and finish ECCD configuration

File: `frontend/src/pages/super-admin/EccdQuestionsManagement.tsx`.

- Remove the undefined toggle callback and wire busy state correctly.
- Signal editor busy state at submission start; prevent duplicate submissions.
- Restore the loading spinner.
- Match uppercase question headers, empty text, field order, focus, and footer actions.
- Verify sequence ordering, home-based updates, edit refresh, and deletion behavior.
- Preserve durable drafts and current backend permission guards.

This is the first page correction because its execution defect prevents a reliable acceptance run. Foundation work should not depend on this broken flow passing first.

**Batch 1 completion:** removed the undefined toggle callback; synchronous per-control submission locks prevent duplicate toggle/form writes before React rerenders. Save/Cancel, fields, Escape and backdrop dismissal are disabled while the editor saves. Loading appears during initial fetch and refresh, and stale overlapping refreshes cannot replace newer data. Headers, empty-question text, the `Questions` heading suffix, sequence fallback, blank new-question order, order-before-text fields, autofocus, dialog spacing, and Cancel/Save footer match the reference. Scoped draft keys, revision confirmation, failed-save recovery, reconnect sync, route gates and API contracts are retained. Domain cards remain fluid below 1280px to avoid the legacy overflow; the 1280px desktop fixture retains 300px reference cards. This is the responsive correction requested by the user, not a claim of identical legacy overflow at narrow widths.

### Step 4 - Finish Teacher Management

Files:

- `frontend/src/pages/super-admin/TeacherManagement.tsx`
- `frontend/src/pages/TeachersWorkspace.tsx`
- `frontend/src/types.ts`

Implement in separate reviewable slices:

1. Match active/archive table layout and actions.
2. Match create/edit fields, labels, validation, username behavior, and footer placement.
3. Restore section-menu creation and automatic selection after confirmed creation.
4. Restore the incumbent-name **Confirm Section Handover** flow before create/edit replacement.
5. Replace the permission checkbox/Save interaction with the immediately persisted switch.
6. Match archive/delete confirmation icons, colors, copy, and actions.

The available legacy Manage Access modal contains identity and system permissions. The current Primary Adviser/Substitute assignment controls are additional functionality required by project context; retain them without letting them replace the legacy permission interaction.

### Step 5 - Finish Dashboard

File: `frontend/src/pages/super-admin/Dashboard.tsx`.

- Retain the existing matching structure.
- Match filter dependencies: statistics depend on section/year; pie depends on all filters; domain breakdown depends on section/period/year and the domain list.
- Preserve independent loading/failure behavior so a domain request cannot suppress successfully loaded statistics.
- Verify populated doughnut labels, tooltip, legend, ranking, zero states, and long domain names.

### Step 6 - Finish Student Records and Audit

Files:

- `frontend/src/pages/super-admin/StudentRecords.tsx`
- `frontend/src/pages/super-admin/SystemAuditLog.tsx`
- `frontend/src/pages/AuditWorkspace.tsx`
- `frontend/src/utils/dateUtils.ts`

For Student Records, match filter options, selection behavior, fallback labels, dialog fields, export scope, filenames, and snackbar feedback. Preserve ID-based transfers and assessment history.

For Audit, map current response fields to the legacy display, restore name/action-only search, and verify date formatting and details-dialog geometry.

Consolidate roster-age presentation using the inspected legacy helper while retaining backend scoring as authoritative.

### Step 7 - Finish Settings

Files:

- `frontend/src/pages/super-admin/SystemSettings.tsx`
- `frontend/src/context/SettingsContext.tsx`
- `frontend/src/services/api.ts`

- Initialize opening month from loaded settings without overwriting an existing user draft.
- Match the four legacy sections and their local feedback placement.
- Match logo/theme previews and confirmed settings refresh.
- Reproduce centered rollover, revert, restore, and OTP modal geometry.
- Restore centered OTP digits, letter spacing, and close-button placement.
- Preserve challenge tokens, replacement sessions, selected-file durability, manual restore confirmation, and the server's 30-day revert eligibility.
- Keep additional appearance features accessible, with their placement recorded as an intentional extension.

### Chairman state, hooks, and API dependencies

Legacy Chairman pages use **local React state, effects, SettingsContext, and authenticated API requests**. No Redux or query-cache dependency was found.

| Screen | State/hook responsibilities | Legacy endpoints -> current consumption |
| --- | --- | --- |
| Dashboard | Four filters, option lists, statistics/mastery, pie, ranked domains; three effects | `GET /api/chairman/dashboard-{filters,stats,pie}` -> `/api/analytics/{filters,stats,pie-data}`. Legacy aliases exist in FastAPI. |
| Teachers | Active/archive lists; create/edit/access/section dialogs; selected records; handover details; save feedback | `GET /api/teachers/{active,archived}`; legacy create/update/archive/unarchive/delete paths -> current REST-style aliases. Section CRUD and permission update remain under `/api/chairman`. |
| Assignment | Selected section, role, incumbent, confirmation | Current required `POST /api/chairman/sections/{id}/assign-teacher`; preserve Primary Adviser/Substitute semantics. |
| Students | Search, section/year filters, selected IDs, details, download and transfer state | `GET /api/chairman/students`, `GET /api/chairman/sections`, `PUT /api/chairman/students/transfer`, `GET /api/chairman/export-eccd`; current details additionally use `/api/students/{id}`. |
| Audit | Log list, search, selected detail | `GET /api/logs` -> `GET /api/analytics/logs`; map `teacher_name/action_type/log_id` to current display fields. |
| Questions | Domains, active domain, loading, editors, text/order, home toggle | `/api/chairman/eccd-data`, `/eccd-domains`, `/eccd-questions` -> `/api/eccd-config/`, `/domains`, `/questions`, including home-based updates. |
| Settings | Branding/previews, account credentials/challenge/OTP, backup file, opening month, rollover/revert feedback | `/api/settings`, `/api/settings/update`, `/api/auth/send-otp`, `/api/chairman/account`; legacy chairman backup paths -> `/api/backup/{export,restore}`; rollover/revert routes remain available. |

API path differences are not automatically missing functionality. Verify request payloads, response mappings, export parameters, and multipart field names before changing callers.

### Precise Chairman styling contract

Values below come from the reference source and require rendered confirmation.

| Element | Legacy rule to reproduce |
| --- | --- |
| Typography | Poppins; body 16px/1.5; body2 14px/1.43; caption 12px/1.66; h6 20px/1.6; h5 24px/1.334; h4 34px/1.235. Preserve each screen's explicit weight. |
| Spacing | MUI spacing unit 8px: gaps/padding commonly 16, 24, 32, 40px. Preserve page padding in addition to shell padding. |
| Colors | Theme primary `#4543c0`; secondary `#1e1e2f`; text `#333`/`#777`. Shell uses `#111827`, active navigation `#2563eb`, content `#f9fafb`. Settings-bound actions use `--primary-color`. |
| Dashboard | 24px grid gaps; statistic columns 1/2/4 at 600/900px; charts stack then split 8/4 at 900px; 16px card radius; 24px padding; shadow `0 4px 20px rgba(0,0,0,.03)`. |
| Dashboard chart | 80/120 inner/outer radii; 5-degree slice spacing; percentage labels; bottom legend height 36px; chart area minimum 300px. |
| Teacher table/forms | 16px cell padding; `#f9f9f9` header/field backgrounds; 34px bold page title; form columns switch at 600px; centered form actions. |
| Student records | Fluid 1200px maximum content width; 24px page padding; 16px filter gaps; 8px filter/table radius; brand-colored details/export header; indigo transfer header. |
| Audit | Fluid 1200px maximum; inner padding 24px, then 40px at 900px; search full width then 350px maximum at 600px; column ratios 30/40/30; row vertical padding 24px. |
| Domain cards | 40px grid gaps; desktop 300px card target; 24px padding; 16px radius; hover translation -4px and legacy shadow. Clamp narrow layouts to the viewport. |
| Question table | 700px scrollable minimum table width; columns 10/70/20; question text 16.8px, weight 500; 24px vertical question-cell padding. |
| Settings | Fluid 900px maximum; 24/40px panel padding at 900px; 32px column gaps; 48px section separation; divider at 1200px; 64px logo and 48px theme swatches. |
| Standard dialogs | Legacy `sm/md/xs` maxima 600/900/444px; viewport-safe sizing; 24px horizontal title/content padding; page-specific radius and footer padding. |
| Settings centered modals | Mobile width 90%; desktop maxima: rollover 460px, revert 420px, restore/OTP 400px; 32px padding; 12px radius. |
| OTP input | Centered digits; 20px font; 4px letter spacing. |

### Plan 1 acceptance gate

Before Chairman is declared complete:

- Type check with `pnpm tsc --noEmit -p tsconfig.app.json`; lint and production build pass.
- Compare all six pages and every modal at mobile, desktop, and breakpoint-adjacent widths.
- Use populated, empty, loading, error, long-text, and custom-theme fixtures.
- Target at most 1 CSS-pixel geometry differences and the existing strict screenshot comparison under deterministic Chromium fixtures.
- Verify required fields, handover cancel/confirm, immediate permission persistence, transfer preservation, export scope, and settings challenges.
- Verify reload/network-loss recovery and that successful responses clear only the exact confirmed draft revision.
- Run functional tests against isolated data; do not exercise restore or rollover against live school records.
- Record responsive corrections and retained current-runtime extensions explicitly.

## Progress tracker and source-update instructions

### Mandatory update rule for future migration work

**Whenever migration-related source code, styles, routes, API mappings, fixtures, tests, or the legacy reference changes, update this Markdown file in the same work batch before reporting completion.** This instruction documents the user's maintenance requirement. It is a workflow obligation, not an automatic file watcher.

1. Read this document and `AI_CONTEXT.md` before resuming. Check the latest user authorization; saving this report does not authorize application implementation or later phases.
2. Reinspect affected current and reference files. Baseline findings can become stale; do not apply an old recommendation blindly.
3. Update the affected finding's status and evidence below. Add stable IDs `G27`, `G28`, etc. for newly discovered gaps. Never silently remove an unresolved finding.
4. Update phase/task checkboxes and the **Current position**, **Last document update**, and **Next action** fields.
5. Append a dated source-update log entry identifying files changed, findings addressed, validation performed, failures/limitations, and work remaining. Include a commit when available; do not invent one for uncommitted work.
6. Mark **Implemented, verification pending** when a fix exists but the relevant checks have not passed. Mark **Verified** only with recorded evidence. If a previously verified behavior regresses, reopen it and explain why.
7. Record deliberate deviations from legacy in the decisions table with user/context authority. They must not be silently counted as exact parity.
8. For source changes made outside this workflow, reconcile the document at the next session. It cannot update itself while no agent is working.

### Phase status

| Phase | Status | Completion evidence |
| --- | --- | --- |
| Audit and strategy | Complete as a source audit; browser verification pending | Original audit preserved in this file. Type check could not run; no screenshot-parity claim. |
| Plan 1: Chairman | Batches 1/2 complete; remaining steps pending | Step 4 G04-G07: 34 desktop/mobile component/browser checks pass. Steps 1/3 ECCD: 22 regression checks pass. Application/test types, full lint and production build pass; G27 resolved. Archive confirmation visuals and full Chairman acceptance remain pending. |
| Plan 2: Teacher | Deferred | Inventory only; detailed implementation plan and acceptance evidence pending. |
| Plan 3: Parent | Deferred | Inventory only; detailed implementation plan and acceptance evidence pending. |

### Plan 1 execution checklist

- [x] Read project context and identify the available legacy reference.
- [x] Perform source gap analysis and inventory all three roles.
- [x] Document the detailed Chairman execution strategy.
- [x] Save the audit and add this progress/update tracker.
- [x] Receive user confirmation for Chairman Batch 1 (Steps 1 and 3 only).
- [x] Restore pinned pnpm/dependencies/Chromium and correct legacy harness paths (Step 1).
- [x] Establish ECCD populated, empty, loading, error, and breakpoint fixtures; verify reference imports and both add dialogs (Step 1, Batch 1 scope).
- [x] Expand teacher fixtures and reference comparisons for the overview, create/edit/section dialogs and permission switch (Step 1, Batch 2 scope).
- [ ] Expand baseline fixtures and reference comparisons for the remaining Chairman screens/states (remaining Step 1).
- [ ] Complete Chairman controls, dialog variants, shell/guard verification, and routing decisions (Step 2).
- [x] Fix question toggle/editor busy defects and verify configuration flows (Step 3, G13).
- [x] Restore ECCD loading, headers, empty text, fields/footer, and responsive sizing; verify scoped visual/functional parity (Step 3, G12).
- [x] Receive user confirmation for Chairman Batch 2 (Step 4, G04-G07).
- [x] Restore immediate permission switch persistence, concurrent-save locks and durable failure recovery (Step 4, G04).
- [x] Restore required create/edit fields, email-as-username, centered footer actions and incumbent-adviser handover confirmation (Step 4, G05).
- [x] Restore Section Identifier and Cancel/Create actions; select confirmed new sections in the originating new/edit form, including reconnect (Step 4, G06).
- [x] Restore section-menu delete actions without changing selection; honor backend student-assignment deletion rejection (Step 4, G07).
- [ ] Complete archive table/state and archive/restore/account-deletion confirmation visual review (remaining Step 4).
- [x] Resolve shared-select render-ref lint defect and keep dropdown actions reachable across tested breakpoints (Step 2 foundation, G27).
- [ ] Complete dashboard filtering, independent request behavior, and chart verification (Step 5).
- [ ] Complete student records, transfer/export, feedback, audit, and age presentation (Step 6).
- [ ] Complete settings initialization, modal parity, account challenges, and isolated restore/rollover verification (Step 7).
- [ ] Pass TypeScript, lint, production build, Chairman browser parity, and functional checks.
- [ ] Pass shared navigation/authentication/durability regression checks.
- [ ] Record approved deviations and complete the Chairman acceptance review.
- [ ] Obtain direction for the detailed Teacher phase; keep Parent implementation deferred.

### Live finding status

Allowed statuses: **Open**, **Verification pending**, **Decision pending**, **In progress**, **Implemented, verification pending**, **Verified**, **Accepted deviation**, **Reopened**. Completion requires evidence or an explicitly recorded accepted deviation.

| Finding | Phase/owner | Current status | Latest evidence or next check |
| --- | --- | --- | --- |
| G01 Shared navigation | Shared / Plan 1 regression | Verification pending | Existing parity styling found; browser comparison against available reference pending. |
| G02 Shared controls | Shared / role batches | Open | Batch 2 adds opt-in caption labels, section-menu action slots and a reference-matching permission switch; select portal render-ref usage corrected. Other shared control variants still require verification. |
| G03 Chairman dashboard | Plan 1 | Open | Independent request behavior and populated-chart verification pending. |
| G04 Teacher account permission switch | Plan 1 | Verified | Batch 2 desktop/mobile: immediate PUT sends the next switch state once; pending requests lock controls/Done/dismissal. 403/reload and disconnected/reconnect draft recovery pass. Both switch states match isolated reference-control screenshots at zero differing pixels, threshold 0.1. Assignment extension remains available; whole Manage Access dialog equality is not claimed. |
| G05 Teacher create/edit and handover | Plan 1 | Verified | Batch 2 desktop/mobile: required validation, email-as-username creation, confirmed scoped-draft eviction, duplicate locks, cancelled/confirmed create/edit handover and own-adviser bypass pass. Edit sends backend-supported class_name. New/Edit Teacher full screenshots match the reference at zero differing pixels, threshold 0.1. Primary/Substitute behavior retained; handover copy reflects conditional backend archiving (recorded below). |
| G06 Section creation | Plan 1 | Verified | Batch 2 desktop/mobile: Section Identifier, legacy Cancel/Create footer and full dialog screenshots pass; HTTP 201 automatically selects the new section in originating create/edit forms. Failed/offline drafts persist and reconnect auto-selection passes. Menus/dialogs contain overflow and actions remain reachable at 320/390/599/600/899/900/1200/1280px. |
| G07 Section deletion | Plan 1 | Verified | Batch 2 desktop/mobile: inline delete action restored in the section dropdown without changing its selected value. Mocked backend 409 keeps the section and displays its rejection; successful confirmed deletion refreshes choices. Current backend rejects any section with assigned students, including archived students; no student unassignment or backend relaxation added. Deletion-confirmation pixel parity is outside this batch. |
| G08 Chairman student records | Plan 1 | Open | Filters, selection, fallback labels, and dialogs need verification. |
| G09 Export school-year scope | Plan 1 | Decision pending | Establish intended export scope before changing parameters. |
| G10 Student feedback | Plan 1 | Open | Match snackbar/toast placement and lifecycle. |
| G11 Chairman audit | Plan 1 | Open | Restore search semantics and verify response-field mapping. |
| G12 ECCD configuration presentation | Plan 1 | Verified | Batch 1: desktop overview and Add Domain/Add Question screenshots have zero differing pixels at threshold 0.1; both mobile add-dialog screenshots also pass. Uppercase headers, heading/empty copy, field order/focus/footer, loading/error states, and overflow containment at 320/390/599/600/899/900/1024/1199/1200/1280px pass. Fluid narrow cards are the documented responsive correction. |
| G13 ECCD configuration execution | Plan 1 | Verified | Batch 1: no undefined toggle callback; synchronous duplicate-event tests send one PUT/POST; editor locks before await and unlocks on failure. Confirmed saves evict only their scoped draft; 403/reload recovery, disconnected toggle/reconnection, role/permission redirects and domain/question edit/delete refresh pass in desktop/mobile Chromium. |
| G14 Chairman settings presentation | Plan 1 | Open | Modal/OTP/feedback parity and extension placement pending. |
| G15 Opening month initialization | Plan 1 | Open | Async settings hydration must retain user drafts and use loaded month. |
| G16 Teacher dashboard | Plan 2 | Open | Defer screen rewrite until Chairman acceptance. |
| G17 Teacher roster/profile | Plan 2 | Open | Defer screen rewrite until Chairman acceptance. |
| G18 Teacher assessments | Plan 2 | Open | Preserve assessment engine while restoring legacy presentation. |
| G19 Teacher access settings | Plan 2 | Open | Restore separate view/edit switch groups. |
| G20 Parent dashboard | Plan 3 | Open | Restore child header and four-card summary with publication locks. |
| G21 Parent profile | Plan 3 | Open | Restore profile/family panels with granular permission gates. |
| G22 Parent assessments | Plan 3 | Open | Compare official matrix and home checklist states. |
| G23 Messaging responsiveness | Shared / Plans 2-3 | Open | Correct 900/1024px split discrepancy and verify composer/bubbles. |
| G24 Unread badge timing | Shared / Plans 2-3 | Decision pending | Compare observable refresh behavior before changing transport/polling. |
| G25 Routes and guards | Shared / role batches | Decision pending | Preserve active-runtime requirements; document URL decisions and missing parent alias. |
| G26 Application feedback | Shared / Plan 1 foundation | Open | Inspect legacy wrappers before restoring equivalent behavior. |
| G27 Chairman select render-ref lint failure | Shared / Plan 1 Step 2 | Verified | Batch 2 resolves the dialog portal host during the opening event and stores it in state instead of reading a ref during render. Full frontend lint passes. Teacher and ECCD suites (34 + 22 checks) pass after the shared change. |

### Verification record

| Check | Latest result | Scope or limitation |
| --- | --- | --- |
| Current/reference source comparison | Performed, Batches 1/2 | Original source audit plus scoped rendered comparisons described below; whole application parity is not proven. |
| Application TypeScript | Passed, Batch 2 | `corepack.cmd pnpm exec tsc --noEmit -p tsconfig.app.json` from `frontend/`. |
| New test/config TypeScript | Passed, Batch 2 | `corepack.cmd pnpm exec tsc --ignoreConfig --noEmit --target ES2023 --module ESNext --moduleResolution Bundler --skipLibCheck --types node tests/teacher-management.spec.ts playwright.teachers.config.ts tests/eccd-configuration.spec.ts playwright.eccd.config.ts`. |
| Changed-file lint | Passed within full lint, Batch 2 | Full frontend lint covers the production files, specs and configs. |
| Full frontend lint | Passed, Batch 2 | `corepack.cmd pnpm lint`; G27 render-ref failure resolved without lint suppression. |
| Production build | Passed, Batch 2 | `corepack.cmd pnpm build` (TypeScript project build and Vite). Existing bundle-size advisory remains; no build error. |
| Scoped Chairman visual/functional tests | Passed: 22 tests, Batch 1 | `corepack.cmd pnpm exec playwright test --config playwright.eccd.config.ts`, desktop and mobile Chromium. Direct reference screenshots: desktop domain overview, both add dialogs desktop/mobile. Mobile overview checks structure/heading geometry rather than full-page pixel parity. Eight functional scenarios per project include edit/delete; responsive checks run all ten widths. |
| Teacher Management component/browser tests | Passed: 34 tests, Batch 2 | `corepack.cmd pnpm exec playwright test --config playwright.teachers.config.ts`. Twelve functional/control scenarios plus five existing/expanded baseline checks per desktop/mobile project. Full overview and New/Edit Teacher/Create New Section screenshots pass zero-difference comparisons at threshold 0.1. Both switch states use isolated control screenshots at identical whole-pixel positions on white backgrounds; modal heights differ due to retained assignment controls. Backend responses are mocked, not PostgreSQL integration tests. |
| ECCD/shared-control regression | Passed: 22 tests, Batch 2 | Reran `corepack.cmd pnpm exec playwright test --config playwright.eccd.config.ts` after final shared-control changes; all Batch 1 scoped checks pass. G12/G13 remain verified. |
| Baseline/tooling setup | Verified, Batch 1 | pnpm 12.11.2 through Corepack; workspace and isolated harness frozen-lockfile installs; Playwright Chromium installed. Harness resolves original JSX/theme/CSS under `AMES-SYSTEM/frontend/`; legacy files untouched. |
| Evidence artifacts | Generated locally, ignored | Screenshots, measurements and generated legacy baselines reside in `frontend/test-results/`. They are recreated by the scoped command and are not tracked production assets. |
| Documentation | Updated, Batch 2 | This tracker and `frontend/VISUAL_PARITY.md` record the same scope, outcomes and remaining work. Full Chairman/auth/API integration acceptance is still pending. |

### Decisions and retained runtime requirements

| Topic | Current requirement/decision | Authority or follow-up |
| --- | --- | --- |
| Active stack | Preserve React/TypeScript/Tailwind; inspect rendered MUI reference styles for parity. | Current UI contract in `AI_CONTEXT.md`; do not reintroduce MUI as a production dependency without an explicit stack decision. |
| Identity and access | Keep integer student IDs, masked LRNs, six granular parent permissions, and active Primary Adviser inheritance. | Current context and user-provided agent instructions. |
| Durability | Retain scoped revisions, pending synchronization, selected-file storage, and HTTP 200/201 confirmation before eviction. | Current context and zero-data-loss instructions. |
| Teacher assignment extension | Keep Primary Adviser/Substitute controls in an expandable section of Manage Access. The legacy permission switch/identity panel remain available. Handover warning describes archiving only when the incumbent has no other active assignment; Substitute does not replace the Primary Adviser. | User Batch 2 preservation instruction and inspected current assignment controller. Entire Manage Access modal and handover copy deliberately differ from legacy where runtime behavior requires it. |
| Protected section deletion | Restore dropdown delete placement while preserving backend HTTP 409 rejection if any students, including archived students, remain assigned. Retain the section/selection on rejection; never detach students to imitate legacy deletion. | Explicit Batch 2 backend-safety requirement and current `backend/routes/chairman.py`. |
| Permission failure display | Keep the intended switch state as a scoped recoverable draft and show failure/pending feedback; server permission enforcement remains authoritative. Inputs are not discarded on HTTP 403 or disconnection. | Offline durability mandate. Current draft hooks and permission guards remain unchanged. |
| Backup/rollover | Keep current backup format, credential-preserving restore, explicit manual restore confirmation, and snapshot-based 30-day undo. | Current runtime contract; visual parity must not revive older behavior. |
| Legacy overflow | Preserve 300px cards at 1280px and larger; use available column width below 1280px instead of the legacy 300px minimum. Table overflow stays within its scroll container. | User's Batch 1 responsive requirement; no viewport overflow at the ten tested widths from 320–1280px. Desktop reference screenshot remains identical. Narrow-screen legacy overflow is deliberately corrected. |
| URL parity, export scope, extensions | Unresolved where baseline/current behavior differs. | Record specific decisions during authorized Plan 1 work. |

### Source-update log

Append new entries in chronological order. Each entry should include **date, files changed, finding IDs, implementation summary, verification evidence, remaining work, and next action**. A documentation-only entry must not imply source fixes were made.

| Date | Change | Findings / phase | Validation | Remaining work |
| --- | --- | --- | --- | --- |
| 2026-10-12 | Completed the read-only source audit and produced the three-phase roadmap with detailed Chairman steps. | G01-G26; audit | Source inspection only; tooling and harness limitations recorded above. | All application implementation and browser verification pending. |
| 2026-10-12 | Created `FRONTEND_PARITY_MIGRATION.md` containing the audit, roadmap, styling/API details, checklists, and maintenance instructions. | Documentation only | Verified file creation, document sections, finding tracker, and git status. No application or legacy source changes. | User confirmation still required before Chairman implementation. |
| 2026-10-12 | **Plan 1 Batch 1:** modified `frontend/src/pages/super-admin/EccdQuestionsManagement.tsx`, `frontend/tests/legacy-visual/entry.tsx`, `frontend/tests/legacy-visual/vite.config.mjs`, `frontend/tests/chairman-parity.spec.ts`; added `frontend/tests/eccd-configuration.spec.ts` and `frontend/playwright.eccd.config.ts`; updated this document and `frontend/VISUAL_PARITY.md`. Corrected reference paths, undefined toggle callback, immediate submission locks, loading/refresh, legacy copy/order/footer/spacing and responsive cards. Comparison tests await cancelled animations safely; scoped runner uses Windows Corepack and mocked APIs. | Steps 1/3; G12 and G13 verified for batch scope; G27 added as an existing Step 2 defect. | 22 desktop/mobile browser tests pass; desktop overview and both add dialogs desktop/mobile pass zero-difference screenshot checks. Application/new-test TypeScript, changed-file lint and production build pass. Full lint fails at unchanged `chairman/ui.tsx:380` (four render-ref errors). Initial setup failures (missing global pnpm and browser binary) were resolved with Corepack, dependency installs and Chromium. Draft recovery, 403, reconnect, edit/delete and 320–1280px overflow checks pass. No legacy, backend, permission-gate or draft-hook changes; no new commit created. | Remaining Step 1 fixtures for other screens, Step 2 foundations/G27, and Steps 4–7; full Chairman/shared-auth/backend integration acceptance pending. Continue only with the next authorized Chairman batch; Teacher/Parent deferred. |

| 2026-10-12 | **Plan 1 Batch 2:** modified `frontend/src/pages/TeachersWorkspace.tsx`, `frontend/src/types.ts`, `frontend/src/components/chairman/ui.tsx`, `frontend/tests/chairman-parity.spec.ts`, `frontend/playwright.eccd.config.ts`; added `frontend/tests/teacher-management.spec.ts` and `frontend/playwright.teachers.config.ts`; updated this tracker and `frontend/VISUAL_PARITY.md`. `super-admin/TeacherManagement.tsx` remains the unchanged re-export of the repaired workspace. Implemented immediate typed permission PUT and synchronous saving locks, required teacher fields/email username/centered footer, backend-supported edit class_name, incumbent handover, Section Identifier/creation auto-selection, and inline section-menu delete actions with protected rejection handling. Shared select gains opt-in captions/action slots, viewport-bounded menus and an event-resolved portal host; native switch mirrors legacy dimensions/colors. Scoped runners keep separate evidence directories. | Step 4 G04/G05/G06/G07 verified; G27 verified; G12/G13 remain verified after regression. | 34 teacher desktop/mobile component/browser tests pass; overview and three dialogs match full reference screenshots, both switch states match isolated control screenshots with zero differing pixels at threshold 0.1. Required fields, handover cancel/confirm, Primary/Substitute payloads, one-request locks, 403/reload, offline/reconnect auto-selection and protected HTTP 409 deletion pass. Eight responsive widths pass. Application/test TypeScript, full frontend lint and production build pass; ECCD regression 22/22 passes. Initial mobile menu reachability and reference label/table/control rendering failures were corrected; screenshot thresholds were not relaxed. Build retains its existing size advisory. No legacy/backend/student-ID/LRN/session-auth/draft-hook changes; no new commit created. | Archive/restore/account-deletion confirmation visuals, other Chairman pages, remaining foundation states and full auth/backend integration acceptance remain pending. Continue only the next authorized Chairman batch; Teacher/Parent portal migration deferred. |

### Next action

**Batches 1 and 2 are complete within their authorized scopes.** Reproduce teacher checks with `corepack.cmd pnpm exec playwright test --config playwright.teachers.config.ts` and ECCD regression checks with `corepack.cmd pnpm exec playwright test --config playwright.eccd.config.ts` from `frontend/`. The next authorized Chairman batch should address the specified remaining screen/foundation work; archive/restore/account-deletion confirmation visuals still require review. Preserve G04-G07/G12-G13/G27 evidence after affected changes. Overall Chairman/shared-auth/backend integration acceptance remains pending; Teacher and Parent portal migration stay deferred.
