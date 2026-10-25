"""Focused identity lookup and verified email-change regressions."""
import asyncio
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException, Response
from sqlalchemy.exc import MultipleResultsFound

from backend.models import Parent, SystemSettings, User
from backend.models.user import UserRole
from backend.routes.auth import login
from backend.schemas.account import AccountUpdateRequest
from backend.schemas.auth import LoginRequest
from backend.utils.account_changes import update_chairman
from backend.utils.account_identity import account_names


class AccountIdentityAuthTests(unittest.TestCase):
    def test_ambiguous_login_is_generic_and_never_checks_password_or_issues_otp(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.one_or_none.side_effect = MultipleResultsFound()
        with patch("backend.routes.auth.verify_password") as password, patch("backend.routes.auth.issue_challenge") as challenge:
            with self.assertRaises(HTTPException) as error:
                asyncio.run(login(LoginRequest(email=" Mixed@Example.com ", password="Example123"), MagicMock(), Response(), db))
        self.assertEqual((error.exception.status_code, error.exception.detail), (401, "Invalid email or password."))
        password.assert_not_called()
        challenge.assert_not_called()
        expression = db.query.return_value.filter.call_args.args[0]
        self.assertEqual(expression.right.value, "mixed@example.com")

    def test_chairman_session_lookup_and_parent_comma_names(self):
        user = User(role=UserRole.SUPER_ADMIN)
        db = MagicMock()
        db.get.return_value = SystemSettings(chairman_name="  Alex Smith  ")
        with patch("backend.utils.account_identity.object_session", return_value=db):
            self.assertEqual(account_names(user)["full_name"], "Alex Smith")
        self.assertEqual(account_names(user, db)["full_name"], "Alex Smith")
        db.get.return_value = SystemSettings(chairman_name=" ")
        self.assertEqual(account_names(user, db)["full_name"], "Chairman")
        parent = User(role=UserRole.USER, parent=Parent(fullname="Santos, Maria Clara"))
        self.assertEqual(account_names(parent), {"first_name": "Maria Clara", "last_name": "Santos", "full_name": "Maria Clara Santos"})

    def test_email_update_binds_otp_and_storage_to_normalized_address(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        user = User(user_id=1, email="old@example.com", password_hash="hash", role=UserRole.SUPER_ADMIN)
        payload = AccountUpdateRequest(currentPassword="Example123", newEmail=" New@Example.com ", challengeToken="challenge", otp="123456")
        with patch("backend.utils.account_changes.verify_password", return_value=True), patch("backend.utils.account_changes.settings") as settings, patch("backend.utils.account_changes.consume_challenge") as consume, patch("backend.utils.account_changes.revoke_credentials"), patch("backend.utils.account_changes.build_session", return_value={}):
            settings.otp_enabled = True
            update_chairman(db, user, payload)
        self.assertEqual(consume.call_args.args[-1], "new@example.com")
        self.assertEqual(user.email, "new@example.com")
        db.commit.assert_called_once()
