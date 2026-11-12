# Vercel frontend and Render backend

The tracked configuration targets a Vite SPA on Vercel and one Python 3.12
Socket.IO/FastAPI process on Render. No deployment is performed by adding these
files. Keep all real credentials in provider environment settings.

1. For a fresh PostgreSQL/Supabase database, configure the normal backend settings
   plus `INITIAL_CHAIRMAN_EMAIL`, `INITIAL_CHAIRMAN_PASSWORD` and
   `INITIAL_CHAIRMAN_NAME` privately, then run:

   ```sh
   uv run --no-project --python 3.12 python -m backend.scripts.seed_supabase --apply
   ```

   This applies migrations 001–016 and seeds the exact tracked 7 domains and
   109 questions plus an initial Chairman. Repeated runs preserve existing
   Chairmen and matching data; no default password or local account export is
   included. Remove the three initial credentials after provisioning. See the
   [bootstrap guide](backend/scripts/README.md) for collision handling and the
   explicit account-update option. Existing-database upgrade commands remain in
   [backend/migrations/README.md](backend/migrations/README.md). Preserve the
   original LRN encryption/HMAC and backup keys when upgrading existing data.
   Before starting this version, stop API writers and run the repeatable upgrade:

   ```sh
   uv run --no-project --python 3.12 python -m backend.migrations.auth_security_version --apply
   uv run --no-project --python 3.12 python -m backend.migrations.auth_security_version --check
   uv run --no-project --python 3.12 python -m backend.migrations.email_only_identity --apply
   uv run --no-project --python 3.12 python -m backend.migrations.email_only_identity --check
   uv run --no-project --python 3.12 python -m backend.migrations.production_performance --apply
   uv run --no-project --python 3.12 python -m backend.migrations.production_performance --check
   uv run --no-project --python 3.12 python -m backend.migrations.optional_student_lrn --apply
   uv run --no-project --python 3.12 python -m backend.migrations.optional_student_lrn --check
   uv run --no-project --python 3.12 python -m backend.migrations.teacher_marked_at --apply
   uv run --no-project --python 3.12 python -m backend.migrations.teacher_marked_at --check
   ```

   Migration 012 adds `users.security_version` with default zero and verifies
   existing account data unchanged. Startup checks it and never applies it.
   Backups retain the field; restore preserves the live account registry/version.

2. Create the Render service from root `render.yaml`. Keep the repository root
   as the working directory so `backend.main:app` and the tracked templates/model
   resolve. The blueprint pins Python 3.12.13, installs `backend/requirements.txt`,
   starts the Socket.IO wrapper, and checks `/ready`. Apply required upgrades
   separately before starting the new API. The sole startup exception is migration
   016: it adds nullable `teacher_marked_at` transactionally without a default or
   historical backfill, with concurrent workers serialized on the migration
   ledger. In particular, startup checks 015 but does not apply it. The root
   `pnpm run start:prod` script is an equivalent POSIX-shell launch command;
   Windows local development should use the explicit uv command in AI_CONTEXT.

3. Set the blueprint's secret inputs directly in Render: `SUPABASE_DB_URL`
   (or `DATABASE_URL`, which takes precedence), `DATABASE_SSL_ROOT_CERT`,
   `JWT_SECRET`, `BREVO_API_KEY`, `MAIL_FROM`, `CORS_ORIGINS`, and the stable
   backup/LRN keys. Use the actual Supabase direct or session-pooler endpoint
   with `sslmode=verify-full` and its trusted CA mounted at the configured path.
   Never use a placeholder key or turn off certificate verification. Set
   `ENVIRONMENT=production`, `ENABLE_OTP=true`, `EMAIL_TRANSPORT=brevo_api`.
   The production validator rejects disabled OTP, missing transport credentials,
   example sender addresses, non-HTTPS remote origins and unverified database TLS.
   It validates configuration shape; provider credentials/sender verification
   still need a real delivery check.

4. Brevo requires an API key and a verified sending domain/sender. OTP uses
   `POST https://api.brevo.com/v3/smtp/email` over HTTPS with an `api-key` header;
   redirects and automatic SMTP fallback are disabled. Local development may
   explicitly select `EMAIL_TRANSPORT=smtp` and configure `MAIL_*` instead.
   Production SMTP is supported only with credentials and STARTTLS or SSL/TLS.
   [Brevo transport documentation](https://developers.brevo.com/docs/send-a-transactional-email).
   Render Free blocks outbound SMTP ports 25/465/587 and may cold-start; the
   client gives ordinary API calls, including login, 60 seconds while preserving
   drafts after failures. [Render Free limits](https://render.com/docs/free).

5. In Vercel choose **frontend** as the project Root Directory, Vite framework,
   Node 24, and pnpm as the package manager. Set
   `ENABLE_EXPERIMENTAL_COREPACK=1` so the root `packageManager` pin selects
   pnpm 12.11.2. Keep automatic install-command detection so Vercel respects
   that pin. [Vercel package manager settings](https://vercel.com/docs/package-managers).
   The frontend also pins pnpm 12.11.2 and includes its own workspace YAML with
   matching dependency overrides for frontend-only checkout/install environments.
   Scoring tables are bundled from `frontend/src/assets/eccd_scoring_data.json`;
   the frontend source does not require access to backend files during its build.
   Keep that asset byte-for-byte identical to `backend/eccd_scoring_data.json`
   when updating official scoring tables (`backend/tests/test_scoring_asset.py`).
   The committed `frontend/vercel.json` builds to `dist`, provides SPA deep-link
   fallback, and sets the three document security headers. Set `VITE_API_URL`
   and `VITE_SOCKET_URL` to the Render HTTPS origin without `/api`, then rebuild.
   Set Render `CORS_ORIGINS` to the exact Vercel/custom frontend origin; retained
   `FRONTEND_URL`/`ALLOWED_ORIGINS` aliases also work.
   [Vercel Vite deployment documentation](https://vercel.com/docs/frameworks/frontend/vite).

6. On the actual HTTPS origins, check `/ready`, frontend deep-link reloads,
   CORS/preflight, real OTP delivery, role-restricted API calls and Socket.IO.
   Remembered-device cookies are HttpOnly, Secure and SameSite=None in
   production. Browsers may restrict third-party cookies across provider domains;
   the existing opaque device-token body/header fallback remains available and
   its database record expires after 30 days without sliding renewal.

JWTs use HS256 and require expiry. Password/email changes, archive/restore and
account deactivation during adviser takeover invalidate sessions, challenges and
remembered devices. Ordinary logout retains device trust; explicit forget-device
removes it. As before, a copied access JWT survives ordinary logout until expiry
or credential revocation. No new per-session logout blacklist is introduced.

Authentication uses the production custom site https://ameskinder.com / www.ameskinder.com
and backend https://api.ameskinder.com. Set both Vercel VITE_API_URL and
VITE_SOCKET_URL to https://api.ameskinder.com (without /api), then rebuild. Render
CORS_ORIGINS must contain https://ameskinder.com, https://www.ameskinder.com,
https://ames-ml.vercel.app and http://localhost:5173. CORS credentials are enabled
with explicit methods/headers. vercel.app production visitors redirect to the
custom site because SameSite=Strict cookies cannot authenticate across sites.

Before deploying cookie authentication, run the explicit additive migration:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.refresh_cookie_sessions --apply
uv run --no-project --python .venv312 python -m backend.migrations.refresh_cookie_sessions --check
```

It creates only private auth_refresh_sessions with RLS, a cascading users FK,
current/previous JTIs, expiry and a 10-second rotation grace. It does not rewrite
school records. Startup checks 019 and never applies it. Fresh bootstrap includes
001–019. Keep ACCESS_TOKEN_EXPIRE_MINUTES=30 and REFRESH_TOKEN_EXPIRE_MINUTES=1440.
The access token/user stay only in RAM; refresh JWTs never appear in JSON or web
storage. Login/OTP/credential replacement set host-only ames_refresh_token with
HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=86400. Only HTTP loopback
development disables Secure. Refresh and logout require an approved Origin or
Referer; production rejects a missing origin. Logout revokes the cookie family
and clears its cookie; credential changes revoke all account families.

Deploy matching backend/frontend together after019; old localStorage sessions
must sign in once. Check F5 restoration, concurrent tabs, proactive refresh,
Socket.IO, outage cooldown, logout/revocation and draft preservation. Refresh
families never enter backups and are cleared during restore. A copied access
JWT remains valid until its short expiry or credential revocation.

The browser requires consent on login, registration and OTP verification, and
sends `terms_accepted=true`. Explicit false/null or malformed consent is rejected
by the API. Omission remains supported for existing API clients/test helpers;
this compatibility field is not a persisted legal-consent ledger.

Database pooling is bounded **per API process**: `DATABASE_POOL_SIZE=5`,
`DATABASE_MAX_OVERFLOW=5`, `DATABASE_POOL_TIMEOUT=15` seconds and
`DATABASE_POOL_RECYCLE=300` seconds. `pool_pre_ping` verifies checkouts. Budget
`replicas × workers × (size + overflow)` against the Supabase connection limit,
leaving capacity for migrations, admin access and other clients. Adjust the four
settings for the selected plan; templates contain these defaults. Recycling and
pre-ping replace stale idle connections; they cannot safely retry a transaction
interrupted mid-query. Use direct/session-pooler URLs as described above.

Migration 014 is additive index DDL; run with writers stopped. Startup never
applies it automatically. See the migration README for lock behavior and checks.
Frontend pages and portal layouts load on demand with visible loading/recovery
states. Keep a failed chunk's recovery manual so offline drafts are preserved.
