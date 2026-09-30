import { reviewOptionsFromEnv } from "../review/config.ts";
import { pluginStatus } from "./setup.ts";
import { VERSION, runtimeFingerprint } from "./version.ts";

export async function doctor(env: NodeJS.ProcessEnv = process.env) {
  const issues: string[] = [];
  if (Number(process.versions.node.split(".")[0]) < 22) issues.push("Node 22 or newer is required");
  let review;
  try { review = reviewOptionsFromEnv(env); }
  catch (error) { issues.push(error instanceof Error ? error.message : "Invalid review configuration"); }
  const setup = await pluginStatus({ projectRoot: env.VOUCH_PROJECT_ROOT, allowExecution: env.VOUCH_ALLOW_EXECUTION === "1", review });
  return {
    status: issues.length ? "not_ready" : "ready", version: VERSION, node: process.version,
    runtimeFingerprint: runtimeFingerprint(), ...setup,
    reviewCallsAllowed: Math.max(0, (review?.budget?.maxCalls ?? 0) - (review?.budget?.usedCalls ?? 0)),
    issues,
    note: "Runtime readiness is separate from project configuration. No tests or model calls were run.",
  };
}
