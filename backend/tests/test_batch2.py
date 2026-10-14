"""Deployment guards and explicit migrations using unittest and isolated data."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import importlib
import json
from io import BytesIO
import logging
import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI, UploadFile
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import inspect, text
from starlette.datastructures import Headers

from backend.config.settings import Settings, settings
from backend.main import api, app
from backend.migrations.parity_batch1 import apply_batch1, check_batch1
from backend.migrations.parity_batch2 import VERSION, apply_batch2, check_batch2
from backend.models import Message, Student, SystemLog, User
from backend.tests import test_phase2
from backend.utils import realtime
from backend.utils.backups import cipher, export_backup, restore_backup
from backend.utils.http_middleware import RequestLimitsMiddleware, SecurityHeadersMiddleware, UnreadPollingFilter
from backend.utils.rate_limits import POLICIES, RateLimits, client_key, limits, request_policies
from backend.utils.uploads import BACKUP_LIMIT, EXCEL_LIMIT, IMAGE_LIMIT, JSON_LIMIT, branding_image, read_upload

main = importlib.import_module("backend.main")


def configuration(**changes):
    values = dict(_env_file=None, DATABASE_URL="postgresql://localhost/test", SECRET_KEY="SyntheticSecret0123456789abcdefXYZ", ENVIRONMENT="development", BACKUP_ENCRYPTION_KEY="unused", BACKUP_IV="unused")
    return Settings(**{**values, **changes})


class Batch2GuardTests(unittest.TestCase):
    def setUp(self):
        limits.reset()
        self.bypass = patch.object(limits, "bypass", False)
        self.bypass.start()
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        self.client.close()
        self.bypass.stop()
        limits.reset()

    def test_production_aliases_and_verified_tls_validation(self):
        good = {"ENV": "production", "JWT_SECRET": "SyntheticProductionSecret0123456789ABC", "DATABASE_URL": "postgresql://localhost/test?sslmode=verify-full&sslrootcert=system", "FRONTEND_URL": "https://ames.vercel.app"}
        with patch.dict("os.environ", good, clear=True):
            value = Settings(_env_file=None, BACKUP_ENCRYPTION_KEY="unused", BACKUP_IV="unused")
        self.assertTrue(value.production)
        self.assertEqual(value.SECRET_KEY, good["JWT_SECRET"])
        for secret in ("short", "a" * 64, "change-me" * 8):
            with self.subTest(secret_length=len(secret)), self.assertRaises(ValidationError):
                configuration(ENV="production", JWT_SECRET=secret, DATABASE_URL=good["DATABASE_URL"])
        for url in ("postgresql://localhost/test", "postgresql://localhost/test?sslmode=require", "postgresql://localhost/test?sslmode=verify-ca&sslrootcert=system", "postgresql://localhost/test?sslmode=verify-full"):
            with self.subTest(url=url), self.assertRaises(ValidationError):
                configuration(ENV="production", DATABASE_URL=url)
        self.assertTrue(configuration(ENV="production", DATABASE_URL="postgresql://localhost/test?sslmode=verify-full", DATABASE_SSL_ROOT_CERT="/test/root.crt").production)

    def test_origins_are_exact_shared_config_and_keep_local_defaults(self):
        value = configuration(FRONTEND_URL=" https://ames.vercel.app/, https://preview.vercel.app ", ALLOWED_ORIGINS="https://school.example, https://ames.vercel.app")
        self.assertEqual(value.allowed_origins, ["http://localhost:5173", "http://127.0.0.1:5173", "https://ames.vercel.app", "https://preview.vercel.app", "https://school.example"])
        for origin in ("*", "https://*.vercel.app", "https://site.example/path", "https://user:pass@site.example", "javascript:alert(1)", "https://site.example; unsafe", "http://localhost:99999"):
            with self.subTest(origin=origin), self.assertRaises(ValidationError):
                configuration(FRONTEND_URL=origin)
        with self.assertRaises(ValidationError):
            configuration(ENV="production", DATABASE_URL="postgresql://localhost/test?sslmode=verify-full&sslrootcert=system", FRONTEND_URL="http://school.example")
        cors = next(middleware for middleware in api.user_middleware if middleware.cls.__name__ == "CORSMiddleware")
        self.assertEqual(cors.kwargs["allow_origins"], settings.allowed_origins)
        self.assertEqual(realtime.sio.eio.cors_allowed_origins, settings.allowed_origins)
        allowed = self.client.options("/api/health", headers={"Origin": settings.allowed_origins[0], "Access-Control-Request-Method": "GET"})
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.headers["access-control-allow-origin"], settings.allowed_origins[0])
        denied = self.client.options("/api/health", headers={"Origin": "https://unlisted.example", "Access-Control-Request-Method": "GET"})
        self.assertEqual(denied.status_code, 400)
        self.assertNotIn("access-control-allow-origin", denied.headers)

    def test_health_and_readiness_sanitize_database_failures(self):
        for path in ("/healthz", "/api/health"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "ok")
            self.assertLess(abs(response.json()["timestamp"] - int(time.time() * 1000)), 5000)
        with patch.object(main, "database_ready") as check:
            response = self.client.get("/ready")
            check.assert_called_once()
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["database"], "connected")
        with patch.object(main, "database_ready", side_effect=RuntimeError("private credentials")):
            response = self.client.get("/ready")
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["status"], "unready")
            self.assertNotIn("private", response.text)
            self.assertIn("timestamp", response.json())

    def test_readiness_executes_select_one_and_production_counter_check(self):
        from backend.config import database
        database_engine = MagicMock()
        with patch.object(database, "engine", database_engine):
            database.database_ready()
        statements = database_engine.connect.return_value.__enter__.return_value.execute.call_args_list
        self.assertEqual(str(statements[0].args[0]), "SELECT 1")
        database_engine.reset_mock()
        with patch.object(database, "engine", database_engine), patch.object(settings, "ENVIRONMENT", "production"):
            database.database_ready()
        self.assertIn("api_rate_limits", str(database_engine.connect.return_value.__enter__.return_value.execute.call_args_list[1].args[0]))

    def test_security_headers_compression_and_sanitized_fallback(self):
        response = self.client.get("/api/health")
        for name, expected in (("x-content-type-options", "nosniff"), ("x-frame-options", "DENY"), ("referrer-policy", "strict-origin-when-cross-origin")):
            self.assertEqual(response.headers[name], expected)
        self.assertIn("object-src 'none'", response.headers["content-security-policy"])
        self.assertNotIn("strict-transport-security", response.headers)
        with patch.object(settings, "ENVIRONMENT", "production"):
            self.assertIn("includeSubDomains", self.client.get("/healthz").headers["strict-transport-security"])
        response = self.client.get("/openapi.json", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(response.headers["content-encoding"], "gzip")
        self.assertIn("paths", response.json())
        # Exercise the real global handler through a dependency error.
        from backend.config.database import get_db
        def broken_db():
            raise RuntimeError("secret SQL query and password")
        api.dependency_overrides[get_db] = broken_db
        try:
            response = self.client.get("/api/settings", headers={"Origin": settings.allowed_origins[0]})
        finally:
            api.dependency_overrides.pop(get_db, None)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"success": False, "message": "Internal server error"})
        self.assertEqual(response.headers["x-frame-options"], "DENY")
        self.assertEqual(response.headers["access-control-allow-origin"], settings.allowed_origins[0])

    def test_json_actual_and_declared_limits_and_malformed_requests_count(self):
        for content, headers in ((b"x" * (JSON_LIMIT + 1), {"Content-Type": "application/json"}), (b"{}", {"Content-Type": "application/json", "Content-Length": str(JSON_LIMIT + 1)}), (b"x" * (JSON_LIMIT + 1), {"Content-Type": "application/json", "Content-Length": "2"})):
            response = self.client.post("/api/auth/login", content=content, headers=headers)
            self.assertEqual(response.status_code, 413)
        # Iterator content is transmitted without a Content-Length.
        response = self.client.post("/api/auth/login", content=iter([b"x" * 30000, b"x" * 30000]), headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.client.post("/api/auth/login", content=b"{" + b" " * (JSON_LIMIT - 1), headers={"Content-Type": "application/json"}).status_code, 422)
        self.assertEqual(self.client.post("/api/auth/login", content=b"{}", headers={"Content-Length": "-1"}).status_code, 400)

    def test_all_legacy_http_budgets_and_aliases_exhaust_and_reset(self):
        samples = {
            "api": ("GET", ["/api/undefined"]),
            "login": ("POST", ["/api/auth/login", "/api/auth/login-step1"]),
            "otp-send": ("POST", ["/api/auth/send-otp", "/api/auth/request-otp", "/api/teachers/change-password-request"]),
            "otp-verify": ("POST", ["/api/auth/verify-otp", "/api/teachers/change-password-verify"]),
            "registration": ("POST", ["/api/auth/register-parent"]),
            "password": ("PUT", ["/api/auth/update-password", "/api/chairman/account"]),
            "provisioning": ("POST", ["/api/teachers/create", "/api/chairman/teachers", "/api/teachers/"]),
            "student-link": ("POST", ["/api/messages/link-lrn", "/api/students/link", "/api/parents/children/link"]),
            "heavy": ("GET", ["/api/backup/export", "/api/chairman/backup/export", "/api/teachers/download-all"]),
            "probe": ("GET", ["/ready"]),
        }
        with patch.object(main, "database_ready"):
            for namespace, (method, paths) in samples.items():
                with self.subTest(namespace=namespace):
                    limits.reset()
                    for index in range(POLICIES[namespace].limit):
                        response = self.client.request(method, paths[index % len(paths)], content="{", headers={"Content-Type": "application/json"})
                        self.assertNotEqual(response.status_code, 429)
                    exhausted = self.client.request(method, paths[0], json={})
                    self.assertEqual(exhausted.status_code, 429)
                    self.assertEqual(exhausted.json()["message"], POLICIES[namespace].message)
                    self.assertGreater(int(exhausted.headers["retry-after"]), 0)
                    limits.reset()
                    self.assertNotEqual(self.client.request(method, paths[0], json={}).status_code, 429)
        self.assertIn("password", request_policies("POST", "/api/chairman/verify-password"))
        self.assertIn("heavy", request_policies("POST", "/api/teachers/import-students"))
        self.assertIn("heavy", request_policies("GET", "/api/eccd/section/1/export"))
        self.assertEqual(request_policies("OPTIONS", "/api/auth/login"), [])

    def test_window_expiry_ipv6_and_safe_fixture_bypass(self):
        counter = RateLimits()
        with patch("backend.utils.rate_limits.time.time", return_value=100):
            for _ in range(10):
                self.assertEqual(counter.hit("login", "test"), 0)
            self.assertEqual(counter.hit("login", "test"), 900)
        with patch("backend.utils.rate_limits.time.time", return_value=1000):
            self.assertEqual(counter.hit("login", "test"), 0)
        counter.bypass = True
        self.assertTrue(counter.bypassed)
        with patch.object(settings, "ENVIRONMENT", "production"):
            self.assertFalse(counter.bypassed)
        self.assertEqual(client_key({"client": ("2001:db8:1234:5678::1", 1)}), client_key({"client": ("2001:db8:1234:56ff::2", 2)}))
        self.assertEqual(client_key({"client": ("127.0.0.1", 1), "headers": [(b"x-forwarded-for", b"spoof")] }), "127.0.0.1")

    def test_socket_handshake_and_event_limits_emit_and_disconnect(self):
        for _ in range(30):
            self.assertEqual(self.client.get("/socket.io/?EIO=4&transport=polling").status_code, 200)
        rejected = self.client.get("/socket.io/?EIO=4&transport=polling")
        self.assertEqual(rejected.status_code, 429)
        self.assertGreater(int(rejected.headers["retry-after"]), 0)
        limits.reset()
        async def events():
            with patch.object(realtime.sio, "emit", new_callable=AsyncMock) as emit, patch.object(realtime.sio, "disconnect", new_callable=AsyncMock) as disconnect:
                for _ in range(25):
                    self.assertIsNone(await realtime.socket_budget("test-socket"))
                exhausted = await realtime.socket_budget("test-socket")
                self.assertEqual(exhausted["status"], 429)
                self.assertEqual(emit.call_args.args[0], "rate_limit_error")
                disconnect.assert_awaited_once_with("test-socket")
                limits.reset()
                for index in range(100):
                    self.assertIsNone(await realtime.socket_budget(f"socket-{index}"))
                self.assertEqual((await realtime.socket_budget("another"))["status"], 429)
                limits.reset()
                with patch.object(limits, "hit", side_effect=RuntimeError("private DB credentials")):
                    result = await realtime.socket_budget("failure")
                    self.assertEqual(result["status"], 503)
                    self.assertNotIn("private", result["message"])
        asyncio.run(events())

    def test_http_rate_store_failure_is_sanitized_and_closed(self):
        with patch.object(limits, "hit", side_effect=RuntimeError("password in query")):
            response = self.client.get("/api/health")
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("password", response.text)
            response = self.client.get("/socket.io/?EIO=4&transport=polling")
            self.assertEqual(response.status_code, 503)

    def test_upload_reads_exact_boundaries_and_type_whitelist(self):
        async def verify():
            for limit in (EXCEL_LIMIT, IMAGE_LIMIT, BACKUP_LIMIT):
                file = UploadFile(BytesIO(b"x" * 16), size=limit + 1)
                with self.assertRaises(Exception) as error:
                    await read_upload(file, limit)
                self.assertEqual(error.exception.status_code, 413)
                # Force stream counting instead of relying on supplied size.
                file = UploadFile(BytesIO(b"x" * 17), size=None)
                with self.assertRaises(Exception) as error:
                    await read_upload(file, 16)
                self.assertEqual(error.exception.status_code, 413)
                self.assertEqual(await read_upload(UploadFile(BytesIO(b"x" * 16)), 16), b"x" * 16)
            for mime in ("image/jpeg", "image/png", "image/webp"):
                self.assertEqual(await branding_image(UploadFile(BytesIO(b"image"), headers=Headers({"content-type": mime}))), b"image")
            with self.assertRaises(Exception) as error:
                await branding_image(UploadFile(BytesIO(b"svg"), headers=Headers({"content-type": "image/svg+xml"})))
            self.assertEqual(error.exception.status_code, 400)
        asyncio.run(verify())

    def test_polling_filter_keeps_errors_and_other_endpoints(self):
        filter = UnreadPollingFilter()
        for method, path, status, expected in (("GET", "/api/messages/unread-count", 200, False), ("GET", "/api/messages/unread-count?x=1", 200, False), ("GET", "/api/messages/unread-count", 401, True), ("GET", "/api/messages/unread-count", 500, True), ("POST", "/api/messages/unread-count", 200, True), ("GET", "/api/messages/history", 200, True)):
            record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %s', ("client", method, path, "1.1", status), None)
            self.assertEqual(filter.filter(record), expected)
        self.assertTrue(filter.filter(logging.LogRecord("uvicorn.access", logging.INFO, "", 0, "other record", (), None)))


class Batch2DatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.sessions, self.call = self.fixture.sessions, self.fixture.call

    def tearDown(self):
        self.fixture.tearDown()

    def migrate(self):
        with self.fixture.test_engine.begin() as connection:
            apply_batch1(connection, self.fixture.schema)
            apply_batch2(connection, self.fixture.schema)

    def test_migration_preserves_rows_and_is_idempotent(self):
        with self.sessions() as db:
            db.add(Message(parent_id=1, teacher_id=1, sender_role="teacher", body="Preserved"))
            db.add(SystemLog(user_id=1, action_type="TEST", details="Preserved"))
            db.commit()
            before = {table.name: list(db.execute(table.select())) for table in (Message.__table__, SystemLog.__table__, User.__table__, Student.__table__)}
        self.migrate()
        with self.fixture.test_engine.begin() as connection:
            check_batch1(connection, self.fixture.schema)
            check_batch2(connection, self.fixture.schema)
            self.assertFalse(apply_batch2(connection, self.fixture.schema))
            self.assertEqual(connection.execute(text("SELECT count(*) FROM ames_schema_migrations WHERE version=:v"), {"v": VERSION}).scalar_one(), 1)
        with self.sessions() as db:
            for table in (Message.__table__, SystemLog.__table__, User.__table__, Student.__table__):
                self.assertEqual(list(db.execute(table.select())), before[table.name])
        with patch.object(main, "engine", self.fixture.test_engine), patch.object(main, "SessionLocal", self.sessions):
            with TestClient(app) as client:
                self.assertEqual(client.get("/healthz").status_code, 200)

    def test_migration_mismatch_rolls_back_all_changes(self):
        with self.fixture.test_engine.begin() as connection:
            apply_batch1(connection, self.fixture.schema)
            connection.execute(text("CREATE INDEX idx_logs_timestamp ON system_logs (action_type)"))
        with self.assertRaises(Exception):
            with self.fixture.test_engine.begin() as connection:
                apply_batch2(connection, self.fixture.schema)
        inspector = inspect(self.fixture.test_engine)
        self.assertFalse(inspector.has_table("api_rate_limits", schema=self.fixture.schema))
        self.assertNotIn("idx_messages_thread", [item["name"] for item in inspector.get_indexes("messages", schema=self.fixture.schema)])

    def test_production_atomic_counters_are_shared_across_workers(self):
        self.migrate()
        first, second = RateLimits(), RateLimits()
        first.bypass = second.bypass = True
        with patch.object(settings, "ENVIRONMENT", "production"), patch("backend.utils.rate_limits.engine", self.fixture.test_engine):
            with ThreadPoolExecutor(max_workers=8) as executor:
                results = list(executor.map(lambda index: (first if index % 2 else second).hit("login", "shared-test-ip"), range(20)))
            self.assertEqual(results.count(0), 10)
            self.assertEqual(sum(value > 0 for value in results), 10)
        with self.sessions() as db:
            row = db.execute(text("SELECT bucket_key,total_hits FROM api_rate_limits")).one()
            self.assertEqual(row.total_hits, 20)
            self.assertNotIn("shared-test-ip", row.bucket_key)
            payload = export_backup(db)
            restore_backup(db, payload)
            self.assertEqual(db.execute(text("SELECT total_hits FROM api_rate_limits")).scalar_one(), 20)

    def test_real_readiness_and_upload_limits_leave_records_unchanged(self):
        from backend.config import database
        self.migrate()
        with patch.object(database, "engine", self.fixture.test_engine):
            response = self.fixture.client.get("/ready")
            self.assertEqual(response.status_code, 200)
        with self.sessions() as db:
            before = len(list(db.execute(Student.__table__.select())))
        for path, user, mime, limit in (("/api/teachers/import-students", 2, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", EXCEL_LIMIT), ("/api/settings/upload-background", 1, "image/png", IMAGE_LIMIT), ("/api/backup/restore", 1, "application/octet-stream", BACKUP_LIMIT)):
            with self.subTest(path=path):
                response = self.call("POST", path, user, files={"file": ("large.xlsx" if path.endswith("import-students") else "large.file", b"x" * (limit + 1), mime)})
                self.assertEqual(response.status_code, 413)
        for path, method, field in (("/api/settings/upload-background", "POST", "file"), ("/api/settings/update", "PUT", "systemLogo"), ("/api/settings/update", "PUT", "profilePic")):
            response = self.call(method, path, files={field: ("image.svg", b"<svg/>", "image/svg+xml")})
            self.assertEqual(response.status_code, 400)
        for mime in ("image/jpeg", "image/png", "image/webp"):
            response = self.call("POST", "/api/settings/upload-background", files={"file": ("image", b"safe", mime)})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["url"].startswith(f"data:{mime};base64,"))
        with self.sessions() as db:
            self.assertEqual(len(list(db.execute(Student.__table__.select()))), before)

    def test_backup_export_ceiling_and_restore_ceiling_apply_before_mutation(self):
        with self.sessions() as db:
            payload = export_backup(db)
            with patch("backend.utils.backups.BACKUP_LIMIT", len(payload)):
                self.assertEqual(len(export_backup(db)), len(payload))
            with patch("backend.utils.backups.BACKUP_LIMIT", len(payload) - 1):
                with self.assertRaises(Exception) as error:
                    export_backup(db)
                self.assertEqual(error.exception.status_code, 413)
                with self.assertRaises(Exception) as error:
                    restore_backup(db, payload)
                self.assertEqual(error.exception.status_code, 413)
            self.assertEqual(db.query(User).count(), 6)
            self.assertEqual(db.query(Student).count(), 3)

    def test_websocket_unknown_events_cannot_bypass_packet_ceiling(self):
        limits.reset()
        with patch.object(limits, "bypass", False), patch.object(realtime, "SessionLocal", self.sessions):
            with self.fixture.client.websocket_connect("/socket.io/?EIO=4&transport=websocket", headers={"Upgrade": "websocket"}) as ws:
                self.assertTrue(ws.receive_text().startswith("0"))
                ws.send_text("40" + json.dumps({"token": self.fixture.tokens[2]}))
                self.assertTrue(ws.receive_text().startswith("40"))
                for _ in range(25):
                    ws.send_text('42["unsupported_event",{}]')
                    self.assertIn('"chat_error"', ws.receive_text())
                ws.send_text('42["unsupported_event",{}]')
                rejected = ws.receive_text()
                self.assertIn('"rate_limit_error"', rejected)
                self.assertIn('"status":429', rejected)
