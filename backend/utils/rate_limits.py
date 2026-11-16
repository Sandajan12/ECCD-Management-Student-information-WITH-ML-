"""Legacy fixed-window budgets; PostgreSQL counters are shared in production.

The bypass/reset hooks are Python-only test fixtures, never request parameters.
Production always enforces limits, even if a test bypass flag is accidentally set.
"""
from dataclasses import dataclass
import hashlib
import ipaddress
import math
import threading
import time
from fastapi import HTTPException

from sqlalchemy import text
from backend.config.database import engine
from backend.config.settings import settings


@dataclass(frozen=True)
class Policy:
    window: int
    limit: int
    message: str



POLICIES = {
    "api": Policy(60, 120, "Too many requests. Please try again in a minute."),
    "messages-read": Policy(60, 240, "Too many messaging requests. Please try again in a minute."),
    "messages-receipts": Policy(60, 120, "Too many read receipts. Please try again in a minute."),
    "messages-send": Policy(60, 60, "Too many messages. Please try again in a minute."),
    "login": Policy(900, 15, "Too many login attempts. Please try again in 15 minutes."),
    "otp-send": Policy(900, 5, "Too many verification email requests. Please try again in 15 minutes."),
    "otp-verify": Policy(900, 10, "Too many verification attempts. Please try again in 15 minutes."),
    "registration": Policy(900, 5, "Too many registration requests. Please try again in 15 minutes."),
    "password": Policy(900, 10, "Too many password attempts. Please try again in 15 minutes."),
    "provisioning": Policy(900, 5, "Too many account creation requests. Please try again in 15 minutes."),
    "student-link": Policy(900, 10, "Too many student linking attempts. Please try again in 15 minutes."),
    "heavy": Policy(600, 5, "Export or backup limit reached. Please try again in 10 minutes."),
    "home-photo": Policy(60, 60, "Photo upload limit reached. Please wait a minute and submit again. Your draft has been kept."),
    "home-submit": Policy(60, 30, "Observation submission limit reached. Please wait a minute and submit again. Your draft has been kept."),
    "probe": Policy(60, 60, "Too many readiness requests. Please try again in a minute."),
    "socket-connect": Policy(60, 30, "Too many connection attempts. Please try again in a minute."),
    "socket-events": Policy(60, 100, "Too many socket events. Please try again in a minute."),
    "socket-packets": Policy(10, 25, "Too many socket events. Please slow down."),
}


def client_key(scope) -> str:
    # Uvicorn resolves trusted proxy headers. Never trust arbitrary forwarded
    # headers here; configure --forwarded-allow-ips for the deployment proxy.
    host = (scope.get("client") or ("unknown", 0))[0]
    try:
        address = ipaddress.ip_address(host)
        if address.version == 6:
            return str(ipaddress.ip_network(f"{address}/56", strict=False))
        return str(address)
    except ValueError:
        return host


class RateLimits:
    def __init__(self):
        self.bypass = False
        self.lock = threading.Lock()
        self.counters = {}
        self.last_cleanup = 0.0

    @property
    def bypassed(self):
        return self.bypass and not settings.production

    def reset(self):
        """Reset only process-local test/dev counters; never delete shared data."""
        with self.lock:
            self.counters.clear()
            self.last_cleanup = 0.0

    def forget_socket(self, sid):
        with self.lock:
            self.counters.pop(("socket-packets", sid), None)

    def hit(self, namespace: str, identity: str) -> int:
        """Return Retry-After seconds on exhaustion, zero while within budget."""
        if self.bypassed:
            return 0
        policy = POLICIES[namespace]
        now = time.time()
        if settings.production and namespace != "socket-packets":
            key = namespace + ":" + hashlib.sha256(identity.encode()).hexdigest()
            milliseconds = int(now * 1000)
            with engine.begin() as connection:
                row = connection.execute(text("""
                    INSERT INTO api_rate_limits (bucket_key, total_hits, reset_at)
                    VALUES (:key, 1, :reset)
                    ON CONFLICT (bucket_key) DO UPDATE SET
                        total_hits = CASE WHEN api_rate_limits.reset_at <= :now THEN 1 ELSE api_rate_limits.total_hits + 1 END,
                        reset_at = CASE WHEN api_rate_limits.reset_at <= :now THEN :reset ELSE api_rate_limits.reset_at END
                    RETURNING total_hits, reset_at
                """), {"key": key, "now": milliseconds, "reset": milliseconds + policy.window * 1000}).one()
                # Bounded cleanup; does not grow a scheduler thread per worker.
                with self.lock:
                    cleanup = now - self.last_cleanup >= 60
                    if cleanup:
                        self.last_cleanup = now
                if cleanup:
                    connection.execute(text("DELETE FROM api_rate_limits WHERE bucket_key IN (SELECT bucket_key FROM api_rate_limits WHERE reset_at <= :now LIMIT 1000)"), {"now": milliseconds})
            hits, reset = row[0], row[1] / 1000
        else:
            with self.lock:
                if now - self.last_cleanup >= 60:
                    self.counters = {key: value for key, value in self.counters.items() if value[1] > now}
                    self.last_cleanup = now
                key = namespace, identity
                hits, reset = self.counters.get(key, (0, now + policy.window))
                if reset <= now:
                    hits, reset = 0, now + policy.window
                hits += 1
                self.counters[key] = hits, reset
        return max(1, math.ceil(reset - now)) if hits > policy.limit else 0


limits = RateLimits()


def enforce_user_limit(namespace: str, user_id: int) -> None:
    """Authenticated home actions have independent account budgets, not export budgets."""
    retry = limits.hit(namespace, str(user_id))
    if retry:
        raise HTTPException(429, POLICIES[namespace].message, headers={"Retry-After": str(retry)})


def request_policies(method: str, path: str) -> list[str]:
    """Aliases share budgets; malformed/unauthenticated requests also count."""
    path = path.rstrip("/")
    if method == "OPTIONS":
        return []
    messaging = {
        "GET": ("messages-read", ("contacts", "history", "unread-count", "unread")),
        "PUT": ("messages-receipts", ("read", "mark-read")),
        "POST": ("messages-send", ("", "send", "notify-student")),
    }
    if method in messaging:
        namespace, operations = messaging[method]
        if path in (f"/api/messages/{operation}".rstrip("/") for operation in operations):
            return [namespace]
    result = ["api"] if path == "/api" or path.startswith("/api/") else []
    if path == "/ready":
        result.append("probe")
    if method == "POST":
        for namespace, paths in {
            "login": ("/api/auth/login", "/api/auth/login-step1"),
            "otp-send": ("/api/auth/send-otp", "/api/auth/request-otp", "/api/teachers/change-password-request"),
            "otp-verify": ("/api/auth/verify-otp", "/api/teachers/change-password-verify"),
            "registration": ("/api/auth/register-parent",),
            "password": ("/api/chairman/verify-password",),
            "provisioning": ("/api/chairman/teachers", "/api/teachers", "/api/teachers/create"),
            "student-link": ("/api/students/link", "/api/messages/link-lrn", "/api/parents/children/link"),
        }.items():
            if path in paths:
                result.append(namespace)
    if method == "PUT" and path in ("/api/auth/update-password", "/api/chairman/account"):
        result.append("password")
    if method in ("GET", "POST") and (
        path.startswith(("/api/backup/", "/api/chairman/backup/", "/api/teachers/download/"))
        or path in ("/api/chairman/export-eccd", "/api/teachers/download-all", "/api/teachers/import-students", "/api/eccd/export-all", "/api/settings/rollover", "/api/settings/undo-rollover", "/api/settings/revert-school-year", "/api/chairman/rollover-year", "/api/chairman/undo-rollover")
        or (path.startswith("/api/chairman/sections/") and path.endswith("/export-summary"))
        or (path.startswith("/api/eccd/section/") and path.endswith("/export"))
    ):
        result.append("heavy")
    return result
