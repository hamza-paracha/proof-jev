# Proof-Jev plugin

Ask it to **“check whether my tests would catch bugs in this change”** or **“review my changes.”** Proof-Jev targets source code through three workflows: setup, code review, and test quality.

## Build and check

```sh
npm ci
npm run plugin:build
npm run verify:plugin
```

The bundle is `out/plugin/proof-jev`. It includes eight MCP tools, three skills, code-analysis and mutation runtimes, optional Jev review, and locked production dependencies. Chromium and Playwright are not required or bundled. Rebuild on another OS/architecture.

For Codex, add the built directory through your local plugin marketplace and enable Proof-Jev. For Claude Code:

```sh
claude --plugin-dir /absolute/path/to/proof-jev/out/plugin/proof-jev
```

Start the host in the application repository. Codex launches the server from the plugin directory using `.mcp.codex.json`; the prompt hook supplies the repository's working directory. The Claude-compatible launcher in `.mcp.json` discovers the Git root from the host working directory. Both honor an explicitly configured `VOUCH_PROJECT_ROOT` and refuse to treat the plugin directory as the application. Restart the server after environment changes.

## Automatic checks in Codex

The plugin includes prompt, post-edit, completion, and interrupt hooks. Open `/hooks` in a local Codex session to review and trust the Proof-Jev definitions, then start a fresh session in your Git repository. Codex deliberately skips new or changed hooks until trusted. No custom adapter is needed for supported local Codex sessions.

Analysis runs automatically after edits. Tests require the repository configuration and execution permission below; Jev review remains opt-in. Completion returns actionable findings for at most one repair continuation, then reports any unresolved verification. Chat-only turns do not run tests. See [the full lifecycle and limits](task-loop.md).

Hook trust and MCP tool approval are separate. If an unattended harness rejects a requirement-mapping call because approvals are disabled, configure the trusted tool's approval policy in that harness. For a directly configured MCP server, Codex supports `mcp_servers."proof-jev".tools.task_event.approval_mode = "approve"`; plugin-supplied servers use the installed plugin ID under `plugins`. This authorizes the lifecycle tool, which can run configured checks when execution is enabled. Scope it to trusted projects. See [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp). The native integration fixture supplies this policy only for its disposable invocation.

## First conversation

Ask **“Set up Proof-Jev for this project.”** `get_setup_status` reports readiness and the next step for each capability:

| Capability | What it needs |
| --- | --- |
| Code analysis | A configured or discovered Git repository |
| Mutation testing | `vouch.config.json` with a real test command, `VOUCH_ALLOW_EXECUTION=1`, and per-call execution confirmation |
| Jev review | Project, provider credentials, and an explicitly configured persistent budget |

Setup makes no model calls and does not execute tests. Code analysis and mutation testing need no model key. For mutation setup, use the project's existing test command; see [execution configuration](code-verification.md). For paid review, see [Jev setup](structured-review.md).

## Evidence

Reports include source locations, exact mutation patches, command outcomes, and a standalone HTML view. Investigate surviving mutations against the requirements before changing tests. Code-review judgments remain advisory.

## Upgrade from Vouch or earlier Proof-Jev

Install and enable only `proof-jev`. If the old Vouch plugin is installed in Codex, run `codex plugin remove vouch@personal` (replace `personal` with your marketplace name) and remove its catalog entry. Existing CLI aliases, environment variables, and `vouch.config.json` remain supported.

Version 0.7 adds automatic `task_hook` callbacks alongside `task_event` for the [portable task loop](task-loop.md), alongside `get_setup_status`, `analyze_change`, `verify_change`, `review_change`, `assess_pr`, and `check_file`. The browser tools and local-app skill have been removed. Refresh the installed plugin and start a fresh host session to load the new tool list.
