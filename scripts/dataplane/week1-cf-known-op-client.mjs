#!/usr/bin/env node
/**
 * Interleaved Cloudflare known-op execute client for week-1 dataplane signal.
 *
 * Env:
 *   CLAWQL_TS_MCP_URL / CLAWQL_DP_MCP_URL — Streamable HTTP MCP endpoints
 *   CLAWQL_TS_PID / CLAWQL_DP_PID — PIDs for /proc smaps Anonymous plateau
 *   CF_DP_REPS (default 3), CF_DP_ITERS (default 200)
 *   CF_DP_OUT — summary JSON path
 *   COMPARISON_LABEL — must stay "fast-path-only" until governance lands
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAWQL_STEP_SHAPES } from "./lib/clawql-shapes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ACCEPT = "application/json, text/event-stream";
const LABEL = process.env.COMPARISON_LABEL || "fast-path-only";
const REPS = Math.max(1, Number(process.env.CF_DP_REPS || 3));
const ITERS = Math.max(1, Number(process.env.CF_DP_ITERS || 10000));
const OUT = process.env.CF_DP_OUT || join(HERE, "../../tmp/dataplane-week1-summary.json");

const ARMS = [
  {
    id: "bun_host",
    url: process.env.CLAWQL_TS_MCP_URL,
    pid: Number(process.env.CLAWQL_TS_PID || 0) || null,
  },
  {
    id: "rust_dataplane",
    url: process.env.CLAWQL_DP_MCP_URL,
    pid: Number(process.env.CLAWQL_DP_PID || 0) || null,
  },
];

for (const a of ARMS) {
  if (!a.url) {
    console.error(`missing MCP URL for ${a.id}`);
    process.exit(2);
  }
}

/** Known-op steps 1–11 (no search). */
const STEPS = Object.keys(CLAWQL_STEP_SHAPES)
  .map(Number)
  .sort((a, b) => a - b)
  .map((n) => CLAWQL_STEP_SHAPES[n]);

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function readAnonKb(pid) {
  if (!pid) return null;
  const p = `/proc/${pid}/smaps_rollup`;
  if (!existsSync(p)) {
    // fallback VmRSS
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
          clientInfo: { name: "dataplane-week1", version: "0.1.0" },
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
    return { ok, ms, body, operationId: step.operationId, isError: !!data.result?.isError };
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
    "Rust Phase A has no governance. Bun may still run host plugins depending on env. Not a go/no-go claim.",
  reps: REPS,
  iters: ITERS,
  stepsPerIter: STEPS.length,
  arms: {},
};

for (const arm of ARMS) {
  results.arms[arm.id] = {
    url: arm.url,
    pid: arm.pid,
    call_ms: [],
    session_ms: [],
    errors: 0,
    anon_kb_samples: [],
  };
}

for (let rep = 1; rep <= REPS; rep++) {
  console.log(`-- rep ${rep}/${REPS}`);
  for (let i = 1; i <= ITERS; i++) {
    // Interleave arms each iteration (Bun then Rust).
    for (const arm of ARMS) {
      const bucket = results.arms[arm.id];
      const t0 = performance.now();
      for (const step of STEPS) {
        const r = await sessions[arm.id].execute(step);
        bucket.call_ms.push(r.ms);
        if (!r.ok) {
          bucket.errors += 1;
          if (bucket.errors <= 3) {
            console.error(`${arm.id} error`, r.operationId, r.error || r.body);
          }
        }
      }
      bucket.session_ms.push(performance.now() - t0);
      if (i === 1 || i === ITERS || i % Math.max(1, Math.floor(ITERS / 20)) === 0) {
        const anon = readAnonKb(arm.pid);
        if (anon != null) bucket.anon_kb_samples.push(anon);
      }
    }
  }
}

for (const arm of ARMS) {
  const b = results.arms[arm.id];
  b.per_call = summarizeLatencies(b.call_ms);
  b.per_session = summarizeLatencies(b.session_ms);
  b.memory_plateau = plateau(b.anon_kb_samples);
  delete b.call_ms;
  delete b.session_ms;
}

writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ wrote: OUT, comparisonLabel: LABEL, arms: Object.keys(results.arms) }));
