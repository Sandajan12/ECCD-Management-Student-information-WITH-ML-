"""Retired settings compatibility and migration checks in disposable schemas."""
import json
import unittest

from fastapi import HTTPException
from sqlalchemy import inspect, text
from sqlalchemy.exc import DBAPIError

from backend.migrations import settings_cleanup as migration
from backend.migrations.phase1 import MigrationError, select_schema
from backend.migrations.phase2 import RETIRED_SETTINGS_COLUMNS, check_phase2, digest_table
from backend.models import Base, SystemSettings
from backend.tests import test_phase2
from backend.utils.backups import cipher, export_backup, restore_backup


class SettingsCleanupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call = self.fixture.call
        with self.fixture.test_engine.begin() as connection:
            connection.execute(text("UPDATE system_settings SET secondary_color='#112233', profile_pic_url='old-profile', login_background='old-background'"))

    def test_settings_work_before_cleanup_and_retired_upload_is_removed(self):
        response = self.call("GET", "/api/settings")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(set(RETIRED_SETTINGS_COLUMNS).isdisjoint(response.json()))
        response = self.call("PUT", "/api/settings/update", json={
            "system_name": "Preserved school", "secondary_color": "#445566",
            "existing_profile_pic_url": "discarded", "existing_logo_url": "current-logo",
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["settings"]["logo_url"], "current-logo")
        self.assertTrue(set(RETIRED_SETTINGS_COLUMNS).isdisjoint(response.json()["settings"]))
        self.assertEqual(self.call("POST", "/api/settings/upload-background").status_code, 404)
        with self.fixture.test_engine.begin() as connection:
            check_phase2(connection, self.fixture.schema)
            self.assertEqual(tuple(connection.execute(text("SELECT secondary_color, profile_pic_url, login_background FROM system_settings")).one()),
                             ("#112233", "old-profile", "old-background"))

    def test_migration_preserves_every_other_field_and_is_repeatable(self):
        with self.fixture.test_engine.begin() as connection:
            other_before = {name: digest_table(connection, name) for name in Base.metadata.tables if name != "system_settings"}
            settings_before = dict(connection.execute(SystemSettings.__table__.select()).mappings().one())
            self.assertTrue(migration.apply_settings_cleanup(connection, self.fixture.schema))
            self.assertFalse(migration.apply_settings_cleanup(connection, self.fixture.schema))
            migration.check_settings_cleanup(connection, self.fixture.schema)
            self.assertEqual(set(SystemSettings.__table__.columns.keys()),
                             {c["name"] for c in inspect(connection).get_columns("system_settings", schema=self.fixture.schema)})
            self.assertEqual(settings_before, dict(connection.execute(SystemSettings.__table__.select()).mappings().one()))
            self.assertEqual(other_before, {name: digest_table(connection, name) for name in other_before})
            self.assertEqual(connection.execute(text("SELECT count(*) FROM ames_schema_migrations WHERE version=:v"), {"v": migration.VERSION}).scalar_one(), 1)
        response = self.call("PUT", "/api/settings/update", json={"primary_color": "#123456", "school_year_start_month": 7})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["settings"]["primary_color"], "#123456")

    def test_dependent_view_refuses_drop_without_partial_column_removal(self):
        with self.fixture.test_engine.begin() as connection:
            connection.execute(text("CREATE VIEW retained_branding_view AS SELECT profile_pic_url FROM system_settings"))
        with self.assertRaises(DBAPIError), self.fixture.test_engine.begin() as connection:
            migration.apply_settings_cleanup(connection, self.fixture.schema)
        self.assert_legacy_columns_and_no_ledger_entry()

    def test_caller_rollback_restores_columns_and_migration_ledger(self):
        with self.assertRaisesRegex(RuntimeError, "rollback"), self.fixture.test_engine.begin() as connection:
            migration.apply_settings_cleanup(connection, self.fixture.schema)
            raise RuntimeError("rollback")
        self.assert_legacy_columns_and_no_ledger_entry()

    def assert_legacy_columns_and_no_ledger_entry(self):
        with self.fixture.test_engine.begin() as connection:
            select_schema(connection, self.fixture.schema)
            self.assertTrue(set(RETIRED_SETTINGS_COLUMNS) <= {c["name"] for c in inspect(connection).get_columns("system_settings", schema=self.fixture.schema)})
            self.assertEqual(tuple(connection.execute(text("SELECT secondary_color, profile_pic_url, login_background FROM system_settings")).one()),
                             ("#112233", "old-profile", "old-background"))
            self.assertFalse(connection.execute(text("SELECT EXISTS (SELECT 1 FROM ames_schema_migrations WHERE version=:v)"), {"v": migration.VERSION}).scalar_one())

    def test_old_encrypted_backups_restore_but_unknown_settings_keys_still_fail(self):
        with self.fixture.sessions() as db:
            document = json.loads(cipher().decrypt(export_backup(db)))
        settings = document["system_settings"][0]
        self.assertTrue(set(RETIRED_SETTINGS_COLUMNS).isdisjoint(settings))
        settings.update(secondary_color="#abcdef", profile_pic_url="historical", login_background="historical")
        legacy_backup = cipher().encrypt(json.dumps(document).encode())
        with self.fixture.test_engine.begin() as connection:
            migration.apply_settings_cleanup(connection, self.fixture.schema)
        with self.fixture.sessions() as db:
            restore_backup(db, legacy_backup)
            self.assertTrue(set(RETIRED_SETTINGS_COLUMNS).isdisjoint(json.loads(cipher().decrypt(export_backup(db)))["system_settings"][0]))
            before = digest_table(db.connection(), "system_settings")
            settings["unexpected_setting"] = "reject"
            with self.assertRaises(HTTPException) as caught:
                restore_backup(db, cipher().encrypt(json.dumps(document).encode()))
            self.assertEqual(caught.exception.status_code, 400)
            self.assertEqual(before, digest_table(db.connection(), "system_settings"))

    def test_schema_checks_reject_reintroduced_columns_after_cleanup(self):
        with self.fixture.test_engine.begin() as connection:
            with self.assertRaises(MigrationError):
                migration.check_settings_cleanup(connection, self.fixture.schema)
            migration.apply_settings_cleanup(connection, self.fixture.schema)
            connection.execute(text("ALTER TABLE system_settings ADD COLUMN secondary_color VARCHAR(10)"))
            with self.assertRaises(MigrationError):
                check_phase2(connection, self.fixture.schema)
            with self.assertRaises(MigrationError):
                migration.check_settings_cleanup(connection, self.fixture.schema)
