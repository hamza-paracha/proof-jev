# External repository checks

Run from a Proof-Jev checkout after `npm ci`:

```sh
npm run verify:external
```

The script fetches three pinned public Git revisions, installs locked test runners with lifecycle scripts disabled, and runs one disposable repository at a time. It copies each pinned Git tree, makes a probe base without the selected source module, and restores that module unchanged. This produces a full-file mutation probe rather than claiming that an upstream bug was recently introduced.

The first run uses upstream behavioral assertions unchanged. For `clsx`, the existing uvu tests use a current tsx loader because the legacy esm loader failed under Node 22. Project lint, build, audit, and publication scripts are excluded. The runner checks the expected number of passing upstream cases/assertions, so an empty green test run cannot count as evidence.

Two explicit test corrections are then checked against identical source bytes and mutation IDs:

- [isarray](isarray-test-fix.diff): the original polyfill test imports the implementation before deleting `Array.isArray`. Reloading the module after switching modes makes the existing assertions exercise the intended implementation. It catches both sampled faults instead of neither.
- [clsx](clsx-test-fix.diff): an additional assertion ensures an array does not contribute an inherited value beyond its length to the CSS class string. This catches the extra-iteration mutation that the ordinary array tests miss. It is an unusual valid input, not a claim of a common production failure.

These are test patches in temporary copies. Upstream source is never edited, and no upstream issues or PRs are created. The associated upstream MIT licenses are included beside the patches.

`is-number`'s existing 111 cases already catch all six sampled mutations, so its tests are left alone. The remaining candidate is reported as untested. `clsx` has three additional unsampled candidates.

Results and exact local command reports are written to `out/external-validation/current/`. [Recorded results](../../docs/external-validation.json) include source hashes, pinned revisions, mutation IDs, discovery before/after, and local timings. The default CI runs this check once on Node 22; it is separate from the fast unit suite and needs network access for a cold run. No paid model calls are made.

To select a case or a separate report directory:

```sh
npm run verify:external -- out/external-validation/custom clsx
```

## Native Codex lifecycle check

With Codex CLI, Python 3.11+, and the plugin already installed, enabled, and trusted in local Codex on macOS/Linux:

```sh
python3 scripts/verify-codex-hooks.py --plugin /absolute/path/to/installed/proof-jev
```

This starts a local scripted Responses provider and a disposable Git repository. The scripted agent maps one requirement, makes an incorrect edit, receives an automatic stop-hook assertion excerpt, applies a fixed repair, and completes again. The check requires a final `checks_passed` verdict against the original request. It uses temporary invocation-level MCP execution settings and explicit approval of the fixture’s `task_event` tool and does not change global configuration or bypass hook trust.

This is a deterministic integration test. It measures lifecycle transport and verification of a disclosed repair, not a model's ability to diagnose or repair arbitrary tasks. Local outputs are retained under `out/native-validation/`; the fixture process and repository are cleaned up.
