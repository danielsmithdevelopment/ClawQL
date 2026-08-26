#!/usr/bin/env node
/**
 * Fetch context flamegraph JSON from mcp-api-adapter for harness-bench / CI.
 *
 * Usage:
 *   node integrations/harness-bench/scripts/fetch-trace.mjs
 *   TRACE_BASE=http://127.0.0.1:8090/mcp-ui node integrations/harness-bench/scripts/fetch-trace.mjs demo-compressed
 *   node integrations/harness-bench/scripts/fetch-trace.mjs --compare
 */

const base = (process.env.TRACE_BASE ?? "http://127.0.0.1:8090/mcp-ui").replace(/\/$/, "");
const arg = process.argv[2] ?? "demo-compressed";

async function fetchGraph(path) {
  const url = `${base}/trace/${path}?format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function summarize(label, graph) {
  const total = graph.totalInputTokens + graph.totalOutputTokens;
  const tool = graph.bySource?.tool_result ?? 0;
  const pct = total > 0 ? Math.round((tool / total) * 100) : 0;
  return {
    label,
    sessionId: graph.sessionId,
    calls: graph.calls,
    totalTokens: total,
    inputTokens: graph.totalInputTokens,
    outputTokens: graph.totalOutputTokens,
    toolResultTokens: tool,
    toolResultPct: pct,
    bySource: graph.bySource,
  };
}

if (arg === "--compare") {
  const data = await fetchGraph("compare");
  const out = {
    compressed: summarize("compressed", data.compressed),
    fat: summarize("fat", data.fat),
    ratio:
      data.compressed.totalInputTokens + data.compressed.totalOutputTokens > 0
        ? (
            (data.fat.totalInputTokens + data.fat.totalOutputTokens) /
            (data.compressed.totalInputTokens + data.compressed.totalOutputTokens)
          ).toFixed(2)
        : null,
  };
  console.log(JSON.stringify(out, null, 2));
  if (out.fat.toolResultPct < 80) {
    console.error("expected fat demo tool_result ≥80% of tokens");
    process.exit(1);
  }
  if (Number(out.ratio) < 3) {
    console.error("expected fat/compressed ratio ≥3×");
    process.exit(1);
  }
} else {
  const graph = await fetchGraph(arg);
  console.log(JSON.stringify(summarize(arg, graph), null, 2));
}
