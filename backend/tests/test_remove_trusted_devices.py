"""OTP-bypass removal, backward-compatible backups and isolated PostgreSQL cleanup."""
import json
import subprocess
import sys
import unittest

from fastapi import HTTPException
from sqlalchemy import event, inspect, text

from backend.migrations import remove_trusted_devices as migration
from backend.migrations.phase1 import Base as HistoricalBase, MigrationError, select_schema
from backend.migrations.phase2 import check_phase2, digest_table
from backend.models import Base, RefreshSession, User
from backend.tests import test_phase2
from backend.utils.authentication import build_session
from backend.utils.backups import cipher, export_backup, restore_backup


class DeviceRemovalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        # Recreate only the historical table to exercise code-first deployment.
        with self.fixture.test_engine.begin() as connection:
            select_schema(connection, self.fixture.schema)
            connection.execute(text("DELETE FROM ames_schema_migrations WHERE version=:version"), {"version": migration.VERSION})
            HistoricalBase.metadata.tables[migration.TABLE].create(connection)
            connection.execute(text("INSERT INTO user_trusted_devices (user_id, device_token_hash, expires_at) VALUES (2, :hash, now()+interval '30 days')"), {"hash": "a" * 64})
            connection.execute(text("ALTER TABLE user_trusted_devices ENABLE ROW LEVEL SECURITY"))
            connection.execute(text("CREATE POLICY retired_device_policy ON user_trusted_devices USING (user_id > 0)"))

    def test_cli_check_apply_check_in_isolated_schema(self):
        command = [sys.executable, "-m", "backend.migrations.remove_trusted_devices", "--schema", self.fixture.schema]
        pending = subprocess.run([*command, "--check"], capture_output=True, text=True, timeout=30)
        self.assertEqual(pending.returncode, 1, pending.stdout)
        self.assertIn("pending", pending.stdout)
        for action in ("--apply", "--check", "--apply"):
            result = subprocess.run([*command, action], capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout)

    def test_check_apply_check_preserves_all_other_records_and_repeat_is_noop(self):
        with self.fixture.sessions() as db:
            build_session(db, db.get(User, 2))
            db.commit()
        with self.fixture.test_engine.begin() as connection:
            with self.assertRaisesRegex(MigrationError, "pending"):
                migration.check_remove_trusted_devices(connection, self.fixture.schema)
            before = {name: digest_table(connection, name) for name in Base.metadata.tables}
            self.assertTrue(migration.apply_remove_trusted_devices(connection, self.fixture.schema))
            migration.check_remove_trusted_devices(connection, self.fixture.schema)
            self.assertFalse(migration.apply_remove_trusted_devices(connection, self.fixture.schema))
            check_phase2(connection, self.fixture.schema)
            self.assertEqual(before, {name: digest_table(connection, name) for name in before})
            self.assertNotIn(migration.TABLE, inspect(connection).get_table_names(schema=self.fixture.schema))

    def test_dependency_preflight_refuses_views_and_foreign_keys(self):
        for ddl, cleanup in (("CREATE VIEW device_dependency AS SELECT id FROM user_trusted_devices", "DROP VIEW device_dependency"),
                             ("CREATE TABLE device_dependency (device_id integer REFERENCES user_trusted_devices(id))", "DROP TABLE device_dependency")):
            with self.subTest(ddl=ddl):
                with self.fixture.test_engine.begin() as connection:
                    connection.execute(text(ddl))
                for operation in (migration.check_remove_trusted_devices, migration.apply_remove_trusted_devices):
                    with self.assertRaisesRegex(MigrationError, "dependencies"), self.fixture.test_engine.begin() as connection:
                        operation(connection, self.fixture.schema)
                with self.fixture.test_engine.begin() as connection:
                    self.assertEqual(connection.execute(text("SELECT count(*) FROM user_trusted_devices")).scalar_one(), 1)
                    self.assertFalse(connection.execute(text("SELECT EXISTS (SELECT 1 FROM ames_schema_migrations WHERE version=:v)"), {"v": migration.VERSION}).scalar_one())
                    connection.execute(text(cleanup))

    def test_rollback_restores_table_and_ledger(self):
        with self.assertRaisesRegex(RuntimeError, "rollback"), self.fixture.test_engine.begin() as connection:
            migration.apply_remove_trusted_devices(connection, self.fixture.schema)
            raise RuntimeError("rollback")
        with self.fixture.test_engine.begin() as connection:
            self.assertEqual(connection.execute(text("SELECT count(*) FROM user_trusted_devices")).scalar_one(), 1)
            with self.assertRaisesRegex(MigrationError, "pending"):
                migration.check_remove_trusted_devices(connection, self.fixture.schema)

    def test_old_and_new_backups_discard_trust_preserve_accounts_and_clear_refresh(self):
        with self.fixture.sessions() as db:
            exported = export_backup(db)
            document = json.loads(cipher().decrypt(exported))
            self.assertNotIn("user_trusted_devices", document)
            self.assertNotIn("auth_refresh_sessions", document)
            account_before = digest_table(db.connection(), "users")
        document["user_trusted_devices"] = [{"obsolete": "discard only this collection"}]
        legacy = cipher().encrypt(json.dumps(document).encode())
        with self.fixture.test_engine.begin() as connection:
            migration.apply_remove_trusted_devices(connection, self.fixture.schema)
        for payload in (legacy, exported):
            with self.fixture.sessions() as db:
                build_session(db, db.get(User, 2))
                db.commit()
                self.assertGreater(db.query(RefreshSession).count(), 0)
                restore_backup(db, payload)
                self.assertEqual(db.query(RefreshSession).count(), 0)
                self.assertEqual(digest_table(db.connection(), "users"), account_before)
        document["unknown_collection"] = []
        with self.fixture.sessions() as db, self.assertRaises(HTTPException):
            restore_backup(db, cipher().encrypt(json.dumps(document).encode()))

    def test_runtime_never_queries_retired_table_before_or_after_cleanup(self):
        statements = []
        def capture(connection, cursor, statement, parameters, context, executemany):
            statements.append(statement)
        for removed in (False, True):
            if removed:
                with self.fixture.test_engine.begin() as connection:
                    migration.apply_remove_trusted_devices(connection, self.fixture.schema)
            event.listen(self.fixture.test_engine, "before_cursor_execute", capture)
            try:
                response = self.fixture.login(rememberMe=True, deviceToken="retired")
                self.assertEqual(response.status_code, 200, response.text)
                self.assertNotIn("deviceToken", response.json())
                self.assertEqual(self.fixture.client.post("/api/auth/refresh").status_code, 200)
                self.assertEqual(self.fixture.client.post("/api/auth/logout", json={"forgetDevice": True}).status_code, 200)
            finally:
                event.remove(self.fixture.test_engine, "before_cursor_execute", capture)
        self.assertFalse(any("user_trusted_devices" in statement for statement in statements))
