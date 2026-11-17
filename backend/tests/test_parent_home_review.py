"""Review/photos exercise real HTTP authorization against disposable loopback schemas."""
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from PIL import Image
from backend.tests import test_phase2
from backend.models import ParentHomeObservation, HomeObservationPhoto, StudentEccdEvaluation, Teacher, Section, FamilyAccess, Student
from backend.models.eccd import TestingPeriod, EccdAnswer
from backend.utils.home_photos import LocalPhotoStorage, cleanup_photos, photo_storage, sanitize_photo
from backend.config.settings import settings
from backend.utils.eccd_dates import now_pht
from backend.utils.backups import export_backup, restore_backup
from backend.migrations.parent_home_observations import apply_parent_home_observations, check_parent_home_observations
from backend.tests.assessment_fixtures import complete_period


def image_bytes():
    image = Image.new("RGB", (40, 30), "green")
    exif = Image.Exif()
    exif[270] = "Private location"
    result = BytesIO()
    image.save(result, format="JPEG", exif=exif)
    return result.getvalue()


class ParentHomeReviewTests(unittest.TestCase):
    def test_photo_upload_and_submit_have_independent_account_budgets(self):
        from backend.utils.rate_limits import limits, POLICIES, request_policies
        limits.reset()
        self.addCleanup(limits.reset)
        for path in (f"/api/eccd/parent/home-photos/1/{self.q}/PRE", "/api/eccd/parent/evaluate"):
            self.assertNotIn("heavy", request_policies("POST", path))
        with patch.object(limits, "bypass", False):
            for _ in range(POLICIES["heavy"].limit + 1):
                exported = self.call("GET", "/api/backup/export", 5)
            self.assertEqual(exported.status_code, 429)
            # More than five photos from the same parent/IP must still work.
            for _ in range(7):
                uploaded = self.upload()
                self.assertEqual(uploaded.status_code, 200, uploaded.text)
                self.assertNotIn("Export or backup", uploaded.text)
            photo = uploaded.json()["photo_id"]
            submitted = self.submit(photo=photo)
            self.assertEqual(submitted.status_code, 200, submitted.text)
            self.assertNotIn("Export or backup", submitted.text)
            self.assertTrue(self.pending()[0]["has_photo"])

    def test_home_rate_limits_preserve_drafts_and_do_not_share_users_or_actions(self):
        from backend.utils.rate_limits import limits, POLICIES
        limits.reset()
        self.addCleanup(limits.reset)
        with patch.object(limits, "bypass", False):
            for _ in range(POLICIES["home-photo"].limit):
                limits.hit("home-photo", "5")
            blocked = self.upload()
            self.assertEqual(blocked.status_code, 429)
            self.assertIn("Photo upload limit", blocked.text)
            self.assertNotIn("Export or backup", blocked.text)
            self.assertGreater(int(blocked.headers["Retry-After"]), 0)
            self.assertEqual(self.upload(actor=6).status_code, 200)
            self.assertEqual(self.submit().status_code, 200)
            for _ in range(POLICIES["home-submit"].limit):
                limits.hit("home-submit", "5")
            blocked = self.submit()
            self.assertEqual(blocked.status_code, 429)
            self.assertIn("Observation submission limit", blocked.text)
            self.assertNotIn("Export or backup", blocked.text)
            with self.sessions() as db:
                self.assertEqual(db.query(ParentHomeObservation).count(), 1)

    def test_review_batch_blocks_conflicting_earlier_positive_and_preserves_undecided_photos(self):
        photo = self.upload().json()["photo_id"]
        self.submit(photo=photo)
        self.submit("MID", "DI-KAYA")
        rows = self.pending()
        self.assertEqual(self.review().status_code, 400)
        with self.sessions() as db:
            self.assertEqual(db.query(StudentEccdEvaluation).count(), 0)
        pre = next(r for r in rows if r["testing_period"] == "PRE")
        mid = next(r for r in rows if r["testing_period"] == "MID")
        self.assertEqual(self.review([mid["observation_id"]], "declined").status_code, 200)
        self.assertTrue(self.storage.objects)
        self.assertEqual(self.review([pre["observation_id"]]).status_code, 200)
        self.assertFalse(self.storage.objects)
        self.assertEqual(self.review([pre["observation_id"]], "declined").status_code, 409)

    def test_pending_photos_follow_current_adviser_and_archives_and_deletes_revoke_access(self):
        photo = self.upload().json()["photo_id"]
        self.submit(photo=photo)
        row = self.pending()[0]
        url = f'/api/eccd/home-observations/{row["observation_id"]}/photo'
        with self.sessions() as db:
            db.get(Student, 1).section_id = 2
            db.commit()
        self.assertFalse(self.pending())
        self.assertEqual(self.call("GET", url, 2).status_code, 403)
        self.assertEqual(self.call("GET", url, 3).status_code, 200)
        with self.sessions() as db:
            db.get(Student, 1).is_active = False
            db.commit()
        self.assertEqual(self.call("GET", url, 3).status_code, 404)
        self.assertEqual(self.review([row["observation_id"]], actor=3).status_code, 403)
        with self.sessions() as db:
            db.delete(db.get(Student, 1))
            db.commit()
            self.assertEqual(cleanup_photos(db, self.storage), 0)
        self.assertFalse(self.storage.objects)

    def test_migration_is_repeatable_and_checks_schema_without_touching_assessments(self):
        with self.fixture.test_engine.begin() as connection:
            check_parent_home_observations(connection, self.fixture.schema)
            self.assertFalse(apply_parent_home_observations(connection, self.fixture.schema))

    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call, self.sessions = self.fixture.call, self.fixture.sessions
        self.q = self.fixture.home
        self.storage = self.fixture.photo_storage
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_edit_home_based_eccd = True
            db.get(Teacher, 1).allow_parent_view_eccd_marks = True
            db.get(Section, 1).mid_test_parent_editable = True
            db.get(Section, 1).post_test_parent_editable = True
            db.add(FamilyAccess(parent_id=2, student_id=1, status="SYNCED"))
            db.commit()

    def submit(self, period="PRE", answer="KAYA", photo=None, actor=5, question=None):
        q = question or self.q
        return self.call("POST", "/api/eccd/parent/evaluate", actor, json={"student_id": 1, "testing_period": period,
            "evaluations": [{"question_id": q, "testing_period": period, "answer": answer}],
            "photo_ids": {str(q): photo} if photo else {}})

    def pending(self):
        response = self.call("GET", "/api/eccd/home-observations/pending", 2)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def review(self, ids=None, status="accepted", actor=2):
        if ids is None:
            ids = [r["observation_id"] for r in self.pending()]
        return self.call("POST", "/api/eccd/home-observations/review", actor, json={"student_id": 1,
            "decisions": [{"observation_id": i, "status": status} for i in ids]})

    def question(self, actor=5):
        path = "/api/eccd/parent/assessment/1" if actor == 5 else "/api/eccd/assessment/1"
        data = self.call("GET", path, actor).json()
        return next(q for d in data["domains"] for q in d["questions"] if q["question_id"] == self.q)

    def upload(self, actor=5, period="PRE", data=None, mime="image/jpeg"):
        return self.call("POST", f"/api/eccd/parent/home-photos/1/{self.q}/{period}", actor,
                         files={"file": ("proof.jpg", image_bytes() if data is None else data, mime)})

    def test_partial_pending_no_scores_dates_counts_and_only_two_answers(self):
        self.assertEqual(self.submit(answer="unsure").status_code, 422)
        self.assertEqual(self.call("POST", "/api/eccd/parent/evaluate", 5, json={"student_id": 1,"evaluations": []}).status_code, 422)
        response = self.submit()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["review_required"])
        self.assertEqual(self.submit().status_code, 200)
        with self.sessions() as db:
            self.assertEqual(db.query(StudentEccdEvaluation).count(), 0)
            self.assertEqual(db.query(ParentHomeObservation).count(), 1)
        row = self.question()
        self.assertIsNone(row["answers"]["PRE"])
        self.assertTrue(row["parent_locked"]["PRE"])
        self.assertIsNone(row["carry_forward"]["MID"])
        self.assertEqual(row["home_observations"]["PRE"]["status"], "pending")
        self.assertEqual(self.submit(answer="DI-KAYA").status_code, 409)
        self.assertEqual(self.submit(actor=6).status_code, 409)
        self.assertFalse(self.pending()[0]["has_photo"])

    def test_accept_confirms_carry_without_official_date_or_later_rows(self):
        self.assertEqual(self.submit().status_code, 200)
        ids = [r["observation_id"] for r in self.pending()]
        self.assertEqual(self.review(ids).status_code, 200)
        self.assertEqual(self.review(ids).status_code, 200)
        for actor in (2, 5):
            row = self.question(actor)
            self.assertEqual(row["carry_forward"]["MID"], "locked")
            self.assertEqual(row["carry_forward"]["POST"], "locked")
            self.assertIsNone(row["answers"]["MID"])
        with self.sessions() as db:
            saved = db.query(StudentEccdEvaluation).one()
            self.assertEqual(saved.evaluator_role, "parent")
            self.assertEqual(saved.parent_id, 1)
            self.assertIsNone(saved.teacher_evaluation_date)
            self.assertIsNone(saved.teacher_marked_at)
        self.assertEqual(self.submit("MID", "DI-KAYA").status_code, 400)
        self.assertEqual(self.submit("MID").status_code, 200)
        self.assertEqual(self.review().status_code, 200)
        self.assertEqual(self.submit("POST", "DI-KAYA").status_code, 400)
        gate = self.call("GET", "/api/eccd/section/1/period-gates", 2).json()
        self.assertTrue(gate["prerequisites"]["PRE"])

    def test_decline_no_answer_and_parent_can_resubmit(self):
        self.submit()
        self.assertEqual(self.review(status="declined").status_code, 200)
        with self.sessions() as db:
            self.assertEqual(db.query(StudentEccdEvaluation).count(), 0)
        self.assertEqual(self.question()["home_observations"]["PRE"]["status"], "declined")
        self.assertFalse(self.question()["parent_locked"]["PRE"])
        self.assertEqual(self.submit().status_code, 200)
        self.assertTrue(self.pending())
        self.assertEqual(self.review(status="declined").status_code, 200)
        response = self.fixture.evaluate(answers={str(self.q): 0})
        self.assertEqual(response.status_code, 200, response.text)

    def test_photos_validate_strip_private_delivery_and_delete_after_commit(self):
        response = self.upload()
        self.assertEqual(response.status_code, 200, response.text)
        photo = response.json()["photo_id"]
        stored = next(iter(self.storage.objects.values()))
        self.assertNotIn(b"Private location", stored)
        self.assertFalse(Image.open(BytesIO(stored)).getexif())
        self.assertEqual(self.submit(photo=photo).status_code, 200)
        row = self.pending()[0]
        url = f'/api/eccd/home-observations/{row["observation_id"]}/photo'
        self.assertEqual(self.call("GET", url, 5).headers["cache-control"], "no-store")
        self.assertEqual(self.call("GET", url, 6).status_code, 403)
        self.assertEqual(self.call("GET", url, 3).status_code, 403)
        self.assertEqual(self.call("GET", url, 2).status_code, 200)
        self.assertEqual(self.review(status="declined").status_code, 200)
        self.assertFalse(self.storage.objects)
        self.assertEqual(self.call("GET", url, 2).status_code, 404)

    def test_local_photo_upload_pending_preview_and_review_lifecycle(self):
        test_phase2.api.dependency_overrides.pop(photo_storage)
        with TemporaryDirectory() as temporary, patch("backend.utils.home_photos.LOCAL_PHOTO_DIR", Path(temporary) / "photos"), \
                patch.object(settings, "ENVIRONMENT", "development"), \
                patch.object(settings, "SUPABASE_STORAGE_URL", ""), \
                patch.object(settings, "SUPABASE_STORAGE_SERVICE_KEY", None), \
                patch("backend.utils.home_photos.httpx.Client") as remote:
            for decision in ("declined", "accepted"):
                uploaded = self.upload()
                self.assertEqual(uploaded.status_code, 200, uploaded.text)
                photo_id = uploaded.json()["photo_id"]
                file = Path(temporary) / "photos" / (photo_id + ".jpg")
                self.assertTrue(file.is_file())
                self.assertNotIn(b"Private location", file.read_bytes())
                self.assertEqual(self.submit(photo=photo_id).status_code, 200)
                row = self.pending()[0]
                self.assertTrue(row["has_photo"])
                url = f'/api/eccd/home-observations/{row["observation_id"]}/photo'
                preview = self.call("GET", url, 2)
                self.assertEqual(preview.status_code, 200)
                self.assertEqual(preview.headers["cache-control"], "no-store")
                self.assertEqual(preview.content, file.read_bytes())
                self.assertEqual(self.call("GET", url, 5).status_code, 200)
                self.assertEqual(self.call("GET", url, 6).status_code, 403)
                self.assertEqual(self.call("GET", url, 3).status_code, 403)
                self.assertEqual(self.fixture.client.get(url).status_code, 401)
                with self.sessions() as db:
                    self.assertEqual(db.get(HomeObservationPhoto, photo_id).object_key, "local/" + photo_id + ".jpg")
                    self.assertEqual(db.query(StudentEccdEvaluation).count(), 0)
                # A preview outage must not hide the observation or block its review.
                with patch.object(LocalPhotoStorage, "get", side_effect=HTTPException(503, "Photo unavailable.")):
                    self.assertEqual(self.call("GET", url, 2).status_code, 503)
                    self.assertEqual(self.pending()[0]["observation_id"], row["observation_id"])
                reviewed = self.review(status=decision)
                self.assertEqual(reviewed.status_code, 200, reviewed.text)
                self.assertEqual(reviewed.json()["cleanup_pending"], 0)
                self.assertFalse(file.exists())
                self.assertEqual(self.call("GET", url, 2).status_code, 404)
                self.assertFalse(self.pending())
            remote.assert_not_called()

    def test_local_photo_delete_failure_and_missing_file_preserve_review_and_retry(self):
        test_phase2.api.dependency_overrides.pop(photo_storage)
        with TemporaryDirectory() as temporary, patch("backend.utils.home_photos.LOCAL_PHOTO_DIR", Path(temporary) / "photos"), \
                patch.object(settings, "ENVIRONMENT", "development"), \
                patch.object(settings, "SUPABASE_STORAGE_URL", ""), \
                patch.object(settings, "SUPABASE_STORAGE_SERVICE_KEY", None):
            uploaded = self.upload()
            self.assertEqual(uploaded.status_code, 200, uploaded.text)
            photo_id = uploaded.json()["photo_id"]
            self.assertEqual(self.submit(photo=photo_id).status_code, 200)
            row = self.pending()[0]
            url = f'/api/eccd/home-observations/{row["observation_id"]}/photo'
            with patch.object(Path, "unlink", side_effect=PermissionError("file busy")):
                reviewed = self.review()
            self.assertEqual(reviewed.status_code, 200, reviewed.text)
            self.assertEqual(reviewed.json()["cleanup_pending"], 1)
            self.assertEqual(self.call("GET", url, 2).status_code, 404)
            file = Path(temporary) / "photos" / (photo_id + ".jpg")
            self.assertTrue(file.exists())
            # Simulate an externally removed file before retry; cleanup remains idempotent.
            file.unlink()
            with self.sessions() as db:
                self.assertEqual(db.query(StudentEccdEvaluation).count(), 1)
                self.assertTrue(db.get(HomeObservationPhoto, photo_id).delete_pending)
                self.assertEqual(cleanup_photos(db, photo_storage()), 0)
                self.assertIsNone(db.get(HomeObservationPhoto, photo_id).object_key)

    def test_photo_storage_failure_creates_no_pending_answer_and_no_photo_still_works(self):
        test_phase2.api.dependency_overrides.pop(photo_storage)
        with patch.object(settings, "ENVIRONMENT", "development"), \
                patch.object(settings, "SUPABASE_STORAGE_URL", ""), \
                patch.object(settings, "SUPABASE_STORAGE_SERVICE_KEY", None), \
                patch.object(LocalPhotoStorage, "put", side_effect=HTTPException(503, "Photo storage unavailable.")):
            failed = self.upload()
            self.assertEqual(failed.status_code, 503)
            self.assertFalse(self.pending())
            with self.sessions() as db:
                self.assertFalse(db.query(HomeObservationPhoto).one().ready)
                self.assertEqual(db.query(ParentHomeObservation).count(), 0)
                self.assertEqual(db.query(StudentEccdEvaluation).count(), 0)
            self.assertEqual(self.submit().status_code, 200)
            self.assertFalse(self.pending()[0]["has_photo"])

    def test_rejected_uploads_and_photo_alone_creates_no_answer(self):
        for data, mime in ((b"not an image", "image/jpeg"), (image_bytes(), "image/png"), (image_bytes(), "image/svg+xml")):
            self.assertEqual(self.upload(data=data, mime=mime).status_code, 400)
        self.assertEqual(self.upload(data=b"x" * (5 * 1024 * 1024 + 1)).status_code, 413)
        self.assertEqual(self.upload().status_code, 200)
        with self.sessions() as db:
            self.assertEqual(db.query(ParentHomeObservation).count(), 0)
            self.assertEqual(db.query(StudentEccdEvaluation).count(), 0)
        self.assertEqual(self.submit(photo="0" * 32).status_code, 409)
        large = BytesIO()
        Image.new("RGB", (8193, 1)).save(large, format="PNG")
        self.assertEqual(self.upload(data=large.getvalue(), mime="image/png").status_code, 400)

    def test_cleanup_failure_retry_revokes_read_without_undoing_acceptance(self):
        photo = self.upload().json()["photo_id"]
        self.submit(photo=photo)
        row = self.pending()[0]
        with patch.object(self.storage, "delete", side_effect=OSError("offline")):
            response = self.review()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["cleanup_pending"], 1)
        self.assertEqual(self.call("GET", f'/api/eccd/home-observations/{row["observation_id"]}/photo', 2).status_code, 404)
        with self.sessions() as db:
            self.assertEqual(db.query(StudentEccdEvaluation).count(), 1)
            self.assertTrue(db.get(HomeObservationPhoto, photo).delete_pending)
            self.assertEqual(cleanup_photos(db, self.storage), 0)
            self.assertIsNone(db.get(HomeObservationPhoto, photo).object_key)
        self.assertFalse(self.storage.objects)

    def test_stale_review_atomicity_and_pending_teacher_guard(self):
        self.submit()
        row = self.pending()[0]
        response = self.fixture.evaluate()
        self.assertEqual(response.status_code, 409)
        response = self.review([row["observation_id"], 99999])
        self.assertEqual(response.status_code, 409)
        self.assertEqual(len(self.pending()), 1)
        with self.sessions() as db:
            self.assertEqual(db.query(StudentEccdEvaluation).count(), 0)
        self.assertEqual(self.review(actor=3).status_code, 403)
        self.assertEqual(self.review(actor=5).status_code, 403)

    def test_photo_visibility_earlier_negatives_acceptance_and_correction(self):
        for period in ("PRE", "MID", "POST"):
            self.assertTrue(self.question()["photo_eligible"][period])
        self.submit(answer="DI-KAYA")
        self.review()
        self.assertTrue(self.question()["photo_eligible"]["MID"])
        self.submit("MID")
        self.review()
        self.assertFalse(self.question()["photo_eligible"]["POST"])
        self.assertEqual(self.upload(period="POST").status_code, 409)
        with self.sessions() as db:
            complete_period(db, when=__import__('datetime').date(2026, 8, 10), provisional_home=True)
            db.commit()
        response = self.call("POST", "/api/eccd/evaluate", 2, json={"student_id": 1,"testing_period":"MID","assessment_date":"2026-10-01","edited_question_ids":[self.q],"answers":{str(self.q): "DI-KAYA"}})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(self.question()["photo_eligible"]["POST"])

    def test_abandoned_and_student_deleted_photos_cleanup_and_backup(self):
        photo = self.upload().json()["photo_id"]
        with self.sessions() as db:
            db.get(HomeObservationPhoto, photo).created_at = now_pht() - timedelta(days=2)
            db.commit()
            self.assertEqual(cleanup_photos(db, self.storage), 0)
        self.assertFalse(self.storage.objects)
        photo = self.upload().json()["photo_id"]
        self.submit(photo=photo)
        with self.sessions() as db:
            snapshot = export_backup(db)
        self.review()
        with self.sessions() as db:
            restore_backup(db, snapshot)
            self.assertIsNone(db.get(HomeObservationPhoto, photo).object_key)
            self.assertFalse(db.get(HomeObservationPhoto, photo).ready)
            self.assertEqual(db.query(ParentHomeObservation).count(), 1)
        self.assertFalse(self.storage.objects)

    def test_windows_transfer_archives_and_hidden_mark_metadata(self):
        self.submit()
        with self.sessions() as db:
            db.get(Section, 1).pre_test_parent_editable = False
            db.commit()
        self.assertEqual(self.review().status_code, 200)
        with self.sessions() as db:
            db.get(Teacher, 1).allow_parent_view_eccd_marks = False
            db.commit()
        self.assertIsNone(self.question()["home_observations"]["PRE"]["answer"])
        self.assertEqual(self.question()["carry_forward"]["MID"], "restricted")
        self.assertEqual(self.submit("MID", "DI-KAYA").status_code, 400)
        with self.sessions() as db:
            db.get(Student, 1).section_id = 2
            db.commit()
        self.assertEqual(self.review([1]).status_code, 403)
