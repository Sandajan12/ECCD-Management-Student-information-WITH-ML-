"""Committed REST delivery and isolated messaging budgets; no school data."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import unittest
from unittest.mock import AsyncMock, patch
from sqlalchemy import text

from backend.tests import test_phase2
from backend.config.settings import settings
from backend.migrations.parity_batch1 import apply_batch1
from backend.migrations.parity_batch2 import apply_batch2
from backend.models import Student, User
from backend.utils import realtime
from backend.utils.rate_limits import POLICIES, RateLimits, limits, request_policies


class MessagingRateTests(unittest.TestCase):
    def test_exact_methods_aliases_and_independent_budgets(self):
        groups = {
            "messages-read": ("GET", ("contacts", "history", "unread", "unread-count"), 240),
            "messages-receipts": ("PUT", ("read", "mark-read"), 120),
            "messages-send": ("POST", ("", "send", "notify-student"), 60),
        }
        counter = RateLimits()
        for namespace, (method, paths, budget) in groups.items():
            for path in paths:
                self.assertEqual(request_policies(method, f"/api/messages/{path}"), [namespace])
            self.assertEqual(POLICIES[namespace].limit, budget)
            with patch("backend.utils.rate_limits.time.time", return_value=1000):
                for _ in range(budget):
                    self.assertEqual(counter.hit(namespace, "shared-ip"), 0)
                self.assertEqual(counter.hit(namespace, "shared-ip"), 60)
                self.assertEqual(counter.hit("api", "shared-ip"), 0)
            with patch("backend.utils.rate_limits.time.time", return_value=1061):
                self.assertEqual(counter.hit(namespace, "shared-ip"), 0)
        self.assertEqual(request_policies("POST", "/api/messages/link-lrn"), ["api", "student-link"])
        self.assertEqual(request_policies("GET", "/api/messages/history/extra"), ["api"])
        self.assertEqual(request_policies("DELETE", "/api/messages/send"), ["api"])
        self.assertEqual(request_policies("OPTIONS", "/api/messages/send"), [])


class MessagingPushTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.sessions_patch = patch.object(realtime, "SessionLocal", self.fixture.sessions)
        self.sessions_patch.start()
        self.addCleanup(self.sessions_patch.stop)
        self.connections = patch.object(realtime, "connections", {
            "teacher": self.fixture.tokens[2], "teacher-tab": self.fixture.tokens[2],
            "parent": self.fixture.tokens[5], "parent-tab": self.fixture.tokens[5],
            "stranger": self.fixture.tokens[6],
        })
        self.connections.start()
        self.addCleanup(self.connections.stop)
        self.emit = AsyncMock()
        emitter = patch.object(realtime.sio, "emit", self.emit)
        emitter.start()
        self.addCleanup(emitter.stop)

    def test_rest_sends_and_notifications_push_without_room_or_sender_event(self):
        result = self.fixture.call("POST", "/api/messages/send", 2, json={"teacher_id": 1, "parent_id": 1, "body": "REST-only save"})
        self.assertEqual(result.status_code, 201)
        events = self.emit.call_args_list
        self.assertEqual({event.kwargs["to"] for event in events}, {"teacher", "teacher-tab", "parent", "parent-tab"})
        for event in events:
            self.assertEqual(event.args[0], "receive_message")
            self.assertEqual(event.args[1]["message_id"], result.json()["message_id"])
        self.emit.reset_mock()
        self.assertEqual(self.fixture.call("POST", "/api/messages/notify-student", 2, json={"student_id": 1}).status_code, 201)
        self.assertEqual(self.emit.call_count, 4)
        self.emit.reset_mock()
        self.assertEqual(self.fixture.call("PUT", "/api/messages/read", 5, json={"teacher_id": 1, "parent_id": 1}).status_code, 200)
        self.assertEqual({event.kwargs["to"] for event in self.emit.call_args_list}, {"parent", "parent-tab"})
        self.assertEqual(self.emit.call_args.args[0], "messages_read")
        self.assertEqual(self.emit.call_args.args[1]["reader_role"], "parent")
        read_ids = self.emit.call_args.args[1]["message_ids"]
        self.assertIn(result.json()["message_id"], read_ids)
        self.emit.reset_mock()
        self.assertEqual(self.fixture.call("PUT", "/api/messages/read", 5, json={"teacher_id": 1, "parent_id": 1}).status_code, 200)
        self.emit.assert_not_called()  # An unchanged read must not churn badges.

    def test_delayed_read_event_identifies_only_the_confirmed_records(self):
        first = self.fixture.call("POST", "/api/messages/send", 2, json={"teacher_id": 1, "parent_id": 1, "body": "First"}).json()
        with patch("backend.routes.messages.publish_read", AsyncMock()) as publish:
            self.assertEqual(self.fixture.call("PUT", "/api/messages/read", 5, json={"teacher_id": 1, "parent_id": 1}).status_code, 200)
            args = publish.call_args.args
        later = self.fixture.call("POST", "/api/messages/send", 2, json={"teacher_id": 1, "parent_id": 1, "body": "Later"}).json()
        self.emit.reset_mock()
        asyncio.run(realtime.publish_read(*args))
        self.assertEqual(self.emit.call_args.args[1]["message_ids"], [first["message_id"]])
        history = self.fixture.call("GET", "/api/messages/history?teacher_id=1&parent_id=1", 5).json()
        self.assertFalse(next(row for row in history if row["message_id"] == later["message_id"])["is_read"])

    def test_delivery_rechecks_deactivation_and_relationship_after_commit(self):
        with patch("backend.routes.messages.publish_message", AsyncMock()):
            record = self.fixture.call("POST", "/api/messages/send", 2, json={"teacher_id": 1, "parent_id": 1, "body": "Saved"}).json()
        with self.fixture.sessions() as db:
            db.get(User, 5).is_active = False
            db.commit()
        asyncio.run(realtime.publish_message(record["message_id"], 1, 1))
        self.emit.assert_not_called()
        with self.fixture.sessions() as db:
            db.get(User, 5).is_active = True
            db.get(Student, 1).section_id = 2
            db.commit()
        asyncio.run(realtime.publish_message(record["message_id"], 1, 1))
        self.emit.assert_not_called()

    def test_push_failure_preserves_committed_http_success(self):
        self.emit.side_effect = RuntimeError("transport unavailable")
        result = self.fixture.call("POST", "/api/messages/send", 2, json={"teacher_id": 1, "parent_id": 1, "body": "Durable save"})
        self.assertEqual(result.status_code, 201)
        history = self.fixture.call("GET", "/api/messages/history?teacher_id=1&parent_id=1", 5).json()
        self.assertEqual(history[0]["body"], "Durable save")

    def test_unauthenticated_requests_share_alias_budget_and_expose_retry_after(self):
        limits.reset()
        with patch.object(limits, "bypass", False):
            for index in range(240):
                path = "/api/messages/unread" if index % 2 else "/api/messages/unread-count"
                self.assertEqual(self.fixture.client.get(path).status_code, 401)
            response = self.fixture.client.get("/api/messages/contacts", headers={"Origin": "http://localhost:5173"})
            self.assertEqual(response.status_code, 429)
            self.assertGreater(int(response.headers["retry-after"]), 0)
            self.assertIn("Retry-After", response.headers["access-control-expose-headers"])
            self.assertEqual(self.fixture.call("GET", "/api/teachers/access-controls", 2).status_code, 200)

    def test_receipt_and_send_aliases_count_rejected_requests_independently(self):
        with patch.object(limits, "bypass", False):
            for method, paths, budget in (
                ("PUT", ("read", "mark-read"), 120),
                ("POST", ("send", "notify-student", ""), 60),
            ):
                for index in range(budget):
                    response = self.fixture.client.request(method, "/api/messages/" + paths[index % len(paths)], json={})
                    self.assertEqual(response.status_code, 401)
                response = self.fixture.client.request(method, "/api/messages/" + paths[0], json={})
                self.assertEqual(response.status_code, 429)
                self.assertGreater(int(response.headers["retry-after"]), 0)
            # Neither messaging bucket consumed ordinary API or messaging reads.
            self.assertEqual(self.fixture.call("GET", "/api/messages/contacts", 2).status_code, 200)
            self.assertEqual(self.fixture.call("GET", "/api/teachers/access-controls", 2).status_code, 200)

    def test_production_messaging_counters_share_workers_and_expire(self):
        with self.fixture.test_engine.begin() as connection:
            apply_batch1(connection, self.fixture.schema)
            apply_batch2(connection, self.fixture.schema)
        first, second = RateLimits(), RateLimits()
        first.bypass = second.bypass = True  # Production must ignore fixture bypass.
        with patch.object(settings, "ENVIRONMENT", "production"), patch("backend.utils.rate_limits.engine", self.fixture.test_engine):
            for namespace in ("messages-read", "messages-receipts", "messages-send"):
                budget = POLICIES[namespace].limit
                with ThreadPoolExecutor(max_workers=8) as executor:
                    results = list(executor.map(lambda index: (first if index % 2 else second).hit(namespace, "shared-ip"), range(budget + 4)))
                self.assertEqual(results.count(0), budget)
                self.assertEqual(sum(value > 0 for value in results), 4)
            self.assertEqual(first.hit("api", "shared-ip"), 0)
            with self.fixture.test_engine.begin() as connection:
                connection.execute(text("UPDATE api_rate_limits SET reset_at=0 WHERE bucket_key LIKE 'messages-%'"))
            for namespace in ("messages-read", "messages-receipts", "messages-send"):
                self.assertEqual(second.hit(namespace, "shared-ip"), 0)

    def test_handshake_cooldown_is_readable_by_the_allowed_browser_origin(self):
        with patch.object(limits, "hit", return_value=60):
            response = self.fixture.client.get("/socket.io/?EIO=4&transport=polling", headers={"Origin": "http://localhost:5173"})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["retry-after"], "60")
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5173")
        self.assertIn("Retry-After", response.headers["access-control-expose-headers"])
        self.assertEqual(response.json()["retryAfter"], 60)
