# AMES: Guide to Updating the Old Data Flow Diagram

Prepared: 2026-11-09. Based on the active FastAPI backend, React/TypeScript frontend, and `AI_CONTEXT.md`.

Original reference: `old diagrams/dfd/Data Flow Diagram.drawio (With Ai integration) Corrected.png`.

This is a redraw guide for the existing system. Process numbers below retain the old diagram's numbering for processes 1–10. Processes 11–16 cover current workflows missing from that diagram. These are logical DFD processes, not new endpoints or proposed database tables.

## 1. Steps for updating the diagram

1. Make a working copy of the old diagram.
2. Keep the three main external entities: **Chairman**, **Teacher**, and **Parent**. Students are managed records, not authenticated system users.
3. Add **Email Delivery Service** for registration/login/account-verification emails. The configured service is external to AMES.
4. Rename processes 1–10 using the process map below. Add processes 11–16 if the diagram must cover the whole current system.
5. Replace the old data stores using the storage inventory. Preserve D1–D6 where possible. Correct D7 and D8 to read-only server files.
6. Draw each process's incoming and outgoing flows using the process sections below. Label arrows with the data moving through them, such as “PRE checklist answers” or “Teacher account details.”
7. Show permission checks inside the relevant processes. An authenticated parent does not automatically have access to every child, score, checklist mark, or editing operation.
8. Add browser storage on a separate detailed/offline view. Distinguish a locally saved draft from a database-confirmed record.
9. Review the final diagram using the checklist at the end of this file.

For readability, use a context diagram with a single **AMES** process first, then an overview with the processes below. Split crowded assessment, account, and ML processes into detailed diagrams. Repeat an external entity or store when needed, retaining its exact name and ID. Repeated D1 symbols all represent the same Users store.

DFD arrows describe data movement, not button clicks or screen navigation. External entities access stores through a process. Stores do not exchange data directly with other stores. The numbered steps in this guide explain behavior; the DFD itself does not need control-flow or decision diamonds.

## 2. Process map: old name to updated name

| Number | Old diagram | Updated process |
| --- | --- | --- |
| 1 | Record Account Registration | Register and Verify Parent Account |
| 2 | Login Authentication | Authenticate Users and Manage Account Security |
| 3 | Record Students Information | Manage Student Records |
| 4 | Record Students ECCD | Record ECCD Assessments and Calculate Results |
| 5 | Record Teacher Account | Provision and Manage Teacher Accounts |
| 6 | Records Parent Information | Manage Parent/Guardian Information and Child Links |
| 7 | Record Teacher Information | Manage Teacher Profiles and Parent Access Permissions |
| 8 | Message From Parents and Teacher | Exchange Teacher–Parent Messages |
| 9 | Generate ML Predictions | Generate Research POST Predictions |
| 10 | Formulate Prescriptive Guides | Select PRE-Based Learning Activities |
| 11 | Missing | Manage Sections and Adviser Assignments |
| 12 | Missing | Manage ECCD Domains and Questions |
| 13 | Only implicit dashboard/view arrows | Generate Dashboards, Reports, and Workbook Exports |
| 14 | Missing | Manage School Settings and School-Year Rollover |
| 15 | Missing | Export and Restore Encrypted Backups |
| 16 | Missing | Retrieve System Audit History |

Processes 5 and 7 may share a visual group called **Teacher Management**. Teacher provisioning creates the account and teacher profile together in one transaction; do not depict two independent submissions that must happen separately.

## 3. Where the data is stored

### 3.1 PostgreSQL records

These are logical stores in the application's PostgreSQL database. The approved deployment uses Supabase PostgreSQL, but this guide does not establish which database a running installation currently uses.

| DFD ID | Store label | Actual table(s) | Stored data |
| --- | --- | --- | --- |
| D1 | Users | `users` | Email, password hash, role, active/pending/first-login status, credential revocation version. |
| D2 | Students | `students` | Integer student ID, encrypted optional LRN, HMAC lookup, masked-LRN suffix, profile, section, school year, active/archive status. |
| D3 | ECCD Evaluation Records | `student_eccd_evaluations` | Student/question/period references, KAYA/DI-KAYA answer, evaluator references, chosen assessment date, parent submission time, and teacher save time. |
| D4 | Parents and Guardians | `parents` | Parent/guardian name, relationship, age, occupation, education, optional user-account reference. A guardian record may have no login account. |
| D5 | Messages | `messages` | Teacher/parent references, sender role, subject/body, read/archive status, creation time. |
| D6 | Teachers and Access Permissions | `teachers` | Teacher profile, user reference, employee ID, eight parent permissions, separate ECCD question-management permission. |
| D9 | Sections | `sections` | Section name, adviser compatibility pointer, PRE/MID/POST parent editing windows. |
| D10 | Section Adviser Assignments | `section_teachers` | Teacher/section relationship, Primary Adviser role, active/inactive status, assignment date. |
| D11 | Family Access Links | `family_access` | Parent/student-ID relationship, PENDING/SYNCED status, relationship type, request/link timestamps. |
| D12 | ECCD Checklist Definitions | `eccd_domains`, `eccd_questions` | Domain names, question text, domain membership, sequence, home-based flag. These are two physical tables grouped as one logical DFD store. |
| D13 | School Settings | `system_settings` | School/principal/chairman names, title, logo, primary color, school year, opening month, rollover metadata. |
| D14 | System Logs and Rollover Snapshots | `system_logs` | Recorded actions, actor reference, details/timestamps, exact rollover batch snapshots and record IDs. |
| D15 | Verification Challenges | `email_verifications` | Account/email/purpose-bound hashed OTP challenges, expiry, attempt tracking. |
| D16 | Trusted Devices | `user_trusted_devices` | Account-bound hashed device tokens and expiry metadata. |

The old D3 label **Student_Performance_Records** should become **ECCD Evaluation Records**. Scores, progress summaries, and interpretations are computed from saved answers and dates; they are not a separate permanent score table.

For a technical security subdiagram, PostgreSQL also holds production request-limit counters in `api_rate_limits`. This operational store can be omitted from the business DFD.

### 3.2 Server files and downloaded files

| ID | Label | Actual location | How to draw it |
| --- | --- | --- | --- |
| D7 | Trained Random Forest Model — Server File | `backend/ml/artifacts/rf_post_test_model.joblib` | Read-only input to process 9. Replace the old **ML_Predictions** store. |
| D8 | Learning Activity Reference — Server File | `backend/ml/artifacts/prescriptive_guides.json` | Read-only input to process 10. Replace the old writable **Prescriptive_Guides** store. |
| F1 | Workbook Templates | `backend/assets/templates/` | Read-only input to process 13 for checklist and summary generation. |
| F2 | Downloaded Encrypted Backup | Chairman's chosen download location; `.enc` file | Output of process 15 and a manually supplied input during restore. No permanent server backup repository is implied. |

Optional research-plot detail: the six approved PNGs under `backend/ml/artifacts/plots/` are existing read-only assets served to authorized staff. Viewing them does not train a model or generate new plots.

**There is no current database table for prediction history, individual intervention plans, or generated report files.** Predictions and selected activities are returned in responses and displayed in the portal. Workbooks and backups are generated for download.

### 3.3 Browser storage

| ID | Store | What is stored |
| --- | --- | --- |
| B1 | Device Drafts — `localStorage` | Owner-scoped form values, revisions, pending/error state, teacher/parent ECCD drafts, sandbox input drafts. |
| B2 | Selected Files — IndexedDB | Selected file and revision metadata in database `ames-form-files`, object store `files`. |
| B3 | Credential Form Drafts — `sessionStorage` | Tab-scoped credential form inputs used by `sessionDrafts.ts`. |
| B4 | Browser Session State — `localStorage` and device cookies | Current frontend token/user state and remembered-device token; backend stores its hashed device record in D16. |

Credential form drafts in B3 and the authenticated token/user in B4 are different data. Browser storage is not the central database or evidence that a save succeeded.

## 4. Updated processes, steps, and arrows

### Process 1 — Register and Verify Parent Account

**Actors:** Parent; Email Delivery Service.

1. Receive the parent's name, email, password, and relationship.
2. Validate the input and duplicate-account rules; hash the password.
3. Create the user and linked parent profile. With verification enabled, keep the account pending until verification succeeds.
4. Issue an expiring registration challenge and send the OTP through the email service.
5. Verify the submitted challenge/OTP, activate the account, and return the authenticated session. Process 2 handles the shared security behavior.

**Storage:** Writes D1 and D4; creates/consumes D15 challenges; may establish D16/B4 remembered-device state. Credential input drafts use B3 where implemented. Registration does not create a student or automatically link an existing child.

**Arrows:**

- Parent → P1: **Registration details / verification code**.
- P1 → D1: **New account and activation state**.
- P1 → D4: **Parent profile and user reference**.
- P1 → Email Delivery Service: **Verification email request**.
- Email Delivery Service → Parent: **Registration OTP email**.
- P1 → Parent: **Verification requirement / registration result / session**.

**Source:** [auth routes](backend/routes/auth.py), [authentication utilities](backend/utils/authentication.py).

### Process 2 — Authenticate Users and Manage Account Security

**Actors:** Chairman, Teacher, Parent; Email Delivery Service.

1. Receive email/password and check the stored password hash, role, and active-account state.
2. Check a remembered device or issue/verify an OTP challenge when required.
3. Return a JWT and the permitted user/session information.
4. Handle first-login teacher password replacement, verified account changes, and remembered-device logout/revocation as applicable.
5. Protected processes validate the live session and their own access rules on subsequent requests.

**Storage:** Reads/updates D1; reads/creates/consumes D15; reads/writes/deletes D16 as required. Reads D4/D6 for role profile/session data. B4 holds frontend session state; B3 holds credential form drafts where used. Tokens are issued, not stored in a new database “Sessions” table.

**Arrows:** Users → P2: **Credentials / OTP / account-change details**; stores → P2: **Account, challenge, and trusted-device records**; P2 → users: **Session / verification requirement / validation result**. Draw email-service request and OTP-email arrows as in P1.

**Change from old diagram:** Replace “Access Granted” coming from D1 with **Account credentials and status**. The process decides access. Dashboard records come from P13, not from the authentication process.

**Source:** [auth routes](backend/routes/auth.py), [account changes](backend/utils/account_changes.py), [AuthContext](frontend/src/context/AuthContext.tsx).

### Process 3 — Manage Student Records

**Actors:** Teacher and Chairman; Parent for authorized linked-child edits/views.

1. Receive enrollment/profile changes and confirm staff section ownership or parent child-link/edit permissions.
2. Assign/use the integer `student_id`; validate an optional supplied LRN as exactly 12 ASCII digits.
3. Store an LRN encrypted, with HMAC lookup and masked suffix. Default new enrollment to the configured school year.
4. Save student fields; save supplied guardian details through the parent/guardian flow in P6.
5. Support authorized archive/restore and Chairman student transfers. A transfer changes section membership while preserving evaluations and family links.
6. Return the appropriate profile or save result. Ordinary public responses mask LRNs; authorized staff detail/edit and workbook exports have specific decryption exceptions.

**Storage:** Reads/writes D2; guardian edits can write D4/D11; reads D1, D6, D9, D10, D11, D13 for authorization/context; recorded actions write D14. D3 is preserved during transfers. Unsaved forms use B1.

**Arrows:** Actors → P3: **Enrollment details / permitted profile changes / transfer selection**; D2 → P3: **Student records**; P3 → D2: **Validated profile and section/status changes**; P3 → actors: **Student profile / operation result**. Label P3 ↔ P6 **Guardian details / family relationships** where those logical responsibilities are separated.

**Source:** [student routes](backend/routes/students.py), [Chairman transfer route](backend/routes/chairman.py), [student utilities](backend/utils/students.py), [protected LRN utilities](backend/utils/lrn.py).

### Process 4 — Record ECCD Assessments and Calculate Results

**Actors:** Teacher/authorized staff; Parent for allowed home observations and permitted results.

1. Retrieve the student, domain/question definitions, and existing PRE/MID/POST answers.
2. Accept teacher marks with a chosen assessment date, or parent answers restricted to home-based questions in an open section period and an enabled adviser editing permission.
3. Validate the entire submission, including date order, existing observations, and applicable completed-PRE mastery restrictions.
4. Save one evaluation per student/question/period. Preserve parent provenance when a teacher confirms or explicitly corrects a saved home answer.
5. Keep the chosen official assessment date distinct from the parent's submission timestamp and actual teacher save timestamp. Equal-answer teacher confirmation preserves the existing evaluator role and teacher-edit timestamp.
6. Calculate deterministic ECCD scores/progress from saved records. Apply independent parent score-release, checklist-marks, and editing permissions before returning results.

**Storage:** Reads/writes D3; reads D2, D12 and access stores D1/D4/D6/D9/D10/D11; writes recorded save events to D14. B1 retains pending answers until matching server confirmation.

**Arrows:** Teacher → P4: **Checklist answers, period, assessment date, explicit correction IDs**; Parent → P4: **Home observations and period**; D12 → P4: **Checklist definitions**; D3 → P4: **Saved answers and provenance**; P4 → D3: **Validated evaluations**; P4 → users: **Save result / permitted checklist and computed results**.

**Parent rules to annotate:** Unreleased score metrics/dates/progress remain masked with “Pending Adviser Release.” Marks visibility does not release scores or enable editing. A locked latest period cannot display older released scores as a substitute. Identical home-answer retries preserve original authorship/time; changed parent answers conflict.

**Source:** [ECCD routes](backend/routes/eccd.py), [assessment saves and projections](backend/utils/assessments.py), [deterministic scorer](backend/utils/eccd_scorer.py), [assessment-date helpers](backend/utils/eccd_dates.py).

### Process 5 — Provision and Manage Teacher Accounts

**Actor:** Chairman.

1. Receive teacher name, unique email, initial password, optional employee ID, and optional section selection.
2. Validate the request and create the user account and linked teacher profile together.
3. Hash the password and mark the teacher for first-login password replacement.
4. If selected, assign the section through P11. Maintain account archive/restore and credential revocation rules.
5. Return the account-creation or account-management result.

**Storage:** Creates/updates D1 and D6; section assignment involves D9/D10 and the handover rules in P11; revocation may invalidate D15/D16 records; recorded account/assignment actions write D14. Inputs remain in scoped browser drafts until confirmed.

**Arrows:** Chairman → P5: **Teacher provisioning / account-state request**; P5 → D1: **Teacher credentials and account status**; P5 → D6: **Linked teacher profile**; P5 → P11: **Requested section assignment**; P5 → Chairman: **Provisioning / account-state result**.

**Source:** [teacher provisioning utility](backend/utils/teachers.py), [teacher routes](backend/routes/teachers.py), [Chairman routes](backend/routes/chairman.py).

### Process 6 — Manage Parent/Guardian Information and Child Links

**Actors:** Parent; Teacher for link review; authorized staff/Parent for permitted guardian details through student forms.

1. Retrieve or update parent/guardian information through the existing registration and authorized student-profile workflows. Do not invent a separate standalone parent-profile save endpoint.
2. Receive a parent's child-link request using the child's LRN and relationship.
3. Resolve the protected student identity and inspect existing account links/history.
4. The first eligible account link without prior account-link history can become SYNCED; a later re-link requiring review becomes PENDING. A conflicting account link is rejected.
5. The assigned teacher can approve/reject a pending request or unlink a synced account. Unlink/reject removes the selected family-access row while preserving evaluations, guardian records, and audit history.
6. Return eligible children and the link state. Parent access requires a SYNCED link, active child, and eligible active adviser.

**Storage:** Reads/writes D4/D11 as the specific operation requires; reads D1/D2/D6/D9/D10 and D14 link history; writes link audit events to D14. Registration creates D4 via P1; guardian-only D4 rows do not themselves grant account access.

**Arrows:** Parent → P6: **Child-link LRN and relationship**; Teacher → P6: **Approve / reject / unlink selection**; D11 → P6: **Existing family access**; P6 → D11: **Link status / selected-link removal**; P6 → Parent/Teacher: **Link result / eligible-child information**.

**Source:** [link routes](backend/routes/students.py), [teacher link actions](backend/routes/teachers.py), [link-history utilities](backend/utils/parent_links.py), [parent/guardian model](backend/models/parent.py).

### Process 7 — Manage Teacher Profiles and Parent Access Permissions

**Actors:** Chairman for teacher profile and staff permission management; Teacher for their parent-access settings.

1. Retrieve/update authorized teacher profile fields.
2. Allow a teacher to configure the eight granular parent permissions below.
3. Allow the Chairman to grant/revoke the separate ECCD question-management permission.
4. Use P11 for section assignment/handover rather than treating a cached class label as ownership.
5. Return the saved profile or permission settings. Other processes read these settings when authorizing parent access.

**Storage:** D6 stores profile/permission values. D1 is updated if a supported account-email change is included; credential revocation follows the account flow. Section editing windows live in D9, not D6. Writes D14 only for operations that actually record an audit event.

| Parent permission in D6 | Controls |
| --- | --- |
| `allow_parent_view_student_info` | Student profile visibility. |
| `allow_parent_view_eccd_pre` | PRE score release. |
| `allow_parent_view_eccd_mid` | MID score release. |
| `allow_parent_view_eccd_post` | POST score release. |
| `allow_parent_view_eccd_marks` | Recorded answers/evaluator visibility independently of scores. |
| `allow_parent_predictions` | Parent research-prediction access, additionally requiring PRE release/readiness. |
| `allow_parent_edit_student_info` | Linked-child profile editing. |
| `allow_parent_edit_home_based_eccd` | Home-observation submission, additionally requiring an open section period. |

**Arrows:** Chairman/Teacher → P7: **Authorized profile / permission changes**; D6 → P7: **Current profile and permissions**; P7 → D6: **Validated changes**; P7 → actor: **Saved access settings**. Draw D6 → P3/P4/P9/P13 as **Adviser access permissions**, not a single “Parent access” boolean.

**Source:** [teacher settings routes](backend/routes/teachers.py), [Chairman permission route](backend/routes/chairman.py), [adviser access utilities](backend/utils/access.py).

### Process 8 — Exchange Teacher–Parent Messages

**Actors:** Teacher and Parent.

1. Retrieve authorized contacts/conversations using live account, active-child, family-link, and adviser relationships.
2. Receive a message and validate conversation access.
3. Persist the message through HTTP, then push the committed message to authorized connected sessions through Socket.IO.
4. Retrieve history/unread counts and persist read receipts. HTTP recovery handles missed live updates.
5. Retain failed-send drafts for explicit manual retry.

**Storage:** Reads/writes D5; reads D1/D2/D4/D6/D10/D11 to authorize relationships. B1 holds message drafts. Socket.IO is a delivery channel, not a permanent message store.

**Arrows:** Teacher/Parent → P8: **Message / conversation request / read acknowledgement**; P8 → D5: **Committed message / read state**; D5 → P8: **Conversation history / unread records**; P8 → recipient: **Message / conversation / read receipt**.

**Source:** [message routes](backend/routes/messages.py), [conversation authorization](backend/utils/messaging.py), [live delivery](backend/utils/realtime.py), [MessagingContext](frontend/src/context/MessagingContext.tsx).

### Process 9 — Generate Research POST Predictions

**Actors:** Teacher; Parent with prediction permission, released PRE results, and eligible child access.

1. Receive a selected student and authorize ownership/child access. A separate teacher sandbox accepts hypothetical inputs without saving a student assessment.
2. Read complete PRE answers for official domains 1–7, a teacher-confirmed official PRE date, and a valid birth date. Custom domains do not enter readiness or features.
3. Calculate PRE scores and construct the existing 18-field API input. Five household fields are excluded before estimator preprocessing and do not affect the estimator.
4. Read the cached, fitted, sigmoid-calibrated standalone Random Forest from D7. Generate a research POST category and class probabilities in memory.
5. Supply PRE scores and explicitly observed skill gaps to P10 independently of the predicted category. The implementation includes P10's activities in the prediction response.
6. Return the result and research notice. The parent response excludes family model inputs, individual marks/item numbers, and teacher-only guide fields.

**Storage:** Reads D2/D3/D12 and D4/D11 for the existing feature-assembly contract; reads access stores D1/D6/D9/D10/D11; reads D7 server file. **No prediction-table write, assessment write, training, or refitting occurs.** Sandbox input drafts can remain in B1; returned predictions are transient portal state.

**Arrows:** Teacher/Parent → P9: **Authorized student prediction request**; D2 → P9: **Student demographics and birth date**; D3 → P9: **Official-domain PRE answers and teacher-confirmed date**; D12 → P9: **Official question mapping**; D7 → P9: **Fitted model**; P9 → actor: **Research POST category, probabilities, and permitted insights**; P9 → P10: **PRE domain scores and observed gaps**.

**Change from old diagram:** Remove **P9 → D7: Store Predicted Post-test**. D7 supplies a fitted model; it does not receive student predictions. Label the result as a predicted developmental category, not a saved official POST score.

**Source:** [ML routes](backend/routes/ml.py), [cached inference](backend/ml/inference.py), [feature contract](backend/ml/common.py), [parent response schema](backend/schemas/ml.py).

### Process 10 — Select PRE-Based Learning Activities

**Actors receiving results:** Teacher; eligible Parent through the authorized prediction response.

1. Receive the PRE domain scaled scores and explicit DI-KAYA skill gaps assembled for P9.
2. Read the authored activity reference in D8.
3. Select activities when a domain scaled score is at most 6 or explicit DI-KAYA items exist. Local planning tiers guide support intensity; they are not official diagnoses.
4. Return classroom/home suggestions, practice/review guidance, and source information appropriate to the requesting role.

**Storage:** Reads D8; computes suggestions in memory. **No new guide record or student intervention-plan record is saved.**

**Arrows:** P9 → P10: **PRE scores and observed gaps**; D8 → P10: **Activity rules and reference suggestions**; P10 → Teacher: **Classroom/home planning suggestions**; P10 → authorized Parent: **Home activities and permitted guidance**. Annotate that P9 and P10 return one combined API response.

**Change from old diagram:** Remove **D7 → P10: Retrieve Prediction** and **P10 → D8: Store Intervention Plans**. Activity selection uses PRE evidence independently of the predicted POST category; D8 is a read-only reference.

**Source:** [activity selection](backend/ml/prescriptions.py), [inference composition](backend/ml/inference.py), [activity reference](backend/ml/artifacts/prescriptive_guides.json).

### Process 11 — Manage Sections and Adviser Assignments

**Actors:** Chairman; Teacher for their section's parent editing windows.

1. Create/rename/manage sections under current route validation.
2. Assign/unassign the Primary Adviser. Maintain at most one active adviser per section and one active section per teacher.
3. On moves/handovers, retire old assignments, synchronize section pointers, and deactivate a displaced adviser with no remaining active assignment. Restoring an account requires explicit reassignment.
4. Preserve student records, evaluations, family links, and section editing windows.
5. Let the assigned teacher set PRE/MID/POST parent editing windows. Defaults are PRE open, MID/POST closed; the independent adviser permission must also permit submission.

**Storage:** Reads/writes D9/D10; updates related D1/D6 account/class state during handover; revocation can affect D15/D16; recorded assignments/window changes write D14. Student transfers themselves belong to P3.

**Arrows:** Chairman → P11: **Section details / adviser selection**; Teacher → P11: **Period editing-window settings**; P11 → D9/D10: **Section configuration / adviser assignments**; P11 → D1/D6: **Affected teacher account/profile state**; P11 → actors: **Section and assignment result**.

**Source:** [section routes](backend/routes/sections.py), [assignment logic](backend/utils/teachers.py), [teacher editing-window routes](backend/routes/teachers.py).

### Process 12 — Manage ECCD Domains and Questions

**Actors:** Chairman; Teacher with `allow_eccd_question_management`.

1. Retrieve domain/question definitions.
2. Receive domain/question creation, supported edits, home-based toggles, or deletion requests under current access checks.
3. On creation or a cross-domain move, append after the destination domain's maximum sequence. Text/home edits preserve position and gaps.
4. Save definitions and return the result. Stable question IDs connect checklist definitions to existing evaluations; actual deletions can cascade to dependent records and must not be depicted as harmless text edits.

**Storage:** Reads/writes D12; reads D1/D6 for staff access. D3 references these question definitions; deletion can affect D3 through configured relationships. This guide does not authorize schema migrations or question deletion.

**Arrows:** Authorized staff → P12: **Domain/question changes**; D12 → P12: **Current checklist definitions**; P12 → D12: **Validated definitions and sequence**; P12 → staff: **Updated checklist / operation result**.

**Source:** [configuration routes](backend/routes/eccd_config.py), [question/evaluation model](backend/models/eccd.py).

### Process 13 — Generate Dashboards, Reports, and Workbook Exports

**Actors:** Chairman and Teacher; Parent for permission-filtered portal summaries.

1. Receive section/year/period filters or a report/download request and authorize its scope.
2. Read profiles, checklist answers, dates, definitions, and other records needed for the requested dashboard/report.
3. Calculate deterministic totals, progress, and permitted summaries. Parent views enforce independent release/marks permissions.
4. For authorized staff exports, read F1 templates and populate checklist/summary workbooks; decrypt LRNs in memory where allowed.
5. Return dashboard data, preview, `.xlsx`, or ZIP. Individual exports use one CHECKLIST sheet with appended panels; summaries retain ten base sheets plus continuations and split cohorts above 30 children across workbooks.

**Storage:** Reads D1–D6 and D9–D13 as needed for the specific report; reads F1 for workbook generation. **Computed report results and generated downloads are not new database records.** Saved evaluations remain in D3.

**Arrows:** Actors → P13: **Authorized dashboard/report filters**; stores → P13: **Scoped source records**; F1 → P13: **Blank workbook layouts**; P13 → actors: **Dashboard / permitted summary / preview / workbook / ZIP**.

Workbook import is a detailed subflow of P3/P4: Teacher → import validation: **Selected .xlsx**; validation → D2/D4/D11/D3: **Accepted student, guardian, and evaluation records**; validation → Teacher: **Success/failure counts and row errors**. B2 retains the selected upload for manual retry. Validation/commit is per student, so a partial import can preserve accepted students while reporting failed ones.

**Source:** [analytics routes](backend/routes/analytics.py), [ECCD exports](backend/routes/eccd.py), [workbook import/export](backend/utils/excel.py), [checklist generation](backend/utils/checklist_workbook.py).

### Process 14 — Manage School Settings and School-Year Rollover

**Actor:** Chairman; public/authorized users receive the supported settings projection.

1. Retrieve/update supported school identity, logo, primary color, school year, and opening month.
2. On an explicit rollover, identify the active student/unarchived-message batch and store its exact snapshot/IDs.
3. Archive that batch, update the school year, and retain evaluations and family links.
4. On an allowed undo within 30 days, restore only that rollover batch and the previous year/opening month.

**Storage:** Reads/writes D13; rollover/undo updates D2/D5 status and writes/reads D14 snapshots. No separate “Archived Students” table exists. Public settings retrieval may create singleton defaults when absent. Retired secondary-color/profile-picture/login-background settings are not active configuration stores.

**Arrows:** Chairman → P14: **Settings changes / confirmed rollover / undo request**; D13 → P14: **Current school settings**; P14 → D13: **Updated settings/year metadata**; P14 → D14: **Rollover snapshot and recorded actions**; P14 → D2/D5: **Selected archive/restore state**; P14 → Chairman: **Operation result**.

**Source:** [settings routes](backend/routes/settings.py), [rollover utility](backend/utils/rollover.py), [settings model](backend/models/settings.py).

### Process 15 — Export and Restore Encrypted Backups

**Actor:** Chairman.

1. Read/validate the typed school-data backup document and encrypt it with the configured Fernet key.
2. Return an `.enc` download to the Chairman (F2).
3. On explicit restore, receive the selected file, decrypt it, and validate schema and relationships before committing replacement school data.
4. Preserve live user accounts/credentials; clear verification/trusted-device records. Restore other supported school tables atomically and record the result.

**Storage:** Export reads supported ORM tables and records export in D14. Restore replaces supported school data in D2–D6 and D9–D14, preserves D1, and clears D15/D16. D7/D8 model/guide files and browser drafts are not school-table backup contents. B2 may retain a selected upload; F2 is stored wherever the user saves the download.

**Arrows:** Chairman → P15: **Backup request / encrypted restore file**; database stores → P15: **Backup source records**; P15 → Chairman/F2: **Encrypted backup download**; P15 → school-data stores: **Validated restored records**; P15 → Chairman: **Restore result**.

**Source:** [backup routes](backend/routes/backup.py), [backup transactions](backend/utils/backups.py), [backup schemas](backend/schemas/backup.py).

### Process 16 — Retrieve System Audit History

**Actor:** Chairman.

1. Receive the authorized audit-history request.
2. Read recorded actions and resolve display information for the actor.
3. Return readable audit history. Internal rollover snapshot/chunk entries are excluded from the ordinary audit list.

**Storage:** Reads D14 and actor-display data from D1/D4/D6/D13. Other processes append audit entries when implemented; do not imply every endpoint records an event. P16 reads existing logs rather than duplicating every write into a second audit table.

**Arrows:** Relevant processes → D14: **Recorded action details**; Chairman → P16: **Audit-history request**; D14 → P16: **Recorded events**; P16 → Chairman: **Readable audit history**.

**Source:** [audit-history route](backend/routes/analytics.py), [audit helper](backend/utils/audit.py).

## 5. Offline detail: what happens before a database save

Use this on a detailed diagram so the main DFD stays readable:

1. A portal form writes owner-scoped values/revisions to B1; selected files use B2. Credential input drafts use B3 where implemented.
2. An explicit online submission passes the draft/file to its normal API process, which checks authorization and validates before committing.
3. Only confirmation for the matching HTTP 200/201 save and revision allows the applicable draft to be removed. A newer edit must survive an older response. Sandbox inputs are deliberately retained even after successful prediction.
4. The sole automatic write-replay exception is an authenticated teacher's own eligible ECCD draft to `POST /api/eccd/evaluate`, with matching owner, student, period, and revision.
5. Parent observations, messages, profile/settings/link changes, predictions, backups, and file uploads require manual online submission/retry. Logout or lost access does not erase work drafts.

Relevant keys:

```text
Teacher ECCD: eccd_draft_{studentId}_{testingPeriod}_{domainId}_{ownerId}
Parent ECCD:  eccd_draft_{studentId}_{testingPeriod}_{domainId}_home_{ownerId}
Other forms:  ames_draft_{ownerId}_{resource}
```

Draw **Portal form → B1: Draft values and revision**, **B1 → Submission process: Selected draft**, and **Submission process → Portal: Confirmed save / error**. The frontend manages revision-safe draft cleanup after confirmation. Never draw a direct B1 → PostgreSQL arrow or general automatic synchronization for every form.

**Source:** [durable drafts](frontend/src/utils/drafts.ts), [file drafts](frontend/src/utils/fileDrafts.ts), [credential drafts](frontend/src/utils/sessionDrafts.ts), [offline boundary](TEACHER_ECCD_OFFLINE_SCOPE_PLAN.md).

## 6. Final redraw checklist

- [ ] Chairman, Teacher, and Parent are distinct actors; an external email service appears in account verification detail.
- [ ] Processes 1–10 are updated; missing whole-system workflows are shown through processes 11–16 or their documented detailed diagrams.
- [ ] Store IDs are consistent everywhere; D7/D8 are explicitly read-only server files.
- [ ] The old prediction-save and intervention-plan-save arrows are removed.
- [ ] P9 reads the trained model; P10 reads activity references and PRE evidence independently of the predicted category.
- [ ] Saved answers/provenance in D3 are distinguished from calculated scores, dashboards, predictions, and downloads.
- [ ] D9/D10 section ownership, D11 family links, and D6 granular permissions are present in relevant access flows.
- [ ] Student references use integer IDs; protected LRNs are not drawn as plaintext database identifiers.
- [ ] Parent score release, marks visibility, and editing are independent checks.
- [ ] Transient results, browser drafts, server reference files, PostgreSQL records, and user downloads have distinct labels.
- [ ] Arrows identify data and pass through a process; dashboard results do not originate from login authentication.
- [ ] Detailed diagrams preserve the inputs/outputs of their parent process.

## 7. Evidence and limits

This guide comes from inspection of the active source linked above, current models/schemas, selected regression-test definitions, and the original diagram. The saved Graphify graph dated 2026-11-03 was used to locate relationships; current files were checked before documenting behavior. The Graphify CLI and NetworkX were unavailable in the project environment, so graph traversal used the Python standard library without installing dependencies.

Related regression sources include [parent linking](backend/tests/test_parent_linking.py), [home-answer locking and teacher confirmation](backend/tests/test_home_assessment_locks.py), [parent ML access](backend/tests/test_parent_ml.py), [question ordering](backend/tests/test_eccd_question_order.py), and [workbook exports](backend/tests/test_eccd_exports.py). These are source references, not newly executed test results.

Only this documentation file was added. The PNG/draw.io source and application behavior were not changed. No database connection, migration, deployment, model training, or application test run was performed for this guide.
