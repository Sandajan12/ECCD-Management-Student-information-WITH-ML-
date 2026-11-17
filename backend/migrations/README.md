# Feature migrations: Phase 2 is the current backend schema

For a fresh PostgreSQL/Supabase database, the explicit
[bootstrap command](../scripts/README.md) applies pending migrations 001–022 and
seeds the exact tracked 7-domain/109-question ECCD baseline plus an
environment-configured Chairman in one transaction:

```sh
uv run --no-project --python 3.12 python -m backend.scripts.seed_supabase --apply
```

Repeated runs preserve existing accounts and matching reference data. Existing
school/account exports are not embedded in the seed fixture.

## Retired branding settings (018)

The matching application removes `secondary_color`, `profile_pic_url` and
`login_background` from the settings model, API, form and new encrypted backups.
Login/registration use the bundled `background_pic.webp`; portal logo and primary
color remain supported. `/api/settings/upload-background` is retired (404).
Older backup imports discard only these three retired keys and continue to
reject unknown settings fields. Existing form drafts remain available for manual
submission; current fields are sent without the retired values.

Deploy the matching backend and frontend before dropping columns. The new
backend accepts the old columns while 018 is pending, and startup never applies
this migration. Older backend releases still depend on these SQL columns and
must not run after the upgrade. Take a protected database backup, stop API
writers, then explicitly run against the intended database:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.settings_cleanup --check
uv run --no-project --python .venv312 python -m backend.migrations.settings_cleanup --apply
uv run --no-project --python .venv312 python -m backend.migrations.settings_cleanup --check
```

The first check reports pending removal on an old schema and makes no changes.
The apply locks the ledger/settings table, drops only the three named columns
without CASCADE, verifies all remaining settings values, and records
`018_retired_branding_settings` in the same transaction. Lock waits time out after
five seconds. Dependent objects or validation failures roll back the entire
upgrade. Repeat applies validate without further changes. Fresh bootstrap
includes 018. Recovery of the removed branding values requires the retained
pre-upgrade database backup; application backup imports intentionally discard
these retired fields. Preparing this migration does not apply it to Supabase.

## Automatic question ordering (017)

Question creation and domain moves append after the highest existing sequence.
Text/home-based edits keep the existing position. The editable sequence input is
removed; older API clients may still send it, but the server assigns placement.
Domain row locks serialize allocations and a unique `(domain_id, sequence_order)`
index protects all writers. Migration 014 accepts its original nonunique index
and the unique index installed by 017.

Stop API writers and check the configured database before upgrading:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.eccd_question_sequence --check
uv run --no-project --python .venv312 python -m backend.migrations.eccd_question_sequence --apply
uv run --no-project --python .venv312 python -m backend.migrations.eccd_question_sequence --check
```

The initial check reports a missing uniqueness index on a database awaiting 017.
If duplicate groups are found, it lists domain IDs, sequences and question IDs;
stop and manually assign the intended unused sequences to those question IDs
before applying. Never delete questions or evaluations to resolve conflicts.
The migration refuses duplicates, preserves all question rows, upgrades the
existing index transactionally, and is repeatable. Startup checks 017 but never
applies it automatically. Fresh bootstrap registers 017 explicitly.

Individual checklist downloads keep one CHECKLIST sheet and append copied
native panels of up to 13 questions for standard-domain overflow, then custom
domains. Custom results remain supplementary counts without official scoring
codes. Summary downloads retain ten base sheets and copy domain layouts for
additional groups, labelling repeated whole-domain totals. Question IDs, existing
sequences, assessment links and official scoring rules remain unchanged. Card
previews include the extended CHECKLIST; see `AI_CONTEXT.md` at the repository
root for the current export rules.

## Teacher correction timestamps (016)

`teacher_marked_at` adds a nullable TIMESTAMPTZ to individual ECCD evaluations.
Startup checks this column without applying migrations; explicit maintenance and
bootstrap register it as `016_teacher_marked_at`. Concurrent explicit applications
serialize on the migration ledger. Repeated runs preserve all records; historical
teacher timestamps remain NULL. The migration role needs ALTER TABLE permission.

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.teacher_marked_at --apply
uv run --no-project --python .venv312 python -m backend.migrations.teacher_marked_at --check
```

Encrypted backups include the field and default older documents to NULL.
Checklist workbooks retain their existing cells and official testing dates;
answer-cell comments carry the parent and teacher save timestamps. Workbook
imports preserve parent attribution on equal marks and stamp actual teacher
changes with the server save time, independently of imported testing dates.

## Optional student LRN (015)

Stop API writers, then explicitly apply this migration before starting the updated API:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.optional_student_lrn --apply
uv run --no-project --python .venv312 python -m backend.migrations.optional_student_lrn --check
```

This repeatable migration makes only the three protected LRN columns nullable,
keeps the unique HMAC constraint, and verifies that existing student data is
unchanged. Blank enrollment/edit LRNs become null in all three columns; supplied
LRNs still require exactly 12 digits and remain encrypted. Startup checks the
nullable schema without applying it. Fresh bootstrap includes migration 015.
Authorized staff student details return the full LRN in `lrn_number` for editing;
parent responses, rosters, and audit logs retain masked values or "Pending".
Encrypted backups support multiple students awaiting LRNs; workbook exports
leave their LRN cells blank. Workbook imports still require LRNs for matching.

## Credential revocation version (012)

Stop API writers before upgrading, then run from the repository root:

```sh
uv run --no-project --python 3.12 python -m backend.migrations.auth_security_version --apply
uv run --no-project --python 3.12 python -m backend.migrations.auth_security_version --check
```

Adds non-null `users.security_version` with default zero without changing existing
account fields. Archive/restore and adviser deactivation advance this version so
previous sessions cannot revive. Repeated application preserves versions. Startup
checks this column without applying migrations. Backup restore preserves live user versions.

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

The backend implements registration/login/OTP/refresh sessions, first-login password
changes, student and teacher CRUD, permission inheritance, assessment saving and
masking, transfers, section handovers, settings, 30-day snapshot undo, Excel import
and real DepEd exports, persisted chat/Socket.IO, and atomic credential-preserving
restore. Legacy functional URLs are retained alongside current route aliases.
Binary endpoints stream workbooks/ZIPs/backups; JSON endpoints have typed schemas.

Backup files use the current Python project's Fernet envelope and final-schema
typed document, not legacy MySQL SQL/CBC/v2 containers or earlier schema exports.
Keep the stable backup key, LRN encryption key and HMAC secret with backups.
Restore retains all live user records, clears OTP challenges and refresh sessions, replaces school
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
  available. Historical Phase 1 creates trusted-device storage, retired by 020. Existing OTP
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

## Parent student predictions (010)

Stop API writers and apply before starting the updated API:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.parent_predictions --apply
uv run --no-project --python .venv312 python -m backend.migrations.parent_predictions --check
```

Adds `teachers.allow_parent_predictions`, a non-null Boolean defaulting to false.
The transaction verifies every other teacher field is unchanged. Repeated runs
preserve saved choices. Startup validates the schema without applying changes.
Older settings updates preserve omitted permissions; older backups default off.
Parents need a SYNCED link, an active enrolled child, the active Adviser's
prediction permission, a complete teacher-confirmed PRE assessment, and released
PRE results. Individual checklist marks and family model inputs are excluded
from the parent prediction response. Teacher prediction and sandbox routes retain
their existing contracts.

## Orphaned section ownership (011)

Run the explicit cleanup against an existing database:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.section_ownership --apply
uv run --no-project --python .venv312 python -m backend.migrations.section_ownership --check
```

Keeps at most one active Primary Adviser assignment per teacher. The teacher's
displayed current class wins when backed by an active assignment; otherwise the
latest assignment date and ID win. Section IDs alone do not establish recency.
Older assignment rows become Inactive and section adviser pointers synchronize
to the retained active assignments. Pointer-only orphans become NULL. The cleanup
is transactional and repeatable, retaining assignment IDs/dates, all accounts,
teacher permissions, students, evaluations, family links and section settings.
No teacher is archived during cleanup. Startup does not apply this data migration.
Future moves vacate old section pointers and deactivate old assignments in the
same transaction as the new assignment, with concurrent moves serialized.
# Migration 013: email-only identity

Stop API writers and take a database backup before upgrading. Deploy matching
models/routes with this schema change. Startup only checks the schema; it never
applies this migration. Run explicitly from the repository root:

```sh
uv run --no-project --python 3.12 python -m backend.migrations.email_only_identity --apply
uv run --no-project --python 3.12 python -m backend.migrations.email_only_identity --check
```

On this checkout use `--python .venv312` for the installed Python 3.12 environment.
The migration uses the current configured database and schema. Do not run it
against a live database until the coordinated application release is ready.

Version `013_email_only_identity` adds nullable `system_settings.chairman_name`
VARCHAR(255). It fills an unset singleton name from the oldest existing Chairman's
username, creating settings with application defaults only when a Chairman exists.
An existing configured name and all other existing settings are preserved. With
multiple Chairmen, accounts remain separate; the singleton display name comes
from the lowest user ID. Preserve the pre-upgrade backup for historical usernames.

Before changing data it refuses any non-null email collisions under
`lower(btrim(email))`, with a sanitized diagnostic. Resolve these explicitly;
the migration never merges or deletes accounts. It trims and lowercases emails,
adds unique expression index `ux_users_email_lower` on `lower(email)`, then drops
`users.username`. Null emails remain null. IDs, password hashes, role/status flags,
and all other account fields are verified unchanged. Related school records are
untouched. The ledger entry, DDL and updates share one transaction; failure rolls
everything back. Repeated applies validate the schema and return without writes.
`--check` validates without applying upgrades. Rollback requires the retained
backup and matching older application release; dropped usernames are not rebuilt.

Fresh bootstrap runs migrations 001–021 before seeding. Historical Phase 1 keeps
username and excludes the new expression index and Chairman name. Phase 2 uses
the migration ledger to distinguish its historical and post-013 column contracts,
and fingerprints actual intermediate columns rather than the evolving ORM.

## 014: production performance indexes

`production_performance` adds 18 non-unique B-tree indexes aligned with current
roster, ownership, conversation, foreign-key, audit and authentication queries.
It changes no rows, columns, foreign keys, unique constraints or sequences. Existing
lowercase email uniqueness, LRN hash uniqueness, student-period, message-thread and
audit timestamp indexes remain. Metadata and explicit upgrades share definitions.

Stop writers and run after migration 013, before deployment:

```sh
uv run --no-project --python 3.12 python -m backend.migrations.production_performance --apply
uv run --no-project --python 3.12 python -m backend.migrations.production_performance --check
```

Use `.venv312` instead of `3.12` on the Windows checkout. This is transactional
`CREATE INDEX`, not `CONCURRENTLY`; builds block writers and require a maintenance
window. A five-second lock timeout prevents an indefinite wait behind writers.
The ledger serializes repeat applies; incompatible definitions or invalid/not-ready
indexes abort and roll back. Repeated applies validate without rewriting data.
Fresh `seed_supabase --apply` includes 014 and validates these indexes on repeat.
Startup does not require this optional performance migration or silently apply it.
For a large live database, schedule a separately reviewed concurrent index rollout
instead of running this transactional bootstrap while serving traffic.


## 019: HttpOnly refresh cookie sessions

Run `uv run --no-project --python .venv312 python -m backend.migrations.refresh_cookie_sessions --apply`
then `--check` before deploying cookie authentication. This additive transaction
creates only auth_refresh_sessions and its user/expiry index, enables RLS,
revokes PUBLIC/anon/authenticated access and records 019 in the existing ledger.
No school rows or existing account columns change. Lock timeout is five seconds;
a conflict rolls back. Startup checks 019 without applying it. Fresh bootstrap
includes 001–022. Preserve this additive table when rolling back application code;
never restore refresh-family records from a backup. Old browser-storage sessions
require a fresh login. Use custom same-site HTTPS origins for Strict cookies.


## 020: Remove remembered devices after the matching application is live

The application requires OTP for each new production password login and no
longer reads/writes `user_trusted_devices`. Valid refresh families keep working.
Old request fields remain accepted but inert; old backup imports discard only
the retired top-level collection. Browser cleanup preserves pending logout and
all form/assessment drafts. Keep `api_rate_limits`, refresh storage and their
security policies.

Target only Render **Apolinario Mabini School System** (`backend.main:app`),
Vercel **eccd-management-student-information-with-ml** (ameskinder.com), and
Supabase **AMES_SYSTEM_ML**. Do not operate on AMES-SYSTEM-1 or ames-system.

Deploy and verify the matching backend/frontend first. Retain a protected,
verified database backup with the original encryption keys. Stop API writers,
then run against the explicitly verified target database:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.remove_trusted_devices --check
uv run --no-project --python .venv312 python -m backend.migrations.remove_trusted_devices --apply
uv run --no-project --python .venv312 python -m backend.migrations.remove_trusted_devices --check
```

Initial check reports pending cleanup; unexpected dependencies must be reviewed.
Apply locks the ledger/table with a five-second lock timeout and transactionally
drops only the table using RESTRICT and records `020_remove_trusted_devices`.
Its own indexes/policies/grants disappear; external views/foreign keys stop the
upgrade. Repeated apply/check is safe. Startup never runs this destructive step.
Fresh bootstrap includes 001–022; historical migration schemas remain replayable.
No other pending cleanup (including 018) is authorized by this operation.

Resume the updated service and verify readiness, rate limiting, password → OTP →
refresh restoration → logout → OTP-required login. Do not roll back to an old
backend that queries the dropped table; use a compatible forward fix.
# Migration 021: parent home-observation review

`parent_home_observations` adds pending/review metadata and a separate private-photo
cleanup ledger (`home_observation_photos`). Existing evaluations remain unchanged.
Both tables enable RLS without public policies. Backend startup checks schema only;
it never applies migrations, including 016. Fresh bootstrap includes 021.

After a protected backup and stopping API writers, explicitly run:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.parent_home_observations --check
uv run --no-project --python .venv312 python -m backend.migrations.parent_home_observations --apply
uv run --no-project --python .venv312 python -m backend.migrations.parent_home_observations --check
```

The November 16 implementation is authorized/verified locally only against
loopback `ames_parity_dev` and disposable schemas. No hosted migration or bucket
provisioning is part of that delivery. Do not run an older backend after new pending
submissions exist: it would bypass review. See the root review plan for coordinated
client rollout, private Storage configuration, retention limits and cleanup scheduling.

## 022: Separate system branding from official school identity

`system_name` replaces `system_settings.school_name` and its API key. The rename
preserves every stored setting; only the future-row default changes to
`ECCD Management System`. Official documents/import validation always use
`APOLINARIO MABINI ELEMENTARY SCHOOL`, independent of branding. Legacy encrypted
backups map `school_name` on restore; conflicting dual keys are rejected.

Retain a protected backup and stop API writers. Coordinate the backend, website
and native client update with the explicit rename; an older backend cannot run
afterward. Against the verified intended database, run:

```powershell
uv run --no-project --python .venv312 python -m backend.migrations.system_name --check
uv run --no-project --python .venv312 python -m backend.migrations.system_name --apply
uv run --no-project --python .venv312 python -m backend.migrations.system_name --check
```

The initial check reports a pending migration. Apply locks settings/the ledger
with a five-second timeout, compares stored values before/after the rename, and
commits DDL and ledger together. Failure rolls back; repeated apply validates
without rewriting values. Startup only checks 022. Historical schema builders
keep `school_name` until this migration; fresh bootstrap includes 001–022.
