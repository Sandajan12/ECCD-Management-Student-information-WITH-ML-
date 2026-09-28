# Agent Instructions: AMES Tech Stack Migration

## 1. System Overview & Architecture
You are assisting in migrating the AMES (Early Childhood Performance Analytics) system.
- **Backend:** Python (FastAPI, SQLAlchemy ORM, PostgreSQL)
- **Frontend:** React + TypeScript (Vite)
- **Legacy Reference:** All legacy Node.js and JavaScript files are located in `_legacy_reference/`.
- **Context Requirement:** Before starting any planning or coding task, you MUST silently read AI_CONTEXT.md to understand the domain logic, database schema, and machine learning goals. Do not deviate from the business logic defined in that file.

## 2. Operating Principles
- **Check Legacy Logic First:** Always inspect the corresponding legacy Node.js/Express controller or React component in `_legacy_reference/` before generating new code.
- **Self-Annealing & Verification:** If a command fails, inspect the stack trace, fix the implementation, and re-test. 
- **Preserve Business Logic:** Keep all database schemas, API route paths, and JSON response shapes 1:1 compatible with the original Node.js system.
- **Zero-Assumption Rule:** Do not guess, fabricate configurations, or hallucinate legacy implementations. If a request is unclear, incomplete, or you are missing a file reference, you must stop the planning process immediately and respond with clarification questions only.

## 3. Backend Rules (FastAPI)
- **Directory Separation:** Maintain strict layers:
  - `config/`: Database sessions and engine connections.
  - `models/`: SQLAlchemy ORM definitions.
  - `schemas/`: Pydantic validation models.
  - `routes/`: FastAPI `APIRouter` endpoint handlers.
- **Validation:** Require Pydantic models for every incoming request payload and outgoing API response.
- **Commands:** Use `uv` for package management (e.g., `uv pip install <package>`). Verify syntax with `uv run uvicorn main:app`.

## 4. Frontend Rules (React & TypeScript)
- **Commands:** Exclusively use `pnpm` for package management (e.g., `pnpm install`, `pnpm dev`).
- **Strict MUI Styling Rule:** Never pass raw CSS properties (like fontWeight) as direct top-level props to MUI components. Always use the `sx` prop for custom styling (e.g., `sx={{ fontWeight: 'bold' }}`).
- **Strict Typing:** Define explicit TypeScript interfaces for all component props, state variables, and API data payloads. Avoid using the `any` type.
- **Verification:** Verify type consistency by running `pnpm tsc --noEmit`.
- **Responsive-First UI Rule:** The entire frontend must be 100% responsive across all screen sizes (mobile, tablet, and desktop). 
  - Never hardcode fixed pixel widths or heights for layout containers. 
  - Use Material UI's `Grid` or `Stack` components for structural layouts. 
  - Utilize MUI's responsive `sx` prop syntax for conditional sizing (e.g., `sx={{ width: { xs: '100%', sm: '75%', md: '50%' } }}`).
  - **UI/UX Aesthetic Rule (Soft & Approachable):** Design all components to be welcoming, smooth, and intuitive for teachers and parents (ages 20-40). 
  - **Shapes:** Apply distinct rounded corners to all Cards, Buttons, Dialogs, and TextFields (e.g., `sx={{ borderRadius: 3 }}`). Avoid sharp, rigid edges.
  - **Depth & Borders:** Use soft, diffuse shadows (e.g., MUI `elevation={1}` or custom light box-shadows) instead of harsh, high-contrast borders.
  - **Spacing:** Enforce generous whitespace. Use `Stack` with `gap={2}` or `gap={3}` and ample padding to prevent visually cluttered or overwhelming screens.
  - **Typography:** Use readable, friendly font weights. Use `text.secondary` (soft gray) for helper text and subtitles to reduce eye strain and establish a clear visual hierarchy.

## 5. Agent Workflow Constraints
- **Plan First:** Always generate a structured implementation plan before writing or modifying code.
- **Read-Only Legacy:** You must NEVER delete, modify, or overwrite any files in `_legacy_reference/`.

## 6. Current Architectural State & Generated Endpoints
### Normalized Section-Teacher Model & Granular RBAC
- **Junction Table:** `SectionTeacher` in `backend/models/section_teacher.py` (`section_id`, `teacher_id`, `role`, `status`, `assigned_date`).
  - Roles: `'Primary Adviser'`, `'Substitute'`. (Legacy roles like `'OJT'` are strictly deprecated).
  - Status: `'Active'`, `'Inactive'`.
- **Granular RBAC Column:** `teachers.allow_eccd_question_management` (Boolean, default `False`).
- **Access Dependency:** `verify_eccd_question_access` in `backend/utils/deps.py` guards all write operations on ECCD domains/questions. Allows `super-admin` unconditionally, and `admin` only when `allow_eccd_question_management == True`.

### Key Backend Endpoints
- `PUT /api/chairman/teachers/{teacher_id}/permissions`: Updates teacher RBAC permissions (`TeacherPermissionUpdate`).
- `PUT /api/chairman/students/transfer`: Reassigns students to a new section (`StudentTransferRequest`) while guaranteeing 100% assessment evaluation preservation in `student_eccd_evaluations`.
- `POST /api/chairman/sections/{section_id}/assign-teacher`: Assigns Primary Adviser (auto-deactivates previous adviser) or Substitute (preserves previous adviser).
- `GET /api/chairman/sections`: Fetches all sections with active adviser assignments.
- `GET /api/chairman/teachers`: Fetches all teachers with their assigned sections.
- `GET /api/teachers/active`: Returns active teachers for dropdown selection.
- `GET /api/eccd/parent/dashboard-stats/{student_lrn}`: Aggregates stats strictly from the latest testing period (`POST` > `MID` > `PRE`) with alphabetical tie-breaking and `assessmentMastered` flag.
- `GET /api/eccd/parent/domains-progress/{student_lrn}`: Flat domain progression list for parent progress tracking.

### Key Frontend Implementations
- `TeacherManagement.tsx`: Features the "Manage Access" modal with Section Assignment (Primary Adviser vs Substitute) and ECCD Question Management toggle switch.
- `StudentRecords.tsx`: Features multi-select checkboxes, floating action banner, and `TransferStudentsModal` with evaluation preservation notice.
- `ProtectedRoute.tsx`: Supports `requiredPermission` prop to enforce granular permissions client-side.
- `MainLayout.tsx`: Conditionally displays the "ECCD Questions" navigation item in the teacher sidebar based on `user.allow_eccd_question_management`.
- `/teacher/eccd-questions`: Route mapped to `EccdQuestionManagement.tsx` protected by `allow_eccd_question_management`.
- `Dashboard.tsx` (Parent): Dynamically displays "Assessment Complete / All Skills Mastered / Ready for Grade 1" on soft green card when mastered, or "Needs Support In" on soft orange card.

## 7. Offline Durability & Zero-Data-Loss Standards
- **Form State Persistence Mandate:** Any future agent or developer MUST maintain offline durability across form inputs—specifically forbidding any changes that clear user inputs on page reload, network drops, or before receiving explicit database confirmation (HTTP 200/201).
- **Isolated Storage Keys:** Use strictly scoped composite keys (e.g., `eccd_draft_${studentLrn}_${testingPeriod}_${domainId}`).
- **Prohibition on Global Clearing:** Never invoke global `localStorage.clear()` under any circumstances. Only the exact composite key matching the confirmed server record may be evicted.
- **Graceful Network Degradation:** When offline or when network requests fail due to disconnection, save inputs locally with `is_pending_sync: true`, provide non-blocking user feedback, and queue them for automated background synchronization upon reconnection (`window.addEventListener('online')`).

## 8. Granular Global Parent Access Standards
- **6-Permission Matrix Mandate:** Never re-introduce coarse boolean flags (`allow_parent_view`, `allow_parent_edit`, `allow_parent_home_based_edit`) for new features. All parent access control must strictly use the 6 granular columns on `teachers`:
  - `allow_parent_view_student_info` (Boolean, default `True`)
  - `allow_parent_view_eccd_pre` (Boolean, default `False`)
  - `allow_parent_view_eccd_mid` (Boolean, default `False`)
  - `allow_parent_view_eccd_post` (Boolean, default `False`)
  - `allow_parent_edit_student_info` (Boolean, default `True`)
  - `allow_parent_edit_home_based_eccd` (Boolean, default `False`)
- **Adviser Permission Inheritance:** A student inherits parent access permissions strictly from their section's active Primary Adviser (`get_active_adviser_for_student`).
- **Data Masking Protocol:** When an ECCD testing period is unreleased, backend endpoints must mask all score metrics with `None`/`null` and return `is_published: false` with qualitative interpretation set to `"Pending Adviser Release"`. Unreleased evaluation data must never leak to the parent client payload.
- **Strict HTTP 403 Enforcement:** Backend endpoints handling parent updates or home evaluations must raise HTTP 403 Forbidden with descriptive detail messages when the adviser has locked editing permissions.
- **Frontend Protective Gating:** Parent views must render locked placeholder states ("Results Pending Adviser Release", read-only alerts, and disabled submission buttons) when permissions are disabled.
