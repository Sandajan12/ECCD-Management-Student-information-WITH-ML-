"""Authorized teacher and parent research predictions; assessments never change."""
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy.orm import Session, selectinload

from backend.config.database import get_db
from backend.ml.common import DOMAINS, DOMAIN_NAMES, sandbox_composites
from backend.ml.inference import predict_student
from backend.models import EccdQuestion, FamilyAccess, Parent, Student, StudentEccdEvaluation, User
from backend.models.eccd import TestingPeriod
from backend.schemas.ml import MLFeatures, MLStudentOption, PredictionResponse, ParentMLReadiness, ParentPredictionResponse
from backend.schemas.common import PositiveId
from backend.utils.access import authorize_student, current_teacher, resolve_student, teacher_sections, permissions_for_student
from backend.utils.deps import verify_role
from backend.utils.eccd_dates import get_official_testing_date
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores
from backend.utils.students import parent_student_name

router = APIRouter(prefix="/api/ml", tags=["ML Research"])
teacher_only = verify_role(["admin"])
NOTICE = "Educational research prototype for instructional planning, not a formal clinical diagnosis. Model probabilities are not calibrated clinical confidence."
EDUCATIONS = {v.casefold(): v for v in ("Elementary", "High School", "Vocational", "College")}


def pre_readiness(student: Student, records: list, questions: list) -> tuple[bool, str]:
    required = {q.question_id for q in questions}
    if {q.domain_id for q in questions} != set(range(1, 8)):
        return False, "All seven ECCD domains must have configured questions."
    if not required.issubset({r.question_id for r in records}):
        return False, "Complete all PRE checklist answers before running a prediction."
    assessment_date = get_official_testing_date(records, TestingPeriod.PRE)
    if assessment_date is None:
        return False, "A teacher-confirmed PRE assessment date is required."
    if student.date_of_birth is None or student.date_of_birth >= assessment_date:
        return False, "A valid birth date before the PRE assessment is required."
    return True, "Completed PRE assessment available"


@router.get("/students", response_model=list[MLStudentOption])
def prediction_students(section_id: int = Query(gt=0), db: Session = Depends(get_db), user: User = Depends(teacher_only)):
    if section_id not in teacher_sections(db, current_teacher(db, user)):
        raise HTTPException(403, "Section is not assigned to you.")
    students = db.query(Student).filter_by(section_id=section_id, is_active=True).order_by(Student.last_name, Student.first_name, Student.student_id).all()
    questions = db.query(EccdQuestion).all()
    records = db.query(StudentEccdEvaluation).filter(
        StudentEccdEvaluation.student_id.in_([s.student_id for s in students]),
        StudentEccdEvaluation.testing_period == TestingPeriod.PRE,
    ).all()
    by_student: dict[int, list] = {}
    for record in records:
        by_student.setdefault(record.student_id, []).append(record)
    result = []
    for student in students:
        complete, note = pre_readiness(student, by_student.get(student.student_id, []), questions)
        result.append({"student_id": student.student_id, "student_name": student_name(student),
                       "pre_complete": complete, "readiness_note": note})
    return result


def student_name(student: Student) -> str:
    return " ".join(part for part in (student.first_name, student.middle_name, student.last_name) if part) or f"Student {student.student_id}"


def demographic_features(student: Student, links: list) -> dict:
    # Free-text jobs have no reviewed occupation-tier mapping in the training
    # artifact. Leave the tier missing rather than inventing family circumstances.
    education = {}
    for link in sorted(links, key=lambda item: item.id):
        relation = (link.relationship_type or "").casefold()
        if relation in ("father", "mother"):
            education[f"{relation}_education_level"] = EDUCATIONS.get((link.parent.educational_attainment or "").strip().casefold())
    ordinal = re.fullmatch(r"([1-9][0-9]*)(?:st|nd|rd|th)?", (student.birth_order or "").strip(), re.IGNORECASE)
    birth_order = int(ordinal[1]) if ordinal and int(ordinal[1]) <= 31 else None
    siblings = student.num_of_siblings
    return {"gender": student.gender.value.upper() if student.gender else None,
            "handedness": student.handedness.value if student.handedness else None,
            "father_education_level": education.get("father_education_level"),
            "mother_education_level": education.get("mother_education_level"),
            "household_occupation_tier": None,
            "num_siblings": siblings if siblings is not None and 0 <= siblings <= 30 else None,
            "birth_order": birth_order}


def prediction_response(features: MLFeatures, item_features: dict | None = None) -> dict:
    values = features.model_dump()
    try:
        result = predict_student({**values, **(item_features or {})})
    except (OSError, ValueError, KeyError, TypeError):
        logging.getLogger(__name__).error("ML artifacts unavailable or incompatible.")
        raise HTTPException(503, "The research model is unavailable. Please contact the administrator.") from None
    probabilities = result["class_probabilities"]
    return {**result, "confidence_percentages": {label: value * 100 for label, value in probabilities.items()},
            "confidence_percentage": probabilities[result["predicted_post_interpretation"]] * 100,
            "features": features, "imputed_fields": [key for key, value in values.items() if value is None],
            "baseline_domains": [{"domain": code, "name": DOMAIN_NAMES[code],
                "pre_scaled_score": values[f"{prefix}_pre_scaled"],
                "tier": "Delay" if values[f"{prefix}_pre_scaled"] <= 3 else "Slight Delay" if values[f"{prefix}_pre_scaled"] <= 6 else "Average"}
                for code, (prefix, _) in DOMAINS.items()], "research_notice": NOTICE}


@router.post("/predict/sandbox", response_model=PredictionResponse)
def predict_sandbox(payload: MLFeatures, user: User = Depends(teacher_only)):
    values = payload.model_dump()
    return prediction_response(MLFeatures(**{**values, **sandbox_composites(values)}))


@router.post("/predict/student/{student_id}", response_model=PredictionResponse)
def predict_record(student_id: int, db: Session = Depends(get_db), user: User = Depends(teacher_only)):
    student = resolve_student(db, student_id)
    authorize_student(db, user, student)
    if not student.is_active:
        raise HTTPException(409, "Select an active student for prediction.")
    return predict_student_record(db, student)


def predict_student_record(db: Session, student: Student, *, parent_request: bool = False):
    student_id = student.student_id
    questions = db.query(EccdQuestion).order_by(EccdQuestion.sequence_order, EccdQuestion.question_id).all()
    records = db.query(StudentEccdEvaluation).filter_by(student_id=student_id, testing_period=TestingPeriod.PRE).all()
    complete, note = pre_readiness(student, records, questions)
    if not complete:
        if parent_request:
            raise HTTPException(400, "PRE assessment must be completed before generating a prediction.")
        raise HTTPException(409, note)
    assessment_date = get_official_testing_date(records, TestingPeriod.PRE)
    birth = student.date_of_birth
    months = (assessment_date.year - birth.year) * 12 + assessment_date.month - birth.month - (assessment_date.day < birth.day)
    by_id = {q.question_id: q for q in questions}
    scores = calculate_scores([{"domain_id": by_id[r.question_id].domain_id, "answer": r.answer.value} for r in records if r.question_id in by_id], calculate_decimal_age(birth, assessment_date))
    item_features = {}
    for index, (code, (prefix, _)) in enumerate(DOMAINS.items(), 1):
        domain_questions = [q for q in questions if q.domain_id == index]
        # Artifact item identifiers are local positions within each domain.
        positions = {q.question_id: position for position, q in enumerate(domain_questions, 1)}
        item_features[f"{prefix}_pre_di_kaya_items"] = ";".join(str(positions[r.question_id]) for r in records if r.question_id in positions and r.answer.value == "DI-KAYA")
    links = db.query(FamilyAccess).options(selectinload(FamilyAccess.parent)).join(Parent).filter(FamilyAccess.student_id == student_id, FamilyAccess.status == "SYNCED").all()
    try:
        features = MLFeatures(**{f"{prefix}_pre_scaled": scores["scaled_scores"][code] for code, (prefix, _) in DOMAINS.items()},
            pre_standard_score=scores["standard_score"], pre_total_scaled=scores["sum_of_scaled_scores"],
            pre_delayed_domains_count=sum(v <= 6 for v in scores["scaled_scores"].values()),
            age_months_pre=months, **demographic_features(student, links))
    except ValidationError:
        raise HTTPException(409, "The PRE profile contains values outside the model input limits. Review the student record.") from None
    return {**prediction_response(features, item_features), "student_id": student_id,
            "student_name": parent_student_name(db, student) if parent_request else student_name(student), "assessment_date": assessment_date}


def parent_prediction_student(db: Session, user: User, student_id: int) -> Student:
    student = resolve_student(db, student_id)
    authorize_student(db, user, student)
    if not student.is_active:
        raise HTTPException(403, "Predictions are available only for currently enrolled children.")
    return student


@router.get("/parent/readiness/{student_id}", response_model=ParentMLReadiness)
def parent_prediction_readiness(student_id: PositiveId, db: Session = Depends(get_db), user: User = Depends(verify_role(["user"]))):
    student = parent_prediction_student(db, user, student_id)
    permissions = permissions_for_student(db, student)
    questions = db.query(EccdQuestion).all()
    records = db.query(StudentEccdEvaluation).filter_by(student_id=student_id, testing_period=TestingPeriod.PRE).all()
    complete, _ = pre_readiness(student, records, questions)
    return {"student_id": student_id, "student_name": parent_student_name(db, student), "pre_complete": complete,
            "readiness_note": "Completed PRE assessment available" if complete else "PRE assessment must be completed before generating a prediction.",
            "allow_parent_predictions": permissions.allow_parent_predictions,
            "is_published": permissions.allow_parent_view_eccd_pre}


@router.post("/parent/predict/{student_id}", response_model=ParentPredictionResponse)
def predict_parent_record(student_id: PositiveId, db: Session = Depends(get_db), user: User = Depends(verify_role(["user"]))):
    student = parent_prediction_student(db, user, student_id)
    permissions = permissions_for_student(db, student)
    if not permissions.allow_parent_predictions:
        raise HTTPException(403, "Prediction access is currently disabled by your child's adviser.")
    questions = db.query(EccdQuestion).all()
    records = db.query(StudentEccdEvaluation).filter_by(student_id=student_id, testing_period=TestingPeriod.PRE).all()
    if not pre_readiness(student, records, questions)[0]:
        raise HTTPException(400, "PRE assessment must be completed before generating a prediction.")
    # Predictions include actual baseline scores and gaps. The independent PRE
    # release must also be open before those records may leave the server.
    if not permissions.allow_parent_view_eccd_pre:
        raise HTTPException(403, "Results Pending Adviser Release: PRE results must be released before viewing prediction insights.")
    return predict_student_record(db, student, parent_request=True)
