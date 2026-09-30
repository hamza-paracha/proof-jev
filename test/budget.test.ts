import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ModelBudget } from "../src/verify/budget.ts";
import { redact } from "../src/verify/redact.ts";

it("spending reservations persist across independent budgets; locks and corruption fail closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "budget-"));
  const path = join(directory, "ledger.json");
  try {
    const first = new ModelBudget(2, 0.02, 0.01, path);
    const second = new ModelBudget(2, 0.02, 0.01, path);
    first.reserve(); second.reserve();
    assert.equal(second.usedCalls, 2);
    assert.throws(() => first.reserve(), /limit reached/);
    assert.throws(() => new ModelBudget(2, 0.02, 0.01, path).reserve(), /limit reached/);
    const worker = `import { ModelBudget } from './src/verify/budget.ts';
      try { new ModelBudget(2, 0.02, 0.01, process.env.VERIFY_TEST_LEDGER).reserve(); process.stdout.write('reserved'); }
      catch (error) { process.stdout.write(error.message); }`;
    const child = () => promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", worker],
      { env: { ...process.env, VERIFY_TEST_LEDGER: path }, encoding: "utf8" });
    assert.match((await child()).stdout, /limit reached/, "A new process must inherit consumed limits");
    await writeFile(`${path}.lock`, "interrupted reservation");
    assert.throws(() => new ModelBudget(3, 1, 0.01, path).reserve(), /locked/);
    assert.match((await child()).stdout, /locked/, "A different process must respect an existing lock");
    await rm(`${path}.lock`);
    await writeFile(path, "{}");
    assert.throws(() => new ModelBudget(2, 0.02, 0.01, path), /Invalid spending ledger/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("redaction preserves valid JSON with quotes and backslashes in credentials", () => {
  const previous = process.env.TYPESAFE_API_KEY;
  try {
    process.env.TYPESAFE_API_KEY = 'a"b\\secret';
    const result = redact({ message: `value ${process.env.TYPESAFE_API_KEY}`, array: [process.env.TYPESAFE_API_KEY] });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { message: "value [REDACTED]", array: ["[REDACTED]"] });
  } finally { if (previous === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = previous; }
});
