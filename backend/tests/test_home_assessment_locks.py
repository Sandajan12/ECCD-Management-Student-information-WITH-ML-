"""Immutable home submissions and independently dated teacher corrections."""
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
import importlib
import json
import unittest
from unittest.mock import patch

import openpyxl
from sqlalchemy import inspect, text

from backend.models import EccdQuestion, FamilyAccess, Section, StudentEccdEvaluation, Teacher
from backend.migrations.teacher_marked_at import apply_teacher_marked_at, check_teacher_marked_at
from backend.migrations.parity_batch1 import apply_batch1
from backend.migrations.parity_batch2 import apply_batch2
from backend.tests import test_phase2
from backend.tests.assessment_fixtures import complete_period
from backend.utils.backups import cipher, export_backup, restore_backup
from backend.utils.checklist_workbook import get_mapping

PHT = timezone(timedelta(hours=8))
FIRST = datetime(2026, 11, 4, 23, 59, tzinfo=PHT)
SECOND = datetime(2026, 11, 5, 0, 1, tzinfo=PHT)


class HomeAssessmentLockTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call, self.sessions = self.fixture.call, self.fixture.sessions
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_edit_home_based_eccd = True
            db.get(Teacher, 1).allow_parent_view_eccd_pre = True
            section = db.get(Section, 1)
            section.mid_test_parent_editable = section.post_test_parent_editable = True
            db.add(FamilyAccess(parent_id=2, student_id=1, status="SYNCED"))
            self.questions = [q.question_id for q in db.query(EccdQuestion)
                              .filter_by(is_home_based=True).order_by(EccdQuestion.question_id).limit(4)]
            db.commit()

    def parent_save(self, answers, when=FIRST, actor=5, period="PRE"):
        with patch("backend.utils.assessments.now_pht", return_value=when):
            return self.call("POST", "/api/eccd/parent/evaluate", actor, json={
                "student_id": 1, "testing_period": period,
                "evaluations": [{"question_id": q, "testing_period": period, "answer": a}
                                for q, a in answers.items()]})

    def teacher_save(self, answers, when=SECOND, edited=(), official="2026-11-04", period="PRE"):
        with patch("backend.utils.assessments.now_pht", return_value=when):
            return self.call("POST", "/api/eccd/evaluate", 2, json={
                "student_id": 1, "testing_period": period, "assessment_date": official,
                "edited_question_ids": list(edited), "answers": answers})

    def rows(self):
        with self.sessions() as db:
            return {(r["question_id"], r["testing_period"].value): dict(r)
                    for r in db.execute(StudentEccdEvaluation.__table__.select()).mappings()}

    def prerequisites(self):
        with self.sessions() as db:
            complete_period(db, provisional_home=True)
            complete_period(db, period="MID", when=date(2026, 10, 1), provisional_home=True)

    def question_data(self, actor):
        data = self.call("GET", "/api/eccd/assessment/1" if actor == 2 else "/api/eccd/parent/assessment/1", actor).json()
        return {q["question_id"]: q for d in data["domains"] for q in d["questions"]}

    def test_separate_batches_midnight_and_retries_preserve_dates_and_owner(self):
        first = dict.fromkeys(self.questions[:2], "KAYA")
        later = dict.fromkeys(self.questions[2:], "DI-KAYA")
        self.assertEqual(self.parent_save(first).status_code, 200)
        before = self.rows()
        self.assertEqual(self.parent_save({**first, **later}, when=SECOND, actor=6).status_code, 200)
        rows = self.rows()
        for q in first:
            self.assertEqual(rows[q, "PRE"], before[q, "PRE"])
        for q in later:
            self.assertEqual(rows[q, "PRE"]["parent_submitted_at"], SECOND)
            self.assertEqual(rows[q, "PRE"]["evaluation_date"], date(2026, 11, 5))
            self.assertEqual(rows[q, "PRE"]["parent_id"], 2)
        self.assertEqual(self.parent_save({**first, **later}, when=SECOND, actor=5).status_code, 200)
        self.assertEqual(self.rows(), rows)
        data = self.call("GET", "/api/eccd/assessment/1", 2).json()
        self.assertEqual(data["gradingDates"]["PRE"], "2026-11-04")
        self.assertIsNone(data["periodDates"]["PRE"])

    def test_linked_parent_conflict_rejects_entire_batch_and_later_downgrades(self):
        q, new = self.questions[:2]
        self.assertEqual(self.parent_save({q: "KAYA"}).status_code, 200)
        before = self.rows()
        response = self.parent_save({new: "KAYA", q: "DI-KAYA"}, when=SECOND, actor=6)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.rows(), before)
        for period in ("MID", "POST"):
            self.assertEqual(self.parent_save({q: "DI-KAYA"}, period=period).status_code, 400)
            self.assertEqual(self.rows()[q, "PRE"], before[q, "PRE"])

    def test_teacher_pre_and_mid_lock_each_question_without_checklist_completion(self):
        for source, targets, official in (("PRE", ("MID", "POST"), "2026-09-01"), ("MID", ("POST",), "2026-10-01")):
            q = self.questions[0 if source == "PRE" else 1]
            answers = {q: "KAYA"}
            if source == "PRE":
                answers[self.fixture.nonhome] = "KAYA"
            response = self.teacher_save(answers, period=source, official=official)
            self.assertEqual(response.status_code, 200, response.text)
            if source == "PRE":
                self.assertEqual(self.parent_save({q: "KAYA"}, period="MID").status_code, 200)
            self.prerequisites()
            before = self.rows()
            for target in targets:
                for question in answers:
                    response = self.teacher_save({question: "DI-KAYA"}, period=target, official="2026-11-01")
                    self.assertEqual(response.status_code, 400, response.text)
                    self.assertEqual(self.question_data(2)[question]["carry_forward"][target], "locked")
                self.assertEqual(self.parent_save({q: "DI-KAYA"}, period=target).status_code, 409 if target == "MID" else 400)
            self.assertEqual(self.rows(), before)

    def test_parent_source_is_locked_for_parent_and_teacher_can_override_every_period(self):
        self.assertEqual(self.parent_save(dict.fromkeys(self.questions, "KAYA")).status_code, 200)
        self.assertEqual(self.parent_save(dict.fromkeys(self.questions, "KAYA"), period="MID").status_code, 200)
        self.prerequisites()
        for q, target in zip(self.questions, ("PRE", "MID", "POST")):
            self.assertEqual(self.parent_save({q: "KAYA"}).status_code, 200)
            if target != "PRE":
                self.assertEqual(self.question_data(5)[q]["carry_forward"][target], "locked")
                self.assertEqual(self.question_data(2)[q]["carry_forward"][target], "editable")
                self.assertEqual(self.parent_save({q: "DI-KAYA"}, period=target).status_code, 409 if target == "MID" else 400)
            if target == "PRE":
                self.assertEqual(self.teacher_save({q: "DI-KAYA"}, official="2026-09-01").status_code, 409)
            response = self.teacher_save({q: "DI-KAYA"}, edited=[q], period=target, official={"PRE": "2026-09-01", "MID": "2026-10-01", "POST": "2026-11-01"}[target])
            self.assertEqual(response.status_code, 200, response.text)
            original = self.rows()[q, "PRE"]
            self.assertEqual(original["parent_submitted_at"], FIRST)
            self.assertEqual(original["parent_id"], 1)

    def test_equal_answer_confirmation_locks_despite_parent_role(self):
        q = self.questions[0]
        self.assertEqual(self.parent_save({q: "KAYA"}).status_code, 200)
        self.assertEqual(self.teacher_save({q: "KAYA"}).status_code, 200)
        self.assertEqual(self.rows()[q, "PRE"]["evaluator_role"], "parent")
        self.prerequisites()
        for target in ("MID", "POST"):
            self.assertEqual(self.teacher_save({q: "DI-KAYA"}, period=target, official="2026-11-05").status_code, 400)
            self.assertEqual(self.question_data(2)[q]["carry_forward"][target], "locked")

    def test_teacher_mid_override_resets_post_and_reads_do_not_save_virtual_answers(self):
        q = self.questions[0]
        self.assertEqual(self.parent_save({q: "KAYA"}).status_code, 200)
        before = self.rows()
        own = self.call("GET", "/api/eccd/parent/assessment/1", 5).json()
        self.assertEqual(self.question_data(5)[q]["carry_forward"]["POST"], "locked")
        self.assertEqual(self.question_data(6)[q]["carry_forward"]["POST"], "restricted")
        self.assertIsNone(self.question_data(5)[q]["answers"]["POST"])
        self.assertIsNone(own["periodDates"]["POST"])
        self.assertFalse(own["summary"]["POST"]["isEvaluated"])
        response = self.call("GET", "/api/teachers/download/1", 2)
        self.assertEqual(response.status_code, 200)
        workbook = openpyxl.load_workbook(BytesIO(response.content))
        self.addCleanup(workbook.close)
        with self.sessions() as db:
            question = db.get(EccdQuestion, q)
            mapping = get_mapping(question.domain_id, question.sequence_order)
        for period in ("MID", "POST"):
            for column in mapping[period]:
                self.assertIn(workbook["CHECKLIST"][f"{column}{mapping['row']}"].value, (None, ""))
        self.assertEqual(self.rows(), before)
        self.prerequisites()
        response = self.teacher_save({q: "DI-KAYA"}, period="MID", official="2026-11-05")
        self.assertEqual(response.status_code, 200, response.text)
        for actor in (2, 5):
            self.assertIsNone(self.question_data(actor)[q]["carry_forward"]["POST"])
        self.assertEqual(self.parent_save({q: "DI-KAYA"}, period="POST").status_code, 200)
        self.assertEqual(self.parent_save({q: "KAYA"}, period="MID").status_code, 409)

    def test_parent_mid_source_exemption_and_independent_teacher_positive_survives_legacy_conflict(self):
        q, other = self.questions[:2]
        self.assertEqual(self.parent_save({q: "KAYA"}, period="MID").status_code, 200)
        self.assertEqual(self.parent_save({q: "DI-KAYA"}, period="POST").status_code, 400)
        self.prerequisites()
        self.assertEqual(self.teacher_save({q: "DI-KAYA"}, period="POST").status_code, 200)
        # Simulate an old inconsistent row without automatically rewriting history.
        self.assertEqual(self.teacher_save({other: "KAYA"}, official="2026-09-01").status_code, 200)
        with self.sessions() as db:
            record = db.query(StudentEccdEvaluation).filter_by(student_id=1, question_id=other, testing_period="MID").one()
            record.evaluator_role = "teacher"
            record.teacher_evaluation_date = date(2026, 10, 1)
            db.commit()
        self.assertEqual(self.question_data(2)[other]["carry_forward"]["POST"], "locked")
        self.assertEqual(self.teacher_save({other: "DI-KAYA"}, period="POST", official="2026-11-05").status_code, 400)

    def test_old_unreviewed_parent_negative_cannot_reset_pre_carry_forward(self):
        q = self.questions[0]
        self.assertEqual(self.parent_save({q: "KAYA"}).status_code, 200)
        with self.sessions() as db:
            db.add(StudentEccdEvaluation(student_id=1, question_id=q, testing_period="MID", answer="DI-KAYA", evaluator_role="parent", parent_id=1, parent_submitted_at=FIRST, evaluation_date=date(2026, 10, 1)))
            db.commit()
        self.prerequisites()
        before = self.rows()
        self.assertEqual(self.question_data(5)[q]["carry_forward"]["POST"], "locked")
        self.assertEqual(self.parent_save({q: "DI-KAYA"}, period="POST").status_code, 400)
        self.assertEqual(self.rows(), before)
        self.assertEqual(self.teacher_save({q: "DI-KAYA"}, period="MID", edited=[q]).status_code, 200)
        self.assertIsNone(self.question_data(5)[q]["carry_forward"]["POST"])

    def test_teacher_confirmation_correction_reversion_and_later_save(self):
        q, other = self.questions[:2]
        self.assertEqual(self.parent_save({q: "KAYA", other: "DI-KAYA"}).status_code, 200)
        # An edit list never changes attribution if the final mark was reverted.
        response = self.teacher_save({q: "KAYA", other: "DI-KAYA"}, edited=[q])
        self.assertEqual(response.status_code, 200, response.text)
        for row in self.rows().values():
            self.assertEqual(row["evaluator_role"], "parent")
            self.assertIsNone(row["teacher_marked_at"])
            self.assertEqual(row["parent_submitted_at"], FIRST)
            self.assertEqual(row["teacher_evaluation_date"], date(2026, 11, 4))
        self.assertEqual(self.teacher_save({q: "DI-KAYA", other: "DI-KAYA"}, edited=[q]).status_code, 200)
        corrected = self.rows()[q, "PRE"]
        self.assertEqual(corrected["evaluator_role"], "teacher")
        self.assertEqual(corrected["teacher_marked_at"], SECOND)
        self.assertEqual(corrected["parent_submitted_at"], FIRST)
        self.assertEqual(self.rows()[other, "PRE"]["evaluator_role"], "parent")
        self.assertEqual(self.teacher_save({q: "DI-KAYA"}, when=SECOND + timedelta(days=1), official="2026-11-05").status_code, 200)
        self.assertEqual(self.rows()[q, "PRE"]["teacher_marked_at"], SECOND)
        self.assertEqual(self.rows()[q, "PRE"]["parent_submitted_at"], FIRST)

    def test_stale_teacher_request_conflicts_before_normalizing_dates_or_adding_rows(self):
        q, new = self.questions[:2]
        self.assertEqual(self.parent_save({q: "KAYA"}).status_code, 200)
        self.assertEqual(self.teacher_save({q: "KAYA"}).status_code, 200)
        before = self.rows()
        response = self.teacher_save({new: "KAYA", q: "DI-KAYA"}, official="2026-11-05")
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.rows(), before)

    def test_hidden_marks_have_neutral_locks_without_authors_or_dates(self):
        q = self.questions[0]
        self.assertEqual(self.parent_save({q: "KAYA"}).status_code, 200)
        own, linked = self.question_data(5)[q], self.question_data(6)[q]
        self.assertTrue(own["parent_locked"]["PRE"])
        self.assertTrue(linked["parent_locked"]["PRE"])
        self.assertIsNotNone(own["parent_submitted_at"]["PRE"])
        for field in ("answers", "evaluator_roles", "parent_submitted_at", "teacher_marked_at"):
            self.assertIsNone(linked[field]["PRE"])
        self.assertEqual(self.teacher_save({q: "DI-KAYA"}, edited=[q]).status_code, 200)
        own = self.question_data(5)[q]
        for field in ("answers", "evaluator_roles", "parent_submitted_at", "teacher_marked_at"):
            self.assertIsNone(own[field]["PRE"])
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_view_eccd_marks = True
            db.commit()
        visible = self.question_data(6)[q]
        self.assertIsNotNone(visible["teacher_marked_at"]["PRE"])
        self.assertIsNotNone(visible["parent_submitted_at"]["PRE"])

    def test_backup_and_workbook_retain_correction_time_and_old_backups_default_null(self):
        q = self.questions[0]
        self.assertEqual(self.parent_save({q: "KAYA"}).status_code, 200)
        self.assertEqual(self.teacher_save({q: "DI-KAYA"}, edited=[q]).status_code, 200)
        before = self.rows()
        with self.sessions() as db:
            payload = export_backup(db)
            restore_backup(db, payload)
        self.assertEqual(self.rows(), before)
        response = self.call("GET", "/api/teachers/download/1", 2)
        self.assertEqual(response.status_code, 200)
        with self.sessions() as db:
            question = db.get(EccdQuestion, q)
            mapping = get_mapping(question.domain_id, question.sequence_order)
        workbook = openpyxl.load_workbook(BytesIO(response.content))
        self.addCleanup(workbook.close)
        comment = workbook["CHECKLIST"][f"{mapping['PRE'][1]}{mapping['row']}"].comment.text
        self.assertIn(f"teacher_marked_at: {SECOND.isoformat()}", comment)
        self.assertIn(f"parent_submitted_at: {FIRST.isoformat()}", comment)
        document = json.loads(cipher().decrypt(payload))
        for row in document["student_eccd_evaluations"]:
            row.pop("teacher_marked_at")
        with self.sessions() as db:
            restore_backup(db, cipher().encrypt(json.dumps(document).encode()))
        self.assertIsNone(self.rows()[q, "PRE"]["teacher_marked_at"])

    def test_idempotent_migration_preserves_existing_rows_and_unknown_history(self):
        q = self.questions[0]
        self.assertEqual(self.parent_save({q: "KAYA"}).status_code, 200)
        with self.fixture.test_engine.begin() as connection:
            connection.execute(text("ALTER TABLE student_eccd_evaluations DROP COLUMN teacher_marked_at"))
            before = list(connection.execute(text("SELECT * FROM student_eccd_evaluations")))
            self.assertTrue(apply_teacher_marked_at(connection, self.fixture.schema))
            self.assertFalse(apply_teacher_marked_at(connection, self.fixture.schema))
            check_teacher_marked_at(connection, self.fixture.schema)
            after = list(connection.execute(text("SELECT * FROM student_eccd_evaluations")))
            self.assertEqual(tuple(after[0])[:-1], tuple(before[0]))
            self.assertIsNone(after[0][-1])
            column = next(c for c in inspect(connection).get_columns("student_eccd_evaluations", schema=self.fixture.schema)
                          if c["name"] == "teacher_marked_at")
            self.assertTrue(column["nullable"])
            self.assertTrue(column["type"].timezone)
        # Exercise the actual cloud startup path on the disposable schema.
        with self.fixture.test_engine.begin() as connection:
            apply_batch1(connection, self.fixture.schema)
            apply_batch2(connection, self.fixture.schema)
            connection.execute(text("ALTER TABLE student_eccd_evaluations DROP COLUMN teacher_marked_at"))
            connection.execute(text("DELETE FROM ames_schema_migrations WHERE version='016_teacher_marked_at'"))
        main = importlib.import_module("backend.main")
        with patch.object(main, "engine", self.fixture.test_engine), \
                patch.object(main, "SessionLocal", self.sessions), patch.object(main, "warm_inference"):
            main.initialize_runtime()
            main.initialize_runtime()
        self.assertIsNone(self.rows()[q, "PRE"]["teacher_marked_at"])
