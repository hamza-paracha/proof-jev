import { resolve } from "node:path";
import { TaskLoop } from "./engine.ts";
import { taskMessageSchema } from "./schema.ts";
import { reviewOptionsFromEnv } from "../review/config.ts";
import { redact } from "../verify/redact.ts";
import { BusyError } from "./gate.ts";
import { setPriority } from "node:os";

/** JSON Lines transport: one long-lived child per repository/task stream. */
export async function loopCLI(args: string[], signal: AbortSignal) {
  try { setPriority(0, 10); } catch { /* Scheduling priority is best-effort across platforms. */ }
  let projectRoot = process.env.VOUCH_PROJECT_ROOT ?? process.cwd();
  let allowExecution = false, enableReview = false, watch = false, intervalMs = 5000, maxMutants = 3;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--allow-exec") { allowExecution = true; continue; }
    if (arg === "--review") { enableReview = true; continue; }
    if (arg === "--watch") { watch = true; continue; }
    if (["--project", "--interval-ms", "--max-mutants"].includes(arg ?? "") && args[i + 1] && !args[i + 1]!.startsWith("--")) {
      const value = args[++i]!;
      if (arg === "--project") projectRoot = value;
      else if (arg === "--interval-ms") intervalMs = Number(value);
      else maxMutants = Number(value);
      continue;
    }
    throw new Error("Usage: proof-jev loop [--project <repo>] [--watch] [--allow-exec] [--review] [--max-mutants 0..25] [--interval-ms >=5000]");
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 5000 || intervalMs > 300000) throw new Error("Polling interval must be 5000–300000 ms");
  const loop = new TaskLoop({ projectRoot: resolve(projectRoot), allowExecution, enableReview, maxMutants, signal,
    outputDir: process.env.VERIFY_OUTPUT_DIR ?? resolve(projectRoot, "out/verification"),
    review: enableReview ? reviewOptionsFromEnv() : undefined });
  const emit = (value: unknown) => process.stdout.write(JSON.stringify(redact(value)) + "\n");
  const failure = (error: unknown) => ({ code: error instanceof BusyError ? "busy" : signal.aborted ? "cancelled" : "error",
    message: error instanceof Error ? error.message : "Task event failed" });
  const pending = new Set<Promise<unknown>>();
  const ids = new Set<string>();
  const submit = (line: string) => {
    let id: string | null = null;
    try {
      const raw = JSON.parse(line); id = typeof raw?.id === "string" ? raw.id.slice(0, 100) : null;
      const message = taskMessageSchema.parse(raw);
      if (ids.has(message.id)) throw new Error("Duplicate in-flight request ID");
      // No command queue: expensive events return busy until the current operation finishes.
      ids.add(message.id);
      const job = loop.handle(message.event, signal).then(result => emit({ id, result }), error => emit({ id, error: failure(error) }))
        .finally(() => { ids.delete(message.id); pending.delete(job); });
      pending.add(job);
    } catch (error) { emit({ id, error: failure(error) }); }
  };
  let polling = false;
  const timer = watch ? setInterval(() => {
    if (polling || signal.aborted) return;
    polling = true;
    const job = loop.poll().then(result => { if (result) emit({ event: "feedback", result }); }, error => {
      if (!signal.aborted) emit({ event: "error", error: failure(error) });
    }).finally(() => { polling = false; pending.delete(job); });
    pending.add(job);
  }, intervalMs) : undefined;
  const abort = () => process.stdin.destroy();
  signal.addEventListener("abort", abort, { once: true });
  process.stdin.setEncoding("utf8");
  let buffer = "";
  try {
    for await (const chunk of process.stdin) {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (Buffer.byteLength(line) > 65536) throw new Error("Task event exceeds 64 KB");
        if (line.trim()) submit(line);
      }
      if (Buffer.byteLength(buffer) > 65536) throw new Error("Task event exceeds 64 KB");
    }
    if (buffer.trim() && !signal.aborted) submit(buffer);
  } catch (error) { if (!signal.aborted) throw error; }
  finally {
    if (timer) clearInterval(timer);
    signal.removeEventListener("abort", abort);
    await Promise.allSettled([...pending]);
  }
}
