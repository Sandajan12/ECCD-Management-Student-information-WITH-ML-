"""Automatic ordering and migration checks in disposable PostgreSQL schemas."""
from concurrent.futures import ThreadPoolExecutor
import json
import unittest

from fastapi import HTTPException
from sqlalchemy import event, text

from backend.migrations.eccd_question_sequence import (
    VERSION, apply_eccd_question_sequence, check_eccd_question_sequence,
)
from backend.migrations.phase1 import MigrationError
from backend.migrations.phase2 import digest_table
from backend.models import EccdQuestion, StudentEccdEvaluation
from backend.routes.eccd_config import add_question, update_question
from backend.schemas.eccd_config import QuestionCreate, QuestionEdit
from backend.tests import test_phase2
from backend.utils.backups import cipher, export_backup, restore_backup


class QuestionOrderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.call, self.sessions = self.fixture.call, self.fixture.sessions

    def test_append_aliases_ignore_legacy_number_and_edits_preserve_position(self):
        first = self.call('POST', '/api/eccd-config/questions', json={
            'domain_id': 1, 'question_text': 'First extra'})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()['sequence_order'], 14)
        second = self.call('POST', '/api/chairman/eccd-questions', json={
            'domain_id': 1, 'question_text': 'Second extra', 'sequence_order': 1})
        self.assertEqual(second.status_code, 200, second.text)
        first_id, second_id = first.json()['question_id'], second.json()['question_id']
        edited = self.call('PUT', f'/api/chairman/eccd-questions/{first_id}', json={
            'question_text': 'Updated text', 'sequence_order': 1, 'is_home_based': True})
        self.assertEqual(edited.status_code, 200, edited.text)
        with self.sessions() as db:
            self.assertEqual(db.get(EccdQuestion, first_id).sequence_order, 14)
            self.assertTrue(db.get(EccdQuestion, first_id).is_home_based)
            self.assertEqual(db.get(EccdQuestion, second_id).sequence_order, 15)

    def test_gaps_empty_domain_moves_and_assessment_preservation(self):
        self.assertEqual(self.fixture.evaluate(answers={'1': 1}).status_code, 200)
        with self.sessions() as db:
            before = [dict(row) for row in db.execute(StudentEccdEvaluation.__table__.select()).mappings()]
        self.assertEqual(self.call('DELETE', '/api/eccd-config/questions/2').status_code, 200)
        added = self.call('POST', '/api/eccd-config/questions', json={
            'domain_id': 1, 'question_text': 'After gap'})
        self.assertEqual(added.json()['sequence_order'], 14)
        moved = self.call('PUT', '/api/eccd-config/questions/1', json={
            'domain_id': 2, 'question_text': 'Moved skill'})
        self.assertEqual(moved.status_code, 200, moved.text)
        with self.sessions() as db:
            self.assertEqual((db.get(EccdQuestion, 1).domain_id, db.get(EccdQuestion, 1).sequence_order), (2, 12))
            self.assertEqual(before, [dict(row) for row in db.execute(StudentEccdEvaluation.__table__.select()).mappings()])
        domain = self.call('POST', '/api/eccd-config/domains', json={'domain_name': 'Custom domain'}).json()['domain_id']
        first = self.call('POST', '/api/eccd-config/questions', json={'domain_id': domain, 'question_text': 'First'})
        self.assertEqual(first.json()['sequence_order'], 1)

    def test_simultaneous_appends_and_domain_move_share_allocation_lock(self):
        def append(number):
            with self.sessions() as db:
                question = add_question(QuestionCreate(domain_id=2, question_text=f'Concurrent {number}'), db, None)
                return question.sequence_order

        def move():
            with self.sessions() as db:
                update_question(1, QuestionEdit(domain_id=2, question_text='Moved'), db, None)
                return db.get(EccdQuestion, 1).sequence_order

        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(append, number) for number in range(3)] + [pool.submit(move)]
            positions = [future.result(timeout=30) for future in futures]
        self.assertEqual(sorted(positions), [12, 13, 14, 15])

    def test_duplicate_backup_restore_is_atomic(self):
        with self.sessions() as db:
            before = {name: digest_table(db.connection(), name) for name in ('eccd_questions', 'students', 'users')}
            document = json.loads(cipher().decrypt(export_backup(db)))
            document['eccd_questions'][1]['sequence_order'] = document['eccd_questions'][0]['sequence_order']
            document['eccd_questions'][1]['domain_id'] = document['eccd_questions'][0]['domain_id']
            with self.assertRaises(HTTPException) as caught:
                restore_backup(db, cipher().encrypt(json.dumps(document).encode()))
            self.assertEqual(caught.exception.status_code, 400)
            self.assertEqual(before, {name: digest_table(db.connection(), name) for name in before})

    def test_external_writer_conflict_returns_409_and_session_is_usable(self):
        with self.sessions() as db:
            # An external writer can change an existing sequence without the domain lock.
            def occupy_next_sequence(session, context, instances):
                with self.sessions() as other:
                    other.execute(text('UPDATE eccd_questions SET sequence_order=14 WHERE question_id=1'))
                    other.commit()

            event.listen(db, 'before_flush', occupy_next_sequence, once=True)
            with self.assertRaises(HTTPException) as caught:
                add_question(QuestionCreate(domain_id=1, question_text='Conflicting insert'), db, None)
            self.assertEqual(caught.exception.status_code, 409)
            self.assertEqual(db.query(EccdQuestion).filter_by(question_text='Conflicting insert').count(), 0)
            self.assertEqual(db.get(EccdQuestion, 1).sequence_order, 14)

    def test_migration_reports_duplicates_then_upgrades_without_renumbering(self):
        with self.fixture.test_engine.begin() as connection:
            connection.execute(text('DROP INDEX idx_questions_domain_sequence'))
            connection.execute(text('CREATE INDEX idx_questions_domain_sequence ON eccd_questions (domain_id, sequence_order)'))
            connection.execute(text("INSERT INTO eccd_questions (question_id, domain_id, sequence_order, question_text) VALUES (999, 1, 1, 'Existing duplicate')"))
            before = digest_table(connection, 'eccd_questions')
        with self.assertRaisesRegex(MigrationError, r'domain_id=1, sequence_order=1, question_ids=\[1, 999\]'):
            with self.fixture.test_engine.begin() as connection:
                apply_eccd_question_sequence(connection, self.fixture.schema)
        with self.fixture.test_engine.begin() as connection:
            self.assertEqual(before, digest_table(connection, 'eccd_questions'))
            self.assertFalse(connection.execute(text('SELECT EXISTS (SELECT 1 FROM ames_schema_migrations WHERE version=:v)'), {'v': VERSION}).scalar_one())
            connection.execute(text('UPDATE eccd_questions SET sequence_order=14 WHERE question_id=999'))
            before = digest_table(connection, 'eccd_questions')
            self.assertTrue(apply_eccd_question_sequence(connection, self.fixture.schema))
            self.assertFalse(apply_eccd_question_sequence(connection, self.fixture.schema))
            check_eccd_question_sequence(connection, self.fixture.schema)
            self.assertEqual(before, digest_table(connection, 'eccd_questions'))
