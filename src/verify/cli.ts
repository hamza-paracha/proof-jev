import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { reviewCLI } from "../review/cli.ts";
import { reviewOptionsFromEnv } from "../review/config.ts";
import { changeCLI } from "../change/cli.ts";
import { createVerificationServer } from "./mcp.ts";
import { doctor } from "./doctor.ts";
import { loopCLI } from "../loop/cli.ts";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

try {
  const args = process.argv.slice(2);
  if (args[0] === "loop") {
    await loopCLI(args.slice(1), controller.signal);
  } else if (["review", "assess-pr", "check-file"].includes(args[0] ?? "")) {
    const { result, exitCode } = await reviewCLI(args, controller.signal);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exitCode = exitCode;
  } else if (["analyze", "verify-change"].includes(args[0] ?? "")) {
    const { result, exitCode } = await changeCLI(args, controller.signal);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exitCode = exitCode;
  } else if (args[0] === "--doctor" && args.length === 1) {
    const result = await doctor();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exitCode = result.status === "ready" ? 0 : 2;
  } else if (args[0] === "--stdio" && args.length === 1) {
    const server = createVerificationServer({
      projectRoot: process.env.VOUCH_PROJECT_ROOT,
      allowExecution: process.env.VOUCH_ALLOW_EXECUTION === "1",
      outputDir: process.env.VERIFY_OUTPUT_DIR,
      signal: controller.signal,
      review: reviewOptionsFromEnv(),
      enableTaskReview: process.env.PROOF_TASK_REVIEW === "1",
    });
    server.server.onclose = () => controller.abort();
    controller.signal.addEventListener("abort", () => { void server.close(); }, { once: true });
    await server.connect(new StdioServerTransport());
  } else {
    process.stdout.write("Usage: proof-jev --stdio | --doctor\n       proof-jev loop [--project <repo>] [--watch] [--allow-exec] [--review] [--max-mutants 0..25]\n       proof-jev analyze|verify-change [--project <repo>] [--base <commit>] [--allow-exec]\n       proof-jev review|assess-pr|check-file --project <repo> [--base <ref>] [--file <path>]\nCode analysis and mutation testing need no model key. Jev review requires explicit configuration.\n");
    process.exitCode = args[0] === "--help" && args.length === 1 ? 0 : 2;
  }
} catch (error) {
  process.stderr.write(`proof-jev: ${error instanceof Error ? error.message : "startup failed"}\n`);
  process.exitCode = 2;
}
