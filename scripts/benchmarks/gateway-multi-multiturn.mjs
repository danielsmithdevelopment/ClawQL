#!/usr/bin/env node
/**
 * Multi-gateway 10+ turn token board (input + output + task success).
 *
 * Equal-arm fat catalog (N tools, verbose schemas, fat default results):
 *   - Aggregators (MCPJungle / agentgateway): full tools/list once (classic) +
 *     raw fat tool results each turn
 *   - ClawQL: Layer1 = search+execute schemas only; Layer2 = search hit +
 *     execute with fields projection against mirrored OpenAPI
 *   - Executor: Layer1 = execute schema; Layer2 = fat JSON via code
 *     (matches measured live path — full payload pass-through; no gateway
 *     fields. See pragmaticvectors.com/posts/both-sides-of-context-compression)
 *
 * Cumulative (primary = classic):
 *   turn_n = Layer1_once + sum(Layer2_i for i=1..n)
 *
 * Secondary model (tools_list_every_turn): aggregators re-pay tools/list each
 * turn — most clients cache ListTools; demoted from publish headline.
 *
 * Task success: deterministic inventory check each turn (expected available
 * rows for the partition). Optional MT_LLM_JUDGE=1 when a model key exists.
 *
 * Usage:
 *   EXECUTOR_BIN=… EXECUTOR_CWD=… EXECUTOR_DATA_DIR=… \
 *     MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle \
 *     AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway \
 *     BIFROST_BIN=~/.cache/bifrost/v2.3.0/bin/bifrost-http-0 \
 *     MT_TURNS=12 CATALOG_TOOL_COUNT=40 \
 *     MT_ARMS=clawql,executor,mcpjungle,agentgateway,bifrost,bifrost_codemode \
 *     node scripts/benchmarks/gateway-multi-multiturn.mjs
 *
 * Env:
 *   MT_TURNS (default 12)  CATALOG_TOOL_COUNT (default 40)
 *   MT_ARMS=clawql,executor,mcpjungle,agentgateway[,bifrost,bifrost_codemode,obot]
 *   MT_LIMIT (rows per turn, default 25)
 *   MT_OUT (default gateway-multi-multiturn.json)
 *   MT_INCLUDE_CF=1 only for nested CF experiments (off publish board)
 *   MT_CLAWQL_DISCOVERY=every_turn|once — every_turn (default) matches aggregator board;
 *     once = Code Mode peer (one fat catalog search, then execute+fields each turn)
 *   EXECUTOR_BIN / EXECUTOR_CWD — Executor 1.x stdio (`executor mcp`)
 *   EXECUTOR_MCP_URL — Executor 2.x Streamable HTTP (e.g. http://127.0.0.1:4312/mcp);
 *     optional EXECUTOR_API_KEY / Authorization Bearer for the HTTP arm
 *   EXECUTOR_DATA_DIR — forwarded to stdio child (required for Executor 1.x data home)
 *   OBOT_MCP_URL — Obot gateway Streamable HTTP after equal-arm catalog is registered
 *     (opt-in; see docs/benchmarks/dominance-peers-wiring.md). OBOT_MCP_TOKEN optional Bearer.
 *   BIFROST_BIN — bifrost-http binary (npx @maximhq/bifrost caches under ~/.cache/bifrost/)
 *   BIFROST_VK — optional virtual key value (default sk-bf-clawql-mt-bench)
 *
 * Note: do NOT put a hand-written slim-return program on the publish board as
 * "Executor". That is not gateway projection and contradicts the settled blog.
 * Bifrost Code Mode may still echo fat intermediate tool dumps in executeToolCode
 * "Print output" — Layer2 counts the full MCP text the host receives (honest).
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
const LIMIT = Math.min(100, Math.max(1, Number(process.env.MT_LIMIT ?? 25) || 25));
const INCLUDE_CF =
  process.env.MT_INCLUDE_CF === "1" || process.env.MT_INCLUDE_CF === "true";
const ARMS = (
  process.env.MT_ARMS ??
  (INCLUDE_CF
    ? "clawql,executor,mcpjungle,agentgateway,contextforge"
    : "clawql,executor,mcpjungle,agentgateway")
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
/** every_turn = publish aggregator peer; once = Bifrost Code Mode peer (discover once). */
const CLAWQL_DISCOVERY = (process.env.MT_CLAWQL_DISCOVERY ?? "every_turn").trim().toLowerCase();
const CLAWQL_SEARCH_ONCE = CLAWQL_DISCOVERY === "once" || CLAWQL_DISCOVERY === "search_once";
/** Dominance-roadmap weight for model-written args/code (secondary metric). */
const MODEL_WRITTEN_WEIGHT = Math.max(
  1,
  Math.min(10, Number(process.env.MT_MODEL_WRITTEN_WEIGHT ?? 5) || 5)
);

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
  // Bifrost Code Mode wraps the assigned `result` after a "Return value:" marker.
  const rv = raw.match(/Return value:\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*\n\s*Environment:/i);
  if (rv) {
    try {
      return JSON.parse(rv[1]);
    } catch {
      /* fall through */
    }
  }
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
  // Executor 2.x wraps return values: { status, execution: { value } }
  const unwrapped =
    parsed?.execution?.value !== undefined ? parsed.execution.value : parsed;
  if (Array.isArray(unwrapped)) rows = unwrapped;
  else if (Array.isArray(unwrapped?.items)) rows = unwrapped.items;
  else if (Array.isArray(unwrapped?.result)) rows = unwrapped.result;
  else if (Array.isArray(unwrapped?.data)) rows = unwrapped.data;
  else if (unwrapped && typeof unwrapped === "object" && Array.isArray(unwrapped.pets))
    rows = unwrapped.pets;
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

async function connectHttpMcp(url, name = "mt-http", headers = null) {
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

function resolveBifrostBin() {
  const fromEnv = resolveBin("BIFROST_BIN", [
    "/tmp/gw-bins/bifrost",
    "/tmp/gw-bins/bifrost-http",
    join(ROOT, "tmp/gw-bins/bifrost"),
  ]);
  if (fromEnv) return fromEnv;
  const cacheRoot = join(process.env.HOME || "/home/ubuntu", ".cache", "bifrost");
  if (!existsSync(cacheRoot)) return null;
  const versions = readdirSync(cacheRoot)
    .filter((d) => existsSync(join(cacheRoot, d, "bin")))
    .sort()
    .reverse();
  for (const v of versions) {
    const binDir = join(cacheRoot, v, "bin");
    const entries = readdirSync(binDir).filter((f) => f.startsWith("bifrost-http"));
    for (const f of entries) {
      const p = join(binDir, f);
      if (existsSync(p)) return p;
    }
  }
  return null;
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

async function connectClawql(mock) {
  const home = join("/tmp", `clawql-mt-gw-${process.pid}`);
  await mkdir(home, { recursive: true });
  const env = clawqlEnv(home, mock.specPath, mock.baseUrl);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "pipe",
    env,
  });
  const client = new Client({ name: "mt-clawql", version: "1" }, {});
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
    pid: transportPid(transport),
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

async function connectExecutor() {
  const url = process.env.EXECUTOR_MCP_URL?.trim();
  if (url) {
    const key =
      process.env.EXECUTOR_API_KEY?.trim() ||
      (() => {
        try {
          const p = process.env.EXECUTOR_API_KEY_FILE?.trim();
          if (p && existsSync(p)) return readFileSync(p, "utf8").trim();
        } catch {
          /* ignore */
        }
        return "";
      })();
    const headers = key ? { Authorization: `Bearer ${key}` } : null;
    return connectHttpMcp(url, "mt-executor-http", headers);
  }
  const bin = process.env.EXECUTOR_BIN?.trim();
  if (!bin) throw new Error("EXECUTOR_BIN or EXECUTOR_MCP_URL required");
  const childEnv = { ...process.env };
  if (process.env.EXECUTOR_DATA_DIR?.trim()) {
    childEnv.EXECUTOR_DATA_DIR = process.env.EXECUTOR_DATA_DIR.trim();
  }
  const transport = new StdioClientTransport({
    command: bin,
    args: ["mcp"],
    cwd: process.env.EXECUTOR_CWD?.trim() || dirname(bin),
    stderr: "pipe",
    env: childEnv,
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

/**
 * Bifrost MCP Gateway over equal-arm catalog (stdio child).
 * codeMode=false → classic tools/list (prefixed catalog-*) + fat callTool
 * codeMode=true  → four meta-tools; catalog hidden behind executeToolCode
 */
async function startBifrostCatalog({ codeMode = false } = {}) {
  const bin = resolveBifrostBin();
  if (!bin) {
    throw new Error(
      "bifrost binary not found (set BIFROST_BIN, or install via npx @maximhq/bifrost — caches under ~/.cache/bifrost/)"
    );
  }
  const id = codeMode ? "bifrost_codemode" : "bifrost";
  const work = join("/tmp", `${id}-mt-${process.pid}`);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const port = await pickFreePort();
  const vk =
    process.env.BIFROST_VK?.trim() ||
    (codeMode ? "sk-bf-clawql-mt-codemode" : "sk-bf-clawql-mt-classic");
  const cfgPath = join(work, "config.json");
  await writeFile(
    cfgPath,
    JSON.stringify(
      {
        setup_token: "clawql-mt-bench-setup-token",
        client: {
          enforce_auth_on_inference: false,
        },
        mcp: {
          client_configs: [
            {
              name: "catalog",
              connection_type: "stdio",
              stdio_config: {
                command: process.execPath,
                args: [CATALOG_MCP],
                envs: ["PATH", "HOME", "CATALOG_TOOL_COUNT"],
              },
              tools_to_execute: ["*"],
              allow_by_default: true,
              is_code_mode_client: !!codeMode,
            },
          ],
        },
        governance: {
          virtual_keys: [
            {
              id: codeMode ? "vk-mt-codemode" : "vk-mt-classic",
              name: id,
              value: vk,
              is_active: true,
              allow_all_providers: true,
              mcp_configs: [
                {
                  mcp_client_name: "catalog",
                  tools_to_execute: ["*"],
                },
              ],
            },
          ],
        },
      },
      null,
      2
    )
  );
  const logPath = join(work, "server.log");
  const logFd = openSync(logPath, "w");
  const child = spawn(
    bin,
    ["-app-dir", work, "-host", "127.0.0.1", "-port", String(port), "-log-level", "info"],
    {
      cwd: work,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env, CATALOG_TOOL_COUNT: String(TOOL_COUNT) },
    }
  );
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  const headers = { "x-bf-vk": vk };
  await waitHttpOk(`http://127.0.0.1:${port}/`, { timeoutMs: 90_000 });
  // Wait until catalog MCP child is connected (tools would otherwise be empty).
  const tConnect = Date.now();
  for (;;) {
    const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    if (log.includes("Connected to MCP server 'catalog'")) break;
    if (Date.now() - tConnect > 90_000) {
      throw new Error(`bifrost catalog connect timeout\n${log.slice(-2000)}`);
    }
    await sleep(200);
  }
  let probe;
  const t0 = Date.now();
  for (;;) {
    try {
      probe = await connectHttpMcp(mcpUrl, `${id}-probe`, headers);
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
        if (t.name === base || t.name.endsWith(base) || t.name.includes(base)) {
          nameMap.set(base, t.name);
        }
      }
    }
  } finally {
    await probe.close();
  }
  return {
    id,
    codeMode: !!codeMode,
    mcpUrl,
    vk,
    headers,
    pid: child.pid,
    work,
    resolveTool: (base) => nameMap.get(base) || `catalog-${base}`,
    connect: () => connectHttpMcp(mcpUrl, `${id}-mt`, headers),
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

/**
 * Obot (OSS) peer — operator registers the equal-arm catalog behind Obot, then
 * points OBOT_MCP_URL at the gateway MCP endpoint. Same fat aggregator path as
 * MCPJungle once tools/list + callTool are reachable.
 */
async function connectObotGateway() {
  const url = process.env.OBOT_MCP_URL?.trim();
  if (!url) throw new Error("OBOT_MCP_URL required for obot arm");
  const token = process.env.OBOT_MCP_TOKEN?.trim() || "";
  const headers = token ? { Authorization: `Bearer ${token}` } : null;
  const probe = await connectHttpMcp(url, "obot-probe", headers);
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
    id: "obot",
    mcpUrl: url,
    headers,
    pid: null,
    resolveTool: (base) => nameMap.get(base) || base,
    connect: () => connectHttpMcp(url, "obot-mt", headers),
    close: async () => {},
  };
}

async function runBifrostCodeModeArm(gw, turns) {
  const conn = await gw.connect();
  try {
    const listed = await conn.client.listTools();
    const metaNames = ["listToolFiles", "readToolFile", "getToolDocs", "executeToolCode"];
    const metaTools = listed.tools.filter((t) => metaNames.includes(t.name));
    if (metaTools.length < 4) {
      throw new Error(
        `bifrost_codemode expected 4 meta-tools, got: ${listed.tools.map((t) => t.name).join(",")}`
      );
    }
    const l1 = measureLayer1FromTools(listed.tools, { onlyNames: metaNames });
    // Discovery once — equivalent of loading the catalog stub before scripting.
    const listFilesRes = await conn.client.callTool({ name: "listToolFiles", arguments: {} });
    if (listFilesRes.isError) {
      throw new Error(`listToolFiles: ${toolText(listFilesRes).slice(0, 300)}`);
    }
    const listFilesText = toolText(listFilesRes);
    const readRes = await conn.client.callTool({
      name: "readToolFile",
      arguments: { fileName: "servers/catalog.pyi" },
    });
    if (readRes.isError) {
      throw new Error(`readToolFile: ${toolText(readRes).slice(0, 300)}`);
    }
    const readText = toolText(readRes);
    const discoveryTok = countTokens(listFilesText) + countTokens(readText);
    const perTurn = [];
    for (const turn of turns) {
      // Project in-sandbox to {id,name,status} — Code Mode's Layer2 promise.
      // Honesty: Bifrost still echoes the fat upstream dump in "Print output".
      const code = `raw = catalog.${turn.tool}(limit=${turn.args.limit}, status=${JSON.stringify(turn.args.status)}, includeMeta=True)
items = raw["items"] if "items" in raw else raw
result = [{"id": x["id"], "name": x["name"], "status": x["status"]} for x in items]`;
      const writtenTok = countTokens(code);
      const t0 = performance.now();
      const res = await conn.client.callTool({
        name: "executeToolCode",
        arguments: { code },
      });
      const ms = performance.now() - t0;
      if (res.isError) {
        throw new Error(`executeToolCode ${turn.tool}: ${toolText(res).slice(0, 400)}`);
      }
      const text = toolText(res);
      const success = scoreTaskSuccess(text, turn.partition, turn.args.limit);
      perTurn.push({
        n: turn.n,
        tool: "executeToolCode",
        catalog_tool: turn.tool,
        result_tokens: countTokens(text),
        result_chars: text.length,
        model_written_tokens: writtenTok,
        layer2_classic: countTokens(text),
        layer2_relist_every_turn: countTokens(text),
        latency_ms: Number(ms.toFixed(3)),
        ok: true,
        task_success: success,
      });
    }
    return {
      id: "bifrost_codemode",
      model: "bifrost_code_mode_executeToolCode_starlark",
      layer1: {
        once_schema_tokens: l1.schema_tokens + discoveryTok,
        tools_count: l1.tools_count,
        tools_list_count_full: listed.tools.length,
        tools_list_schema_tokens_full: l1.tools_list_schema_tokens_full,
        meta_schema_tokens: l1.schema_tokens,
        discovery_once_tokens: discoveryTok,
        note:
          "Layer1 = 4 Code Mode meta-tool schemas + once listToolFiles/readToolFile(catalog.pyi). " +
          "Layer2 counts full executeToolCode text (includes Bifrost TOOL print of fat upstream).",
      },
      perTurn,
      skipped: false,
    };
  } finally {
    await conn.close();
  }
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
  try {
    const listed = await conn.client.listTools();
    const l1 = measureLayer1FromTools(listed.tools);
    const perTurn = [];
    for (const turn of turns) {
      const name = gw.resolveTool(turn.tool);
      const writtenTok = countTokens(JSON.stringify(turn.args));
      const t0 = performance.now();
      const res = await conn.client.callTool({
        name,
        arguments: turn.args,
      });
      const ms = performance.now() - t0;
      if (res.isError) throw new Error(`${gw.id} ${name}: ${toolText(res).slice(0, 300)}`);
      const text = toolText(res);
      // Secondary sensitivity: re-list cost (most clients cache — demoted from headline)
      const relist = await conn.client.listTools();
      const relistTok = relist.tools.reduce((n, t) => n + countTokens(JSON.stringify(t)), 0);
      const success = scoreTaskSuccess(text, turn.partition, turn.args.limit);
      perTurn.push({
        n: turn.n,
        tool: name,
        result_tokens: countTokens(text),
        result_chars: text.length,
        model_written_tokens: writtenTok,
        tools_list_tokens: relistTok,
        layer2_classic: countTokens(text),
        layer2_relist_every_turn: relistTok + countTokens(text),
        latency_ms: Number(ms.toFixed(3)),
        ok: true,
        task_success: success,
      });
    }
    return {
      id: gw.id,
      model: "aggregator_tools_list_plus_fat_call",
      layer1: {
        once_schema_tokens: l1.schema_tokens,
        tools_count: l1.tools_count,
        note: "Full tools/list dump (fat catalog surface); classic counts Layer1 once",
      },
      perTurn,
      skipped: false,
    };
  } finally {
    await conn.close();
  }
}

function clawqlModelWrittenTokens(turn, { searched }) {
  // What the model must author each turn (query when searching + execute args).
  let n = 0;
  if (searched) n += countTokens(turn.query);
  n += countTokens(
    JSON.stringify({
      operationId: turn.operationId,
      args: turn.args,
      where: turn.where,
      fields: turn.fields,
    })
  );
  return n;
}

async function runClawqlArm(mock, turns) {
  const conn = await connectClawql(mock);
  try {
    const listed = await conn.client.listTools();
    const l1 = measureLayer1FromTools(listed.tools, { onlyNames: ["search", "execute"] });
    let discoveryTok = 0;
    let discoveryText = "";
    if (CLAWQL_SEARCH_ONCE) {
      // Equal-arm vs Code Mode readToolFile(catalog.pyi): one catalog-wide search
      // covering all partitions, then execute+fields each turn (no rediscovery tax).
      const disco = await conn.client.callTool({
        name: "search",
        arguments: {
          query: "catalog_list inventory list entities partition",
          limit: Math.min(50, Math.max(TOOL_COUNT, 40)),
          detail: "compact",
        },
      });
      if (disco.isError) {
        throw new Error(`clawql discovery search: ${toolText(disco).slice(0, 300)}`);
      }
      discoveryText = toolText(disco);
      discoveryTok = countTokens(discoveryText);
    }
    const perTurn = [];
    for (const turn of turns) {
      const t0 = performance.now();
      let searchTok = 0;
      let searched = false;
      if (!CLAWQL_SEARCH_ONCE) {
        const searchRes = await conn.client.callTool({
          name: "search",
          arguments: { query: turn.query, limit: 3, detail: "compact" },
        });
        if (searchRes.isError) {
          throw new Error(`clawql search: ${toolText(searchRes).slice(0, 300)}`);
        }
        searchTok = countTokens(toolText(searchRes));
        searched = true;
      }
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
      const ms = performance.now() - t0;
      if (execRes.isError) {
        throw new Error(`clawql execute: ${toolText(execRes).slice(0, 400)}`);
      }
      const execText = toolText(execRes);
      const resultTok = countTokens(execText);
      const writtenTok = clawqlModelWrittenTokens(turn, { searched });
      const success = scoreTaskSuccess(execText, turn.partition, turn.args.limit);
      perTurn.push({
        n: turn.n,
        tool: turn.operationId,
        search_tokens: searchTok,
        result_tokens: resultTok,
        result_chars: execText.length,
        model_written_tokens: writtenTok,
        where: turn.where,
        fields: turn.fields,
        layer2_classic: searchTok + resultTok,
        layer2_relist_every_turn: searchTok + resultTok, // no tools/list dump
        latency_ms: Number(ms.toFixed(3)),
        ok: true,
        task_success: success,
      });
    }
    return {
      id: "clawql",
      model: CLAWQL_SEARCH_ONCE
        ? "search_once_plus_execute_where_fields"
        : "search_plus_execute_where_fields",
      discovery: CLAWQL_SEARCH_ONCE ? "once" : "every_turn",
      layer1: {
        once_schema_tokens: l1.schema_tokens + discoveryTok,
        tools_count: l1.tools_count,
        tools_list_count_full: l1.tools_list_count_full,
        tools_list_schema_tokens_full: l1.tools_list_schema_tokens_full,
        meta_schema_tokens: l1.schema_tokens,
        discovery_once_tokens: discoveryTok,
        note: CLAWQL_SEARCH_ONCE
          ? "Code Mode peer: search+execute schemas + once catalog-wide search; Layer2 is execute+fields only"
          : "Only search+execute schemas counted as Layer1 (catalog stays server-side); search every turn in Layer2",
      },
      perTurn,
      skipped: false,
    };
  } finally {
    await conn.close();
  }
}

async function runExecutorArm(turns, { filter = false } = {}) {
  const conn = await connectExecutor();
  const armId = filter ? "executor_filter" : "executor";
  const viaHttp = Boolean(process.env.EXECUTOR_MCP_URL?.trim());
  try {
    const listed = await conn.client.listTools();
    const executeTool = listed.tools.find((t) => t.name === "execute");
    const l1Tokens = executeTool ? countTokens(JSON.stringify(executeTool)) : 0;
    const perTurn = [];
    for (const turn of turns) {
      const payload = filter
        ? slimPayload(turn.partition, turn.args.limit)
        : fatPayload(turn.partition, turn.args.limit);
      // Code-mode filter: program projects to same fields as ClawQL where+fields.
      const code = filter
        ? `const fat = ${JSON.stringify(fatPayload(turn.partition, turn.args.limit))}; return fat.items.map((r) => ({ id: r.id, name: r.name, status: r.status }));`
        : `return ${JSON.stringify(payload)};`;
      const t0 = performance.now();
      const res = await conn.client.callTool({
        name: "execute",
        arguments: { code, timeoutMs: 30_000 },
      });
      const ms = performance.now() - t0;
      if (res.isError) throw new Error(`${armId}: ${toolText(res).slice(0, 300)}`);
      const text = toolText(res);
      const success = scoreTaskSuccess(text, turn.partition, turn.args.limit);
      perTurn.push({
        n: turn.n,
        tool: "execute",
        result_tokens: countTokens(text),
        result_chars: text.length,
        layer2_classic: countTokens(text),
        layer2_relist_every_turn: countTokens(text),
        latency_ms: Number(ms.toFixed(3)),
        ok: true,
        task_success: success,
        note: filter
          ? "Code-mode filter to {id,name,status} — fair peer for ClawQL projection"
          : "Fat equal-arm JSON via code; no fields projection",
      });
    }
    return {
      id: armId,
      model: filter
        ? viaHttp
          ? "http_mcp_code_execute_fields_filter"
          : "stdio_mcp_code_execute_fields_filter"
        : viaHttp
          ? "http_mcp_code_execute_fat_static"
          : "stdio_mcp_code_execute_fat_static",
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
      skipped: false,
    };
  } finally {
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
  const meanLat =
    arm.perTurn.reduce((a, t) => a + (t.latency_ms || 0), 0) / arm.perTurn.length;
  const writtenSum = arm.perTurn.reduce((a, t) => a + (t.model_written_tokens || 0), 0);
  const weightedCombined = last.combined + MODEL_WRITTEN_WEIGHT * writtenSum;
  const successTurns = arm.perTurn.filter((t) => t.task_success?.ok).length;
  const taskSuccess = {
    turns_ok: successTurns,
    turns_total: arm.perTurn.length,
    ok: successTurns === arm.perTurn.length,
    rate: Number((successTurns / Math.max(1, arm.perTurn.length)).toFixed(3)),
  };
  return {
    ...arm,
    cumulative_classic: classic,
    cumulative_tools_list_every_turn: relist,
    task_success: taskSuccess,
    board: {
      layer1_once_tokens: l1,
      mean_layer2_tokens: Number(meanL2.toFixed(1)),
      mean_result_tokens: Number(meanResult.toFixed(1)),
      combined_at_n: last.combined,
      combined_relist_every_turn_at_n: lastRelist.combined,
      model_written_tokens_sum: writtenSum,
      model_written_weight: MODEL_WRITTEN_WEIGHT,
      combined_weighted_at_n: weightedCombined,
      mean_latency_ms: Number(meanLat.toFixed(3)),
      turns: arm.perTurn.length,
      task_success_ok: taskSuccess.ok,
      task_success_rate: taskSuccess.rate,
    },
  };
}

function ratioBoard(arms) {
  const claw = arms.clawql?.board;
  if (!claw) return {};
  const out = {};
  for (const [id, arm] of Object.entries(arms)) {
    if (!arm?.board || id === "clawql") continue;
    out[id] = {
      vs_clawql_combined_classic: +(arm.board.combined_at_n / claw.combined_at_n).toFixed(2),
      vs_clawql_combined_relist_every_turn: +(
        arm.board.combined_relist_every_turn_at_n / claw.combined_relist_every_turn_at_n
      ).toFixed(2),
      vs_clawql_combined_weighted: +(
        arm.board.combined_weighted_at_n / Math.max(1, claw.combined_weighted_at_n)
      ).toFixed(2),
      vs_clawql_mean_result: +(arm.board.mean_result_tokens / claw.mean_result_tokens).toFixed(2),
      vs_clawql_layer1: +(arm.board.layer1_once_tokens / Math.max(1, claw.layer1_once_tokens)).toFixed(
        2
      ),
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
  if (ratios.bifrost) {
    lines.push(
      `Measured vs Bifrost classic @N=${TURNS}: classic ${ratios.bifrost.vs_clawql_combined_classic}× ` +
        `(full tools/list + fat callTool via /mcp).`
    );
  }
  if (ratios.bifrost_codemode) {
    lines.push(
      `Measured vs Bifrost Code Mode @N=${TURNS}: classic ${ratios.bifrost_codemode.vs_clawql_combined_classic}×` +
        (ratios.bifrost_codemode.vs_clawql_combined_weighted
          ? ` / weighted(×${MODEL_WRITTEN_WEIGHT} model-written) ${ratios.bifrost_codemode.vs_clawql_combined_weighted}×`
          : "") +
        ` (Layer2 includes TOOL print dump; ClawQL discovery=${CLAWQL_SEARCH_ONCE ? "once" : "every_turn"}).`
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
    `[mt] turns=${TURNS} catalog_tools=${TOOL_COUNT} limit=${LIMIT} arms=${ARMS.join(",")}`
  );
  console.log(`[mt] equal-arm fat≈${fatTok} tok slim(fields)≈${slimTok} tok (partition 1)`);

  try {
    for (const arm of ARMS) {
      console.log(`[mt] run ${arm}`);
      try {
        if (arm === "clawql") {
          if (!existsSync(join(ROOT, "dist", "server.js"))) {
            rawArms.clawql = { skipped: true, reason: "dist/server.js missing" };
            continue;
          }
          rawArms.clawql = await runClawqlArm(mock, turns);
        } else if (arm === "executor") {
          if (!process.env.EXECUTOR_BIN?.trim() && !process.env.EXECUTOR_MCP_URL?.trim()) {
            rawArms.executor = {
              skipped: true,
              reason: "EXECUTOR_BIN / EXECUTOR_MCP_URL unset",
            };
            continue;
          }
          rawArms.executor = await runExecutorArm(turns, { filter: false });
        } else if (arm === "executor_filter") {
          if (!process.env.EXECUTOR_BIN?.trim() && !process.env.EXECUTOR_MCP_URL?.trim()) {
            rawArms.executor_filter = {
              skipped: true,
              reason: "EXECUTOR_BIN / EXECUTOR_MCP_URL unset",
            };
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
        } else if (arm === "bifrost") {
          const gw = await startBifrostCatalog({ codeMode: false });
          gateways.push(gw);
          rawArms.bifrost = await runAggregatorArm(gw, turns);
        } else if (arm === "bifrost_codemode") {
          const gw = await startBifrostCatalog({ codeMode: true });
          gateways.push(gw);
          rawArms.bifrost_codemode = await runBifrostCodeModeArm(gw, turns);
        } else if (arm === "obot") {
          if (!process.env.OBOT_MCP_URL?.trim()) {
            rawArms.obot = {
              skipped: true,
              reason:
                "OBOT_MCP_URL unset — register equal-arm catalog in Obot then set URL (docs/benchmarks/dominance-peers-wiring.md)",
            };
            continue;
          }
          const gw = await connectObotGateway();
          gateways.push(gw);
          rawArms.obot = await runAggregatorArm(gw, turns);
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
    }

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

    const report = {
      suite: "gateway-multi-multiturn",
      measuredAt: new Date().toISOString(),
      node: process.version,
      config: {
        turns: TURNS,
        catalog_tool_count: TOOL_COUNT,
        limit: LIMIT,
        where: WHERE,
        fields: FIELDS,
        arms: ARMS,
        clawql_discovery: CLAWQL_SEARCH_ONCE ? "once" : "every_turn",
        model_written_weight: MODEL_WRITTEN_WEIGHT,
        tokenizer: "cl100k_base",
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
        "PRIMARY: classic Layer1_once + sum(Layer2) with deterministic task_success.",
        "SECONDARY: tools_list_every_turn — most clients cache ListTools; do not lead with this multiplier.",
        "Executor Layer2 is fat JSON — matches measured live path (executor-cmp-001 / Both Sides post). No gateway fields.",
        "Do not publish a hand-written slim-return program as Executor.",
        "ContextForge/MetaMCP off publish board by default.",
        "Bifrost/bifrost_codemode are opt-in via MT_ARMS (not default) until a published board lands.",
        "Bifrost Code Mode Layer2 counts full executeToolCode text — Bifrost may echo fat upstream in Print output.",
        "Not a latency board; see gateway-multi-cmp-10k.json for interleaved p999.",
        "RSS is a loss among serious arms — admit plainly.",
      ],
    };

    await writeFile(OUT_PATH, JSON.stringify(report, null, 2));
    console.log(`\n[mt] wrote ${OUT_PATH}`);
    console.log("\n=== Multi-turn cumulative (PRIMARY: classic Layer1 once + sum L2) ===\n");
    console.log(
      "arm | L1 once | mean L2 | combined@N | weighted@N | mean result tok | task_success"
    );
    for (const [id, b] of Object.entries(board)) {
      if (b.skipped) {
        console.log(`${id} | SKIP ${b.reason?.slice(0, 60)}`);
        continue;
      }
      console.log(
        `${id} | ${b.layer1_once_tokens} | ${b.mean_layer2_tokens} | ${b.combined_at_n} | ${b.combined_weighted_at_n} | ${b.mean_result_tokens} | ${b.task_success_ok ? "PASS" : "FAIL"} (${b.task_success_rate})`
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
