"""Audit M6/L1/L2/L5 regressions using disposable PostgreSQL schemas."""
import asyncio
from io import BytesIO
import struct
import unittest
from unittest.mock import patch
from zipfile import ZipFile

import openpyxl
from fastapi import HTTPException

from backend.models import FamilyAccess, Parent, Student, SystemLog, Teacher, User
from backend.tests import test_phase2
from backend.utils import excel


class WorkbookTextTests(unittest.TestCase):
    def test_summary_writer_preserves_literal_text_numbers_and_template_formulas(self):
        wb = openpyxl.Workbook()
        sheet = wb.active
        sheet["C1"] = "=SUM(B1:B2)"
        excel.write_cell(sheet, 1, 1, "=1+1")
        excel.write_cell(sheet, 1, 2, 5)
        saved = openpyxl.load_workbook(BytesIO(excel.workbook_bytes(wb)), data_only=False)
        self.assertEqual((saved.active["A1"].value, saved.active["A1"].data_type), ("=1+1", "s"))
        self.assertEqual((saved.active["B1"].value, saved.active["B1"].data_type), (5, "n"))
        self.assertEqual(saved.active["C1"].data_type, "f")
        saved.close()
        wb.close()


class WorkbookResourceTests(unittest.TestCase):
    """Exercise the archive boundary without a database or API server."""

    def test_accepts_supported_sheet_counts_including_hidden_sheets(self):
        for count in (17, 64):
            with self.subTest(count=count):
                content = test_phase2.BackendTests().make_import(sheet_count=count)
                members = excel.validate_xlsx_resources(content)
                self.assertIn(f"xl/worksheets/sheet{count}.xml", members)
                workbook = openpyxl.load_workbook(BytesIO(content), read_only=True)
                try:
                    self.assertEqual(len(workbook.worksheets), count)
                    self.assertTrue(any(sheet.sheet_state == "hidden" for sheet in workbook))
                finally:
                    workbook.close()

    def test_rejects_65_sheets_including_hidden_sheets(self):
        content = test_phase2.BackendTests().make_import(sheet_count=65)
        with self.assertRaises(HTTPException) as raised:
            excel.validate_xlsx_resources(content)
        self.assertEqual(raised.exception.status_code, 413)
        self.assertIn("worksheet limit (64)", raised.exception.detail)


class SecurityBatch1Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call = self.fixture.call
        self.sessions = self.fixture.sessions

    def shared_guardian(self, *, account=True, status="SYNCED"):
        with self.sessions() as db:
            parent = db.get(Parent, 1)
            if not account:
                parent.user_id = None
            db.add(FamilyAccess(parent_id=1, student_id=3, relationship_type="Mother", status=status))
            db.get(Teacher, 2).allow_parent_edit_student_info = False
            db.commit()

    def assert_guardian_denied(self, actor, path):
        response = self.call("PUT", path, actor, json={"address": "Must roll back", "mother_name": "Changed Guardian"})
        self.assertEqual(response.status_code, 403, response.text)
        with self.sessions() as db:
            self.assertEqual(db.get(Parent, 1).fullname, "Test Parent")
            self.assertIsNone(db.get(Student, 1).address)
            self.assertEqual(db.query(SystemLog).filter_by(action_type="Updated Student Info").count(), 0)
            self.assertEqual(db.query(FamilyAccess).filter_by(parent_id=1).count(), 2)

    def test_parent_cannot_change_shared_guardian_of_locked_sibling_via_aliases(self):
        self.shared_guardian()
        for path in ("/api/students/1", "/api/students/update/1", "/api/parents/children/1"):
            with self.subTest(path=path):
                self.assert_guardian_denied(5, path)
        # An unrelated target field remains editable if the echoed guardian is unchanged.
        response = self.call("PUT", "/api/parents/children/1", 5, json={"address": "Allowed", "mother_name": "Test Parent"})
        self.assertEqual(response.status_code, 200, response.text)

    def test_teacher_cannot_change_account_guardian_in_another_section(self):
        self.shared_guardian()
        self.assert_guardian_denied(2, "/api/students/1")
        with self.sessions() as db:
            self.assertEqual(db.get(Parent, 1).user_id, 5)

    def test_teacher_cannot_change_nonaccount_guardian_or_pending_sibling_in_another_section(self):
        self.shared_guardian(account=False, status="PENDING")
        self.assert_guardian_denied(2, "/api/students/update/1")

    def test_parent_can_change_shared_guardian_when_all_children_are_editable(self):
        self.shared_guardian()
        with self.sessions() as db:
            db.get(Teacher, 2).allow_parent_edit_student_info = True
            db.commit()
        response = self.call("PUT", "/api/parents/children/1", 5, json={"mother_name": "Allowed Guardian", "mother_age": 35})
        self.assertEqual(response.status_code, 200, response.text)
        with self.sessions() as db:
            self.assertEqual((db.get(Parent, 1).fullname, db.get(Parent, 1).age, db.get(Parent, 1).user_id), ("Allowed Guardian", 35, 5))
            self.assertEqual(db.query(FamilyAccess).filter_by(parent_id=1).count(), 2)

    def test_teacher_shared_guardian_allowed_in_own_section_and_chairman_across_sections(self):
        self.shared_guardian()
        with self.sessions() as db:
            db.get(Student, 3).section_id = 1
            db.commit()
        response = self.call("PUT", "/api/students/1", 2, json={"mother_name": "Teacher Update"})
        self.assertEqual(response.status_code, 200, response.text)
        with self.sessions() as db:
            db.get(Student, 3).section_id = 2
            db.commit()
        response = self.call("PUT", "/api/students/1", 1, json={"mother_name": "Chairman Update"})
        self.assertEqual(response.status_code, 200, response.text)

    def upload(self, content):
        return self.call("POST", "/api/teachers/import-students", 2, files={"file": ("students.xlsx", content, excel.XLSX)})

    def test_import_cannot_update_shared_guardian_across_sections(self):
        self.shared_guardian()
        wb = openpyxl.load_workbook(BytesIO(self.fixture.make_import()))
        info = wb["Info Sheet"]
        info["F3"] = test_phase2.LRN
        info["R3"] = None
        info["V3"] = "Changed Guardian"
        response = self.upload(excel.workbook_bytes(wb))
        wb.close()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()["successCount"], response.json()["failedCount"]), (0, 1))
        with self.sessions() as db:
            self.assertEqual(db.get(Parent, 1).fullname, "Test Parent")
            self.assertEqual(db.get(Student, 1).first_name, "Test")

    def messages(self):
        with self.sessions() as db:
            db.get(Student, 2).is_active = True
            db.add(FamilyAccess(parent_id=2, student_id=2, relationship_type="Father"))
            db.commit()
        for actor, parent_id, body in ((5, 1, "Revoked preview"), (6, 2, "Keep visible")):
            response = self.call("POST", "/api/messages/send", actor, json={"teacher_id": 1, "parent_id": parent_id, "body": body})
            self.assertEqual(response.status_code, 201, response.text)
        self.assert_dashboard("2", {"Revoked preview", "Keep visible"})

    def assert_dashboard(self, count, previews):
        for path in ("/api/analytics/stats", "/api/teachers/dashboard-stats"):
            response = self.call("GET", path, 2)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["stats"]["unreadMessages"], count)
            self.assertEqual({message["preview"] for message in response.json()["messages"]}, previews)
        self.assertEqual(self.call("GET", "/api/messages/unread", 2).json()["unreadCount"], int(count))

    def test_dashboard_excludes_unlinked_and_pending_conversations(self):
        self.messages()
        with self.sessions() as db:
            db.query(FamilyAccess).filter_by(parent_id=1, student_id=1).one().status = "PENDING"
            db.commit()
        self.assert_dashboard("1", {"Keep visible"})
        response = self.call("POST", "/api/teachers/students/1/reject-parent-link", 2, json={"parent_id": 1})
        self.assertEqual(response.status_code, 200, response.text)
        self.assert_dashboard("1", {"Keep visible"})

    def test_dashboard_excludes_transferred_student_messages(self):
        self.messages()
        response = self.call("PUT", "/api/chairman/students/transfer", 1, json={"lrn_numbers": [test_phase2.LRN], "new_section_id": 2})
        self.assertEqual(response.status_code, 200, response.text)
        self.assert_dashboard("1", {"Keep visible"})

    def test_dashboard_excludes_previous_assignment_after_teacher_moves(self):
        self.messages()
        response = self.call("PUT", "/api/teachers/update/2", 1, json={"section_id": 2})
        self.assertEqual(response.status_code, 200, response.text)
        self.assert_dashboard("0", set())

    def test_dashboard_excludes_archived_children_and_inactive_parent_accounts(self):
        self.messages()
        with self.sessions() as db:
            db.get(Student, 1).is_active = False
            db.commit()
        self.assert_dashboard("1", {"Keep visible"})
        with self.sessions() as db:
            db.get(Student, 1).is_active = True
            db.get(User, 5).is_active = False
            db.commit()
        self.assert_dashboard("1", {"Keep visible"})

    def test_dashboard_does_not_multiply_messages_for_siblings(self):
        self.messages()
        with self.sessions() as db:
            db.add(FamilyAccess(parent_id=1, student_id=2, relationship_type="Mother"))
            db.commit()
        self.assert_dashboard("2", {"Revoked preview", "Keep visible"})
        with self.sessions() as db:
            db.query(FamilyAccess).filter_by(parent_id=1, student_id=1).delete()
            db.commit()
        self.assert_dashboard("2", {"Revoked preview", "Keep visible"})

    def test_checklist_serializes_profile_formula_prefixes_as_literal_strings(self):
        prefixes = ("=", "+", "-", "@", "\t", "\r")
        for prefix in prefixes:
            with self.subTest(prefix=prefix):
                with self.sessions() as db:
                    db.get(Student, 1).address = prefix + "1+1"
                    db.get(Student, 1).birth_order = prefix + "2"
                    parent = db.get(Parent, 1)
                    parent.occupation = prefix + "1+1"
                    parent.educational_attainment = prefix + "1+1"
                    parent.age = 35
                    db.commit()
                response = self.call("GET", f"/api/teachers/download/{test_phase2.LRN}", 2)
                self.assertEqual(response.status_code, 200, response.text[:100])
                wb = openpyxl.load_workbook(BytesIO(response.content), data_only=False)
                for coordinate, value in (("W18", prefix + "1+1"), ("AA24", prefix + "2"), ("W23", prefix + "1+1"), ("AA23", prefix + "1+1")):
                    self.assertEqual(wb["CHECKLIST"][coordinate].data_type, "s")
                    # XML normalizes a literal carriage return to a newline.
                    self.assertEqual(wb["CHECKLIST"][coordinate].value, value.replace("\r", "\n"))
                self.assertEqual(wb["CHECKLIST"]["AB22"].value, 35)
                self.assertEqual(wb["CHECKLIST"]["AB22"].data_type, "n")
                wb.close()

    def rewritten_import(self, transform, filename="xl/worksheets/sheet1.xml"):
        output = BytesIO()
        with ZipFile(BytesIO(self.fixture.make_import())) as source, ZipFile(output, "w") as target:
            for member in source.infolist():
                content = source.read(member)
                if member.filename == filename:
                    content = transform(content)
                target.writestr(member, content)
        return output.getvalue()

    def assert_resource_rejected(self, content):
        with patch.object(excel.openpyxl, "load_workbook") as loader:
            response = self.upload(content)
        self.assertIn(response.status_code, (400, 413), response.text)
        loader.assert_not_called()
        with self.sessions() as db:
            self.assertEqual(db.query(Student).count(), 3)

    def test_import_rejects_expanded_archive_metadata_and_member_count_before_loading(self):
        content = bytearray(self.fixture.make_import())
        central = content.index(b"PK\x01\x02")
        struct.pack_into("<I", content, central + 24, excel.MAX_XLSX_EXPANDED_BYTES + 1)
        self.assert_resource_rejected(bytes(content))
        output = BytesIO()
        with ZipFile(output, "w") as archive:
            for index in range(excel.MAX_XLSX_MEMBERS + 1):
                archive.writestr(f"item{index}.xml", "<empty/>")
        self.assert_resource_rejected(output.getvalue())

    def test_import_accepts_17_and_64_visible_and_hidden_sheets(self):
        for count in (17, 64):
            with self.subTest(count=count):
                response = self.upload(self.fixture.make_import(sheet_count=count))
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual((response.json()["successCount"], response.json()["failedCount"]), (1, 0))

    def test_import_rejects_65_sheets_before_loading_or_writing(self):
        content = self.fixture.make_import(sheet_count=65)
        with patch.object(excel.openpyxl, "load_workbook") as loader:
            response = self.upload(content)
        self.assertEqual(response.status_code, 413, response.text)
        self.assertIn("worksheet limit (64)", response.json()["detail"])
        loader.assert_not_called()
        with self.sessions() as db:
            self.assertEqual(db.query(Student).count(), 3)

    def test_import_rejects_sparse_dimensions_and_understated_row_column_metadata(self):
        import re
        transforms = (
            lambda xml: re.sub(rb'<dimension ref="[^"]+"', b'<dimension ref="A1:XFD1048576"', xml),
            lambda xml: xml.replace(b'<row r="3"', f'<row r="{excel.MAX_SHEET_ROWS + 1}"'.encode()),
            lambda xml: xml.replace(b'r="B3"', b'r="IW3"'),
            lambda xml: re.sub(rb'<c r="B3"(.*?)</c>', rb'<unexpected r="IW3"\1</unexpected>', xml),
            lambda xml: xml.replace(b'<c r="B3"', b'<c xmlns="" r="IW3"'),
        )
        for transform in transforms:
            with self.subTest(transform=transform):
                self.assert_resource_rejected(self.rewritten_import(transform))

    def test_import_rejects_worksheet_paths_that_skip_xml_validation(self):
        output = BytesIO()
        with ZipFile(BytesIO(self.fixture.make_import())) as source, ZipFile(output, "w") as target:
            for member in source.infolist():
                name = member.filename.replace("sheet1.xml", "sheet1.bin")
                content = source.read(member)
                if member.filename.endswith((".xml", ".rels")):
                    content = content.replace(b"sheet1.xml", b"sheet1.bin")
                target.writestr(name, content)
        response = self.upload(output.getvalue())
        self.assertEqual(response.status_code, 400, response.text)

    def test_import_rejects_cell_budget_and_xml_entities(self):
        with patch.object(excel, "MAX_WORKBOOK_CELLS", 2):
            self.assert_resource_rejected(self.fixture.make_import())
        self.assert_resource_rejected(self.rewritten_import(lambda xml: b'<!DOCTYPE worksheet [<!ENTITY x "expanded">]>' + xml))

    def test_import_rejects_sheet_aliases_and_excessive_sheet_declarations_before_loading(self):
        import re

        def aliases(xml, *, unique):
            sheets = b"".join(
                f'<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="Sheet{index}" sheetId="{index}" r:id="rId{index if unique else 1}"/>'.encode()
                for index in range(1, excel.MAX_WORKBOOK_SHEETS + 2)
            )
            return re.sub(rb'<sheets>.*?</sheets>', b'<sheets>' + sheets + b'</sheets>', xml)

        for unique in (False, True):
            self.assert_resource_rejected(self.rewritten_import(lambda xml: aliases(xml, unique=unique), "xl/workbook.xml"))

        def duplicate_target(xml):
            relationship = b'<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/../worksheets/sheet1.xml" Id="rIdExtra"/>'
            return xml.replace(b'</Relationships>', relationship + b'</Relationships>')

        self.assert_resource_rejected(self.rewritten_import(duplicate_target, "xl/_rels/workbook.xml.rels"))

    def test_import_rejects_nested_rows_before_openpyxl_can_reinterpret_row_numbers(self):
        content = self.rewritten_import(lambda xml: xml.replace(b'<sheetData>', b'<sheetData><row><row r="2000"/></row>'))
        self.assert_resource_rejected(content)

    def test_import_reads_rows_hidden_by_understated_dimensions(self):
        import re
        content = self.rewritten_import(lambda xml: re.sub(rb'<dimension ref="[^"]+"', b'<dimension ref="A1:A1"', xml))
        response = self.upload(content)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["successCount"], 1)

    def test_import_malformed_cell_still_returns_invalid_workbook_400(self):
        import re
        content = self.rewritten_import(lambda xml: re.sub(rb'(<c r="K3"[^>]*><v>)[^<]+', rb'\g<1>not-a-number', xml))
        response = self.upload(content)
        self.assertEqual(response.status_code, 400, response.text)

    def test_import_parser_runs_outside_the_async_event_loop(self):
        in_event_loop = []

        def parse(*args):
            try:
                asyncio.get_running_loop()
            except RuntimeError:
                in_event_loop.append(False)
            else:
                in_event_loop.append(True)
            return {"successCount": 0, "failedCount": 0, "errors": []}

        with patch.object(excel, "import_students", side_effect=parse):
            response = self.upload(self.fixture.make_import())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(in_event_loop, [False])
