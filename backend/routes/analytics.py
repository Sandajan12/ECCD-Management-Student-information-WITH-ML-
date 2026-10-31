
import math

from backend.config.database import get_db
from backend.models.eccd import EccdDomain, EccdQuestion, StudentEccdEvaluation
from backend.models.log import SystemLog
from backend.models.message import Message
from backend.models.parent import Parent
from backend.models.section import Section
from backend.models.section_teacher import SectionTeacher
from backend.models.student import Student
from backend.models.settings import SystemSettings
from backend.models.teacher import Teacher
from backend.models.user import User, UserRole
from backend.schemas.analytics import DashboardFilters, PieChartSlice
from backend.schemas.operations import AnalyticsStats, AuditLogItem
from backend.utils.deps import verify_role
from backend.utils.dashboard_analytics import critical_domain, delay_summary
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, distinct, func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])
legacy_router = APIRouter(prefix="/api/logs", tags=["Audit logs"])


def get_teacher_section_ids(teacher_id: int, db: Session) -> list[int]:
    return [row[0] for row in db.query(SectionTeacher.section_id).filter_by(teacher_id=teacher_id, role="Primary Adviser", status="Active").distinct()]


@router.get("/filters", response_model=DashboardFilters)
def get_dashboard_filters(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        verify_role(["super-admin", "admin", "teacher", "chairman"])
    ),
):
    domains = [
        d[0]
        for d in db.query(EccdDomain.domain_name).order_by(EccdDomain.domain_id).all()
    ]

    if current_user.role in [UserRole.SUPER_ADMIN, "chairman"]:
        sections = [
            s[0]
            for s in db.query(Section.section_name).order_by(Section.section_name).all()
        ]
        school_years = [
            y[0]
            for y in db.query(distinct(Student.school_year))
            .filter(Student.school_year.isnot(None))
            .order_by(desc(Student.school_year))
            .all()
        ]
        setting = db.get(SystemSettings, 1)
        if setting and setting.current_school_year:
            school_years = sorted(set(school_years + [setting.current_school_year]), reverse=True)
        return {"sections": sections, "domains": domains, "schoolYears": school_years}
    else:
        # Teacher view
        teacher = (
            db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
        )
        if not teacher:
            return {"sections": [], "domains": domains, "schoolYears": []}

        # Only active Primary Adviser assignments grant classroom access.
        sec_ids = get_teacher_section_ids(teacher.teacher_id, db)
        sections = [
            s[0]
            for s in db.query(Section.section_name)
            .filter(Section.section_id.in_(sec_ids))
            .order_by(Section.section_name)
            .all()
        ]
        school_years = [row[0] for row in db.query(distinct(Student.school_year)).filter(Student.section_id.in_(sec_ids), Student.school_year.isnot(None)).order_by(desc(Student.school_year))]
        setting = db.get(SystemSettings, 1)
        if setting and setting.current_school_year:
            school_years = sorted(set(school_years + [setting.current_school_year]), reverse=True)
        return {"sections": sections, "domains": domains, "schoolYears": school_years}


@router.get("/pie-data", response_model=list[PieChartSlice])
def get_dashboard_pie_data(
    section: str = Query("All"),
    domain: str = Query("All"),
    period: str = Query("All"),
    schoolYear: str = Query("All"),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        verify_role(["super-admin", "admin", "teacher", "chairman"])
    ),
):
    query = (
        db.query(StudentEccdEvaluation.answer, func.count().label("count"))
        .join(Student, StudentEccdEvaluation.student_id == Student.student_id)
        .join(
            EccdQuestion, StudentEccdEvaluation.question_id == EccdQuestion.question_id
        )
        .join(EccdDomain, EccdQuestion.domain_id == EccdDomain.domain_id)
    )

    if section != "All":
        # Check if the section name matches any section
        query = query.filter(Student.section.has(section_name=section))

    if domain != "All":
        query = query.filter(EccdDomain.domain_name == domain)

    if period != "All":
        query = query.filter(StudentEccdEvaluation.testing_period == period)

    if schoolYear != "All":
        query = query.filter(Student.school_year == schoolYear)
    else:
        query = query.filter(Student.is_active == True)

    # If teacher, strictly enforce they can only see their sections
    if current_user.role not in [UserRole.SUPER_ADMIN, "chairman"]:
        teacher = (
            db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
        )
        if teacher:
            sec_ids = get_teacher_section_ids(teacher.teacher_id, db)
            if sec_ids:
                query = query.filter(Student.section_id.in_(sec_ids))
            else:
                return [
                    {"name": "KAYA", "value": 0, "color": "#10b981"},
                    {"name": "DI-KAYA", "value": 0, "color": "#ef4444"},
                ]
        else:
            return [
                {"name": "KAYA", "value": 0, "color": "#10b981"},
                {"name": "DI-KAYA", "value": 0, "color": "#ef4444"},
            ]

    results = query.group_by(StudentEccdEvaluation.answer).all()

    kaya_count = 0
    dikaya_count = 0

    for row in results:
        if row.answer == "KAYA":
            kaya_count = row.count
        elif row.answer == "DI-KAYA":
            dikaya_count = row.count

    return [
        {"name": "KAYA", "value": kaya_count, "color": "#10b981"},
        {"name": "DI-KAYA", "value": dikaya_count, "color": "#ef4444"},
    ]


@router.get("/stats", response_model=AnalyticsStats, response_model_exclude_none=True)
def get_dashboard_stats(
    section: str = Query("All"),
    schoolYear: str = Query("All"),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        verify_role(["super-admin", "admin", "teacher", "chairman"])
    ),
):
    if current_user.role in [UserRole.SUPER_ADMIN, "chairman"]:
        students_query = db.query(Student)
        teachers_query = db.query(Teacher).join(User, Teacher.user_id == User.user_id).filter(User.is_active.is_(True))
        
        if schoolYear != "All":
            students_query = students_query.filter(Student.school_year == schoolYear)
        else:
            students_query = students_query.filter(Student.is_active == True)

        if section != "All":
            students_query = students_query.filter(Student.section.has(section_name=section))
            teachers_query = teachers_query.filter(Teacher.section_assignments.any((SectionTeacher.status == "Active") & (SectionTeacher.role == "Primary Adviser") & SectionTeacher.section.has(section_name=section)))
            
        total_students = students_query.count()
        total_teachers = teachers_query.count()
        
        eccd_query = (
            db.query(StudentEccdEvaluation.answer, func.count().label("count"))
            .join(Student, StudentEccdEvaluation.student_id == Student.student_id)
        )
        if schoolYear != "All":
            eccd_query = eccd_query.filter(Student.school_year == schoolYear)
        else:
            eccd_query = eccd_query.filter(Student.is_active == True)
        if section != "All":
            eccd_query = eccd_query.filter(Student.section.has(section_name=section))
            
        eccd_rows = eccd_query.group_by(StudentEccdEvaluation.answer).all()
        kaya_count = sum([r.count for r in eccd_rows if r.answer == "KAYA"])
        dikaya_count = sum([r.count for r in eccd_rows if r.answer == "DI-KAYA"])
        
        total_eccd = kaya_count + dikaya_count
        kaya_percentage = math.floor((kaya_count / total_eccd) * 100 + 0.5) if total_eccd > 0 else 0
        dikaya_percentage = math.floor((dikaya_count / total_eccd) * 100 + 0.5) if total_eccd > 0 else 0

        priority_query = (
            db.query(Section.section_name.label("class_name"), func.count().label("dikaya_count"))
            .select_from(StudentEccdEvaluation)
            .join(Student, StudentEccdEvaluation.student_id == Student.student_id)
            .outerjoin(Section, Student.section_id == Section.section_id)
            .filter(StudentEccdEvaluation.answer == "DI-KAYA")
        )
        if schoolYear != "All":
            priority_query = priority_query.filter(Student.school_year == schoolYear)
        else:
            priority_query = priority_query.filter(Student.is_active == True)
        if section != "All":
            priority_query = priority_query.filter(Student.section.has(section_name=section))
            
        priority_row = priority_query.group_by(Section.section_name).order_by(desc("dikaya_count")).first()
        if priority_row:
            priority_intervention = priority_row.class_name or "None"
            priority_subtitle = "Requires Support"
        else:
            priority_intervention = "Perfect"
            priority_subtitle = "Fully on Track"

        domain_query = (
            db.query(EccdDomain.domain_name, func.count().label("dikaya_count"))
            .select_from(StudentEccdEvaluation)
            .join(EccdQuestion, StudentEccdEvaluation.question_id == EccdQuestion.question_id)
            .join(EccdDomain, EccdQuestion.domain_id == EccdDomain.domain_id)
            .join(Student, StudentEccdEvaluation.student_id == Student.student_id)
            .filter(StudentEccdEvaluation.answer == "DI-KAYA")
        )
        if schoolYear != "All":
            domain_query = domain_query.filter(Student.school_year == schoolYear)
        else:
            domain_query = domain_query.filter(Student.is_active == True)
        if section != "All":
            domain_query = domain_query.filter(Student.section.has(section_name=section))

        domain_row = domain_query.group_by(EccdDomain.domain_name).order_by(desc("dikaya_count")).first()
        if domain_row:
            critical_domain_name = domain_row.domain_name.replace(" Domain", "")
            critical_subtitle = "Needs Improvement"
        else:
            critical_domain_name = "Perfect"
            critical_subtitle = "Fully Mastered"

        delay_scope = [Student.is_active.is_(True)]
        if schoolYear != "All":
            delay_scope.append(Student.school_year == schoolYear)
        if section != "All":
            delay_scope.append(Student.section.has(section_name=section))

        return {
            "delaySummary": delay_summary(db, delay_scope, section).model_dump(),
            "stats": {
                "totalStudents": str(total_students),
                "totalTeachers": str(total_teachers),
                "priorityIntervention": priority_intervention,
                "priorityInterventionSubtitle": priority_subtitle,
                "criticalDomain": critical_domain_name,
                "criticalDomainSubtitle": critical_subtitle,
                "eccdProgress": f"{kaya_percentage}%",
                "eccdAvg": f"{kaya_percentage}%" if kaya_percentage > 0 else "0%"
            },
            "functionalMastery": {
                "kaya": kaya_percentage,
                "dikaya": dikaya_percentage
            }
        }
    else:
        # Teacher Stats
        teacher = db.query(Teacher).filter(Teacher.user_id == current_user.user_id).first()
        if not teacher:
            return {
                "stats": {
                    "totalStudents": "0",
                    "unreadMessages": "0",
                    "eccdProgress": "0%",
                    "priorityDomain": "None"
                },
                "criticalDomain": {"domainName": None, "totalDiKaya": 0, "completedStudents": 0},
                "messages": []
            }

        sec_ids = get_teacher_section_ids(teacher.teacher_id, db)

        student_scope = [Student.section_id.in_(sec_ids)]
        student_scope.append(Student.school_year == schoolYear if schoolYear != "All" else Student.is_active.is_(True))
        if section != "All":
            student_scope.append(Student.section.has(section_name=section))

        total_students = (
            db.query(Student)
            .filter(*student_scope)
            .count()
            if sec_ids
            else 0
        )

        from backend.utils.messaging import conversation_relationship
        message_relationship = conversation_relationship(db, Message.teacher_id, Message.parent_id)
        unread_messages = (
            db.query(Message)
            .filter(
                Message.teacher_id == teacher.teacher_id,
                Message.sender_role == "parent",
                Message.is_read == False,
                Message.is_archived == False,
                message_relationship,
            )
            .count()
        )

        total_questions = db.query(EccdQuestion).count()
        total_possible = total_students * total_questions * 3

        total_submitted = (
            db.query(StudentEccdEvaluation)
            .join(Student)
            .filter(*student_scope)
            .count()
            if sec_ids
            else 0
        )

        progress = "0%"
        if total_possible > 0:
            progress = f"{(total_submitted / total_possible) * 100:.1f}%"

        critical = critical_domain(db, [*student_scope, Student.is_active.is_(True)])
        priority_domain = critical.domainName or "None"

        # Recent messages feed
        recent_messages = (
            db.query(Message, Parent.fullname)
            .join(Parent, Message.parent_id == Parent.parent_id)
            .filter(
                Message.teacher_id == teacher.teacher_id,
                Message.sender_role == "parent",
                Message.is_archived == False,
                message_relationship,
            )
            .order_by(Message.created_at.desc())
            .limit(5)
            .all()
        )
        
        messages_list = []
        for msg, parent_name in recent_messages:
            messages_list.append({
                "id": msg.message_id,
                "name": parent_name,
                "preview": msg.body,
                "time": msg.created_at.strftime("%b %d"),
                "read": bool(msg.is_read)
            })

        return {
            "stats": {
                "totalStudents": str(total_students),
                "unreadMessages": str(unread_messages),
                "eccdProgress": progress,
                "priorityDomain": priority_domain,
            },
            "messages": messages_list,
            "criticalDomain": critical.model_dump(),
            "allow_eccd_question_management": bool(teacher.allow_eccd_question_management),
        }

@router.get("/logs", response_model=list[AuditLogItem])
@legacy_router.get("", response_model=list[AuditLogItem])
@legacy_router.get("/", response_model=list[AuditLogItem])
def get_system_logs(
    db: Session = Depends(get_db),
    current_user=Depends(verify_role(["super-admin", "chairman"])),
):
    from backend.utils.audit import read_details
    from backend.utils.account_identity import chairman_name, email_display_name
    chairman = chairman_name(db)
    logs = (db.query(SystemLog, User.email, User.role, Teacher.first_name, Teacher.last_name, Parent.fullname)
            .outerjoin(User, SystemLog.user_id == User.user_id)
            .outerjoin(Teacher, Teacher.user_id == User.user_id)
            .outerjoin(Parent, Parent.user_id == User.user_id)
            .filter(SystemLog.action_type.notin_(("ROLLOVER_SNAPSHOT", "ROLLOVER_RECORDS")))
            .order_by(SystemLog.timestamp.desc(), SystemLog.log_id.desc()).all())
    results = []
    for log, email, role, first_name, last_name, parent_name in logs:
        name = (" ".join(name.strip() for name in (first_name, last_name) if name and name.strip())
                or (parent_name or "").strip()
                or (chairman if role == "super-admin" else None)
                or (email_display_name(email) if email else "System"))
        details, metadata = read_details(log.details)
        results.append({
            "id": log.log_id,
            "action": log.action_type,
            "performed_by": name,
            "teacher_name": name,
            "actor_name": name,
            "actor_email": email,
            "role": {"super-admin": "Super Admin", "admin": "Teacher", "user": "Parent"}.get(role, "System"),
            "details": details,
            "metadata": metadata,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None
        })
    return results
