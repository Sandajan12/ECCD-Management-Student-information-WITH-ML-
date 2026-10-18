# Feature migrations: Phase 2 is the current backend schema

The Phase 2 backend is implemented in Python/FastAPI, SQLAlchemy/PostgreSQL and
Pydantic V2. React/Tailwind integration is Phase 3. Stop the dev server before
applying database upgrades; preserve the existing `backend/.env` and LRN keys.

For an existing Phase 1 database:

```powershell
uv run --no-project --python 3.12 python -m backend.migrations.phase2 --apply
uv run --no-project --python 3.12 python -m backend.migrations.phase2 --check
uv run --no-project --python 3.12 python -m unittest backend.tests.test_phase1 backend.tests.test_phase2 -v
pnpm run dev
```

For a fresh database, run `backend.scripts.configure_lrn` and Phase 1 `--apply`
first, then the Phase 2 commands above. Phase 1 is a historical intermediate
schema: do not run its `--check` against a database already upgraded to Phase 2.
Phase 2 `--apply` is repeatable and verifies already upgraded databases.

The migration runs DDL and data-preservation checks in one PostgreSQL transaction.
It removes only the plaintext compatibility columns, preserves every remaining
school/account field, and verifies encrypted LRNs and ID foreign keys. Incorrect
keys or invalid relationships abort without committing. Runtime startup verifies
the final schema and seeds the extracted 7 domains/109 questions only if both
reference tables are empty. It never creates or resets accounts.

The backend implements registration/login/OTP/trusted devices, first-login password
changes, student and teacher CRUD, permission inheritance, assessment saving and
masking, transfers, section handovers, settings, 30-day snapshot undo, Excel import
and real DepEd exports, persisted chat/Socket.IO, and atomic credential-preserving
restore. Legacy functional URLs are retained alongside current route aliases.
Binary endpoints stream workbooks/ZIPs/backups; JSON endpoints have typed schemas.

Backup files use the current Python project's Fernet envelope and final-schema
typed document, not legacy MySQL SQL/CBC/v2 containers or earlier schema exports.
Keep the stable backup key, LRN encryption key and HMAC secret with backups.
Restore retains all live user records, clears OTP/device records, replaces school
data only after validation, and rolls back on missing account references. School
record IDs are imported exactly and their sequences restart transactionally.

`backend.main:app` is the Socket.IO ASGI entrypoint; the FastAPI instance is `api`.
Clients connect with `auth: { token }`, join `teacher-N-parent-M`, persist messages
through HTTP, then emit `send_message` with `{ room, message_id }`. The server
verifies current ownership and broadcasts the saved record. Sessions from the old
backend token format require signing in again. API responses contain masked LRNs;
Phase 3 must use `student_id` for routing, payloads and scoped offline draft keys.

Tests create and remove only `phase1_test_<uuid>`/`phase2_test_<uuid>` schemas.
They exercise actual PostgreSQL transactions and FastAPI routes, plus Socket.IO
room ownership and an authenticated WebSocket protocol connection. Spreadsheet
checks verify real demographic cells, merged scaled-score totals, dates, cohort
years and exports with more than 30 students. Email sending is mocked; external
SMTP delivery is not needed while local `ENABLE_OTP=false` remains configured.

---

## Historical Phase 1 delivery

Run commands from the repository root using the existing Python 3.12 `.venv`.
Configure `backend/.env` with the PostgreSQL URL and existing authentication and
backup secrets first. For a new installation, create missing LRN keys privately:

```powershell
uv run --no-project --python 3.12 python -m backend.scripts.configure_lrn
uv run --no-project --python 3.12 python -m backend.migrations.phase1 --apply
uv run --no-project --python 3.12 python -m backend.migrations.phase1 --check
uv run --no-project --python 3.12 python -m unittest backend.tests.test_phase1 -v
```

Stop the development server before applying migrations. `create_all()` creates
tables but cannot upgrade an existing table; use the explicit migration before
restarting `pnpm run dev`. Do not import `backend.main` to perform a migration.

The migration uses one PostgreSQL transaction for DDL, backfills, integrity checks
and its `ames_schema_migrations` version record. It verifies every original row
and column, including users/password hashes, before committing. Invalid LRNs,
missing baseline tables, unsupported assignments or inconsistent keys stop it
without committing changes. Running it again checks the migrated schema and
encrypted LRNs without changing IDs or re-encrypting records. An empty database
gets the complete Phase 1 schema; no accounts or assessment questions are seeded.

## Changes delivered

- Student identity uses an integer `student_id` primary key. Family access and
  evaluations reference that ID with cascading deletion. Evaluation uniqueness
  is `(student_id, question_id, testing_period)`.
- LRNs have AES-256-GCM encrypted envelopes, an HMAC-SHA256 exact lookup index and
  a four-digit masked suffix. The envelope matches the legacy `iv:tag:ciphertext`
  hexadecimal format. `middle_name` and family `date_linked` are supported.
- User flags support initial password changes and pending registration. Existing
  accounts get false flags, preserving activation and login behavior. Phase 2
  teacher provisioning must explicitly set `is_first_login=True`.
- Purpose/account-bound OTP hashes, challenge hashes and attempt counters are
  available alongside expiring, hashed trusted-device records. Existing OTP
  compatibility columns remain; expiry is normalized to UTC with timezone.
- Settings include school name, principal and opening month, default August.
  Audit details use `TEXT` for rollover JSON snapshots and record chunks.
- Section assignments restrict roles to Primary Adviser/Substitute and status
  to Active/Inactive. The existing six granular parent permissions remain.
- Pydantic V2 schemas cover ID-based records/transfers, assessment batches,
  authentication, school settings/rollover, granular access, notifications and
  the complete typed school-data backup document. New student responses omit raw
  LRNs, ciphertext and lookup hashes. Backup records are internal encrypted-file
  contents, not public responses. Unknown tables/columns, duplicate identifiers,
  mismatched student references and invalid protected LRNs are rejected.

## Staged compatibility and remaining work

**Phase 1 does not enable the new routes or frontend flows.** Existing APIs still
use the temporary plaintext `students.lrn_number` and child `student_lrn` columns.
Those remain intentionally unique and constrained to the corresponding student
ID. ORM events populate protection fields and synchronize both references when
the existing routes write records. Direct SQL writes must provide both fields.

Phase 2 must switch routes/CRUD to IDs and blind-index lookup, serve masked
responses, preserve live users during atomic restore, implement bound OTP/device
logic and exact 30-day rollover undo, then remove these plaintext compatibility
columns and events in a subsequent reviewed migration. The current restore and
rollover handlers still have their earlier behavior. Do not describe the staged
system as free of plaintext LRNs or as having finished restore/auth/undo flows.

Keep `LRN_ENCRYPTION_KEY` and `LRN_HMAC_SECRET` with database backups. Losing or
changing either independently makes protected data unreadable or unsearchable.
The key utility never replaces an existing secret and refuses to generate missing
keys when encrypted student records already exist.

Tests create uniquely named `phase1_test_<uuid>` PostgreSQL schemas, load a schema
fixture captured before migration, and clean up only those schemas. They verify
both fresh installs and upgrades with synthetic PRE/MID/POST history, family links,
archives and accounts. They never reset or modify live school records.

## Parent assessment access windows (006)

Apply after the existing migrations, before starting the updated API:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.parent_assessment_access --apply
uv run --no-project --python .venv312 python -m backend.migrations.parent_assessment_access --check
```

Adds three non-null Boolean fields to `sections`: `pre_test_parent_editable`
(default true), `mid_test_parent_editable` and `post_test_parent_editable`
(default false), matching legacy period defaults. Repeated application preserves
saved settings and section records. Startup validates the schema without applying
it. The active Adviser's global home-edit permission remains required for parent
saves. After migration 008, only that section's active Adviser can manage windows.

## Adviser takeover (008)

Stop API writers and apply after the existing migrations, before starting the
updated API:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.adviser_takeover --apply
uv run --no-project --python .venv312 python -m backend.migrations.adviser_takeover --check
```

Retires every historical Substitute assignment as an inactive Adviser assignment,
retaining its ID, section, teacher and assigned date. Audit entries preserve its
former role/status. Existing active Advisers remain owners; the compatibility
pointer is synchronized to that assignment. A partial unique index enforces one
active Adviser per section and the role constraint accepts only `Primary Adviser`.
Ambiguous multiple active Advisers abort the transaction for explicit resolution.
Student demographics, PRE/MID/POST evaluations, family links, section editing
windows, teacher permission flags, and accounts are verified unchanged. Startup
validates this migration and never applies it automatically.

Assignment aliases keep accepting `teacher_id` or legacy `adviser_teacher_id`;
null unassigns the section. Older queued `role: "Primary Adviser"` payloads remain
valid; Substitute payloads receive HTTP 422. Old encrypted backups retain retired
assignment rows as inactive records without restoring Substitute access.

## Parent ECCD marks visibility (009)

Apply before starting the updated API:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.parent_eccd_marks --apply
uv run --no-project --python .venv312 python -m backend.migrations.parent_eccd_marks --check
```

Adds `teachers.allow_parent_view_eccd_marks` as a non-null Boolean defaulting to
false for all existing teachers. Repeated application preserves saved choices
and all other teacher fields. Startup checks this migration without applying it.
Official score releases and section editing windows stay independent. Older
settings updates preserve omitted permissions; older backups default this flag
to false. The parent checklist returns teacher-recorded marks only when enabled,
including periods whose official scores remain unreleased. When disabled, only
the authenticated parent's own home answers in editable periods are returned.
