
from backend.config.database import get_db
from backend.models.section import Section
from backend.schemas.section import SectionCreate, SectionResponse, SectionUpdate
from backend.utils.deps import verify_role
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
def create_section(
    payload: SectionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin"])),
):
    section = Section(**payload.model_dump())
    db.add(section)
    db.commit()
    db.refresh(section)
    return section


from backend.models.teacher import Teacher
from backend.models.user import User
from backend.models.section_teacher import SectionTeacher
from backend.models.log import SystemLog


@router.put("/{section_id}/assign", response_model=SectionResponse)
def assign_teacher(
    section_id: int,
    payload: SectionUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin", "chairman"])),
):
    section = db.query(Section).filter(Section.section_id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    incoming_teacher_id = payload.adviser_teacher_id

    try:
        # 1. Identify incumbent teacher
        incumbent_teacher_id = section.adviser_teacher_id
        if not incumbent_teacher_id:
            active_st = (
                db.query(SectionTeacher)
                .filter(
                    SectionTeacher.section_id == section_id,
                    SectionTeacher.status == "Active",
                )
                .first()
            )
            if active_st:
                incumbent_teacher_id = active_st.teacher_id

        # 2. Archive incumbent if different from incoming
        if incumbent_teacher_id and incumbent_teacher_id != incoming_teacher_id:
            incumbent_teacher = (
                db.query(Teacher)
                .filter(Teacher.teacher_id == incumbent_teacher_id)
                .first()
            )
            if incumbent_teacher:
                incumbent_teacher.class_name = None
                db.query(SectionTeacher).filter(
                    SectionTeacher.teacher_id == incumbent_teacher_id,
                    SectionTeacher.status == "Active",
                ).update({"status": "Inactive"}, synchronize_session=False)

                incumbent_user = (
                    db.query(User)
                    .filter(User.user_id == incumbent_teacher.user_id)
                    .first()
                )
                if incumbent_user:
                    incumbent_user.is_active = False

        # 3. Assign incoming teacher
        if incoming_teacher_id:
            incoming_teacher = (
                db.query(Teacher)
                .filter(Teacher.teacher_id == incoming_teacher_id)
                .first()
            )
            if not incoming_teacher:
                raise HTTPException(status_code=404, detail="Incoming teacher not found")

            incoming_user = (
                db.query(User)
                .filter(User.user_id == incoming_teacher.user_id)
                .first()
            )
            if incoming_user:
                incoming_user.is_active = True

            db.query(SectionTeacher).filter(
                SectionTeacher.teacher_id == incoming_teacher_id,
                SectionTeacher.status == "Active",
            ).update({"status": "Inactive"}, synchronize_session=False)

            section.adviser_teacher_id = incoming_teacher_id
            incoming_teacher.class_name = section.section_name

            assignment = (
                db.query(SectionTeacher)
                .filter(
                    SectionTeacher.section_id == section_id,
                    SectionTeacher.teacher_id == incoming_teacher_id,
                )
                .first()
            )
            if assignment:
                assignment.status = "Active"
                assignment.role = "Primary Adviser"
            else:
                db.add(
                    SectionTeacher(
                        section_id=section_id,
                        teacher_id=incoming_teacher_id,
                        role="Primary Adviser",
                        status="Active",
                    )
                )
        else:
            section.adviser_teacher_id = None
            db.query(SectionTeacher).filter(
                SectionTeacher.section_id == section_id,
                SectionTeacher.status == "Active",
            ).update({"status": "Inactive"}, synchronize_session=False)

        db.commit()
        db.refresh(section)
        return section
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Failed to assign teacher to section: {str(e)}"
        )


@router.delete("/{section_id}")
def delete_section(
    section_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin"])),
):
    section = db.query(Section).filter(Section.section_id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    db.delete(section)
    db.commit()
    return {"message": "Section deleted successfully"}
