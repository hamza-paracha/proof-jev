import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

/** Small transport adapter for any Node harness. The harness owns its agent and completion policy. */
export function createProofClient({ project, allowExecution = false, review = false, watch = true, maxMutants = 3, onFeedback = () => {} }) {
  const args = [fileURLToPath(new URL("./vouch.mjs", import.meta.url)), "loop", "--project", project, "--max-mutants", String(maxMutants)];
  if (allowExecution) args.push("--allow-exec");
  if (review) args.push("--review");
  if (watch) args.push("--watch");
  const child = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  let next = 0, ended = false, diagnostics = "";
  const fail = error => { for (const { reject } of pending.values()) reject(error); pending.clear(); };
  child.stderr.on("data", data => { diagnostics = (diagnostics + data).slice(-2000); });
  child.on("error", error => { ended = true; fail(error); });
  child.stdin.on("error", error => fail(error));
  const closed = new Promise(resolve => child.on("close", (code) => {
    ended = true; fail(new Error(`Proof-Jev exited (${code}): ${diagnostics}`)); resolve();
  }));
  const lines = createInterface({ input: child.stdout });
  lines.on("line", line => {
    try {
      const message = JSON.parse(line);
      if (message.id) {
        const promise = pending.get(message.id); if (!promise) return;
        pending.delete(message.id);
        if (message.error) promise.reject(Object.assign(new Error(message.error.message), { code: message.error.code })); else promise.resolve(message.result);
      } else onFeedback(message);
    } catch (error) { fail(error); }
  });
  return {
    send(event) {
      if (ended) return Promise.reject(new Error("Proof-Jev connection is closed"));
      const id = String(++next);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify({ id, event }) + "\n", error => {
          if (error) { pending.delete(id); reject(error); }
        });
      });
    },
    async close() {
      if (!ended) {
        child.kill("SIGTERM");
        const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
        try { await closed; } finally { clearTimeout(timeout); lines.close(); }
      }
    },
  };
}
