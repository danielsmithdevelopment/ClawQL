#!/usr/bin/env node
/**
 * Measure OpenAPPA PROTOCOL=1 POST /hook overhead (keep-alive client).
 *
 * Default n=10000 so p999 is meaningful. For smaller samples, prefer p99 —
 * with n=200, "p999" is just the max.
 *
 *   CLAWQL_OPENAPPA_URL=http://127.0.0.1:8790 \
 *     node scripts/benchmarks/openappa/measure-hook-latency.mjs
 *
 * Writes docs/benchmarks/openappa/results-latency.json
 * Reports OpenAPPA overhead separately from ClawQL's ~1.3 ms per-call baseline.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as undiciFetch } from "undici";

const base = (process.env.CLAWQL_OPENAPPA_URL || "http://127.0.0.1:8790").replace(/\/$/, "");
const n = Number(process.env.CLAWQL_OPENAPPA_LATENCY_N || "10000");
const timeoutMs = Number(process.env.CLAWQL_OPENAPPA_TIMEOUT_MS || "250");
/** Published ClawQL gateway per-call baseline (executor latency board). */
const CLAWQL_BASELINE_P50_MS = 1.3;
const root = `latency-${Date.now()}`;

const agent = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connections: 8,
});

async function hook(body) {
  const t0 = performance.now();
  const res = await undiciFetch(`${base}/hook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    dispatcher: agent,
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
/** Rotate roots so trajectory growth does not dominate the overhead sample. */
const ROOT_ROTATE_EVERY = Number(process.env.CLAWQL_OPENAPPA_LATENCY_ROOT_ROTATE || "50");
let rootId = root;
let inRoot = 0;

async function ensureRoot() {
  if (inRoot === 0) {
    const start = await hook({
      protocol: 1,
      adapter: "opencode",
      event: "session_start",
      root_id: rootId,
    });
    if (start.json.decision !== "ack" && start.json.decision !== "context") {
      console.error("session_start failed", start);
      process.exit(1);
    }
  }
}

for (let i = 0; i < n; i++) {
  if (inRoot >= ROOT_ROTATE_EVERY) {
    rootId = `${root}-${Math.floor(i / ROOT_ROTATE_EVERY)}`;
    inRoot = 0;
  }
  await ensureRoot();
  const r = await hook({
    protocol: 1,
    adapter: "opencode",
    event: "tool_call",
    root_id: rootId,
    tool: "mcp__clawql__search",
    arguments: { query: `q${i}` },
    call_id: `lat-${i}`,
  });
  inRoot += 1;
  samples.push(r.ms);
  if (r.json.decision !== "allow_call") {
    console.error("unexpected decision", r.json);
    process.exit(2);
  }
}

samples.sort((a, b) => a - b);
const p50 = percentile(samples, 50);
const p99 = percentile(samples, 99);
const p999 = n >= 1000 ? percentile(samples, 99.9) : null;
const out = {
  measured_at: new Date().toISOString(),
  metric: "openappa_hook_overhead_ms",
  note:
    "OpenAPPA sidecar overhead only (keep-alive undici Agent). Do not fold into published ClawQL per-call latency; report separately when OpenAPPA is enabled.",
  clawql_baseline_p50_ms: CLAWQL_BASELINE_P50_MS,
  openappa_vs_clawql_p50_ratio:
    p50 != null ? Number((p50 / CLAWQL_BASELINE_P50_MS).toFixed(2)) : null,
  base_url: base,
  adapter: "opencode",
  tool: "mcp__clawql__search",
  keep_alive: true,
  root_rotate_every: ROOT_ROTATE_EVERY,
  n: samples.length,
  timeout_ms_budget: timeoutMs,
  latency_ms: {
    min: samples[0],
    p50,
    p90: percentile(samples, 90),
    p99,
    ...(p999 != null
      ? { p999 }
      : { p999: null, p999_omitted: "n<1000 — use p99; with small n p999≈max" }),
    max: samples[samples.length - 1],
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  },
  operational:
    "Hard timeout default 250ms + circuit breaker (CLAWQL_OPENAPPA_CIRCUIT_FAILURES / COOLDOWN_MS). Exceeded → sidecar_unavailable fail-closed for writes; reads default closed.",
};

const here = dirname(fileURLToPath(import.meta.url));
const destDir = join(here, "../../../docs/benchmarks/openappa");
mkdirSync(destDir, { recursive: true });
const dest = join(destDir, "results-latency.json");
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
console.log(`wrote ${dest}`);
await agent.close();
