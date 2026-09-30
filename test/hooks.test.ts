import assert from "node:assert/strict";
import { it } from "node:test";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { TaskLoop } from "../src/loop/engine.ts";
import { CodexHooks } from "../src/loop/hooks.ts";
import { changeFixture } from "./helpers/change-fixture.ts";

const event = (hook_event_name: string, extra = {}) => ({ hook_event_name, session_id: "s1", turn_id: "t1", ...extra });
it("automatic hooks leave unchanged conversations alone and return edit evidence without executing tests", async () => {
  const f = await changeFixture();
  try {
    const loop = new TaskLoop({ projectRoot: f.root, outputDir: join(f.root, "out") });
    const hooks = new CodexHooks(loop, true, false, 0);
    const started = await hooks.handle(event("UserPromptSubmit", { prompt: "Fix the shipping threshold" }));
    assert.match(started.hookSpecificOutput!.additionalContext, /automatically tracks/);
    assert.deepEqual(await hooks.handle(event("PostToolUse")), {});
    assert.deepEqual(await hooks.handle(event("Stop")), {}, "Existing dirty code alone must not trigger a check on a chat-only turn");
    await writeFile(join(f.root, "src/pricing.mjs"), (await readFile(join(f.root, "src/pricing.mjs"), "utf8")).replace(">= 50", ">= 60"));
    const edited = await hooks.handle(event("PostToolUse"));
    assert.match(edited.hookSpecificOutput!.additionalContext, /No tests ran/);
    const stop = await hooks.handle(event("Stop"));
    assert.equal(stop.decision, "block");
    assert.match(stop.reason!, /incomplete/);
    await hooks.handle(event("UserPromptSubmit", { prompt: stop.reason, turn_id: "continuation" }));
    assert.equal((await loop.handle({ type: "status" })).request, "Fix the shipping threshold", "A stop continuation must retain the original task");
    const secondStop = await hooks.handle(event("Stop", { stop_hook_active: true }));
    assert.equal(secondStop.decision, undefined);
    assert.match(secondStop.systemMessage!, /continuation limit/);
    assert.equal((await hooks.handle(event("Stop"))).decision, undefined, "Even a missing host continuation flag cannot create an infinite loop");
  } finally { await f.close(); }
});

it("automatic completion runs the configured checks and requirements can be mapped without resetting the task", async () => {
  const f = await changeFixture();
  try {
    const config = JSON.parse(await readFile(join(f.root, "vouch.config.json"), "utf8"));
    config.acceptanceChecks = { boundary: ["node", "--input-type=module", "-e", "import assert from 'node:assert/strict'; import {shipping} from './src/pricing.mjs'; assert.equal(shipping(50), 0)"] };
    await writeFile(join(f.root, "vouch.config.json"), JSON.stringify(config));
    const loop = new TaskLoop({ projectRoot: f.root, outputDir: join(f.root, "out"), allowExecution: true, maxMutants: 0 });
    const hooks = new CodexHooks(loop, true, true, 0);
    await hooks.handle(event("UserPromptSubmit", { prompt: "Protect the threshold" }));
    const before = await loop.handle({ type: "status" });
    const mapped = await loop.handle({ type: "requirements", requirements: [{ id: "boundary", description: "50 ships free", check: "boundary" }] });
    assert.equal(mapped.taskId, before.taskId); assert.equal(mapped.initialSnapshotHash, before.initialSnapshotHash);
    await writeFile(join(f.root, "src/pricing.mjs"), (await readFile(join(f.root, "src/pricing.mjs"), "utf8")) + "// Document the threshold.\n");
    const stop = await hooks.handle(event("Stop"));
    assert.equal(stop.decision, undefined, JSON.stringify(stop));
    assert.match(stop.systemMessage!, /configured checks passed/);
    assert.equal((await loop.handle({ type: "status" })).feedback?.requirements[0]?.status, "check_passed");
    await assert.rejects(loop.handle({ type: "requirements", requirements: [{ id: "bad", description: "bad", check: "missing" }] }), /unknown configured/);
  } finally { await f.close(); }
});

it("missing prompts, unavailable projects, and interruptions cannot claim successful automatic verification", async () => {
  const f = await changeFixture();
  try {
    const loop = new TaskLoop({ projectRoot: f.root, outputDir: join(f.root, "out") });
    const hooks = new CodexHooks(loop, true, false);
    assert.match((await hooks.handle(event("Stop"))).systemMessage!, /did not receive/);
    await hooks.handle(event("UserPromptSubmit", { prompt: "Fix code" }));
    await hooks.handle(event("Interrupt"));
    assert.equal((await loop.handle({ type: "status" })).phase, "cancelled");
    assert.deepEqual(await hooks.handle(event("Stop")), {});
    const unavailable = new CodexHooks(new TaskLoop({}), false, false);
    assert.match((await unavailable.handle(event("UserPromptSubmit", { prompt: "hello" }))).hookSpecificOutput!.additionalContext, /No verification is active/);
    assert.deepEqual(await unavailable.handle(event("Stop")), {});
  } finally { await f.close(); }
});
