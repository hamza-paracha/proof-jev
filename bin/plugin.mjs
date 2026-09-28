#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

// Plugin hosts normally start MCP in the open project. Never guess the plugin's own
// checkout as the user's repository, and never grant execution or paid-call permission.
if (!process.env.VOUCH_PROJECT_ROOT) {
  try {
    const plugin = realpathSync(dirname(fileURLToPath(new URL("../package.json", import.meta.url))));
    const cwd = realpathSync(process.cwd());
    const inside = relative(plugin, cwd);
    if (inside.startsWith("..") || isAbsolute(inside)) {
      process.env.VOUCH_PROJECT_ROOT = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    }
  } catch { /* get_setup_status explains missing project configuration. */ }
}
await import("./vouch.mjs");
