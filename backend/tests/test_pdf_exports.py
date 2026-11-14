"""Local PDF export contracts using the existing isolated SQLite export fixture."""
from datetime import datetime, timezone
from io import BytesIO
import json
from pathlib import Path
import re
from zipfile import ZipFile

import pytest
import openpyxl

from backend.models import EccdDomain, EccdQuestion, Section, Student, StudentEccdEvaluation, User
from backend.routes.teachers import router as teachers_router
from backend.tests import test_eccd_card_exports as fixtures
from backend.utils.excel import student_workbook, summary_workbook, workbook_bytes
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
    ("/api/eccd/export/card-single?student_id=1&school_year=2026-2027", True),
    ("/api/eccd/export/section-summary?section_id=1&school_year=2026-2027", True),
    ("/api/eccd/section/1/export?school_year=2026-2027", True),
    ("/api/teachers/download/1?", True),
])
def test_teacher_pdf_response(cohort, path, landscape):
    response = cohort.client.get(path + "&format=pdf")
    assert response.status_code == 200, response.text[:200]
    assert response.headers["content-type"] == "application/pdf"
    assert '.pdf"' in response.headers["content-disposition"]
    assert_pdf(response.content, landscape)
    assert len(re.findall(rb"/Type /Page\b", response.content)) == (2 if "card-single" in path or "download/" in path else 3)


def test_pdf_bulk_archives_and_chairman_scope(cohort):
    cohort.add_historical_cohort()
    response = cohort.client.get("/api/eccd/export/cards-zip?section_id=1&school_year=2025-2026&format=pdf")
    assert response.status_code == 200
    with ZipFile(BytesIO(response.content)) as archive:
        assert set(archive.namelist()) == {"ARCHIVED_2025-2026.pdf", "ACTIVE_2025-2026.pdf"}
        for name in archive.namelist():
            assert_pdf(archive.read(name), True)
            assert len(re.findall(rb"/Type /Page\b", archive.read(name))) == 2
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


@pytest.mark.parametrize("path", [
    "/api/eccd/export/cards-zip?section_id=1&school_year=2026-2027",
    "/api/teachers/download-all?",
])
def test_teacher_bulk_two_page_pdfs_and_unchanged_excel(cohort, path):
    cohort.db.add(EccdDomain(domain_id=8, domain_name="Supplementary"))
    cohort.db.add(EccdQuestion(domain_id=8, sequence_order=1, question_text="Extra custom skill", is_home_based=True))
    cohort.db.query(StudentEccdEvaluation).first().teacher_marked_at = datetime(2026, 11, 13, 2, tzinfo=timezone.utc)
    cohort.db.commit()
    response = cohort.client.get(path + "&format=pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    stems = ["STUDENT_2026-2027", "STUDENT_2026-2027_3"] if "school_year" in path else ["STUDENT_2026-2027"]
    with ZipFile(BytesIO(response.content)) as archive:
        assert archive.namelist() == [name + ".pdf" for name in stems]
        for name in archive.namelist():
            content = archive.read(name)
            assert_pdf(content, True)
            assert len(re.findall(rb"/Type /Page\b", content)) == 2
    default = cohort.client.get(path)
    explicit = cohort.client.get(path + "&format=xlsx")
    assert default.status_code == explicit.status_code == 200
    with ZipFile(BytesIO(default.content)) as archive, ZipFile(BytesIO(explicit.content)) as other:
        assert archive.namelist() == other.namelist() == [name + ".xlsx" for name in stems]
        for name in archive.namelist():
            with ZipFile(BytesIO(archive.read(name))) as workbook, ZipFile(BytesIO(other.read(name))) as expected:
                assert workbook.read("xl/worksheets/sheet1.xml") == expected.read("xl/worksheets/sheet1.xml")
                assert b"Extra custom skill" in workbook.read("xl/worksheets/sheet1.xml")


def test_chairman_individual_pdf_and_excel_keep_existing_renderer(cohort, monkeypatch):
    from backend.utils import pdf as renderer
    monkeypatch.setattr(renderer, "teacher_checklist_pdf", lambda *args, **kwargs: pytest.fail("Teacher renderer used for Chairman"))
    cohort.user = cohort.db.get(User, 2)
    path = "/api/eccd/export/card-single?student_id=1&school_year=2026-2027"
    response = cohort.client.get(path + "&format=pdf")
    assert response.status_code == 200
    assert_pdf(response.content)
    default = cohort.client.get(path)
    explicit = cohort.client.get(path + "&format=xlsx")
    assert default.status_code == explicit.status_code == 200
    expected = openpyxl.load_workbook(BytesIO(workbook_bytes(student_workbook(cohort.db, cohort.db.get(Student, 1)))))
    for content in (default.content, explicit.content):
        actual = openpyxl.load_workbook(BytesIO(content))
        assert actual.sheetnames == expected.sheetnames
        assert [(cell.coordinate, cell.value, cell.style_id) for row in actual.active for cell in row] == [
            (cell.coordinate, cell.value, cell.style_id) for row in expected.active for cell in row]


def test_teacher_full_template_front_back_marks_scores_and_footer(cohort, monkeypatch):
    from backend.utils import pdf as renderer
    from backend.utils.checklist_workbook import get_mapping
    reference = json.loads((Path(__file__).parents[1] / "assets/reference/eccd.json").read_text(encoding="utf-8"))
    for item in reference["questions"]:
        question = cohort.db.query(EccdQuestion).filter_by(domain_id=item["domain_id"], sequence_order=item["sequence_order"]).first()
        if question:
            question.question_text = item["question_text"]
        else:
            question = EccdQuestion(domain_id=item["domain_id"], sequence_order=item["sequence_order"], question_text=item["question_text"], is_home_based=False)
            cohort.db.add(question)
            cohort.db.flush()
            for period, when in (("PRE", "2026-08-01"), ("MID", "2026-09-01"), ("POST", "2026-10-01")):
                cohort.db.add(StudentEccdEvaluation(student_id=1, question_id=question.question_id, teacher_id=1, testing_period=period,
                    answer="KAYA" if question.sequence_order % 2 else "DI-KAYA", evaluator_role="teacher",
                    evaluation_date=datetime.fromisoformat(when).date(), teacher_evaluation_date=datetime.fromisoformat(when).date()))
    cohort.db.commit()
    card = student_workbook(cohort.db, cohort.db.get(Student, 1))
    before = [(cell.coordinate, cell.value, cell.style_id) for row in card.active for cell in row]
    pdf = renderer.TeacherChecklistPDF("ECCD Individual Checklist", "Section: Diamond | School year: 2026-2027 | PRE / MID / POST", True)
    pdf.set_compression(False)
    monkeypatch.setattr(renderer, "TeacherChecklistPDF", lambda *args, **kwargs: pdf)
    rendered = []
    original = pdf.multi_cell
    def measure(w, h, text, *args, **kwargs):
        if not kwargs.get("dry_run") and kwargs.get("padding") == 0:
            rendered.append((pdf.page_no(), pdf.x, pdf.y, h * len(text.split("\n")), text))
            assert pdf.x + w < pdf.w - pdf.r_margin
            assert all(pdf.get_string_width(line) <= w + 0.01 for line in text.split("\n"))
        return original(w, h, text, *args, **kwargs)
    monkeypatch.setattr(pdf, "multi_cell", measure)
    content = renderer.teacher_checklist_pdf(card, scope=pdf.scope)
    assert_pdf(content, True)
    assert len(pdf.pages) == 2
    for heading in ("PRETEST", "MID", "POSTTEST", "KAYA", "DI-\nKAYA", "RAW\nSCORE", "SCALED\nSCORE"):
        assert any(text == heading for _, _, _, _, text in rendered), heading
    front, back = pdf.pages.values()
    assert text_positions(pdf, front, "SOCIAL-EMOTIONAL", "reportB")
    assert not text_positions(pdf, back, "SOCIAL-EMOTIONAL", "reportB")
    assert text_positions(pdf, front, "STUDENT, SAVED", "reportB")
    for label in ("GROSS MOTOR", "FINE MOTOR", "SELF-HELP", "RECEPTIVE LANGUAGE", "EXPRESSIVE LANGUAGE", "COGNITIVE"):
        assert text_positions(pdf, back, label, "reportB"), label
    for label in ("Parent / Teacher Remarks", "Teacher Signature"):
        assert text_positions(pdf, back, label)[0][1] > 175
    for number, x, y, height, text in rendered:
        assert x >= pdf.l_margin
        assert y + height < pdf.h - (35 if number == 2 else 18) + 0.01
    texts = [text.replace("\n", "").replace(" ", "") for _, _, _, _, text in rendered]
    for item in reference["questions"]:
        mapping = get_mapping(item["domain_id"], item["sequence_order"])
        value = str(card.active[f"{mapping['text']}{mapping['row']}"].value)
        assert value.replace(" ", "").replace("\n", "") in texts
    for coordinate in ("M3", "M4", "M5", "N9", "O9", "N16", "P16", "R16", "N17", "P17", "R17", "M20", "M21", "M22"):
        assert str(card.active[coordinate].value).replace(" ", "") in texts, coordinate
    assert sum(len(text_positions(pdf, page, "✓", exact=True)) for page in pdf.pages.values()) == 109 * 3
    for number, page in pdf.pages.items():
        assert text_positions(pdf, page, f"Page {number} of ")
        assert page.contents.content_stream().endswith((pdf.fonts["report"].encode_text("2") + " ET\n").encode("latin1"))
        assert text_positions(pdf, page, "Philippine Time (Asia/Manila, UTC+8)")
    assert [(cell.coordinate, cell.value, cell.style_id) for row in card.active for cell in row] == before


def test_teacher_custom_questions_and_timestamps_never_append_pages(cohort, monkeypatch):
    from backend.utils import pdf as renderer
    long_text = "Long edited official question, preserved in full. " * 120
    cohort.db.get(EccdQuestion, 1).question_text = long_text
    cohort.db.add(EccdDomain(domain_id=8, domain_name="Supplementary"))
    cohort.db.add(EccdQuestion(domain_id=8, sequence_order=1, question_text="Supplementary skill — ñ", is_home_based=True))
    cohort.db.query(StudentEccdEvaluation).first().teacher_marked_at = datetime(2026, 11, 13, 2, tzinfo=timezone.utc)
    cohort.db.commit()
    card = student_workbook(cohort.db, cohort.db.get(Student, 1))
    tables = list(checklist_tables(card.active, supplementary_only=True))
    assert "Supplementary skill — ñ" in str(tables)
    assert "teacher_marked_at" in str(tables)
    assert "Skill 1" not in str(tables)
    before = [(cell.coordinate, cell.value, cell.comment.text if cell.comment else None) for row in card.active for cell in row]
    pdf = renderer.TeacherChecklistPDF("ECCD Individual Checklist", "Section: Diamond | PRE / MID / POST", True)
    pdf.set_compression(False)
    monkeypatch.setattr(renderer, "TeacherChecklistPDF", lambda *args, **kwargs: pdf)
    monkeypatch.setattr(ReportPDF, "report_table", lambda *args, **kwargs: pytest.fail("Teacher appendix rendered"))
    content = renderer.teacher_checklist_pdf(card, scope=pdf.scope)
    assert_pdf(content, True)
    assert len(re.findall(rb"/Type /Page\b", content)) == len(pdf.pages) == 2
    for number, page in pdf.pages.items():
        assert text_positions(pdf, page, f"Page {number} of ")
        assert page.contents.content_stream().endswith((pdf.fonts["report"].encode_text("2") + " ET\n").encode("latin1"))
        for omitted in ("Supplementary", "Saved-mark timestamps", "teacher_marked_at", "See supplement"):
            assert not text_positions(pdf, page, omitted)
    assert text_positions(pdf, pdf.pages[2], "…")
    assert [(cell.coordinate, cell.value, cell.comment.text if cell.comment else None) for row in card.active for cell in row] == before



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
