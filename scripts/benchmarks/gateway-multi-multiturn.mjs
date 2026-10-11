#!/usr/bin/env node
/**
 * Multi-gateway 10+ turn board: tokens + latency + RSS + task success.
 *
 * Equal-arm fat catalog (N tools, verbose schemas, fat default results):
 *   - Aggregators (MCPJungle / agentgateway): full tools/list once (classic) +
 *     raw fat tool results each turn
 *   - ClawQL / clawql_bun: Layer1 = search+execute schemas only; Layer2 =
 *     search hit + execute with fields projection (same dist; runtime differs)
 *   - Executor: Layer1 = execute schema; Layer2 = fat JSON via code
 *     (matches measured live path — full payload pass-through; no gateway
 *     fields. See pragmaticvectors.com/posts/both-sides-of-context-compression)
 *
 * Cumulative tokens (primary = classic):
 *   turn_n = Layer1_once + sum(Layer2_i for i=1..n)
 *
 * MT_ITERS (default 1): repeat the full N-turn flow that many times on one
 * warm connection. Tokens are measured on flow 1 (+ spot-check); latency /
 * RSS / task_success aggregate across all flows×turns.
 *
 * Secondary model (tools_list_every_turn): measured once (flow 1) for
 * aggregators — most clients cache ListTools; demoted from publish headline.
 * Not re-paid on every hot-path turn when MT_ITERS>1.
 *
 * Task success: deterministic inventory check each turn (expected available
 * rows for the partition). Optional MT_LLM_JUDGE=1 when a model key exists.
 *
 * Usage:
 *   EXECUTOR_BIN=… EXECUTOR_CWD=… \
 *     MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle \
 *     AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway \
 *     MT_TURNS=12 MT_ITERS=10000 CATALOG_TOOL_COUNT=40 \
 *     MT_ARMS=clawql,clawql_bun,executor,mcpjungle,agentgateway \
 *     node scripts/benchmarks/gateway-multi-multiturn.mjs
 *
 * Env:
 *   MT_TURNS (default 12)  MT_ITERS (default 1)  CATALOG_TOOL_COUNT (default 40)
 *   MT_ARMS=clawql,clawql_bun,executor,mcpjungle,agentgateway
 *   MT_LIMIT (rows per turn, default 25)
 *   MT_OUT (default gateway-multi-multiturn.json)
 *   MT_PROGRESS_EVERY (default 100)  BUN_BIN  MT_INCLUDE_CF=1
 *
 * Note: do NOT put a hand-written slim-return program on the publish board as
 * "Executor". That is not gateway projection and contradicts the settled blog.
 */

import { existsSync, readFileSync, readdirSync, openSync, closeSync } from "node:fs";
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
const CATALOG_MCP = join(LIB, "equal-arm-catalog-mcp.mjs");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "gateway-multi-comparison");
const OUT_NAME = (process.env.MT_OUT ?? "gateway-multi-multiturn.json").replace(/[^a-zA-Z0-9._-]/g, "");
const OUT_PATH = join(OUT_DIR, OUT_NAME || "gateway-multi-multiturn.json");

const TOOL_COUNT = Math.max(4, Math.min(200, Number(process.env.CATALOG_TOOL_COUNT ?? 40) || 40));
const TURNS = Math.max(10, Math.min(40, Number(process.env.MT_TURNS ?? 12) || 12));
const ITERS = Math.max(1, Number(process.env.MT_ITERS ?? 1) || 1);
const LIMIT = Math.min(100, Math.max(1, Number(process.env.MT_LIMIT ?? 25) || 25));
const PROGRESS_EVERY = Math.max(1, Number(process.env.MT_PROGRESS_EVERY ?? 100) || 100);
const INCLUDE_CF =
  process.env.MT_INCLUDE_CF === "1" || process.env.MT_INCLUDE_CF === "true";
const ARMS = (
  process.env.MT_ARMS ??
  (INCLUDE_CF
    ? "clawql,clawql_bun,executor,mcpjungle,agentgateway,contextforge"
    : "clawql,clawql_bun,executor,mcpjungle,agentgateway")
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Project list rows after JMESPath extract — ClawQL product path for envelopes. */
const WHERE = "items";
const FIELDS = ["id", "name", "status"];
const enc = getEncoding("cl100k_base");

function countTokens(text) {
  if (text == null || text === "") return 0;
  return enc.encode(String(text)).length;
}

function toolText(res) {
  const c = res?.content;
  if (!Array.isArray(c)) return "";
  return c
    .filter((x) => x?.type === "text")
    .map((x) => x.text)
    .join("\n");
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

function resolveBin(envKey, candidates) {
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
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

async function pickFreePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return port;
}

async function waitHttpOk(url, { timeoutMs = 60_000 } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 401 || res.status === 405 || res.status === 406) return;
      last = `${res.status}`;
    } catch (e) {
      last = String(e?.message ?? e);
    }
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${url}: ${last}`);
}

function transportPid(transport) {
  if (typeof transport?.pid === "number") return transport.pid;
  if (typeof transport?._process?.pid === "number") return transport._process.pid;
  return null;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarizeMs(samples) {
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

function readProcRssMb(pid) {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const m = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    return m ? Number(m[1]) / 1024 : null;
  } catch {
    return null;
  }
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

class ResourceSampler {
  constructor(label, pid) {
    this.label = label;
    this.pid = pid;
    this.samples = [];
    this._timer = null;
  }
  start(intervalMs = 200) {
    if (!this.pid) return;
    this._timer = setInterval(() => {
      const rss = readTreeRssMb(this.pid);
      if (rss == null) return;
      this.samples.push(rss);
    }, intervalMs);
    if (typeof this._timer.unref === "function") this._timer.unref();
  }
  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (!this.samples.length) {
      return { label: this.label, pid: this.pid, n: 0, rss_mb: { min: null, median: null, max: null } };
    }
    const rss = [...this.samples].sort((a, b) => a - b);
    return {
      label: this.label,
      pid: this.pid,
      n: rss.length,
      rss_mb: { min: rss[0], median: percentile(rss, 50), max: rss[rss.length - 1] },
    };
  }
}

function resolveBunBin() {
  return resolveBin("BUN_BIN", [
    join(process.env.HOME || "", ".bun/bin/bun"),
    "/usr/local/bin/bun",
    "/home/ubuntu/.bun/bin/bun",
  ]);
}

function resolveClawqlJsRuntime(runtime = "node") {
  const server = join(ROOT, "dist", "server.js");
  if (runtime === "bun") {
    const bun = resolveBunBin();
    if (!bun) throw new Error("clawql_bun requires bun (set BUN_BIN or install ~/.bun/bin/bun)");
    const ver = spawnSync(bun, ["--version"], { encoding: "utf8" }).stdout?.trim() || null;
    return { runtime: "bun", runtimeVersion: ver, command: bun, args: [server] };
  }
  return {
    runtime: "node",
    runtimeVersion: process.version,
    command: process.execPath,
    args: [server],
  };
}

function toolName(i) {
  return `catalog_list_${String(i).padStart(3, "0")}`;
}

function fatRow(i) {
  return {
    id: i,
    name: `Entity-${i}`,
    status: i % 3 === 0 ? "sold" : "available",
    tag: `tag-${i % 10}`,
    meta: {
      kennel: `K${i % 5}`,
      notes: "x".repeat(80),
      history: Array.from({ length: 5 }, (_, j) => ({ at: j, event: `e-${j}` })),
    },
  };
}

function fatPayload(partitionIndex, limit = LIMIT) {
  const rows = [];
  for (let i = 1; rows.length < limit; i++) {
    const row = fatRow(i + (partitionIndex - 1) * 1000);
    if (row.status !== "available") continue;
    rows.push(row);
  }
  return { items: rows, partition: toolName(partitionIndex) };
}

/** Expected ClawQL shape after where=items + fields projection (array of slim rows). */
function slimPayload(partitionIndex, limit = LIMIT) {
  return fatPayload(partitionIndex, limit).items.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
  }));
}

/** Parse tool text into JSON (raw or MCP-wrapped). */
function parseResultJson(text) {
  if (text == null || text === "") return null;
  const raw = String(text).trim();
  try {
    return JSON.parse(raw);
  } catch {
    /* try first JSON value in blob */
  }
  const start = raw.search(/[\[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    return null;
  }
}

/**
 * Deterministic task success: agent asked for available inventory rows with
 * id/name/status for the partition. Projection must not drop those facts.
 */
function scoreTaskSuccess(text, partitionIndex, limit = LIMIT) {
  const expected = slimPayload(partitionIndex, limit);
  const parsed = parseResultJson(text);
  const failures = [];
  if (parsed == null) {
    return { ok: false, matched: 0, expected: expected.length, failures: ["unparseable_json"] };
  }
  let rows = null;
  if (Array.isArray(parsed)) rows = parsed;
  else if (Array.isArray(parsed?.items)) rows = parsed.items;
  else if (Array.isArray(parsed?.result)) rows = parsed.result;
  else if (Array.isArray(parsed?.data)) rows = parsed.data;
  else if (parsed && typeof parsed === "object" && Array.isArray(parsed.pets)) rows = parsed.pets;
  if (!rows) {
    return { ok: false, matched: 0, expected: expected.length, failures: ["no_row_array"] };
  }
  const byId = new Map();
  for (const r of rows) {
    if (r && (r.id != null || r.ID != null)) byId.set(Number(r.id ?? r.ID), r);
  }
  let matched = 0;
  for (const exp of expected) {
    const got = byId.get(exp.id);
    if (!got) {
      failures.push(`missing_id_${exp.id}`);
      continue;
    }
    const nameOk = String(got.name ?? "") === exp.name;
    const statusOk = String(got.status ?? "") === exp.status;
    if (!nameOk || !statusOk) {
      failures.push(`mismatch_id_${exp.id}`);
      continue;
    }
    matched++;
  }
  return {
    ok: matched === expected.length && failures.length === 0,
    matched,
    expected: expected.length,
    failures: failures.slice(0, 8),
  };
}

function buildTurns() {
  const turns = [];
  for (let t = 1; t <= TURNS; t++) {
    const partition = ((t - 1) % TOOL_COUNT) + 1;
    turns.push({
      n: t,
      partition,
      tool: toolName(partition),
      operationId: toolName(partition),
      query: `${toolName(partition)} partition ${partition} inventory list entities`,
      args: { limit: LIMIT, status: "available", includeMeta: true },
      where: WHERE,
      fields: FIELDS,
    });
  }
  return turns;
}

async function connectHttpMcp(url, name = "mt-http") {
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

function clawqlEnv(home, specPath, apiBase) {
  return clawqlEqualArmEnv({ home, specPath, apiBase });
}

async function startCatalogHttp() {
  const paths = {};
  for (let i = 1; i <= TOOL_COUNT; i++) {
    const name = toolName(i);
    paths[`/catalog/${String(i).padStart(3, "0")}`] = {
      get: {
        operationId: name,
        summary: `List entities from catalog partition ${i}`,
        description:
          `List entities from catalog partition ${i}. Returns a verbose JSON array with nested meta/history. ` +
          `Partition theme: ${["pets", "orders", "users", "tickets", "assets"][i % 5]}.`,
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
          },
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["available", "sold", "any"], default: "any" },
          },
          {
            name: "includeMeta",
            in: "query",
            schema: { type: "boolean", default: true },
          },
        ],
        responses: {
          "200": {
            description: "ok",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    };
  }

  const server = createServer((req, res) => {
    const u = new URL(req.url || "/", "http://127.0.0.1");
    const m = u.pathname.match(/^\/catalog\/(\d{3})$/);
    if (!m) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const partition = Number(m[1]);
    const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") ?? LIMIT) || LIMIT));
    const status = u.searchParams.get("status") ?? "any";
    const includeMeta = u.searchParams.get("includeMeta") !== "false";
    const rows = [];
    for (let i = 1; rows.length < limit; i++) {
      const row = fatRow(i + (partition - 1) * 1000);
      if (status !== "any" && row.status !== status) continue;
      if (!includeMeta) {
        rows.push({ id: row.id, name: row.name, status: row.status });
      } else {
        rows.push(row);
      }
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ items: rows, partition: toolName(partition) }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const specPath = join("/tmp", `mt-catalog-spec-${process.pid}.json`);
  await writeFile(
    specPath,
    JSON.stringify(
      {
        openapi: "3.0.3",
        info: { title: "EqualArmCatalog", version: "1" },
        servers: [{ url: baseUrl }],
        paths,
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

async function connectClawql(mock, { runtime = "node", id = "clawql" } = {}) {
  const js = resolveClawqlJsRuntime(runtime);
  const home = join("/tmp", `clawql-mt-${id}-${process.pid}`);
  await mkdir(home, { recursive: true });
  const env = clawqlEnv(home, mock.specPath, mock.baseUrl);
  const t0 = performance.now();
  const transport = new StdioClientTransport({
    command: js.command,
    args: js.args,
    cwd: ROOT,
    stderr: "pipe",
    env,
  });
  const client = new Client({ name: `mt-${id}`, version: "1" }, {});
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`clawql Ready timeout (${js.runtime})`)),
      90_000
    );
    transport.stderr?.on("data", (chunk) => {
      if (chunk.toString().includes("[clawql-mcp] Ready")) {
        clearTimeout(timer);
        resolve(undefined);
      }
    });
  });
  await client.connect(transport);
  await ready;
  const pid = transportPid(transport);
  return {
    client,
    pid,
    runtime: js.runtime,
    runtimeVersion: js.runtimeVersion,
    ready_ms: Number((performance.now() - t0).toFixed(1)),
    rss_mb_ready: pid != null ? readTreeRssMb(pid) : null,
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
  const client = new Client({ name: "mt-executor", version: "1" }, {});
  await client.connect(transport);
  return {
    client,
    pid: transportPid(transport),
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

async function startMcpjungleCatalog() {
  const bin = resolveBin("MCPJUNGLE_BIN", [
    "/tmp/gw-bins/mcpjungle",
    join(ROOT, "tmp/gw-bins/mcpjungle"),
  ]);
  if (!bin) throw new Error("mcpjungle binary not found (set MCPJUNGLE_BIN)");
  const work = join("/tmp", `mcpjungle-mt-${process.pid}`);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const port = await pickFreePort();
  const dbPath = join(work, "mcpjungle.db");
  const confPath = join(work, "catalog-stdio.json");
  await writeFile(
    confPath,
    JSON.stringify(
      {
        name: "catalog",
        transport: "stdio",
        description: "equal-arm fat catalog MCP",
        command: process.execPath,
        args: [CATALOG_MCP],
        session_mode: "stateful",
        env: { CATALOG_TOOL_COUNT: String(TOOL_COUNT) },
      },
      null,
      2
    )
  );
  const logPath = join(work, "server.log");
  const logFd = openSync(logPath, "w");
  const child = spawn(
    bin,
    ["start", "--host", "127.0.0.1", "--port", String(port), "--sqlite-db-path", dbPath],
    { cwd: work, stdio: ["ignore", logFd, logFd], env: { ...process.env } }
  );
  const registry = `http://127.0.0.1:${port}`;
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
  const probe = await connectHttpMcp(mcpUrl, "mj-mt-probe");
  const nameMap = new Map();
  try {
    const tools = await probe.client.listTools();
    for (const t of tools.tools) {
      for (let i = 1; i <= TOOL_COUNT; i++) {
        const base = toolName(i);
        if (t.name === base || t.name.endsWith(base) || t.name.includes(base)) {
          nameMap.set(base, t.name);
        }
      }
    }
  } finally {
    await probe.close();
  }
  return {
    id: "mcpjungle",
    mcpUrl,
    pid: child.pid,
    resolveTool: (base) => nameMap.get(base) || `catalog__${base}`,
    connect: () => connectHttpMcp(mcpUrl, "mcpjungle-mt"),
    close: async () => {
      killTree(child.pid);
      try {
        closeSync(logFd);
      } catch {
        /* ignore */
      }
    },
  };
}

async function startAgentgatewayCatalog() {
  const bin = resolveBin("AGENTGATEWAY_BIN", [
    "/tmp/gw-bins/agentgateway",
    join(ROOT, "tmp/gw-bins/agentgateway"),
  ]);
  if (!bin) throw new Error("agentgateway binary not found (set AGENTGATEWAY_BIN)");
  const work = join("/tmp", `agentgateway-mt-${process.pid}`);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const port = await pickFreePort();
  const cfgPath = join(work, "config.yaml");
  const bashCmd = `CATALOG_TOOL_COUNT=${TOOL_COUNT} exec ${JSON.stringify(process.execPath)} ${JSON.stringify(CATALOG_MCP)}`;
  await writeFile(
    cfgPath,
    `# yaml-language-server: $schema=https://agentgateway.dev/schema/config
mcp:
  port: ${port}
  targets:
  - name: catalog
    stdio:
      cmd: "/bin/bash"
      args: ["-c", ${JSON.stringify(bashCmd)}]
`
  );
  const logPath = join(work, "server.log");
  const logFd = openSync(logPath, "w");
  const child = spawn(bin, ["-f", cfgPath], {
    cwd: work,
    stdio: ["ignore", logFd, logFd],
  });
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  await waitHttpOk(mcpUrl, { timeoutMs: 60_000 });
  let probe;
  const t0 = Date.now();
  for (;;) {
    try {
      probe = await connectHttpMcp(mcpUrl, "agw-mt-probe");
      break;
    } catch (e) {
      if (Date.now() - t0 > 60_000) throw e;
      await sleep(300);
    }
  }
  const nameMap = new Map();
  try {
    const tools = await probe.client.listTools();
    for (const t of tools.tools) {
      for (let i = 1; i <= TOOL_COUNT; i++) {
        const base = toolName(i);
        if (t.name === base || t.name.includes(base)) {
          nameMap.set(base, t.name);
        }
      }
    }
  } finally {
    await probe.close();
  }
  return {
    id: "agentgateway",
    mcpUrl,
    pid: child.pid,
    resolveTool: (base) => nameMap.get(base) || base,
    connect: () => connectHttpMcp(mcpUrl, "agentgateway-mt"),
    close: async () => {
      killTree(child.pid);
      try {
        closeSync(logFd);
      } catch {
        /* ignore */
      }
    },
  };
}

function measureLayer1FromTools(tools, { onlyNames } = {}) {
  const selected = onlyNames
    ? tools.filter((t) => onlyNames.includes(t.name))
    : tools;
  const schemaTokens = selected.reduce((n, t) => n + countTokens(JSON.stringify(t)), 0);
  return {
    tools_count: selected.length,
    tools_list_count_full: tools.length,
    schema_tokens: schemaTokens,
    tools_list_schema_tokens_full: tools.reduce((n, t) => n + countTokens(JSON.stringify(t)), 0),
  };
}

function buildCumulative(layer1Once, layer2PerTurn) {
  let sumL2 = 0;
  return layer2PerTurn.map((tok, i) => {
    sumL2 += tok;
    const combined = layer1Once + sumL2;
    return {
      n: i + 1,
      layer1Once,
      layer2ThisTurn: tok,
      layer2Cumulative: sumL2,
      combined,
      layer2ShareOfCombined: +(100 * (sumL2 / Math.max(1, combined))).toFixed(1),
    };
  });
}

async function runAggregatorArm(gw, turns) {
  const conn = await gw.connect();
  const pid = conn.pid ?? gw.pid ?? null;
  const sampler = new ResourceSampler(gw.id, pid);
  sampler.start(ITERS > 1 ? 500 : 200);
  try {
    const listed = await conn.client.listTools();
    const l1 = measureLayer1FromTools(listed.tools);
    let perTurn = null;
    let relistTok = null;
    const flowE2e = [];
    const turnLat = [];
    let successOk = 0;
    let successTotal = 0;
    let callErrors = 0;

    for (let iter = 1; iter <= ITERS; iter++) {
      const flowT0 = performance.now();
      const thisPerTurn = [];
      for (const turn of turns) {
        const name = gw.resolveTool(turn.tool);
        const t0 = performance.now();
        let text = "";
        let ok = true;
        try {
          const res = await conn.client.callTool({ name, arguments: turn.args });
          if (res.isError) throw new Error(toolText(res).slice(0, 300));
          text = toolText(res);
        } catch (e) {
          ok = false;
          callErrors++;
          text = "";
          if (iter === 1) throw new Error(`${gw.id} ${name}: ${String(e?.message || e)}`);
        }
        const ms = performance.now() - t0;
        turnLat.push(ms);
        const success = ok ? scoreTaskSuccess(text, turn.partition, turn.args.limit) : { ok: false };
        successTotal++;
        if (success.ok) successOk++;
        if (iter === 1) {
          // Secondary: tools/list once on flow 1 only (not every hot-path turn when ITERS>1)
          if (relistTok == null) {
            const relist = await conn.client.listTools();
            relistTok = relist.tools.reduce((n, t) => n + countTokens(JSON.stringify(t)), 0);
          }
          const resultTok = countTokens(text);
          thisPerTurn.push({
            n: turn.n,
            tool: name,
            result_tokens: resultTok,
            result_chars: text.length,
            tools_list_tokens: relistTok,
            layer2_classic: resultTok,
            layer2_relist_every_turn: relistTok + resultTok,
            latency_ms: Number(ms.toFixed(3)),
            ok,
            task_success: success,
          });
        }
      }
      flowE2e.push(performance.now() - flowT0);
      if (iter === 1) perTurn = thisPerTurn;
      if (iter % PROGRESS_EVERY === 0 || iter === ITERS) {
        console.log(`[mt] ${gw.id} flows ${iter}/${ITERS}`);
      }
    }

    const resources = sampler.stop();
    return {
      id: gw.id,
      model: "aggregator_tools_list_plus_fat_call",
      runtime: null,
      runtimeVersion: null,
      layer1: {
        once_schema_tokens: l1.schema_tokens,
        tools_count: l1.tools_count,
        note: "Full tools/list dump (fat catalog surface); classic counts Layer1 once",
      },
      perTurn,
      iters: ITERS,
      flow_e2e_ms: flowE2e,
      turn_latency_ms: turnLat,
      call_errors: callErrors,
      task_success_agg: { ok: successOk, total: successTotal },
      resources,
      startup: { ready_ms: null, rss_mb_ready: resources.rss_mb?.min ?? null },
      skipped: false,
    };
  } finally {
    sampler.stop();
    await conn.close();
  }
}

async function runClawqlArm(mock, turns, { runtime = "node", id = "clawql" } = {}) {
  const conn = await connectClawql(mock, { runtime, id });
  const sampler = new ResourceSampler(id, conn.pid);
  sampler.start(ITERS > 1 ? 500 : 200);
  try {
    const listed = await conn.client.listTools();
    const l1 = measureLayer1FromTools(listed.tools, { onlyNames: ["search", "execute"] });
    let perTurn = null;
    const flowE2e = [];
    const turnLat = [];
    let successOk = 0;
    let successTotal = 0;
    let callErrors = 0;

    for (let iter = 1; iter <= ITERS; iter++) {
      const flowT0 = performance.now();
      const thisPerTurn = [];
      for (const turn of turns) {
        const t0 = performance.now();
        let searchText = "";
        let execText = "";
        let ok = true;
        try {
          const searchRes = await conn.client.callTool({
            name: "search",
            arguments: { query: turn.query, limit: 3 },
          });
          if (searchRes.isError) throw new Error(`search: ${toolText(searchRes).slice(0, 300)}`);
          searchText = toolText(searchRes);
          const execRes = await conn.client.callTool({
            name: "execute",
            arguments: {
              operationId: turn.operationId,
              args: {
                limit: turn.args.limit,
                status: turn.args.status,
                includeMeta: turn.args.includeMeta,
              },
              where: turn.where,
              fields: turn.fields,
            },
          });
          if (execRes.isError) throw new Error(`execute: ${toolText(execRes).slice(0, 400)}`);
          execText = toolText(execRes);
        } catch (e) {
          ok = false;
          callErrors++;
          if (iter === 1) throw new Error(`${id}: ${String(e?.message || e)}`);
        }
        const ms = performance.now() - t0;
        turnLat.push(ms);
        const success = ok ? scoreTaskSuccess(execText, turn.partition, turn.args.limit) : { ok: false };
        successTotal++;
        if (success.ok) successOk++;
        if (iter === 1) {
          const searchTok = countTokens(searchText);
          const resultTok = countTokens(execText);
          thisPerTurn.push({
            n: turn.n,
            tool: turn.operationId,
            search_tokens: searchTok,
            result_tokens: resultTok,
            result_chars: execText.length,
            where: turn.where,
            fields: turn.fields,
            layer2_classic: searchTok + resultTok,
            layer2_relist_every_turn: searchTok + resultTok,
            latency_ms: Number(ms.toFixed(3)),
            ok,
            task_success: success,
          });
        }
      }
      flowE2e.push(performance.now() - flowT0);
      if (iter === 1) perTurn = thisPerTurn;
      if (iter % PROGRESS_EVERY === 0 || iter === ITERS) {
        console.log(`[mt] ${id} flows ${iter}/${ITERS}`);
      }
    }

    const resources = sampler.stop();
    return {
      id,
      model: `search_plus_execute_where_fields_${conn.runtime}`,
      runtime: conn.runtime,
      runtimeVersion: conn.runtimeVersion,
      layer1: {
        once_schema_tokens: l1.schema_tokens,
        tools_count: l1.tools_count,
        tools_list_count_full: l1.tools_list_count_full,
        tools_list_schema_tokens_full: l1.tools_list_schema_tokens_full,
        note: "Only search+execute schemas counted as Layer1 (catalog stays server-side)",
      },
      perTurn,
      iters: ITERS,
      flow_e2e_ms: flowE2e,
      turn_latency_ms: turnLat,
      call_errors: callErrors,
      task_success_agg: { ok: successOk, total: successTotal },
      resources,
      startup: { ready_ms: conn.ready_ms, rss_mb_ready: conn.rss_mb_ready },
      skipped: false,
    };
  } finally {
    sampler.stop();
    await conn.close();
  }
}

async function runExecutorArm(turns, { filter = false } = {}) {
  const conn = await connectExecutor();
  const armId = filter ? "executor_filter" : "executor";
  const sampler = new ResourceSampler(armId, conn.pid);
  sampler.start(ITERS > 1 ? 500 : 200);
  try {
    const listed = await conn.client.listTools();
    const executeTool = listed.tools.find((t) => t.name === "execute");
    const l1Tokens = executeTool ? countTokens(JSON.stringify(executeTool)) : 0;
    // Prebuild code strings once — equal-arm payload is deterministic per turn.
    const codes = turns.map((turn) => {
      const payload = filter
        ? slimPayload(turn.partition, turn.args.limit)
        : fatPayload(turn.partition, turn.args.limit);
      return filter
        ? `const fat = ${JSON.stringify(fatPayload(turn.partition, turn.args.limit))}; return fat.items.map((r) => ({ id: r.id, name: r.name, status: r.status }));`
        : `return ${JSON.stringify(payload)};`;
    });
    let perTurn = null;
    const flowE2e = [];
    const turnLat = [];
    let successOk = 0;
    let successTotal = 0;
    let callErrors = 0;

    for (let iter = 1; iter <= ITERS; iter++) {
      const flowT0 = performance.now();
      const thisPerTurn = [];
      for (let ti = 0; ti < turns.length; ti++) {
        const turn = turns[ti];
        const t0 = performance.now();
        let text = "";
        let ok = true;
        try {
          const res = await conn.client.callTool({
            name: "execute",
            arguments: { code: codes[ti], timeoutMs: 30_000 },
          });
          if (res.isError) throw new Error(toolText(res).slice(0, 300));
          text = toolText(res);
        } catch (e) {
          ok = false;
          callErrors++;
          if (iter === 1) throw new Error(`${armId}: ${String(e?.message || e)}`);
        }
        const ms = performance.now() - t0;
        turnLat.push(ms);
        const success = ok ? scoreTaskSuccess(text, turn.partition, turn.args.limit) : { ok: false };
        successTotal++;
        if (success.ok) successOk++;
        if (iter === 1) {
          const resultTok = countTokens(text);
          thisPerTurn.push({
            n: turn.n,
            tool: "execute",
            result_tokens: resultTok,
            result_chars: text.length,
            layer2_classic: resultTok,
            layer2_relist_every_turn: resultTok,
            latency_ms: Number(ms.toFixed(3)),
            ok,
            task_success: success,
            note: filter
              ? "Code-mode filter to {id,name,status} — fair peer for ClawQL projection"
              : "Fat equal-arm JSON via code; no fields projection",
          });
        }
      }
      flowE2e.push(performance.now() - flowT0);
      if (iter === 1) perTurn = thisPerTurn;
      if (iter % PROGRESS_EVERY === 0 || iter === ITERS) {
        console.log(`[mt] ${armId} flows ${iter}/${ITERS}`);
      }
    }

    const resources = sampler.stop();
    return {
      id: armId,
      model: filter
        ? "stdio_mcp_code_execute_fields_filter"
        : "stdio_mcp_code_execute_fat_static",
      runtime: null,
      runtimeVersion: null,
      layer1: {
        once_schema_tokens: l1Tokens,
        tools_count: executeTool ? 1 : listed.tools.length,
        tools_list_count_full: listed.tools.length,
        tools_list_schema_tokens_full: listed.tools.reduce(
          (n, t) => n + countTokens(JSON.stringify(t)),
          0
        ),
        note: "execute schema only (catalog not published as N tools)",
      },
      perTurn,
      iters: ITERS,
      flow_e2e_ms: flowE2e,
      turn_latency_ms: turnLat,
      call_errors: callErrors,
      task_success_agg: { ok: successOk, total: successTotal },
      resources,
      startup: { ready_ms: null, rss_mb_ready: resources.rss_mb?.min ?? null },
      skipped: false,
    };
  } finally {
    sampler.stop();
    await conn.close();
  }
}

function summarizeArm(arm) {
  if (!arm || arm.skipped) return arm;
  const classicL2 = arm.perTurn.map((t) => t.layer2_classic);
  const relistL2 = arm.perTurn.map((t) => t.layer2_relist_every_turn);
  const l1 = arm.layer1.once_schema_tokens;
  const classic = buildCumulative(l1, classicL2);
  const relist = buildCumulative(0, relistL2); // Layer1 folded into each turn
  const last = classic[classic.length - 1];
  const lastRelist = relist[relist.length - 1];
  const meanL2 = classicL2.reduce((a, b) => a + b, 0) / classicL2.length;
  const meanResult = arm.perTurn.reduce((a, t) => a + t.result_tokens, 0) / arm.perTurn.length;
  const flowLat = summarizeMs(arm.flow_e2e_ms || []);
  const turnLat = summarizeMs(arm.turn_latency_ms || []);
  const agg = arm.task_success_agg || {
    ok: arm.perTurn.filter((t) => t.task_success?.ok).length,
    total: arm.perTurn.length,
  };
  const taskSuccess = {
    turns_ok: agg.ok,
    turns_total: agg.total,
    flows: arm.iters ?? 1,
    turns_per_flow: arm.perTurn.length,
    ok: agg.ok === agg.total && agg.total > 0,
    rate: Number((agg.ok / Math.max(1, agg.total)).toFixed(4)),
  };
  return {
    ...arm,
    // Drop raw sample arrays from serialized arm body — board keeps summaries.
    flow_e2e_ms: undefined,
    turn_latency_ms: undefined,
    cumulative_classic: classic,
    cumulative_tools_list_every_turn: relist,
    task_success: taskSuccess,
    board: {
      runtime: arm.runtime ?? null,
      runtime_version: arm.runtimeVersion ?? null,
      ready_ms: arm.startup?.ready_ms ?? null,
      rss_mb_ready: arm.startup?.rss_mb_ready ?? null,
      rss_mb_min: arm.resources?.rss_mb?.min ?? null,
      rss_mb_median: arm.resources?.rss_mb?.median ?? null,
      rss_mb_max: arm.resources?.rss_mb?.max ?? null,
      layer1_once_tokens: l1,
      mean_layer2_tokens: Number(meanL2.toFixed(1)),
      mean_result_tokens: Number(meanResult.toFixed(1)),
      combined_at_n: last.combined,
      combined_relist_every_turn_at_n: lastRelist.combined,
      flows: arm.iters ?? 1,
      turns_per_flow: arm.perTurn.length,
      total_turns: agg.total,
      flow_e2e_ms: flowLat,
      turn_latency_ms: turnLat,
      call_errors: arm.call_errors ?? 0,
      task_success_ok: taskSuccess.ok,
      task_success_rate: taskSuccess.rate,
    },
  };
}

function ratioBoard(arms) {
  const claw = arms.clawql?.board || arms.clawql_bun?.board;
  if (!claw) return {};
  const baseline = arms.clawql?.board ? "clawql" : "clawql_bun";
  const out = { baseline };
  for (const [id, arm] of Object.entries(arms)) {
    if (!arm?.board || id === baseline) continue;
    out[id] = {
      vs_clawql_combined_classic: +(arm.board.combined_at_n / claw.combined_at_n).toFixed(2),
      vs_clawql_combined_relist_every_turn: +(
        arm.board.combined_relist_every_turn_at_n / claw.combined_relist_every_turn_at_n
      ).toFixed(2),
      vs_clawql_mean_result: +(arm.board.mean_result_tokens / claw.mean_result_tokens).toFixed(2),
      vs_clawql_layer1: +(arm.board.layer1_once_tokens / Math.max(1, claw.layer1_once_tokens)).toFixed(
        2
      ),
      vs_clawql_flow_e2e_p50:
        claw.flow_e2e_ms?.p50_ms != null && arm.board.flow_e2e_ms?.p50_ms != null
          ? +(arm.board.flow_e2e_ms.p50_ms / claw.flow_e2e_ms.p50_ms).toFixed(2)
          : null,
    };
  }
  return out;
}

function categoryWinNarrative(arms, ratios) {
  const lines = [
    "Category story: most efficient governed gateway — multi-turn I/O tokens with equal task success.",
    "1. Primary model — classic Layer1 once + Σ Layer2 (clients that cache tools/list).",
    "2. Input side — ClawQL Layer1 is search+execute only; aggregators pay the full fat tools/list once.",
    "3. Output side — ClawQL gateway fields/where projection; Executor measured path is full payload pass-through.",
    "4. Re-list-every-turn is secondary sensitivity only (most clients cache; lazy clients shrink aggregators further).",
    "5. Settled: do not label a hand-written slim-return program as Executor (Both Sides of Context Compression).",
  ];
  const clawOk = arms.clawql?.task_success?.ok;
  if (clawOk === false) {
    lines.push("HOLD: ClawQL task_success failed — do not claim token wins.");
  } else if (clawOk) {
    lines.push("ClawQL deterministic task_success: PASS.");
  }
  if (ratios.mcpjungle) {
    lines.push(
      `Measured vs MCPJungle @N=${TURNS}: classic ${ratios.mcpjungle.vs_clawql_combined_classic}× ` +
        `(relist secondary ${ratios.mcpjungle.vs_clawql_combined_relist_every_turn}×).`
    );
  }
  if (ratios.agentgateway) {
    lines.push(
      `Measured vs agentgateway @N=${TURNS}: classic ${ratios.agentgateway.vs_clawql_combined_classic}× ` +
        `(relist secondary ${ratios.agentgateway.vs_clawql_combined_relist_every_turn}×).`
    );
  }
  if (ratios.executor) {
    lines.push(
      `Measured vs Executor @N=${TURNS}: classic ${ratios.executor.vs_clawql_combined_classic}× ` +
        `(fat return — matches live Layer 2 pass-through; Layer1 schema still smaller).`
    );
  }
  lines.push("RSS is a loss among serious arms — admit or fix before memory claims.");
  return lines;
}

async function main() {
  if (!existsSync(CATALOG_MCP)) {
    throw new Error(`missing ${CATALOG_MCP}`);
  }
  if (!existsSync(join(ROOT, "dist", "server.js"))) {
    console.error("dist/server.js missing — clawql arm will skip");
  }
  await mkdir(OUT_DIR, { recursive: true });
  const turns = buildTurns();
  const mock = await startCatalogHttp();
  const gateways = [];
  const rawArms = {};
  const errors = {};

  // Reference sizes (equal-arm honesty check)
  const fatTok = countTokens(JSON.stringify(fatPayload(1)));
  const slimTok = countTokens(JSON.stringify(slimPayload(1)));

  console.log(
    `[mt] turns=${TURNS} iters=${ITERS} catalog_tools=${TOOL_COUNT} limit=${LIMIT} arms=${ARMS.join(",")}`
  );
  console.log(`[mt] equal-arm fat≈${fatTok} tok slim(fields)≈${slimTok} tok (partition 1)`);

  const buildPartialReport = (partial) => {
    const arms = Object.fromEntries(
      Object.entries(rawArms).map(([id, a]) => [id, a.skipped ? a : summarizeArm(a)])
    );
    const ratios = ratioBoard(arms);
    const narrative = categoryWinNarrative(arms, ratios);
    const board = {};
    for (const [id, a] of Object.entries(arms)) {
      if (a.skipped) {
        board[id] = { skipped: true, reason: a.reason };
      } else {
        board[id] = a.board;
      }
    }
    return { arms, ratios, narrative, board, partial };
  };

  try {
    for (const arm of ARMS) {
      console.log(`[mt] run ${arm}`);
      try {
        if (arm === "clawql" || arm === "clawql_bun") {
          if (!existsSync(join(ROOT, "dist", "server.js"))) {
            rawArms[arm] = { skipped: true, reason: "dist/server.js missing" };
            continue;
          }
          if (arm === "clawql_bun" && !resolveBunBin()) {
            rawArms.clawql_bun = {
              skipped: true,
              reason: "bun not found (set BUN_BIN or install ~/.bun/bin/bun)",
            };
            continue;
          }
          rawArms[arm] = await runClawqlArm(mock, turns, {
            runtime: arm === "clawql_bun" ? "bun" : "node",
            id: arm,
          });
        } else if (arm === "executor") {
          if (!process.env.EXECUTOR_BIN?.trim()) {
            rawArms.executor = { skipped: true, reason: "EXECUTOR_BIN unset" };
            continue;
          }
          rawArms.executor = await runExecutorArm(turns, { filter: false });
        } else if (arm === "executor_filter") {
          if (!process.env.EXECUTOR_BIN?.trim()) {
            rawArms.executor_filter = { skipped: true, reason: "EXECUTOR_BIN unset" };
            continue;
          }
          rawArms.executor_filter = await runExecutorArm(turns, { filter: true });
        } else if (arm === "mcpjungle") {
          const gw = await startMcpjungleCatalog();
          gateways.push(gw);
          rawArms.mcpjungle = await runAggregatorArm(gw, turns);
        } else if (arm === "agentgateway") {
          const gw = await startAgentgatewayCatalog();
          gateways.push(gw);
          rawArms.agentgateway = await runAggregatorArm(gw, turns);
        } else if (arm === "contextforge") {
          rawArms.contextforge = {
            skipped: true,
            reason:
              "ContextForge nested MCPJungle adapter skipped on multiturn by default (set MT_INCLUDE_CF after dedicated wiring)",
          };
        } else if (arm === "metamcp") {
          rawArms.metamcp = { skipped: true, reason: "Docker unavailable / MetaMCP Compose-first" };
        } else {
          errors[arm] = `unknown arm ${arm}`;
        }
      } catch (e) {
        console.error(`[mt] ${arm} failed:`, e);
        rawArms[arm] = { skipped: true, reason: String(e?.stack || e), error: true };
        errors[arm] = String(e?.message || e);
      }
      // Checkpoint after each arm (survives OOM mid-board).
      const ck = buildPartialReport(true);
      await writeFile(
        OUT_PATH,
        JSON.stringify(
          {
            suite: "gateway-multi-multiturn",
            measuredAt: new Date().toISOString(),
            partial: true,
            checkpoint_after: arm,
            node: process.version,
            config: { turns: TURNS, iters: ITERS, arms: ARMS },
            board: ck.board,
            arms: ck.arms,
            errors,
          },
          null,
          2
        )
      );
      console.log(`[mt] checkpoint after ${arm} → ${OUT_PATH}`);
    }

    const { arms, ratios, narrative, board } = buildPartialReport(false);

    const report = {
      suite: "gateway-multi-multiturn",
      measuredAt: new Date().toISOString(),
      node: process.version,
      bun: resolveBunBin()
        ? spawnSync(resolveBunBin(), ["--version"], { encoding: "utf8" }).stdout?.trim() || null
        : null,
      config: {
        turns: TURNS,
        iters: ITERS,
        catalog_tool_count: TOOL_COUNT,
        limit: LIMIT,
        where: WHERE,
        fields: FIELDS,
        arms: ARMS,
        tokenizer: "cl100k_base",
        progress_every: PROGRESS_EVERY,
      },
      equal_arm: {
        fat_result_tokens_partition_1: fatTok,
        slim_fields_tokens_partition_1: slimTok,
        projection_ratio: +(fatTok / Math.max(1, slimTok)).toFixed(2),
        note: "Same underlying rows; ClawQL where+fields project to {id,name,status}; Executor/aggregators return full envelope (Executor: no gateway projection — settled)",
      },
      board,
      ratios_vs_clawql: ratios,
      task_success: Object.fromEntries(
        Object.entries(arms)
          .filter(([, a]) => a?.task_success)
          .map(([id, a]) => [id, a.task_success])
      ),
      cumulative_table: Object.fromEntries(
        Object.entries(arms)
          .filter(([, a]) => a?.cumulative_classic)
          .map(([id, a]) => [
            id,
            a.cumulative_classic.map((r) => ({
              n: r.n,
              combined: r.combined,
              layer2Cumulative: r.layer2Cumulative,
            })),
          ])
      ),
      arms,
      errors,
      category_win: narrative,
      primary_metric: "classic_layer1_once_plus_sum_layer2_with_task_success",
      secondary_metric: "tools_list_every_turn_sensitivity",
      honesty: [
        "Fat catalog equal-arm: N MCP tools mirrored as N OpenAPI operationIds.",
        "PRIMARY tokens: classic Layer1_once + sum(Layer2) with deterministic task_success (tokens from flow 1; spot-stable).",
        `MT_ITERS=${ITERS}: each arm completes that many full ${TURNS}-turn flows on one warm connection.`,
        "Also reports flow e2e + per-turn latency percentiles and RSS (do not drop these for publish).",
        "SECONDARY: tools_list_every_turn — measured once on flow 1; most clients cache ListTools.",
        "Executor Layer2 is fat JSON — matches measured live path (executor-cmp-001 / Both Sides post). No gateway fields.",
        "Do not publish a hand-written slim-return program as Executor.",
        "clawql_bun: same dist/server.js as clawql; only JS runtime changes.",
        "ContextForge/MetaMCP off publish board by default.",
        "Pets interleaved p999 board remains gateway-multi-cmp-10k.json / ts7-*-10k.json.",
        "RSS is a loss among serious arms — admit plainly.",
      ],
    };

    await writeFile(OUT_PATH, JSON.stringify(report, null, 2));
    console.log(`\n[mt] wrote ${OUT_PATH}`);
    console.log(
      `\n=== Multi-turn board (iters=${ITERS} × turns=${TURNS}) — tokens + latency + RSS + task_success ===\n`
    );
    console.log(
      "arm | L1 | mean L2 | combined@N | result tok | flow e2e p50/p999 | turn p50/p999 | RSS med | task_success"
    );
    for (const [id, b] of Object.entries(board)) {
      if (b.skipped) {
        console.log(`${id} | SKIP ${b.reason?.slice(0, 60)}`);
        continue;
      }
      const fe = b.flow_e2e_ms || {};
      const tl = b.turn_latency_ms || {};
      console.log(
        `${id} | ${b.layer1_once_tokens} | ${b.mean_layer2_tokens} | ${b.combined_at_n} | ${b.mean_result_tokens} | ${fe.p50_ms}/${fe.p999_ms} | ${tl.p50_ms}/${tl.p999_ms} | ${b.rss_mb_median} | ${b.task_success_ok ? "PASS" : "FAIL"} (${b.task_success_rate})`
      );
    }
    console.log("\nRatios vs ClawQL (classic primary / relist secondary):");
    console.log(JSON.stringify(ratios, null, 2));
    for (const line of narrative) console.log(`• ${line}`);
  } finally {
    for (const gw of gateways) await gw.close?.().catch(() => {});
    await mock.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
