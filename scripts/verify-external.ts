import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify, stripVTControlCharacters } from "node:util";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { runtimeFingerprint, VERSION } from "../src/verify/version.ts";

// Full-file probes of pinned upstream modules, with their own behavioral tests.
// These are not historical patches or claims of production bugs in the packages.
const cases = [
  { id: "is-number", repo: "jonschlinkert/is-number", revision: "98e8ff1da1a89f93d1397a24d7413ed15421c139", source: "index.js", tests: ["test.js"], command: ["node", "node_modules/mocha/bin/_mocha", "test.js", "--reporter", "dot"] },
  { id: "clsx", repo: "lukeed/clsx", revision: "925494cf31bcd97d3337aacd34e659e80cae7fe2", source: "src/index.js", tests: ["test/index.js", "test/classnames.js"], command: ["node", "--import", "tsx", "node_modules/uvu/bin.js", "test"] },
  { id: "isarray", repo: "juliangruber/isarray", revision: "3c1b04a4a7e89791cedaecf1f1bc8d6ecd0f897b", source: "index.js", tests: ["test.js"], command: ["node", "node_modules/tape/bin/tape", "test.js"] },
];
const exec = promisify(execFile);
const repository = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(process.argv[2] ?? "out/external-validation/current");
const cache = resolve(repository, "out/external-validation");
const dependencies = join(cache, "dependencies");
const selected = process.argv[3] ? cases.filter(c => c.id === process.argv[3]) : cases;
assert.ok(selected.length, "Unknown external validation case");
await mkdir(output, { recursive: true });
await mkdir(join(cache, "checkouts"), { recursive: true });
// Install only locked behavioral test runners. No package publish/build scripts run.
const expectedLock = await readFile(join(repository, "evals/external/package-lock.json"));
let dependenciesReady = false;
try {
  dependenciesReady = (await readFile(join(dependencies, "package-lock.json"))).equals(expectedLock)
    && ["uvu", "mocha", "tape", "tsx"].every(name => existsSync(join(dependencies, "node_modules", name, "package.json")));
} catch { /* A fresh checkout needs the locked runners. */ }
if (!dependenciesReady) {
  await mkdir(dependencies, { recursive: true });
  await cp(join(repository, "evals/external/package.json"), join(dependencies, "package.json"));
  await cp(join(repository, "evals/external/package-lock.json"), join(dependencies, "package-lock.json"));
  await exec("npm", ["ci", "--prefix", dependencies, "--ignore-scripts", "--no-audit", "--no-fund"], { timeout: 120000 });
}
const results: any[] = [];
for (const scenario of selected) {
  const checkout = join(cache, "checkouts", scenario.id);
  if (!existsSync(join(checkout, ".git"))) {
    await exec("git", ["init", "--quiet", checkout]);
    await exec("git", ["-C", checkout, "remote", "add", "origin", `https://github.com/${scenario.repo}.git`]);
  }
  const upstream = async (...args: string[]) => (await exec("git", ["-C", checkout, ...args], { timeout: 60000, maxBuffer: 4_000_000 })).stdout;
  try { await upstream("cat-file", "-e", `${scenario.revision}^{commit}`); }
  catch { await upstream("fetch", "--quiet", "--depth", "1", "origin", scenario.revision); }
  const root = await mkdtemp(join(tmpdir(), "proof-external-"));
  const directory = join(output, scenario.id);
  const client = new Client({ name: "external-repository-validation", version: "1" });
  const git = async (...args: string[]) => (await exec("git", ["-C", root, ...args], { timeout: 10000 })).stdout;
  try {
    // Read the pinned Git tree, even if the cached checkout has local edits.
    const names = (await upstream("ls-tree", "--name-only", "-rz", scenario.revision)).split("\0").filter(Boolean);
    for (const name of names) {
      const bytes = (await exec("git", ["-C", checkout, "show", `${scenario.revision}:${name}`], { encoding: "buffer", maxBuffer: 4_000_000 })).stdout;
      await mkdir(dirname(join(root, name)), { recursive: true });
      await writeFile(join(root, name), bytes);
    }
    const source = await readFile(join(root, scenario.source));
    await rm(join(root, scenario.source));
    await writeFile(join(root, "vouch.config.json"), JSON.stringify({
      setupCommand: ["node", "-e", `require('node:fs').symlinkSync(${JSON.stringify(join(dependencies, "node_modules"))},'node_modules','dir')`],
      testCommand: scenario.command, maxMutants: 6, commandTimeoutMs: 5000, totalTimeoutMs: 120000,
    }));
    await git("init", "--quiet"); await git("add", ".");
    await git("-c", "user.name=Proof-Jev validation", "-c", "user.email=validation@example.invalid", "commit", "-qm", "Probe base excluding the selected upstream module");
    await writeFile(join(root, scenario.source), source);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(repository, "bin/plugin.mjs"), "--stdio"], cwd: root,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", VOUCH_PROJECT_ROOT: root, VOUCH_ALLOW_EXECUTION: "1", VERIFY_OUTPUT_DIR: directory }, stderr: "pipe" }));
    const setup = (await client.callTool({ name: "get_setup_status", arguments: {} })).structuredContent as any;
    assert.equal(setup.capabilities.mutation.ready, true);
    const analysis = await client.callTool({ name: "analyze_change", arguments: { base: "HEAD" } });
    assert.notEqual(analysis.isError, true, JSON.stringify(analysis));
    const plan = analysis.structuredContent as any;
    console.log(JSON.stringify({ case: scenario.id, stage: "analyzed", affectedTests: plan.affectedTests, candidates: plan.candidateCount }));
    const expectedPasses = scenario.id === "is-number" ? 111 : scenario.id === "clsx" ? 32 : 28;
    const countPasses = (output: string) => {
      const text = stripVTControlCharacters(output);
      const match = scenario.id === "is-number" ? text.match(/\b(\d+) passing\b/) : scenario.id === "clsx" ? text.match(/Passed:\s+(\d+)/) : text.match(/# pass\s+(\d+)/);
      return match ? Number(match[1]) : 0;
    };
    const verify = async (passes = expectedPasses) => {
      const response = await client.callTool({ name: "verify_change", arguments: { base: "HEAD", confirmCodeExecution: true } }, undefined, { timeout: 150000 });
      const result = response.structuredContent as any;
      assert.ok(result?.summary, JSON.stringify(response));
      const report = JSON.parse(await readFile(result.artifacts.report, "utf8"));
      if (["evidence_collected", "gaps_found"].includes(report.status)) {
        for (const baseline of report.baseline) assert.equal(countPasses(baseline.stdout), passes, "A green exit must not hide missing upstream tests");
      }
      return report;
    };
    const before = await verify();
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "analysis.json"), JSON.stringify(plan, null, 2) + "\n");
    let strengthened;
    if (scenario.id === "clsx" && plan.affectedTests.includes("test/index.js") && ["evidence_collected", "gaps_found"].includes(before.status)) {
      const test = join(root, "test/index.js");
      const original = await readFile(test, "utf8");
      assert.ok(original.includes("test.run();"));
      const regression = `test('arrays ignore inherited entries beyond their length', () => {
  const input = ['foo'];
  const prototype = Object.create(Array.prototype);
  prototype[1] = 'outside-the-array';
  Object.setPrototypeOf(input, prototype);
  assert.is(fn(input), 'foo');
});\n\n`;
      await writeFile(test, original.replace("test.run();", regression + "test.run();"));
      await writeFile(join(directory, "test-fix.diff"), await git("diff", "--", "test/index.js"));
      strengthened = await verify(expectedPasses + 1);
      assert.deepEqual(strengthened.mutations.map((m: any) => m.mutation.id), before.mutations.map((m: any) => m.mutation.id));
    }
    if (scenario.id === "isarray" && plan.affectedTests.includes("test.js") && ["evidence_collected", "gaps_found"].includes(before.status)) {
      // The upstream test imports before deleting Array.isArray, so its polyfill
      // assertions keep calling the captured native function. Reload at each mode.
      const test = join(root, "test.js");
      const original = await readFile(test, "utf8");
      const reload = "delete require.cache[require.resolve('./')];\n  isArray = require('./');";
      assert.ok(original.includes("var isArray = require('./');") && original.includes("delete Array.isArray;") && original.includes("Array.isArray = nativeIsArray;"));
      await writeFile(test, original.replace("var isArray = require('./');", "var isArray;")
        .replace("delete Array.isArray;", `delete Array.isArray;\n  ${reload}`)
        .replace("Array.isArray = nativeIsArray;", `Array.isArray = nativeIsArray;\n  ${reload}`));
      await writeFile(join(directory, "test-fix.diff"), await git("diff", "--", "test.js"));
      strengthened = await verify();
      assert.deepEqual(strengthened.mutations.map((m: any) => m.mutation.id), before.mutations.map((m: any) => m.mutation.id));
    }
    assert.deepEqual(await readFile(join(root, scenario.source)), source, "Verification changed the upstream module");
    const compact = (report: any) => ({ status: report.status, summary: report.summary, durationMs: report.durationMs,
      runnerReportedPasses: report.baseline.length ? countPasses(report.baseline[0].stdout) : 0,
      baselineMs: report.baseline.reduce((total: number, run: any) => total + run.durationMs, 0), setupMs: report.setup?.durationMs,
      artifacts: report.artifacts, mutations: report.mutations.map((m: any) => ({ id: m.mutation.id, line: m.mutation.line, before: m.mutation.before, after: m.mutation.after, outcome: m.outcome, patch: m.patch })) });
    const result = { id: scenario.id, repository: `https://github.com/${scenario.repo}`, revision: scenario.revision, source: scenario.source,
      sourceSha256: createHash("sha256").update(source).digest("hex"), expectedAffectedTests: scenario.tests, affectedTests: plan.affectedTests,
      probe: "Current pinned module treated as a new file for a full-file mutation probe; upstream behavioral tests unchanged in the first run.",
      testCommand: scenario.command, before: compact(before), ...(strengthened ? { strengthened: compact(strengthened) } : {}),
      runnerAdaptation: scenario.id === "clsx" ? "The upstream uvu assertions run under tsx instead of the legacy esm loader for Node 22 compatibility." : "Upstream behavioral test runner; lint, build, audit, and publishing scripts are not run.",
      sourceUnchanged: true, modelCalls: 0 };
    results.push(result);
    await writeFile(join(directory, "result.json"), JSON.stringify(result, null, 2) + "\n");
    await writeFile(join(output, "results.json"), JSON.stringify({ version: VERSION, runtimeFingerprint: runtimeFingerprint(), node: process.version, results }, null, 2) + "\n");
    console.log(JSON.stringify({ case: scenario.id, before: result.before, strengthened: result.strengthened }));
    assert.ok(["gaps_found", "evidence_collected"].includes(before.status), `Baseline or execution failed for ${scenario.id}; inspect ${before.artifacts.report}`);
    assert.deepEqual([...plan.affectedTests].sort(), [...scenario.tests].sort(), "Expected upstream test reachability was lost");
    if (strengthened) assert.equal(strengthened.status, "evidence_collected", "The focused assertions must detect the same sampled faults");
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
}
