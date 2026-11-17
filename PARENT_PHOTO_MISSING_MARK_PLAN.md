# Warn when a photo has no assessment mark

Branch: `feat/parent-native-android`

Status: Implemented locally on 2026-11-17; verification recorded in AI_CONTEXT_HISTORY.md.

## Current behavior and intended change

Neither the parent website nor the native Android app submits a photo-only
question. When no questions are marked, submission stops with a general message.
However, marked questions can submit while another question's unmarked photo is
silently left behind as a local draft.

On both clients, **block the entire submission** when an editable question in the
selected period has a photo but no KAYA/DI-KAYA mark. This behavior was explicitly
selected by the user; do not offer a bypass that submits only the marked questions.

## Warning and navigation

- Show a modal titled **"Mark the questions with photos"** before the normal
  submission confirmation.
- Message: **"Some questions have a photo but no KAYA or DI-KAYA mark. Mark these
  questions or remove their photos before submitting. Your drafts are saved."**
- List every affected question with its domain, original question number,
  question text and **"Go to question"** button.
- Clicking the button closes the modal, expands the home form and target domain,
  scrolls to the question, and highlights its answer controls. Website navigation
  also moves keyboard focus to those controls.
- Closing the warning preserves everything and submits nothing. Parents must
  explicitly press Submit again after correcting the questions.

## Implementation

### Website

- Extend the existing assessment hook in
  [`useParentAssessment.ts`](frontend/src/hooks/useParentAssessment.ts) to inspect
  owner-scoped IndexedDB photos alongside current effective answers. Validate
  before showing confirmation and again before confirmed submission.
- Return the affected question metadata to
  [`HomeAssessmentForm.tsx`](frontend/src/components/parent/HomeAssessmentForm.tsx)
  for the modal and navigation. Reuse existing MUI dialogs, accordions and answer
  controls, with responsive layout and accessible labels.
- Detect photo-only questions even when there are no answered questions in their
  domain or anywhere in the form. Show this warning before the existing generic
  "answer at least one indicator" message.

### Native Android

- Add the same validation to
  [`HomeObservations`](mobile/parent-native-android/src/homeObservations.ts), with
  typed missing-mark details. Check before confirmation and enforce it again
  inside submission before uploads or pending-request changes.
- [`OverviewScreen.tsx`](mobile/parent-native-android/src/OverviewScreen.tsx)
  displays the warning and handles navigation into the target domain/question.
- Give the shared native `Screen` only the optional scroll/content refs needed
  to measure and scroll to the expanded row. Use the installed React Native
  scroll/content ref interfaces and wait for the expanded row's layout before
  scrolling. Preserve existing callers and current uncommitted changes in
  [`ui.tsx`](mobile/parent-native-android/src/ui.tsx).

### Validation, compatibility and durability

- Scope warning/navigation state to account, child and testing period. Discard
  stale asynchronous results after switching scope.
- Check only currently editable home questions. Ignore saved, pending, accepted,
  hidden or restricted questions and drafts from other periods/accounts.
- Effective inherited KAYA counts as a mark; existing photo-eligibility
  restrictions remain separate. Do not force parents to replace inherited answers
  or classify an existing KAYA as missing.
- Preserve partial submissions without unmarked photos, photo-free answers,
  permission gates, draft revisions and manual-only submission.
- Block uploads and answer submissions for the entire batch until affected
  questions are marked or their photos are removed. Never clear drafts or
  automatically upload, retry or submit after correction/navigation/reconnection.
- No API, database, storage or dependency changes are needed.
- Update matching guidance in `AI_CONTEXT.md` and `AGENTS.md`; record dated actual
  verification results and limitations in `AI_CONTEXT_HISTORY.md`.
- Refresh relevant AST dependency mappings before modifying shared code. Review
  the proposed diff with the Ponytail checkpoint: "Did this change introduce
  unnecessary abstractions, extra state, or new dependencies that existing code
  already handles?"

## Targeted verification

Cover these cases on both clients:

- Photo-only questions, both alone and alongside other marked questions.
- Multiple affected questions across different domains.
- Selecting a photo, marking the question, then removing its mark.
- Correcting the mark or removing the photo, followed by explicit submission.
- Photo-free partial submissions remaining valid.
- Reload retention and account/child/period isolation.
- Effective inherited KAYA and saved/pending/accepted/restricted questions.
- Changes while confirmation is open: revalidation must prevent uploads or answer
  submission when a question now has an unmarked photo.
- Zero upload/submission requests while blocked; all answers/photos remain saved.
- "Go to question" opening collapsed content and revealing the correct controls.

Update the existing native test that currently allows other questions to submit
while retaining a photo-only question: it must now expect the whole batch to be
blocked. Keep coverage proving unrelated/other-period drafts remain preserved.

Run from the repository root:

```powershell
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir mobile/parent-native-android exec tsc --noEmit
pnpm.cmd --dir mobile/parent-native-android test
pnpm.cmd --dir frontend exec playwright test --config playwright.parent-assessment.config.ts parent-assessment.spec.ts --grep "photo without mark"
```

Give the new browser cases the common title phrase `photo without mark` so that
the explicit selection runs only this feature's tests across the configuration's
desktop, tablet and mobile projects. Do not run full backend or Playwright suites.

## Boundaries and acceptance

- Stay on `feat/parent-native-android`; preserve all existing work, including
  unrelated uncommitted changes.
- No migrations, remote Render/Vercel/Supabase operations, pushes, main
  checkout/merge or edits to `mobile/parent-android`.
- Acceptance: on either client, pressing Submit with an unmarked photo opens the
  warning and makes no upload/submission request. Each listed button reveals its
  question. After marking the question or removing its photo, the normal explicit
  confirmation and submission flow works, preserving every remaining draft.

Implementation follows this plan. Native scrolling still needs real-device
acceptance; mocked UI tests cannot establish physical-device behavior. See
AI_CONTEXT_HISTORY.md for executed checks and their limits.
