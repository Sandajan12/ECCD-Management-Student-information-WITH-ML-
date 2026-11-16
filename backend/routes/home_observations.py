from uuid import uuid4
from fastapi import APIRouter, Depends, File, HTTPException, Path, Response, UploadFile
from sqlalchemy.orm import Session, selectinload, joinedload
from backend.config.database import get_db
from backend.models import HomeObservationPhoto, ParentHomeObservation, StudentEccdEvaluation, Parent, Student
from backend.models.eccd import TestingPeriod
from backend.schemas.home_observation import HomeObservationPublic, HomeReviewBatch, HomeReviewSaved, HomePhotoUploaded
from backend.utils.access import authorize_student, resolve_student, current_teacher, teacher_sections, permissions_for_student
from backend.utils.deps import verify_role
from backend.utils.home_observations import parent_question_access, public_observation, save_review
from backend.utils.home_photos import photo_storage, sanitize_photo
from backend.utils.uploads import IMAGE_LIMIT
from backend.utils.mastery import carry_sources
from backend.utils.eccd_dates import now_pht

router = APIRouter(prefix="/api/eccd", tags=["Home observations"])


@router.post("/parent/home-photos/{student_id}/{question_id}/{period}", response_model=HomePhotoUploaded)
def upload_photo(student_id: int = Path(gt=0), question_id: int = Path(gt=0), period: TestingPeriod = Path(),
                       file: UploadFile = File(), db: Session = Depends(get_db),
                       user=Depends(verify_role(["user"])), storage=Depends(photo_storage)):
    parent = parent_question_access(db, user, resolve_student(db, student_id), question_id, period)
    evaluations = db.query(StudentEccdEvaluation).options(selectinload(StudentEccdEvaluation.home_review)).filter_by(student_id=student_id).all()
    if (any(r.question_id == question_id and r.testing_period == period for r in evaluations)
            or db.query(ParentHomeObservation).filter_by(student_id=student_id, question_id=question_id, testing_period=period).first()
            or (question_id, period) in carry_sources(evaluations, {question_id})):
        raise HTTPException(409, "Photo is no longer needed or this question is already submitted. Refresh first.")
    image = sanitize_photo(file.file.read(IMAGE_LIMIT + 1), file.content_type)
    photo_id = uuid4().hex
    photo = HomeObservationPhoto(photo_id=photo_id, student_id=student_id, parent_id=parent.parent_id,
        question_id=question_id, testing_period=period, object_key=photo_id + ".jpg", created_at=now_pht())
    db.add(photo)
    db.commit()  # Persist the object key before uploading; crashes leave a retryable expiry record.
    storage.put(photo.object_key, image)
    photo.ready = True
    db.commit()
    return {"photo_id": photo_id}


@router.get("/home-observations/pending", response_model=list[HomeObservationPublic])
def pending_observations(db: Session = Depends(get_db), user=Depends(verify_role(["admin"]))):
    sections = teacher_sections(db, current_teacher(db, user))
    rows = db.query(ParentHomeObservation).options(joinedload(ParentHomeObservation.photo)).join(Student).filter(Student.section_id.in_(sections),
        Student.is_active.is_(True), ParentHomeObservation.status == "pending").order_by(ParentHomeObservation.submitted_at).all()
    return [public_observation(r) for r in rows]


@router.post("/home-observations/review", response_model=HomeReviewSaved)
def review_observations(payload: HomeReviewBatch, db: Session = Depends(get_db),
                        user=Depends(verify_role(["admin"])), storage=Depends(photo_storage)):
    return save_review(db, user, resolve_student(db, payload.student_id), payload, storage)


@router.get("/home-observations/{observation_id}/photo", response_class=Response,
            responses={200: {"content": {"image/jpeg": {}}}})
def read_photo(observation_id: int = Path(gt=0), db: Session = Depends(get_db),
               user=Depends(verify_role(["user", "admin"])), storage=Depends(photo_storage)):
    row = db.get(ParentHomeObservation, observation_id)
    if row is None:
        raise HTTPException(404, "Observation not found.")
    student = resolve_student(db, row.student_id)
    authorize_student(db, user, student)
    if user.role.value == "user":
        parent = db.query(Parent).filter_by(user_id=user.user_id).first()
        if not parent or parent.parent_id != row.parent_id or not permissions_for_student(db, student).allow_parent_edit_home_based_eccd:
            raise HTTPException(403, "This evidence is private to its author and current reviewer.")
    if not student.is_active or not public_observation(row)["has_photo"]:
        raise HTTPException(404, "Photo is unavailable after review or cleanup.")
    return Response(storage.get(row.photo.object_key), media_type="image/jpeg", headers={"Cache-Control": "no-store"})
