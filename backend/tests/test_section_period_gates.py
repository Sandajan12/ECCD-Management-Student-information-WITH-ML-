"""Section-wide teacher sequencing; parent windows remain independent."""
from datetime import date
import unittest

from backend.models import EccdDomain, EccdQuestion, Section, Student, StudentEccdEvaluation, Teacher
from backend.tests import test_phase2
from backend.tests.assessment_fixtures import complete_period


class SectionPeriodGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call, self.sessions = self.fixture.call, self.fixture.sessions

    def save(self, period, student_id=1):
        return self.call("POST", "/api/eccd/evaluate", 2, json={
            "student_id": student_id, "testing_period": period,
            "assessment_date": {"PRE": "2026-08-01", "MID": "2026-09-01", "POST": "2026-10-01"}[period],
            "answers": {str(self.fixture.nonhome): "DI-KAYA"},
        })

    def gates(self, actor=2, section=1):
        return self.call("GET", f"/api/eccd/section/{section}/period-gates", actor)

    def test_one_incomplete_classmate_blocks_then_all_complete_unlocks(self):
        with self.sessions() as db:
            db.add(Student(student_id=4, first_name="Remaining", middle_name="Middle", last_name="Learner", section_id=1, is_active=True))
            db.commit()
            complete_period(db)
        for period in ("MID", "POST"):
            response = self.save(period)
            self.assertEqual(response.status_code, 409, response.text)
            self.assertIn("PRE", response.json()["detail"])
            self.assertIn("1 remaining", response.json()["detail"])
        state = self.gates().json()
        self.assertEqual([s["student_id"] for s in state["prerequisites"]["PRE"]], [4])
        self.assertEqual(state["prerequisites"]["PRE"][0]["full_name"], "Remaining Middle Learner")
        with self.sessions() as db:
            self.assertEqual(db.query(StudentEccdEvaluation).filter_by(testing_period="MID").count(), 0)
            complete_period(db, student_id=4)
        self.assertEqual(self.save("MID").status_code, 200)
        response = self.save("POST")
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn("MID", response.json()["detail"])
        with self.sessions() as db:
            complete_period(db, period="MID", when=date(2026, 9, 1))
            complete_period(db, student_id=4, period="MID", when=date(2026, 9, 1))
        self.assertEqual(self.save("POST").status_code, 200)
        # Archived student 2 and active other-section student 3 do not block.
        self.assertEqual(self.gates().json()["prerequisites"], {"PRE": [], "MID": []})

    def test_saved_parent_answers_need_official_date_and_missing_indicator_blocks(self):
        with self.sessions() as db:
            complete_period(db)
            rows = db.query(StudentEccdEvaluation).filter_by(student_id=1, testing_period="PRE").all()
            for row in rows:
                row.teacher_evaluation_date = None
                row.evaluator_role = "parent"
            db.commit()
        state = self.gates().json()
        child = state["prerequisites"]["PRE"][0]
        self.assertEqual(child["saved_count"], state["required_question_count"])
        self.assertTrue(child["missing_testing_date"])
        self.assertEqual(child["masked_lrn"], "\u2022" * 8 + "7890")
        self.assertEqual(self.save("MID").status_code, 409)
        self.assertEqual(self.save("PRE").status_code, 200)
        self.assertEqual(self.save("MID").status_code, 200)
        with self.sessions() as db:
            db.query(StudentEccdEvaluation).filter_by(student_id=1, question_id=self.fixture.home, testing_period="PRE").delete()
            db.commit()
        self.assertEqual(self.save("MID").status_code, 409)

    def test_custom_questions_required_and_virtual_kaya_never_completes_mid(self):
        with self.sessions() as db:
            db.add(EccdDomain(domain_id=8, domain_name="Custom"))
            db.flush()
            db.add(EccdQuestion(domain_id=8, question_text="Extra required indicator", sequence_order=1, is_home_based=False))
            db.commit()
            complete_period(db)
            row = db.query(StudentEccdEvaluation).filter_by(student_id=1, question_id=self.fixture.home, testing_period="PRE").one()
            row.answer = "KAYA"
            db.commit()
        self.assertEqual(self.save("POST").status_code, 409)
        state = self.gates().json()
        self.assertEqual(state["required_question_count"], 110)
        self.assertEqual(state["prerequisites"]["MID"][0]["saved_count"], 0)
        with self.sessions() as db:
            db.query(StudentEccdEvaluation).filter_by(student_id=1, testing_period="PRE").filter(StudentEccdEvaluation.question_id != self.fixture.home).delete()
            db.commit()
        self.assertEqual(self.save("MID").status_code, 409)

    def test_parent_window_is_independent_and_gate_endpoint_authorized(self):
        self.assertEqual(self.gates(actor=5).status_code, 403)
        self.assertEqual(self.gates(section=2).status_code, 403)
        self.assertEqual(self.gates(actor=1, section=99999).status_code, 404)
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_edit_home_based_eccd = True
            db.get(Section, 1).mid_test_parent_editable = True
            db.commit()
        payload = {"student_id": 1, "testing_period": "MID", "evaluations": [{"question_id": self.fixture.home, "testing_period": "MID", "answer": "KAYA"}]}
        self.assertEqual(self.call("POST", "/api/eccd/parent/evaluate", 5, json=payload).status_code, 200)
        self.assertEqual(self.save("MID").status_code, 409)
        with self.sessions() as db:
            db.get(Section, 1).mid_test_parent_editable = False
            db.commit()
        self.assertEqual(self.call("POST", "/api/eccd/parent/evaluate", 5, json=payload).status_code, 403)
