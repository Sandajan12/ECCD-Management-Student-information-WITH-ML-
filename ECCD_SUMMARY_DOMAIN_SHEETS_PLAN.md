# Add seven domain sheets to ECCD summary exports

## Summary

Extend `backend/assets/templates/ECCD_Summary_Matrix_Template.xlsx` to contain these ten sheets, in order:

**PR, M, PO, GMF, FMF, SHF, RLF, ELF, CF, SEF**

Teacher and chairman downloads will populate every sheet with the selected section/year cohort. As confirmed, the added sheets include all students regardless of gender.

Source workbook: `backend/assets/templates/EasyCD-Checklist-2024-V3.-violet-FEMALE-2024-2025-.xlsx`.

## Implementation

- Copy the seven domain sheets from the supplied EasyCD workbook using the existing openpyxl dependency. Preserve formatting, merged cells, dimensions, print areas, and page breaks.
- Make the added template sheets blank: remove sample marks, student names, dates, raw scores, comments, and formulas referencing the omitted “Info Sheet.” Retain question headings and structural labels.
- Correct the repeated PRETEST labels in FMF’s three raw-score headings to PRE/MID/POST.
- Update `backend/assets/templates/manifest.json` with the template’s sheet list and SHA-256 hash.

Extend the shared summary generator in `backend/utils/excel.py`:

- Reuse the existing roster order, evaluation query, section/year filtering, adviser lookup, and 30-student batching.
- Populate rows 9–38 with student numbers and names in every repeated page block.
- Populate each block’s school, school year, section, adviser, and PRE/MID/POST testing dates. Use the same earliest official teacher-date rule as PR/M/PO.
- Match evaluations by domain ID, question sequence, and testing period. Derive answer columns from the numbered template headers because page layouts differ between domains.
- Write numeric `1` in the appropriate K or D cell, matching the source format. Unanswered cells remain blank.
- Include saved parent observations, consistent with existing checklist exports. Populate official raw scores only when the existing official-date and birth-date requirements permit scoring; reuse the current scorer.
- Update question text from configured questions for matching template positions.

The shared generator automatically covers teacher, chairman, compatibility, and ZIP downloads. API paths, query parameters, response formats, and database schemas remain unchanged.

## Verification

- Verify the blank asset has exactly ten sheets, no sample answers, and no references to omitted sheets.
- Test all seven domains, both answer values, all three periods, and questions spanning page breaks.
- Check mixed-gender rosters, repeated names/headers, unused rows, missing assessments, parent-only observations, and raw-score agreement with PR/M/PO.
- Exercise teacher and chairman endpoints, ownership restrictions, archived years, multiple sections, and cohorts exceeding 30 students.
- Update the existing three-sheet assertion and run relevant export/date/security regressions, followed by `uv run --no-project --python .venv312 python -m pytest backend/tests -q`.
- Review the diff for unnecessary abstractions, state, or dependencies. Explicitly ask: “Did this change introduce unnecessary abstractions, extra state, or new dependencies that existing code already handles?”

## Assumptions and limits

- The duplicated RLF means **ELF**, as confirmed.
- Only the seven named domain sheets are added.
- Existing scoring rules and fixed question capacities remain authoritative.
- No new dependencies or frontend changes are needed.
- This document records the implementation plan; creating it does not modify either workbook or implement the export changes.
