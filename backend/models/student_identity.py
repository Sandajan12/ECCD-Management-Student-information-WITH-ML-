"""Read-only LRN compatibility lookups; plaintext is never stored in the DB."""
import re
from sqlalchemy import false, select
from sqlalchemy.ext.hybrid import Comparator
from backend.utils.lrn import hash_lrn


def student_condition(value: object):
    from .student import Student
    text = str(value)
    if re.fullmatch(r"[0-9]{12}", text):
        return Student.lrn_search_hash == hash_lrn(text)
    if not isinstance(value, bool) and re.fullmatch(r"[0-9]{1,10}", text) and 0 < int(text) <= 2147483647:
        return Student.student_id == int(text)
    return false()


class StudentLookup(Comparator):
    def __eq__(self, value: object):
        return student_condition(value)

    def in_(self, values):
        from sqlalchemy import or_
        return or_(*(student_condition(value) for value in values)) if values else false()


class StudentReferenceLookup(Comparator):
    def __eq__(self, value: object):
        from .student import Student
        return self.__clause_element__().in_(select(Student.student_id).where(student_condition(value)))

    def in_(self, values):
        from .student import Student
        from sqlalchemy import or_
        condition = or_(*(student_condition(value) for value in values)) if values else false()
        return self.__clause_element__().in_(select(Student.student_id).where(condition))


