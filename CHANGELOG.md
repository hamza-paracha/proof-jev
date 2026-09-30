# Changelog

## 0.8.0

- Invalidate cached verification when tracked files excluded from snapshots change; scope warnings now contribute to source fingerprints.
- Resolve root directory imports and discover conventional `test.js`, `test/`, and `tests/` layouts. Test files are excluded from production mutation targets.
- Send bounded, redacted command failures directly through MCP and automatic hook feedback, with the phase, exit status, configured command, and assertion excerpt. HTML and Markdown reports include the same evidence.
- Scrub quoted credentials and private-key/token patterns from stored command output as well as model-facing excerpts.
- Add reproducible, sequential checks against pinned `is-number`, `clsx`, and `isarray` source and upstream tests, with exact mutation comparisons and focused test corrections.
- Include task-loop source in runtime fingerprints.

## 0.7.1

- Fix native Codex startup: use literal Node arguments with a plugin-relative working directory instead of a Claude-only path placeholder.
- Bind the repository from the prompt hook's working directory, preserving an explicitly configured project and invalidating mismatched hook state.
- Verify Codex's actual manifest command without synthetic path substitution.


## 0.7.0

- Bundle Codex prompt, post-tool, stop and interrupt hooks so trusted installations invoke verification automatically.
- Share hook state with task_event; map named requirements without resetting the original task or pinned base.
- Skip completion checks on unchanged conversations, throttle automatic checkpoints, and limit repair continuations to prevent endless loops.
- Return host-native context and completion feedback. Codex's hook trust requirements and runtime limitations remain explicit.


## 0.6.0

- Add a portable task lifecycle through a JSON Lines sidecar, Node client, and `task_event` MCP tool.
- Pin the task's Git base and configured commands; map acceptance requirements to named executable checks.
- Return source-bound completion evidence, invalidate stale results, and support cancellation and a debounced watcher.
- Run one verification job at a time, cap task mutations at three by default, and keep automatic watching free of test execution.
- Include original task requirements in optional Jev review. Missing evidence, provider errors, and unverified requirements cannot become a passing completion decision.


## 0.5.1 — Source cleanup and repository validation

- Removed the retired browser engine, runner, demos, deployment assets, tests, and development dependencies.
- Preserved shared budget and redaction coverage in the code-only test suite.
- Added reproducible mutation checks against historical production changes in Proof-Jev itself; five regression tests improve detection from 20 to 25 of the same 29 sampled mutations.
- Fixed setup readiness incorrectly accepting a nested repository directory for analysis or review.

## 0.5.0 — Code-only verification

- Focused the plugin and CLI on Git diffs, optional Jev code review, and mutation testing.
- Removed browser MCP tools, browser workflow commands, Chromium setup, and the local-app skill.
- Excluded browser runtimes and Playwright from the package and plugin bundle.
- Added clean-install checks for six code tools and mutation evidence without browser dependencies.

## Unreleased — Proof-Jev

- Added four focused plugin workflows, a read-only setup tool, automatic project discovery for plugin hosts, and a real manifest-launch verification check.

- Added a connected `npm run showcase` demonstration with recorded Jev review, live browser/disk checks, and identical weak/strong mutation comparisons.
- Added offline HTML evidence reports to review, browser, and mutation workflows.
- Added exact HTTP response expectations for click/choose actions, including rejection-path verification and replay preservation.
- Added showcase documentation, a measured LinkedIn launch draft, and fresh-install/CI showcase validation.

- Added exact Git line evidence to review reports and corrected new-file line counts, unusual-path handling, and Git formatting robustness.

- Renamed the project, package, MCP server, and plugin to `proof-jev`; retained existing CLI aliases and configuration.
- Removed the unused decorative hero image and made Jev’s role explicit in the text-only presentation.
- Added a labelled review evaluation suite with live, dry-run, and offline replay modes, coverage, precision/recall, false alarms, uncertainty, and probability-error metrics.
- Recorded eight real Jev responses against executable regression/control fixtures. This is a small synthetic baseline, not general accuracy evidence.

## Unreleased — vouch-jev

- Renamed the product, package and plugin to `vouch-jev`, with Jev-powered review leading the documentation.
- Added `vouch-jev` and `vouch-jev-guard` commands; preserved `vouch` and `vouch-guard` aliases and existing configuration.
- Removed the README hero image.
- Preserved a completed persisted-state mismatch when a polling retry hits its deadline; cancellation and transport errors retain their original meaning.

## 0.4.0 — Structured code review

- Added three Jev review tools, validated primitive responses, advisory confidence bands, bounded parallel calls and persistent cost reservations.
- Added a review-only CLI/MCP entry point and standalone package without browser dependencies.
- Added diff filtering, explicit missing-context reporting, source scrubbing, real MCP/provider tests and measured live smoke evidence.

## 0.3.0 — Change verification and browser foundations

- Added diff-aware JS/TS analysis, reverse-import test discovery, and bounded behavioral mutation runs in disposable repository copies.
- Added `analyze_change` and `verify_change` MCP tools and corresponding CLI commands, with baseline checks, repeated mutant failures, exact patches and local reports.
- Added HTTPS with upstream certificate validation, named cookie/localStorage session import, and URL, CSS selector and attribute assertions for multi-page same-origin flows.
- Fixed false network-settling timeouts when applications leave fetch bodies unread; genuinely streaming responses still abstain.
- Added deterministic demonstrations of weak tests surviving deliberate bugs and targeted regression tests detecting them. No model calls are required.

## 0.2.0 — Vouch alpha

- Renamed the product, CLI, MCP server and plugin to Vouch.

- Added `inspect_page` and `verify_workflow` MCP tools, plus CLI inspection and readiness checks.
- Added structured workflows, independent persisted-state assertions, evidence reports and rules-only replay files.
- Added deterministic → Jev → optional explicitly enabled stronger-model routing. All tiers share call and estimated-spend limits; provider costs remain unknown when not reported.
- Persisted paid-use reservations across restarts with a locked ledger. Tool inputs cannot raise limits or select models.
- Enforced HTTP origin and write-path restrictions at every redirect hop with a streaming proxy.
- Added candidate discovery, cancellation, deadlines, bounded state/provider responses, source fingerprints and compact MCP output.
- Added native Codex and Claude Code plugin manifests, a workflow skill and a self-contained local bundle build.
- Tested clean package installation, live Jev decisions, native client loading and a source-level persistence repair. See `docs/validation.md` for measured results and limits.

The original MIT-licensed browser-jev explorer and runner remain available.
