"""Authentication/deployment regressions; HTTP tests use disposable schemas."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from threading import Event
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from jose import jwt
from pydantic import ValidationError
from sqlalchemy import event, text
import yaml

from backend.config.settings import Settings, settings
from backend.migrations.auth_security_version import apply_auth_security_version, check_auth_security_version
from backend.migrations.phase1 import MigrationError
from backend.models import EmailVerification, Teacher, User, UserTrustedDevice
from backend.models.email_verification import OtpPurpose
from backend.models.user import UserRole
from backend.tests import test_phase2
from backend.utils.authentication import build_session, credential_version, digest, issue_challenge, now, revoke_credentials
from backend.utils.backups import cipher, export_backup, restore_backup
from backend.utils.email import send_otp_email

ROOT = Path(__file__).resolve().parents[2]


def config(**changes):
    values = dict(_env_file=None, DATABASE_URL="postgresql://localhost/test?sslmode=verify-full&sslrootcert=system",
                  SECRET_KEY="SyntheticTestSecret0123456789abcdef", ENVIRONMENT="production", ENABLE_OTP=True,
                  BACKUP_ENCRYPTION_KEY="unused", BACKUP_IV="unused", EMAIL_TRANSPORT="brevo_api",
                  BREVO_API_KEY="xkeysib-synthetic-unit-test-key-012345", MAIL_FROM="otp@school.example.com")
    # A real backend/.env must not affect these configuration contracts.
    with patch.dict("os.environ", {}, clear=True):
        return Settings(**{**values, **changes})


class DeploymentSecurityTests(unittest.TestCase):
    def test_invalid_production_settings_do_not_echo_secret_inputs(self):
        secret = "SyntheticPrivateDatabasePassword012345"
        with self.assertRaises(ValidationError) as caught:
            config(DATABASE_URL=f"postgresql://probe:{secret}@localhost/test?sslmode=require")
        self.assertIn("Production database requires", str(caught.exception))
        self.assertNotIn(secret, str(caught.exception))
        self.assertNotIn("SyntheticTestSecret", str(caught.exception))

    def test_production_requires_otp_and_approved_algorithm(self):
        self.assertTrue(config().otp_enabled)
        for changes in ({"ENABLE_OTP": False}, {"ALGORITHM": "HS384"}, {"ALGORITHM": "none"}, {"ACCESS_TOKEN_EXPIRE_MINUTES": 0}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                config(**changes)
        self.assertFalse(config(ENVIRONMENT="development", ENABLE_OTP=False).otp_enabled)

    def test_production_email_credentials_sender_and_tls(self):
        for changes in ({"BREVO_API_KEY": None}, {"BREVO_API_KEY": ""}, {"BREVO_API_KEY": "replace_with_your_brevo_api_key"},
                        {"MAIL_FROM": "noreply@example.com"}, {"MAIL_FROM": "invalid"}, {"EMAIL_TRANSPORT": "unknown"},
                        {"EMAIL_TRANSPORT": "smtp", "MAIL_PASSWORD": ""},
                        {"EMAIL_TRANSPORT": "smtp", "MAIL_PASSWORD": "SyntheticPassword", "MAIL_STARTTLS": False, "MAIL_SSL_TLS": False},
                        {"EMAIL_TRANSPORT": "smtp", "MAIL_PASSWORD": "SyntheticPassword", "MAIL_STARTTLS": True, "MAIL_SSL_TLS": True}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                config(**changes)
        for ssl in (False, True):
            value = config(EMAIL_TRANSPORT="smtp", MAIL_PASSWORD="SyntheticPassword", MAIL_USERNAME="otp@school.example.com", MAIL_STARTTLS=not ssl, MAIL_SSL_TLS=ssl)
            self.assertEqual(value.EMAIL_TRANSPORT, "smtp")
        self.assertNotIn("xkeysib-synthetic", repr(config()))

    def test_supabase_alias_cors_and_database_tls(self):
        value = config(DATABASE_URL="postgresql://localhost/test?sslmode=verify-full", DATABASE_SSL_ROOT_CERT="/etc/secrets/ca.crt", CORS_ORIGINS="https://school.test,https://preview.test/")
        self.assertIn("https://school.test", value.allowed_origins)
        values = value.model_dump()
        values.pop("DATABASE_URL")
        values["SUPABASE_DB_URL"] = value.DATABASE_URL
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(Settings(_env_file=None, **values).DATABASE_URL, value.DATABASE_URL)
        for changes in ({"DATABASE_URL": "postgresql://localhost/test?sslmode=require"}, {"CORS_ORIGINS": "http://school.test"}, {"CORS_ORIGINS": "https://*.test"}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                config(**changes)

    def test_brevo_https_payload_and_success(self):
        captured = []
        def provider(request):
            captured.append(request)
            return httpx.Response(201, json={"messageId": "synthetic"})
        client = httpx.AsyncClient(transport=httpx.MockTransport(provider))
        with patch("backend.utils.email.settings", config()), patch("backend.utils.email.httpx.AsyncClient", return_value=client) as factory, patch("backend.utils.email.FastMail") as smtp, self.assertLogs("uvicorn.error", level="INFO") as logs:
            asyncio.run(send_otp_email("parent@example.com", "654321"))
        smtp.assert_not_called()
        factory.assert_called_once_with(timeout=15, follow_redirects=False)
        request = captured[0]
        self.assertEqual(str(request.url), "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(request.headers["api-key"], config().BREVO_API_KEY.get_secret_value())
        payload = json.loads(request.content)
        self.assertEqual(payload["sender"], {"email": "otp@school.example.com"})
        self.assertEqual(payload["to"], [{"email": "parent@example.com"}])
        self.assertIn("654321", payload["htmlContent"])
        self.assertNotIn("654321", " ".join(logs.output))
        self.assertNotIn("xkeysib", " ".join(logs.output))

    def test_brevo_failure_and_redirect_do_not_fallback_or_expose_provider(self):
        for status in (301, 400, 401, 429, 500):
            client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(status, text="private-provider-response", headers={"Location": "https://other.test"})))
            with self.subTest(status=status), patch("backend.utils.email.settings", config()), patch("backend.utils.email.httpx.AsyncClient", return_value=client), patch("backend.utils.email.FastMail") as smtp:
                with self.assertRaisesRegex(RuntimeError, "^Verification email delivery failed$"):
                    asyncio.run(send_otp_email("parent@example.com", "654321"))
                smtp.assert_not_called()

    def test_brevo_timeout_propagates_without_smtp_fallback(self):
        client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: (_ for _ in ()).throw(httpx.ReadTimeout("timeout"))))
        with patch("backend.utils.email.settings", config()), patch("backend.utils.email.httpx.AsyncClient", return_value=client), patch("backend.utils.email.FastMail") as smtp:
            with self.assertRaises(httpx.ReadTimeout):
                asyncio.run(send_otp_email("parent@example.com", "654321"))
            smtp.assert_not_called()

    def test_deployment_files_preserve_wrapper_spa_and_secret_inputs(self):
        vercel = json.loads((ROOT / "frontend/vercel.json").read_text())
        self.assertIn({"source": "/(.*)", "destination": "/index.html"}, vercel["rewrites"])
        headers = {item["key"]: item["value"] for item in vercel["headers"][0]["headers"]}
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(headers["X-Frame-Options"], "DENY")
        self.assertEqual(headers["Referrer-Policy"], "strict-origin-when-cross-origin")
        service = yaml.safe_load((ROOT / "render.yaml").read_text())["services"][0]
        self.assertEqual(service["buildCommand"], "pip install -r backend/requirements.txt")
        self.assertEqual(service["startCommand"], "uvicorn backend.main:app --host 0.0.0.0 --port $PORT")
        self.assertEqual(service["healthCheckPath"], "/ready")
        variables = {item["key"]: item for item in service["envVars"]}
        self.assertTrue(str(variables["PYTHON_VERSION"]["value"]).startswith("3.12."))
        for name in ("JWT_SECRET", "BREVO_API_KEY", "SUPABASE_DB_URL", "LRN_ENCRYPTION_KEY", "BACKUP_ENCRYPTION_KEY"):
            self.assertIs(variables[name]["sync"], False)
        script = json.loads((ROOT / "package.json").read_text())["scripts"]["start:prod"]
        self.assertEqual(script, "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}")


class AuthenticationSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call, self.sessions, self.client = self.fixture.call, self.fixture.sessions, self.fixture.client

    def test_role_matrix_and_personal_endpoint_separation(self):
        cases = [("GET", "/api/chairman/teachers", (2, 5)), ("GET", "/api/chairman/sections", (2, 5)),
                 ("GET", "/api/teachers/active", (5,)), ("GET", "/api/teachers/archived", (2, 5)),
                 ("GET", "/api/teachers/students", (1, 5)), ("GET", "/api/teacher/students", (1, 5)),
                 ("GET", "/api/teachers/settings", (1, 5)), ("GET", "/api/teachers/me/access", (1, 5)),
                 ("GET", "/api/teacher/settings/parent-assessment-access", (1, 5)),
                 ("GET", "/api/parents/children", (1, 2)),
                 ("GET", "/api/ml/students?section_id=1", (1, 5)), ("POST", "/api/ml/predict/student/1", (1, 5)),
                 ("GET", "/api/ml/parent/readiness/1", (1, 2)), ("POST", "/api/ml/parent/predict/1", (1, 2))]
        for method, path, actors in cases:
            for actor in actors:
                with self.subTest(method=method, path=path, actor=actor):
                    result = self.call(method, path, actor)
                    self.assertEqual(result.status_code, 403, result.text)
        # The backend Chairman prefix is /api/chairman; /super-admin is a UI route.
        self.assertEqual(self.call("GET", "/api/super-admin/teachers", 5).status_code, 404)
        for path, actor in (("/api/teachers/students", 2), ("/api/parents/children", 5), ("/api/chairman/teachers", 1)):
            self.assertEqual(self.call("GET", path, actor).status_code, 200)

    def test_cross_section_and_granular_permission_rechecks(self):
        for method, path, payload in (("GET", "/api/students/3", None), ("PUT", "/api/students/3", {"address": "unauthorized"}),
                                      ("GET", "/api/eccd/assessment/3", None), ("GET", "/api/ml/students?section_id=2", None),
                                      ("POST", "/api/ml/predict/student/3", None), ("GET", "/api/teacher/settings/parent-assessment-access?section_id=2", None)):
            with self.subTest(path=path):
                self.assertEqual(self.call(method, path, 2, **({"json": payload} if payload else {})).status_code, 403)
        with self.sessions() as db:
            db.get(Teacher, 1).allow_eccd_question_management = True
            db.commit()
        self.assertEqual(self.call("PUT", "/api/eccd-config/domains/1", 2, json={"domain_name": "Gross Motor"}).status_code, 200)
        with self.sessions() as db:
            db.get(Teacher, 1).allow_eccd_question_management = False
            db.commit()
        self.assertEqual(self.call("PUT", "/api/eccd-config/domains/1", 2, json={"domain_name": "Blocked"}).status_code, 403)

    def test_jwt_algorithm_expiry_tampering_and_missing_exp_are_rejected(self):
        token = self.fixture.tokens[2]
        self.assertEqual(jwt.get_unverified_header(token)["alg"], "HS256")
        claims = jwt.get_unverified_claims(token)
        no_exp = {key: value for key, value in claims.items() if key != "exp"}
        variants = [jwt.encode({**claims, "exp": datetime.now(timezone.utc) - timedelta(seconds=1)}, settings.SECRET_KEY, algorithm="HS256"),
                    jwt.encode(claims, settings.SECRET_KEY, algorithm="HS384"), jwt.encode(no_exp, settings.SECRET_KEY, algorithm="HS256"),
                    jwt.encode({**claims, "exp": None}, settings.SECRET_KEY, algorithm="HS256"),
                    jwt.encode({**claims, "role": "super-admin"}, "wrong-secret", algorithm="HS256"),
                    "eyJhbGciOiJub25lIn0." + token.split(".")[1] + "."]
        for token in variants:
            with self.subTest(token_class=jwt.get_unverified_header(token)):
                self.assertEqual(self.client.get("/api/students/all", headers={"Authorization": f"Bearer {token}"}).status_code, 401)
        self.assertEqual(self.call("GET", "/api/students/all", 2).status_code, 200)
        self.assertEqual(self.client.get("/api/students/all").status_code, 401)

    def test_live_role_and_activation_are_checked(self):
        with self.sessions() as db:
            db.get(User, 5).is_active = False
            db.commit()
        self.assertEqual(self.call("GET", "/api/parents/children", 5).status_code, 403)
        with self.sessions() as db:
            db.get(User, 6).role = UserRole.SUPER_ADMIN
            db.commit()
        self.assertEqual(self.call("GET", "/api/chairman/teachers", 6).status_code, 401)

    def test_remember_device_hash_lifetime_user_binding_and_no_sliding_expiry(self):
        result = self.fixture.login(remember_device=True)
        device = result.json()["deviceToken"]
        with self.sessions() as db:
            row = db.query(UserTrustedDevice).filter_by(user_id=2).one()
            self.assertEqual(row.device_token_hash, digest(device))
            self.assertNotEqual(row.device_token_hash, device)
            expiry = row.expires_at
            self.assertAlmostEqual((expiry - now()).total_seconds(), 30 * 86400, delta=10)
        self.client.cookies.clear()
        with patch.object(settings, "ENABLE_OTP", True), patch("backend.routes.auth.send_otp_email", new_callable=AsyncMock):
            trusted = self.fixture.login(deviceToken=device)
            self.assertFalse(trusted.json()["requireOtp"])
            self.client.cookies.clear()
            self.assertTrue(self.fixture.login("other", deviceToken=device).json()["requireOtp"])
            self.client.cookies.clear()
            self.assertTrue(self.fixture.login(deviceToken=device + "tampered").json()["requireOtp"])
            with self.sessions() as db:
                self.assertEqual(db.query(UserTrustedDevice).filter_by(user_id=2).one().expires_at, expiry)
                db.query(UserTrustedDevice).filter_by(user_id=2).update({"expires_at": now() - timedelta(seconds=1)})
                db.query(EmailVerification).filter_by(user_id=2).delete()
                db.commit()
            self.client.cookies.clear()
            self.assertTrue(self.fixture.login(deviceToken=device).json()["requireOtp"])

    def test_archive_restore_and_handover_permanently_revoke_credentials(self):
        for handover in (False, True):
            with self.subTest(handover=handover):
                if handover:
                    self.assertEqual(self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 1}).status_code, 200)
                device = self.fixture.login(rememberDevice=True).json()["deviceToken"]
                with self.sessions() as db:
                    old_token = build_session(db, db.get(User, 2))["token"]
                    challenge, code = issue_challenge(db, db.get(User, 2), OtpPurpose.LOGIN)
                    db.commit()
                if handover:
                    result = self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 2, "role": "Primary Adviser"})
                else:
                    result = self.call("PUT", "/api/teachers/2/archive")
                self.assertEqual(result.status_code, 200, result.text)
                self.assertEqual(self.client.get("/api/students/all", headers={"Authorization": f"Bearer {old_token}"}).status_code, 403)
                self.assertEqual(self.client.post("/api/auth/verify-otp", json={"challengeToken": challenge, "otp": code}).status_code, 400)
                restore = self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 1, "role": "Primary Adviser"}) if handover else self.call("PUT", "/api/teachers/2/unarchive")
                self.assertEqual(restore.status_code, 200, restore.text)
                self.assertEqual(self.client.get("/api/students/all", headers={"Authorization": f"Bearer {old_token}"}).status_code, 401)
                self.client.cookies.clear()
                with patch.object(settings, "ENABLE_OTP", True), patch("backend.routes.auth.send_otp_email", new_callable=AsyncMock):
                    self.assertTrue(self.fixture.login(deviceToken=device).json()["requireOtp"])
                with self.sessions() as db:
                    self.assertEqual(db.query(UserTrustedDevice).filter_by(user_id=2).count(), 0)
                    db.query(EmailVerification).filter_by(user_id=2).delete()
                    db.commit()

    def test_password_change_rejects_old_jwt_device_and_challenge(self):
        device = self.fixture.login(rememberDevice=True).json()["deviceToken"]
        with self.sessions() as db:
            challenge, code = issue_challenge(db, db.get(User, 2), OtpPurpose.LOGIN)
            db.commit()
        changed = self.call("POST", "/api/teachers/change-password-verify", 2, json={"oldPassword": test_phase2.PASSWORD, "newPassword": "Changed456"})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(self.call("GET", "/api/students/all", 2).status_code, 401)
        self.assertEqual(self.client.get("/api/students/all", headers={"Authorization": "Bearer " + changed.json()["token"]}).status_code, 200)
        self.assertEqual(self.client.post("/api/auth/verify-otp", json={"challengeToken": challenge, "otp": code}).status_code, 400)
        self.client.cookies.clear()
        with patch.object(settings, "ENABLE_OTP", True), patch("backend.routes.auth.send_otp_email", new_callable=AsyncMock):
            response = self.client.post("/api/auth/login", json={"email": "adviser@example.com", "password": "Changed456", "deviceToken": device})
            self.assertTrue(response.json()["requireOtp"])

    def test_otp_remember_choice_is_bound_to_hashed_single_use_challenge(self):
        codes = []
        async def delivered(address, code):
            codes.append(code)
        with patch.object(settings, "ENABLE_OTP", True), patch("backend.routes.auth.send_otp_email", side_effect=delivered):
            challenge = self.fixture.login(remember_device=True).json()["challengeToken"]
            with self.sessions() as db:
                row = db.query(EmailVerification).filter_by(challenge_hash=digest(challenge)).one()
                self.assertEqual(row.otp, "")
                self.assertNotEqual(row.otp_hash, codes[-1])
                self.assertEqual(row.attempts, 0)
                self.assertAlmostEqual((row.expires_at - now()).total_seconds(), 600, delta=5)
            verified = self.client.post("/api/auth/verify-otp", json={"challengeToken": challenge, "otp": codes[-1], "rememberDevice": False, "terms_accepted": True})
            self.assertEqual(verified.status_code, 200)
            self.assertIn("deviceToken", verified.json())
            self.assertEqual(self.client.post("/api/auth/verify-otp", json={"challengeToken": challenge, "otp": codes[-1]}).status_code, 400)
            self.client.cookies.clear()
            self.assertFalse(self.fixture.login(deviceToken=verified.json()["deviceToken"]).json()["requireOtp"])

    def test_otp_resend_cooldown_and_aliases_preserve_existing_challenge(self):
        with patch.object(settings, "ENABLE_OTP", True), patch("backend.routes.auth.send_otp_email", new_callable=AsyncMock) as mail:
            first = self.fixture.login().json()["challengeToken"]
            blocked = self.client.post("/api/auth/login-step1", json={"email": "adviser@example.com", "password": test_phase2.PASSWORD})
            self.assertEqual(blocked.status_code, 429)
            self.assertGreater(int(blocked.headers["Retry-After"]), 0)
            mail.assert_awaited_once()
            with self.sessions() as db:
                self.assertEqual(db.query(EmailVerification).filter_by(user_id=2).one().challenge_hash, digest(first))
            with patch("backend.utils.authentication.now", return_value=now() + timedelta(seconds=61)):
                second = self.fixture.login().json()["challengeToken"]
            self.assertNotEqual(first, second)
            self.assertEqual(mail.await_count, 2)
            self.assertEqual(self.client.post("/api/auth/verify-otp", json={"challengeToken": first, "otp": "123456"}).status_code, 400)

    def test_concurrent_challenge_issuance_has_one_winner(self):
        from fastapi import HTTPException
        def issue(index):
            with self.sessions() as db:
                try:
                    issue_challenge(db, db.get(User, 2), OtpPurpose.LOGIN)
                    db.commit()
                    return 200
                except HTTPException as error:
                    return error.status_code
        with ThreadPoolExecutor(max_workers=4) as executor:
            self.assertEqual(sorted(executor.map(issue, range(4))), [200, 429, 429, 429])
        with self.sessions() as db:
            self.assertEqual(db.query(EmailVerification).filter_by(user_id=2).count(), 1)

    def test_teacher_edit_waits_for_assignment_mutex_before_locking_account(self):
        from backend.routes.teachers import _update_teacher
        from backend.schemas.teacher import TeacherUpdate
        waiting = Event()
        def observe(connection, cursor, statement, parameters, context, executemany):
            if "pg_advisory_xact_lock" in statement:
                waiting.set()
        def edit():
            with self.sessions() as db:
                return _update_teacher(2, TeacherUpdate(email="updated-adviser@example.com", section_id=1), db, db.get(User, 1))
        blocked_account = None
        with ThreadPoolExecutor(max_workers=1) as executor:
            with self.sessions() as mutex:
                mutex.execute(text("SELECT pg_advisory_xact_lock(hashtext('ames.section_assignment'))"))
                event.listen(self.fixture.test_engine, "before_cursor_execute", observe)
                try:
                    future = executor.submit(edit)
                    self.assertTrue(waiting.wait(10), "Teacher edit never reached assignment serialization")
                    try:
                        mutex.execute(text("SELECT user_id FROM users WHERE user_id=2 FOR UPDATE NOWAIT"))
                    except Exception as error:
                        blocked_account = type(error).__name__
                finally:
                    mutex.rollback()
                    event.remove(self.fixture.test_engine, "before_cursor_execute", observe)
            self.assertEqual(future.result(timeout=10)["message"], "Teacher successfully updated.")
        self.assertIsNone(blocked_account, "Teacher edit locked the account before the assignment mutex: " + str(blocked_account))

    def test_surviving_device_row_cannot_bypass_credential_version(self):
        device = self.fixture.login(rememberDevice=True).json()["deviceToken"]
        with self.sessions() as db:
            # Simulate a stale device insert racing with revocation cleanup.
            saved = db.query(UserTrustedDevice).filter_by(user_id=2).one()
            expiry = saved.expires_at
            revoke_credentials(db, db.get(User, 2))
            db.add(UserTrustedDevice(user_id=2, device_token_hash=digest(device), expires_at=expiry))
            db.commit()
        self.client.cookies.clear()
        with patch.object(settings, "ENABLE_OTP", True), patch("backend.routes.auth.send_otp_email", new_callable=AsyncMock):
            self.assertTrue(self.fixture.login(deviceToken=device + ".é").json()["requireOtp"])
            with self.sessions() as db:
                db.query(EmailVerification).delete()
                db.commit()
            self.assertTrue(self.fixture.login(deviceToken=device).json()["requireOtp"])

    def test_email_failure_is_sanitized_and_immediately_retryable(self):
        with patch.object(settings, "ENABLE_OTP", True), patch("backend.routes.auth.send_otp_email", new_callable=AsyncMock, side_effect=RuntimeError("private key and OTP")):
            failed = self.fixture.login()
            self.assertEqual(failed.status_code, 502)
            self.assertNotIn("private", failed.text)
        with self.sessions() as db:
            self.assertEqual(db.query(EmailVerification).count(), 0)
        with patch.object(settings, "ENABLE_OTP", True), patch("backend.routes.auth.send_otp_email", new_callable=AsyncMock):
            self.assertTrue(self.fixture.login().json()["requireOtp"])

    def test_explicit_consent_refusal_rejected_and_legacy_helpers_compatible(self):
        registration = {"email": "new@example.com", "firstName": "New", "lastName": "Parent", "password": test_phase2.PASSWORD}
        for refused in (False, None, "false", "true", 1):
            for path, payload in (("/api/auth/login", {"email": "adviser@example.com", "password": test_phase2.PASSWORD}), ("/api/auth/register-parent", registration), ("/api/auth/verify-otp", {"challengeToken": "unused", "otp": "123456"})):
                with self.subTest(path=path, refused=refused):
                    self.assertEqual(self.client.post(path, json={**payload, "terms_accepted": refused}).status_code, 422)
        self.assertEqual(self.fixture.login(terms_accepted=True).status_code, 200)
        self.assertEqual(self.fixture.login().status_code, 200)
        self.assertEqual(self.client.post("/api/auth/register-parent", json={**registration, "terms_accepted": True}).status_code, 201)

    def test_production_cookie_flags_normalize_environment(self):
        from backend.utils.rate_limits import limits
        with patch.object(settings, "ENVIRONMENT", " production "), patch.object(limits, "hit", return_value=0):
            response = self.fixture.login(rememberDevice=True)
        for cookie in response.headers.get_list("set-cookie"):
            self.assertIn("HttpOnly", cookie)
            self.assertIn("; Secure", cookie)
            if cookie.startswith("ames_refresh_token="):
                self.assertIn("SameSite=strict", cookie)
                self.assertIn("Max-Age=86400", cookie)
            else:
                self.assertIn("SameSite=none", cookie)
                self.assertIn("Max-Age=2592000", cookie)

    def test_version_migration_is_repeatable_and_preserves_accounts(self):
        with self.fixture.test_engine.begin() as connection:
            before = list(connection.execute(text("SELECT to_jsonb(u) - 'security_version' FROM users u ORDER BY user_id")))
            connection.execute(text("ALTER TABLE users DROP COLUMN security_version"))
            with self.assertRaises(MigrationError):
                check_auth_security_version(connection, self.fixture.schema)
            self.assertTrue(apply_auth_security_version(connection, self.fixture.schema))
            connection.execute(text("UPDATE users SET security_version=7 WHERE user_id=2"))
            self.assertFalse(apply_auth_security_version(connection, self.fixture.schema))
            after = list(connection.execute(text("SELECT to_jsonb(u) - 'security_version' FROM users u ORDER BY user_id")))
            self.assertEqual(before, after)
            self.assertEqual(connection.execute(text("SELECT security_version FROM users WHERE user_id=2")).scalar_one(), 7)

    def test_backup_preserves_live_revocation_version_and_accepts_old_documents(self):
        with self.sessions() as db:
            payload = export_backup(db)
            legacy = json.loads(cipher().decrypt(payload))
            for user in legacy["users"]:
                user.pop("security_version")
            db.get(User, 2).security_version = 9
            db.commit()
            restore_backup(db, cipher().encrypt(json.dumps(legacy).encode()))
            db.expire_all()
            self.assertEqual(db.get(User, 2).security_version, 9)
            self.assertEqual(credential_version(db.get(User, 2)), jwt.get_unverified_claims(build_session(db, db.get(User, 2))["token"])["credentialVersion"])


if __name__ == "__main__":
    unittest.main()
