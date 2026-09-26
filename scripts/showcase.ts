import { runShowcase } from "../src/showcase/run.ts";
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
try {
  if (process.argv.length > 2)
    throw new Error(
      "Usage: npm run showcase (runs only bundled disposable fixtures; no model calls)",
    );
  const result = await runShowcase("out/showcase", controller.signal);
  console.log(
    JSON.stringify(
      {
        status: result.status,
        durationMs: result.durationMs,
        baseline: result.baseline.outcome,
        browserBefore: result.browserBefore.status,
        browserAfter: result.browserAfter.status,
        weakTests: result.weakTests.summary,
        strongTests: result.strongTests.summary,
        modelMode: result.jev.mode,
        newModelCalls: result.modelCalls,
        artifacts: result.artifacts,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Showcase failed");
  process.exitCode = 1;
}
