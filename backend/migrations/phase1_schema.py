"""Retain the Phase 1 compatibility schema for upgrades from the original DB."""
from sqlalchemy import CheckConstraint, Column, ForeignKeyConstraint, Index, MetaData, String, Table, Text, UniqueConstraint
from backend.models import Base
from backend.migrations.trusted_device_schema import trusted_device_table


def phase1_metadata() -> MetaData:
    metadata = MetaData()
    trusted_device_table(metadata)
    affected = {"students", "family_access", "student_eccd_evaluations"}
    for table in Base.metadata.sorted_tables:
        # Cookie session storage is introduced explicitly by migration 019.
        if table.name == "auth_refresh_sessions":
            continue
        if table.name not in affected:
            table.to_metadata(metadata)
            continue
        columns = [column._copy() for column in table.columns if column.name not in ("lrn_number", "student_lrn")]
        # Column copies do not copy their table's foreign-key constraints.
        foreign_keys = [ForeignKeyConstraint(list(constraint.column_keys), [element.target_fullname for element in constraint.elements], name=constraint.name, ondelete=constraint.ondelete, onupdate=constraint.onupdate) for constraint in table.foreign_key_constraints]
        if table.name == "students":
            target = Table(table.name, metadata, *columns, *foreign_keys, Column("lrn_number", String(50), nullable=False),
                           UniqueConstraint("lrn_number", name="uq_students_legacy_lrn"),
                           UniqueConstraint("lrn_search_hash", name="uq_students_lrn_search_hash"),
                           UniqueConstraint("student_id", "lrn_number", name="uq_students_identity_lrn"))
            Index("idx_students_section_active", target.c.section_id, target.c.is_active)
            Index("idx_lrn_last4", target.c.lrn_last4)
        else:
            constraints = foreign_keys + [ForeignKeyConstraint(["student_id", "student_lrn"], ["students.student_id", "students.lrn_number"], name="fk_family_student_identity" if table.name == "family_access" else "fk_eval_student_identity", ondelete="CASCADE")]
            constraints.extend(CheckConstraint(item.sqltext, name=item.name) for item in table.constraints if isinstance(item, CheckConstraint))
            if table.name == "student_eccd_evaluations":
                constraints.append(UniqueConstraint("student_id", "question_id", "testing_period", name="unique_student_eval"))
            target = Table(table.name, metadata, *columns, Column("student_lrn", String(50), nullable=False), *constraints)
            if table.name == "family_access":
                Index("idx_family_student", target.c.student_id)
            else:
                Index("idx_student_period", target.c.student_id, target.c.testing_period)
    # Historical Phase 1 retains its original widths. Batch 1 widens these
    # explicitly after Phase 2; evolving ORM metadata must not rewrite history.
    metadata.tables["teachers"].c.class_name.type = String(50)
    metadata.tables["students"].c.section_name.type = String(50)
    # Keep the historical two-role schema so existing installs are upgraded
    # explicitly and transactionally by adviser_takeover, never by Phase 1.
    assignments = metadata.tables["section_teachers"]
    for constraint in list(assignments.constraints):
        if constraint.name == "ck_section_teacher_role":
            assignments.constraints.remove(constraint)
    assignments.append_constraint(CheckConstraint("role IN ('Primary Adviser', 'Substitute')", name="ck_section_teacher_role"))
    for index in list(assignments.indexes):
        if index.name == "uq_section_active_adviser":
            assignments.indexes.remove(index)
    for table in (metadata.tables["messages"], metadata.tables["system_logs"]):
        for index in list(table.indexes):
            if index.name in ("idx_messages_thread", "idx_logs_timestamp"):
                table.indexes.remove(index)
    users = metadata.tables["users"]
    if "username" not in users.c:
        users.append_column(Column("username", String(50), nullable=False))
        users.append_constraint(UniqueConstraint("username"))
    for index in list(users.indexes):
        if index.name == "ux_users_email_lower":
            users.indexes.remove(index)
    settings = metadata.tables["system_settings"]
    # Preserve the historical settings shape until explicit migration 018.
    settings.append_column(Column("secondary_color", String(10), default="#FFFFFF"))
    settings.append_column(Column("profile_pic_url", Text, nullable=True))
    settings.append_column(Column("login_background", Text, nullable=True))
    if "chairman_name" in settings.c:
        settings._columns.remove(settings.c.chairman_name)
    return metadata
