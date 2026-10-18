#!/usr/bin/env node
/**
 * Multi-gateway equal-arm board: ClawQL vs Executor vs MCPJungle vs agentgateway.
 * ContextForge / MetaMCP are off the publish board by default (nested CF inflates
 * numbers; MetaMCP needs Docker). Opt in explicitly if experimenting.
 *
 * Per arm (when runnable):
 *   - Latency p50/p95/p99/p999 (interleaved with direct HTTP pets mock when applicable)
 *   - CPU + RAM (/proc tree samples during latency)
 *   - Tokens — tools/list schemas + equal-arm tool result (cl100k_base)
 *   - Chaos ceiling — concurrent clients until p99>SLO or error_rate>threshold,
 *     then binary refine (tol=1). MULTI_CHAOS_UNTIL_BREAK keeps doubling past
 *     MULTI_CHAOS_MAX until break or MULTI_CHAOS_HARD_MAX.
 *
 * Topology: this harness measures single-instance / process-per-client (A).
 * Topology B (K× HTTP behind sticky LB) is scripts/benchmarks/gateway-multi-topology-b.mjs.
 * Do not mix A ceilings with B or with ClawQL NATS fabric sticky.
 *
 * Equal-arm contract:
 *   - Payload = two-pet JSON (same as executor-comparison comprehensive)
 *   - Aggregators call upstream MCP tool list_pets (stdio child, no network)
 *   - ClawQL uses OpenAPI execute → mock HTTP (gateway_cost = e2e − direct)
 *   - Executor uses execute code returning the same JSON (upstream=0)
 *
 * Usage:
 *   EXECUTOR_BIN=… EXECUTOR_CWD=… EXECUTOR_DATA_DIR=… \
 *     MULTI_ITERS=200 MULTI_CHAOS_MAX=32 \
 *     node scripts/benchmarks/gateway-multi-comparison.mjs
 *
 * Env:
 *   MULTI_ARMS=clawql,executor,mcpjungle,agentgateway
 *   MULTI_ITERS (default 10000)  MULTI_WARMUP (default 100)
 *   MULTI_CHAOS_MAX (default 32)  MULTI_CHAOS_UNTIL_BREAK=1
 *   MULTI_CHAOS_HARD_MAX (default 1024)  MULTI_CHAOS_STEP_MS (default 3000)
 *   MULTI_BREAK_P99_MS (default 100)  MULTI_BREAK_ERROR_RATE (default 0.02)
 *   MULTI_REFINE=1  MULTI_OUT=gateway-multi-cmp.json
 *   MCPJUNGLE_BIN  AGENTGATEWAY_BIN  MULTI_INCLUDE_CF=1
 *   EXECUTOR_DATA_DIR — required for Executor 1.x stdio data home
 *   EXECUTOR_ISOLATE_DATA=1 — unique DATA_DIR per connect (chaos); can spawn
 *     one daemon per client and still hit Unauthorized on some hosts
 *   EXECUTOR_MCP_URL — Executor 2.x Streamable HTTP (e.g. http://127.0.0.1:4312/mcp);
 *     preferred over stdio when set. Optional EXECUTOR_API_KEY / EXECUTOR_API_KEY_FILE.
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, openSync, closeSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { spawn, spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getEncoding } from "js-tiktoken";
import { clawqlEqualArmEnv } from "./lib/clawql-bench-env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIB = join(ROOT, "scripts", "benchmarks", "lib");
const PETS_MCP = join(LIB, "equal-arm-pets-mcp.mjs");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "gateway-multi-comparison");
const OUT_NAME = (process.env.MULTI_OUT ?? "gateway-multi-cmp.json").replace(/[^a-zA-Z0-9._-]/g, "");
const OUT_PATH = join(OUT_DIR, OUT_NAME || "gateway-multi-cmp.json");

const ITERS = Math.max(20, Number(process.env.MULTI_ITERS ?? 10000) || 10000);
const WARMUP = Math.max(0, Number(process.env.MULTI_WARMUP ?? 100) || 100);
const EQUAL_UPSTREAM = process.env.MULTI_EQUAL_UPSTREAM !== "0";
const SKIP_CHAOS = process.env.MULTI_SKIP_CHAOS === "1" || process.env.MULTI_SKIP_CHAOS === "true";
const PROGRESS_EVERY = Math.max(100, Number(process.env.MULTI_PROGRESS_EVERY ?? 1000) || 1000);
const CHAOS_MAX = Math.max(1, Number(process.env.MULTI_CHAOS_MAX ?? 32) || 32);
const CHAOS_STEP_MS = Math.max(1000, Number(process.env.MULTI_CHAOS_STEP_MS ?? 3000) || 3000);
const CHAOS_WARMUP = Math.max(0, Number(process.env.MULTI_CHAOS_WARMUP ?? 6) || 6);
const BREAK_P99_MS = Math.max(1, Number(process.env.MULTI_BREAK_P99_MS ?? 100) || 100);
const BREAK_ERROR_RATE = Math.min(
  1,
  Math.max(0, Number(process.env.MULTI_BREAK_ERROR_RATE ?? 0.02) || 0.02)
);
const REFINE = process.env.MULTI_REFINE !== "0";
const REFINE_TOL = Math.max(1, Number(process.env.MULTI_REFINE_TOLERANCE ?? 1) || 1);
const CHAOS_UNTIL_BREAK =
  process.env.MULTI_CHAOS_UNTIL_BREAK === "1" ||
  process.env.MULTI_CHAOS_UNTIL_BREAK === "true";
const CHAOS_HARD_MAX = Math.max(
  CHAOS_MAX,
  Number(process.env.MULTI_CHAOS_HARD_MAX ?? 1024) || 1024
);
const INCLUDE_CF =
  process.env.MULTI_INCLUDE_CF === "1" || process.env.MULTI_INCLUDE_CF === "true";
const DEFAULT_ARMS = INCLUDE_CF
  ? "clawql,executor,mcpjungle,agentgateway,contextforge"
  : "clawql,executor,mcpjungle,agentgateway";
const ARMS = (process.env.MULTI_ARMS ?? DEFAULT_ARMS)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const EXECUTOR_VIA_HTTP = Boolean(process.env.EXECUTOR_MCP_URL?.trim());

/** Topology A — this harness. Do not claim vs NATS 4-replica without a B board. */
const TOPOLOGY = {
  id: "A_single_instance",
  label: EXECUTOR_VIA_HTTP
    ? "single-instance (ClawQL stdio PPC; Executor 1× HTTP /mcp; aggregators 1× HTTP)"
    : "single-instance / process-per-client (ClawQL+Executor stdio; aggregators 1× HTTP)",
  replicas: 1,
  note: "Scale-out Topology B is gateway-multi-topology-b.mjs (4× HTTP + sticky LB). Claim only within the same topology.",
};

const PATH_MATRIX = {
  clawql: {
    auth_capability_gate: true,
    operation_risk_policy: true,
    ephemeral_audit_ring: true,
    output_redaction_hooks: true,
    result_projection: true,
    upstream_http_equal_mock: true,
    catalog_discovery: "search_server_side",
  },
  executor: {
    auth_capability_gate: false,
    operation_risk_policy: false,
    ephemeral_audit_ring: false,
    output_redaction_hooks: false,
    result_projection: false, // measured: full payload pass-through; no gateway fields
    upstream_http_equal_mock: false,
    catalog_discovery: "n_a_code_execute",
  },
  mcpjungle: {
    auth_capability_gate: "optional",
    operation_risk_policy: false,
    ephemeral_audit_ring: false,
    output_redaction_hooks: false,
    result_projection: false,
    upstream_http_equal_mock: true,
    catalog_discovery: "full_tools_list",
  },
  agentgateway: {
    auth_capability_gate: "optional",
    operation_risk_policy: false,
    ephemeral_audit_ring: false,
    output_redaction_hooks: false,
    result_projection: false,
    upstream_http_equal_mock: true,
    catalog_discovery: "full_tools_list",
  },
};

const EQUAL_PAYLOAD = {
  pets: [
    { id: 1, name: "Ada", status: "available" },
    { id: 2, name: "Grace", status: "available" },
  ],
};
const EXECUTOR_STATIC_CODE = `return ${JSON.stringify(EQUAL_PAYLOAD)};`;
function executorEqualCode(mockBaseUrl) {
  if (!EQUAL_UPSTREAM || !mockBaseUrl) return EXECUTOR_STATIC_CODE;
  // Same HTTP hop as ClawQL / aggregator pets MCP when Executor sandbox allows fetch.
  return `const r = await fetch(${JSON.stringify(mockBaseUrl + "/pets")}); if (!r.ok) throw new Error("upstream "+r.status); return await r.json();`;
}
const enc = getEncoding("cl100k_base");
const CLK_TCK = (() => {
  const r = spawnSync("getconf", ["CLK_TCK"], { encoding: "utf8" });
  const n = Number(r.stdout?.trim());
  return Number.isFinite(n) && n > 0 ? n : 100;
})();

function countTokens(text) {
  if (text == null || text === "") return 0;
  return enc.encode(String(text)).length;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(samples) {
  if (!samples.length) {
    return { n: 0, p50_ms: null, p95_ms: null, p99_ms: null, p999_ms: null, mean_ms: null };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    p50_ms: Number(percentile(sorted, 50).toFixed(3)),
    p95_ms: Number(percentile(sorted, 95).toFixed(3)),
    p99_ms: Number(percentile(sorted, 99).toFixed(3)),
    p999_ms: Number(percentile(sorted, 99.9).toFixed(3)),
    mean_ms: Number((sum / sorted.length).toFixed(3)),
    min_ms: Number(sorted[0].toFixed(3)),
    max_ms: Number(sorted[sorted.length - 1].toFixed(3)),
  };
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

function toolText(res) {
  const c = res?.content;
  if (!Array.isArray(c)) return "";
  return c
    .filter((x) => x?.type === "text")
    .map((x) => x.text)
    .join("\n");
}

function readProcCpuSeconds(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const rp = stat.lastIndexOf(")");
    const rest = stat.slice(rp + 2).split(/\s+/);
    const utime = Number(rest[11]);
    const stime = Number(rest[12]);
    if (!Number.isFinite(utime) || !Number.isFinite(stime)) return null;
    return (utime + stime) / CLK_TCK;
  } catch {
    return null;
  }
}

function readProcRssMb(pid) {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const m = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
    return m ? Number((Number(m[1]) / 1024).toFixed(2)) : null;
  } catch {
    return null;
  }
}

function childPids(pid) {
  const out = [];
  try {
    for (const d of readdirSync("/proc")) {
      if (!/^\d+$/.test(d)) continue;
      try {
        const stat = readFileSync(`/proc/${d}/stat`, "utf8");
        const rp = stat.lastIndexOf(")");
        const ppid = Number(stat.slice(rp + 2).split(/\s+/)[1]);
        if (ppid === pid) out.push(Number(d));
      } catch {
        /* race */
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

function processTreePids(rootPid) {
  if (!rootPid) return [];
  const seen = new Set([rootPid]);
  const queue = [rootPid];
  while (queue.length) {
    const p = queue.shift();
    for (const c of childPids(p)) {
      if (!seen.has(c)) {
        seen.add(c);
        queue.push(c);
      }
    }
  }
  return [...seen];
}

function readTreeCpuSeconds(rootPid) {
  let sum = 0;
  let any = false;
  for (const p of processTreePids(rootPid)) {
    const s = readProcCpuSeconds(p);
    if (s != null) {
      sum += s;
      any = true;
    }
  }
  return any ? sum : null;
}

function readTreeRssMb(rootPid) {
  let sum = 0;
  let any = false;
  for (const p of processTreePids(rootPid)) {
    const s = readProcRssMb(p);
    if (s != null) {
      sum += s;
      any = true;
    }
  }
  return any ? Number(sum.toFixed(2)) : null;
}

function transportPid(transport) {
  if (typeof transport?.pid === "number") return transport.pid;
  if (typeof transport?._process?.pid === "number") return transport._process.pid;
  return null;
}

class ResourceSampler {
  constructor(label, pid) {
    this.label = label;
    this.pid = pid;
    this.samples = [];
    this._timer = null;
    this._t0 = null;
    this._cpu0 = null;
  }
  start(intervalMs = 100) {
    if (!this.pid) return;
    this._t0 = performance.now();
    this._cpu0 = readTreeCpuSeconds(this.pid);
    this._timer = setInterval(() => {
      const rss = readTreeRssMb(this.pid);
      const cpu = readTreeCpuSeconds(this.pid);
      if (rss == null || cpu == null || this._cpu0 == null) return;
      const wall = (performance.now() - this._t0) / 1000;
      const cpuPct = wall > 0 ? ((cpu - this._cpu0) / wall) * 100 : 0;
      this.samples.push({
        t_ms: Number((performance.now() - this._t0).toFixed(1)),
        rss_mb: rss,
        cpu_pct: Number(cpuPct.toFixed(2)),
      });
    }, intervalMs);
    if (typeof this._timer.unref === "function") this._timer.unref();
  }
  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (!this.samples.length) {
      return {
        label: this.label,
        pid: this.pid,
        n: 0,
        rss_mb: { min: null, median: null, max: null },
        cpu_pct: { min: null, median: null, max: null, mean: null },
      };
    }
    const rss = this.samples.map((s) => s.rss_mb).sort((a, b) => a - b);
    const cpu = this.samples.map((s) => s.cpu_pct).sort((a, b) => a - b);
    const cpuMean = cpu.reduce((a, b) => a + b, 0) / cpu.length;
    return {
      label: this.label,
      pid: this.pid,
      n: this.samples.length,
      rss_mb: { min: rss[0], median: percentile(rss, 50), max: rss[rss.length - 1] },
      cpu_pct: {
        min: cpu[0],
        median: percentile(cpu, 50),
        max: cpu[cpu.length - 1],
        mean: Number(cpuMean.toFixed(2)),
      },
    };
  }
}

async function startMockHttp() {
  const body = JSON.stringify(EQUAL_PAYLOAD);
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const specPath = join("/tmp", `multi-gw-spec-${process.pid}.json`);
  await writeFile(
    specPath,
    JSON.stringify(
      {
        openapi: "3.0.3",
        info: { title: "MultiGwEqual", version: "1" },
        servers: [{ url: baseUrl }],
        paths: {
          "/pets": {
            get: {
              operationId: "listPets",
              responses: {
                "200": {
                  description: "ok",
                  content: { "application/json": { schema: { type: "object" } } },
                },
              },
            },
          },
        },
      },
      null,
      2
    )
  );
  return {
    baseUrl,
    specPath,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function callDirect(baseUrl) {
  const res = await fetch(`${baseUrl}/pets`);
  if (!res.ok) throw new Error(`direct ${res.status}`);
  return res.text();
}

async function timeOnce(fn) {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

function clawqlEnv(home, specPath, apiBase) {
  // 8.0: ENABLE_* ignored without INSTANCE_SPEC; CLAWQL_TIER=gateway is not a preset.
  return clawqlEqualArmEnv({ home, specPath, apiBase });
}

async function connectClawqlStdio(env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "pipe",
    env,
  });
  const client = new Client({ name: "multi-clawql", version: "1" }, {});
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("clawql Ready timeout")), 90_000);
    transport.stderr?.on("data", (chunk) => {
      if (chunk.toString().includes("[clawql-mcp] Ready")) {
        clearTimeout(timer);
        resolve(undefined);
      }
    });
  });
  await client.connect(transport);
  await ready;
  return {
    client,
    transport,
    pid: transportPid(transport),
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

async function connectExecutorStdio() {
  const bin = process.env.EXECUTOR_BIN?.trim();
  if (!bin) throw new Error("EXECUTOR_BIN required for executor arm");
  // Executor 1.x requires a data home (same as multiturn harness).
  // Optional EXECUTOR_ISOLATE_DATA=1: unique DATA_DIR per connect for chaos
  // concurrency (shared dir owner-locks under parallel stdio). Prefer shared
  // dir for latency — isolate mode can spawn one daemon per client.
  const childEnv = { ...process.env };
  const baseData = process.env.EXECUTOR_DATA_DIR?.trim();
  const isolate =
    process.env.EXECUTOR_ISOLATE_DATA === "1" ||
    process.env.EXECUTOR_ISOLATE_DATA === "true";
  let dataDir = baseData || "";
  if (baseData && isolate) {
    dataDir = join(baseData, `chaos-${process.pid}-${randomId()}`);
    mkdirSync(dataDir, { recursive: true });
    childEnv.EXECUTOR_DATA_DIR = dataDir;
  } else if (baseData) {
    childEnv.EXECUTOR_DATA_DIR = baseData;
  }
  const transport = new StdioClientTransport({
    command: bin,
    args: ["mcp"],
    cwd: process.env.EXECUTOR_CWD?.trim() || dirname(bin),
    stderr: "pipe",
    env: childEnv,
  });
  const client = new Client({ name: "multi-executor", version: "1" }, {});
  // Drain stderr so daemon startup logs cannot fill the pipe and stall the child.
  if (transport.stderr) {
    transport.stderr.on("data", () => {});
  }
  await client.connect(transport);
  return {
    client,
    transport,
    pid: transportPid(transport),
    close: async () => {
      await client.close().catch(() => {});
      if (isolate && dataDir && dataDir !== baseData) {
        await rm(dataDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}

function readExecutorApiKey() {
  const inline = process.env.EXECUTOR_API_KEY?.trim();
  if (inline) return inline;
  try {
    const p = process.env.EXECUTOR_API_KEY_FILE?.trim();
    if (p && existsSync(p)) return readFileSync(p, "utf8").trim();
  } catch {
    /* ignore */
  }
  return "";
}

/** Prefer Executor 2.x Streamable HTTP when EXECUTOR_MCP_URL is set (chaos-friendly). */
async function connectExecutor() {
  const url = process.env.EXECUTOR_MCP_URL?.trim();
  if (url) {
    const key = readExecutorApiKey();
    const headers = key ? { Authorization: `Bearer ${key}` } : null;
    return connectHttpMcp(url, "multi-executor-http", headers);
  }
  return connectExecutorStdio();
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

async function connectHttpMcp(url, name = "multi-http", headers = null) {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: headers ? { headers } : undefined,
  });
  const client = new Client({ name, version: "1" }, {});
  await client.connect(transport);
  return {
    client,
    transport,
    pid: null,
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

function resolveBin(envKey, candidates) {
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

function killTree(pid) {
  if (!pid) return;
  for (const p of processTreePids(pid).reverse()) {
    try {
      process.kill(p, "SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

async function waitHttpOk(url, { timeoutMs = 60_000, headers } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok || res.status === 401 || res.status === 405 || res.status === 406) return;
      last = `${res.status}`;
    } catch (e) {
      last = String(e?.message ?? e);
    }
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${url}: ${last}`);
}

async function pickFreePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return port;
}

/**
 * Interleaved equal-arm latency across live arms (closed-loop):
 *   for i in 0..ITERS: for each arm: call; then paired direct HTTP
 * so host drift hits every arm equally. gateway_cost = e2e − direct when
 * EQUAL_UPSTREAM (or arm.requestGatewayCost).
 */
async function measureInterleaved(liveArms, mockBaseUrl) {
  const conns = [];
  const samplers = [];
  try {
    for (const arm of liveArms) {
      const conn = await arm.connect();
      const pid = arm.pidForResources?.(conn) ?? conn.pid ?? arm.pid ?? null;
      const sampler = new ResourceSampler(arm.id, pid);
      sampler.start(100);
      conns.push({ arm, conn, pid, sampler });
      samplers.push(sampler);
    }

    console.log(`[multi] interleaved warmup=${WARMUP} iters=${ITERS} arms=${liveArms.map((a) => a.id).join(",")}`);
    for (let i = 0; i < WARMUP; i++) {
      for (const c of conns) await c.arm.call(c.conn.client);
      if (mockBaseUrl) await callDirect(mockBaseUrl);
    }

    const series = Object.fromEntries(
      liveArms.map((a) => [a.id, { e2e: [], gateway: [], errors: 0 }])
    );
    const direct = [];

    for (let i = 0; i < ITERS; i++) {
      for (const c of conns) {
        try {
          const e = await timeOnce(() => c.arm.call(c.conn.client));
          series[c.arm.id].e2e.push(e);
        } catch {
          series[c.arm.id].errors++;
        }
      }
      const d = await timeOnce(() => callDirect(mockBaseUrl));
      direct.push(d);
      for (const c of conns) {
        const e2e = series[c.arm.id].e2e;
        if (e2e.length === direct.length) {
          // Only subtract direct when this arm actually paid the shared HTTP hop.
          const useCost = c.arm.gatewayCostFromDirect === true;
          series[c.arm.id].gateway.push(useCost ? e2e[e2e.length - 1] - d : e2e[e2e.length - 1]);
        }
      }
      if ((i + 1) % PROGRESS_EVERY === 0) {
        console.log(`[multi] interleaved progress ${i + 1}/${ITERS}`);
      }
    }

    const out = {};
    for (const c of conns) {
      const tools = await c.conn.client.listTools();
      const invokedName = c.arm.invokedToolName;
      const invoked =
        tools.tools.find((t) => t.name === invokedName) ||
        tools.tools.find((t) => invokedName && t.name.includes(invokedName.replace(/^.*__/, ""))) ||
        tools.tools.find((t) => /execute|list_pets|list-pets/i.test(t.name)) ||
        tools.tools[0];
      const resultText = await c.arm.call(c.conn.client);
      const resources = c.sampler.stop();
      const useCost = c.arm.gatewayCostFromDirect === true;
      out[c.arm.id] = {
        id: c.arm.id,
        model: c.arm.model,
        ok: true,
        version: c.arm.version ?? null,
        mcp_url: c.arm.mcpUrl ?? null,
        tool_name: invoked?.name ?? null,
        latency: {
          e2e: summarize(series[c.arm.id].e2e),
          direct_http: summarize(direct),
          gateway_cost: summarize(series[c.arm.id].gateway),
          call_errors: series[c.arm.id].errors,
          note: useCost
            ? "gateway_cost = e2e − paired direct HTTP /pets (interleaved equal-arm)"
            : "gateway_cost ≈ e2e (no equal-upstream subtraction)",
          schedule: "interleaved_closed_loop",
        },
        resources,
        tokens: {
          invoked_tool_name: invoked?.name ?? null,
          invoked_tool_schema_tokens: invoked ? countTokens(JSON.stringify(invoked)) : null,
          tools_list_count: tools.tools.length,
          tools_list_schema_tokens: tools.tools.reduce((n, t) => n + countTokens(JSON.stringify(t)), 0),
          equal_result_tokens: countTokens(resultText),
          tool_names: tools.tools.map((t) => t.name),
          note: "Primary board uses invoked_tool_schema_tokens (apples-to-apples); tools_list_* is secondary surface size.",
        },
        pid: c.pid,
      };
    }
    return out;
  } finally {
    for (const s of samplers) s.stop();
    for (const c of conns) await c.conn.close().catch(() => {});
  }
}

async function chaosClients({ n, connect, call, durationMs }) {
  const clients = [];
  const samples = [];
  let err = 0;
  let ok = 0;
  try {
    for (let i = 0; i < n; i++) {
      clients.push(await connect());
    }
    const stopAt = performance.now() + durationMs;
    let warmLeft = CHAOS_WARMUP * n;
    const workers = clients.map((c) =>
      (async () => {
        while (performance.now() < stopAt) {
          const t0 = performance.now();
          try {
            await call(c.client);
            const dt = performance.now() - t0;
            if (warmLeft > 0) {
              warmLeft--;
            } else {
              samples.push(dt);
              ok++;
            }
          } catch {
            err++;
          }
        }
      })()
    );
    await Promise.all(workers);
  } finally {
    for (const c of clients) await c.close().catch(() => {});
  }
  const total = ok + err;
  const errorRate = total > 0 ? err / total : 1;
  const lat = summarize(samples);
  const broken = errorRate > BREAK_ERROR_RATE || (lat.p99_ms != null && lat.p99_ms > BREAK_P99_MS);
  let breakReason = null;
  if (errorRate > BREAK_ERROR_RATE) breakReason = `error_rate ${(errorRate * 100).toFixed(2)}%`;
  else if (lat.p99_ms != null && lat.p99_ms > BREAK_P99_MS) breakReason = `p99 ${lat.p99_ms}ms`;
  return {
    concurrency: n,
    ok,
    err,
    error_rate: Number(errorRate.toFixed(4)),
    rps: Number((ok / (durationMs / 1000)).toFixed(1)),
    latency: lat,
    broken,
    break_reason: breakReason,
  };
}

async function chaosWithRefine(armHooks) {
  const steps = [];
  let lastOk = 0;
  let firstBreak = null;
  let breakReason = null;
  const powerMax = CHAOS_UNTIL_BREAK ? CHAOS_HARD_MAX : CHAOS_MAX;
  for (let n = 1; n <= powerMax; n *= 2) {
    console.log(`[multi] chaos ${armHooks.id} clients=${n}`);
    const step = await chaosClients({
      n,
      connect: armHooks.connect,
      call: armHooks.call,
      durationMs: CHAOS_STEP_MS,
    });
    steps.push({ ...step, phase: "power_of_two" });
    if (step.broken) {
      firstBreak = n;
      breakReason = step.break_reason;
      break;
    }
    lastOk = n;
    if (!CHAOS_UNTIL_BREAK && n >= CHAOS_MAX) break;
  }
  let refine = null;
  let incomplete = false;
  if (REFINE && firstBreak != null && firstBreak - lastOk > REFINE_TOL) {
    let lo = lastOk;
    let hi = firstBreak;
    const refineSteps = [];
    console.log(`[multi] chaos refine ${armHooks.id} lo=${lo} hi=${hi}`);
    while (hi - lo > REFINE_TOL) {
      const mid = Math.floor((lo + hi) / 2);
      if (mid <= lo || mid >= hi) break;
      const step = await chaosClients({
        n: mid,
        connect: armHooks.connect,
        call: armHooks.call,
        durationMs: CHAOS_STEP_MS,
      });
      refineSteps.push({ ...step, phase: "binary_refine" });
      if (step.broken) {
        hi = mid;
        breakReason = step.break_reason;
      } else {
        lo = mid;
      }
    }
    lastOk = lo;
    firstBreak = hi;
    refine = {
      method: "binary_search",
      tolerance: REFINE_TOL,
      last_ok_clients: lo,
      first_break_clients: hi,
      break_reason_at_first_break: breakReason,
      steps: refineSteps,
    };
  } else if (firstBreak == null) {
    firstBreak = null;
    incomplete = true;
  }
  return {
    topology: TOPOLOGY,
    slo: { break_p99_ms: BREAK_P99_MS, break_error_rate: BREAK_ERROR_RATE, step_ms: CHAOS_STEP_MS },
    until_break: CHAOS_UNTIL_BREAK,
    chaos_max: CHAOS_MAX,
    chaos_hard_max: CHAOS_HARD_MAX,
    steps,
    refine,
    last_ok_clients: lastOk,
    first_break_clients: firstBreak,
    break_reason: breakReason,
    incomplete_no_break: incomplete,
    honesty:
      incomplete
        ? `No break at ≤${lastOk} clients — concurrency claim incomplete until arm breaks (raise MULTI_CHAOS_HARD_MAX / MULTI_CHAOS_UNTIL_BREAK=1).`
        : "Broke within topology A — comparable only to other A ceilings.",
  };
}

/* -------------------- arm starters -------------------- */

function makeClawqlLiveArm(mock) {
  const home = join("/tmp", `multi-clawql-${process.pid}`);
  mkdirSync(home, { recursive: true });
  const env = clawqlEnv(home, mock.specPath, mock.baseUrl);
  const call = async (client) => {
    const res = await client.callTool({
      name: "execute",
      arguments: { operationId: "listPets", args: {}, fields: ["pets"] },
    });
    if (res.isError) throw new Error(toolText(res));
    return toolText(res);
  };
  return {
    id: "clawql",
    model: "stdio_mcp_openapi_execute",
    invokedToolName: "execute",
    gatewayCostFromDirect: true,
    connect: () => connectClawqlStdio(env),
    call,
    chaosHooks: { id: "clawql", connect: () => connectClawqlStdio(env), call },
  };
}

function makeExecutorLiveArm(_mock) {
  // Executor QuickJS sandbox disables fetch — product-native equal arm is static JSON
  // with upstream_cost=0 (same as executor-comparison-latency-fair).
  const viaHttp = EXECUTOR_VIA_HTTP;
  const call = async (client) => {
    const res = await client.callTool({
      name: "execute",
      arguments: { code: EXECUTOR_STATIC_CODE, timeoutMs: 30_000 },
    });
    if (res.isError) throw new Error(toolText(res));
    return toolText(res);
  };
  return {
    id: "executor",
    model: viaHttp
      ? "streamable_http_mcp_code_execute_static_upstream0"
      : "stdio_mcp_code_execute_static_upstream0",
    invokedToolName: "execute",
    gatewayCostFromDirect: false, // gateway_cost ≈ e2e (upstream=0 by sandbox)
    connect: connectExecutor,
    call,
    chaosHooks: { id: "executor", connect: connectExecutor, call },
    note: viaHttp
      ? "Executor 2.x HTTP /mcp · static equal JSON · upstream_cost=0 · fair chaos peer for aggregator 1× HTTP"
      : "Static equal JSON; fetch disabled in Executor sandbox — upstream_cost=0 (fair methodology)",
  };
}

async function startMcpjungle() {
  const bin = resolveBin("MCPJUNGLE_BIN", [
    "/tmp/gw-bins/mcpjungle",
    join(ROOT, "tmp/gw-bins/mcpjungle"),
  ]);
  if (!bin) throw new Error("mcpjungle binary not found (set MCPJUNGLE_BIN)");
  const work = join("/tmp", `mcpjungle-${process.pid}`);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const port = await pickFreePort();
  const dbPath = join(work, "mcpjungle.db");
  const confPath = join(work, "pets-stdio.json");
  const upstreamEnv = EQUAL_UPSTREAM && globalThis.__MULTI_MOCK_BASE__
    ? { EQUAL_ARM_UPSTREAM: globalThis.__MULTI_MOCK_BASE__ }
    : {};
  await writeFile(
    confPath,
    JSON.stringify(
      {
        name: "pets",
        transport: "stdio",
        description: "Equal-arm pets MCP",
        command: process.execPath,
        args: [PETS_MCP],
        session_mode: "stateful",
        env: upstreamEnv,
      },
      null,
      2
    )
  );
  const logPath = join(work, "server.log");
  const logFd = await import("node:fs").then((fs) =>
    fs.openSync(logPath, "w")
  );
  const child = spawn(bin, ["start", "--host", "127.0.0.1", "--port", String(port), "--sqlite-db-path", dbPath], {
    cwd: work,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env },
  });
  const registry = `http://127.0.0.1:${port}`;
  // Dev mode serves dashboard at / (200); /mcp is streamable HTTP (not always GET-ok).
  await waitHttpOk(`${registry}/`, { timeoutMs: 60_000 });
  const reg = spawnSync(bin, ["register", "-c", confPath, "--registry", registry, "--force"], {
    encoding: "utf8",
    cwd: work,
  });
  if (reg.status !== 0) {
    const log = existsSync(logPath) ? readFileSync(logPath, "utf8").slice(-2000) : "";
    throw new Error(`mcpjungle register failed: ${reg.stderr || reg.stdout}\n${log}`);
  }
  const mcpUrl = `${registry}/mcp`;
  // discover tool name
  const probe = await connectHttpMcp(mcpUrl, "mcpjungle-probe");
  let toolName = "pets__list_pets";
  try {
    const tools = await probe.client.listTools();
    const hit = tools.tools.find((t) => t.name.endsWith("list_pets") || t.name.includes("list_pets"));
    if (hit) toolName = hit.name;
  } finally {
    await probe.close();
  }
  const call = async (client) => {
    const res = await client.callTool({ name: toolName, arguments: {} });
    if (res.isError) throw new Error(toolText(res));
    return toolText(res);
  };
  return {
    id: "mcpjungle",
    model: "streamable_http_gateway_stdio_upstream",
    version: spawnSync(bin, ["version"], { encoding: "utf8" }).stdout?.trim() || null,
    mcpUrl,
    pid: child.pid,
    toolName,
    connect: () => connectHttpMcp(mcpUrl, "mcpjungle"),
    call,
    close: async () => {
      killTree(child.pid);
      try {
        await import("node:fs").then((fs) => fs.closeSync(logFd));
      } catch {
        /* ignore */
      }
    },
  };
}

async function startAgentgateway() {
  const bin = resolveBin("AGENTGATEWAY_BIN", [
    "/tmp/gw-bins/agentgateway",
    join(ROOT, "tmp/gw-bins/agentgateway"),
  ]);
  if (!bin) throw new Error("agentgateway binary not found (set AGENTGATEWAY_BIN)");
  const work = join("/tmp", `agentgateway-${process.pid}`);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const port = await pickFreePort();
  const cfgPath = join(work, "config.yaml");
  const upstream = EQUAL_UPSTREAM && globalThis.__MULTI_MOCK_BASE__ ? globalThis.__MULTI_MOCK_BASE__ : "";
  const bashCmd = upstream
    ? `EQUAL_ARM_UPSTREAM=${JSON.stringify(upstream)} exec ${JSON.stringify(process.execPath)} ${JSON.stringify(PETS_MCP)}`
    : `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(PETS_MCP)}`;
  await writeFile(
    cfgPath,
    `# yaml-language-server: $schema=https://agentgateway.dev/schema/config
mcp:
  port: ${port}
  targets:
  - name: pets
    stdio:
      cmd: "/bin/bash"
      args: ["-c", ${JSON.stringify(bashCmd)}]
`
  );
  const logPath = join(work, "server.log");
  const fs = await import("node:fs");
  const logFd = fs.openSync(logPath, "w");
  const child = spawn(bin, ["-f", cfgPath], {
    cwd: work,
    stdio: ["ignore", logFd, logFd],
  });
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  // GET /mcp returns 406 (needs Accept: text/event-stream) — treat that as ready.
  await waitHttpOk(mcpUrl, { timeoutMs: 60_000 });
  let probe;
  const t0 = Date.now();
  for (;;) {
    try {
      probe = await connectHttpMcp(mcpUrl, "agw-probe");
      break;
    } catch (e) {
      if (Date.now() - t0 > 60_000) throw e;
      await sleep(300);
    }
  }
  let toolName = "pets_list_pets";
  try {
    const tools = await probe.client.listTools();
    const hit = tools.tools.find((t) => t.name.includes("list_pets"));
    if (hit) toolName = hit.name;
  } finally {
    await probe.close();
  }
  const call = async (client) => {
    const res = await client.callTool({ name: toolName, arguments: {} });
    if (res.isError) throw new Error(toolText(res));
    return toolText(res);
  };
  const ver = spawnSync(bin, ["--version"], { encoding: "utf8" });
  return {
    id: "agentgateway",
    model: "streamable_http_gateway_stdio_upstream",
    version: (ver.stdout || ver.stderr || "").trim() || null,
    mcpUrl,
    pid: child.pid,
    toolName,
    connect: () => connectHttpMcp(mcpUrl, "agentgateway"),
    call,
    close: async () => {
      killTree(child.pid);
      try {
        fs.closeSync(logFd);
      } catch {
        /* ignore */
      }
    },
  };
}

async function startContextforge() {
  if (process.env.CONTEXTFORGE_SKIP === "1") {
    throw new Error("CONTEXTFORGE_SKIP=1");
  }
  const work = join("/tmp", `contextforge-${process.pid}`);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const port = await pickFreePort();
  const petsPort = await pickFreePort();
  const uv = resolveBin("UV_BIN", [
    `${process.env.HOME}/.local/bin/uv`,
    "/home/ubuntu/.local/bin/uv",
    "uv",
  ]);
  if (!uv || (uv !== "uv" && !existsSync(uv))) {
    throw new Error("uv not found — required for ContextForge");
  }
  const uvBinDir = uv === "uv" ? "" : dirname(uv);
  const uvx = uv === "uv" ? "uvx" : join(uvBinDir, "uvx");
  const pathEnv = uvBinDir ? `${uvBinDir}:${process.env.PATH}` : process.env.PATH;

  // Strong secrets via ContextForge helper into work/.env
  spawnSync(uvx, ["--from", "mcp-contextforge-gateway", "python", "-m", "mcpgateway.scripts.init_secrets", "--patch-env", ".env"], {
    cwd: work,
    encoding: "utf8",
    env: { ...process.env, PATH: pathEnv },
  });
  const adminPassword = "BenchAdmin!23456";
  await writeFile(
    join(work, ".env"),
    `${existsSync(join(work, ".env")) ? readFileSync(join(work, ".env"), "utf8") : ""}\n` +
      [
        `PLATFORM_ADMIN_EMAIL=admin@example.com`,
        `PLATFORM_ADMIN_PASSWORD=${adminPassword}`,
        `BASIC_AUTH_USER=admin@example.com`,
        `BASIC_AUTH_PASSWORD=${adminPassword}`,
        `DEFAULT_USER_PASSWORD=${adminPassword}`,
        `MCPGATEWAY_UI_ENABLED=false`,
        `MCPGATEWAY_ADMIN_API_ENABLED=true`,
        `SSRF_ALLOW_LOCALHOST=true`,
        `SSRF_ALLOW_PRIVATE_NETWORKS=true`,
        `CSRF_ENABLED=false`,
      ].join("\n") +
      "\n",
    "utf8"
  );

  // ContextForge's MCP client is picky with bare Node StreamableHTTP; use MCPJungle
  // as a stable local StreamableHTTP adapter in front of equal-arm stdio pets.
  const mjBin = resolveBin("MCPJUNGLE_BIN", ["/tmp/gw-bins/mcpjungle", join(ROOT, "tmp/gw-bins/mcpjungle")]);
  if (!mjBin) throw new Error("MCPJUNGLE_BIN required as ContextForge upstream adapter");
  const fs = await import("node:fs");
  const petsLog = fs.openSync(join(work, "mcpjungle-upstream.log"), "w");
  const confPath = join(work, "pets-stdio.json");
  await writeFile(
    confPath,
    JSON.stringify({
      name: "pets",
      transport: "stdio",
      command: process.execPath,
      args: [PETS_MCP],
      session_mode: "stateful",
      env:
        EQUAL_UPSTREAM && globalThis.__MULTI_MOCK_BASE__
          ? { EQUAL_ARM_UPSTREAM: globalThis.__MULTI_MOCK_BASE__ }
          : {},
    })
  );
  const pets = spawn(
    mjBin,
    ["start", "--host", "127.0.0.1", "--port", String(petsPort), "--sqlite-db-path", join(work, "mj.db")],
    { cwd: work, stdio: ["ignore", petsLog, petsLog] }
  );
  await waitHttpOk(`http://127.0.0.1:${petsPort}/`, { timeoutMs: 60_000 });
  const regMj = spawnSync(mjBin, ["register", "-c", confPath, "--registry", `http://127.0.0.1:${petsPort}`, "--force"], {
    encoding: "utf8",
    cwd: work,
  });
  if (regMj.status !== 0) {
    throw new Error(`mcpjungle upstream register failed: ${regMj.stderr || regMj.stdout}`);
  }

  const gLog = fs.openSync(join(work, "gateway.log"), "w");
  const gateway = spawn(
    uvx,
    ["--from", "mcp-contextforge-gateway", "mcpgateway", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: work,
      stdio: ["ignore", gLog, gLog],
      env: {
        ...process.env,
        PATH: pathEnv,
        SSRF_ALLOW_LOCALHOST: "true",
        SSRF_ALLOW_PRIVATE_NETWORKS: "true",
        CSRF_ENABLED: "false",
        RATE_LIMITING_ENABLED: "false",
        TOOL_RATE_LIMIT: "100000",
        RATE_LIMIT_MEDIUM_RPM: "100000",
        MCPGATEWAY_UI_ENABLED: "false",
        MCPGATEWAY_ADMIN_API_ENABLED: "true",
        PLATFORM_ADMIN_EMAIL: "admin@example.com",
        PLATFORM_ADMIN_PASSWORD: adminPassword,
        BASIC_AUTH_USER: "admin@example.com",
        BASIC_AUTH_PASSWORD: adminPassword,
        DEFAULT_USER_PASSWORD: adminPassword,
      },
    }
  );
  await waitHttpOk(`http://127.0.0.1:${port}/health`, { timeoutMs: 180_000 });

  const tokProc = spawnSync(
    uvx,
    [
      "--from",
      "mcp-contextforge-gateway",
      "python",
      "-m",
      "mcpgateway.utils.create_jwt_token",
      "--username",
      "admin@example.com",
      "--exp",
      "10080",
      "--admin",
    ],
    { cwd: work, encoding: "utf8", env: { ...process.env, PATH: pathEnv } }
  );
  const token = (tokProc.stdout || tokProc.stderr || "").match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
  if (!token) {
    throw new Error(`Could not mint ContextForge JWT: ${(tokProc.stderr || tokProc.stdout || "").slice(0, 400)}`);
  }

  const regRes = await fetch(`http://127.0.0.1:${port}/v1/gateways`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "pets",
      url: `http://127.0.0.1:${petsPort}/mcp`,
      description: "equal-arm pets",
      transport: "STREAMABLEHTTP",
    }),
  });
  const regBody = await regRes.text();
  if (!regRes.ok && !/already exists/i.test(regBody)) {
    throw new Error(`contextforge register gateway: ${regRes.status} ${regBody.slice(0, 500)}`);
  }

  const toolsRes = await fetch(`http://127.0.0.1:${port}/v1/tools`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const toolsJson = await toolsRes.json();
  const toolList = Array.isArray(toolsJson) ? toolsJson : [];
  const petTool = toolList.find(
    (t) =>
      String(t.originalName || "").includes("list_pets") ||
      String(t.name || "").includes("list-pets") ||
      String(t.name || "").includes("list_pets")
  );
  if (!petTool?.id) {
    throw new Error(`contextforge: pets tool not imported (${toolList.map((t) => t.name).join(",")})`);
  }

  const srvRes = await fetch(`http://127.0.0.1:${port}/v1/servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      server: {
        name: "bench",
        description: "equal-arm virtual server",
        associated_tools: [petTool.id],
      },
      visibility: "public",
    }),
  });
  const srvBody = await srvRes.text();
  if (!srvRes.ok) {
    throw new Error(`contextforge create server: ${srvRes.status} ${srvBody.slice(0, 500)}`);
  }
  const srv = JSON.parse(srvBody);
  const serverId = srv.id;
  const mcpUrl = `http://127.0.0.1:${port}/servers/${serverId}/mcp`;

  let toolName = petTool.name || "pets-list-pets";
  const call = async (client) => {
    const res = await client.callTool({ name: toolName, arguments: {} });
    if (res.isError) throw new Error(toolText(res));
    return toolText(res);
  };
  const connect = async () => {
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    const client = new Client({ name: "contextforge", version: "1" }, {});
    await client.connect(transport);
    const tools = await client.listTools();
    const hit = tools.tools.find((t) => t.name.includes("list") || t.name.includes("pet")) || tools.tools[0];
    if (hit) toolName = hit.name;
    return {
      client,
      transport,
      pid: null,
      close: async () => {
        await client.close().catch(() => {});
      },
    };
  };

  return {
    id: "contextforge",
    model: "virtual_mcp_server_over_mcpjungle_stdio_pets",
    version: "mcp-contextforge-gateway (uvx)",
    mcpUrl,
    pid: gateway.pid,
    toolName,
    connect,
    call,
    close: async () => {
      killTree(gateway.pid);
      killTree(pets.pid);
      try {
        fs.closeSync(petsLog);
        fs.closeSync(gLog);
      } catch {
        /* ignore */
      }
    },
  };
}

function boardFromArms(arms) {
  const rows = {};
  for (const [id, a] of Object.entries(arms)) {
    if (!a || a.skipped) {
      rows[id] = { skipped: true, reason: a?.reason ?? "skipped" };
      continue;
    }
    rows[id] = {
      latency_e2e_ms: a.latency?.e2e,
      gateway_cost_ms: a.latency?.gateway_cost,
      rss_mb_min: a.resources?.rss_mb?.min ?? null,
      rss_mb_median: a.resources?.rss_mb?.median ?? null,
      rss_mb_max: a.resources?.rss_mb?.max ?? null,
      cpu_pct_median: a.resources?.cpu_pct?.median ?? null,
      invoked_tool_schema_tokens: a.tokens?.invoked_tool_schema_tokens ?? null,
      schema_tokens_full_list: a.tokens?.tools_list_schema_tokens ?? null,
      tools_count: a.tokens?.tools_list_count ?? null,
      equal_result_tokens: a.tokens?.equal_result_tokens ?? null,
      chaos_last_ok: a.chaos?.last_ok_clients ?? null,
      chaos_first_break: a.chaos?.first_break_clients ?? null,
      chaos_break_reason: a.chaos?.break_reason ?? null,
    };
  }
  return rows;
}

async function main() {
  if (!existsSync(join(ROOT, "dist", "server.js"))) {
    console.error("dist/server.js missing — run npm run build first for clawql arm");
  }
  await mkdir(OUT_DIR, { recursive: true });
  const mock = await startMockHttp();
  globalThis.__MULTI_MOCK_BASE__ = mock.baseUrl;
  const arms = {};
  const errors = {};
  const live = [];
  const gateways = []; // { close }

  try {
    for (const arm of ARMS) {
      console.log(`[multi] prepare ${arm}`);
      try {
        if (arm === "clawql") {
          if (!existsSync(join(ROOT, "dist", "server.js"))) {
            arms.clawql = { skipped: true, reason: "dist/server.js missing" };
            continue;
          }
          live.push(makeClawqlLiveArm(mock));
        } else if (arm === "executor") {
          if (!process.env.EXECUTOR_BIN?.trim() && !process.env.EXECUTOR_MCP_URL?.trim()) {
            arms.executor = {
              skipped: true,
              reason: "EXECUTOR_BIN / EXECUTOR_MCP_URL unset",
            };
            continue;
          }
          live.push(makeExecutorLiveArm(mock));
        } else if (arm === "mcpjungle") {
          const gw = await startMcpjungle();
          gateways.push(gw);
          live.push({
            id: gw.id,
            model: gw.model + (EQUAL_UPSTREAM ? "+shared_http_upstream" : ""),
            version: gw.version,
            mcpUrl: gw.mcpUrl,
            invokedToolName: gw.toolName,
            pid: gw.pid,
            gatewayCostFromDirect: EQUAL_UPSTREAM,
            connect: gw.connect,
            call: gw.call,
            chaosHooks: { id: gw.id, connect: gw.connect, call: gw.call },
          });
        } else if (arm === "agentgateway") {
          const gw = await startAgentgateway();
          gateways.push(gw);
          live.push({
            id: gw.id,
            model: gw.model + (EQUAL_UPSTREAM ? "+shared_http_upstream" : ""),
            version: gw.version,
            mcpUrl: gw.mcpUrl,
            invokedToolName: gw.toolName,
            pid: gw.pid,
            gatewayCostFromDirect: EQUAL_UPSTREAM,
            connect: gw.connect,
            call: gw.call,
            chaosHooks: { id: gw.id, connect: gw.connect, call: gw.call },
          });
        } else if (arm === "contextforge") {
          const gw = await startContextforge();
          gateways.push(gw);
          live.push({
            id: gw.id,
            model: gw.model + (EQUAL_UPSTREAM ? "+shared_http_upstream" : ""),
            version: gw.version,
            mcpUrl: gw.mcpUrl,
            invokedToolName: gw.toolName,
            pid: gw.pid,
            gatewayCostFromDirect: EQUAL_UPSTREAM,
            connect: gw.connect,
            call: gw.call,
            chaosHooks: { id: gw.id, connect: gw.connect, call: gw.call },
          });
        } else if (arm === "metamcp") {
          arms.metamcp = {
            skipped: true,
            reason: "Docker unavailable / MetaMCP Docker Compose–first",
          };
        } else {
          errors[arm] = `unknown arm ${arm}`;
        }
      } catch (e) {
        console.error(`[multi] prepare ${arm} failed:`, e);
        arms[arm] = { skipped: true, reason: String(e?.stack || e), error: true };
        errors[arm] = String(e?.message || e);
      }
    }

    const buildReport = (partial = false) => ({
      suite: "gateway-multi-comparison",
      measuredAt: new Date().toISOString(),
      node: process.version,
      partial,
      topology: TOPOLOGY,
      path_matrix: PATH_MATRIX,
      config: {
        iters: ITERS,
        warmup: WARMUP,
        equal_upstream: EQUAL_UPSTREAM,
        interleaved: true,
        skip_chaos: SKIP_CHAOS,
        chaos_max: CHAOS_MAX,
        chaos_until_break: CHAOS_UNTIL_BREAK,
        chaos_hard_max: CHAOS_HARD_MAX,
        chaos_step_ms: CHAOS_STEP_MS,
        break_p99_ms: BREAK_P99_MS,
        break_error_rate: BREAK_ERROR_RATE,
        refine: REFINE,
        arms: ARMS,
        include_contextforge: INCLUDE_CF,
      },
      board: boardFromArms(arms),
      arms,
      errors,
      honesty: [
        "Equal-arm pets JSON across all arms.",
        EQUAL_UPSTREAM
          ? "EQUAL_UPSTREAM: shared mock HTTP /pets — ClawQL OpenAPI, aggregator list_pets fetch, Executor static upstream=0; gateway_cost = e2e − paired direct when hop paid."
          : "EQUAL_UPSTREAM off: aggregators/Executor may be upstream≈0; ClawQL still hits HTTP.",
        "Latency schedule: interleaved closed-loop across live arms (n≥10000 recommended for p999).",
        "Primary token metric: invoked_tool_schema_tokens (not full tools/list).",
        "Chaos: topology A only (single-instance). Claim only vs same topology. MULTI_CHAOS_UNTIL_BREAK pushes past power-of-two ceiling until break.",
        "path_matrix: ClawQL latency includes risk/audit/projection; aggregators do almost none of that.",
        "ContextForge/MetaMCP off publish board by default (nested CF / Docker).",
        "RSS: ClawQL is heaviest serious arm — admit the loss; do not hide under-load median.",
        "Checkpoint writes after latency and after each chaos arm (survives OOM mid-chaos).",
      ],
    });

    const checkpoint = async (label) => {
      await writeFile(OUT_PATH, JSON.stringify(buildReport(true), null, 2));
      console.log(`[multi] checkpoint ${label} → ${OUT_PATH}`);
    };

    if (live.length) {
      const measured = await measureInterleaved(live, mock.baseUrl);
      for (const [id, row] of Object.entries(measured)) {
        arms[id] = row;
      }
      await checkpoint("after-latency");
      if (!SKIP_CHAOS) {
        for (const arm of live) {
          if (!arm.chaosHooks) continue;
          console.log(`[multi] chaos ${arm.id}`);
          try {
            arms[arm.id].chaos = await chaosWithRefine(arm.chaosHooks);
          } catch (e) {
            arms[arm.id].chaos = { error: String(e?.message || e) };
          }
          await checkpoint(`after-chaos-${arm.id}`);
        }
      } else {
        for (const arm of live) {
          if (arms[arm.id]) {
            arms[arm.id].chaos = { skipped: true, reason: "MULTI_SKIP_CHAOS=1 (latency/p999 focus)" };
          }
        }
      }
    }

    const report = buildReport(false);
    await writeFile(OUT_PATH, JSON.stringify(report, null, 2));
    console.log(`\n[multi] wrote ${OUT_PATH}`);
    console.log(JSON.stringify(report.board, null, 2));
  } finally {
    for (const gw of gateways) await gw.close?.().catch(() => {});
    await mock.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
