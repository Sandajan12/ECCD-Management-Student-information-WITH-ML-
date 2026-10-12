"""Prepare a separate loopback-only Chairman UI database without changing ames_db.

Run: uv run --no-project --python .venv312 python -m backend.scripts.setup_parity_dev
"""
from pathlib import Path
import os
import re
import subprocess
import sys

from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[2]
DATABASE = "ames_parity_dev"


def update_env(path: Path, changes: dict[str, str]) -> None:
    content = path.read_text(encoding="utf-8") if path.exists() else ""
    for key, value in changes.items():
        pattern = rf"(?m)^{re.escape(key)}\s*=.*$"
        if re.search(pattern, content):
            content = re.sub(pattern, lambda _: f"{key}={value}", content)
        else:
            content = content.rstrip() + f"\n{key}={value}\n"
    path.write_text(content, encoding="utf-8")


def main() -> None:
    env = ROOT / "backend" / ".env"
    if not env.is_file():
        raise SystemExit("Configure backend/.env with your local PostgreSQL credentials first.")
    values = dotenv_values(env)
    source = make_url(values["DATABASE_URL"])
    if source.get_backend_name() != "postgresql" or source.host not in ("localhost", "127.0.0.1", "::1"):
        raise SystemExit("Parity setup requires a loopback PostgreSQL server.")
    admin = create_engine(source.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as connection:
            exists = connection.execute(text("SELECT 1 FROM pg_database WHERE datname=:name"), {"name": DATABASE}).scalar()
            if not exists:
                connection.execute(text("CREATE DATABASE ames_parity_dev"))
                print("Created separate local ames_parity_dev database.")
    finally:
        admin.dispose()
    backup = env.with_name(".env.before-parity")
    if not backup.exists():
        backup.write_bytes(env.read_bytes())
    changes = {
        "DATABASE_URL": source.set(database=DATABASE).render_as_string(hide_password=False),
        "ENVIRONMENT": "development",
        "ENABLE_OTP": "false",
    }
    update_env(env, changes)
    update_env(ROOT / "frontend" / ".env.local", {
        "VITE_API_URL": "http://localhost:8000",
        "VITE_SOCKET_URL": "http://localhost:8000",
    })
    child_env = {**os.environ, **changes}
    for module, args in (
        ("backend.scripts.configure_lrn", []),
        ("backend.migrations.phase1", ["--apply"]),
        ("backend.migrations.phase2", ["--apply"]),
        ("backend.migrations.phase2", ["--check"]),
        ("backend.scripts.seed_development", []),
    ):
        # Phase 1 is historical; skip it when this dedicated database is Phase 2.
        if module == "backend.migrations.phase1":
            target = create_engine(changes["DATABASE_URL"])
            try:
                with target.connect() as connection:
                    ledger = connection.execute(text("SELECT to_regclass('public.ames_schema_migrations')")).scalar()
                    if ledger and connection.execute(text("SELECT 1 FROM ames_schema_migrations WHERE version='002_student_identity_api'")).scalar():
                        continue
            finally:
                target.dispose()
        subprocess.run([sys.executable, "-m", module, *args], cwd=ROOT, env=child_env, check=True)
    print("Parity environment ready. Original database unchanged; original env saved in backend/.env.before-parity.")


if __name__ == "__main__":
    main()
