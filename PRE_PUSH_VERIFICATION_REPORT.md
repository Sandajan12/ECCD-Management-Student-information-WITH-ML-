# AMES Pre-Push Verification Report

Audit date: 2026-10-20  
Repository branch: `unsure-check-first`  
Files reviewed: `.gitignore`, `frontend/.gitignore`, `backend/.gitignore`

**Overall result: BLOCKED.** The ignore rules pass verification, but tracked
sensitive artifacts, untracked tests, a missing Playwright dependency, and an
absent public CA certificate prevent a complete readiness confirmation.

This report records the completed audit. Creating this Markdown file does not
resolve the findings. No files were untracked, staged, committed, or pushed.

## Terminal Status Report

```text
Test Tracking Status:  PENDING
Secrets & Credentials: BLOCKED
Production Whitelists: PARTIAL
Ignore-rule Checks:    PASS — 33/33
Build Artifacts:       CLEAN
Git Whitespace Checks: PASS
```

## 1. Ignore Hierarchy and Test Visibility

All three ignore files were reviewed, including their effective combined behavior
using `git check-ignore --no-index`.

- Neither root nor frontend rules broadly ignore `tests/` or `frontend/tests/`.
- No broad `playwright*` or `playwright*.config.ts` exclusion remains.
- Test output directories remain excluded, including `test-results/`,
  `playwright-report/`, and `playwright/.cache/`.
- Additional generated reports and caches, including `blob-report/`,
  `nav-test-results/`, and `coverage/`, remain excluded.
- All 33 probes passed, covering tests, configurations, templates, secrets,
  production assets, datasets, dependencies, and build outputs.

The following files resurfaced and are visible to Git, but are **untracked**:

```text
frontend/playwright.ml-insights.config.ts
frontend/playwright.parent-ml.config.ts
frontend/tests/ml-insights.spec.ts
frontend/tests/parent-ml.spec.ts
```

No frontend test sources or Playwright configurations were tracked at audit time.
Visibility to Git does not mean the files are already included in a commit.

The teacher ML configuration imports the missing file
`frontend/playwright.parent-assessment-access.config.ts`. The default
`frontend/playwright.config.ts` is also absent. Restore the required configuration
from a trusted source before claiming that the browser tests are portable and
ready to run in another checkout.

## 2. Production Model and Public CA Certificate

| Asset | Explicit whitelist | Present | Tracked |
| --- | --- | --- | --- |
| `backend/ml/artifacts/rf_post_test_model.joblib` | Yes, root and backend | Yes, 1,317,059 bytes | Yes |
| `backend/ca.pem` | Yes, root and backend | No | No |
| `ca.pem` | Yes, root | No | No |

The production model is accounted for. The CA whitelist rules work, but no
certificate exists at either requested path. Restore the trusted public CA if
the deployment requires a repository-provided certificate. Never substitute a
private key for this asset.

The ignore-file comments reference Aiven MySQL SSL. The active application uses
PostgreSQL according to `AI_CONTEXT.md`; this audit did not verify remote database
connectivity or deployment certificate configuration.

## 3. Secrets, Credentials, and Sensitive Datasets

The PowerShell equivalent of the requested tracked-filename scan was run:

```powershell
git ls-files | Select-String -Pattern '(\.env|id_rsa|\.key|\.pem$)'
```

Only these three templates matched:

```text
.env.example
backend/.env.example
frontend/.env.example
```

No live environment files or private-key files were tracked. Sensitive settings
in the templates were placeholders or local example settings. A heuristic scan
of 249 tracked or pending text files found four secret-like assignments in test
fixtures; those assignments contained test markers. No live credential leak was
identified by these checks. This was not an exhaustive historical secret scan
or a content inspection of binary files.

| Requested sensitive path | Ignored | Tracked |
| --- | --- | --- |
| `backend/ml/raw_data/` | Yes | No |
| `backend/ml/data/` | Yes | No |
| `backend/ml/artifacts/real_beneficiary_benchmark.csv` | Yes | No |
| `backend/ml/artifacts/real_beneficiary_interventions.json` | Yes | **Yes** |
| `backend/ml/artifacts/dataset_audit.json` | Yes | **Yes** |
| `backend/tests/test_ml_model.py` | Yes | **Yes** |

The interventions JSON contains 29 entries. The audit JSON contains learner-level
record and repair structures. The model acceptance test includes beneficiary
facts and student references. Their contents are not reproduced here.

Ignoring an already tracked file does not remove it from Git. These ten tracked
files currently match ignore rules:

```text
backend/ml/.mplconfig/fontlist-v3.11.0.json
backend/ml/artifacts/MODEL_EVALUATION_REPORT.md
backend/ml/artifacts/dataset_audit.json
backend/ml/artifacts/plots/01_confusion_matrix.png
backend/ml/artifacts/plots/02_classification_metrics_f1.png
backend/ml/artifacts/plots/03_feature_importance.png
backend/ml/artifacts/plots/04_class_distribution_70_30.png
backend/ml/artifacts/plots/05_real_beneficiary_pre_vs_post_comparison.png
backend/ml/artifacts/real_beneficiary_interventions.json
backend/tests/test_ml_model.py
```

This list includes sensitive research artifacts, generated plots, and a plotting
cache. Sensitive paths already occur in committed history; the latest matching
commit inspected was `e53f1a1`. Removing files from the index preserves local
copies but does not remove historical copies. Resolve their presence in outgoing
history before pushing. No history rewrite was performed.

## 4. Working Tree Inspection

The original audit returned:

```text
 M .gitignore
 M backend/.gitignore
 M frontend/.gitignore
?? frontend/playwright.ml-insights.config.ts
?? frontend/playwright.parent-ml.config.ts
?? frontend/tests/ml-insights.spec.ts
?? frontend/tests/parent-ml.spec.ts
```

- Three ignore files were modified and four test/configuration files were untracked.
- The staging area was empty.
- No `dist/`, `node_modules/`, or `__pycache__/` files were tracked or pending commit.
- Both `git diff --check` and `git diff --cached --check` passed.
- Creating this report adds `PRE_PUSH_VERIFICATION_REPORT.md` as another untracked file.

Application builds, backend tests, and browser tests were not rerun during this
ignore-policy audit.

## 5. Next Git Commands

Before using the commit and push commands, restore the required Playwright
configuration and the trusted public certificate at `backend/ca.pem`. Review and
resolve sensitive historical content in the commits that would be pushed. The
commands below do not rewrite history or supply missing assets.

Run from the repository root in PowerShell:

```powershell
# Untrack the ten ignored files while preserving their local copies.
$ignoredTracked = @(git ls-files -ci --exclude-standard)
if ($ignoredTracked.Count -gt 0) {
    git rm --cached -- $ignoredTracked
}

# Stage the ignore rules, browser tests/configs, restored public CA, and report.
git add -- .gitignore frontend/.gitignore backend/.gitignore
git add -- frontend/tests 'frontend/playwright*.config.ts' backend/ca.pem
git add -- PRE_PUSH_VERIFICATION_REPORT.md

# Review the staged changes and verify ignored files are no longer tracked.
git ls-files -ci --exclude-standard
git diff --cached --check
git diff --cached --stat
git status --short

# Run only after the identified blockers have been resolved.
git commit -m "Fix ignore rules, track browser tests, and exclude sensitive artifacts"
git push origin HEAD:unsure-check-first
```

The `git ls-files -ci --exclude-standard` check should produce no output after
untracking the ignored files. Review and rerun the affected browser tests once
their configuration dependency is restored. Update this report with the actual
remediation results before committing it; the findings above describe the audit
snapshot, not a completed cleanup.
