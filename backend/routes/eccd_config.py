from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List

from backend.config.database import get_db
from backend.utils.deps import verify_eccd_question_access, verify_role
from backend.models.eccd import EccdDomain, EccdQuestion
from backend.schemas.common import MessageResult
from backend.schemas.eccd_config import AddedDomain, AddedQuestion, ConfigDomain, HomeBasedPayload, QuestionCreate, QuestionEdit
from backend.schemas.eccd import EccdDomainBase as DomainBase, EccdDomainResponse as DomainResponse, EccdQuestionResponse as QuestionResponse

router = APIRouter(prefix="/api/eccd-config", tags=["ECCD Config"])
chairman_router = APIRouter(prefix="/api/chairman", tags=["ECCD Management"])

@router.get("/", response_model=List[ConfigDomain])
def get_domains_and_questions(
    db: Session = Depends(get_db),
    current_user = Depends(verify_role(["super-admin", "chairman", "admin", "teacher"]))
):
    domains = db.query(EccdDomain).all()
    questions = db.query(EccdQuestion).order_by(EccdQuestion.sequence_order, EccdQuestion.question_id).all()
    
    formatted_domains = []
    for d in domains:
        domain_questions = [
            {
                "question_id": q.question_id,
                "domain_id": q.domain_id,
                "question_text": q.question_text,
                "sequence_order": q.sequence_order,
                "is_home_based": q.is_home_based
            } for q in questions if q.domain_id == d.domain_id
        ]
        formatted_domains.append({
            "domain_id": d.domain_id,
            "domain_name": d.domain_name,
            "questions": domain_questions
        })
        
    return formatted_domains

@router.post("/domains", response_model=DomainResponse)
def add_domain(
    payload: DomainBase,
    db: Session = Depends(get_db),
    current_user = Depends(verify_eccd_question_access)
):
    new_domain = EccdDomain(domain_name=payload.domain_name)
    db.add(new_domain)
    db.commit()
    db.refresh(new_domain)
    return new_domain

@router.put("/domains/{domain_id}", response_model=MessageResult)
@chairman_router.put("/eccd-domains/{domain_id}", response_model=MessageResult)
def update_domain(
    domain_id: int,
    payload: DomainBase,
    db: Session = Depends(get_db),
    current_user = Depends(verify_eccd_question_access)
):
    domain = db.query(EccdDomain).filter(EccdDomain.domain_id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    domain.domain_name = payload.domain_name
    db.commit()
    return {"message": "Domain updated successfully"}

@router.delete("/domains/{domain_id}", response_model=MessageResult)
@chairman_router.delete("/eccd-domains/{domain_id}", response_model=MessageResult)
def delete_domain(
    domain_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(verify_eccd_question_access)
):
    domain = db.query(EccdDomain).filter(EccdDomain.domain_id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    db.delete(domain)
    db.commit()
    return {"message": "Domain deleted successfully"}

@router.post("/questions", response_model=QuestionResponse)
def add_question(
    payload: QuestionCreate,
    db: Session = Depends(get_db),
    current_user = Depends(verify_eccd_question_access)
):
    # All appends to a domain share this lock, including cross-domain moves.
    if db.query(EccdDomain).filter_by(domain_id=payload.domain_id).with_for_update().first() is None:
        raise HTTPException(400, "Domain does not exist.")
    sequence = (db.query(func.max(EccdQuestion.sequence_order)).filter_by(domain_id=payload.domain_id).scalar() or 0) + 1
    new_q = EccdQuestion(
        domain_id=payload.domain_id,
        question_text=payload.question_text,
        sequence_order=sequence,
        is_home_based=payload.is_home_based
    )
    db.add(new_q)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if getattr(getattr(error.orig, "diag", None), "constraint_name", None) == "idx_questions_domain_sequence":
            raise HTTPException(409, "Question order changed. Please submit again.") from None
        raise
    db.refresh(new_q)
    return new_q

@router.put("/questions/{question_id}", response_model=MessageResult)
@chairman_router.put("/eccd-questions/{question_id}", response_model=MessageResult)
def update_question(
    question_id: int,
    payload: QuestionEdit,
    db: Session = Depends(get_db),
    current_user = Depends(verify_eccd_question_access)
):
    q = db.query(EccdQuestion).filter(EccdQuestion.question_id == question_id).with_for_update().first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    if payload.domain_id is not None and payload.domain_id != q.domain_id:
        if db.query(EccdDomain).filter_by(domain_id=payload.domain_id).with_for_update().first() is None:
            raise HTTPException(400, "Domain does not exist.")
        q.sequence_order = (db.query(func.max(EccdQuestion.sequence_order)).filter_by(domain_id=payload.domain_id).scalar() or 0) + 1
        q.domain_id = payload.domain_id
    if payload.is_home_based is not None:
        q.is_home_based = payload.is_home_based
    q.question_text = payload.question_text
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if getattr(getattr(error.orig, "diag", None), "constraint_name", None) == "idx_questions_domain_sequence":
            raise HTTPException(409, "Question order changed. Please submit again.") from None
        raise
    return {"message": "Question updated successfully"}

@router.delete("/questions/{question_id}", response_model=MessageResult)
@chairman_router.delete("/eccd-questions/{question_id}", response_model=MessageResult)
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(verify_eccd_question_access)
):
    q = db.query(EccdQuestion).filter(EccdQuestion.question_id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    db.delete(q)
    db.commit()
    return {"message": "Question deleted successfully"}

@router.put("/questions/{question_id}/home-based", response_model=MessageResult)
@chairman_router.put("/eccd-questions/{question_id}/home-based", response_model=MessageResult)
def toggle_home_based_status(
    question_id: int,
    payload: HomeBasedPayload,
    db: Session = Depends(get_db),
    current_user = Depends(verify_eccd_question_access)
):
    q = db.query(EccdQuestion).filter(EccdQuestion.question_id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    q.is_home_based = payload.is_home_based
    db.commit()
    return {"message": "Question home-based status updated successfully"}


@chairman_router.get("/eccd-data", response_model=List[ConfigDomain])
def legacy_data(db: Session = Depends(get_db), current_user=Depends(verify_eccd_question_access)):
    return get_domains_and_questions(db, current_user)


@chairman_router.post("/eccd-domains", response_model=AddedDomain)
def legacy_add_domain(payload: DomainBase, db: Session = Depends(get_db), current_user=Depends(verify_eccd_question_access)):
    domain = add_domain(payload, db, current_user)
    return {"message": "Domain added successfully", "domain_id": domain.domain_id}


@chairman_router.post("/eccd-questions", response_model=AddedQuestion)
def legacy_add_question(payload: QuestionCreate, db: Session = Depends(get_db), current_user=Depends(verify_eccd_question_access)):
    question = add_question(payload, db, current_user)
    return {"message": "Question added successfully", "question_id": question.question_id}
