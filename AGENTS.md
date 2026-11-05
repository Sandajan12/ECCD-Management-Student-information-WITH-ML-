# Agent Instructions: AMES Current Codebase

## 1. System Overview & Architecture
You are maintaining and extending the AMES (Early Childhood Performance Analytics) system. The Node.js-to-Python and JavaScript-to-TypeScript migration is complete.
- **Backend:** Python (FastAPI, SQLAlchemy ORM, PostgreSQL)
- **Frontend:** React + TypeScript (Vite)
- **Source of Truth:** Use the active code in `backend/` and `frontend/`, including related models, schemas, migrations, tests, manifests, and configuration templates. The legacy reference folders have been removed and are not prerequisites for any task.
- **Context Requirement:** Before starting any planning or coding task, you MUST silently read AI_CONTEXT.md to understand the domain logic, database schema, and machine learning goals. Do not deviate from the business logic defined in that file.

## 2. Operating Principles
- **Check Current Logic First:** Before planning, implementing features, or analyzing code, inspect the relevant active FastAPI routes, utilities, models, schemas, React components, hooks, services, and tests. Trace existing behavior in the current codebase.
- **Self-Annealing & Verification:** If a command fails, inspect the stack trace, fix the implementation, and re-test. 
- **Preserve Business Logic:** Preserve current database contracts, API route paths, JSON response shapes, and domain rules unless the requested change explicitly requires updating them. Use active source and current tests to establish compatibility.
- **Evidence-Based Clarification:** Do not fabricate implementations or configuration. Search the current codebase and AI_CONTEXT.md first. Ask for clarification only when a material requirement remains ambiguous or required current information cannot be found. Missing legacy files or historical references must never block feature work or code analysis, and must not prompt requests to restore or supply those files.

## 3. Backend Rules (FastAPI)
- **Directory Separation:** Maintain strict layers:
  - `config/`: Database sessions and engine connections.
  - `models/`: SQLAlchemy ORM definitions.
  - `schemas/`: Pydantic validation models.
  - `routes/`: FastAPI `APIRouter` endpoint handlers.
- **Validation:** Require Pydantic models for every incoming request payload and outgoing API response.
- **Commands:** Use `uv` for package management and explicitly select the project's Python 3.12 environment. From the repository root, run the API with `uv run --no-project --python .venv312 python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000 --env-file backend/.env`. Startup checks required schema upgrades and transactionally applies only migration 016 (`teacher_marked_at`), a nullable timestamp with no historical backfill. Apply other required migrations explicitly using the current inventory in AI_CONTEXT.md and `backend/migrations/README.md`. Target backend test collection directly with `uv run --no-project --python .venv312 python -m pytest backend/tests -q`; do not collect archived modules from the repository root.

## 4. Frontend Rules (React & TypeScript)
- **Commands:** Exclusively use `pnpm` for package management (e.g., `pnpm install`, `pnpm dev`).
- **Strict MUI Styling Rule:** Never pass raw CSS properties (like fontWeight) as direct top-level props to MUI components. Always use the `sx` prop for custom styling (e.g., `sx={{ fontWeight: 'bold' }}`).
- **Strict Typing:** Define explicit TypeScript interfaces for all component props, state variables, and API data payloads. Avoid using the `any` type.
- **Verification:** From the repository root, run `pnpm --dir frontend exec tsc --noEmit -p tsconfig.app.json` and `pnpm --dir frontend exec tsc --noEmit -p tsconfig.node.json`. The root frontend tsconfig only references these projects; plain `tsc --noEmit` does not check them. Use `pnpm.cmd` on Windows when PowerShell blocks the pnpm launcher. Browser tests require an explicit existing `--config`; there is no default `frontend/playwright.config.ts`.
- **Responsive-First UI Rule:** The entire frontend must be 100% responsive across all screen sizes (mobile, tablet, and desktop). 
  - Never hardcode fixed pixel widths or heights for layout containers. 
  - Use Material UI's `Grid` or `Stack` components for structural layouts. 
  - Utilize MUI's responsive `sx` prop syntax for conditional sizing (e.g., `sx={{ width: { xs: '100%', sm: '75%', md: '50%' } }}`).
  - **UI/UX Aesthetic Rule (Soft & Approachable):** Design all components to be welcoming, smooth, and intuitive for teachers and parents (ages 20-40). 
  - **Shapes:** Apply distinct rounded corners to all Cards, Buttons, Dialogs, and TextFields (e.g., `sx={{ borderRadius: 3 }}`). Avoid sharp, rigid edges.
  - **Depth & Borders:** Use soft, diffuse shadows (e.g., MUI `elevation={1}` or custom light box-shadows) instead of harsh, high-contrast borders.
  - **Spacing:** Enforce generous whitespace. Use `Stack` with `gap={2}` or `gap={3}` and ample padding to prevent visually cluttered or overwhelming screens.
  - **Typography:** Use readable, friendly font weights. Use `text.secondary` (soft gray) for helper text and subtitles to reduce eye strain and establish a clear visual hierarchy.

## 5. Agent Workflow Constraints & Tool Protocol
- **Plan First:** Always generate a structured implementation plan before writing or modifying code.
- **Current-Codebase Workflow:** Base implementation and verification on active source and tests. Do not require legacy comparisons or restore removed legacy folders.
- **Graphify AST Dependency Mapping:**
  - Before refactoring existing services, hooks, or models, consult or generate the codebase graph (`graphify .` or check `graph.json`) to trace exact dependency nodes, incoming references, and callers.
  - When modifying shared functions (such as `get_active_adviser_for_student`, RBAC dependencies, or composite key generators), inspect all inbound graph edges across `backend/` and `frontend/` to prevent silent breakage.
  - Never guess import paths or component usage across directory boundaries; rely on the AST graph rather than speculative full-text searches.
- **Ponytail Review Checkpoint:**
  - After drafting any refactor or new feature, review the proposed diff against the Anti-Over-Engineering rules in Section 9 before finalizing edits.
  - Explicitly ask: *"Did this change introduce unnecessary abstractions, extra state, or new dependencies that existing code already handles?"*

## 6. Current Architectural State & Generated Endpoints
### Normalized Section-Teacher Model & Granular RBAC
- **Junction Table:** `SectionTeacher` in `backend/models/section_teacher.py` (`section_id`, `teacher_id`, `role`, `status`, `assigned_date`).
  - Role: `'Primary Adviser'` only. Retired roles such as `'Substitute'` and `'OJT'` must not be accepted or grant access.
  - Status: `'Active'`, `'Inactive'`.
  - Each section has at most one active adviser, and each teacher owns at most one active section. Moves retire the incoming teacher's previous assignments and clear old section pointers. Handovers deactivate displaced advisers who have no remaining active assignment, while preserving student records, evaluations, family links, and section editing windows. Restoring an account requires explicit section reassignment.
- **Protected Student Identity:** `students.student_id` is the integer primary key. LRNs are encrypted with HMAC lookup and masked in public responses; frontend URLs, payload references, and draft keys use student IDs. Raw LRNs are enrollment/linking inputs, not plaintext database columns.
- **Granular RBAC Column:** `teachers.allow_eccd_question_management` (Boolean, default `False`).
- **Access Dependency:** `verify_eccd_question_access` in `backend/utils/deps.py` guards all write operations on ECCD domains/questions. Allows `super-admin` unconditionally, and `admin` only when `allow_eccd_question_management == True`.

### Key Backend Endpoints
- `PUT /api/chairman/teachers/{teacher_id}/permissions`: Updates teacher RBAC permissions (`TeacherPermissionUpdate`).
- `PUT /api/chairman/students/transfer`: Reassigns students to a new section (`StudentTransferRequest`) while guaranteeing 100% assessment evaluation preservation in `student_eccd_evaluations`.
- `POST /api/chairman/sections/{section_id}/assign-teacher`: Assigns or unassigns the Primary Adviser under the ownership/handover rules above. A null `teacher_id` unassigns; the optional compatibility `role` accepts only `Primary Adviser`.
- `GET /api/chairman/sections`: Fetches all sections with active adviser assignments.
- `GET /api/chairman/teachers`: Fetches all teachers with their assigned sections.
- `GET /api/teachers/active`: Returns active teachers for dropdown selection.
- `GET /api/eccd/parent/dashboard-stats/{student_lrn}`: Aggregates stats strictly from the latest testing period (`POST` > `MID` > `PRE`) with alphabetical tie-breaking and `assessmentMastered` flag.
- `GET /api/eccd/parent/domains-progress/{student_lrn}`: Flat domain progression list for parent progress tracking.
- **Compatibility path names:** `{student_lrn}` remains the active route parameter name; frontend callers pass the integer student ID. Preserve these route paths and protected identifier resolution.

### Key Frontend Implementations
- `TeacherManagement.tsx`: Features the "Manage Access" modal with Primary Adviser section assignment, incumbent-specific handover confirmation, and ECCD Question Management toggle switch; there is no role selector.
- `StudentRecords.tsx`: Features multi-select checkboxes and an inline `TransferStudents` dialog with destination-section selection and durable submission. Backend transfers preserve evaluations.
- `ProtectedRoute.tsx`: Supports `requiredPermission` prop to enforce granular permissions client-side.
- `MainLayout.tsx`: Conditionally displays the "ECCD Questions" navigation item in the teacher sidebar based on `user.allow_eccd_question_management`.
- `/teacher/eccd-questions`: Reuses `pages/chairman/EccdQuestionsManagement.tsx`, protected by `allow_eccd_question_management`.
- `Dashboard.tsx` (Parent): Displays permission-aware assessment status, pending home observations, and teacher-message previews. `useChildren` refreshes eligible children every 20 seconds in visible tabs and on focus/visibility/reconnection; selection falls back to an eligible sibling or the empty state.

## 7. Offline Durability & Zero-Data-Loss Standards
- **Form State Persistence Mandate:** Any future agent or developer MUST maintain offline durability across form inputs—specifically forbidding any changes that clear user inputs on page reload, network drops, or before receiving explicit database confirmation (HTTP 200/201).
- **Isolated Storage Keys:** Use student IDs and owner-scoped composite keys: teacher `eccd_draft_${studentId}_${testingPeriod}_${domainId}_${ownerId}`, parent `eccd_draft_${studentId}_${testingPeriod}_${domainId}_home_${ownerId}`. Generic form drafts use `ames_draft_${ownerId}_${resource}`.
- **Prohibition on Global Clearing:** Never invoke global `localStorage.clear()` under any circumstances. Only the exact composite key and revision matching the confirmed server record may be evicted; an older response must never clear newer edits. Logout, access revocation, and child hiding preserve work drafts.
- **Graceful Network Degradation:** Preserve inputs locally on disconnection. Automatic replay is restricted to authenticated teacher-owned ECCD drafts targeting `POST /api/eccd/evaluate`, with matching owner and revision. All other forms and uploads require manual online submission, including existing queued records. Show: "Your draft is saved on this device. Reconnect and submit again." Follow `TEACHER_ECCD_OFFLINE_SCOPE_PLAN.md`; never replay non-ECCD saves on reconnection or login.

## 8. Granular Global Parent Access Standards
- **8-Permission Matrix Mandate:** Never re-introduce coarse boolean flags (`allow_parent_view`, `allow_parent_edit`, `allow_parent_home_based_edit`) for new features. All parent access control must strictly use the 8 granular columns on `teachers`; `allow_eccd_question_management` is a separate staff permission:
  - `allow_parent_view_student_info` (Boolean, default `True`)
  - `allow_parent_view_eccd_pre` (Boolean, default `False`)
  - `allow_parent_view_eccd_mid` (Boolean, default `False`)
  - `allow_parent_view_eccd_post` (Boolean, default `False`)
  - `allow_parent_view_eccd_marks` (Boolean, default `False`)
  - `allow_parent_predictions` (Boolean, default `False`)
  - `allow_parent_edit_student_info` (Boolean, default `True`)
  - `allow_parent_edit_home_based_eccd` (Boolean, default `False`)
- **Adviser Permission Inheritance:** A student inherits parent access permissions strictly from their section's active Primary Adviser with an active account (`get_active_adviser_for_student`). Parent child access requires a SYNCED family link, an active student, and an eligible adviser; unavailable existing children return HTTP 403 and deleted students return HTTP 404. Hiding a child preserves links, assessments, and drafts.
- **Data Masking Protocol:** When an ECCD testing period is unreleased, backend endpoints must mask official score metrics, dates, ages, and progress with `None`/`null` and return `is_published: false` with qualitative interpretation set to `"Pending Adviser Release"`. A locked latest period cannot fall back to older released scores.
- **Independent Checklist Marks:** `allow_parent_view_eccd_marks` controls recorded answers and evaluator roles across all domains and periods independently of score release. With marks disabled, only the authenticated parent's own home observations in globally and section-enabled editing windows are visible; teacher marks and other parents' observations remain masked. Marks access never releases official scores or enables editing.
- **Prediction Access:** Parent predictions additionally require `allow_parent_predictions`, complete teacher-confirmed PRE data, and independent PRE score release. Parent responses exclude family model inputs and individual checklist marks. Predictions never replace official ECCD scores or write assessment records.
- **Strict HTTP 403 Enforcement:** Backend endpoints handling parent updates or home evaluations must raise HTTP 403 Forbidden with descriptive detail messages when the adviser has locked editing permissions. Home submissions also require the section's period-specific editing window (`PRE=True`, `MID=False`, `POST=False` by default).
- **Frontend Protective Gating:** Parent views must render locked placeholder states ("Results Pending Adviser Release", read-only alerts, and disabled submission buttons) when permissions are disabled.
- **Saved Home Observations:** A successful parent submission locks those question/period observations. Identical retries preserve the original author and submission time; changed parent answers conflict. Teacher corrections must explicitly identify edited questions. `teacher_marked_at` records the actual teacher save time; historical unknown timestamps remain null.


## 9. Ponytail Anti-Over-Engineering & Refactoring Guardrails
Adopt the **"Lazy Senior Engineer"** decision ladder when cleaning up vibe-coded sections or scaffolding new features:

### 1. The Decision Ladder (Lowest Complexity Wins)
Before writing new code, choose the lowest viable level of abstraction:
1. **Can existing code do this?** Reuse utilities in `utils/` or existing MUI components rather than creating new wrappers.
2. **Can standard libraries do this?** Prefer built-in Python 3.12 / standard modern TypeScript methods over installing utility packages.
3. **Can standard language syntax do this?** Prefer simple procedural logic or standard React hooks (`useState`, `useMemo`) over custom architectural abstractions.
4. **Only build a new abstraction if code is duplicated across 3+ unrelated files (Rule of Three).**

### 2. Vibe-Code Refactoring Rules
- **Eliminate Speculative Architecture:** Remove intermediate abstraction layers created during rapid prototyping (e.g., single-use service classes that merely forward calls to a single repository or route).
- **Consolidate State:** Identify scattered `useState` hooks representing a single logical flow and group them into a single typed state object, while strictly preserving offline persistence rules[cite: 1].
- **Prune Dead Imports & Unused Code:** Strip any zombie endpoints, unused TypeScript types, or orphaned helper functions left behind during iterative vibe-coding.
- **Strict Dependency Ban:** Do not install any new npm package or Python library without explicit confirmation. Solve problems using `uv`-managed dependencies, FastAPI, SQLAlchemy, React, and MUI already present in the workspace[cite: 1].
- **Inline Styling Decoupling:** When refactoring vibe-coded UI, convert any inline HTML styles or hardcoded CSS strings into standard Material UI `sx` responsive props adhering to the soft/rounded design rules in Section 4[cite: 1].
