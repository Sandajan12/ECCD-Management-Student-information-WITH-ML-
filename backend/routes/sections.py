
from backend.config.database import get_db
from backend.models.section import Section
from backend.schemas.section import SectionCreate, SectionResponse, SectionRename
from backend.utils.deps import verify_role
from backend.schemas.teacher import AssignTeacherSectionRequest
from backend.schemas.common import MessageResult
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError

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
from backend.models.section_teacher import SectionTeacher


@router.put("/{section_id}", response_model=SectionResponse)
def rename_section(section_id: int, payload: SectionRename, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.models.student import Student
    from backend.utils.audit import record_audit

    section = db.get(Section, section_id)
    if section is None:
        raise HTTPException(404, "Section not found.")
    duplicate = db.query(Section).filter(
        Section.section_id != section_id,
        func.lower(func.trim(Section.section_name)) == payload.section_name.lower(),
    ).first()
    if duplicate:
        raise HTTPException(409, "Section name already exists.")
    previous_name = section.section_name
    section.section_name = payload.section_name
    # Keep the existing denormalized labels consistent, including archived pupils.
    db.query(Student).filter_by(section_id=section_id).update(
        {Student.section_name: payload.section_name}, synchronize_session=False,
    )
    owners = db.query(SectionTeacher.teacher_id).filter_by(
        section_id=section_id, status="Active", role="Primary Adviser",
    )
    db.query(Teacher).filter(or_(
        Teacher.teacher_id.in_(owners), Teacher.teacher_id == section.adviser_teacher_id,
    )).update({Teacher.class_name: payload.section_name}, synchronize_session=False)
    record_audit(db, current_user, "UPDATE_SECTION",
                 f'Renamed Section "{previous_name}" to "{payload.section_name}".',
                 sectionId=section_id, sectionName=payload.section_name, previousSectionName=previous_name)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Section name already exists.") from None
    db.refresh(section)
    return section


@router.put("/{section_id}/assign", response_model=SectionResponse)
def assign_teacher(section_id: int, payload: AssignTeacherSectionRequest, db: Session = Depends(get_db), current_user=Depends(verify_role(["super-admin"]))):
    from backend.utils.teachers import assign_teacher as assign
    try:
        section = assign(db, current_user, section_id, payload.teacher_id)
        db.commit()
    except Exception:
        db.rollback()
        raise
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
