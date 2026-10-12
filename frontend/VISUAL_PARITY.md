# Phase 3: authentication and core layout visual review

The available legacy reference is now `AMES-SYSTEM/frontend/` and remains read-only. The original authentication/shared-navigation review below is historical; current Chairman Batches 1/2 evidence is recorded at the end. Dashboard content, other workspace pages and chat content require their own visual audits.

| Current file | Legacy source inspected | Extracted visual properties and Tailwind equivalents | Review status |
| --- | --- | --- | --- |
| `src/pages/LoginPage.tsx` | `src/pages/auth/Login.jsx` | 840px Paper -> `max-w-[52.5rem]`; 16px radius -> `rounded-2xl`; elevation 24 -> exact arbitrary shadow; 32% desktop brand panel; logo 90/130px; 24/40/48px form padding; original title, footer and six-digit OTP flow. | Updated |
| `src/pages/RegisterParentPage.tsx` | `src/pages/auth/Register.jsx` | Separate 600px Paper, elevation 16, 12px radius, 20/32px horizontal padding; original two-column field rows at 600px, native select arrow, password criteria, checkbox, activation and resend states. | Updated |
| `src/components/ForceChangePassword.tsx` | `src/components/ForceChangePasswordModal.jsx` | 600px dialog, 32px viewport margins, 8/16px inner padding, original backdrop blur, green security icon and action; title/footer remain visible while mobile content scrolls. | Updated |
| `src/layouts/MainLayout.tsx` | `src/components/MainLayout.jsx` | Original 256px dark drawer, role items, active blue background, icons, spacing and logout; 900px desktop breakpoint; 56px mobile app bar; original parent bottom bar. Mobile drawer and backdrop portal above the bottom bar. | Updated |
| `src/components/auth-ui.tsx` | Auth sources above, MUI theme and component defaults | Original field, button, checkbox, alert, OTP and criterion measurements/colors; outlined borders drawn without changing input dimensions; legacy button elevation changes and disabled states. | Updated |
| `src/components/LegacyIcon.tsx` | Legacy MUI icon imports and original icon SVG paths | Native SVGs reproduce original Material paths, including ChildCare eyes and the alert success icon. MIT license retained. | Updated |
| `src/components/LegacyRipple.tsx` | MUI ButtonBase/TouchRipple/Ripple | Original 550ms enter/exit and keyboard focus pulse, pointer/touch handling, currentColor opacity and circular button ripples. | Updated |
| `src/index.css` | `src/index.css`, `theme.js`, MUI responsive/animation defaults | Self-hosted Poppins weights; scoped 600/900/1200px legacy breakpoints; original ripple and two-bar progress animations. Existing workspace breakpoints are preserved. | Updated |

## Verification method

`tests/legacy-visual/` renders the unmodified legacy JSX, theme, stylesheet and Tailwind 3 configuration in an isolated test harness. Its MUI/Emotion/Tailwind 3 packages are test-only; the active application's package.json and production build use React/TypeScript/Tailwind without MUI. Identical Poppins files are loaded locally instead of Google Fonts. Auth/settings/API responses use synthetic fixtures; the legacy backend is never run.

`tests/auth-parity.spec.ts` compares original and migrated screenshots in the same Chromium browser context. Auth pages cover 390, 600, 899, 900 and 1280px. Password setup, login/registration OTP, all three role drawers, mobile app bar and parent bottom bar cover desktop/mobile contexts. Geometry checks allow at most one CSS pixel; screenshots allow zero differing pixels at Playwright's 0.1 color threshold, excluding its standard antialias detection. This verifies the specified fixtures and states, not every browser/font-rendering environment or every school-name length.

The existing migration suite verifies real FastAPI/PostgreSQL workflows using disposable schemas, including local OTP bypass, permissions, first-login setup, durable drafts and reconnect behavior. Credential and form drafts remain scoped and are cleared only after confirmed successful requests. No live accounts or secrets are changed.

Install the isolated harness once before running browser checks:

```powershell
pnpm.cmd --dir frontend/tests/legacy-visual install --ignore-workspace
pnpm.cmd --dir frontend exec playwright install chromium
pnpm.cmd --dir frontend run test:e2e --reporter=list
```

Review screenshots and generated legacy baselines are in the ignored `frontend/test-results/` folder. The loopback reference server uses port 5187; the disposable API uses port 8767. The normal local system remains on ports 5173/8000.

## Chairman Plan 1, Batch 1 — 2026-10-12

The harness imports original components/theme/CSS from `AMES-SYSTEM/frontend/`; importer matching uses the normalized absolute reference path. Both workspace and isolated test dependencies were installed with frozen lockfiles using pnpm 12.11.2 through Corepack, and Playwright Chromium was installed. Production dependencies and legacy source files were unchanged.

From `frontend/`, run `corepack.cmd pnpm exec playwright test --config playwright.eccd.config.ts` on Windows (`pnpm exec playwright test --config playwright.eccd.config.ts` where pnpm is on PATH). The scoped config starts only the two Vite servers; every API is mocked, so no database or backend is needed.

- **22 desktop/mobile Chromium checks pass.** Desktop ECCD overview and Add Domain/Add Question screenshots match the freshly rendered reference at zero differing pixels, threshold 0.1. Both mobile add-dialog screenshots pass the same comparison. Mobile overview verifies heading structure/geometry; it does not assert whole-page screenshot equality.
- Functional scenarios cover loading, empty/error fetches, synchronous duplicate toggle/form events, immediate footer/field/dismissal locks, confirmed scoped-draft eviction, 403/reload recovery, disconnected home-toggle recovery and reconnect sync, role/permission redirects, edit refresh, and question deletion.
- Cards, table scroll containers and question dialogs cause no horizontal viewport overflow at 320, 390, 599, 600, 899, 900, 1024, 1199, 1200 and 1280px. Cards use fluid column widths below 1280px, deliberately correcting legacy overflow; 1280px retains the 300px desktop reference geometry.
- Application and new test/config TypeScript, changed-file ESLint, and the production build pass. Full `pnpm lint` fails on four existing `react-hooks/refs` errors at unchanged `src/components/chairman/ui.tsx:380` (G27). Overall Chairman/shared-auth/backend integration acceptance remains pending.

The authoritative checklist, live G12/G13/G27 statuses, modified-file inventory, and next action are maintained in [FRONTEND_PARITY_MIGRATION.md](../FRONTEND_PARITY_MIGRATION.md). This evidence covers the specified fixtures and Chromium contexts, not every browser or all remaining Chairman screens.

## Chairman Plan 1, Batch 2 — 2026-10-12

Teacher Management findings G04-G07 are verified within this batch. Run `corepack.cmd pnpm exec playwright test --config playwright.teachers.config.ts` from `frontend/`; the runner uses the same unmodified JSX reference and mocked APIs as the ECCD harness.

- **34 desktop/mobile Chromium checks pass.** The teacher overview and New Teacher, Edit Teacher and Create New Section dialogs match freshly rendered reference screenshots at zero differing pixels, threshold 0.1. Both permission-switch states match isolated control screenshots at identical whole-pixel positions on white backgrounds. Whole Manage Access dialog equality is not claimed because its current assignment controls must remain available.
- Immediate permission PUT, duplicate-event locks, required teacher fields, email-as-username creation, backend-supported edit `class_name`, handover cancellation/confirmation, own-adviser bypass and Primary Adviser/Substitute assignment payloads pass. Section creation auto-selects in originating create/edit forms; section-menu deletion preserves selection and displays backend HTTP 409 rejection while students remain assigned.
- Scoped drafts survive HTTP 403/reload and offline/reconnect; confirmed saves clear only their scoped revisions. Reconnected section creation auto-selects its confirmed result. Forms and menu actions remain reachable without viewport overflow at 320, 390, 599, 600, 899, 900, 1200 and 1280px.
- Application/test TypeScript, full `pnpm lint`, and `pnpm build` pass. Batch 2 resolves G27 by moving the shared select's dialog-host ref read into its opening event; the earlier Batch 1 lint failure is historical. Vite's existing bundle-size advisory remains.
- **22 ECCD regression checks pass** after the final shared-control changes. Both scoped runners use separate ignored artifact directories (`test-results/teachers` and `test-results/eccd`); generated reference baselines remain under `test-results/legacy-baselines`.

Current backend safety takes precedence over legacy destructive behavior: assigned students block section deletion; handover archives an incumbent only when no other active assignment remains. Assignment controls remain in an expandable group. No legacy, backend, student-ID, LRN, session-auth or draft-hook files changed. These are mocked component/browser checks; full backend integration, archive/restore/account-deletion confirmation visuals and overall Chairman acceptance remain pending. Teacher and Parent portal migration remain deferred. See [FRONTEND_PARITY_MIGRATION.md](../FRONTEND_PARITY_MIGRATION.md) for the live checklist and source-update log.
