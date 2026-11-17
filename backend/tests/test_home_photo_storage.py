"""Private local storage and Supabase contracts; no remote requests."""
from pathlib import Path
import subprocess
from unittest.mock import patch
import httpx
import pytest
from fastapi import HTTPException
from pydantic import SecretStr
from backend.config.settings import settings
from backend.utils.home_photos import SupabasePhotoStorage, photo_object_key, photo_storage


PHOTO_ID = "a" * 32


def test_vite_denies_private_photos_and_keeps_existing_secret_protection():
    frontend = Path(__file__).resolve().parents[2] / "frontend"
    result = subprocess.run(["node", "--input-type=module", "-e", """
        import assert from 'node:assert/strict';
        import path from 'node:path';
        import {resolveConfig, isFileServingAllowed, normalizePath} from 'vite';
        const config = await resolveConfig({root: process.cwd(), logLevel: 'silent'}, 'serve');
        const url = file => '/@fs/' + normalizePath(path.resolve(file));
        assert.equal(isFileServingAllowed(config, url('src/main.tsx')), true);
        for (const file of ['../backend/.local_home_photos/' + 'a'.repeat(32) + '.jpg',
                            '.env.local', '.npmrc', '.yarnrc.yml', 'private.key', '../.git/config']) {
          assert.equal(isFileServingAllowed(config, url(file)), false, file);
        }
    """], cwd=frontend, capture_output=True, text=True, timeout=45)
    assert result.returncode == 0, result.stderr


@pytest.fixture
def local_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "SUPABASE_STORAGE_URL", "")
    monkeypatch.setattr(settings, "SUPABASE_STORAGE_SERVICE_KEY", None)
    monkeypatch.setattr("backend.utils.home_photos.LOCAL_PHOTO_DIR", tmp_path / "photos")
    return photo_storage()


def test_local_storage_private_exclusive_round_trip_and_missing_delete(local_storage, tmp_path):
    key = photo_object_key(PHOTO_ID)
    assert key == f"local/{PHOTO_ID}.jpg"
    with patch("backend.utils.home_photos.httpx.Client") as remote:
        local_storage.put(key, b"sanitized jpeg")
        assert local_storage.get(key) == b"sanitized jpeg"
        with pytest.raises(HTTPException) as error:
            local_storage.put(key, b"must not replace")
        assert error.value.status_code == 503
        assert local_storage.get(key) == b"sanitized jpeg"
        local_storage.delete(key)
        local_storage.delete(key)
        with pytest.raises(HTTPException) as error:
            local_storage.get(key)
        assert error.value.status_code == 404
        remote.assert_not_called()
    assert not list((tmp_path / "photos").iterdir())


@pytest.mark.parametrize("environment,url,secret", [
    ("production", "", None),
    ("staging", "", None),
    ("development", "https://storage.invalid", None),
    ("development", "", SecretStr("test-key")),
    ("development", "http://storage.invalid", SecretStr("test-key")),
])
def test_incomplete_or_non_development_configuration_never_falls_back(
        local_storage, tmp_path, monkeypatch, environment, url, secret):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    monkeypatch.setattr(settings, "SUPABASE_STORAGE_URL", url)
    monkeypatch.setattr(settings, "SUPABASE_STORAGE_SERVICE_KEY", secret)
    key = photo_object_key(PHOTO_ID)
    assert key == PHOTO_ID + ".jpg"
    with patch("backend.utils.home_photos.httpx.Client") as remote:
        with pytest.raises(HTTPException) as error:
            local_storage.put(key, b"not written")
        assert error.value.status_code == 503
        remote.assert_not_called()
    assert not (tmp_path / "photos").exists()


def test_blank_configuration_uses_local_storage(local_storage, monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_STORAGE_URL", "  ")
    monkeypatch.setattr(settings, "SUPABASE_STORAGE_SERVICE_KEY", SecretStr("  "))
    assert photo_object_key(PHOTO_ID).startswith("local/")


def test_local_keys_keep_routing_after_remote_configuration_and_production_denies_them(
        local_storage, monkeypatch):
    key = photo_object_key(PHOTO_ID)
    local_storage.put(key, b"local evidence")
    monkeypatch.setattr(settings, "SUPABASE_STORAGE_URL", "https://storage.invalid")
    monkeypatch.setattr(settings, "SUPABASE_STORAGE_SERVICE_KEY", SecretStr("test-key"))
    assert photo_object_key(PHOTO_ID) == PHOTO_ID + ".jpg"
    with patch("backend.utils.home_photos.httpx.Client") as remote:
        assert local_storage.get(key) == b"local evidence"
        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        for operation in (lambda: local_storage.get(key), lambda: local_storage.delete(key)):
            with pytest.raises(HTTPException) as error:
                operation()
            assert error.value.status_code == 503
        monkeypatch.setattr(settings, "ENVIRONMENT", "development")
        local_storage.delete(key)
        remote.assert_not_called()


@pytest.mark.parametrize("key", ["local/../secret.jpg", "local//" + PHOTO_ID + ".jpg",
                                     "local/C:/secret.jpg", "local/" + PHOTO_ID + ".jpg/extra",
                                     "local/" + PHOTO_ID + ".png", "local/..\\secret.jpg"])
def test_local_storage_rejects_paths_outside_generated_keys(local_storage, tmp_path, key):
    for operation in (lambda: local_storage.put(key, b"no"), lambda: local_storage.get(key),
                      lambda: local_storage.delete(key)):
        with pytest.raises(HTTPException) as error:
            operation()
        assert error.value.status_code == 503
    assert not (tmp_path / "photos").exists()


def test_local_storage_rejects_linked_paths(local_storage, tmp_path):
    key = photo_object_key(PHOTO_ID)
    for check in ("is_symlink", "is_junction"):
        with patch.object(Path, check, return_value=True):
            for operation in (lambda: local_storage.put(key, b"no"), lambda: local_storage.get(key),
                              lambda: local_storage.delete(key)):
                with pytest.raises(HTTPException) as error:
                    operation()
                assert error.value.status_code == 503
    assert not (tmp_path / "photos").exists()


def test_local_filesystem_errors_are_sanitized(local_storage):
    key = photo_object_key(PHOTO_ID)
    with patch.object(Path, "mkdir", side_effect=PermissionError("private filesystem path")):
        with pytest.raises(HTTPException) as error:
            local_storage.put(key, b"no")
    assert error.value.status_code == 503
    assert "private filesystem path" not in error.value.detail


@pytest.mark.parametrize("failure", ["public", "unreachable", "server-error"])
def test_configured_storage_failures_never_write_locally(local_storage, tmp_path, monkeypatch, failure):
    monkeypatch.setattr(settings, "SUPABASE_STORAGE_URL", "https://storage.invalid")
    monkeypatch.setattr(settings, "SUPABASE_STORAGE_SERVICE_KEY", SecretStr("test-key"))
    def respond(request):
        if failure == "unreachable":
            raise httpx.ConnectError("offline", request=request)
        return httpx.Response(200 if failure == "public" else 503, json={"public": True})
    with patch("backend.utils.home_photos.httpx.Client", side_effect=lambda **kwargs: httpx_client(respond)):
        with pytest.raises(HTTPException) as error:
            local_storage.put(photo_object_key(PHOTO_ID), b"no")
    assert error.value.status_code == 503
    assert not (tmp_path / "photos").exists()


def test_legacy_remote_keys_never_use_local_missing_delete(local_storage):
    with pytest.raises(HTTPException) as error:
        local_storage.delete(PHOTO_ID + ".jpg")
    assert error.value.status_code == 503


def test_private_bucket_contracts_and_authenticated_only_object_paths():
    requests = []
    def respond(request):
        requests.append(request)
        if "/bucket/" in request.url.path:
            return httpx.Response(200, json={"public": False})
        return httpx.Response(200, content=b"photo")
    client = httpx.Client(transport=httpx.MockTransport(respond))
    storage = photo_storage()
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
