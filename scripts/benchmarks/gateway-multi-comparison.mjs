#!/usr/bin/env node
/**
 * Multi-gateway equal-arm board: ClawQL vs Executor vs MCPJungle vs agentgateway
 * vs ContextForge (+ MetaMCP when Docker is available).
 *
 * Per arm (when runnable):
 *   - Latency p50/p95/p99/p999 (interleaved with direct HTTP pets mock when applicable)
 *   - CPU + RAM (/proc tree samples during latency)
 *   - Tokens — tools/list schemas + equal-arm tool result (cl100k_base)
 *   - Chaos ceiling — concurrent clients until p99>SLO or error_rate>threshold,
 *     then binary refine (tol=1)
 *
 * Equal-arm contract:
 *   - Payload = two-pet JSON (same as executor-comparison comprehensive)
 *   - Aggregators call upstream MCP tool list_pets (stdio child, no network)
 *   - ClawQL uses OpenAPI execute → mock HTTP (gateway_cost = e2e − direct)
 *   - Executor uses execute code returning the same JSON (upstream=0)
 *
 * Usage:
 *   EXECUTOR_BIN=… EXECUTOR_CWD=… \
 *     MULTI_ITERS=200 MULTI_CHAOS_MAX=32 \
 *     node scripts/benchmarks/gateway-multi-comparison.mjs
 *
 * Env:
 *   MULTI_ARMS=clawql,executor,mcpjungle,agentgateway,contextforge,metamcp
 *   MULTI_ITERS (default 200)  MULTI_WARMUP (default 20)
 *   MULTI_CHAOS_MAX (default 32)  MULTI_CHAOS_STEP_MS (default 3000)
 *   MULTI_BREAK_P99_MS (default 100)  MULTI_BREAK_ERROR_RATE (default 0.02)
 *   MULTI_REFINE=1  MULTI_OUT=gateway-multi-cmp.json
 *   MCPJUNGLE_BIN  AGENTGATEWAY_BIN  CONTEXTFORGE_SKIP=1
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIB = join(ROOT, "scripts", "benchmarks", "lib");
const PETS_MCP = join(LIB, "equal-arm-pets-mcp.mjs");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "gateway-multi-comparison");
const OUT_NAME = (process.env.MULTI_OUT ?? "gateway-multi-cmp.json").replace(/[^a-zA-Z0-9._-]/g, "");
const OUT_PATH = join(OUT_DIR, OUT_NAME || "gateway-multi-cmp.json");

const ITERS = Math.max(20, Number(process.env.MULTI_ITERS ?? 200) || 200);
const WARMUP = Math.max(0, Number(process.env.MULTI_WARMUP ?? 20) || 20);
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
const ARMS = (process.env.MULTI_ARMS ?? "clawql,executor,mcpjungle,agentgateway,contextforge,metamcp")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const EQUAL_PAYLOAD = {
  pets: [
    { id: 1, name: "Ada", status: "available" },
    { id: 2, name: "Grace", status: "available" },
  ],
};
const EXECUTOR_EQUAL_CODE = `return ${JSON.stringify(EQUAL_PAYLOAD)};`;
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
  const env = {
    ...process.env,
    CLAWQL_HOME: home,
    CLAWQL_OBSIDIAN_VAULT_PATH: home,
    CLAWQL_SPEC_PATH: specPath,
    CLAWQL_API_BASE_URL: apiBase,
    CLAWQL_BUNDLED_OFFLINE: "1",
    CLAWQL_TIER: "gateway",
    CLAWQL_CAPABILITY_LIFECYCLE: "0",
    CLAWQL_ENABLE_MEMORY: "0",
    CLAWQL_ENABLE_DOCUMENTS: "0",
    CLAWQL_ENABLE_ONYX: "0",
    CLAWQL_ENABLE_SANDBOX: "0",
    CLAWQL_ENABLE_SCHEDULE: "0",
    CLAWQL_ENABLE_NOTIFY: "0",
    CLAWQL_ENABLE_OBSERVABILITY: "0",
    CLAWQL_ENABLE_GOOGLE: "0",
    CLAWQL_ENABLE_AWS: "0",
    CLAWQL_ALLOW_NO_ENFORCEMENT: "1",
    CLAWQL_OPENAPI_EXECUTE_PATH: "rest",
  };
  for (const key of [
    "CLAWQL_PROVIDER",
    "CLAWQL_BUNDLED_PROVIDERS",
    "CLAWQL_INSTANCE_SPEC",
    "CLAWQL_INSTANCE_SPEC_FILE",
    "CLAWQL_SPEC_URL",
    "CLAWQL_SPEC_PATHS",
    "CLAWQL_DISCOVERY_URL",
  ]) {
    delete env[key];
  }
  delete env.CLAWQL_WORM_ENABLED;
  delete env.CLAWQL_WORM_LOCAL;
  delete env.CLAWQL_WORM_REMOTE;
  return env;
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
  const transport = new StdioClientTransport({
    command: bin,
    args: ["mcp"],
    cwd: process.env.EXECUTOR_CWD?.trim() || dirname(bin),
    stderr: "pipe",
  });
  const client = new Client({ name: "multi-executor", version: "1" }, {});
  await client.connect(transport);
  return {
    client,
    transport,
    pid: transportPid(transport),
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

async function connectHttpMcp(url, name = "multi-http") {
  const transport = new StreamableHTTPClientTransport(new URL(url));
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
      if (res.ok || res.status === 401 || res.status === 405) return;
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

/** Measure latency/resources/tokens for a callTool arm. */
async function measureCallArm({
  id,
  model,
  connect,
  call,
  pidForResources,
  mockBaseUrl,
  gatewayCostFromDirect,
}) {
  const conn = await connect();
  const pid = pidForResources?.(conn) ?? conn.pid;
  const sampler = new ResourceSampler(id, pid);
  sampler.start(50);
  try {
    for (let i = 0; i < WARMUP; i++) {
      await call(conn.client);
      if (mockBaseUrl) await callDirect(mockBaseUrl);
    }
    const e2e = [];
    const direct = [];
    const gateway = [];
    for (let i = 0; i < ITERS; i++) {
      const e = await timeOnce(() => call(conn.client));
      e2e.push(e);
      if (mockBaseUrl && gatewayCostFromDirect) {
        const d = await timeOnce(() => callDirect(mockBaseUrl));
        direct.push(d);
        gateway.push(e - d);
      } else {
        gateway.push(e);
      }
    }
    const tools = await conn.client.listTools();
    const schemaTokens = tools.tools.reduce((n, t) => n + countTokens(JSON.stringify(t)), 0);
    const resultText = await call(conn.client);
    const resultTokens = countTokens(resultText);
    const resources = sampler.stop();
    return {
      id,
      model,
      ok: true,
      latency: {
        e2e: summarize(e2e),
        direct_http: direct.length ? summarize(direct) : null,
        gateway_cost: summarize(gateway),
        note: gatewayCostFromDirect
          ? "gateway_cost = e2e − direct HTTP pets"
          : "gateway_cost ≈ e2e (stdio/in-process upstream, no HTTP hop)",
      },
      resources,
      tokens: {
        tools_list_count: tools.tools.length,
        tools_list_schema_tokens: schemaTokens,
        equal_result_tokens: resultTokens,
        tool_names: tools.tools.map((t) => t.name),
      },
      pid,
    };
  } finally {
    sampler.stop();
    await conn.close();
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
  for (let n = 1; n <= CHAOS_MAX; n *= 2) {
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
  }
  let refine = null;
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
  }
  return {
    slo: { break_p99_ms: BREAK_P99_MS, break_error_rate: BREAK_ERROR_RATE, step_ms: CHAOS_STEP_MS },
    steps,
    refine,
    last_ok_clients: lastOk,
    first_break_clients: firstBreak,
    break_reason: breakReason,
  };
}

/* -------------------- arm starters -------------------- */

async function armClawql(mock) {
  const home = join("/tmp", `multi-clawql-${process.pid}`);
  await mkdir(home, { recursive: true });
  const env = clawqlEnv(home, mock.specPath, mock.baseUrl);
  const call = async (client) => {
    const res = await client.callTool({
      name: "execute",
      arguments: { operationId: "listPets", args: {}, fields: ["pets"] },
    });
    if (res.isError) throw new Error(toolText(res));
    return toolText(res);
  };
  const latency = await measureCallArm({
    id: "clawql",
    model: "stdio_mcp_openapi_execute",
    connect: () => connectClawqlStdio(env),
    call,
    mockBaseUrl: mock.baseUrl,
    gatewayCostFromDirect: true,
  });
  const chaos = await chaosWithRefine({
    id: "clawql",
    connect: () => connectClawqlStdio(env),
    call,
  });
  return { ...latency, chaos };
}

async function armExecutor() {
  const call = async (client) => {
    const res = await client.callTool({
      name: "execute",
      arguments: { code: EXECUTOR_EQUAL_CODE, timeoutMs: 30_000 },
    });
    if (res.isError) throw new Error(toolText(res));
    return toolText(res);
  };
  const latency = await measureCallArm({
    id: "executor",
    model: "stdio_mcp_code_execute",
    connect: connectExecutorStdio,
    call,
    gatewayCostFromDirect: false,
  });
  const chaos = await chaosWithRefine({
    id: "executor",
    connect: connectExecutorStdio,
    call,
  });
  return { ...latency, chaos };
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
  await writeFile(
    cfgPath,
    `# yaml-language-server: $schema=https://agentgateway.dev/schema/config
mcp:
  port: ${port}
  targets:
  - name: pets
    stdio:
      cmd: ${JSON.stringify(process.execPath)}
      args: [${JSON.stringify(PETS_MCP)}]
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
  const translatePort = await pickFreePort();
  // Ensure package available via uvx (cached after first pull)
  const uv = resolveBin("UV_BIN", [
    `${process.env.HOME}/.local/bin/uv`,
    "/home/ubuntu/.local/bin/uv",
    "uv",
  ]);
  if (!uv || (uv !== "uv" && !existsSync(uv))) {
    throw new Error("uv not found — required for ContextForge");
  }
  const uvx = uv.endsWith("uv") ? uv.replace(/uv$/, "uvx") : join(dirname(uv), "uvx");
  const secrets = spawnSync(
    process.execPath,
    ["-e", "console.log(require('crypto').randomBytes(32).toString('hex'))"],
    { encoding: "utf8" }
  );
  const secret = (secrets.stdout || "").trim() || "bench-secret-change-me-32bytes-min!!";
  const jwtSecret = secret;
  const authSecret = secret + "auth";

  // Start translate wrapper: stdio pets → streamable HTTP
  const fs = await import("node:fs");
  const tLog = fs.openSync(join(work, "translate.log"), "w");
  const translate = spawn(
    uvx,
    [
      "--from",
      "mcp-contextforge-gateway",
      "python",
      "-m",
      "mcpgateway.translate",
      "--stdio",
      `${process.execPath} ${PETS_MCP}`,
      "--port",
      String(translatePort),
    ],
    {
      cwd: work,
      stdio: ["ignore", tLog, tLog],
      env: {
        ...process.env,
        PATH: `${dirname(uv)}:${process.env.PATH}`,
        JWT_SECRET_KEY: jwtSecret,
        AUTH_ENCRYPTION_SECRET: authSecret,
      },
    }
  );
  await sleep(3000);
  await waitHttpOk(`http://127.0.0.1:${translatePort}/mcp`, { timeoutMs: 120_000 }).catch(async () => {
    await waitHttpOk(`http://127.0.0.1:${translatePort}/sse`, { timeoutMs: 30_000 });
  });

  const gLog = fs.openSync(join(work, "gateway.log"), "w");
  const gateway = spawn(
    uvx,
    ["--from", "mcp-contextforge-gateway", "mcpgateway", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: work,
      stdio: ["ignore", gLog, gLog],
      env: {
        ...process.env,
        PATH: `${dirname(uv)}:${process.env.PATH}`,
        JWT_SECRET_KEY: jwtSecret,
        AUTH_ENCRYPTION_SECRET: authSecret,
        MCPGATEWAY_UI_ENABLED: "false",
        MCPGATEWAY_ADMIN_API_ENABLED: "true",
        PLATFORM_ADMIN_EMAIL: "admin@example.com",
        PLATFORM_ADMIN_PASSWORD: "changeme",
        BASIC_AUTH_USER: "admin@example.com",
        BASIC_AUTH_PASSWORD: "changeme",
      },
    }
  );
  await waitHttpOk(`http://127.0.0.1:${port}/health`, { timeoutMs: 180_000 });

  // Obtain token — try admin login / token helper
  let token = process.env.CONTEXTFORGE_TOKEN?.trim() || null;
  if (!token) {
    const tok = spawnSync(
      uvx,
      [
        "--from",
        "mcp-contextforge-gateway",
        "python",
        "-c",
        `from mcpgateway.utils.create_jwt_token import create_access_token; import asyncio; print(asyncio.run(create_access_token(data={"sub":"admin@example.com"})))`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${dirname(uv)}:${process.env.PATH}`,
          JWT_SECRET_KEY: jwtSecret,
          AUTH_ENCRYPTION_SECRET: authSecret,
        },
      }
    );
    token = (tok.stdout || "").trim().split("\n").filter(Boolean).pop() || null;
  }
  if (!token) {
    throw new Error("Could not mint ContextForge JWT (set CONTEXTFORGE_TOKEN)");
  }

  const upstreamUrl = `http://127.0.0.1:${translatePort}/mcp`;
  const regRes = await fetch(`http://127.0.0.1:${port}/gateways`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "pets",
      url: upstreamUrl,
      description: "equal-arm pets",
      transport: "STREAMABLEHTTP",
    }),
  });
  const regBody = await regRes.text();
  if (!regRes.ok) {
    throw new Error(`contextforge register gateway: ${regRes.status} ${regBody.slice(0, 500)}`);
  }
  const toolsRes = await fetch(`http://127.0.0.1:${port}/tools`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const toolsJson = await toolsRes.json();
  const toolList = Array.isArray(toolsJson) ? toolsJson : toolsJson?.tools || toolsJson?.data || [];
  const toolIds = toolList.map((t) => t.id || t.tool_id).filter(Boolean);
  const srvRes = await fetch(`http://127.0.0.1:${port}/servers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "bench",
      description: "equal-arm virtual server",
      associatedTools: toolIds.length ? toolIds : toolList.map((t) => String(t.id ?? t.name)),
    }),
  });
  const srvBody = await srvRes.text();
  if (!srvRes.ok) {
    throw new Error(`contextforge create server: ${srvRes.status} ${srvBody.slice(0, 500)}`);
  }
  const srv = JSON.parse(srvBody);
  const serverId = srv.id || srv.uuid || srv.server_id;
  const mcpUrl = `http://127.0.0.1:${port}/servers/${serverId}/mcp`;

  // Prefer stdio wrapper for reliable client path
  const callViaWrapper = async (client) => {
    const tools = await client.listTools();
    const hit =
      tools.tools.find((t) => t.name.includes("list_pets")) ||
      tools.tools.find((t) => /pet/i.test(t.name)) ||
      tools.tools[0];
    if (!hit) throw new Error("no tools on contextforge virtual server");
    const res = await client.callTool({ name: hit.name, arguments: {} });
    if (res.isError) throw new Error(toolText(res));
    return toolText(res);
  };

  const connect = async () => {
    // Try direct HTTP first; fall back to wrapper stdio
    try {
      const c = await connectHttpMcp(mcpUrl, "contextforge");
      await c.client.listTools();
      return c;
    } catch {
      const transport = new StdioClientTransport({
        command: uvx,
        args: ["--from", "mcp-contextforge-gateway", "python", "-m", "mcpgateway.wrapper"],
        env: {
          ...process.env,
          PATH: `${dirname(uv)}:${process.env.PATH}`,
          MCP_SERVER_URL: mcpUrl,
          MCP_AUTH: `Bearer ${token}`,
          JWT_SECRET_KEY: jwtSecret,
          AUTH_ENCRYPTION_SECRET: authSecret,
        },
        stderr: "pipe",
      });
      const client = new Client({ name: "contextforge-wrap", version: "1" }, {});
      await client.connect(transport);
      return {
        client,
        transport,
        pid: transportPid(transport),
        close: async () => {
          await client.close().catch(() => {});
        },
      };
    }
  };

  return {
    id: "contextforge",
    model: "virtual_mcp_server_over_translate",
    version: "mcp-contextforge-gateway (uvx)",
    mcpUrl,
    pid: gateway.pid,
    connect,
    call: callViaWrapper,
    close: async () => {
      killTree(gateway.pid);
      killTree(translate.pid);
      try {
        fs.closeSync(tLog);
        fs.closeSync(gLog);
      } catch {
        /* ignore */
      }
    },
  };
}

async function runHttpGatewayArm(starter, mock) {
  const gw = await starter();
  try {
    const latency = await measureCallArm({
      id: gw.id,
      model: gw.model,
      connect: gw.connect,
      call: gw.call,
      pidForResources: () => gw.pid,
      mockBaseUrl: mock.baseUrl,
      gatewayCostFromDirect: false,
    });
    const chaos = await chaosWithRefine({
      id: gw.id,
      connect: gw.connect,
      call: gw.call,
    });
    return {
      ...latency,
      version: gw.version,
      mcp_url: gw.mcpUrl,
      tool_name: gw.toolName ?? null,
      chaos,
    };
  } finally {
    await gw.close();
  }
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
      rss_mb_median: a.resources?.rss_mb?.median ?? null,
      cpu_pct_median: a.resources?.cpu_pct?.median ?? null,
      schema_tokens: a.tokens?.tools_list_schema_tokens ?? null,
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
  const arms = {};
  const errors = {};

  try {
    for (const arm of ARMS) {
      console.log(`\n[multi] === arm ${arm} ===`);
      try {
        if (arm === "clawql") {
          if (!existsSync(join(ROOT, "dist", "server.js"))) {
            arms.clawql = { skipped: true, reason: "dist/server.js missing" };
            continue;
          }
          arms.clawql = await armClawql(mock);
        } else if (arm === "executor") {
          if (!process.env.EXECUTOR_BIN?.trim()) {
            arms.executor = { skipped: true, reason: "EXECUTOR_BIN unset" };
            continue;
          }
          arms.executor = await armExecutor();
        } else if (arm === "mcpjungle") {
          arms.mcpjungle = await runHttpGatewayArm(startMcpjungle, mock);
        } else if (arm === "agentgateway") {
          arms.agentgateway = await runHttpGatewayArm(startAgentgateway, mock);
        } else if (arm === "contextforge") {
          arms.contextforge = await runHttpGatewayArm(startContextforge, mock);
        } else if (arm === "metamcp") {
          const docker = spawnSync("docker", ["info"], { encoding: "utf8" });
          if (docker.status !== 0) {
            arms.metamcp = {
              skipped: true,
              reason: "Docker unavailable in this environment; MetaMCP is Docker Compose–first",
            };
          } else {
            arms.metamcp = {
              skipped: true,
              reason: "MetaMCP Docker arm not wired in this harness revision",
            };
          }
        } else {
          errors[arm] = `unknown arm ${arm}`;
        }
      } catch (e) {
        console.error(`[multi] arm ${arm} failed:`, e);
        arms[arm] = { skipped: true, reason: String(e?.stack || e), error: true };
        errors[arm] = String(e?.message || e);
      }
    }

    const report = {
      suite: "gateway-multi-comparison",
      measuredAt: new Date().toISOString(),
      node: process.version,
      config: {
        iters: ITERS,
        warmup: WARMUP,
        chaos_max: CHAOS_MAX,
        chaos_step_ms: CHAOS_STEP_MS,
        break_p99_ms: BREAK_P99_MS,
        break_error_rate: BREAK_ERROR_RATE,
        refine: REFINE,
        arms: ARMS,
      },
      board: boardFromArms(arms),
      arms,
      errors,
      honesty: [
        "Equal-arm pets JSON across all arms.",
        "Aggregator arms use stdio equal-arm-pets MCP (upstream≈0).",
        "ClawQL OpenAPI execute hits mock HTTP; gateway_cost = e2e − direct.",
        "Executor code execute returns pets in-process; gateway_cost ≈ e2e.",
        "Chaos = concurrent MCP clients until p99>SLO or error_rate; binary refine tol=1.",
        "Panguard / durable WORM off. MetaMCP skipped without Docker.",
        "Hold publicizing until RAM narrative closed for ClawQL vs Executor; multi-arm is exploratory until repeated.",
      ],
    };

    await writeFile(OUT_PATH, JSON.stringify(report, null, 2));
    console.log(`\n[multi] wrote ${OUT_PATH}`);
    console.log(JSON.stringify(report.board, null, 2));
  } finally {
    await mock.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
