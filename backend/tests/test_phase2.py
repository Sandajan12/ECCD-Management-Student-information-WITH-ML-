"""Backend integration tests against isolated PostgreSQL schemas, never live data."""
import asyncio
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
import json
import re
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4
from zipfile import ZipFile

import openpyxl
from cryptography.fernet import Fernet
from openpyxl.utils.datetime import CALENDAR_MAC_1904, to_excel
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session, sessionmaker

from backend.config.database import engine, get_db
from backend.config.settings import settings
from backend.main import api, app
from backend.migrations.phase1 import apply_phase1, select_schema
from backend.migrations.phase2 import apply_phase2, check_phase2
from backend.migrations.adviser_takeover import apply_adviser_takeover
from backend.migrations.email_only_identity import apply_email_only_identity
from backend.models import Base, EccdQuestion, EmailVerification, FamilyAccess, Message, Parent, Section, SectionTeacher, Student, StudentEccdEvaluation, SystemLog, SystemSettings, Teacher, User, UserTrustedDevice
from backend.models.eccd import EccdAnswer, TestingPeriod
from backend.models.user import UserRole
from backend.utils.authentication import build_session, credential_version, digest
from backend.utils.backups import cipher, export_backup, restore_backup
from backend.utils.lrn import hash_lrn
from backend.utils.reference_data import seed_reference_data
from backend.utils.security import get_password_hash, verify_password
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores

PASSWORD = 'Example123'
LRN = '001234567890'


class BackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = get_password_hash(PASSWORD)

    def setUp(self):
        self.schema = 'phase2_test_' + uuid4().hex
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
            apply_phase1(connection, self.schema)
            apply_phase2(connection, self.schema)
            apply_adviser_takeover(connection, self.schema)
            apply_email_only_identity(connection, self.schema)
        self.test_engine = create_engine(engine.url, connect_args={'options': f'-csearch_path={self.schema},public'})
        self.sessions = sessionmaker(bind=self.test_engine, autoflush=False)
        with self.sessions() as db:
            seed_reference_data(db)
            accounts = [(1, 'chairman', UserRole.SUPER_ADMIN), (2, 'adviser', UserRole.ADMIN), (3, 'other', UserRole.ADMIN), (4, 'substitute', UserRole.ADMIN), (5, 'parent', UserRole.USER), (6, 'stranger', UserRole.USER)]
            db.add_all(User(user_id=i, email=f'{name}@example.com', password_hash=self.password_hash, role=role, is_active=True, is_first_login=False, is_registration_pending=False) for i, name, role in accounts)
            db.flush()
            db.add_all([Teacher(teacher_id=1, user_id=2, first_name='Test', last_name='Adviser'), Teacher(teacher_id=2, user_id=3, first_name='Other', last_name='Teacher'), Teacher(teacher_id=3, user_id=4, first_name='Test', last_name='Substitute', allow_parent_view_eccd_post=True, allow_parent_edit_home_based_eccd=True)])
            db.add_all([Parent(parent_id=1, user_id=5, fullname='Test Parent'), Parent(parent_id=2, user_id=6, fullname='Stranger')])
            db.flush()
            db.add_all([Section(section_id=1, section_name='Test A', adviser_teacher_id=1), Section(section_id=2, section_name='Test B', adviser_teacher_id=2)])
            db.flush()
            db.add_all([SectionTeacher(section_id=1, teacher_id=1, role='Primary Adviser', status='Active'), SectionTeacher(section_id=2, teacher_id=2, role='Primary Adviser', status='Active'), SectionTeacher(section_id=1, teacher_id=3, role='Primary Adviser', status='Inactive')])
            db.add(SystemSettings(id=1, current_school_year='2026-2027', school_name='TEST SCHOOL', principal_name='Test Principal', school_year_start_month=8))
            db.add_all([Student(student_id=1, lrn_number=LRN, first_name='Test', middle_name='Middle', last_name='Student', date_of_birth=date(2021,1,10), gender='Female', section_id=1, school_year='2026-2027', is_active=True), Student(student_id=2, lrn_number='009876543210', first_name='Old', last_name='Archive', section_id=1, school_year='2025-2026', is_active=False), Student(student_id=3, lrn_number='001111111111', first_name='Other', last_name='Class', section_id=2, school_year='2026-2027', is_active=True)])
            db.flush()
            db.add(FamilyAccess(parent_id=1, student_id=1, relationship_type='Mother'))
            db.flush()
            # Match explicit fixture IDs with each sequence before endpoint writes.
            for table in Base.metadata.sorted_tables:
                primary = list(table.primary_key.columns)[0]
                sequence = db.execute(text('SELECT pg_get_serial_sequence(:table,:column)'), {'table':table.name,'column':primary.name}).scalar_one()
                if sequence:
                    maximum = db.execute(select(primary).order_by(primary.desc()).limit(1)).scalar_one_or_none()
                    db.execute(text(f'ALTER SEQUENCE {sequence} RESTART WITH {(maximum or 0)+1}'))
            db.commit()
            self.tokens = {i:build_session(db,db.get(User,i))['token'] for i in range(1,7)}
            self.home = db.query(EccdQuestion).filter_by(is_home_based=True).first().question_id
            self.nonhome = db.query(EccdQuestion).filter_by(is_home_based=False).first().question_id
        def database():
            with self.sessions() as db:
                yield db
        api.dependency_overrides[get_db] = database
        self.otp_setting = patch.object(settings, 'ENABLE_OTP', False)
        self.otp_setting.start()
        # Backup tests must not depend on or replace local/deployed secrets.
        self.backup_setting = patch.object(settings, 'BACKUP_ENCRYPTION_KEY', Fernet.generate_key().decode())
        self.backup_setting.start()
        # Explicit fixture-only bypass, never enabled through HTTP or ENV.
        from backend.utils.rate_limits import limits
        limits.reset()
        self.rate_setting = patch.object(limits, 'bypass', True)
        self.rate_setting.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        api.dependency_overrides.clear()
        self.otp_setting.stop()
        self.backup_setting.stop()
        self.rate_setting.stop()
        from backend.utils.rate_limits import limits
        limits.reset()
        self.test_engine.dispose()
        if not re.fullmatch(r'phase2_test_[a-f0-9]{32}',self.schema):
            raise AssertionError('Unsafe test schema cleanup target')
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))

    def call(self, method, path, user=1, **kwargs):
        return self.client.request(method,path,headers={'Authorization':f'Bearer {self.tokens[user]}'},**kwargs)

    def login(self, name='adviser', **kwargs):
        return self.client.post('/api/auth/login',json={'email':f'{name}@example.com','password':PASSWORD,**kwargs})

    def evaluate(self, period='PRE', when='2026-08-10', answers=None):
        return self.call('POST','/api/eccd/evaluate',2,json={'student_id':1,'period':period,'evaluation_date':when,'answers':answers or {str(self.home):1}})

    def test_api_load_and_socketio_transport(self):
        self.assertEqual(self.client.get('/').status_code,200)
        self.assertEqual(self.client.get('/socket.io/?EIO=4&transport=polling').status_code,200)
        for path in ['/api/chairman/students','/api/chairman/sections','/api/teachers/active','/api/eccd-config/','/api/analytics/filters','/api/analytics/stats','/api/analytics/logs']:
            self.assertEqual(self.call('GET',path).status_code,200,path)
        for path in ['/api/analytics/stats','/api/eccd/domains-progress','/api/teachers/me/access','/api/messages/contacts']:
            self.assertEqual(self.call('GET',path,2).status_code,200,path)
        for prefix,user in [('/api/chairman',1),('/api/teachers',2)]:
            for suffix in ['/dashboard-stats','/dashboard-filters','/dashboard-pie']:
                self.assertEqual(self.call('GET',prefix+suffix,user).status_code,200,prefix+suffix)

    def test_no_plaintext_columns_and_migration_repeat(self):
        inspector = inspect(self.test_engine)
        for table, raw in [('students','lrn_number'),('family_access','student_lrn'),('student_eccd_evaluations','student_lrn')]:
            self.assertNotIn(raw,{column['name'] for column in inspector.get_columns(table,schema=self.schema)})
        with self.test_engine.begin() as connection:
            self.assertFalse(apply_phase2(connection,self.schema))
            check_phase2(connection,self.schema)

    def test_local_login_and_registration_skip_email(self):
        with patch('backend.routes.auth.send_otp_email',new_callable=AsyncMock) as email:
            for path in ['/api/auth/login','/api/auth/login-step1']:
                response=self.client.post(path,json={'email':'adviser@example.com','password':PASSWORD})
                self.assertEqual(response.status_code,200)
                self.assertFalse(response.json()['requireOtp'])
            registration=self.client.post('/api/auth/register-parent',json={'email':'new@example.com','firstName':'New','lastName':'Parent','password':PASSWORD})
            self.assertEqual(registration.status_code,201)
            self.assertIn('token',registration.json())
            email.assert_not_awaited()

    def test_email_only_login_and_real_profile_sessions(self):
        from jose import jwt
        with self.sessions() as db:
            db.get(SystemSettings, 1).chairman_name = 'School Chairman'
            db.get(User, 2).email = 'Adviser@EXAMPLE.COM'
            db.commit()
        for email, first, last in [(' ADVISER@example.com ', 'Test', 'Adviser'),
                                   ('parent@example.com', 'Test', 'Parent'),
                                   ('chairman@example.com', 'School', 'Chairman')]:
            for path in ['/api/auth/login', '/api/auth/login-step1']:
                with self.subTest(email=email, path=path):
                    response = self.client.post(path, json={'email': email, 'password': PASSWORD})
                    self.assertEqual(response.status_code, 200, response.text)
                    session = response.json()
                    self.assertEqual(session['user']['first_name'], first)
                    self.assertEqual(session['user']['last_name'], last)
                    self.assertEqual(session['user']['full_name'], f'{first} {last}')
                    self.assertNotIn('username', session['user'])
                    claims = jwt.get_unverified_claims(session['token'])
                    self.assertNotIn('username', claims)
                    self.assertEqual(claims['sub'], str(session['user']['id']))
        self.assertEqual(self.client.post('/api/auth/login', json={'username': 'adviser', 'password': PASSWORD}).status_code, 422)
        self.assertEqual(self.client.post('/api/auth/login', json={'email': 'adviser', 'password': PASSWORD}).status_code, 422)
        rejected = self.client.post('/api/auth/login', json={'email': 'alias@example.com', 'password': PASSWORD})
        self.assertEqual(rejected.status_code, 401)
        self.assertEqual(rejected.json()['detail'], 'Invalid email or password.')

    def test_parent_registration_namesakes_long_names_and_email_conflicts(self):
        for address in ['shared@one.example.com', 'shared@two.example.com']:
            response = self.client.post('/api/auth/register-parent', json={
                'email': address, 'firstName': 'Test', 'lastName': 'Parent', 'password': PASSWORD,
            })
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(response.json()['user']['full_name'], 'Test Parent')
            self.assertNotIn('username', response.json()['user'])
        first, last = 'A' * 60, 'B' * 20
        response = self.client.post('/api/auth/register-parent', json={
            'email': 'long@example.com', 'firstName': first, 'lastName': last, 'password': PASSWORD,
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()['user']['first_name'], first)
        self.assertEqual(response.json()['user']['last_name'], last)
        duplicate = self.client.post('/api/auth/register-parent', json={
            'email': 'PARENT@EXAMPLE.COM', 'firstName': 'Other', 'lastName': 'Parent', 'password': PASSWORD,
        })
        self.assertEqual(duplicate.status_code, 400)
        with self.sessions() as db:
            values = [row.email for row in db.query(User).filter(User.email.in_(
                ['shared@one.example.com', 'shared@two.example.com', 'long@example.com']))]
            self.assertEqual(len(values), 3)
            self.assertEqual(len(set(values)), 3)
            self.assertNotIn('username', User.__table__.columns)

    def test_profile_displays_use_settings_and_profile_names(self):
        with self.sessions() as db:
            db.get(SystemSettings, 1).chairman_name = 'School Chairman'
            db.get(Teacher, 1).first_name = None
            db.get(Teacher, 1).last_name = None
            db.get(Parent, 1).fullname = None
            db.add_all(SystemLog(user_id=actor, action_type='IDENTITY', details='Display check') for actor in (1, 2, 5))
            db.commit()
        teacher_contacts = self.call('GET', '/api/messages/contacts', 2).json()['contacts']
        self.assertEqual(teacher_contacts[0]['name'], "parent (Test's Parent)")
        parent_contacts = self.call('GET', '/api/messages/contacts', 5).json()['contacts']
        self.assertEqual(parent_contacts[0]['name'], 'Teacher adviser')
        logs = self.call('GET', '/api/analytics/logs').json()
        self.assertEqual({log['actor_name'] for log in logs}, {'School Chairman', 'adviser', 'parent'})
        self.assertTrue(all(log['performed_by'] == log['actor_name'] for log in logs))
        with self.sessions() as db:
            db.get(Parent, 1).fullname = 'Dela Cruz, Ana Maria'
            db.commit()
        profile = self.login('parent').json()['user']
        self.assertEqual((profile['first_name'], profile['last_name'], profile['full_name']),
                         ('Ana Maria', 'Dela Cruz', 'Ana Maria Dela Cruz'))

    def test_teacher_accounts_use_names_and_full_length_emails(self):
        address = 'longteacher' * 5 + '@example.com'
        response = self.call('POST', '/api/teachers/', json={
            'first_name': 'Test', 'last_name': 'Adviser', 'email': address,
            'password': PASSWORD, 'section_id': 2,
        })
        self.assertEqual(response.status_code, 201, response.text)
        created = response.json()
        login = self.client.post('/api/auth/login', json={'email': address.upper(), 'password': PASSWORD})
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()['user']['full_name'], 'Test Adviser')
        updated_address = 'updatedteacher' * 4 + '@example.com'
        updated = self.call('PUT', f"/api/teachers/{created['user_id']}", json={
            'email': updated_address, 'first_name': 'Updated', 'last_name': 'Teacher',
        })
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(self.client.post('/api/auth/login', json={'email': address, 'password': PASSWORD}).status_code, 401)
        login = self.client.post('/api/auth/login', json={'email': updated_address, 'password': PASSWORD})
        self.assertEqual(login.json()['user']['full_name'], 'Updated Teacher')
        for path in ['/api/teachers/active', '/api/chairman/teachers']:
            rows = self.call('GET', path).json()
            self.assertTrue(all('username' not in row for row in rows))
        duplicate = self.call('PUT', f"/api/teachers/{created['user_id']}", json={'email': 'ADVISER@EXAMPLE.COM'})
        self.assertEqual(duplicate.status_code, 400)
        with self.sessions() as db:
            self.assertEqual(db.get(User, created['user_id']).teacher.first_name, 'Updated')

    def test_first_login_enforced_and_old_session_revoked(self):
        provision=self.call('POST','/api/chairman/teachers',json={'email':'newteacher@example.com','password':PASSWORD,'first_name':'New','last_name':'Teacher','employee_id':'NEW-001','section_id':1})
        self.assertEqual(provision.status_code,201)
        login=self.login('newteacher',rememberDevice=True).json()
        token=login['token']
        self.assertTrue(login['requiresPasswordChange'])
        self.assertEqual(self.client.get('/api/students/all',headers={'Authorization':f'Bearer {token}'}).status_code,403)
        response=self.client.put('/api/auth/update-password',headers={'Authorization':f'Bearer {token}'},json={'newPassword':'Replacement456','confirmPassword':'Replacement456'})
        self.assertEqual(response.status_code,200)
        self.assertFalse(response.json()['requiresPasswordChange'])
        self.assertEqual(self.client.get('/api/students/all',headers={'Authorization':f'Bearer {token}'}).status_code,401)
        with self.sessions() as db:
            self.assertEqual(db.query(UserTrustedDevice).filter_by(user_id=provision.json()['user_id']).count(),0)

    def test_bound_otp_attempt_limit_and_replay(self):
        codes=[]
        async def email(address,otp): codes.append(otp)
        with patch.object(settings,'ENABLE_OTP',True),patch('backend.routes.auth.send_otp_email',side_effect=email):
            challenge=self.login(rememberDevice=True).json()['challengeToken']
            self.assertEqual(self.client.get('/api/students/all',headers={'Authorization':f'Bearer {challenge}'}).status_code,401)
            bad='000000'
            for _ in range(5):
                self.assertEqual(self.client.post('/api/auth/verify-otp',json={'challengeToken':challenge,'otp':bad}).status_code,400)
            self.assertEqual(self.client.post('/api/auth/verify-otp',json={'challengeToken':challenge,'otp':codes[-1]}).status_code,400)
            with patch('backend.utils.authentication.now', return_value=datetime.now(timezone.utc) + timedelta(seconds=61)):
                challenge=self.login(rememberDevice=True).json()['challengeToken']
            response=self.client.post('/api/auth/verify-otp',json={'challengeToken':challenge,'otp':codes[-1]})
            self.assertEqual(response.status_code,200)
            self.assertIn('deviceToken',response.json())
            self.assertEqual(self.client.post('/api/auth/verify-otp',json={'challengeToken':challenge,'otp':codes[-1]}).status_code,400)
        with self.sessions() as db:
            self.assertEqual(db.query(EmailVerification).count(),0)

    def test_otp_expiry_resend_and_email_delivery_failure(self):
        codes = []
        async def delivered_email(address, code):
            codes.append(code)
        with patch.object(settings, 'ENABLE_OTP', True), patch('backend.routes.auth.send_otp_email', side_effect=delivered_email):
            first = self.login('chairman').json()['challengeToken']
            with patch('backend.utils.authentication.now', return_value=datetime.now(timezone.utc) + timedelta(seconds=61)):
                second = self.login('chairman').json()['challengeToken']
            stale = self.client.post('/api/auth/verify-otp', json={'challengeToken': first, 'otp': codes[0]})
            self.assertEqual(stale.status_code, 400)
            invalid = self.client.post('/api/auth/verify-otp', json={'challengeToken': second, 'otp': '000000'})
            self.assertEqual(invalid.status_code, 400)
            self.assertEqual(invalid.json()['detail'], 'Invalid verification code.')
            with self.sessions() as db:
                row = db.query(EmailVerification).filter_by(challenge_hash=digest(second)).one()
                self.assertEqual(row.otp, '')
                self.assertNotEqual(row.otp_hash, codes[-1])
                row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
                db.commit()
            expired = self.client.post('/api/auth/verify-otp', json={'challengeToken': second, 'otp': codes[-1]})
            self.assertEqual(expired.status_code, 400)
            self.assertIn('Code expired', expired.json()['detail'])
            from backend.utils.authentication import now
            with self.sessions() as db:
                db.query(EmailVerification).filter_by(user_id=1).delete()
                db.commit()
            with patch('backend.utils.authentication.now', return_value=now() - timedelta(minutes=11)):
                expired_token = self.login('chairman').json()['challengeToken']
            expired = self.client.post('/api/auth/verify-otp', json={'challengeToken': expired_token, 'otp': codes[-1]})
            self.assertEqual(expired.status_code, 400)
            self.assertIn('Code expired', expired.json()['detail'])
        with patch.object(settings, 'ENABLE_OTP', True), patch('backend.routes.auth.send_otp_email', new_callable=AsyncMock, side_effect=RuntimeError('SMTP unavailable')):
            failed = self.login('chairman')
            self.assertEqual(failed.status_code, 502)
            self.assertNotIn('challengeToken', failed.json())
            self.assertEqual(failed.json()['detail'], 'Unable to deliver the verification email. Please retry.')

    def test_pending_registration_retry_and_activation(self):
        payload={'email':'pending@example.com','firstName':'Pending','lastName':'Parent','password':PASSWORD}
        with patch.object(settings,'ENABLE_OTP',True),patch('backend.routes.auth.send_otp_email',new_callable=AsyncMock,side_effect=RuntimeError('mail offline')):
            response=self.client.post('/api/auth/register-parent',json=payload)
            self.assertEqual(response.status_code,201)
            self.assertFalse(response.json()['emailSent'])
            self.assertEqual(self.login('pending').status_code,403)
        codes=[]
        async def email(address,otp): codes.append(otp)
        with patch.object(settings,'ENABLE_OTP',True),patch('backend.routes.auth.send_otp_email',side_effect=email):
            response=self.client.post('/api/auth/register-parent',json=payload)
            self.assertEqual(response.status_code,200)
            verified=self.client.post('/api/auth/verify-otp',json={'challengeToken':response.json()['challengeToken'],'otp':codes[-1]})
            self.assertEqual(verified.status_code,200)
            self.assertEqual(verified.json()['user']['role'],'user')
        with self.sessions() as db:
            self.assertEqual(db.query(User).filter_by(email='pending@example.com').count(),1)

    def test_trusted_device_account_expiry_and_logout(self):
        device=self.login(rememberDevice=True).json()['deviceToken']
        with self.sessions() as db:
            expires=db.query(UserTrustedDevice).filter_by(user_id=2).one().expires_at
        with patch.object(settings,'ENABLE_OTP',True),patch('backend.routes.auth.send_otp_email',new_callable=AsyncMock):
            self.assertFalse(self.login(deviceToken=device).json()['requireOtp'])
            self.client.cookies.clear()
            self.assertTrue(self.login('other',deviceToken=device).json()['requireOtp'])
            self.assertEqual(self.client.post('/api/auth/logout',json={'deviceToken':device}).status_code,200)
            self.assertFalse(self.login(deviceToken=device).json()['requireOtp'])
            with self.sessions() as db:
                self.assertEqual(db.query(UserTrustedDevice).filter_by(user_id=2).one().expires_at,expires)
                db.query(UserTrustedDevice).filter_by(user_id=2).update({'expires_at':datetime.now(timezone.utc)-timedelta(seconds=1)})
                db.commit()
            self.assertTrue(self.login(deviceToken=device).json()['requireOtp'])
        self.client.post('/api/auth/logout',json={'forgetDevice':True,'deviceToken':device})
        with self.sessions() as db: self.assertEqual(db.query(UserTrustedDevice).count(),0)

    def test_email_change_bound_to_exact_address_and_credentials(self):
        codes=[]
        async def email(address,otp): codes.append(otp)
        with patch.object(settings,'ENABLE_OTP',True),patch('backend.routes.auth.send_otp_email',side_effect=email):
            response=self.call('POST','/api/auth/send-otp',json={'email':'changed@example.com','currentPassword':PASSWORD})
            self.assertEqual(response.status_code,200)
            challenge=response.json()['challengeToken']
            payload={'currentPassword':PASSWORD,'newEmail':'wrong@example.com','otp':codes[-1],'challengeToken':challenge}
            self.assertEqual(self.call('PUT','/api/chairman/account',json=payload).status_code,400)
            payload['newEmail']='changed@example.com'
            changed=self.call('PUT','/api/chairman/account',json=payload)
            self.assertEqual(changed.status_code,200)
            self.assertEqual(self.call('GET','/api/chairman/teachers').status_code,401)
        with self.sessions() as db: self.assertEqual(db.get(User,1).email,'changed@example.com')

    def test_safe_responses_ownership_and_enrollment(self):
        response=self.call('GET','/api/students/all',2)
        self.assertEqual(response.status_code,200)
        self.assertEqual([row['student_id'] for row in response.json()],[1])
        self.assertNotIn(LRN,response.text)
        self.assertNotIn('lrn_encrypted',response.text)
        self.assertEqual(self.call('GET','/api/students/3',2).status_code,403)
        self.assertEqual(self.call('GET','/api/eccd/assessment/1',3).status_code,403)
        self.assertEqual(self.call('GET','/api/students/1',6).status_code,403)
        payload={'lrn_number':'001222222222','first_name':'New','middle_name':'Middle','last_name':'Child','gender':'female','date_of_birth':'2021-03-10','section_id':1}
        self.assertEqual(self.call('POST','/api/students/create',2,json=payload).status_code,201)
        self.assertEqual(self.call('POST','/api/students/create',2,json=payload).status_code,400)
        payload.update(lrn_number='001333333333',section_id=2)
        self.assertEqual(self.call('POST','/api/students/create',2,json=payload).status_code,403)

    def test_batch_dates_and_unknown_questions_are_atomic(self):
        self.assertEqual(self.evaluate().status_code,200)
        self.assertEqual(self.evaluate('MID','2026-08-10').status_code,400)
        self.assertEqual(self.evaluate('MID','2026-09-10').status_code,200)
        self.assertEqual(self.evaluate('POST','2026-08-20').status_code,400)
        self.assertEqual(self.evaluate('PRE','2026-10-01').status_code,400)
        self.assertEqual(self.evaluate(answers={str(self.home):0,'99999':1}).status_code,400)
        with self.sessions() as db:
            records=db.query(StudentEccdEvaluation).filter_by(student_id=1).all()
            self.assertEqual(len(records),2)
            self.assertTrue(all(record.answer==EccdAnswer.KAYA for record in records))

    def test_parent_masks_answers_dates_scores_progress_and_info(self):
        self.assertEqual(self.evaluate().status_code,200)
        response=self.call('GET','/api/eccd/parent/assessment/1',5)
        self.assertEqual(response.status_code,200)
        result=response.json()
        for period in ('PRE','MID','POST'):
            card=result['summary'][period]
            self.assertFalse(card['is_published'])
            self.assertEqual(card['interpretation'],'Pending Adviser Release')
            for key in ('rawScores','scaledScores','standardScore','sumOfScaledScores','decimalAge','assessmentDate'): self.assertIsNone(card[key])
            self.assertIsNone(result['periodDates'][period])
            for question in result['homeBasedChecklist']: self.assertIsNone(question['answers'][period])
            for row in result['matrix']: self.assertIsNone(row['scores'][period])
        dashboard=self.call('GET','/api/eccd/parent/dashboard-stats/1',5).json()
        self.assertIsNone(dashboard['totalKaya'])
        self.assertFalse(dashboard['assessmentMastered'])
        for row in self.call('GET','/api/eccd/parent/domains-progress/1',5).json(): self.assertIsNone(row['pre_progress'])
        summary=self.call('GET','/api/parents/children/1/eccd-summary',5)
        self.assertEqual(summary.status_code,200)
        self.assertIsNone(summary.json()['periods']['PRE']['standard_score'])
        with self.sessions() as db:
            db.get(Teacher,1).allow_parent_view_student_info=False
            db.commit()
        self.assertIsNone(self.call('GET','/api/parents/children',5).json()[0]['first_name'])
        self.assertEqual(self.call('GET','/api/eccd/parent/assessment/1',5).json()['student']['parents'],[])
        self.assertEqual(self.call('GET','/api/parents/children/1/eccd-summary',5).json()['student_name'],'')

    def test_six_permissions_inherit_primary_only_and_home_updates(self):
        payload={'student_id':1,'evaluations':[{'question_id':self.home,'testing_period':'PRE','answer':'KAYA'}]}
        self.assertEqual(self.call('POST','/api/eccd/parent/evaluate',5,json=payload).status_code,403)
        self.assertEqual(self.call('PUT','/api/teachers/access-controls',2,json={'allow_parent_edit_home_based_eccd':True,'allow_parent_view_eccd_pre':True}).status_code,200)
        self.assertEqual(self.call('POST','/api/eccd/parent/evaluate',5,json=payload).status_code,200)
        with self.sessions() as db:
            record=db.query(StudentEccdEvaluation).filter_by(student_id=1,question_id=self.home).one()
            record.evaluation_date=date(2026,8,1)
            db.commit()
        self.assertEqual(self.call('POST','/api/eccd/parent/evaluate',5,json=payload).status_code,200)
        with self.sessions() as db: self.assertEqual(db.query(StudentEccdEvaluation).filter_by(student_id=1,question_id=self.home).one().evaluation_date,date.today())
        payload['evaluations'][0]['question_id']=self.nonhome
        self.assertEqual(self.call('POST','/api/eccd/parent/evaluate',5,json=payload).status_code,403)
        self.assertEqual(self.call('PUT','/api/teachers/access-controls',2,json={'allow_parent_view':True}).status_code,422)
        self.assertEqual(self.call('PUT','/api/teachers/access-controls',2,json={'allow_parent_edit_student_info':False}).status_code,200)
        self.assertEqual(self.call('PUT','/api/parents/children/1',5,json={'address':'Changed'}).status_code,403)
        # Historical advisers cannot release results or keep a child visible.
        children=self.call('GET','/api/parents/children',5)
        self.assertEqual(children.status_code,200)
        self.assertFalse(children.json()[0]['allow_parent_view_eccd_post'])
        with self.sessions() as db:
            preserved={table.name:list(db.execute(table.select())) for table in
                       (Student.__table__,FamilyAccess.__table__,StudentEccdEvaluation.__table__)}
            db.query(SectionTeacher).filter_by(section_id=1,role='Primary Adviser').update({'status':'Inactive'})
            db.commit()
        for path in ('/api/students/my-child','/api/students/linked','/api/parents/children'):
            children=self.call('GET',path,5)
            self.assertEqual(children.status_code,200,children.text)
            self.assertEqual(children.json(),[],path)
        for path in ('/api/students/1','/api/parents/children/1/eccd-summary'):
            self.assertEqual(self.call('GET',path,5).status_code,403,path)
        self.assertEqual(self.call('POST','/api/chairman/sections/1/assign-teacher',json={'teacher_id':1}).status_code,200)
        children=self.call('GET','/api/parents/children',5)
        self.assertEqual(children.status_code,200,children.text)
        self.assertEqual([child['student_id'] for child in children.json()],[1])
        self.assertFalse(children.json()[0]['allow_parent_view_eccd_post'])
        self.assertEqual(self.call('GET','/api/students/1',5).status_code,200)
        with self.sessions() as db:
            for table in (Student.__table__,FamilyAccess.__table__,StudentEccdEvaluation.__table__):
                self.assertEqual(list(db.execute(table.select())),preserved[table.name],table.name)

    def test_transfer_and_handover_preserve_evaluations(self):
        for period,when in [('PRE','2026-08-10'),('MID','2026-09-10'),('POST','2026-10-10')]: self.assertEqual(self.evaluate(period,when).status_code,200)
        with self.sessions() as db: original=[tuple(row) for row in db.execute(StudentEccdEvaluation.__table__.select())]
        self.assertEqual(self.call('PUT','/api/chairman/students/transfer',json={'student_ids':[1],'new_section_id':2}).status_code,200)
        self.assertEqual(self.call('GET','/api/eccd/assessment/1',2).status_code,403)
        self.assertEqual(self.call('GET','/api/eccd/assessment/1',3).status_code,200)
        self.assertEqual(self.call('POST','/api/chairman/sections/2/assign-teacher',json={'teacher_id':3,'role':'Substitute'}).status_code,422)
        with self.sessions() as db:
            self.assertTrue(db.get(User,3).is_active)
            self.assertEqual(db.get(Section,2).adviser_teacher_id,2)
        self.assertEqual(self.call('POST','/api/chairman/sections/2/assign-teacher',json={'teacher_id':3,'role':'Primary Adviser'}).status_code,200)
        with self.sessions() as db:
            self.assertEqual([tuple(row) for row in db.execute(StudentEccdEvaluation.__table__.select())],original)
            self.assertFalse(db.get(User,3).is_active)

    def test_latest_period_mastery_and_alphabetical_ties(self):
        with self.sessions() as db:
            teacher=db.get(Teacher,1)
            teacher.allow_parent_view_eccd_pre=teacher.allow_parent_view_eccd_mid=teacher.allow_parent_view_eccd_post=True
            questions=[db.query(EccdQuestion).filter_by(domain_id=domain).first().question_id for domain in (1,2)]
            db.commit()
        self.assertEqual(self.evaluate(answers={str(question):0 for question in questions}).status_code,200)
        self.assertEqual(self.evaluate('POST','2026-10-10',answers={str(question):1 for question in questions}).status_code,200)
        result=self.call('GET','/api/eccd/parent/dashboard-stats/1',5).json()
        self.assertEqual(result['totalDiKaya'],0)
        self.assertEqual(result['totalKaya'],2)
        self.assertTrue(result['assessmentMastered'])
        self.assertEqual(result['excelsIn'],'Fine Motor')

    def test_settings_month_rollover_exact_undo_and_expiry(self):
        self.assertEqual(self.call('PUT','/api/settings/update',json={'school_name':"School O'Connor",'principal_name':'Principal','school_year_start_month':6}).status_code,200)
        self.assertEqual(self.call('PUT','/api/settings/update',json={'school_year_start_month':13}).status_code,422)
        with self.sessions() as db:
            db.add_all([Message(parent_id=1,teacher_id=1,sender_role='teacher',body='Active',is_archived=False),Message(parent_id=1,teacher_id=1,sender_role='teacher',body='Old archive',is_archived=True)])
            db.commit()
        self.assertEqual(self.call('POST','/api/chairman/rollover-year',json={'school_year_start_month':9}).status_code,200)
        self.assertTrue(self.client.get('/api/settings').json()['canRevertSchoolYear'])
        self.assertEqual(self.call('POST','/api/chairman/undo-rollover').status_code,200)
        with self.sessions() as db:
            self.assertTrue(db.get(Student,1).is_active)
            self.assertFalse(db.get(Student,2).is_active)
            self.assertFalse(db.query(Message).filter_by(body='Active').one().is_archived)
            self.assertTrue(db.query(Message).filter_by(body='Old archive').one().is_archived)
            self.assertEqual(db.get(SystemSettings,1).school_year_start_month,6)
        self.call('POST','/api/chairman/rollover-year',json={})
        with self.sessions() as db:
            db.get(SystemSettings,1).last_rollover_timestamp=(datetime.now(timezone.utc)-timedelta(days=31)).isoformat()
            db.commit()
        self.assertEqual(self.call('POST','/api/chairman/undo-rollover').status_code,400)

    def test_undo_without_snapshot_does_not_reactivate_everything(self):
        with self.sessions() as db:
            record=db.get(SystemSettings,1)
            record.previous_school_year='2025-2026'
            record.last_rollover_timestamp=datetime.now(timezone.utc).isoformat()
            db.commit()
        self.assertEqual(self.call('POST','/api/chairman/undo-rollover').status_code,409)
        with self.sessions() as db: self.assertFalse(db.get(Student,2).is_active)

    def test_encrypted_backup_preserves_new_credentials_and_resets_sequences(self):
        self.evaluate()
        response=self.call('GET','/api/chairman/backup/export')
        self.assertEqual(response.status_code,200)
        self.assertNotIn(LRN.encode(),response.content)
        with self.sessions() as db:
            document=json.loads(cipher().decrypt(response.content))
            self.assertNotIn('lrn_number',document['students'][0])
            db.get(User,1).email='live-new@example.com'
            db.get(User,1).password_hash=get_password_hash('Updated456')
            db.get(SystemSettings,1).school_name='Changed After Backup'
            db.commit()
            self.tokens[1]=build_session(db,db.get(User,1))['token']
            live=db.get(User,1).password_hash
        restored=self.call('POST','/api/chairman/backup/restore',files={'file':('backup.enc',response.content,'application/octet-stream')})
        self.assertEqual(restored.status_code,200)
        with self.sessions() as db:
            self.assertEqual(db.get(User,1).email,'live-new@example.com')
            self.assertEqual(db.get(User,1).password_hash,live)
            self.assertEqual(db.get(SystemSettings,1).school_name,'TEST SCHOOL')
            self.assertEqual(db.query(StudentEccdEvaluation).count(),1)
            student=Student(lrn_number='001444444444',first_name='After Restore')
            db.add(student); db.commit()
            self.assertGreater(student.student_id,3)

    def test_restore_invalid_foreign_keys_rolls_back_school_data(self):
        with self.sessions() as db:
            payload=json.loads(cipher().decrypt(export_backup(db)))
        payload['teachers'][0]['user_id']=99999
        forged=cipher().encrypt(json.dumps(payload).encode())
        response=self.call('POST','/api/backup/restore',files={'file':('invalid.enc',forged,'application/octet-stream')})
        self.assertEqual(response.status_code,400)
        self.assertNotIn('INSERT',response.text)
        with self.sessions() as db:
            self.assertEqual(db.query(Student).count(),3)
            self.assertEqual(db.get(Teacher,1).user_id,2)
            self.assertEqual(db.get(SystemSettings,1).school_name,'TEST SCHOOL')
        self.assertEqual(self.call('POST','/api/backup/restore',files={'file':('bad.enc',b'bad','application/octet-stream')}).status_code,400)

    def test_messages_ownership_persistence_notifications_and_read(self):
        payload={'teacher_id':1,'parent_id':1,'message_body':'Hello Parent','sender_role':'teacher'}
        self.assertEqual(self.call('POST','/api/messages/send',3,json=payload).status_code,403)
        response=self.call('POST','/api/messages/send',2,json=payload)
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.json()['message_body'],'Hello Parent')
        self.assertGreater(response.json()['message_id'],0)
        self.assertEqual(self.call('GET','/api/messages/unread-count',5).json()['unreadCount'],1)
        self.assertEqual(self.call('GET','/api/messages/history?teacher_id=1&parent_id=1',6).status_code,403)
        self.assertEqual(self.call('PUT','/api/messages/mark-read',5,json={'teacher_id':1,'parent_id':1}).status_code,200)
        self.assertEqual(self.call('GET','/api/messages/unread-count',5).json()['unreadCount'],0)
        self.assertEqual(self.call('POST','/api/messages/notify-student',2,json={'student_id':1}).json()['recipients'],1)
        self.assertEqual(self.call('POST','/api/messages/notify-student',2,json={'student_id':3}).status_code,403)

    def test_socket_auth_rooms_and_only_persisted_sender_records(self):
        from backend.utils import realtime
        room='teacher-1-parent-1'
        sent=self.call('POST','/api/messages/send',2,json={'teacher_id':1,'parent_id':1,'body':'Saved'}).json()
        received=[]; memberships={'teacher':[],'parent':[],'stranger':[]}
        async def enter(sid,selected): memberships[sid].append(selected)
        async def leave(sid,selected): memberships[sid].remove(selected)
        async def emit(event,payload,**kwargs): received.append((event,payload,kwargs))
        async def exercise():
            self.assertFalse(await realtime.connect('no-token',{},{}))
            for sid,user in [('teacher',2),('parent',5),('stranger',6)]: self.assertTrue(await realtime.connect(sid,{}, {'token':self.tokens[user]}))
            self.assertTrue((await realtime.join_room('teacher',room))['success'])
            self.assertTrue((await realtime.join_room('parent',room))['success'])
            self.assertFalse((await realtime.join_room('stranger',room))['success'])
            self.assertFalse((await realtime.send_message('teacher',{'room':room,'message_id':99999,'message_body':'Spoofed'}))['success'])
            self.assertFalse((await realtime.send_message('parent',{'room':room,'message_id':sent['message_id']}))['success'])
            self.assertTrue((await realtime.send_message('teacher',{'room':room,'message_id':sent['message_id'],'body':'Changed'}))['success'])
            with self.sessions() as db:
                db.get(User,5).is_active=False; db.commit()
            self.assertTrue((await realtime.send_message('teacher',{'room':room,'message_id':sent['message_id']}))['success'] is False)
        with patch.object(realtime,'SessionLocal',self.sessions),patch.object(realtime.sio,'rooms',side_effect=lambda sid:memberships.get(sid,[])),patch.object(realtime.sio,'enter_room',side_effect=enter),patch.object(realtime.sio,'leave_room',side_effect=leave),patch.object(realtime.sio,'emit',side_effect=emit):
            try: asyncio.run(exercise())
            finally: realtime.connections.clear(); realtime.generations.clear()
        messages=[payload for event,payload,kwargs in received if event=='receive_message']
        self.assertEqual(len(messages),1)
        self.assertEqual(messages[0]['body'],'Saved')

    def make_import(self, bad_second=False, existing_other=False, missing_mid=False, mac_epoch=False, sheet_count=2, full_width=False, section_header='Test A'):
        wb=openpyxl.Workbook(); info=wb.active; info.title='Info Sheet'
        if mac_epoch: wb.epoch=CALENDAR_MAC_1904
        info.append([section_header]); info.append(['Headers'])
        row=[None]*27
        row[1]='Imported, New, Middle'; row[5]='001555555555'; row[7]='BABAE'; row[8]='KANAN'; row[9]=to_excel(datetime(2021,3,10),wb.epoch); row[10]=to_excel(datetime(2026,8,10),wb.epoch)
        row[17]='Test Father'; row[18]=35; row[19]='Teacher'; row[20]='College'
        info.append(row)
        if bad_second:
            broken=list(row); broken[1]='Invalid Name'; broken[5]='001666666666'; info.append(broken)
        if existing_other:
            other=list(row); other[1]='Class, Other'; other[5]='001111111111'; info.append(other)
        gm=wb.create_sheet('GM'); gm.append(['Headers']); gm.append(['Headers'])
        values=[None]*8; values[1]=row[1]; values[2]=1
        if missing_mid: values[4]=1
        gm.append(values)
        for name in ('FM', 'SH', 'RL', 'EL', 'C', 'SE'):
            if len(wb.worksheets) < sheet_count:
                wb.create_sheet(name)
        while len(wb.worksheets) < sheet_count:
            extra = wb.create_sheet(f'Extra {len(wb.worksheets)}')
            if len(wb.worksheets) % 2:
                extra.sheet_state = 'hidden'
        if full_width:
            for sheet in wb:
                sheet['A1'].fill = openpyxl.styles.PatternFill('solid', fgColor='EEEEEE')
                sheet.column_dimensions.group('A', 'XFD', hidden=False)
                sheet.column_dimensions['A'].fill = openpyxl.styles.PatternFill('solid', fgColor='EEEEEE')
                sheet['XFD3'].fill = openpyxl.styles.PatternFill('solid', fgColor='EEEEEE')
                sheet['XFD50'].fill = openpyxl.styles.PatternFill('solid', fgColor='EEEEEE')
                sheet.merge_cells('A49:XFD49')
        buffer=BytesIO(); wb.save(buffer); return buffer.getvalue()

    def test_import_full_width_styling_preserves_demographics_guardians_and_late_answers(self):
        wb = openpyxl.load_workbook(BytesIO(self.make_import(sheet_count=8, full_width=True)))
        info = wb['Info Sheet']
        info['O3'] = datetime(2027, 5, 10)
        info['V3'] = 'Test Mother'
        info['W3'] = 32
        info['X3'] = 'Nurse'
        info['Y3'] = 'College'
        # SH question 27 POST DI-KAYA is column FH (164), beyond a 100-column read.
        wb['SH']['B3'] = info['B3'].value
        wb['SH'].cell(3, 164, 1)
        buffer = BytesIO()
        wb.save(buffer)
        wb.close()
        for _ in range(2):
            response = self.call('POST', '/api/teachers/import-students', 2,
                                 data={'section_id': '1'}, files={'file': ('easycd.xlsx', buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), {'successCount': 1, 'failedCount': 0, 'errors': []})
        with self.sessions() as db:
            student = db.query(Student).filter_by(lrn_search_hash=hash_lrn('001555555555')).one()
            self.assertEqual((student.last_name, student.first_name, student.middle_name), ('Imported', 'New', 'Middle'))
            self.assertEqual(student.lrn_number, '001555555555')
            self.assertNotIn('001555555555', student.lrn_encrypted)
            self.assertEqual((student.date_of_birth, student.gender.value, student.section_id), (date(2021, 3, 10), 'Female', 1))
            self.assertEqual(student.school_year, '2026-2027')
            guardians = {link.relationship_type: link.parent for link in student.parents}
            self.assertEqual((guardians['Father'].fullname, guardians['Father'].age), ('Test Father', 35))
            self.assertEqual((guardians['Mother'].fullname, guardians['Mother'].age, guardians['Mother'].occupation), ('Test Mother', 32, 'Nurse'))
            self.assertEqual(len(student.evaluations), 2)
            late = next(record for record in student.evaluations if record.question.domain_id == 3)
            self.assertEqual((late.question.sequence_order, late.testing_period, late.answer), (27, TestingPeriod.POST, EccdAnswer.DI_KAYA))
            self.assertEqual(late.teacher_evaluation_date, date(2027, 5, 10))

    def test_import_many_sheets_explicit_section_identity_guardian_and_idempotency(self):
        content = self.make_import(bad_second=True, existing_other=True, sheet_count=64)
        for _ in range(2):
            response = self.call('POST', '/api/teachers/import-students', 2,
                                 data={'section_id': '1'}, files={'file': ('students.xlsx', content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual((response.json()['successCount'], response.json()['failedCount']), (1, 2))
        with self.sessions() as db:
            student = db.query(Student).filter_by(lrn_search_hash=hash_lrn('001555555555')).one()
            self.assertEqual(student.lrn_number, '001555555555')
            self.assertNotIn('001555555555', student.lrn_encrypted)
            self.assertEqual((student.section_id, student.middle_name, student.date_of_birth), (1, 'Middle', date(2021, 3, 10)))
            self.assertEqual(len(student.parents), 1)
            self.assertEqual(student.parents[0].parent.fullname, 'Test Father')
            self.assertEqual(len(student.evaluations), 1)
            self.assertEqual(student.evaluations[0].answer, EccdAnswer.KAYA)
            self.assertFalse(db.query(Student).filter_by(lrn_search_hash=hash_lrn('001666666666')).first())
            self.assertEqual(db.get(Student, 3).section_id, 2)
        response = self.call('POST', '/api/teachers/import-students', 2,
                             data={'section_id': '2'}, files={'file': ('students.xlsx', content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
        self.assertEqual(response.status_code, 403, response.text)

    def test_import_section_mismatch_requires_confirmation_before_writes(self):
        content = self.make_import(section_header='Section: File Class')
        for fields in ({}, {'overwrite_section': 'false'}):
            response = self.call('POST', '/api/teachers/import-students', 2, data=fields,
                                 files={'file': ('students.xlsx', content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
            self.assertEqual(response.status_code, 409, response.text)
            self.assertEqual(response.json(), {
                'detail': 'The file section does not match your assigned section.',
                'code': 'SECTION_MISMATCH', 'file_section': 'File Class', 'assigned_section': 'Test A',
            })
        with self.sessions() as db:
            self.assertEqual((db.query(Student).count(), db.query(Parent).count(), db.query(StudentEccdEvaluation).count()), (3, 2, 0))
        for _ in range(2):
            response = self.call('POST', '/api/teachers/import-students', 2,
                                 data={'section_id': '1', 'overwrite_section': 'true'},
                                 files={'file': ('students.xlsx', content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), {'successCount': 1, 'failedCount': 0, 'errors': []})
        with self.sessions() as db:
            student = db.query(Student).filter_by(lrn_search_hash=hash_lrn('001555555555')).one()
            self.assertEqual((student.section_id, student.section_name), (1, 'Test A'))
            self.assertEqual((student.first_name, student.middle_name, student.date_of_birth), ('New', 'Middle', date(2021, 3, 10)))
            self.assertEqual(student.parents[0].parent.fullname, 'Test Father')
            self.assertEqual(len(student.parents), 1)
            self.assertEqual(len(student.evaluations), 1)
            self.assertEqual(student.evaluations[0].answer, EccdAnswer.KAYA)

    def test_import_unknown_section_can_be_confirmed_and_labelled_match_is_accepted(self):
        for header, expected in ((None, 409), (' Section: tEsT a ', 200)):
            content = self.make_import(section_header=header)
            response = self.call('POST', '/api/teachers/import-students', 2,
                                 files={'file': ('students.xlsx', content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
            self.assertEqual(response.status_code, expected, response.text)
            if expected == 409:
                self.assertEqual(response.json()['file_section'], 'Not identified')
                response = self.call('POST', '/api/teachers/import-students', 2, data={'overwrite_section': 'true'},
                                     files={'file': ('students.xlsx', content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
                self.assertEqual(response.status_code, 200, response.text)

    def test_import_overwrite_does_not_authorize_other_or_inactive_sections(self):
        content = self.make_import(section_header='Other Class')
        for actor, fields in ((2, {'section_id': '2'}), (4, {'section_id': '1'})):
            response = self.call('POST', '/api/teachers/import-students', actor,
                                 data={**fields, 'overwrite_section': 'true'},
                                 files={'file': ('students.xlsx', content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
            self.assertEqual(response.status_code, 403, response.text)
        with self.sessions() as db:
            db.query(SectionTeacher).filter_by(teacher_id=1, role='Primary Adviser', status='Active').update({'status': 'Inactive'})
            db.commit()
        response = self.call('POST', '/api/teachers/import-students', 2, data={'overwrite_section': 'true'},
                             files={'file': ('students.xlsx', content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
        self.assertEqual(response.status_code, 403, response.text)
        with self.sessions() as db:
            self.assertEqual(db.query(Student).count(), 3)
            self.assertEqual(db.query(StudentEccdEvaluation).count(), 0)

    def test_import_overwrite_does_not_transfer_existing_students(self):
        response = self.call('POST', '/api/teachers/import-students', 2, data={'overwrite_section': 'true'},
                             files={'file': ('students.xlsx', self.make_import(existing_other=True, section_header='File Class'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()['successCount'], response.json()['failedCount']), (1, 1))
        with self.sessions() as db:
            self.assertEqual(db.get(Student, 3).section_id, 2)
            self.assertEqual(len(db.get(Student, 3).evaluations), 0)

    def test_import_partial_success_scope_and_atomic_score_rows(self):
        response=self.call('POST','/api/teachers/import-students',2,files={'file':('students.xlsx',self.make_import(bad_second=True,existing_other=True),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['successCount'],1)
        self.assertEqual(response.json()['failedCount'],2)
        with self.sessions() as db:
            student=db.query(Student).filter_by(lrn_search_hash=hash_lrn('001555555555')).one()
            self.assertEqual(student.middle_name,'Middle')
            self.assertEqual(student.school_year,'2026-2027')
            self.assertEqual(student.date_of_birth,date(2021,3,10))
            self.assertEqual(student.evaluations[0].answer,EccdAnswer.KAYA)
            self.assertEqual(db.get(Student,3).section_id,2)
            self.assertFalse(db.query(Student).filter_by(lrn_search_hash=hash_lrn('001666666666')).first())

    def test_import_missing_marked_date_rolls_back_entire_student(self):
        response=self.call('POST','/api/teachers/import-students',2,files={'file':('students.xlsx',self.make_import(missing_mid=True),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['failedCount'],1)
        with self.sessions() as db:
            self.assertEqual(db.query(Student).count(),3)
            self.assertEqual(db.query(StudentEccdEvaluation).count(),0)
            self.assertEqual(db.query(Parent).count(),2)

    def test_import_mac_date_epoch_and_duplicate_upsert(self):
        for _ in range(2):
            response=self.call('POST','/api/teachers/import-students',2,files={'file':('students.xlsx',self.make_import(mac_epoch=True),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json()['successCount'],1)
        with self.sessions() as db:
            student=db.query(Student).filter_by(lrn_search_hash=hash_lrn('001555555555')).one()
            self.assertEqual(student.date_of_birth,date(2021,3,10))
            self.assertEqual(len(student.evaluations),1)
            self.assertEqual(len(student.parents),1)

    def test_checklist_and_summary_contain_real_school_and_student_data(self):
        self.assertEqual(self.evaluate().status_code,200)
        response=self.call('GET','/api/teachers/download/1',2)
        self.assertEqual(response.status_code,200)
        wb=openpyxl.load_workbook(BytesIO(response.content))
        sheet=wb['CHECKLIST']
        self.assertEqual(str(sheet['W10'].value),LRN)
        # W6/W7 are part of the V6/V7 merged header cells in the official file.
        self.assertIn('2026-2027',sheet['V7'].value)
        self.assertIn('TEST SCHOOL',sheet['V6'].value)
        self.assertEqual(sheet['Y28'].value,'TEST PRINCIPAL')
        with self.sessions() as db:
            records=db.query(StudentEccdEvaluation).filter_by(student_id=1).all()
            scores=calculate_scores([{'domain_id':record.question.domain_id,'answer':record.answer.value} for record in records],calculate_decimal_age(date(2021,1,10),date(2026,8,10)))
            self.assertEqual(sheet['N16'].value,scores['sum_of_scaled_scores'])
            self.assertEqual(sheet['N17'].value,scores['standard_score'])
        self.assertEqual(sheet['Q3'].value,5)
        self.assertEqual(sheet['R3'].value,7)
        self.assertEqual(sheet['S3'].value,0)
        self.assertIsNone(sheet['P16'].value)
        wb.close()
        self.assertEqual(self.call('GET','/api/teachers/download/1',3).status_code,403)
        response=self.call('GET','/api/chairman/sections/1/export-summary')
        self.assertEqual(response.status_code,200)
        wb=openpyxl.load_workbook(BytesIO(response.content))
        self.assertEqual(wb.sheetnames,['PR','M','PO'])
        self.assertEqual(wb['PR']['C14'].value,LRN)
        self.assertEqual(wb['PR']['D14'].value,'STUDENT, TEST M.')
        self.assertEqual(wb['PR']['B3'].value,'TEST SCHOOL')
        self.assertIsNotNone(wb['PR']['Z14'].value)
        wb.close()
        response=self.call('GET','/api/chairman/export-eccd')
        self.assertEqual(response.status_code,200)
        with ZipFile(BytesIO(response.content)) as archive: self.assertEqual(len(archive.namelist()),2)
        self.assertEqual(self.call('GET','/api/eccd/section/1/export',2).status_code,200)
        self.assertEqual(self.call('GET','/api/eccd/section/1/summary?testing_period=PRE',2).status_code,200)

    def test_export_does_not_truncate_large_sections(self):
        with self.sessions() as db:
            for i in range(31): db.add(Student(lrn_number=f'{800000000000+i:012d}',first_name='Extra',last_name=f'Child {i}',section_id=1,school_year='2026-2027',is_active=True))
            db.commit()
        response=self.call('GET','/api/chairman/sections/1/export-summary')
        self.assertEqual(response.status_code,200)
        with ZipFile(BytesIO(response.content)) as archive:
            self.assertEqual(len(archive.namelist()),2)
            count=0
            for name in archive.namelist():
                wb=openpyxl.load_workbook(BytesIO(archive.read(name)))
                count+=sum(wb['PR'].cell(row,3).value is not None for row in range(14,44)); wb.close()
            self.assertEqual(count,32)

    def test_new_section_assignment_and_question_rbac(self):
        response=self.call('POST','/api/chairman/sections',json={'section_name':'Test C','teacher_id':3})
        self.assertEqual(response.status_code,201)
        with self.sessions() as db:
            self.assertEqual(db.query(SectionTeacher).filter_by(section_id=response.json()['section_id'],teacher_id=3,status='Active',role='Primary Adviser').count(),1)
        payload={'domain_id':1,'question_text':'New Question','sequence_order':14}
        self.assertEqual(self.call('POST','/api/eccd-config/questions',2,json=payload).status_code,403)
        self.call('PUT','/api/chairman/teachers/1/permissions',json={'allow_eccd_question_management':True})
        self.assertEqual(self.call('POST','/api/eccd-config/questions',2,json=payload).status_code,200)
        self.assertEqual(self.call('PUT','/api/teachers/1/archive').status_code,404)

    def test_validation_errors_never_echo_private_inputs(self):
        response=self.client.post('/api/auth/register-parent',json={'email':'invalid','password':'Private secret','firstName':'Example','lastName':'Parent'})
        self.assertEqual(response.status_code,422)
        self.assertNotIn('Private secret',response.text)
        self.assertNotIn('"input"',response.text)

    def test_teacher_account_edit_archive_and_delete_preserve_scores(self):
        self.evaluate()
        result=self.call('PUT','/api/teachers/update/2',json={'email':'renamed@example.com','first_name':'Edited'})
        self.assertEqual(result.status_code,200)
        self.assertEqual(self.call('GET','/api/students/all',2).status_code,401)
        with self.sessions() as db:
            self.assertEqual(db.get(User,2).email,'renamed@example.com')
            self.assertEqual(db.get(Teacher,1).first_name,'Edited')
            self.tokens[2]=build_session(db,db.get(User,2))['token']
        self.assertEqual(self.call('PUT','/api/teachers/update/2',json={'email':'other@example.com','first_name':'Rejected'}).status_code,400)
        with self.sessions() as db: self.assertEqual(db.get(Teacher,1).first_name,'Edited')
        self.assertEqual(self.call('PUT','/api/teachers/archive/2').status_code,200)
        self.assertEqual(self.call('GET','/api/teachers/archived').json()[0]['user_id'],2)
        self.assertEqual(self.call('GET','/api/students/all',2).status_code,403)
        self.assertEqual(self.call('PUT','/api/teachers/unarchive/2').status_code,200)
        self.assertEqual(self.call('DELETE','/api/teachers/delete/2').status_code,200)
        with self.sessions() as db:
            self.assertEqual(db.query(StudentEccdEvaluation).count(),1)
            self.assertIsNone(db.query(StudentEccdEvaluation).one().teacher_id)
            self.assertEqual(db.query(Student).count(),3)

    def test_legacy_question_routes_and_invalid_domains(self):
        self.assertEqual(self.call('GET','/api/chairman/eccd-data',2).status_code,403)
        self.assertEqual(self.call('GET','/api/chairman/eccd-data').status_code,200)
        result=self.call('POST','/api/chairman/eccd-questions',json={'domain_id':1,'sequence_order':14,'question_text':'Extra question'})
        self.assertEqual(result.status_code,200)
        question=result.json()['question_id']
        self.assertEqual(self.call('PUT',f'/api/chairman/eccd-questions/{question}',json={'sequence_order':14,'question_text':'Changed question'}).status_code,200)
        self.assertEqual(self.call('PUT',f'/api/chairman/eccd-questions/{question}/home-based',json={'is_home_based':True}).status_code,200)
        self.assertEqual(self.call('POST','/api/chairman/eccd-questions',json={'domain_id':99999,'sequence_order':1,'question_text':'Invalid domain'}).status_code,400)
        self.assertEqual(self.call('DELETE',f'/api/chairman/eccd-questions/{question}').status_code,200)

    def test_parent_link_inherits_profile_relationship_and_rejects_second_account(self):
        with self.sessions() as db:
            db.get(Parent,2).relationship_type='Father'; db.commit()
        result=self.call('POST','/api/messages/link-lrn',6,json={'lrn_number':'001111111111'})
        self.assertEqual(result.status_code,200)
        with self.sessions() as db: self.assertEqual(db.query(FamilyAccess).filter_by(student_id=3,parent_id=2).one().relationship_type,'Father')
        self.assertEqual(self.call('POST','/api/messages/link-lrn',5,json={'lrn_number':'001111111111'}).status_code,400)
        self.assertEqual(self.call('PUT','/api/parents/children/1',5,json={'father_age':'not a number'}).status_code,422)
        self.assertEqual(self.call('PUT','/api/parents/children/1',5,json={'emergency_contact':'x'*21}).status_code,422)

    def test_form_settings_and_backup_file_alias(self):
        result=self.call('PUT','/api/settings/update',data={'school_name':'Updated School','principal_name':'Updated Principal','school_year_start_month':'7','primary_color':'#123456'})
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['settings']['school_year_start_month'],7)
        backup=self.call('GET','/api/chairman/backup/export').content
        self.assertEqual(self.call('POST','/api/chairman/backup/restore',files={'backupFile':('saved.enc',backup,'application/octet-stream')}).status_code,200)

    def test_chairman_roster_includes_archived_cohorts_and_age_rounding(self):
        self.assertEqual(len(self.call('GET','/api/chairman/students').json()),3)
        self.assertEqual(len(self.call('GET','/api/students/all').json()),2)
        self.assertEqual(calculate_decimal_age(date(2022,1,1),date(2026,4,1)),4.3)
        result=self.call('GET','/api/eccd/parent/dashboard-stats/1',5).json()
        self.assertIsNone(result['totalKaya'])
        self.assertFalse(result['is_published'])
        response=self.call('GET','/api/chairman/sections/1/export-summary?schoolYear=2025-2026')
        self.assertEqual(response.status_code,200)
        workbook=openpyxl.load_workbook(BytesIO(response.content))
        self.assertEqual(workbook['PR']['C14'].value,'009876543210'); workbook.close()

    def test_realtime_websocket_protocol_connect_room_and_saved_message_ack(self):
        from backend.utils import realtime
        saved=self.call('POST','/api/messages/send',2,json={'teacher_id':1,'parent_id':1,'body':'Saved message'}).json()['message_id']
        with patch.object(realtime,'SessionLocal',self.sessions):
            with self.client.websocket_connect('/socket.io/?EIO=4&transport=websocket', headers={'Upgrade':'websocket'}) as ws:
                self.assertTrue(ws.receive_text().startswith('0'))
                ws.send_text('40'+json.dumps({'token':self.tokens[2]}))
                self.assertTrue(ws.receive_text().startswith('40'))
                ws.send_text('421'+json.dumps(['join_room','teacher-1-parent-1']))
                self.assertEqual(ws.receive_text(),'431[{"success":true}]')
                ws.send_text('422'+json.dumps(['send_message',{'room':'teacher-1-parent-1','message_id':saved}]))
                self.assertEqual(ws.receive_text(),'432[{"success":true}]')


if __name__=='__main__':
    unittest.main()
