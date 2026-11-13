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
    assert "Supplementary skill — ñ" in str([table for sheet in summary for table in summary_tables(sheet)])
    assert_pdf(workbook_pdf(summary, title="ECCD Section Summary", scope="Section: Diamond | School year: 2026-2027 | PRE / MID / POST"), True)


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
