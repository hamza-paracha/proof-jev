import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { changeFixture } from "./helpers/change-fixture.ts";

it("code-only MCP rejects browser calls and preserves schema validation, concurrency and cancellation", async () => {
  const output = await mkdtemp(join(tmpdir(), "proof-code-mcp-"));
  const fixture = await changeFixture();
  const client = new Client({ name: "code-verification-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [resolve("bin/vouch.mjs"), "--stdio"],
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", VERIFY_OUTPUT_DIR: output,
      VOUCH_PROJECT_ROOT: fixture.root, VOUCH_ALLOW_EXECUTION: "1",
      // Browser installation and obsolete routing settings cannot affect code verification.
      PLAYWRIGHT_BROWSERS_PATH: join(output, "no-browser"), VERIFY_MODEL_MAX_CALLS: "invalid" },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk; });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(t => t.name), ["get_setup_status", "analyze_change", "verify_change", "review_change", "assess_pr", "check_file", "task_event", "task_hook"]);
    const setup = (await client.callTool({ name: "get_setup_status", arguments: {} })).structuredContent as any;
    assert.equal("browser" in setup.capabilities, false);
    assert.equal(setup.capabilities.analysis.ready, true);
    for (const name of ["inspect_page", "verify_workflow"]) {
      const removed = await client.callTool({ name, arguments: {} });
      assert.equal(removed.isError, true);
    }
    const bad = await client.callTool({ name: "verify_change", arguments: { confirmCodeExecution: false } });
    assert.equal(bad.isError, true);
    const analysis = await client.callTool({ name: "analyze_change", arguments: { base: "HEAD" } });
    assert.notEqual(analysis.isError, true, JSON.stringify(analysis));
    assert.ok(JSON.stringify(analysis.structuredContent).includes("shipping"));
    await writeFile(join(fixture.root, "vouch.config.json"), JSON.stringify({
      testCommand: ["node", "-e", "setTimeout(() => {}, 20000)"], commandTimeoutMs: 30000, totalTimeoutMs: 60000,
    }));
    const abort = new AbortController();
    const slow = client.callTool({ name: "verify_change", arguments: { confirmCodeExecution: true } }, undefined, { signal: abort.signal });
    for (let i = 0; i < 100 && (await readdir(output)).length === 0; i++) await delay(20);
    assert.ok((await readdir(output)).length > 0, "Mutation run must start before checking concurrency");
    const busy = await client.callTool({ name: "analyze_change", arguments: {} });
    assert.equal(busy.isError, true);
    assert.match(JSON.stringify(busy), /already running/);
    for (const request of [
      { name: "task_event", arguments: { event: { type: "start", request: "Do not overlap the current verification" } } },
      { name: "review_change", arguments: { base: "HEAD" } },
    ]) {
      const sharedBusy = await client.callTool(request);
      assert.equal(sharedBusy.isError, true);
      assert.match(JSON.stringify(sharedBusy), /already running/);
    }
    const cancelled = assert.rejects(slow);
    abort.abort();
    await cancelled;
    let statuses: string[] = [];
    for (let i = 0; i < 100; i++) {
      statuses = await Promise.all((await readdir(output)).map(async dir => {
        try { return JSON.parse(await readFile(join(output, dir, "report.json"), "utf8")).status as string; } catch { return "pending"; }
      }));
      if (statuses.includes("cancelled")) break;
      await delay(20);
    }
    assert.ok(statuses.includes("cancelled"), JSON.stringify(statuses));
    const recovered = await client.callTool({ name: "analyze_change", arguments: {} });
    assert.notEqual(recovered.isError, true, JSON.stringify(recovered));
    assert.equal(stderr, "", "stdio logs must not pollute the protocol or expose secrets");
  } finally { await client.close(); await fixture.close(); await rm(output, { recursive: true, force: true }); }
});
