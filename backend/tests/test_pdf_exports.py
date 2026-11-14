"""Local PDF export contracts using the existing isolated SQLite export fixture."""
from datetime import datetime, timezone
from io import BytesIO
import re
from zipfile import ZipFile

import pytest

from backend.models import EccdDomain, EccdQuestion, Section, Student, StudentEccdEvaluation, User
from backend.routes.teachers import router as teachers_router
from backend.tests import test_eccd_card_exports as fixtures
from backend.utils.excel import student_workbook, summary_workbook
from backend.utils.pdf import ReportPDF, checklist_tables, summary_tables, workbook_pdf


@pytest.fixture
def cohort():
    fixture = fixtures.EccdCardExportTests()
    fixture.setUp()
    fixture.client.app.include_router(teachers_router)
    yield fixture
    fixture.doCleanups()


def assert_pdf(content, landscape=False):
    assert content.startswith(b"%PDF-")
    assert content.rstrip().endswith(b"%%EOF")
    offset = int(re.search(rb"startxref\s+(\d+)", content)[1])
    assert content[offset:].startswith(b"xref")
    width, height = map(float, re.search(rb"/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]", content).groups())
    assert (width > height) == landscape
    assert b"/Type /Page" in content


@pytest.mark.parametrize("path,landscape", [
    ("/api/eccd/export/card-single?student_id=1&school_year=2026-2027", False),
    ("/api/eccd/export/section-summary?section_id=1&school_year=2026-2027", True),
    ("/api/eccd/section/1/export?school_year=2026-2027", True),
    ("/api/teachers/download/1?", False),
])
def test_teacher_pdf_response(cohort, path, landscape):
    response = cohort.client.get(path + "&format=pdf")
    assert response.status_code == 200, response.text[:200]
    assert response.headers["content-type"] == "application/pdf"
    assert '.pdf"' in response.headers["content-disposition"]
    assert_pdf(response.content, landscape)
    if landscape:
        assert len(re.findall(rb"/Type /Page\b", response.content)) == 3


def test_pdf_bulk_archives_and_chairman_scope(cohort):
    cohort.add_historical_cohort()
    response = cohort.client.get("/api/eccd/export/cards-zip?section_id=1&school_year=2025-2026&format=pdf")
    assert response.status_code == 200
    with ZipFile(BytesIO(response.content)) as archive:
        assert set(archive.namelist()) == {"ARCHIVED_2025-2026.pdf", "ACTIVE_2025-2026.pdf"}
        for name in archive.namelist():
            assert_pdf(archive.read(name))
    cohort.user = cohort.db.get(User, 2)
    for path in ("/api/chairman/export-eccd?section=All", "/api/eccd/export-all?"):
        response = cohort.client.get(path + "&format=pdf")
        assert response.status_code == 200
        with ZipFile(BytesIO(response.content)) as archive:
            assert all(name.endswith(".pdf") for name in archive.namelist())
            for name in archive.namelist():
                assert_pdf(archive.read(name), True)
    response = cohort.client.get("/api/chairman/sections/1/export-summary?schoolYear=2025-2026&format=pdf")
    assert response.headers["content-type"] == "application/pdf"
    assert_pdf(response.content, True)
    assert len(re.findall(rb"/Type /Page\b", response.content)) == 3


def test_pdf_access_and_validation_match_excel(cohort):
    for path in (
        "/api/eccd/export/cards-zip?section_id=2&school_year=2026-2027",
        "/api/eccd/export/section-summary?section_id=3&school_year=2026-2027",
        "/api/eccd/export/card-single?student_id=2&school_year=2026-2027",
        "/api/chairman/export-eccd?section=All",
    ):
        assert cohort.client.get(path + "&format=pdf").status_code == 403
    assert cohort.client.get("/api/eccd/export/card-single?student_id=1&school_year=2025-2026&format=pdf").status_code == 400
    assert cohort.client.get("/api/eccd/export/card-single?student_id=1&school_year=2026-2027&format=html").status_code == 422
    cohort.user = cohort.db.get(User, 3)
    for path in (
        "/api/eccd/export/card-single?student_id=1&school_year=2026-2027",
        "/api/eccd/export/section-summary?section_id=1&school_year=2026-2027",
        "/api/eccd/export/cards-zip?section_id=1&school_year=2026-2027",
        "/api/chairman/sections/1/export-summary?schoolYear=All",
        "/api/teachers/download/1?",
        "/api/teachers/download-all?",
    ):
        assert cohort.client.get(path + "&format=pdf").status_code == 403


def test_pdf_tables_preserve_unicode_custom_questions_scores_and_timestamps(cohort):
    db = cohort.db
    db.get(Student, 1).first_name = "Niña"
    db.add(EccdDomain(domain_id=8, domain_name="Custom domain"))
    db.add(EccdQuestion(question_id=8, domain_id=8, sequence_order=1, question_text="Supplementary skill — ñ", is_home_based=True))
    record = db.query(StudentEccdEvaluation).first()
    record.teacher_marked_at = datetime(2026, 11, 13, 2, tzinfo=timezone.utc)
    db.commit()
    card = student_workbook(db, db.get(Student, 1))
    tables = list(checklist_tables(card.active))
    text = str(tables)
    assert "NIÑA" in text
    assert "Supplementary skill — ñ" in text
    assert "teacher_marked_at" in text
    assert "+08:00" in text
    assert "KAYA" in text
    assert_pdf(workbook_pdf(card, title="ECCD Individual Checklist", scope="Section: Diamond | School year: 2026-2027 | PRE / MID / POST", checklist=True))
    summary = summary_workbook(db, db.get(Section, 1), [db.get(Student, 1)])
    assert "Supplementary skill — ñ" in str([cell.value for sheet in summary for row in sheet for cell in row])
    assert "Supplementary skill — ñ" not in str([table for sheet in summary for table in summary_tables(sheet)])
    content = workbook_pdf(summary, title="ECCD Section Summary", scope="Section: Diamond | School year: 2026-2027 | PRE / MID / POST")
    assert_pdf(content, True)
    assert len(re.findall(rb"/Type /Page\b", content)) == 3


def test_summary_fits_30_pupils_per_period_without_changing_excel(cohort):
    workbook = summary_workbook(cohort.db, cohort.db.get(Section, 1), [cohort.db.get(Student, 1)])
    official_sheets = [workbook[name] for name in ("PR", "M", "PO")]
    for sheet in official_sheets:
        for row in range(14, 44):
            for column in (3, 7, 8, 9, 10, *range(11, 28)):
                sheet.cell(row, column).value = sheet.cell(14, column).value
            sheet.cell(row, 2).value = row - 13
            sheet.cell(row, 3).value = "123456789012"
            sheet.cell(row, 4).value = f"DELA CRUZ, NIÑA MARIA {row - 13}"
        sheet["H45"] = 30
    before = [(sheet.title, [(cell.coordinate, cell.value, cell.style_id) for row in sheet for cell in row]) for sheet in workbook]
    pdf = ReportPDF("ECCD Section Summary", "Section: Diamond | School year: 2026-2027 | PRE / MID / POST", True)
    pdf.set_compression(False)
    for sheet, period in zip(official_sheets, ("PRE", "MID", "POST")):
        tables = list(summary_tables(sheet))
        assert len(tables) == 1
        caption, headings, rows, _ = tables[0]
        assert caption == f"{period} — official section summary"
        assert headings == ["No.", "LRN", "Name of Pupils", "Sex", "Birthday", "Test Date", "Age",
                            "GM R/S", "FM R/S", "SH R/S", "RL R/S", "EL R/S", "C R/S", "SE R/S",
                            "Total Scaled", "Std Score", "Interpretation"]
        assert len(rows) == 30
        for index, values in enumerate(rows, 14):
            assert len(values) == 17
            assert values[1] == "123456789012"
            assert values[7:14] == [f"{sheet.cell(index, col).value} / {sheet.cell(index, col + 1).value}" for col in range(11, 25, 2)]
            assert values[14:] == [str(sheet.cell(index, col).value) for col in (25, 26, 27)]
        pdf.section_summary(sheet)
    assert len(pdf.pages) == 3
    assert_pdf(bytes(pdf.output()), True)
    regular, bold = pdf.fonts["report"], pdf.fonts["reportB"]
    for page, period in zip(pdf.pages.values(), ("PRE", "MID", "POST")):
        stream = page.contents.content_stream()
        for text in (f"{period} — official section summary", "DELA CRUZ, NIÑA MARIA 30",
                     "123456789012", "Interpretation counts (HA / SA / A / SD / D)",
                     "Male: 0 / 0 / 0 / 0 / 30", "Female: 0 / 0 / 0 / 0 / 0"):
            assert regular.encode_text(text)[1:-4].encode("latin1") in stream
        assert bold.encode_text("Interpretation")[1:-4].encode("latin1") in stream
        assert stream.count(regular.encode_text("<SCRIPT>SCHOOL</SCRIPT>")[1:-4].encode("latin1")) == 1
        assert re.search(rb"/F\d+ 7\.00 Tf", stream)
    assert [(sheet.title, [(cell.coordinate, cell.value, cell.style_id) for row in sheet for cell in row]) for sheet in workbook] == before
    # Domain tabs remain available to Excel but never become PDF pages.
    assert workbook.sheetnames == ["PR", "M", "PO", "GMF", "FMF", "SHF", "RLF", "ELF", "CF", "SEF"]
    assert all(not list(summary_tables(workbook[name])) for name in workbook.sheetnames[3:])


def test_summary_vertical_overflow_repeats_period_and_table_headers(cohort):
    workbook = summary_workbook(cohort.db, cohort.db.get(Section, 1), [cohort.db.get(Student, 1)])
    sheet = workbook["PR"]
    for row in range(14, 44):
        sheet.cell(row, 2).value = row - 13
        sheet.cell(row, 4).value = "LONG LEARNER NAME " * 20
    pdf = ReportPDF("ECCD Section Summary", "Section: Diamond | School year: 2026-2027", True)
    pdf.set_compression(False)
    pdf.section_summary(sheet)
    assert len(pdf.pages) > 1
    assert_pdf(bytes(pdf.output()), True)
    for page in pdf.pages.values():
        stream = page.contents.content_stream()
        assert pdf.fonts["report"].encode_text("PRE — official section summary")[1:-4].encode("latin1") in stream
    # Every continuation with pupils repeats the column headings.
    for page in list(pdf.pages.values())[:-1]:
        assert pdf.fonts["reportB"].encode_text("Interpretation")[1:-4].encode("latin1") in page.contents.content_stream()


def test_wrapping_repeated_headers_and_philippine_footer(monkeypatch):
    from backend.utils import pdf as renderer
    from backend.utils.eccd_dates import PHT
    monkeypatch.setattr(renderer, "now_pht", lambda: datetime(2026, 11, 13, 22, 15, tzinfo=PHT))
    pdf = ReportPDF("ECCD report", "Section: Diamond | School year: 2026-2027 | PRE / MID / POST", False)
    pdf.set_compression(False)
    pdf.report_table("Checklist", ["Student", "Skill"], [["Niña", "Long skill description " * 600]], (1, 4))
    content = bytes(pdf.output())
    assert_pdf(content)
    assert len(pdf.pages) > 1
    # Read the actual uncompressed page streams using the embedded font's encoding.
    regular = pdf.fonts["report"]
    bold = pdf.fonts["reportB"]
    for index, page in pdf.pages.items():
        stream = page.contents.content_stream()
        assert bold.encode_text("Student")[1:-4].encode("latin1") in stream
        assert regular.encode_text(f"Page {index} of ")[1:-4].encode("latin1") in stream
        assert stream.endswith((regular.encode_text(str(len(pdf.pages))) + " ET\n").encode("latin1"))
        assert regular.encode_text("2026-11-13 10:15 PM")[1:-4].encode("latin1") in stream
