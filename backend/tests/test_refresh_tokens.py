"""Refresh JWT contracts against disposable PostgreSQL schemas and real HTTP routes."""
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import AsyncMock, patch

from jose import jwt
from pydantic import ValidationError

from backend.config.settings import settings
from backend.models import Parent, Teacher, User
from backend.models.user import UserRole
from backend.tests import test_phase2
from backend.tests.test_security_batch2 import config


class RefreshSettingsTests(unittest.TestCase):
    def test_lifetimes_are_positive_and_refresh_exceeds_access(self):
        self.assertEqual(config().ACCESS_TOKEN_EXPIRE_MINUTES, 30)
        self.assertEqual(config().REFRESH_TOKEN_EXPIRE_MINUTES, 1440)
        for value in (0, -1, 30, 29):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                config(REFRESH_TOKEN_EXPIRE_MINUTES=value)


class RefreshTokenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.client, self.sessions = self.fixture.client, self.fixture.sessions

    def renew(self, token):
        return self.client.post("/api/auth/refresh", json={"refresh_token": token})

    def assert_revoked(self, token):
        result = self.renew(token)
        self.assertEqual(result.status_code, 401, result.text)
        self.assertEqual(result.json()["code"], "SESSION_REVOKED")

    def test_login_aliases_registration_and_otp_return_both_tokens(self):
        for path in ("/api/auth/login", "/api/auth/login-step1"):
            result = self.client.post(path, json={"email": "adviser@example.com", "password": test_phase2.PASSWORD})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()["token"], result.json()["access_token"])
            self.assertEqual(jwt.get_unverified_claims(result.json()["refresh_token"])["tokenType"], "refresh")
        parent = self.client.post("/api/auth/register-parent", json={"email": "new@example.com", "firstName": "New", "lastName": "Parent", "password": test_phase2.PASSWORD})
        self.assertEqual(parent.status_code, 201, parent.text)
        self.assertEqual(self.renew(parent.json()["refresh_token"]).status_code, 200)
        with patch.object(settings, "ENABLE_OTP", True), patch("backend.routes.auth.send_otp_email", new_callable=AsyncMock) as mail:
            challenge = self.fixture.login().json()["challengeToken"]
            verified = self.client.post("/api/auth/verify-otp", json={"challengeToken": challenge, "otp": mail.call_args.args[1]})
        self.assertEqual(verified.status_code, 200, verified.text)
        self.assertIn("refresh_token", verified.json())

    def test_refresh_rotates_and_extends_lifetime_with_current_context(self):
        with patch.object(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 30):
            session = self.fixture.login().json()
            claims = jwt.get_unverified_claims(session["refresh_token"])
            # A still-valid older refresh token slides forward from this renewal.
            old = jwt.encode({**claims, "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, settings.SECRET_KEY, algorithm="HS256")
            with self.sessions() as db:
                db.get(Teacher, 1).allow_eccd_question_management = True
                db.commit()
            renewed = self.renew(old)
        self.assertEqual(renewed.status_code, 200, renewed.text)
        data = renewed.json()
        self.assertNotEqual(data["refresh_token"], old)
        self.assertNotEqual(jwt.get_unverified_claims(data["refresh_token"])["jti"], claims["jti"])
        self.assertEqual(data["access_token"], data["token"])
        self.assertTrue(data["user"]["allow_eccd_question_management"])
        now = datetime.now(timezone.utc).timestamp()
        self.assertAlmostEqual(jwt.get_unverified_claims(data["access_token"])["exp"] - now, 1800, delta=5)
        self.assertAlmostEqual(jwt.get_unverified_claims(data["refresh_token"])["exp"] - now, settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60, delta=5)
        self.assertEqual(self.client.get("/api/students/all", headers={"Authorization": "Bearer " + data["access_token"]}).status_code, 200)
        self.assertEqual(renewed.headers["cache-control"], "no-store")

    def test_token_types_cannot_be_interchanged(self):
        session = self.fixture.login().json()
        rejected = self.client.get("/api/students/all", headers={"Authorization": "Bearer " + session["refresh_token"]})
        self.assertEqual(rejected.status_code, 401)
        self.assertEqual(self.renew(session["access_token"]).json()["code"], "INVALID_TOKEN")

    def test_expired_access_can_refresh_but_expired_malformed_refresh_cannot(self):
        session = self.fixture.login().json()
        access_claims = jwt.get_unverified_claims(session["access_token"])
        expired_access = jwt.encode({**access_claims, "exp": datetime.now(timezone.utc) - timedelta(seconds=2)}, settings.SECRET_KEY, algorithm="HS256")
        rejected_access = self.client.get("/api/students/all", headers={"Authorization": "Bearer " + expired_access})
        self.assertEqual(rejected_access.json()["code"], "TOKEN_EXPIRED")
        claims = jwt.get_unverified_claims(session["refresh_token"])
        expired = jwt.encode({**claims, "exp": datetime.now(timezone.utc) - timedelta(seconds=2)}, settings.SECRET_KEY, algorithm="HS256")
        missing_exp = jwt.encode({k: v for k, v in claims.items() if k != "exp"}, settings.SECRET_KEY, algorithm="HS256")
        wrong_key = jwt.encode(claims, "wrong-key", algorithm="HS256")
        for token, code in ((expired, "TOKEN_EXPIRED"), ("malformed", "INVALID_TOKEN"), (missing_exp, "INVALID_TOKEN"), (wrong_key, "INVALID_TOKEN")):
            result = self.renew(token)
            self.assertEqual(result.status_code, 401)
            self.assertEqual(result.json()["code"], code)
        self.assertEqual(self.renew(session["refresh_token"]).status_code, 200)

    def test_password_replacement_revokes_old_pair_and_returns_new_pair(self):
        session = self.fixture.login().json()
        changed = self.fixture.call("POST", "/api/teachers/change-password-verify", 2, json={"oldPassword": test_phase2.PASSWORD, "newPassword": "Changed456"})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assert_revoked(session["refresh_token"])
        self.assertEqual(self.renew(changed.json()["refresh_token"]).status_code, 200)

    def test_chairman_email_replacement_revokes_old_refresh(self):
        session = self.fixture.login("chairman").json()
        changed = self.fixture.call("PUT", "/api/chairman/account", json={"currentPassword": test_phase2.PASSWORD, "newEmail": "updated@example.com"})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assert_revoked(session["refresh_token"])
        self.assertEqual(self.renew(changed.json()["refresh_token"]).status_code, 200)

    def test_live_role_status_security_version_and_profiles_revoke_refresh(self):
        for field, value in (("role", UserRole.SUPER_ADMIN), ("is_active", False), ("is_registration_pending", True), ("security_version", 1)):
            session = self.fixture.login().json()
            with self.sessions() as db:
                user = db.get(User, 2)
                previous = getattr(user, field)
                setattr(user, field, value)
                db.commit()
            self.assert_revoked(session["refresh_token"])
            with self.sessions() as db:
                setattr(db.get(User, 2), field, previous)
                db.commit()
        session = self.fixture.login("stranger").json()
        with self.sessions() as db:
            db.delete(db.query(Parent).filter_by(user_id=6).one())
            db.commit()
        self.assert_revoked(session["refresh_token"])

    def test_archive_and_restore_permanently_revoke_old_refresh(self):
        session = self.fixture.login().json()
        self.assertEqual(self.fixture.call("PUT", "/api/teachers/2/archive").status_code, 200)
        self.assert_revoked(session["refresh_token"])
        self.assertEqual(self.fixture.call("PUT", "/api/teachers/2/unarchive").status_code, 200)
        self.assert_revoked(session["refresh_token"])

    def test_first_login_restriction_survives_refresh_and_logout_needs_no_body(self):
        with self.sessions() as db:
            db.get(User, 2).is_first_login = True
            db.commit()
        session = self.fixture.login().json()
        renewed = self.renew(session["refresh_token"])
        self.assertEqual(renewed.status_code, 200)
        restricted = self.client.get("/api/students/all", headers={"Authorization": "Bearer " + renewed.json()["access_token"]})
        self.assertEqual(restricted.json()["code"], "PASSWORD_CHANGE_REQUIRED")
        self.assertEqual(self.client.post("/api/auth/logout").status_code, 200)
