/**
 * HTML renderer for OTEL span flamegraphs (GET /observability/flame/trace/:traceId).
 */

import { Effect } from "effect";

import type { SpanFlameNode, SpanFlamegraph } from "./span-flame.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function serviceColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 45% 42%)`;
}

function flattenRows(nodes: readonly SpanFlameNode[], acc: SpanFlameNode[] = []): SpanFlameNode[] {
  for (const n of nodes) {
    acc.push(n);
    flattenRows(n.children, acc);
  }
  return acc;
}

function renderBar(node: SpanFlameNode, rootStart: number, totalMs: number): string {
  const left = totalMs > 0 ? ((node.startMs - rootStart) / totalMs) * 100 : 0;
  const width = totalMs > 0 ? Math.max(0.15, (node.durationMs / totalMs) * 100) : 0.15;
  const color = serviceColor(node.serviceName);
  const title = `${node.serviceName} · ${node.name} · ${node.durationMs.toFixed(1)}ms (self ${node.selfMs.toFixed(1)}ms)`;
  return `<div class="sf-row" style="padding-left:${node.depth * 10}px">
    <div class="sf-label">${escapeHtml(node.name)} <span class="sf-svc">${escapeHtml(node.serviceName)}</span></div>
    <div class="sf-track"><span class="sf-bar" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;background:${color}" title="${escapeHtml(title)}"></span></div>
    <div class="sf-ms">${node.durationMs.toFixed(1)}ms</div>
  </div>`;
}

export function renderSpanFlamegraphHtmlEffect(
  graph: SpanFlamegraph,
  opts?: { readonly uiPath?: string }
): Effect.Effect<string> {
  return Effect.sync(() => {
    const uiPath =
      opts?.uiPath ?? `/observability/flame/trace/${encodeURIComponent(graph.traceId)}`;
    const rows = flattenRows(graph.roots)
      .map((n) => renderBar(n, graph.rootStartMs, graph.totalDurationMs || 1))
      .join("\n");
    const services = graph.services
      .map(
        (s) =>
          `<li><span class="sf-swatch" style="background:${serviceColor(s.name)}"></span>${escapeHtml(s.name)} · self ${s.selfMs.toFixed(1)}ms</li>`
      )
      .join("");
    const mostSelf = graph.mostSelfTime
      .map(
        (r) =>
          `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.serviceName)}</td><td class="num">${r.selfMs.toFixed(1)}</td><td class="num">${r.durationMs.toFixed(1)}</td></tr>`
      )
      .join("\n");

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Trace flamegraph · ${escapeHtml(graph.traceId)}</title>
  <style>
    body { margin: 0; background: #f8fafc; color: #0f172a; font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; }
    .sf-wrap { max-width: 1100px; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
    h1 { font-size: 1.4rem; margin: 0 0 0.25rem; font-weight: 650; }
    .sf-meta { color: #64748b; font-size: 0.92rem; margin-bottom: 1rem; }
    .sf-honesty { font-size: 0.85rem; color: #475569; border-left: 3px solid #94a3b8; padding-left: 0.75rem; margin: 0 0 1.25rem; }
    .sf-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1.25rem; }
    @media (max-width: 860px) { .sf-grid { grid-template-columns: 1fr; } }
    .sf-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.9rem 1rem; }
    .sf-row { display: grid; grid-template-columns: minmax(140px, 28%) 1fr 72px; gap: 0.4rem; align-items: center; margin: 0.18rem 0; font-size: 0.78rem; }
    .sf-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sf-svc { color: #64748b; }
    .sf-track { position: relative; height: 16px; background: #f1f5f9; border-radius: 3px; }
    .sf-bar { position: absolute; top: 0; bottom: 0; border-radius: 3px; min-width: 2px; }
    .sf-ms { text-align: right; font-variant-numeric: tabular-nums; color: #334155; }
    .sf-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 0.35rem; vertical-align: middle; }
    ul { margin: 0; padding-left: 1.1rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th, td { text-align: left; padding: 0.35rem 0.25rem; border-bottom: 1px solid #e2e8f0; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    code { font-size: 0.85em; }
  </style>
</head>
<body>
  <main class="sf-wrap">
    <h1>Trace flamegraph</h1>
    <p class="sf-meta">Tempo / OpenTelemetry spans · <code>${escapeHtml(graph.traceId)}</code> · ${graph.totalDurationMs.toFixed(1)}ms total · ${graph.spanCount} spans · ${graph.serviceCount} services · <a href="${escapeHtml(uiPath)}?format=json">JSON</a></p>
    <p class="sf-honesty">${escapeHtml(graph.honesty)}</p>
    <div class="sf-grid">
      <section class="sf-card">
        <h2 style="font-size:1rem;margin:0 0 0.75rem">Timeline</h2>
        ${rows || `<p>No spans</p>`}
      </section>
      <aside>
        <section class="sf-card" style="margin-bottom:1rem">
          <h2 style="font-size:1rem;margin:0 0 0.5rem">Services (self time)</h2>
          <ul>${services || "<li>None</li>"}</ul>
        </section>
        <section class="sf-card">
          <h2 style="font-size:1rem;margin:0 0 0.5rem">Most self time</h2>
          <table>
            <thead><tr><th>Span</th><th>Service</th><th class="num">Self ms</th><th class="num">Total ms</th></tr></thead>
            <tbody>${mostSelf || `<tr><td colspan="4">None</td></tr>`}</tbody>
          </table>
        </section>
      </aside>
    </div>
  </main>
</body>
</html>`;
  });
}
