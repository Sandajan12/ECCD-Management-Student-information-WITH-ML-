# Official ECCD baseline

`eccd.json` is the existing tracked, UTF-8 reference fixture used by the API.
On 2026-10-25, a read-only comparison against the configured local PostgreSQL
database confirmed an exact match: 7 domains and 109 questions. It preserves
`domain_id`, domain name, `question_id`, domain mapping, `sequence_order` (item
number within each domain), indicator text, and `is_home_based`. Numeric 0/1
home flags in JSON correspond to PostgreSQL booleans.

This fixture contains checklist reference data only, with no learner records,
accounts, password hashes, or credentials. Do not export school/user tables here.
Use `python -m backend.scripts.seed_supabase --apply` for explicit, repeatable
provisioning; see [the bootstrap guide](../../scripts/README.md).
