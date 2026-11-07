# Automatic question ordering with Excel continuation pages

## Summary

Remove the sequence input from ECCD Questions Management. Users enter the question; the server places it last in its domain.

Keep `sequence_order` internally because assessments and Excel exports depend on it. Both downloads will include continuation pages when questions exceed the existing template slots.

## Question management

- Remove the editable sequence field from Add/Edit Question. Keep the read-only ORDER column and add: “New questions are added at the end of this domain.”
- Assign new questions `highest existing sequence + 1`, starting at 1 for an empty domain. Never fill numbering gaps automatically.
- Editing text or home-based status preserves position. Moving a question through an existing API to another domain appends it there.
- Preserve question IDs, assessment links and existing positions. Deleting a question does not renumber the remaining questions.
- Preserve durable drafts, including older drafts containing a sequence value. Failed saves retain inputs and require manual retry.

## API and database

- Keep existing endpoints and response shapes. Make sequence optional in create/update requests for compatibility; accept legacy values but let the server control placement.
- Serialize number allocation by locking the destination domain during the transaction. Protect against duplicates with a unique domain/sequence index.
- Add explicit migration 017 to upgrade the existing index. Keep migration 014 compatible with its original and upgraded forms.
- Preflight reports existing duplicate domain/sequence groups and question IDs. Stop without changing records until conflicts are manually corrected, as previously selected.
- Register migration 017 in bootstrap and check it at startup. Do not apply it automatically.

## Excel continuation pages

The individual-checklist placement below has been superseded by
`ECCD_CHECKLIST_APPEND_PLAN.md`: continuation panels and supplementary custom
results now appear at the bottom of the main CHECKLIST sheet. The automatic
ordering, migration and summary continuation behavior remain in effect.

- Preserve the original checklist layout and the existing ten summary sheets. Bound their mappings to their actual slots so extra questions cannot overwrite totals or adjacent domains.
- **Individual checklist:** append printable continuation sheets by domain, with up to 25 additional questions per sheet. Include student/school/section/year identification, actual question numbers, question text and PRE/MID/POST K/D columns. Preserve answer timestamps as comments.
- **Summary workbook:** copy the relevant domain sheet layout for overflow groups, using that domain’s existing slot capacity. Continue the actual question numbers and repeat the cohort roster, metadata and period marks. Label repeated totals as totals for the whole domain.
- Preserve styles, merged cells, print areas and page settings when copying layouts. Generate continuation sheets only when needed.
- Include continuation content in the existing card preview without changing its JSON response shape.
- Preserve section/year filtering, archived cohorts, authorization and 30-student ZIP batching.

## Verification and defaults

- Test automatic appending, simultaneous additions, unchanged edit positions, domain moves, numbering gaps and legacy requests/drafts.
- Test migration preflight, repeatability and preservation of questions/evaluations.
- Test each domain at its template limit, one question beyond it and multiple continuation pages. Verify every question and mark appears exactly once in its intended slot.
- Check previews, provenance comments, print settings, archived exports and ZIP batches.
- Run backend tests, both frontend TypeScript checks and relevant browser suites on desktop/mobile.
- Keep current scoring formulas and assessment inclusion rules; changing how additional questions affect scoring is outside this change.
- No new dependencies or changes to school records during implementation verification. Existing unrelated Excel work remains preserved.

## Implementation status — 2026-11-07

Implemented and verified locally. Migration 017 was applied and checked on the
local development database; no duplicate groups were found and no existing
question numbers or school records were changed. Other databases require the
explicit migration documented in `backend/migrations/README.md` before startup.

- Full backend run: 520 tests and 667 subtests passed. The additional
  external-writer conflict regression passed separately, for 521 distinct tests.
- Browser checks: 34 passed, covering chairman/teacher ordering and draft recovery
  on desktop/mobile plus existing exports on desktop/tablet/mobile.
- Both frontend TypeScript projects, standalone browser-test typing, changed-file
  lint/formatting, production build and whitespace checks passed.
- Native Excel opened synthetic continuation workbooks normally in read-only
  mode: 8 checklist sheets and 17 summary sheets. Synthetic files are in the
  ignored `frontend/test-results/eccd-order-verification/` directory.
