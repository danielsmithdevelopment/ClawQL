/**
 * HTML renderer for context-accumulation flamegraphs (GET /mcp-ui/trace/:sessionId).
 */

import type { ContextFlamegraph, TraceFrame, TraceSource } from "./mcp-ui-trace.js";
import {
  TRACE_SOURCE_ORDER,
  coalesceFramesBySource,
} from "./mcp-ui-trace.js";
import { escapeMcpUiHtml } from "./mcp-ui-form.js";

const SOURCE_COLORS: Record<TraceSource, string> = {
  harness_prompt: "#0f766e",
  vault_seed: "#0369a1",
  tool_schema: "#7c3aed",
  tool_result: "#c2410c",
  user: "#ca8a04",
  agent_reasoning: "#64748b",
  model_output: "#15803d",
  other: "#94a3b8",
};

const SOURCE_LABELS: Record<TraceSource, string> = {
  harness_prompt: "Harness prompt",
  vault_seed: "Vault / system-seed",
  tool_schema: "Tool schema",
  tool_result: "Tool result",
  user: "User",
  agent_reasoning: "Agent reasoning",
  model_output: "Model output",
  other: "Other",
};

function frameTitle(f: TraceFrame): string {
  return `${SOURCE_LABELS[f.source]} · ${f.label} · ${f.tokens} tok`;
}

function renderStackBar(
  frames: TraceFrame[],
  totalTokens: number,
  maxTokens: number
): string {
  const widthPct = maxTokens > 0 ? Math.max(4, (totalTokens / maxTokens) * 100) : 4;
  const stacked = coalesceFramesBySource(frames);
  if (stacked.length === 0 || totalTokens <= 0) {
    return `<div class="fg-bar empty" style="width:${widthPct.toFixed(1)}%"><span class="fg-bar-empty">0</span></div>`;
  }
  const segments = stacked
    .filter((f) => f.tokens > 0)
    .map((f) => {
      const segPct = (f.tokens / totalTokens) * 100;
      const color = SOURCE_COLORS[f.source];
      return `<span class="fg-seg" style="width:${segPct.toFixed(2)}%;background:${color}" data-source="${f.source}" title="${escapeMcpUiHtml(frameTitle(f))}"></span>`;
    })
    .join("");
  return `<div class="fg-bar" style="width:${widthPct.toFixed(1)}%" role="img" aria-label="${escapeMcpUiHtml(`${totalTokens} tokens`)}">${segments}</div>`;
}

function renderBySourceTable(bySource: ContextFlamegraph["bySource"]): string {
  const rows = TRACE_SOURCE_ORDER.map((src) => {
    const tokens = bySource[src] ?? 0;
    if (tokens <= 0) return "";
    return `<tr>
      <td><span class="fg-swatch" style="background:${SOURCE_COLORS[src]}"></span>${escapeMcpUiHtml(SOURCE_LABELS[src])}</td>
      <td class="num"><strong>${tokens.toLocaleString()}</strong></td>
    </tr>`;
  })
    .filter(Boolean)
    .join("\n");
  return `<table class="fg-table">
  <thead><tr><th>Source</th><th>Tokens</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="2">No frames</td></tr>`}</tbody>
</table>`;
}

function flamegraphStyles(): string {
  return `<style>
  .fg-wrap { max-width: 960px; margin: 0 auto; padding: 1.25rem 1rem 3rem; font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a; }
  .fg-wrap h1 { font-size: 1.35rem; margin: 0 0 0.35rem; }
  .fg-meta { color: #64748b; font-size: 0.9rem; margin-bottom: 1.25rem; }
  .fg-meta code { background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.85em; }
  .fg-summary { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; }
  .fg-stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem 1rem; min-width: 7rem; }
  .fg-stat .v { font-size: 1.25rem; font-weight: 700; }
  .fg-stat .l { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
  .fg-legend { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; margin: 0 0 1rem; font-size: 0.85rem; }
  .fg-swatch { display: inline-block; width: 0.75rem; height: 0.75rem; border-radius: 2px; margin-right: 0.35rem; vertical-align: middle; }
  .fg-rows { display: flex; flex-direction: column; gap: 0.45rem; margin-bottom: 1.75rem; }
  .fg-row { display: grid; grid-template-columns: 4.5rem 1fr 5.5rem; gap: 0.5rem; align-items: center; }
  .fg-turn { font-size: 0.8rem; color: #475569; font-variant-numeric: tabular-nums; }
  .fg-bar { display: flex; height: 1.35rem; border-radius: 4px; overflow: hidden; min-width: 2rem; background: #e2e8f0; }
  .fg-bar.empty { opacity: 0.5; }
  .fg-seg { display: block; height: 100%; min-width: 2px; }
  .fg-bar-empty { font-size: 0.7rem; padding: 0 0.35rem; color: #64748b; line-height: 1.35rem; }
  .fg-tok { font-size: 0.8rem; text-align: right; font-variant-numeric: tabular-nums; color: #334155; }
  .fg-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-bottom: 1.5rem; }
  .fg-table th, .fg-table td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid #e2e8f0; }
  .fg-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .fg-call { margin-bottom: 0.75rem; padding: 0.65rem 0.75rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 0.85rem; }
  .fg-call-h { font-weight: 600; margin-bottom: 0.35rem; }
  .fg-nav a { color: #0f766e; }
  .fg-err { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 1rem; border-radius: 8px; }
  .fg-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 1.5rem; }
  @media (max-width: 720px) { .fg-compare { grid-template-columns: 1fr; } }
  .fg-panel { border: 1px solid #e2e8f0; border-radius: 10px; padding: 1rem; background: #fff; }
  .fg-panel h2 { font-size: 1rem; margin: 0 0 0.75rem; }
  .fg-panel--fat { border-color: #fdba74; background: #fff7ed; }
  .fg-callout { background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; padding: 0.85rem 1rem; border-radius: 8px; margin-bottom: 1.25rem; font-size: 0.95rem; }
  .fg-callout strong { color: #047857; }
  .fg-bar { height: 1.75rem; }
  .fg-bar--emphasis .fg-seg[data-source="tool_result"] { box-shadow: inset 0 0 0 2px #7c2d12; }
</style>`;
}

/**
 * Full HTML page for a context flamegraph session.
 */
export function renderContextFlamegraphPage(
  graph: ContextFlamegraph,
  opts?: { basePath?: string }
): string {
  const base = (opts?.basePath ?? "/mcp-ui").replace(/\/$/, "") || "/mcp-ui";
  const totalTokens = graph.totalInputTokens + graph.totalOutputTokens;
  const turnTotals = graph.turns.map((t) => t.inputTokens + t.outputTokens);
  const maxTokens = Math.max(1, ...turnTotals, totalTokens);
  const legend = TRACE_SOURCE_ORDER.map(
    (src) =>
      `<span><span class="fg-swatch" style="background:${SOURCE_COLORS[src]}"></span>${escapeMcpUiHtml(SOURCE_LABELS[src])}</span>`
  ).join("\n");

  const rows = graph.turns
    .map((t) => {
      const turnTok = t.inputTokens + t.outputTokens;
      const bar = renderStackBar(t.frames, turnTok, maxTokens);
      return `<div class="fg-row">
  <div class="fg-turn">Turn ${t.turn}</div>
  ${bar}
  <div class="fg-tok">${turnTok.toLocaleString()} tok</div>
</div>`;
    })
    .join("\n");

  const callDetails = graph.turns
    .map((t) => {
      const frameList = coalesceFramesBySource(t.frames)
        .map(
          (f) =>
            `<li><span class="fg-swatch" style="background:${SOURCE_COLORS[f.source]}"></span>${escapeMcpUiHtml(SOURCE_LABELS[f.source])}: <strong>${f.tokens}</strong> — ${escapeMcpUiHtml(f.label)}</li>`
        )
        .join("");
      return `<div class="fg-call">
  <div class="fg-call-h">Turn ${t.turn} · call <code>${escapeMcpUiHtml(t.callId.slice(0, 12))}</code>${t.modelId ? ` · ${escapeMcpUiHtml(t.modelId)}` : ""}${t.latencyMs != null ? ` · ${t.latencyMs}ms` : ""}</div>
  <ul style="margin:0;padding-left:1.1rem">${frameList || "<li>No frames</li>"}</ul>
</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Context flamegraph · ${escapeMcpUiHtml(graph.sessionId)}</title>
  ${flamegraphStyles()}
</head>
<body>
  <div class="fg-wrap">
    <p class="fg-nav"><a href="${escapeMcpUiHtml(base)}/">← MCP UI catalog</a></p>
    <h1>Context accumulation flamegraph</h1>
    <p class="fg-meta">Session <code>${escapeMcpUiHtml(graph.sessionId)}</code> · ${graph.calls} model call(s) · stacked by source (input + output tokens)</p>
    <div class="fg-summary">
      <div class="fg-stat"><div class="v">${totalTokens.toLocaleString()}</div><div class="l">Total tokens</div></div>
      <div class="fg-stat"><div class="v">${graph.totalInputTokens.toLocaleString()}</div><div class="l">Input</div></div>
      <div class="fg-stat"><div class="v">${graph.totalOutputTokens.toLocaleString()}</div><div class="l">Output</div></div>
      <div class="fg-stat"><div class="v">${graph.turns.length}</div><div class="l">Turns</div></div>
    </div>
    <div class="fg-legend">${legend}</div>
    <div class="fg-rows">${rows || '<p class="fg-meta">No turns in this session.</p>'}</div>
    <h2 style="font-size:1.05rem">By source</h2>
    ${renderBySourceTable(graph.bySource)}
    <h2 style="font-size:1.05rem">Per-turn breakdown</h2>
    ${callDetails || "<p class=\"fg-meta\">No calls.</p>"}
    <p class="fg-meta">JSON: <a href="${escapeMcpUiHtml(base)}/trace/${encodeURIComponent(graph.sessionId)}?format=json"><code>?format=json</code></a>
      · Side-by-side: <a href="${escapeMcpUiHtml(base)}/trace/compare"><strong>compare demos</strong></a>
      · <a href="${escapeMcpUiHtml(base)}/trace/demo-compressed">compressed</a> · <a href="${escapeMcpUiHtml(base)}/trace/demo-fat">fat</a></p>
  </div>
</body>
</html>`;
}

export function renderTraceNotFoundPage(
  sessionId: string,
  opts?: { basePath?: string; hint?: string }
): string {
  const base = (opts?.basePath ?? "/mcp-ui").replace(/\/$/, "") || "/mcp-ui";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Trace not found</title>
  ${flamegraphStyles()}
</head>
<body>
  <div class="fg-wrap">
    <p class="fg-nav"><a href="${escapeMcpUiHtml(base)}/">← MCP UI catalog</a></p>
    <div class="fg-err">
      <p><strong>No trace for session</strong> <code>${escapeMcpUiHtml(sessionId)}</code></p>
      <p>${escapeMcpUiHtml(opts?.hint ?? "Provide listTraceCalls on AttachMcpUiOptions, or open a demo session.")}</p>
    </div>
    <p class="fg-meta">Try: <a href="${escapeMcpUiHtml(base)}/trace/compare">compare demos</a> · <a href="${escapeMcpUiHtml(base)}/trace/demo-compressed">demo-compressed</a> · <a href="${escapeMcpUiHtml(base)}/trace/demo-fat">demo-fat</a></p>
  </div>
</body>
</html>`;
}

function renderComparePanel(
  graph: ContextFlamegraph,
  maxTokens: number,
  opts: { title: string; subtitle: string; emphasis?: boolean }
): string {
  const totalTokens = graph.totalInputTokens + graph.totalOutputTokens;
  const toolResult = graph.bySource.tool_result ?? 0;
  const toolPct = totalTokens > 0 ? Math.round((toolResult / totalTokens) * 100) : 0;
  const rows = graph.turns
    .map((t) => {
      const turnTok = t.inputTokens + t.outputTokens;
      const barClass = opts.emphasis ? "fg-bar fg-bar--emphasis" : "fg-bar";
      const barInner = renderStackBar(t.frames, turnTok, maxTokens).replace(
        'class="fg-bar"',
        `class="${barClass}"`
      );
      return `<div class="fg-row">
  <div class="fg-turn">Turn ${t.turn}</div>
  ${barInner}
  <div class="fg-tok">${turnTok.toLocaleString()} tok</div>
</div>`;
    })
    .join("\n");

  return `<div class="fg-panel${opts.emphasis ? " fg-panel--fat" : ""}">
  <h2>${escapeMcpUiHtml(opts.title)}</h2>
  <p class="fg-meta">${escapeMcpUiHtml(opts.subtitle)} · <strong>${totalTokens.toLocaleString()}</strong> total · tool result <strong>${toolPct}%</strong></p>
  <div class="fg-rows">${rows}</div>
  ${renderBySourceTable(graph.bySource)}
</div>`;
}

/**
 * Side-by-side compressed vs fat — Act 3 closer with shared scale.
 */
export function renderTraceComparePage(
  compressed: ContextFlamegraph,
  fat: ContextFlamegraph,
  opts?: { basePath?: string }
): string {
  const base = (opts?.basePath ?? "/mcp-ui").replace(/\/$/, "") || "/mcp-ui";
  const cTotal = compressed.totalInputTokens + compressed.totalOutputTokens;
  const fTotal = fat.totalInputTokens + fat.totalOutputTokens;
  const cTool = compressed.bySource.tool_result ?? 0;
  const fTool = fat.bySource.tool_result ?? 0;
  const ratio = cTotal > 0 ? (fTotal / cTotal).toFixed(1) : "—";
  const maxTokens = Math.max(
    1,
    ...compressed.turns.map((t) => t.inputTokens + t.outputTokens),
    ...fat.turns.map((t) => t.inputTokens + t.outputTokens),
    cTotal,
    fTotal
  );
  const legend = TRACE_SOURCE_ORDER.map(
    (src) =>
      `<span><span class="fg-swatch" style="background:${SOURCE_COLORS[src]}"></span>${escapeMcpUiHtml(SOURCE_LABELS[src])}</span>`
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Context flamegraph — compressed vs fat</title>
  ${flamegraphStyles()}
</head>
<body>
  <div class="fg-wrap" style="max-width:1100px">
    <p class="fg-nav"><a href="${escapeMcpUiHtml(base)}/">← MCP UI catalog</a></p>
    <h1>Both-sides compression — same task, two contexts</h1>
    <p class="fg-meta">Shared scale · left = search/execute projection · right = naive full tool dumps</p>
    <div class="fg-callout"><strong>At a glance:</strong> fat uses <strong>${ratio}×</strong> tokens (${fTotal.toLocaleString()} vs ${cTotal.toLocaleString()}). Tool result is <strong>${Math.round((fTool / fTotal) * 100)}%</strong> of fat (${fTool.toLocaleString()} tok) vs <strong>${Math.round((cTool / cTotal) * 100)}%</strong> compressed — the orange bar should dominate the right column only.</div>
    <div class="fg-legend">${legend}</div>
    <div class="fg-compare">
      ${renderComparePanel(compressed, maxTokens, {
        title: "demo-compressed (search → execute)",
        subtitle: "Projected tool results",
      })}
      ${renderComparePanel(fat, maxTokens, {
        title: "demo-fat (naive dumps)",
        subtitle: "Untrimmed OpenAPI / page context",
        emphasis: true,
      })}
    </div>
    <p class="fg-meta">JSON: <a href="${escapeMcpUiHtml(base)}/trace/demo-compressed?format=json">compressed</a> · <a href="${escapeMcpUiHtml(base)}/trace/demo-fat?format=json">fat</a>
      · Live session: <code>/mcp-ui/trace/:sessionId</code> when <code>listTraceCalls</code> is wired</p>
  </div>
</body>
</html>`;
}

export { SOURCE_COLORS, SOURCE_LABELS };
