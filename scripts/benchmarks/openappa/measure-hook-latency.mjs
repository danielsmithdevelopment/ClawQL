#!/usr/bin/env node
/**
 * Measure OpenAPPA PROTOCOL=1 POST /hook latency (p50 / p999).
 *
 *   CLAWQL_OPENAPPA_URL=http://127.0.0.1:8790 node scripts/benchmarks/openappa/measure-hook-latency.mjs
 *
 * Writes docs/benchmarks/openappa/results-latency.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = (process.env.CLAWQL_OPENAPPA_URL || "http://127.0.0.1:8790").replace(/\/$/, "");
const n = Number(process.env.CLAWQL_OPENAPPA_LATENCY_N || "200");
const timeoutMs = Number(process.env.CLAWQL_OPENAPPA_TIMEOUT_MS || "2000");
const root = `latency-${Date.now()}`;

async function hook(body) {
  const t0 = performance.now();
  const res = await fetch(`${base}/hook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json();
  const ms = performance.now() - t0;
  return { ms, json, status: res.status };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const samples = [];
const start = await hook({
  protocol: 1,
  adapter: "opencode",
  event: "session_start",
  root_id: root,
});
if (start.json.decision !== "ack" && start.json.decision !== "context") {
  console.error("session_start failed", start);
  process.exit(1);
}

for (let i = 0; i < n; i++) {
  const r = await hook({
    protocol: 1,
    adapter: "opencode",
    event: "tool_call",
    root_id: root,
    tool: "mcp__clawql__search",
    arguments: { query: `q${i}` },
    call_id: `lat-${i}`,
  });
  samples.push(r.ms);
  if (r.json.decision !== "allow_call") {
    console.error("unexpected decision", r.json);
    process.exit(2);
  }
}

samples.sort((a, b) => a - b);
const out = {
  measured_at: new Date().toISOString(),
  base_url: base,
  adapter: "opencode",
  tool: "mcp__clawql__search",
  n: samples.length,
  timeout_ms_budget: timeoutMs,
  latency_ms: {
    min: samples[0],
    p50: percentile(samples, 50),
    p90: percentile(samples, 90),
    p99: percentile(samples, 99),
    p999: percentile(samples, 99.9),
    max: samples[samples.length - 1],
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  },
  notes:
    "Hard timeout budget is CLAWQL_OPENAPPA_TIMEOUT_MS (default 2000). Exceeded → sidecar_unavailable fail-closed for writes; reads default closed.",
};

const here = dirname(fileURLToPath(import.meta.url));
const destDir = join(here, "../../../docs/benchmarks/openappa");
mkdirSync(destDir, { recursive: true });
const dest = join(destDir, "results-latency.json");
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
console.log(`wrote ${dest}`);
