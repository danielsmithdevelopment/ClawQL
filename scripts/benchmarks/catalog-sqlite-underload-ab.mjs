/**
 * Under-load RSS / anon / PSS A/B: in-memory vs CLAWQL_CATALOG_SQLITE LOAD=db.
 *
 * Runs Bun HTTP multiturn-style search+execute, samples smaps during load.
 *
 *   N=500 SPEC=equal node scripts/benchmarks/catalog-sqlite-underload-ab.mjs
 *   N=300 SPEC=sentry OUT=/opt/cursor/artifacts/catalog-sqlite-underload-sentry.json \
 *     node scripts/benchmarks/catalog-sqlite-underload-ab.mjs
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
const OUT = process.env.OUT || "/opt/cursor/artifacts/catalog-sqlite-underload-ab.json";
const N = Math.max(50, Number(process.env.N || 500) || 500);
const WARMUP = Math.max(5, Number(process.env.WARMUP || 20) || 20);
const SAMPLE_EVERY = Math.max(10, Number(process.env.SAMPLE_EVERY || 25) || 25);
const TOOL_COUNT = Math.max(4, Number(process.env.CATALOG_TOOL_COUNT || 40) || 40);
const BUN = process.env.BUN_BIN || `${process.env.HOME}/.bun/bin/bun`;
const SPEC_KIND = (process.env.SPEC || "equal").trim().toLowerCase();
const SENTRY = resolve(ROOT, "providers/sentry/openapi.json");

const { clawqlEqualArmEnv } = await import(
  join(ROOT, "scripts/benchmarks/lib/clawql-bench-env.mjs")
);

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

async function waitTcp(port, ms = 180000) {
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

function smapsRollup(pid) {
  const p = `/proc/${pid}/smaps_rollup`;
  if (!existsSync(p)) return null;
  const text = readFileSync(p, "utf8");
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}:\\s+(\\d+)\\s+kB`, "m"));
    return m ? Number(m[1]) : null;
  };
  const rss = get("Rss");
  const anon = get("Anonymous");
  const pss = get("Pss");
  return {
    rss_mb: rss != null ? Number((rss / 1024).toFixed(2)) : null,
    anonymous_mb: anon != null ? Number((anon / 1024).toFixed(2)) : null,
    pss_mb: pss != null ? Number((pss / 1024).toFixed(2)) : null,
  };
}

function summarizeSamples(samples) {
  if (!samples.length) return null;
  const keys = ["rss_mb", "anonymous_mb", "pss_mb"];
  const out = { n: samples.length };
  for (const k of keys) {
    const vals = samples.map((s) => s[k]).filter((x) => x != null).sort((a, b) => a - b);
    if (!vals.length) {
      out[k] = { min: null, median: null, max: null };
      continue;
    }
    const mid = vals[Math.floor(vals.length / 2)];
    out[k] = {
      min: vals[0],
      median: mid,
      max: vals[vals.length - 1],
    };
  }
  out.first = samples[0];
  out.last = samples[samples.length - 1];
  return out;
}

function buildEqualSpec(baseUrl) {
  const paths = {};
  for (let i = 1; i <= TOOL_COUNT; i++) {
    const name = i === 1 ? "listPets" : `catalog_list_${String(i).padStart(3, "0")}`;
    const path = i === 1 ? "/pets" : `/catalog/${String(i).padStart(3, "0")}`;
    paths[path] = {
      get: {
        operationId: name,
        summary: i === 1 ? "List pets" : `List partition ${i}`,
        description: `Equal-arm catalog op ${i}.`,
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
        clientInfo: { name: "sqlite-underload", version: "0" },
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

async function mcpCall(port, sid, id, name, args) {
  const t0 = performance.now();
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sid,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  const ms = performance.now() - t0;
  const json = JSON.parse(text);
  if (json.error) throw new Error(JSON.stringify(json.error));
  if (json.result?.isError) {
    throw new Error((json.result.content?.[0]?.text || "tool error").slice(0, 240));
  }
  return { ms, text: json.result?.content?.[0]?.text || "" };
}

function firstOpId(body) {
  try {
    const j = JSON.parse(body);
    const r = (j.results || []).find((x) => x.kind === "operation" || x.id);
    return r?.id || null;
  } catch {
    return null;
  }
}

/**
 * @param {"memory"|"sqlite_loaddb"} mode
 */
async function measureMode(mode, { home, specPath, catalogPath, mockPort, defaultOp }) {
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
    CLAWQL_SEARCH_COMPACT: "0",
  };
  if (mode === "memory") {
    env.CLAWQL_CATALOG_SQLITE = "0";
  } else if (mode === "sqlite_loaddb") {
    env.CLAWQL_CATALOG_SQLITE = "1";
    env.CLAWQL_CATALOG_SQLITE_PATH = catalogPath;
    env.CLAWQL_CATALOG_SQLITE_LOAD = "db";
    delete env.CLAWQL_SPEC_PATH;
    delete env.OPENAPI_SPEC_PATH;
    delete env.OPENAPI_FILE;
  }

  const child = spawn("taskset", ["-c", "2,3", BUN, "--smol", join(ROOT, "dist/server-http.js")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let log = "";
  child.stderr?.on("data", (c) => {
    log += c;
  });

  const samples = [];
  const turnMs = [];
  try {
    await waitTcp(port);
    await new Promise((r) => setTimeout(r, 500));
    const ready = smapsRollup(child.pid);
    samples.push({ at: "ready", flow: 0, ...ready });

    const sid = await openSession(port);
    let opId = defaultOp;
    if (!opId) {
      const s0 = await mcpCall(port, sid, 2, "search", { query: "list" });
      opId = firstOpId(s0.text);
      if (!opId) throw new Error("no operation from search");
    }

    for (let i = 0; i < WARMUP; i++) {
      await mcpCall(port, sid, 100 + i, "search", { query: opId });
      await mcpCall(port, sid, 200 + i, "execute", { operationId: opId, args: {} });
    }

    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      await mcpCall(port, sid, 10000 + i, "search", { query: opId });
      await mcpCall(port, sid, 20000 + i, "execute", { operationId: opId, args: {} });
      turnMs.push(performance.now() - t0);
      if (i % SAMPLE_EVERY === 0 || i === N - 1) {
        samples.push({ at: "load", flow: i + 1, ...smapsRollup(child.pid) });
      }
    }

    const hz = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
    const sorted = [...turnMs].sort((a, b) => a - b);
    const pct = (p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
    return {
      mode,
      op_id: opId,
      ready,
      under_load: summarizeSamples(samples.filter((s) => s.at === "load")),
      samples_n: samples.length,
      turn: {
        n: turnMs.length,
        p50_ms: Number(pct(50).toFixed(3)),
        p99_ms: Number(pct(99).toFixed(3)),
        p999_ms: Number(pct(99.9).toFixed(3)),
      },
      bench: hz.bench ?? null,
      log_tail: log.slice(-400),
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

const home = join(tmpdir(), `cat-sqlite-ul-${process.pid}`);
await mkdir(home, { recursive: true });
const mockPort = await pickPort();
const mock = createHttpServer((_q, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ items: [{ id: 1, name: "Ada", status: "ok" }] }));
});
await new Promise((r) => mock.listen(mockPort, "127.0.0.1", r));

const specPath = join(home, "spec.json");
let defaultOp = "listPets";
if (SPEC_KIND === "sentry") {
  if (!existsSync(SENTRY)) throw new Error(`missing ${SENTRY}`);
  await copyFile(SENTRY, specPath);
  defaultOp = null; // discover
} else {
  await writeFile(
    specPath,
    JSON.stringify(buildEqualSpec(`http://127.0.0.1:${mockPort}`), null, 2)
  );
}
const catalogPath = join(home, "catalog.sqlite");
console.error(`[underload] compile ${SPEC_KIND}…`);
await runCompile(specPath, catalogPath);

console.error(`[underload] N=${N} warmup=${WARMUP} spec=${SPEC_KIND}`);
const memory = await measureMode("memory", {
  home,
  specPath,
  catalogPath,
  mockPort,
  defaultOp,
});
console.error(
  `[underload] memory ready=${memory.ready?.rss_mb} under_med=${memory.under_load?.rss_mb?.median}`
);
const loaddb = await measureMode("sqlite_loaddb", {
  home,
  specPath,
  catalogPath,
  mockPort,
  defaultOp,
});
console.error(
  `[underload] loaddb ready=${loaddb.ready?.rss_mb} under_med=${loaddb.under_load?.rss_mb?.median}`
);
mock.close();

const d = (a, b) => (a != null && b != null ? Number((b - a).toFixed(2)) : null);
const out = {
  measuredAt: new Date().toISOString(),
  n: N,
  warmup: WARMUP,
  sample_every: SAMPLE_EVERY,
  spec: SPEC_KIND,
  spec_bytes: statSync(specPath).size,
  catalog_sqlite_bytes: statSync(catalogPath).size,
  memory,
  sqlite_loaddb: loaddb,
  delta_loaddb_minus_memory_mb: {
    ready_rss: d(memory.ready?.rss_mb, loaddb.ready?.rss_mb),
    ready_anon: d(memory.ready?.anonymous_mb, loaddb.ready?.anonymous_mb),
    under_rss_median: d(
      memory.under_load?.rss_mb?.median,
      loaddb.under_load?.rss_mb?.median
    ),
    under_anon_median: d(
      memory.under_load?.anonymous_mb?.median,
      loaddb.under_load?.anonymous_mb?.median
    ),
    under_pss_median: d(
      memory.under_load?.pss_mb?.median,
      loaddb.under_load?.pss_mb?.median
    ),
  },
  interpretation:
    "Negative under_* deltas = SQLite helps under load. Compare to MCPJungle ~152 MB only after a same-catalog peer run — this file is ClawQL memory vs LOAD=db only.",
};

await mkdir("/opt/cursor/artifacts", { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
