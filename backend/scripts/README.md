# Fresh PostgreSQL / Supabase bootstrap

Run from the repository root after configuring `backend/.env` or process
environment variables. The utility uses the application's normal database engine:
`DATABASE_URL` takes precedence over `SUPABASE_DB_URL`, and production requires
`sslmode=verify-full` plus the configured trusted CA. Use the direct connection
or session pooler with a database role allowed to create tables, enum types,
indexes and sequences. This provisions AMES tables, not Supabase Auth accounts.

Supply all normal backend settings first, including stable JWT, backup and LRN
keys and production OTP/email settings. Preserve existing keys during upgrades.
Set these three bootstrap variables privately in the process environment or
untracked `backend/.env` (never pass a password as a command argument):

| Variable | Meaning |
| --- | --- |
| `INITIAL_CHAIRMAN_EMAIL` | Login email, at most 100 characters |
| `INITIAL_CHAIRMAN_PASSWORD` | At least 8 characters, uppercase, lowercase and a digit; at most 72 UTF-8 bytes |
| `INITIAL_CHAIRMAN_NAME` | Display name stored in `system_settings.chairman_name`, 1–255 characters, using the normal person-name rules |

The Chairman display name is separate from email-only account identity. The role
is stored as `super-admin`, the application's Chairman role. New Chairmen are
active, not registration-pending, and authenticate through the normal OTP flow.
No default password is supplied and no local account/hash is exported.

Stop API writers while provisioning or upgrading, then run:

```sh
uv run --no-project --python 3.12 python -m backend.scripts.seed_supabase --apply
```

On this Windows checkout, use `--python .venv312` to select the installed Python
3.12 environment. The target schema must already exist (default `public`);
`--schema bootstrap_test_...` is available for isolated verification. The command
does not create databases or change the application's connection settings.

All pending migrations run in order, **001–016**. The current API also requires
the optional-LRN schema (015). Migration 016 adds the nullable teacher save
timestamp without backfilling historical records; startup can apply that one
additive upgrade transactionally. Applied migrations are skipped, then the final
schema is checked; historical Phase 1 checks cannot validate a Phase 2 schema.
The runner uses the existing migration functions and their preservation checks.
It accepts fresh databases and compatible versioned AMES schemas; unknown ledger
versions or incompatible schemas stop the transaction for explicit review.

The tracked [ECCD fixture](../assets/reference/eccd.json) supplies all 7 domains
and 109 indicators with their exact IDs, mappings, item numbers, text and home
flags. Missing rows are inserted with `ON CONFLICT DO NOTHING`. Existing matches
are preserved, custom nonconflicting rows remain, and conflicting IDs or item
numbers stop the entire transaction instead of overwriting school edits.
Sequences advance if explicit IDs would cause the next generated ID to collide;
sequences that are already ahead are preserved.

If any Chairman exists, the default run preserves every account field and
password hash, even when different bootstrap credentials are supplied. The three
variables may be removed after initial provisioning. Without an existing Chairman,
all three are required; supplying only some of them is always an error.

To deliberately update the existing Chairman with these credentials, run:

```sh
uv run --no-project --python 3.12 python -m backend.scripts.seed_supabase --apply --update-chairman
```

With one Chairman, this may update its email, display name, password and active
flags. With multiple Chairmen, the email must select the account to update.
The command never promotes a Parent or Teacher because of an email collision.
A changed account revokes previous JWTs, OTP challenges and remembered devices;
identical credentials cause no writes or password rehash. An archived account is
reactivated only by this explicit update option.

An advisory transaction lock serializes bootstrap runs per schema. DDL, seed
rows and account creation/update commit together; failures roll back everything.
Successful output contains migration versions, inserted counts and account action
only. It never prints credentials, hashes or the database connection URL.
Application startup still validates schema rather than applying migrations.

Verification uses disposable PostgreSQL schemas in the configured database:

```sh
uv run --no-project --python 3.12 python -m unittest backend.tests.test_seed_supabase -v
```

This baseline bootstrap does not copy existing school data or demonstrate a full
backup/restore migration. H5's complete hosted migration/disaster recovery checks
remain separate deployment work.
