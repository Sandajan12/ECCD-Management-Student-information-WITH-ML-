"""Settings identity, workbook validation and encrypted backup compatibility."""
from io import BytesIO
import json
import unittest

from fastapi import HTTPException
import openpyxl
from sqlalchemy import inspect, text

from backend.constants import DEFAULT_SYSTEM_NAME, OFFICIAL_SCHOOL_NAME
from backend.migrations import system_name as migration
from backend.migrations.phase1 import MigrationError
from backend.migrations.phase2 import digest_table
from backend.models import SystemSettings
from backend.tests import test_phase2
from backend.utils.backups import cipher, export_backup, restore_backup
from backend.utils.pdf import ReportPDF


class SystemNameTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call = self.fixture.call

    def test_settings_json_multipart_and_root_alias_persist_only_system_name(self):
        for path, body in (("/api/settings", {"json": {"system_name": "Custom Family Portal"}}),
                           ("/api/settings/update", {"data": {"system_name": "Updated Portal"}})):
            response = self.call("PUT", path, **body)
            self.assertEqual(response.status_code, 200, response.text)
            expected = next(iter(body.values()))["system_name"]
            self.assertEqual(response.json()["settings"]["system_name"], expected)
            result = self.call("GET", "/api/settings").json()
            self.assertEqual(result["system_name"], expected)
            self.assertNotIn("school_name", result)
            with self.fixture.sessions() as db:
                self.assertEqual(db.get(SystemSettings, 1).system_name, expected)
        denied = self.call("PUT", "/api/settings", 2, json={"system_name": "Denied"})
        self.assertEqual(denied.status_code, 403)

    def historical_settings(self):
        with self.fixture.test_engine.begin() as connection:
            connection.execute(text("DELETE FROM ames_schema_migrations WHERE version=:v"), {"v": migration.VERSION})
            connection.execute(text("ALTER TABLE system_settings RENAME COLUMN system_name TO school_name"))
            connection.execute(text("ALTER TABLE system_settings ALTER COLUMN school_name SET DEFAULT 'APOLINARIO MABINI ELEMENTARY SCHOOL'"))

    def test_migration_preserves_values_other_fields_and_is_repeatable(self):
        self.historical_settings()
        with self.fixture.test_engine.begin() as connection:
            before = list(connection.execute(text("SELECT to_jsonb(s) - 'school_name', school_name FROM system_settings s ORDER BY id")))
            students = digest_table(connection, "students")
            with self.assertRaises(MigrationError):
                migration.check_system_name(connection, self.fixture.schema)
            self.assertTrue(migration.apply_system_name(connection, self.fixture.schema))
            migration.check_system_name(connection, self.fixture.schema)
            self.assertFalse(migration.apply_system_name(connection, self.fixture.schema))
            self.assertEqual(before, list(connection.execute(text("SELECT to_jsonb(s) - 'system_name', system_name FROM system_settings s ORDER BY id"))))
            self.assertEqual(students, digest_table(connection, "students"))
            connection.execute(text("INSERT INTO system_settings (id) VALUES (2)"))
            self.assertEqual(connection.execute(text("SELECT system_name FROM system_settings WHERE id=2")).scalar_one(), DEFAULT_SYSTEM_NAME)

    def test_migration_rolls_back_column_and_ledger_together(self):
        self.historical_settings()
        with self.assertRaisesRegex(RuntimeError, "rollback"), self.fixture.test_engine.begin() as connection:
            migration.apply_system_name(connection, self.fixture.schema)
            raise RuntimeError("rollback")
        with self.fixture.test_engine.begin() as connection:
            columns = {c["name"] for c in inspect(connection).get_columns("system_settings", schema=self.fixture.schema)}
            self.assertIn("school_name", columns)
            self.assertNotIn("system_name", columns)
            self.assertFalse(connection.execute(text("SELECT EXISTS (SELECT 1 FROM ames_schema_migrations WHERE version=:v)"), {"v": migration.VERSION}).scalar_one())

    def test_import_validates_official_school_independent_of_custom_branding(self):
        response = self.call("PUT", "/api/settings", json={"system_name": "Custom Family Portal"})
        self.assertEqual(response.status_code, 200, response.text)
        for school, sheet, adjacent, expected in (
            ("Custom Family Portal", "Info Sheet", False, 400),
            ("Other Elementary School", "Info Sheet", True, 400),
            ("Custom Family Portal", "GM", False, 400),
            (OFFICIAL_SCHOOL_NAME, "Info Sheet", False, 200),
            (OFFICIAL_SCHOOL_NAME.lower(), "GM", True, 200),
        ):
            with self.subTest(school=school, sheet=sheet, adjacent=adjacent):
                workbook = openpyxl.load_workbook(BytesIO(self.fixture.make_import()))
                workbook[sheet]["C1"] = "School Name:" if adjacent else f"School: {school}"
                if adjacent:
                    workbook[sheet]["D1"] = school
                content = BytesIO()
                workbook.save(content)
                workbook.close()
                result = self.call("POST", "/api/teachers/import-students", 2,
                                   files={"file": ("students.xlsx", content.getvalue())})
                self.assertEqual(result.status_code, expected, result.text)
                if expected == 200:
                    self.assertEqual(result.json()["successCount"], 1)
                else:
                    self.assertIn(OFFICIAL_SCHOOL_NAME, result.json()["detail"])

    def test_documents_and_preview_use_official_school_with_custom_system_name(self):
        self.call("PUT", "/api/settings", json={"system_name": "Custom Family Portal"})
        for path, sheet, cell in (("/api/teachers/download/1", "CHECKLIST", "V6"),
                                  ("/api/chairman/sections/1/export-summary", "PR", "B3")):
            response = self.call("GET", path, 2 if "teachers" in path else 1)
            self.assertEqual(response.status_code, 200, response.text[:200])
            workbook = openpyxl.load_workbook(BytesIO(response.content))
            self.assertIn(OFFICIAL_SCHOOL_NAME, workbook[sheet][cell].value)
            self.assertNotIn("Custom Family Portal", str(list(workbook[sheet].values)))
            if sheet == "PR":
                pdf = ReportPDF("ECCD Section Summary", "", True)
                pdf.section_summary(workbook[sheet])
                self.assertTrue(pdf.summary_header[0].startswith(OFFICIAL_SCHOOL_NAME))
                self.assertTrue(bytes(pdf.output()).startswith(b"%PDF-"))
            workbook.close()
        preview = self.call("GET", "/api/eccd/card-preview/1", 2)
        self.assertEqual(preview.status_code, 200, preview.text[:200])
        self.assertIn(OFFICIAL_SCHOOL_NAME, preview.text)
        self.assertNotIn("Custom Family Portal", preview.text)

    def test_backup_exports_current_key_and_restores_both_names(self):
        with self.fixture.sessions() as db:
            document = json.loads(cipher().decrypt(export_backup(db)))
        self.assertIn("system_name", document["system_settings"][0])
        self.assertNotIn("school_name", document["system_settings"][0])
        for legacy in (False, True):
            with self.subTest(legacy=legacy), self.fixture.sessions() as db:
                row = document["system_settings"][0]
                row.pop("system_name", None)
                row.pop("school_name", None)
                row["school_name" if legacy else "system_name"] = "Preserved legacy branding" if legacy else "Current branding"
                restore_backup(db, cipher().encrypt(json.dumps(document).encode()))
                exported = json.loads(cipher().decrypt(export_backup(db)))["system_settings"][0]
                self.assertEqual(exported["system_name"], next(row[key] for key in ("system_name", "school_name") if key in row))
                self.assertNotIn("school_name", exported)

    def test_ambiguous_backup_or_unknown_fields_preserve_existing_settings(self):
        with self.fixture.sessions() as db:
            original = json.loads(cipher().decrypt(export_backup(db)))
            before = digest_table(db.connection(), "system_settings")
            for extra in ({"school_name": "Conflicting"}, {"unexpected_setting": "reject"}):
                document = json.loads(json.dumps(original))
                document["system_settings"][0].update(extra)
                with self.assertRaises(HTTPException) as caught:
                    restore_backup(db, cipher().encrypt(json.dumps(document).encode()))
                self.assertEqual(caught.exception.status_code, 400)
                self.assertEqual(before, digest_table(db.connection(), "system_settings"))
