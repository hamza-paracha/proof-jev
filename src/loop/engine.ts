import { randomUUID } from "node:crypto";
import { mkdir, realpath, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { analyzeSnapshot } from "../change/analyze.ts";
import { allowedSnapshotPath, snapshotRepository, type RepositorySnapshot } from "../change/repository.ts";
import { projectConfigSchema, type ProjectConfig } from "../change/schema.ts";
import { verifyChange, type ChangeOptions } from "../change/verify.ts";
import type { ChangeReport } from "../change/report.ts";
import { reviewCode, type GuardReport, type ReviewOptions } from "../review/review.ts";
import { scrubSource } from "../review/questions.ts";
import { redact } from "../verify/redact.ts";
import { RunGate } from "./gate.ts";
import { taskEventSchema, type Requirement, type TaskEvent } from "./schema.ts";

export interface LoopOptions extends ChangeOptions {
  review?: ReviewOptions;
  enableReview?: boolean;
  maxMutants?: number;
  cooldownMs?: number;
  gate?: RunGate;
}
type Mode = "analysis" | "tests" | "complete";
interface Finding { kind: string; message: string; file?: string; line?: number; evidence?: string }
export interface TaskFeedback {
  mode: Mode; snapshotHash: string; stale: boolean;
  decision: "continue" | "needs_attention" | "incomplete" | "checks_passed";
  requirements: (Requirement & { status: "check_passed" | "check_failed" | "unverified" })[];
  changedFiles: string[]; affectedTests: string[]; candidates: number;
  findings: Finding[]; limitations: string[];
  verification?: Pick<ChangeReport, "status" | "reason" | "failure" | "summary" | "artifacts">;
  review?: Pick<GuardReport, "status" | "summary" | "incomplete" | "artifacts">;
}
interface TaskState {
  taskId: string; request: string; requirements: Requirement[]; baseCommit: string;
  initialSnapshotHash: string;
  phase: "active" | "cancelled"; execution: boolean; config?: ProjectConfig; configError?: string;
  latest?: TaskFeedback; report: string;
}

async function canonicalDestination(path: string): Promise<string> {
  try { return await realpath(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return join(await canonicalDestination(dirname(path)), basename(path));
  }
}

/** Harness-neutral session. All commands come from configuration captured at task start. */
export class TaskLoop {
  readonly gate: RunGate;
  private task?: TaskState;
  private active?: AbortController;
  private observed?: string;
  private lastAutomatic = 0;
  constructor(private readonly options: LoopOptions) {
    this.options = { ...options, outputDir: resolve(options.outputDir ?? join(options.projectRoot ?? process.cwd(), "out/verification")) };
    this.gate = options.gate ?? new RunGate();
    if (!Number.isInteger(options.maxMutants ?? 3) || (options.maxMutants ?? 3) < 0 || (options.maxMutants ?? 3) > 25)
      throw new Error("Loop mutation limit must be 0–25");
    if (!Number.isFinite(options.cooldownMs ?? 10000) || (options.cooldownMs ?? 10000) < 0)
      throw new Error("Invalid loop cooldown");
  }
  private async capture(base: string, signal?: AbortSignal) {
    if (!this.options.projectRoot) throw new Error("Configure a repository root before starting a task");
    return snapshotRepository(this.options.projectRoot, base, signal);
  }
  private requireTask() {
    if (!this.task) throw new Error("Start a task first");
    return this.task;
  }
  private view(task: TaskState) {
    return redact({ taskId: task.taskId, request: scrubSource(task.request), baseCommit: task.baseCommit,
      initialSnapshotHash: task.initialSnapshotHash, availableChecks: Object.keys(task.config?.acceptanceChecks ?? {}),
      currentSnapshotHash: undefined as string | undefined,
      phase: task.phase, busy: this.gate.busy, execution: task.execution, configError: task.configError,
      feedback: task.latest, report: task.report });
  }
  private async persist(task: TaskState) {
    await mkdir(resolve(task.report, ".."), { recursive: true, mode: 0o700 });
    const temporary = `${task.report}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ ...this.view(task), busy: false }, null, 2) + "\n", { mode: 0o600 });
    await rename(temporary, task.report);
  }
  async handle(raw: unknown, signal?: AbortSignal): Promise<ReturnType<TaskLoop["view"]>> {
    const event = taskEventSchema.parse(raw);
    if (event.type === "cancel") {
      this.active?.abort();
      const task = this.requireTask(); task.phase = "cancelled";
      if (task.latest) task.latest = { ...task.latest, stale: true, decision: "incomplete" };
      if (!this.gate.busy) await this.persist(task);
      return this.view(task);
    }
    if (event.type === "status") {
      const task = this.requireTask();
      let currentSnapshotHash: string | undefined;
      if (!this.gate.busy) await this.gate.run(async () => {
        const snapshot = await this.capture(task.baseCommit, signal);
        currentSnapshotHash = snapshot.hash;
        if (task.latest && snapshot.hash !== task.latest.snapshotHash) task.latest = { ...task.latest, stale: true, decision: "incomplete" };
      });
      // Old passing evidence must never be interpreted as the current running job's verdict.
      const view = this.view(task);
      if (this.gate.busy && view.feedback) view.feedback = { ...view.feedback, stale: true, decision: "incomplete" };
      return { ...view, currentSnapshotHash };
    }
    const result = await this.gate.run(async () => {
      const controller = new AbortController(); this.active = controller;
      const combined = AbortSignal.any([controller.signal, ...[signal, this.options.signal].filter((s): s is AbortSignal => !!s)]);
      try {
        combined.throwIfAborted();
        if (event.type === "start") return await this.start(event, combined);
        const task = this.requireTask();
        if (task.phase !== "active") throw new Error("Task was cancelled; start a new task");
        if (event.type === "requirements") {
          this.validateRequirements(event.requirements, task.config);
          task.requirements = event.requirements;
          task.latest = undefined;
          await this.persist(task); return this.view(task);
        }
        const snapshot = await this.capture(task.baseCommit, combined);
        return await this.check(task, snapshot, event.type === "complete" ? "complete" : event.runTests ? "tests" : "analysis", combined);
      } catch (error) {
        if (this.task?.latest) this.task.latest = { ...this.task.latest, stale: true, decision: "incomplete" };
        if (this.task) await this.persist(this.task);
        throw error;
      } finally { this.active = undefined; }
    });
    return { ...result, busy: false };
  }
  private async start(event: Extract<TaskEvent, { type: "start" }>, signal: AbortSignal) {
    if (new Set(event.requirements.map(r => r.id)).size !== event.requirements.length) throw new Error("Requirement IDs must be unique");
    const snapshot = await this.capture(event.base, signal);
    signal.throwIfAborted();
    this.options.outputDir = await canonicalDestination(this.options.outputDir!);
    const outputPath = relative(snapshot.root, this.options.outputDir!);
    if (!isAbsolute(outputPath) && outputPath !== ".." && !outputPath.startsWith(`..${sep}`) && allowedSnapshotPath(outputPath))
      throw new Error("Task reports inside the repository must use an excluded directory such as out/verification");
    let config: ProjectConfig | undefined, configError: string | undefined;
    try {
      const data = snapshot.files.get("vouch.config.json");
      if (!data) throw new Error("Add vouch.config.json to enable test execution");
      config = projectConfigSchema.parse(JSON.parse(data.toString()));
    } catch { configError = "No valid vouch.config.json at task start. Configure tests and start a new task."; }
    this.validateRequirements(event.requirements, config);
    const taskId = `task-${randomUUID()}`;
    const task: TaskState = { taskId, request: event.request, requirements: event.requirements,
      baseCommit: snapshot.baseCommit, phase: "active", execution: !!this.options.allowExecution && event.confirmCodeExecution === true,
      initialSnapshotHash: snapshot.hash,
      config, configError, report: join(resolve(this.options.outputDir ?? "out/verification"), taskId, "task.json") };
    this.task = task; this.observed = undefined; this.lastAutomatic = 0;
    await this.persist(task);
    return this.view(task);
  }
  private validateRequirements(requirements: Requirement[], config?: ProjectConfig) {
    if (new Set(requirements.map(r => r.id)).size !== requirements.length) throw new Error("Requirement IDs must be unique");
    for (const r of requirements) if (r.check && (!config || !Object.hasOwn(config.acceptanceChecks, r.check)))
      throw new Error(`Requirement ${r.id} references unknown configured acceptance check ${r.check}`);
  }
  private async check(task: TaskState, snapshot: RepositorySnapshot, mode: Mode, signal: AbortSignal) {
    const rank = { analysis: 0, tests: 1, complete: 2 };
    if (task.latest && !task.latest.stale && task.latest.decision !== "incomplete" && task.latest.snapshotHash === snapshot.hash && rank[task.latest.mode] >= rank[mode]) return this.view(task);
    const plan = analyzeSnapshot(snapshot);
    const feedback: TaskFeedback = { mode, snapshotHash: snapshot.hash, stale: false, decision: "continue",
      requirements: task.requirements.map(r => ({ ...r, status: "unverified" })),
      changedFiles: plan.changedFiles.map(f => f.path), affectedTests: plan.affectedTests, candidates: plan.candidateCount,
      findings: plan.gaps.map(message => ({ kind: "coverage", message })),
      limitations: [...plan.limitations, "A passing named check is evidence for its mapped requirement, not proof that the mapping or task specification is complete.",
        "The host must enforce completion decisions; attaching MCP alone does not install lifecycle hooks."] };
    if (!task.requirements.length) feedback.findings.push({ kind: "requirements", message: "No acceptance requirements supplied. The task cannot receive checks_passed." });
    if (mode !== "analysis") {
      if (!task.execution || !task.config) {
        feedback.findings.push({ kind: "configuration", message: task.configError ?? "Execution requires operator permission and confirmCodeExecution at task start." });
        feedback.decision = "incomplete";
      } else {
        const report = await verifyChange({ base: task.baseCommit, confirmCodeExecution: true }, { ...this.options, signal }, {
          snapshot, config: { ...task.config, totalTimeoutMs: Math.min(task.config.totalTimeoutMs, 60000) }, maxMutants: mode === "complete" && plan.candidateCount ? this.options.maxMutants ?? 3 : 0,
          checks: task.requirements.flatMap(r => r.check ? [r.check] : []),
        });
        feedback.verification = { status: report.status, reason: report.reason, failure: report.failure, summary: report.summary, artifacts: report.artifacts };
        for (const requirement of feedback.requirements) {
          const runs = report.acceptance?.find(c => c.name === requirement.check)?.runs;
          requirement.status = runs?.length === 2 && runs.every(r => r.outcome === "passed") ? "check_passed"
            : runs?.some(r => r.outcome === "failed") ? "check_failed" : "unverified";
        }
        feedback.decision = report.status === "evidence_collected" ? "continue"
          : report.status === "gaps_found" || report.status === "baseline_failed" ? "needs_attention" : "incomplete";
        if (report.status !== "evidence_collected") feedback.findings.push({ kind: "tests", message: report.reason, evidence: report.artifacts.report });
        for (const m of report.mutations.filter(m => m.outcome === "survived")) feedback.findings.push({ kind: "surviving_mutation", file: m.mutation.file,
          line: m.mutation.line, message: m.mutation.suggestedTest, evidence: m.patch });
        feedback.limitations.push(`${report.summary.tested} mutation candidates tested; ${report.summary.untested} untested.`);
      }
    }
    signal.throwIfAborted();
    if (this.options.enableReview && plan.changedFiles.length) {
      if (!this.options.review?.adapter) {
        feedback.findings.push({ kind: "configuration", message: "Requested Jev review is unavailable; configure a provider and persistent budget." });
        if (feedback.decision !== "needs_attention") feedback.decision = "incomplete";
      } else {
        const taskText = [task.request, ...task.requirements.map(r => `${r.id}: ${r.description}`)].join("\n");
        const review = await reviewCode("review_change", { base: task.baseCommit, task: taskText.slice(0, 2000) }, {
          ...this.options.review, projectRoot: this.options.projectRoot, outputDir: this.options.outputDir, concurrency: 1,
          maxCallsPerRun: Math.min(this.options.review.maxCallsPerRun ?? 3, 3), signal,
        });
        feedback.review = { status: review.status, summary: review.summary, incomplete: review.incomplete, artifacts: review.artifacts };
        if (taskText.length > 2000) { feedback.limitations.push("Task context exceeded Jev's 2,000-character bound; review context is incomplete."); if (feedback.decision !== "needs_attention") feedback.decision = "incomplete"; }
        for (const file of review.files) for (const flag of [...file.judgment?.flags ?? [], ...file.judgment?.warnings ?? [], ...file.judgment?.uncertain ?? []])
          feedback.findings.push({ kind: "review", file: file.file, message: `Investigate Jev judgment: ${flag}. Advisory, not a confirmed defect.`, evidence: review.artifacts.report });
        if (review.status === "high_risk" || review.status === "needs_attention") feedback.decision = "needs_attention";
        else if (review.status !== "clean" || review.incomplete) { if (feedback.decision !== "needs_attention") feedback.decision = "incomplete"; }
      }
    } else feedback.limitations.push("No Jev model review ran for this checkpoint.");
    const current = await this.capture(task.baseCommit, signal);
    feedback.stale = current.hash !== snapshot.hash;
    if (feedback.stale) { feedback.decision = "incomplete"; feedback.findings.push({ kind: "stale", message: "Source changed during verification. Run another checkpoint on the current code." }); }
    else if (snapshot.warnings.length && feedback.decision !== "needs_attention") feedback.decision = "incomplete";
    if (mode === "complete" && feedback.decision === "continue") {
      feedback.decision = feedback.requirements.length > 0 && feedback.requirements.every(r => r.status === "check_passed")
        && feedback.verification?.status === "evidence_collected" ? "checks_passed" : "incomplete";
    }
    signal.throwIfAborted();
    task.latest = redact(feedback); await this.persist(task);
    return this.view(task);
  }
  /** Polling requires two matching observations, skips busy jobs and never executes tests. */
  async poll() {
    if (!this.task || this.task.phase !== "active" || this.gate.busy) return undefined;
    const result = await this.gate.run(async () => {
      const task = this.requireTask();
      const controller = new AbortController(); this.active = controller;
      const signal = this.options.signal ? AbortSignal.any([controller.signal, this.options.signal]) : controller.signal;
      try {
        const snapshot = await this.capture(task.baseCommit, signal);
        if (task.latest?.snapshotHash === snapshot.hash && !task.latest.stale) return undefined;
        if (this.observed !== snapshot.hash) {
          this.observed = snapshot.hash;
          if (task.latest && !task.latest.stale) {
            task.latest = { ...task.latest, stale: true, decision: "incomplete" };
            await this.persist(task); return this.view(task);
          }
          return undefined;
        }
        if (Date.now() - this.lastAutomatic < (this.options.cooldownMs ?? 10000)) return undefined;
        this.lastAutomatic = Date.now();
        return await this.check(task, snapshot, "analysis", signal);
      } catch (error) {
        if (task.latest) task.latest = { ...task.latest, stale: true, decision: "incomplete" };
        await this.persist(task); throw error;
      } finally { this.active = undefined; }
    });
    return result ? { ...result, busy: false } : undefined;
  }
}
