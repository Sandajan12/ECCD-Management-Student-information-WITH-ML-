"""DepEd workbook import/export with protected student identity."""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
import posixpath
import re
from zipfile import ZipFile
from xml.parsers import expat

import openpyxl
from openpyxl.cell.cell import MergedCell
from openpyxl.utils.datetime import from_excel
from openpyxl.utils.cell import range_boundaries
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from backend.models import EccdQuestion, FamilyAccess, Parent, Section, SectionTeacher, Student, StudentEccdEvaluation, SystemSettings, Teacher, User
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.schemas.student import StudentCreate
from backend.schemas.operations import SectionMismatchResponse
from backend.schemas.common import validate_person_name
from backend.utils.access import authorize_student, current_teacher, get_active_adviser_for_student, resolve_student, teacher_sections
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores
from backend.utils.eccd_dates import get_official_testing_date, now_pht
from backend.utils.lrn import hash_lrn
from backend.utils.rollover import settings_record
from backend.utils.students import upsert_guardian

TEMPLATES = Path(__file__).resolve().parents[1] / "assets" / "templates"
DOMAIN_SHEETS = {1: "GM", 2: "FM", 3: "SH", 4: "RL", 5: "EL", 6: "C", 7: "SE"}
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MAX_XLSX_EXPANDED_BYTES = 50 * 1024 * 1024
MAX_XLSX_MEMBERS = 128
MAX_SHEET_ROWS = 2000
# EasyCD templates can style the entire Excel grid width. Keep XML bounds
# separate from the much smaller row tuples materialized by the importer.
MAX_SHEET_COLUMNS = 16_384
MAX_INFO_IMPORT_COLUMNS = 100
MAX_ASSESSMENT_IMPORT_COLUMNS = 256
MAX_WORKBOOK_CELLS = 250_000
MAX_WORKBOOK_SHEETS = 64


def validate_xlsx_resources(content: bytes) -> set[str]:
    """Reject expanded archives and sparse/forged sheet bounds before openpyxl."""
    total_read = cell_count = sheet_count = 0
    validated_members: set[str] = set()
    row_tag = "http://schemas.openxmlformats.org/spreadsheetml/2006/main}row"

    def check_range(reference: str) -> None:
        bounds = range_boundaries(reference)
        if any(value is None or value < 1 for value in bounds):
            raise ValueError("Invalid worksheet range")
        if bounds[2] > MAX_SHEET_COLUMNS or bounds[3] > MAX_SHEET_ROWS:
            raise HTTPException(413, "Excel worksheet exceeds the row or column limit.")

    try:
        with ZipFile(BytesIO(content)) as archive:
            members = archive.infolist()
            if len(members) > MAX_XLSX_MEMBERS or sum(item.file_size for item in members) > MAX_XLSX_EXPANDED_BYTES:
                raise HTTPException(413, "Excel archive exceeds the expanded size or member limit.")
            for member in members:
                if not member.filename.lower().endswith((".xml", ".rels")):
                    continue
                row_index = column_index = 0
                element_stack: list[str] = []
                sheet_ids: set[str] = set()
                worksheet_targets: set[str] = set()
                parser = expat.ParserCreate(namespace_separator="}")

                def reject_doctype(*args):
                    raise ValueError("XML document types are not supported")

                def start_element(tag, attributes):
                    nonlocal row_index, column_index, cell_count, sheet_count
                    parent_tag = element_stack[-1] if element_stack else None
                    element_stack.append(tag)
                    if tag == "http://schemas.openxmlformats.org/package/2006/relationships}Relationship" and attributes.get("Type", "").endswith("/worksheet"):
                        target = attributes["Target"]
                        base = posixpath.dirname(posixpath.dirname(member.filename))
                        target = posixpath.normpath(target.lstrip("/") if target.startswith("/") else posixpath.join(base, target))
                        if target in worksheet_targets:
                            raise HTTPException(400, "Duplicate Excel worksheet resource.")
                        worksheet_targets.add(target)
                    # openpyxl treats every direct child of a row as a cell,
                    # including children with unexpected tags or namespaces.
                    if parent_tag == row_tag:
                        cell_count += 1
                        column_index += 1
                        if attributes.get("r"):
                            check_range(attributes["r"])
                            column_index = range_boundaries(attributes["r"])[0]
                        if column_index > MAX_SHEET_COLUMNS or cell_count > MAX_WORKBOOK_CELLS:
                            raise HTTPException(413, "Excel workbook exceeds the cell limit.")
                    # Inspect worksheet markup regardless of the ZIP member path.
                    if not tag.startswith("http://schemas.openxmlformats.org/spreadsheetml/2006/main}"):
                        return
                    name = tag.rsplit("}", 1)[-1]
                    if name in ("dimension", "mergeCell") and attributes.get("ref"):
                        check_range(attributes["ref"])
                    elif name == "row":
                        if parent_tag != "http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData" or row_tag in element_stack[:-1]:
                            raise HTTPException(400, "Invalid or nested Excel worksheet rows.")
                        row_index = int(attributes.get("r", row_index + 1))
                        column_index = 0
                        if not 1 <= row_index <= MAX_SHEET_ROWS:
                            raise HTTPException(413, "Excel worksheet exceeds the row limit.")
                    elif name == "col":
                        if not 1 <= int(attributes["min"]) <= int(attributes["max"]) <= MAX_SHEET_COLUMNS:
                            raise HTTPException(413, "Excel worksheet exceeds the column limit.")
                    elif name == "sheet":
                        sheet_count += 1
                        if sheet_count > MAX_WORKBOOK_SHEETS:
                            raise HTTPException(413, f"Excel workbook exceeds the worksheet limit ({MAX_WORKBOOK_SHEETS}).")
                        relationship_id = attributes.get("http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
                        if not relationship_id or relationship_id in sheet_ids:
                            raise HTTPException(400, "Duplicate or invalid Excel worksheet relationship.")
                        sheet_ids.add(relationship_id)

                def end_element(tag):
                    element_stack.pop()

                parser.StartDoctypeDeclHandler = reject_doctype
                parser.StartElementHandler = start_element
                parser.EndElementHandler = end_element
                with archive.open(member) as source:
                    while chunk := source.read(64 * 1024):
                        total_read += len(chunk)
                        if total_read > MAX_XLSX_EXPANDED_BYTES:
                            raise HTTPException(413, "Excel archive exceeds the expanded size limit.")
                        parser.Parse(chunk, False)
                    parser.Parse(b"", True)
                validated_members.add(member.filename)
        return validated_members
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid Excel file. Upload a valid .xlsx workbook.") from None


def safe_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", value.strip()) or "RECORD"


def write_cell(sheet, row: int, column: int, value) -> None:
    target = sheet.cell(row, column)
    if isinstance(target, MergedCell):
        for merged in sheet.merged_cells.ranges:
            if target.coordinate in merged:
                target = sheet.cell(merged.min_row, merged.min_col)
                break
    target.value = value
    if isinstance(value, str):
        target.data_type = "s"


def stream_bytes(content: bytes, filename: str, content_type: str = XLSX) -> StreamingResponse:
    return StreamingResponse(BytesIO(content), media_type=content_type, headers={"Content-Disposition": f'attachment; filename="{filename}"', "Access-Control-Expose-Headers": "Content-Disposition"})


def workbook_bytes(workbook) -> bytes:
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


@dataclass
class ChecklistData:
    advisers: dict[int, Teacher]
    parents: dict[int, list[tuple[Parent, str | None]]]
    evaluations: dict[int, list[StudentEccdEvaluation]]
    questions: list[EccdQuestion]
    setting: SystemSettings


def checklist_data(db: Session, students: list[Student]) -> ChecklistData:
    ids = [student.student_id for student in students]
    sections = {student.section_id for student in students if student.section_id is not None}
    advisers = {}
    for section_id, teacher in db.query(SectionTeacher.section_id, Teacher).join(Teacher).join(User, Teacher.user_id == User.user_id).filter(
        SectionTeacher.section_id.in_(sections), SectionTeacher.status == "Active",
        SectionTeacher.role == "Primary Adviser", User.is_active.is_(True),
    ).order_by(SectionTeacher.id.desc()):
        advisers.setdefault(section_id, teacher)
    parents = defaultdict(list)
    for student_id, parent, relationship in db.query(FamilyAccess.student_id, Parent, FamilyAccess.relationship_type).join(Parent, Parent.parent_id == FamilyAccess.parent_id).filter(
        FamilyAccess.student_id.in_(ids), FamilyAccess.status == "SYNCED",
    ):
        parents[student_id].append((parent, relationship))
    evaluations = defaultdict(list)
    for record in db.query(StudentEccdEvaluation).options(joinedload(StudentEccdEvaluation.question)).filter(StudentEccdEvaluation.student_id.in_(ids)):
        evaluations[record.student_id].append(record)
    return ChecklistData(advisers, parents, evaluations, db.query(EccdQuestion).all(), settings_record(db))


def student_workbook(db: Session, student: Student, *, batch: ChecklistData | None = None):
    from backend.utils.checklist_workbook import generate_student_workbook
    batch = batch if batch is not None else checklist_data(db, [student])
    teacher = batch.advisers.get(student.section_id)
    if teacher is None:
        teacher = Teacher(first_name="", last_name="")
    parents = []
    for parent, relationship in batch.parents.get(student.student_id, []):
        # Do not mutate a linked parent's relationship while exporting.
        proxy = Parent(fullname=parent.fullname, age=parent.age, occupation=parent.occupation, educational_attainment=parent.educational_attainment, relationship_type=relationship if relationship is not None else parent.relationship_type)
        parents.append(proxy)
    return generate_student_workbook(student, teacher, parents, batch.evaluations.get(student.student_id, []), batch.questions, batch.setting)


def checklist_response(db: Session, user: User, identifier: str | int, school_year: str | None = None) -> StreamingResponse:
    student = resolve_student(db, identifier)
    authorize_student(db, user, student)
    if school_year is not None:
        if school_year != settings_record(db).current_school_year:
            raise HTTPException(400, "Archived school year records must be downloaded as a section ZIP.")
        if student.school_year != school_year or not student.is_active:
            raise HTTPException(404, f"No active student record found in School Year {school_year}.")
    filename = f"{safe_filename(student.last_name or 'STUDENT').upper()}_{safe_filename(student.school_year or 'RECORD')}.xlsx"
    return stream_bytes(workbook_bytes(student_workbook(db, student)), filename)


def authorize_export_section(db: Session, user: User, section_id: int) -> None:
    """Check ownership before reading a cohort, including empty sections."""
    if user.role.value == "admin" and section_id not in teacher_sections(db, current_teacher(db, user)):
        raise HTTPException(403, "Section is not assigned to you.")


def bulk_checklist_response(db: Session, user: User, section_id: int | None = None, school_year: str | None = None) -> StreamingResponse:
    query = db.query(Student)
    if section_id is not None:
        authorize_export_section(db, user, section_id)
        query = query.filter(Student.section_id == section_id)
    if school_year is not None:
        # Archiving toggles is_active; the stored section/year retain the cohort.
        query = query.filter(Student.school_year == school_year)
    else:
        query = query.filter(Student.is_active.is_(True))
    teacher = current_teacher(db, user) if user.role.value == "admin" else None
    if teacher:
        query = query.filter(Student.section_id.in_(teacher_sections(db, teacher)))
    students = query.options(joinedload(Student.section)).order_by(Student.last_name, Student.student_id).all()
    if not students:
        if section_id is not None and school_year is not None:
            raise HTTPException(404, f"No assessment records found for this section in School Year {school_year}.")
        raise HTTPException(404, "No students found for export.")
    output = BytesIO()
    used = set()
    batch = checklist_data(db, students)
    with ZipFile(output, "w") as archive:
        for student in students:
            name = f"{safe_filename(student.last_name or 'STUDENT').upper()}_{safe_filename(student.school_year or 'RECORD')}"
            if name in used:
                name += f"_{student.student_id}"
            used.add(name)
            archive.writestr(name + ".xlsx", workbook_bytes(student_workbook(db, student, batch=batch)))
    sections = {student.section.section_name if student.section else "UNASSIGNED" for student in students}
    years = {student.school_year or 'RECORD' for student in students}
    section = next(iter(sections)) if len(sections) == 1 else "ALL_SECTIONS"
    year = next(iter(years)) if len(years) == 1 else "ALL_YEARS"
    prefix = "ECCD_" if section_id is not None else ""
    filename = f"{prefix}{safe_filename(section).upper()}_{safe_filename(year)}.zip"
    return stream_bytes(output.getvalue(), filename, "application/zip")


def summary_workbook(db: Session, section: Section, students: list[Student]):
    wb = openpyxl.load_workbook(TEMPLATES / "ECCD_Summary_Matrix_Template.xlsx")
    setting = settings_record(db)
    adviser = get_active_adviser_for_student(students[0], db) if students else None
    teacher_name = f"{adviser.first_name or ''} {adviser.last_name or ''}".strip().upper() if adviser else ""
    by_student_period = defaultdict(list)
    for record in db.query(StudentEccdEvaluation).options(joinedload(StudentEccdEvaluation.question)).filter(
        StudentEccdEvaluation.student_id.in_([student.student_id for student in students[:30]])
    ).all():
        by_student_period[(record.student_id, record.testing_period)].append(record)
    for period, sheet_name in ((TestingPeriod.PRE, "PR"), (TestingPeriod.MID, "M"), (TestingPeriod.POST, "PO")):
        sheet = wb[sheet_name]
        for row in range(14, 44):
            for column in range(2, 28):
                if not isinstance(sheet.cell(row, column), MergedCell):
                    sheet.cell(row, column).value = None
        tallies = defaultdict(lambda: {"Male": 0, "Female": 0})
        header_dates = []
        for row, column, value in ((3, 2, setting.school_name.upper()), (8, 5, "136481"), (8, 10, f"SCHOOL YEAR: {students[0].school_year if students else setting.current_school_year}"), (10, 4, setting.school_name.upper()), (10, 14, section.section_name.upper()), (10, 20, teacher_name)):
            write_cell(sheet, row, column, value)
        for index, student in enumerate(students[:30]):
            row = 14 + index
            middle = f" {student.middle_name[:1].upper()}." if student.middle_name else ""
            name = f"{student.last_name or ''}, {student.first_name or ''}{middle}".upper()
            records = by_student_period[(student.student_id, period)]
            values = [index + 1, student.lrn_number, name, None, None, student.gender.value.upper() if student.gender else "", student.date_of_birth]
            for column, value in enumerate(values, 2):
                if value is not None:
                    write_cell(sheet, row, column, value)
            evaluation_date = get_official_testing_date(records, period)
            write_cell(sheet, row, 9, evaluation_date)
            if evaluation_date:
                header_dates.append(evaluation_date)
            if evaluation_date and student.date_of_birth:
                age = calculate_decimal_age(student.date_of_birth, evaluation_date)
                scores = calculate_scores([{"domain_id": record.question.domain_id, "answer": record.answer.value} for record in records], age)
                write_cell(sheet, row, 10, age)
                for offset, code in enumerate(("GM", "FM", "SH", "RL", "EL", "C", "SE")):
                    write_cell(sheet, row, 11 + offset * 2, scores["raw_scores"][code])
                    write_cell(sheet, row, 12 + offset * 2, scores["scaled_scores"][code])
                for column, key in ((25, "sum_of_scaled_scores"), (26, "standard_score"), (27, "interpretation")):
                    write_cell(sheet, row, column, scores[key])
                if student.gender and scores["interpretation"]:
                    tallies[scores["interpretation"]][student.gender.value] += 1
        write_cell(sheet, 8, 21, min(header_dates) if header_dates else None)
        groups = (("Highly Advance", "Highly Advanced"), ("Slight Advance", "Slight Advanced"), ("Average",), ("Slight Delay",), ("Delay",))
        for row, gender in ((45, "Male"), (46, "Female")):
            for column, aliases in enumerate(groups, 4):
                write_cell(sheet, row, column, sum(tallies[alias][gender] for alias in aliases))
    return wb


def summary_response(db: Session, user: User, section_filter: str | int | None = None, school_year: str | None = None) -> StreamingResponse:
    query = db.query(Student).filter_by(is_active=True)
    if school_year and school_year != "All":
        query = db.query(Student).filter_by(school_year=school_year)
    specific = section_filter is not None and str(section_filter) not in ("all", "All", "All Sections")
    if specific:
        if str(section_filter).isdigit():
            authorize_export_section(db, user, int(section_filter))
            query = query.filter(Student.section_id == int(section_filter))
        else:
            query = query.join(Section).filter(Section.section_name == section_filter)
    students = query.order_by(Student.section_id, Student.school_year, Student.last_name, Student.student_id).all()
    if not students:
        if specific and school_year and school_year != "All":
            raise HTTPException(404, f"No assessment records found for this section in School Year {school_year}.")
        raise HTTPException(404, "No students found for export.")
    cohorts = defaultdict(list)
    for student in students:
        authorize_student(db, user, student)
        cohorts[(student.section_id, student.school_year)].append(student)
    exports = []
    for (section_id, year), cohort in cohorts.items():
        section = db.get(Section, section_id) if section_id else Section(section_name="UNASSIGNED")
        for offset in range(0, len(cohort), 30):
            suffix = f"_Part{offset // 30 + 1}" if len(cohort) > 30 else ""
            name = f"{safe_filename(section.section_name).upper()}{suffix}_{safe_filename(year or 'RECORD')}.xlsx"
            exports.append((name, workbook_bytes(summary_workbook(db, section, cohort[offset:offset + 30]))))
    if specific and len(exports) == 1:
        return stream_bytes(exports[0][1], exports[0][0])
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        for name, content in exports:
            archive.writestr(name, content)
    return stream_bytes(output.getvalue(), f"ECCD_Summary_All_Sections_{safe_filename(school_year if school_year and school_year != 'All' else students[0].school_year or 'RECORD')}.zip", "application/zip")


def parse_date(value: object, epoch) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            converted = from_excel(value, epoch=epoch)
            return converted.date() if isinstance(converted, datetime) else None
        except (ValueError, OverflowError):
            return None
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.strip().replace("Z", "+00:00")).date()
        except ValueError:
            pass
        for pattern in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y-%m-%dT%H:%M:%S"):
            try:
                return datetime.strptime(value.strip(), pattern).date()
            except ValueError:
                pass
    return None


def marked(value: object) -> bool:
    return value == 1 or (isinstance(value, str) and value.strip().lower() in ("1", "kaya", "di-kaya", "x", "ü", "v", "✓"))


class SectionMismatchError(HTTPException):
    def __init__(self, file_section: str, assigned_section: str):
        self.response = SectionMismatchResponse(file_section=file_section, assigned_section=assigned_section)
        super().__init__(409, self.response.detail)


def workbook_section_name(rows: list[tuple[object, ...]]) -> str:
    """Read display metadata only; authorization never depends on file labels."""
    labels = r"(?:section(?:\s+name)?|class(?:\s+name)?)(?:\s*/\s*section)?"
    candidates: set[str] = set()
    for row in rows[:2]:
        for index, value in enumerate(row):
            if not isinstance(value, str):
                continue
            match = re.fullmatch(rf"\s*{labels}\s*:\s*(.+?)\s*", value, re.IGNORECASE)
            if match and match.group(1).strip():
                candidates.add(match.group(1).strip())
            elif re.fullmatch(rf"\s*{labels}\s*:?\s*", value, re.IGNORECASE):
                adjacent = next((cell.strip() for cell in row[index + 1:] if isinstance(cell, str) and cell.strip()), None)
                if adjacent:
                    candidates.add(adjacent)
    if len(candidates) == 1:
        return next(iter(candidates))
    if not candidates and rows and rows[0] and isinstance(rows[0][0], str):
        first = rows[0][0].strip()
        if first and not any(cell is not None and str(cell).strip() for cell in rows[0][1:]) and not re.fullmatch(rf"{labels}\s*:?", first, re.IGNORECASE):
            return first
    return "Not identified"


def import_students(db: Session, user: User, content: bytes, section_id: int | None = None, overwrite_section: bool = False) -> dict:
    teacher = current_teacher(db, user)
    assignments = db.query(SectionTeacher).filter_by(teacher_id=teacher.teacher_id, role="Primary Adviser", status="Active").order_by(SectionTeacher.id).all()
    allowed = [assignment.section_id for assignment in assignments]
    section_id = section_id or (allowed[0] if allowed else None)
    if section_id not in allowed:
        raise HTTPException(403, "Teacher is not assigned to this section.")
    section = db.get(Section, section_id)
    try:
        validated_members = validate_xlsx_resources(content)
        wb = openpyxl.load_workbook(BytesIO(content), data_only=True, read_only=True)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid Excel file. Upload a valid .xlsx workbook.") from None
    try:
        if any(sheet._worksheet_path not in validated_members for sheet in wb):
            raise HTTPException(400, "Invalid Excel worksheet resource.")
        return import_workbook(db, user, teacher, section, section_id, wb, overwrite_section=overwrite_section)
    finally:
        wb.close()


def import_sheet_rows(sheet, *, max_columns: int) -> list[tuple[object, ...]]:
    # Read-only workbooks defer cell conversion until iteration. Preserve the
    # invalid-workbook HTTP 400 contract for parser errors at this boundary.
    try:
        return list(sheet.iter_rows(
            min_col=1, max_col=max_columns, max_row=MAX_SHEET_ROWS, values_only=True,
        ))
    except Exception:
        raise HTTPException(400, "Invalid Excel file. Upload a valid .xlsx workbook.") from None


def import_workbook(db: Session, user: User, teacher: Teacher, section: Section, section_id: int, wb, *, overwrite_section: bool = False) -> dict:
    if "Info Sheet" not in wb.sheetnames:
        raise HTTPException(400, 'Invalid Excel format. "Info Sheet" tab is missing.')
    # XML has already been bounded. Ignore declared dimensions so understated
    # metadata cannot hide populated rows or columns from the importer.
    for sheet in wb:
        sheet.reset_dimensions()
    rows = import_sheet_rows(wb["Info Sheet"], max_columns=MAX_INFO_IMPORT_COLUMNS)
    if len(rows) < 3:
        raise HTTPException(400, "No data found in Info Sheet starting at row 3.")
    file_section = workbook_section_name(rows)
    assigned_name = section.section_name.strip().casefold()
    if not overwrite_section and not (
        (file_section != "Not identified" and file_section.casefold() == assigned_name)
        or any(isinstance(value, str) and value.strip().casefold() == assigned_name for row in rows[:20] for value in row)
    ):
        raise SectionMismatchError(file_section, section.section_name)
    first_pre = next((parsed for row in rows[2:] if len(row) > 10 for parsed in [parse_date(row[10], wb.epoch)] if parsed and parsed.year > 1900), None)
    if first_pre is None:
        raise HTTPException(400, "Missing or invalid PRETEST DATE; school year cannot be calculated.")
    school_year = f"{first_pre.year}-{first_pre.year + 1}"
    questions = db.query(EccdQuestion).order_by(EccdQuestion.sequence_order).all()
    domain_rows = {}
    for sheet_name in DOMAIN_SHEETS.values():
        if sheet_name in wb.sheetnames:
            index = {}
            # SH, C and SE contain answers beyond column 100 (up to 164 in
            # the reference checklist). Preserve those assessment columns.
            for values in import_sheet_rows(wb[sheet_name], max_columns=MAX_ASSESSMENT_IMPORT_COLUMNS):
                if len(values) > 1 and isinstance(values[1], str):
                    index.setdefault(" ".join(values[1].split()).casefold(), values)
            domain_rows[sheet_name] = index
    # Relational anchors are reads. Each student and all their scores commit together.
    db.commit()
    result = {"successCount": 0, "failedCount": 0, "errors": []}
    for row_number, row in enumerate(rows[2:], 3):
        def cell(index):
            return row[index] if index < len(row) else None
        def string(index):
            value = cell(index)
            return str(int(value)) if isinstance(value, float) and value.is_integer() else str(value).strip() if value is not None else ""
        if not string(1) and not string(5):
            continue
        try:
            names = [part.strip() for part in string(1).split(",")]
            if len(names) < 2 or not names[0] or not names[1]:
                raise ValueError("Name must use Last Name, First Name, Middle Name format.")
            gender = {"BABAE": "Female", "LALAKI": "Male"}.get(string(7).upper(), string(7).title() or "Male")
            handedness = {"KALIWA": "Left", "KANAN": "Right"}.get(string(8).upper(), string(8).title() or None)
            birth = parse_date(cell(9), wb.epoch)
            if cell(9) and birth is None:
                raise ValueError("Invalid birth date.")
            if not string(5):
                raise ValueError("A 12-digit LRN is required to match workbook student records.")
            data = StudentCreate(lrn_number=string(5), first_name=names[1], middle_name=" ".join(names[2:]) or None, last_name=names[0], gender=gender, handedness=handedness, date_of_birth=birth, address=string(16) or None, num_of_siblings=int(string(25)) if string(25) else None, birth_order=string(26) or None, school_year=school_year, section_id=section_id, section_name=section.section_name)
            student = db.query(Student).filter_by(lrn_search_hash=hash_lrn(data.lrn_number)).with_for_update().first()
            if student and student.section_id != section_id:
                raise ValueError("Student is not authorized for import into your assigned section.")
            if student is None:
                student = Student(**data.model_dump())
                db.add(student)
                db.flush()
            else:
                for key, value in data.model_dump().items():
                    if key not in ("address", "num_of_siblings", "birth_order") or value is not None:
                        setattr(student, key, value)
                student.is_active = True
            for relationship, start in (("Father", 17), ("Mother", 21)):
                age = int(string(start + 1)) if string(start + 1) else None
                if age is not None and age < 0:
                    raise ValueError("Guardian age must not be negative.")
                name = string(start)
                validate_person_name(name)
                if len(name) > 100:
                    raise ValueError("Names must not exceed 100 characters.")
                upsert_guardian(db, student, relationship, name, age, string(start + 2)[:50] or None, string(start + 3)[:20] or None, user=user)
            dates = {TestingPeriod.PRE: parse_date(cell(10), wb.epoch), TestingPeriod.MID: parse_date(cell(12), wb.epoch), TestingPeriod.POST: parse_date(cell(14), wb.epoch)}
            evaluations = db.query(StudentEccdEvaluation).filter_by(student_id=student.student_id).all()
            by_question_period = {(record.question_id, record.testing_period): record for record in evaluations}
            import_dates = {}
            normalized_name = " ".join(string(1).split()).casefold()
            for question in questions:
                sheet_name = DOMAIN_SHEETS.get(question.domain_id)
                if sheet_name not in wb.sheetnames:
                    continue
                domain_row = domain_rows[sheet_name].get(normalized_name)
                if domain_row is None:
                    continue
                base = 2 + (question.sequence_order - 1) * 6
                for index, period in enumerate(TestingPeriod):
                    kaya = domain_row[base + index * 2] if len(domain_row) > base + index * 2 else None
                    not_kaya = domain_row[base + index * 2 + 1] if len(domain_row) > base + index * 2 + 1 else None
                    answer = EccdAnswer.KAYA if marked(kaya) else EccdAnswer.DI_KAYA if marked(not_kaya) else None
                    if answer is None:
                        continue
                    if dates[period] is None:
                        raise ValueError("Marked assessment is missing its testing date.")
                    evaluation = by_question_period.get((question.question_id, period))
                    if evaluation is None:
                        evaluation = StudentEccdEvaluation(student_id=student.student_id, question_id=question.question_id, testing_period=period)
                        db.add(evaluation)
                        evaluations.append(evaluation)
                        by_question_period[(question.question_id, period)] = evaluation
                    unchanged = evaluation.answer == answer
                    if not unchanged:
                        evaluation.evaluator_role = "teacher"
                        evaluation.teacher_marked_at = now_pht()
                    evaluation.answer = answer
                    evaluation.teacher_id = teacher.teacher_id
                    evaluation.teacher_evaluation_date = dates[period]
                    evaluation.evaluation_date = dates[period]
                    # Parent identity and submission time remain historical provenance.
                    import_dates[period] = dates[period]
            for evaluation in evaluations:
                # Unmarked parent-only observations do not join the teacher session.
                if evaluation.testing_period in import_dates and evaluation.teacher_evaluation_date is not None:
                    evaluation.teacher_evaluation_date = import_dates[evaluation.testing_period]
                    evaluation.evaluation_date = import_dates[evaluation.testing_period]
            # Validate the final state: several imported periods may move together.
            periods = list(TestingPeriod)
            for period, imported_date in import_dates.items():
                for evaluation in evaluations:
                    if evaluation.testing_period == period or evaluation.teacher_evaluation_date is None:
                        continue
                    earlier = periods.index(evaluation.testing_period) < periods.index(period)
                    if (earlier and evaluation.teacher_evaluation_date >= imported_date) or (not earlier and evaluation.teacher_evaluation_date <= imported_date):
                        raise ValueError(
                            f"Assessment dates must follow PRE < MID < POST. "
                            f"Imported {period.value} date {imported_date.isoformat()} conflicts with "
                            f"{evaluation.testing_period.value} teacher date {evaluation.teacher_evaluation_date.isoformat()}. "
                            "No changes saved for this student."
                        )
            db.commit()
            result["successCount"] += 1
        except Exception as error:
            db.rollback()
            result["failedCount"] += 1
            message = str(error) if type(error) is ValueError else "Invalid student, guardian or assessment data. No row changes saved."
            result["errors"].append({"row": row_number, "error": message})
    return result
