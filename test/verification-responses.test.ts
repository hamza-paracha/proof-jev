import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { verifyWorkflow } from "../src/verify/runtime.ts";
import { verifyInputSchema } from "../src/verify/schema.ts";

const expectation = { method: "POST", path: "/orders", status: 400 };
for (const scenario of [
  "expected rejection",
  "wrong status",
  "unrelated error",
  "duplicate rejection",
  "missing response",
  "wrong method",
  "no expectation",
] as const) {
  it(`response assertions: ${scenario}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "proof-response-"));
    const server = createServer((req, res) => {
      if (req.url === "/") {
        res.setHeader("Content-Type", "text/html");
        const action =
          scenario === "missing response"
            ? ""
            : `await fetch('/orders', {method:'${scenario === "wrong method" ? "GET" : "POST"}'});`;
        const extra =
          scenario === "duplicate rejection"
            ? "await fetch('/orders', {method:'POST'});"
            : scenario === "unrelated error"
              ? "await fetch('/broken');"
              : "";
        res.end(
          `<button onclick="send()">Submit</button><p id="status">Ready</p><script>async function send(){${action}${extra}document.getElementById('status').textContent='Done';}</script>`,
        );
      } else {
        res.statusCode =
          scenario === "wrong status" ? 201 : req.url === "/broken" ? 500 : 400;
        res.end("response");
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    try {
      const report = await verifyWorkflow(
        {
          url: `http://127.0.0.1:${address.port}`,
          confirmDisposable: true,
          allowedWritePaths: ["/orders"],
          stepTimeoutMs: 1500,
          steps: [
            {
              kind: "choose",
              intent: "Submit",
              ...(scenario === "no expectation"
                ? {}
                : { expectResponse: expectation }),
            },
            { kind: "assertText", text: "Done" },
          ],
        },
        { outputDir: directory },
      );
      assert.equal(
        report.status,
        scenario === "expected rejection" ? "passed" : "failed",
        report.reason,
      );
      if (scenario === "expected rejection") {
        assert.equal(report.steps[0]!.response!.status, 400);
        assert.equal(report.findings.length, 0);
        const replay = JSON.parse(
          await readFile(report.artifacts.replay, "utf8"),
        );
        assert.equal(replay.steps[0].kind, "click");
        assert.deepEqual(replay.steps[0].expectResponse, expectation);
        assert.equal(
          (await verifyWorkflow(replay, { outputDir: directory })).status,
          "passed",
        );
        assert.match(
          await readFile(report.artifacts.html, "utf8"),
          /POST.*400/,
        );
      }
      if (scenario === "wrong status")
        assert.match(report.reason, /observed 201/);
      if (scenario === "duplicate rejection" || scenario === "no expectation")
        assert.ok(report.findings.some((f) => f.category === "http-4xx"));
      if (scenario === "unrelated error")
        assert.ok(report.findings.some((f) => f.category === "http-5xx"));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
}
it("rejects broad response expectations and server-error suppression", () => {
  for (const override of [
    { path: "//remote/orders" },
    { path: "/api/*" },
    { path: "/a/../orders" },
    { path: "/orders?all=true" },
    { status: 500 },
    { method: "*" },
  ]) {
    assert.throws(() =>
      verifyInputSchema.parse({
        url: "http://127.0.0.1:4000",
        steps: [
          {
            kind: "click",
            target: { role: "button", name: "Submit" },
            expectResponse: { ...expectation, ...override },
          },
          { kind: "assertText", text: "Done" },
        ],
      }),
    );
  }
});
