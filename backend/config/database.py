from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from .settings import settings

connect_args = {"connect_timeout": 5}
if settings.DATABASE_SSL_ROOT_CERT:
    connect_args["sslrootcert"] = settings.DATABASE_SSL_ROOT_CERT
engine = create_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def database_ready() -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        if settings.production:
            connection.execute(text("SELECT bucket_key FROM api_rate_limits LIMIT 0"))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
