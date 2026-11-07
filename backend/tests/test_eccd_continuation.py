"""Overflow questions retain marks and print layouts in downloads and preview."""
from datetime import date, datetime, timezone
from copy import copy
from io import BytesIO
from zipfile import ZipFile

import openpyxl
import pytest

from backend.models import EccdDomain, EccdQuestion, StudentEccdEvaluation, Student
from backend.models.eccd import EccdAnswer, TestingPeriod as Period
from backend.tests import test_eccd_card_exports as fixtures
from backend.utils.checklist_workbook import DOMAIN_CAPACITIES, get_mapping
from backend.utils.excel import student_workbook, summary_workbook, workbook_bytes
from backend.utils.workbook_preview import worksheet_preview


def question_cell(sheet, question_text):
    return next(cell for row in sheet for cell in row if cell.value == question_text)


def add_custom(cohort, domain_id=8, count=5):
    cohort.db.add(EccdDomain(domain_id=domain_id, domain_name=f'Custom domain {domain_id}'))
    for index in range(count):
        cohort.db.add(EccdQuestion(question_id=domain_id * 1000 + index, domain_id=domain_id,
                                  sequence_order=index * 2 + 1, question_text=f'Custom {domain_id}/{index}'))
    cohort.db.commit()


@pytest.fixture
def cohort():
    case = fixtures.EccdCardExportTests()
    case.setUp()
    try:
        yield case
    finally:
        case.doCleanups()


def add_extras(cohort, count=1):
    timestamp = datetime(2026, 11, 7, tzinfo=timezone.utc)
    for domain_id, capacity in DOMAIN_CAPACITIES.items():
        for offset in range(count):
            question_id = 1000 + domain_id * 100 + offset
            cohort.db.add(EccdQuestion(question_id=question_id, domain_id=domain_id,
                sequence_order=capacity + offset + 1, question_text=f'Extra {domain_id}/{offset}', is_home_based=True))
            for index, period in enumerate(Period):
                when = date(2026, 8 + index, 1)
                cohort.db.add(StudentEccdEvaluation(student_id=1, question_id=question_id,
                    testing_period=period, answer=EccdAnswer.DI_KAYA if index == 1 else EccdAnswer.KAYA,
                    evaluation_date=when, teacher_evaluation_date=when,
                    parent_submitted_at=timestamp, teacher_marked_at=timestamp))
    cohort.db.commit()


def test_overflow_marks_on_every_domain_and_preview(cohort):
    add_extras(cohort)
    workbook = student_workbook(cohort.db, cohort.db.get(Student, 1))
    try:
        assert workbook.sheetnames == ['CHECKLIST']
        sheet = workbook['CHECKLIST']
        for domain_id, capacity in DOMAIN_CAPACITIES.items():
            assert get_mapping(domain_id, capacity) is not None
            assert get_mapping(domain_id, capacity + 1) is None
            cell = question_cell(sheet, f'Extra {domain_id}/0')
            assert cell.row > 69
            assert sheet.cell(cell.row, cell.column - 1).value == capacity + 1
            assert [sheet.cell(cell.row, cell.column + offset).value for offset in range(2, 8)] == ['\u00fc', None, None, '\u00fc', '\u00fc', None]
            assert 'teacher_marked_at:' in sheet.cell(cell.row, cell.column + 2).comment.text
            assert copy(cell._style) == copy(sheet['B36']._style)
            assert sheet.cell(cell.row - 2, cell.column + 2).value == 'PRETEST'
            assert sheet.cell(cell.row + 13, cell.column).value == 'ISKOR'
            assert sheet.cell(cell.row + 13, cell.column + 2).value == 2
        assert [item.id for item in sheet.row_breaks.brk] == [33, 69, 90, 111]
        assert sheet.print_area.endswith('$AD$132')
        # The old first overflow slot in GM is its raw-score total, never question text.
        assert isinstance(workbook['CHECKLIST']['D49'].value, int)
        assert workbook['CHECKLIST']['B37'].value is None  # Unconfigured question text is blank.
        reopened = openpyxl.load_workbook(BytesIO(workbook_bytes(workbook)))
        reopened.close()
    finally:
        workbook.close()
    response = cohort.client.get('/api/eccd/card-preview/1')
    assert response.status_code == 200
    html = response.json()['html']
    assert html.count('<!doctype html>') == 1
    for domain_id in DOMAIN_CAPACITIES:
        assert f'Extra {domain_id}/0' in html


def test_multiple_pages_retain_all_questions_rosters_and_whole_domain_totals(cohort):
    add_extras(cohort, 27)
    student = cohort.db.get(Student, 1)
    checklist = student_workbook(cohort.db, student)
    summary = summary_workbook(cohort.db, student.section, [student])
    try:
        for domain_id, code in enumerate(('GM', 'FM', 'SH', 'RL', 'EL', 'C', 'SE'), 1):
            sheet = checklist['CHECKLIST']
            cells = [question_cell(sheet, f'Extra {domain_id}/{offset}') for offset in range(27)]
            assert [sheet.cell(cell.row, cell.column - 1).value for cell in cells] == list(range(DOMAIN_CAPACITIES[domain_id] + 1, DOMAIN_CAPACITIES[domain_id] + 28))
            assert len({cell.column for cell in cells}) == 3
            pages = [sheet for sheet in summary if sheet.title.startswith(f'{code}F_')]
            texts = []
            for sheet in pages:
                texts.extend(cell.value for cell in sheet[6] if isinstance(cell.value, str) and cell.value.startswith('Extra '))
                starts = [cell.column for cell in sheet[5] if cell.value == 'No.']
                for start in starts:
                    assert sheet.cell(9, start + 1).value == 'STUDENT, SAVED'
                    assert sheet.cell(3, start).value == '2026-2027'
                source = summary[code + 'F']
                assert sheet.page_setup == source.page_setup
                assert sheet.page_margins == source.page_margins
                assert sheet.row_breaks == source.row_breaks
                assert sheet.col_breaks == source.col_breaks
                assert sheet.print_area.split('!')[1] == source.print_area.split('!')[1]
                assert sheet.merged_cells == source.merged_cells
                totals = [cell.column for cell in sheet[6] if cell.value == 'RAW SCORE (WHOLE DOMAIN)']
                assert [sheet.cell(9, column).value for column in totals] == [28, 1, 28]
            assert sorted(texts) == sorted(f'Extra {domain_id}/{offset}' for offset in range(27))
            first = pages[0]
            first_column = next(cell.column for cell in first[5] if cell.value == DOMAIN_CAPACITIES[domain_id] + 1)
            assert [first.cell(9, first_column + offset).value for offset in range(6)] == [1, None, None, 1, 1, None]
        reopened = openpyxl.load_workbook(BytesIO(workbook_bytes(summary)))
        reopened.close()
    finally:
        checklist.close()
        summary.close()


def test_custom_domain_and_formula_text_are_exported_as_text(cohort):
    cohort.db.add(EccdDomain(domain_id=8, domain_name='Custom domain'))
    cohort.db.add(EccdQuestion(question_id=800, domain_id=8, sequence_order=1,
                              question_text='=HYPERLINK("example.com")'))
    cohort.db.commit()
    student = cohort.db.get(Student, 1)
    checklist = student_workbook(cohort.db, student)
    summary = summary_workbook(cohort.db, student.section, [student])
    try:
        cell = question_cell(checklist['CHECKLIST'], '=HYPERLINK("example.com")')
        assert cell.data_type == 's'
        assert cell.row > 69
        assert checklist.sheetnames == ['CHECKLIST']
        assert summary['D8F_2']['C6'].data_type == 's'
        assert summary['D8F_2']['C6'].value == '=HYPERLINK("example.com")'
    finally:
        checklist.close()
        summary.close()


def test_custom_ratios_partial_unassessed_and_official_scores_stay_unchanged(cohort):
    baseline = student_workbook(cohort.db, cohort.db.get(Student, 1))
    baseline_bytes = workbook_bytes(baseline)
    baseline.close()
    baseline = openpyxl.load_workbook(BytesIO(baseline_bytes))
    summary_before = summary_workbook(cohort.db, cohort.db.get(Student, 1).section, [cohort.db.get(Student, 1)])
    add_custom(cohort)
    timestamp = datetime(2026, 11, 7, tzinfo=timezone.utc)
    for period, answers in ((Period.PRE, ['KAYA', 'KAYA', 'KAYA', 'DI-KAYA', 'DI-KAYA']),
                            (Period.MID, ['DI-KAYA', 'KAYA'])):
        for index, answer in enumerate(answers):
            cohort.db.add(StudentEccdEvaluation(student_id=1, question_id=8000 + index,
                testing_period=period, answer=EccdAnswer(answer), evaluator_role='parent' if index % 2 else 'teacher',
                evaluation_date=date(2026, 7, 7), teacher_evaluation_date=None if index % 2 else date(2026, 7, 7),
                parent_submitted_at=timestamp if index % 2 else None,
                teacher_marked_at=None if index % 2 else timestamp))
    cohort.db.commit()
    # Exercise the actual teacher download rather than only the workbook utility.
    response = cohort.client.get('/api/eccd/export/card-single?student_id=1&school_year=2026-2027')
    assert response.status_code == 200
    workbook = openpyxl.load_workbook(BytesIO(response.content))
    summary_after = summary_workbook(cohort.db, cohort.db.get(Student, 1).section, [cohort.db.get(Student, 1)])
    try:
        assert workbook.sheetnames == ['CHECKLIST']
        sheet = workbook['CHECKLIST']
        for row in baseline['CHECKLIST'].iter_rows(max_row=69, max_col=30):
            for original in row:
                exported = sheet[original.coordinate]
                assert exported.value == original.value, original.coordinate
                assert copy(exported._style) == copy(original._style), original.coordinate
                assert exported.comment == original.comment
        assert {str(region) for region in baseline['CHECKLIST'].merged_cells} <= {str(region) for region in sheet.merged_cells}
        assert sheet.page_setup == baseline['CHECKLIST'].page_setup
        assert sheet.page_margins == baseline['CHECKLIST'].page_margins
        assert [sheet.cell(89, column).value for column in (4, 6, 8)] == ['3/5', '1/5', '—']
        assert all(sheet.cell(89, column).data_type == 's' for column in (4, 6, 8))
        assert [sheet.cell(76 + index, 1).value for index in range(5)] == [1, 3, 5, 7, 9]
        assert sheet['D76'].comment and 'teacher_marked_at:' in sheet['D76'].comment.text
        assert sheet['D77'].comment and 'parent_submitted_at:' in sheet['D77'].comment.text
        assert sheet['D76'].comment.text.endswith('+08:00')
        assert sheet['F78'].value is None and sheet['G78'].value is None
        assert sheet['A91'].value == 'Custom Domain Results — Supplementary'
        assert [sheet.cell(93, column).value for column in (1, 11, 14, 18, 22)] == [
            'Custom domain 8', 5, '3 KAYA / 5 answered', '1 KAYA / 2 answered', '—']
        for sheet_before in summary_before:
            for row in sheet_before:
                for cell in row:
                    assert cell.value == summary_after[sheet_before.title][cell.coordinate].value, (sheet_before.title, cell.coordinate)
        html = worksheet_preview(sheet)
        assert '3/5' in html and '1 KAYA / 2 answered' in html
        preview = cohort.client.get('/api/eccd/card-preview/1')
        assert preview.status_code == 200
        assert 'Custom Domain Results' in preview.json()['html']
    finally:
        baseline.close()
        workbook.close()
        summary_before.close()
        summary_after.close()


def test_multiple_custom_domains_and_supplementary_page_headers(cohort):
    for domain in range(8, 33):
        add_custom(cohort, domain, 27 if domain == 8 else 1)
    # Parent-only custom answers must have descriptive results even without official dates.
    cohort.db.add(StudentEccdEvaluation(student_id=1, question_id=8000, testing_period=Period.POST,
        answer=EccdAnswer.KAYA, evaluator_role='parent', evaluation_date=date(2026, 11, 7)))
    cohort.db.commit()
    workbook = student_workbook(cohort.db, cohort.db.get(Student, 1))
    try:
        sheet = workbook['CHECKLIST']
        for domain in range(8, 33):
            for index in range(27 if domain == 8 else 1):
                cell = question_cell(sheet, f'Custom {domain}/{index}')
                assert cell.row > 69
        for column in (4, 14, 24):
            assert sheet.cell(89, column).value == '—'
            assert sheet.cell(89, column + 4).value == '1/27'
        titles = [cell for row in sheet for cell in row if cell.value == 'Custom Domain Results — Supplementary']
        assert len(titles) >= 2
        assert sum(1 for row in sheet for cell in row if cell.value == '0 KAYA / 0 answered') == 0
        page_starts = [brk.id + 1 for brk in sheet.row_breaks.brk if brk.id >= 69]
        budget = sum(sheet.row_dimensions[row].height or 15 for row in range(34, 70))
        for index, start in enumerate(page_starts):
            end = page_starts[index + 1] if index + 1 < len(page_starts) else sheet.max_row + 1
            assert sheet.cell(start, 1).value.startswith('SCHOOL:')
            assert 'SCHOOL YEAR: 2026-2027' in sheet.cell(start, 1).value
            assert sheet.cell(start + 1, 1).value.startswith('STUDENT: Student, Saved')
            assert 'SECTION: Diamond' in sheet.cell(start + 2, 1).value
            assert sum(sheet.row_dimensions[row].height or 15 for row in range(start, end)) <= budget
        bounds = openpyxl.utils.cell.range_to_tuple(sheet.print_area)[1]
        assert bounds[3] >= max(cell.row for cell in titles) + 2
        reopened = openpyxl.load_workbook(BytesIO(workbook_bytes(workbook)))
        reopened.close()
    finally:
        workbook.close()


def test_custom_domains_in_zip_and_archived_checklists(cohort):
    add_custom(cohort)
    cohort.add_historical_cohort()
    for url, query in (('/api/eccd/export/cards-zip', '?section_id=1&school_year=2026-2027'),
                       ('/api/eccd/export/cards-zip', '?section_id=1&school_year=2025-2026')):
        response = cohort.client.get(url + query)
        assert response.status_code == 200
        with ZipFile(BytesIO(response.content)) as archive:
            for filename in archive.namelist():
                workbook = openpyxl.load_workbook(BytesIO(archive.read(filename)))
                try:
                    assert workbook.sheetnames == ['CHECKLIST']
                    assert question_cell(workbook['CHECKLIST'], 'Custom 8/4').row > 69
                    assert workbook['CHECKLIST']['D89'].value == '—'
                finally:
                    workbook.close()


@pytest.mark.parametrize(('answer', 'ratio'), [(EccdAnswer.KAYA, '1/5'), (EccdAnswer.DI_KAYA, '0/5')])
def test_custom_raw_results_need_no_official_date_or_birth_date(cohort, answer, ratio):
    add_custom(cohort)
    cohort.db.query(StudentEccdEvaluation).delete()
    cohort.db.get(Student, 1).date_of_birth = None
    cohort.db.add(StudentEccdEvaluation(student_id=1, question_id=8000, testing_period=Period.PRE,
        answer=answer, evaluator_role='parent', evaluation_date=date(2026, 11, 7)))
    cohort.db.commit()
    workbook = student_workbook(cohort.db, cohort.db.get(Student, 1))
    try:
        sheet = workbook['CHECKLIST']
        assert sheet['D89'].value == ratio
        assert sheet['D89'].data_type == 's'
        assert sheet['F89'].value == '—'
        assert sheet['N93'].value == f'{int(answer == EccdAnswer.KAYA)} KAYA / 1 answered'
        for coordinate in ('M3', 'N9', 'O9', 'N16', 'N17', 'M20'):
            assert sheet[coordinate].value is None
    finally:
        workbook.close()


def test_long_questions_expand_without_splitting_panels_across_pages(cohort):
    add_custom(cohort, count=30)
    for index, question in enumerate(cohort.db.query(EccdQuestion).filter_by(domain_id=8)):
        question.question_text = f'Long {index}: ' + 'continued question text ' * 20
    cohort.db.commit()
    workbook = student_workbook(cohort.db, cohort.db.get(Student, 1))
    try:
        sheet = workbook['CHECKLIST']
        budget = sum(sheet.row_dimensions[row].height or 15 for row in range(34, 70))
        starts = [brk.id + 1 for brk in sheet.row_breaks.brk if brk.id >= 69]
        for start, end in zip(starts, [*starts[1:], sheet.max_row + 1]):
            assert sum(sheet.row_dimensions[row].height or 15 for row in range(start, end)) <= budget
        assert len([cell for row in sheet for cell in row if isinstance(cell.value, str) and cell.value.startswith('Long ')]) == 30
    finally:
        workbook.close()
