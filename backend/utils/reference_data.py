import json
from pathlib import Path
from sqlalchemy.orm import Session
from backend.models import EccdDomain, EccdQuestion


def seed_reference_data(db: Session) -> bool:
    if db.query(EccdDomain).first() or db.query(EccdQuestion).first():
        return False
    payload = json.loads((Path(__file__).resolve().parents[1] / "assets" / "reference" / "eccd.json").read_text(encoding="utf-8"))
    db.add_all(EccdDomain(**row) for row in payload["domains"])
    db.flush()
    db.add_all(EccdQuestion(**row) for row in payload["questions"])
    db.flush()
    # Explicit reference IDs need transactional sequence restarts too.
    from sqlalchemy import text
    for table, column, count in (("eccd_domains", "domain_id", max(row["domain_id"] for row in payload["domains"])), ("eccd_questions", "question_id", max(row["question_id"] for row in payload["questions"]))):
        sequence = db.execute(text("SELECT pg_get_serial_sequence(:table, :column)"), {"table": table, "column": column}).scalar_one()
        db.execute(text(f"ALTER SEQUENCE {sequence} RESTART WITH {count + 1}"))
    db.commit()
    return True
