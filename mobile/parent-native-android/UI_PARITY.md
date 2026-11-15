# Parent mobile design reference

Implemented from read-only source inspection on 2026-11-15, based on Phase 2
`7c882bc`. This is native React Native UI, with no browser/WebView or web imports.
Frontend/backend files were neither generated nor changed.

| Web reference | Native presentation |
| --- | --- |
| `layouts/ParentLayout.tsx`, `layouts/MainLayout.tsx` | Dark `#111827` school header, seal, account logout, five white bottom tabs, unread badge, selected-child dialog |
| `components/teacher/theme.ts`, `context/SettingsContext.tsx` | Poppins Regular/Medium/SemiBold/Bold, school primary color/name/data-URL seal; `#4543c0` fallback, `#1e1e2f`, `#f4f5f7`/`#f8fafc`, slate text, 12px cards, soft shadows |
| `pages/LoginPage.tsx`, `pages/RegisterParentPage.tsx`, `components/auth-ui.tsx` | Same bundled school background, indigo seal panel, elevated centered card, outlined fields/icons, password visibility, inline feedback, six OTP cells, resend cooldown |
| `pages/parent/Dashboard.tsx` | Greeting, school-year pill, child/adviser summary, phase/status, strengths/support, completion bars, home/results/insights/message actions |
| `pages/parent/ChildManagement.tsx` | Avatar, completeness bar, protected identity/enrollment summary, contact and Father/Mother/Legal Guardian sections, sticky green save action |
| Dashboard Link LRN dialog | Native centered scrollable dialog, 12 ASCII digits, inline validation, SYNCED/PENDING approval badges, retained local input |
| `components/parent/HomeAssessmentForm.tsx` | Period segments, expandable home domains, green/amber KAYA/DI-KAYA choices, lock badges, local-draft feedback, sticky manual submit and irreversible-submit confirmation |
| `pages/parent/ParentEccdAssessment.tsx`, `components/parent/ReadOnlyDomainChecklist.tsx` | Official/checklist segments, three period summary cards, masked unreleased states, PRE/MID/POST scaled matrix, expandable indicators and attribution |
| `pages/parent/ParentMlInsights.tsx` | Readiness, POST outcome and confidence bars, baseline tier badges, expandable green intervention cards, interpretation/research callouts |
| `components/ChatInterface.tsx` | Mobile contact-to-thread flow, avatars, parent indigo/teacher white bubbles, Philippine-time timestamps, read status, virtualized history and keyboard-safe composer |

Shared primitives live in `src/ui.tsx`; assessment-only presentation lives in
`src/AssessmentScreens.tsx`. Services, contracts, storage keys and the native
encrypted-cookie bridge remain unchanged. Bottom tabs use dynamic school color;
chat bubbles keep the website's `#4f46e5`. Unread counts are the real global API
count; the contacts contract does not supply per-contact unread totals.

## Native adjustments

- Android safe-area padding and `adjustResize` keep actions above system bars and
  the keyboard. Bottom navigation hides while the keyboard is open.
- Hardware Back dismisses dialogs without clearing drafts, returns a conversation
  to contacts, a portal tab to Dashboard, and OTP/registration to account entry.
- Interactive controls have at least 44dp touch targets. Font scaling stays enabled;
  cards/forms scroll and wrap rather than fixing their height. Scores fit the
  three-column matrix; long domain names wrap.
- The six visible OTP cells share one native input for paste, autofill and deletion.
- Link/home dialogs retain the existing manual-only storage/submission behavior.
  Home confirmation adds a deliberate tap before a server save that locks answers.
- No navigation, UI, font-loader or icon npm dependency was added. Fonts are bundled
  in Android assets and work offline. Licenses are in `assets/` (Poppins OFL and
  Material Icons Apache 2.0). Fonts originate from the official Google Fonts
  `google/fonts/ofl/poppins` and `google/material-design-icons/font` repositories.
  The auth background is copied from the existing read-only website asset.

## Verification boundary and phone acceptance

Source inspection, TypeScript/service tests, native JVM tests and signed APK
verification are recorded in RELEASE_VERIFICATION.md. No emulator is installed
locally; actual screen rendering and pixel comparison were not executed. This is
not a claim of pixel-for-pixel equivalence or live-account acceptance.

Install the same-key update without uninstalling or clearing data. Compare the
website and app with the same account, child, settings and release permissions:

1. Check login/registration/OTP at normal and enlarged font sizes, password toggles,
   autofill/paste, cooldown, inline errors and staff-account switching.
2. Switch siblings, open/dismiss Link Child with keyboard and Back, and reopen its
   draft. Check both approval statuses and no validation error after a successful link.
3. Check dashboard status/progress and every unreleased/marks-disabled state;
   verify profile view/edit locks, household draft recovery and changed-field saves.
4. Scroll a long home domain; verify the submit bar, period/window/question locks,
   confirmation cancel/Back, offline message, restart recovery and manual resubmit.
   Reconnection must never submit any parent draft.
5. Compare all three summaries/matrix and insights tiers, confidence/interventions
   and research notices. Permission withdrawal must hide restricted data.
6. Open a thread, use the keyboard, read earlier messages, receive new ones, send,
   switch contacts and use hardware Back. Check unread counts, receipts, composer
   recovery and refresh-token socket reconnection without losing input.

The review checkpoint asked: “Did this change introduce unnecessary abstractions,
extra state, or new dependencies that existing code already handles?” Shared
presentation primitives serve multiple screens; the existing HTTP, permissions,
draft and socket services are reused. No replacement service layer was added.
