# Parent mobile design reference

Implemented from read-only source inspection on 2026-11-15, based on Phase 2
`7c882bc`; navigation/adviser refinements follow UI release `6b7a467`, and
pull-to-refresh/relationship refinements follow `214a324`; assessment UX refinements
follow `b2af2c7` and the approved PARENT_ASSESSMENT_UX_PLAN.md.
This is native React Native UI, with no browser/WebView or web imports.
Frontend/backend files were neither generated nor changed.

| Web reference | Native presentation |
| --- | --- |
| `layouts/ParentLayout.tsx`, `layouts/MainLayout.tsx` | Dark `#111827` school header, seal, account logout, five white bottom tabs, unread badge, selected-child dialog |
| `components/teacher/theme.ts`, `context/SettingsContext.tsx` | Poppins Regular/Medium/SemiBold/Bold, school primary color/name/data-URL seal; `#4543c0` fallback, `#1e1e2f`, `#f4f5f7`/`#f8fafc`, slate text, 12px cards, soft shadows |
| `pages/LoginPage.tsx`, `pages/RegisterParentPage.tsx`, `components/auth-ui.tsx` | Same bundled school background, indigo seal panel, elevated centered card, outlined fields/icons, password visibility, Father/Mother/Guardian dropdown, inline feedback, six OTP cells, resend cooldown |
| `pages/parent/Dashboard.tsx` | Overview greeting, school-year pill, child/adviser summary, phase/status, strengths/support, collapsed progress; home editor inline, no Overview message card |
| `pages/parent/ChildManagement.tsx` | Avatar, completeness bar, protected identity/enrollment summary, current-detail teacher first/last name for Adviser, household sections, sticky green save action |
| Dashboard Link LRN dialog | LRN-only native dialog, 12 ASCII digits, inline validation, SYNCED/PENDING badges, retained local input; relationship inherited by the server |
| `components/parent/HomeAssessmentForm.tsx` | Assess Home-Based Questions in Overview; full collapsed card tap, isolated expanded header, period/domain accordions, one instruction, confirmed questions/domains hidden, manual submission and revision-safe drafts |
| `pages/parent/ParentEccdAssessment.tsx`, `components/parent/ReadOnlyDomainChecklist.tsx` | Read-only official/checklist segments, period summaries, teacher-lock states, scaled matrix, home/school indicators and attribution; permission-safe All/DI-KAYA/KAYA filters, DI-KAYA-first per domain |
| `pages/parent/ParentMlInsights.tsx` | Readiness, POST outcome and confidence bars, baseline tier badges, expandable green intervention cards, interpretation/research callouts |
| `components/ChatInterface.tsx` | Mobile contact-to-thread flow, avatars, parent indigo/teacher white bubbles, Philippine-time timestamps, read status, virtualized history and keyboard-safe composer |

Shared primitives live in `src/ui.tsx`; assessment-only presentation lives in
`src/AssessmentScreens.tsx`. API routes, storage keys and the native encrypted-cookie
bridge remain unchanged. Registration uses a three-value relationship type; linking
omits that optional field. Bottom tabs use dynamic school color;
chat bubbles keep the website's `#4f46e5`. Unread counts are the real global API
count; the contacts contract does not supply per-contact unread totals.

## Native adjustments

- Android safe-area padding and `adjustResize` keep actions above system bars and
  the keyboard. Bottom navigation hides while the keyboard is open.
- Hardware Back dismisses dialogs without clearing drafts, returns a conversation
  to contacts, a portal tab to Overview, and OTP/registration to account entry.
- Interactive controls have at least 44dp touch targets. Font scaling stays enabled;
  cards/forms scroll and wrap rather than fixing their height. Scores fit the
  three-column matrix; long domain names wrap.
- The six visible OTP cells share one native input for paste, autofill and deletion.
- Link/home dialogs retain the existing manual-only storage/submission behavior.
  Home confirmation adds a deliberate tap before a server save that locks answers.
- Overview uses one scroll container. Home/progress sections start collapsed;
  collapsing home preserves the selected period and device drafts. Selecting a
  different child starts collapsed. Messages and unread remain in bottom navigation;
  its redundant header shortcut is removed.
- Data pages use native pull-to-refresh with the school-color spinner and no
  refresh buttons. Overview reloads children, assessment and dashboard together;
  other pages reload children and their current data. Messages reloads contacts/
  unread counts, plus active history in a thread. Empty states can also be pulled.
  A per-view in-flight guard prevents repeated gestures from overlapping, and
  finalization stops the spinner on failure. Automatic polling and socket updates
  remain enabled; pulling never submits inputs, sends drafts or generates ML.
- Registration relationship is a dropdown with Father, Mother and Guardian;
  Guardian remains the default. Syncing asks only for LRN and sends no relationship
  override. Existing link drafts keep their LRN while legacy relationship values
  are ignored. Auth session recovery remains an explicit authentication action.
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
   autofill/paste, dropdown selection/Back, cooldown, inline errors and staff switching.
2. Switch siblings, open/dismiss Link Child with keyboard and Back, and reopen its
   draft. Check both approval statuses and no validation error after a successful link.
3. Check Overview status/progress and every unreleased/marks-disabled state;
   verify profile locks, current-child adviser display/fallback, draft recovery
   and changed-field saves. ECCD must have no edit or submit controls.
4. Tap the full Assess Home-Based Questions card in Overview, including its
   whitespace/title, to expand. Once open, only its header may collapse it;
   tapping domains or either answer must not. Retain its period and draft,
   switch siblings and confirm collapsed state; verify the submit bar is
   hidden when collapsed or complete. Scroll a long home domain; verify period/window/question locks,
   confirmation cancel/Back, offline message, restart recovery and manual resubmit.
   Reconnection must never submit any parent draft.
5. Compare all three summaries/matrix and insights tiers, confidence/interventions
   and research notices. Permission withdrawal must hide restricted data.
6. Open a thread, use the keyboard, read earlier messages, receive new ones, send,
   switch contacts and use hardware Back. Check unread counts, receipts, composer
   recovery and refresh-token socket reconnection without losing input.
7. Pull at the top of every page and an empty/short list; check the spinner while
   online/offline and after a failed request. Repeat gestures and switch child/tab
   mid-request. Keep profile/home/composer inputs; ML refresh must not generate a
   prediction. Contacts/history pull must not send messages or duplicate items.
8. With a Father/Mother account, sync using LRN only and verify the inherited
   relationship. Reopen a pre-update link draft and confirm its LRN is preserved;
   an old local relationship must not override the registered value.
9. Check All / DI-KAYA / KAYA in each ECCD period. All starts with DI-KAYA within
   each domain, original numbers remain, empty filtered domains disappear, and
   restricted answers never affect order/counts. Check marks independently of scores.
10. Manually submit one home answer, then the rest of a domain. Confirm only saved
    rows disappear, empty domains disappear, and other periods/children are intact.
    Fail the following refresh: confirmed rows must stay hidden. Fail the save:
    rows/drafts must remain. At completion show All home observations submitted
    without a submit action; a teacher lock must never be called completion.
11. Verify Overview highlights against the same child's server results, including
    school and home questions in the latest period. Lock that period while an
    older period remains released: show Locked by teacher without old highlights.
    Mark visibility/home editing must not independently release or block aggregates.
    Check compact titles, one home instruction, no static draft explanation,
    and only the bottom Messages unread indicator. Logout must clear in-memory
    confirmations while preserving device drafts.

The six assessment UX suites exercise presentation/service behavior and actual
component handlers using mocked hooks/hosts, without a new test dependency.
They do not simulate Android touch dispatch, layout or accessibility services;
the device scenarios above remain necessary.

The review checkpoint asked: “Did this change introduce unnecessary abstractions,
extra state, or new dependencies that existing code already handles?” Shared
presentation primitives serve multiple screens; the existing HTTP, permissions,
draft and socket services are reused. No replacement service layer was added.
