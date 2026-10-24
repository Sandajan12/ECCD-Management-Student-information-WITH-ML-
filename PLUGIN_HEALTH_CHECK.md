# Installed plugin health check

Checked: **2026-10-24**, in the current Codex session on Windows.

## Repair follow-up — 2026-10-24

This follow-up supersedes the original SonarQube and WoWSQL setup observations below. Neither integration has passed an end-to-end check yet.

- **SonarQube:** installed the official SonarSource CLI, version **1.10.1**, at `C:\Users\user\AppData\Local\sonarqube-cli\bin\sonar.exe` and added its directory to the Windows user PATH. Verified command resolution in a process using that PATH and verified `sonar --version`. `sonar auth status` reports **No saved connection**. No Docker, Podman, or Nerdctl command was found; Docker's standard installation directory and matching container services were also absent. `codex mcp list --json` returned no registered servers. Account login, a working container runtime, and MCP integration remain required. No account, organization, server URL, or project key was invented. Restart Codex to inherit the updated user PATH.
- **WoWSQL:** refreshed its existing installed package with `codex plugin add app-6a28163c23d08191a73e6c150c1314c5@openai-curated-remote --json`. The refresh succeeded and installed/enabled metadata remains present. Documentation-search probes before and after the refresh both returned `Unknown tool({"name":"wowsql.search_docs"})` in this session. A new Codex session must retest the connection; the exact connector-side cause remains unknown. If the error persists, inspect/reconnect WoWSQL in plugin settings and retain the exact error for support. No SQL was executed.

The current CLI help differs from the bundled SonarQube setup skill: `sonar integrate codex` describes global integration by default and does not list `--project`; `sonar run mcp` accepts `--project`. Integration was not executed while authentication and runtime prerequisites remain unmet.

No AMES application source, credentials, school data, or existing permissions were changed by this repair attempt. The original report below describes the earlier read-only checks.

## Overall result

**Not every plugin is fully operational.** Plugin Management, Sites, and Pets passed the read-only operations tested. GitHub and WoWSQL returned connector errors. Codex Security is partially functional but has a Python discovery problem affecting scan startup. SonarQube requires CLI setup. Other packages have available files or metadata, but their complete workflows remain unverified.

This report records the checks already performed in this conversation. Creating this document did not rerun scans or service operations.

## Results

| Plugin | Package version | Status | Evidence and limits |
| --- | --- | --- | --- |
| Plugin Management | `0.1.0` | Read-only checks passed | Plugin dependency/status inspection and catalog search respond. This confirms those management operations, not installation/removal workflows. |
| Sites | `1.1.2` | Read-only check passed | Site-list operation responds. No site was created, edited, published, or deleted. |
| Pets | `0.1.6` | Read-only check passed | Pet-list operation responds. No pet was created, selected, changed, or deleted. |
| GitHub | `0.1.12-5f7cd798dc99` | Failing | Installed/enabled metadata is present, but repository metadata, fetch, and authenticated-profile operations return `Unknown tool`. |
| WoWSQL | `1.0.0` | Failing | Installed/enabled metadata is present, but its documentation-search operation returns `Unknown tool`. No SQL or database operation was executed. |
| Codex Security | `0.1.32` | Partially functional | Its Daybreak account-access check responds. Earlier scan startup failed because its Python helper could not start. The local interpreter-resolution problem is detailed below. A successful account check does not establish successful scanning. |
| SonarQube | `2.6.0` | Setup incomplete | Local skill files exist, but the required `sonar` command is unavailable on PATH. Authentication and project analysis were not verified. |
| Vercel | `0.54.1` | Service access unverified | Installed/enabled metadata, skill files, and a remote MCP declaration exist. No Vercel service tools are exposed in this session, and the `vercel` CLI is unavailable on PATH. This does not prove the package itself is broken. |
| SQL Expert | `1.0.1` | Local skills available | Manifest parses and the declared skills directory exists. It provides SQL guidance; its presence does not establish a live PostgreSQL connection. No SQL workflow was tested. |
| Default templates | `0.1.1` | Files present; workflow unverified | Installed/enabled metadata and local template skill directories exist. No document-generation workflow was executed. |

All ten inspected local package manifests parsed successfully. Every declared local skills directory checked was present. File presence and installation metadata alone do not prove authentication or runtime functionality.

## Confirmed failures and diagnostics

### GitHub connector

Representative error:

```text
Mcp error: -32001: Unknown tool({"name":"github.get_repo"})
```

Related fetch and profile calls also returned `Unknown tool`, including a retry.

**What is established:** the tools advertised to this session are not recognized by the connector when invoked.

**What remains unknown:** whether the underlying cause is stale tool registration, connector routing, session state, or another provider-side problem. The returned error does not establish invalid GitHub credentials or insufficient repository permissions. Git transport successfully listed the AMES repository's remote refs during the deployment audit, but that uses a separate access path.

### WoWSQL connector

The documentation-search probe returned:

```text
Mcp error: -32001: Unknown tool({"name":"wowsql.search_docs"})
```

**What is established:** this connector operation is unavailable despite installed/enabled metadata.

**What remains unknown:** its connector-side cause and whether authenticated database operations would work. No database query was attempted, and this result says nothing about the integrity of AMES PostgreSQL data.

### Codex Security Python discovery

The earlier scan-start operation reported that Codex Security could not start its Python 3 helper.

Read-only inspection of the installed resolver and local environment found:

1. The resolver first uses the `PYTHON` environment variable when configured.
2. Otherwise, it checks bundled Python executables beneath `~/.cache/codex-runtimes/codex-primary-runtime/dependencies/python`.
3. On Windows, it falls back to the `python` command.
4. In the inspected shell environment, `PYTHON` is unset, that bundled Python directory is absent, and neither `python` nor `python3` resolves on PATH.
5. The project interpreter exists and executes successfully: `.venv312/Scripts/python.exe`, reporting **Python 3.12.13**.

These observations identify a concrete local discovery problem consistent with the scan-start error. The already-running plugin process may have its own inherited environment; correcting a separate shell does not automatically update it.

The plugin's separate Daybreak account check responded with `not_granted`. Its response explicitly describes that check as advisory and says it does not block scanning. **Do not treat Daybreak access as the explanation for the Python failure.**

No managed scan was completed during these checks. No scan was started merely to test whether it would create artifacts.

## Setup gaps and verification limits

- **SonarQube:** the required CLI is missing from PATH. The plugin's local instructions require CLI installation and authentication before project operations. No installation, login, MCP reconfiguration, or hooks setup was performed.
- **Vercel:** its configuration declares an HTTP MCP server at `https://mcp.vercel.com`, but no Vercel service tools are available to invoke here. Connection, authentication, and tool-loading state need verification; no account or project access was proven.
- **SQL Expert and SonarQube catalog lookup:** dependency lookup by their local package names could not resolve a current public/global catalog entry. Their local packages and skills remain present. That lookup failure alone does not establish that they were uninstalled or that their skill content is unusable.
- **GitHub Enterprise:** GitHub's metadata includes an optional Enterprise dependency without a unique canonical plugin mapping. No Enterprise operation was requested or tested; this is not an established cause of the ordinary GitHub connector failure.
- **Skill/template packages:** they do not necessarily expose a remote service operation suitable for a health check. Their complete task workflows were not exercised.
- **Read-only success:** a successful listing or metadata call does not verify write operations, deployment, generation, or every permission boundary.

## Recommended next steps

1. **Codex Security:** update/repair Codex's bundled runtime, or configure the Codex launch environment's `PYTHON` variable to a working Python 3 executable. The verified project path is `C:\Users\user\Desktop\AMES with ML\.venv312\Scripts\python.exe`; a stable interpreter outside a project environment may be preferable for long-term use. Fully restart Codex, then test the helper and an explicitly requested scan. The project environment must remain present if that path is used.
2. **GitHub and WoWSQL:** restart Codex and open a fresh session, then retry the failed read-only operations. If they persist, inspect/reconnect the affected integrations and provide the exact errors to support. These are troubleshooting steps, not guaranteed fixes; do not reset repository permissions based solely on an `Unknown tool` error.
3. **SonarQube:** perform its integration/setup workflow when installation and authentication are authorized, then verify CLI availability and authenticated project access.
4. **Vercel:** inspect whether its bundled MCP server is enabled, complete any required connection flow, and verify that account/project read tools become available. CLI setup is an alternative when intentionally chosen; it was not performed here.
5. **Retest:** repeat the same read-only probes after repairs. Run writes, deployments, database changes, or generation only when specifically requested.

Official background: [OpenAI plugin troubleshooting](https://developers.openai.com/plugins/deploy/troubleshooting) and [plugin packaging and local loading](https://developers.openai.com/plugins/build/plugins). The specific failures above come from observed local/tool results; the documentation does not establish their connector-side root cause.

## Changes made

**Only this Markdown report was added for this request.** No application files, existing audit reports, secrets, plugin settings, permissions, installations, Git history, websites, databases, or pets were changed.
