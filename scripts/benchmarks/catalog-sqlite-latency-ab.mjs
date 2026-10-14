/**
 * ClawQL HTTP latency A/B: in-memory catalog vs CLAWQL_CATALOG_SQLITE LOAD=db.
 *
 *   node scripts/benchmarks/catalog-sqlite-latency-ab.mjs
 *   N=2500 RUNTIME=bun node scripts/benchmarks/catalog-sqlite-latency-ab.mjs
 *
 * Equal-arm pets mock + fat-ish OpenAPI (same shape as catalog-listen fat).
 * Reports e2e search+execute and execute-only percentiles (p50/p99/p999).
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";

const ROOT = "/workspace";
const OUT = process.env.OUT || "/opt/cursor/artifacts/catalog-sqlite-latency-ab.json";
const N = Math.max(50, Number(process.env.N || 2500) || 2500);
const WARMUP = Math.max(5, Number(process.env.WARMUP || 30) || 30);
const TOOL_COUNT = Math.max(4, Number(process.env.CATALOG_TOOL_COUNT || 40) || 40);
const RUNTIME = (process.env.RUNTIME || "bun").trim().toLowerCase();
const BUN = process.env.BUN_BIN || `${process.env.HOME}/.bun/bin/bun`;
const USE_TASKSET = !["0", "false", "no"].includes(
  (process.env.USE_TASKSET ?? "1").trim().toLowerCase()
);
const FAT_SPEC = process.env.FAT_SPEC
  ? resolve(ROOT, process.env.FAT_SPEC)
  : null;

const { clawqlEqualArmEnv } = await import(
  join(ROOT, "scripts/benchmarks/lib/clawql-bench-env.mjs")
);

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function stats(samples) {
  if (!samples.length) {
    return { n: 0, p50_ms: null, p99_ms: null, p999_ms: null, mean_ms: null, max_ms: null };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return {
    n: samples.length,
    p50_ms: Number(percentile(sorted, 50).toFixed(3)),
    p99_ms: Number(percentile(sorted, 99).toFixed(3)),
    p999_ms: Number(percentile(sorted, 99.9).toFixed(3)),
    mean_ms: Number(mean.toFixed(3)),
    max_ms: Number(sorted[sorted.length - 1].toFixed(3)),
    n_ge_100: samples.filter((x) => x >= 100).length,
    n_ge_300: samples.filter((x) => x >= 300).length,
  };
}

function pickPort() {
  return new Promise((resolveP, reject) => {
    const s = createNetServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolveP(port));
    });
    s.on("error", reject);
  });
}

async function waitTcp(port, ms = 120000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolveP) => {
      const c = createConnection({ host: "127.0.0.1", port }, () => {
        c.end();
        resolveP(true);
      });
      c.on("error", () => resolveP(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("tcp timeout");
}

function buildFatSpec(baseUrl) {
  const paths = {};
  for (let i = 1; i <= TOOL_COUNT; i++) {
    const name = i === 1 ? "listPets" : `catalog_list_${String(i).padStart(3, "0")}`;
    const path = i === 1 ? "/pets" : `/catalog/${String(i).padStart(3, "0")}`;
    paths[path] = {
      get: {
        operationId: name,
        summary: i === 1 ? "List pets" : `List partition ${i}`,
        description: `Equal-arm catalog op ${i}. Theme ${["pets", "orders", "users"][i % 3]}.`,
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 25 },
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
  return {
    openapi: "3.0.3",
    info: { title: "equalArmCatalog", version: "1" },
    servers: [{ url: baseUrl }],
    paths,
  };
}

async function runCompile(specPath, outPath) {
  const child = spawn(
    process.execPath,
    [
      join(ROOT, "scripts/benchmarks/compile-catalog-sqlite.mjs"),
      "--spec",
      specPath,
      "--out",
      outPath,
    ],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
  );
  let err = "";
  child.stderr?.on("data", (c) => {
    err += c;
  });
  const code = await new Promise((r) => child.on("close", r));
  if (code !== 0) throw new Error(`compile failed: ${err.slice(-800)}`);
}

async function mcpCall(port, sid, id, method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sid) headers["mcp-session-id"] = sid;
  const t0 = performance.now();
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  const ms = performance.now() - t0;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`non-json ${res.status}: ${text.slice(0, 200)}`);
  }
  if (json.error) throw new Error(JSON.stringify(json.error));
  if (json.result?.isError) {
    const msg = json.result.content?.[0]?.text || "tool error";
    throw new Error(msg.slice(0, 300));
  }
  return { ms, json, headers: res.headers };
}

async function openSession(port) {
  const init = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "sqlite-lat-ab", version: "0" },
      },
    }),
  });
  const sid = init.headers.get("mcp-session-id");
  if (!sid) throw new Error("no mcp-session-id");
  await init.text();
  await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sid,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  }).catch(() => {});
  return sid;
}

/**
 * @param {"memory"|"sqlite_loaddb"} mode
 */
async function measureMode(mode, { home, specPath, catalogPath, mockPort }) {
  const port = await pickPort();
  const env = {
    ...clawqlEqualArmEnv({
      home,
      specPath,
      apiBase: `http://127.0.0.1:${mockPort}`,
    }),
    PORT: String(port),
    MCP_PORT: String(port),
    MCP_HOST: "127.0.0.1",
    CLAWQL_AUTH_MODE: "noAuth",
    CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE: "1",
    CLAWQL_MCP_DISABLE_STANDALONE_SSE: "1",
    CLAWQL_HTTP_SKIP_GRAPHQL: "1",
    CLAWQL_ENABLE_HTTP_METRICS: "0",
    CLAWQL_BENCH_STATS: "1",
  };
  if (mode === "sqlite_loaddb") {
    env.CLAWQL_CATALOG_SQLITE = "1";
    env.CLAWQL_CATALOG_SQLITE_PATH = catalogPath;
    env.CLAWQL_CATALOG_SQLITE_LOAD = "db";
    delete env.CLAWQL_SPEC_PATH;
    delete env.OPENAPI_SPEC_PATH;
    delete env.OPENAPI_FILE;
  }

  let cmd = RUNTIME === "bun" ? BUN : process.execPath;
  let args =
    RUNTIME === "bun"
      ? ["--smol", join(ROOT, "dist/server-http.js")]
      : [join(ROOT, "dist/server-http.js")];
  if (USE_TASKSET) {
    args = ["-c", "2,3", cmd, ...args];
    cmd = "taskset";
  }

  const child = spawn(cmd, args, {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let log = "";
  child.stderr?.on("data", (c) => {
    log += c;
  });

  try {
    await waitTcp(port, 120000);
    await new Promise((r) => setTimeout(r, 400));
    const sid = await openSession(port);

    const searchMs = [];
    const execMs = [];
    const turnMs = [];
    const firstExec = [];

    for (let i = 0; i < WARMUP; i++) {
      await mcpCall(port, sid, 1000 + i, "tools/call", {
        name: "search",
        arguments: { query: "list pets" },
      });
      await mcpCall(port, sid, 2000 + i, "tools/call", {
        name: "execute",
        arguments: { operationId: "listPets", args: {} },
      });
    }

    // Fresh session for measured first-touch after warmup server is hot
    const sid2 = await openSession(port);
    {
      const t0 = performance.now();
      const s = await mcpCall(port, sid2, 1, "tools/call", {
        name: "search",
        arguments: { query: "list pets" },
      });
      const e = await mcpCall(port, sid2, 2, "tools/call", {
        name: "execute",
        arguments: { operationId: "listPets", args: {} },
      });
      firstExec.push({
        search_ms: Number(s.ms.toFixed(3)),
        exec_ms: Number(e.ms.toFixed(3)),
        turn_ms: Number((performance.now() - t0).toFixed(3)),
      });
    }

    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      const s = await mcpCall(port, sid, 10000 + i, "tools/call", {
        name: "search",
        arguments: { query: "list pets" },
      });
      const e = await mcpCall(port, sid, 20000 + i, "tools/call", {
        name: "execute",
        arguments: { operationId: "listPets", args: {} },
      });
      searchMs.push(s.ms);
      execMs.push(e.ms);
      turnMs.push(performance.now() - t0);
    }

    const hz = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
    return {
      mode,
      runtime: RUNTIME,
      search: stats(searchMs),
      execute: stats(execMs),
      turn_search_plus_exec: stats(turnMs),
      first_after_new_session: firstExec[0] ?? null,
      bench: hz.bench ?? null,
      log_tail: log.slice(-500),
    };
  } finally {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
}

function delta(a, b) {
  if (a == null || b == null) return null;
  return Number((b - a).toFixed(3));
}

function deltaBlock(mem, sql) {
  const keys = ["p50_ms", "p99_ms", "p999_ms", "mean_ms", "n_ge_300"];
  const out = {};
  for (const k of keys) out[k] = delta(mem?.[k], sql?.[k]);
  return out;
}

const home = join(tmpdir(), `cat-sqlite-lat-${process.pid}`);
await mkdir(home, { recursive: true });
const mockPort = await pickPort();
const mock = createHttpServer((_q, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ items: [{ name: "Ada" }, { name: "Grace" }] }));
});
await new Promise((r) => mock.listen(mockPort, "127.0.0.1", r));

const specPath = join(home, "spec.json");
if (FAT_SPEC) {
  await copyFile(FAT_SPEC, specPath);
} else {
  await writeFile(specPath, JSON.stringify(buildFatSpec(`http://127.0.0.1:${mockPort}`), null, 2));
}
const catalogPath = join(home, "catalog.sqlite");
await runCompile(specPath, catalogPath);

console.error(`[lat-ab] N=${N} warmup=${WARMUP} runtime=${RUNTIME} tools=${TOOL_COUNT} taskset=${USE_TASKSET}`);
const memory = await measureMode("memory", { home, specPath, catalogPath, mockPort });
console.error(`[lat-ab] memory turn p50=${memory.turn_search_plus_exec.p50_ms} p999=${memory.turn_search_plus_exec.p999_ms}`);
const loaddb = await measureMode("sqlite_loaddb", { home, specPath, catalogPath, mockPort });
console.error(`[lat-ab] loaddb turn p50=${loaddb.turn_search_plus_exec.p50_ms} p999=${loaddb.turn_search_plus_exec.p999_ms}`);

mock.close();

const out = {
  measuredAt: new Date().toISOString(),
  n: N,
  warmup: WARMUP,
  runtime: RUNTIME,
  tool_count: TOOL_COUNT,
  use_taskset_gateway_2_3: USE_TASKSET,
  spec: FAT_SPEC || "synthetic-equal-arm-fat",
  spec_bytes: statSync(specPath).size,
  catalog_sqlite_bytes: existsSync(catalogPath) ? statSync(catalogPath).size : null,
  memory,
  sqlite_loaddb: loaddb,
  delta_loaddb_minus_memory_ms: {
    search: deltaBlock(memory.search, loaddb.search),
    execute: deltaBlock(memory.execute, loaddb.execute),
    turn_search_plus_exec: deltaBlock(
      memory.turn_search_plus_exec,
      loaddb.turn_search_plus_exec
    ),
  },
  interpretation:
    "Positive delta = SQLite slower. Steady-state search should be near-identical (ops already in heap). " +
    "Execute may pay a one-time gunzip+JSON parse on first OAS property touch; subsequent executes use the in-process cache. " +
    "p999 on this board is still dominated by the open HTTP post-mock stall (round 12), not catalog storage.",
};

await mkdir(join("/opt/cursor/artifacts"), { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
