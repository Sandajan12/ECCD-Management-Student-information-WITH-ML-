"""Phase 2 HTTP/workbook lifecycles in disposable PostgreSQL schemas."""
from datetime import date, datetime, timezone
from io import BytesIO
import unittest
from unittest.mock import patch

import openpyxl

from backend.models import EccdQuestion, Parent, Section, Student, StudentEccdEvaluation, Teacher
from backend.models.eccd import TestingPeriod
from backend.tests import test_phase2
from backend.utils.eccd_scorer import calculate_decimal_age
from backend.utils.excel import DOMAIN_SHEETS, XLSX, workbook_bytes
from backend.utils.lrn import hash_lrn


class EccdPhase2LifecycleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call, self.sessions = self.fixture.call, self.fixture.sessions
        self.adviser_actor = 2
        with self.sessions() as db:
            teacher = db.get(Teacher, 1)
            teacher.allow_parent_edit_home_based_eccd = True
            for period in ("pre", "mid", "post"):
                setattr(teacher, f"allow_parent_view_eccd_{period}", True)
                setattr(db.get(Section, 1), f"{period}_test_parent_editable", True)
            self.questions = {q.question_id: (q.domain_id, q.sequence_order)
                              for q in db.query(EccdQuestion).all()}
            self.school_questions = [q.question_id for q in db.query(EccdQuestion)
                                     .filter_by(is_home_based=False).order_by(EccdQuestion.question_id)]
            db.commit()

    def parent_save(self, period="PRE", answer="KAYA", when=None):
        when = when or datetime(2026, 8, 20, 12, tzinfo=timezone.utc)
        with patch("backend.utils.assessments.datetime") as clock:
            clock.now.return_value = when
            response = self.call("POST", "/api/eccd/parent/evaluate", 5, json={
                "student_id": 1, "evaluations": [{"question_id": self.fixture.home,
                    "testing_period": period, "answer": answer}]})
        self.assertEqual(response.status_code, 200, response.text)
        return when

    def teacher_save(self, period="PRE", when="2026-08-10", questions=None, actor=2):
        response = self.call("POST", "/api/eccd/evaluate", actor, json={
            "student_id": 1, "period": period, "evaluation_date": when,
            "answers": {str(q): 1 for q in (questions or [self.fixture.home])}})
        self.assertEqual(response.status_code, 200, response.text)

    def rows(self, student_id=1):
        with self.sessions() as db:
            table = StudentEccdEvaluation.__table__
            return [dict(row) for row in db.execute(table.select().where(
                table.c.student_id == student_id).order_by(table.c.evaluation_id)).mappings()]

    def home_row(self, period="PRE"):
        return next(r for r in self.rows() if r["question_id"] == self.fixture.home
                    and r["testing_period"] == period)

    def get_json(self, path, actor=5):
        response = self.call("GET", path, actor)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def teacher_home_question(self):
        assessment = self.get_json("/api/eccd/assessment/1", actor=self.adviser_actor)
        return next(question for domain in assessment["domains"] for question in domain["questions"]
                    if question["question_id"] == self.fixture.home)

    def workbook(self, path, actor):
        response = self.call("GET", path, actor)
        self.assertEqual(response.status_code, 200, response.text if response.status_code != 200 else "")
        workbook = openpyxl.load_workbook(BytesIO(response.content))
        self.addCleanup(workbook.close)
        return workbook

    def assert_export_date(self, expected, period="PRE"):
        index = list(TestingPeriod).index(TestingPeriod(period))
        # Both teacher and chairman paths must agree after every transition.
        for actor in (1, self.adviser_actor):
            checklist = self.workbook("/api/teachers/download/1", actor)["CHECKLIST"]
            self.assertEqual(checklist[f"M{index + 3}"].value,
                             expected.strftime("%m/%d/%Y") if expected else None)
            self.assertEqual(checklist["W10"].value, test_phase2.LRN)
            if expected is None:
                self.assertIsNone(checklist[f"Q{index + 3}"].value)
                self.assertIsNone(checklist[f"{('N', 'P', 'R')[index]}17"].value)
        for path, actor in (("/api/eccd/section/1/export", self.adviser_actor),
                            ("/api/chairman/sections/1/export-summary", 1)):
            sheet = self.workbook(path, actor)[("PR", "M", "PO")[index]]
            actual = sheet["I14"].value
            self.assertEqual(actual.date() if actual else None, expected)
            self.assertEqual(sheet["C14"].value, test_phase2.LRN)
            if expected is None:
                for column in range(10, 28):
                    self.assertIsNone(sheet.cell(14, column).value)
            else:
                self.assertEqual(sheet["J14"].value, calculate_decimal_age(date(2021, 1, 10), expected))
                self.assertIsNotNone(sheet["Z14"].value)

    def import_row(self, *, name="Student, Test, Middle", lrn=test_phase2.LRN,
                   dates=None, marks=None, father=None, mother=None):
        return {"name": name, "lrn": lrn, "dates": dates or {"PRE": date(2026, 8, 10)},
                "marks": marks if marks is not None else {(self.fixture.nonhome, "PRE"): "KAYA"},
                "father": father, "mother": mother}

    def import_workbook(self, students, actor=2):
        workbook = openpyxl.Workbook()
        self.addCleanup(workbook.close)
        info = workbook.active
        info.title = "Info Sheet"
        info.append(["Test A"])
        info.append(["Headers"])
        for student in students:
            row = [None] * 27
            row[1], row[5] = student["name"], student["lrn"]
            row[7], row[8], row[9] = "BABAE", "KANAN", date(2021, 1, 10)
            for period, column in (("PRE", 10), ("MID", 12), ("POST", 14)):
                row[column] = student["dates"].get(period)
            row[17], row[21] = student["father"], student["mother"]
            info.append(row)
            domain_rows = {}
            for (question_id, period), answer in student["marks"].items():
                domain, sequence = self.questions[question_id]
                column = 2 + (sequence - 1) * 6 + list(TestingPeriod).index(TestingPeriod(period)) * 2
                if answer == "DI-KAYA":
                    column += 1
                values = domain_rows.setdefault(DOMAIN_SHEETS[domain], [None, student["name"]])
                values.extend([None] * max(0, column + 1 - len(values)))
                values[column] = 1
            for name, values in domain_rows.items():
                sheet = workbook[name] if name in workbook.sheetnames else workbook.create_sheet(name)
                sheet.append(values)
        response = self.call("POST", "/api/teachers/import-students", actor,
                             files={"file": ("assessments.xlsx", workbook_bytes(workbook), XLSX)})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_parent_teacher_parent_teacher_transition_preserves_both_histories(self):
        submitted = self.parent_save()
        row = self.home_row()
        self.assertEqual((row["evaluator_role"], row["parent_id"], row["parent_submitted_at"]),
                         ("parent", 1, submitted))
        self.assertIsNone(row["teacher_id"])
        self.assertIsNone(row["teacher_evaluation_date"])
        self.assertEqual(self.teacher_home_question()["evaluator_roles"],
                         {"PRE": "parent", "MID": None, "POST": None})
        preview = self.get_json("/api/eccd/parent/assessment/1")
        self.assertIsNone(preview["periodDates"]["PRE"])
        self.assertEqual(preview["gradingDates"]["PRE"], "2026-08-20")
        self.assertEqual(preview["summary"]["PRE"]["decimalAge"],
                         calculate_decimal_age(date(2021, 1, 10), submitted.date()))
        self.assertIsNotNone(preview["summary"]["PRE"]["standardScore"])
        self.assert_export_date(None)

        # Confirm the home observation while assessing the remaining school items.
        self.teacher_save(questions=[self.fixture.home, *self.school_questions])
        row = self.home_row()
        self.assertEqual((row["evaluator_role"], row["teacher_id"], row["teacher_evaluation_date"]),
                         ("teacher", 1, date(2026, 8, 10)))
        self.assertEqual((row["parent_id"], row["parent_submitted_at"]), (1, submitted))
        self.assertEqual(self.teacher_home_question()["evaluator_roles"]["PRE"], "teacher")
        self.assertTrue(all(r["teacher_evaluation_date"] == date(2026, 8, 10) for r in self.rows()))
        self.assert_export_date(date(2026, 8, 10))

        school_before = [r for r in self.rows() if r["question_id"] != self.fixture.home]
        corrected = self.parent_save(answer="DI-KAYA", when=datetime(2026, 8, 30, 12, tzinfo=timezone.utc))
        row = self.home_row()
        self.assertEqual((row["evaluator_role"], row["answer"], row["parent_submitted_at"]),
                         ("parent", "DI-KAYA", corrected))
        self.assertGreater(corrected, submitted)
        self.assertEqual(self.teacher_home_question()["evaluator_roles"]["PRE"], "parent")
        self.assertEqual((row["teacher_id"], row["teacher_evaluation_date"], row["evaluation_date"]),
                         (1, date(2026, 8, 10), date(2026, 8, 10)))
        self.assertEqual(school_before, [r for r in self.rows() if r["question_id"] != self.fixture.home])
        preview = self.get_json("/api/eccd/parent/assessment/1")
        self.assertEqual(preview["periodDates"]["PRE"], "2026-08-10")
        self.assertEqual(preview["gradingDates"]["PRE"], "2026-08-10")
        self.assert_export_date(date(2026, 8, 10))

        self.assertEqual(self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 3}).status_code, 200)
        self.adviser_actor = 4
        self.teacher_save(when="2026-08-11", actor=4)
        row = self.home_row()
        self.assertEqual((row["evaluator_role"], row["teacher_id"]), ("teacher", 3))
        self.assertEqual((row["parent_id"], row["parent_submitted_at"]), (1, corrected))
        self.assertEqual(self.teacher_home_question()["evaluator_roles"]["PRE"], "teacher")
        self.assert_export_date(date(2026, 8, 11))

    def test_teacher_payload_exposes_home_flags_roles_and_independent_date_maps(self):
        empty = self.get_json("/api/eccd/assessment/1", actor=2)
        for field in ("periodDates", "evaluationDates", "gradingDates"):
            self.assertEqual(empty[field], {"PRE": None, "MID": None, "POST": None})
        for domain in empty["domains"]:
            for question in domain["questions"]:
                self.assertIsInstance(question["is_home_based"], bool)
                self.assertEqual(question["evaluator_roles"], {"PRE": None, "MID": None, "POST": None})

        # Historical NULL flags are school-based; no evaluation role is inferred.
        with self.sessions() as db:
            db.get(EccdQuestion, self.fixture.nonhome).is_home_based = None
            db.commit()
        self.parent_save("PRE")
        self.parent_save("MID")
        self.teacher_save("MID", "2026-09-10")
        self.teacher_save("POST", "2026-10-10", questions=[self.fixture.nonhome])
        assessment = self.get_json("/api/eccd/assessment/1", actor=2)
        questions = {q["question_id"]: q for d in assessment["domains"] for q in d["questions"]}
        home, school = questions[self.fixture.home], questions[self.fixture.nonhome]
        self.assertIs(home["is_home_based"], True)
        self.assertIs(school["is_home_based"], False)
        self.assertEqual(home["evaluator_roles"], {"PRE": "parent", "MID": "teacher", "POST": None})
        self.assertEqual(home["answers"], {"PRE": "KAYA", "MID": "KAYA", "POST": None})
        self.assertEqual(school["evaluator_roles"], {"PRE": None, "MID": None, "POST": "teacher"})
        self.assertEqual(assessment["periodDates"], {"PRE": None, "MID": "2026-09-10", "POST": "2026-10-10"})
        self.assertEqual(assessment["evaluationDates"], assessment["periodDates"])
        self.assertEqual(assessment["gradingDates"], {"PRE": "2026-08-20", "MID": "2026-09-10", "POST": "2026-10-10"})
        for ages in assessment["evalAges"].values():
            self.assertEqual(ages["PRE"], calculate_decimal_age(date(2021, 1, 10), date(2026, 8, 20)))

    def test_shared_checklist_schema_masks_teacher_marks_but_keeps_own_editable_home_answers(self):
        self.parent_save("PRE")
        self.teacher_save("MID", "2026-09-10")
        with self.sessions() as db:
            teacher = db.get(Teacher, 1)
            teacher.allow_parent_view_eccd_pre = False
            teacher.allow_parent_view_eccd_mid = False
            db.commit()
        parent = self.get_json("/api/eccd/parent/assessment/1")
        for question in parent["homeBasedChecklist"]:
            self.assertIs(question["is_home_based"], True)
            own = question["question_id"] == self.fixture.home
            self.assertEqual(question["evaluator_roles"], {"PRE": "parent" if own else None, "MID": None, "POST": None})
            self.assertEqual(question["answers"], {"PRE": "KAYA" if own else None, "MID": None, "POST": None})
        for domain in parent["domains"]:
            for question in domain["questions"]:
                own = question["question_id"] == self.fixture.home
                self.assertEqual(question["evaluator_roles"], {"PRE": "parent" if own else None, "MID": None, "POST": None})
        self.assertEqual(parent["gradingDates"], {"PRE": None, "MID": None, "POST": None})
        self.assertEqual(self.teacher_home_question()["evaluator_roles"],
                         {"PRE": "parent", "MID": "teacher", "POST": None})

    def test_parent_only_mid_does_not_block_earlier_teacher_pre(self):
        self.parent_save("MID", when=datetime(2026, 10, 1, tzinfo=timezone.utc))
        before = self.home_row("MID")
        self.teacher_save(questions=[self.fixture.nonhome])
        self.assertEqual(self.home_row("MID"), before)
        summary = self.get_json("/api/eccd/parent/assessment/1")
        self.assertEqual(summary["periodDates"]["PRE"], "2026-08-10")
        self.assertIsNone(summary["periodDates"]["MID"])
        self.assertEqual(summary["gradingDates"]["MID"], "2026-10-01")
        self.assert_export_date(date(2026, 8, 10))
        self.assert_export_date(None, "MID")

    def test_import_stamps_acting_teacher_and_preserves_parent_metadata_in_all_periods(self):
        for period in TestingPeriod:
            self.parent_save(period)
        parent_before = {r["testing_period"]: (r["parent_id"], r["parent_submitted_at"]) for r in self.rows()}
        dates = {"PRE": date(2026, 8, 10), "MID": date(2026, 9, 10), "POST": date(2026, 10, 10)}
        marks = {(question, period): "DI-KAYA" for question in (self.fixture.home, *self.school_questions[:2])
                 for period in dates}
        student = self.import_row(dates=dates, marks=marks)
        self.assertEqual(self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 3}).status_code, 200)
        self.adviser_actor = 4
        for _ in range(2):
            self.assertEqual(self.import_workbook([student], actor=4),
                             {"successCount": 1, "failedCount": 0, "errors": []})
        self.assertEqual(len(self.rows()), 9)
        for row in self.rows():
            self.assertEqual((row["answer"], row["evaluator_role"], row["teacher_id"]), ("DI-KAYA", "teacher", 3))
            self.assertEqual(row["teacher_evaluation_date"], dates[row["testing_period"]])
            self.assertEqual(row["evaluation_date"], dates[row["testing_period"]])
            if row["question_id"] == self.fixture.home:
                self.assertEqual((row["parent_id"], row["parent_submitted_at"]), parent_before[row["testing_period"]])
            else:
                self.assertIsNone(row["parent_id"])
                self.assertIsNone(row["parent_submitted_at"])
        for period, when in dates.items():
            self.assert_export_date(when, period)

    def test_import_normalizes_only_teacher_dated_rows_in_marked_periods(self):
        self.parent_save()
        self.parent_save("MID")
        parent_before = self.rows()
        first, unmarked = self.school_questions[:2]
        timestamp = datetime(2026, 8, 5, tzinfo=timezone.utc)
        with self.sessions() as db:
            for question, day in ((first, 1), (unmarked, 2)):
                db.add(StudentEccdEvaluation(student_id=1, question_id=question, testing_period="PRE",
                    answer="DI-KAYA", teacher_id=3, evaluator_role="parent", parent_id=1,
                    parent_submitted_at=timestamp, teacher_evaluation_date=date(2026, 8, day),
                    evaluation_date=date(2026, 8, day)))
            db.commit()
        # An unmarked MID date is not a request to change that period.
        result = self.import_workbook([self.import_row(
            dates={"PRE": date(2026, 8, 10), "MID": date(2026, 7, 1)}, marks={(first, "PRE"): "KAYA"})])
        self.assertEqual(result["failedCount"], 0, result)
        after = self.rows()
        self.assertEqual(parent_before, [r for r in after if r["question_id"] == self.fixture.home])
        row = next(r for r in after if r["question_id"] == unmarked)
        self.assertEqual((row["evaluation_date"], row["teacher_evaluation_date"]), (date(2026, 8, 10),) * 2)
        self.assertEqual((row["answer"], row["evaluator_role"], row["teacher_id"]), ("DI-KAYA", "parent", 3))
        self.assertEqual((row["parent_id"], row["parent_submitted_at"]), (1, timestamp))
        self.assert_export_date(date(2026, 8, 10))

    def test_import_validates_final_state_when_multiple_teacher_periods_move_together(self):
        for period, when in (("PRE", "2026-08-01"), ("MID", "2026-09-01"), ("POST", "2026-10-01")):
            self.teacher_save(period, when, questions=self.school_questions[:2])
        dates = {"PRE": date(2026, 11, 1), "MID": date(2026, 12, 1), "POST": date(2027, 1, 1)}
        result = self.import_workbook([self.import_row(dates=dates,
            marks={(self.school_questions[0], period): "KAYA" for period in dates})])
        self.assertEqual(result, {"successCount": 1, "failedCount": 0, "errors": []})
        for row in self.rows():
            self.assertEqual(row["teacher_evaluation_date"], dates[row["testing_period"]])
            self.assertEqual(row["evaluation_date"], dates[row["testing_period"]])

    def test_scrambled_import_rolls_back_entire_student_and_commits_valid_neighbors(self):
        self.parent_save()
        self.teacher_save(questions=[self.fixture.nonhome])
        before = self.rows()
        with self.sessions() as db:
            student_before = dict(db.execute(Student.__table__.select().where(Student.student_id == 1)).mappings().one())
            parents_before = [dict(r) for r in db.execute(Parent.__table__.select().order_by(Parent.parent_id)).mappings()]
        scrambled = {"PRE": date(2026, 10, 10), "MID": date(2026, 9, 10), "POST": date(2026, 11, 10)}
        marks = {(q, p): "DI-KAYA" for q in (self.fixture.home, self.fixture.nonhome) for p in scrambled}
        rows = [
            self.import_row(name="Alpha, Valid", lrn="001555555555", father="Valid Father"),
            self.import_row(name="Changed, Learner, Middle", dates=scrambled, marks=marks,
                            father="Rolled Back Father", mother="Changed Mother"),
            self.import_row(name="Invalid, New", lrn="001666666666", dates=scrambled, marks=marks,
                            father="Invalid Father"),
            self.import_row(name="Omega, Valid", lrn="001777777777", father="Other Valid Father"),
        ]
        result = self.import_workbook(rows)
        self.assertEqual((result["successCount"], result["failedCount"]), (2, 2), result)
        self.assertEqual([e["row"] for e in result["errors"]], [4, 5])
        for error in result["errors"]:
            self.assertIn("PRE < MID < POST", error["error"])
            self.assertIn("teacher date", error["error"])
            self.assertIn("No changes saved for this student", error["error"])
        self.assertEqual(self.rows(), before)
        with self.sessions() as db:
            self.assertEqual(dict(db.execute(Student.__table__.select().where(Student.student_id == 1)).mappings().one()), student_before)
            for old in parents_before:
                self.assertEqual(dict(db.execute(Parent.__table__.select().where(Parent.parent_id == old["parent_id"])).mappings().one()), old)
            self.assertIsNone(db.query(Student).filter_by(lrn_search_hash=hash_lrn("001666666666")).first())
            self.assertEqual(db.query(Parent).filter(Parent.fullname.in_(["Rolled Back Father", "Invalid Father", "Changed Mother"])).count(), 0)
            for lrn in ("001555555555", "001777777777"):
                student = db.query(Student).filter_by(lrn_search_hash=hash_lrn(lrn)).one()
                self.assertNotEqual(student.lrn_encrypted, lrn)
                evaluation = db.query(StudentEccdEvaluation).filter_by(student_id=student.student_id).one()
                self.assertEqual((evaluation.evaluator_role, evaluation.teacher_id), ("teacher", 1))
                self.assertEqual(evaluation.teacher_evaluation_date, date(2026, 8, 10))

    def test_import_checks_all_existing_teacher_dates_even_after_parent_correction(self):
        with self.sessions() as db:
            for question, period, when in ((self.school_questions[0], "PRE", date(2026, 8, 10)),
                                           (self.school_questions[1], "PRE", date(2026, 9, 20)),
                                           (self.school_questions[0], "POST", date(2026, 11, 10))):
                db.add(StudentEccdEvaluation(student_id=1, question_id=question, testing_period=period,
                    answer="KAYA", teacher_id=1, evaluator_role="parent", parent_id=1,
                    teacher_evaluation_date=when, evaluation_date=date(2020, 1, 1),
                    parent_submitted_at=datetime(2026, 12, 1, tzinfo=timezone.utc)))
            db.commit()
        before = self.rows()
        for period, when in (("MID", date(2026, 9, 15)), ("MID", date(2026, 11, 10)),
                             ("PRE", date(2026, 11, 11)), ("POST", date(2026, 9, 20))):
            with self.subTest(period=period, when=when):
                result = self.import_workbook([self.import_row(
                    dates={"PRE": date(2026, 8, 10), period: when},
                    marks={(self.fixture.home, period): "DI-KAYA"})])
                self.assertEqual((result["successCount"], result["failedCount"]), (0, 1), result)
                self.assertIn("PRE < MID < POST", result["errors"][0]["error"])
                self.assertEqual(self.rows(), before)

    def test_import_rejects_equal_dates_and_nonadjacent_reversed_periods(self):
        for dates in ({"PRE": date(2026, 8, 10), "MID": date(2026, 8, 10)},
                      {"PRE": date(2026, 8, 10), "MID": date(2026, 9, 10), "POST": date(2026, 9, 10)},
                      {"PRE": date(2026, 10, 10), "POST": date(2026, 8, 10)}):
            with self.subTest(dates=dates):
                result = self.import_workbook([self.import_row(dates=dates,
                    marks={(self.fixture.nonhome, period): "KAYA" for period in dates})])
                self.assertEqual((result["successCount"], result["failedCount"]), (0, 1), result)
                self.assertIn("PRE < MID < POST", result["errors"][0]["error"])
                self.assertEqual(self.rows(), [])


if __name__ == "__main__":
    unittest.main()
