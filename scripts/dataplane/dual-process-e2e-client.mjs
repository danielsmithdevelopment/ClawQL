#!/usr/bin/env node
/**
 * Dual-process e2e CF known-op board client.
 *
 * Arms hit MCP endpoints end-to-end. For dual_process, memory samples sum
 * Bun host + Rust dataplane Anonymous RSS (both processes on the path).
 * Latency is wall-clock client → host (→ dataplane) → mock.
 *
 * Env:
 *   CLAWQL_BUN_MCP_URL / CLAWQL_BUN_PID — single-process Bun arm
 *   CLAWQL_DUAL_MCP_URL / CLAWQL_DUAL_BUN_PID / CLAWQL_DUAL_DP_PID — dual arm
 *   CF_DP_REPS, CF_DP_ITERS, CF_DP_OUT, COMPARISON_LABEL
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAWQL_STEP_SHAPES } from "./lib/clawql-shapes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ACCEPT = "application/json, text/event-stream";
const LABEL = process.env.COMPARISON_LABEL || "dual-process-e2e";
const REPS = Math.max(1, Number(process.env.CF_DP_REPS || 3));
const ITERS = Math.max(1, Number(process.env.CF_DP_ITERS || 10000));
const OUT =
  process.env.CF_DP_OUT ||
  join(HERE, "../../tmp/dataplane-dual-process-e2e-summary.json");

const ARMS = [
  {
    id: "bun_host",
    url: process.env.CLAWQL_BUN_MCP_URL,
    pids: [Number(process.env.CLAWQL_BUN_PID || 0)].filter((p) => p > 0),
    memoryMode: "single",
  },
  {
    id: "dual_process",
    url: process.env.CLAWQL_DUAL_MCP_URL,
    pids: [
      Number(process.env.CLAWQL_DUAL_BUN_PID || 0),
      Number(process.env.CLAWQL_DUAL_DP_PID || 0),
    ].filter((p) => p > 0),
    memoryMode: "sum",
  },
];

for (const a of ARMS) {
  if (!a.url) {
    console.error(`missing MCP URL for ${a.id}`);
    process.exit(2);
  }
  if (!a.pids.length) {
    console.error(`missing PID(s) for ${a.id}`);
    process.exit(2);
  }
}

const STEPS = Object.keys(CLAWQL_STEP_SHAPES)
  .map(Number)
  .sort((a, b) => a - b)
  .map((n) => CLAWQL_STEP_SHAPES[n]);

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

function readAnonKb(pid) {
  if (!pid) return null;
  const p = `/proc/${pid}/smaps_rollup`;
  if (!existsSync(p)) {
    try {
      const st = readFileSync(`/proc/${pid}/status`, "utf8");
      const m = st.match(/^VmRSS:\s+(\d+)/m);
      return m ? Number(m[1]) : null;
    } catch {
      return null;
    }
  }
  try {
    const t = readFileSync(p, "utf8");
    const m = t.match(/^Anonymous:\s+(\d+)\s+kB/m);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** @returns {{ total_kb: number|null, parts: Record<string, number|null> }} */
function readMemorySample(arm) {
  const parts = {};
  let total = 0;
  let any = false;
  for (let i = 0; i < arm.pids.length; i++) {
    const pid = arm.pids[i];
    const key = arm.pids.length === 1 ? "process" : i === 0 ? "bun_host" : "dataplane";
    const kb = readAnonKb(pid);
    parts[key] = kb;
    if (kb != null) {
      total += kb;
      any = true;
    }
  }
  return { total_kb: any ? total : null, parts };
}

async function parseRpc(resp) {
  const ct = resp.headers.get("content-type") || "";
  const text = await resp.text();
  if (ct.includes("text/event-stream") || text.startsWith("event:")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    const last = lines[lines.length - 1];
    if (!last) throw new Error(`empty SSE: ${text.slice(0, 200)}`);
    return JSON.parse(last.slice(5).trim());
  }
  return JSON.parse(text);
}

class McpSession {
  constructor(url) {
    this.url = url;
    this.sessionId = null;
    this.protocolVersion = "2025-11-25";
    this._id = 1;
  }

  async init() {
    const resp = await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: ACCEPT,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this._id++,
        method: "initialize",
        params: {
          protocolVersion: this.protocolVersion,
          capabilities: {},
          clientInfo: { name: "dataplane-dual-process-e2e", version: "0.1.0" },
        },
      }),
    });
    const sid = resp.headers.get("mcp-session-id") || resp.headers.get("Mcp-Session-Id");
    if (sid) this.sessionId = sid;
    const proto = resp.headers.get("mcp-protocol-version");
    if (proto) this.protocolVersion = proto;
    const data = await parseRpc(resp);
    if (data.error) throw new Error(`initialize: ${JSON.stringify(data.error)}`);

    await fetch(this.url, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });
  }

  _headers() {
    const h = {
      "content-type": "application/json",
      accept: ACCEPT,
      "mcp-protocol-version": this.protocolVersion,
    };
    if (this.sessionId) h["mcp-session-id"] = this.sessionId;
    return h;
  }

  async execute(step) {
    const t0 = performance.now();
    const resp = await fetch(this.url, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this._id++,
        method: "tools/call",
        params: {
          name: "execute",
          arguments: {
            operationId: step.operationId,
            args: step.args || {},
            ...(step.where ? { where: step.where } : {}),
            ...(step.fields ? { fields: step.fields } : {}),
          },
        },
      }),
    });
    const ms = performance.now() - t0;
    const data = await parseRpc(resp);
    if (data.error) {
      return { ok: false, ms, error: data.error, operationId: step.operationId };
    }
    const text = data.result?.content?.[0]?.text;
    let body;
    try {
      body = typeof text === "string" ? JSON.parse(text) : text;
    } catch {
      body = { raw: text };
    }
    const ok = data.result?.isError !== true && body?.ok !== false;
    return {
      ok,
      ms,
      body,
      operationId: step.operationId,
      proxiedFrom: body?.proxiedFrom,
      proxyHonesty: body?.proxyHonesty,
    };
  }
}

function summarizeLatencies(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p99: percentile(sorted, 99),
    p999: percentile(sorted, 99.9),
    max: sorted[sorted.length - 1] ?? null,
  };
}

function plateau(samples) {
  const last = samples.slice(-5);
  if (!last.length) return null;
  const sorted = [...last].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  const first = samples[0];
  const end = samples[samples.length - 1];
  const drift_kb = first != null && end != null ? end - first : null;
  const climbing =
    drift_kb != null && first > 0 ? drift_kb / first > 0.25 && samples.length >= 10 : false;
  return {
    median_kb: mid,
    median_mb: mid != null ? +(mid / 1024).toFixed(2) : null,
    n: last.length,
    first_kb: first ?? null,
    last_kb: end ?? null,
    drift_kb,
    climbing,
    note: climbing
      ? "Anonymous climbed >25% over the run — last-5 median is not a stable plateau"
      : null,
  };
}

const sessions = {};
for (const arm of ARMS) {
  sessions[arm.id] = new McpSession(arm.url);
  await sessions[arm.id].init();
  console.log(`initialized ${arm.id} session=${sessions[arm.id].sessionId || "(stateless)"}`);
}

const results = {
  comparisonLabel: LABEL,
  note:
    "dual_process memory = Bun host Anonymous + Rust dataplane Anonymous (both on the e2e path). Latency is client wall-clock through the Bun MCP URL. Do not cite dataplane-only RSS for dual-process installs.",
  reps: REPS,
  iters: ITERS,
  stepsPerIter: STEPS.length,
  arms: {},
};

for (const arm of ARMS) {
  results.arms[arm.id] = {
    url: arm.url,
    pids: arm.pids,
    memoryMode: arm.memoryMode,
    call_ms: [],
    session_ms: [],
    errors: 0,
    anon_kb_samples: [],
    anon_parts_samples: [],
    proxiedFromCount: 0,
    by_rep: [],
  };
}

for (let rep = 1; rep <= REPS; rep++) {
  console.log(`-- rep ${rep}/${REPS}`);
  const repBuckets = {};
  for (const arm of ARMS) {
    repBuckets[arm.id] = {
      call_ms: [],
      session_ms: [],
      errors: 0,
      anon_kb_samples: [],
      anon_parts_samples: [],
      proxiedFromCount: 0,
    };
  }
  for (let i = 1; i <= ITERS; i++) {
    for (const arm of ARMS) {
      const bucket = results.arms[arm.id];
      const rb = repBuckets[arm.id];
      const t0 = performance.now();
      for (const step of STEPS) {
        const r = await sessions[arm.id].execute(step);
        bucket.call_ms.push(r.ms);
        rb.call_ms.push(r.ms);
        if (r.proxiedFrom === "clawql-mcp") {
          bucket.proxiedFromCount += 1;
          rb.proxiedFromCount += 1;
        }
        if (!r.ok) {
          bucket.errors += 1;
          rb.errors += 1;
          if (bucket.errors <= 3) {
            console.error(`${arm.id} error`, r.operationId, r.error || r.body);
          }
        }
      }
      const sessMs = performance.now() - t0;
      bucket.session_ms.push(sessMs);
      rb.session_ms.push(sessMs);
      if (i === 1 || i === ITERS || i % Math.max(1, Math.floor(ITERS / 20)) === 0) {
        const sample = readMemorySample(arm);
        if (sample.total_kb != null) {
          bucket.anon_kb_samples.push(sample.total_kb);
          rb.anon_kb_samples.push(sample.total_kb);
          bucket.anon_parts_samples.push(sample.parts);
          rb.anon_parts_samples.push(sample.parts);
        }
      }
    }
  }
  for (const arm of ARMS) {
    const rb = repBuckets[arm.id];
    const partsPlateau = {};
    if (arm.memoryMode === "sum") {
      for (const key of ["bun_host", "dataplane"]) {
        const series = rb.anon_parts_samples
          .map((p) => p?.[key])
          .filter((v) => typeof v === "number");
        partsPlateau[key] = plateau(series);
      }
    }
    results.arms[arm.id].by_rep.push({
      rep,
      errors: rb.errors,
      proxiedFromCount: rb.proxiedFromCount,
      per_call: summarizeLatencies(rb.call_ms),
      per_session: summarizeLatencies(rb.session_ms),
      memory_plateau: plateau(rb.anon_kb_samples),
      memory_parts_plateau: arm.memoryMode === "sum" ? partsPlateau : undefined,
    });
  }
}

function rangeOf(byRep, path) {
  const vals = byRep
    .map((r) => {
      const parts = path.split(".");
      let cur = r;
      for (const p of parts) cur = cur?.[p];
      return cur;
    })
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!vals.length) return null;
  return {
    min: Math.min(...vals),
    max: Math.max(...vals),
    median: [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)],
    values: vals,
  };
}

for (const arm of ARMS) {
  const b = results.arms[arm.id];
  b.per_call = summarizeLatencies(b.call_ms);
  b.per_session = summarizeLatencies(b.session_ms);
  b.memory_plateau = plateau(b.anon_kb_samples);
  if (arm.memoryMode === "sum") {
    const partsPlateau = {};
    for (const key of ["bun_host", "dataplane"]) {
      const series = b.anon_parts_samples
        .map((p) => p?.[key])
        .filter((v) => typeof v === "number");
      partsPlateau[key] = plateau(series);
    }
    b.memory_parts_plateau = partsPlateau;
  }
  b.ranges = {
    call_p50_ms: rangeOf(b.by_rep, "per_call.p50"),
    call_p99_ms: rangeOf(b.by_rep, "per_call.p99"),
    call_p999_ms: rangeOf(b.by_rep, "per_call.p999"),
    sess_p50_ms: rangeOf(b.by_rep, "per_session.p50"),
    sess_p999_ms: rangeOf(b.by_rep, "per_session.p999"),
    plateau_mb: rangeOf(b.by_rep, "memory_plateau.median_mb"),
  };
  delete b.call_ms;
  delete b.session_ms;
  delete b.anon_parts_samples;
}

writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(
  JSON.stringify({
    wrote: OUT,
    comparisonLabel: LABEL,
    arms: Object.keys(results.arms),
    dualProxiedFrom: results.arms.dual_process?.proxiedFromCount,
  })
);
