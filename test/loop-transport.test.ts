import assert from "node:assert/strict";
import { it } from "node:test";
import { join, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createProofClient } from "../bin/harness-client.mjs";
import { changeFixture } from "./helpers/change-fixture.ts";

it("the portable Node adapter sends lifecycle events through the actual JSONL CLI", async () => {
  const f = await changeFixture();
  const proof = createProofClient({ project: f.root, watch: false });
  try {
    const started = await proof.send({ type: "start", request: "Make shipping free at exactly 50" });
    assert.equal(started.execution, false);
    const checkpoint = await proof.send({ type: "checkpoint" });
    assert.ok(checkpoint.feedback?.affectedTests.includes("test/pricing.test.mjs"));
    assert.equal((await proof.send({ type: "complete" })).feedback?.decision, "incomplete");
    assert.equal((await proof.send({ type: "cancel" })).phase, "cancelled");
    await assert.rejects(proof.send({ type: "checkpoint" }), /cancelled/);
  } finally { await proof.close(); await f.close(); }
});

it("MCP exposes the same lifecycle and rejects commands supplied through task events", async () => {
  const f = await changeFixture();
  const client = new Client({ name: "task-loop-test", version: "1" });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: [resolve("bin/vouch.mjs"), "--stdio"], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "",
        VOUCH_PROJECT_ROOT: f.root, VERIFY_OUTPUT_DIR: join(f.root, "out") }, stderr: "pipe" }));
    const started = await client.callTool({ name: "task_event", arguments: { event: { type: "start", request: "Fix the threshold" } } });
    assert.notEqual(started.isError, true, JSON.stringify(started));
    const result = await client.callTool({ name: "task_event", arguments: { event: { type: "complete" } } });
    assert.equal((result.structuredContent as any).feedback.decision, "incomplete");
    const schemaRejected = await client.callTool({ name: "task_event", arguments: { event: { type: "start", request: "bad", command: ["echo", "bad"] } } });
    assert.equal(schemaRejected.isError, true);
  } finally { await client.close(); await f.close(); }
});

it("bundled Codex hooks call the real MCP adapter and return host-native completion feedback", async () => {
  const f = await changeFixture();
  const client = new Client({ name: "automatic-hook-test", version: "1" });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve("bin/vouch.mjs"), "--stdio"],
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", VOUCH_PROJECT_ROOT: f.root, VERIFY_OUTPUT_DIR: join(f.root, "out") }, stderr: "pipe" }));
    const hooks = JSON.parse(await readFile("plugins/proof-jev/hooks/codex.json", "utf8")).hooks;
    const call = async (name: string, extra = {}) => {
      const definition = hooks[name][0].hooks[0];
      assert.equal(definition.type, "mcp_tool"); assert.equal(definition.server, "proof-jev");
      const input: Record<string, unknown> = { session_id: "session", turn_id: "turn", cwd: f.root, ...extra };
      const args = Object.fromEntries(Object.entries(definition.input).map(([key, value]) => [key,
        typeof value === "string" && value.startsWith("${") ? input[value.slice(2, -1)] : value]));
      const response = await client.callTool({ name: definition.tool, arguments: args });
      assert.notEqual(response.isError, true, JSON.stringify(response));
      assert.deepEqual(JSON.parse((response.content as any)[0].text), response.structuredContent);
      return response.structuredContent as any;
    };
    await call("UserPromptSubmit", { prompt: "Improve shipping" });
    await writeFile(join(f.root, "src/pricing.mjs"), (await readFile(join(f.root, "src/pricing.mjs"), "utf8")) + "// New edit\n");
    assert.equal((await call("PostToolUse")).hookSpecificOutput.hookEventName, "PostToolUse");
    const stop = await call("Stop", { stop_hook_active: false });
    assert.equal(stop.decision, "block");
    await call("UserPromptSubmit", { prompt: stop.reason });
    assert.equal((await call("Stop", { stop_hook_active: true })).decision, undefined);
    await call("Interrupt");
    const status = await client.callTool({ name: "task_event", arguments: { event: { type: "status" } } });
    assert.equal((status.structuredContent as any).phase, "cancelled");
  } finally { await client.close(); await f.close(); }
});
