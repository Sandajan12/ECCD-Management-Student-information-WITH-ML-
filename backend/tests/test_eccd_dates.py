"""Official-date and preview-grade regressions, using disposable DB schemas."""
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
import unittest

import openpyxl

from backend.models import EccdQuestion, Student, StudentEccdEvaluation, Teacher
from backend.models.eccd import TestingPeriod
from backend.tests import test_phase2
from backend.utils.checklist_workbook import get_mapping
from backend.utils.eccd_dates import get_grading_date, get_official_testing_date
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores


class DateResolverTests(unittest.TestCase):
    def test_empty_and_other_period_records_have_no_dates(self):
        for records in ([], [{"testing_period": "MID", "teacher_evaluation_date": date(2026, 8, 10)}]):
            self.assertIsNone(get_official_testing_date(records, "PRE"))
            self.assertIsNone(get_grading_date(records, "PRE"))

    def test_earliest_teacher_date_wins_even_after_parent_correction(self):
        records = [
            {"testing_period": TestingPeriod.PRE, "teacher_evaluation_date": date(2026, 8, 12)},
            {"testing_period": "PRE", "evaluator_role": "parent", "teacher_evaluation_date": date(2026, 8, 10),
             "parent_submitted_at": datetime(2025, 1, 1, tzinfo=timezone.utc)},
            {"testing_period": "MID", "teacher_evaluation_date": date(2024, 1, 1)},
        ]
        self.assertEqual(get_official_testing_date(records, "PRE"), date(2026, 8, 10))
        self.assertEqual(get_grading_date(iter(records), "PRE"), date(2026, 8, 10))

    def test_parent_timestamp_never_confirms_official_date(self):
        records = [{"testing_period": "PRE", "evaluator_role": "parent",
                    "parent_submitted_at": datetime(2026, 8, 10, tzinfo=timezone.utc),
                    "evaluation_date": date(2020, 1, 1)}]
        self.assertIsNone(get_official_testing_date(records, "PRE"))
        self.assertEqual(get_grading_date(records, "PRE"), date(2026, 8, 10))

    def test_timestamp_uses_utc_calendar_day(self):
        records = [{"testing_period": "PRE", "parent_submitted_at": datetime(
            2026, 8, 11, 1, tzinfo=timezone(timedelta(hours=8)))}]
        self.assertEqual(get_grading_date(records, "PRE"), date(2026, 8, 10))

    def test_historical_compatibility_dates_only_enable_preview(self):
        records = [
            {"testing_period": "PRE", "evaluator_role": "teacher", "evaluation_date": date(2026, 8, 12)},
            {"testing_period": "PRE", "evaluator_role": "parent", "evaluation_date": date(2026, 8, 10)},
            {"testing_period": "PRE", "evaluation_date": None},
        ]
        self.assertIsNone(get_official_testing_date(records, "PRE"))
        self.assertEqual(get_grading_date(records, "PRE"), date(2026, 8, 10))

    def test_undated_records_do_not_invent_today_or_a_teacher_date(self):
        records = [{"testing_period": "PRE", "evaluator_role": "parent"}]
        self.assertIsNone(get_official_testing_date(records, "PRE"))
        self.assertIsNone(get_grading_date(records, "PRE"))


class DateConsumerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call, self.sessions = self.fixture.call, self.fixture.sessions
        with self.sessions() as db:
            teacher = db.get(Teacher, 1)
            for period in ("pre", "mid", "post"):
                setattr(teacher, f"allow_parent_view_eccd_{period}", True)
            # Dates from domains outside the parent's home-only checklist count too.
            self.school_questions = [db.query(EccdQuestion).filter_by(
                domain_id=domain, is_home_based=False).first().question_id for domain in (1, 2)]
            db.commit()

    def add_parent_observations(self):
        with self.sessions() as db:
            for period in TestingPeriod:
                db.add(StudentEccdEvaluation(
                    student_id=1, question_id=self.fixture.home, testing_period=period,
                    answer="KAYA", evaluator_role="parent", parent_id=1,
                    evaluation_date=date(2020, 1, 1),
                    parent_submitted_at=datetime(2026, 8, 10, 12, tzinfo=timezone.utc)))
            db.commit()

    def add_teacher_sessions(self):
        self.add_parent_observations()
        with self.sessions() as db:
            for period, month in (("PRE", 2), ("MID", 4), ("POST", 6)):
                for question_id, day in zip(self.school_questions, (12, 10)):
                    db.add(StudentEccdEvaluation(
                        student_id=1, question_id=question_id, testing_period=period,
                        answer="KAYA", teacher_id=1, teacher_evaluation_date=date(2026, month, day),
                        # Compatibility dates deliberately disagree with teacher dates.
                        evaluation_date=date(2024, 1, day), evaluator_role="parent",
                        parent_id=1, parent_submitted_at=datetime(2026, 9, 1, tzinfo=timezone.utc)))
            db.commit()

    def get_json(self, path, actor):
        response = self.call("GET", path, actor)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def workbook(self, path, actor):
        response = self.call("GET", path, actor)
        self.assertEqual(response.status_code, 200, response.text[:200] if response.status_code != 200 else "")
        workbook = openpyxl.load_workbook(BytesIO(response.content))
        self.addCleanup(workbook.close)
        return workbook

    def test_parent_only_previews_grade_without_official_dates(self):
        self.add_parent_observations()
        expected_age = calculate_decimal_age(date(2021, 1, 10), date(2026, 8, 10))
        for path, actor in (("/api/eccd/assessment/1", 2), ("/api/eccd/parent/assessment/1", 5)):
            data = self.get_json(path, actor)
            for period in ("PRE", "MID", "POST"):
                self.assertIsNone(data["periodDates"][period])
                self.assertIsNone(data["evaluationDates"][period])
                self.assertEqual(data["gradingDates"][period], "2026-08-10")
                for ages in data["evalAges"].values():
                    self.assertEqual(ages[period], expected_age)
                if actor == 5:
                    self.assertIsNone(data["summary"][period]["assessmentDate"])
                    self.assertIsNotNone(data["summary"][period]["standardScore"])
        for actor in (1, 2):
            data = self.get_json("/api/eccd/section/1/summary?testing_period=PRE", actor)[0]
            self.assertIsNone(data["evaluation_date"])
            self.assertEqual(data["decimal_age"], expected_age)
            self.assertEqual(data["scores"]["bracket"], "AGE 5.1 - 5.11")
            self.assertNotEqual(data["student_lrn"], test_phase2.LRN)
        summary = self.get_json("/api/parents/children/1/eccd-summary", 5)
        for period in ("PRE", "MID", "POST"):
            self.assertIsNone(summary["periods"][period]["evaluation_date"])
            self.assertEqual(summary["periods"][period]["decimal_age"], expected_age)
            self.assertIsNotNone(summary["periods"][period]["standard_score"])

    def test_all_live_readers_use_earliest_teacher_date_across_domains(self):
        self.add_teacher_sessions()
        for period, month in (("PRE", 2), ("MID", 4), ("POST", 6)):
            expected_date = date(2026, month, 10)
            expected_age = calculate_decimal_age(date(2021, 1, 10), expected_date)
            for path, actor in (("/api/eccd/assessment/1", 2), ("/api/eccd/parent/assessment/1", 5)):
                data = self.get_json(path, actor)
                self.assertEqual(data["periodDates"][period], expected_date.isoformat())
                self.assertEqual(data["gradingDates"][period], expected_date.isoformat())
                for ages in data["evalAges"].values():
                    self.assertEqual(ages[period], expected_age)
            section = self.get_json(f"/api/eccd/section/1/summary?testing_period={period}", 2)[0]
            parent = self.get_json("/api/parents/children/1/eccd-summary", 5)["periods"][period]
            for summary in (section, parent):
                self.assertEqual(summary["evaluation_date"], expected_date.isoformat())
                self.assertEqual(summary["decimal_age"], expected_age)
            self.assertEqual(section["scores"]["standard_score"], parent["standard_score"])

    def test_parent_only_exports_keep_marks_but_official_cells_blank(self):
        self.add_parent_observations()
        for actor in (1, 2):
            checklist = self.workbook("/api/teachers/download/1", actor)["CHECKLIST"]
            self.assertEqual(checklist["W10"].value, test_phase2.LRN)
            with self.sessions() as db:
                question = db.get(EccdQuestion, self.fixture.home)
                mapping = get_mapping(question.domain_id, question.sequence_order)
            for index, period in enumerate(("PRE", "MID", "POST")):
                self.assertIsNotNone(checklist[f"{mapping[period][0]}{mapping['row']}"].value)
                for coordinate in (f"M{index+3}", f"Q{index+3}", f"R{index+3}", f"S{index+3}",
                                   f"Y{index+14}", f"M{index+20}"):
                    self.assertIsNone(checklist[coordinate].value, coordinate)
                for column in (("N", "O"), ("P", "Q"), ("R", "S"))[index]:
                    for row in range(9, 18):
                        self.assertIsNone(checklist[f"{column}{row}"].value)
        for path, actor in (("/api/eccd/section/1/export", 2), ("/api/chairman/sections/1/export-summary", 1)):
            workbook = self.workbook(path, actor)
            for name in ("PR", "M", "PO"):
                sheet = workbook[name]
                self.assertEqual(sheet["C14"].value, test_phase2.LRN)
                self.assertIsNone(sheet["U8"].value)
                for column in range(9, 28):
                    self.assertIsNone(sheet.cell(14, column).value)

    def test_confirmed_export_dates_ages_and_scores_agree_with_previews(self):
        self.add_teacher_sessions()
        checklist = self.workbook("/api/teachers/download/1", 2)["CHECKLIST"]
        matrix = self.workbook("/api/chairman/sections/1/export-summary", 1)
        for index, (period, name, month) in enumerate((("PRE", "PR", 2), ("MID", "M", 4), ("POST", "PO", 6))):
            expected_date = date(2026, month, 10)
            expected_age = calculate_decimal_age(date(2021, 1, 10), expected_date)
            with self.sessions() as db:
                records = db.query(StudentEccdEvaluation).filter_by(student_id=1, testing_period=period).all()
                expected = calculate_scores([{"domain_id": r.question.domain_id, "answer": r.answer.value} for r in records], expected_age)
            self.assertEqual(checklist[f"M{index+3}"].value, expected_date.strftime("%m/%d/%Y"))
            self.assertEqual(checklist[f"Q{index+3}"].value, 5)
            self.assertEqual(checklist[f"R{index+3}"].value, month - 1)
            self.assertEqual(checklist[f"{('N', 'P', 'R')[index]}17"].value, expected["standard_score"])
            sheet = matrix[name]
            self.assertEqual(sheet["I14"].value.date(), expected_date)
            self.assertEqual(sheet["U8"].value.date(), expected_date)
            self.assertEqual(sheet["J14"].value, expected_age)
            self.assertEqual(sheet["Y14"].value, expected["sum_of_scaled_scores"])
            self.assertEqual(sheet["Z14"].value, expected["standard_score"])

    def test_unreleased_parent_views_mask_official_and_grading_dates(self):
        self.add_teacher_sessions()
        with self.sessions() as db:
            teacher = db.get(Teacher, 1)
            for period in ("pre", "mid", "post"):
                setattr(teacher, f"allow_parent_view_eccd_{period}", False)
            db.commit()
        assessment = self.get_json("/api/eccd/parent/assessment/1", 5)
        summary = self.get_json("/api/parents/children/1/eccd-summary", 5)
        for period in ("PRE", "MID", "POST"):
            for field in ("periodDates", "evaluationDates", "gradingDates"):
                self.assertIsNone(assessment[field][period])
            for ages in assessment["evalAges"].values():
                self.assertIsNone(ages[period])
            for card in (assessment["summary"][period], summary["periods"][period]):
                self.assertFalse(card["is_published"])
                self.assertEqual(card["interpretation"], "Pending Adviser Release")
            self.assertIsNone(summary["periods"][period]["decimal_age"])
            self.assertIsNone(assessment["summary"][period]["standardScore"])

    def test_missing_birth_date_preserves_official_date_without_fabricated_age(self):
        self.add_teacher_sessions()
        with self.sessions() as db:
            db.get(Student, 1).date_of_birth = None
            db.commit()
        for summary in (self.get_json("/api/eccd/section/1/summary?testing_period=PRE", 2)[0],
                        self.get_json("/api/parents/children/1/eccd-summary", 5)["periods"]["PRE"]):
            self.assertEqual(summary["evaluation_date"], "2026-02-10")
            self.assertIsNone(summary["decimal_age"])
        matrix = self.workbook("/api/chairman/sections/1/export-summary", 1)["PR"]
        self.assertEqual(matrix["I14"].value.date(), date(2026, 2, 10))
        self.assertIsNone(matrix["J14"].value)
        self.assertIsNone(matrix["Z14"].value)


if __name__ == "__main__":
    unittest.main()
