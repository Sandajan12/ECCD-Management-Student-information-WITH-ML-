"""ASGI guards also cover chunked bodies without trusting Content-Length."""
import logging

from starlette.concurrency import run_in_threadpool
from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse

from backend.config.settings import settings
from backend.utils.rate_limits import POLICIES, client_key, limits, request_policies
from backend.utils.uploads import BACKUP_LIMIT, EXCEL_LIMIT, IMAGE_LIMIT, JSON_LIMIT


def security_headers() -> dict[str, str]:
    origins = " ".join(settings.allowed_origins)
    result = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Content-Security-Policy": f"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' {origins}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Origin-Agent-Cluster": "?1",
        "X-DNS-Prefetch-Control": "off",
        "X-Download-Options": "noopen",
        "X-Permitted-Cross-Domain-Policies": "none",
        "X-XSS-Protection": "0",
    }
    if settings.production:
        result["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return result


class SecurityHeadersMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        async def secured(message):
            if message["type"] in ("http.response.start", "websocket.accept"):
                message.setdefault("headers", [])
                headers = MutableHeaders(scope=message)
                for name, value in security_headers().items():
                    headers[name] = value
            await send(message)
        await self.app(scope, receive, secured)


class RequestLimitsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        method, path = scope["method"], scope["path"].rstrip("/")
        for namespace in request_policies(method, path):
            try:
                retry = await run_in_threadpool(limits.hit, namespace, client_key(scope))
            except Exception:
                logging.getLogger("uvicorn.error").error("Rate-limit storage unavailable.")
                return await JSONResponse({"success": False, "message": "Request service is temporarily unavailable."}, status_code=503)(scope, receive, send)
            if retry:
                return await JSONResponse({"success": False, "status": 429, "message": POLICIES[namespace].message}, status_code=429, headers={"Retry-After": str(retry)})(scope, receive, send)
        headers = Headers(scope=scope)
        content_type = headers.get("content-type", "").split(";", 1)[0].strip().lower()
        ceiling = JSON_LIMIT
        if content_type == "multipart/form-data":
            if path == "/api/teachers/import-students":
                ceiling = EXCEL_LIMIT + 64 * 1024
            elif path in ("/api/backup/restore", "/api/chairman/backup/restore"):
                ceiling = BACKUP_LIMIT + 64 * 1024
            elif path == "/api/settings/update" or path.startswith("/api/eccd/parent/home-photos/"):
                ceiling = IMAGE_LIMIT + 64 * 1024
        async def too_large():
            await JSONResponse({"success": False, "message": "Request body is too large."}, status_code=413)(scope, receive, send)
        if "content-length" in headers:
            try:
                declared = int(headers["content-length"])
                if declared < 0:
                    raise ValueError
            except ValueError:
                return await JSONResponse({"success": False, "message": "Invalid Content-Length."}, status_code=400)(scope, receive, send)
            if declared > ceiling:
                return await too_large()
        # Buffer only up to the ceiling and replay to Starlette's parsers.
        # Counting real bytes protects missing, false and chunked length headers.
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > ceiling:
                return await too_large()
            body.extend(chunk)
            if not message.get("more_body", False):
                break
        delivered = False
        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()
        await self.app(scope, replay, send)


class UnreadPollingFilter(logging.Filter):
    def filter(self, record):
        # Uvicorn supplies (client, method, path, HTTP version, status).
        args = record.args
        if isinstance(args, tuple) and len(args) == 5:
            return not (args[1] == "GET" and str(args[2]).split("?", 1)[0] == "/api/messages/unread-count" and str(args[4]) == "200")
        return True
