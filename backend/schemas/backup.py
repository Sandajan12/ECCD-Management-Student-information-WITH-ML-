"""Strict, typed school-data document for Phase 2's atomic restore.

This is the internal decrypted backup format, not a public API response. The
users collection is validated for format only; restore must preserve live users.
LRNs are encrypted; there are no plaintext LRN columns in this format.
"""

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import ConfigDict, Field, model_validator

from backend.models import Base
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.models.email_verification import OtpPurpose
from backend.models.message import SenderRole
from backend.models.section_teacher import AssignmentStatus, TeacherRole
from backend.models.student import Gender, Handedness
from backend.models.user import UserRole
from .common import ApiModel, LoginEmail, Lrn, PositiveId
from backend.utils.lrn import decrypt_lrn, hash_lrn


class BackupRow(ApiModel):
    model_config = ConfigDict(extra="forbid")


class UserBackupRow(BackupRow):
    # Account snapshots are never restored. Ignore retired account-only fields
    # so older encrypted backups remain usable without reviving their schema.
    model_config = ConfigDict(extra="ignore")
    user_id: PositiveId
    password_hash: str = Field(min_length=1, max_length=255)
    email: LoginEmail | None
    role: UserRole | None
    created_at: datetime | None
    is_active: bool | None
    is_first_login: bool
    is_registration_pending: bool
    security_version: int = Field(default=0, ge=0)
    otp_code: str | None = Field(max_length=10)
    otp_expires_at: datetime | None


class TeacherBackupRow(BackupRow):
    allow_parent_predictions: bool = False
    teacher_id: PositiveId
    user_id: PositiveId | None
    first_name: str | None = Field(max_length=100)
    last_name: str | None = Field(max_length=100)
    employee_id: str | None = Field(max_length=50)
    class_name: str | None = Field(max_length=100)
    allow_parent_view_student_info: bool | None
    allow_parent_view_eccd_pre: bool | None
    allow_parent_view_eccd_mid: bool | None
    allow_parent_view_eccd_post: bool | None
    allow_parent_view_eccd_marks: bool = False
    allow_parent_edit_student_info: bool | None
    allow_parent_edit_home_based_eccd: bool | None
    allow_eccd_question_management: bool


class ParentBackupRow(BackupRow):
    parent_id: PositiveId
    user_id: PositiveId | None
    fullname: str | None = Field(max_length=100)
    educational_attainment: str | None = Field(max_length=20)
    occupation: str | None = Field(max_length=50)
    age: int | None = Field(ge=0)
    relationship_type: str | None = Field(max_length=50)


class SectionBackupRow(BackupRow):
    pre_test_parent_editable: bool = True
    mid_test_parent_editable: bool = False
    post_test_parent_editable: bool = False
    section_id: PositiveId
    section_name: str = Field(min_length=1, max_length=100)
    adviser_teacher_id: PositiveId | None
    created_at: datetime | None


class SectionTeacherBackupRow(BackupRow):
    id: PositiveId
    section_id: PositiveId
    teacher_id: PositiveId
    role: TeacherRole
    status: AssignmentStatus
    assigned_date: datetime | None

    @model_validator(mode="before")
    @classmethod
    def retire_legacy_assignment(cls, value: object) -> object:
        # Old backups retain every assignment row without restoring removed access.
        if isinstance(value, dict) and value.get("role") == "Substitute":
            return {**value, "role": "Primary Adviser", "status": "Inactive"}
        return value


class StudentBackupRow(BackupRow):
    student_id: PositiveId
    lrn_encrypted: str = Field(pattern=r"^[0-9a-fA-F]{32}:[0-9a-fA-F]{32}:[0-9a-fA-F]{24}$")
    lrn_search_hash: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    lrn_last4: str = Field(pattern=r"^[0-9]{4}$")
    first_name: str | None = Field(max_length=100)
    middle_name: str | None = Field(max_length=100)
    last_name: str | None = Field(max_length=100)
    date_of_birth: date | None
    gender: Gender | None
    section_id: PositiveId | None
    section_name: str | None = Field(max_length=100)
    address: str | None = Field(max_length=100)
    handedness: Handedness | None
    num_of_siblings: int | None = Field(ge=0)
    birth_order: str | None = Field(max_length=50)
    emergency_contact: str | None = Field(max_length=20)
    is_active: bool | None
    school_year: str | None = Field(max_length=20)

    @model_validator(mode="after")
    def validate_lrn_protection(self) -> "StudentBackupRow":
        try:
            lrn = decrypt_lrn(self.lrn_encrypted)
            if hash_lrn(lrn) != self.lrn_search_hash or self.lrn_last4 != lrn[-4:]:
                raise ValueError("Invalid protected LRN")
        except ValueError:
            raise ValueError("Protected LRN validation failed; verify the original keys and document") from None
        return self


class FamilyAccessBackupRow(BackupRow):
    id: PositiveId
    parent_id: PositiveId
    student_id: PositiveId
    relationship_type: str | None = Field(max_length=50)
    date_linked: datetime
    status: Literal["PENDING", "SYNCED"] = "SYNCED"
    requested_at: datetime | None = None

    @model_validator(mode="after")
    def request_date(self) -> "FamilyAccessBackupRow":
        self.requested_at = self.requested_at or self.date_linked
        return self


class DomainBackupRow(BackupRow):
    domain_id: PositiveId
    domain_name: str = Field(min_length=1, max_length=100)


class QuestionBackupRow(BackupRow):
    question_id: PositiveId
    domain_id: PositiveId
    question_text: str = Field(min_length=1)
    sequence_order: int = Field(ge=1)
    is_home_based: bool | None


class EvaluationBackupRow(BackupRow):
    evaluation_id: PositiveId
    student_id: PositiveId
    teacher_id: PositiveId | None
    question_id: PositiveId
    testing_period: TestingPeriod
    answer: EccdAnswer
    evaluation_date: date
    parent_id: Optional[int] = None
    evaluator_role: Literal["teacher", "parent"] = "teacher"
    teacher_evaluation_date: Optional[date] = None
    parent_submitted_at: Optional[datetime] = None


BackupStudentEccdEvaluation = EvaluationBackupRow


class MessageBackupRow(BackupRow):
    message_id: PositiveId
    teacher_id: PositiveId
    parent_id: PositiveId
    sender_role: SenderRole
    subject: str | None = Field(max_length=255)
    body: str
    is_read: bool | None
    is_archived: bool | None
    created_at: datetime | None


class LogBackupRow(BackupRow):
    log_id: PositiveId
    user_id: PositiveId | None
    action_type: str = Field(min_length=1, max_length=50)
    details: str | None
    timestamp: datetime | None


class SettingsBackupRow(BackupRow):
    id: PositiveId
    system_title: str | None = Field(max_length=255)
    school_name: str = Field(max_length=255)
    principal_name: str | None = Field(max_length=255)
    chairman_name: str | None = Field(default=None, max_length=255)
    school_year_start_month: int = Field(ge=1, le=12)
    primary_color: str | None = Field(max_length=10)
    secondary_color: str | None = Field(max_length=10)
    logo_url: str | None
    profile_pic_url: str | None
    current_school_year: str | None = Field(max_length=20)
    previous_school_year: str | None = Field(max_length=20)
    last_rollover_timestamp: str | None = Field(max_length=100)
    login_background: str | None


class VerificationBackupRow(BackupRow):
    id: PositiveId
    email: LoginEmail
    otp: str = Field(max_length=10)
    expires_at: datetime
    user_id: PositiveId | None
    purpose: OtpPurpose | None
    challenge_hash: str | None = Field(pattern=r"^[0-9a-fA-F]{64}$")
    otp_hash: str | None = Field(pattern=r"^[0-9a-fA-F]{64}$")
    attempts: int = Field(ge=0)


class DeviceBackupRow(BackupRow):
    id: PositiveId
    user_id: PositiveId
    device_token_hash: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    user_agent: str | None = Field(max_length=255)
    expires_at: datetime
    created_at: datetime


class BackupDocument(BackupRow):
    users: list[UserBackupRow]
    teachers: list[TeacherBackupRow]
    parents: list[ParentBackupRow]
    sections: list[SectionBackupRow]
    section_teachers: list[SectionTeacherBackupRow]
    students: list[StudentBackupRow]
    family_access: list[FamilyAccessBackupRow]
    eccd_domains: list[DomainBackupRow]
    eccd_questions: list[QuestionBackupRow]
    student_eccd_evaluations: list[EvaluationBackupRow]
    messages: list[MessageBackupRow]
    system_logs: list[LogBackupRow]
    system_settings: list[SettingsBackupRow]
    email_verifications: list[VerificationBackupRow]
    user_trusted_devices: list[DeviceBackupRow]

    @model_validator(mode="after")
    def validate_student_references(self) -> "BackupDocument":
        active_sections = [row.section_id for row in self.section_teachers if row.status == AssignmentStatus.ACTIVE]
        if len(active_sections) != len(set(active_sections)):
            raise ValueError("Only one active adviser is allowed per section")
        for table_name, table in Base.metadata.tables.items():
            primary_key = list(table.primary_key.columns.keys())[0]
            ids = [getattr(row, primary_key) for row in getattr(self, table_name)]
            if len(ids) != len(set(ids)):
                raise ValueError(f"Duplicate identifiers in {table_name}")
        students = {student.student_id: student for student in self.students}
        hashes = [student.lrn_search_hash for student in self.students]
        if len(hashes) != len(set(hashes)):
            raise ValueError("Duplicate LRNs in students")
        for record in (*self.family_access, *self.student_eccd_evaluations):
            student = students.get(record.student_id)
            if student is None:
                raise ValueError("Backup contains inconsistent student references")
        return self
