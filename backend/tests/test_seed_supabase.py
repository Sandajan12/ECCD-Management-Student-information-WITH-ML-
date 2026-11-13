"""Production bootstrap integration checks using disposable PostgreSQL schemas."""

from contextlib import redirect_stdout
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import StringIO
import json
import re
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from backend.config.database import engine
from backend.migrations import phase1
from backend.models import Base, EccdDomain, EccdQuestion, EmailVerification, User, SystemSettings
from backend.models.email_verification import OtpPurpose
from backend.models.user import UserRole
from backend.scripts.seed_supabase import (
    BootstrapError, ChairmanSettings, MIGRATIONS, bootstrap, load_reference, main,
)
from backend.utils.authentication import build_session, now, session_user
from backend.utils.security import get_password_hash, verify_password


class SupabaseSeedTests(unittest.TestCase):
    def setUp(self):
        self.schema = "bootstrap_test_" + uuid4().hex
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.credentials = ChairmanSettings(
            _env_file=None, INITIAL_CHAIRMAN_EMAIL="bootstrap@example.com",
            INITIAL_CHAIRMAN_PASSWORD="Bootstrap123!", INITIAL_CHAIRMAN_NAME="Test Chairman",
        )
        self.empty_credentials = ChairmanSettings(
            _env_file=None, INITIAL_CHAIRMAN_EMAIL=None,
            INITIAL_CHAIRMAN_PASSWORD=None, INITIAL_CHAIRMAN_NAME=None,
        )

    def tearDown(self):
        if not re.fullmatch(r"bootstrap_test_[a-f0-9]{32}", self.schema):
            raise AssertionError("Unsafe test schema cleanup target")
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))

    def run_seed(self, credentials=None, update=False):
        with engine.begin() as connection:
            return bootstrap(connection, credentials or self.credentials, self.schema, update)

    def snapshot(self):
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            data = {}
            for table in sorted(inspect(connection).get_table_names(schema=self.schema)):
                data[table] = list(connection.execute(text(f'SELECT to_jsonb(t)::text FROM "{table}" t ORDER BY to_jsonb(t)::text')).scalars())
            data["sequences"] = list(connection.execute(text(
                "SELECT sequencename, last_value FROM pg_sequences WHERE schemaname=:schema ORDER BY sequencename"
            ), {"schema": self.schema}))
            return data

    def test_empty_bootstrap_exact_fixture_and_second_run_noop(self):
        result = self.run_seed()
        self.assertEqual(result, {"migrations_applied": [v for v, _ in MIGRATIONS],
                                  "domains_inserted": 7, "questions_inserted": 109, "chairman": "created"})
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            self.assertTrue(set(Base.metadata.tables) <= set(inspect(connection).get_table_names(schema=self.schema)))
            self.assertIn("api_rate_limits", inspect(connection).get_table_names(schema=self.schema))
            self.assertEqual(list(connection.execute(text("SELECT version FROM ames_schema_migrations ORDER BY version")).scalars()), [v for v, _ in MIGRATIONS])
            fixture = load_reference()
            self.assertEqual(list(connection.execute(select(EccdDomain.__table__).order_by(EccdDomain.domain_id)).mappings()), fixture["domains"])
            self.assertEqual(list(connection.execute(select(EccdQuestion.__table__).order_by(EccdQuestion.question_id)).mappings()), fixture["questions"])
            with Session(bind=connection) as db:
                user = db.scalars(select(User)).one()
                self.assertEqual(user.role, UserRole.SUPER_ADMIN)
                self.assertTrue(user.is_active)
                self.assertFalse(user.is_registration_pending)
                self.assertFalse(user.is_first_login)
                self.assertEqual(db.get(SystemSettings, 1).chairman_name, "Test Chairman")
                self.assertNotEqual(user.password_hash, "Bootstrap123!")
                self.assertTrue(verify_password("Bootstrap123!", user.password_hash))
                token = build_session(db, user)["token"]
                self.assertEqual(session_user(db, token).user_id, user.user_id)
        before = self.snapshot()
        self.assertEqual(self.run_seed(), {"migrations_applied": [], "domains_inserted": 0,
                                          "questions_inserted": 0, "chairman": "preserved"})
        self.assertEqual(self.snapshot(), before)
        # No credentials are required once the Chairman exists; nothing is reset.
        self.run_seed(self.empty_credentials)
        self.assertEqual(self.snapshot(), before)

    def test_resume_phase1_and_partial_fixture_preserving_extra_rows_and_sequence(self):
        fixture = load_reference()
        with engine.begin() as connection:
            phase1.apply_phase1(connection, self.schema)
            connection.execute(EccdDomain.__table__.insert(), fixture["domains"][:2])
            connection.execute(EccdQuestion.__table__.insert(), fixture["questions"][:3])
        result = self.run_seed()
        self.assertEqual(result["migrations_applied"], [v for v, _ in MIGRATIONS][1:])
        self.assertEqual((result["domains_inserted"], result["questions_inserted"]), (5, 106))
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            domain_id = connection.execute(text("INSERT INTO eccd_domains (domain_name) VALUES ('Custom Domain') RETURNING domain_id")).scalar_one()
            question_id = connection.execute(text("INSERT INTO eccd_questions (domain_id, question_text, sequence_order) VALUES (:domain, 'Custom indicator', 1) RETURNING question_id"), {"domain": domain_id}).scalar_one()
            self.assertGreater(domain_id, 7)
            self.assertGreater(question_id, 109)
            connection.execute(text(f'ALTER SEQUENCE "{self.schema}".eccd_questions_question_id_seq RESTART WITH 500'))
        before = self.snapshot()
        self.run_seed()
        self.assertEqual(self.snapshot(), before)

    def test_missing_credentials_rolls_back_all_schema_and_seed_changes(self):
        with self.assertRaises(BootstrapError):
            self.run_seed(self.empty_credentials)
        with engine.connect() as connection:
            self.assertEqual(inspect(connection).get_table_names(schema=self.schema), [])

    def test_existing_batch1_schema_applies_only_missing_credential_migration(self):
        self.run_seed()
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            connection.execute(text("DELETE FROM ames_schema_migrations WHERE version='012_auth_security_version'"))
            connection.execute(text("ALTER TABLE users DROP COLUMN security_version"))
        self.assertEqual(self.run_seed(self.empty_credentials), {
            "migrations_applied": ["012_auth_security_version"],
            "domains_inserted": 0, "questions_inserted": 0, "chairman": "preserved",
        })

    def test_concurrent_first_runs_create_one_baseline_and_account(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self.run_seed) for _ in range(2)]
            results = [future.result(timeout=60) for future in futures]
        self.assertEqual(sorted(row["chairman"] for row in results), ["created", "preserved"])
        self.assertEqual(sum(row["domains_inserted"] for row in results), 7)
        self.assertEqual(sum(row["questions_inserted"] for row in results), 109)
        self.assertEqual(sum(len(row["migrations_applied"]) for row in results), len(MIGRATIONS))
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            self.assertEqual(connection.execute(text("SELECT count(*) FROM users")).scalar_one(), 1)

    def test_conflicting_text_ids_or_item_numbers_abort_without_overwriting(self):
        self.run_seed()
        for update in (
            "UPDATE eccd_questions SET question_text='School customization' WHERE question_id=1",
            "UPDATE eccd_domains SET domain_name='School domain' WHERE domain_id=1",
            "UPDATE eccd_questions SET question_id=200 WHERE question_id=1",
        ):
            with self.subTest(update=update):
                # Roll back this entire case, including the intentional drift.
                with engine.connect() as connection:
                    transaction = connection.begin()
                    phase1.select_schema(connection, self.schema)
                    connection.execute(text(update))
                    with self.assertRaises(BootstrapError):
                        bootstrap(connection, self.credentials, self.schema)
                    transaction.rollback()
        self.assertEqual(self.run_seed()["questions_inserted"], 0)

    def test_existing_chairman_preserved_unless_explicit_update(self):
        self.run_seed()
        replacement = ChairmanSettings(
            _env_file=None, INITIAL_CHAIRMAN_EMAIL="replacement@example.com",
            INITIAL_CHAIRMAN_PASSWORD="Replacement123!", INITIAL_CHAIRMAN_NAME="New Chairman",
        )
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            with Session(bind=connection) as db:
                user = db.scalars(select(User)).one()
                token = build_session(db, user)["token"]
                db.add(EmailVerification(user_id=user.user_id, email=user.email, purpose=OtpPurpose.LOGIN,
                                         otp="", otp_hash="b" * 64, challenge_hash="c" * 64,
                                         expires_at=now() + timedelta(minutes=10)))
                db.flush()
        before = self.snapshot()
        self.run_seed(replacement)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.run_seed(replacement, update=True)["chairman"], "updated")
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            with Session(bind=connection) as db:
                user = db.scalars(select(User)).one()
                self.assertEqual(user.email, "replacement@example.com")
                self.assertTrue(verify_password("Replacement123!", user.password_hash))
                self.assertEqual(user.security_version, 1)
                self.assertEqual(db.query(EmailVerification).count(), 0)
                with self.assertRaises(HTTPException) as revoked:
                    session_user(db, token)
                self.assertEqual(revoked.exception.status_code, 401)
        before = self.snapshot()
        self.assertEqual(self.run_seed(replacement, update=True)["chairman"], "preserved")
        self.assertEqual(self.snapshot(), before)

    def test_account_collision_never_promotes_or_resets_existing_parent(self):
        self.run_seed()
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            connection.execute(text("DELETE FROM users"))
            with Session(bind=connection) as db:
                db.add(User(email="bootstrap@example.com", role=UserRole.USER,
                            password_hash=get_password_hash("Unrelated123!"), is_active=True))
                db.flush()
        before = self.snapshot()
        with self.assertRaises(BootstrapError):
            self.run_seed()
        self.assertEqual(self.snapshot(), before)

    def test_cli_apply_and_repeat_report_only_sanitized_counts(self):
        for created in (True, False):
            output = StringIO()
            with patch("sys.argv", ["seed_supabase", "--apply", "--schema", self.schema]), \
                    patch("backend.scripts.seed_supabase.ChairmanSettings", return_value=self.credentials), \
                    redirect_stdout(output):
                self.assertEqual(main(), 0)
            result = json.loads(output.getvalue())
            self.assertEqual(result["chairman"], "created" if created else "preserved")
            self.assertNotIn("bootstrap@example.com", output.getvalue())
            self.assertNotIn("Bootstrap123!", output.getvalue())

    def test_invalid_or_partial_credentials_and_schema_are_rejected(self):
        long_name = ChairmanSettings(
            _env_file=None, INITIAL_CHAIRMAN_EMAIL="long@example.com",
            INITIAL_CHAIRMAN_PASSWORD="Bootstrap123!", INITIAL_CHAIRMAN_NAME="A" * 255,
        )
        self.assertEqual(self.run_seed(long_name)["chairman"], "created")
        with engine.begin() as connection:
            phase1.select_schema(connection, self.schema)
            self.assertEqual(connection.execute(text("SELECT chairman_name FROM system_settings WHERE id=1")).scalar_one(), "A" * 255)
        for fields in (
            {"INITIAL_CHAIRMAN_EMAIL": "broken"},
            {"INITIAL_CHAIRMAN_PASSWORD": "weak"},
            {"INITIAL_CHAIRMAN_NAME": " "},
            {"INITIAL_CHAIRMAN_NAME": "A" * 256},
        ):
            with self.subTest(fields=list(fields)), self.assertRaises(ValidationError):
                ChairmanSettings(_env_file=None, **fields)
        with engine.begin() as connection, self.assertRaises(phase1.MigrationError):
            bootstrap(connection, self.credentials, "public; DROP SCHEMA public")


if __name__ == "__main__":
    unittest.main()
