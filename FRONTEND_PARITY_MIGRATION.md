# Frontend Parity Audit and Migration Roadmap

Audit date: **2026-10-12** (Asia/Shanghai). Last document update: **2026-10-13**.

Audit baseline commit: `374b1668270482d947424a301add63de06efe5c7`.
The audited working tree also contained the pre-existing deletion of `AMES-SYSTEM-LEGACY` and the untracked `AMES-SYSTEM/` reference directory. The commit alone therefore does not capture the complete audited reference.

Current position: **Plan 2: Teacher shell, dashboard, roster/profile, assessments and settings implemented, verification pending — 2026-10-13.** Source parity review and application TypeScript/production build passed for the five user-authorized objectives. Rendered and interactive parity remain unverified; no browser, screenshot, lint or backend tests were run in this Teacher batch. Plan 1 retains its prior Completed / Passed compilation-only sign-off. Parent migration and shared chat presentation remain deferred.

Directory milestone: **Role-Based Directory Refactoring & Workspace Unbundling completed, 2026-10-13.** All role routes import direct implementations under `pages/chairman/`, `pages/teacher/`, and `pages/parent/`. Re-export shims and deprecated workspace modules are removed. Shared parent assessment controls and child-selection components live under `components/eccd/` and `components/parent/`; Teacher presentation now lives under `components/teacher/`, with the landing page at `pages/teacher/TeacherDashboard.tsx`. Data hooks remain under `hooks/`. The compilation/build milestone and subsequent Plan 2 evidence are recorded separately below.

This is the single progress document for the three role-based frontend parity batches. Resume using the [progress tracker and source-update instructions](#progress-tracker-and-source-update-instructions) at the bottom.

## Audit basis and verification limits

The migration should proceed as **three isolated role batches**, with Chairman first. The current frontend already contains substantial Chairman parity work; the remaining task is targeted correction and verification.

The original audit was read-only. No application source files were modified.

- Current application: `frontend/`.
- Available legacy reference: [AMES-SYSTEM/frontend](AMES-SYSTEM/frontend). `legacy/`, `_legacy_reference/`, and `AMES-SYSTEM-LEGACY/` were absent at audit time.
- Teacher implementation reference on 2026-10-13: the available [AMES-SYSTEM-LEGACY/frontend](AMES-SYSTEM-LEGACY/frontend), including `components/MainLayout.jsx` and the four `pages/teacher/*.jsx` screens. `AMES-SYSTEM/frontend/` is absent in this checkout. Both reference paths and the complete backend remain strictly read-only. Historical audit paths above describe that earlier checkout.
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

Primary evidence: [Teacher management](frontend/src/pages/chairman/TeacherManagement.tsx), [Chairman questions](frontend/src/pages/chairman/EccdQuestionsManagement.tsx), [Chairman settings](frontend/src/pages/chairman/SystemSettings.tsx), and [Teacher dashboard](frontend/src/pages/teacher/TeacherDashboard.tsx). Source line numbers can change; recheck the code before resolving a finding.

### Responsive parity requires two breakpoint systems

The reference uses MUI boundaries at **600/900/1200px**, while its native Tailwind screens also use **640/768/1024px**. Migration must preserve the breakpoint belonging to each original component. Replacing every breakpoint with either system would introduce new discrepancies.

Some legacy layouts themselves overflow on narrow screens. For example, the ECCD domain cards enforce a 300px minimum width inside a three-column layout. Under the repository's responsive requirement, preserve desktop appearance and document the narrow-screen correction rather than reproduce overflow.

## 2. Three-phase architectural roadmap

These inventories describe observed screen responsibilities, not components that have already been scaffolded.

Paths in this inventory are relative to the respective frontend `src/` directories.

| Phase | Legacy screens -> current entry points | Component responsibilities |
| --- | --- | --- |
| **Plan 1: Chairman** | `pages/chairman/Dashboard.jsx` -> `pages/chairman/Dashboard.tsx` | School-year/section badges; four statistic cards; four-filter toolbar; doughnut chart; ranked domain progress. |
| | `pages/chairman/TeacherManagement.jsx` -> `pages/chairman/TeacherManagement.tsx` | Active/archive tables; create/edit forms; section creation/menu; access switch; archive/delete confirmations; adviser handover confirmation. |
| | `pages/chairman/StudentRecords.jsx` -> `pages/chairman/StudentRecords.tsx` | Roster filters/table; row selection; academic/personal/family details; transfer dialog; export dialog; toast feedback. |
| | `pages/chairman/SystemAuditLog.jsx` -> `pages/chairman/SystemAuditLog.tsx` | Search; timestamp/name/action table; action-details dialog. |
| | `pages/chairman/EccdQuestionsManagement.jsx` -> `pages/chairman/EccdQuestionsManagement.tsx` | Domain cards; question table; domain/question editors; home-based toggle; deletion confirmation; loading/error states. |
| | `pages/chairman/SystemSettings.jsx` -> `pages/chairman/SystemSettings.tsx` | Identity/logo/theme; account/password criteria/OTP; encrypted export/restore; opening month; rollover/revert confirmations. |
| **Plan 2: Teacher** | `pages/teacher/TeacherDashboard.jsx` -> `pages/teacher/TeacherDashboard.tsx` | Class/year header; statistic cards; development filters/chart; unread-message panel. |
| | `pages/teacher/StudentManagement.jsx` -> `pages/teacher/StudentManagement.tsx` | Avatar roster; enrollment; profile/family editing; archives; notifications; workbook import and row-error feedback. |
| | `pages/teacher/EccdAssessment.jsx` -> `pages/teacher/EccdAssessment.tsx` | Domain overview; student selection; three-period matrix; evaluation dates/ages; cascade presentation; sticky save controls; exports. |
| | `pages/teacher/TeacherSettings.jsx` -> `pages/teacher/TeacherSettings.tsx` | Four view switches, two edit switches; password challenge/verification. |
| | `pages/teacher/MessageParent.jsx` -> `pages/teacher/MessageParent.tsx` | Messaging page wrapper and shared chat. |
| | Shared ECCD management -> `pages/teacher/EccdQuestionManagement.tsx` | Permission-gated reuse of the configuration engine, with the same visual contract. |
| **Plan 3: Parent** | `pages/users/ParentDashboard.jsx` -> `pages/parent/Dashboard.tsx` | Child header/switching; Connect Child dialog; assessment-task status; mastery/support/excellence/phase cards; domain progress; recent messages. |
| | `pages/users/ChildManagement.jsx` -> `pages/parent/ChildManagement.tsx` | Child selector; profile panel; family editor; locked/read-only states; responsive save actions. |
| | `pages/users/ParentEccdAssessment.jsx` -> `pages/parent/ParentEccdAssessment.tsx` | Official period summaries; score matrix; publication locks; home-based checklist; durable saves. |
| | `pages/users/MessageTeacher.jsx` -> `pages/parent/MessageTeacher.tsx` | Messaging wrapper and shared chat. |

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

File: `frontend/src/pages/chairman/EccdQuestionsManagement.tsx`.

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

- `frontend/src/pages/chairman/TeacherManagement.tsx`
- `frontend/src/pages/chairman/TeacherManagement.tsx`
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

File: `frontend/src/pages/chairman/Dashboard.tsx`.

- Retain the existing matching structure.
- Match filter dependencies: statistics depend on section/year; pie depends on all filters; domain breakdown depends on section/period/year and the domain list.
- Preserve independent loading/failure behavior so a domain request cannot suppress successfully loaded statistics.
- Verify populated doughnut labels, tooltip, legend, ranking, zero states, and long domain names.

**Batch 3 implementation:** statistics, pie data, filter choices and domain rankings now have independent request/loading/error state and stale-response guards. Statistics depend only on section/year; pie data uses all four filters; rankings ignore the selected domain and depend on section/period/year plus the domain list. Filters stay inside the chart card. Doughnuts retain 80/120 radii, 5-degree padding, a 36px bottom legend and a 300px minimum container. The chart/ranking grid explicitly uses 8/4 of 12 columns starting at 900px. Ranking progress bars reproduce the legacy translated full-width bar, left transform origin, 400ms linear transition and clipping. Narrow statistic cards stack their icon/content between 900px and 1199px and allow word wrapping to prevent the legacy overflow; 1280px and mobile layouts retain reference geometry. Verification evidence is recorded below.

### Step 6 - Finish Student Records and Audit

Files:

- `frontend/src/pages/chairman/StudentRecords.tsx`
- `frontend/src/pages/chairman/SystemAuditLog.tsx`
- `frontend/src/pages/chairman/SystemAuditLog.tsx`
- `frontend/src/utils/dateUtils.ts`

For Student Records, match filter options, selection behavior, fallback labels, dialog fields, export scope, filenames, and snackbar feedback. Preserve ID-based transfers and assessment history.

For Audit, map current response fields to the legacy display, restore name/action-only search, and verify date formatting and details-dialog geometry.

Consolidate roster-age presentation using the inspected legacy helper while retaining backend scoring as authoritative.

**Batch 4 implementation (2026-10-13):** inspected the available read-only `AMES-SYSTEM-LEGACY/frontend/src/pages/chairman/StudentRecords.jsx`, `SystemAuditLog.jsx` and `utils/dateUtils.js`. Retained the fluid 1200px container, filter choices derived from roster data, brand dialog headers and first-section transfer default. Filters retain selected IDs as in legacy; the header checkbox counts only visible selected rows to avoid misleading checked/indeterminate states. Checkbox clicks remain separate from details navigation; mouse and keyboard can focus rows. Details stack labels on narrow screens and display zero values rather than substituting N/A. Export sends only the section name, independently of roster year, honors server filenames and retains legacy fallbacks. Four-second dismissible snackbars handle export/transfer feedback, including pending synchronization. Scoped transfer/export drafts, duplicate-submit locks and HTTP-confirmed selection clearing remain intact. Audit maps both current (`id`, `action`, `performed_by`) and legacy (`log_id`, `action_type`, `teacher_name`) response shapes, searches only name/action, and retains the 30/40/30 table, legacy padding and details layout. Roster age uses the legacy school-year opening baseline and years/months rounding; scoring remains server-authoritative. TypeScript, targeted lint, production build and six age boundary/fallback checks passed. Interactive API workflows and responsive UI inspection remain pending; no screenshot suite was added, run or debugged in this batch.

### Step 7 - Finish Settings

Files:

- `frontend/src/pages/chairman/SystemSettings.tsx`
- `frontend/src/context/SettingsContext.tsx`
- `frontend/src/services/api.ts`

- Initialize opening month from loaded settings without overwriting an existing user draft.
- Match the four legacy sections and their local feedback placement.
- Match logo/theme previews and confirmed settings refresh.
- Reproduce centered rollover, revert, restore, and OTP modal geometry.
- Restore centered OTP digits, letter spacing, and close-button placement.
- Preserve challenge tokens, replacement sessions, selected-file durability, manual restore confirmation, and the server's 30-day revert eligibility.
- Keep additional appearance features accessible, with their placement recorded as an intentional extension.

**Batch 5 implementation (2026-10-13):** SettingsContext defaults to August, normalizes the backend opening month, exposes load/error state and ignores obsolete fetch responses. The opening-month control reads hydrated settings until a scoped draft or in-memory edit exists; subsequent refreshes never overwrite that choice. Branding mounts after hydration and includes the current month in its save payload rather than a stale hidden month. Personalization, account, encrypted backup/restore and school-year management are four top-level sections; originating cards contain feedback, and additional appearance controls remain inside Personalization. Rollover/revert/restore dialogs retain explicit manual confirmation and use centered responsive layouts, legacy padding, warning colors and action placement. Account OTP uses centered six-digit input, letter spacing and a corner close control; dismissing retains the challenge/code, verification locks fields and a confirmed response installs the replacement session. Download errors decode server JSON for local feedback. Existing IndexedDB files, revision-scoped drafts, credential/session handling, authenticated backup/restore routes and the backend's 30-day snapshot undo are retained. The user explicitly confirmed account-only OTP after inspection found no backup/restore OTP contract in either codebase. No browser, screenshot, component or backend test suite was run in Batch 5; interactive verification remains pending.

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

**Final acceptance scope (2026-10-13):** the user explicitly restricted this gate to clean compilation, zero type errors, production bundling and tracker completion, with no headless browser screenshot loops. Plan 1 is **Completed / Passed** within that scope. Here, **Verified** means the finding has recorded source/batch evidence and passed the current frontend compilation gate; it does not establish fresh rendered parity or interactive backend acceptance.

- [x] `pnpm.cmd tsc --noEmit -p tsconfig.app.json`: exit 0, zero TypeScript errors.
- [x] `pnpm.cmd lint`: exit 0, no lint errors or warnings.
- [x] `pnpm.cmd build`: exit 0; TypeScript project build and Vite 8.3.0 production bundling succeed, with 731 modules transformed and no missing-export, module/chunk-resolution or bundling errors.
- [x] Steps 1–7 checked off; G01–G15 marked Verified with scope-specific evidence.
- [x] Overall status and final source-update log completed; legacy references untouched.

The existing chunk-size advisory remains: the generated JavaScript chunk is 888.45 kB (267.05 kB gzip), above Vite's 500 kB advisory threshold. It is not a build failure and was not suppressed.

The original broader acceptance criteria below are retained as historical requirements and optional follow-up coverage, excluded from this final compilation-only sign-off by the user's latest instruction:

- Type check with `pnpm tsc --noEmit -p tsconfig.app.json`; lint and production build pass.
- Compare all six pages and every modal at mobile, desktop, and breakpoint-adjacent widths.
- Use populated, empty, loading, error, long-text, and custom-theme fixtures.
- Target at most 1 CSS-pixel geometry differences and the existing strict screenshot comparison under deterministic Chromium fixtures.
- Verify required fields, handover cancel/confirm, immediate permission persistence, transfer preservation, export scope, and settings challenges.
- Verify reload/network-loss recovery and that successful responses clear only the exact confirmed draft revision.
- Run functional tests against isolated data; do not exercise restore or rollover against live school records.
- Record responsive corrections and retained current-runtime extensions explicitly.

## Execution Plan 2: Teacher — authorized source parity batch, 2026-10-13

Implementation plan followed before editing:

1. Preserve the existing protected Teacher URLs and create `TeacherLayout.tsx` around the shared shell. Add breadcrumbs, account identity, assignment-scoped section selection and school-year badges.
2. Restore Educational Overview, the four icon metrics and the chart/unread-message 8/4 hierarchy at 900px. Keep filters in the chart, with independent error/loading states. Add requested roster-derived boys/girls counts and domain checklist progress without inventing backend metrics.
3. Restore the avatar roster's Student Name / Age / Parent Guardian / Progress / Action order, legacy age display, two-panel student/family profile and New Student / Archived Students / Import Info Sheet flows.
4. Restore domain overview cards, Back to Domains, student/domain selection, the PRE/MID/POST indicator matrix, active-period radio controls, KAYA carry-forward into unsaved later periods, assessment dates and sticky save controls. Retain the existing durable-form engine and integer student identifiers.
5. Restore grouped immediate parent-access switches and account/password criteria/OTP dialog. Preserve the six current permission columns, adviser inheritance, session-only credential drafts and confirmed replacement sessions.
6. Run only application TypeScript and the production build; record implementation and its verification limits here.

### Plan 2 implementation checklist

- [x] Read current domain context, Teacher legacy components and existing backend contracts without editing the backend/reference.
- [x] **Batch 1 — shell/dashboard:** dedicated Teacher layout; legacy navigation including Messages and permission-gated ECCD Questions; breadcrumbs/account badge; persisted section context; Educational Overview and chart/feed hierarchy; enrollment and checklist completion widgets.
- [x] **Roster/profile:** avatars; separate age/guardian/profile-completeness columns; search/year filtering; active-section context; two-panel profile/family form; scoped enrollment/edit drafts; archive/restore/delete confirmations; notifications and downloads; durable workbook import with row errors.
- [x] **Assessment workflow:** domain progress cards; student and domain controls; three-period matrix; BoY/EoY labels; active-period KAYA/DI-KAYA radios; saved/draft status; carry-forward; strict server-compatible date bounds; local answer counts and display age; sticky save and single/all download flows.
- [x] **Settings:** account/assignment display; four view and two edit switches grouped as student-record and ECCD permissions; immediate PUT with busy locks and durable retry; password criteria; cancel/resume/resend OTP; server-controlled OTP-disabled flow and replacement session.
- [x] Application TypeScript and Vite production build passed, without adding dependencies or running browser/screenshot/backend/lint suites.
- [ ] Rendered/responsive interaction and live-API verification — outside the requested compilation-only verification scope.
- [ ] Shared chat presentation (G23) and broader Parent/shared follow-up — outside the five authorized objectives.

### Teacher API adaptations and parity limits

| Area | Implemented behavior / retained contract |
| --- | --- |
| Backend/reference boundary | Only frontend source and this tracker changed. `services/api.ts`, backend routes/models/schemas/configurations and legacy source are untouched. |
| Section choices | `/api/sections/` alone returns the whole school. Match it against assignment-scoped `/api/teachers/dashboard-filters` section names; retain Primary Adviser/Substitute assignments. Cache choices and selected ID per signed-in owner and retain them on network failure. |
| Dashboard metric scope | Existing `/api/teachers/dashboard-stats` metrics and `/api/eccd/domains-progress` completion cover all assigned sections. Explicit labels preserve that scope. `/api/teachers/dashboard-pie` accepts selected section/domain/period; boys/girls counts come from the selected active roster. Checklist progress is per domain, not an invented overall checklist-completion ratio. |
| Dashboard extensions | Enrollment and Checklist 1/Checklist 2 domain completion widgets are requested additions below the legacy chart/feed. Primary legacy metrics and hierarchy remain present. Loading skeletons are requested additions; the reference initially displays placeholder metrics. |
| Assessment engine | Retain `useAssessment` and `useDurableForm`; drafts use existing `eccd_draft_<studentId>_<period>_<domainId>_<ownerId>` keys. Only confirmed HTTP 200/201 revisions are evicted; offline saves stay queued. Teacher matrix is separate from the unchanged Parent checklist presentation. Saved later periods and pending later requests are protected from carry-forward. |
| Assessment dates/scoring | Backend requires strict PRE < MID < POST; date bounds use adjacent saved periods plus birth date. Matrix summaries show actual KAYA/DI-KAYA answer counts and display age. Teacher assessment responses do not include Parent standard/scaled scores; official scoring remains backend-authoritative and accessible in the existing checklist export. |
| Student profile | Preserve current writable student/family fields, masked LRNs, integer IDs, server-assigned school year and assignment-limited enrollment. The legacy photo picker has no persistence path in the current API; show initials rather than present an upload that cannot be saved. |
| Access controls | Use only `allow_parent_edit_home_based_eccd` for the home checklist, adapting the legacy field label to the current six-column contract. Failed switches retain their intended draft values with local errors/retry; reconnection uses the existing global synchronization service. |
| Authentication | Keep current-password verification, backend challenges, expiry/error responses, OTP-disabled response handling, explicit device forgetting and replacement-session login. Cancelling OTP closes the dialog while preserving challenge/code/password inputs; credentials clear only after confirmed success. |
| Teacher unread badge | Match the legacy three-second refresh for Teachers; retain existing read-event refresh and leave Parent timing unchanged. The broader G24 finding remains open for Parent follow-up. |
| Responsive scope | Use fluid containers, rounded cards, 600/900px legacy layout boundaries and contained table scrolling. No pixel-equality or tested viewport claim is made. |

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
| Plan 1: Chairman | **Completed / Passed** | Final compilation-only gate, 2026-10-13: application typecheck, full lint and production build exit 0; Steps 1–7 and G01–G15 signed off. Earlier Batches 1–3 browser evidence is preserved, not rerun. No new screenshot, interactive restore/rollover or live-backend acceptance claim. Existing chunk-size advisory retained. |
| Plan 2: Teacher | **Implemented, verification pending** | Five authorized objectives implemented; application TypeScript and production build pass. Source/contract parity reviewed; runtime/rendered verification excluded. Shared chat presentation remains future work. |
| Plan 3: Parent | Deferred | Inventory only; detailed implementation plan and acceptance evidence pending. |

### Plan 1 execution checklist

All checked items below refer to the final compilation-only acceptance scope. Historical browser coverage and exclusions remain recorded in the acceptance gate and source-update log.

- [x] Read project context and identify the available legacy reference.
- [x] Perform source gap analysis and inventory all three roles.
- [x] Document the detailed Chairman execution strategy.
- [x] Save the audit and add this progress/update tracker.
- [x] Receive user confirmation for Chairman Batch 1 (Steps 1 and 3 only).
- [x] Restore pinned pnpm/dependencies/Chromium and correct legacy harness paths (Step 1).
- [x] Establish ECCD populated, empty, loading, error, and breakpoint fixtures; verify reference imports and both add dialogs (Step 1, Batch 1 scope).
- [x] Expand teacher fixtures and reference comparisons for the overview, create/edit/section dialogs and permission switch (Step 1, Batch 2 scope).
- [x] Close Step 1 baseline/tooling review using existing fixtures and recorded batch evidence; additional screenshot comparisons excluded from this gate by user direction.
- [x] Review Chairman controls, dialog variants, shell/guards and existing route aliases for the source/compilation gate (Step 2); retain runtime extensions and record broader shared-wrapper work separately.
- [x] Fix question toggle/editor busy defects and verify configuration flows (Step 3, G13).
- [x] Restore ECCD loading, headers, empty text, fields/footer, and responsive sizing; verify scoped visual/functional parity (Step 3, G12).
- [x] Receive user confirmation for Chairman Batch 2 (Step 4, G04-G07).
- [x] Restore immediate permission switch persistence, concurrent-save locks and durable failure recovery (Step 4, G04).
- [x] Restore required create/edit fields, email-as-username, centered footer actions and incumbent-adviser handover confirmation (Step 4, G05).
- [x] Restore Section Identifier and Cancel/Create actions; select confirmed new sections in the originating new/edit form, including reconnect (Step 4, G06).
- [x] Restore section-menu delete actions without changing selection; honor backend student-assignment deletion rejection (Step 4, G07).
- [x] Review implemented archive table/state and archive/restore/account-deletion confirmation imports, payloads and busy guards (Step 4); rendered confirmation comparisons excluded from this gate.
- [x] Resolve shared-select render-ref lint defect and keep dropdown actions reachable across tested breakpoints (Step 2 foundation, G27).
- [x] Complete dashboard filtering, independent request behavior, and chart verification (Step 5, Batch 3, G03).
- [x] Verify implemented student records, transfer/export, feedback, audit and age presentation through source evidence and the compilation gate (Step 6, Batch 4).
- [x] Inspect read-only legacy student/audit/date sources and current export/audit runtime contracts (Step 6).
- [x] Run application TypeScript, production build, targeted lint and age-helper checks (Step 6).
- [x] Verify implemented settings initialization, four-section layout, local feedback, modal definitions and account challenges through source evidence and the compilation gate (Step 7, Batch 5).
- [x] Preserve scoped opening-month drafts, IndexedDB files, replacement sessions and server-controlled 30-day snapshot undo (Step 7).
- [x] Pass application TypeScript, full lint and production build; preserve earlier browser/functional evidence without rerunning excluded suites.
- [x] Review shared navigation/authentication/durability integration and compile the complete frontend; broader runtime regression is outside this gate.
- [x] Record scope decisions and complete the Chairman compilation-only acceptance review.

| Step | Final status | Acceptance evidence |
| --- | --- | --- |
| 1 — Baseline/tooling | Verified | Existing fixtures and Batches 1–3 records reviewed; installed pnpm toolchain typechecks and bundles successfully. No new fixture/screenshot expansion claimed. |
| 2 — Foundations/routes | Verified | Chairman primitives, scoped shell, protected routes and compatibility aliases reviewed; complete frontend typecheck, lint and bundle pass. |
| 3 — ECCD configuration | Verified | G12/G13 prior batch evidence retained; current module compiles and bundles. |
| 4 — Teacher management | Verified | G04–G07 prior batch evidence retained; archive/restore/delete handlers and guards reviewed; current module compiles and bundles. |
| 5 — Dashboard | Verified | G03 prior batch evidence retained; current module compiles and bundles. |
| 6 — Student records/audit | Verified | G08–G11 Batch 4 implementation evidence reviewed; current typed mappings, exports, feedback and pages compile and bundle. |
| 7 — Settings | Verified | G14/G15 Batch 5 implementation evidence reviewed; current context hydration, scoped drafts and account/modal definitions compile and bundle. |

### Live finding status

Allowed statuses: **Open**, **Verification pending**, **Decision pending**, **In progress**, **Implemented, verification pending**, **Verified**, **Accepted deviation**, **Reopened**. Completion requires evidence or an explicitly recorded accepted deviation. Final G01–G15 verification is scoped to the compilation-only gate above; earlier rendered evidence retains its original limits. Findings G16 onward are not included in the user's G01–G15 sign-off scope.

| Finding | Phase/owner | Current status | Latest evidence or next check |
| --- | --- | --- | --- |
| G01 Shared navigation | Shared / Plan 1 regression | Verified | Final compilation-only gate: MainLayout's 900px boundary, ChairmanLayout portal scoping and ProtectedRoute integration reviewed; full frontend typecheck, lint and bundle pass. No fresh browser comparison claimed. |
| G02 Shared controls | Shared / role batches | Verified | Final compilation-only gate: Chairman field/menu/switch/modal exports, Icon imports and scoped styles compile and bundle; full lint passes. Batch 2 caption/action-slot, permission-switch and portal-host evidence retained. Unrendered variants are outside this gate. |
| G03 Chairman dashboard | Plan 1 | Verified | Batch 3: 18 desktop/mobile Chromium checks pass. Statistics, pie, rankings and filters tolerate independently delayed/failed requests; domain failures leave successful statistics/charts available. Filter query/dependency counts, changed values/labels, ranking order and five obsolete responses pass. Populated/empty overview viewports and complete chart/ranking cards match the original JSX at zero differing pixels, threshold 0.1. Doughnut SVG paths match; labels, tooltip, 36px legend and 300px minimum container pass. Grid and content containment pass at ten widths from 320px to 1280px. Mobile doughnut card screenshots use its original measured size at a common viewport origin; whole mobile-page equality is not claimed. Narrow stat-card adjustment is documented below. |
| G04 Teacher account permission switch | Plan 1 | Verified | Batch 2 desktop/mobile: immediate PUT sends the next switch state once; pending requests lock controls/Done/dismissal. 403/reload and disconnected/reconnect draft recovery pass. Both switch states match isolated reference-control screenshots at zero differing pixels, threshold 0.1. Assignment extension remains available; whole Manage Access dialog equality is not claimed. |
| G05 Teacher create/edit and handover | Plan 1 | Verified | Batch 2 desktop/mobile: required validation, email-as-username creation, confirmed scoped-draft eviction, duplicate locks, cancelled/confirmed create/edit handover and own-adviser bypass pass. Edit sends backend-supported class_name. New/Edit Teacher full screenshots match the reference at zero differing pixels, threshold 0.1. Primary/Substitute behavior retained; handover copy reflects conditional backend archiving (recorded below). |
| G06 Section creation | Plan 1 | Verified | Batch 2 desktop/mobile: Section Identifier, legacy Cancel/Create footer and full dialog screenshots pass; HTTP 201 automatically selects the new section in originating create/edit forms. Failed/offline drafts persist and reconnect auto-selection passes. Menus/dialogs contain overflow and actions remain reachable at 320/390/599/600/899/900/1200/1280px. |
| G07 Section deletion | Plan 1 | Verified | Batch 2 desktop/mobile: inline delete action restored in the section dropdown without changing its selected value. Mocked backend 409 keeps the section and displays its rejection; successful confirmed deletion refreshes choices. Current backend rejects any section with assigned students, including archived students; no student unassignment or backend relaxation added. Deletion-confirmation pixel parity is outside this batch. |
| G08 Chairman student records | Plan 1 | Verified | Final compilation-only gate: Batch 4 roster-derived choices, ID selection, visible-row checkbox, first-section default and detail definitions reviewed; application typecheck, full lint and production build pass. Interactive/responsive runtime checks not performed. |
| G09 Export school-year scope | Plan 1 | Verified | Final compilation-only gate: section-only export query, server filenames and legacy fallbacks reviewed; current caller compiles and bundles. Backend authorization, active-roster default and cohort splitting retained. No live download executed. |
| G10 Student feedback | Plan 1 | Verified | Final compilation-only gate: Snackbar integration, dismiss handlers and modal-local failure/pending feedback reviewed; imports and typed callbacks pass typecheck, full lint and bundle. No interactive timing check claimed. |
| G11 Chairman audit | Plan 1 | Verified | Final compilation-only gate: current/legacy response mapping, name/action-only search and details definitions reviewed; shared age-helper Batch 4 evidence retained. Typecheck, full lint and bundle pass; no new interactive comparison. |
| G12 ECCD configuration presentation | Plan 1 | Verified | Batch 1: desktop overview and Add Domain/Add Question screenshots have zero differing pixels at threshold 0.1; both mobile add-dialog screenshots also pass. Uppercase headers, heading/empty copy, field order/focus/footer, loading/error states, and overflow containment at 320/390/599/600/899/900/1024/1199/1200/1280px pass. Fluid narrow cards are the documented responsive correction. |
| G13 ECCD configuration execution | Plan 1 | Verified | Batch 1: no undefined toggle callback; synchronous duplicate-event tests send one PUT/POST; editor locks before await and unlocks on failure. Confirmed saves evict only their scoped draft; 403/reload recovery, disconnected toggle/reconnection, role/permission redirects and domain/question edit/delete refresh pass in desktop/mobile Chromium. |
| G14 Chairman settings presentation | Plan 1 | Verified | Final compilation-only gate: Batch 5 four-section layout, card-local feedback, appearance extensions and centered confirmation/account OTP definitions reviewed; typecheck, full lint and bundle pass. Existing backup/restore authentication retained; no restore, rollover or screenshot test performed. |
| G15 Opening month initialization | Plan 1 | Verified | Final compilation-only gate: August default, normalized hydration/load state, stale-response guard, draft-aware month selection and revision-specific confirmation reviewed; typecheck, full lint and bundle pass. No delayed-hydration browser test performed. |
| G16 Teacher dashboard | Plan 2 | Implemented, verification pending | Educational Overview, class/year badges, four icon metrics, chart-contained filters and unread-message panel restored. Enrollment and domain checklist widgets added with accurate API scopes; independent loading/errors. Application typecheck/build pass; rendered/live-API checks excluded. |
| G17 Teacher roster/profile | Plan 2 | Implemented, verification pending | Avatar table, distinct age/guardian/progress columns, two-panel editable profile/family workspace, archive/import/notification flows restored; scoped drafts retained. Application typecheck/build pass; runtime/visual checks excluded. |
| G18 Teacher assessments | Plan 2 | Implemented, verification pending | Domain overview and three-period matrix restored; carry-forward, strict date bounds, answer counts, sticky save and download dialogs added around existing durable saves. Cached roster/domain/section/period context survives reload/offline use. Application typecheck/build pass; runtime verification excluded. |
| G19 Teacher access settings | Plan 2 | Implemented, verification pending | Six immediately persisted switches, grouped visibility/edit controls, durable failure/pending retry and password/OTP flow restored. Session replacement and server OTP behavior retained. Application typecheck/build pass; runtime verification excluded. |
| G20 Parent dashboard | Plan 3 | Open | Restore child header and four-card summary with publication locks. |
| G21 Parent profile | Plan 3 | Open | Restore profile/family panels with granular permission gates. |
| G22 Parent assessments | Plan 3 | Open | Compare official matrix and home checklist states. |
| G23 Messaging responsiveness | Shared / Plans 2-3 | Open | Correct 900/1024px split discrepancy and verify composer/bubbles. |
| G24 Unread badge timing | Shared / Plans 2-3 | Implemented, verification pending | Teacher sidebar now uses the inspected legacy three-second interval and existing read-event refresh. Parent still uses fifteen seconds; Parent timing and runtime verification remain follow-up work. |
| G25 Routes and guards | Shared / role batches | Decision pending | Preserve active-runtime requirements; document URL decisions and missing parent alias. |
| G26 Application feedback | Shared / Plan 1 foundation | Open | Inspect legacy wrappers before restoring equivalent behavior. |
| G27 Chairman select render-ref lint failure | Shared / Plan 1 Step 2 | Verified | Batch 2 resolves the dialog portal host during the opening event and stores it in state instead of reading a ref during render. Full frontend lint passes. Teacher and ECCD suites (34 + 22 checks) pass after the shared change. |

### Verification record

| Check | Latest result | Scope or limitation |
| --- | --- | --- |
| Current/reference source comparison | Performed, Batches 1/2/3 | Original source audit plus scoped rendered comparisons described below; whole application parity is not proven. |
| Application TypeScript | Passed, Plan 2 Teacher batch 2026-10-13 | `pnpm.cmd tsc --noEmit -p tsconfig.app.json` from `frontend/`; exit 0, zero TypeScript errors across the complete application. |
| New test/config TypeScript | Passed, Batch 3 | `pnpm.cmd exec tsc --ignoreConfig --noEmit --target ES2023 --module ESNext --moduleResolution Bundler --skipLibCheck --types node tests/dashboard-parity.spec.ts playwright.dashboard.config.ts`. Prior Batch 1/2 test checks remain recorded in their logs. |
| Changed-file lint | Passed, Batch 4 | Targeted ESLint covers StudentRecords, SystemAuditLog, AuditWorkspace, dateUtils and Snackbar. Full lint evidence remains Batch 3. |
| Full frontend lint | Passed, final gate 2026-10-13 | `pnpm.cmd lint`; exit 0, no errors or warnings; no lint suppressions added. |
| Production build | Passed, Plan 2 Teacher batch 2026-10-13 | `pnpm.cmd build`; exit 0, TypeScript project build and Vite 8.3.0 succeed; 736 modules transformed with no missing exports or module/chunk-resolution errors. JS 917.91 kB / 274.09 kB gzip; existing chunk-size advisory remains. |
| Student records/audit fast checks | Passed, Batch 4 | Read-only source comparison and current API inspection; six Node assertions cover school-year baseline, month/day boundary, invalid/missing DOB and invalid opening-month fallback. No browser or screenshot checks run; live transfer/export and responsive UI verification pending. |
| Scoped Chairman visual/functional tests | Passed: 22 tests, Batch 1 | `corepack.cmd pnpm exec playwright test --config playwright.eccd.config.ts`, desktop and mobile Chromium. Direct reference screenshots: desktop domain overview, both add dialogs desktop/mobile. Mobile overview checks structure/heading geometry rather than full-page pixel parity. Eight functional scenarios per project include edit/delete; responsive checks run all ten widths. |
| Teacher Management component/browser tests | Passed: 34 tests, Batch 2 | `corepack.cmd pnpm exec playwright test --config playwright.teachers.config.ts`. Twelve functional/control scenarios plus five existing/expanded baseline checks per desktop/mobile project. Full overview and New/Edit Teacher/Create New Section screenshots pass zero-difference comparisons at threshold 0.1. Both switch states use isolated control screenshots at identical whole-pixel positions on white backgrounds; modal heights differ due to retained assignment controls. Backend responses are mocked, not PostgreSQL integration tests. |
| ECCD/shared-control regression | Passed: 22 tests, Batch 2 | Reran `corepack.cmd pnpm exec playwright test --config playwright.eccd.config.ts` after final shared-control changes; all Batch 1 scoped checks pass. G12/G13 remain verified. |
| Dashboard component/browser parity | Passed: 18 tests, Batch 3 | `pnpm.cmd exec playwright test --config playwright.dashboard.config.ts` from `frontend/`. Nine scenarios per desktop/mobile Chromium project: four isolated delay/failure cases, filter dependencies and rendered changes, stale responses, populated/empty reference screenshots, and ten responsive widths. Viewport, full chart and ranking card comparisons require zero differing pixels at threshold 0.1. Matching doughnut SVG geometry, tooltip, labels, legend, ranking percentages, minimum height and 900px 8/4 grid are checked. Mobile chart cards alone are positioned at the same viewport origin with their original measured size; original card geometry is recorded separately. APIs are mocked; backend integration and whole-mobile-page screenshot parity are outside this verification scope. |
| Baseline/tooling setup | Verified, Batch 1 | pnpm 12.11.2 through Corepack; workspace and isolated harness frozen-lockfile installs; Playwright Chromium installed. Harness resolves original JSX/theme/CSS under `AMES-SYSTEM/frontend/`; legacy files untouched. |
| Evidence artifacts | Generated locally, ignored | Screenshots, measurements and generated legacy baselines reside in `frontend/test-results/`. They are recreated by the scoped command and are not tracked production assets. |
| Documentation | Completed, final gate 2026-10-13 | Plan 1 Completed / Passed for the compilation-only gate; Steps 1–7 checked off and G01–G15 Verified with stated evidence. Final completion log appended. Earlier visual evidence and unperformed runtime coverage remain explicitly distinguished. |

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
| Settings OTP scope | Center the existing account email-change OTP modal. Backup/restore retain authenticated super-admin access and manual restore confirmation. No new backup challenge flow is introduced. | Batch 5 user clarification explicitly selected preserving existing contracts; neither inspected legacy settings nor current backup routes require backup/restore OTP. |
| Settings appearance extension | Keep system title, secondary color, profile image and durable login-background upload in a collapsed group within Personalization. | Step 7 requires preserving additional appearance features while keeping four primary sections. |
| Legacy overflow | Preserve 300px cards at 1280px and larger; use available column width below 1280px instead of the legacy 300px minimum. Table overflow stays within its scroll container. | User's Batch 1 responsive requirement; no viewport overflow at the ten tested widths from 320–1280px. Desktop reference screenshot remains identical. Narrow-screen legacy overflow is deliberately corrected. |
| Dashboard narrow statistic cards | Stack icons and content only between 900px and 1199px; allow narrow text columns to wrap within their card. Keep the reference four-card grid and chart/ranking 8/4 split at 900px. | Responsive-first mandate; strict card-content containment checks exposed overflow at the narrow desktop widths. Reference screenshots cover the unchanged 1280px/mobile layouts; intermediate widths verify containment and grid geometry. |
| Student export scope | Send only the selected section, independently of roster school-year filtering. Keep backend authorization, active-roster selection, cohort splitting and server filename handling. | Explicit Batch 4 user direction; inspected legacy request and current `backend/utils/excel.py`. |
| Plan 1 acceptance scope | Close Plan 1 on source/tracker review, zero application type errors, full lint and successful production bundling. No new screenshots, browser loops or live-data restore/rollover checks. | Explicit final acceptance-gate user instruction, 2026-10-13. Verified statuses and Completed / Passed refer only to this scope; unperformed checks are not reported as passed. |
| URL parity and extensions | Retain current `/chairman/*` compatibility aliases resolving to `/super-admin/*` for this gate. Shared wrapper and Parent alias differences remain outside G01–G15 sign-off. | Active-runtime URL contract in `AI_CONTEXT.md` and source/compilation-only final scope. G25/G26 retain their separate future-work status; this documentation update does not add wrappers or routes. |

### Source-update log

Append new entries in chronological order. Each entry should include **date, files changed, finding IDs, implementation summary, verification evidence, remaining work, and next action**. A documentation-only entry must not imply source fixes were made.

| Date | Change | Findings / phase | Validation | Remaining work |
| --- | --- | --- | --- | --- |
| 2026-10-12 | Completed the read-only source audit and produced the three-phase roadmap with detailed Chairman steps. | G01-G26; audit | Source inspection only; tooling and harness limitations recorded above. | All application implementation and browser verification pending. |
| 2026-10-12 | Created `FRONTEND_PARITY_MIGRATION.md` containing the audit, roadmap, styling/API details, checklists, and maintenance instructions. | Documentation only | Verified file creation, document sections, finding tracker, and git status. No application or legacy source changes. | User confirmation still required before Chairman implementation. |
| 2026-10-12 | **Plan 1 Batch 1:** modified `frontend/src/pages/chairman/EccdQuestionsManagement.tsx`, `frontend/tests/legacy-visual/entry.tsx`, `frontend/tests/legacy-visual/vite.config.mjs`, `frontend/tests/chairman-parity.spec.ts`; added `frontend/tests/eccd-configuration.spec.ts` and `frontend/playwright.eccd.config.ts`; updated this document and `frontend/VISUAL_PARITY.md`. Corrected reference paths, undefined toggle callback, immediate submission locks, loading/refresh, legacy copy/order/footer/spacing and responsive cards. Comparison tests await cancelled animations safely; scoped runner uses Windows Corepack and mocked APIs. | Steps 1/3; G12 and G13 verified for batch scope; G27 added as an existing Step 2 defect. | 22 desktop/mobile browser tests pass; desktop overview and both add dialogs desktop/mobile pass zero-difference screenshot checks. Application/new-test TypeScript, changed-file lint and production build pass. Full lint fails at unchanged `chairman/ui.tsx:380` (four render-ref errors). Initial setup failures (missing global pnpm and browser binary) were resolved with Corepack, dependency installs and Chromium. Draft recovery, 403, reconnect, edit/delete and 320–1280px overflow checks pass. No legacy, backend, permission-gate or draft-hook changes; no new commit created. | Remaining Step 1 fixtures for other screens, Step 2 foundations/G27, and Steps 4–7; full Chairman/shared-auth/backend integration acceptance pending. Continue only with the next authorized Chairman batch; Teacher/Parent deferred. |

| 2026-10-12 | **Plan 1 Batch 2:** modified `frontend/src/pages/chairman/TeacherManagement.tsx`, `frontend/src/types.ts`, `frontend/src/components/chairman/ui.tsx`, `frontend/tests/chairman-parity.spec.ts`, `frontend/playwright.eccd.config.ts`; added `frontend/tests/teacher-management.spec.ts` and `frontend/playwright.teachers.config.ts`; updated this tracker and `frontend/VISUAL_PARITY.md`. `super-admin/TeacherManagement.tsx` remains the unchanged re-export of the repaired workspace. Implemented immediate typed permission PUT and synchronous saving locks, required teacher fields/email username/centered footer, backend-supported edit class_name, incumbent handover, Section Identifier/creation auto-selection, and inline section-menu delete actions with protected rejection handling. Shared select gains opt-in captions/action slots, viewport-bounded menus and an event-resolved portal host; native switch mirrors legacy dimensions/colors. Scoped runners keep separate evidence directories. | Step 4 G04/G05/G06/G07 verified; G27 verified; G12/G13 remain verified after regression. | 34 teacher desktop/mobile component/browser tests pass; overview and three dialogs match full reference screenshots, both switch states match isolated control screenshots with zero differing pixels at threshold 0.1. Required fields, handover cancel/confirm, Primary/Substitute payloads, one-request locks, 403/reload, offline/reconnect auto-selection and protected HTTP 409 deletion pass. Eight responsive widths pass. Application/test TypeScript, full frontend lint and production build pass; ECCD regression 22/22 passes. Initial mobile menu reachability and reference label/table/control rendering failures were corrected; screenshot thresholds were not relaxed. Build retains its existing size advisory. No legacy/backend/student-ID/LRN/session-auth/draft-hook changes; no new commit created. | Archive/restore/account-deletion confirmation visuals, other Chairman pages, remaining foundation states and full auth/backend integration acceptance remain pending. Continue only the next authorized Chairman batch; Teacher/Parent portal migration deferred. |

| 2026-10-12 | **Plan 1 Batch 3:** modified `frontend/src/pages/chairman/Dashboard.tsx`; added `frontend/tests/dashboard-parity.spec.ts` and `frontend/playwright.dashboard.config.ts`; updated this tracker and `frontend/VISUAL_PARITY.md`. Split filters/statistics/pie/rankings into independent guarded request lifecycles with localized errors and loading state; restored legacy filter dependencies and KAYA/DI-KAYA ranking calculation; retained chart-contained dropdowns and 80/120 radii, 5-degree spacing, 36px legend and 300px minimum container. Made the 900px 8/4 grid explicit, reproduced legacy card clipping and translated ranking bars, and contained narrow statistic-card content. | Step 5; G03 verified within batch scope. | Final combined suite: 18/18 desktop/mobile Chromium checks pass; populated/empty overview viewport and complete chart/ranking card screenshots have zero differing pixels at threshold 0.1. Independent delays/failures, changed filter values/labels, request dependencies, ranking order, stale responses and ten widths from 320px to 1280px pass. Application/test TypeScript, full lint and production build pass. Restored missing test/harness dependencies and Chromium with pnpm; resolved initial full-page SVG animation sampling and fractional bar/control raster mismatches through stable component captures and inspected legacy styling. Mobile doughnut screenshots alone use a common viewport origin at the original measured size; no whole-mobile-page equality claim or relaxed thresholds. Build retains its existing size advisory. No legacy/backend/API-alias/student-ID/LRN/auth/draft changes; no new commit created. | Remaining Chairman foundation states, archive/restore/account-deletion confirmation visuals and Steps 6/7 remain pending. Full Chairman/shared-auth/backend acceptance is still pending. Preserve prior finding evidence when changing shared code; Teacher and Parent migration remain deferred. |

| 2026-10-13 | **Plan 1 Batch 4:** completed existing partial StudentRecords/AuditWorkspace/dateUtils work; updated `frontend/src/pages/chairman/StudentRecords.tsx`, `frontend/src/pages/chairman/SystemAuditLog.tsx`, `frontend/src/pages/chairman/SystemAuditLog.tsx`, `frontend/src/utils/dateUtils.ts` and this tracker. Reused the existing untracked Chairman Snackbar component and existing downloadFile filename support. Preserved unrelated working-tree edits and pre-existing visual harness files. Implemented visible-row selection state, focusable rows, responsive details/zero-value display, legacy section-only exports and filenames, temporary transfer/export feedback, typed audit mapping/search/table/modal and legacy roster-age arithmetic. | Step 6 implementation checked off; G08/G09/G10/G11 Implemented, verification pending. | `pnpm.cmd tsc --noEmit -p tsconfig.app.json`, `pnpm.cmd build`, targeted ESLint and six direct Node age-helper assertions pass. Existing bundle-size advisory remains. Read-only legacy/current contract inspection completed. No screenshot comparisons or browser suites were scaffolded, run or debugged. Legacy/backend/draft-hook files untouched; no commit created. | Interactive transfer/export/reconnect, audit and responsive UI verification remain pending, as do Step 7 and full Chairman/shared-auth/backend acceptance. Teacher and Parent migration deferred. |

| 2026-10-13 | **Plan 1 Batch 5:** updated `frontend/src/pages/chairman/SystemSettings.tsx`, `frontend/src/context/SettingsContext.tsx`, `frontend/src/services/api.ts` and this tracker. Added August fallback, normalized/load-aware settings and stale-response protection; preserved stored/in-memory opening-month edits through hydration and refresh, with revision-specific confirmation after branding save/rollover. Organized four sections and local feedback; moved additional appearance controls into Personalization. Centered rollover/revert/restore forms and account OTP digits/close control; retained dismissed challenge/code, replacement sessions, HTTP-confirmed draft/file eviction, IndexedDB persistence and backend 30-day snapshot eligibility. Download JSON rejection details now reach the originating card. | Step 7 implementation checked off; G14/G15 Implemented, verification pending. | Application TypeScript and Vite production build pass; existing bundle-size advisory remains. No screenshot, headless browser, component or backend tests executed by user direction. Formatter registry failure resolved with approved retry. User explicitly confirmed preserving account-only OTP rather than inventing a backup/restore OTP contract. Legacy/backend/shared draft hooks untouched; unrelated changes retained; no commit created. | Interactive settings/draft hydration, account challenge/session replacement, encrypted restore and rollover/revert verification remain pending. Step 6 interactive checks and overall Chairman/shared-auth/backend acceptance remain pending; Teacher/Parent migration deferred. |

| 2026-10-13 | **Authentication follow-up reconciled:** recorded preceding authorized changes to `backend/.env`, `.env.example`, `config/settings.py`, `main.py`, `routes/auth.py`, `utils/authentication.py`, `utils/email.py`, `scripts/setup_parity_dev.py`, OTP tests and `backend/OTP_VERIFICATION.md`; frontend `src/pages/LoginPage.tsx` and `src/components/auth-ui.tsx`. Unified ENABLE_OTP, real SMTP delivery, safe logs, expiry errors and login OTP modal/loading/input/resend behavior. This row reconciles earlier source work; no additional authentication source changed during the acceptance gate. | Shared authentication follow-up; runtime extension retained in Plan 1 review. | Prior turn: application typecheck and targeted lint passed; 13 focused OTP tests and Python compilation passed; backend startup and root/OpenAPI returned HTTP 200; live SMTP/TLS authentication succeeded without sending email. No inbox receipt or browser verification claimed. | Real-account email receipt remains a manual checklist in `backend/OTP_VERIFICATION.md`; legacy files untouched. |

| 2026-10-13 | **Final Plan 1 completion — Completed / Passed:** documentation-only update to `FRONTEND_PARITY_MIGRATION.md`. Checked off Steps 1–7 for the user-authorized compilation-only gate, marked G01–G15 Verified with source/batch evidence, updated phase/current/next-action fields and recorded acceptance-scope and route decisions. No application source fix or new commit claimed. | Plan 1 Steps 1–7; G01–G15; previous G27 evidence retained. | From `frontend/`: `pnpm.cmd tsc --noEmit -p tsconfig.app.json`, `pnpm.cmd lint` and `pnpm.cmd build` all exit 0. Zero application type errors, lint errors, missing exports or bundle-resolution errors; Vite 8.3.0 transforms 731 modules. Existing 500 kB chunk advisory retained (JS 888.45 kB, gzip 267.05 kB). No screenshot or browser suite run; historical records retained. | Nothing remains for this defined compilation-only gate. Additional rendered, interactive and live-backend coverage is outside the sign-off. Plans 2/3 and shared G25/G26 follow-up remain deferred pending user direction. Legacy/reference files untouched; existing unrelated working-tree edits preserved. |

| 2026-10-13 | **Plan 2 — Teacher shell/dashboard and full five-objective source parity batch:** updated `frontend/src/App.tsx`, `layouts/MainLayout.tsx`, `pages/teacher/StudentManagement.tsx`, `EccdAssessment.tsx` and `TeacherSettings.tsx`; replaced `pages/teacher/Dashboard.tsx` with `TeacherDashboard.tsx`; added `layouts/TeacherLayout.tsx`, `context/TeacherContext.tsx`, `components/teacher/TeacherDialog.tsx`, `TeacherSkeleton.tsx`, `TeacherStudentForm.tsx`, `TeacherChecklist.tsx` and `teacher.css`; updated this tracker. Restored navigation/context, Educational Overview/chart/feed, avatar roster/profile workspace, domain cards/three-period matrix/sticky saves, immediate granular access switches and account challenge dialog. Persisted active section, domain, period, import section options and existing drafts/files; adapted current IDs/permissions/API scopes. | Plan 2 Batch 1 and expanded roster/assessment/settings objectives; G16–G19 Implemented, verification pending; Teacher portion of G24 implemented. | Final `pnpm.cmd tsc --noEmit -p tsconfig.app.json` and `pnpm.cmd build` both exit 0. Vite 8.3.0 transforms 736 modules; JS 917.91 kB / gzip 274.09 kB. No broken imports/chunk references; existing 500 kB advisory retained. Only current changed frontend files formatted. No dependencies, tests or visual harness changes; no browser/screenshot/lint/backend suites run. Read-only contract review and final diff confirm backend, legacy sources, API service and shared draft/file/session hooks unchanged. | Rendered/responsive/live-API verification remains excluded and is not claimed. Shared chat G23, Parent portion of G24, G25/G26 and Plan 3 remain future work. Detailed API adaptations and unsupported photo-persistence limit recorded above. No commit created. Next action: retain this completed source/compilation deliverable and await authorization for additional scope. |

### Next action

**The five authorized Teacher objectives are implemented and pass the requested compilation/build checks.** G16–G19 remain **Implemented, verification pending** for rendered and interactive parity; no additional checks are required for this compilation-only deliverable. Await user direction for shared chat presentation, runtime verification, G25/G26 or Plan 3. Preserve the prohibition on screenshot/headless browser comparison loops and keep backend and both legacy paths read-only.
