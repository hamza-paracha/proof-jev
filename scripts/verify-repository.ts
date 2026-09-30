import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Exercise actual historical production changes with the current test suite.
// Only the selected source file differs from the disposable repository's base.
const exec = promisify(execFile);
const source = fileURLToPath(new URL("../", import.meta.url));
const cases = [
  { id: "diff-parser", revision: "763bf3d", file: "src/review/diff.ts", test: "test/review.test.ts", added: false },
  { id: "evidence-html", revision: "03478a7", file: "src/evidence/html.ts", test: "test/evidence-html.test.ts", added: true },
];
const output = resolve(process.argv[2] ?? "out/repository-validation/current");
const selected = process.argv[3] ? cases.filter(c => c.id === process.argv[3]) : cases;
if (!selected.length) throw new Error("Unknown validation case");
await mkdir(output, { recursive: true });
const summary: unknown[] = [];
for (const scenario of selected) {
  const root = await mkdtemp(join(tmpdir(), "proof-real-change-"));
  const directory = join(output, scenario.id);
  const client = new Client({ name: "real-repository-verification", version: "1" });
  const git = (...args: string[]) => exec("git", ["-C", root, ...args], { encoding: "utf8" });
  try {
    for (const path of ["src", "test", "bin", "package.json", "package-lock.json", "tsconfig.json", ".gitignore"])
      await cp(join(source, path), join(root, path), { recursive: true });
    const after = await readFile(join(source, scenario.file));
    const history = (await exec("git", ["-C", source, "rev-parse", scenario.revision], { encoding: "utf8" })).stdout.trim();
    const before = scenario.added ? null : (await exec("git", ["-C", source, "show", `${history}^:${scenario.file}`], { encoding: "utf8" })).stdout;
    if (before === null) await rm(join(root, scenario.file));
    else await writeFile(join(root, scenario.file), before);
    // Dependencies are shared read-only in practice; mutations only target captured source files.
    await writeFile(join(root, "vouch.config.json"), JSON.stringify({
      setupCommand: ["node", "-e", `require('node:fs').symlinkSync(${JSON.stringify(join(source, "node_modules"))},'node_modules','dir')`],
      testCommand: ["node", "--import", "tsx", "--test", scenario.test],
      maxMutants: 25, commandTimeoutMs: 15000, totalTimeoutMs: 600000,
    }));
    await git("init", "--quiet"); await git("add", ".");
    await git("-c", "user.name=Proof-Jev verification", "-c", "user.email=verification@example.invalid", "commit", "-qm", "Historical source before the selected production change");
    await writeFile(join(root, scenario.file), after);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(source, "bin/plugin.mjs"), "--stdio"], cwd: root,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", VOUCH_PROJECT_ROOT: root, VOUCH_ALLOW_EXECUTION: "1", VERIFY_OUTPUT_DIR: directory }, stderr: "pipe" }));
    const setup = (await client.callTool({ name: "get_setup_status", arguments: {} })).structuredContent as any;
    assert.equal(setup.capabilities.mutation.ready, true);
    const plan = await client.callTool({ name: "analyze_change", arguments: { base: "HEAD" } });
    assert.notEqual(plan.isError, true, JSON.stringify(plan));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "analysis.json"), JSON.stringify(plan.structuredContent, null, 2) + "\n");
    console.log(JSON.stringify({ case: scenario.id, stage: "analyzed", file: scenario.file, candidateCount: (plan.structuredContent as any).candidateCount }));
    const response = await client.callTool({ name: "verify_change", arguments: { base: "HEAD", confirmCodeExecution: true } }, undefined, { timeout: 660000 });
    const report = response.structuredContent as any;
    assert.ok(report?.summary, JSON.stringify(response));
    assert.ok(["gaps_found", "evidence_collected"].includes(report.status), JSON.stringify(report));
    assert.deepEqual(await readFile(join(root, scenario.file)), after);
    const result = { case: scenario.id, file: scenario.file, historicalCommit: history, test: scenario.test,
      sourceSha256: createHash("sha256").update(after).digest("hex"), status: report.status, summary: report.summary,
      artifacts: report.artifacts, mutations: report.mutations, checkoutUnchanged: true, modelCalls: 0,
      limitations: ["Self-repository validation; not independent or representative of other projects.", "Current tests run against the historical production change in a disposable repository.", "At most 25 candidates are sampled; untested candidates remain visible."] };
    await writeFile(join(directory, "result.json"), JSON.stringify(result, null, 2) + "\n");
    summary.push(result);
    console.log(JSON.stringify({ case: scenario.id, status: report.status, summary: report.summary, artifacts: report.artifacts }));
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
}
await writeFile(join(output, "results.json"), JSON.stringify(summary, null, 2) + "\n");
