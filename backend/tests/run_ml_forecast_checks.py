"""Run focused integration checks in a newly created, disposable local database.

Never points tests at the configured application database. Requires a local
development PostgreSQL account with CREATEDB, using only its maintenance DB.
"""
import argparse
import os
from pathlib import Path
import re
import subprocess
from uuid import uuid4

import psycopg2
from psycopg2 import sql
from sqlalchemy.engine import make_url

from backend.config.settings import settings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("suite", choices=("api", "sandbox", "parent"))
    args = parser.parse_args()
    configured = make_url(settings.DATABASE_URL)
    if settings.production or configured.host not in ("localhost", "127.0.0.1", "::1"):
        raise RuntimeError("Disposable integration checks require a loopback development PostgreSQL server.")
    name = "ames_ml_bounds_test_" + uuid4().hex
    assert re.fullmatch(r"ames_ml_bounds_test_[0-9a-f]{32}", name)
    maintenance = configured.set(drivername="postgresql", database="postgres")
    connection = psycopg2.connect(maintenance.render_as_string(hide_password=False), connect_timeout=5)
    connection.autocommit = True
    created = False
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        created = True
        print(f"Created disposable loopback database: {name}", flush=True)
        environment = {**os.environ, "ENV": "development", "ENVIRONMENT": "development",
            "ENABLE_OTP": "false", "DATABASE_URL": configured.set(database=name).render_as_string(hide_password=False),
            "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1", "MKL_NUM_THREADS": "1"}
        if args.suite == "api":
            command = ["uv", "run", "--no-project", "--python", ".venv312", "python", "-m", "unittest",
                       "backend.tests.test_ml_api", "backend.tests.test_parent_ml", "-v"]
        else:
            config = "playwright.ml-sandbox.config.ts" if args.suite == "sandbox" else "playwright.parent-ml.config.ts"
            command = ["pnpm.cmd" if os.name == "nt" else "pnpm", "--dir", "frontend", "exec",
                       "playwright", "test", "--config", config]
        result = subprocess.run(command, cwd=Path(__file__).resolve().parents[2], env=environment, check=False)
        return result.returncode
    finally:
        if created:
            # Only this invocation's freshly created database can be removed.
            assert name != configured.database and re.fullmatch(r"ames_ml_bounds_test_[0-9a-f]{32}", name)
            with connection.cursor() as cursor:
                cursor.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))
            print(f"Removed disposable database: {name}", flush=True)
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
