import os
import re
from typing import Literal
from pydantic import AliasChoices, EmailStr, Field, SecretStr, field_validator, model_validator
from sqlalchemy.engine import make_url
from urllib.parse import urlsplit
from pydantic_settings import BaseSettings, SettingsConfigDict

# Dynamically target backend/.env relative to this file (backend/config/settings.py)
CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(CONFIG_DIR)
ENV_FILE_PATH = os.path.join(BACKEND_DIR, ".env")

class Settings(BaseSettings):
    DATABASE_URL: str = Field(validation_alias=AliasChoices("DATABASE_URL", "SUPABASE_DB_URL"))
    SECRET_KEY: str = Field(validation_alias=AliasChoices("JWT_SECRET", "SECRET_KEY"))
    ALGORITHM: Literal["HS256"] = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, gt=0)
    REFRESH_TOKEN_EXPIRE_MINUTES: int = Field(default=1440, gt=0)
    ENABLE_OTP: bool = True
    ENVIRONMENT: str = Field(default="production", validation_alias=AliasChoices("ENV", "ENVIRONMENT"))
    FRONTEND_URL: str = ""
    ALLOWED_ORIGINS: str = ""
    CORS_ORIGINS: str = ""
    EMAIL_TRANSPORT: Literal["smtp", "brevo_api"] = "smtp"
    BREVO_API_KEY: SecretStr | None = None
    MAIL_FROM: EmailStr = "noreply@example.com"
    MAIL_USERNAME: str = "noreply@example.com"
    MAIL_PASSWORD: SecretStr = SecretStr("")
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_PORT: int = Field(default=587, ge=1, le=65535)
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    DATABASE_SSL_ROOT_CERT: str | None = None
    DATABASE_POOL_SIZE: int = Field(default=5, ge=1, le=50)
    DATABASE_MAX_OVERFLOW: int = Field(default=5, ge=0, le=50)
    DATABASE_POOL_TIMEOUT: int = Field(default=15, ge=1, le=120)
    DATABASE_POOL_RECYCLE: int = Field(default=300, ge=30, le=3600)
    BACKUP_ENCRYPTION_KEY: str
    BACKUP_IV: str
    LRN_ENCRYPTION_KEY: SecretStr | None = None
    LRN_HMAC_SECRET: SecretStr | None = None

    @property
    def otp_enabled(self) -> bool:
        return self.ENABLE_OTP

    @property
    def production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    @property
    def allowed_origins(self) -> list[str]:
        values = ["http://localhost:5173", "http://127.0.0.1:5173",
                  "https://ameskinder.com", "https://www.ameskinder.com", "https://ames-ml.vercel.app"]
        values.extend(self.FRONTEND_URL.split(","))
        values.extend(self.ALLOWED_ORIGINS.split(","))
        values.extend(self.CORS_ORIGINS.split(","))
        return list(dict.fromkeys(value.strip().rstrip("/") for value in values if value.strip()))

    @model_validator(mode="after")
    def validate_deployment(self):
        if self.REFRESH_TOKEN_EXPIRE_MINUTES <= self.ACCESS_TOKEN_EXPIRE_MINUTES:
            raise ValueError("REFRESH_TOKEN_EXPIRE_MINUTES must exceed ACCESS_TOKEN_EXPIRE_MINUTES")
        for origin in self.allowed_origins:
            parsed = urlsplit(origin)
            if not re.fullmatch(r"https?://(?:[A-Za-z0-9.-]+|\[[A-Fa-f0-9:]+\])(?::[0-9]{1,5})?", origin) or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
                raise ValueError("Allowed origins must be exact HTTP(S) origins")
            if parsed.port is not None and not 1 <= parsed.port <= 65535:
                raise ValueError("Allowed origin port must be between 1 and 65535")
            if self.production and origin not in ("http://localhost:5173", "http://127.0.0.1:5173") and parsed.scheme != "https":
                raise ValueError("Production frontend origins must use HTTPS")
        if self.production:
            if not self.ENABLE_OTP:
                raise ValueError("Production requires ENABLE_OTP=true")
            sender_domain = str(self.MAIL_FROM).rsplit("@", 1)[-1].lower()
            if sender_domain in ("example.com", "example.org", "example.net"):
                raise ValueError("Production requires a verified MAIL_FROM sender")
            if self.EMAIL_TRANSPORT == "brevo_api":
                key = self.BREVO_API_KEY.get_secret_value().strip() if self.BREVO_API_KEY else ""
                if len(key) < 20 or any(word in key.lower() for word in ("replace", "your_", "your-", "example", "changeme")):
                    raise ValueError("Production brevo_api transport requires a BREVO_API_KEY")
            else:
                password = self.MAIL_PASSWORD.get_secret_value().strip()
                if not self.MAIL_SERVER.strip() or not self.MAIL_USERNAME.strip() or self.MAIL_USERNAME == "noreply@example.com" or not password or any(word in password.lower() for word in ("replace", "your_", "your-", "changeme")):
                    raise ValueError("Production SMTP requires MAIL_SERVER, MAIL_USERNAME and MAIL_PASSWORD")
                if self.MAIL_STARTTLS == self.MAIL_SSL_TLS:
                    raise ValueError("Production SMTP requires exactly one of STARTTLS or SSL/TLS")
            secret = self.SECRET_KEY
            if len(secret) < 32 or len(set(secret)) < 8 or any(word in secret.lower() for word in ("change-me", "changeme", "your-secret", "default-secret")):
                raise ValueError("Production JWT_SECRET must be a strong secret of at least 32 characters")
            url = make_url(self.DATABASE_URL)
            if url.get_backend_name() != "postgresql" or url.query.get("sslmode") != "verify-full" or not (url.query.get("sslrootcert") or self.DATABASE_SSL_ROOT_CERT):
                raise ValueError("Production database requires sslmode=verify-full and a trusted sslrootcert")
        return self

    @field_validator("LRN_ENCRYPTION_KEY")
    @classmethod
    def validate_lrn_key(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and not re.fullmatch(r"[0-9a-fA-F]{64}", value.get_secret_value()):
            raise ValueError("LRN_ENCRYPTION_KEY must contain 64 hexadecimal characters")
        return value

    @field_validator("LRN_HMAC_SECRET")
    @classmethod
    def validate_lrn_hmac(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and len(value.get_secret_value()) < 32:
            raise ValueError("LRN_HMAC_SECRET must contain at least 32 characters")
        return value

    model_config = SettingsConfigDict(env_file=ENV_FILE_PATH, extra="ignore", populate_by_name=True, hide_input_in_errors=True)

settings = Settings()
