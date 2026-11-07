"""Domain summary marks and official scores through authorized export routes."""
from datetime import date
from io import BytesIO
from zipfile import ZipFile

import openpyxl
import pytest

from backend.models import EccdQuestion, Student, StudentEccdEvaluation, User
from backend.models.eccd import EccdAnswer, TestingPeriod as Period
from backend.tests import test_eccd_card_exports as fixtures
from backend.tests.test_checklist_workbook import SUMMARY_SHEETS


@pytest.fixture
def cohort():
    case = fixtures.EccdCardExportTests()
    case.setUp()
    try:
        yield case
    finally:
        case.doCleanups()


def test_all_domain_marks_periods_blocks_and_raw_scores(cohort):
    db = cohort.db
    db.get(Student, 3).school_year = "2025-2026"
    # Last items cross every horizontal page boundary and exercise all layouts.
    capacities = (13, 11, 27, 5, 8, 21, 24)
    db.add(Student(student_id=4, first_name="Girl", last_name="Zebra", middle_name="Mae", section_id=1,
                   school_year="2026-2027", is_active=True, gender="Female", date_of_birth=date(2021, 1, 1)))
    for domain_id, capacity in enumerate(capacities, 1):
        question_id = 100 + domain_id
        db.add(EccdQuestion(question_id=question_id, domain_id=domain_id, sequence_order=capacity,
                            question_text=f"Configured last skill {domain_id}", is_home_based=True))
        for index, period in enumerate(Period):
            when = date(2026, 8 + index, 2)
            db.add(StudentEccdEvaluation(student_id=4, question_id=question_id, testing_period=period,
                   answer=EccdAnswer.DI_KAYA if index == 1 else EccdAnswer.KAYA,
                   evaluation_date=when, teacher_evaluation_date=when if index < 2 else None,
                   evaluator_role="teacher" if index < 2 else "parent"))
    db.commit()
    teacher = cohort.client.get("/api/eccd/export/section-summary?section_id=1&school_year=2026-2027")
    assert teacher.status_code == 200
    cohort.user = db.get(User, 2)
    chairman = cohort.client.get("/api/chairman/sections/1/export-summary?schoolYear=2026-2027")
    assert chairman.status_code == 200
    for response in (teacher, chairman):
        workbook = openpyxl.load_workbook(BytesIO(response.content))
        assert workbook.sheetnames == SUMMARY_SHEETS
        for domain_index, name in enumerate(SUMMARY_SHEETS[3:]):
            sheet = workbook[name]
            blocks = [cell.column for cell in sheet[5] if cell.value == "No."]
            for start in blocks:
                assert sheet.cell(9, start).value == 1
                assert sheet.cell(10, start).value == 2
                assert sheet.cell(9, start + 1).value == "STUDENT, SAVED"
                assert sheet.cell(10, start + 1).value == "ZEBRA, GIRL M."
                assert sheet.cell(11, start + 1).value is None
                assert sheet.cell(2, start).value == "<SCRIPT>SCHOOL</SCRIPT>"
                assert sheet.cell(3, start).value == "2026-2027"
                assert sheet.cell(2, start + 16).value == "DIAMOND"
                assert sheet.cell(3, start + 16).value == "TEST TEACHER"
                for index in range(3):
                    assert sheet.cell(3, start + 30 + index * 3).value.date() == date(2026, 8 + index, 1)
            last = next(cell.column for cell in sheet[5] if cell.value == capacities[domain_index])
            assert sheet.cell(6, last).value == f"Configured last skill {domain_index + 1}"
            assert [sheet.cell(10, last + offset).value for offset in range(6)] == [1, None, None, 1, 1, None]
            assert [sheet.cell(10, 3 + offset).value for offset in range(6)] == [None] * 6
            totals = [cell.column for cell in sheet[6] if cell.value == "RAW SCORE"]
            for index, period_name in enumerate(("PR", "M", "PO")):
                assert sheet.cell(9, totals[index]).value == workbook[period_name].cell(14, 11 + domain_index * 2).value
                assert sheet.cell(10, totals[index]).value == workbook[period_name].cell(15, 11 + domain_index * 2).value
            assert sheet.cell(10, totals[2]).value is None  # Parent marks do not release official scores.
        workbook.close()


def test_domain_rosters_survive_zip_batching_and_archived_years(cohort):
    cohort.add_historical_cohort()
    for student_id in range(7, 38):
        cohort.db.add(Student(student_id=student_id, first_name="Extra", last_name=f"Child {student_id}",
                             section_id=1, school_year="2026-2027", is_active=True))
    cohort.db.commit()
    for year, count in (("2026-2027", 33), ("2025-2026", 2)):
        response = cohort.client.get(f"/api/eccd/export/section-summary?section_id=1&school_year={year}")
        assert response.status_code == 200
        contents = [response.content]
        if response.headers["content-type"] == "application/zip":
            with ZipFile(BytesIO(response.content)) as archive:
                assert len(archive.namelist()) == 2
                contents = [archive.read(name) for name in archive.namelist()]
        roster_count = 0
        for content in contents:
            workbook = openpyxl.load_workbook(BytesIO(content))
            expected = [workbook["PR"].cell(row, 4).value for row in range(14, 44)]
            roster_count += sum(name is not None for name in expected)
            for name in SUMMARY_SHEETS[3:]:
                sheet = workbook[name]
                for start in (cell.column for cell in sheet[5] if cell.value == "No."):
                    assert [sheet.cell(row, start + 1).value for row in range(9, 39)] == expected
                    assert sheet.cell(3, start).value == year
            workbook.close()
        assert roster_count == count


@pytest.mark.parametrize("parent_only", [True, False])
def test_marks_without_official_date_or_birth_do_not_invent_scores(cohort, parent_only):
    if parent_only:
        for record in cohort.db.query(StudentEccdEvaluation):
            record.teacher_evaluation_date = None
            record.evaluator_role = "parent"
    else:
        cohort.db.get(Student, 1).date_of_birth = None
    cohort.db.get(EccdQuestion, 1).question_text = "=SUM(1,1)"
    cohort.db.commit()
    response = cohort.client.get("/api/eccd/section/1/export")
    assert response.status_code == 200
    workbook = openpyxl.load_workbook(BytesIO(response.content))
    try:
        for name in SUMMARY_SHEETS[3:]:
            sheet = workbook[name]
            assert [sheet.cell(9, column).value for column in range(3, 9)] == [1, None, 1, None, 1, None]
            for cell in sheet[6]:
                if cell.value == "RAW SCORE":
                    assert sheet.cell(9, cell.column).value is None
            for cell in sheet[5]:
                if cell.value == "No.":
                    assert (sheet.cell(3, cell.column + 30).value is None) == parent_only
        assert workbook["GMF"]["C6"].value == "=SUM(1,1)"
        assert workbook["GMF"]["C6"].data_type == "s"
    finally:
        workbook.close()
