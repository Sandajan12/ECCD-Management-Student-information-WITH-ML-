"""Private storage only. Tests inject MemoryPhotoStorage; no client storage keys."""
from io import BytesIO
import logging
import warnings
from datetime import timedelta
from urllib.parse import quote, urlsplit
import httpx
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import HTTPException
from sqlalchemy import exists, or_
from backend.config.settings import settings
from backend.models import HomeObservationPhoto, ParentHomeObservation
from backend.utils.eccd_dates import now_pht
from backend.utils.uploads import IMAGE_LIMIT


def sanitize_photo(data: bytes, content_type: str) -> bytes:
    if len(data) > IMAGE_LIMIT:
        raise HTTPException(413, "Photo must be at most 5 MiB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                if image.format not in ("JPEG", "PNG", "WEBP") or Image.MIME[image.format] != content_type:
                    raise ValueError()
                width, height = image.size
                if width < 1 or height < 1 or max(width, height) > 8192 or width * height > 20_000_000:
                    raise ValueError()
                image.verify()
            with Image.open(BytesIO(data)) as original:
                image = ImageOps.exif_transpose(original).convert("RGB")
                # Rebuild pixels into a fresh image: EXIF, GPS, comments and profiles never survive.
                clean = Image.new("RGB", image.size)
                clean.paste(image)
                clean.thumbnail((2048, 2048))
                result = BytesIO()
                clean.save(result, format="JPEG", quality=85)
                return result.getvalue()
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise HTTPException(400, "Use a valid JPEG, PNG or WebP photo (up to 8192 pixels per side and 20 megapixels).") from None


class SupabasePhotoStorage:
    def request(self, method: str, path: str, **kwargs):
        origin = settings.SUPABASE_STORAGE_URL.rstrip("/")
        parsed = urlsplit(origin)
        if parsed.scheme != "https" or not parsed.hostname or parsed.path or parsed.username or parsed.query or parsed.fragment:
            raise HTTPException(503, "Private photo storage is not configured.")
        secret = settings.SUPABASE_STORAGE_SERVICE_KEY
        if not secret:
            raise HTTPException(503, "Private photo storage is not configured.")
        headers = {"Authorization": "Bearer " + secret.get_secret_value(), "apikey": secret.get_secret_value()}
        headers.update(kwargs.pop("headers", {}))
        try:
            with httpx.Client(timeout=30, follow_redirects=False) as client:
                # Fail closed if the configured bucket was accidentally made public.
                bucket = client.get(origin + "/storage/v1/bucket/" + settings.HOME_OBSERVATION_PHOTO_BUCKET, headers=headers)
                if bucket.status_code != 200 or bucket.json().get("public") is not False:
                    raise HTTPException(503, "Photo bucket must exist and be private.")
                response = client.request(method, origin + "/storage/v1/" + path, headers=headers, **kwargs)
                if response.status_code == 404 and method == "GET":
                    raise HTTPException(404, "Photo is unavailable.")
                response.raise_for_status()
                return response
        except (httpx.HTTPError, ValueError):
            raise HTTPException(503, "Private photo storage is temporarily unavailable.") from None

    def put(self, key: str, data: bytes):
        self.request("POST", f"object/{settings.HOME_OBSERVATION_PHOTO_BUCKET}/{quote(key)}", content=data,
                     headers={"Content-Type": "image/jpeg", "Cache-Control": "no-store", "x-upsert": "false"})

    def get(self, key: str) -> bytes:
        return self.request("GET", f"object/authenticated/{settings.HOME_OBSERVATION_PHOTO_BUCKET}/{quote(key)}").content

    def delete(self, key: str):
        self.request("DELETE", f"object/{settings.HOME_OBSERVATION_PHOTO_BUCKET}", json={"prefixes": [key]})


class MemoryPhotoStorage:
    """Explicit dependency override for isolated tests, never selected by an environment flag."""
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def put(self, key: str, data: bytes):
        self.objects[key] = data

    def get(self, key: str) -> bytes:
        if key not in self.objects:
            raise HTTPException(404, "Photo is unavailable.")
        return self.objects[key]

    def delete(self, key: str):
        self.objects.pop(key, None)


def photo_storage():
    return SupabasePhotoStorage()


def cleanup_photos(db, storage, *, photo_ids=None) -> int:
    """Commit a durable intent before external deletion; abandoned uploads expire after 24h."""
    attached = exists().where(ParentHomeObservation.photo_id == HomeObservationPhoto.photo_id)
    query = db.query(HomeObservationPhoto).filter(HomeObservationPhoto.object_key.isnot(None))
    if photo_ids is not None:
        query = query.filter(HomeObservationPhoto.photo_id.in_(photo_ids))
    else:
        query = query.filter(or_(HomeObservationPhoto.delete_pending.is_(True),
                                 ~attached & (HomeObservationPhoto.created_at < now_pht() - timedelta(hours=24)),
                                 HomeObservationPhoto.student_id.is_(None), HomeObservationPhoto.question_id.is_(None)))
    ids = [row.photo_id for row in query.all()]
    failures = 0
    for photo_id in ids:
        photo = db.query(HomeObservationPhoto).filter_by(photo_id=photo_id).populate_existing().with_for_update().one()
        if not photo.object_key:
            continue
        # A submission may attach an expired temporary upload after the initial scan.
        linked = db.query(ParentHomeObservation).filter_by(photo_id=photo_id, status="pending").first()
        if linked and not photo.delete_pending:
            continue
        photo.delete_pending = True
        photo.delete_attempts += 1
        key = photo.object_key
        db.commit()
        try:
            storage.delete(key)
        except Exception:
            failures += 1
            logging.getLogger(__name__).warning("Private observation photo cleanup failed; durable retry retained.")
            continue
        photo.object_key = None
        photo.ready = False
        photo.delete_pending = False
        photo.deleted_at = now_pht()
        db.commit()
    return failures
