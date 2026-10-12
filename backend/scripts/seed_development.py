"""Create the test Chairman only in the dedicated development database."""
from sqlalchemy.engine import make_url

from backend.config.settings import settings
from backend.config.database import SessionLocal
from backend.models import User
from backend.models.user import UserRole
from backend.utils.security import get_password_hash, verify_password

USERNAME = "chairman.dev"
EMAIL = "chairman.dev@example.com"
PASSWORD = "ChairmanDev123!"


def main() -> None:
    url = make_url(settings.DATABASE_URL)
    if settings.ENVIRONMENT.lower() != "development" or url.host not in ("localhost", "127.0.0.1", "::1") or url.database != "ames_parity_dev":
        raise SystemExit("Test account seeding is restricted to development on local ames_parity_dev.")
    with SessionLocal() as db:
        existing = db.query(User).filter((User.username == USERNAME) | (User.email == EMAIL)).all()
        if existing:
            if len(existing) != 1 or existing[0].username != USERNAME or existing[0].email != EMAIL or existing[0].role != UserRole.SUPER_ADMIN or not existing[0].is_active or not verify_password(PASSWORD, existing[0].password_hash):
                raise SystemExit("An existing test account differs; its credentials and state were preserved.")
            print("Existing development Chairman verified; credentials preserved.")
            return
        db.add(User(username=USERNAME, email=EMAIL, password_hash=get_password_hash(PASSWORD),
                    role=UserRole.SUPER_ADMIN, is_active=True, is_first_login=False, is_registration_pending=False))
        db.commit()
    print("Development Chairman created: chairman.dev / ChairmanDev123! (local test account only)")


if __name__ == "__main__":
    main()
