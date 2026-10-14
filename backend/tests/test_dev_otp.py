"""The single OTP toggle controls SMTP delivery and challenge verification."""
import asyncio
import unittest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch

from backend.config.settings import Settings
from backend.utils.email import send_otp_email
from backend.models.email_verification import OtpPurpose
from backend.models.user import User, UserRole
from backend.utils.authentication import issue_challenge


def config(environment: str = "production", **flags) -> Settings:
    return Settings(_env_file=None, DATABASE_URL="postgresql://localhost/test?sslmode=verify-full&sslrootcert=system", SECRET_KEY="SyntheticTestSecret0123456789abcdef",
                    BACKUP_ENCRYPTION_KEY="test-only", BACKUP_IV="test-only", ENVIRONMENT=environment, **flags)


class DevelopmentOtpTests(unittest.TestCase):
    def test_local_login_challenge_and_bypass(self):
        from fastapi.testclient import TestClient
        from sqlalchemy.orm import Session
        from backend.config.database import engine, get_db
        from backend.config.settings import settings
        from backend.main import api
        from backend.utils.security import get_password_hash
        from backend.utils.rate_limits import limits

        if engine.url.database != "ames_parity_dev" or engine.url.host not in ("localhost", "127.0.0.1", "::1"):
            self.skipTest("HTTP auth check is restricted to the separate local parity database")
        username = f"otp-check-{uuid4().hex[:12]}"
        password = "LocalTest123!"
        with engine.connect() as connection:
            transaction = connection.begin()
            db = Session(bind=connection, join_transaction_mode="create_savepoint")
            db.add(User(username=username, email=f"{username}@example.com", password_hash=get_password_hash(password),
                        role=UserRole.SUPER_ADMIN, is_active=True, is_first_login=False, is_registration_pending=False))
            db.commit()
            def database():
                yield db
            previous = api.dependency_overrides.get(get_db)
            api.dependency_overrides[get_db] = database
            rate_bypass = patch.object(limits, "bypass", True)
            rate_bypass.start()
            client = TestClient(api)
            try:
                with patch.object(settings, "ENABLE_OTP", True), patch("backend.utils.authentication.secrets.randbelow", return_value=554321), patch("backend.utils.email.FastMail") as mail:
                    mail.return_value.send_message = AsyncMock()
                    self.assertEqual(client.post("/api/auth/login", json={"email": username, "password": "wrong"}).status_code, 401)
                    result = client.post("/api/auth/login", json={"email": username, "password": password})
                    self.assertEqual(result.status_code, 200)
                    self.assertTrue(result.json()["requireOtp"])
                    challenge = result.json()["challengeToken"]
                    self.assertEqual(client.post("/api/auth/verify-otp", json={"challengeToken": challenge, "otp": "000000"}).status_code, 400)
                    self.assertEqual(client.post("/api/auth/verify-otp", json={"challengeToken": challenge, "otp": "123456"}).status_code, 400)
                    verified = client.post("/api/auth/verify-otp", json={"challengeToken": challenge, "otp": "654321"})
                    self.assertEqual(verified.status_code, 200)
                    self.assertEqual(verified.json()["user"]["role"], "super-admin")
                    self.assertFalse(verified.json()["requireOtp"])
                    self.assertEqual(client.post("/api/auth/verify-otp", json={"challengeToken": challenge, "otp": "654321"}).status_code, 400)
                    mail.return_value.send_message.assert_awaited_once()
                    with patch.object(settings, "ENABLE_OTP", False):
                        bypass = client.post("/api/auth/login-step1", json={"email": username, "password": password})
                        self.assertEqual(bypass.status_code, 200)
                        self.assertFalse(bypass.json()["requireOtp"])
                        self.assertEqual(client.post("/api/auth/login-step1", json={"email": username, "password": "wrong"}).status_code, 401)
                        account = db.query(User).filter_by(username=username).one()
                        master_challenge, master_code = issue_challenge(db, account, OtpPurpose.LOGIN)
                        db.commit()
                        self.assertEqual(master_code, "123456")
                        master_verified = client.post("/api/auth/verify-otp", json={"challengeToken": master_challenge, "otp": "123456"})
                        self.assertEqual(master_verified.status_code, 200)
                        mail.return_value.send_message.assert_awaited_once()
            finally:
                client.close()
                rate_bypass.stop()
                limits.reset()
                if previous is None:
                    api.dependency_overrides.pop(get_db, None)
                else:
                    api.dependency_overrides[get_db] = previous
                db.close()
                transaction.rollback()

    def test_master_code_is_generated_only_when_disabled(self):
        user = User(user_id=1, username="test", email="test@example.com", password_hash="test-hash", role=UserRole.SUPER_ADMIN)
        for enabled, expected in ((False, "123456"), (True, "100000")):
            value = config(ENABLE_OTP=enabled)
            with patch("backend.utils.authentication.settings", value), patch("backend.utils.authentication.secrets.randbelow", return_value=0):
                token, code = issue_challenge(MagicMock(), user, OtpPurpose.LOGIN)
            self.assertTrue(token)
            self.assertEqual(code, expected)

    def test_enable_otp_is_the_only_toggle(self):
        for environment in ("development", "production", "staging", ""):
            for enabled in (False, True):
                self.assertEqual(config(environment, ENABLE_OTP=enabled).otp_enabled, enabled)

    def test_default_requires_email_otp(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertTrue(config().otp_enabled)

    def test_disabled_skips_smtp_and_logs_bypass(self):
        value = config(ENABLE_OTP=False)
        with patch("backend.utils.email.settings", value), patch("backend.utils.email.FastMail") as mail, self.assertLogs("uvicorn.error", level="INFO") as logs:
            asyncio.run(send_otp_email("chairman.dev@example.com", "123456"))
        mail.assert_not_called()
        self.assertIn("[DEV] Bypassed OTP for chairman.dev@example.com", logs.output[0])
        self.assertNotIn("123456", " ".join(logs.output))

    def test_enabled_dispatches_email_without_logging_code(self):
        value = config(ENABLE_OTP=True)
        with patch("backend.utils.email.settings", value), patch("backend.utils.email.FastMail") as mail, self.assertLogs("uvicorn.error", level="INFO") as logs:
            mail.return_value.send_message = AsyncMock()
            asyncio.run(send_otp_email("chairman.dev@example.com", "654321"))
            message = mail.return_value.send_message.call_args.args[0]
            self.assertEqual([recipient.email for recipient in message.recipients], ["chairman.dev@example.com"])
            self.assertIn("654321", message.body)
            self.assertEqual(mail.call_args.args[0].MAIL_DEBUG, 0)
            self.assertEqual(mail.call_args.args[0].SUPPRESS_SEND, 0)
            self.assertIn("[AUTH] OTP sent via email to chairman.dev@example.com", logs.output[0])
            self.assertNotIn("654321", " ".join(logs.output))

    def test_failed_delivery_does_not_log_success(self):
        with patch("backend.utils.email.settings", config(ENABLE_OTP=True)), patch("backend.utils.email.FastMail") as mail, patch("backend.utils.email.logging.getLogger") as logger:
            mail.return_value.send_message = AsyncMock(side_effect=RuntimeError("SMTP unavailable"))
            with self.assertRaises(RuntimeError):
                asyncio.run(send_otp_email("chairman.dev@example.com", "654321"))
            logger.return_value.info.assert_not_called()


if __name__ == "__main__":
    unittest.main()
