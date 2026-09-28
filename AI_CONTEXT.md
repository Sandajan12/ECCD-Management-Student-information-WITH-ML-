# AMES SYSTEM - AI Context & System Architecture

## 1. Project Overview & Objectives

The AMES System is a comprehensive School Management and Early Childhood Care and Development (ECCD) Assessment platform. The primary objective is to allow educators (Teachers) to manage student records, conduct and track ECCD evaluations (PRE, MID, POST periods), and maintain open, real-time communication with Parents. Parents are provided with dedicated access to view their children's profiles, monitor their progress, and message teachers directly. The system is now integrated with a machine learning pipeline to perform predictive analytics on student performance and early risk detection without altering the core DepEd-compliant scoring workflows.

## 2. Tech Stack

### Frontend (Client-Side)

* **Core:** React (v19.2), Vite (Build Tool), TypeScript (ES modules)
* **UI Framework:** Material UI (`@mui/material`), `@emotion/styled`, `@emotion/react`

* **Routing:** React Router DOM (`react-router-dom` v7)


* **State/Data Fetching:** Axios for typed REST API calls


* **Real-Time:** Socket.io-client for live messaging


* **Charting/Visuals:** Recharts (`recharts`)


* **Linting:** ESLint with React Hooks/Refresh plugins (configured for strict TypeScript)



### Backend (Server-Side)

* **Core:** Python 3.11+, FastAPI framework
* **Database Connection:** SQLAlchemy 2.0 ORM, psycopg2-binary
* **Authentication/Security:** JSON Web Tokens (`python-jose`), Bcrypt (`passlib`), CORS middleware


* **Validation:** Pydantic v2 for payload validation and serialization
* **Real-Time:** FastAPI WebSockets (matching the client-side Socket.io/WS implementation)


* **File Management:** FastAPI `UploadFile` (for file/profile uploads)


* **Email/Notifications:** `fastapi-mail` or smtplib (used for OTP and email verification)


* **Development Tooling:** `uv` (dependency management), Uvicorn, Dotenv (`python-dotenv`)



### Database

* **Engine:** PostgreSQL (v16+)
* **Architecture:** Relational database with strictly defined foreign keys, composite unique indexes, and cascading deletions.



### Machine Learning & Analytics Pipeline

* **Core Libraries:** `scikit-learn`, `numpy`, `pandas`, `joblib`
* **Architecture:** Decoupled ML inference modules residing in `backend/ml/` for evaluating developmental delay risks based on ECCD domain scores and dynamic decimal age.

## 3. System Architecture & Data Flow

The application follows a standard Client-Server architecture utilizing a RESTful API with WebSockets for real-time features.

1. **Frontend to Backend (REST):** The React client uses Axios to hit FastAPI endpoints located in the backend's `routes/` directory for standard CRUD operations (e.g., updating student records, submitting ECCD evaluations).


2. **Real-Time Communication (WebSockets):** WebSocket endpoints establish persistent connections between the frontend and backend to facilitate instant message delivery between Parents and Teachers.


3. **Authentication Flow:** Users authenticate via email/username and password (hashed with bcrypt). The server issues a JWT, which the client stores and sends via headers for protected routes. Roles (`super-admin`, `admin`, `user`) dictate authorization levels.


4. **File Handling:** Uploads (like profile pictures or documents) are processed by FastAPI endpoints and saved locally in the `uploads/` directory.


5. **Machine Learning Flow:** Assessment data is extracted, formatted into feature arrays, and evaluated by pre-trained models. Inference results are returned via non-blocking API endpoints and do not overwrite standard DepEd records.

## 4. Database Schema & Core Entities

*(Business logic sourced directly from the legacy architecture, adapted for SQLAlchemy)*

* **`users`**: The central authentication table. Stores `username`, `password_hash`, `email`, and `role` (`super-admin`, `admin`, `user`).


* **`teachers`**: The educator entity, tied to `users` via `user_id`. Manages `employee_id`, `class_name`, and toggles for parent interaction permissions (`allow_parent_view`, `allow_parent_edit`, and `allow_parent_home_based_edit`).


* **`parents`**: The guardian entity, tied to `users` via `user_id`. Stores personal demographic information (occupation, educational attainment). It also legacy-stores `relationship_type` directly, though this is primarily handled by the junction table.


* **`students`**: The core subject entity. Uniquely identified by `lrn_number` (Primary Key). Contains exhaustive demographic data (name, DOB, gender, address, handedness, siblings), and `school_year` tracking (automatically assigned strictly server-side upon creation by querying the active `current_school_year` from the global `system_settings` table). Supports both individual and mass archiving workflows (toggling `is_active` flag).


* **`family_access`**: A junction table that links `parents` to `students` (via `student_lrn`) establishing the `relationship_type` (Mother, Father, Guardian). This allows multiple guardians to access a single student's records. Note: The backend may occasionally query the redundant `relationship_type` column on the `parents` table.


* **`eccd_domains` & `eccd_questions**`: Look-up tables establishing the 7 domains of development and the specific assessment questions linked to those domains, ordered by `sequence_order`. Includes an `is_home_based` boolean flag to designate questions suitable for parent evaluations.


* **`student_eccd_evaluations`**: The transactional table for assessment results. Links `student_lrn`, `teacher_id`, and `question_id`. It records the `testing_period` (PRE, MID, POST), the boolean `answer` (KAYA, DI-KAYA), and the `evaluation_date`. Features a unique composite key (`student_lrn`, `question_id`, `testing_period`) to prevent duplicate entries per period.


* **`messages`**: Facilitates the inbox system. Links `parent_id` and `teacher_id`, tracking the `sender_role`, `subject`, message body, and read receipts (`is_read`). Message threads are strictly filtered by `messages.is_archived = 0` to prevent displaying old conversations after a system rollover.


* **`system_logs`**: An audit trail tracking user actions (`action_type`, `details`, `timestamp`) mapped to a `user_id`.


* **`email_verifications`**: Stores temporary OTPs and expiration times for the email validation process.


* **`system_settings`**: Global configuration table storing both dynamic UI branding (`system_title`, `primary_color`, `secondary_color`, `logo_url`, `profile_pic_url`) and school year rollover metadata (`current_school_year`, `previous_school_year`, `last_rollover_timestamp`).

* **`section_teachers`**: Normalized junction table linking `sections` to `teachers`.
  - Columns: `id`, `section_id`, `teacher_id`, `role` (`Primary Adviser` | `Substitute`), `status` (`Active` | `Inactive`), `assigned_date`.
  - Relational mapping allows multi-tenancy per section over academic cycles without overwriting historic data.
  - Legacy roles like `'OJT'` are strictly deprecated in favor of `'Primary Adviser'` and `'Substitute'`.

* **`teachers.allow_eccd_question_management`**: Boolean column (`default = False`) on `teachers` representing granular RBAC permissions toggled exclusively by the Chairman (`super-admin`), delegating permission to manage ECCD domains and checklist questions to specific teachers (`admin`).


### Normalized Section-Teacher & Substitution Architecture

To facilitate mid-year teacher resignations, leaves of absence, and dynamic class restructuring without loss of assessment history:

1. **Substitution & Swap Logic (`POST /api/chairman/sections/{section_id}/assign-teacher`):**
   - When the Chairman assigns a new `Primary Adviser`, the system automatically marks existing active adviser records in `section_teachers` for that section as `'Inactive'`.
   - If assigning a `Substitute`, the substitute teacher receives active access to the section roster, messaging inbox, and analytics while preserving the prior adviser's record.
   - All student rosters and assessment records remain 100% intact within `students` and `student_eccd_evaluations`.

2. **Bulk "Transfer Students" Tool (`PUT /api/chairman/students/transfer`):**
   - Allows the Chairman to dissolve a section or rebalance classrooms by selecting multiple students and reassigning them to a target `new_section_id`.
   - **Evaluation Preservation Guarantee:** Since all ECCD assessment answers in `student_eccd_evaluations` are linked by `student_lrn`, updating `students.section_id` preserves 100% of historical PRE, MID, and POST evaluation entries, timestamps, and DepEd scaled/standard scores.
   - Automatically writes an audit entry to `system_logs`.

3. **Granular Teacher RBAC for ECCD Question Management:**
   - **Backend Guard (`verify_eccd_question_access`):** Guards all ECCD checklist modifications (`POST`, `PUT`, `DELETE` routes on `/api/eccd/questions*` and `/api/eccd/domains*`). Allows `super-admin`/`chairman` unconditionally, and allows `admin`/`teacher` only when `allow_eccd_question_management == True`.
   - **Chairman Delegation Tool:** In the Chairman's Teacher Management UI (`TeacherManagement.tsx`), clicking "Manage Access" exposes a switch for "Enable ECCD Question Management", sending `PUT /api/chairman/teachers/{teacher_id}/permissions`.
   - **Teacher UI Adaptation:** `MainLayout.tsx` conditionally reveals "ECCD Questions" in the sidebar, and `ProtectedRoute.tsx` guards `/teacher/eccd-questions` via `requiredPermission="allow_eccd_question_management"`, redirecting unauthorized users to `/teacher/dashboard`.

4. **Parent Dashboard Analytics & Grade 1 Readiness Logic (`GET /api/eccd/parent/dashboard-stats/{student_lrn}`):**
   - **Testing Period Isolation:** Detects the student's latest evaluated testing period in strict priority order (`POST` > `MID` > `PRE`). Computes stats exclusively within that latest phase, never aggregating answer counts across multiple periods.
   - **Excels In / Needs Support In:** Identifies the domain with highest KAYA count and lowest KAYA / highest DI-KAYA count with deterministic alphabetical tie-breaking (`domain_name ASC`).
   - **Assessment Mastery Milestone:** If `latestPhase == 'POST'`, `totalDiKaya == 0`, and evaluations exist, `assessmentMastered: True` is emitted. (Mastery is strictly an end-of-year milestone; zero DI-KAYA in PRE/MID does not trigger mastery).
   - **Dynamic Frontend Card:** On `Dashboard.tsx`, Card 2 dynamically renders "Assessment Complete / All Skills Mastered / Ready for Grade 1" with checkmark icon on soft green (`#f0fdf4`, border `#bbf7d0`) when mastered, or "Needs Support In / {domain} / Priority for improvement" on soft orange (`#ffedd5`) when further practice is needed.



## 5. Development Rules & Conventions

* **Component Design:** Utilize Material UI for all new components to maintain design consistency. Ensure accessibility standards are met (high contrast, legible text) as the end-users include older educators and parents.


* **State Management:** Keep local state within React components using hooks (`useState`, `useEffect`). For complex forms (like the 119-item ECCD Checklist), manage state efficiently to prevent excessive re-renders when toggling "KAYA/DI-KAYA" buttons.


* **API Integration:** All backend routes must be consumed via Axios with strictly defined TypeScript generic interfaces. Ensure appropriate error handling (try/catch blocks) and UI feedback (loading spinners, error snackbars) for all network requests.


* **Real-Time Consistency:** Any updates to the messaging UI should instantly reflect WebSocket events without requiring a hard page refresh.


* **Security:** Never expose JWT tokens or password hashes in the frontend. Ensure all sensitive backend routes utilize authentication dependencies to verify JWT validity and user roles.


* **Strong Password Policy:** All user passwords (e.g., Chairman, Teacher) must be validated strictly on both the frontend (using dynamic visual checklists via `PasswordValidator`) and the backend via Pydantic validators (returning a `400 Bad Request` error upon failure). Passwords must evaluate to `true` against the following criteria: minimum 8 characters (`length >= 8`), at least one uppercase letter (`/[A-Z]/`), at least one lowercase letter (`/[a-z]/`), and at least one number (`/[0-9]/`).


* **SQL Integrity:** When writing backend queries, respect the existing cascading deletes and foreign key constraints. Never bypass the `user_id` linkage between the `users` table and the respective `teachers`/`parents` tables.


* **Dynamic Age Calculation:** Never rely on a static `age` column. Always calculate the student's age dynamically on-the-fly. The decimal age is calculated by dividing the months elapsed between birthdate and the target date by 12, adding it to the elapsed years, and rounding to one decimal place (e.g., 4.8). For general profiles, calculate this relative to the current date. For ECCD records, calculate this relative to the specific assessment completion date (`evaluation_date`). Always return this as `decimal_age` from APIs.



## 6. ECCD Scoring Architecture

* **Lookup Tables:** The official ECCD scoring matrices (mapping raw scores to scaled scores based on exact decimal age brackets like 3.1-4.0, 4.1-5.0, 5.1-5.11) are extracted into `backend/eccd_scoring_data.json`.


* **Scoring Utility (`backend/utils/eccd_scorer.py`):** A dedicated Python service intercepts the raw student evaluations (`KAYA` counts per domain) and the student's dynamic decimal age at the time of evaluation. It derives the domain-specific Scaled Scores, Sum of Scaled Scores, Standard Score, and final Interpretation (e.g., "Delay", "Average Development").


* **Home-Based Assessment Flow:** The system supports Parents conducting specific at-home evaluations. Certain `eccd_questions` are flagged with `is_home_based = true`. Teachers grant access via the `allow_parent_home_based_edit` toggle in their settings. The frontend (`ParentEccdAssessment.tsx`) and backend dynamically serve and record these specific questions for Parent-users separately from the comprehensive Teacher evaluation.


* **File Export Integration:** During the generation of the ECCD Excel file by teachers, the scoring utility computes the exact historical scores per testing period (PRE, MID, POST) and injects them directly into the "Summary Table" on the `CHECKLIST` sheet (Cells `N9` to `S18`), guaranteeing parity with the official DepEd Excel formulas. The FastAPI endpoints for these exports utilize Python libraries like `openpyxl`.


* **Chairman Batch Export:** The Chairman can trigger a bulk export of ECCD records via FastAPI.


* Generates exact Excel files matching the official DepEd template, handling up to 30 students per file.


* Automatically clears existing template placeholders and injects demographic data into the `Info Sheet`.


* Injects raw `1`s for KAYA/DI-KAYA into the domain sheets (`GM`, `FM`, `SH`, `RL`, `EL`, `SE`, `C`).


* Precisely calculates domain-specific decimal ages and scores, injecting them directly into the `PR`, `M`, and `PO` sheets to override static Excel formulas and guarantee data parity.


* **Dynamic Interpretation Summary:** Automatically tallies the interpretations (e.g. "Highly Advanced", "Delay") segregated by gender (Male/Female) during the PR, M, and PO sheet generation. It dynamically appends a summary table with these consolidated totals at the bottom of each respective worksheet, preserving system scalability if rubric definitions change.


* Generates a `.zip` archive when "All Sections" is chosen.




* **Teacher Advanced ECCD Import:** Teachers can simultaneously bulk import student demographic records and full ECCD Assessment scores by parsing the multi-sheet Excel format (`openpyxl` / `pandas`).


* **Excel Parsing & Multi-Sheet Navigation:** Targets the `Info Sheet` alongside 7 distinct Domain Sheets (`GM`, `FM`, `SH`, `RL`, `EL`, `SE`, `C`). Data is relationally mapped by matching the student's name from the Info Sheet to their corresponding row in the Domain Sheets.


* **Critical Pre-Flight Validation:**
1. **Section Validation:** Scans the `Info Sheet` metadata area for the exact `section_name` assigned to the importing teacher. Aborts with a 400 error to prevent accidental wrong-section imports if a mismatch occurs.


2. **School Year Calculation:** Dynamically determines the importing school year string (e.g., "2024-2025") by parsing the `TESTING DATE PRETEST` from the first valid student row, eliminating reliance on hardcoded server flags for imported data accuracy.




* **Strict Transactions:** Enforces PostgreSQL Transactions (`BEGIN`, `COMMIT`, `ROLLBACK`) via SQLAlchemy on a per-student basis. Ensures that if an individual's demographic insert or their bulk score insert fails, no orphaned scores or partial profiles remain.


* **Data Transformations:** Extracts `KAYA` and `DI-KAYA` Boolean scores for the `PRE`, `MID`, and `POST` periods mapped securely against backend `eccd_questions` and `sequence_order` parameters while handling Date serialization automatically.


* **System Safety:** Provides a structured `{ successCount, failedCount, errors }` payload gracefully mapping SQL duplicates or formatting errors row-by-row to the frontend UI without crashing the server.




* **Score Cascading vs Date Independence:** In the frontend evaluation view (`EccdAssessment.tsx`), scoring "KAYA" on a Pre-test cascades to Mid-test and Post-test to speed up input. To support this without violating database integrity, a **Virtual Cascade (Wait-to-be-saved)** architecture is used. When reading student data, if a previous period has "KAYA", the UI automatically inherits it into the subsequent periods' state. These "ghost" answers wait in the frontend until the teacher explicitly switches to the "Mid-Test" or "Post-Test" period and clicks Save, at which point they are officially committed to the database with the user-selected independent Assessment Date.


* **Chronological Validation:** The backend API strictly validates testing periods upon submission. It rejects payloads (400 Bad Request) if a Mid-test date is on/before a Pre-test date, or a Post-test date is on/before a Mid-test date.



## 7. Machine Learning & Predictive Analytics Pipeline

* **Decoupled Architecture:** All ML training and inference logic is securely isolated in the `backend/ml/` directory, operating asynchronously alongside the standard FastAPI routes to avoid blocking the main event loop.
* **Feature Extraction:** The pipeline extracts structured feature sets from the relational database, heavily utilizing the dynamic decimal age, the 7-domain historical ECCD scores, and inter-period progression deltas ($\Delta_{\text{raw}} = \text{Score}_{\text{MID}} - \text{Score}_{\text{PRE}}$).
* **Classification Output:** The system deploys trained supervised classification models (e.g., Random Forest) to predict early developmental delay risks, returning a standard label and confidence probability percentage.
* **Workflow Integrity:** The predictive insights are surfaced contextually within the UI for Teachers, but they **never** mutate, alter, or replace the deterministic scoring logic required by the DepEd grading rubrics.

## 8. Responsive UI & Mobile Accessibility

* **Mobile-First Parent Portal:** The Parent view is heavily optimized for mobile usage (smartphones), ensuring parents have an accessible experience.


* **Responsive Navigation:** The main layout (`MainLayout.tsx`) uses MUI's `useMediaQuery` to dynamically switch from a permanent desktop drawer (width > 900px, `md` breakpoint) to a collapsible hamburger navigation menu nested within a fixed Top AppBar on mobile (`xs`, `sm` breakpoints).


* **Component Adjustments:**
* Standard container layouts (like child dashboards and forms) utilize `Grid` and `flexDirection: { xs: 'column', md: 'row' }` to ensure all cards and forms stack into a single vertical column on narrow viewports.


* Data-heavy views like `ParentEccdAssessment.tsx` wrap their `<Table>` in a `<TableContainer '100%', 'auto', 'touch' WebkitOverflowScrolling: overflowX: sx="{{" width: }}>` so that complex assessment matrices scroll horizontally rather than breaking page bounds.


* The real-time messaging interface (`ChatInterface.tsx`) dynamically toggles between the contact list and the active chat view on mobile screens using the `md` breakpoint (`activeContact` state toggles display visibility). This guarantees the text input box and send buttons remain anchored and usable when the mobile on-screen keyboard is triggered.





## 9. Data Backup & System Restore

* **Encryption Standards:** Full PostgreSQL database exports are encrypted using Python's `cryptography` module (e.g., Fernet or AES-256-CBC).

* **Data Parity & Duplication Prevention (JSON Architecture):** To ensure 100% compatibility with PostgreSQL and avoid SQL-dialect mismatches, the backup system generates an encrypted **JSON payload** using SQLAlchemy rather than a raw SQL dump. 

* **Safe Restoration:** During restoration, the system gracefully purges existing tables using SQLAlchemy's metadata dependency graph (deleting tables in reverse topological order to respect foreign keys) before cleanly inserting the decrypted JSON rows. This guarantees safe overwrites without triggering constraint violations.

* **Environment Keys:** Encryption and Decryption require valid `BACKUP_ENCRYPTION_KEY` (32 bytes hex) and `BACKUP_IV` (16 bytes hex) environment variables in the `.env` file. These must be kept entirely secure.


* **Access Control:** The Backup and Restore functions are exclusively available to the `super-admin` (Chairman) role. The backend API endpoints are strictly guarded by the FastAPI authentication dependencies (`get_current_user` and `verify_role(["super-admin"])`).


* **File Management:** The encrypted backups utilize `.enc` format and are directly streamed for downloading, and processed securely into memory upon upload utilizing FastAPI's `UploadFile`.



## 10. System Rollover & School Year Management

* **School Year Tracking:** The system globally tracks the current active school year (e.g., "2026-2027") via a `current_school_year` flag in the `system_settings` table. This value is served to the frontend via the Settings Context.


* **Automated Rollover Process:** The Chairman can advance the system to the next school year via the "School Year Management" settings panel. The backend API automatically mathematically calculates the next school year (e.g., parsing "2026-2027" to "2027-2028") to eliminate human input errors.


* **Soft-Archiving Strategy:** The system prioritizes data integrity and historical preservation. Instead of hard-deleting records during a rollover, the system uses "Soft-Archiving" flags:


1. **Students:** All active student records are marked `is_active = false`. This clears active teacher rosters and prevents old students from appearing in current academic reports, while allowing the Chairman to view historical rosters.


2. **Messages:** All current parent-teacher communications are marked `is_archived = true`. This effectively resets the chat interface for the new school year.




* **24-Hour Undo Safety Mechanism:** To prevent accidental data loss, the rollover process explicitly stores the `previous_school_year` and a `last_rollover_timestamp` in `system_settings`. The Chairman is provided with an "Undo Last Rollover" button within a strict 24-hour window, which will reverse the transaction (restoring `is_active = true` and `is_archived = false` respectively) via the `/api/chairman/undo-rollover` endpoint.

## 11. ECCD Assessment Offline-First Resilience Architecture

To ensure uninterrupted grading in rural and low-connectivity classroom environments, the AMES ECCD evaluation module implements an offline-first draft auto-caching and background synchronization protocol.

### 11.1 Scoped Local Caching Key Schema
Draft assessments are persisted in `localStorage` under isolated composite keys:
```
eccd_draft_${studentLrn}_${testingPeriod}_${domainId}
```
* **Example:** `eccd_draft_123456789012_PRE_1`
* **Zero-Assumption Isolation Rule:** Global `localStorage.clear()` is strictly forbidden across the codebase. Only the exact composite key matching a successfully confirmed assessment evaluation is ever removed upon database acknowledgment.

### 11.2 Draft Data Payload Schema
The cached draft format stored in `localStorage` adheres to the following structure:
```json
{
  "student_lrn": "123456789012",
  "testing_period": "PRE",
  "domain_id": 1,
  "evaluation_date": "2026-09-27",
  "answers": {
    "1": "KAYA",
    "2": "DI-KAYA"
  },
  "is_pending_sync": true,
  "updated_at": "2026-09-27T13:00:00.000Z"
}
```

### 11.3 Offline-to-Online Synchronization Lifecycle
1. **Real-Time Auto-Caching:** Every question toggle (KAYA / DI-KAYA) and assessment date modification is written to `localStorage` immediately, shielding teachers against accidental browser reloads or tab closures.
2. **Offline Intent-to-Save:** When the teacher submits the assessment without internet connectivity (`navigator.onLine === false`), network dispatch is suppressed. The draft is tagged with `is_pending_sync: true` and an informative non-blocking toast notifies the teacher: *"Saved locally on device. Will automatically sync once reconnected."*
3. **Reconnection Detection:** The frontend registers window listeners for the `'online'` event. Upon reconnection (or upon mounting when online), the background synchronization engine scans for all `eccd_draft_*` keys where `is_pending_sync === true`.
4. **Queue Dispatch:** Queued drafts are sent sequentially to `POST /api/eccd/evaluate`.
5. **Targeted Key Eviction:** Upon receiving HTTP 200/201 from FastAPI, the exact draft key is removed from `localStorage`. A success toast notifies the teacher: *"Connection restored. Offline assessment synced successfully."*

### 11.4 Failure-Recovery & Error Handling Rules
* **Transient Disconnections:** If an active save request encounters a network drop mid-flight (`!err.response`), the payload is captured and saved locally as `is_pending_sync: true`.
* **Preservation on Server Error:** If a payload encounters a server error during background sync, the draft is kept intact in `localStorage` with `is_pending_sync: true` for the next retry interval. User inputs are never discarded without explicit server confirmation.

## 12. Granular Parent Access & Result Release Architecture

### 12.1 Overview & Schema Separation
To replace coarse all-or-nothing parent access controls, the system implements a 6-permission granular matrix stored directly on the `teachers` table. Since each section is assigned a Primary Adviser (teacher), enrolled students inherit parent access permissions from their active section adviser.

The 6 granular boolean columns are:
- **View Permissions:**
  - `allow_parent_view_student_info` (Boolean, default: `True`): Controls parent access to view child demographics, health profiles, and family background.
  - `allow_parent_view_eccd_pre` (Boolean, default: `False`): Controls parent visibility of Pre-Test ECCD assessment scaled scores, standard scores, and interpretations.
  - `allow_parent_view_eccd_mid` (Boolean, default: `False`): Controls parent visibility of Mid-Test ECCD assessment scaled scores, standard scores, and interpretations.
  - `allow_parent_view_eccd_post` (Boolean, default: `False`): Controls parent visibility of Post-Test ECCD assessment scaled scores, standard scores, and interpretations.
- **Edit Permissions:**
  - `allow_parent_edit_student_info` (Boolean, default: `True`): Controls parent ability to edit family background fields (home address, emergency contact, parent occupations/education, siblings, handedness).
  - `allow_parent_edit_home_based_eccd` (Boolean, default: `False`): Controls parent ability to toggle and submit home-based ECCD checklist evaluations.

### 12.2 Adviser Inheritance & Gating Protocol
1. **Adviser Resolution:** When evaluating permissions for a student (`student_lrn`), the backend resolves the student's assigned section and retrieves the active Primary Adviser via `get_active_adviser_for_student(student, db)`.
2. **View Gating & Data Masking:**
   - When a testing period is unreleased (`allow_parent_view_eccd_{period} == False`), endpoints (e.g. `GET /api/parents/children/{lrn}/eccd-summary`) mask raw scores, standard scores, sums of scaled scores, and domain breakdowns with `None`/`null`.
   - The period object is flagged with `is_published: false` and `interpretation: "Pending Adviser Release"`. Unreleased evaluation data is strictly withheld at the API layer.
3. **Edit Enforcement (HTTP 403 Forbidden):**
   - Attempting to update student details (`PUT /api/parents/children/{lrn}` or `PUT /api/students/{lrn}`) when `allow_parent_edit_student_info == False` raises `HTTPException(status_code=403, detail="Student information editing is currently locked by the class adviser.")`.
   - Attempting to submit home-based evaluations (`POST /api/eccd/parent/evaluate`) when `allow_parent_edit_home_based_eccd == False` raises `HTTPException(status_code=403, detail="Home-based ECCD checklist submission is currently locked by the class adviser.")`.

### 12.3 Teacher Management & UI Controls
- Accessible in `/teacher/settings`, structured into two independent Material-UI cards:
  - **View Access Control:** Master switch for Student Information View + Independent switches for Pre-Test, Mid-Test, and Post-Test result releases.
  - **Edit Access Control:** Independent switches for Student Information Editing and Home-Based ECCD Checklist Editing.
- State changes persist automatically via `PUT /api/teachers/me/access` with instant feedback notifications.