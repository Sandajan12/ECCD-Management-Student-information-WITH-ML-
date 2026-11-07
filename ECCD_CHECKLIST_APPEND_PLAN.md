# Append checklist domains with separate custom scores

## Summary

New domains and questions will appear at the bottom of the student's main `CHECKLIST` sheet using the existing domain format.

For a new domain with five questions, its own result—such as **3 KAYA out of 5**—will appear in its ISKOR row and an appended custom-domain score table. These results will stay outside the original seven-domain scoring table, scaled totals and interpretation.

## Checklist layout

- Preserve original checklist cells, student details and score tables.
- Append overflow questions from existing domains first, followed by newly created domains. Include unanswered questions and preserve automatic ordering.
- Copy the Gross Motor block's headings, numbering, merged question cells, PRE/MID/POST KAYA and DI-KAYA columns, borders, fonts and ISKOR row.
- Use 13-question panels, filling appended pages left to right across the three existing panel positions. Continue larger domains across subsequent panels/pages.
- Repeat student, section and school-year identification on appended printed pages. Extend the print area and add page breaks.
- Replace generic `*_Extra_*` tabs with these appended sections. Individual downloads, section ZIPs, existing aliases and previews will share the same output.

## Custom-domain scores

- Count saved KAYA answers separately for PRE, MID and POST, including teacher and parent observations already visible in the staff checklist.
- Use the number of configured questions as the denominator, including unanswered questions. Count actual questions rather than the highest sequence number.
- Display `3/5` in the custom domain's ISKOR row. Repeated panels show the whole-domain result.
- Show `—` when a period has no recorded answers. Unanswered questions never count as DI-KAYA.
- Append a **Custom Domain Results — Supplementary** table after the domain sections. Include the domain name, question count, and KAYA/answered counts for each period so partial assessments are clear.
- Keep custom results outside scaled-score conversion, standard scores, interpretation and ML inputs. Custom questions must not block ML readiness or supply official assessment dates. Do not invent scoring tables or developmental labels.
- Preserve original-domain scoring behavior. Questions added to an original domain remain counted by the current scorer.

## Verification

- Download through the actual teacher endpoint and verify new domains/questions appear in `CHECKLIST`, without extra tabs.
- Test all seven original domains, multiple custom domains, numbering gaps and multi-panel/page continuation.
- For a five-question custom domain, test complete, partial and unanswered periods, mixed evaluator roles and independent PRE/MID/POST counts.
- Verify custom answers change only supplementary results; existing official score calculations remain unchanged for otherwise identical assessment data.
- Verify saved marks, timestamp comments, original cells, formatting, merged regions and print boundaries.
- Check individual downloads, ZIPs, archived cohorts and previews; run backend export regressions and existing teacher export browser tests.
- Inspect generated workbooks and appended print pages in native Excel.

## Boundaries

No migration, API shape change, renumbering or new dependency is needed. Existing assessments and summary Excel behavior remain preserved.

## Implementation

- The shared checklist generator appends copied Gross Motor panels in `CHECKLIST`; separate `*_Extra_*` checklist tabs are removed.
- Each appended page repeats school/year/student/section/adviser identification. Existing print settings remain, while print bounds and horizontal breaks extend for the new content. Long questions expand rows and use fewer filled slots when needed to keep panels together.
- Custom ISKOR ratios are stored as text, and the supplementary table shows actual configured and answered counts independently of official dates or birth dates.
- Official scoring and summary header dates use only standard-domain records. Staff and parent ML readiness and prediction inputs also exclude custom-domain questions, answers and dates. The existing conversion tables, formulas and summary sheet layouts are unchanged.
- Backend regressions cover teacher HTTP downloads, ZIPs and archived cohorts, all seven overflow domains, custom counts, partial and empty periods, sequence gaps, comments, styling, pagination and ML boundaries. Browser coverage includes the extended preview at desktop, tablet and mobile widths.

The task referred to `ECCD_CHECKLIST_APPEND_PLAN_2.md`; this checkout contains this plan file, which is the implementation reference together with the task requirements.

## Verification results — 2026-11-07

- Full active backend suite: **528 tests and 667 subtests passed**. Existing dependency deprecation and enum collection warnings remain.
- Requested workbook modules: **6 passed** with the specified verbose command.
- Teacher export browser suite: **33 passed** across desktop, tablet and mobile, including the appended preview and preserved drafts.
- Both frontend TypeScript projects, standalone browser-test typing, changed-file ESLint/Prettier and `git diff --check` passed.
- Native Excel opened the final synthetic workbook normally in read-only mode: **one CHECKLIST sheet and six printed pages**. The overflow and custom-domain print pages were inspected, including supplementary borders, marks and the literal `3/5` result.
- Review artifacts are in the ignored `frontend/test-results/eccd-append-verification/` folder: `checklist.xlsx`, `checklist.pdf`, `preview.html` and printed-page images.
- Checks used synthetic SQLite data and disposable PostgreSQL schemas. Existing school records, template assets and durable drafts were preserved.
