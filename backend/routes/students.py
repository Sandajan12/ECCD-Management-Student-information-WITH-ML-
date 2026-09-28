from datetime import date

from backend.config.database import get_db
from backend.models.student import Student
from backend.models.teacher import Teacher
from backend.models.section import Section
from backend.models.section_teacher import SectionTeacher
from backend.models.settings import SystemSettings
from backend.schemas.student import StudentCreate, StudentWithAgeResponse
from backend.utils.deps import verify_role
from backend.utils.eccd_scorer import calculate_decimal_age
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/students", tags=["Students"])


@router.post("/", response_model=StudentWithAgeResponse, status_code=201)
def create_student(
    payload: StudentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin"])),
):
    user_role = current_user.role.value if current_user.role else "user"
    if user_role == "admin":
        teacher = db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher profile not found.")
        
        active_assignment = (
            db.query(SectionTeacher)
            .filter(SectionTeacher.teacher_id == teacher.teacher_id, SectionTeacher.status == "Active")
            .first()
        )
        if active_assignment:
            section = db.query(Section).filter(Section.section_id == active_assignment.section_id).first()
        else:
            section = db.query(Section).filter(Section.adviser_teacher_id == teacher.teacher_id).first()

        if not section:
            raise HTTPException(status_code=400, detail="You must be assigned to a section before adding students.")
        
        payload.section_id = section.section_id
        payload.section_name = section.section_name

    settings = db.query(SystemSettings).first()
    if settings:
        payload.school_year = settings.current_school_year

    student = Student(**payload.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)

    response_model = StudentWithAgeResponse.model_validate(student)
    if student.date_of_birth:
        response_model.decimal_age = calculate_decimal_age(
            student.date_of_birth, date.today()
        )
    return response_model


@router.get("/section/{section_id}", response_model=list[StudentWithAgeResponse])
def get_students_by_section(
    section_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin", "user"])),
):
    students = (
        db.query(Student)
        .filter(Student.section_id == section_id, Student.is_active == True)
        .all()
    )

    results = []
    for s in students:
        s_schema = StudentWithAgeResponse.model_validate(s)
        if s.date_of_birth:
            s_schema.decimal_age = calculate_decimal_age(s.date_of_birth, date.today())
        results.append(s_schema)

    return results


@router.put("/{lrn_number}/archive")
def archive_student(
    lrn_number: str,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin"])),
):
    student = db.query(Student).filter(Student.lrn_number == lrn_number).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    student.is_active = False
    db.commit()
    return {"message": f"Student {lrn_number} archived successfully"}


@router.get("/archived", response_model=list[StudentWithAgeResponse])
def get_archived_students(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin"])),
):
    students = db.query(Student).filter(Student.is_active == False).all()
    results = []
    for s in students:
        s_schema = StudentWithAgeResponse.model_validate(s)
        if s.date_of_birth:
            s_schema.decimal_age = calculate_decimal_age(s.date_of_birth, date.today())
        results.append(s_schema)
    return results


@router.put("/{lrn_number}/unarchive")
def unarchive_student(
    lrn_number: str,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin"])),
):
    student = db.query(Student).filter(Student.lrn_number == lrn_number).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    student.is_active = True
    db.commit()
    return {"message": f"Student {lrn_number} unarchived successfully"}


@router.delete("/{lrn_number}")
def delete_student(
    lrn_number: str,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    student = db.query(Student).filter(Student.lrn_number == lrn_number).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    db.delete(student)
    db.commit()
    return {"message": "Student permanently deleted."}


from backend.models.log import SystemLog
from backend.models.parent import FamilyAccess, Parent
from backend.schemas.student import StudentUpdate


@router.put("/{lrn_number}")
def update_student(
    lrn_number: str,
    payload: StudentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "admin", "teacher", "user", "parent"])),
):
    student = db.query(Student).filter(Student.lrn_number == lrn_number).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    # Permission check for parent
    if user_role in ["user", "parent"]:
        parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
        if not parent:
            raise HTTPException(status_code=403, detail="Parent profile not found")

        link = (
            db.query(FamilyAccess)
            .filter(
                FamilyAccess.parent_id == parent.parent_id,
                FamilyAccess.student_lrn == lrn_number,
            )
            .first()
        )
        if not link:
            raise HTTPException(status_code=403, detail="Not authorized to update this student")

        # Check teacher allow_parent_edit
        teacher = None
        if student.section_id:
            st = (
                db.query(SectionTeacher)
                .filter(SectionTeacher.section_id == student.section_id, SectionTeacher.status == "Active")
                .first()
            )
            if st and st.teacher:
                teacher = st.teacher
            elif student.section and student.section.adviser:
                teacher = student.section.adviser

        if teacher and not teacher.allow_parent_edit_student_info:
            raise HTTPException(status_code=403, detail="The Class Adviser has locked editing for student records.")

        # Update non-locked demographics
        if payload.emergency_contact is not None:
            student.emergency_contact = payload.emergency_contact
        if payload.address is not None:
            student.address = payload.address
        if payload.handedness is not None:
            student.handedness = payload.handedness
        if payload.num_of_siblings is not None:
            student.num_of_siblings = payload.num_of_siblings
        if payload.birth_order is not None:
            student.birth_order = payload.birth_order
    else:
        if user_role in ["admin", "teacher"]:
            teacher = db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
            if teacher:
                active_assignment = (
                    db.query(SectionTeacher)
                    .filter(SectionTeacher.teacher_id == teacher.teacher_id, SectionTeacher.status == "Active")
                    .first()
                )
                if active_assignment:
                    section = db.query(Section).filter(Section.section_id == active_assignment.section_id).first()
                else:
                    section = db.query(Section).filter(Section.adviser_teacher_id == teacher.teacher_id).first()
                if section:
                    student.section_id = section.section_id
                    student.section_name = section.section_name

        # Update Student Basic Demographics
        for key, value in payload.model_dump(exclude_unset=True).items():
            if hasattr(student, key) and key not in [
                "father_name",
                "mother_name",
                "legal_guardian_name",
                "section_id",
                "section_name"
            ]:
                setattr(student, key, value)

    # Upsert Logic for Parents/FamilyAccess
    def upsert_parent(fullname, age, occupation, educ, relationship):
        if not fullname or not fullname.strip():
            return

        # Check if parent already linked
        family_link = (
            db.query(FamilyAccess)
            .filter(
                FamilyAccess.student_lrn == lrn_number,
                FamilyAccess.relationship_type == relationship,
            )
            .first()
        )

        if family_link:
            parent = (
                db.query(Parent)
                .filter(Parent.parent_id == family_link.parent_id)
                .first()
            )
            if parent:
                parent.fullname = fullname
                parent.age = age
                parent.occupation = occupation
                parent.educational_attainment = educ
        else:
            new_parent = Parent(
                fullname=fullname,
                age=age,
                occupation=occupation,
                educational_attainment=educ,
                relationship_type=relationship,
            )
            db.add(new_parent)
            db.commit()
            db.refresh(new_parent)
            new_link = FamilyAccess(
                parent_id=new_parent.parent_id,
                student_lrn=lrn_number,
                relationship_type=relationship,
            )
            db.add(new_link)

    upsert_parent(
        payload.father_name,
        payload.father_age,
        payload.father_occ,
        payload.father_educ,
        "Father",
    )
    upsert_parent(
        payload.mother_name,
        payload.mother_age,
        payload.mother_occ,
        payload.mother_educ,
        "Mother",
    )
    upsert_parent(
        payload.legal_guardian_name,
        payload.legal_guardian_age,
        payload.legal_guardian_occ,
        payload.legal_guardian_educ,
        "Guardian",
    )

    # Audit Log
    log = SystemLog(
        user_id=current_user.user_id,
        action_type="Updated Student Info",
        details=f"Updated records for student LRN: {lrn_number}",
    )
    db.add(log)
    db.commit()

    return {"message": "Student details successfully updated!"}


@router.get("/my-child", response_model=list[dict])
@router.get("/linked", response_model=list[dict])
def get_linked_child(
    db: Session = Depends(get_db), current_user=Depends(verify_role(["user", "parent"]))
):
    parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent profile not found")

    # Fetch students linked via family_access
    links = (
        db.query(FamilyAccess).filter(FamilyAccess.parent_id == parent.parent_id).all()
    )
    if not links:
        raise HTTPException(status_code=404, detail="No child linked yet.")

    results = []
    seen = set()
    for link in links:
        student = (
            db.query(Student)
            .filter(Student.lrn_number == link.student_lrn, Student.is_active == True)
            .first()
        )
        if student and student.lrn_number not in seen:
            seen.add(student.lrn_number)

            # Fetch active adviser from SectionTeacher junction table
            teacher = None
            if student.section_id:
                st = (
                    db.query(SectionTeacher)
                    .filter(
                        SectionTeacher.section_id == student.section_id,
                        SectionTeacher.status == "Active",
                        SectionTeacher.role == "Primary Adviser",
                    )
                    .first()
                )
                if st and st.teacher:
                    teacher = st.teacher
                else:
                    st_any = (
                        db.query(SectionTeacher)
                        .filter(SectionTeacher.section_id == student.section_id, SectionTeacher.status == "Active")
                        .first()
                    )
                    if st_any and st_any.teacher:
                        teacher = st_any.teacher
                    elif student.section and student.section.adviser:
                        teacher = student.section.adviser

            # Fetch Parents
            father = (
                db.query(Parent)
                .join(FamilyAccess)
                .filter(
                    FamilyAccess.student_lrn == student.lrn_number,
                    FamilyAccess.relationship_type == "Father",
                )
                .first()
            )
            mother = (
                db.query(Parent)
                .join(FamilyAccess)
                .filter(
                    FamilyAccess.student_lrn == student.lrn_number,
                    FamilyAccess.relationship_type == "Mother",
                )
                .first()
            )

            # Decimal age
            computed_age = None
            if student.date_of_birth:
                computed_age = calculate_decimal_age(student.date_of_birth, date.today())

            results.append(
                {
                    "lrn_number": student.lrn_number,
                    "first_name": student.first_name,
                    "last_name": student.last_name,
                    "date_of_birth": student.date_of_birth.isoformat() if student.date_of_birth else None,
                    "age": computed_age,
                    "gender": student.gender.value if student.gender else None,
                    "section_name": student.section.section_name if student.section else (student.section_name or ""),
                    "teacher_fname": teacher.first_name if teacher else None,
                    "teacher_lname": teacher.last_name if teacher else None,
                    "allow_parent_view_student_info": teacher.allow_parent_view_student_info if teacher else True,
                    "allow_parent_view_eccd_pre": teacher.allow_parent_view_eccd_pre if teacher else False,
                    "allow_parent_view_eccd_mid": teacher.allow_parent_view_eccd_mid if teacher else False,
                    "allow_parent_view_eccd_post": teacher.allow_parent_view_eccd_post if teacher else False,
                    "allow_parent_edit_student_info": teacher.allow_parent_edit_student_info if teacher else True,
                    "allow_parent_edit_home_based_eccd": teacher.allow_parent_edit_home_based_eccd if teacher else False,
                    "allow_parent_view": teacher.allow_parent_view if teacher else True,
                    "allow_parent_edit": teacher.allow_parent_edit if teacher else False,
                    "allow_parent_home_based_edit": (
                        teacher.allow_parent_home_based_edit if teacher else False
                    ),
                    "emergency_contact": student.emergency_contact,
                    "address": student.address,
                    "handedness": student.handedness.value if student.handedness else None,
                    "num_of_siblings": student.num_of_siblings,
                    "birth_order": student.birth_order,
                    "father_name": father.fullname if father else None,
                    "father_age": father.age if father else None,
                    "father_occ": father.occupation if father else None,
                    "father_educ": father.educational_attainment if father else None,
                    "mother_name": mother.fullname if mother else None,
                    "mother_age": mother.age if mother else None,
                    "mother_occ": mother.occupation if mother else None,
                    "mother_educ": mother.educational_attainment if mother else None,
                }
            )

    return results


from backend.schemas.student import FamilyAccessCreate


@router.post("/link")
def link_parent_to_lrn(
    payload: FamilyAccessCreate,
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["user", "parent"])),
):
    target_lrn = payload.target_lrn
    if not target_lrn:
        raise HTTPException(status_code=400, detail="LRN number is required.")

    student = (
        db.query(Student).filter(Student.lrn_number == target_lrn).first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student with this LRN not found.")

    parent = db.query(Parent).filter(Parent.user_id == current_user.user_id).first()
    if not parent:
        # Create minimal parent profile for this new user
        parent = Parent(
            user_id=current_user.user_id, relationship_type=payload.relationship_type or "Guardian"
        )
        db.add(parent)
        db.commit()
        db.refresh(parent)

    # Check if a parent with a user_id is already linked to this student (legacy constraint)
    existing_link = (
        db.query(FamilyAccess)
        .join(Parent)
        .filter(
            FamilyAccess.student_lrn == target_lrn, Parent.user_id.isnot(None)
        )
        .first()
    )

    if existing_link and existing_link.parent_id != parent.parent_id:
        raise HTTPException(
            status_code=400,
            detail="This student LRN has already been synced to an account.",
        )

    # Check if I am already linked
    my_link = (
        db.query(FamilyAccess)
        .filter(
            FamilyAccess.student_lrn == target_lrn,
            FamilyAccess.parent_id == parent.parent_id,
        )
        .first()
    )

    if my_link:
        raise HTTPException(
            status_code=400, detail="You are already linked to this student."
        )

    new_link = FamilyAccess(
        parent_id=parent.parent_id,
        student_lrn=target_lrn,
        relationship_type=payload.relationship_type or "Guardian",
    )
    db.add(new_link)
    db.commit()

    return {"message": "Successfully linked to student!"}

@router.get("/all", response_model=list[dict])
def get_all_students(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    students = (
        db.query(Student)
        .filter(Student.is_active == True)
        .all()
    )

    results = []
    for s in students:
        s_schema = StudentWithAgeResponse.model_validate(s).model_dump()
        if s.date_of_birth:
            s_schema['decimal_age'] = calculate_decimal_age(s.date_of_birth, date.today())
        
        # Include parent info if needed by frontend (based on legacy SQL)
        # We can just return empty parents array for now if it's too complex, or load parents
        results.append(s_schema)

    return results
@router.get("/", response_model=list[dict])
def get_active_students(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman", "admin", "teacher", "user"])),
):
    user_role = current_user.role.value if current_user.role else "user"
    
    # Parents should not be listing global students.
    if user_role == "user":
        raise HTTPException(status_code=403, detail="Parents must use the /linked route to fetch their children.")
        
    query = db.query(Student).filter(Student.is_active == True)

    # In AMES, Teachers use the "admin" role. Enforce section isolation.
    if user_role == "admin" or user_role == "teacher":
        teacher = db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
        if not teacher:
            raise HTTPException(status_code=403, detail="Teacher profile not found.")
        
        active_sec_ids = [
            st[0]
            for st in db.query(SectionTeacher.section_id)
            .filter(SectionTeacher.teacher_id == teacher.teacher_id, SectionTeacher.status == "Active")
            .all()
        ]
        legacy_sec_ids = [
            s.section_id
            for s in db.query(Section.section_id)
            .filter(Section.adviser_teacher_id == teacher.teacher_id)
            .all()
        ]
        section_ids = list(set(active_sec_ids + legacy_sec_ids))
        
        if not section_ids:
            return []  # No sections assigned, return empty list to prevent DB leak
            
        query = query.filter(Student.section_id.in_(section_ids))

    students = query.all()

    results = []
    for s in students:
        s_schema = StudentWithAgeResponse.model_validate(s).model_dump()
        if s.date_of_birth:
            s_schema['decimal_age'] = calculate_decimal_age(s.date_of_birth, date.today())
        results.append(s_schema)

    return results
