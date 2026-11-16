"""Period window security using HTTP and disposable PostgreSQL schemas."""
import unittest
from datetime import date, datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import text
from backend.tests import test_phase2
from backend.models import EccdDomain, EccdQuestion, FamilyAccess, Section, SectionTeacher, Student, StudentEccdEvaluation, Teacher, User
from backend.migrations.parent_assessment_access import apply_parent_assessment_access, check_parent_assessment_access
from backend.migrations.parent_eccd_marks import apply_parent_eccd_marks, check_parent_eccd_marks
from backend.utils.backups import cipher, export_backup, restore_backup
from backend.schemas.backup import BackupDocument
from backend.schemas.eccd import ParentEvaluationBatch
from backend.schemas.common import ParentPermissions
from backend.utils.assessments import save_home_evaluation
from backend.utils.eccd_dates import now_pht

PATH = "/api/teacher/settings/parent-assessment-access"
FLAGS = {"pre_test_parent_editable": True, "mid_test_parent_editable": False, "post_test_parent_editable": False}


class ParentAssessmentAccessTests(unittest.TestCase):
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
            db.commit()

    def save(self, period="PRE", answer="KAYA", extra=None, actor=5):
        rows = [{"question_id": self.fixture.home, "testing_period": period, "answer": answer}]
        if extra:
            rows.append({"question_id": self.fixture.home, "testing_period": extra, "answer": answer})
        return self.call("POST", "/api/eccd/parent/evaluate", actor, json={"student_id": 1, "evaluations": rows})

    def update(self, flags=None, actor=2, section=1):
        return self.call("PUT", PATH, actor, params={"section_id": section}, json=flags or FLAGS)

    def evaluation_rows(self):
        with self.sessions() as db:
            return [dict(row) for row in db.execute(
                StudentEccdEvaluation.__table__.select().order_by(StudentEccdEvaluation.evaluation_id)
            ).mappings()]

    def test_parent_insert_records_authenticated_identity_and_utc_provenance(self):
        before = datetime.now(timezone.utc)
        response = self.save()
        self.assertEqual(response.status_code, 200, response.text)
        with self.sessions() as db:
            row = db.query(StudentEccdEvaluation).one()
            self.assertEqual(row.parent_id, 1)
            self.assertEqual(row.evaluator_role, "parent")
            self.assertLessEqual(before, row.parent_submitted_at)
            self.assertLessEqual(row.parent_submitted_at, datetime.now(timezone.utc))
            self.assertIsNotNone(row.parent_submitted_at.utcoffset())
            self.assertEqual(row.evaluation_date, now_pht().date())
            self.assertIsNone(row.teacher_id)
            self.assertIsNone(row.teacher_evaluation_date)
            # A linked parent's identical retry cannot steal the attribution.
            db.add(FamilyAccess(parent_id=2, student_id=1, status="SYNCED"))
            db.commit()
        self.assertEqual(self.save(actor=6).status_code, 200)
        with self.sessions() as db:
            self.assertEqual(db.query(StudentEccdEvaluation).one().parent_id, 1)

    def test_unchanged_parent_answer_preserves_provenance_and_parent_only_date(self):
        self.assertEqual(self.save().status_code, 200)
        old = datetime.now(timezone.utc) - timedelta(days=30)
        with self.sessions() as db:
            row = db.query(StudentEccdEvaluation).one()
            row.parent_submitted_at = old
            row.evaluation_date = old.date()
            db.commit()
        self.assertEqual(self.save().status_code, 200)
        with self.sessions() as db:
            row = db.query(StudentEccdEvaluation).one()
            self.assertEqual(row.evaluation_date, old.date())
            self.assertEqual(row.parent_submitted_at, old)
            self.assertIsNone(row.teacher_evaluation_date)
            self.assertEqual(row.evaluator_role, "parent")

    def test_teacher_first_answers_lock_parents_and_preserve_teacher_history(self):
        teacher_date, compatibility_date = date(2026, 8, 10), date(2026, 8, 9)
        with self.sessions() as db:
            db.add(StudentEccdEvaluation(student_id=1, teacher_id=3,
                question_id=self.fixture.home, testing_period="PRE", answer="KAYA",
                evaluation_date=compatibility_date, teacher_evaluation_date=teacher_date))
            db.commit()
        for answer in ("KAYA", "DI-KAYA"):
            with self.subTest(answer=answer):
                self.assertEqual(self.save(answer=answer).status_code, 200 if answer == "KAYA" else 409)
                with self.sessions() as db:
                    row = db.query(StudentEccdEvaluation).one()
                    self.assertEqual(row.answer.value, "KAYA")
                    self.assertEqual(row.teacher_id, 3)
                    self.assertEqual(row.teacher_evaluation_date, teacher_date)
                    self.assertEqual(row.evaluation_date, compatibility_date)
                    self.assertIsNone(row.parent_id)
                    self.assertEqual(row.evaluator_role, "teacher")
                    self.assertIsNone(row.parent_submitted_at)

    def test_non_home_questions_return_exact_403_without_partial_writes(self):
        self.assertEqual(self.save(answer="DI-KAYA").status_code, 200)
        before = self.evaluation_rows()
        for period in ("PRE", "MID"):
            with self.subTest(period=period):
                response = self.call("POST", "/api/eccd/parent/evaluate", 5, json={
                    "student_id": 1, "evaluations": [
                        {"question_id": self.fixture.home, "testing_period": period, "answer": "KAYA"},
                        {"question_id": self.fixture.nonhome, "testing_period": period, "answer": "KAYA"},
                    ]})
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()["detail"], "Parents are only permitted to assess home-based questions.")
                self.assertFalse(response.json()["success"])
                self.assertEqual(self.evaluation_rows(), before)

    def test_unknown_question_rejects_whole_batch_without_provenance_updates(self):
        self.assertEqual(self.save(answer="DI-KAYA").status_code, 200)
        before = self.evaluation_rows()
        response = self.call("POST", "/api/eccd/parent/evaluate", 5, json={
            "student_id": 1, "evaluations": [
                {"question_id": self.fixture.home, "testing_period": "PRE", "answer": "KAYA"},
                {"question_id": 2147483647, "testing_period": "PRE", "answer": "KAYA"},
            ]})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.evaluation_rows(), before)

    def test_parent_pre_save_ignores_future_dates_and_preserves_other_rows(self):
        with self.sessions() as db:
            # Deliberately unordered teacher dates must not gate a parent observation.
            for period, year in (("PRE", 2028), ("MID", 2027), ("POST", 2026)):
                db.add(StudentEccdEvaluation(student_id=1, teacher_id=3,
                    question_id=self.fixture.home, testing_period=period, answer="DI-KAYA",
                    evaluation_date=date(year, 8, 10), teacher_evaluation_date=date(year, 8, 10)))
            db.add(StudentEccdEvaluation(student_id=1, teacher_id=1,
                question_id=self.fixture.nonhome, testing_period="PRE", answer="KAYA",
                evaluation_date=date(2025, 8, 10), teacher_evaluation_date=date(2025, 8, 10)))
            db.add(StudentEccdEvaluation(student_id=3, teacher_id=2,
                question_id=self.fixture.home, testing_period="PRE", answer="DI-KAYA",
                evaluation_date=date(2026, 8, 10)))
            db.commit()
        before = self.evaluation_rows()
        self.assertEqual(self.save(answer="DI-KAYA").status_code, 200)
        self.assertEqual(self.evaluation_rows(), before)
        self.assertEqual(self.save().status_code, 409)
        self.assertEqual(self.evaluation_rows(), before)

    def test_save_helper_enforces_synced_parent_identity_including_super_admin(self):
        payload = ParentEvaluationBatch(student_id=1, evaluations=[{
            "question_id": self.fixture.home, "testing_period": "PRE", "answer": "KAYA"}])
        for actor in (1, 6):
            with self.subTest(actor=actor), self.sessions() as db:
                with self.assertRaises(HTTPException) as error:
                    save_home_evaluation(db, db.get(User, actor), payload)
                self.assertEqual(error.exception.status_code, 403)
                self.assertEqual(db.query(StudentEccdEvaluation).count(), 0)
        with self.sessions() as db:
            db.query(FamilyAccess).filter_by(student_id=1).update({"status": "PENDING"})
            db.commit()
        with self.sessions() as db:
            with self.assertRaises(HTTPException) as error:
                save_home_evaluation(db, db.get(User, 5), payload)
            self.assertEqual(error.exception.status_code, 403)
            self.assertEqual(db.query(StudentEccdEvaluation).count(), 0)

    def test_defaults_and_parent_context_do_not_release_scores(self):
        self.assertEqual(self.call("GET", PATH, 2).json(), {"section_id": 1, **FLAGS})
        self.assertEqual(self.save().status_code, 200)
        response = self.call("GET", "/api/eccd/parent/assessment/1", 5)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["parent_assessment_access"], FLAGS)
        self.assertFalse(data["summary"]["PRE"]["is_published"])
        self.assertIsNone(data["summary"]["PRE"]["standardScore"])
        home = next(q for d in data["domains"] for q in d["questions"] if q["question_id"] == self.fixture.home)
        self.assertEqual(home["answers"]["PRE"], "KAYA")
        self.assertFalse(data["allow_parent_view_eccd_marks"])

    def test_every_period_rejects_disabled_and_locks_answers_after_enabled_create(self):
        for period, flag, label in (("PRE", "pre_test_parent_editable", "Pre-Test"), ("MID", "mid_test_parent_editable", "Mid-Test"), ("POST", "post_test_parent_editable", "Post-Test")):
            with self.subTest(period=period):
                flags = {name: False for name in FLAGS}
                self.assertEqual(self.update(flags).status_code, 200)
                blocked = self.save(period)
                self.assertEqual(blocked.status_code, 403)
                self.assertEqual(blocked.json()["detail"], f"Editing for {label} is currently closed by the teacher.")
                flags[flag] = True
                self.assertEqual(self.update(flags).status_code, 200)
                self.assertEqual(self.save(period).status_code, 200)
                self.assertEqual(self.save(period, "DI-KAYA").status_code, 409)
                flags[flag] = False
                self.assertEqual(self.update(flags).status_code, 200)
                self.assertEqual(self.save(period, "KAYA").status_code, 403)
                with self.sessions() as db:
                    self.assertEqual(db.query(StudentEccdEvaluation).filter_by(student_id=1, testing_period=period).one().answer.value, "KAYA")

    def test_mixed_period_request_is_rejected_even_when_all_windows_are_open(self):
        self.assertEqual(self.save(answer="DI-KAYA").status_code, 200)
        self.assertEqual(self.update({name: True for name in FLAGS}).status_code, 200)
        self.assertEqual(self.save(extra="MID").status_code, 422)
        with self.sessions() as db:
            rows = db.query(StudentEccdEvaluation).filter_by(student_id=1).all()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].answer.value, "DI-KAYA")

    def test_single_period_contract_rejects_empty_mismatched_and_duplicate_answers(self):
        row = {"question_id": self.fixture.home, "testing_period": "PRE", "answer": "KAYA"}
        for payload in (
            {"testing_period": "PRE", "evaluations": []},
            {"testing_period": "MID", "evaluations": [row]},
            {"testing_period": "PRE", "evaluations": [row, row]},
        ):
            with self.subTest(payload=payload):
                response = self.call("POST", "/api/eccd/parent/evaluate", 5, json={"student_id": 1, **payload})
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(self.evaluation_rows(), [])
        # Requests saved by the old offline queue omit the top-level period.
        self.assertEqual(self.save().json()["testing_period"], "PRE")
        response = self.call("POST", "/api/eccd/parent/evaluate", 5, json={
            "student_id": 1, "testing_period": "PRE", "evaluations": [row]})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["testing_period"], "PRE")

    def test_all_domains_and_school_questions_are_delivered_but_unreleased_data_stays_masked(self):
        self.assertEqual(self.save().status_code, 200)
        with self.sessions() as db:
            db.add(StudentEccdEvaluation(student_id=1, question_id=self.fixture.nonhome,
                testing_period="PRE", answer="DI-KAYA", teacher_id=1,
                evaluation_date=date(2026, 8, 10), teacher_evaluation_date=date(2026, 8, 10)))
            db.commit()
            expected = {domain.domain_id: {q.question_id for q in domain.questions}
                        for domain in db.query(EccdDomain).all()}
            home_ids = {q.question_id for q in db.query(EccdQuestion).filter_by(is_home_based=True)}
        response = self.call("GET", "/api/eccd/parent/assessment/1", 5)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(len(data["domains"]), 7)
        self.assertEqual({d["domain_id"]: {q["question_id"] for q in d["questions"]}
                          for d in data["domains"]}, expected)
        self.assertEqual({q["question_id"] for q in data["homeBasedChecklist"]}, home_ids)
        for domain in data["domains"]:
            for question in domain["questions"]:
                self.assertIsInstance(question["is_home_based"], bool)
                own_home = question["question_id"] == self.fixture.home
                self.assertEqual(question["answers"], {"PRE": "KAYA" if own_home else None, "MID": None, "POST": None})
                self.assertEqual(question["evaluator_roles"], {"PRE": "parent" if own_home else None, "MID": None, "POST": None})
                self.assertNotIn("carry_over", question)
        for period in ("PRE", "MID", "POST"):
            card = data["summary"][period]
            self.assertFalse(card["is_published"])
            self.assertFalse(card["isEvaluated"])
            self.assertEqual(card["interpretation"], "Pending Adviser Release")
            for field in ("assessmentDate", "decimalAge", "standardScore", "rawScores", "scaledScores", "sumOfScaledScores"):
                self.assertIsNone(card[field])
            for field in ("periodDates", "evaluationDates", "gradingDates"):
                self.assertIsNone(data[field][period])
            for domain in data["matrix"]:
                self.assertIsNone(domain["scores"][period])

    def test_released_school_answers_and_progress_keep_real_question_flags_and_full_denominators(self):
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_view_eccd_pre = True
            db.get(Teacher, 1).allow_parent_view_eccd_marks = True
            school = db.get(EccdQuestion, self.fixture.nonhome)
            domain_id = school.domain_id
            total = db.query(EccdQuestion).filter_by(domain_id=domain_id).count()
            db.add(StudentEccdEvaluation(student_id=1, question_id=school.question_id,
                testing_period="PRE", answer="DI-KAYA", teacher_id=1,
                evaluation_date=date(2026, 8, 10), teacher_evaluation_date=date(2026, 8, 10)))
            # Empty reference domains must remain navigable without dividing by zero.
            db.add(EccdDomain(domain_id=8, domain_name="Empty Test Domain"))
            db.commit()
        data = self.call("GET", "/api/eccd/parent/assessment/1", 5).json()
        school = next(q for d in data["domains"] for q in d["questions"] if q["question_id"] == self.fixture.nonhome)
        self.assertFalse(school["is_home_based"])
        self.assertEqual(school["answers"], {"PRE": "DI-KAYA", "MID": None, "POST": None})
        self.assertEqual(school["evaluator_roles"]["PRE"], "teacher")
        response = self.call("GET", "/api/eccd/parent/domains-progress/1", 5)
        self.assertEqual(response.status_code, 200, response.text)
        domains = {d["domain_id"]: d for d in response.json()}
        self.assertEqual(len(domains), 8)
        self.assertEqual(domains[domain_id]["pre_progress"], int(100 / total + 0.5))
        self.assertFalse(next(q for q in domains[domain_id]["questions"] if q["question_id"] == self.fixture.nonhome)["is_home_based"])
        self.assertEqual(domains[8]["pre_progress"], 0)
        self.assertIsNone(domains[8]["mid_progress"])

    def test_latest_recorded_dashboard_remains_masked_when_only_an_older_period_is_released(self):
        self.assertEqual(self.update({name: True for name in FLAGS}).status_code, 200)
        self.assertEqual(self.save("PRE").status_code, 200)
        self.assertEqual(self.save("POST").status_code, 200)
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_view_eccd_pre = True
            db.commit()
        response = self.call("GET", "/api/eccd/parent/dashboard-stats/1", 5)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertFalse(data["is_published"])
        self.assertEqual(data["currentPhase"], "Pending Adviser Release")
        self.assertIsNone(data["totalKaya"])
        self.assertIsNone(data["totalDiKaya"])
        self.assertTrue(all(card["progress"] is None for card in data["domainCards"]))

    def test_global_permission_still_required(self):
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_edit_home_based_eccd = False
            db.commit()
        self.assertEqual(self.save().status_code, 403)

    def test_only_current_adviser_manages_section_windows(self):
        changed = {**FLAGS, "mid_test_parent_editable": True}
        self.assertEqual(self.update(changed, actor=4).status_code, 403)
        self.assertEqual(self.call("POST", "/api/chairman/sections/1/assign-teacher", json={"teacher_id": 3}).status_code, 200)
        self.assertEqual(self.update(changed, actor=4).status_code, 200)
        self.assertEqual(self.call("GET", PATH, 2).status_code, 403)
        self.assertEqual(self.call("GET", PATH, 4).json()["mid_test_parent_editable"], True)
        self.assertEqual(self.save("MID").status_code, 200)

    def test_only_active_assigned_teachers_can_manage_windows(self):
        for actor in (1, 5, 6):
            self.assertEqual(self.call("GET", PATH, actor).status_code, 403)
            self.assertEqual(self.update(actor=actor).status_code, 403)
        self.assertEqual(self.update(actor=3).status_code, 403)
        self.assertEqual(self.call("GET", PATH, 3, params={"section_id": 1}).status_code, 403)
        with self.sessions() as db:
            db.query(SectionTeacher).filter_by(teacher_id=1).update({"status": "Inactive"})
            db.commit()
        self.assertEqual(self.update().status_code, 403)
        self.assertEqual(self.save().status_code, 403)

    def test_strict_flags_and_explicit_selection_for_multiple_sections(self):
        for payload in ({}, {**FLAGS, "mid_test_parent_editable": "false"}, {**FLAGS, "post_test_parent_editable": None}, {**FLAGS, "extra": True}):
            self.assertEqual(self.call("PUT", PATH, 2, json=payload).status_code, 422)
        with self.sessions() as db:
            from backend.utils.teachers import assign_teacher
            assign_teacher(db, db.get(User, 1), 2, 1)
            db.commit()
        self.assertEqual(self.call("GET", PATH, 2).status_code, 200)
        self.assertEqual(self.update().status_code, 403)
        self.assertEqual(self.update({**FLAGS, "mid_test_parent_editable": True}, section=2).status_code, 200)
        self.assertEqual(self.call("GET", PATH, 2, params={"section_id": 1}).status_code, 403)
        self.assertTrue(self.call("GET", PATH, 2, params={"section_id": 2}).json()["mid_test_parent_editable"])

    def test_unlinked_pending_and_archived_accounts_cannot_write(self):
        self.assertEqual(self.save(actor=6).status_code, 403)
        with self.sessions() as db:
            db.query(FamilyAccess).filter_by(student_id=1).update({"status": "PENDING"})
            db.commit()
        self.assertEqual(self.save().status_code, 403)
        with self.sessions() as db:
            db.get(User, 2).is_active = False
            db.commit()
        self.assertEqual(self.update().status_code, 403)

    def test_section_handover_preserves_windows_and_archives_previous_teacher(self):
        from backend.utils.teachers import assign_teacher
        changed = {**FLAGS, "mid_test_parent_editable": True}
        self.assertEqual(self.update(changed).status_code, 200)
        with self.sessions() as db:
            assign_teacher(db, db.get(User, 1), 1, 2)
            db.commit()
            self.assertFalse(db.get(User, 2).is_active)
        self.assertEqual(self.call("GET", PATH, 3, params={"section_id": 1}).json(), {"section_id": 1, **changed})

    def test_migration_preserves_sections_and_existing_flags_on_repeat(self):
        with self.fixture.test_engine.begin() as connection:
            before = list(connection.execute(text("SELECT section_id, section_name, adviser_teacher_id, created_at FROM sections ORDER BY section_id")))
            connection.execute(text("ALTER TABLE sections DROP COLUMN pre_test_parent_editable, DROP COLUMN mid_test_parent_editable, DROP COLUMN post_test_parent_editable"))
            self.assertTrue(apply_parent_assessment_access(connection, self.fixture.schema))
            connection.execute(text("UPDATE sections SET mid_test_parent_editable = true WHERE section_id = 1"))
            self.assertFalse(apply_parent_assessment_access(connection, self.fixture.schema))
            check_parent_assessment_access(connection, self.fixture.schema)
            self.assertTrue(connection.execute(text("SELECT mid_test_parent_editable FROM sections WHERE section_id = 1")).scalar_one())
            self.assertEqual(before, list(connection.execute(text("SELECT section_id, section_name, adviser_teacher_id, created_at FROM sections ORDER BY section_id"))))

    def test_backup_roundtrip_and_old_backup_defaults(self):
        changed = {**FLAGS, "pre_test_parent_editable": False, "post_test_parent_editable": True}
        self.assertEqual(self.update(changed).status_code, 200)
        with self.sessions() as db:
            payload = export_backup(db)
            restore_backup(db, payload)
            section = db.get(Section, 1)
            self.assertFalse(section.pre_test_parent_editable)
            self.assertTrue(section.post_test_parent_editable)
            data = BackupDocument.model_validate_json(cipher().decrypt(payload)).model_dump(mode="json")
            for row in data["sections"]:
                for flag in FLAGS:
                    row.pop(flag)
            document = BackupDocument.model_validate(data)
            self.assertTrue(document.sections[0].pre_test_parent_editable)
            self.assertFalse(document.sections[0].post_test_parent_editable)

    def test_all_acl_toggles_persist_through_aliases_without_changing_assessments(self):
        self.assertEqual(self.save().status_code, 200)
        with self.sessions() as db:
            answers = {str(q): 1 for (q,) in db.query(EccdQuestion.question_id)}
        for period, when in (("PRE", "2026-08-10"), ("MID", "2026-09-10"), ("POST", "2026-10-10")):
            self.assertEqual(self.fixture.evaluate(period=period, when=when, answers=answers).status_code, 200)
        before = self.evaluation_rows()
        paths = ("/api/teachers/settings", "/api/teachers/me/access", "/api/teachers/access-controls")
        for path in paths:
            for enabled in (True, False):
                with self.subTest(path=path, enabled=enabled):
                    flags = {key: enabled for key in ParentPermissions.model_fields}
                    response = self.call("PUT", path, 2, json=flags)
                    self.assertEqual(response.status_code, 200, response.text)
                    with self.sessions() as db:
                        teacher = db.get(Teacher, 1)
                        self.assertEqual({key: getattr(teacher, key) for key in flags}, flags)
                    for get_path in paths:
                        response = self.call("GET", get_path, 2)
                        self.assertEqual(response.status_code, 200, response.text)
                        self.assertEqual({key: response.json()[key] for key in flags}, flags)
                    self.assertEqual(self.evaluation_rows(), before)
        response = self.call("PUT", paths[0], 2, json={
            "allow_parent_view_eccd_marks": True, "allow_parent_predictions": True})
        self.assertEqual(response.status_code, 200, response.text)
        response = self.call("PUT", paths[1], 2, json={"allow_parent_view_eccd_pre": True})
        self.assertEqual(response.status_code, 200, response.text)
        data = self.call("GET", paths[2], 2).json()
        self.assertTrue(data["allow_parent_view_eccd_marks"])
        self.assertTrue(data["allow_parent_predictions"])
        self.assertEqual(self.evaluation_rows(), before)

    def test_marks_settings_aliases_persist_and_old_payload_preserves_toggle(self):
        for path in ("/api/teachers/settings", "/api/teachers/me/access", "/api/teachers/access-controls"):
            response = self.call("GET", path, 2)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertFalse(response.json()["allow_parent_view_eccd_marks"])
        for enabled in (True, False, True):
            response = self.call("PUT", "/api/teachers/settings", 2, json={"allow_parent_view_eccd_marks": enabled})
            self.assertEqual(response.status_code, 200, response.text)
            with self.sessions() as db:
                self.assertEqual(db.get(Teacher, 1).allow_parent_view_eccd_marks, enabled)
                self.assertFalse(db.get(Teacher, 2).allow_parent_view_eccd_marks)
            self.assertEqual(self.call("GET", "/api/teachers/me/access", 2).json()["allow_parent_view_eccd_marks"], enabled)
        self.assertEqual(self.call("PUT", "/api/teachers/me/access", 2, json={"allow_parent_view_eccd_pre": True}).status_code, 200)
        self.assertTrue(self.call("GET", "/api/teachers/settings", 2).json()["allow_parent_view_eccd_marks"])
        for actor in (1, 5, 6):
            self.assertEqual(self.call("PUT", "/api/teachers/settings", actor, json={"allow_parent_view_eccd_marks": True}).status_code, 403)
        self.assertEqual(self.call("PUT", "/api/teachers/settings", 2, json={"allow_parent_view_eccd_marks": None}).status_code, 422)
        self.assertTrue(self.call("GET", "/api/teachers/settings", 2).json()["allow_parent_view_eccd_marks"])

    def test_marks_settings_survive_linked_child_serialization_by_student_section(self):
        other_windows = {
            "pre_test_parent_editable": False,
            "mid_test_parent_editable": True,
            "post_test_parent_editable": True,
        }
        with self.sessions() as db:
            db.add(FamilyAccess(parent_id=1, student_id=3, status="SYNCED"))
            db.commit()
        for actor, section_id, windows in ((2, 1, FLAGS), (3, 2, other_windows)):
            response = self.call("PUT", PATH, actor, params={"section_id": section_id}, json=windows)
            self.assertEqual(response.status_code, 200, response.text)

        for first_marks, other_marks in ((True, False), (False, True)):
            with self.subTest(first_marks=first_marks, other_marks=other_marks):
                for actor, teacher_id, marks in ((2, 1, first_marks), (3, 2, other_marks)):
                    response = self.call("PUT", "/api/teachers/me/access", actor,
                                         json={"allow_parent_view_eccd_marks": marks})
                    self.assertEqual(response.status_code, 200, response.text)
                    with self.sessions() as db:
                        self.assertEqual(db.get(Teacher, teacher_id).allow_parent_view_eccd_marks, marks)

                for path in ("/api/students/my-child", "/api/students/linked"):
                    response = self.call("GET", path, 5)
                    self.assertEqual(response.status_code, 200, response.text)
                    children = {child["student_id"]: child for child in response.json()}
                    self.assertEqual(set(children), {1, 3})
                    for student_id, section_id, marks in ((1, 1, first_marks), (3, 2, other_marks)):
                        self.assertEqual(children[student_id]["section_id"], section_id)
                        self.assertEqual(children[student_id]["allow_parent_view_eccd_marks"], marks)

                for student_id, marks, windows in ((1, first_marks, FLAGS), (3, other_marks, other_windows)):
                    response = self.call("GET", f"/api/eccd/parent/assessment/{student_id}", 5)
                    self.assertEqual(response.status_code, 200, response.text)
                    data = response.json()
                    self.assertEqual(data["allow_parent_view_eccd_marks"], marks)
                    self.assertEqual(data["permissions"]["allow_parent_view_eccd_marks"], marks)
                    self.assertEqual(data["parent_assessment_access"], windows)
                    self.assertEqual(data["can_edit_home_based"], student_id == 1)
                    for period in ("PRE", "MID", "POST"):
                        self.assertFalse(data["summary"][period]["is_published"])
                        self.assertIsNone(data["summary"][period]["standardScore"])

    def test_child_acl_parity_follows_enrolled_section_and_adviser_handovers(self):
        flags = {key: index % 2 == 0 for index, key in enumerate(ParentPermissions.model_fields)}
        other_flags = {key: not value for key, value in flags.items()}
        with self.sessions() as db:
            db.add(FamilyAccess(parent_id=1, student_id=3, status="SYNCED"))
            db.commit()
        for actor, values in ((2, flags), (3, other_flags)):
            response = self.call("PUT", "/api/teachers/me/access", actor, json=values)
            self.assertEqual(response.status_code, 200, response.text)

        def assert_parity(expected):
            for path in ("/api/students/my-child", "/api/students/linked", "/api/parents/children"):
                response = self.call("GET", path, 5)
                self.assertEqual(response.status_code, 200, response.text)
                children = {row["student_id"]: row for row in response.json()}
                self.assertEqual(set(children), set(expected))
                for student_id, values in expected.items():
                    self.assertEqual({key: children[student_id][key] for key in values}, values)
            for student_id, values in expected.items():
                detail = self.call("GET", f"/api/students/{student_id}", 5)
                self.assertEqual(detail.status_code, 200, detail.text)
                self.assertEqual({key: detail.json()[key] for key in values}, values)
                assessment = self.call("GET", f"/api/eccd/parent/assessment/{student_id}", 5)
                self.assertEqual(assessment.status_code, 200, assessment.text)
                self.assertEqual(assessment.json()["permissions"], values)
                readiness = self.call("GET", f"/api/ml/parent/readiness/{student_id}", 5)
                self.assertEqual(readiness.status_code, 200, readiness.text)
                self.assertEqual(readiness.json()["allow_parent_predictions"], values["allow_parent_predictions"])

        assert_parity({1: flags, 3: other_flags})
        response = self.call("PUT", "/api/chairman/students/transfer", json={
            "student_ids": [1], "new_section_id": 2})
        self.assertEqual(response.status_code, 200, response.text)
        assert_parity({1: other_flags, 3: other_flags})
        response = self.call("POST", "/api/chairman/sections/2/assign-teacher", json={"teacher_id": 1})
        self.assertEqual(response.status_code, 200, response.text)
        assert_parity({1: flags, 3: flags})
        with self.sessions() as db:
            db.get(User, 2).is_active = False
            db.commit()
        self.assertEqual(self.call("GET", "/api/students/my-child", 5).json(), [])
        self.assertEqual(self.call("GET", "/api/students/1", 5).status_code, 403)

    def test_marks_and_official_score_release_are_independent_across_all_domains(self):
        with self.sessions() as db:
            questions = db.query(EccdQuestion).order_by(EccdQuestion.question_id).all()
            expected = {q.question_id: "KAYA" if q.question_id % 2 else "DI-KAYA" for q in questions}
            for period in ("PRE", "MID", "POST"):
                for question in questions:
                    db.add(StudentEccdEvaluation(student_id=1, question_id=question.question_id,
                        testing_period=period, answer=expected[question.question_id], teacher_id=1,
                        evaluation_date=date(2026, 8, 10), teacher_evaluation_date=date(2026, 8, 10)))
            db.commit()
        for marks in (False, True):
            for scores in (False, True):
                with self.subTest(marks=marks, scores=scores):
                    response = self.call("PUT", "/api/teachers/settings", 2, json={
                        "allow_parent_view_eccd_marks": marks,
                        **{f"allow_parent_view_eccd_{p}": scores for p in ("pre", "mid", "post")}})
                    self.assertEqual(response.status_code, 200, response.text)
                    data = self.call("GET", "/api/eccd/parent/assessment/1", 5).json()
                    self.assertEqual(len(data["domains"]), 7)
                    self.assertEqual(data["allow_parent_view_eccd_marks"], marks)
                    for question in [q for d in data["domains"] for q in d["questions"]] + data["homeBasedChecklist"]:
                        for period in ("PRE", "MID", "POST"):
                            self.assertEqual(question["answers"][period], expected[question["question_id"]] if marks else None)
                            self.assertEqual(question["evaluator_roles"][period], "teacher" if marks else None)
                    for period in ("PRE", "MID", "POST"):
                        self.assertEqual(data["summary"][period]["is_published"], scores)
                        self.assertEqual(data["summary"][period]["standardScore"] is not None, scores)
                        self.assertEqual(data["matrix"][0]["scores"][period] is not None, scores)
                    # Read permission must not enable writes in closed periods.
                    self.assertEqual(self.save("MID").status_code, 403)
        self.assertEqual(self.call("GET", "/api/eccd/parent/assessment/1", 6).status_code, 403)
        with self.sessions() as db:
            db.query(SectionTeacher).filter_by(section_id=1, status="Active").update({"status": "Inactive"})
            db.commit()
        self.assertEqual(self.call("GET", "/api/eccd/parent/assessment/1", 5).status_code, 403)

    def test_hidden_marks_keep_only_own_home_answers_in_editable_periods(self):
        self.assertEqual(self.save().status_code, 200)
        data = self.call("GET", "/api/eccd/parent/assessment/1", 5).json()
        home = lambda data: next(q for q in data["homeBasedChecklist"] if q["question_id"] == self.fixture.home)
        self.assertEqual(home(data)["answers"]["PRE"], "KAYA")
        with self.sessions() as db:
            db.add(FamilyAccess(parent_id=2, student_id=1, status="SYNCED"))
            db.commit()
        self.assertIsNone(home(self.call("GET", "/api/eccd/parent/assessment/1", 6).json())["answers"]["PRE"])
        self.assertEqual(self.update({**FLAGS, "pre_test_parent_editable": False}).status_code, 200)
        self.assertIsNone(home(self.call("GET", "/api/eccd/parent/assessment/1", 5).json())["answers"]["PRE"])
        self.assertEqual(self.update().status_code, 200)
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_edit_home_based_eccd = False
            db.commit()
        self.assertIsNone(home(self.call("GET", "/api/eccd/parent/assessment/1", 5).json())["answers"]["PRE"])

    def test_marks_migration_defaults_preserves_records_and_is_idempotent(self):
        self.assertEqual(self.save().status_code, 200)
        before_evaluations = self.evaluation_rows()
        with self.fixture.test_engine.begin() as connection:
            connection.execute(text("ALTER TABLE teachers DROP COLUMN allow_parent_view_eccd_marks"))
            self.assertTrue(apply_parent_eccd_marks(connection, self.fixture.schema))
            self.assertFalse(connection.execute(text("SELECT bool_or(allow_parent_view_eccd_marks) FROM teachers")).scalar_one())
            connection.execute(text("UPDATE teachers SET allow_parent_view_eccd_marks = true WHERE teacher_id = 1"))
            self.assertFalse(apply_parent_eccd_marks(connection, self.fixture.schema))
            check_parent_eccd_marks(connection, self.fixture.schema)
            self.assertTrue(connection.execute(text("SELECT allow_parent_view_eccd_marks FROM teachers WHERE teacher_id = 1")).scalar_one())
        self.assertEqual(self.evaluation_rows(), before_evaluations)

    def test_marks_backup_retains_true_and_defaults_old_backups_to_false(self):
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_view_eccd_marks = True
            db.commit()
            payload = export_backup(db)
            restore_backup(db, payload)
            self.assertTrue(db.get(Teacher, 1).allow_parent_view_eccd_marks)
            data = BackupDocument.model_validate_json(cipher().decrypt(payload)).model_dump(mode="json")
            for teacher in data["teachers"]:
                teacher.pop("allow_parent_view_eccd_marks")
            old_payload = cipher().encrypt(BackupDocument.model_validate(data).model_dump_json().encode())
            restore_backup(db, old_payload)
            db.expire_all()
            self.assertFalse(db.get(Teacher, 1).allow_parent_view_eccd_marks)
