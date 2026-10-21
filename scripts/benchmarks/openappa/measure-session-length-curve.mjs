#!/usr/bin/env node
/**
 * Measure OpenAPPA /hook latency vs session length within ONE root_id.
 *
 * Real agent sessions keep one trajectory for hundreds/thousands of tool calls.
 * Root rotation hides trajectory growth — this curve is the production-relevant
 * number. Pair tool_call + tool_result so the log settles like a real host.
 *
 * Milestones default: 10, 100, 1000, 5000
 *
 *   CLAWQL_OPENAPPA_URL=http://127.0.0.1:8790 \
 *     node scripts/benchmarks/openappa/measure-session-length-curve.mjs
 *
 * Uses CLAWQL_OPENAPPA_CURVE_TIMEOUT_MS (default 5000) so the curve can finish
 * past the production 250ms budget; records when that budget would be exceeded.
 *
 * Writes docs/benchmarks/openappa/results-session-length-curve.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as undiciFetch } from "undici";

const base = (process.env.CLAWQL_OPENAPPA_URL || "http://127.0.0.1:8790").replace(/\/$/, "");
/** Production fail-closed budget (documented default). */
const PRODUCTION_TIMEOUT_MS = Number(process.env.CLAWQL_OPENAPPA_TIMEOUT_MS || "250");
/** Measurement budget — high enough to finish the curve past production timeout. */
const measureTimeoutMs = Number(process.env.CLAWQL_OPENAPPA_CURVE_TIMEOUT_MS || "5000");
const milestones = (process.env.CLAWQL_OPENAPPA_CURVE_MILESTONES || "10,100,1000,5000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => a - b);
const maxN = milestones[milestones.length - 1] ?? 5000;
const WINDOW = Number(process.env.CLAWQL_OPENAPPA_CURVE_WINDOW || "20");
const CLAWQL_BASELINE_P50_MS = 1.3;
const rootId = `curve-${Date.now()}`;

const agent = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connections: 4,
});

async function hook(body) {
  const t0 = performance.now();
  const res = await undiciFetch(`${base}/hook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(measureTimeoutMs),
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

function windowStats(samples, callIndex) {
  const start = Math.max(0, callIndex - WINDOW);
  const end = Math.min(samples.length, callIndex);
  const slice = samples.slice(start, end).slice().sort((a, b) => a - b);
  return {
    call_index: callIndex,
    window: slice.length,
    p50: percentile(slice, 50),
    p90: percentile(slice, 90),
    mean: slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null,
    min: slice[0] ?? null,
    max: slice[slice.length - 1] ?? null,
    exceeds_production_timeout_ms:
      percentile(slice, 50) != null ? percentile(slice, 50) > PRODUCTION_TIMEOUT_MS : null,
  };
}

function writeOut(out) {
  const here = dirname(fileURLToPath(import.meta.url));
  const destDir = join(here, "../../../docs/benchmarks/openappa");
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, "results-session-length-curve.json");
  writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out, null, 2));
  console.log(`wrote ${dest}`);
  return dest;
}

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

const callSamples = [];
const pairSamples = [];
let firstExceedProduction = null;
let stoppedEarly = null;

try {
  for (let i = 1; i <= maxN; i++) {
    const tPair0 = performance.now();
    const call = await hook({
      protocol: 1,
      adapter: "opencode",
      event: "tool_call",
      root_id: rootId,
      tool: "mcp__clawql__search",
      arguments: { query: `curve-${i}` },
      call_id: `curve-${i}`,
    });
    if (call.json.decision !== "allow_call") {
      stoppedEarly = { at: i, reason: "unexpected_tool_call", detail: call.json };
      break;
    }
    callSamples.push(call.ms);
    if (firstExceedProduction == null && call.ms > PRODUCTION_TIMEOUT_MS) {
      firstExceedProduction = { call_index: i, tool_call_ms: call.ms };
    }

    const result = await hook({
      protocol: 1,
      adapter: "opencode",
      event: "tool_result",
      root_id: rootId,
      tool: "mcp__clawql__search",
      arguments: { query: `curve-${i}` },
      call_id: `curve-${i}`,
      outcome: { status: "success", body: { ok: true, i } },
    });
    if (result.json.decision === "refuse" || result.json.decision === "block") {
      stoppedEarly = { at: i, reason: "unexpected_tool_result", detail: result.json };
      break;
    }
    pairSamples.push(performance.now() - tPair0);

    if (i % 500 === 0 || milestones.includes(i)) {
      process.stderr.write(`curve progress: call ${i}/${maxN} tool_call_ms=${call.ms.toFixed(2)}\n`);
    }
  }
} catch (err) {
  stoppedEarly = {
    at: callSamples.length,
    reason: err && err.name === "TimeoutError" ? "measure_timeout" : "error",
    detail: err instanceof Error ? err.message : String(err),
  };
  process.stderr.write(`curve stopped early: ${JSON.stringify(stoppedEarly)}\n`);
}

const reached = milestones.filter((m) => m <= callSamples.length);
const curve = reached.map((m) => ({
  ...windowStats(callSamples, m),
  pair_p50: windowStats(pairSamples, m).p50,
}));

const first = curve[0];
const last = curve[curve.length - 1];
const growthRatio =
  first?.p50 && last?.p50 ? Number((last.p50 / first.p50).toFixed(2)) : null;
const grows = growthRatio != null && growthRatio >= 1.5;

const out = {
  measured_at: new Date().toISOString(),
  metric: "openappa_hook_overhead_vs_session_length",
  note:
    "Single root_id (production shape). Samples tool_call latency in a window ending at each milestone; pairs each call with tool_result. Publish alongside short-session amortized numbers — do not treat root rotation as a product setting.",
  clawql_baseline_p50_ms: CLAWQL_BASELINE_P50_MS,
  base_url: base,
  adapter: "opencode",
  tool: "mcp__clawql__search",
  keep_alive: true,
  root_id_policy: "single_root_for_entire_curve — ClawQL never rotates root_id mid-session",
  root_id: rootId,
  max_calls_requested: maxN,
  calls_completed: callSamples.length,
  window: WINDOW,
  production_timeout_ms: PRODUCTION_TIMEOUT_MS,
  measure_timeout_ms: measureTimeoutMs,
  first_exceeds_production_timeout: firstExceedProduction,
  stopped_early: stoppedEarly,
  curve_tool_call_ms: curve,
  growth: {
    p50_ratio_last_over_first: growthRatio,
    grows_with_session_length: grows,
    remediation: grows
      ? "OpenAPPA trajectory cost grows ~linearly with session length (HTTP sidecar). Do not hide via root rotation (drops denials/approvals/labels). Fix in OpenAPPA: keep warm incremental label projection / sliding window over the event log so per-call cost stays flat. Until then, long sessions will breach CLAWQL_OPENAPPA_TIMEOUT_MS and fail closed (circuit). ClawQL keeps one root_id per MCP session."
      : "Per-call cost stayed roughly flat across milestones under this battery/runtime.",
  },
};

writeOut(out);
await agent.close();
process.exit(0);
