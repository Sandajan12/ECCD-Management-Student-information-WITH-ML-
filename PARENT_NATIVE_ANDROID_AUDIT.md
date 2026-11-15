# Native Android Parent App: Codebase and Local Environment Audit

Audit date: **2026-11-15**

Audited branch: **main**

Audited commit: **c5d9279ccfe453fa3fb7e7f3240d366d53ba15c0**

This document preserves the read-only audit performed before building the native Android parent app. The checkout initially reported `feat/parent-android-app`; the user authorized switching to `main`. Final checks confirmed `main` at the commit above. No application files were intentionally created or edited during that audit, and no commits were made. Tracked files remained unchanged; the existing untracked `mobile/` directory was left untouched. Creating this report was separately requested afterward.

Evidence comes from local source, schemas, frontend callers, configuration inspection, and tool-version checks. No Render, Vercel, Supabase, database, browser, Playwright, or pytest calls were made. Source contracts do not establish deployed behavior. The existing graph was consulted and relevant paths checked against current source; no graph files were regenerated.

## 1. Local Windows tools and storage

`U` below means `C:\Users\user`. `SDK` means `C:\Users\user\.bubblewrap\android_sdk`.

| Tool | Installed version / location |
| --- | --- |
| Java/Javac | **17.0.11**, Temurin, **x86**; `U\.bubblewrap\jdk\jdk-17.0.11+9\bin\` |
| JDK 21 | Not found in inspected installation locations |
| Android SDK | `U\.bubblewrap\android_sdk` |
| Android platform | `SDK\platforms\android-36` |
| Build Tools | **35.0.0**, **36.0.0** |
| adb | **1.0.41**, package **37.0.1-15733141**; `SDK\platform-tools\adb.exe` |
| apksigner | Reports **0.9**; `SDK\build-tools\36.0.0\apksigner.bat`; also present under `35.0.0` |
| sdkmanager | Reports **4.0.1** with explicit `--sdk_root`; `SDK\tools\bin\sdkmanager.bat` |
| Gradle | Cached distributions **8.11.1**, **9.3.1**; no global `gradle` command |
| Node | **v24.11.1**; `C:\Program Files\nodejs\node.exe` |
| pnpm | **12.11.2**; `U\AppData\Local\pnpm\bin\pnpm.CMD` |
| C: free space | **9,946,386,432 bytes — 9.26 GiB**, reported by `Get-PSDrive C` |

Exact cached Gradle executables:

```text
C:\Users\user\.gradle\wrapper\dists\gradle-8.11.1-bin\bpt9gzteqjrbo1mjrsomdt32c\gradle-8.11.1\bin\gradle.bat
C:\Users\user\.gradle\wrapper\dists\gradle-9.3.1-bin\23ovyewtku6u96viwx3xl3oks\gradle-9.3.1\bin\gradle.bat
```

- `JAVA_HOME`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT` were initially **unset**. `JAVA_HOME` was set only within version-check processes; no persistent environment settings were changed.
- Java, adb, apksigner, sdkmanager, and Gradle are **not on PATH**.
- `%LOCALAPPDATA%\Android\Sdk` and the standard `C:\Program Files\Android\Android Studio` installation directory are absent.
- Bubblewrap's local configuration identifies the private JDK and SDK paths above.
- sdkmanager fails without an explicit SDK root. With `--sdk_root`, its executable reports `4.0.1` and emits legacy namespace warnings. Its `tools\source.properties` metadata says revision `2.1`.
- Gradle versions were identified from installed distributions; no build or Gradle initialization was run.
- The JDK is **32-bit x86**. Native Android build compatibility was not tested.

## 2. Authentication, cookies, and origin security

Sources: [auth routes](backend/routes/auth.py), [auth schemas](backend/schemas/auth.py), [cookie/session implementation](backend/utils/authentication.py), [settings](backend/config/settings.py), [ASGI/CORS configuration](backend/main.py).

All bodies below are JSON. Authentication routes inherit the origin check.

| Method and endpoint | Request body | Success response |
| --- | --- | --- |
| `POST /api/auth/register-parent` | `{email,password,firstName,lastName,relationship?:"Guardian",terms_accepted?:true}` | **201** OTP challenge; **200** for retrying an existing pending registration. Returns a session directly when local OTP is disabled. |
| `POST /api/auth/login` | `{email,password,terms_accepted?:true,otp?,challengeToken?}` | **200** OTP challenge, or session after valid OTP/local bypass |
| `POST /api/auth/login-step1` | Same as login | Login alias |
| `POST /api/auth/verify-otp` | `{challengeToken,otp,terms_accepted?:true}` | **200** session; message `"Verification successful!"` |
| `POST /api/auth/refresh` | **No body**; refresh cookie required | **200** session and rotated refresh cookie |
| `POST /api/auth/logout` | No body required | **200** `{"success":true}`; revokes refresh family and deletes cookie |
| Parent password reset | **No endpoint implemented** | No forgot-password or parent password-change flow found |

Registration accepts `first_name`/`last_name` and `relationship_type` aliases. Its optional `otp` field defaults to `""`; verification happens through `/verify-otp`.

Legacy remember-device inputs remain accepted but inert:

- Login: `rememberDevice` (alias `remember_device`), `rememberMe`, `deviceToken`, `trusted_device_token`.
- Registration: `rememberDevice` (alias `remember_device`), `rememberMe`.
- Logout: `forgetDevice`, `deviceToken`, `trusted_device_token`.

`/api/auth/send-otp` and `/api/auth/request-otp` are **Chairman-only email-change routes**, not parent OTP resend/reset endpoints. `/api/auth/update-password` is restricted to first-login teachers. Teacher password-change routes are not available to parent accounts.

### OTP challenge JSON

```json
{
  "success": true,
  "requireOtp": true,
  "requiresOtp": true,
  "challengeToken": "<challenge JWT>",
  "email": "<normalized email>",
  "emailSent": true
}
```

Optional `code` and `message` appear when applicable. Registration email delivery failure returns `emailSent:false`, `code:"REGISTRATION_EMAIL_FAILED"`, and retry instructions. Retrying registration uses the same email and password; issuing challenges remains subject to cooldown.

### Session JSON

```json
{
  "success": true,
  "message": "Login successful!",
  "token": "<access JWT>",
  "access_token": "<same access JWT>",
  "user": {
    "id": 123,
    "userId": 123,
    "sub": "123",
    "first_name": "...",
    "last_name": "...",
    "full_name": "...",
    "email": "...",
    "role": "user",
    "is_first_login": 0,
    "section_id": null,
    "section_name": null,
    "allow_eccd_question_management": false
  },
  "requireOtp": false,
  "requiresOtp": false,
  "requiresPasswordChange": false,
  "email": null
}
```

Login/registration exclude null fields recursively; verification/refresh retain nullable fields. Registration with OTP disabled uses the account-created message. Parent role is **`"user"`**. `user.id` is the **account ID**, not the messaging `parent_id`.

### Validation and session rules

- Email is normalized by trimming and lowercasing; maximum 100 characters.
- OTP: exactly **six ASCII digits**; challenge expires after **10 minutes**, with a **60-second reissue cooldown** and five incorrect attempts.
- New password: at least eight characters, uppercase, lowercase, and a number; maximum **72 UTF-8 bytes**.
- Names use the current Unicode-letter/name validation; the combined registration name must fit 100 characters.
- `terms_accepted` can be omitted for compatibility; if supplied, it must be `true`.
- Protected REST requests use `Authorization: Bearer <access_token>`.
- Access JWTs use `tokenType:"session"`; access lifetime defaults to **30 minutes**.
- Refresh lifetime slides **24 hours**, with a **10-second rotation grace**.
- Refresh tokens are **never returned in JSON** and cannot authorize ordinary REST or Socket.IO requests.
- Website access tokens and user context remain in RAM; credentials do not belong in draft storage.

### Refresh cookie

```text
Name: ames_refresh_token
Path: /api/auth
Domain: omitted — host-only
HttpOnly: true
Secure: true, except plain HTTP loopback in development
SameSite: Strict
Max-Age: REFRESH_TOKEN_EXPIRE_MINUTES × 60; default 86400
```

Session delivery sends `Cache-Control: no-store`. Logout deletes the cookie and revokes its refresh family. Session delivery/logout also expire retired host-only `device_token` and `trusted_device_token` cookies at `/`.

### Exact allowed origins

The local effective settings and source defaults contain:

```text
http://localhost:5173
http://127.0.0.1:5173
https://ameskinder.com
https://www.ameskinder.com
https://ames-ml.vercel.app
```

`Origin` takes precedence. When absent, the server extracts `scheme://host[:port]` from `Referer`. Production rejects missing or unmatched origins. Additional origins can come from `FRONTEND_URL`, `ALLOWED_ORIGINS`, and `CORS_ORIGINS`; deployed overrides were not inspected.

CORS allows credentials:

- Methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD`.
- Headers: `Authorization, Content-Type, Accept, X-Device-Token`.
- Exposed response headers: `Content-Disposition, Retry-After, Date`.

**Local configuration:** development mode, OTP **disabled**, access/refresh **30/1440 minutes**, frontend API and Socket URLs both `http://localhost:8000`. Production defaults require OTP. These observations do not verify production configuration.

### Common HTTP error shapes

Handled HTTP errors serialize as:

```json
{
  "success": false,
  "detail": "<error detail>",
  "message": "<error detail>",
  "code": "<optional auth error code>"
}
```

Auth codes include `TOKEN_EXPIRED`, `INVALID_TOKEN`, `SESSION_REVOKED`, and `ACCOUNT_INACTIVE`. Validation failures return HTTP 422 with `success:false`, `message:"Invalid request data."`, and `detail:[{loc,type,msg}]`. Sensitive rejected input values are omitted. Unhandled errors return a sanitized HTTP 500 response.

## 3. Parent data, assessment contracts, and drafts

All `{id}` values below are **integer student IDs**, including routes whose parameter is named `lrn` or `student_lrn`. These endpoints require the parent bearer session unless explicitly stated otherwise.

### Children and profile CRUD

| Endpoint | Parameters / payload | Response |
| --- | --- | --- |
| `GET /api/students/my-child` | None | `ChildPublicResponse[]` |
| `GET /api/students/{id}` | Path ID only | `ChildPublicResponse` |
| `POST /api/parents/children/link` | `{lrn_number:"<12 ASCII digits>",relationship_type?:"Guardian"}` | `{message,student_id,masked_lrn,status:"PENDING"\|"SYNCED"}` |
| `PUT /api/parents/children/{id}` | Partial editable fields below | `{"message":"Student details successfully updated!"}` |

Read aliases: `/api/students/linked`, `/api/parents/children`. Linking aliases: `/api/students/link`, `/api/messages/link-lrn`; these also accept `student_lrn`. Student-update aliases also exist at `PUT /api/students/{id}` and `/api/students/update/{id}` with the same parent authorization boundary.

There is **no parent create/delete/archive-student endpoint**. Linking can immediately return `SYNCED`, or `PENDING` when prior account-link history requires teacher approval. An account-linked child already attached to a different parent account is rejected.

`ChildPublicResponse` contains:

- Identity/profile: `student_id`, `lrn_last4`, `masked_lrn`, `lrn`, `lrn_number`, `first_name`, `middle_name`, `last_name`, `full_name`, `date_of_birth`, `gender`, `age`, `decimal_age`.
- Enrollment: `section_id`, `section_name`, `class_name`, `school_year`, `is_active`, `adviser_name`, `teacher_fname`, `teacher_lname`.
- Household: `address`, `handedness`, `num_of_siblings`, `birth_order`, `emergency_contact`, `parent_names`, `profile_completeness`, `parents[]`.
- Guardian fields: `{father,mother,legal_guardian}_{name,age,occ,educ}`.
- All eight permission booleans below.

`parents[]` entries contain `{fullname,relationship,age,occupation,educational_attainment}`. Optional profile values are nullable. LRN aliases are **masked**, never plaintext. `student_id` is the routing/storage identity.

Editable payload fields are:

```text
emergency_contact, address, handedness, num_of_siblings, birth_order,
father_name, father_age, father_occ, father_educ,
mother_name, mother_age, mother_occ, mother_educ,
legal_guardian_name, legal_guardian_age, legal_guardian_occ, legal_guardian_educ
```

The current web form submits only changed fields and exposes father/mother fields, not legal-guardian editing. Contact numbers must match `09` plus nine digits; handedness is `Left|Right`; ages/sibling counts are nonnegative integers. Limits: address/name 100 characters, occupation/birth order 50, education 20. Empty numeric values normalize to null. Existing guardian records cannot lose their required name. Updating a shared guardian checks authorization for other linked children too.

Parents cannot change LRN, enrollment identity, section, school year, or active state.

Sources: [student response schemas](backend/schemas/student.py), [parent update schema](backend/schemas/parent.py), [student routes](backend/routes/students.py), [profile payload builder](frontend/src/utils/parentProfile.ts).

### Adviser inheritance and release gates

Eligibility requires a **SYNCED family link**, active student, and an **Active Primary Adviser assignment with an active account**. Existing unavailable children return **403**; missing students return **404**.

| Exact permission | Default |
| --- | --- |
| `allow_parent_view_student_info` | `true` |
| `allow_parent_view_eccd_pre` | `false` |
| `allow_parent_view_eccd_mid` | `false` |
| `allow_parent_view_eccd_post` | `false` |
| `allow_parent_view_eccd_marks` | `false` |
| `allow_parent_predictions` | `false` |
| `allow_parent_edit_student_info` | `true` |
| `allow_parent_edit_home_based_eccd` | `false` |

Values come from the child's active adviser. Score release, checklist-mark visibility, prediction access, and editing are independent. These flags are returned at the top level of child profiles and in `permissions` on the assessment response. With student-info viewing disabled, profile fields are masked rather than treating the flag as access to the whole child.

Section editing windows are returned as:

```json
{
  "pre_test_parent_editable": true,
  "mid_test_parent_editable": false,
  "post_test_parent_editable": false
}
```

These are defaults, not assumed current database values. Home submission requires both the global home-edit permission and the selected period's window. No coarse parent-view/edit flag should replace these gates.

Sources: [access resolution](backend/utils/access.py), [permissions schema](backend/schemas/common.py), [window schema](backend/schemas/assessment_access.py).

### Home observations and results

| Endpoint | Query/body | Response schema |
| --- | --- | --- |
| `GET /api/eccd/parent/assessment/{id}` | None | `ParentAssessmentResponse` |
| `POST /api/eccd/parent/evaluate` | JSON below | `{message:"Assessment saved successfully!",testing_period}` |
| `GET /api/eccd/parent/dashboard-stats/{id}` | None | `ParentDashboardResponse` |
| `GET /api/eccd/parent/domains-progress/{id}` | None | `DomainProgress[]` |
| `GET /api/eccd/parent/progress/{id}` | None | Compatibility projection: `[{period,domains:[{domain_name,progress_percentage}]}]` |
| `GET /api/parents/children/{id}/eccd-summary` | None | Compatibility `ParentEccdSummaryResponse`; not called by current Parent pages |

The primary assessment response supplies domains and indicators; current Parent screens do not need a separate ECCD-configuration request.

Canonical submission:

```json
{
  "student_id": 123,
  "testing_period": "PRE",
  "evaluations": [
    {
      "question_id": 45,
      "testing_period": "PRE",
      "answer": "KAYA"
    },
    {
      "question_id": 46,
      "testing_period": "PRE",
      "answer": "DI-KAYA"
    }
  ]
}
```

All entries must use one period, have unique question IDs, and target home-based questions. Batch size is **1–1000**. `student_lrn` remains an accepted identifier alias. Top-level period can be omitted and inferred from entries; each entry still requires its period. Parent submissions use string answers, not the teacher batch's numeric-answer compatibility normalization.

Saved observations lock. Identical retries succeed without changing provenance; changed answers return **409**. Permission/window failures return **403**. Unknown questions return **400**. Completed teacher-confirmed PRE mastery also restricts contradictory later-period answers. Parent observations do not replace official teacher assessment dates.

#### Assessment response fields

[Authoritative schema](backend/schemas/eccd.py):

```text
student_id, masked_lrn, student_birth_date,
domains[], evalAges, periodDates, evaluationDates, gradingDates,
allow_parent_view_eccd_marks, parent_assessment_access,
student, permissions, summary, matrix[], homeBasedChecklist[],
can_edit_home_based
```

- `student` uses `StudentPublicResponse`; the child-profile endpoint adds guardian detail and permission fields.
- `domains[]`: `{domain_id,domain_name,questions[]}`.
- Each question: `question_id,question_text,sequence_order,domain_id,domain_name,is_home_based`, plus period maps `answers`, `evaluator_roles`, `parent_submitted_at`, `teacher_marked_at`, `parent_locked`.
- Map keys are **PRE/MID/POST**. Answers are `"KAYA"|"DI-KAYA"|null`; evaluator roles are `"teacher"|"parent"|null`; locks are booleans.
- Date fields serialize as ISO dates/timestamps or null.
- `evalAges` maps domain ID strings to period-age maps.
- `periodDates`, `evaluationDates`, and `gradingDates` are period-date maps.
- `matrix[]`: `{domain_id,domain_code,domain_name,scores:{PRE,MID,POST}}`, with nullable scaled scores.
- `homeBasedChecklist` is a home-only compatibility projection of question rows.
- `summary[period]` contains:

```text
period, isReleased, isEvaluated, is_published,
assessmentDate, decimalAge, standardScore, interpretation,
rawScores, scaledScores, sumOfScaledScores
```

Score maps use **GM, FM, SH, RL, EL, C, SE**. Unreleased metrics/dates/ages are null, `is_published:false`, interpretation `"Pending Adviser Release"`.

With marks disabled, only the authenticated parent's own observations in open editing windows remain visible. Releasing scores does not release marks. Neutral `parent_locked` values can prevent edits without exposing a hidden answer or author.

`ParentDashboardResponse` contains:

```text
currentPhase, latestPhase, excelsIn, needsSupportIn, assessmentMastered,
totalKaya, totalDiKaya, is_published, interpretation,
overallStatus, overallStatusColor, domainCards[]
```

Each domain card contains:

```text
domain_id, domain_name, scoreText, progress, statusText, statusColor,
isExcelling, needsSupport
```

The dashboard selects the latest saved period **POST → MID → PRE**, with no fallback to older released results when the latest is locked. Locked totals/progress are null. Ties for strengths/support use alphabetical ordering.

`DomainProgress` contains `{domain_id,domain_name,pre_progress,mid_progress,post_progress,questions[]}`. Its serialized questions contain reference fields only—**not recorded answer/provenance maps**. Reference question fields are `domain_id,question_text,sequence_order,is_home_based,question_id`; use the primary assessment response for marks.

The compatibility ECCD summary returns `{student_id,student_lrn,student_name,current_phase,periods,permissions}`; each period contains `{testing_period,is_published,evaluation_date,decimal_age,domains:[{domain_code,domain_name,raw_score,scaled_score}],sum_of_scaled_scores,standard_score,interpretation}`. Period values can be null. Its permission dictionary currently includes only six flags, excluding marks and predictions; use the primary assessment/child contracts for all eight.

Sources: [ECCD routes](backend/routes/eccd.py), [assessment implementation](backend/utils/assessments.py), [compatibility summary](backend/routes/parents.py).

### Random Forest insights

| Endpoint | Request | Response |
| --- | --- | --- |
| `GET /api/ml/parent/readiness/{id}` | No query/body | `{student_id,student_name,pre_complete,readiness_note,allow_parent_predictions,is_published}` |
| `POST /api/ml/parent/predict/{id}` | **No body** | `ParentPredictionResponse` |

Prediction requires eligibility, prediction permission, complete PRE readiness with a teacher-confirmed date, and independent PRE score release. Disabled/release gates return **403**, incomplete PRE **400**, unavailable model **503**. Readiness covers configured official questions in domains 1–7, all required answers, an official teacher-confirmed PRE date, and a valid earlier birth date.

Exact parent prediction fields:

```text
prediction_status:"available", support_reason:null,
predicted_post_interpretation,
confidence_percentages, confidence_percentage, unsupported_classes,
pre_interpretation, student_id, student_name, assessment_date,
baseline_domains[], interventions[], interpretation_note, research_notice
```

- Baseline: `{domain,name,pre_scaled_score,tier}`, tier `Delay|Slight Delay|Average`.
- Intervention adds `goal,home_activity,practice,scaffolding,review_days,success_check,source_url`.
- `confidence_percentages` maps outcome labels to percentages; `confidence_percentage` is nullable.
- Uses the cached sigmoid-calibrated Random Forest at `backend/ml/artifacts/rf_post_test_model.joblib`.
- Parent output excludes model-input household data, raw `class_probabilities`, and individual checklist marks. Predictions do not save official assessments.
- Preserve `interpretation_note` and `research_notice`; probabilities are research outputs, not clinical confidence.

Sources: [ML routes](backend/routes/ml.py), [ML contracts](backend/schemas/ml.py), [model loader](backend/ml/inference.py).

### Exact parent home-draft storage

Key:

```text
eccd_draft_${studentId}_${PRE|MID|POST}_${domainId}_home_${user.id}
```

A newly edited draft:

```json
{
  "owner_id": 123,
  "values": {
    "answers": {
      "45": "KAYA",
      "46": "DI-KAYA"
    }
  },
  "revision": "<random UUID>",
  "is_pending_sync": false
}
```

Answers are keyed by question ID strings because they are JSON object keys. `owner_id` is the account's `user.id`, not its parent profile ID.

After confirmed submit is attempted, the draft keeps its envelope/values and adds or updates:

```json
{
  "is_pending_sync": true,
  "request": {
    "path": "/api/eccd/parent/evaluate",
    "method": "post",
    "data": {
      "student_id": 456,
      "testing_period": "PRE",
      "evaluations": [
        {"question_id": 45, "testing_period": "PRE", "answer": "KAYA"}
      ]
    }
  }
}
```

Optional fields: top-level `error`; legacy `values.evaluation_date`.

Each domain has its own snapshot; the online request combines submitted domains. Clear only confirmed question values belonging to the **same revision** after HTTP **200/201**. Preserve newer edits, failed submissions, logout/access-loss drafts, and other owners' drafts. Never globally clear storage.

**Parent drafts never auto replay**, even when `is_pending_sync:true`. Automatic replay is restricted to teacher-owned ECCD drafts targeting `/api/eccd/evaluate`. Parent network failures retain work and show: `Your draft is saved on this device. Reconnect and submit again.` A non-network rejection retains the draft, records the error, and marks that snapshot nonpending.

If localStorage fails, the hook retains a RAM fallback and reports storage failure. That fallback does not survive closing/reloading the page.

Parent assessment reference data itself is **not persisted for offline reload** by `useAssessment`; durable answers do not make the full portal available offline.

Other observed parent storage keys:

```text
ames_draft_${user.id}_parent_profile_${studentId}
ames_draft_${user.id}_parent_link
ames_draft_${user.id}_message_${teacherId}_${parentId}
ames_child_${user.id}
```

The last key stores selected-child presentation state, not a work draft. Profile drafts retain a baseline for changed-field submission. All parent form/message submissions remain manual.

Sources: [parent assessment hook](frontend/src/hooks/useParentAssessment.ts), [draft envelope/replay gates](frontend/src/utils/drafts.ts), [assessment loading](frontend/src/hooks/useAssessment.ts), [profile drafts](frontend/src/hooks/useParentProfile.ts), [child selection](frontend/src/hooks/useChildren.ts).

## 4. Messaging REST and Socket.IO

Sources: [REST routes](backend/routes/messages.py), [message schemas](backend/schemas/message.py), [Socket.IO implementation](backend/utils/realtime.py), [web messaging client](frontend/src/services/messaging.ts), [chat UI](frontend/src/components/ChatInterface.tsx).

| Endpoint | Request | Response |
| --- | --- | --- |
| `GET /api/messages/contacts` | None | `{myId,contacts:[{id,name,latest_message_time}]}` |
| `GET /api/messages/history` | Required query `teacher_id`, `parent_id`, both positive | `MessageResponse[]`, ordered oldest first; no pagination |
| `POST /api/messages/send` | `{teacher_id,parent_id,body,subject?,sender_role?}` | **201**, persisted message plus `message:"Message sent!"` |
| `POST /api/messages/` | Same | Send alias |
| `GET /api/messages/unread-count` | None | `{unreadCount:number}` |
| `GET /api/messages/unread` | None | Unread alias |
| `PUT /api/messages/read` | `{teacher_id,parent_id}` | `{success:true}` |
| `PUT /api/messages/mark-read` | Same | Read alias |
| `POST /api/messages/notify-student` | `{student_id}` | **Teacher-only**, 201 `{message,recipients}` |

For parents, `myId` is the **parent profile ID**, and contact IDs are **teacher profile IDs**. `myId` can be null when no parent profile exists. `latest_message_time` is a nullable timestamp. Contacts serve as the thread list; there is no separate threads endpoint.

Sending accepts `message_body` as an alternative to `body`; trims content; requires **1–5000 characters**; subject maximum **255**. `sender_role`, if supplied, must be `"parent"` for a parent session. Optional `sent_at` is accepted but does not set server creation time.

Message JSON:

```text
message_id, parent_id, teacher_id, sender_role:"teacher"|"parent",
subject:string|null, body, message_body,
is_read, is_archived, created_at, sent_at
```

`message_body` duplicates `body`; `sent_at` mirrors the creation timestamp. The REST send response additionally includes `message:"Message sent!"`. Read marking updates unread messages sent by the opposite role for the specified conversation.

Conversations require an active parent account, active teacher account, and a currently eligible SYNCED child/adviser relationship. Unread counts exclude archived messages and ineligible relationships.

### Socket connection

```text
Configured production URL: https://api.ameskinder.com
Local URL: http://localhost:8000
Path: /socket.io/
Namespace: /
Handshake auth: {"token":"<access JWT>"}
```

The web URL uses `VITE_SOCKET_URL`, otherwise the configured API base URL, otherwise `https://api.ameskinder.com`. The web client uses `withCredentials:true`. Server authentication reads **only `auth.token`**—there is no implemented bearer-header or query-token fallback. It accepts authenticated teacher/parent sessions; refresh JWTs are not session tokens.

| Direction | Event | Payload |
| --- | --- | --- |
| Client → server | `join_room` | String `"teacher-<teacher_id>-parent-<parent_id>"` |
| Client → server | `leave_room` | Same room string |
| Client → server | `send_message` | `{room,message_id}` referencing an **already REST-persisted** message |
| Server → client | `receive_message` | Full `MessageResponse` |
| Server → client | `messages_read` | `{teacher_id,parent_id,reader_role,message_ids:number[]}` |
| Server → client | `chat_error` | `{success:false,message}` |
| Server → client | `rate_limit_error` | `{success:false,status,message,retryAfter?}` |

Room/send acknowledgements return `{success:true}` or the corresponding error object. Socket sends **do not create database messages**. Joining validates the relationship and replaces any prior conversation room for that connection. A socket `send_message` must refer to a saved message belonging to the authenticated sender and joined conversation.

The current web client sends through REST and receives automatic pushes without emitting room joins. REST message publication checks every connection's current authorization and does not require a room join. Reconnect recovery refreshes contacts, history, and unread counts; duplicate pushed messages are merged by message ID.

**Observed read-receipt limitation:** `publish_read` emits only to sessions whose account ID matches the reader. The opposite sender does not receive that push; refreshed history reveals the persisted read state.

Rate-limited socket events can emit `rate_limit_error` and disconnect. Initial handshake rejection can return HTTP 429 with `Retry-After`, or 503 when connection service is unavailable.

## 5. Branding assets and colors

On committed `main`, `frontend/public/` contains exactly:

| File | Dimensions | Content |
| --- | --- | --- |
| [favicon.svg](frontend/public/favicon.svg) | **48 × 46**, matching viewBox | Generic lightning-style favicon |
| [icons.svg](frontend/public/icons.svg) | No root dimensions/viewBox; individual SVG symbols | Generic icon sprite |

**No school seal/logo PNG, WebP, launcher icon, or manifest icon exists in `frontend/public/` on `main`.** Assets on another branch or under untracked local dependencies do not establish a committed main-branch branding asset.

The school logo comes from unauthenticated `GET /api/settings` (also `/api/settings/`) → `logo_url`; uploaded logos are stored as data URLs. Current logo pixels/dimensions cannot be established without reading configured database data, which this audit avoided.

The settings response contains:

```text
id, system_title, primary_color, logo_url, current_school_year,
previous_school_year, last_rollover_timestamp,
school_name, principal_name, chairman_name, school_year_start_month,
canRevertSchoolYear, daysRemaining, previousSchoolYear
```

Parent colors:

- MUI primary **`#4543c0`**, secondary **`#1e1e2f`**.
- MUI background **`#f4f5f7`**, text **`#333333`**, secondary text **`#777777`**.
- Sidebar **`#111827`**; dashboard background **`#f8fafc`**, text **`#0f172a`**, muted **`#64748b`**.
- Dashboard brand accents use `/api/settings.primary_color` through `--primary-color`. Frontend fallback is **`#2563eb`**; backend model default is **`#2D6A4F`**. The actual configured color was not queried.
- Parent layout uses **Poppins**, with Roboto/Helvetica/Arial/sans-serif fallbacks, through the shared theme.

Sources: [shared theme](frontend/src/components/teacher/theme.ts), [parent layout](frontend/src/layouts/ParentLayout.tsx), [settings context](frontend/src/context/SettingsContext.tsx), [settings schema](backend/schemas/settings.py), [settings routes](backend/routes/settings.py), [sidebar/header](frontend/src/layouts/MainLayout.tsx).

## 6. Verification boundaries

- No Render, Vercel, Supabase, database, browser, Playwright, or pytest calls were made.
- No application startup, migration, provisioning, dependency installation, or Android build was performed.
- Source and local configuration inspection do not establish production health, deployed configuration, or database migration state.
- Android build compatibility, deployed contracts, live branding, and real-device cookie handling remain unverified.
- A native client must account for the existing origin check, refresh-cookie handling, account/profile ID distinction, independent permission gates, and manual parent-draft submission behavior. This audit does not prove zero-backend-change native authentication on a device.
- This document is a dated snapshot of the audited commit and local environment; active source remains authoritative when implementation begins.
