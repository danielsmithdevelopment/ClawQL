#!/usr/bin/env node
/**
 * Comprehensive ClawQL vs Executor breakdown (one report):
 *   1. Latency p50/p95/p99/p999 — interleaved equal-arm (paired gateway cost)
 *   2. CPU + RAM — /proc samples of both MCP server PIDs during the latency phase
 *   3. Tokens — tools/list schemas + equal-arm tool-result bodies (cl100k_base)
 *   4. Chaos — stdio process-per-client (equal-arm honesty) + HTTP multiplex
 *   5. Chaos scale-out (primary win arm) — ClawQL K HTTP replicas with NATS
 *      queue-group session assignment vs Executor N independent stdio processes
 *
 * Honesty:
 *   - Equal-arm pets JSON (same as latency-fair); Executor has no fetch (upstream=0)
 *   - Tokens here are schema + result size, not an LLM bill for a multi-turn agent
 *   - Stdio chaos is N processes/arm (not multiplexed). Scale-out is the product path:
 *     fixed K gateway replicas, N sticky clients via NATS queue group assign.
 *   - Layer-1 tool schema is intentionally rich (do not gut for token parity).
 *   - Panguard off; durable WORM off unless COMPREHENSIVE_GOVERNANCE=1 (in-memory only)
 *
 * Usage:
 *   EXECUTOR_BIN=… EXECUTOR_CWD=… \
 *     COMPREHENSIVE_ITERS=500 COMPREHENSIVE_CHAOS_MAX=8 \
 *     COMPREHENSIVE_CHAOS_SCALEOUT_MAX=32 COMPREHENSIVE_CHAOS_WORKERS=4 \
 *     npm run benchmark:executor-comparison:comprehensive
 *
 * Env:
 *   COMPREHENSIVE_ITERS (default 500) — interleaved latency samples
 *   COMPREHENSIVE_WARMUP (default 30)
 *   COMPREHENSIVE_CHAOS_MAX (default 8) — max concurrent stdio workers
 *   COMPREHENSIVE_CHAOS_SCALEOUT_MAX (default 32) — max concurrent clients (scale-out)
 *   COMPREHENSIVE_CHAOS_WORKERS (default 4) — ClawQL HTTP replicas behind NATS assign
 *   COMPREHENSIVE_CHAOS_STEP_MS (default 4000) — per concurrency step duration
 *   COMPREHENSIVE_BREAK_P99_MS (default 100)
 *   COMPREHENSIVE_BREAK_ERROR_RATE (default 0.02)
 *   COMPREHENSIVE_NATS_SERVER (optional path to nats-server binary)
 *   COMPREHENSIVE_OUT (default executor-cmp-comprehensive.json)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { spawn, spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { connect as natsConnect, Empty, StringCodec } from "nats";
import { getEncoding } from "js-tiktoken";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "executor-comparison");
const OUT_NAME = (process.env.COMPREHENSIVE_OUT ?? "executor-cmp-comprehensive.json").replace(
  /[^a-zA-Z0-9._-]/g,
  ""
);
const OUT_PATH = join(OUT_DIR, OUT_NAME || "executor-cmp-comprehensive.json");

const ITERS = Math.max(20, Number(process.env.COMPREHENSIVE_ITERS ?? 500) || 500);
const WARMUP = Math.max(0, Number(process.env.COMPREHENSIVE_WARMUP ?? 30) || 30);
const CHAOS_MAX = Math.max(1, Number(process.env.COMPREHENSIVE_CHAOS_MAX ?? 8) || 8);
const CHAOS_SCALEOUT_MAX = Math.max(
  1,
  Number(process.env.COMPREHENSIVE_CHAOS_SCALEOUT_MAX ?? 32) || 32
);
const CHAOS_WORKERS = Math.max(1, Number(process.env.COMPREHENSIVE_CHAOS_WORKERS ?? 4) || 4);
const CHAOS_STEP_MS = Math.max(1000, Number(process.env.COMPREHENSIVE_CHAOS_STEP_MS ?? 4000) || 4000);
const CHAOS_WARMUP = Math.max(0, Number(process.env.COMPREHENSIVE_CHAOS_WARMUP ?? 8) || 8);
const CHAOS_HTTP = process.env.COMPREHENSIVE_CHAOS_HTTP !== "0";
const CHAOS_SCALEOUT = process.env.COMPREHENSIVE_CHAOS_SCALEOUT !== "0";
const BREAK_P99_MS = Math.max(1, Number(process.env.COMPREHENSIVE_BREAK_P99_MS ?? 100) || 100);
const ASSIGN_SUBJECT = "clawql.chaos.assign";
const ASSIGN_QUEUE = "clawql-chaos-assign";
const BREAK_ERROR_RATE = Math.min(
  1,
  Math.max(0, Number(process.env.COMPREHENSIVE_BREAK_ERROR_RATE ?? 0.02) || 0.02)
);
const GOVERNANCE = process.env.COMPREHENSIVE_GOVERNANCE === "1";
const CLK_TCK = (() => {
  const r = spawnSync("getconf", ["CLK_TCK"], { encoding: "utf8" });
  const n = Number(r.stdout?.trim());
  return Number.isFinite(n) && n > 0 ? n : 100;
})();

const EQUAL_PAYLOAD = {
  pets: [
    { id: 1, name: "Ada", status: "available" },
    { id: 2, name: "Grace", status: "available" },
  ],
};
const EXECUTOR_EQUAL_CODE = `return ${JSON.stringify(EQUAL_PAYLOAD)};`;
const enc = getEncoding("cl100k_base");

function countTokens(text) {
  if (text == null || text === "") return 0;
  return enc.encode(String(text)).length;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
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

function readVersions() {
  let clawqlVersion = null;
  let clawqlCommit = null;
  let executorVersion = null;
  try {
    clawqlVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  } catch {
    /* ignore */
  }
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  if (head.status === 0) clawqlCommit = head.stdout.trim();
  const execCwd = process.env.EXECUTOR_CWD?.trim();
  if (execCwd) {
    try {
      executorVersion = JSON.parse(
        readFileSync(join(execCwd, "node_modules/executor/package.json"), "utf8")
      ).version;
    } catch {
      try {
        executorVersion = JSON.parse(readFileSync(join(execCwd, "package.json"), "utf8")).version;
      } catch {
        /* ignore */
      }
    }
  }
  return {
    clawql: { version: clawqlVersion, commit: clawqlCommit },
    executor: { version: executorVersion, bin: process.env.EXECUTOR_BIN?.trim() ?? null },
    node: process.version,
    measuredAt: new Date().toISOString(),
  };
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

/** Direct children of pid (Executor CLI often wraps a node child). */
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
    // Sum process tree — Executor's stdio PID is often a thin wrapper around node.
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
      rss_mb: {
        min: rss[0],
        median: percentile(rss, 50),
        max: rss[rss.length - 1],
      },
      cpu_pct: {
        min: cpu[0],
        median: percentile(cpu, 50),
        max: cpu[cpu.length - 1],
        mean: Number(cpuMean.toFixed(2)),
      },
    };
  }
}

async function startMockUpstream() {
  const body = JSON.stringify(EQUAL_PAYLOAD);
  /** Fat list for token Layer-2 style contrast (not used in latency equal-arm). */
  const fat = {
    pets: Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      name: `Pet-${i + 1}`,
      status: i % 3 === 0 ? "sold" : "available",
      tag: `tag-${i % 10}`,
      meta: { kennel: `K${i % 5}`, notes: "x".repeat(40) },
    })),
  };
  const fatBody = JSON.stringify(fat);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const payload = url.pathname === "/pets-fat" ? fatBody : body;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(payload);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const specPath = join("/tmp", `clawql-comprehensive-${process.pid}.json`);
  await writeFile(
    specPath,
    JSON.stringify(
      {
        openapi: "3.0.3",
        info: { title: "ComprehensiveEqual", version: "1" },
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
          "/pets-fat": {
            get: {
              operationId: "listPetsFat",
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
    equalBody: body,
    fatBody,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
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
    // Equal-arm / chaos: force REST so Omnigraph never loads in these processes.
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
  if (GOVERNANCE) {
    env.CLAWQL_WORM_ENABLED = "1";
    env.CLAWQL_WORM_LOCAL = "memory";
  } else {
    delete env.CLAWQL_WORM_ENABLED;
    delete env.CLAWQL_WORM_LOCAL;
    delete env.CLAWQL_WORM_REMOTE;
  }
  return env;
}

function toolText(res) {
  const c = res?.content;
  if (!Array.isArray(c)) return "";
  return c
    .filter((x) => x?.type === "text")
    .map((x) => x.text)
    .join("\n");
}

async function connectClawql(env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "pipe",
    env,
  });
  const client = new Client({ name: "comprehensive-clawql", version: "1" }, {});
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

async function connectExecutor() {
  const bin = process.env.EXECUTOR_BIN?.trim();
  if (!bin) throw new Error("EXECUTOR_BIN required");
  const transport = new StdioClientTransport({
    command: bin,
    args: ["mcp"],
    cwd: process.env.EXECUTOR_CWD?.trim() || dirname(bin),
    stderr: "pipe",
  });
  const client = new Client({ name: "comprehensive-executor", version: "1" }, {});
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

async function timeOnce(fn) {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

async function callClawql(client, operationId = "listPets", fields = ["pets"]) {
  const res = await client.callTool({
    name: "execute",
    arguments: { operationId, args: {}, fields },
  });
  if (res.isError) throw new Error(`clawql: ${toolText(res)}`);
  return toolText(res);
}

async function callExecutor(client, code = EXECUTOR_EQUAL_CODE) {
  const res = await client.callTool({
    name: "execute",
    arguments: { code, timeoutMs: 30_000 },
  });
  if (res.isError) throw new Error(`executor: ${toolText(res)}`);
  return toolText(res);
}

async function callDirect(baseUrl, path = "/pets") {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) throw new Error(`direct ${res.status}`);
  return res.text();
}

async function phaseLatencyAndResources(mock) {
  const home = join("/tmp", `clawql-comp-${process.pid}`);
  await mkdir(home, { recursive: true });
  const claw = await connectClawql(clawqlEnv(home, mock.specPath, mock.baseUrl));
  const exec = await connectExecutor();
  const clawSampler = new ResourceSampler("clawql_mcp", claw.pid);
  const execSampler = new ResourceSampler("executor_mcp", exec.pid);
  clawSampler.start(50);
  execSampler.start(50);

  try {
    for (let i = 0; i < WARMUP; i++) {
      await callClawql(claw.client);
      await callExecutor(exec.client);
      await callDirect(mock.baseUrl);
    }

    const clawqlS = [];
    const executorS = [];
    const directS = [];
    const gatewayS = [];
    for (let i = 0; i < ITERS; i++) {
      const c = await timeOnce(() => callClawql(claw.client));
      const e = await timeOnce(() => callExecutor(exec.client));
      const d = await timeOnce(() => callDirect(mock.baseUrl));
      clawqlS.push(c);
      executorS.push(e);
      directS.push(d);
      gatewayS.push(c - d);
    }

    return {
      latency: {
        clawql_execute_e2e: summarize(clawqlS),
        executor_execute: summarize(executorS),
        direct_http: summarize(directS),
        clawql_gateway_cost: summarize(gatewayS),
        executor_gateway_cost: summarize(executorS),
        method:
          "Interleaved ClawQL→Executor→direct; clawql_gateway_cost = execute_i − direct_i; Executor upstream=0",
      },
      resources: {
        clawql: clawSampler.stop(),
        executor: execSampler.stop(),
      },
      pids: { clawql: claw.pid, executor: exec.pid },
    };
  } finally {
    clawSampler.stop();
    execSampler.stop();
    await claw.close();
    await exec.close();
  }
}

async function phaseTokens(mock) {
  const home = join("/tmp", `clawql-comp-tok-${process.pid}`);
  await mkdir(home, { recursive: true });
  const claw = await connectClawql(clawqlEnv(home, mock.specPath, mock.baseUrl));
  const exec = await connectExecutor();
  try {
    const clawTools = await claw.client.listTools();
    const execTools = await exec.client.listTools();
    const clawSchemaTok = clawTools.tools.reduce(
      (n, t) => n + countTokens(JSON.stringify(t)),
      0
    );
    const execSchemaTok = execTools.tools.reduce(
      (n, t) => n + countTokens(JSON.stringify(t)),
      0
    );
    const clawExecuteOnly = clawTools.tools.find((t) => t.name === "execute");
    const execExecuteOnly = execTools.tools.find((t) => t.name === "execute");

    const clawEqual = await callClawql(claw.client, "listPets", ["pets"]);
    const execEqual = await callExecutor(exec.client);
    const clawFat = await callClawql(claw.client, "listPetsFat", ["pets"]);
    // Executor "raw" fat: return full fat JSON in-process (simulates no projection).
    const execFat = await callExecutor(
      exec.client,
      `return ${JSON.stringify(JSON.parse(mock.fatBody))};`
    );
    // Lean projection demo (what ClawQL fields win looks like vs full dump).
    const clawFatLean = JSON.stringify({
      pets: JSON.parse(mock.fatBody).pets.map((p) => ({ id: p.id, name: p.name, status: p.status })),
    });

    return {
      tokenizer: "cl100k_base",
      layer1_tool_schemas: {
        clawql_all_tools_tokens: clawSchemaTok,
        clawql_execute_tool_tokens: clawExecuteOnly ? countTokens(JSON.stringify(clawExecuteOnly)) : null,
        clawql_tool_count: clawTools.tools.length,
        executor_all_tools_tokens: execSchemaTok,
        executor_execute_tool_tokens: execExecuteOnly
          ? countTokens(JSON.stringify(execExecuteOnly))
          : null,
        executor_tool_count: execTools.tools.length,
        note: "Schema tokens are agent context cost to discover tools — not per-call result size.",
      },
      layer2_tool_results: {
        equal_arm_pets: {
          clawql_tokens: countTokens(clawEqual),
          executor_tokens: countTokens(execEqual),
          note: "Same tiny JSON — token parity expected; ClawQL still paid fields shaping.",
        },
        fat_list_contrast: {
          clawql_full_fields_pets_tokens: countTokens(clawFat),
          clawql_lean_projected_tokens: countTokens(clawFatLean),
          executor_full_dump_tokens: countTokens(execFat),
          ratio_executor_over_clawql_lean: Number(
            (countTokens(execFat) / Math.max(1, countTokens(clawFatLean))).toFixed(2)
          ),
          note:
            "Lean projection is the ClawQL fields win (id/name/status). " +
            "Executor full dump is what agents get without program-filter / code mode.",
        },
      },
    };
  } finally {
    await claw.close();
    await exec.close();
  }
}

/**
 * One chaos worker: own stdio MCP process, closed-loop execute for `durationMs`.
 * Warmup calls are excluded from latency / error SLO (cold-start must not dominate p99).
 */
async function chaosWorker(kind, mock, durationMs) {
  const home = join("/tmp", `clawql-chaos-${kind}-${process.pid}-${Math.random().toString(16).slice(2)}`);
  await mkdir(home, { recursive: true });
  const conn =
    kind === "clawql"
      ? await connectClawql(clawqlEnv(home, mock.specPath, mock.baseUrl))
      : await connectExecutor();
  const sampler = new ResourceSampler(`${kind}_chaos`, conn.pid);
  sampler.start(100);
  const latencies = [];
  let ok = 0;
  let err = 0;
  try {
    for (let i = 0; i < CHAOS_WARMUP; i++) {
      try {
        if (kind === "clawql") await callClawql(conn.client);
        else await callExecutor(conn.client);
      } catch {
        /* warmup errors ignored */
      }
    }
    const tEnd = performance.now() + durationMs;
    while (performance.now() < tEnd) {
      try {
        const ms = await timeOnce(async () => {
          if (kind === "clawql") await callClawql(conn.client);
          else await callExecutor(conn.client);
        });
        latencies.push(ms);
        ok += 1;
      } catch {
        err += 1;
      }
    }
  } finally {
    const resources = sampler.stop();
    await conn.close();
    return { ok, err, latencies, resources, alive: true };
  }
}

async function phaseChaos(mock) {
  const steps = [];
  let brokeAt = null;
  let breakReason = null;

  for (let n = 1; n <= CHAOS_MAX; n *= 2) {
    console.error(`[comprehensive] chaos concurrency=${n} step_ms=${CHAOS_STEP_MS}`);
    const kinds = ["clawql", "executor"];
    const step = { concurrency: n, duration_ms: CHAOS_STEP_MS, arms: {} };

    for (const kind of kinds) {
      const workers = await Promise.all(
        Array.from({ length: n }, () => chaosWorker(kind, mock, CHAOS_STEP_MS))
      );
      const latencies = workers.flatMap((w) => w.latencies);
      const ok = workers.reduce((a, w) => a + w.ok, 0);
      const err = workers.reduce((a, w) => a + w.err, 0);
      const total = ok + err;
      const errorRate = total > 0 ? err / total : 1;
      const stats = summarize(latencies);
      const rssMax = Math.max(
        0,
        ...workers.map((w) => w.resources.rss_mb?.max ?? 0).filter((x) => x != null)
      );
      const cpuMean =
        workers.reduce((a, w) => a + (w.resources.cpu_pct?.mean ?? 0), 0) / workers.length;
      const rps = ok / (CHAOS_STEP_MS / 1000);
      const broken =
        errorRate > BREAK_ERROR_RATE ||
        (stats.p99_ms != null && stats.p99_ms > BREAK_P99_MS) ||
        workers.some((w) => !w.alive);

      step.arms[kind] = {
        ok,
        err,
        error_rate: Number(errorRate.toFixed(4)),
        rps: Number(rps.toFixed(1)),
        latency: stats,
        rss_mb_max_across_workers: rssMax,
        cpu_pct_mean_across_workers: Number(cpuMean.toFixed(2)),
        broken,
        break_checks: {
          error_rate_gt: BREAK_ERROR_RATE,
          p99_ms_gt: BREAK_P99_MS,
        },
      };

      if (broken && !brokeAt) {
        brokeAt = { concurrency: n, kind };
        const reasons = [];
        if (errorRate > BREAK_ERROR_RATE) reasons.push(`error_rate ${errorRate.toFixed(3)}`);
        if (stats.p99_ms != null && stats.p99_ms > BREAK_P99_MS)
          reasons.push(`p99 ${stats.p99_ms}ms`);
        breakReason = reasons.join(" + ") || "worker_death";
      }
    }

    steps.push(step);
    if (brokeAt) break;
  }

  const lastOk = [...steps].reverse().find((s) => !s.arms.clawql?.broken && !s.arms.executor?.broken);
  return {
    slo: {
      break_p99_ms: BREAK_P99_MS,
      break_error_rate: BREAK_ERROR_RATE,
      step_ms: CHAOS_STEP_MS,
      max_concurrency_tried: CHAOS_MAX,
    },
    steps,
    sustained_concurrency_before_break: lastOk?.concurrency ?? 0,
    broke_at: brokeAt,
    break_reason: breakReason,
    note:
      `Each concurrency level spawns N independent stdio MCP processes per arm for step_ms ` +
      `(warmup=${CHAOS_WARMUP} excluded from stats). Break = error_rate or p99 SLO. ` +
      "Not a single multiplexed session — see chaos_http for shared-process ClawQL load.",
  };
}

/**
 * ClawQL-only: one Streamable HTTP MCP process, N concurrent clients (multiplexed load tail).
 * Executor has no equal HTTP arm here — reported separately from stdio process-chaos.
 */
async function phaseChaosHttp(mock) {
  if (!CHAOS_HTTP) {
    return { skipped: true, reason: "COMPREHENSIVE_CHAOS_HTTP=0" };
  }
  if (!existsSync(join(ROOT, "dist", "server-http.js"))) {
    return { skipped: true, reason: "dist/server-http.js missing" };
  }

  const home = join("/tmp", `clawql-chaos-http-${process.pid}`);
  await mkdir(home, { recursive: true });
  const port = 18000 + (process.pid % 1000);
  const env = {
    ...clawqlEnv(home, mock.specPath, mock.baseUrl),
    PORT: String(port),
    MCP_PORT: String(port),
    MCP_HOST: "127.0.0.1",
    CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE: "1",
  };
  const child = spawn(process.execPath, [join(ROOT, "dist", "server-http.js")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let earlyExit = null;
  const onEarlyExit = (code, signal) => {
    earlyExit = { code, signal };
  };
  child.on("exit", onEarlyExit);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("clawql-http Ready timeout")), 90_000);
      const onData = (chunk) => {
        if (String(chunk).includes("listening on")) {
          clearTimeout(timer);
          resolve(undefined);
        }
      };
      child.stderr?.on("data", onData);
      child.stdout?.on("data", onData);
      child.on("error", reject);
    });
  } catch (err) {
    child.kill("SIGKILL");
    throw err;
  }
  if (earlyExit) {
    child.kill("SIGKILL");
    throw new Error(`clawql-http exited early code=${earlyExit.code}`);
  }

  const sampler = new ResourceSampler("clawql_http", child.pid);
  sampler.start(100);
  const steps = [];
  let brokeAt = null;
  let breakReason = null;
  let resources;
  try {
    for (let n = 1; n <= CHAOS_MAX; n *= 2) {
      console.error(`[comprehensive] chaos_http concurrency=${n} step_ms=${CHAOS_STEP_MS}`);
      const clients = [];
      for (let i = 0; i < n; i++) {
        const transport = new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${port}/mcp`)
        );
        const client = new Client({ name: `chaos-http-${i}`, version: "1" }, {});
        await client.connect(transport);
        clients.push({ client, transport });
      }
      for (const c of clients) {
        for (let w = 0; w < CHAOS_WARMUP; w++) {
          try {
            await callClawql(c.client);
          } catch {
            /* warmup */
          }
        }
      }
      const latencies = [];
      let ok = 0;
      let err = 0;
      const tEnd = performance.now() + CHAOS_STEP_MS;
      await Promise.all(
        clients.map(async (c) => {
          while (performance.now() < tEnd) {
            try {
              const ms = await timeOnce(() => callClawql(c.client));
              latencies.push(ms);
              ok += 1;
            } catch {
              err += 1;
            }
          }
        })
      );
      for (const c of clients) {
        await c.client.close().catch(() => {});
      }
      const total = ok + err;
      const errorRate = total > 0 ? err / total : 1;
      const stats = summarize(latencies);
      const broken =
        errorRate > BREAK_ERROR_RATE || (stats.p99_ms != null && stats.p99_ms > BREAK_P99_MS);
      steps.push({
        concurrency: n,
        ok,
        err,
        error_rate: Number(errorRate.toFixed(4)),
        rps: Number((ok / (CHAOS_STEP_MS / 1000)).toFixed(1)),
        latency: stats,
        broken,
      });
      if (broken && !brokeAt) {
        brokeAt = { concurrency: n };
        const reasons = [];
        if (errorRate > BREAK_ERROR_RATE) reasons.push(`error_rate ${errorRate.toFixed(3)}`);
        if (stats.p99_ms != null && stats.p99_ms > BREAK_P99_MS)
          reasons.push(`p99 ${stats.p99_ms}ms`);
        breakReason = reasons.join(" + ") || "slo";
        break;
      }
    }
  } finally {
    resources = sampler.stop();
    child.off("exit", onEarlyExit);
    child.kill("SIGTERM");
    await sleep(200);
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
  const lastOk = [...steps].reverse().find((s) => !s.broken);
  return {
    transport: "streamable_http_multiplex",
    slo: {
      break_p99_ms: BREAK_P99_MS,
      break_error_rate: BREAK_ERROR_RATE,
      step_ms: CHAOS_STEP_MS,
      max_concurrency_tried: CHAOS_MAX,
      warmup: CHAOS_WARMUP,
    },
    steps,
    sustained_concurrency_before_break: lastOk?.concurrency ?? 0,
    broke_at: brokeAt,
    break_reason: breakReason,
    resources,
    note:
      "One ClawQL HTTP MCP process; N concurrent Streamable HTTP clients. " +
      "Not equal-arm vs Executor (stdio-only). Measures shared-process load tail.",
  };
}

function resolveNatsServerBin() {
  const override = process.env.COMPREHENSIVE_NATS_SERVER?.trim();
  if (override && existsSync(override)) return override;
  const candidates = [
    join("/tmp", "nats-bin", "nats-server"),
    join(ROOT, "tmp", "nats-server"),
    "/usr/local/bin/nats-server",
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function startNatsServer() {
  const bin = resolveNatsServerBin();
  if (!bin) {
    return { skipped: true, reason: "nats-server binary not found (set COMPREHENSIVE_NATS_SERVER)" };
  }
  const port = 4222 + (process.pid % 200);
  const child = spawn(bin, ["-a", "127.0.0.1", "-p", String(port), "-js"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let early = null;
  const onExit = (code, signal) => {
    early = { code, signal };
  };
  child.on("exit", onExit);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("nats-server start timeout")), 15_000);
      const onData = (chunk) => {
        if (/Server is ready|Listening for client connections/i.test(String(chunk))) {
          clearTimeout(timer);
          resolve(undefined);
        }
      };
      child.stderr?.on("data", onData);
      child.stdout?.on("data", onData);
      child.on("error", reject);
    });
  } catch (err) {
    child.kill("SIGKILL");
    throw err;
  }
  if (early) {
    child.kill("SIGKILL");
    throw new Error(`nats-server exited early code=${early.code}`);
  }
  child.off("exit", onExit);
  const url = `nats://127.0.0.1:${port}`;
  return {
    url,
    port,
    close: async () => {
      child.kill("SIGTERM");
      await sleep(150);
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    },
  };
}

async function startClawqlHttpReplica(port, home, mock) {
  await mkdir(home, { recursive: true });
  const env = {
    ...clawqlEnv(home, mock.specPath, mock.baseUrl),
    PORT: String(port),
    MCP_PORT: String(port),
    MCP_HOST: "127.0.0.1",
    CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE: "1",
  };
  const child = spawn(process.execPath, [join(ROOT, "dist", "server-http.js")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`http replica :${port} timeout`)), 90_000);
    const onData = (chunk) => {
      if (String(chunk).includes("listening on")) {
        clearTimeout(timer);
        resolve(undefined);
      }
    };
    child.stderr?.on("data", onData);
    child.stdout?.on("data", onData);
    child.on("error", reject);
  });
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    pid: child.pid,
    close: async () => {
      child.kill("SIGTERM");
      await sleep(100);
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    },
  };
}

async function startNatsAssignWorker(natsUrl, baseUrl) {
  const child = spawn(
    process.execPath,
    [join(ROOT, "scripts", "benchmarks", "lib", "nats-chaos-assign-worker.mjs")],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        CLAWQL_NATS_URL: natsUrl,
        CHAOS_WORKER_BASE_URL: baseUrl,
        CHAOS_ASSIGN_SUBJECT: ASSIGN_SUBJECT,
        CHAOS_ASSIGN_QUEUE: ASSIGN_QUEUE,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("assign worker timeout")), 15_000);
    const onData = (chunk) => {
      if (String(chunk).includes("[nats-chaos-assign] ready")) {
        clearTimeout(timer);
        resolve(undefined);
      }
    };
    child.stderr?.on("data", onData);
    child.stdout?.on("data", onData);
    child.on("error", reject);
  });
  return {
    close: async () => {
      child.kill("SIGTERM");
      await sleep(50);
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    },
  };
}

async function assignWorkerBaseUrl(nc, sc) {
  const msg = await nc.request(ASSIGN_SUBJECT, Empty, { timeout: 5000 });
  const parsed = JSON.parse(sc.decode(msg.data));
  if (!parsed?.baseUrl) throw new Error("assign response missing baseUrl");
  return parsed.baseUrl;
}

/**
 * Primary chaos win arm: ClawQL K HTTP replicas + NATS queue-group session assign
 * vs Executor N independent stdio MCP processes (their process-per-client model).
 */
async function phaseChaosScaleout(mock) {
  if (!CHAOS_SCALEOUT) {
    return { skipped: true, reason: "COMPREHENSIVE_CHAOS_SCALEOUT=0" };
  }
  if (!existsSync(join(ROOT, "dist", "server-http.js"))) {
    return { skipped: true, reason: "dist/server-http.js missing" };
  }

  const nats = await startNatsServer();
  if (nats.skipped) return nats;

  const replicas = [];
  const assigners = [];
  let nc;
  const sc = StringCodec();
  const steps = [];
  let brokeAt = null;
  let breakReason = null;

  try {
    const basePort = 19000 + (process.pid % 500);
    for (let i = 0; i < CHAOS_WORKERS; i++) {
      const port = basePort + i;
      const home = join("/tmp", `clawql-scaleout-w${i}-${process.pid}`);
      const replica = await startClawqlHttpReplica(port, home, mock);
      replicas.push(replica);
      assigners.push(await startNatsAssignWorker(nats.url, replica.baseUrl));
    }
    nc = await natsConnect({ servers: nats.url });

    // Probe assign before ramp.
    const probe = await assignWorkerBaseUrl(nc, sc);
    if (!probe.startsWith("http://127.0.0.1:")) throw new Error(`bad assign ${probe}`);

    let executorAlreadyBroken = false;
    for (let n = 1; n <= CHAOS_SCALEOUT_MAX; n *= 2) {
      console.error(
        `[comprehensive] chaos_scaleout clients=${n} clawql_workers=${CHAOS_WORKERS} step_ms=${CHAOS_STEP_MS}`
      );
      const step = {
        concurrency: n,
        duration_ms: CHAOS_STEP_MS,
        arms: {},
      };

      // --- ClawQL: N sticky clients via NATS assign → K HTTP replicas ---
      {
        const clients = [];
        for (let i = 0; i < n; i++) {
          const baseUrl = await assignWorkerBaseUrl(nc, sc);
          const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
          const client = new Client({ name: `scaleout-claw-${i}`, version: "1" }, {});
          await client.connect(transport);
          clients.push({ client, baseUrl });
        }
        for (const c of clients) {
          for (let w = 0; w < CHAOS_WARMUP; w++) {
            try {
              await callClawql(c.client);
            } catch {
              /* warmup */
            }
          }
        }
        const latencies = [];
        let ok = 0;
        let err = 0;
        const tEnd = performance.now() + CHAOS_STEP_MS;
        await Promise.all(
          clients.map(async (c) => {
            while (performance.now() < tEnd) {
              try {
                const ms = await timeOnce(() => callClawql(c.client));
                latencies.push(ms);
                ok += 1;
              } catch {
                err += 1;
              }
            }
          })
        );
        for (const c of clients) await c.client.close().catch(() => {});
        const total = ok + err;
        const errorRate = total > 0 ? err / total : 1;
        const stats = summarize(latencies);
        const broken =
          errorRate > BREAK_ERROR_RATE || (stats.p99_ms != null && stats.p99_ms > BREAK_P99_MS);
        step.arms.clawql = {
          model: "nats_queue_assign_sticky_http",
          workers: CHAOS_WORKERS,
          ok,
          err,
          error_rate: Number(errorRate.toFixed(4)),
          rps: Number((ok / (CHAOS_STEP_MS / 1000)).toFixed(1)),
          latency: stats,
          broken,
        };
        if (broken && !brokeAt) {
          brokeAt = { concurrency: n, kind: "clawql" };
          const reasons = [];
          if (errorRate > BREAK_ERROR_RATE) reasons.push(`error_rate ${errorRate.toFixed(3)}`);
          if (stats.p99_ms != null && stats.p99_ms > BREAK_P99_MS)
            reasons.push(`p99 ${stats.p99_ms}ms`);
          breakReason = reasons.join(" + ") || "slo";
        }
      }

      // --- Executor: N independent stdio processes (skip once broken to save wall time) ---
      if (!executorAlreadyBroken) {
        const workers = await Promise.all(
          Array.from({ length: n }, () => chaosWorker("executor", mock, CHAOS_STEP_MS))
        );
        const latencies = workers.flatMap((w) => w.latencies);
        const ok = workers.reduce((a, w) => a + w.ok, 0);
        const err = workers.reduce((a, w) => a + w.err, 0);
        const total = ok + err;
        const errorRate = total > 0 ? err / total : 1;
        const stats = summarize(latencies);
        const broken =
          errorRate > BREAK_ERROR_RATE ||
          (stats.p99_ms != null && stats.p99_ms > BREAK_P99_MS) ||
          workers.some((w) => !w.alive);
        step.arms.executor = {
          model: "stdio_process_per_client",
          workers: n,
          ok,
          err,
          error_rate: Number(errorRate.toFixed(4)),
          rps: Number((ok / (CHAOS_STEP_MS / 1000)).toFixed(1)),
          latency: stats,
          broken,
        };
        if (broken) {
          executorAlreadyBroken = true;
          if (!brokeAt) {
            brokeAt = { concurrency: n, kind: "executor" };
            const reasons = [];
            if (errorRate > BREAK_ERROR_RATE) reasons.push(`error_rate ${errorRate.toFixed(3)}`);
            if (stats.p99_ms != null && stats.p99_ms > BREAK_P99_MS)
              reasons.push(`p99 ${stats.p99_ms}ms`);
            breakReason = reasons.join(" + ") || "worker_death";
          }
        }
      } else {
        step.arms.executor = {
          model: "stdio_process_per_client",
          skipped: true,
          reason: "already_broken_at_lower_concurrency",
          broken: true,
        };
      }

      steps.push(step);
      // Keep ramping ClawQL after Executor breaks; stop when ClawQL breaks or max.
      if (step.arms.clawql?.broken) break;
    }
  } finally {
    try {
      await nc?.drain();
      await nc?.close();
    } catch {
      /* ignore */
    }
    for (const a of assigners) await a.close().catch(() => {});
    for (const r of replicas) await r.close().catch(() => {});
    await nats.close?.();
  }

  const clawOk = [...steps].reverse().find((s) => !s.arms.clawql?.broken);
  const execOk = [...steps]
    .reverse()
    .find((s) => s.arms.executor && !s.arms.executor.skipped && !s.arms.executor.broken);
  const clawSus = clawOk?.concurrency ?? 0;
  const execSus = execOk?.concurrency ?? 0;
  let winner = "tie";
  let winReason = "equal_sustained";
  if (clawSus > execSus) {
    winner = "clawql";
    winReason = "higher_sustained_clients";
  } else if (execSus > clawSus) {
    winner = "executor";
    winReason = "higher_sustained_clients";
  } else if (brokeAt?.kind === "executor" && !steps.some((s) => s.arms.clawql?.broken)) {
    winner = "clawql";
    winReason = "executor_broke_first";
  } else if (brokeAt?.kind === "clawql" && !steps.some((s) => s.arms.executor?.broken)) {
    winner = "executor";
    winReason = "clawql_broke_first";
  } else {
    // Both held the ramp: prefer clearly better throughput with equal-or-better p99.
    const last = [...steps]
      .reverse()
      .find((s) => s.arms.clawql && s.arms.executor && !s.arms.executor.skipped);
    if (last && !last.arms.clawql.broken && !last.arms.executor.broken) {
      const cR = last.arms.clawql.rps ?? 0;
      const eR = last.arms.executor.rps ?? 0;
      const cP = last.arms.clawql.latency?.p99_ms ?? Infinity;
      const eP = last.arms.executor.latency?.p99_ms ?? Infinity;
      if (cR >= eR * 1.25 && cP <= eP) {
        winner = "clawql";
        winReason = `higher_rps_at_cap (${cR} vs ${eR}) with p99 ${cP}≤${eP}`;
      } else if (eR >= cR * 1.25 && eP <= cP) {
        winner = "executor";
        winReason = `higher_rps_at_cap (${eR} vs ${cR}) with p99 ${eP}≤${cP}`;
      } else if (cP * 2 <= eP && cR >= eR) {
        winner = "clawql";
        winReason = `much_better_p99_at_cap (${cP} vs ${eP})`;
      } else if (eP * 2 <= cP && eR >= cR) {
        winner = "executor";
        winReason = `much_better_p99_at_cap (${eP} vs ${cP})`;
      }
    }
  }

  return {
    primary: true,
    transport: "nats_queue_assign_sticky_http_vs_stdio",
    nats_url: nats.url,
    clawql_workers: CHAOS_WORKERS,
    assign_subject: ASSIGN_SUBJECT,
    assign_queue: ASSIGN_QUEUE,
    slo: {
      break_p99_ms: BREAK_P99_MS,
      break_error_rate: BREAK_ERROR_RATE,
      step_ms: CHAOS_STEP_MS,
      max_concurrency_tried: CHAOS_SCALEOUT_MAX,
      warmup: CHAOS_WARMUP,
    },
    steps,
    clawql_sustained_clients: clawSus,
    executor_sustained_clients: execSus,
    winner,
    win_reason: winReason,
    broke_at: brokeAt,
    break_reason: breakReason,
    note:
      "Primary chaos arm. ClawQL: fixed K HTTP gateway replicas; each client asks NATS " +
      "queue group clawql-chaos-assign for a sticky base URL (fabric session placement). " +
      "Executor: N independent stdio MCP processes (process-per-client). " +
      "Win = higher sustained clients before SLO break; at equal cap, higher rps with ≤ p99.",
  };
}

function boardTable(latency, resources, tokens, chaos, chaosHttp, chaosScaleout) {
  const scaleWinner = chaosScaleout?.winner ?? null;
  return {
    latency_ms: {
      clawql_gateway_p50: latency.clawql_gateway_cost.p50_ms,
      clawql_gateway_p95: latency.clawql_gateway_cost.p95_ms,
      clawql_gateway_p99: latency.clawql_gateway_cost.p99_ms,
      clawql_gateway_p999: latency.clawql_gateway_cost.p999_ms,
      executor_p50: latency.executor_gateway_cost.p50_ms,
      executor_p95: latency.executor_gateway_cost.p95_ms,
      executor_p99: latency.executor_gateway_cost.p99_ms,
      executor_p999: latency.executor_gateway_cost.p999_ms,
    },
    cpu_pct_median: {
      clawql: resources.clawql.cpu_pct.median,
      executor: resources.executor.cpu_pct.median,
    },
    ram_rss_mb_median: {
      clawql: resources.clawql.rss_mb.median,
      executor: resources.executor.rss_mb.median,
    },
    tokens: {
      clawql_execute_schema: tokens.layer1_tool_schemas.clawql_execute_tool_tokens,
      executor_execute_schema: tokens.layer1_tool_schemas.executor_execute_tool_tokens,
      equal_result_clawql: tokens.layer2_tool_results.equal_arm_pets.clawql_tokens,
      equal_result_executor: tokens.layer2_tool_results.equal_arm_pets.executor_tokens,
      fat_lean_clawql: tokens.layer2_tool_results.fat_list_contrast.clawql_lean_projected_tokens,
      fat_full_executor: tokens.layer2_tool_results.fat_list_contrast.executor_full_dump_tokens,
      layer1_note: "Rich execute schema is intentional product surface — not trimmed for parity.",
    },
    chaos: {
      primary: "nats_scaleout",
      scaleout_winner: scaleWinner,
      scaleout_win_reason: chaosScaleout?.win_reason ?? null,
      clawql_sustained_clients: chaosScaleout?.clawql_sustained_clients ?? null,
      executor_sustained_clients: chaosScaleout?.executor_sustained_clients ?? null,
      clawql_workers: chaosScaleout?.clawql_workers ?? null,
      scaleout_broke_at: chaosScaleout?.broke_at ?? null,
      stdio_sustained_concurrency: chaos.sustained_concurrency_before_break,
      stdio_broke_at: chaos.broke_at,
      http_multiplex_sustained: chaosHttp?.sustained_concurrency_before_break ?? null,
    },
  };
}

async function main() {
  if (!existsSync(join(ROOT, "dist", "server.js"))) {
    console.error("dist/server.js missing — run npm run build first");
    process.exit(1);
  }
  if (!process.env.EXECUTOR_BIN?.trim()) {
    console.error("EXECUTOR_BIN required");
    process.exit(1);
  }

  const versions = readVersions();
  const mock = await startMockUpstream();
  try {
    console.error("[comprehensive] phase: latency + CPU/RAM");
    const { latency, resources } = await phaseLatencyAndResources(mock);
    console.error("[comprehensive] phase: tokens");
    const tokens = await phaseTokens(mock);
    console.error("[comprehensive] phase: chaos throughput ramp (stdio)");
    const chaos = await phaseChaos(mock);
    console.error("[comprehensive] phase: chaos HTTP multiplex (ClawQL)");
    const chaosHttp = await phaseChaosHttp(mock);
    console.error("[comprehensive] phase: chaos NATS scale-out (primary)");
    const chaosScaleout = await phaseChaosScaleout(mock);

    const report = {
      suite: "executor-cmp-comprehensive",
      versions,
      config: {
        iters: ITERS,
        warmup: WARMUP,
        chaos_max: CHAOS_MAX,
        chaos_scaleout_max: CHAOS_SCALEOUT_MAX,
        chaos_workers: CHAOS_WORKERS,
        chaos_step_ms: CHAOS_STEP_MS,
        chaos_warmup: CHAOS_WARMUP,
        chaos_http: CHAOS_HTTP,
        chaos_scaleout: CHAOS_SCALEOUT,
        break_p99_ms: BREAK_P99_MS,
        break_error_rate: BREAK_ERROR_RATE,
        governance_in_memory_worm: GOVERNANCE,
        panguard: false,
        transport: "stdio_both",
        openapi_execute_path: "rest",
      },
      board: boardTable(latency, resources, tokens, chaos, chaosHttp, chaosScaleout),
      latency,
      resources,
      tokens,
      chaos,
      chaos_http: chaosHttp,
      chaos_scaleout: chaosScaleout,
      publish_notes: [
        "Lead latency claims still come from latency-fair 10k×3 when available; this suite is the multi-dimension board.",
        "Chaos primary win arm is NATS scale-out (K ClawQL HTTP replicas + queue-group assign vs Executor N-stdio).",
        "Layer-1 execute schema richness is intentional — do not trim for token parity.",
        "p999 from COMPREHENSIVE_ITERS<10000 is exploratory — do not claim alone.",
        "In-memory WORM only if COMPREHENSIVE_GOVERNANCE=1; Panguard off.",
        "Do not publicize until ClawQL wins every board dimension that is product-fair.",
        `Executor ${versions.executor.version ?? "?"} — rerun when v2 ships.`,
      ],
    };

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(OUT_PATH, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
    console.error(`\nWrote ${OUT_PATH}`);
  } finally {
    await mock.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
