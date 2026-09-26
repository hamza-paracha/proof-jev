import { renderEvidenceHtml } from "./html.ts";
import type { GuardReport } from "../review/review.ts";
import type { ChangeReport } from "../change/report.ts";
import type { VerificationReport } from "../verify/runtime.ts";

export function reviewHtml(r: GuardReport) {
  return renderEvidenceHtml({
    eyebrow: "Structured code review / Jev",
    title: "The diff,\nunder review.",
    status: r.status,
    summary: r.summary,
    metrics: [
      {
        label: "Files reviewed",
        value: `${r.totals.filesReviewed} / ${r.totals.filesChanged}`,
      },
      { label: "Flags", value: String(r.totals.highConfidenceFlags) },
      { label: "Uncertain", value: String(r.totals.lowConfidenceUncertain) },
      { label: "Model calls", value: String(r.cost.totalCalls) },
    ],
    sections: [
      {
        title: "File evidence",
        table: {
          headings: ["File", "Status", "Changed ranges", "Flags / warnings"],
          rows: r.files.map((f) => [
            f.file,
            f.status + (f.truncated ? " · partial context" : ""),
            f.evidence?.hunks
              .flatMap((h) => [
                ...h.added.map((l) => `+${l.start}–${l.end}`),
                ...h.deleted.map((l) => `base −${l.start}–${l.end}`),
              ])
              .join(", ") ?? "—",
            [
              ...(f.judgment?.flags ?? []),
              ...(f.judgment?.warnings ?? []),
            ].join(", ") || "None reported",
          ]),
        },
      },
      {
        title: "Judgment details",
        table: {
          headings: [
            "File / scope",
            "Question",
            "Answer",
            "Confidence",
            "Band",
          ],
          rows: [...r.files, ...(r.pr ? [r.pr] : [])].flatMap((f) =>
            Object.values(f.judgment?.verdicts ?? {}).map((v) => [
              f.file,
              v.question,
              String(v.answer),
              `${(v.confidence * 100).toFixed(1)}%`,
              v.level,
            ]),
          ),
        },
      },
      {
        title: "Reproducible record",
        text: `Base ${r.base}. Diff fingerprint ${r.snapshotHash}.`,
        links: [
          { label: "Full report JSON", href: "report.json" },
          { label: "Markdown", href: "report.md" },
        ],
      },
    ],
    notes: r.limitations,
  });
}
export function changeHtml(r: ChangeReport) {
  return renderEvidenceHtml({
    eyebrow: "Executable evidence / mutation testing",
    title: "Do the tests\nnotice a bug?",
    status: r.status,
    summary: r.reason,
    metrics: [
      { label: "Detected", value: String(r.summary.detected) },
      {
        label: "Survived",
        value: String(r.summary.survived),
        detail: "Tests still passed after these changes",
      },
      {
        label: "Tested / candidates",
        value: `${r.summary.tested} / ${r.summary.candidates}`,
      },
      {
        label: "Baseline runs",
        value: String(r.baseline.length),
        detail: r.baseline.map((b) => b.outcome).join(" · "),
      },
    ],
    sections: [
      {
        title: "Mutation evidence",
        table: {
          headings: [
            "Location",
            "Deliberate change",
            "Outcome",
            "Test to investigate",
          ],
          rows: r.mutations.map((m) => [
            `${m.mutation.file}:${m.mutation.line}`,
            `${m.mutation.before} → ${m.mutation.after}`,
            m.outcome,
            m.mutation.suggestedTest,
          ]),
        },
        links: r.mutations.map((m) => ({
          label: `Patch ${m.mutation.id}`,
          href: `patches/${m.mutation.id}.diff`,
        })),
      },
      {
        title: "Scope",
        text: `Base ${r.plan.baseCommit}. Snapshot ${r.plan.snapshotHash}. Affected tests: ${r.plan.affectedTests.join(", ") || "none identified"}.`,
        links: [
          { label: "Commands and results", href: "report.json" },
          { label: "Analysis plan", href: "plan.json" },
          { label: "Markdown", href: "report.md" },
        ],
      },
    ],
    notes: [...r.plan.gaps, ...r.limitations],
  });
}
export function browserHtml(r: VerificationReport) {
  return renderEvidenceHtml({
    eyebrow: "Executable evidence / browser workflow",
    title: "What happened\nafter the click?",
    status: r.status,
    summary: r.reason,
    metrics: [
      {
        label: "Steps passed",
        value: `${r.steps.filter((s) => s.status === "passed").length} / ${r.input.steps.length}`,
      },
      { label: "Model calls", value: String(r.cost.attemptedCalls) },
      { label: "Blocked requests", value: String(r.blockedRequests.length) },
      { label: "Duration", value: `${(r.durationMs / 1000).toFixed(1)}s` },
    ],
    sections: [
      {
        title: "Action and assertion evidence",
        table: {
          headings: ["Step", "Operation", "Result", "Observation"],
          rows: r.steps.map((s) => [
            String(s.index + 1),
            s.action.kind,
            s.status,
            s.response
              ? `${s.response.method} ${s.response.url} → ${s.response.status}${s.reason ? ` · ${s.reason}` : ""}`
              : (s.reason ?? s.route),
          ]),
        },
      },
      {
        title: "Observed signals",
        table: {
          headings: ["Step", "Category", "Signal"],
          rows: r.findings.map((f) => [
            String(f.step + 1),
            f.category,
            f.message,
          ]),
        },
      },
      {
        title: "Replay this workflow",
        text: `Runtime ${r.manifest.toolVersion}; fingerprint ${r.manifest.runtimeFingerprint}.`,
        links: [
          { label: "Full report JSON", href: "report.json" },
          { label: "Workflow JSON", href: "workflow.json" },
          { label: "Trace JSONL", href: "trace.jsonl" },
        ],
      },
    ],
    notes: [
      "Only the configured assertions and origin were checked. Passing is not proof of whole-application correctness.",
      "A read endpoint is only as authoritative as its implementation. Use an independent persisted-state check when possible.",
      "Reports may contain local application data. Review before sharing.",
    ],
  });
}
