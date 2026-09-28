# Proof-Jev plugin

Ask it to **“check whether my tests would catch bugs in this change”**, **“review my changes”**, or **“try this form and check that it really saves.”** The plugin includes separate workflows for setup, review, test quality, and browser behavior.

## Build and check

```sh
npm ci
npx playwright install chromium
npm run plugin:build
npm run verify:plugin
```

The complete local bundle is `out/plugin/proof-jev`. It includes the runtime, locked production dependencies, docs, four skills, and Codex/Claude Code manifests. It is a current-platform bundle; rebuild on another OS/architecture. The source manifest in `plugins/proof-jev` alone is not an installable runtime.

For Codex, add the built directory through your local plugin marketplace, then enable Proof-Jev. For Claude Code, try the local bundle:

```sh
claude --plugin-dir /absolute/path/to/proof-jev/out/plugin/proof-jev
```

Start the host in the application repository. The plugin's dedicated launcher uses that working directory to discover the Git root, unless `VOUCH_PROJECT_ROOT` is explicitly configured. It refuses to infer the plugin's own directory as the application. Hosts that start MCP elsewhere need an explicit project path in their MCP environment. Restart the server after environment changes.

## First conversation

Ask **“Set up Proof-Jev for this project.”** The agent calls `get_setup_status`, which reports readiness and the next step for each capability:

| Capability | What it needs |
| --- | --- |
| Browser checks | Playwright Chromium and a disposable loopback app |
| Code analysis | A configured or discovered Git repository |
| Mutation testing | Project config with a real test command, operator `VOUCH_ALLOW_EXECUTION=1`, and per-call execution confirmation |
| Jev review | Project, provider credentials, and an explicitly configured persistent budget |

A missing Jev key does not prevent local checks. Setup never executes project code, starts the browser, makes a model call, writes configuration, or exposes API keys.

For mutation setup, the agent reads the project's existing scripts and proposes the actual test command in `vouch.config.json`. It does not guess an arbitrary command. See [execution configuration](code-verification.md). For paid review, see [Jev setup](structured-review.md).

## What you get back

A useful result starts with the bug or behavior checked and links the evidence. Reports include exact mutation patches, browser actions, observed HTTP responses, and a standalone HTML view. Expected input rejections such as HTTP 400 can be asserted explicitly. Surviving mutants need investigation; they are not automatically confirmed product defects.

The plugin provides eight MCP tools, including the read-only setup check. The standalone Guard package remains a separate three-tool review server. Changes to installed skills/tools require a fresh host session to take effect.
