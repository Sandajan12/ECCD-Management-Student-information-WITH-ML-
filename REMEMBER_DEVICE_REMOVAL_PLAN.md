# AMES: Remove Remembered Devices and Keep Refresh Sessions

Date: 2026-11-13

Status: Implemented and verified locally; user accepted local testing and authorized merge/deployment on 2026-11-13.

Current release scope (2026-11-13): merge and deploy the verified application
to the approved ML Render/Vercel projects. The former local-only hold has been
lifted by the user. Production migration 020 remains a separate maintenance
step requiring a verified protected backup and stopped API writers. The code
supports production both before and after that cleanup.

## 1. Goal and agreed behavior

Simplify authentication by removing the optional 30-day OTP bypass called **Remember this device** (also accepted as `rememberMe` by the API). Keep password verification, email OTP, access tokens, refresh sessions, and rate limiting.

The normal production login flow becomes:

**Email and password → email OTP → authenticated session → automatic token renewal.**

| User action or condition | Expected result after removal |
| --- | --- |
| User signs in with a password | Require a valid login OTP before issuing a new authenticated session. |
| User reloads or returns in the same browser with a valid refresh cookie | Restore the existing session automatically, without another password or OTP. |
| User closes the browser without logging out | The persistent refresh cookie can restore the session when the browser reopens, provided it remains valid and available. |
| User continues using the application | Successful refresh rotation extends the refresh-session expiry, normally another 24 hours. |
| Refresh session expires, is revoked, or its cookie is unavailable | Require password and OTP for a new login. |
| User explicitly logs out | Revoke the refresh family and delete its cookie; the next login requires password and OTP. |
| User logs out while offline | Preserve the existing pending-logout safeguard so reloading cannot silently restore the session. |

The default access-token lifetime is 30 minutes. The default refresh-session lifetime is 24 hours and slides on successful rotation; it is **not a fixed 24-hour limit measured from the original login**. Existing concurrency grace rules remain in force. Confirm deployed configuration before claiming those defaults are production values.

Removing remembered devices does not require invalidating existing valid refresh sessions. Production OTP remains mandatory; retain the existing explicit development-only OTP bypass for local work.

## 2. What stays and what is removed

| Component | Decision |
| --- | --- |
| Access JWT and RAM-only frontend authentication state | Keep. |
| Secure HttpOnly refresh cookie and `auth_refresh_sessions` | Keep, including rotation, revocation, origin checks, RLS, and restricted database grants. |
| Password checks, email verification, registration verification, and credential-change OTP | Keep. |
| `api_rate_limits`, its backend integration, and existing request budgets | Keep. Tokens do not replace protection against repeated login attempts, OTP flooding, or excessive requests. |
| Remember-device checkboxes, 30-day bypass, device tokens, and `user_trusted_devices` | Remove through the coordinated changes below. |
| Student data, assessment rules, parent permissions, and durable drafts | Preserve. |

Do not delete rate-limit storage or database security policies as part of this work. The current production limiter depends on its table, and missing storage produces HTTP 503 responses. Replacing rate-limit storage would be a separate proposal.

## 3. Implementation changes

### Backend authentication and contracts

- Remove trusted-device lookup and the OTP-bypass branch from login. A password login must issue a challenge, or consume a valid supplied login challenge/OTP, before creating a session in production.
- Remove device-token creation, hashing used solely for devices, cookie issuance, and device cleanup queries from login, registration completion, logout, and credential revocation. Preserve hashing and credential-version helpers still used by OTP or sessions.
- Remove remembered-device claims from newly issued challenges. Previously issued valid OTP challenges may contain the retired claim; ignore it and still require the OTP.
- Preserve current authentication route paths, aliases, OTP errors, session response fields, and first-login restrictions. Stop returning `deviceToken`.
- Keep accepting obsolete request fields as inert compatibility inputs: `rememberDevice`, `remember_device`, `rememberMe`, `deviceToken`, `trusted_device_token`, and logout's `forgetDevice`. They must never enable OTP bypass or trigger device-table access. Keep existing input validation limits where retained; do not add a compatibility service or new endpoint.
- Remove `UserTrustedDevice` from active ORM exports and the `User.trusted_devices` relationship. Remove the active device model after all runtime consumers are gone.
- Clear the legacy `device_token` and `trusted_device_token` cookies on successful authentication and logout responses using their matching historical path/domain attributes. Retain only the small cookie-expiration compatibility code; never consult these cookies for authentication.

### Frontend and browser cleanup

- Remove remember-device controls and their state from login and parent registration, plus the shared control if no callers remain.
- Remove device-token persistence from the API service and all device fields from active request/response interfaces and payloads. Simplify logout callers and context so they no longer offer a separate forget-device action.
- On application initialization, remove only `ames_device_token`, `ames_login_remember_device`, and `ames_registration_remember_device` from the browser stores used by the current implementation. Remove obsolete device cleanup calls elsewhere once initialization handles them.
- Preserve `ames_logout_pending`, all form drafts, all assessment drafts, and existing RAM session restoration. Never call a global browser-storage clear.
- Update privacy text, settings confirmations, and backup/restore messages that currently describe remembered devices. Keep responsive layouts and existing form validation.

### Backups and database migration

- Stop exporting trusted-device records. On backup import, discard only the retired top-level `user_trusted_devices` collection before strict validation so existing encrypted school backups remain usable. Remove the obsolete backup row type and device-specific restore handling.
- Preserve the existing live-account restore rules. Refresh families remain excluded from exports and cleared during restore; never import authentication sessions from a backup.
- Add the next migration, provisionally `020_remove_trusted_devices`, with explicit `--check` and `--apply` actions and transactional ledger recording. Recheck the migration inventory when implementing and use the next unused version if 020 has been taken.
- Drop only `user_trusted_devices`, without `CASCADE`. Its own indexes, constraints, policies, and grants disappear with the table. Unexpected dependent objects must stop the migration for review; do not remove unrelated database objects.
- Keep frozen historical migration schema definitions where required to replay earlier upgrades. Update current schema checks, migration digest inventories, and fresh-bootstrap ordering to support both the pre-drop deployment state and the final post-020 state. Historical checks must not require the retired table after the cleanup migration is recorded.
- The new application must operate while the unused table still exists and after it is dropped. Startup must never apply the destructive cleanup automatically.

### Documentation and simplicity review

- When implementation changes behavior, update authentication guidance and operational rules in `AI_CONTEXT.md` and `AGENTS.md`, plus migration, deployment, and frontend guidance where affected.
- Record dated implementation results and actual verification outcomes in `AI_CONTEXT_HISTORY.md`. Do not describe planned checks as passed.
- Before editing shared services or models, refresh the relevant AST dependency mapping and inspect inbound callers. The existing local graph predates the latest authentication changes.
- Review the proposed diff: **Did this change introduce unnecessary abstractions, extra state, or new dependencies that existing code already handles?** Use existing patterns and dependencies.

## 4. Verification and acceptance

Extend the existing authentication, refresh-session, migration, backup, and browser tests rather than creating a separate framework.

- Password login requires OTP for Chairman, Teacher, and Parent production accounts, including when a previously valid trusted-device token is supplied through an old request field, header, or cookie.
- Correct OTP creates a session; incorrect, expired, consumed, or account-mismatched OTP does not. Registration verification and first-login password changes still work.
- No active authentication path queries `user_trusted_devices`, creates device tokens, or returns a device token. Old request fields cannot change the result.
- Reload and browser-context reopening restore a valid persistent refresh session. Expired/revoked refresh sessions require a new password-and-OTP login. Use controlled expiry rather than waiting 24 hours in tests.
- Successful refresh rotation preserves sliding expiry, concurrent-request grace, account checks, and token-type separation. Logout prevents refresh reuse; offline logout stays effective after reload.
- Legacy device cookies and browser keys are cleaned up while unsaved login/registration inputs and owner-scoped assessment/form drafts survive reload, network errors, logout, and cleanup.
- Old and new encrypted school backups restore successfully under the existing validation and account-preservation rules; neither restores trusted-device bypass or refresh sessions.
- Test migration upgrade, repeated apply/check, full fresh bootstrap, and schema checks after removal in isolated PostgreSQL schemas. Verify unrelated school records and refresh-session records are unchanged by the device-table drop.
- Existing rate-limit behavior, HTTP 429/Retry-After, and database readiness continue working.
- Login and registration remain usable at desktop and mobile sizes, with no remember-device or forget-device controls.

Run from the repository root after implementation:

```powershell
uv run --no-project --python .venv312 python -m pytest backend/tests -q
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build
pnpm.cmd --dir frontend exec playwright test --config playwright.auth-security.config.ts
git diff --check
```

Inspect database-test isolation before execution. Browser tests must use the existing explicit configuration above. Adapt remembered-device assertions and retain coverage of OTP, refresh restoration, and durable drafts.

## 5. Release order and defense explanation

1. Implement and verify the complete change locally, including backup compatibility and migration tests. Preserve unrelated working-tree changes.
2. Deploy the matching backend and frontend with OTP bypass already removed and no runtime dependency on the device table. Verify OTP delivery and refresh restoration.
3. For an explicitly authorized database maintenance window, retain a protected database backup, stop API writers, inspect dependencies, run the cleanup migration's `--check`, then `--apply`, then `--check`, and resume the updated application. The initial check may report that cleanup remains pending; unexpected schema/dependency failures must be investigated before apply.
4. Verify real login → OTP → reload restoration → logout → OTP-required login, plus readiness and rate-limit responses. Monitor authentication errors and OTP delivery failures.

After the table drop, do not roll back to the old backend that queries it. Use a compatible forward fix; any restoration of the old feature requires restoring its schema first. Valid refresh sessions need not be revoked merely to remove device trust.

The user-facing tradeoff is more OTP verification after logout or refresh-session expiry. Existing authenticated sessions retain automatic restoration.

For panelists:

> AMES verifies a new login using a password and email OTP. A short-lived access token authorizes requests, while a secure refresh cookie continues the authenticated session. Logging out revokes the refresh session. Rate limiting restricts repeated attempts and excessive requests.

Planning evidence: active source and authentication guidance were inspected. No application behavior, database schema, hosted policies, or deployment settings were changed or verified by writing this document. No application tests, builds, migrations, or email-delivery checks were run for this planning task.

## 6. Local acceptance checkpoint (2026-11-13)

Implementation is on `refactor/remove-remembered-devices`. Per the user's later
instruction, production release and merging are deferred until local acceptance.

- Local target: `localhost/ames_parity_dev`, configured by `backend/.env`.
- Verified an encrypted maintenance snapshot, then applied/checked the missing
  additive migration 019 and completed 020's pending check, apply, successful
  check. The device table is absent; other school-table row counts are preserved.
- Frontend: `http://localhost:5173`; API: `http://127.0.0.1:8000`.
- Existing local `ENABLE_OTP=false` uses the development bypass. To manually
  test email OTP, enable OTP with valid mail configuration and restart the API.
  Automated tests enable OTP and capture synthetic email without sending mail.
- With OTP enabled, test login → OTP → dashboard → reload → logout → login → OTP.
  Login/registration must have no remember-device checkbox. Work drafts must
  remain after reload, connection loss and logout.
- Keep the existing application encryption keys. The maintenance dump has its
  own ignored encryption key under `.tools/remove-remembered-devices/`.
- Pre-existing local issues are recorded in `AI_CONTEXT_HISTORY.md`: the
  school-backup Fernet key is invalid and the optional 014 checker reports a
  missing `idx_students_school_year`. The pre-migration backup confirms that
  index was already absent. Neither issue was introduced or repaired here.
- Stay on this branch while testing the migrated local database. An older
  backend that still queries the retired table requires its schema restored.

Verification passed: 561 backend tests plus 693 subtests, 62 desktop/mobile
browser cases, both TypeScript projects, lint, build, and git diff --check.
Details and local configuration notes are recorded in `AI_CONTEXT_HISTORY.md`.
No merge, push, deployment, production migration or
live email-delivery test is part of this local checkpoint.
