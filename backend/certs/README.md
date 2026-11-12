# Supabase database CA

`prod-ca-2021.crt` is the public Supabase Root 2021 CA downloaded from the
Supabase Dashboard's database SSL settings. It contains no private key.
It expires on **2031-04-26 10:56:53 UTC**; replace it with the appropriate
trusted Supabase CA before expiry or a provider certificate rotation.

Certificate SHA-256 fingerprint (DER):
`807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.

Production settings use this file when the effective root certificate setting
is absent, empty, or `system`. An explicit `DATABASE_SSL_ROOT_CERT` path wins;
otherwise an explicit URL `sslrootcert` path is preserved. Development keeps
its configured behavior. `sslmode=verify-full` remains mandatory in production.
The absolute bundled path is resolved from the backend directory, independently
of the process working directory, and passed through SQLAlchemy to libpq.
