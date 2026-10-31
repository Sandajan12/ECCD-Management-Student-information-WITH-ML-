"""Card/template parity and section export access using isolated synthetic data."""
from datetime import date
from html.parser import HTMLParser
from io import BytesIO
from unittest import TestCase
from zipfile import ZipFile

from fastapi import FastAPI
from fastapi.testclient import TestClient
import openpyxl
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.config.database import get_db
from backend.models import Base, EccdDomain, EccdQuestion, Section, SectionTeacher, Student, StudentEccdEvaluation, SystemSettings, Teacher, User
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.models.user import UserRole
from backend.routes.chairman import router as chairman_router
from backend.routes.eccd import router as eccd_router
from backend.utils.deps import get_current_user
from backend.utils.excel import student_workbook
from backend.utils.workbook_preview import worksheet_preview


class PreviewCells(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.cells = {}
        self.coordinate = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == "td":
            self.coordinate = dict(attrs)["data-cell"]
            self.cells[self.coordinate] = ""

    def handle_data(self, data):
        if self.coordinate:
            self.cells[self.coordinate] += data

    def handle_endtag(self, tag):
        if tag == "td":
            self.coordinate = None


class EccdCardExportTests(TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.user = User(user_id=1, email="teacher@example.com", password_hash="unused", role=UserRole.ADMIN, is_active=True)
        self.db.add_all([
            self.user,
            User(user_id=2, email="chairman@example.com", password_hash="unused", role=UserRole.SUPER_ADMIN),
            User(user_id=3, email="parent@example.com", password_hash="unused", role=UserRole.USER),
            Teacher(teacher_id=1, user_id=1, first_name="Test", last_name="Teacher"),
            Section(section_id=1, section_name="Diamond"),
            Section(section_id=2, section_name="Other"),
            Section(section_id=3, section_name="Empty"),
            SectionTeacher(section_id=1, teacher_id=1, role="Primary Adviser", status="Active"),
            SystemSettings(id=1, school_name="<script>School</script>", principal_name="Test Principal", current_school_year="2026-2027"),
        ])
        for domain_id, name in enumerate(("Gross Motor", "Fine Motor", "Self-Help", "Receptive Language", "Expressive Language", "Cognitive", "Socio-Emotional"), 1):
            self.db.add(EccdDomain(domain_id=domain_id, domain_name=name))
            self.db.add(EccdQuestion(question_id=domain_id, domain_id=domain_id, question_text=f"Skill {domain_id}", sequence_order=1, is_home_based=False))
        self.db.add_all([
            Student(student_id=1, first_name="Saved", last_name="Student", section_id=1, school_year="2026-2027", is_active=True, date_of_birth=date(2021, 1, 1), gender="Male"),
            Student(student_id=2, first_name="Other", last_name="Section", section_id=2, school_year="2026-2027", is_active=True),
            Student(student_id=3, first_name="Archived", last_name="Student", section_id=1, school_year="2026-2027", is_active=False),
        ])
        for period, when in ((TestingPeriod.PRE, date(2026, 8, 1)), (TestingPeriod.MID, date(2026, 9, 1)), (TestingPeriod.POST, date(2026, 10, 1))):
            for question_id in range(1, 8):
                self.db.add(StudentEccdEvaluation(student_id=1, question_id=question_id, teacher_id=1, testing_period=period, answer=EccdAnswer.KAYA, evaluation_date=when, teacher_evaluation_date=when, evaluator_role="teacher"))
        self.db.commit()
        app = FastAPI()
        app.include_router(eccd_router)
        app.include_router(chairman_router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_preview_matches_card_renderer_across_periods_without_download(self):
        response = self.client.get("/api/eccd/card-preview/1")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertNotIn("content-disposition", response.headers)
        data = response.json()
        self.assertEqual(data["student_id"], 1)
        html = data["html"]
        cells = PreviewCells(html).cells
        workbook = student_workbook(self.db, self.db.get(Student, 1))
        self.addCleanup(workbook.close)
        for coordinate in ("W10", "W11", "V6", "V7", "V8", "Y28", "M3", "M4", "M5", "N9", "O9", "N16", "N17", "P16", "P17", "R16", "R17", "M20", "M21", "M22"):
            expected = workbook["CHECKLIST"][coordinate].value
            self.assertEqual(cells[coordinate], str(expected) if expected is not None else "", coordinate)
        self.assertEqual(cells["D36"], "\u2713")
        self.assertIn('colspan="2"', html)
        self.assertIn("&lt;SCRIPT&gt;SCHOOL&lt;/SCRIPT&gt;", html)
        self.assertNotIn("<SCRIPT>", html)

    def test_preview_for_missing_dates_does_not_invent_scores(self):
        records = self.db.query(StudentEccdEvaluation).all()
        for record in records:
            record.teacher_evaluation_date = None
            record.evaluator_role = "parent"
        self.db.commit()
        response = self.client.get("/api/eccd/card-preview/1")
        self.assertEqual(response.status_code, 200)
        cells = PreviewCells(response.json()["html"]).cells
        for coordinate in ("M3", "N9", "N16", "N17", "M20"):
            self.assertEqual(cells[coordinate], "")

    def test_preview_enforces_student_and_role_access(self):
        self.assertEqual(self.client.get("/api/eccd/card-preview/2").status_code, 403)
        self.assertEqual(self.client.get("/api/eccd/card-preview/999").status_code, 404)
        self.assertEqual(self.client.get("/api/eccd/card-preview/0").status_code, 422)
        self.user = self.db.get(User, 3)
        self.assertEqual(self.client.get("/api/eccd/card-preview/1").status_code, 403)

    def test_section_export_matches_chairman_template_and_excludes_inactive_and_other_sections(self):
        teacher = self.client.get("/api/eccd/section/1/export")
        self.assertEqual(teacher.status_code, 200)
        self.user = self.db.get(User, 2)
        chairman = self.client.get("/api/chairman/sections/1/export-summary")
        self.assertEqual(chairman.status_code, 200)
        teacher_book = openpyxl.load_workbook(BytesIO(teacher.content))
        chairman_book = openpyxl.load_workbook(BytesIO(chairman.content))
        self.addCleanup(teacher_book.close)
        self.addCleanup(chairman_book.close)
        self.assertEqual(teacher_book.sheetnames, ["PR", "M", "PO"])
        for sheet in teacher_book:
            self.assertEqual(sheet["D14"].value, "STUDENT, SAVED")
            self.assertIsNone(sheet["D15"].value)
            for row in sheet:
                for cell in row:
                    expected = chairman_book[sheet.title][cell.coordinate]
                    self.assertEqual((cell.value, cell.style_id), (expected.value, expected.style_id))

    def test_section_export_denies_foreign_empty_and_retired_assignments(self):
        for section_id in (2, 3):
            self.assertEqual(self.client.get(f"/api/eccd/section/{section_id}/export").status_code, 403)
        assignment = self.db.query(SectionTeacher).one()
        assignment.status = "Inactive"
        self.db.commit()
        self.assertEqual(self.client.get("/api/eccd/section/1/export").status_code, 403)
        self.assertEqual(self.client.get("/api/eccd/card-preview/1").status_code, 403)

    def test_section_export_keeps_all_students_and_school_year_cohorts(self):
        for student_id in range(4, 36):
            self.db.add(Student(student_id=student_id, first_name="Extra", last_name=str(student_id), section_id=1, school_year="2026-2027", is_active=True))
        self.db.add(Student(student_id=36, first_name="Previous", last_name="Year", section_id=1, school_year="2025-2026", is_active=True))
        self.db.commit()
        response = self.client.get("/api/eccd/section/1/export")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/zip")
        names = []
        with ZipFile(BytesIO(response.content)) as archive:
            self.assertEqual(len(archive.namelist()), 3)
            for filename in archive.namelist():
                workbook = openpyxl.load_workbook(BytesIO(archive.read(filename)))
                names.extend(workbook["PR"].cell(row, 4).value for row in range(14, 44) if workbook["PR"].cell(row, 4).value)
                workbook.close()
        self.assertEqual(len(names), 34)
        self.assertNotIn("STUDENT, ARCHIVED", names)
        self.assertNotIn("SECTION, OTHER", names)

    def test_renderer_escapes_values_and_retains_merge_geometry(self):
        workbook = openpyxl.Workbook()
        self.addCleanup(workbook.close)
        sheet = workbook.active
        sheet["A1"] = '<img src="https://example.com" onerror="alert(1)">'
        sheet.merge_cells("A1:B2")
        sheet.print_area = "A1:C3"
        html = worksheet_preview(sheet)
        self.assertIn('rowspan="2" colspan="2"', html)
        self.assertIn("&lt;img", html)
        self.assertNotIn("<img", html)
        self.assertNotIn('data-cell="B2"', html)
