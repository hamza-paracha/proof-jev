import assert from "node:assert/strict";
import { it } from "node:test";
import { renderEvidenceHtml } from "../src/evidence/html.ts";

it("renders untrusted evidence as text and restricts links to local artifacts", () => {
  const attack = '<script>alert("unsafe")</script><img src=x onerror=alert(1)>';
  const html = renderEvidenceHtml({
    eyebrow: attack,
    title: attack,
    summary: attack,
    status: attack,
    metrics: [{ label: attack, value: attack, detail: attack }],
    sections: [
      {
        title: attack,
        text: attack,
        code: attack,
        table: { headings: [attack], rows: [[attack]] },
        links: [
          { label: attack, href: "javascript:alert(1)" },
          { label: "remote", href: "https://example.com" },
          { label: "escape", href: "../secret" },
          { label: "absolute", href: "/secret" },
          { label: "safe", href: "mutations/report.json" },
        ],
      },
    ],
    notes: [attack],
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('href="https:'));
  assert.ok(!html.includes('href="../'));
  assert.ok(!html.includes('href="/secret'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="mutations\/report.json"/);
  assert.match(html, /default-src 'none'/);
});

it("retains inspectable source evidence while omitting absent source sections", () => {
  const source = 'if (total < 0) throw new Error("invalid");';
  const html = renderEvidenceHtml({
    eyebrow: "Mutation evidence", title: "Validation", summary: "A surviving change", status: "gaps_found", metrics: [], notes: [],
    sections: [{ title: "Source", code: source }, { title: "Explanation", text: "Reject negative totals." }],
  });
  assert.match(html, /if \(total &lt; 0\) throw new Error\(&quot;invalid&quot;\);/);
  assert.equal((html.match(/<details>/g) ?? []).length, 1);
  assert.ok(!html.includes('<code>undefined</code>'));
});
