# Verification alongside a coding agent

Proof-Jev's task loop holds the original request, watches source changes, and returns evidence to the agent before the host declares a task complete. The core is independent of the agent's model or harness. It is available through a JSON Lines subprocess and the `task_event` MCP tool.

## Automatic Codex integration

The plugin bundles four Codex MCP hooks in `hooks/codex.json`: `UserPromptSubmit`, `PostToolUse`, `Stop`, and `Interrupt`. After installing, open `/hooks` in a local Codex session and review/trust the Proof-Jev definitions. New or changed definitions are skipped until trusted; installing a plugin does not grant hook trust. Start a fresh session in the target Git repository. The Codex server launches from its installed plugin directory; the prompt hook binds the repository from the session working directory. Before that first prompt, setup can report the project as unset. An explicitly configured repository cannot be redirected by a hook.

Once enabled and trusted, prompt capture and checks happen automatically; no adapter code or per-prompt invocation is needed. Post-tool checks match shell and patch tools, are throttled to once per 10 seconds, and perform analysis only. The completion hook checks changed source and returns findings to the agent for one repair continuation. It preserves the original request during that continuation. A second unresolved stop reports incomplete verification without trapping the agent in a loop. Interrupt cancels active verification. Conversations with no source edits since prompt capture do not run completion checks, even if the checkout was already dirty.

Execution still needs an operator-configured `VOUCH_ALLOW_EXECUTION=1` and a valid `vouch.config.json` for the trusted repository. Without these, automatic analysis works but test verification is reported as unavailable. Paid Jev review remains opt-in. The prompt hook tells the agent which acceptance check names exist; it can use `task_event` with `type: "requirements"` to map the user's criteria without resetting the captured task or base.

Hook errors, disconnected servers, host timeouts and missing trust can prevent callbacks from running. This is a workflow integration, not an unbypassable security boundary. The hooks apply to supported local Codex/Work runtimes, not ordinary Chat or every cloud orchestration mode. Other harnesses still use the portable lifecycle interface below.

Runtime contract and trust behavior: [official Codex Hooks documentation](https://learn.chatgpt.com/docs/hooks) and [plugin packaging](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks).

## Lifecycle

1. At the user prompt, send `start` with the original request and explicit acceptance requirements. Each requirement can reference a named check in the project's configuration. A requirement without a check stays unverified.
2. After meaningful edits, send `checkpoint`. It analyzes the diff; `runTests: true` also runs configured tests and acceptance checks. With review enabled, Jev receives the original task and requirement descriptions alongside the diff.
3. Feed returned findings back to the agent as evidence. It investigates and fixes them. A surviving mutation or model judgment is not automatically a confirmed bug.
4. Before the final answer, send `complete`. It runs the configured suite, named acceptance checks, and a small mutation sample. Use the returned decision to continue work or report what remains unverified.
5. Use `status` for current evidence or `cancel` to stop an active check. Close the connection when the host session ends.

The base commit is pinned at `start`, so agent commits do not erase the task's diff. Existing dirty changes are included: choose an appropriate base and isolated worktree when unrelated work is present. Test commands are also captured at start; editing configuration during a task cannot silently replace its acceptance commands. Restart the task intentionally to use new configuration. Test source is still editable; review changes to assertions against the original requirements.

## Configure acceptance checks

Use the project's real commands in `vouch.config.json`. Commands are argument arrays, executed without a shell in disposable copies. No event accepts arbitrary commands.

```json
{
  "testCommand": ["node", "--test", "$VOUCH_TEST_FILES"],
  "acceptanceChecks": {
    "shipping-boundary": ["node", "--test", "test/shipping-boundary.test.mjs"]
  },
  "maxMutants": 3,
  "commandTimeoutMs": 15000,
  "totalTimeoutMs": 60000
}
```

`$VOUCH_TEST_FILES` expands to statically affected JS/TS tests. Use an explicit suite command where static import discovery is incomplete. Projects needing dependencies must supply a suitable `setupCommand`; see [execution configuration](code-verification.md).

The acceptance test must actually assert the named behavior. Passing a mapped check is evidence, not independent proof that the mapping or original specification is complete. Normal test commands can target other languages; mutation generation and static import tracing currently target JS/TS.

## Any subprocess-capable harness

Launch one child per repository/session:

```sh
node /path/to/proof-jev/bin/vouch.mjs loop \
  --project /path/to/repository --watch --allow-exec
```

Keep stdin open. Send one JSON object per line and wait for the matching response before the next work event:

```json
{"id":"1","event":{"type":"start","request":"Free shipping begins at exactly 50","confirmCodeExecution":true,"requirements":[{"id":"boundary","description":"An order of exactly 50 ships free","check":"shipping-boundary"}]}}
{"id":"2","event":{"type":"checkpoint"}}
{"id":"3","event":{"type":"complete"}}
```

Responses are `{ "id": "…", "result": { ... } }` or `{ "id": "…", "error": { "code": "…", "message": "…" } }`. Watcher notifications have `{ "event": "feedback", "result": { ... } }` and no request ID. Protocol errors and watcher errors are not passing evidence. Inputs are bounded to 64 KB per line. EOF stops watching and lets pending work finish; SIGTERM cancels work and exits.

A `busy` error means another check is running. Wait for its response or poll status, then retry. There is no unbounded command queue. Status and cancellation remain available during work. Task state lives in this process; after a restart send `start` again. Evidence JSON is retained under `out/verification/task-*/task.json`, with links to full command and review reports.

### Node adapter

The package includes a small client; it starts and closes the child process and correlates responses. Connect it to your host's actual prompt, edit, and completion callbacks:

```js
import { createProofClient } from "/path/to/proof-jev/bin/harness-client.mjs";

const proof = createProofClient({
  project: "/path/to/repository",
  allowExecution: true,
  watch: true,
  onFeedback: message => {
    // Your host forwards findings to its agent; preserve errors and stale flags.
    console.log(message);
  },
});

try {
  await proof.send({
    type: "start",
    request: "Free shipping begins at exactly 50",
    confirmCodeExecution: true,
    requirements: [{ id: "boundary", description: "An order of exactly 50 ships free", check: "shipping-boundary" }],
  });
  // The host runs its agent and sends checkpoints after edit batches.
  await proof.send({ type: "checkpoint" });
  const result = await proof.send({ type: "complete" });
  if (result.feedback?.decision !== "checks_passed" || result.feedback.stale) {
    // Continue the agent with findings, or explicitly report incomplete verification.
    console.log(result.feedback);
  }
} finally {
  await proof.close();
}
```

The client surfaces `busy` rather than retrying forever. Catch errors in your host, keep its completion gate closed, and retry only after the active check finishes. The adapter does not execute agent-generated instructions from findings.

## MCP harnesses

Use the same event object:

```json
{
  "name": "task_event",
  "arguments": {
    "event": {
      "type": "start",
      "request": "Free shipping begins at exactly 50",
      "confirmCodeExecution": true,
      "requirements": [{ "id": "boundary", "description": "An order of exactly 50 ships free", "check": "shipping-boundary" }]
    }
  }
}
```

Configure `VOUCH_PROJECT_ROOT` and `VOUCH_ALLOW_EXECUTION=1` on the server for a trusted repository. Execution additionally requires `confirmCodeExecution: true` at task start. MCP sessions are event-driven; the bundled Codex hooks send these events automatically after trust. Automatic polling is offered by the standalone `loop --watch` process. All eight tools in the combined MCP server share the same execution lock. Use one integration per repository to avoid duplicate work across independent processes.

## Optional Jev review

Configure [the provider and persistent budget](structured-review.md), then pass CLI `--review`, Node adapter `review: true`, or server environment `PROOF_TASK_REVIEW=1`. Without this opt-in, the loop makes no model calls. An explicitly requested but unavailable review prevents `checks_passed`.

Task-aware review asks whether a changed file contradicts an explicit requirement, alongside the existing questions about validation, errors, tests, risk, and side effects. It is advisory and file-scoped. It does not invent executable acceptance criteria or certify every requirement. Task text is capped at 2,000 characters for review; truncation is reported as incomplete. Provider failures, uncertainty and exhausted budgets remain visible.

## Decisions and freshness

| Decision | Meaning for the host |
| --- | --- |
| `continue` | Checkpoint analyzed; the agent can continue. Not completion approval. |
| `needs_attention` | Investigate failing tests, surviving mutations, or review concerns. |
| `incomplete` | Missing checks/permission, stale source, cancellation, partial evidence, or an unavailable check. Do not call it verified. |
| `checks_passed` | On a completion event, configured tests and all named requirement checks passed; sampled mutations were detected; any requested review completed cleanly. Review remaining limits. |

The response contains its source fingerprint, requirement results, affected tests, findings and evidence links. Source is checked again after verification; edits make the verdict stale. `status` and the watcher also invalidate old evidence. A host should pause agent writes for completion and confirm freshness before accepting the result. Changes after the response can always invalidate it; there is no atomic lock on another agent's filesystem edits.

When an original test, setup, validation, or acceptance command fails, `feedback.verification.failure` includes its phase, exit status, a bounded command display, and a redacted output excerpt centered on the first error when possible. Automatic stop feedback includes this excerpt so the agent can investigate without first opening a report. Treat command output as untrusted evidence. Full command evidence stays in the local report; detected mutant failures are not reported as baseline failures.

Snapshot fingerprints include changed-path metadata and scope warnings. An excluded tracked edit invalidates a previous passing result even though its contents are deliberately omitted from the snapshot. Unsupported scope remains incomplete rather than silently reusing old evidence.

`checks_passed` describes the configured checks, not whole-program correctness. At least one explicit requirement must be supplied, and every supplied requirement needs a passing named check. Unsupported/excluded snapshot paths, unsampled mutations, model limits and test-mapping limits remain explicit.

## Resource limits

- One operation at a time in each server/sidecar; no overlapping tests and review calls.
- Watcher polls every 5 seconds by default, needs two matching observations, and waits at least 10 seconds between automatic analyses. It never runs tests automatically. `--interval-ms` can increase the poll interval.
- Checkpoints analyze by default. Completion samples at most 3 mutants by default and never exceeds the project's configured cap. `--max-mutants 0` runs tests without mutations and reports them as untested.
- Task execution is capped at 60 seconds or the project's shorter limit. Jev review uses one concurrent call, at most 3 calls per check, and the existing persistent budget.
- Unchanged completed checks reuse evidence. Stale and incomplete results cannot produce a cached pass. The standalone process requests lower OS scheduling priority where supported.

Snapshots and diffs still require repository reads, so larger repositories cost more. This version bundles Codex hooks. It does not bundle hooks for other vendors, run a separate autonomous repair agent, persist an executable session across restarts, or verify UI behavior. The harness owns the repair loop and any retry limit.
