"""Bounded queries, worker isolation and additive index migration regressions."""
import asyncio
from datetime import date
import threading
import unittest
from unittest.mock import AsyncMock, patch

from sqlalchemy import event, text

from backend.config.settings import settings
from backend.migrations import production_performance as migration
from backend.migrations.phase1 import MigrationError
from backend.migrations.phase2 import digest_table
from backend.models import Base, FamilyAccess, Parent, Section, Student, User
from backend.models.user import UserRole
from backend.tests import test_phase2


class ProductionPerformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call = self.fixture.call

    def query_count(self, path, user=1):
        queries = []

        def capture(connection, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith("SELECT"):
                queries.append(statement)

        event.listen(self.fixture.test_engine, "before_cursor_execute", capture)
        try:
            response = self.call("GET", path, user)
        finally:
            event.remove(self.fixture.test_engine, "before_cursor_execute", capture)
        self.assertEqual(response.status_code, 200, response.text)
        return len(queries), response.json()

    def grow_roster(self):
        with self.fixture.sessions() as db:
            for number in range(10, 22):
                account = User(user_id=number, email=f"perf{number}@example.com",
                               password_hash=self.fixture.password_hash, role=UserRole.USER,
                               is_active=True, is_first_login=False)
                db.add(account)
                db.flush()
                parent = Parent(user_id=number, fullname=f"Performance Parent {number}")
                db.add(parent)
                student = Student(lrn_number=f"{number:012d}", first_name=f"Learner{number}",
                                  last_name="Performance", date_of_birth=date(2021, 1, 1),
                                  section_id=1, school_year="2026-2027", is_active=True)
                db.add(student)
                db.flush()
                db.add_all([FamilyAccess(parent_id=parent.parent_id, student_id=student.student_id),
                            FamilyAccess(parent_id=1, student_id=student.student_id)])
                db.add(Section(section_name=f"Unassigned {number}"))
            db.commit()

    def test_list_queries_do_not_grow_per_student_contact_or_section(self):
        cases = [("/api/chairman/students", 1), ("/api/eccd/students", 2),
                 ("/api/students/section/1", 2), ("/api/students/linked", 5),
                 ("/api/messages/contacts", 2), ("/api/messages/contacts", 5),
                 ("/api/chairman/sections", 1)]
        before = {case: self.query_count(*case)[0] for case in cases}
        self.grow_roster()
        for case in cases:
            with self.subTest(path=case[0], user=case[1]):
                count, payload = self.query_count(*case)
                self.assertLessEqual(count, before[case] + 1, (before[case], count))
                if case == ("/api/messages/contacts", 2):
                    self.assertEqual(len(payload["contacts"]), 13)
                if case == ("/api/messages/contacts", 5):
                    self.assertEqual(len(payload["contacts"]), 1)

    def test_contacts_revoke_pending_archived_and_inactive_relationships(self):
        self.assertEqual(len(self.query_count("/api/messages/contacts", 2)[1]["contacts"]), 1)
        with self.fixture.sessions() as db:
            link = db.query(FamilyAccess).filter_by(parent_id=1, student_id=1).one()
            link.status = "PENDING"
            db.commit()
        for user in (2, 5):
            self.assertEqual(self.query_count("/api/messages/contacts", user)[1]["contacts"], [])
        with self.fixture.sessions() as db:
            db.query(FamilyAccess).filter_by(parent_id=1, student_id=1).update({"status": "SYNCED"})
            db.get(Student, 1).is_active = False
            db.commit()
        for user in (2, 5):
            self.assertEqual(self.query_count("/api/messages/contacts", user)[1]["contacts"], [])
        with self.fixture.sessions() as db:
            db.get(Student, 1).is_active = True
            db.get(User, 2).is_active = False
            db.commit()
        self.assertEqual(self.query_count("/api/messages/contacts", 5)[1]["contacts"], [])

    def test_missing_transfer_id_is_atomic(self):
        response = self.call("PUT", "/api/chairman/students/transfer",
                             json={"student_ids": [1, 999999], "new_section_id": 2})
        self.assertEqual(response.status_code, 404, response.text)
        with self.fixture.sessions() as db:
            self.assertEqual(db.get(Student, 1).section_id, 1)

    def test_auth_database_stays_off_email_event_loop(self):
        db_threads, email_threads = [], []

        def capture(connection, cursor, statement, parameters, context, executemany):
            try:
                asyncio.get_running_loop()
            except RuntimeError:
                db_threads.append(threading.get_ident())
            else:
                self.fail("Synchronous auth SQL executed on an event loop")

        async def mail(email, otp):
            asyncio.get_running_loop()
            email_threads.append(threading.get_ident())

        event.listen(self.fixture.test_engine, "before_cursor_execute", capture)
        try:
            with patch.object(settings, "ENABLE_OTP", True), patch("backend.routes.auth.send_otp_email", side_effect=mail):
                response = self.fixture.login()
        finally:
            event.remove(self.fixture.test_engine, "before_cursor_execute", capture)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["requireOtp"])
        self.assertTrue(db_threads)
        self.assertEqual(len(email_threads), 1)
        self.assertFalse(set(db_threads) & set(email_threads))

    def test_index_migration_preserves_all_rows_and_is_idempotent(self):
        with self.fixture.test_engine.begin() as connection:
            # Exercise an upgrade rather than only metadata.create_all indexes.
            for index in migration.INDEXES:
                index.drop(connection, checkfirst=True)
            before = {name: digest_table(connection, name) for name in Base.metadata.tables}
            self.assertTrue(migration.apply_production_performance(connection, self.fixture.schema))
            migration.check_production_performance(connection, self.fixture.schema)
            self.assertFalse(migration.apply_production_performance(connection, self.fixture.schema))
            self.assertEqual(before, {name: digest_table(connection, name) for name in Base.metadata.tables})

    def test_index_migration_rejects_wrong_existing_definition(self):
        with self.fixture.test_engine.begin() as connection:
            connection.execute(text("DROP INDEX IF EXISTS idx_students_school_year"))
            connection.execute(text("CREATE INDEX idx_students_school_year ON students (is_active)"))
        with self.assertRaises(MigrationError), self.fixture.test_engine.begin() as connection:
            migration.apply_production_performance(connection, self.fixture.schema)


class SocketConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_slow_old_leave_cannot_remove_a_new_room_selection(self):
        from backend.utils import realtime

        started, release = threading.Event(), threading.Event()
        room = "teacher-1-parent-1"
        memberships = ["race"]

        def authenticate(token):
            started.set()
            if not release.wait(5):
                raise AssertionError("Worker release timed out")

        async def enter(sid, selected):
            memberships.append(selected)

        with patch.dict(realtime.connections, {"race": "token"}, clear=True), \
                patch.dict(realtime.generations, {}, clear=True), \
                patch.object(realtime, "socket_budget", new=AsyncMock(return_value=None)), \
                patch.object(realtime, "authenticate_socket", side_effect=authenticate), \
                patch.object(realtime, "authorize_socket", return_value=True), \
                patch.object(realtime.sio, "rooms", side_effect=lambda sid: list(memberships)), \
                patch.object(realtime.sio, "enter_room", side_effect=enter), \
                patch.object(realtime.sio, "leave_room", new=AsyncMock()) as leave, \
                patch.object(realtime.sio, "emit", new=AsyncMock()):
            old_leave = asyncio.create_task(realtime.leave_room("race", room))
            try:
                self.assertTrue(await asyncio.to_thread(started.wait, 2))
                self.assertTrue((await realtime.join_room("race", room))["success"])
            finally:
                release.set()
            self.assertFalse((await old_leave)["success"])
            self.assertIn(room, memberships)
            leave.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
