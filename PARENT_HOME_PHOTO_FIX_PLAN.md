# Fix local home-observation photo submissions

Date: 2026-11-17  
Branch: `feat/parent-native-android`  
Status: Implemented locally on `feat/parent-native-android`; the four approved checks passed (41 backend tests, 60 native tests and both TypeScript checks). See `AI_CONTEXT_HISTORY.md` for dated evidence and limits.

## Confirmed diagnosis before implementation

- Local settings load `ENVIRONMENT=development`, with both `SUPABASE_STORAGE_URL` and `SUPABASE_STORAGE_SERVICE_KEY` absent. The parent website targets the loopback API. `HOME_OBSERVATION_PHOTO_BUCKET` retains its default, `home-observation-proofs`.
- [`backend/utils/home_photos.py`](backend/utils/home_photos.py) always selects `SupabasePhotoStorage`. A read-only reproduction returned **503: "Private photo storage is not configured."** before creating a network client. Missing configuration is the demonstrated blocker; remote reachability was not tested.
- [`HomeAssessmentForm.tsx`](frontend/src/components/parent/HomeAssessmentForm.tsx) delegates submission to [`useParentAssessment.ts`](frontend/src/hooks/useParentAssessment.ts). It uploads selected photos first, then sends `POST /api/eccd/parent/evaluate`. An upload failure prevents that second request, so no pending observation is created. Submissions without photos skip the failing storage operation.
- No photo-reference mismatch was found: both clients map question IDs to uploaded `photo_id` values. Backend submission validation checks the parent, student, question, testing period, readiness, deletion state and whether the photo is already attached.
- `GET /api/eccd/home-observations/pending` reads database metadata only. It does not contact storage or resolve private previews. The Teacher dialog fetches previews separately; preview failure displays "Photo unavailable" without hiding the observation.
- Both clients obscure storage 503 errors with generic reconnect messages, making a missing storage configuration look like a network problem.

### Exact website and backend flow

1. `HomeAssessmentForm.tsx` renders optional photo controls through `HomePhotoField.tsx`. Selected files and revisions are retained in IndexedDB using owner/student/period/question-scoped keys.
2. `useParentAssessment.ts` snapshots answered questions and, on explicit submission, uploads each selected photo to `POST /api/eccd/parent/home-photos/{student_id}/{question_id}/{period}`.
3. [`backend/routes/home_observations.py`](backend/routes/home_observations.py) validates parent access, editing windows, question eligibility and image content. It commits photo metadata before calling storage, then marks the photo ready only after a successful upload. A storage failure can leave an unattached, non-ready metadata record for later cleanup; it does not create a pending observation.
4. After all uploads succeed, the website sends `POST /api/eccd/parent/evaluate` with `student_id`, `testing_period`, `evaluations` and optional `photo_ids`.
5. [`backend/routes/eccd.py`](backend/routes/eccd.py) delegates to `save_home_evaluation` in [`backend/utils/assessments.py`](backend/utils/assessments.py). The complete batch is validated before creating pending `parent_home_observations`. Pending answers remain separate from official evaluations.
6. `GET /api/eccd/home-observations/pending` serializes pending rows through `public_observation` in [`backend/utils/home_observations.py`](backend/utils/home_observations.py). Its `has_photo` flag depends on lifecycle metadata, not storage availability.
7. [`useHomeObservations.ts`](frontend/src/hooks/useHomeObservations.ts), owned by TeacherProvider, supplies the shared pending list. [`HomeObservationReview.tsx`](frontend/src/components/teacher/HomeObservationReview.tsx) renders the Pending Home-Based Assessments dialog and fetches each preview independently from `GET /api/eccd/home-observations/{observation_id}/photo` using the authenticated blob client.
8. Saved Accept/Decline decisions commit before physical deletion. Existing cleanup revokes reads immediately and preserves durable deletion retries if storage deletion fails.

### Native Android audit

- [`src/homeObservations.ts`](mobile/parent-native-android/src/homeObservations.ts) uses the same upload-before-submit sequence and the same `photo_ids` mapping. Against this local API, it has the same missing-storage blocker. No matching payload correction is currently indicated.
- [`src/OverviewScreen.tsx`](mobile/parent-native-android/src/OverviewScreen.tsx) uses `react-native-image-picker` for one photo without base64 or extra metadata. Drafts retain URI/type/name metadata; uploads use a multipart `file` field through the shared session client.
- [`src/sessionCore.ts`](mobile/parent-native-android/src/sessionCore.ts) recognizes FormData and leaves multipart Content-Type/boundary generation to the platform. It sends the live RAM bearer token. Multipart handling is correct in source.
- Uploaded IDs are retained for manual retries, and owner/revision checks protect drafts and prevent submission after an account switch. Upload failure stops the answer submission.
- Native submission error handling classifies storage 503s as network failures and replaces their detail with the generic offline message. This needs the same focused error-visibility improvement as the website.
- The native default API target is `https://api.ameskinder.com`; local emulator builds can target `http://10.0.2.2:8000`. This audit does not establish the target of an installed APK, production storage behavior, real-device multipart acceptance or picker URI durability.

## Implementation

### Private local storage fallback

- Add a small filesystem storage adapter using Python's standard library and the existing storage dependency. Store sanitized JPEGs in gitignored `backend/.local_home_photos/`, resolved relative to the backend directory rather than the working directory.
- Apply the user-selected policy: automatically use local storage **only in development when both remote URL and service key are absent**. Partial configuration, invalid configuration, public buckets and configured-provider outages remain explicit errors. Production never falls back locally.
- Keep private Supabase Storage authoritative when configured. Preserve its current private-bucket checks and server-only credentials.
- Distinguish local objects through an internal key prefix within the existing `object_key` column. Route reads and deletion by that prefix so enabling remote storage later does not strand existing local evidence. Preserve existing remote keys and do not reinterpret them as local objects. Local filesystem operations remain development-only.
- Restrict filesystem operations to generated keys inside the private directory; reject traversal and symlink escapes. Use exclusive writes, return sanitized errors, and treat deletion of an already-missing file as successful. Other filesystem failures retain cleanup intents.
- Serve local evidence exclusively through the existing authenticated photo endpoint with `Cache-Control: no-store`. Add no static mount, public URL, client storage credential or image bytes in API JSON/backups.

### Lifecycle and client feedback

- Reuse existing review cleanup: commit Accept/Decline and revoke access first, then delete the file. Retain deletion tombstones on failure; preserve abandoned-upload expiry and the existing cleanup command. Pending submitted evidence retains its current no-automatic-expiry behavior.
- Keep the pending list independent of preview availability. A missing or unreadable photo must not hide its submitted answer or prevent an authorized review.
- In website and native submission handling, show returned photo-upload errors with explicit draft-retention/manual-retry wording. Preserve transient-error handling, owner/revision checks, selected files and answers. Never continue without the selected photo or claim submission succeeded after upload failure.
- Keep native picker and payload contracts unchanged unless targeted implementation evidence reveals a concrete defect. Do not introduce automatic upload/submission replay.
- Update local setup guidance, `AI_CONTEXT.md` and the matching photo-storage rule in `AGENTS.md`; record dated executed results separately in `AI_CONTEXT_HISTORY.md`. The current remote-only guidance describes existing behavior and will need to document the intentional development fallback.

## Verification after approval

Extend only the existing home-photo/review tests and native tests to cover:

- Missing-config local selection, production exclusion, partial configuration and configured-provider failures.
- Upload -> submit -> pending list -> authenticated preview using temporary filesystem storage, with no remote storage requests.
- Accept and Decline deletion, immediate read revocation, deletion retries, missing files, path rejection and backend routing after configuration changes.
- Pending-list availability when preview storage fails.
- Existing parent/current-adviser authorization, ownership/reference validation and no-photo behavior.
- Native upload failure preventing submission, retained drafts, manual retry, successful photo-ID reuse and account-switch protection.

Run only these commands from the repository root:

```powershell
uv run --no-project --python .venv312 python -m pytest backend/tests/test_home_photo_storage.py backend/tests/test_parent_home_review.py -q
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir mobile/parent-native-android exec tsc --noEmit
pnpm.cmd --dir mobile/parent-native-android test
```

The backend integration fixture requires the isolated loopback `ames_parity_dev` database. The inspected configuration matches that requirement; database availability was not tested. Reuse disposable test schemas and existing fixture setup, never operational school data. Do not add or manually apply database migrations.

## Boundaries and acceptance

- Stay on `feat/parent-native-android`; preserve existing untracked work and leave `mobile/parent-android` untouched. No main checkout/merge, push, new migration, deployment or Render/Vercel/Supabase remote tools.
- Preserve public API paths/shapes, all eight parent gates, photo eligibility, official assessment rules, review semantics and manual-only parent submission. Access tokens/users remain in RAM. Clear only matching confirmed draft/file revisions.
- Add no dependencies. Consult the existing Graphify mapping and refresh stale relevant AST mappings before shared-code edits. Review the proposed diff against the Ponytail checkpoint: "Did this change introduce unnecessary abstractions, extra state, or new dependencies that existing code already handles?"
- Acceptance: with no remote storage setup, a local photo submission appears in the Teacher dialog, its authorized preview loads, and saved Accept/Decline removes access and deletes its file. Configured private Supabase behavior continues unchanged.

## Original investigation evidence and limits

The investigation inspected active source, configuration presence flags, dependency mappings and existing tests. It reproduced the selected adapter's missing-configuration 503 without making a network request or writing a photo. No application implementation or test suite has run. The diagnosis establishes the local configuration failure, not an authenticated end-to-end reproduction of a particular attempted submission. Real-device picker/URI durability, installed APK configuration and production storage remain unverified.

The paragraph above records the pre-implementation investigation. Implementation
and the four approved checks are now complete: 41 backend tests and 60 native
tests passed, and both TypeScript checks passed. Backend checks used isolated
loopback test schemas, temporary photo directories and mocked storage HTTP;
native checks used Node/mock hosts. No browser suite, Android build/device check,
operational migration or remote infrastructure operation was run. Final privacy
review also added Vite's explicit private-photo filesystem deny rule, with its
access check included in the approved backend test file. Restart the
local backend and Vite, then manually resubmit the retained answer/photo draft from
`http://localhost:5173` to verify the actual browser flow.
