# Validation evidence

## Code product

Proof-Jev exposes eight code tools and three skills. The source tree, test suite, package, and plugin are code-only. The original code-only release passed its 40-test suite and typechecking; task-loop validation is described below. Automated checks cover Git snapshots, mutation attribution, source locations, review transport, persistent budgets, redaction, and cancellation.

`npm run verify:install` installs a fresh package outside the checkout. It checks all eight tools, confirms the absence of browser dependencies, verifies that weak tests miss mutations, and confirms that strengthened tests detect them. `npm run verify:plugin` checks the actual plugin launcher and project discovery.

## Real repository changes

`npm run verify:repository` challenges Proof-Jev's existing tests against two actual production changes from its Git history:

- Diff parsing and source-line evidence introduced in commit `763bf3d`.
- Offline evidence rendering introduced in commit `03478a7`.

The script creates disposable repositories, restores the selected file's historical before-state as the Git base, and applies the current production file. It uses the current real tests, calls analysis and mutation tools over MCP, and records exact patches, command outcomes, source hashes, and untested candidates. At most 25 mutations are sampled per case. No provider calls are made.

### Measured result for 0.5.1

| Production change | Sampled / candidates | Detected before | Detected after | Remaining |
| --- | --- | --- | --- | --- |
| Diff parser and source locations | 25 / 46 | 18 | 22 | 3 behaviorally equivalent mutations |
| Evidence report rendering | 4 / 4 | 2 | 3 | 1 section-numbering mutation |

The before/after runs used identical production source hashes and mutation IDs. Five focused regression tests now catch asymmetric missing hunk lines, trailing patch metadata handling, the exact clipping boundary, nested repository configuration, and omitted source evidence. These were test gaps in otherwise working behavior, not five existing production defects.

The three parser survivors preserve rejection behavior or change an initializer overwritten before return. The remaining rendering mutation only changes section numbering. These are reported honestly rather than forcing a perfect score with message- or formatting-specific assertions. Another 21 parser candidates were outside the bounded sample.

Inspection also reproduced and fixed a separate real setup defect: a nested directory was advertised as analysis-ready even though the tools require the Git root. A regression now checks both analysis and separately configured review roots.

[Machine-readable comparison and survivor classifications](repository-validation.json). Full local reports are generated under `out/repository-validation/`.

This is self-repository validation, not an independent multi-project benchmark. A surviving mutation requires investigation; equivalent behavior and low-impact formatting differences are distinguished from missing checks that protect product requirements.

## External repositories (0.8.0)

`npm run verify:external` runs pinned upstream source and behavioral assertions from three independent libraries, one at a time. It probes an entire selected module as a newly added file; this is not historical change attribution. Git revisions, source hashes, mutation IDs, runner details, and timings are recorded in [external-validation.json](external-validation.json).

| Repository | Original tests detect | After focused test correction | Untested candidates | Original verification time |
| --- | --- | --- | --- | --- |
| `is-number` | 6 / 6 sampled | 6 / 6; no test changes needed | 1 | 1.24 s |
| `clsx` | 5 / 6 sampled | 6 / 6 | 3 | 2.35 s |
| `isarray` | 0 / 2 sampled | 2 / 2 | 0 | 0.46 s |

The `isarray` test labeled as a polyfill check captured the native function before deleting `Array.isArray`. Reloading the module after switching modes makes its existing assertions exercise the polyfill and detect both sampled faults. In `clsx`, a focused assertion catches an inherited entry beyond an array's length being included as a CSS class by the extra-iteration mutant. That is an unusual valid input; no new assertion was added just to inspect internal loop counters or force a score.

All 14 before/after mutation IDs and production source hashes match. The source implementations are unchanged. These are confirmed gaps in tests around deliberate faults, not claims of existing production bugs. `is-number`'s upstream tests already caught every sampled fault. Four unsampled candidates remain explicit.

These runs also reproduced Proof-Jev defects: conventional test filenames were not recognized, and root directory imports were unresolved. Discovery changed from no reachable tests in all three probes to the expected upstream test files. Correctly identifying tests also prevents their assertions from being mutated as production code.

The timing measurements cover warm local verification with locked, shared test-runner dependencies; cold installation and Codex startup are excluded. `clsx` retains its uvu assertions but uses tsx instead of its legacy esm loader on Node 22. Project lint/build/audit tasks are not run. This is a small-library check, not a representative application benchmark or an autonomous repair evaluation. [Reproduction and exact test patches](../evals/external/README.md).

## Optional Jev review

The recorded eight-case synthetic review evaluation identified four regressions and four clean controls. It can be replayed without provider calls. See [methodology](review-evaluation.md) and [recorded baseline](review-quality-baseline.json).

The earlier 13-call provider smoke test checked API integration and recorded one ten-file latency measurement. See [recorded integration evidence](review-validation.json). Neither small synthetic run establishes accuracy on representative real repositories or calibrated confidence.

## Reproduce

```sh
npm ci
npm run typecheck
npm test
npm run verify:install
npm run plugin:build
npm run verify:plugin
npm run verify:repository
```

Repository validation needs a full Git checkout containing the recorded commits. Model review remains disabled unless its provider and persistent budget are explicitly configured. See [code verification boundaries](code-verification.md#boundaries).

## Task loop and hooks (0.6–0.8)

The current 56-test suite passes serially, and typechecking passes. Regression checks exercise the real task engine, JSON Lines CLI, Node adapter, and MCP lifecycle. They cover a weak-tests → targeted-fix → passing-evidence loop; pinned Git bases and command configuration; failing or unmapped acceptance requirements; stale evidence; bounded mutations; watcher stability; cancellation; shared concurrency; and task context passed to a simulated Jev adapter. Provider behavior is simulated, with no paid calls. Codex hook tests cover automatic prompt capture, completion feedback, preserving the original request through a stop continuation, a bounded continuation count, unchanged-turn suppression, cancellation, requirement mapping, and real MCP transport using the bundled manifest. These deterministic tests do not substitute for the host trust step or a live paid-model session.

The loop's completion decision is evidence for configured checks, not proof that the user's whole request has been fulfilled. See [integration and limitations](task-loop.md).

### Installed 0.7.1 and native Codex validation

The installed 0.7.1 bundle was exercised over MCP in a disposable Git repository. Weak tests missed one sampled shipping-boundary mutation; a boundary assertion detected the identical mutation. Separate lifecycle checks confirmed project binding, unchanged-turn suppression, analysis after edits, rejection of a deliberately failing baseline, preservation of the original task during continuation, acceptance of a repair, invalidation of stale passing evidence, and interrupt cancellation.

A real Codex CLI 0.159.1 session then ran with a local HTTP provider returning scripted responses. The installed plugin's trusted hooks automatically captured the prompt, analyzed an actual shell edit, ran the configured test at completion, and delivered its failing baseline to the next model request. The session made three local provider requests: edit, attempted completion, and one repair continuation. No Proof-Jev tool was manually called by the scripted agent. Test execution was enabled explicitly for that disposable fixture through the session's MCP configuration; this does not enable execution for other projects.

These checks used one local job at a time and zero paid model calls. They validate the installed engine and native hook transport with deterministic responses, not an autonomous model's ability to interpret findings or fix arbitrary code. Native interruption and a successful native repair were not exercised; those paths were checked through the installed MCP lifecycle and automated tests. [Recorded results and scope](automatic-validation.json). Raw local reports remain under `out/automatic-validation/` and are excluded from Git.

### Native repair verification (0.8.0)

The installed 0.8.0 plugin completed the full native Codex sequence: capture the original request, map its acceptance check, analyze a deliberately incorrect shell edit, send the actual failing assertion through the stop hook, and verify a scripted repair. The final decision was `checks_passed`, with the named shipping requirement passing. Five local provider requests completed with zero paid model calls.

This extends the earlier native transport check to successful repair verification. Responses and the repair are scripted; it does not measure autonomous model reasoning. The disposable invocation explicitly approves only its `task_event` tool and enables repository execution. Global configuration and installed hook trust are unchanged. Native interrupt behavior remains covered by engine tests rather than this host fixture. [Recorded result](automatic-validation.json) and [reproduction](../evals/external/README.md#native-codex-lifecycle-check).
