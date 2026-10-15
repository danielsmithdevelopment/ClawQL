#!/usr/bin/env node
/**
 * Ready + short known-op load: report anonymous / JS heap / native-estimate separately.
 *
 *   node scripts/benchmarks/slim-listen-memory-probe.mjs
 *   SPEC=… ITERS=200 OUT=… node scripts/benchmarks/slim-listen-memory-probe.mjs
 *
 * Native estimate = smaps Anonymous − process.memoryUsage().heapUsed
 * (not perfect; captures non-V8 anon including wasm/native buffers / allocator arenas).
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  openSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { clawqlEqualArmEnv } from "./lib/clawql-bench-env.mjs";

const ROOT = "/workspace";
const OUT =
  process.env.OUT ||
  `/opt/cursor/artifacts/slim-listen-memory-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const ITERS = Number(process.env.ITERS || 80);
let SPEC = process.env.SPEC || "";

function pickPort() {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function waitTcp(port, ms = 30000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const c = createConnection({ host: "127.0.0.1", port }, () => {
        c.end();
        resolve(true);
      });
      c.on("error", () => resolve(false));
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
    return m ? Number((Number(m[1]) / 1024).toFixed(2)) : null;
  };
  return { rss_mb: get("Rss"), anonymous_mb: get("Anonymous"), pss_mb: get("Pss") };
}

function mapsHits(pid) {
  const maps = readFileSync(`/proc/${pid}/maps`, "utf8");
  return {
    kubernetes: /node_modules\/@kubernetes\//.test(maps),
    xenova: /node_modules\/@xenova\//.test(maps),
    onnx: /onnxruntime/.test(maps),
    stripe: /node_modules\/stripe\//.test(maps),
    duckdb: /@duckdb\//.test(maps),
  };
}

function ensureSpec() {
  if (SPEC && existsSync(SPEC)) return SPEC;
  const home = join(tmpdir(), `slim-mem-spec-${process.pid}`);
  mkdirSync(home, { recursive: true });
  const paths = {};
  for (let i = 1; i <= 60; i++) {
    paths[`/p${i}`] = {
      get: {
        operationId: `op${i}`,
        summary: `Op ${i}`,
        responses: { "200": { description: "ok" } },
      },
    };
  }
  SPEC = join(home, "spec.json");
  writeFileSync(
    SPEC,
    JSON.stringify({
      openapi: "3.0.0",
      info: { title: "slimMem", version: "1" },
      paths,
    })
  );
  return SPEC;
}

async function mcpInit(mcpUrl) {
  const res = await fetch(mcpUrl, {
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
        clientInfo: { name: "slim-mem", version: "0" },
      },
    }),
  });
  return res.headers.get("mcp-session-id");
}

async function mcpTool(mcpUrl, sid, name, args, id) {
  await fetch(mcpUrl, {
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
}

async function healthz(port) {
  const res = await fetch(`http://127.0.0.1:${port}/healthz`);
  return res.json();
}

function sample(pid, health) {
  const smaps = smapsRollup(pid);
  const heap = health?.bench?.heap_used_mb ?? null;
  const anon = smaps?.anonymous_mb ?? null;
  const native_est =
    anon != null && heap != null ? Number((anon - heap).toFixed(2)) : null;
  return {
    smaps,
    heap_used_mb: heap,
    external_mb:
      health?.bench?.rss_mb != null && heap != null
        ? null
        : null,
    process_rss_mb: health?.bench?.rss_mb ?? null,
    native_anon_minus_heap_mb: native_est,
    maps_hits: mapsHits(pid),
  };
}

async function main() {
  const spec = ensureSpec();
  const home = join(tmpdir(), `slim-mem-${process.pid}-${Date.now()}`);
  mkdirSync(home, { recursive: true });
  const port = await pickPort();
  const env = clawqlEqualArmEnv({
    home,
    specPath: spec,
    apiBase: "http://127.0.0.1:9",
  });
  Object.assign(env, {
    PORT: String(port),
    MCP_HOST: "127.0.0.1",
    CLAWQL_CATALOG_SQLITE: "1",
    CLAWQL_CATALOG_SQLITE_BUILD: "oop",
    CLAWQL_HTTP_SKIP_PAYMENTS: "1",
    CLAWQL_HTTP_SKIP_GRAPHQL: "1",
    CLAWQL_BENCH_STATS: "1",
    CLAWQL_SEARCH_COMPACT: "0",
  });
  const logPath = join(home, "clawql.log");
  const fd = openSync(logPath, "w");
  const child = spawn(process.execPath, [join(ROOT, "dist/server-http.js")], {
    env,
    stdio: ["ignore", fd, fd],
  });
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (existsSync(logPath) && readFileSync(logPath, "utf8").includes("listening on")) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await waitTcp(port);
  await new Promise((r) => setTimeout(r, 400));

  const readyHealth = await healthz(port);
  const atReady = sample(child.pid, readyHealth);

  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  const sid = await mcpInit(mcpUrl);
  for (let i = 0; i < ITERS; i++) {
    await mcpTool(
      mcpUrl,
      sid,
      "execute",
      { operationId: "op1", args: {}, where: "length(@)" },
      10 + i
    );
  }
  await new Promise((r) => setTimeout(r, 300));
  const loadHealth = await healthz(port);
  const underLoad = sample(child.pid, loadHealth);

  const report = {
    measuredAt: new Date().toISOString(),
    spec,
    iters: ITERS,
    known_op_model_on_path: false,
    note:
      "known-op execute is JMESPath where only — no GLiNER/ONNX/Decide. Native estimate = smaps Anonymous − V8 heapUsed.",
    at_ready: atReady,
    under_load: underLoad,
    log_tail: readFileSync(logPath, "utf8").trim().split("\n").slice(-14),
    target_band_mb: { anon_goal: "150–190 (smaller boards / underload LOAD=db)" },
  };
  mkdirSync(join(OUT, ".."), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  try {
    child.kill("SIGTERM");
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
  try {
    child.kill("SIGKILL");
  } catch {}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
