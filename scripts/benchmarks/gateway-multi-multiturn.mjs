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
 *   EXECUTOR_BIN=… EXECUTOR_CWD=… \
 *     MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle \
 *     AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway \
 *     MT_TURNS=12 CATALOG_TOOL_COUNT=40 \
 *     node scripts/benchmarks/gateway-multi-multiturn.mjs
 *
 * Env:
 *   MT_TURNS (default 12)  CATALOG_TOOL_COUNT (default 40)
 *   MT_ARMS=clawql,executor,mcpjungle,agentgateway
 *   MT_LIMIT (rows per turn, default 25)
 *   MT_OUT (default gateway-multi-multiturn.json)
 *   MT_INCLUDE_CF=1 only for nested CF experiments (off publish board)
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
  try {
    const listed = await conn.client.listTools();
    const l1 = measureLayer1FromTools(listed.tools);
    const perTurn = [];
    for (const turn of turns) {
      const name = gw.resolveTool(turn.tool);
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

async function runClawqlArm(mock, turns) {
  const conn = await connectClawql(mock);
  try {
    const listed = await conn.client.listTools();
    const l1 = measureLayer1FromTools(listed.tools, { onlyNames: ["search", "execute"] });
    const perTurn = [];
    for (const turn of turns) {
      const t0 = performance.now();
      const searchRes = await conn.client.callTool({
        name: "search",
        arguments: { query: turn.query, limit: 3 },
      });
      if (searchRes.isError) {
        throw new Error(`clawql search: ${toolText(searchRes).slice(0, 300)}`);
      }
      const searchText = toolText(searchRes);
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
      const searchTok = countTokens(searchText);
      const resultTok = countTokens(execText);
      const success = scoreTaskSuccess(execText, turn.partition, turn.args.limit);
      perTurn.push({
        n: turn.n,
        tool: turn.operationId,
        search_tokens: searchTok,
        result_tokens: resultTok,
        result_chars: execText.length,
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
      model: "search_plus_execute_where_fields",
      layer1: {
        once_schema_tokens: l1.schema_tokens,
        tools_count: l1.tools_count,
        tools_list_count_full: l1.tools_list_count_full,
        tools_list_schema_tokens_full: l1.tools_list_schema_tokens_full,
        note: "Only search+execute schemas counted as Layer1 (catalog stays server-side)",
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
        ? "stdio_mcp_code_execute_fields_filter"
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
        "Not a latency board; see gateway-multi-cmp-10k.json for interleaved p999.",
        "RSS is a loss among serious arms — admit plainly.",
      ],
    };

    await writeFile(OUT_PATH, JSON.stringify(report, null, 2));
    console.log(`\n[mt] wrote ${OUT_PATH}`);
    console.log("\n=== Multi-turn cumulative (PRIMARY: classic Layer1 once + sum L2) ===\n");
    console.log("arm | L1 once | mean L2 | combined@N | mean result tok | task_success");
    for (const [id, b] of Object.entries(board)) {
      if (b.skipped) {
        console.log(`${id} | SKIP ${b.reason?.slice(0, 60)}`);
        continue;
      }
      console.log(
        `${id} | ${b.layer1_once_tokens} | ${b.mean_layer2_tokens} | ${b.combined_at_n} | ${b.mean_result_tokens} | ${b.task_success_ok ? "PASS" : "FAIL"} (${b.task_success_rate})`
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
