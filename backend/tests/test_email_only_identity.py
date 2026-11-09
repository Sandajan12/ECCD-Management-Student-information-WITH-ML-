"""Migration 013 checks in disposable schemas; never migrate the live schema."""
import unittest
from uuid import uuid4

from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from backend.config.database import engine
from backend.migrations import email_only_identity as migration, phase1, phase2
from backend.models import Base


class EmailOnlyIdentityTests(unittest.TestCase):
    def setUp(self):
        self.schema = "identity_test_" + uuid4().hex
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
            phase1.apply_phase1(connection, self.schema)
            phase2.apply_phase2(connection, self.schema)

    def tearDown(self):
        self.assertRegex(self.schema, r"^identity_test_[a-f0-9]{32}$")
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))

    def add_account(self, connection, identifier, email, role="user"):
        connection.execute(text("INSERT INTO users (user_id, username, email, password_hash, role, is_active) VALUES (:id, :name, :email, 'preserved-hash', :role, false)"),
                           {"id": identifier, "name": f"Account {identifier}", "email": email, "role": role})

    def test_accounts_preserved_name_backfilled_index_enforced_and_repeat_noop(self):
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            self.add_account(connection, 1, " Chairman@Example.COM ", "super-admin")
            self.add_account(connection, 2, " Parent@Example.COM ")
            self.add_account(connection, 3, None)
            self.add_account(connection, 4, None)
            before = list(connection.execute(text("SELECT to_jsonb(u)-'username'-'email' FROM users u ORDER BY user_id")))
            self.assertTrue(migration.apply_email_only_identity(connection, self.schema))
            self.assertFalse(migration.apply_email_only_identity(connection, self.schema))
            self.assertEqual(before, list(connection.execute(text("SELECT to_jsonb(u)-'email' FROM users u ORDER BY user_id"))))
            self.assertEqual(connection.execute(text("SELECT chairman_name FROM system_settings WHERE id=1")).scalar_one(), "Account 1")
            settings = connection.execute(text("SELECT system_title, primary_color, current_school_year FROM system_settings WHERE id=1")).one()
            self.assertTrue(all(value is not None for value in settings))
            self.assertEqual(connection.execute(text("SELECT email FROM users WHERE user_id=2")).scalar_one(), "parent@example.com")
            phase2.check_phase2(connection, self.schema)
            with self.assertRaises(IntegrityError), connection.begin_nested():
                connection.execute(text("INSERT INTO users (email, password_hash) VALUES ('PARENT@EXAMPLE.COM', 'x')"))

    def test_duplicate_normalized_emails_refuse_atomically(self):
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            self.add_account(connection, 1, " User@example.com")
            self.add_account(connection, 2, "user@EXAMPLE.com ")
        with self.assertRaisesRegex(phase1.MigrationError, "duplicate"), engine.begin() as connection:
            migration.apply_email_only_identity(connection, self.schema)
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            self.assertIn("username", {c["name"] for c in inspect(connection).get_columns("users", schema=self.schema)})
            self.assertNotIn("chairman_name", {c["name"] for c in inspect(connection).get_columns("system_settings", schema=self.schema)})
            self.assertEqual(connection.execute(text("SELECT count(*) FROM users")).scalar_one(), 2)
            self.assertFalse(connection.execute(text("SELECT EXISTS (SELECT 1 FROM ames_schema_migrations WHERE version=:v)"), {"v": migration.VERSION}).scalar_one())

    def test_no_chairman_does_not_create_settings_and_check_requires_migration(self):
        with engine.begin() as connection:
            with self.assertRaises(phase1.MigrationError):
                migration.check_email_only_identity(connection, self.schema)
            migration.apply_email_only_identity(connection, self.schema)
            self.assertEqual(connection.execute(text("SELECT count(*) FROM system_settings")).scalar_one(), 0)

    def test_existing_settings_and_chairman_name_are_preserved(self):
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            self.add_account(connection, 1, "chair@example.com", "super-admin")
            connection.execute(text("ALTER TABLE system_settings ADD COLUMN chairman_name VARCHAR(255)"))
            connection.execute(text("INSERT INTO system_settings (id, chairman_name, principal_name) VALUES (1, 'Configured Name', 'Principal')"))
            migration.apply_email_only_identity(connection, self.schema)
            self.assertEqual(tuple(connection.execute(text("SELECT chairman_name, principal_name FROM system_settings")).one()), ("Configured Name", "Principal"))

    def test_phase2_checks_current_unversioned_orm_schema(self):
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            # Replace only this test's disposable schema with the current ORM.
            for table in reversed(phase1.Base.metadata.sorted_tables):
                connection.execute(text(f'DROP TABLE "{table.name}" CASCADE'))
            connection.execute(text("DROP TABLE ames_schema_migrations"))
            Base.metadata.create_all(connection)
            phase2.check_phase2(connection, self.schema)

    def test_check_rejects_missing_expression_index(self):
        with engine.begin() as connection:
            migration.apply_email_only_identity(connection, self.schema)
            connection.execute(text("DROP INDEX ux_users_email_lower"))
            with self.assertRaises(phase1.MigrationError):
                migration.check_email_only_identity(connection, self.schema)


if __name__ == "__main__":
    unittest.main()
