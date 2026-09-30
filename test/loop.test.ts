import assert from "node:assert/strict";
import { it } from "node:test";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { TaskLoop } from "../src/loop/engine.ts";
import { changeFixture, strongTests } from "./helpers/change-fixture.ts";
import { ModelBudget } from "../src/verify/budget.ts";
import { fileRequest } from "../src/review/questions.ts";
import { getDiff } from "../src/review/diff.ts";

async function configured() {
  const f = await changeFixture();
  const config = JSON.parse(await readFile(join(f.root, "vouch.config.json"), "utf8"));
  config.acceptanceChecks = { threshold: ["node", "--input-type=module", "-e", "import assert from 'node:assert/strict'; import {shipping} from './src/pricing.mjs'; assert.equal(shipping(50), 0)"] };
  await writeFile(join(f.root, "vouch.config.json"), JSON.stringify(config));
  return f;
}
const start = { type: "start", request: "Shipping is free starting at 50", confirmCodeExecution: true,
  requirements: [{ id: "threshold", description: "An order of exactly 50 ships free", check: "threshold" }] };

it("loop pins its base, detects weak tests, and checks the repaired task without mutating the checkout", async () => {
  const f = await configured();
  try {
    const loop = new TaskLoop({ projectRoot: f.root, outputDir: join(f.root, "out"), allowExecution: true });
    const begun = await loop.handle(start);
    assert.equal(begun.busy, false);
    await f.git("add", "."); await f.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Agent checkpoint");
    const weak = await loop.handle({ type: "complete" });
    assert.equal(weak.baseCommit, begun.baseCommit);
    assert.equal(weak.feedback?.decision, "needs_attention");
    assert.equal(weak.feedback?.requirements[0]?.status, "check_passed");
    assert.ok(weak.feedback?.findings.some(f => f.kind === "surviving_mutation"));
    assert.ok(weak.feedback!.verification!.summary.tested <= 3);
    await writeFile(join(f.root, "test/pricing.test.mjs"), strongTests);
    const strong = await loop.handle({ type: "complete" });
    assert.equal(strong.feedback?.decision, "checks_passed", JSON.stringify(strong.feedback));
    assert.equal(strong.feedback?.verification?.summary.detected, 3);
    assert.match(await readFile(join(f.root, "src/pricing.mjs"), "utf8"), /total >= 50/);
    const artifacts = (await loop.handle({ type: "complete" })).feedback?.verification?.artifacts;
    assert.deepEqual(artifacts, strong.feedback?.verification?.artifacts, "Unchanged completion should reuse evidence");
    await writeFile(join(f.root, "src/pricing.mjs"), "export const shipping = () => 5;\n");
    assert.equal((await loop.handle({ type: "status" })).feedback?.stale, true);
    const broken = await loop.handle({ type: "complete" });
    assert.equal(broken.feedback?.decision, "needs_attention");
    assert.equal(broken.feedback?.verification?.status, "baseline_failed");
  } finally { await f.close(); }
});

it("unmapped requirements and missing execution permission cannot pass completion", async () => {
  const f = await configured();
  try {
    const loop = new TaskLoop({ projectRoot: f.root, outputDir: join(f.root, "out"), allowExecution: true, maxMutants: 0 });
    await loop.handle({ ...start, confirmCodeExecution: undefined });
    assert.equal((await loop.handle({ type: "complete" })).feedback?.decision, "incomplete");
    await loop.handle({ ...start, requirements: [{ id: "manual", description: "A requirement with no configured check" }] });
    const unverified = await loop.handle({ type: "complete" });
    assert.equal(unverified.feedback?.decision, "incomplete");
    assert.equal(unverified.feedback?.requirements[0]?.status, "unverified");
    await assert.rejects(loop.handle({ ...start, requirements: [{ id: "bad", description: "bad", check: "not_configured" }] }), /unknown configured/);
    await assert.rejects(loop.handle({ ...start, requirements: [...start.requirements, ...start.requirements] }), /unique/);
    await assert.rejects(loop.handle({ type: "checkpoint", command: ["echo", "unsafe"] }), /Unrecognized/);
  } finally { await f.close(); }
});

it("an excluded tracked edit invalidates passing evidence and prevents a cached completion pass", async () => {
  const f = await configured();
  try {
    await mkdir(join(f.root, "dist"));
    await writeFile(join(f.root, "dist/runtime.js"), "module.exports = 1;\n");
    await f.git("add", "dist/runtime.js");
    await f.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Track generated runtime");
    const loop = new TaskLoop({ projectRoot: f.root, outputDir: join(f.root, "out"), allowExecution: true, maxMutants: 0 });
    await loop.handle(start);
    assert.equal((await loop.handle({ type: "complete" })).feedback?.decision, "checks_passed");
    await writeFile(join(f.root, "dist/runtime.js"), "module.exports = 2;\n");
    const current = await loop.handle({ type: "status" });
    assert.equal(current.feedback?.stale, true, "An omitted source edit must invalidate the previous verdict");
    assert.equal(current.feedback?.decision, "incomplete");
    const completed = await loop.handle({ type: "complete" });
    assert.equal(completed.feedback?.decision, "incomplete");
    assert.ok(completed.feedback?.limitations.some(x => x.includes("dist/runtime.js")));
  } finally { await f.close(); }
});

it("acceptance commands stay pinned at start and a failed requirement cannot be hidden by green baseline tests", async () => {
  const f = await configured();
  try {
    const loop = new TaskLoop({ projectRoot: f.root, outputDir: join(f.root, "out"), allowExecution: true, maxMutants: 0 });
    await loop.handle(start);
    await writeFile(join(f.root, "src/pricing.mjs"), (await readFile(join(f.root, "src/pricing.mjs"), "utf8")).replace(">= 50", "> 50"));
    const config = JSON.parse(await readFile(join(f.root, "vouch.config.json"), "utf8"));
    config.acceptanceChecks.threshold = ["node", "-e", "process.exit(0)"];
    await writeFile(join(f.root, "vouch.config.json"), JSON.stringify(config));
    const result = await loop.handle({ type: "complete" });
    assert.equal(result.feedback?.decision, "needs_attention");
    assert.equal(result.feedback?.requirements[0]?.status, "check_failed");
    assert.match(result.feedback!.verification!.reason, /Acceptance check threshold/);
    assert.equal(result.feedback?.verification?.failure?.phase, "acceptance");
    assert.equal(result.feedback?.verification?.failure?.check, "threshold");
    assert.match(result.feedback!.verification!.failure!.outputExcerpt, /AssertionError/);
  } finally { await f.close(); }
});

it("watching waits for stable edits, reuses unchanged evidence, and invalidates old results immediately", async () => {
  const f = await configured();
  try {
    const recursiveOutput = new TaskLoop({ projectRoot: f.root, outputDir: join(f.root, "reports") });
    await assert.rejects(recursiveOutput.handle(start), /excluded directory/);
    const loop = new TaskLoop({ projectRoot: f.root, outputDir: join(f.root, "out"), cooldownMs: 0 });
    await loop.handle(start);
    assert.equal(await loop.poll(), undefined);
    const observed = await loop.poll();
    assert.equal(observed?.feedback?.mode, "analysis");
    assert.equal(observed?.feedback?.verification, undefined, "Watcher must never execute tests");
    assert.equal(observed?.busy, false);
    assert.equal(await loop.poll(), undefined);
    await writeFile(join(f.root, "src/extra.mjs"), "export const extra = true;\n");
    assert.equal((await loop.poll())?.feedback?.stale, true);
    assert.ok((await loop.poll())?.feedback?.changedFiles.includes("src/extra.mjs"));
  } finally { await f.close(); }
});

it("cancellation interrupts a running check and busy events never start another test job", async () => {
  const f = await configured();
  try {
    const config = JSON.parse(await readFile(join(f.root, "vouch.config.json"), "utf8"));
    config.testCommand = ["node", "-e", "setTimeout(()=>{}, 20000)"]; config.commandTimeoutMs = 30000;
    await writeFile(join(f.root, "vouch.config.json"), JSON.stringify(config));
    const loop = new TaskLoop({ projectRoot: f.root, outputDir: join(f.root, "out"), allowExecution: true });
    await loop.handle(start);
    const work = loop.handle({ type: "complete" });
    const rejected = assert.rejects(work, /abort/i);
    for (let i = 0; i < 100 && !(await readdir(join(f.root, "out"))).some(n => n.startsWith("change-")); i++) await delay(20);
    await assert.rejects(loop.handle({ type: "checkpoint" }), /already running/);
    assert.equal(await loop.poll(), undefined);
    await loop.handle({ type: "cancel" }); await rejected;
    const status = await loop.handle({ type: "status" });
    assert.equal(status.phase, "cancelled");
    assert.notEqual(status.feedback?.decision, "checks_passed");
    await loop.handle(start); // A cancelled job releases the shared gate.
  } finally { await f.close(); }
});

it("task context reaches Jev and source edits during review make the result stale", async () => {
  const f = await configured(); let calls = 0;
  try {
    const loop = new TaskLoop({ projectRoot: f.root, outputDir: join(f.root, "out"), enableReview: true,
      review: { budget: new ModelBudget(10, 1, 0.01), adapter: { model: "fake", judge: async request => {
        calls++;
        assert.ok(JSON.stringify(request.state).includes(start.request));
        assert.ok("task_mismatch" in request.questions);
        if (calls === 1) await writeFile(join(f.root, "src/late.mjs"), "export const late = true;\n");
        throw new Error("Simulated unavailable provider");
      } } } });
    await loop.handle(start);
    const result = await loop.handle({ type: "checkpoint" });
    assert.equal(result.feedback?.stale, true);
    assert.equal(result.feedback?.decision, "incomplete");
    assert.ok(calls > 0 && calls <= 3);
    const chunk = (await getDiff(f.root, "HEAD")).chunks[0]!;
    const bounded = fileRequest(chunk, 'password = "private-value"; ' + "x".repeat(1900));
    assert.ok(!JSON.stringify(bounded.state).includes("private-value"));
    assert.ok(Buffer.byteLength(JSON.stringify(bounded.state)) <= 5000);
  } finally { await f.close(); }
});
