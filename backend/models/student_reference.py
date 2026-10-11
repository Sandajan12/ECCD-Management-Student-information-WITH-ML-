"""Keep legacy LRN writes consistent with the new student foreign keys."""

from sqlalchemy import event, select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Mapper

from .eccd import StudentEccdEvaluation
from .parent import FamilyAccess
from .student import Student


def synchronize_student_reference(
    mapper: Mapper[FamilyAccess] | Mapper[StudentEccdEvaluation],
    connection: Connection,
    record: FamilyAccess | StudentEccdEvaluation,
) -> None:
    if record.student_id is not None:
        condition = Student.student_id == record.student_id
    elif getattr(record, "_student_lookup", None) is not None:
        condition = Student.lrn_number == record._student_lookup
    else:
        raise ValueError("A student reference is required")
    identity = connection.execute(select(Student.student_id).where(condition)).first()
    if identity is None:
        raise ValueError("Referenced student does not exist")
    if getattr(record, "_student_lookup", None) is not None:
        expected = connection.execute(select(Student.student_id).where(Student.lrn_number == record._student_lookup)).scalar_one_or_none()
        if expected != identity.student_id:
            raise ValueError("Student ID and LRN refer to different students")
    record.student_id = identity.student_id
    record.__dict__.pop("_student_lookup", None)


for model in (FamilyAccess, StudentEccdEvaluation):
    event.listen(model, "before_insert", synchronize_student_reference)
    event.listen(model, "before_update", synchronize_student_reference)
