# Parent App Assessment UX Update Plan

Status: Implemented locally on 2026-11-15 as 1.2.3 / version code 6. TypeScript,
45 tests across six focused suites plus existing regressions, four native tests,
signed release build, signature and alignment checks passed. Physical-device
acceptance remains pending; see RELEASE_VERIFICATION.md and UI_PARITY.md.

## 1. Summary and guardrails

Update the React Native parent app on `feat/parent-native-android` to make assessment viewing clearer, shorten pages, and remove completed home questions from the editable list.

- Read `AI_CONTEXT.md`, `AGENTS.md`, `PARENT_NATIVE_ANDROID_AUDIT.md`, and the app's `RELEASE_VERIFICATION.md` before implementation. Inspect current source and Git status; preserve existing work.
- Restrict implementation edits to `mobile/parent-native-android`, plus concise updates to `AI_CONTEXT.md` and `AI_CONTEXT_HISTORY.md`.
- Keep `frontend/`, `backend/`, `mobile/parent-android`, `main`, and `feat/parent-android-app` untouched. The pre-existing untracked `mobile/parent-android/` directory must remain untouched and must not be staged.
- Do not call Render, Vercel, or Supabase tools. No backend API, database, scoring, or stored-draft format changes.
- Preserve all eight granular permissions, RAM-only access tokens, encrypted refresh cookies, manual-only drafts, revision-safe cleanup, Socket.IO messaging, and pull-to-refresh.
- Reuse existing components and dependencies. Before finalizing the diff, review: "Did this change introduce unnecessary abstractions, extra state, or new dependencies that existing code already handles?"

## 2. Implementation changes

### ECCD Checklists: read-only filtering and ordering

- Add **All / DI-KAYA / KAYA** filters, defaulting to **All**.
- Within each domain, show DI-KAYA indicators first, KAYA next, then unmarked or restricted indicators. Preserve original question numbers and checklist sequence within each group.
- Apply existing answer-visibility permissions before filtering, counting, or ordering. Hidden answers must never influence visible counts or reveal whether a restricted question is KAYA or DI-KAYA.
- With All selected, retain restricted/unmarked rows after visible marked rows. With DI-KAYA or KAYA selected, include only permitted answers matching that filter.
- Hide domains without matches when filtering; show a clear empty state if no permitted indicators match.
- Keep checklist marks independent of PRE/MID/POST score release. Preserve the existing limited visibility of the parent's own eligible home observations.
- Keep this page strictly read-only; filters must not change answers or enable editing.

### Overview: real, permission-aware assessment highlights

- Populate **Excels In** and **Needs Support In** from `GET /api/eccd/parent/dashboard-stats/{studentId}` using its real aggregates across **both home-based and school-based questions in the latest recorded period**.
- Preserve latest-period precedence: **POST > MID > PRE**. Do not combine periods or fall back to older released results when the latest period is locked.
- Require the corresponding teacher-controlled period permission and the API's published state before displaying aggregates. Continue honoring active adviser eligibility and access revocation.
- Keep home-editing permission and individual-mark visibility independent of these aggregate release controls. Do not recompute highlights from the Overview home form or from a partially visible checklist.
- Preserve server calculations, alphabetical tie-breaking, and all-passed/mastery states.
- Refresh through existing polling and pull-to-refresh. Show **"Locked by teacher"** when restricted and an accurate empty state when assessment data does not exist.

### Overview: Assess Home-Based Questions

- Rename **Home-Based Observations** to **Assess Home-Based Questions**, including its accessibility label.
- Make the whole collapsed card tappable, including the title, whitespace, and arrow. Tapping toggles the domain list. Keep answer controls inside the expanded content independent of the outer toggle, so answering or opening a domain does not collapse the assessment.
- Keep the initial collapsed state, child/period isolation, and existing domain accordions.
- Remove the introductory slogan and the always-visible draft explanation, including the redundant local-draft footer description.
- Use exactly one instructional sentence: **"Choose KAYA or DI-KAYA for each home-based question, then tap Submit Observations."**
- Retain the existing **Submit Observations** button and confirmation. Do not add per-question or per-domain save buttons; parents may submit any answered subset.
- After confirmed HTTP 200/201 saving, remove the submitted questions from that period's editable list. Hide a domain once no unanswered home questions remain. Show **"All home observations submitted"** when none remain, and omit the submit action when there is nothing left to submit.
- Use server `parent_locked[period]` flags plus confirmed submitted question IDs so a failed follow-up refresh cannot bring confirmed rows back. Scope confirmation state to the current account, child, and period; do not invent answers, scores, attribution, or timestamps.
- Selecting an answer or storing a local draft must never hide a question. Network failures and rejected submissions preserve questions and drafts for manual retry.
- Keep all global, section-period, and question lock checks. A closed window or revoked permission must not be presented as successful completion.
- Saved assessments remain in the database and available in the read-only ECCD page when permitted. Hiding completed editor rows must not delete saved records or unrelated/newer drafts.
- Retain revision-safe draft cleanup, manual-only submission, storage errors, and backend rejection messages. On network failure, retain the exact warning: **"Your draft is saved on this device. Reconnect and submit again."**
- Never auto-submit on launch, refresh, reconnection, child selection, or period changes.

### Header, page descriptions, and lock wording

- Remove the header message icon beside Logout. Keep the bottom **Messages** tab, unread badge, and existing messaging behavior.
- Remove decorative descriptions beneath page and section titles, including Overview greetings, ECCD, Child Information, Insights, and redundant card descriptions.
- Preserve meaningful field labels, validation errors, connection status, save confirmations, failure warnings, and ML interpretation/research notices.
- Display **"Locked by teacher"** for permission and editing-window restrictions throughout the native portal, replacing release placeholders such as "Pending Adviser Release" and "Results Pending Adviser Release" in native presentation.
- Keep genuine states distinct: pending child-link approval, not-yet-evaluated assessments, incomplete PRE readiness, network errors, and confirmed submissions must not be mislabeled as teacher locks.
- Change native presentation only; preserve backend response values and website wording.

## 3. Interfaces and tests

No public API, database, or stored-draft envelope changes are required. Extend only the internal home-submission service result to identify confirmed question IDs; preserve its existing error handling and owner/revision checks.

Add focused tests for:

1. All / DI-KAYA / KAYA filtering, DI-KAYA-first ordering, stable original numbering, empty domains, and permission-safe counts with masked answers.
2. Overview highlight presentation using mixed home/school aggregate fixtures, latest-period release gates, no fallback from locked latest results, permission revocation, and no-data/all-passed states.
3. Partial home saves: only confirmed questions disappear; completed domains disappear; other periods and children remain unaffected.
4. Confirmed-row removal when a follow-up refresh fails or returns stale data; merely selecting or drafting answers does not remove rows.
5. Network/rejection retention, revision-safe cleanup, newer-edit preservation, and no automatic replay or submission.
6. Whole-card expansion and independent inner controls during phone acceptance; bottom Messages navigation retains unread information after removing the header icon.

Run `pnpm.cmd exec tsc --noEmit` and `pnpm.cmd test` inside `mobile/parent-native-android`, then the existing native tests. Confirm pull-to-refresh never submits drafts or triggers predictions. Do not run unrelated frontend/backend suites or production-data tests for this native-only change.

## 4. Release and acceptance

- Increment the Android release to **1.2.3 / version code 6**, provided the current source remains at 1.2.2 / code 5; if another release has landed, use the next unused version code.
- Rebuild the standalone release APK using the existing external signing configuration and keystore:
  `C:\Users\user\AMES-Android-Keys\parent-native-android\ames-parent-native-release-backup.jks`.
- Keep all signing credentials outside tracked Git files. Reuse the existing release identity; do not uninstall or clear app data during phone upgrade testing.
- Run native release tests and `assembleRelease`. Verify signature with SDK build-tools `36.0.0\apksigner.bat` and alignment with `zipalign.exe -c -P 16 4` under `C:\Users\user\.bubblewrap\android_sdk\build-tools`.
- Update app release/acceptance documentation and the two root context files concisely. Distinguish executed automated checks from pending physical-device acceptance.
- Confirm no new changes in protected folders or refs, preserving the pre-existing untracked older Android directory. Commit only the authorized implementation and documentation on `feat/parent-native-android`.
- Report the commit, verification results, and exact signed APK path. Expected output:
  `mobile/parent-native-android/android/app/build/outputs/apk/release/app-release.apk`.

Phone acceptance covers checklist filters, full-card expansion, independent domain/answer controls, disappearing confirmed rows, failed-refresh retention, period/child switching, compact pages, teacher-lock wording, and bottom-tab unread messaging. Physical-device behavior remains unverified until those checks are performed.

## 5. Confirmed defaults

- Checklist initially shows **All**, with **DI-KAYA first within each domain**.
- Overview highlights use the **latest period's home-based and school-based answers**, governed by existing teacher release controls.
- Keep the existing manual submission action; add no separate question/domain save buttons.
- This document retains the agreed implementation requirements. Executed release evidence is in RELEASE_VERIFICATION.md; phone acceptance remains pending.
