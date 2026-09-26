import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { evaluateReview, evaluationCasesSchema } from "../review/evaluation.ts";
import { verifyChange } from "../change/verify.ts";
import { runCommand } from "../change/process.ts";
import { verifyWorkflow } from "../verify/runtime.ts";
import { renderEvidenceHtml } from "../evidence/html.ts";

const exec = promisify(execFile);
const project = fileURLToPath(new URL("../../", import.meta.url));
const weakTests = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { order } from '../src/order.js';
test('ordinary order', () => assert.deepEqual(order({ quantity: 2 }, { insert: value => value }), { quantity: 2 }));
`;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function startApp(root: string, signal: AbortSignal) {
  const dataFile = join(root, "runner-data/order.json");
  await mkdir(join(root, "runner-data"), { recursive: true });
  await writeFile(dataFile, '{"order":null}\n');
  const app = spawn(process.execPath, [join(root, "server.mjs")], {
    cwd: root,
    env: { PATH: process.env.PATH ?? "", PORT: "0", DATA_FILE: dataFile },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  app.stderr!.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(0, 1500);
  });
  const close = async () => {
    if (app.exitCode === null && app.signalCode === null) {
      const exited = once(app, "exit");
      app.kill("SIGKILL");
      await exited;
    }
  };
  const stop = () => {
    app.kill("SIGKILL");
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = createInterface({ input: app.stdout! });
      const timer = setTimeout(() => {
        app.kill("SIGKILL");
        reject(new Error("Showcase app startup timed out"));
      }, 5000);
      const finish = () => {
        clearTimeout(timer);
        reader.close();
        app.removeListener("error", fail);
        app.removeListener("exit", exit);
      };
      const fail = (error: Error) => {
        finish();
        reject(error);
      };
      const exit = () =>
        fail(new Error(`Showcase app stopped before startup: ${stderr}`));
      app.once("error", fail);
      app.once("exit", exit);
      reader.once("line", (line) => {
        try {
          const data = JSON.parse(line);
          assert.match(data.url, /^http:\/\/127\.0\.0\.1:\d+$/);
          finish();
          resolve(data.url);
        } catch (error) {
          fail(error as Error);
        }
      });
      if (signal.aborted) {
        stop();
        fail(new Error("Showcase cancelled"));
      }
    });
    return {
      url,
      dataFile,
      close: async () => {
        signal.removeEventListener("abort", stop);
        await close();
      },
    };
  } catch (error) {
    signal.removeEventListener("abort", stop);
    await close();
    throw error;
  }
}
export async function runShowcase(
  outputRoot = "out/showcase",
  externalSignal?: AbortSignal,
) {
  const started = Date.now(),
    runId = randomUUID(),
    output = resolve(outputRoot, runId);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, AbortSignal.timeout(120000)])
    : AbortSignal.timeout(120000);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(join(tmpdir(), "proof-jev-showcase-"));
  const git = (...args: string[]) =>
    exec("git", ["-c", "core.fsmonitor=false", "-C", root, ...args], {
      signal,
      timeout: 10000,
    });
  const link = (path: string) => relative(output, path).split(sep).join("/");
  try {
    const cases = evaluationCasesSchema.parse(
      JSON.parse(
        await readFile(join(project, "evals/review/cases.json"), "utf8"),
      ),
    );
    const specimen = cases.find((c) => c.id === "input-validation-regression")!;
    const recorded = JSON.parse(
      await readFile(
        join(project, "evals/review/recorded-jev-1.13.0.json"),
        "utf8",
      ),
    );
    const evaluation = await evaluateReview(cases, {
      replay: recorded,
      signal,
    });
    assert.equal(evaluation.complete, true);
    const jev = evaluation.results.find((r) => r.id === specimen.id)!.judgment!;
    assert.equal(jev.verdicts.needs_validation!.answer, true);
    await cp(join(project, "examples/order-guard"), root, { recursive: true });
    const source = join(root, "src/order.js"),
      tests = join(root, "test/order.test.mjs");
    assert.equal(
      await readFile(source, "utf8"),
      specimen.before,
      "Example must match the recorded Jev source pair exactly",
    );
    const strongTests = await readFile(tests, "utf8");
    await writeFile(join(root, "package.json"), '{"type":"module"}\n');
    await writeFile(
      join(root, ".gitignore"),
      "runner-data/\nout/\n.vouch-home/\n.vouch-tmp/\n",
    );
    await writeFile(
      join(root, "vouch.config.json"),
      JSON.stringify({
        testCommand: ["node", "--test", "test/order.test.mjs"],
        maxMutants: 10,
        commandTimeoutMs: 3000,
        totalTimeoutMs: 30000,
      }),
    );
    await writeFile(source, specimen.after);
    await writeFile(tests, weakTests);
    await git("init", "--quiet");
    await git("add", ".");
    await git(
      "-c",
      "user.name=Proof-Jev showcase",
      "-c",
      "user.email=showcase@example.invalid",
      "commit",
      "-qm",
      "Seeded invalid-order regression with weak tests",
    );
    const baseline = await runCommand(
      ["node", "--test", "test/order.test.mjs"],
      root,
      5000,
      signal,
    );
    assert.equal(baseline.outcome, "passed");
    await writeFile(
      join(output, "baseline.json"),
      JSON.stringify(baseline, null, 2) + "\n",
      { mode: 0o600 },
    );
    const browser = async (phase: string) => {
      const app = await startApp(root, signal);
      try {
        const report = await verifyWorkflow(
          {
            url: app.url,
            confirmDisposable: true,
            allowedWritePaths: ["/api/orders"],
            steps: [
              {
                kind: "fill",
                target: { role: "textbox", name: "Quantity" },
                value: "-1",
              },
              {
                kind: "choose",
                intent: "Place order",
                expectResponse: {
                  method: "POST",
                  path: "/api/orders",
                  status: 400,
                },
              },
              {
                kind: "assertJson",
                path: "/api/orders",
                field: ["order"],
                equals: null,
              },
            ],
          },
          { signal, outputDir: join(output, phase) },
        );
        const disk = JSON.parse(await readFile(app.dataFile, "utf8"));
        await writeFile(
          join(output, `${phase}-disk.json`),
          JSON.stringify(disk, null, 2) + "\n",
          { mode: 0o600 },
        );
        return { report, disk };
      } finally {
        await app.close();
      }
    };
    const before = await browser("before");
    assert.equal(before.report.status, "failed");
    assert.equal(before.disk.order.quantity, -1);
    // A disclosed scripted repair of a known fixture, not autonomous model-generated code.
    await writeFile(source, specimen.before);
    const mutationOptions = {
      projectRoot: root,
      allowExecution: true,
      outputDir: join(output, "mutations"),
      signal,
    };
    const weak = await verifyChange(
      { base: "HEAD", confirmCodeExecution: true },
      mutationOptions,
    );
    assert.equal(weak.status, "gaps_found", weak.reason);
    assert.equal(weak.summary.tested, 3);
    assert.equal(weak.summary.survived, 3);
    assert.ok(
      weak.mutations.some(
        (m) => m.mutation.kind === "guard-removal" && m.outcome === "survived",
      ),
    );
    await writeFile(tests, strongTests);
    const strong = await verifyChange(
      { base: "HEAD", confirmCodeExecution: true },
      mutationOptions,
    );
    assert.equal(strong.status, "evidence_collected", strong.reason);
    assert.equal(strong.summary.untested, 0);
    assert.equal(strong.summary.detected, 3);
    assert.deepEqual(
      strong.mutations.map((m) => m.mutation.id).sort(),
      weak.mutations.map((m) => m.mutation.id).sort(),
    );
    const after = await browser("after");
    assert.equal(after.report.status, "passed");
    assert.equal(after.disk.order, null);
    assert.equal(
      await readFile(source, "utf8"),
      specimen.before,
      "Mutation checks must preserve the repaired source",
    );
    const modelEvidence = {
      mode: "recorded" as const,
      fixture: specimen.id,
      suiteHash: evaluation.suiteHash,
      sourceBeforeSha256: hash(specimen.before),
      sourceAfterSha256: hash(specimen.after),
      judgment: jev,
      newCalls: 0,
    };
    await writeFile(
      join(output, "jev-review.json"),
      JSON.stringify(modelEvidence, null, 2) + "\n",
      { mode: 0o600 },
    );
    await writeFile(join(output, "regression.js"), specimen.after, {
      mode: 0o600,
    });
    await writeFile(join(output, "repair.js"), specimen.before, {
      mode: 0o600,
    });
    const result = {
      schemaVersion: 1,
      runId,
      status: "passed",
      durationMs: Date.now() - started,
      modelCalls: 0,
      jev: modelEvidence,
      baseline,
      browserBefore: {
        status: before.report.status,
        disk: before.disk,
        report: link(before.report.artifacts.report),
      },
      browserAfter: {
        status: after.report.status,
        disk: after.disk,
        report: link(after.report.artifacts.report),
      },
      weakTests: { summary: weak.summary, report: link(weak.artifacts.report) },
      strongTests: {
        summary: strong.summary,
        report: link(strong.artifacts.report),
      },
      sameMutantsCompared: true,
      repairedSourcePreserved: true,
      repairMode: "scripted known-fixture repair",
      artifacts: {
        html: join(output, "index.html"),
        json: join(output, "showcase.json"),
      },
    };
    const html = renderEvidenceHtml({
      eyebrow: "One failure / three kinds of evidence",
      title: "Green tests.\nBad order.",
      status: "passed",
      summary:
        "Ordinary tests passed while a negative-quantity order reached disk. Jev flagged the missing validation; browser and mutation checks exposed the consequences. The repaired version passes the same browser assertion and detects the same sampled mutations.",
      metrics: [
        {
          label: "Ordinary tests",
          value: "Passed",
          detail: "Even with the seeded regression",
        },
        {
          label: "Invalid order",
          value: "−1 saved",
          detail: "Confirmed by an independent disk read",
        },
        {
          label: "Surviving mutants",
          value: `${weak.summary.survived} → ${strong.summary.survived}`,
          detail: `Same ${strong.summary.tested} mutants, stronger assertions`,
        },
        {
          label: "New model calls",
          value: "0",
          detail: "Real recorded Jev review; live executable checks",
        },
      ],
      sections: [
        {
          title: "Jev identifies the review concern",
          text: `The recorded ${jev.model} review of this exact source pair assigned ${(jev.verdicts.needs_validation!.probabilities.yes! * 100).toFixed(0)}% yes probability to missing validation. This is a replay of a real response, not a new model request.`,
          code: specimen.after,
          links: [{ label: "Recorded Jev judgment", href: "jev-review.json" }],
        },
        {
          title: "A browser reproduces what tests missed",
          text: "The identical workflow enters −1, submits the order, expects HTTP 400, and asserts that no order was persisted. Before the repair it fails. Reading the underlying file separately confirms that the invalid order reached disk.",
          table: {
            headings: ["Evidence", "Before repair", "After repair"],
            rows: [
              ["Browser assertion", before.report.status, after.report.status],
              [
                "Persisted order",
                JSON.stringify(before.disk.order),
                JSON.stringify(after.disk.order),
              ],
              ["Assertion", "order must be null", "order must be null"],
            ],
          },
          links: [
            {
              label: "Before: browser evidence",
              href: link(before.report.artifacts.html),
            },
            {
              label: "After: browser evidence",
              href: link(after.report.artifacts.html),
            },
            {
              label: "Before: independent disk read",
              href: "before-disk.json",
            },
            { label: "After: independent disk read", href: "after-disk.json" },
          ],
        },
        {
          title: "Mutation testing challenges the repair",
          text: "Restoring the guard fixes the observed bug, but the original tests still pass when that guard is deliberately removed again. Boundary and invalid-input assertions make those same faults detectable. Each failing mutant is repeated in a fresh copy.",
          table: {
            headings: ["Mutation", "Weak tests", "Strengthened tests"],
            rows: weak.mutations.map((m) => [
              `${m.mutation.kind}: ${m.mutation.before} → ${m.mutation.after}`,
              m.outcome,
              strong.mutations.find((s) => s.mutation.id === m.mutation.id)!
                .outcome,
            ]),
          },
          links: [
            {
              label: "Weak test evidence + patches",
              href: link(weak.artifacts.html),
            },
            {
              label: "Stronger test evidence + patches",
              href: link(strong.artifacts.html),
            },
          ],
        },
        {
          title: "Inspect the repair and reproduce the run",
          text: "The demo script restores the known validation guard and installs explicit regression assertions. The mutation engine does not edit the repaired source. Run npm run showcase to reproduce all executable checks locally.",
          code: specimen.before,
          links: [
            { label: "Machine-readable evidence", href: "showcase.json" },
            { label: "Baseline test output", href: "baseline.json" },
            { label: "Regressed source", href: "regression.js" },
            { label: "Repaired source", href: "repair.js" },
          ],
        },
      ],
      notes: [
        "This is a seeded, synthetic order application with a scripted repair. It is not an autonomous repair claim or a production incident.",
        "Jev's judgment is recorded from a real earlier request and remains advisory. All browser, disk, baseline and mutation checks shown here ran for this report.",
        "The mutation comparison uses identical sampled faults. Detecting them does not prove complete test coverage or general correctness.",
        "The application runs on loopback in a disposable copy. This report contains synthetic data and makes no new provider calls.",
      ],
    });
    await writeFile(result.artifacts.html, html, { mode: 0o600 });
    await writeFile(
      result.artifacts.json,
      JSON.stringify(result, null, 2) + "\n",
      { mode: 0o600 },
    );
    return result;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
