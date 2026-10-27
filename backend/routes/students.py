from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from backend.config.database import get_db
from backend.models import FamilyAccess, Parent, Section, SectionTeacher, Student, SystemLog, Teacher, User
from backend.schemas.common import MessageResult
from backend.schemas.student import ChildPublicResponse, EnrollmentRequest, EnrollmentResponse, FamilyAccessCreate, ParentLinkResponse, StudentPublicResponse, StudentUpdate, TeacherStudentResponse
from backend.utils.access import authorize_student, current_teacher, resolve_student, teacher_sections
from backend.utils.deps import verify_role
from backend.utils.lrn import hash_lrn
from backend.utils.rollover import settings_record
from backend.utils.students import child_profile, child_profiles, public_student, public_students, student_profile_options, upsert_guardian

router = APIRouter(prefix="/api/students", tags=["Students"])
message_router = APIRouter(prefix="/api/messages", tags=["Student links"])
chairman_router = APIRouter(prefix="/api/chairman", tags=["Student records"])


def roster(db: Session, user: User, active: bool | None) -> list[dict]:
    query = db.query(Student).options(*student_profile_options())
    if active is not None:
        query = query.filter_by(is_active=active)
    if user.role.value == "admin":
        query = query.filter(Student.section_id.in_(teacher_sections(db, current_teacher(db, user))))
    students = query.order_by(Student.last_name, Student.first_name, Student.student_id).all()
    section_ids = {student.section_id for student in students if student.section_id is not None}
    adviser_names: dict[int, str | None] = {}
    if section_ids:
        advisers = db.query(SectionTeacher.section_id, Teacher.first_name, Teacher.last_name).join(
            Teacher, Teacher.teacher_id == SectionTeacher.teacher_id
        ).join(User, User.user_id == Teacher.user_id).filter(
            SectionTeacher.section_id.in_(section_ids),
            SectionTeacher.status == "Active",
            SectionTeacher.role == "Primary Adviser",
            User.is_active.is_(True),
        ).all()
        adviser_names = {
            section_id: " ".join(part.strip() for part in (first_name, last_name) if part and part.strip()) or None
            for section_id, first_name, last_name in advisers
        }
    from backend.utils.parent_links import account_links, link_details
    links = account_links(db, [student.student_id for student in students])
    profiles = public_students(db, students)
    return [{**profile, "adviser_name": adviser_names.get(student.section_id), **link_details(links.get(student.student_id, []))} for student, profile in zip(students, profiles)]


@router.get("/", response_model=list[TeacherStudentResponse])
@router.get("/all", response_model=list[TeacherStudentResponse])
def get_students(db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "super-admin"]))):
    return roster(db, user, True)


@chairman_router.get("/students", response_model=list[StudentPublicResponse])
def all_chairman_students(db: Session = Depends(get_db), user: User = Depends(verify_role(["super-admin"]))):
    return roster(db, user, None)


@router.get("/archived", response_model=list[StudentPublicResponse])
def archived(db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "super-admin"]))):
    return roster(db, user, False)


@router.get("/section/{section_id}", response_model=list[StudentPublicResponse])
def by_section(section_id: int, db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "super-admin"]))):
    if user.role.value == "admin" and section_id not in teacher_sections(db, current_teacher(db, user)):
        raise HTTPException(403, "Section is not assigned to you.")
    students = db.query(Student).options(*student_profile_options()).filter_by(section_id=section_id, is_active=True).all()
    return public_students(db, students)


@router.post("/", response_model=EnrollmentResponse, status_code=201)
@router.post("/create", response_model=EnrollmentResponse, status_code=201)
def create_student(payload: EnrollmentRequest, db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "super-admin"]))):
    if db.query(Student).filter_by(lrn_search_hash=hash_lrn(payload.lrn_number)).first():
        raise HTTPException(400, "A student with this LRN already exists.")
    section_id = payload.section_id
    if user.role.value == "admin":
        assignments = db.query(SectionTeacher).filter_by(teacher_id=current_teacher(db, user).teacher_id, role="Primary Adviser", status="Active").order_by(SectionTeacher.id).all()
        allowed = [assignment.section_id for assignment in assignments]
        section_id = section_id or (allowed[0] if allowed else None)
        if section_id not in allowed:
            raise HTTPException(403, "You must be assigned to the selected section before adding students.")
    section = db.get(Section, section_id) if section_id else None
    if section is None:
        raise HTTPException(400, "A valid section is required.")
    setting = settings_record(db)
    data = payload.model_dump(exclude={"section_id", "section_name", "school_year", "is_active"})
    student = Student(**data, section_id=section_id, section_name=section.section_name, school_year=setting.current_school_year, is_active=True)
    db.add(student)
    try:
        db.flush()
        from backend.utils.audit import person_name, record_audit
        record_audit(db, user, "Added New Student", f'Added Student "{person_name(student)}" (LRN: {student.masked_lrn}).',
                     studentId=student.student_id, studentName=person_name(student))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "A student with this LRN already exists.") from None
    return {"message": "Student successfully added!", "student_id": student.student_id, "masked_lrn": student.masked_lrn}


@router.put("/archive-all", response_model=MessageResult)
def archive_all(db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "super-admin"]))):
    query = db.query(Student).filter_by(is_active=True)
    if user.role.value == "admin":
        query = query.filter(Student.section_id.in_(teacher_sections(db, current_teacher(db, user))))
    count = query.update({"is_active": False})
    db.add(SystemLog(user_id=user.user_id, action_type="Mass Archived Students", details=f"Archived {count} active students."))
    db.commit()
    return {"message": f"Successfully archived {count} student(s)!"}


@router.get("/my-child", response_model=list[ChildPublicResponse])
@router.get("/linked", response_model=list[ChildPublicResponse])
def linked_children(db: Session = Depends(get_db), user: User = Depends(verify_role(["user", "super-admin"]))):
    parent = db.query(Parent).filter_by(user_id=user.user_id).first()
    if parent is None:
        return []
    students = db.query(Student).options(*student_profile_options()).join(FamilyAccess).filter(FamilyAccess.status == "SYNCED", FamilyAccess.parent_id == parent.parent_id, Student.is_active.is_(True)).distinct().all()
    return child_profiles(db, students)


@router.post("/link", response_model=ParentLinkResponse)
@message_router.post("/link-lrn", response_model=ParentLinkResponse)
def link_child(payload: FamilyAccessCreate, db: Session = Depends(get_db), user: User = Depends(verify_role(["user"]))):
    if not payload.target_lrn:
        raise HTTPException(400, "A valid 12-digit LRN is required.")
    student = resolve_student(db, payload.target_lrn)
    db.query(Student).filter_by(student_id=student.student_id).with_for_update().one()
    if not student.is_active:
        raise HTTPException(403, "Student is archived.")
    parent = db.query(Parent).filter_by(user_id=user.user_id).first()
    if parent is None:
        raise HTTPException(404, "Parent profile not found.")
    existing = db.query(FamilyAccess).join(Parent).filter(FamilyAccess.student_id == student.student_id, Parent.user_id.isnot(None)).all()
    if any(link.parent_id != parent.parent_id for link in existing):
        raise HTTPException(400, "This student has already been synced to an account.")
    if existing:
        status = existing[0].status
    else:
        from backend.utils.audit import actor_name, person_name, record_audit
        from backend.utils.parent_links import has_account_link_history
        status = "PENDING" if has_account_link_history(db, student) else "SYNCED"
        relationship = payload.relationship_type if "relationship_type" in payload.model_fields_set else parent.relationship_type
        try:
            db.add(FamilyAccess(student_id=student.student_id, parent_id=parent.parent_id, relationship_type=relationship or "Guardian", status=status))
            event = "Linked Parent" if status == "SYNCED" else "Requested Parent Link"
            record_audit(db, user, event, f'{event}: Parent "{actor_name(db, user)}" for Student "{person_name(student)}".',
                         studentId=student.student_id, studentName=person_name(student), parentId=parent.parent_id,
                         parentName=actor_name(db, user), status=status)
            db.commit()
        except Exception:
            db.rollback()
            raise
    message = "Child successfully synced to your account." if status == "SYNCED" else "Parent link request is awaiting teacher approval."
    return {"message": message, "student_id": student.student_id, "masked_lrn": student.masked_lrn, "status": status}


@router.put("/{identifier}/archive", response_model=MessageResult)
@router.put("/archive/{identifier}", response_model=MessageResult)
def archive(identifier: str, db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "super-admin"]))):
    student = resolve_student(db, identifier)
    authorize_student(db, user, student)
    student.is_active = False
    from backend.utils.audit import person_name, record_audit
    record_audit(db, user, "Archived Student", f'Archived Student "{person_name(student)}".', studentId=student.student_id, studentName=person_name(student))
    db.commit()
    return {"message": "Student successfully archived!"}


@router.put("/{identifier}/unarchive", response_model=MessageResult)
@router.put("/unarchive/{identifier}", response_model=MessageResult)
def unarchive(identifier: str, db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "super-admin"]))):
    student = resolve_student(db, identifier)
    authorize_student(db, user, student)
    student.is_active = True
    from backend.utils.audit import person_name, record_audit
    record_audit(db, user, "Student Restored", f'Restored Student "{person_name(student)}".', studentId=student.student_id, studentName=person_name(student))
    db.commit()
    return {"message": "Student successfully unarchived!"}


@router.delete("/delete/{identifier}", response_model=MessageResult)
@router.delete("/{identifier}", response_model=MessageResult)
def delete(identifier: str, db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "super-admin"]))):
    student = resolve_student(db, identifier)
    authorize_student(db, user, student)
    from backend.utils.audit import person_name, record_audit
    record_audit(db, user, "Deleted Student", f'Permanently deleted Student "{person_name(student)}".', studentId=student.student_id, studentName=person_name(student))
    db.delete(student)
    db.commit()
    return {"message": "Student account permanently deleted."}


def student_change_snapshot(db: Session, student: Student) -> dict[str, str]:
    fields = {"first_name": "First Name", "middle_name": "Middle Name", "last_name": "Last Name", "date_of_birth": "Date of Birth", "gender": "Gender", "address": "Address", "emergency_contact": "Emergency Contact", "handedness": "Handedness", "num_of_siblings": "No. of Siblings", "birth_order": "Birth Order"}
    def text(value: object) -> str:
        return str(getattr(value, "value", value)).strip() if value is not None else ""
    result = {label: text(getattr(student, field)) for field, label in fields.items()}
    result["LRN"] = student.masked_lrn
    for relationship, label in (("Father", "Father"), ("Mother", "Mother"), ("Guardian", "Guardian")):
        parent = db.query(Parent).join(FamilyAccess).filter(FamilyAccess.status == "SYNCED", FamilyAccess.student_id == student.student_id, FamilyAccess.relationship_type == relationship).first()
        for field, suffix in (("fullname", "Name"), ("age", "Age"), ("occupation", "Occupation"), ("educational_attainment", "Education")):
            result[f"{label}'s {suffix}"] = text(getattr(parent, field)) if parent else ""
    return result


@router.put("/update/{identifier}", response_model=MessageResult)
@router.put("/{identifier}", response_model=MessageResult)
def update(identifier: str, payload: StudentUpdate, db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "super-admin", "user"]))):
    student = resolve_student(db, identifier)
    authorize_student(db, user, student, parent_edit=user.role.value == "user")
    before = student_change_snapshot(db, student)
    old_lrn_hash = student.lrn_search_hash
    if payload.lrn_number is not None:
        if user.role.value == "user":
            raise HTTPException(403, "Only school staff can correct a student's LRN.")
        duplicate = db.query(Student).filter(Student.lrn_search_hash == hash_lrn(payload.lrn_number), Student.student_id != student.student_id).first()
        if duplicate:
            raise HTTPException(400, "Another student is already using this LRN.")
        student.lrn_number = payload.lrn_number
    parent_fields = {"emergency_contact", "address", "handedness", "num_of_siblings", "birth_order"}
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key in Student.__table__.columns and key not in ("section_id", "section_name", "school_year", "is_active") and (user.role.value != "user" or key in parent_fields):
            setattr(student, key, value)
    for relationship, prefix in (("Father", "father"), ("Mother", "mother"), ("Guardian", "legal_guardian")):
        upsert_guardian(db, student, relationship, getattr(payload, f"{prefix}_name"), getattr(payload, f"{prefix}_age"), getattr(payload, f"{prefix}_occ"), getattr(payload, f"{prefix}_educ"), user=user)
    try:
        db.flush()
        after = student_change_snapshot(db, student)
        changes = [f"{field}: '{before[field]}' -> '{value}'" for field, value in after.items() if before[field] != value]
        if old_lrn_hash != student.lrn_search_hash and before["LRN"] == after["LRN"]:
            changes.append("LRN: corrected protected identifier (last four digits unchanged).")
        from backend.utils.audit import actor_name, person_name, record_audit
        actor = f'"{actor_name(db, user)}"'
        target = f'Student "{person_name(student)}"'
        details = f"{actor} updated records for {target}.\nSpecific changes:\n- " + "\n- ".join(changes) if changes else f"{actor} saved {target} but no data was changed."
        record_audit(db, user, "Updated Student Info", details, studentId=student.student_id, studentName=person_name(student))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Another student is already using this LRN.") from None
    return {"message": "Student details successfully updated!"}


@router.get("/{identifier}", response_model=ChildPublicResponse)
def get_student(identifier: str, db: Session = Depends(get_db), user: User = Depends(verify_role(["admin", "super-admin", "user"]))):
    student = resolve_student(db, identifier)
    authorize_student(db, user, student)
    if user.role.value == "user":
        return child_profile(db, student)
    result = public_student(db, student)
    for relationship, prefix in (("Father", "father"), ("Mother", "mother"), ("Guardian", "legal_guardian")):
        parent = db.query(Parent).join(FamilyAccess).filter(FamilyAccess.status == "SYNCED", FamilyAccess.student_id == student.student_id, FamilyAccess.relationship_type == relationship).first()
        if parent:
            result.update({f"{prefix}_name": parent.fullname, f"{prefix}_age": parent.age, f"{prefix}_occ": parent.occupation, f"{prefix}_educ": parent.educational_attainment})
    return result
