"""Create missing local LRN secrets without printing or replacing existing keys."""

from pathlib import Path
import secrets

from dotenv import dotenv_values
from sqlalchemy import create_engine, inspect, text


def main() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.is_file():
        raise SystemExit("Create backend/.env with your database settings first.")
    values = dotenv_values(env_path)
    names = ("LRN_ENCRYPTION_KEY", "LRN_HMAC_SECRET")
    missing = [name for name in names if not values.get(name)]
    if not missing:
        print("Existing LRN keys preserved.")
        return
    engine = create_engine(values["DATABASE_URL"])
    with engine.connect() as connection:
        if inspect(connection).has_table("students"):
            columns = {column["name"] for column in inspect(connection).get_columns("students")}
            if "lrn_encrypted" in columns and connection.execute(
                text("SELECT EXISTS (SELECT 1 FROM students WHERE lrn_encrypted IS NOT NULL)")
            ).scalar_one():
                raise SystemExit("Encrypted students exist. Restore the original LRN keys; do not generate new ones.")
    with env_path.open("a", encoding="utf-8") as output:
        output.write("\n# Phase 1 student LRN protection; preserve these keys with database backups.\n")
        for name in missing:
            output.write(f"{name}={secrets.token_hex(32)}\n")
    engine.dispose()
    print("Missing LRN keys saved directly to backend/.env; existing settings preserved.")


if __name__ == "__main__":
    main()
