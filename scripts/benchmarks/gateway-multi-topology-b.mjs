#!/usr/bin/env node
/**
 * Topology B — equal-arm scale-out: K HTTP replicas behind a sticky Node LB.
 *
 * Arms (default): clawql HTTP, mcpjungle, agentgateway — each K=4 behind its own VIP.
 * Do NOT mix with Topology A (single-instance) or ClawQL NATS sticky fabric ceilings.
 *
 * Usage:
 *   MULTI_CHAOS_UNTIL_BREAK=1 MULTI_CHAOS_HARD_MAX=512 \
 *     node scripts/benchmarks/gateway-multi-topology-b.mjs
 *
 * Env:
 *   MULTI_B_ARMS=clawql,mcpjungle,agentgateway[,executor]
 *   MULTI_B_REPLICAS=4
 *   MULTI_CHAOS_* (same semantics as gateway-multi-comparison)
 *   MULTI_B_OUT=gateway-multi-cmp-chaos-topology-b.json
 *   MULTI_B_MERGE=1 — merge arms into existing OUT (keeps prior measured arms)
 *   MCPJUNGLE_BIN  AGENTGATEWAY_BIN
 *   EXECUTOR_BIN (default /tmp/executor-v2/node_modules/.bin/executor)
 *   EXECUTOR_API_KEY + EXECUTOR_ENCRYPTION_KEY — shared across replicas (headless);
 *     if unset, harness generates ephemeral keys for the run (not written to artifact)
 *   MULTI_B_SMOKE=1 — one connect+call per arm then exit (no chaos)
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, openSync, closeSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { clawqlEqualArmEnv } from "./lib/clawql-bench-env.mjs";
import { startStickyHttpLb, createStickyFetch } from "./lib/sticky-http-lb.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIB = join(ROOT, "scripts", "benchmarks", "lib");
const PETS_MCP = join(LIB, "equal-arm-pets-mcp.mjs");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "gateway-multi-comparison");
const OUT_NAME = (process.env.MULTI_B_OUT ?? "gateway-multi-cmp-chaos-topology-b.json").replace(
  /[^a-zA-Z0-9._-]/g,
  ""
);
const OUT_PATH = join(OUT_DIR, OUT_NAME || "gateway-multi-cmp-chaos-topology-b.json");

const REPLICAS = Math.max(2, Number(process.env.MULTI_B_REPLICAS ?? 4) || 4);
const ARMS = (process.env.MULTI_B_ARMS ?? "clawql,mcpjungle,agentgateway")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SMOKE =
  process.env.MULTI_B_SMOKE === "1" || process.env.MULTI_B_SMOKE === "true";
const MERGE =
  process.env.MULTI_B_MERGE === "1" || process.env.MULTI_B_MERGE === "true";
const EQUAL_UPSTREAM = process.env.MULTI_EQUAL_UPSTREAM !== "0";

const EXECUTOR_STATIC_CODE = `return ${JSON.stringify({
  pets: [
    { id: 1, name: "Ada", status: "available" },
    { id: 2, name: "Grace", status: "available" },
  ],
})};`;

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
const CHAOS_UNTIL_BREAK =
  process.env.MULTI_CHAOS_UNTIL_BREAK === "1" ||
  process.env.MULTI_CHAOS_UNTIL_BREAK === "true";
const CHAOS_HARD_MAX = Math.max(
  CHAOS_MAX,
  Number(process.env.MULTI_CHAOS_HARD_MAX ?? 1024) || 1024
);

const TOPOLOGY = {
  id: "B_scaleout_lb",
  label: `${REPLICAS}× HTTP replicas behind sticky Node LB (cookie ${"clawql_bench_sticky"})`,
  replicas: REPLICAS,
  lb: "sticky-http-lb (scripts/benchmarks/lib/sticky-http-lb.mjs)",
  sticky: "cookie clawql_bench_sticky + optional x-bench-sticky",
  note: "Equal-arm scale-out. Do not mix with Topology A single-instance or ClawQL NATS fabric sticky.",
};

const EQUAL_PAYLOAD = {
  pets: [
    { id: 1, name: "Ada", status: "available" },
    { id: 2, name: "Grace", status: "available" },
  ],
};

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

function toolText(res) {
  if (!res) return "";
  if (typeof res === "string") return res;
  const parts = res.content?.map((c) => (c.type === "text" ? c.text : JSON.stringify(c))) ?? [];
  return parts.join("\n");
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

function resolveBin(envKey, candidates) {
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

function processTreePids(rootPid) {
  const out = [rootPid];
  try {
    const children = readFileSync(`/proc/${rootPid}/task/${rootPid}/children`, "utf8")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
    for (const c of children) out.push(...processTreePids(c));
  } catch {
    /* ignore */
  }
  return out;
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
  sleep(80).then(() => {
    for (const p of processTreePids(pid).reverse()) {
      try {
        process.kill(p, "SIGKILL");
      } catch {
        /* ignore */
      }
    }
  });
}

async function waitHttpOk(url, { timeoutMs = 60_000 } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url);
      // Streamable HTTP /mcp often rejects bare GET with 400/405/406 — still "up".
      if (
        res.ok ||
        res.status === 400 ||
        res.status === 401 ||
        res.status === 405 ||
        res.status === 406
      )
        return;
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

async function startMockHttp() {
  const body = JSON.stringify(EQUAL_PAYLOAD);
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const specPath = join("/tmp", `multi-b-spec-${process.pid}.json`);
  await writeFile(
    specPath,
    JSON.stringify(
      {
        openapi: "3.0.3",
        info: { title: "MultiGwEqualB", version: "1" },
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

async function connectHttpMcpSticky(url, name = "multi-b", authHeaders = null) {
  const stickyId = `${name}-${Math.random().toString(36).slice(2, 10)}`;
  const fetchImpl = createStickyFetch(stickyId, authHeaders);
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    fetch: fetchImpl,
  });
  const client = new Client({ name, version: "1" }, {});
  await client.connect(transport);
  return {
    client,
    transport,
    stickyId,
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

/* -------------------- replica starters -------------------- */

async function startClawqlReplica(port, home, mock) {
  await mkdir(home, { recursive: true });
  const env = {
    ...clawqlEqualArmEnv({ home, specPath: mock.specPath, apiBase: mock.baseUrl }),
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
    const timer = setTimeout(() => reject(new Error(`clawql http :${port} timeout`)), 90_000);
    const onData = (chunk) => {
      if (String(chunk).includes("listening on")) {
        clearTimeout(timer);
        resolve(undefined);
      }
    };
    child.stderr?.on("data", onData);
    child.stdout?.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`clawql http exited ${code}`));
    });
  });
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    pid: child.pid,
    close: async () => killTree(child.pid),
  };
}

async function startMcpjungleReplica(work, port, mockBase) {
  const bin = resolveBin("MCPJUNGLE_BIN", [
    "/tmp/gw-bins/mcpjungle",
    join(ROOT, "tmp/gw-bins/mcpjungle"),
  ]);
  if (!bin) throw new Error("mcpjungle binary not found (set MCPJUNGLE_BIN)");
  await mkdir(work, { recursive: true });
  const dbPath = join(work, "mcpjungle.db");
  const confPath = join(work, "pets-stdio.json");
  const upstreamEnv =
    EQUAL_UPSTREAM && mockBase ? { EQUAL_ARM_UPSTREAM: mockBase } : {};
  await writeFile(
    confPath,
    JSON.stringify(
      {
        name: "pets",
        transport: "stdio",
        description: "equal-arm pets MCP",
        command: process.execPath,
        args: [PETS_MCP],
        session_mode: "stateful",
        env: upstreamEnv,
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
    {
      cwd: work,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env },
    }
  );
  const registry = `http://127.0.0.1:${port}`;
  await waitHttpOk(`${registry}/`, { timeoutMs: 60_000 });
  const reg = spawnSync(
    bin,
    ["register", "-c", confPath, "--registry", registry, "--force"],
    { encoding: "utf8", cwd: work }
  );
  if (reg.status !== 0) {
    const log = existsSync(logPath) ? readFileSync(logPath, "utf8").slice(-2000) : "";
    throw new Error(`mcpjungle register failed: ${reg.stderr || reg.stdout}\n${log}`);
  }
  return {
    port,
    baseUrl: registry,
    pid: child.pid,
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

async function startAgentgatewayReplica(work, port, mockBase) {
  const bin = resolveBin("AGENTGATEWAY_BIN", [
    "/tmp/gw-bins/agentgateway",
    join(ROOT, "tmp/gw-bins/agentgateway"),
  ]);
  if (!bin) throw new Error("agentgateway binary not found (set AGENTGATEWAY_BIN)");
  await mkdir(work, { recursive: true });
  // Defaults 15000/15021/15020 collide across replicas — pick unique admin/ready/stats.
  const adminPort = await pickFreePort();
  const readyPort = await pickFreePort();
  const statsPort = await pickFreePort();
  const cfgPath = join(work, "config.yaml");
  const bashCmd = mockBase
    ? `EQUAL_ARM_UPSTREAM=${JSON.stringify(mockBase)} exec ${JSON.stringify(process.execPath)} ${JSON.stringify(PETS_MCP)}`
    : `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(PETS_MCP)}`;
  await writeFile(
    cfgPath,
    `# yaml-language-server: $schema=https://agentgateway.dev/schema/config
config:
  adminAddr: "127.0.0.1:${adminPort}"
  readinessAddr: "127.0.0.1:${readyPort}"
  statsAddr: "127.0.0.1:${statsPort}"
mcp:
  port: ${port}
  targets:
  - name: pets
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
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    pid: child.pid,
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

async function discoverListPetsTool(mcpUrl) {
  const probe = await connectHttpMcpSticky(mcpUrl, "topo-b-probe");
  try {
    const tools = await probe.client.listTools();
    const hit =
      tools.tools.find((t) => t.name.includes("list_pets") || t.name.includes("listPets")) ||
      tools.tools.find((t) => /list.?pet/i.test(t.name)) ||
      tools.tools[0];
    return hit?.name ?? null;
  } finally {
    await probe.close();
  }
}

async function discoverClawqlExecute(mcpUrl) {
  const probe = await connectHttpMcpSticky(mcpUrl, "topo-b-clawql-probe");
  try {
    const tools = await probe.client.listTools();
    const hit =
      tools.tools.find((t) => t.name === "execute") ||
      tools.tools.find((t) => t.name.includes("execute"));
    return hit?.name ?? "execute";
  } finally {
    await probe.close();
  }
}

/* -------------------- chaos -------------------- */

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
  const broken =
    errorRate > BREAK_ERROR_RATE || (lat.p99_ms != null && lat.p99_ms > BREAK_P99_MS);
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
  const powerMax = CHAOS_UNTIL_BREAK ? CHAOS_HARD_MAX : CHAOS_MAX;
  for (let n = 1; n <= powerMax; n *= 2) {
    console.log(`[topo-b] chaos ${armHooks.id} clients=${n}`);
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
    if (!CHAOS_UNTIL_BREAK && n >= CHAOS_MAX) break;
  }
  let refine = null;
  let incomplete = false;
  if (REFINE && firstBreak != null && firstBreak - lastOk > REFINE_TOL) {
    let lo = lastOk;
    let hi = firstBreak;
    const refineSteps = [];
    console.log(`[topo-b] chaos refine ${armHooks.id} lo=${lo} hi=${hi}`);
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
    incomplete = true;
  }
  return {
    topology: TOPOLOGY,
    slo: { break_p99_ms: BREAK_P99_MS, break_error_rate: BREAK_ERROR_RATE, step_ms: CHAOS_STEP_MS },
    until_break: CHAOS_UNTIL_BREAK,
    chaos_max: CHAOS_MAX,
    chaos_hard_max: CHAOS_HARD_MAX,
    steps,
    refine,
    last_ok_clients: lastOk,
    first_break_clients: firstBreak,
    break_reason: breakReason,
    incomplete_no_break: incomplete,
    honesty: incomplete
      ? `No break at ≤${lastOk} clients — concurrency claim incomplete until arm breaks.`
      : "Broke within topology B — comparable only to other B (same LB + replica count) ceilings.",
  };
}

/* -------------------- arm pools -------------------- */

async function buildClawqlArm(mock) {
  const replicas = [];
  const baseHome = join("/tmp", `topo-b-clawql-${process.pid}`);
  await rm(baseHome, { recursive: true, force: true });
  for (let i = 0; i < REPLICAS; i++) {
    const port = await pickFreePort();
    const home = join(baseHome, `r${i}`);
    console.log(`[topo-b] start clawql replica ${i + 1}/${REPLICAS} :${port}`);
    replicas.push(await startClawqlReplica(port, home, mock));
  }
  const lb = await startStickyHttpLb({
    backends: replicas.map((r) => r.baseUrl),
  });
  await waitHttpOk(lb.mcpUrl, { timeoutMs: 30_000 });
  const toolName = await discoverClawqlExecute(lb.mcpUrl);
  const call = async (client) => {
    const res = await client.callTool({
      name: toolName,
      arguments: { operationId: "listPets", args: {}, fields: ["pets"] },
    });
    if (res.isError) throw new Error(toolText(res));
    return toolText(res);
  };
  return {
    id: "clawql",
    model: `streamable_http_${REPLICAS}x_behind_sticky_lb`,
    mcpUrl: lb.mcpUrl,
    replicas: replicas.map((r) => ({ port: r.port, pid: r.pid })),
    lb: { baseUrl: lb.baseUrl, sticky: lb.sticky },
    toolName,
    connect: () => connectHttpMcpSticky(lb.mcpUrl, "topo-b-clawql"),
    call,
    close: async () => {
      await lb.close().catch(() => {});
      for (const r of replicas) await r.close().catch(() => {});
      await rm(baseHome, { recursive: true, force: true }).catch(() => {});
    },
    lbStats: () => lb.stats(),
  };
}

async function buildMcpjungleArm(mock) {
  const replicas = [];
  const baseWork = join("/tmp", `topo-b-mj-${process.pid}`);
  await rm(baseWork, { recursive: true, force: true });
  for (let i = 0; i < REPLICAS; i++) {
    const port = await pickFreePort();
    const work = join(baseWork, `r${i}`);
    console.log(`[topo-b] start mcpjungle replica ${i + 1}/${REPLICAS} :${port}`);
    replicas.push(await startMcpjungleReplica(work, port, mock.baseUrl));
  }
  const lb = await startStickyHttpLb({
    backends: replicas.map((r) => r.baseUrl),
  });
  await waitHttpOk(`${lb.baseUrl}/`, { timeoutMs: 30_000 });
  const toolName = (await discoverListPetsTool(lb.mcpUrl)) || "pets__list_pets";
  const call = async (client) => {
    const res = await client.callTool({ name: toolName, arguments: {} });
    if (res.isError) throw new Error(toolText(res));
    return toolText(res);
  };
  const bin = resolveBin("MCPJUNGLE_BIN", ["/tmp/gw-bins/mcpjungle"]);
  const ver = bin
    ? spawnSync(bin, ["version"], { encoding: "utf8" }).stdout?.trim() || null
    : null;
  return {
    id: "mcpjungle",
    model: `streamable_http_${REPLICAS}x_behind_sticky_lb`,
    version: ver,
    mcpUrl: lb.mcpUrl,
    replicas: replicas.map((r) => ({ port: r.port, pid: r.pid })),
    lb: { baseUrl: lb.baseUrl, sticky: lb.sticky },
    toolName,
    connect: () => connectHttpMcpSticky(lb.mcpUrl, "topo-b-mj"),
    call,
    close: async () => {
      await lb.close().catch(() => {});
      for (const r of replicas) await r.close().catch(() => {});
      await rm(baseWork, { recursive: true, force: true }).catch(() => {});
    },
    lbStats: () => lb.stats(),
  };
}

async function buildAgentgatewayArm(mock) {
  const replicas = [];
  const baseWork = join("/tmp", `topo-b-ag-${process.pid}`);
  await rm(baseWork, { recursive: true, force: true });
  for (let i = 0; i < REPLICAS; i++) {
    const port = await pickFreePort();
    const work = join(baseWork, `r${i}`);
    console.log(`[topo-b] start agentgateway replica ${i + 1}/${REPLICAS} :${port}`);
    replicas.push(await startAgentgatewayReplica(work, port, mock.baseUrl));
  }
  const lb = await startStickyHttpLb({
    backends: replicas.map((r) => r.baseUrl),
  });
  await waitHttpOk(lb.mcpUrl, { timeoutMs: 30_000 });
  const toolName = (await discoverListPetsTool(lb.mcpUrl)) || "pets_list_pets";
  const call = async (client) => {
    const res = await client.callTool({ name: toolName, arguments: {} });
    if (res.isError) throw new Error(toolText(res));
    return toolText(res);
  };
  const bin = resolveBin("AGENTGATEWAY_BIN", ["/tmp/gw-bins/agentgateway"]);
  const ver = bin
    ? (spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout ||
        spawnSync(bin, ["--version"], { encoding: "utf8" }).stderr ||
        "")
        .trim() || null
    : null;
  return {
    id: "agentgateway",
    model: `streamable_http_${REPLICAS}x_behind_sticky_lb`,
    version: ver,
    mcpUrl: lb.mcpUrl,
    replicas: replicas.map((r) => ({ port: r.port, pid: r.pid })),
    lb: { baseUrl: lb.baseUrl, sticky: lb.sticky },
    toolName,
    connect: () => connectHttpMcpSticky(lb.mcpUrl, "topo-b-ag"),
    call,
    close: async () => {
      await lb.close().catch(() => {});
      for (const r of replicas) await r.close().catch(() => {});
      await rm(baseWork, { recursive: true, force: true }).catch(() => {});
    },
    lbStats: () => lb.stats(),
  };
}

async function startExecutorReplica(work, port, apiKey, encryptionKey) {
  const bin = resolveBin("EXECUTOR_BIN", [
    "/tmp/executor-v2/node_modules/.bin/executor",
    join(ROOT, "tmp/executor-v2/node_modules/.bin/executor"),
  ]);
  if (!bin) throw new Error("EXECUTOR_BIN not found");
  await mkdir(work, { recursive: true });
  const logPath = join(work, "serve.log");
  const logFd = openSync(logPath, "w");
  const child = spawn(bin, ["serve", "--log-level", "warn"], {
    cwd: work,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      EXECUTOR_DATA_DIR: work,
      EXECUTOR_PORT: String(port),
      EXECUTOR_API_KEY: apiKey,
      EXECUTOR_ENCRYPTION_KEY: encryptionKey,
    },
  });
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  const close = async () => {
    killTree(child.pid);
    try {
      closeSync(logFd);
    } catch {
      /* ignore */
    }
  };
  try {
    // Cold start under a busy host can exceed 90s (workerd + motel).
    const timeoutMs = Math.max(
      180_000,
      Number(process.env.MULTI_B_EXECUTOR_READY_MS ?? 180_000) || 180_000
    );
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < timeoutMs) {
      if (child.exitCode != null) {
        const log = existsSync(logPath) ? readFileSync(logPath, "utf8").slice(-2000) : "";
        throw new Error(`executor exited ${child.exitCode}\n${log}`);
      }
      try {
        const res = await fetch(mcpUrl, { signal: AbortSignal.timeout(2000) });
        if (
          res.ok ||
          res.status === 400 ||
          res.status === 401 ||
          res.status === 405 ||
          res.status === 406
        ) {
          return {
            port,
            baseUrl: `http://127.0.0.1:${port}`,
            pid: child.pid,
            close,
          };
        }
        last = `${res.status}`;
      } catch (e) {
        last = String(e?.message ?? e);
      }
      await sleep(500);
    }
    throw new Error(`timeout waiting for ${mcpUrl}: ${last}`);
  } catch (e) {
    await close().catch(() => {});
    throw e;
  }
}

function resolveExecutorAuth() {
  let apiKey = process.env.EXECUTOR_API_KEY?.trim() || "";
  let encryptionKey = process.env.EXECUTOR_ENCRYPTION_KEY?.trim() || "";
  if (!apiKey || !encryptionKey) {
    // Ephemeral headless keys for this board run — not persisted in artifacts.
    apiKey = apiKey || `topo-b-${randomBytes(24).toString("hex")}`;
    encryptionKey = encryptionKey || randomBytes(32).toString("hex");
    console.log(
      "[topo-b] generated ephemeral EXECUTOR_API_KEY + EXECUTOR_ENCRYPTION_KEY for this run"
    );
  }
  if (apiKey.length < 32) throw new Error("EXECUTOR_API_KEY must be ≥32 chars");
  if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    throw new Error("EXECUTOR_ENCRYPTION_KEY must be 64 hex chars");
  }
  return { apiKey, encryptionKey };
}

async function buildExecutorArm(_mock) {
  const { apiKey, encryptionKey } = resolveExecutorAuth();
  const authHeaders = { Authorization: `Bearer ${apiKey}` };
  const replicas = [];
  const baseWork = join("/tmp", `topo-b-ex-${process.pid}`);
  await rm(baseWork, { recursive: true, force: true });
  for (let i = 0; i < REPLICAS; i++) {
    const port = await pickFreePort();
    const work = join(baseWork, `r${i}`);
    console.log(`[topo-b] start executor replica ${i + 1}/${REPLICAS} :${port}`);
    replicas.push(await startExecutorReplica(work, port, apiKey, encryptionKey));
  }
  const lb = await startStickyHttpLb({
    backends: replicas.map((r) => r.baseUrl),
  });
  await waitHttpOk(lb.mcpUrl, { timeoutMs: 30_000 });
  // Probe through VIP with auth
  const probe = await connectHttpMcpSticky(lb.mcpUrl, "topo-b-ex-probe", authHeaders);
  let toolName = "execute";
  try {
    const tools = await probe.client.listTools();
    const hit = tools.tools.find((t) => t.name === "execute") || tools.tools[0];
    toolName = hit?.name ?? "execute";
  } finally {
    await probe.close();
  }
  const call = async (client) => {
    const res = await client.callTool({
      name: toolName,
      arguments: { code: EXECUTOR_STATIC_CODE, timeoutMs: 30_000 },
    });
    if (res.isError) throw new Error(toolText(res));
    return toolText(res);
  };
  const bin = resolveBin("EXECUTOR_BIN", ["/tmp/executor-v2/node_modules/.bin/executor"]);
  const ver = bin
    ? spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout?.trim() || null
    : null;
  return {
    id: "executor",
    model: `streamable_http_${REPLICAS}x_behind_sticky_lb_static_upstream0`,
    version: ver,
    mcpUrl: lb.mcpUrl,
    replicas: replicas.map((r) => ({ port: r.port, pid: r.pid })),
    lb: { baseUrl: lb.baseUrl, sticky: lb.sticky },
    toolName,
    connect: () => connectHttpMcpSticky(lb.mcpUrl, "topo-b-ex", authHeaders),
    call,
    close: async () => {
      await lb.close().catch(() => {});
      for (const r of replicas) await r.close().catch(() => {});
      await rm(baseWork, { recursive: true, force: true }).catch(() => {});
    },
    lbStats: () => lb.stats(),
  };
}

async function buildArm(id, mock) {
  if (id === "clawql") return buildClawqlArm(mock);
  if (id === "mcpjungle") return buildMcpjungleArm(mock);
  if (id === "agentgateway") return buildAgentgatewayArm(mock);
  if (id === "executor") return buildExecutorArm(mock);
  throw new Error(`unknown Topology B arm: ${id}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(join(ROOT, "dist", "server-http.js"))) {
    throw new Error("dist/server-http.js missing — run npm run build first");
  }
  const mock = await startMockHttp();
  globalThis.__MULTI_MOCK_BASE__ = mock.baseUrl;
  let prior = null;
  if (MERGE && existsSync(OUT_PATH)) {
    try {
      prior = JSON.parse(readFileSync(OUT_PATH, "utf8"));
      console.log(
        `[topo-b] merge into existing ${OUT_NAME} arms=${Object.keys(prior.arms || {}).join(",")}`
      );
    } catch (e) {
      console.warn(`[topo-b] MULTI_B_MERGE set but could not parse ${OUT_PATH}: ${e.message}`);
    }
  }
  const results = {
    measuredAt: new Date().toISOString(),
    topology: TOPOLOGY,
    host: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      pid: process.pid,
    },
    replicas: REPLICAS,
    arms: prior?.arms && typeof prior.arms === "object" ? { ...prior.arms } : {},
    smoke_only: SMOKE,
    merge: MERGE
      ? {
          prior_measured_at: prior?.measuredAt ?? null,
          merged_arms: ARMS.slice(),
        }
      : null,
  };
  const closers = [() => mock.close()];
  try {
    for (const armId of ARMS) {
      console.log(`[topo-b] === arm ${armId} ===`);
      const arm = await buildArm(armId, mock);
      closers.push(() => arm.close());
      try {
        if (SMOKE) {
          const c = await arm.connect();
          try {
            const text = await arm.call(c.client);
            results.arms[armId] = {
              id: armId,
              ok: true,
              smoke: true,
              mcp_url: arm.mcpUrl,
              tool_name: arm.toolName,
              result_preview: String(text).slice(0, 200),
              replicas: arm.replicas,
              lb: arm.lb,
              lb_stats: arm.lbStats?.() ?? null,
              version: arm.version ?? null,
              model: arm.model,
            };
            console.log(`[topo-b] smoke ${armId} ok tool=${arm.toolName}`);
          } finally {
            await c.close().catch(() => {});
          }
        } else {
          const chaos = await chaosWithRefine({
            id: armId,
            connect: arm.connect,
            call: arm.call,
          });
          results.arms[armId] = {
            id: armId,
            ok: true,
            mcp_url: arm.mcpUrl,
            tool_name: arm.toolName,
            replicas: arm.replicas,
            lb: arm.lb,
            lb_stats: arm.lbStats?.() ?? null,
            version: arm.version ?? null,
            model: arm.model,
            chaos,
          };
          console.log(
            `[topo-b] ${armId} last_ok=${chaos.last_ok_clients} first_break=${chaos.first_break_clients} (${chaos.break_reason})`
          );
        }
      } finally {
        await arm.close().catch(() => {});
        closers.pop();
      }
    }
  } finally {
    for (const c of closers.reverse()) await c().catch(() => {});
  }

  results.honesty = [
    "Topology B = K HTTP replicas behind sticky Node LB for every arm on this board.",
    "Do not compare to Topology A single-instance ceilings or ClawQL NATS fabric sticky (135).",
    "Claim scale-out only when every listed arm has broken under the same replica count + LB sticky.",
  ];
  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
  console.log(`[topo-b] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("[topo-b] fatal:", err);
  process.exit(1);
});
