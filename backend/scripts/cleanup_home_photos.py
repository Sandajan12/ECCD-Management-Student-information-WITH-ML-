"""Run hourly with the backend environment; no remote calls when there is no queued work."""
from backend.config.database import SessionLocal
from backend.utils.home_photos import cleanup_photos, photo_storage


def main():
    with SessionLocal() as db:
        failures = cleanup_photos(db, photo_storage())
    print(f"Photo cleanup finished; {failures} deletion(s) require retry.")
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
