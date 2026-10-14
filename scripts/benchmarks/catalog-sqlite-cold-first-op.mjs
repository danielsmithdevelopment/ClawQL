/**
 * First-execute materialize cost per op (cold Proxy → gunzip+JSON), then warm p50.
 *
 *   OPS=40 node scripts/benchmarks/catalog-sqlite-cold-first-op.mjs
 *   SPEC=providers/sentry/openapi.json node scripts/benchmarks/catalog-sqlite-cold-first-op.mjs
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const ROOT = "/workspace";
const OUT = process.env.OUT || "/opt/cursor/artifacts/catalog-sqlite-cold-first-op.json";
const OPS = Math.max(4, Number(process.env.OPS || 40) || 40);
const MULTI_DOC = ["1", "true", "yes"].includes(
  (process.env.MULTI_DOC ?? "0").trim().toLowerCase()
);
const BUN = process.env.BUN_BIN || `${process.env.HOME}/.bun/bin/bun`;
const SPEC = process.env.SPEC ? resolve(ROOT, process.env.SPEC) : null;

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

function buildSpec(baseUrl, n) {
  const paths = {};
  for (let i = 1; i <= n; i++) {
    paths[`/p${i}`] = {
      get: {
        operationId: `op${i}`,
        summary: `Op ${i}`,
        description: `Cold-materialize probe op ${i}. `.repeat(8),
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
        ],
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
        },
      },
    };
  }
  return {
    openapi: "3.0.3",
    info: { title: "coldFirst", version: "1" },
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
        clientInfo: { name: "cold-first", version: "0" },
      },
    }),
  });
  const sid = init.headers.get("mcp-session-id");
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

async function exec(port, sid, id, operationId) {
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
      params: { name: "execute", arguments: { operationId, args: {} } },
    }),
  });
  const text = await res.text();
  const ms = performance.now() - t0;
  const json = JSON.parse(text);
  if (json.result?.isError) {
    throw new Error((json.result.content?.[0]?.text || "err").slice(0, 200));
  }
  return ms;
}

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
  return {
    n: s.length,
    p50_ms: Number(pct(50).toFixed(3)),
    p95_ms: Number(pct(95).toFixed(3)),
    p99_ms: Number(pct(99).toFixed(3)),
    max_ms: Number(s[s.length - 1].toFixed(3)),
    mean_ms: Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3)),
  };
}

const home = join(tmpdir(), `cold-first-${process.pid}`);
await mkdir(home, { recursive: true });
const mockPort = await pickPort();
const mock = createHttpServer((_q, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end("{}");
});
await new Promise((r) => mock.listen(mockPort, "127.0.0.1", r));

const specPath = join(home, "spec.json");
let opIds = [];
const catalogPath = join(home, "catalog.sqlite");
const api = await import(pathToFileURL(join(ROOT, "packages/clawql-api/dist/index.js")).href);

if (SPEC) {
  await copyFile(SPEC, specPath);
  await runCompile(specPath, catalogPath);
  const slim = api.loadCatalogSqliteSlim(catalogPath);
  opIds = slim.operations.map((o) => o.id).slice(0, Math.min(OPS, slim.operations.length));
} else if (MULTI_DOC) {
  // One OpenAPI doc per op → each first execute pays gunzip+JSON (worst-case cold).
  const ops = [];
  const docs = [];
  for (let i = 1; i <= OPS; i++) {
    const id = `op${i}`;
    ops.push({
      id,
      method: "GET",
      path: `/p${i}`,
      flatPath: `/p${i}`,
      description: `cold doc ${i}`,
      resource: "p",
      parameters: {},
      scopes: [],
      specIndex: i - 1,
    });
    docs.push(buildSpec(`http://127.0.0.1:${mockPort}`, 1));
    docs[docs.length - 1].info.title = `doc${i}`;
    docs[docs.length - 1].paths = {
      [`/p${i}`]: {
        get: {
          operationId: id,
          responses: { "200": { description: "ok" } },
        },
      },
    };
  }
  api.writeCatalogSqlite(catalogPath, { operations: ops, openapis: docs, multi: true });
  opIds = ops.map((o) => o.id);
  await writeFile(specPath, JSON.stringify(docs[0])); // placeholder for env
} else {
  await writeFile(specPath, JSON.stringify(buildSpec(`http://127.0.0.1:${mockPort}`, OPS)));
  opIds = Array.from({ length: OPS }, (_, i) => `op${i + 1}`);
  await runCompile(specPath, catalogPath);
}

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
  CLAWQL_CATALOG_SQLITE: "1",
  CLAWQL_CATALOG_SQLITE_PATH: catalogPath,
  CLAWQL_CATALOG_SQLITE_LOAD: "db",
};
delete env.CLAWQL_SPEC_PATH;

const child = spawn(BUN, ["--smol", join(ROOT, "dist/server-http.js")], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
try {
  await waitTcp(port);
  const sid = await openSession(port);
  const cold = [];
  for (let i = 0; i < opIds.length; i++) {
    cold.push(await exec(port, sid, 10 + i, opIds[i]));
  }
  // warm: repeat first 10 ops
  const warm = [];
  const warmOps = opIds.slice(0, Math.min(10, opIds.length));
  for (let r = 0; r < 20; r++) {
    for (const id of warmOps) {
      warm.push(await exec(port, sid, 1000 + r, id));
    }
  }
  const out = {
    measuredAt: new Date().toISOString(),
    spec: SPEC || (MULTI_DOC ? "synthetic-multi-doc" : "synthetic-one-doc"),
    multi_doc: MULTI_DOC || Boolean(SPEC && false),
    ops_measured: opIds.length,
    catalog_bytes: existsSync(catalogPath) ? statSync(catalogPath).size : null,
    cold_first_exec_per_op: stats(cold),
    warm_exec: stats(warm),
    note: MULTI_DOC
      ? "MULTI_DOC=1: one OAS gzip blob per op — cold p99 is true per-op materialize."
      : "Single OpenAPI doc: first execute pays gunzip once; later ops are warm for OAS (op-local work only).",
  };
  await mkdir("/opt/cursor/artifacts", { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
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
  mock.close();
}
