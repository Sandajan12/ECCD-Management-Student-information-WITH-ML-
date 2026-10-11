# Phase 3: authentication and core layout visual review

All legacy references below are under `AMES-SYSTEM-LEGACY/frontend/` and remain read-only. This batch covers authentication and shared navigation; dashboard content, workspace pages and chat content require their own visual audits.

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
