"""Bootstrap the configured PostgreSQL database explicitly, never at API startup.

Run from the repository root: python -m backend.scripts.seed_supabase --apply
Uses DATABASE_URL / SUPABASE_DB_URL and the normal backend TLS/key settings.
"""

import argparse
import json
from pathlib import Path

from pydantic import EmailStr, Field, SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import inspect, or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from backend.config.database import engine
from backend.config.settings import ENV_FILE_PATH
from backend.migrations import (
    adviser_takeover, auth_security_version, eccd_evaluator_tracking,
    parent_assessment_access, parent_eccd_marks, parent_linking,
    parent_predictions, parity_batch1, parity_batch2, phase1, phase2,
    section_ownership,
)
from backend.models import EccdDomain, EccdQuestion, User
from backend.models.user import UserRole
from backend.schemas.common import validate_password, validate_person_name
from backend.utils.authentication import revoke_credentials
from backend.utils.security import get_password_hash, verify_password

FIXTURE = Path(__file__).resolve().parents[1] / "assets" / "reference" / "eccd.json"
# Phase 1 is an intermediate schema: its checker cannot run after Phase 2.
MIGRATIONS = (
    (phase1.VERSION, phase1.apply_phase1),
    (phase2.VERSION, phase2.apply_phase2),
    (parity_batch1.VERSION, parity_batch1.apply_batch1),
    (parity_batch2.VERSION, parity_batch2.apply_batch2),
    (parent_linking.VERSION, parent_linking.apply_parent_linking),
    (parent_assessment_access.VERSION, parent_assessment_access.apply_parent_assessment_access),
    (eccd_evaluator_tracking.VERSION, eccd_evaluator_tracking.apply_eccd_evaluator_tracking),
    (adviser_takeover.VERSION, adviser_takeover.apply_adviser_takeover),
    (parent_eccd_marks.VERSION, parent_eccd_marks.apply_parent_eccd_marks),
    (parent_predictions.VERSION, parent_predictions.apply_parent_predictions),
    (section_ownership.VERSION, section_ownership.apply_section_ownership),
    (auth_security_version.VERSION, auth_security_version.apply_auth_security_version),
)


class BootstrapError(Exception):
    """Safe diagnostics containing no credentials or database record contents."""


class ChairmanSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH, extra="ignore", hide_input_in_errors=True,
    )
    INITIAL_CHAIRMAN_EMAIL: EmailStr | None = Field(default=None, max_length=100)
    INITIAL_CHAIRMAN_PASSWORD: SecretStr | None = None
    # users has no full-name column; username is the Chairman's display name.
    INITIAL_CHAIRMAN_NAME: str | None = Field(default=None, min_length=1, max_length=50)

    @field_validator("INITIAL_CHAIRMAN_PASSWORD")
    @classmethod
    def strong_password(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None:
            validate_password(value.get_secret_value())
        return value

    @field_validator("INITIAL_CHAIRMAN_NAME", mode="before")
    @classmethod
    def name(cls, value: str | None) -> str | None:
        return validate_person_name(value.strip()) if isinstance(value, str) else value

    @model_validator(mode="after")
    def complete_credentials(self):
        supplied = [self.INITIAL_CHAIRMAN_EMAIL is not None,
                    self.INITIAL_CHAIRMAN_PASSWORD is not None,
                    self.INITIAL_CHAIRMAN_NAME is not None]
        if any(supplied) and not all(supplied):
            raise ValueError("Set all three INITIAL_CHAIRMAN_* variables together")
        return self


def load_reference() -> dict:
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    domains, questions = payload["domains"], payload["questions"]
    domain_ids = {row["domain_id"] for row in domains}
    if (len(domains) != 7 or domain_ids != set(range(1, 8))
            or len(questions) != 109
            or len({row["question_id"] for row in questions}) != 109
            or any(row["domain_id"] not in domain_ids for row in questions)):
        raise BootstrapError("Invalid official ECCD fixture")
    for domain_id in domain_ids:
        items = [row["sequence_order"] for row in questions if row["domain_id"] == domain_id]
        if sorted(items) != list(range(1, len(items) + 1)):
            raise BootstrapError("Invalid ECCD item numbering")
    for row in questions:
        if row["is_home_based"] not in (0, 1):
            raise BootstrapError("Invalid ECCD home-based flag")
        row["is_home_based"] = bool(row["is_home_based"])
    return payload


def repair_sequence(connection: Connection, table: str, column: str, schema: str) -> None:
    """Advance an explicit-ID sequence only if necessary; never rewind it."""
    q = connection.dialect.identifier_preparer.quote
    qualified = f"{q(schema)}.{q(table)}"
    sequence = connection.execute(text("SELECT pg_get_serial_sequence(:table, :column)"),
                                  {"table": qualified, "column": column}).scalar_one()
    if sequence is None:
        raise BootstrapError("Expected identity sequence is missing")
    maximum = connection.execute(text(f"SELECT COALESCE(MAX({q(column)}), 0) FROM {qualified}")).scalar_one()
    # pg_get_serial_sequence returns a PostgreSQL-quoted identifier, not user input.
    state = connection.execute(text(f"SELECT last_value, is_called FROM {sequence}")).one()
    next_value = state.last_value + int(state.is_called)
    if next_value <= maximum:
        connection.execute(text(f"ALTER SEQUENCE {sequence} RESTART WITH {maximum + 1}"))


def seed_eccd(connection: Connection, schema: str) -> dict[str, int]:
    payload = load_reference()
    connection.execute(text("LOCK TABLE eccd_domains, eccd_questions IN SHARE ROW EXCLUSIVE MODE"))
    counts = {}
    for key, table, primary in (
        ("domains", EccdDomain.__table__, "domain_id"),
        ("questions", EccdQuestion.__table__, "question_id"),
    ):
        # Detect both primary-key drift and the same item stored under another ID.
        existing = [dict(row) for row in connection.execute(select(table)).mappings()]
        for expected in payload[key]:
            for row in existing:
                same_item = (row["domain_name"] == expected["domain_name"] if key == "domains"
                             else (row["domain_id"], row["sequence_order"]) ==
                             (expected["domain_id"], expected["sequence_order"]))
                if (row[primary] == expected[primary] or same_item) and row != expected:
                    raise BootstrapError("Existing ECCD data conflicts with the official fixture; no rows overwritten")
        counts[key] = connection.execute(insert(table).values(payload[key]).on_conflict_do_nothing(
            index_elements=[primary])).rowcount
        repair_sequence(connection, table.name, primary, schema)
    return counts


def seed_chairman(connection: Connection, credentials: ChairmanSettings, schema: str,
                  update: bool = False) -> str:
    connection.execute(text("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE"))
    with Session(bind=connection) as db:
        chairmen = db.scalars(select(User).where(User.role == UserRole.SUPER_ADMIN)
                             .order_by(User.user_id).with_for_update()).all()
        if chairmen and not update:
            return "preserved"
        if credentials.INITIAL_CHAIRMAN_EMAIL is None:
            raise BootstrapError("No Chairman credentials supplied; set all three INITIAL_CHAIRMAN_* variables")
        email = str(credentials.INITIAL_CHAIRMAN_EMAIL)
        name = credentials.INITIAL_CHAIRMAN_NAME
        password = credentials.INITIAL_CHAIRMAN_PASSWORD.get_secret_value()
        user = next((row for row in chairmen if row.email == email), None)
        if user is None and len(chairmen) == 1:
            user = chairmen[0]
        if user is None and chairmen:
            raise BootstrapError("Multiple Chairmen exist; select one by its current email for an explicit update")
        conflicts = db.scalars(select(User).where(or_(User.email == email, User.username == name))).all()
        if any(row.user_id != (user.user_id if user else None) for row in conflicts):
            raise BootstrapError("Chairman email/name conflicts with an existing account; no role changed")
        if user is None:
            repair_sequence(connection, "users", "user_id", schema)
            db.add(User(username=name, email=email, password_hash=get_password_hash(password),
                        role=UserRole.SUPER_ADMIN, is_active=True, is_first_login=False,
                        is_registration_pending=False))
            status = "created"
        elif (user.email == email and user.username == name and user.is_active
              and not user.is_first_login and not user.is_registration_pending
              and verify_password(password, user.password_hash)):
            return "preserved"
        else:
            revoke_credentials(db, user)
            user.username, user.email = name, email
            if not verify_password(password, user.password_hash):
                user.password_hash = get_password_hash(password)
            user.is_active, user.is_first_login, user.is_registration_pending = True, False, False
            status = "updated"
        db.flush()
        return status


def bootstrap(connection: Connection, credentials: ChairmanSettings, schema: str = "public",
              update_chairman: bool = False) -> dict:
    """Caller owns the transaction: commit all migrations/seeds together or rollback."""
    phase1.select_schema(connection, schema)
    connection.execute(text("SELECT pg_advisory_xact_lock(hashtext(:name))"),
                       {"name": f"ames.bootstrap:{schema}"})
    applied = set()
    if inspect(connection).has_table(phase1.LEDGER, schema=schema):
        applied = set(connection.execute(text(f"SELECT version FROM {phase1.LEDGER}")).scalars())
    if applied - {version for version, _ in MIGRATIONS}:
        raise BootstrapError("Unknown migration version; use the matching application release")
    pending = []
    for version, apply in MIGRATIONS:
        if version not in applied:
            apply(connection, schema)
            pending.append(version)
    # Validate final, rather than superseded intermediate, contracts on every run.
    for check in (
        parity_batch2.check_batch2, parent_linking.check_parent_linking,
        parent_assessment_access.check_parent_assessment_access,
        eccd_evaluator_tracking.check_eccd_evaluator_tracking,
        adviser_takeover.check_adviser_takeover, parent_eccd_marks.check_parent_eccd_marks,
        parent_predictions.check_parent_predictions, section_ownership.check_section_ownership,
        auth_security_version.check_auth_security_version,
    ):
        check(connection, schema)
    counts = seed_eccd(connection, schema)
    chairman = seed_chairman(connection, credentials, schema, update_chairman)
    return {"migrations_applied": pending, "domains_inserted": counts["domains"],
            "questions_inserted": counts["questions"], "chairman": chairman}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", required=True, action="store_true", help="Apply atomically to the configured database")
    parser.add_argument("--schema", default="public", help="Existing target schema (default: public)")
    parser.add_argument("--update-chairman", action="store_true", help="Explicitly update an existing Chairman and revoke its credentials")
    arguments = parser.parse_args()
    try:
        credentials = ChairmanSettings()
        with engine.begin() as connection:
            result = bootstrap(connection, credentials, arguments.schema, arguments.update_chairman)
        print(json.dumps(result))
        return 0
    except ValidationError:
        print("Bootstrap stopped: invalid INITIAL_CHAIRMAN_* configuration. No changes committed.")
    except (BootstrapError, phase1.MigrationError) as error:
        print(f"Bootstrap stopped: {error}. No changes committed.")
    except Exception as error:
        # Database errors can include SQL parameters, hashes, and connection details.
        print(f"Bootstrap stopped ({type(error).__name__}). No changes committed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
