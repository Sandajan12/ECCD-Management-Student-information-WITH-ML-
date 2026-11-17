# ECCD Assessment Rules and Flow Audit

Audit date: **2026-11-16**  
Reviewed branch: **feat/parent-native-android**  
Reviewed commit: **595a197**  
Status: **Review completed; no application code changed by this audit.**

## Outcome

The reviewed carry-forward flow matches the requested rules, including the user's
clarification to **preserve already-saved MID/POST answers** when a teacher corrects
an earlier parent answer. No mismatch was found in this reviewed flow. This is a
focused assessment review, not a claim that the entire ECCD system is bug-free.

Coverage includes the backend, teacher website, responsive parent website, and
native parent app source. `PARENT_HOME_OBSERVATION_REVIEW_PLAN.md` remains unapplied;
its proposed pending-review storage and Unsure option are outside this audit.

## Rules checked

| Scenario | Current behavior | Result |
| --- | --- | --- |
| Teacher saves PRE = KAYA for a question | MID/POST inherit KAYA and cannot be downgraded by teachers or parents. | Matches |
| PRE = DI-KAYA and teacher saves MID = KAYA | POST inherits KAYA and cannot be downgraded by teachers or parents. | Matches |
| Later-period KAYA is inherited without a save | It remains virtual, labeled `draft-not save`, until that period is explicitly submitted. | Matches |
| Parent saves home-based PRE = KAYA | Parent MID/POST inherit locked KAYA; teachers can override the unconfirmed parent source. | Matches |
| Parent saves home-based MID = KAYA | Parent POST inherits locked KAYA; teachers can override the unconfirmed parent source. | Matches |
| Teacher corrects unconfirmed parent KAYA to DI-KAYA | The correction is allowed. Changing a saved answer with parent history requires the existing correction confirmation. | Matches |
| Teacher corrects parent PRE to DI-KAYA and later answers are unsaved | Inheritance from that PRE disappears; parents can assess unanswered MID/POST when editing is permitted, unless another saved KAYA supplies a lock. | Matches |
| Teacher corrects parent PRE but MID/POST answers are already saved | Those answers remain saved and locked for parents. Teachers can review them separately under the existing rules. | Matches the user's clarification |
| An answer is inherited but not submitted | It does not enter saved scores, testing dates, exports, or completion counts. | Matches |

Carry-forward starts from **saved** answers. Selecting KAYA in an unsaved PRE or
MID draft does not create a saved carry-forward source.

## Important flow details

### Teacher confirmation and corrections

Saving a parent's KAYA unchanged as a teacher sets the official teacher/date
fields while preserving parent attribution. That answer is then teacher-confirmed
and locks later periods, even if `evaluator_role` still says `parent`.

The teacher override exemption applies to unconfirmed parent home answers. It
does not bypass an independent earlier teacher-marked or teacher-confirmed KAYA.
Corrections preserve `parent_id` and `parent_submitted_at`; changed teacher marks
record the actual teacher save timestamp.

### Already-saved later answers: confirmed user decision

The user selected **Keep saved answers** during this audit. For example:

1. A parent saves PRE = KAYA and MID = KAYA for one home question.
2. The teacher corrects PRE to DI-KAYA.
3. MID remains saved as KAYA and locked for the parent.
4. That saved MID KAYA still supplies locked, unsaved KAYA to POST.

If MID/POST were only virtual answers, correcting PRE removes that source without
deleting any saved records. Reassessment is needed only for unanswered periods
without another applicable KAYA source. No automatic reopening or deletion of
saved later-period answers was requested.

### Permissions, saving, grading, and dates

- Parent editing still requires eligible child access, the adviser permission,
  the section's period editing window, and per-question eligibility. Hidden marks
  remain protected; carry-forward does not bypass those gates.
- Teacher section-wide PRE/MID prerequisites remain in place. Parent home routes
  are not blocked by classmates' incomplete assessments.
- Each later period requires its own explicit submission. Parent drafts do not
  automatically submit on loading or reconnection. Native inherited rows remain
  in the home editing list until confirmed save; DI-KAYA is disabled.
- Website labels use a single-line style; native labels use `numberOfLines={1}`.
- Grading formulas and testing-date rules remain unchanged. Correcting a saved
  answer can change its calculated score; virtual answers cannot.
- Official teacher dates remain distinct from parent submission timestamps and
  grading preview dates. Existing PRE < MID < POST validation still applies.

## Source evidence

- [Backend carry-forward sources and downgrade guard](backend/utils/mastery.py)
- [Backend assessment reads, teacher corrections, and parent saves](backend/utils/assessments.py)
- [Official and grading date resolution](backend/utils/eccd_dates.py)
- [Teacher draft resolution](frontend/src/utils/eccdDrafts.ts)
- [Teacher assessment hook](frontend/src/hooks/useTeacherAssessment.ts)
- [Teacher checklist](frontend/src/pages/teacher/EccdAssessment.tsx)
- [Parent website assessment hook](frontend/src/hooks/useParentAssessment.ts)
- [Responsive parent home form](frontend/src/components/parent/HomeAssessmentForm.tsx)
- [Native manual home submission service](mobile/parent-native-android/src/homeObservations.ts)
- [Native home rows](mobile/parent-native-android/src/OverviewScreen.tsx)
- [Native permission policy](mobile/parent-native-android/src/policy.ts)
- [Native remaining-question filtering](mobile/parent-native-android/src/presentation.ts)

The existing Graphify dependency graph was consulted and relevant source callers
were inspected directly. An in-memory check also confirmed that a saved parent
MID KAYA remains a POST source after PRE is corrected to DI-KAYA.

## Verification executed during the audit

| Check | Result |
| --- | --- |
| Backend `test_home_assessment_locks.py`, excluding migration and backup cases | **11 passed, 2 deselected**, 2 deprecation warnings |
| Frontend `eccdDrafts.unit.ts` | **7 passed** |
| Focused teacher/parent carry-forward Playwright scenarios | **6 passed** across desktop, tablet, and 320px mobile |
| Native app Node test suite | **52 passed**, 7 suites |

Commands used for the targeted checks:

```powershell
# Executed after asserting the configured host was loopback and database was ames_parity_dev.
uv run --no-project --python .venv312 python -m pytest backend/tests/test_home_assessment_locks.py -q -k "not migration and not backup"

pnpm.cmd --dir frontend exec node --experimental-transform-types --test tests/unit/eccdDrafts.unit.ts

pnpm.cmd --dir frontend exec playwright test --config playwright.parent-assessment.config.ts --grep 'teacher checklist|saved KAYA prefills'

pnpm.cmd --dir mobile/parent-native-android test
```

The backend command was invoked through a Python wrapper that asserted the safe
database target before calling `pytest.main` with the listed arguments. Integration
fixtures created and removed uniquely named disposable local test schemas; live
school records were not used. No application migration was added or applied to
the operational schema.

Browser tests used synthetic API responses and the test RAM-session helper.
Native tests used Node and mocked native hosts. These results are not production
authentication acceptance or real-device verification. Full backend/browser
suites and TypeScript checks were not rerun for this audit.

## Delivery boundaries

- No application code, grading formula, date rule, or database schema changed.
- No APK was rebuilt or installed. The native findings describe current source;
  they do not establish that the installed APK contains these changes.
- No deployment, remote infrastructure call, push, merge, or branch switch occurred.
- The branch remained `feat/parent-native-android`; unrelated existing work and
  `mobile/parent-android` were left untouched.
