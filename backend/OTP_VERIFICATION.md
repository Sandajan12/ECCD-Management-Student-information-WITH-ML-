# Email OTP verification

`ENABLE_OTP` is the only OTP toggle. It defaults to `true`, regardless of
`ENVIRONMENT`. SMTP is awaited before the login API returns a challenge. Codes
are random six-digit values stored as hashes, expire after ten minutes, allow
five incorrect attempts, and cannot be reused after verification. Requesting
another code replaces the previous challenge.

With `ENABLE_OTP=false`, password login and parent registration use the existing
immediate development bypass. SMTP is skipped. Any challenges issued in this
mode use the development master code `123456`. This code has no special access
when OTP is enabled. Remembered devices and their 30-day OTP bypass are removed;
new production password logins always require OTP. Valid refresh cookies
restore an existing session without a new login. Logout revokes that session.

## Test with a real account

1. In `backend/.env`, set `ENABLE_OTP=true`. Configure `MAIL_SERVER`, `MAIL_PORT`,
   `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM`, `MAIL_STARTTLS`, and
   `MAIL_SSL_TLS` with your SMTP provider's actual values. Retain the existing
   database URL, encryption keys, and accounts. Brevo SMTP uses these same
   `MAIL_*` settings; an HTTP API key is not used by this SMTP implementation.
   Existing process environment values take precedence over `.env`.
2. Use an existing active Chairman (`super-admin`) account whose stored email
   address is a mailbox you can open. Sign in with that email address; verification
   sends to the same stored email. The local development seed account's `example.com` address
   cannot receive real email; use an account with a real address instead.
3. Restart the backend. For this workspace, the installed Python 3.12 dependencies
   are in `.venv312`. From the repository root:

   ```powershell
   uv run --no-project --python .venv312 python -m uvicorn backend.main:app --reload --env-file backend/.env
   ```

   Expect `[AUTH] Email OTP enabled; SMTP delivery active.` and
   `Application startup complete.` Use the configured environment path if your
   checkout keeps its Python 3.12 dependencies in `.venv` instead.
4. In a second terminal, from the repository root:

   ```powershell
   pnpm.cmd --dir frontend dev
   ```

5. Open `http://localhost:5173/login` in a fresh private browser window and
   submit the Chairman credentials. The button shows a spinner
   while delivery runs. On success the OTP modal opens, and the backend logs
   `[AUTH] OTP sent via email to <target_email>` without the code.
6. Open that mailbox, including its spam folder. Enter an incorrect six-digit
   code once and confirm “Invalid verification code” appears inside the modal.
   Paste or type the emailed six-digit code and submit. The client navigates
   immediately to `/chairman/dashboard`, which resolves to the existing
   `/super-admin/dashboard` workspace.
7. In a fresh private session, request another code. After the 60-second
   countdown, select “Resend code”. Use the newest email; the previous challenge
   is invalidated. To check expiry, leave a new challenge unused for more than
   ten minutes, then submit its code. The modal should show “Code expired” and
   allow a new request. Inputs and challenges survive page reloads and failed
   network requests; confirmed new challenges reset the code entry.

SMTP failures return HTTP 502 with “Unable to deliver the verification email.
Please retry.” The login page shows this error and preserves the credentials.
The SMTP operation has a 30-second overall timeout; login/resend requests allow
45 seconds. A successful SMTP handoff does not establish inbox delivery; step 6
confirms receipt.

## Checks without screenshots

From `frontend/`:

```powershell
pnpm.cmd tsc --noEmit -p tsconfig.app.json
```

From the repository root:

```powershell
uv run --no-project --python .venv312 python -m unittest backend.tests.test_dev_otp -v
```

These tests mock SMTP and do not send email. PostgreSQL integration tests use
isolated schemas or rolled-back transactions in the separate parity database.
