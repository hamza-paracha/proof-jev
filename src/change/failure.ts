import type { ChangeReport } from "./report.ts";
import type { CommandResult } from "./process.ts";
import { scrubSource } from "../verify/redact.ts";

export interface CommandFailure {
  phase: "setup" | "validation" | "baseline" | "acceptance" | "final_baseline";
  check?: string;
  command: string;
  outcome: CommandResult["outcome"];
  exitCode: number | null;
  outputExcerpt: string;
  truncated: boolean;
}

/** Only failing original/check commands belong here; killed mutants are expected. */
export function commandFailure(report: ChangeReport): CommandFailure | undefined {
  const commands: { phase: CommandFailure["phase"]; check?: string; run: CommandResult | undefined }[] = [
    { phase: "setup", run: report.setup }, { phase: "validation", run: report.validation },
    ...report.baseline.map(run => ({ phase: "baseline" as const, run })),
    ...report.acceptance?.flatMap(check => check.runs.map(run => ({ phase: "acceptance" as const, check: check.name, run }))) ?? [],
    { phase: "final_baseline", run: report.finalBaseline },
  ];
  const failed = commands.find(item => item.run && item.run.outcome !== "passed");
  if (!failed?.run) return undefined;
  const run = failed.run;
  const output = scrubSource([run.stderr.trim(), run.stdout.trim()].filter(Boolean).join("\n"));
  // Prefer the actual assertion/error over a long preamble of passing tests.
  const marker = output.search(/(?:^|\n)[^\n]*(?:AssertionError|Error:|not ok\b|FAIL\b)/m);
  const start = marker < 0 ? 0 : Math.max(0, marker - 200);
  const end = Math.min(output.length, start + 2400);
  const command = scrubSource(run.command.map(arg => JSON.stringify(arg)).join(" "));
  return { phase: failed.phase, ...(failed.check ? { check: failed.check } : {}), command: command.slice(0, 1000),
    outcome: run.outcome, exitCode: run.exitCode,
    outputExcerpt: (start ? "[earlier output omitted]\n" : "") + output.slice(start, end) + (end < output.length ? "\n[later output omitted]" : ""),
    truncated: start > 0 || end < output.length || command.length > 1000 };
}
