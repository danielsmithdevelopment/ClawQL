#!/usr/bin/env node
/**
 * CI memory gate: short sustained known-op run on Bun --smol JSON Streamable HTTP.
 * Fails if Anonymous keeps climbing (slope) or exceeds a hard ceiling.
 *
 * Self-contained on main: minimal petstore OpenAPI + inline mock upstream.
 * Exercises the same JSON-response `_streamMapping` path that climbed under
 * Cloudflare multiturn / week-1 boards.
 *
 * Env:
 *   MEM_GATE_ITERS   — execute calls (default 2000)
 *   MEM_GATE_MAX_MB  — hard anon ceiling (default 550; tip lean floor is higher than Oct-15 ~130)
 *   MEM_GATE_SLOPE   — fail if (last-baseline)/baseline > this (default 0.35)
 *   MEM_GATE_WARMUP_FRAC — fraction of samples skipped before slope baseline (default 0.2)
 *   MEM_GATE_OUT     — summary JSON path
 *
 * Slope uses a post-warmup baseline so cold-start RSS growth is not scored as a leak.
 * The `_streamMapping` orphan bug is also guarded by
 * `src/http/json-stream-mapping-bound.test.ts` (no long RSS run required).
 *
 * Requires dist/server-http.js (npm run build).
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  rmSync,
  copyFileSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { clawqlEqualArmEnv } from "../benchmarks/lib/clawql-bench-env.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const ITERS = Math.max(200, Number(process.env.MEM_GATE_ITERS || 2000));
const MAX_MB = Number(process.env.MEM_GATE_MAX_MB || 550);
const SLOPE = Number(process.env.MEM_GATE_SLOPE || 0.35);
const WARMUP_FRAC = Math.min(
  0.5,
  Math.max(0, Number(process.env.MEM_GATE_WARMUP_FRAC || 0.2))
);
const OUT = process.env.MEM_GATE_OUT || join(ROOT, "tmp/memory-plateau-gate.json");
const ACCEPT = "application/json, text/event-stream";
const SPEC_SRC = join(ROOT, "src/test-utils/fixtures/minimal-petstore.json");

async function pickPort() {
  return new Promise((resolvePort, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolvePort(port));
    });
    s.on("error", reject);
  });
}

function anonKb(pid) {
  try {
    const t = readFileSync(`/proc/${pid}/smaps_rollup`, "utf8");
    const m = t.match(/^Anonymous:\s+(\d+)\s+kB/m);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

async function parseRpc(resp) {
  const ct = resp.headers.get("content-type") || "";
  const text = await resp.text();
  if (ct.includes("text/event-stream") || text.startsWith("event:")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    const last = lines[lines.length - 1];
    if (!last) throw new Error(`empty SSE: ${text.slice(0, 200)}`);
    return JSON.parse(last.slice(5).trim());
  }
  return JSON.parse(text);
}

function startPetsMock() {
  const pets = [
    { id: 1, name: "Ada", status: "available" },
    { id: 2, name: "Grace", status: "available" },
  ];
  const server = createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/pets" || req.url?.startsWith("/pets?"))) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(pets));
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveListen({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

async function main() {
  const serverHttp = join(ROOT, "dist/server-http.js");
  if (!existsSync(serverHttp)) {
    console.error("missing dist/server-http.js — run npm run build first");
    process.exit(2);
  }
  if (!existsSync(SPEC_SRC)) {
    console.error(`missing petstore fixture: ${SPEC_SRC}`);
    process.exit(2);
  }

  const work = join(tmpdir(), `clawql-mem-gate-${process.pid}`);
  mkdirSync(work, { recursive: true });
  mkdirSync(dirname(OUT), { recursive: true });
  const spec = join(work, "minimal-petstore.json");
  copyFileSync(SPEC_SRC, spec);

  const mock = await startPetsMock();
  const bunPort = await pickPort();
  const home = join(work, "bun-home");
  mkdirSync(home, { recursive: true });
  const bunLog = join(work, "bun.log");
  const bunFd = openSync(bunLog, "w");
  const env = clawqlEqualArmEnv({
    home,
    specPath: spec,
    apiBase: mock.baseUrl,
    baseEnv: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
      LANG: process.env.LANG,
      NODE_ENV: "production",
      TMPDIR: process.env.TMPDIR,
    },
  });
  Object.assign(env, {
    PORT: String(bunPort),
    MCP_PORT: String(bunPort),
    MCP_HOST: "127.0.0.1",
    CLAWQL_HTTP_SKIP_PAYMENTS: "1",
    CLAWQL_HTTP_SKIP_GRAPHQL: "1",
    CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE: "1",
    CLAWQL_ENABLE_PROGRAMS: "0",
    CLAWQL_CATALOG_SQLITE: "0",
    // Bun CI images lack node:sqlite / `sqlite` — keep auth stores in-memory.
    CLAWQL_SECRET_STORE: "memory",
    CLAWQL_AUTH_AUDIT_STORE: "memory",
    // Keep idle off — reuse one session; prune must hold the plateau.
    CLAWQL_MCP_SESSION_IDLE_MS: "0",
  });

  const bunBin = process.env.BUN_BIN || "bun";
  const bun = spawn(bunBin, ["--smol", serverHttp], {
    env,
    cwd: ROOT,
    stdio: ["ignore", bunFd, bunFd],
  });
  const pid = bun.pid;
  const url = `http://127.0.0.1:${bunPort}/mcp`;

  const cleanup = () => {
    try {
      bun.kill("SIGTERM");
    } catch {
      /* */
    }
    try {
      void mock.close();
    } catch {
      /* */
    }
    try {
      rmSync(work, { recursive: true, force: true });
    } catch {
      /* */
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${bunPort}/healthz`);
      if (r.ok) break;
    } catch {
      /* */
    }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) {
      console.error("bun host failed to start");
      console.error(readFileSync(bunLog, "utf8").slice(-2000));
      process.exit(1);
    }
  }

  let sessionId = null;
  let protocolVersion = "2025-11-25";
  let id = 1;
  {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: ACCEPT },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: id++,
        method: "initialize",
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: "memory-plateau-gate", version: "0.1.0" },
        },
      }),
    });
    sessionId = resp.headers.get("mcp-session-id") || resp.headers.get("Mcp-Session-Id");
    const proto = resp.headers.get("mcp-protocol-version");
    if (proto) protocolVersion = proto;
    await parseRpc(resp);
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: ACCEPT,
        "mcp-protocol-version": protocolVersion,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
  }

  const samples = [];
  let errors = 0;
  const sampleEvery = Math.max(1, Math.floor(ITERS / 20));
  for (let i = 1; i <= ITERS; i++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: ACCEPT,
        "mcp-protocol-version": protocolVersion,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: id++,
        method: "tools/call",
        params: {
          name: "execute",
          arguments: {
            operationId: "listPets",
            args: {},
          },
        },
      }),
    });
    const data = await parseRpc(resp);
    if (data.error || data.result?.isError) errors += 1;
    if (i === 1 || i === ITERS || i % sampleEvery === 0) {
      const kb = anonKb(pid);
      if (kb != null) samples.push({ i, anon_kb: kb, anon_mb: +(kb / 1024).toFixed(2) });
    }
  }

  const first = samples[0]?.anon_kb ?? null;
  const last = samples[samples.length - 1]?.anon_kb ?? null;
  // Score climb from a post-warmup baseline (cold start / JIT / caches are not the leak).
  const warmIdx = Math.min(
    samples.length - 2,
    Math.max(0, Math.floor(samples.length * WARMUP_FRAC))
  );
  const baseline = samples[warmIdx]?.anon_kb ?? first;
  const drift = baseline != null && last != null ? last - baseline : null;
  const slope = baseline != null && baseline > 0 && drift != null ? drift / baseline : null;
  const lastMb = last != null ? last / 1024 : null;
  const climbing = slope != null && slope > SLOPE;
  const overCap = lastMb != null && lastMb > MAX_MB;
  const pass = !climbing && !overCap && errors === 0 && samples.length >= 5;

  const summary = {
    gate: "memory-plateau",
    fixture: "minimal-petstore",
    iters: ITERS,
    errors,
    samples,
    first_mb: first != null ? +(first / 1024).toFixed(2) : null,
    baseline_mb: baseline != null ? +(baseline / 1024).toFixed(2) : null,
    baseline_i: samples[warmIdx]?.i ?? null,
    last_mb: lastMb != null ? +lastMb.toFixed(2) : null,
    drift_mb: drift != null ? +(drift / 1024).toFixed(2) : null,
    slope,
    slope_limit: SLOPE,
    warmup_frac: WARMUP_FRAC,
    max_mb: MAX_MB,
    climbing,
    overCap,
    pass,
    note: climbing
      ? "Anonymous climbed past slope limit after warmup — likely retention/leak (JSON _streamMapping or other)"
      : overCap
        ? `Anonymous exceeded hard ceiling ${MAX_MB} MB`
        : "Anonymous held within post-warmup slope + ceiling",
  };
  writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  cleanup();
  if (!pass) {
    console.error(
      `memory-plateau-gate FAIL: last=${summary.last_mb}MB slope=${slope?.toFixed?.(3)} climbing=${climbing} overCap=${overCap} errors=${errors}`
    );
    process.exit(1);
  }
  console.error(
    `memory-plateau-gate OK: ${summary.first_mb}→${summary.last_mb} MB (slope=${slope?.toFixed?.(3)})`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
