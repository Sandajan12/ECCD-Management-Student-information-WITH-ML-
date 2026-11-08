# AMES Documentation Audit and Account Handoff Plan

Reviewed: **2026-11-07**

Reviewed commit: **a836697**
Status: **Documentation updates implemented on 2026-11-07.** The audit findings
below describe the original documents before consolidation. Current guidance is
in `AI_CONTEXT.md` and `AGENTS.md`; the complete previous context is preserved in
`AI_CONTEXT_HISTORY.md`. Runtime tests and a fresh-account onboarding exercise
were not performed for this documentation update.

## 1. Audit result

The original `AGENTS.md` and `AI_CONTEXT.md` contained recent information but
were not fully consistent. `AGENTS.md` preserved the main safeguards;
`AI_CONTEXT.md` mixed current behavior with superseded implementation notes.
The findings below were the basis for the now-implemented documentation cleanup.

These findings come from static inspection of the active source, manifests,
migrations, tests, Git tracking, and the local dependency graph. Application tests
and deployed services were not rerun for this audit. The working tree was clean
at the reviewed commit before this report was added.

| Area | Confirmed discrepancy | Required correction |
| --- | --- | --- |
| Offline submission | `AI_CONTEXT.md` section 10 describes automatic form/file retries. Current code permits automatic replay only for authenticated teacher ECCD submissions. | Describe the role, owner, revision, student, period, and exact `POST /api/eccd/evaluate` restrictions. Other forms and uploads require manual online submission. |
| Migrations | The main inventory and manual command lists stop at 016. Startup also checks 017. | Add `017_eccd_question_sequence` and its explicit check/apply commands. Startup automatically applies only 016; 017 remains explicit. |
| Assessment provenance | Section 7 generally describes teacher saves as assigning teacher provenance. | Explain that equal-answer confirmation preserves existing parent provenance. Corrections to parent answers require explicit edited question IDs; changed teacher marks record the actual save timestamp. |
| ML chart deployment | The diagnostic-gallery description says the six approved charts are ignored and separately provisioned. | State that all six approved images are Git-tracked through explicit ignore exceptions. Other research outputs retain their own ignore rules. |
| Verification inventory | The document lists 14 Playwright configurations but later says ten. Old test outcomes appear alongside current guidance. | Reconcile the inventory with tracked configurations and separate historical results from current verification instructions. |
| Older behavior descriptions | Current sections retain superseded reconnect behavior, incomplete export descriptions, and historical hybrid-model promotion details. | Consolidate current behavior and move dated narratives into a clearly labelled history document. |

Additional observations:

- The active model SHA-256 matches the documented standalone Random Forest
  fingerprint: `1ff4591f0f8e21bbaeb48f5617f61acd460f2953f6609cac52d5f86a6bdcec73`.
- The local `graphify-out/graph.json` predates recent changes and must not be
  treated as current dependency evidence. Refresh the relevant AST mapping before
  refactoring; do not guess callers from stale graph output.
- The frontend README still mentions substitute assignments and six parent
  permissions. Current rules allow only Primary Adviser assignments and use eight
  granular parent permissions.
- Public LRN masking remains required, but authorized staff student-detail reads
  include a decrypted LRN for editing. Documentation must preserve that specific
  exception rather than imply every response is masked.

## 2. Proposed documentation changes

### AGENTS.md: working contract

- Preserve all existing business, permission, durability, dependency, responsive
  design, planning, and verification safeguards.
- Add explicit migration-017 guidance, the current ML boundary, and the authorized
  staff-detail exception for decrypted LRNs.
- Require each new session to read the current context, inspect Git status and
  relevant active source, and identify unresolved documentation/code conflicts.
- Require future behavior changes to update the corresponding current guidance.
  Historical test results must retain their dates and must not imply fresh checks.

### AI_CONTEXT.md: concise current guide

- Organize around architecture, setup, ownership/access, assessments, exports,
  offline behavior, ML, and verification.
- Integrate the November 7 question-ordering and export changes into the relevant
  current sections, including the distinction between official domains and
  supplementary custom-domain results.
- Reconcile the discrepancies in section 1 against active source and tests.
- Put a short handoff section first: reviewed date/commit, evidence-backed
  unfinished work, verification limits, required local resources, and links to
  detailed guides.
- Distinguish documented local observations from deployment defaults. Do not
  infer live database migration state or deployment health from file inspection.

### AI_CONTEXT_HISTORY.md: dated evidence

- Move delivery narratives, historical test outcomes, superseded UI descriptions,
  and hybrid/V2 experiments into this archive.
- Preserve useful historical information and its dates, with a clear notice that
  historical descriptions do not establish current runtime behavior.
- Link to the archive from the concise current guide; normal onboarding should
  not require reading the entire archive.

### Related onboarding guidance

- Correct the frontend README's obsolete assignment-role and permission-count
  statements.
- Keep startup commands aligned with the explicit Python 3.12 environment, pnpm,
  and the actual migration inventory.
- Avoid adding another memory service, dependency, or automation layer for this
  documentation task.

## 3. Reusable new-session prompt

Open the same project directory, then use:

> Read AGENTS.md and AI_CONTEXT.md first. Inspect Git status and the active code
> relevant to my request. Summarize the architecture, applicable business rules,
> and any documentation/code conflicts before proposing changes. Treat historical
> notes as reference. Verify paths and commands, preserve existing work, and state
> anything you cannot establish from evidence.

The cleanup is implemented. Use the current guide for onboarding; consult this
report for the original rationale and `AI_CONTEXT_HISTORY.md` for dated evidence.
The proposed fresh-session comprehension exercise remains unperformed.

## 4. Practical handoff recommendations

1. Preserve the repository and all intended local work before switching. A clone
   contains committed files, not uncommitted or ignored local material.
2. Keep credentials, database backups, and encryption keys in appropriate private
   storage. Do not copy their values into onboarding Markdown or chat prompts.
3. Check availability of ignored environment files, private datasets, local skills,
   and connected-service credentials when changing computers or accounts. Their
   availability is separate from the tracked project documentation.
4. Record unfinished work and remaining checks with evidence. Do not convert old
   audit findings into current blockers without checking whether they still apply.
5. Ask the new session to explain the important rules with source references
   before it edits the system: student IDs and LRN protection, adviser ownership,
   eight parent permissions, teacher-only ECCD replay, assessment provenance,
   official scoring versus supplementary domains, and the current ML model.

## 5. Verification and acceptance

- Check documented paths, migration modules, startup commands, configuration
  counts, and tracked assets against the repository.
- Review current sections for contradictory replay, provenance, permission,
  scoring, export, and model claims.
- Confirm historical material remains accessible and clearly labelled.
- Validate the handoff through a fresh session that explains the critical rules
  with active-source references and identifies unavailable resources honestly.
- Review the documentation diff and run `git diff --check`; runtime tests are not
  required solely for prose changes. Do not present historical test counts as new
  results.

This plan covers documentation only. It does not require application, API, schema,
model, dependency, or database changes. No migrations or retraining should run as
part of the documentation audit or cleanup.

Before finalizing the proposed cleanup, explicitly review:

> Did this change introduce unnecessary abstractions, extra state, or new
> dependencies that existing code already handles?

Clear documentation reduces unsupported assumptions, but cannot guarantee that a
new session will never make mistakes. The active code, tests, and explicit user
requirements must continue to ground each change.

## 6. Implementation record (2026-11-07)

- Reconciled replay scope, migration 017, equal-answer provenance, tracked plots,
  browser inventory and the standalone RF fingerprint in `AI_CONTEXT.md`.
- Preserved the complete previous context in `AI_CONTEXT_HISTORY.md`; its snapshot
  matches `a836697:AI_CONTEXT.md` with line endings normalized. Current guidance
  is separated from dated delivery notes and hybrid/V2 experiments.
- Updated AGENTS operational safeguards, the frontend README and the related
  migration README; no source, schema, test or model artifact changed.
- Static checks verified all 17 migration modules, 14 tracked Playwright
  configurations selecting 19 distinct existing specs, the binary/metrics RF
  fingerprint, all six tracked diagnostic PNGs and relative Markdown links.
- `git diff --check` passed. No application tests, builds, database connections,
  migrations, retraining or hosted verification were performed for this update.
- Ponytail review found no new abstractions, state, dependencies or automation.
  Fresh-account comprehension validation remains a separate unperformed exercise.
