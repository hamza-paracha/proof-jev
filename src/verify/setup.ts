import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { chromium } from "playwright";
import { projectConfigSchema } from "../change/schema.ts";
import type { ReviewOptions } from "../review/review.ts";

const exec = promisify(execFile);
export async function pluginStatus(options: { projectRoot?: string; allowExecution?: boolean; review?: ReviewOptions } = {}) {
  const browser = existsSync(chromium.executablePath());
  let projectReady = false;
  if (options.projectRoot) {
    try { await exec("git", ["-C", options.projectRoot, "rev-parse", "--show-toplevel"], { timeout: 3000 }); projectReady = true; } catch {}
  }
  let config: "missing" | "valid" | "invalid" = "missing";
  if (projectReady) {
    try {
      const path = join(options.projectRoot!, "vouch.config.json");
      if ((await stat(path)).size > 64000) config = "invalid";
      else config = projectConfigSchema.safeParse(JSON.parse(await readFile(path, "utf8"))).success ? "valid" : "invalid";
    } catch (error) { config = (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "invalid"; }
  }
  const review = options.review;
  let reviewProjectReady = projectReady;
  if (review?.projectRoot && review.projectRoot !== options.projectRoot) {
    try { await exec("git", ["-C", review.projectRoot, "rev-parse", "--show-toplevel"], { timeout: 3000 }); reviewProjectReady = true; } catch { reviewProjectReady = false; }
  }
  const reviewEnabled = Boolean(review?.adapter && review.budget && review.budget.maxCalls > review.budget.usedCalls && review.budget.reservedUsd + review.budget.estimatePerCallUsd <= review.budget.maxEstimatedUsd + 1e-10);
  return {
    project: { path: options.projectRoot ?? null, ready: projectReady, config },
    capabilities: {
      browser: { ready: browser, next: browser ? "Use inspect_page on your local app, then verify_workflow." : "Install Chromium: npx playwright install chromium in the plugin directory." },
      analysis: { ready: projectReady, next: projectReady ? "Use analyze_change with the base before your changes." : "Open a Git project before starting the plugin, or configure VOUCH_PROJECT_ROOT and restart it." },
      mutation: { ready: projectReady && config === "valid" && options.allowExecution === true,
        next: !projectReady ? "Configure a Git project first." : config !== "valid" ? "Add a valid vouch.config.json with the project's testCommand array. No test command is guessed or executed during setup." : !options.allowExecution ? "Enable VOUCH_ALLOW_EXECUTION=1 for this trusted project and restart the plugin." : "Use verify_change with confirmCodeExecution: true." },
      review: { ready: reviewProjectReady && reviewEnabled,
        next: !reviewProjectReady ? "Configure JEV_GUARD_PROJECT_ROOT or VOUCH_PROJECT_ROOT." : !reviewEnabled ? "Configure a Jev provider and an available persistent JEV_GUARD_* budget. Review remains optional; local checks need no API key." : "Use review_change, check_file, or assess_pr." },
    },
    note: "Setup checks only. No tests, browser sessions, provider requests, or configuration changes were made. Readiness is a snapshot, not a reservation or certification of the application.",
  };
}
