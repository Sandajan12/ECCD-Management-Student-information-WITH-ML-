
from backend.config.database import get_db
from backend.models.section import Section
from backend.schemas.section import SectionCreate, SectionResponse, SectionUpdate
from backend.utils.deps import verify_role
from backend.schemas.teacher import AssignTeacherSectionRequest
from backend.schemas.common import MessageResult
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/sections", tags=["Sections"])


@router.get("/", response_model=list[SectionResponse])
def get_sections(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin", "user"])),
):
    return db.query(Section).all()


@router.post("/", response_model=SectionResponse, status_code=201)
def create_section(payload: SectionCreate, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.teachers import assign_teacher
    if db.query(Section).filter_by(section_name=payload.section_name).first():
        raise HTTPException(400, "Section name already exists.")
    section = Section(section_name=payload.section_name)
    db.add(section)
    db.flush()
    if payload.adviser_teacher_id:
        assign_teacher(db, current_user, section.section_id, payload.adviser_teacher_id)
    db.commit()
    db.refresh(section)
    return section


from backend.models.teacher import Teacher
from backend.models.user import User
from backend.models.section_teacher import SectionTeacher
from backend.models.log import SystemLog


@router.put("/{section_id}/assign", response_model=SectionResponse)
def assign_teacher(section_id: int, payload: AssignTeacherSectionRequest, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.teachers import assign_teacher as assign
    section = assign(db, current_user, section_id, payload.teacher_id, payload.role.value if payload.role else "Primary Adviser")
    db.commit()
    return section


@router.delete("/{section_id}", response_model=MessageResult)
def delete_section(section_id: int, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    section = db.get(Section, section_id)
    if section is None:
        raise HTTPException(404, "Section not found.")
    from backend.models import Student
    if db.query(Student).filter_by(section_id=section_id).first():
        raise HTTPException(409, "Transfer the section's students before deleting it.")
    db.query(SectionTeacher).filter_by(section_id=section_id).delete(synchronize_session=False)
    db.delete(section)
    db.commit()
    return {"message": "Section deleted successfully"}
