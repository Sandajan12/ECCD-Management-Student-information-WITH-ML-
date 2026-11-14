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


def summary_pupils(cohort, count):
    workbook = summary_workbook(cohort.db, cohort.db.get(Section, 1), [cohort.db.get(Student, 1)])
    for name in ("PR", "M", "PO"):
        sheet = workbook[name]
        extra = max(0, count - 30)
        if extra:
            # Extend only this synthetic input; real Excel exports still batch at 30.
            for region in list(sheet.merged_cells):
                if region.min_row >= 44:
                    sheet.unmerge_cells(str(region))
            sheet.insert_rows(44, extra)
        for row in range(14, 14 + count):
            for column in (3, 7, 8, 9, 10, *range(11, 28)):
                sheet.cell(row, column).value = sheet.cell(14, column).value
            sheet.cell(row, 2).value = row - 13
            sheet.cell(row, 3).value = "123456789012"
            sheet.cell(row, 4).value = f"DELA CRUZ, NIÑA MARIA {row - 13}"
        sheet.cell(45 + extra, 8).value = count
    return workbook


def text_positions(pdf, page, text, font="report", exact=False):
    """Read actual PDF text coordinates (mm from top), without a new PDF dependency."""
    encoded = pdf.fonts[font].encode_text(text)[1:-4].encode("latin1")
    if exact:
        encoded = b"(" + encoded + b")"
    positions = []
    current_font = None
    for block in re.findall(rb"BT\s.*?\sET", page.contents.content_stream(), re.DOTALL):
        font_changes = re.findall(rb"/F(\d+) [\d.]+ Tf", block)
        if font_changes:
            current_font = int(font_changes[-1])
        if encoded in block and current_font == pdf.fonts[font].i:
            match = re.search(rb"([-\d.]+) ([-\d.]+) Td", block)
            assert match, block
            x, y = map(float, match.groups())
            positions.append((x / pdf.k, pdf.h - y / pdf.k))
    return positions


@pytest.mark.parametrize("count", [1, 26, 30, 32])
def test_summary_single_page_capacity_metadata_and_bottom_counts(cohort, count):
    workbook = summary_pupils(cohort, count)
    official_sheets = [workbook[name] for name in ("PR", "M", "PO")]
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
        assert len(rows) == count
        for index, values in enumerate(rows, 14):
            assert len(values) == 17
            assert values[1] == "123456789012"
            assert values[7:14] == [f"{sheet.cell(index, col).value} / {sheet.cell(index, col + 1).value}" for col in range(11, 25, 2)]
            assert values[14:] == [str(sheet.cell(index, col).value) for col in (25, 26, 27)]
        pdf.section_summary(sheet)
    assert len(pdf.pages) == 3
    assert_pdf(bytes(pdf.output()), True)
    for page, sheet, period in zip(pdf.pages.values(), official_sheets, ("PRETEST", "MID", "POSTTEST")):
        stream = page.contents.content_stream()
        for text, font in (("Apolinario Mabini Elementary School", "reportB"),
                           ("School Number: 136481", "reportB"),
                           (f"ECCD Section Summary — {period}", "reportB"),
                           ("Section: DIAMOND", "report"), ("School Year: 2026-2027", "report"),
                           ("Teacher: TEST TEACHER", "report"),
                           (f"Testing Date: {sheet['U8'].value:%m/%d/%Y}", "report")):
            positions = text_positions(pdf, page, text, font)
            assert len(positions) == 1, text
            assert positions[0][1] < 28, (text, positions)
        assert not text_positions(pdf, page, "School:")
        assert not text_positions(pdf, page, "<SCRIPT>SCHOOL</SCRIPT>")
        assert text_positions(pdf, page, "123456789012")
        for text in ("C R/S", "Total", "Scaled", "Std", "Score", "Interpretation"):
            assert text_positions(pdf, page, text, "reportB"), text
        for fragment in ("Total Sc", "aled", "Std Scor"):
            assert not text_positions(pdf, page, fragment, "reportB", exact=True), fragment
        counts_y = text_positions(pdf, page, "Interpretation counts (HA / SA / A / SD / D)")[0][1]
        assert 171 < counts_y < 175
        for index in range(1, count + 1):
            positions = text_positions(pdf, page, f"DELA CRUZ, NIÑA MARIA {index}", exact=True)
            assert len(positions) == 1
            assert 30 < positions[0][1] < counts_y - 5
        count_rows = [text_positions(pdf, page, label)[0][1] for label in ("Male", "Female", "Total")]
        assert count_rows[0] > counts_y + 6
        assert count_rows[1] - count_rows[0] == pytest.approx(4, abs=0.01)
        assert count_rows[2] - count_rows[1] == pytest.approx(4, abs=0.01)
        assert count_rows[2] < 192
        left = pdf.w - pdf.r_margin - 110
        for y, values in zip(count_rows, ([0, 0, 0, 0, count], [0] * 5, [0, 0, 0, 0, count])):
            for column, value in enumerate(values):
                assert any(abs(cell_y - y) < 0.01 and left + 110 * (2 + column) / 7 < x < left + 110 * (3 + column) / 7
                           for x, cell_y in text_positions(pdf, page, str(value), exact=True))
        footer_y = text_positions(pdf, page, "Exported ")[0][1]
        assert footer_y > count_rows[2] + 7
        assert re.search(rb"/F\d+ 7\.00 Tf", stream)
    assert [(sheet.title, [(cell.coordinate, cell.value, cell.style_id) for row in sheet for cell in row]) for sheet in workbook] == before
    # Domain tabs remain available to Excel but never become PDF pages.
    assert workbook.sheetnames == ["PR", "M", "PO", "GMF", "FMF", "SHF", "RLF", "ELF", "CF", "SEF"]
    assert all(not list(summary_tables(workbook[name])) for name in workbook.sheetnames[3:])


def test_summary_50_pupils_overflow_without_overlapping_counts_or_footer(cohort):
    workbook = summary_pupils(cohort, 50)
    pdf = ReportPDF("ECCD Section Summary", "Section: Diamond | School year: 2026-2027", True)
    pdf.set_compression(False)
    for name in ("PR", "M", "PO"):
        assert len(next(summary_tables(workbook[name]))[2]) == 50
        pdf.section_summary(workbook[name])
    assert len(pdf.pages) == 6
    assert_pdf(bytes(pdf.output()), True)
    pages = list(pdf.pages.values())
    for offset, period in zip((0, 2, 4), ("PRETEST", "MID", "POSTTEST")):
        period_pages = pages[offset:offset + 2]
        for page in period_pages:
            assert text_positions(pdf, page, f"ECCD Section Summary — {period}", "reportB")[0][1] < 24
            assert text_positions(pdf, page, "Teacher: TEST TEACHER")[0][1] < 28
            assert text_positions(pdf, page, "Interpretation", "reportB")[0][1] < 36
            assert text_positions(pdf, page, "Exported ")[0][1] > 198
        assert not text_positions(pdf, period_pages[0], "Interpretation counts")
        counts_y = text_positions(pdf, period_pages[1], "Interpretation counts")[0][1]
        assert 171 < counts_y < 175
        assert text_positions(pdf, period_pages[1], "Total")[0][1] < 192
        for index in range(1, 51):
            positions = [position for page in period_pages
                         for position in text_positions(pdf, page, f"DELA CRUZ, NIÑA MARIA {index}", exact=True)]
            assert len(positions) == 1, index
            assert 30 < positions[0][1] < counts_y - 5


def test_summary_long_names_repeat_headers_on_vertical_overflow(cohort):
    sheet = summary_pupils(cohort, 30)["PR"]
    for row in range(14, 44):
        sheet.cell(row, 4).value = "LONG LEARNER NAME " * 6
    pdf = ReportPDF("ECCD Section Summary", "Section: Diamond", True)
    pdf.set_compression(False)
    pdf.section_summary(sheet)
    assert len(pdf.pages) > 1
    assert_pdf(bytes(pdf.output()), True)
    for page in pdf.pages.values():
        assert text_positions(pdf, page, "ECCD Section Summary — PRETEST", "reportB")
        assert text_positions(pdf, page, "Interpretation", "reportB")


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
