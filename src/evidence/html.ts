/** A self-contained, offline report. Treat every report string as untrusted text. */
export interface EvidenceDocument {
  eyebrow: string;
  title: string;
  summary: string;
  status: string;
  metrics: { label: string; value: string; detail?: string }[];
  sections: {
    title: string;
    text?: string;
    code?: string;
    table?: { headings: string[]; rows: string[][] };
    links?: { label: string; href: string }[];
  }[];
  notes: string[];
}
export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const href = (value: string) =>
  /^[a-zA-Z0-9_./-]+$/.test(value) &&
  !value.startsWith("/") &&
  !value.split("/").includes("..")
    ? value
    : "#";
export function renderEvidenceHtml(doc: EvidenceDocument): string {
  const e = escapeHtml;
  const tone = ["passed", "clean", "evidence_collected"].includes(doc.status)
    ? "good"
    : ["failed", "error", "baseline_failed"].includes(doc.status)
      ? "bad"
      : "attention";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${e(doc.title.replace(/\n/g, " "))} · Proof-Jev</title>
<style>
:root{color-scheme:light;--paper:#f5f2e9;--ink:#182a26;--muted:#58665f;--line:#cbd0c5;--green:#176343;--rust:#a83829;--gold:#785d13}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 "Avenir Next","Segoe UI",sans-serif}a{color:inherit;text-underline-offset:4px}a:hover{color:var(--green)}a:focus-visible,summary:focus-visible{outline:3px solid var(--green);outline-offset:5px}.page{max-width:1160px;margin:auto;padding:36px 46px 64px}.mast{display:flex;justify-content:space-between;gap:20px;align-items:center;border-bottom:2px solid var(--ink);padding-bottom:20px}.brand{font-size:23px;font-weight:800;letter-spacing:-1px}.mono,.eyebrow,.index,th,.label,.pill{font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace}.mast-note,.eyebrow{font-size:11px;letter-spacing:1.4px;text-transform:uppercase}.hero{display:grid;grid-template-columns:1.3fr 1fr;gap:70px;align-items:end;padding:48px 0 36px}.eyebrow{color:var(--muted);margin:0 0 16px}h1{font:normal clamp(40px,5.8vw,76px)/1.04 Georgia,"Times New Roman",serif;letter-spacing:-2px;margin:0;overflow-wrap:anywhere}.intro{margin:16px 0 0;color:var(--muted);font-size:17px}.pill{display:inline-block;padding:5px 10px;border:1px solid currentColor;border-radius:2px;font-size:11px;text-transform:uppercase;letter-spacing:.8px}.good{color:var(--green);background:#e4ecdf}.bad{color:var(--rust);background:#f2e1d9}.attention{color:var(--gold);background:#eee7cb}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);margin-bottom:26px}.metric{padding:22px 18px 23px 0;min-width:0}.metric+.metric{padding-left:22px;border-left:1px solid var(--line)}.label{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}.value{font-size:33px;font-weight:600;line-height:1.25;letter-spacing:-1px;overflow-wrap:anywhere;margin:7px 0}.detail{font-size:12px;color:var(--muted);line-height:1.4}.section{border-bottom:1px solid var(--line);display:grid;grid-template-columns:45px minmax(0,1fr);gap:10px;padding:25px 0}.index{font-size:12px;color:var(--muted);padding-top:7px}h2{font:normal 26px/1.3 Georgia,"Times New Roman",serif;margin:0 0 10px;letter-spacing:-.4px}p{margin:8px 0 16px;overflow-wrap:anywhere}.content{min-width:0}.table-wrap{overflow:auto;border:1px solid var(--line);margin:16px 0}table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}th{font-size:10px;text-transform:uppercase;letter-spacing:.6px;background:#eaece2;padding:11px 13px}td{padding:12px 13px;border-top:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere;min-width:90px}pre{background:var(--ink);color:#edf1e7;padding:22px;overflow:auto;font-size:13px;line-height:1.7;border-radius:3px;tab-size:2}code{font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace}.links{display:flex;gap:18px;flex-wrap:wrap;font-size:13px}.notes{margin:34px 0 0;padding:20px 24px;background:#eaece2;border-left:3px solid var(--muted)}.notes h2{font-size:21px}.notes li{font-size:13px;color:var(--muted);margin:7px 0}.footer{display:flex;justify-content:space-between;gap:20px;margin-top:28px;font-size:11px;color:var(--muted)}@media(max-width:700px){.page{padding:22px 20px 38px}.hero{grid-template-columns:1fr;gap:22px;padding:32px 0}.mast-note{font-size:9px;max-width:130px;text-align:right}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric:nth-child(3){border-left:0;padding-left:0;border-top:1px solid var(--line)}.metric:nth-child(4){border-top:1px solid var(--line)}.value{font-size:29px}.section{grid-template-columns:26px minmax(0,1fr)}.footer{flex-direction:column;gap:3px}pre{padding:14px;font-size:11px}}@media print{body{background:white}.page{max-width:none;padding:0}.hero{gap:30px;padding:28px 0}h1{font-size:44px}.metrics,.notes,pre{break-inside:avoid}a{text-decoration:none}.section{break-inside:auto}.table-wrap{overflow:visible}pre{white-space:pre-wrap;overflow-wrap:anywhere}}
</style></head><body><main class="page"><header class="mast"><span class="brand">Proof–Jev<span aria-hidden="true"> ↗</span></span><span class="mast-note">Open-source project<br>Uses Jev · verifies with evidence</span></header>
<div class="hero"><div><p class="eyebrow">${e(doc.eyebrow)}</p><h1>${doc.title.split("\n").map(e).join("<br>")}</h1></div><div><span class="pill ${tone}">${e(doc.status.replace(/_/g, " "))}</span><p class="intro">${e(doc.summary)}</p></div></div>
<div class="metrics">${doc.metrics.map((m) => `<div class="metric"><div class="label">${e(m.label)}</div><div class="value">${e(m.value)}</div>${m.detail ? `<div class="detail">${e(m.detail)}</div>` : ""}</div>`).join("")}</div>
${doc.sections.map((s, i) => `<section class="section"><div class="index">${String(i + 1).padStart(2, "0")}</div><div class="content"><h2>${e(s.title)}</h2>${s.text ? `<p>${e(s.text)}</p>` : ""}${s.table ? `<div class="table-wrap" tabindex="0" role="region" aria-label="${e(s.title)} table"><table><thead><tr>${s.table.headings.map((h) => `<th scope="col">${e(h)}</th>`).join("")}</tr></thead><tbody>${s.table.rows.map((row) => `<tr>${row.map((cell) => `<td>${e(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}${s.code !== undefined ? `<details><summary>Inspect source / evidence</summary><pre><code>${e(s.code)}</code></pre></details>` : ""}${s.links?.length ? `<p class="links">${s.links.map((l) => `<a href="${e(href(l.href))}">${e(l.label)} ↗</a>`).join("")}</p>` : ""}</div></section>`).join("")}
<aside class="notes"><h2>What this evidence does—and does not—establish</h2><ul>${doc.notes.map((n) => `<li>${e(n)}</li>`).join("")}</ul></aside><footer class="footer"><span>PROOF–JEV / Evidence you can inspect.</span><span>Offline HTML · no remote assets or scripts</span></footer></main></body></html>`;
}
