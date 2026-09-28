---
name: setup-proof
description: Set up Proof-Jev in the current project or diagnose missing browser, code analysis, mutation testing, or Jev review capabilities. Use when the user asks to connect, configure, or troubleshoot the plugin.
---

Call `get_setup_status` first. Explain which checks are available now and fix the missing pieces needed for the user's task. Do not treat optional Jev review being disabled as a broken installation.

The plugin launcher discovers a Git project from the host's working directory. If that is unavailable or wrong, configure an explicit `VOUCH_PROJECT_ROOT` in the host's MCP environment and restart that server. Do not choose an unrelated repository. Review can use a separate `JEV_GUARD_PROJECT_ROOT`.

For mutation testing, inspect the project's documented tests and package scripts before creating `vouch.config.json`. Preserve existing configuration. The `testCommand` is an argument array, not a shell string. A Node example is `{ "testCommand": ["node", "--test", "test/example.test.mjs"], "maxMutants": 8 }`; use the actual project's command. Execution also needs operator `VOUCH_ALLOW_EXECUTION=1` and per-call `confirmCodeExecution: true`. Do not enable execution for an untrusted project.

For browser work, Chromium must be installed on this machine. The app must run on an explicit loopback port with disposable data. For provider review, follow [review setup](../../docs/structured-review.md); do not invent credentials, reset ledgers, or raise existing budgets.

Call `get_setup_status` again after configuration/restart, then run the relevant check. Report what is ready and what remains unavailable. Keep the explanation short; never present setup readiness as passing application tests.
