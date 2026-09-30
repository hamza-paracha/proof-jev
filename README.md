# Proof-Jev

**Find bugs inside code changes and expose tests that miss them.**

Proof-Jev reads your Git diff, traces changed JavaScript/TypeScript functions to affected tests, and challenges those tests with deliberate faults. Optional Jev review adds structured judgments about validation, error handling, side effects, and missing tests.

The plugin and CLI focus on source code. They have no browser tools, Playwright dependency, or running-app requirement. Models are off by default.

## Run alongside your coding agent

The task loop captures the original request, checks edits, and returns evidence before the host declares completion. Use the `task_event` MCP tool, a JSON Lines sidecar, or the included Node harness adapter:

```sh
node bin/vouch.mjs loop --project /path/to/repo --watch --allow-exec
```

In local Codex sessions, bundled hooks forward the prompt, edit checkpoints, and completion request after the user trusts them through `/hooks`. They feed findings back and can request one repair continuation before reporting unresolved verification. Other harnesses can forward the same lifecycle events through the portable adapter and decide how to handle its completion verdict. Named acceptance checks link test evidence to requirements; missing or stale evidence stays unverified. The watcher never runs tests automatically, jobs run one at a time, and final mutation checks default to three candidates. Jev review can compare the diff with the original request when explicitly enabled.

[Harness integration, protocol, and resource limits](docs/task-loop.md). The plugin bundles Codex hooks; Codex requires review and trust before running them.

## Start with passing tests. Find what they miss.

A shipping function changes its free-shipping threshold from `> 50` to `>= 50`. Tests at 20 and 80 still pass, but never check 50 or invalid inputs.

Proof-Jev makes small changes in disposable copies and runs the configured tests:

| Deliberate fault | Weak tests | Tests with boundary and error assertions |
| --- | --- | --- |
| Change `>= 50` back to `> 50` | Missed | Caught |
| Reject zero as an invalid total | Missed | Caught |
| Remove negative-total validation | Missed | Caught |

Every surviving fault comes with its exact patch, source location, command results, and a test suggestion to investigate against the intended behavior.

```sh
npm ci
npm run verify:change-demo
```

The demo creates a disposable repository and checks the same three mutations before and after adding explicit assertions. It needs Node.js 22+, npm, and Git. No API key is needed.

## Check your repository

```sh
# Read the diff, identify affected tests, and propose mutations
node bin/vouch.mjs analyze --project /path/to/repo --base HEAD
```

`HEAD` includes staged, unstaged, and untracked changes. To check committed work, select the commit before the change.

For mutation execution, add `vouch.config.json` to the target repository using its actual test command:

```json
{
  "testCommand": ["npm", "test"],
  "maxMutants": 8,
  "commandTimeoutMs": 15000,
  "totalTimeoutMs": 180000
}
```

```sh
node bin/vouch.mjs verify-change --project /path/to/repo --base HEAD --allow-exec
```

Tests run against disposable snapshots. Baselines must pass, detected mutations are rerun, and reports distinguish surviving, detected, invalid, inconclusive, and untested candidates. [Configuration and limits](docs/code-verification.md).

## Use the plugin

```sh
npm run plugin:build
npm run verify:plugin
```

Install `out/plugin/proof-jev` through your local Codex marketplace, or load it with Claude Code:

```sh
claude --plugin-dir /absolute/path/to/proof-jev/out/plugin/proof-jev
```

Open the application repository before starting the host. The plugin discovers its Git root and provides three workflows: **set up Proof-Jev**, **review changes**, and **check tests**.

> Check whether my tests would catch bugs in this change. Inspect the diff, investigate surviving mutations against the requirements, and add focused regression tests for real gaps.

[Plugin setup and migration](docs/plugin.md).

| Tool | Purpose |
| --- | --- |
| `get_setup_status` | Check project, mutation execution, and optional Jev review readiness |
| `analyze_change` | Identify changed functions, affected tests, and candidate faults |
| `verify_change` | Run configured tests against bounded mutations and return exact evidence |
| `review_change` | Review changed files with Jev |
| `check_file` | Review one changed file |
| `assess_pr` | Review local changes and assess their overall scope |
| `task_event` | Track a task, check edit checkpoints, and gate completion on current evidence |
| `task_hook` | Receive automatic Codex lifecycle events and return host-native feedback |

To register the server directly, configure `VOUCH_PROJECT_ROOT` for the target repository and use `node /absolute/path/to/proof-jev/bin/vouch.mjs --stdio`. Mutation execution also requires `VOUCH_ALLOW_EXECUTION=1` and a valid test configuration.

## Optional Jev review

Jev reviews diffs for breaking behavior, risk, validation, error handling, side effects, and missing tests. Its findings include uncertainty and source evidence for an agent to investigate. Provider access and persistent budgets must be explicitly configured. [Review setup and semantics](docs/structured-review.md).

The included evaluation replays recorded responses for eight labelled synthetic cases without provider calls:

```sh
npm run review:eval -- --responses evals/review/recorded-jev-1.13.0.json
```

This small evaluation does not establish accuracy on real repositories. [Evaluation method](docs/review-evaluation.md).

## Scope

Mutation analysis supports JavaScript/TypeScript and statically resolvable local imports. Alias-heavy frameworks, dynamic loading, and other languages require additional work. A surviving mutation is a question to investigate: it can indicate a missing assertion, equivalent behavior, or unreachable code.

Execution requires a trusted repository. Disposable copies isolate edits but are not an operating-system sandbox. Passing the sampled checks does not establish whole-program correctness.

Existing `vouch`, `vouch-jev`, and Guard command aliases and `vouch.config.json` remain supported. Install only the Proof-Jev plugin. The source tree and distribution contain only the code-analysis, review, and mutation-testing product.

## Development

```sh
npm run typecheck
npm test
npm run verify:change-demo
npm run verify:install
npm run plugin:build
npm run verify:plugin
```

The complete test suite exercises the code product with models disabled. Real repository validation exposed five missing regression checks in Proof-Jev’s own production changes; added tests improved detection from 20 to 25 of the same 29 sampled mutations. See [the measured results and remaining limitations](docs/validation.md). [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [MIT license](LICENSE).
