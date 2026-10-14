# Backend parity audit

This document records the earlier business-contract remediation. Its original
verification counts and scope below are historical. Current authority is
`../BACKEND_PARITY_READ_ONLY_AUDIT.md`: Batch 1 repaired 25 additional findings;
Batch 2 repaired all remaining health/deployment/security/rate/upload/index
findings and polling log noise. Explicit parity migrations were applied to the
configured local database. No frontend/legacy/dependency/secret files changed.

Reference: `AMES-SYSTEM-LEGACY/backend/`. Client: `frontend/src/services/api.ts`,
all chairman/teacher/parent pages, their API-consuming components/hooks, and
the auth/settings/teacher contexts. Both trees were read only. All changes are
inside `backend/`; no dependencies, database models, migrations, credentials or
environment files were changed.

## Confirmed gaps repaired

| Gap | Backend files | Contract verification |
| --- | --- | --- |
| Missing legacy `/api/logs` alias; legacy field names and teacher full names absent; history truncated at 100 | `main.py`, `routes/analytics.py`, `schemas/operations.py` | Both log URLs return identical history, including 102 synthetic records. `id/log_id` and `action/action_type` agree; `performed_by` retains username and `teacher_name` provides the legacy display name. Teacher access is denied. |
| Teacher filters returned no school years; configured year missing for empty cohorts; stats ignored selected section/year | `routes/analytics.py` | Assigned section choices, current/historical cohorts, empty rosters, other-section isolation, pie counts and selected-section totals verified. Default `All` continues to mean active students; an explicit year selects that cohort including archives. |
| Teacher stats omitted `allow_eccd_question_management`; priority used latest period per student instead of per question | `routes/analytics.py`, `schemas/operations.py` | Permission flag survives response serialization. A later answer to a different question no longer hides an earlier outstanding skill. |
| Legacy handover input `adviser_teacher_id` silently ignored; teacher update `section_id` ignored | `schemas/teacher.py`, `routes/teachers.py` | Legacy field maps to `teacher_id`. Existing normalized assignment helper performs handover, preserves substitutes/evaluations, and rejects missing sections without partial writes. |
| Teacher archive retained active assignments; unarchive restored old section access | `routes/teachers.py` | Archive deactivates all assignments, clears cached adviser/class fields, and retains assignment history and evaluation rows. Unarchive activates the account without reassigning it. |
| Legacy LRN correction silently ignored | `schemas/student.py`, `routes/students.py` | Staff can correct through the existing protected-LRN property. Integer ID, family links and evaluations remain intact. Duplicate corrections are rejected atomically; public payloads remain masked; parents cannot change LRNs. |
| Parent child-link alias overwrote the registered relationship with its default | `routes/parents.py` | Omitted relationship inherits the parent's registered relationship; supplied fields still pass through existing validation. |
| Parent profile updates dropped legal guardian fields | `schemas/parent.py` | Guardian name/age/occupation/education save and hydrate. Existing adviser edit locks return 403 and view locks mask guardian details. |
| Parent dashboard omitted legacy `overallStatus`, `overallStatusColor`, `domainCards`; progress responses dropped question metadata | `schemas/eccd.py`, `schemas/operations.py`, `utils/assessments.py`, `routes/eccd.py` | Legacy 80%/50% domain card thresholds coexist with current mastery statistics. Locked cards have null progress and pending-release text. Teacher question domain/home flags and parent home questions are included. |
| Missing legacy `/api/messages/unread`; unread polling loaded messages and repeated relationship queries | `routes/messages.py` | Both aliases use one `COUNT` with correlated `EXISTS`, active accounts, active students and active assignments. Siblings do not multiply counts; archived/read/unlinked messages are excluded. Query count verified independently of authentication. |

Regression tests: `tests/test_parity.py` uses the existing disposable PostgreSQL
fixture. It also checks the registered HTTP method/path for every legacy route,
three-period score/interpretation equality, publication locks, and ownership.

## Route and controller coverage

All **80 functional routes across eight legacy routers** are registered in the
current FastAPI OpenAPI document. Dynamic parameter names are normalized for
comparison; HTTP methods must match. The legacy `index.js` mounts were inspected.

| Legacy router | Routes | Current implementation |
| --- | ---: | --- |
| `authRoutes.js` | 7 | `routes/auth.py`, `utils/authentication.py`, `utils/account_changes.py` |
| `chairmanRoutes.js` | 27 | `routes/chairman.py`, `students.py`, `settings.py`, `backup.py`, `eccd_config.py`, `analytics.py` |
| `eccdRoutes.js` | 8 | `routes/eccd.py`, `utils/assessments.py` |
| `logRoutes.js` | 1 | `routes/analytics.py` |
| `messageRoutes.js` | 7 | `routes/messages.py`, `routes/students.py`, `utils/messaging.py` |
| `settingsRoutes.js` | 3 | `routes/settings.py`, `utils/rollover.py` |
| `studentRoutes.js` | 10 | `routes/students.py`, `utils/students.py`, `utils/access.py` |
| `teacherRoutes.js` | 17 | `routes/teachers.py`, `routes/analytics.py`, `utils/teachers.py`, `utils/excel.py` |

All 13 legacy controllers were cross-referenced: auth, chairman, chairman ECCD
configuration, chairman ECCD export, backup, ECCD, logs, messages, settings,
students, teachers, teacher ECCD import, and teacher ECCD export.

The frontend API client contains Axios transport, authentication headers, settings
multipart conversion, error handling and download handling. Calls live in pages,
hooks, components and contexts. Its current API families were checked:

| Client workflows | Backend coverage |
| --- | --- |
| Authentication/forced password change/account settings | `/api/auth/*`, `/api/chairman/account`, `/api/teachers/change-password-*` |
| Chairman dashboards and audit history | `/api/analytics/{filters,stats,pie-data,logs}`, retained `/api/chairman/dashboard-*` |
| Teacher selection, dashboards, settings | `/api/sections/`, `/api/teachers/dashboard-*`, `/api/teachers/me/access`, retained `/access-controls` |
| Teacher/chairman rosters and student CRUD | `/api/students/`, `/archived`, `/section/{id}`, `/{id}`, archive/unarchive/delete aliases, `/api/chairman/students` |
| Teacher/section management and transfer | `/api/teachers/`, `/active`, `/archived`, `/{user_id}`, `/api/chairman/sections/*`, teacher permissions, student transfer |
| Parent linking and profile hydration | `/api/students/my-child`, `/api/students/link`, `/api/parents/children/link`, `/api/students/{id}`, `/api/parents/children/{id}` |
| Assessments and progress | `/api/eccd/students`, `/domains-progress`, `/assessment/{id}`, `/evaluate`, `/parent/*`, `/api/parents/children/{id}/eccd-summary` |
| ECCD question management | `/api/eccd-config/*` and retained chairman configuration aliases |
| Workbooks | `/api/teachers/import-students`, `/download/{id}`, `/download-all`, `/api/chairman/export-eccd`, `/sections/{id}/export-summary` |
| Messaging | `/api/messages/{contacts,history,send,read,unread-count}` plus legacy link/read/unread aliases |
| Branding, backups, rollover | `/api/settings`, `/update`, `/upload-background`, `/api/backup/*`, chairman backup aliases, `/rollover-year`, `/undo-rollover` |

## Existing behavior preserved

The existing suite exercises both OTP states, challenge/replay/device handling,
credential replacement and first-login gating. These authentication flows were
not rewritten. Students retain integer primary keys and encrypted/HMAC LRNs;
API aliases remain masked and spreadsheet LRNs are decrypted in memory.

The six granular parent permissions continue to inherit from the active Primary
Adviser. Substitute access never releases parent results. Unreleased answers,
dates, ages, domain scores, totals and progress remain masked; locked edits return
403. Home submissions validate home-only questions and preserve unchanged dates.

Existing workbook import/export behavior passed its tests: reviewed templates,
school/adviser/demographic cells, score calculations, PRE/MID/POST dates,
historical school years, per-student import transactions, row errors,
cross-section rejection, and sections exceeding 30 children. Messaging retains
persisted IDs, contact/history hydration and authenticated Socket.IO rooms.

Rollover retains exact snapshots and the 30-day undo window. Restore retains live
accounts/credentials, validates before deletion, rolls back invalid relationships
and resets school-data sequences. Legacy MySQL backup containers, deprecated
coarse permission flags were not introduced; `AI_CONTEXT.md` explicitly
supersedes those legacy contracts. Deployment/readiness/rate-limit machinery
was outside this earlier patch and was subsequently restored in Batch 2.

## Verification environment

`pytest` is absent from both existing Python environments. The requested
`python -m pytest backend/tests -q` failed with `No module named pytest`.
No packages were installed. The backend tests are unittest tests and were run
through their native runner, including the new contract regressions.

The first baseline run had 57 passes and three failures solely because the
configured backup encryption key is invalid. Verification uses a generated
Fernet key patched **only in the test process**; `.env`, stored secrets and live
school records are untouched. This does not verify operational backups with the
currently configured invalid key.

Full-suite verification command (existing Python 3.12 environment):

```powershell
uv run --no-project --python .venv312 python -c "import unittest; from unittest.mock import patch; from cryptography.fernet import Fernet; from backend.config.settings import settings; scope=patch.object(settings, 'BACKUP_ENCRYPTION_KEY', Fernet.generate_key().decode()); scope.start(); suite=unittest.defaultTestLoader.discover('backend/tests', top_level_dir='.'); result=unittest.TextTestRunner(verbosity=1).run(suite); scope.stop(); raise SystemExit(not result.wasSuccessful())"
```

A temporary Uvicorn server used the existing `backend.tests.serve_phase3`
disposable-schema harness on loopback port 8768. Fifteen HTTP GET checks passed,
including twelve authenticated responses validated with their Pydantic schemas.
The temporary server was stopped; its port no longer has a listener.

Final results:

| Verification | Result |
| --- | --- |
| Python 3.12.13 syntax verification | All 83 backend Python files compile |
| Runtime import verification | All 64 config/model/schema/route/utility/app modules import |
| OpenAPI generation and legacy registration | 122 current paths; all 80 legacy method/path contracts present |
| Complete backend suite, native unittest runner | **71 passed; 0 failures/errors**, including 11 new parity tests; test-only backup key |
| Isolated Uvicorn smoke checks | 15 HTTP 200 responses; 12 authenticated JSON responses schema-validated |
| Requested pytest runner | Unavailable: pytest is not installed; no installation performed |
| Read-only boundaries / diff hygiene | Only backend files changed; `git diff --check` passed |
