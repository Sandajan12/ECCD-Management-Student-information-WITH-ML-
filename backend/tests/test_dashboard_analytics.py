"""Dashboard aggregation regressions using real ORM queries and synthetic rows."""
from datetime import date
import json
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.models import Base, EccdDomain, EccdQuestion, Section, SectionTeacher, Student, StudentEccdEvaluation, Teacher, User
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.models.user import UserRole
from backend.utils.dashboard_analytics import critical_domain, delay_summary, excelling_domain
from backend.utils.eccd_scorer import calculate_scores


class DashboardAnalyticsTests(TestCase):
    def setUp(self):
        # HTTP validation cases run handlers on TestClient's worker thread.
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
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

    def test_excellence_uses_mastery_ratio_rather_than_raw_kaya_count(self):
        # Cognitive has more mastered items, but Gross Motor has a better ratio.
        self.db.add_all([
            EccdQuestion(question_id=8, domain_id=6, question_text="Cognitive item 2", sequence_order=2),
            EccdQuestion(question_id=9, domain_id=6, question_text="Cognitive item 3", sequence_order=3),
        ])
        self.db.flush()
        self.assessment(1, failed=(2, 3, 4, 5, 6, 7))
        result = excelling_domain(self.db, self.scope)
        self.assertEqual((result.domainName, result.masteryRate, result.totalKaya, result.totalItems),
                         ("Gross Motor", 100, 1, 1))

    def test_excellence_uses_latest_complete_teacher_confirmed_period_per_student(self):
        self.assessment(1, failed=(1, 2, 3, 4, 5, 7))
        self.assessment(1, "MID", failed=(2, 3, 4, 5, 6, 7))
        self.assessment(1, "POST", questions=(1,), failed=(1,))
        self.assessment(2, failed=(2, 3, 4, 5, 6, 7))
        self.assessment(2, "POST", failed=(1, 2, 3, 4, 5, 7), unconfirmed=(7,))
        result = excelling_domain(self.db, self.scope)
        self.assertEqual((result.domainName, result.masteryRate, result.completedStudents),
                         ("Gross Motor", 100, 2))

    def test_excellence_scope_excludes_inactive_other_section_and_other_year(self):
        self.db.get(Student, 2).school_year = "2025-2026"
        self.assessment(1, failed=(2, 3, 4, 5, 6, 7))
        for student_id in (2, 3, 4):
            self.assessment(student_id, failed=(1, 2, 3, 4, 5, 7))
        result = excelling_domain(self.db, [*self.scope, Student.school_year == "2026-2027"])
        self.assertEqual((result.domainName, result.masteryRate, result.completedStudents),
                         ("Gross Motor", 100, 1))

    def test_excellence_distinguishes_no_completed_data_from_zero_mastery_and_breaks_ties(self):
        result = excelling_domain(self.db, self.scope)
        self.assertEqual((result.domainName, result.masteryRate, result.completedStudents), (None, None, 0))
        self.assessment(1, failed=(1, 2, 3, 4, 5, 6, 7))
        result = excelling_domain(self.db, self.scope)
        self.assertEqual((result.domainName, result.masteryRate, result.totalItems), ("Cognitive", 0, 1))

    def test_excellence_returns_fractional_rate_and_school_wide_totals(self):
        self.assessment(1)
        self.assessment(2, failed=(1, 2, 3, 4, 5, 6, 7))
        self.assessment(3, failed=(1, 2, 3, 4, 5, 7))
        result = excelling_domain(self.db, [Student.is_active.is_(True), Student.section.has()])
        self.assertEqual((result.domainName, result.masteryRate, result.totalKaya, result.totalItems),
                         ("Cognitive", 66.67, 2, 3))

    def test_id_filters_scope_stats_delays_and_charts_and_preserve_filter_names(self):
        from backend.models.settings import SystemSettings
        from backend.routes.analytics import get_dashboard_filters, get_dashboard_pie_data, get_dashboard_stats
        from backend.schemas.analytics import DashboardFilters
        from backend.schemas.operations import AnalyticsStats
        user = User(user_id=1, email="chairman@example.test", password_hash="synthetic", role=UserRole.SUPER_ADMIN)
        self.db.add_all([user, SystemSettings(id=1, current_school_year="2026-2027")])
        self.db.flush()
        self.assessment(1, failed=(2, 3, 4, 5, 6, 7))
        self.assessment(3, failed=(1, 2, 3, 4, 5, 7))
        options = DashboardFilters.model_validate(get_dashboard_filters(self.db, user))
        self.assertEqual(options.sections, ["Diamond", "Emerald"])
        self.assertEqual(options.sectionOptions[0].section_id, 1)
        self.assertEqual(options.currentSchoolYear, "2026-2027")
        with patch("backend.utils.dashboard_analytics.calculate_scores", return_value={"interpretation": "Delay"}):
            result = AnalyticsStats.model_validate(get_dashboard_stats("All", "2026-2027", self.db, user, section_id=1))
        self.assertEqual(result.stats["totalStudents"], "2")
        self.assertEqual(result.excellingDomain.domainName, "Gross Motor")
        self.assertEqual(result.delaySummary.model_dump()["bySection"], {"Diamond": {"male": 1, "female": 0}})
        self.assertEqual([student.studentId for student in result.delaySummary.students], [1])
        pie = get_dashboard_pie_data("All", "All", "All", "2026-2027", self.db, user, section_id=1)
        self.assertEqual([row["value"] for row in pie], [1, 6])
        result = get_dashboard_stats("All", "All", self.db, user, section_id=2)
        self.assertEqual(result["excellingDomain"]["domainName"], "Cognitive")
        with self.assertRaisesRegex(Exception, "Section not found"):
            get_dashboard_stats("All", "All", self.db, user, section_id=999)
        # An actual section named "All" is still one section when selected by ID.
        self.db.get(Section, 1).section_name = "All"
        self.db.flush()
        result = get_dashboard_stats("All", "All", self.db, user, section_id=1)
        self.assertEqual(result["excellingDomain"]["domainName"], "Gross Motor")
        self.assertEqual(list(result["delaySummary"]["bySection"]), ["All"])

    def test_chairman_critical_percentage_uses_selected_domain_denominator_and_scope(self):
        from backend.routes.analytics import get_dashboard_stats
        from backend.schemas.operations import AnalyticsStats
        user = User(user_id=1, email="chairman@example.test", password_hash="synthetic", role=UserRole.SUPER_ADMIN)
        self.db.add(user)
        self.db.get(Student, 3).school_year = "2026-2027"
        self.db.get(Student, 4).school_year = "2025-2026"
        self.db.flush()
        self.assessment(1, failed=(6,))
        self.assessment(1, "MID")
        self.assessment(2)
        self.assessment(3, failed=(6,))
        self.assessment(4, failed=(6,))
        # Retain the existing critical-domain period/cohort selection. Other domains
        # must not dilute its rate, and section/year filters apply to both counts.
        result = AnalyticsStats.model_validate(get_dashboard_stats("All", "2026-2027", self.db, user, section_id=1))
        self.assertEqual(result.stats["criticalDomain"], "Cognitive")
        self.assertEqual(result.criticalDomainDiKayaRate, 33.33)
        result = get_dashboard_stats("All", "2026-2027", self.db, user)
        self.assertEqual(result["criticalDomainDiKayaRate"], 50)
        result = get_dashboard_stats("All", "All", self.db, user, section_id=1)
        self.assertEqual(result["criticalDomainDiKayaRate"], 33.33)

    def test_chairman_critical_percentage_is_absent_without_a_critical_domain(self):
        from backend.routes.analytics import get_dashboard_stats
        from backend.schemas.operations import AnalyticsStats
        user = User(user_id=1, email="chairman@example.test", password_hash="synthetic", role=UserRole.SUPER_ADMIN)
        self.db.add(user)
        self.db.flush()
        for completed in (False, True):
            if completed:
                self.assessment(1)
            result = AnalyticsStats.model_validate(get_dashboard_stats("All", "All", self.db, user))
            self.assertIsNone(result.criticalDomainDiKayaRate)
            self.assertEqual(result.stats["criticalDomain"], "Perfect")

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
        self.assertEqual(result.model_dump()["bySection"], {
            "Diamond": {"male": 1, "female": 1}, "Emerald": {"male": 0, "female": 0},
        })
        self.assertEqual(result.students, [])
        self.assertEqual(scorer.call_count, 2)
        periods = {call.args[0][0]["testing_period"] for call in scorer.call_args_list}
        self.assertEqual(periods, {TestingPeriod.PRE, TestingPeriod.MID})
        self.assertTrue(all(call.args[1] in (5.6, 5.7) for call in scorer.call_args_list))

    def test_section_gender_counts_follow_period_and_interpretation_without_rescoring(self):
        self.db.get(Student, 2).section_id = 2
        self.db.get(Student, 3).date_of_birth = date(2021, 1, 1)
        self.db.get(Student, 3).gender = "Male"
        self.db.flush()
        for identifier in (1, 2, 3, 4):
            self.assessment(identifier)
        for identifier in (1, 3):
            self.assessment(identifier, "MID")
        with patch("backend.utils.dashboard_analytics.calculate_scores", side_effect=lambda records, age: {
            "interpretation": "Average" if records[0]["testing_period"] == TestingPeriod.PRE else "Slight Delay"
        }) as scorer:
            for period, category, expected, calls in (
                (TestingPeriod.PRE, "Average Development", {
                    "Diamond": {"male": 1, "female": 0}, "Emerald": {"male": 1, "female": 1},
                }, 3),
                (TestingPeriod.MID, "Slight Delay", {
                    "Diamond": {"male": 1, "female": 0}, "Emerald": {"male": 1, "female": 0},
                }, 2),
                (TestingPeriod.MID, "Average Development", {
                    "Diamond": {"male": 0, "female": 0}, "Emerald": {"male": 0, "female": 0},
                }, 2),
            ):
                with self.subTest(period=period, interpretation=category):
                    scorer.reset_mock()
                    result = delay_summary(self.db, [Student.is_active.is_(True)], "All",
                                           testing_period=period, interpretation=category)
                    self.assertEqual(result.model_dump()["bySection"], expected)
                    self.assertEqual(scorer.call_count, calls)
                    self.assertEqual(result.male, sum(row["male"] for row in expected.values()))
                    self.assertEqual(result.female, sum(row["female"] for row in expected.values()))
                    self.assertEqual(result.totalMatched, result.male + result.female)

    def test_section_delay_details_match_counts_official_age_and_latest_completed_period(self):
        self.db.get(Student, 1).first_name = " Zoe "
        self.db.get(Student, 1).middle_name = " M "
        self.db.get(Student, 1).last_name = " Zeta "
        self.db.get(Student, 2).first_name = "Ada"
        self.assessment(1, failed=(1,))
        self.assessment(1, "MID", failed=(1, 2))
        self.assessment(1, "POST", failed=(1,), questions=(1,))
        self.assessment(2, failed=(1,))
        with patch("backend.utils.dashboard_analytics.calculate_scores", side_effect=lambda records, age: {
            "interpretation": "Slight Delay" if records[0]["testing_period"] == TestingPeriod.MID else "Delay"
        }):
            result = delay_summary(self.db, self.scope, "Diamond", section_id=1)
        self.assertEqual(len(result.students), result.totalDelayed)
        self.assertEqual([student.model_dump() for student in result.students], [
            {"studentId": 2, "studentName": "Ada", "decimalAge": 5.6, "delayStatus": "Delay"},
            {"studentId": 1, "studentName": "Zoe M Zeta", "decimalAge": 5.7, "delayStatus": "Slight Delay"},
        ])
        self.assertEqual((result.male, result.female), (1, 1))

    def test_section_delay_details_keep_active_year_section_and_confirmation_scope(self):
        self.db.get(Student, 2).school_year = "2025-2026"
        self.db.get(Student, 3).date_of_birth = date(2021, 1, 1)
        for student_id in (1, 2, 3, 4):
            self.assessment(student_id, failed=(1,))
        self.assessment(1, "POST", failed=(1,), unconfirmed=(7,))
        with patch("backend.utils.dashboard_analytics.calculate_scores", return_value={"interpretation": "Delay"}):
            result = delay_summary(self.db, [*self.scope, Student.school_year == "2026-2027"], "Diamond", section_id=1)
        self.assertEqual(result.totalDelayed, 1)
        self.assertEqual(result.students[0].studentId, 1)
        self.assertEqual(result.students[0].studentName, "Student 1")
        self.assertEqual(result.students[0].decimalAge, 5.6)

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
        self.assertEqual(result.students, [])
        self.assertEqual(result.model_dump()["bySection"], {"Diamond": {"male": 0, "female": 0}})
        self.assertEqual(scorer.call_args.args[0][0]["testing_period"], TestingPeriod.POST)

    def test_explicit_period_delay_counts_match_export_workbook_for_every_period(self):
        from backend.utils.excel import summary_workbook
        self.db.query(EccdQuestion).delete()
        payload = json.loads((Path(__file__).resolve().parents[1] / "assets/reference/eccd.json").read_text(encoding="utf-8"))
        self.db.add_all(EccdQuestion(**row) for row in payload["questions"])
        self.db.flush()
        ids = [row[0] for row in self.db.query(EccdQuestion.question_id)]
        self.assessment(1, failed=ids)
        self.assessment(2)
        self.assessment(1, "MID")
        # The export scores partial recorded periods, even with an unconfirmed item.
        self.assessment(2, "MID", failed=ids[:2], questions=ids[:2], unconfirmed=ids[1:2])
        # A parent-only period has no official date and cannot be scored.
        self.assessment(1, "POST", failed=ids, unconfirmed=ids)
        self.assessment(2, "POST", failed=ids)
        students = [self.db.get(Student, identifier) for identifier in (1, 2)]
        workbook = summary_workbook(self.db, self.db.get(Section, 1), students)
        self.addCleanup(workbook.close)
        for period, sheet_name in ((TestingPeriod.PRE, "PR"), (TestingPeriod.MID, "M"), (TestingPeriod.POST, "PO")):
            with self.subTest(period=period):
                result = delay_summary(self.db, self.scope, "Diamond", section_id=1, testing_period=period)
                sheet = workbook[sheet_name]
                male = sum(sheet.cell(45, column).value for column in (7, 8))
                female = sum(sheet.cell(46, column).value for column in (7, 8))
                self.assertEqual((result.male, result.female, result.totalDelayed), (male, female, male + female))
                expected = {
                    student.student_id: (sheet.cell(index + 14, 10).value, sheet.cell(index + 14, 27).value)
                    for index, student in enumerate(students)
                    if sheet.cell(index + 14, 27).value in {"Slight Delay", "Delay"}
                }
                self.assertEqual({student.studentId: (student.decimalAge, student.delayStatus)
                                  for student in result.students}, expected)
                self.assertEqual(result.model_dump()["bySection"], {"Diamond": {"male": male, "female": female}})
                # Compare every UI category directly with the exported official
                # interpretation, not a second implementation of the scorer.
                for category, labels in {
                    "Delay": {"Delay"},
                    "Average": {"Average"},
                    "Slight Advance": {"Slight Advance"},
                    "Highly Advance": {"Highly Advance"},
                    "Average Development": {"Average"},
                    "Slight Delay": {"Slight Delay"},
                    "Significant Delay": {"Delay"},
                    "Advanced Development": {"Slight Advance", "Highly Advance"},
                }.items():
                    filtered = delay_summary(self.db, self.scope, "Diamond", 1, period, category)
                    expected_ids = [student.student_id for index, student in enumerate(students)
                                    if sheet.cell(index + 14, 27).value in labels]
                    self.assertEqual(sorted(student.studentId for student in filtered.students), expected_ids)
                    self.assertEqual(filtered.totalMatched, len(expected_ids))
                    self.assertEqual((filtered.male, filtered.female),
                                     (int(1 in expected_ids), int(2 in expected_ids)))
                    self.assertEqual(filtered.model_dump()["bySection"], {
                        "Diamond": {"male": int(1 in expected_ids), "female": int(2 in expected_ids)},
                    })
        # MID includes the export's partial assessment, while latest completed
        # keeps student 2's later complete POST and student 1's complete MID.
        latest = delay_summary(self.db, self.scope, "Diamond", section_id=1)
        self.assertEqual([student.studentId for student in latest.students], [2])

    def test_explicit_delay_period_never_falls_back_and_preserves_active_cohort_scope(self):
        self.db.get(Student, 2).school_year = "2025-2026"
        self.db.get(Student, 3).date_of_birth = date(2021, 1, 1)
        for identifier in (1, 2, 3, 4):
            self.assessment(identifier)
        self.assessment(1, "MID", questions=(1,), unconfirmed=(1,))
        scope = [*self.scope, Student.school_year == "2026-2027"]
        with patch("backend.utils.dashboard_analytics.calculate_scores", return_value={"interpretation": "Slight Delay"}) as scorer:
            pre = delay_summary(self.db, scope, "Diamond", 1, TestingPeriod.PRE)
            self.assertEqual((pre.totalDelayed, pre.assessedStudents, pre.male, pre.female), (1, 1, 1, 0))
            self.assertEqual([student.studentId for student in pre.students], [1])
            scorer.reset_mock()
            for period in (TestingPeriod.MID, TestingPeriod.POST):
                result = delay_summary(self.db, scope, "Diamond", 1, period)
                self.assertEqual((result.totalDelayed, result.assessedStudents, result.students), (0, 0, []))
                self.assertEqual(result.model_dump()["bySection"], {"Diamond": {"male": 0, "female": 0}})
            scorer.assert_not_called()
            self.db.get(Student, 1).date_of_birth = None
            self.db.flush()
            self.assertEqual(delay_summary(self.db, scope, "Diamond", 1, TestingPeriod.PRE).assessedStudents, 0)

    def test_delay_period_route_changes_only_delay_summary(self):
        from backend.routes.analytics import get_dashboard_stats
        user = User(user_id=1, email="chairman@example.test", password_hash="synthetic", role=UserRole.SUPER_ADMIN)
        self.db.add(user)
        self.db.flush()
        self.assessment(1, failed=(1,))
        self.assessment(1, "MID")
        with patch("backend.utils.dashboard_analytics.calculate_scores", side_effect=lambda records, age: {
            "interpretation": "Delay" if records[0]["testing_period"] == TestingPeriod.PRE else "Average"
        }):
            pre = get_dashboard_stats("All", "2026-2027", self.db, user, section_id=1, delay_period=TestingPeriod.PRE)
            mid = get_dashboard_stats("All", "2026-2027", self.db, user, section_id=1, delay_period=TestingPeriod.MID)
            latest = get_dashboard_stats("All", "2026-2027", self.db, user, section_id=1)
        self.assertEqual(pre["delaySummary"]["totalDelayed"], 1)
        self.assertEqual(mid["delaySummary"]["totalDelayed"], 0)
        self.assertEqual(mid, latest)
        self.assertEqual({key: value for key, value in pre.items() if key != "delaySummary"},
                         {key: value for key, value in mid.items() if key != "delaySummary"})

    def test_global_period_scopes_all_chairman_metrics_and_preserves_legacy_defaults(self):
        from backend.routes.analytics import get_dashboard_stats, get_dashboard_pie_data
        self.db.get(Student, 3).school_year = "2026-2027"
        self.db.get(Student, 4).school_year = "2026-2027"
        self.db.add(Student(student_id=5, section_id=1, is_active=True, school_year="2025-2026"))
        self.assessment(1, failed=(1, 2))
        self.assessment(1, "MID", failed=(3,))
        self.assessment(2, failed=(2,))
        self.assessment(3, "MID", failed=(1, 2, 3, 4, 5, 6, 7))
        self.assessment(4, "MID", failed=(1, 2, 3, 4, 5, 6, 7))
        self.assessment(5, "MID", failed=(1, 2, 3, 4, 5, 6, 7))
        user = User(role=UserRole.SUPER_ADMIN)
        with patch("backend.utils.dashboard_analytics.calculate_scores", return_value={"interpretation": "Average"}):
            pre = get_dashboard_stats("All", "2026-2027", self.db, user, period=TestingPeriod.PRE, interpretation="Average Development")
            mid = get_dashboard_stats("All", "2026-2027", self.db, user, period=TestingPeriod.MID, interpretation="Average Development")
            selected = get_dashboard_stats("All", "2026-2027", self.db, user, section_id=1, period=TestingPeriod.MID, interpretation="Average Development")
            absent = get_dashboard_stats("All", "2026-2027", self.db, user, period=TestingPeriod.POST)
        self.assertEqual(pre["stats"]["totalStudents"], "2")
        self.assertEqual(mid["stats"]["totalStudents"], "2")
        self.assertEqual(pre["stats"]["criticalDomain"], "Fine Motor")
        self.assertEqual(pre["criticalDomainDiKayaRate"], 100)
        self.assertEqual(mid["stats"]["priorityIntervention"], "Emerald")
        self.assertEqual(selected["stats"]["priorityIntervention"], "Diamond")
        self.assertEqual(selected["stats"]["criticalDomain"], "Self-Help")
        self.assertEqual(selected["stats"]["totalStudents"], "1")
        self.assertEqual(pre["excellingDomain"]["domainName"], "Cognitive")
        self.assertEqual(pre["excellingDomain"]["masteryRate"], 100)
        self.assertEqual(mid["excellingDomain"]["masteryRate"], 50)
        self.assertEqual(selected["excellingDomain"]["masteryRate"], 100)
        self.assertEqual(selected["delaySummary"]["totalMatched"], 1)
        self.assertEqual(selected["delaySummary"]["bySection"], {"Diamond": {"male": 1, "female": 0}})
        self.assertEqual(absent["stats"]["totalStudents"], "0")
        self.assertIsNone(absent["excellingDomain"]["domainName"])
        self.assertEqual(absent["functionalMastery"], {"kaya": 0, "dikaya": 0})
        pie = get_dashboard_pie_data("All", "All", "MID", "2026-2027", self.db, user)
        self.assertEqual([item["value"] for item in pie], [6, 8])
        legacy = get_dashboard_stats("All", "2026-2027", self.db, user)
        self.assertEqual(legacy["stats"]["totalStudents"], "4")

    def test_excellence_explicit_period_does_not_fall_back_to_other_completed_period(self):
        self.assessment(1, failed=(1, 2, 3))
        self.assessment(1, "MID", questions=(1, 2), failed=(1,))
        result = excelling_domain(self.db, self.scope, TestingPeriod.MID)
        self.assertIsNone(result.domainName)
        self.assertEqual(result.completedStudents, 0)
        self.assertEqual(excelling_domain(self.db, self.scope).completedStudents, 1)

    def test_combined_support_interpretation_reuses_existing_official_delay_bands(self):
        self.assessment(1)
        self.assessment(2)
        for label, expected in (("Slight Delay", 2), ("Delay", 2), ("Average", 0), ("Slight Advance", 0), ("Highly Advance", 0)):
            with self.subTest(label=label), patch("backend.utils.dashboard_analytics.calculate_scores", return_value={"interpretation": label}):
                result = delay_summary(self.db, self.scope, "Diamond", 1, TestingPeriod.PRE, "Delayed / Needs Support")
                self.assertEqual(result.totalMatched, expected)
                self.assertEqual(result.totalDelayed, expected)
                self.assertEqual(result.bySection["Diamond"].male, expected // 2)
                self.assertEqual(result.bySection["Diamond"].female, expected // 2)

    def test_delay_period_query_reuses_testing_period_validation(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from backend.config.database import get_db
        from backend.routes.analytics import router
        from backend.utils.deps import get_current_user
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: User(role=UserRole.SUPER_ADMIN)
        with TestClient(app) as client:
            for parameter in ("delay_period", "period"):
                for value in ("BOGUS", "Latest", "pre"):
                    response = client.get("/api/analytics/stats", params={parameter: value})
                    self.assertEqual(response.status_code, 422, response.text)
            for value in ("All", "Delays (All)", "average", "slight advance", "Unknown"):
                response = client.get("/api/analytics/stats", params={"interpretation": value})
                self.assertEqual(response.status_code, 422, response.text)
            for value in ("Delay", "Slight Delay", "Average", "Slight Advance", "Highly Advance",
                          "Slight Advancement", "Highly Advancement"):
                response = client.get("/api/analytics/stats", params={"interpretation": value, "period": "PRE"})
                self.assertEqual(response.status_code, 200, response.text)

    def test_interpretation_filter_matches_official_bands_and_keeps_delay_totals_truthful(self):
        self.assessment(1)
        self.assessment(2)
        for category, official_labels in {
            "Delay": ("Delay",),
            "Average": ("Average",),
            "Slight Advance": ("Slight Advance", "Slight Advanced"),
            "Highly Advance": ("Highly Advance", "Highly Advanced"),
            "Slight Advancement": ("Slight Advance", "Slight Advanced"),
            "Highly Advancement": ("Highly Advance", "Highly Advanced"),
            "Average Development": ("Average",),
            "Slight Delay": ("Slight Delay",),
            "Significant Delay": ("Delay",),
            "Advanced Development": ("Slight Advance", "Highly Advance", "Slight Advanced", "Highly Advanced"),
        }.items():
            for label in official_labels:
                with self.subTest(category=category, official=label), patch(
                    "backend.utils.dashboard_analytics.calculate_scores", return_value={"interpretation": label}
                ):
                    for period in (TestingPeriod.PRE, None):
                        result = delay_summary(self.db, self.scope, "Diamond", 1, period, category)
                        self.assertEqual((result.male, result.female, result.totalMatched), (1, 1, 2))
                        self.assertEqual(result.totalDelayed, 2 if label in {"Slight Delay", "Delay"} else 0)
                        self.assertEqual(result.model_dump()["bySection"], {"Diamond": {"male": 1, "female": 1}})
                        self.assertEqual([row.delayStatus for row in result.students], [label, label])
                    absent = delay_summary(self.db, self.scope, "Diamond", 1, TestingPeriod.MID, category)
                    self.assertEqual((absent.totalMatched, absent.assessedStudents), (0, 0))
                    other = "Slight Delay" if label == "Average" else "Average"
                    mismatch = delay_summary(self.db, self.scope, "Diamond", 1, TestingPeriod.PRE, other)
                    self.assertEqual((mismatch.totalMatched, mismatch.assessedStudents), (0, 2))

    def test_five_standard_tiers_match_json_labels_without_combining_advancement_bands(self):
        from backend.utils.eccd_scorer import scoring_data
        from backend.routes.analytics import get_dashboard_stats
        tiers = {entry["interpretation"] for bracket in scoring_data.values()
                 for entry in bracket["standardScores"].values()}
        self.assertEqual(tiers, {"Delay", "Slight Delay", "Average", "Slight Advance", "Highly Advance"})
        for identifier in (1, 2, 3, 4):
            self.db.get(Student, identifier).date_of_birth = date(2021, 1, 1)
            self.db.get(Student, identifier).school_year = "2026-2027"
            self.assessment(identifier)
        self.assessment(1, "MID")
        self.db.get(Student, 2).school_year = "2025-2026"
        user = User(role=UserRole.SUPER_ADMIN)
        for official in tiers:
            with self.subTest(official=official), patch(
                "backend.utils.dashboard_analytics.calculate_scores", return_value={"interpretation": official}
            ):
                for selected in tiers:
                    result = get_dashboard_stats("All", "2026-2027", self.db, user,
                                                 period=TestingPeriod.PRE, interpretation=selected)["delaySummary"]
                    expected = int(selected == official)
                    self.assertEqual(result["totalMatched"], expected * 2)
                    self.assertEqual(result["bySection"], {
                        "Diamond": {"male": expected, "female": 0},
                        "Emerald": {"male": 0, "female": 0},
                    })
                    single = get_dashboard_stats("All", "2026-2027", self.db, user, section_id=1,
                                                 period=TestingPeriod.MID, interpretation=selected)["delaySummary"]
                    self.assertEqual(single["totalMatched"], expected)
                    self.assertEqual(single["bySection"], {"Diamond": {"male": expected, "female": 0}})

    def test_interpretation_route_scopes_students_without_changing_other_metrics(self):
        from backend.routes.analytics import get_dashboard_stats
        from backend.schemas.operations import AnalyticsStats
        user = User(user_id=1, email="chairman@example.test", password_hash="synthetic", role=UserRole.SUPER_ADMIN)
        self.db.add(user)
        self.db.get(Student, 2).school_year = "2025-2026"
        self.db.get(Student, 3).date_of_birth = date(2021, 1, 1)
        for student_id in (1, 2, 3, 4):
            self.assessment(student_id)
        self.assessment(1, "MID")
        with patch("backend.utils.dashboard_analytics.calculate_scores", side_effect=lambda records, age: {
            "interpretation": "Average" if records[0]["testing_period"] == TestingPeriod.PRE else "Slight Delay"
        }):
            results = [get_dashboard_stats("All", "2026-2027", self.db, user, section_id=1,
                                         delay_period=TestingPeriod.PRE, interpretation=category)
                       for category in ("Average Development", "Slight Delay", "Significant Delay", "Advanced Development")]
            mid = get_dashboard_stats("All", "2026-2027", self.db, user, section_id=1,
                                      delay_period=TestingPeriod.MID, interpretation="Slight Delay")
        self.assertEqual([result["delaySummary"]["totalMatched"] for result in results], [1, 0, 0, 0])
        self.assertEqual(mid["delaySummary"]["totalMatched"], 1)
        self.assertEqual(mid["delaySummary"]["students"][0]["studentId"], 1)
        for result in results + [mid]:
            AnalyticsStats.model_validate(result)
            self.assertEqual({key: value for key, value in result.items() if key != "delaySummary"},
                             {key: value for key, value in results[0].items() if key != "delaySummary"})

    def test_unknown_gender_is_in_summary_total_without_guessing_a_section_gender(self):
        student = self.db.get(Student, 1)
        student.gender = None
        student.section_id = None
        self.assessment(1, failed=(6,))
        with patch("backend.utils.dashboard_analytics.calculate_scores", return_value={"interpretation": "Delay"}):
            result = delay_summary(self.db, [Student.is_active.is_(True)], "All")
        self.assertEqual((result.totalDelayed, result.totalMatched, result.male, result.female), (1, 1, 0, 0))
        self.assertEqual(result.model_dump()["bySection"], {
            "Diamond": {"male": 0, "female": 0}, "Emerald": {"male": 0, "female": 0},
            "Unassigned": {"male": 0, "female": 0},
        })

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
        result = get_dashboard_stats("All", "All", self.db, teacher, section_id=2)
        self.assertEqual(result["criticalDomain"]["completedStudents"], 0)
        with patch("backend.utils.dashboard_analytics.calculate_scores", return_value={"interpretation": "Slight Delay"}):
            result = get_dashboard_stats("Diamond", "2026-2027", self.db, self.db.get(User, 1))
        self.assertEqual(result["delaySummary"]["totalDelayed"], 2)
        self.assertEqual(result["delaySummary"]["bySection"], {"Diamond": {"male": 1, "female": 1}})
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

    def test_teacher_period_insights_count_active_section_items_without_period_fallback(self):
        from backend.utils.dashboard_analytics import teacher_period_insights
        self.db.get(Student, 1).first_name = "Ada"
        self.db.get(Student, 1).last_name = "Example"
        self.db.get(Student, 2).first_name = "Ben"
        self.db.get(Student, 2).last_name = "Example"
        self.assessment(1, failed=(6,))
        self.assessment(2, failed=(6,), questions=(1, 6), unconfirmed=(6,))
        for identifier in (3, 4):
            self.assessment(identifier, failed=(1, 2, 3, 4, 5, 6, 7))
        self.assessment(1, "MID", failed=(1,))
        pre = teacher_period_insights(self.db, self.scope, TestingPeriod.PRE)
        self.assertEqual((pre.totalStudents, pre.completedStudents, pre.completionRate), (2, 1, 50))
        self.assertEqual((pre.criticalDomain.domainName, pre.criticalDomain.totalDiKaya), ("Cognitive Domain", 2))
        self.assertEqual((pre.priorityStudent.studentId, pre.priorityStudent.studentName), (1, "Ada Example"))
        self.assertEqual(sum(domain.totalItems for domain in pre.domains), 9)
        mid = teacher_period_insights(self.db, self.scope, TestingPeriod.MID)
        self.assertEqual((mid.criticalDomain.domainId, mid.criticalDomain.totalDiKaya), (1, 1))
        post = teacher_period_insights(self.db, self.scope, TestingPeriod.POST)
        self.assertEqual((post.totalStudents, post.completedStudents, post.domains), (2, 0, []))
        self.assertIsNone(post.excellingDomain)
        self.assertIsNone(post.priorityStudent)

    def test_teacher_period_excellence_uses_ratio_and_deterministic_ties(self):
        from backend.utils.dashboard_analytics import teacher_period_insights
        self.db.add_all([
            EccdQuestion(question_id=8, domain_id=6, question_text="Extra cognitive item", sequence_order=2),
            EccdQuestion(question_id=9, domain_id=6, question_text="Another cognitive item", sequence_order=3),
        ])
        self.db.flush()
        self.assessment(1, failed=(2, 3, 4, 5, 6, 7))
        result = teacher_period_insights(self.db, self.scope, TestingPeriod.PRE)
        self.assertEqual((result.excellingDomain.domainId, result.excellingDomain.masteryRate), (1, 100))
        # All critical counts tie at one: Cognitive wins alphabetically.
        self.assertEqual((result.criticalDomain.domainId, result.criticalDomain.totalDiKaya), (6, 1))
        self.assessment(2, failed=(1, 2, 3, 4, 5, 6, 7, 8, 9))
        result = teacher_period_insights(self.db, self.scope, TestingPeriod.PRE)
        self.assertEqual((result.priorityStudent.studentId, result.priorityStudent.totalDiKaya), (2, 9))

    def test_teacher_period_completion_requires_all_official_dates_and_preserves_zero_mastery(self):
        from backend.utils.dashboard_analytics import teacher_period_insights
        self.assessment(1, failed=(1, 2, 3, 4, 5, 6, 7), unconfirmed=(7,))
        self.assessment(2, questions=(1, 2))
        result = teacher_period_insights(self.db, self.scope, TestingPeriod.PRE)
        self.assertEqual(result.completedStudents, 0)
        cognitive = next(domain for domain in result.domains if domain.domainId == 6)
        self.assertEqual((cognitive.masteryRate, cognitive.totalDiKaya), (0, 1))
        self.db.query(StudentEccdEvaluation).filter_by(student_id=1).update({"teacher_evaluation_date": date(2026, 8, 10)})
        self.db.flush()
        self.assertEqual(teacher_period_insights(self.db, self.scope, TestingPeriod.PRE).completedStudents, 1)

    def test_teacher_period_route_enforces_assignments_even_with_forged_section_and_year(self):
        from backend.routes.analytics import get_dashboard_pie_data, get_dashboard_stats
        from backend.schemas.operations import AnalyticsStats
        user = User(user_id=20, email="scoped@example.test", password_hash="synthetic", role=UserRole.ADMIN)
        self.db.add_all([user, Teacher(teacher_id=20, user_id=20),
                         SectionTeacher(section_id=1, teacher_id=20, role="Primary Adviser", status="Active")])
        self.db.flush()
        for identifier in (1, 2, 3, 4):
            self.assessment(identifier, failed=(6,))
        for section_id, total in ((1, 2), (2, 0)):
            result = AnalyticsStats.model_validate(get_dashboard_stats("All", "2026-2027", self.db, user,
                                                                       section_id=section_id, period=TestingPeriod.PRE))
            self.assertEqual(result.teacherInsights.totalStudents, total)
            self.assertEqual(result.teacherInsights.completedStudents, total)
            self.assertEqual(sum(d.totalDiKaya for d in result.teacherInsights.domains), total)
        pie = get_dashboard_pie_data("All", "All", "PRE", "All", self.db, user, section_id=1)
        result = get_dashboard_stats("All", "All", self.db, user, section_id=1, period=TestingPeriod.PRE)
        self.assertEqual(sum(row["value"] for row in pie), sum(d["totalItems"] for d in result["teacherInsights"]["domains"]))
        self.db.query(SectionTeacher).filter_by(teacher_id=20).update({"status": "Inactive"})
        self.db.flush()
        result = get_dashboard_stats("All", "All", self.db, user, period=TestingPeriod.PRE)
        self.assertEqual(result["teacherInsights"]["totalStudents"], 0)
        self.assertIsNone(result["teacherInsights"]["priorityStudent"])

    def test_teacher_without_profile_gets_typed_empty_period_insights(self):
        from backend.routes.analytics import get_dashboard_stats
        from backend.schemas.operations import AnalyticsStats
        user = User(user_id=21, email="no-profile@example.test", password_hash="synthetic", role=UserRole.ADMIN)
        self.db.add(user)
        self.db.flush()
        result = AnalyticsStats.model_validate(get_dashboard_stats("All", "All", self.db, user, period=TestingPeriod.POST))
        self.assertEqual((result.teacherInsights.period, result.teacherInsights.totalStudents), ("POST", 0))
        self.assertIsNone(result.teacherInsights.criticalDomain)

    def test_teacher_dashboard_http_alias_serializes_insights_and_validates_period(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from backend.config.database import get_db
        from backend.routes.teachers import router
        from backend.utils.deps import get_current_user
        user = User(user_id=22, email="http-teacher@example.test", password_hash="synthetic", role=UserRole.ADMIN)
        self.db.add_all([user, Teacher(teacher_id=22, user_id=22),
                         SectionTeacher(section_id=1, teacher_id=22, role="Primary Adviser", status="Active")])
        self.db.flush()
        self.assessment(1, failed=(6,))
        self.assessment(3, failed=(1, 2, 3, 4, 5, 6, 7))
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: user
        with TestClient(app) as client:
            response = client.get("/api/teachers/dashboard-stats", params={"section_id": 1, "period": "PRE"})
            self.assertEqual(response.status_code, 200, response.text)
            insights = response.json()["teacherInsights"]
            self.assertEqual((insights["period"], insights["totalStudents"], insights["completedStudents"]), ("PRE", 2, 1))
            self.assertEqual(insights["priorityStudent"]["studentId"], 1)
            self.assertEqual(client.get("/api/teachers/dashboard-stats", params={"period": "All"}).status_code, 422)
            response = client.get("/api/teachers/dashboard-stats", params={"section_id": 2, "period": "PRE"})
            self.assertEqual(response.json()["teacherInsights"]["domains"], [])
            self.assertNotIn("teacherInsights", client.get("/api/teachers/dashboard-stats").json())
