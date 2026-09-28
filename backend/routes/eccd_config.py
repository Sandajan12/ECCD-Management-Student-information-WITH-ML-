from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List

from backend.config.database import get_db
from backend.utils.deps import verify_eccd_question_access, verify_role
from backend.models.eccd import EccdDomain, EccdQuestion

router = APIRouter(prefix="/api/eccd-config", tags=["ECCD Config"])

# Schemas
class DomainBase(BaseModel):
    domain_name: str
    
class DomainResponse(DomainBase):
    domain_id: int
    
class QuestionBase(BaseModel):
    domain_id: int
    question_text: str
    sequence_order: int
    is_home_based: bool = False
    
class QuestionResponse(QuestionBase):
    question_id: int

@router.get("/", response_model=List[dict])
def get_domains_and_questions(
    db: Session = Depends(get_db),
    current_user = Depends(verify_role(["super-admin", "chairman", "admin", "teacher"]))
):
    domains = db.query(EccdDomain).all()
    questions = db.query(EccdQuestion).order_by(EccdQuestion.sequence_order.asc()).all()
    
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

@router.put("/domains/{domain_id}")
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

@router.delete("/domains/{domain_id}")
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
    payload: QuestionBase,
    db: Session = Depends(get_db),
    current_user = Depends(verify_eccd_question_access)
):
    new_q = EccdQuestion(
        domain_id=payload.domain_id,
        question_text=payload.question_text,
        sequence_order=payload.sequence_order,
        is_home_based=payload.is_home_based
    )
    db.add(new_q)
    db.commit()
    db.refresh(new_q)
    return new_q

@router.put("/questions/{question_id}")
def update_question(
    question_id: int,
    payload: QuestionBase,
    db: Session = Depends(get_db),
    current_user = Depends(verify_eccd_question_access)
):
    q = db.query(EccdQuestion).filter(EccdQuestion.question_id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    q.question_text = payload.question_text
    q.sequence_order = payload.sequence_order
    db.commit()
    return {"message": "Question updated successfully"}

@router.delete("/questions/{question_id}")
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

class HomeBasedPayload(BaseModel):
    is_home_based: bool
    
@router.put("/questions/{question_id}/home-based")
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
