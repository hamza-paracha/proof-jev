import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

export const VERSION = "0.7.1";
export function runtimeFingerprint(): string {
  const hash = createHash("sha256");
  for (const name of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".ts")).sort()) {
    hash.update(name).update(readFileSync(new URL(name, import.meta.url)));
  }
  for (const name of readdirSync(new URL("../change/", import.meta.url)).filter((n) => n.endsWith(".ts")).sort()) hash.update(name).update(readFileSync(new URL(`../change/${name}`, import.meta.url)));
  for (const name of readdirSync(new URL("../review/", import.meta.url)).filter((n) => n.endsWith(".ts")).sort()) hash.update(name).update(readFileSync(new URL(`../review/${name}`, import.meta.url)));
  for (const name of readdirSync(new URL("../evidence/", import.meta.url)).filter((n) => n.endsWith(".ts")).sort()) hash.update(name).update(readFileSync(new URL(`../evidence/${name}`, import.meta.url)));
  hash.update(readFileSync(new URL("../../package.json", import.meta.url)));
  return hash.digest("hex");
}
