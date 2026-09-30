import assert from "node:assert/strict";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { changeFixture } from "../test/helpers/change-fixture.ts";

const plugin = resolve(process.argv[2] ?? "out/plugin/proof-jev");
const manifest = JSON.parse(await readFile(resolve(plugin,".mcp.json"),"utf8"));
const spec = manifest.mcpServers['proof-jev'];
const pluginManifest = JSON.parse(await readFile(resolve(plugin, ".codex-plugin/plugin.json"), "utf8"));
const bundledHooks = JSON.parse(await readFile(resolve(plugin, pluginManifest.hooks), "utf8"));
assert.deepEqual(Object.keys(bundledHooks.hooks), ["UserPromptSubmit", "PostToolUse", "Stop", "Interrupt"]);
const fixture = await changeFixture();
try {
  assert.equal(existsSync(resolve(plugin, "node_modules/playwright")), false);
  assert.equal(existsSync(resolve(plugin, "src/verify/runtime.ts")), false);
  assert.equal(existsSync(resolve(plugin, "skills/verify-local-app")), false);
  for (const cwd of [fixture.root,plugin]) {
    const client = new Client({name:"plugin-install-check",version:"1"});
    try {
      await client.connect(new StdioClientTransport({command:process.execPath,args:spec.args.map((a:string)=>a.replace('${CLAUDE_PLUGIN_ROOT}',plugin)),cwd,env:{PATH:process.env.PATH??"",HOME:process.env.HOME??""},stderr:"pipe"}));
      assert.deepEqual((await client.listTools()).tools.map(t => t.name), ["get_setup_status", "analyze_change", "verify_change", "review_change", "assess_pr", "check_file", "task_event", "task_hook"]);
      const status = (await client.callTool({name:"get_setup_status",arguments:{}})).structuredContent as any;
      assert.equal(status.capabilities.analysis.ready,cwd===fixture.root);
      assert.equal(status.capabilities.mutation.ready,false);
      assert.equal(status.capabilities.review.ready,false);
      assert.equal("browser" in status.capabilities, false);
      if(cwd===fixture.root) {
        const analysis = await client.callTool({name:"analyze_change",arguments:{base:"HEAD"}});
        assert.notEqual(analysis.isError,true,JSON.stringify(analysis));
        assert.ok(JSON.stringify(analysis.structuredContent).includes("shipping"));
        const prompt = await client.callTool({ name: "task_hook", arguments: { hook_event_name: "UserPromptSubmit", session_id: "installed-hook-check", prompt: "Check the threshold" } });
        assert.notEqual(prompt.isError, true, JSON.stringify(prompt));
        const stop = await client.callTool({ name: "task_hook", arguments: { hook_event_name: "Stop", session_id: "installed-hook-check", stop_hook_active: false } });
        assert.deepEqual(stop.structuredContent, {}, "Unchanged turns must skip automatic checks");
      } else assert.equal(status.project.path,null);
    } finally {await client.close();}
  }
  const codexConfig = JSON.parse(await readFile(resolve(plugin, pluginManifest.mcpServers), "utf8"));
  const codexSpec = codexConfig.mcpServers["proof-jev"];
  const native = new Client({ name: "codex-manifest-check", version: "1" });
  try {
    // Exercise Codex's literal args and plugin-relative cwd, without substituting
    // Claude variables in the verifier. The host event supplies the project.
    await native.connect(new StdioClientTransport({ command: codexSpec.command, args: codexSpec.args,
      cwd: resolve(plugin, codexSpec.cwd), env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" }, stderr: "pipe" }));
    const before = (await native.callTool({ name: "get_setup_status", arguments: {} })).structuredContent as any;
    assert.equal(before.project.path, null);
    const prompt = await native.callTool({ name: "task_hook", arguments: { hook_event_name: "UserPromptSubmit", session_id: "codex-native", cwd: fixture.root, prompt: "Check the shipping threshold" } });
    assert.match(JSON.stringify(prompt.structuredContent), /automatically tracks/);
    const after = (await native.callTool({ name: "get_setup_status", arguments: {} })).structuredContent as any;
    assert.equal(after.capabilities.analysis.ready, true);
    assert.equal(after.capabilities.mutation.ready, false);
    const analysis = await native.callTool({ name: "analyze_change", arguments: {} });
    assert.notEqual(analysis.isError, true, JSON.stringify(analysis));
    assert.ok(JSON.stringify(analysis.structuredContent).includes("shipping"));
    const mismatch = await native.callTool({ name: "task_hook", arguments: { hook_event_name: "UserPromptSubmit", session_id: "codex-native", cwd: plugin, prompt: "Different workspace" } });
    assert.match(JSON.stringify(mismatch.structuredContent), /could not bind/);
    const skipped = await native.callTool({ name: "task_hook", arguments: { hook_event_name: "Stop", session_id: "codex-native" } });
    assert.deepEqual(skipped.structuredContent, {}, "A mismatched prompt must not verify the old task");
    const recovered = await native.callTool({ name: "task_hook", arguments: { hook_event_name: "UserPromptSubmit", session_id: "codex-native", cwd: fixture.root, prompt: "Return to the configured project" } });
    assert.match(JSON.stringify(recovered.structuredContent), /automatically tracks/);
  } finally { await native.close(); }
  const { createProofClient } = await import(pathToFileURL(resolve(plugin, "bin/harness-client.mjs")).href);
  const portable = createProofClient({ project: fixture.root, watch: false });
  try {
    await portable.send({ type: "start", request: "Check the shipping threshold" });
    const checked = await portable.send({ type: "checkpoint" });
    assert.ok(checked.feedback.affectedTests.includes("test/pricing.test.mjs"));
    assert.equal((await portable.send({ type: "complete" })).feedback.decision, "incomplete");
  } finally { await portable.close(); }
  console.log(JSON.stringify({manifestLaunch:true,codexLiteralLaunch:true,projectDiscovered:true,pluginDirectoryNotSelected:true,tools:8,automaticHooks:4,portableLifecycle:true,browserDependency:false,executionEnabled:false,modelCalls:0}));
} finally {await fixture.close();}
