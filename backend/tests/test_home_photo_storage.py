"""Supabase HTTP contract tests use a local MockTransport, never remote requests."""
from unittest.mock import patch
import httpx
import pytest
from fastapi import HTTPException
from pydantic import SecretStr
from backend.config.settings import settings
from backend.utils.home_photos import SupabasePhotoStorage


def test_private_bucket_contracts_and_authenticated_only_object_paths():
    requests = []
    def respond(request):
        requests.append(request)
        if "/bucket/" in request.url.path:
            return httpx.Response(200, json={"public": False})
        return httpx.Response(200, content=b"photo")
    client = httpx.Client(transport=httpx.MockTransport(respond))
    storage = SupabasePhotoStorage()
    with patch.object(settings, "SUPABASE_STORAGE_URL", "https://storage.invalid"), patch.object(settings, "SUPABASE_STORAGE_SERVICE_KEY", SecretStr("test-server-only-key")), patch("backend.utils.home_photos.httpx.Client", return_value=client):
        # The adapter closes its HTTP client per operation; each call gets a fresh mock client.
        storage.put("a.jpg", b"safe pixels")
    with patch.object(settings, "SUPABASE_STORAGE_URL", "https://storage.invalid"), patch.object(settings, "SUPABASE_STORAGE_SERVICE_KEY", SecretStr("test-server-only-key")), patch("backend.utils.home_photos.httpx.Client", side_effect=lambda **kwargs: httpx_client(respond)):
        assert storage.get("a.jpg") == b"photo"
        storage.delete("a.jpg")
    assert any(r.method == "POST" and r.url.path == "/storage/v1/object/home-observation-proofs/a.jpg" for r in requests)
    assert any(r.method == "GET" and "/object/authenticated/" in r.url.path for r in requests)
    deletion = next(r for r in requests if r.method == "DELETE")
    assert deletion.content == b'{"prefixes":["a.jpg"]}'
    assert all(r.headers["authorization"] == "Bearer test-server-only-key" for r in requests)


# Keep the constructor unpatched inside the MockTransport factory.
CLIENT = httpx.Client
def httpx_client(handler):
    return CLIENT(transport=httpx.MockTransport(handler))


def test_public_bucket_fails_closed_before_upload():
    requests = []
    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={"public": True})
    with patch.object(settings, "SUPABASE_STORAGE_URL", "https://storage.invalid"), patch.object(settings, "SUPABASE_STORAGE_SERVICE_KEY", SecretStr("test-server-only-key")), patch("backend.utils.home_photos.httpx.Client", side_effect=lambda **kwargs: httpx_client(respond)):
        with pytest.raises(HTTPException) as error:
            SupabasePhotoStorage().put("a.jpg", b"image")
    assert error.value.status_code == 503
    assert len(requests) == 1 and "/bucket/" in requests[0].url.path
