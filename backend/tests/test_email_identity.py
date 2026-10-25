"""Email-only identity, editable Chairman names and encrypted backup contracts."""
import json
import unittest

from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from backend.models import SystemLog, SystemSettings, User
from backend.tests import test_phase2
from backend.utils.backups import cipher, export_backup, restore_backup


class EmailIdentityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_phase2.BackendTests.setUpClass()

    def setUp(self):
        self.fixture = test_phase2.BackendTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)

    def test_chairman_name_updates_sessions_and_audit_names(self):
        f = self.fixture
        response = f.call('PUT', '/api/settings/update', json={'chairman_name': '  Maria Santos  '})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['settings']['chairman_name'], 'Maria Santos')
        self.assertEqual(f.client.get('/api/settings').json()['chairman_name'], 'Maria Santos')
        self.assertEqual(f.login('chairman').json()['user']['full_name'], 'Maria Santos')
        with f.sessions() as db:
            db.add_all(SystemLog(user_id=actor, action_type='IDENTITY', details='Name check') for actor in (1, 2, 5))
            db.commit()
        logs = f.call('GET', '/api/analytics/logs').json()
        actors = {row['actor_name'] for row in logs if row['action'] == 'IDENTITY'}
        self.assertEqual(actors, {'Maria Santos', 'Test Adviser', 'Test Parent'})
        self.assertTrue(all(row['performed_by'] == row['actor_name'] for row in logs))
        self.assertEqual(f.call('PUT', '/api/settings/update', json={'chairman_name': ''}).status_code, 200)
        self.assertEqual(f.login('chairman').json()['user']['full_name'], 'Chairman')
        self.assertEqual(f.call('PUT', '/api/settings/update', json={'chairman_name': None}).status_code, 200)
        self.assertEqual(f.call('PUT', '/api/settings/update', json={'chairman_name': 'a' * 256}).status_code, 422)
        self.assertEqual(f.call('PUT', '/api/settings/update', 2, json={'chairman_name': 'Forbidden'}).status_code, 403)

    def test_database_rejects_case_variant_and_routes_normalize_emails(self):
        f = self.fixture
        columns = {column['name'] for column in inspect(f.test_engine).get_columns('users', schema=f.schema)}
        self.assertNotIn('username', columns)
        with f.sessions() as db:
            db.add(User(email='ADVISER@EXAMPLE.COM', password_hash='unused', role='user'))
            with self.assertRaises(IntegrityError):
                db.flush()
            db.rollback()
        created = f.client.post('/api/auth/register-parent', json={
            'email': ' NEW.PARENT@EXAMPLE.COM ', 'firstName': 'New', 'lastName': 'Parent',
            'password': test_phase2.PASSWORD,
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()['user']['email'], 'new.parent@example.com')
        logged = f.client.post('/api/auth/login', json={'email': ' NEW.PARENT@example.com ', 'password': test_phase2.PASSWORD})
        self.assertEqual(logged.status_code, 200, logged.text)
        teacher = f.call('POST', '/api/chairman/teachers', json={
            'first_name': 'New', 'last_name': 'Teacher', 'email': ' MIXED.TEACHER@EXAMPLE.COM ',
            'password': test_phase2.PASSWORD, 'section_id': 2,
        })
        self.assertEqual(teacher.status_code, 201, teacher.text)
        with f.sessions() as db:
            self.assertEqual(db.get(User, teacher.json()['user_id']).email, 'mixed.teacher@example.com')
        duplicate = f.call('PUT', f"/api/teachers/{teacher.json()['user_id']}", json={'email': ' PARENT@EXAMPLE.COM '})
        self.assertEqual(duplicate.status_code, 400, duplicate.text)

    def test_backup_has_no_retired_identity_field_and_restores_chairman_name(self):
        f = self.fixture
        with f.sessions() as db:
            db.get(SystemSettings, 1).chairman_name = 'Backup Chairman'
            db.commit()
            payload = export_backup(db)
            document = json.loads(cipher().decrypt(payload))
            self.assertTrue(all('username' not in row for row in document['users']))
            self.assertEqual(document['system_settings'][0]['chairman_name'], 'Backup Chairman')
            db.get(SystemSettings, 1).chairman_name = 'Changed'
            db.commit()
            restore_backup(db, payload)
            self.assertEqual(db.get(SystemSettings, 1).chairman_name, 'Backup Chairman')
            # Old encrypted account snapshots are ignored, never restored.
            for row in document['users']:
                row['username'] = 'Retired field'
            document['system_settings'][0].pop('chairman_name')
            restore_backup(db, cipher().encrypt(json.dumps(document).encode()))
            self.assertIsNone(db.get(SystemSettings, 1).chairman_name)
            self.assertEqual(db.get(User, 1).email, 'chairman@example.com')


if __name__ == '__main__':
    unittest.main()
