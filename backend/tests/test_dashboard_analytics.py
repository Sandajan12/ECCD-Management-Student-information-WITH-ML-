"""Dashboard aggregation regressions using real ORM queries and synthetic rows."""
from datetime import date
import json
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.models import Base, EccdDomain, EccdQuestion, Section, SectionTeacher, Student, StudentEccdEvaluation, Teacher, User
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.models.user import UserRole
from backend.utils.dashboard_analytics import critical_domain, delay_summary
from backend.utils.eccd_scorer import calculate_scores


class DashboardAnalyticsTests(TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.db.add_all([Section(section_id=1, section_name="Diamond"), Section(section_id=2, section_name="Emerald")])
        for domain_id, name in enumerate(("Gross Motor", "Fine Motor", "Self-Help", "Receptive Language", "Expressive Language", "Cognitive", "Socio-Emotional"), 1):
            self.db.add(EccdDomain(domain_id=domain_id, domain_name=f"{name} Domain"))
            self.db.add(EccdQuestion(question_id=domain_id, domain_id=domain_id,
                                     question_text=f"Item {domain_id}", sequence_order=1, is_home_based=domain_id == 7))
        self.db.add_all([
            Student(student_id=1, section_id=1, is_active=True, date_of_birth=date(2021, 1, 1), gender="Male", school_year="2026-2027"),
            Student(student_id=2, section_id=1, is_active=True, date_of_birth=date(2021, 1, 1), gender="Female", school_year="2026-2027"),
            Student(student_id=3, section_id=2, is_active=True),
            Student(student_id=4, section_id=1, is_active=False),
        ])
        self.db.flush()
        self.scope = [Student.section_id == 1, Student.is_active.is_(True)]

    def assessment(self, student_id, period="PRE", failed=(), questions=None, unconfirmed=()):
        when = {"PRE": date(2026, 8, 10), "MID": date(2026, 9, 10), "POST": date(2026, 10, 10)}[period]
        if questions is None:
            questions = [row[0] for row in self.db.query(EccdQuestion.question_id)]
        for question_id in questions:
            self.db.add(StudentEccdEvaluation(
                student_id=student_id, question_id=question_id, testing_period=TestingPeriod(period),
                answer=EccdAnswer.DI_KAYA if question_id in failed else EccdAnswer.KAYA,
                evaluation_date=when, teacher_evaluation_date=None if question_id in unconfirmed else when,
                evaluator_role="parent" if question_id in unconfirmed else "teacher",
            ))
        self.db.flush()

    def test_latest_complete_period_wins_over_older_and_partial_later_periods(self):
        self.assessment(1, failed=(1, 2, 6))
        self.assessment(1, "MID", failed=(6,))
        self.assessment(1, "POST", failed=(1,), questions=(1,))
        self.assessment(2, failed=(6,))
        result = critical_domain(self.db, self.scope)
        self.assertEqual((result.domainName, result.totalDiKaya, result.completedStudents), ("Cognitive", 2, 2))

    def test_inactive_other_section_and_unconfirmed_home_items_do_not_contribute(self):
        self.assessment(1, failed=(6,))
        self.assessment(2, failed=(1, 2, 3, 4, 5, 6, 7), unconfirmed=(7,))
        self.assessment(3, failed=(1, 2, 3, 4, 5, 6, 7))
        self.assessment(4, failed=(1, 2, 3, 4, 5, 6, 7))
        result = critical_domain(self.db, self.scope)
        self.assertEqual((result.domainName, result.totalDiKaya, result.completedStudents), ("Cognitive", 1, 1))

    def test_ties_use_alphabetical_domain_name(self):
        self.assessment(1, failed=(1, 6))
        self.assertEqual(critical_domain(self.db, self.scope).domainName, "Cognitive")

    def test_zero_failures_and_no_completed_records_are_distinguishable(self):
        result = critical_domain(self.db, self.scope)
        self.assertEqual((result.domainName, result.totalDiKaya, result.completedStudents), (None, 0, 0))
        self.assessment(1)
        result = critical_domain(self.db, self.scope)
        self.assertEqual((result.domainName, result.totalDiKaya, result.completedStudents), (None, 0, 1))

    def test_empty_authorized_scope_returns_no_records(self):
        self.assessment(1, failed=(6,))
        result = critical_domain(self.db, [Student.section_id.in_([])])
        self.assertEqual((result.totalDiKaya, result.completedStudents), (0, 0))

    def test_delay_counts_students_once_by_gender_and_section_with_zero_sections(self):
        self.assessment(1, failed=(1,))
        self.assessment(1, "MID", failed=(1, 2))
        self.assessment(2, failed=(1,))
        self.assessment(2, "POST", failed=(1,), questions=(1,))
        with patch("backend.utils.dashboard_analytics.calculate_scores", side_effect=[
            {"interpretation": "Slight Delay"}, {"interpretation": "Delay"},
        ]) as scorer:
            result = delay_summary(self.db, [Student.is_active.is_(True)], "All")
        self.assertEqual((result.male, result.female, result.totalDelayed, result.assessedStudents), (1, 1, 2, 2))
        self.assertEqual(result.bySection, {"Diamond": 2, "Emerald": 0})
        self.assertEqual(scorer.call_count, 2)
        periods = {call.args[0][0]["testing_period"] for call in scorer.call_args_list}
        self.assertEqual(periods, {TestingPeriod.PRE, TestingPeriod.MID})
        self.assertTrue(all(call.args[1] in (5.6, 5.7) for call in scorer.call_args_list))

    def test_delay_summary_excludes_incomplete_unconfirmed_inactive_and_missing_age(self):
        self.assessment(1, failed=(1,), questions=(1,))
        self.assessment(2, failed=(1,), unconfirmed=(7,))
        self.assessment(3, failed=(1,))
        self.assessment(4, failed=(1,))
        with patch("backend.utils.dashboard_analytics.calculate_scores") as scorer:
            result = delay_summary(self.db, [Student.is_active.is_(True)], "All")
        scorer.assert_not_called()
        self.assertEqual((result.totalDelayed, result.assessedStudents), (0, 0))

    def test_latest_completed_average_replaces_old_delay(self):
        self.assessment(1, failed=(1,))
        self.assessment(1, "POST")
        with patch("backend.utils.dashboard_analytics.calculate_scores", return_value={"interpretation": "Average"}) as scorer:
            result = delay_summary(self.db, self.scope, "Diamond")
        self.assertEqual((result.totalDelayed, result.assessedStudents), (0, 1))
        self.assertEqual(result.bySection, {"Diamond": 0})
        self.assertEqual(scorer.call_args.args[0][0]["testing_period"], TestingPeriod.POST)

    def test_unknown_gender_and_unassigned_students_still_count_in_section_totals(self):
        student = self.db.get(Student, 1)
        student.gender = None
        student.section_id = None
        self.assessment(1, failed=(6,))
        with patch("backend.utils.dashboard_analytics.calculate_scores", return_value={"interpretation": "Delay"}):
            result = delay_summary(self.db, [Student.is_active.is_(True)], "All")
        self.assertEqual((result.totalDelayed, result.male, result.female), (1, 0, 0))
        self.assertEqual(result.bySection, {"Diamond": 0, "Emerald": 0, "Unassigned": 1})

    def test_delay_summary_matches_official_scorer_with_full_reference_checklist(self):
        self.db.query(EccdQuestion).delete()
        payload = json.loads((Path(__file__).resolve().parents[1] / "assets/reference/eccd.json").read_text(encoding="utf-8"))
        self.db.add_all(EccdQuestion(**row) for row in payload["questions"])
        self.db.flush()
        question_ids = [row[0] for row in self.db.query(EccdQuestion.question_id)]
        self.assessment(1, failed=question_ids)
        self.assessment(2)
        expected = []
        for student_id in (1, 2):
            records = self.db.query(StudentEccdEvaluation).filter_by(student_id=student_id).all()
            scores = calculate_scores([{"domain_id": record.question.domain_id, "answer": record.answer.value} for record in records], 5.6)
            expected.append(scores["interpretation"] in {"Slight Delay", "Delay"})
        self.assertNotEqual(expected[0], expected[1])
        result = delay_summary(self.db, self.scope, "All")
        self.assertEqual((result.male, result.female, result.totalDelayed), (int(expected[0]), int(expected[1]), sum(expected)))

    def test_summary_routes_keep_teacher_scope_and_filter_active_chairman_cohorts(self):
        from backend.routes.analytics import get_dashboard_stats
        self.db.add_all([
            User(user_id=1, email="chairman@example.test", password_hash="synthetic", role=UserRole.SUPER_ADMIN),
            User(user_id=2, email="teacher@example.test", password_hash="synthetic", role=UserRole.ADMIN),
            Teacher(teacher_id=1, user_id=2),
            SectionTeacher(section_id=1, teacher_id=1, role="Primary Adviser", status="Active"),
        ])
        self.db.flush()
        self.assessment(1, failed=(6,))
        self.assessment(2, failed=(6,))
        self.assessment(3, failed=(1, 2, 3, 4, 5, 6, 7))
        self.assessment(4, failed=(1, 2, 3, 4, 5, 6, 7))
        teacher = self.db.get(User, 2)
        from backend.schemas.operations import AnalyticsStats
        result = get_dashboard_stats("All", "All", self.db, teacher)
        self.assertEqual(AnalyticsStats.model_validate(result).criticalDomain.totalDiKaya, 2)
        self.assertEqual(result["criticalDomain"]["totalDiKaya"], 2)
        result = get_dashboard_stats("Emerald", "All", self.db, teacher)
        self.assertEqual(result["criticalDomain"]["completedStudents"], 0)
        with patch("backend.utils.dashboard_analytics.calculate_scores", return_value={"interpretation": "Slight Delay"}):
            result = get_dashboard_stats("Diamond", "2026-2027", self.db, self.db.get(User, 1))
        self.assertEqual(result["delaySummary"]["totalDelayed"], 2)
        self.assertEqual(result["delaySummary"]["bySection"], {"Diamond": 2})
        self.assertEqual(AnalyticsStats.model_validate(result).delaySummary.male, 1)
        result = get_dashboard_stats("All", "2025-2026", self.db, self.db.get(User, 1))
        self.assertEqual(result["delaySummary"]["totalDelayed"], 0)

    def test_teacher_without_assignment_or_profile_has_empty_critical_summary(self):
        from backend.routes.analytics import get_dashboard_stats
        user = User(user_id=10, email="unassigned@example.test", password_hash="synthetic", role=UserRole.ADMIN)
        self.db.add(user)
        self.db.flush()
        for has_profile in (False, True):
            if has_profile:
                self.db.add(Teacher(teacher_id=10, user_id=10))
                self.db.flush()
            result = get_dashboard_stats("All", "All", self.db, user)
            self.assertEqual(result["criticalDomain"], {"domainName": None, "totalDiKaya": 0, "completedStudents": 0})
