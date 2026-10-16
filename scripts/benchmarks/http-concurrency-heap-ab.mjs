#!/usr/bin/env node
/**
 * Same-session HTTP multiplex concurrency A/B (Cloud-shaped).
 *
 * Arms (one Streamable HTTP process each, N concurrent clients):
 *   - clawql_node_uncapped
 *   - clawql_node_256  (--max-old-space-size=256)
 *   - clawql_node_384  (--max-old-space-size=384) — Cloud Node capacity profile
 *   - clawql_bun_smol   (bun --smol)
 *   - mcpjungle        (HTTP gateway + cf-rest-mcp → mock)
 *   - agentgateway     (HTTP gateway + cf-rest-mcp → mock)
 *   - executor_v2      (existing Executor serve + OpenAPI app → mock; Bearer auth)
 *
 * SLO matches gateway-multi single-instance chaos: p99 ≤ 100 ms, error_rate ≤ 0.02.
 * Power-of-two ladder + binary refine. Does NOT claim vs stdio equal-arm 63/204.
 *
 *   node scripts/benchmarks/http-concurrency-heap-ab.mjs
 *   CONC_HARD_MAX=256 CONC_STEP_MS=3000 node scripts/benchmarks/http-concurrency-heap-ab.mjs
 *
 * Multi-threshold curves (publish p99@clients + clients@100/250/500 without picking one cutoff):
 *   CURVE=1 THRESHOLDS=100,250,500 CONC_STEP_MS=10000 REPS=3 \
 *     ARMS=clawql_bun_smol,clawql_node_256,mcpjungle,agentgateway,executor_v2 \
 *     OUT=…/http-concurrency-curves.json node scripts/benchmarks/http-concurrency-heap-ab.mjs
 *
 * CURVE mode climbs until p99 exceeds the loosest THRESHOLDS cutoff (or error_rate
 * breaks). CONC_HARD_MAX is only a loop guard (default 8192 when CURVE=1), not a
 * measured ceiling — do not "cap" arms to protect weaker peers. Host MemAvailable
 * abort is recorded as host_censored (observational). Partial JSON flushes after
 * each arm so a later peer OOM cannot erase completed rows.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  openSync,
  closeSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { clawqlEqualArmEnv } from "./lib/clawql-bench-env.mjs";
import {
  executorV2ApiKey,
  findExecutorV2ServeRootPid,
} from "./lib/find-executor-v2-pid.mjs";
import { FAKE } from "./cloudflare-multiturn/lib/fixture-ids.mjs";
import { ensureExecutorOpenapiApp } from "./cloudflare-multiturn/lib/ensure-executor-openapi-app.mjs";
import { executorV2ToolScripts } from "./cloudflare-multiturn/code-mode/published-scripts.mjs";

const ROOT = "/workspace";
const HERE = join(ROOT, "scripts/benchmarks/cloudflare-multiturn");
const CURATED = join(HERE, "fixtures/curated-openapi.json");
const MOCK_JS = join(HERE, "mock/cloudflare-replay-mock.mjs");
const FIXTURE = join(HERE, "fixtures/recording.synthetic.json");
const REST_MCP = join(HERE, "lib/cf-rest-mcp.mjs");
const MCPJUNGLE = process.env.MCPJUNGLE_BIN || "/tmp/gw-bins/mcpjungle";
const AGENTGATEWAY = process.env.AGENTGATEWAY_BIN || "/tmp/gw-bins/agentgateway";
const BUN_BIN = process.env.BUN_BIN || "bun";
const OP_ID = process.env.OP_ID || "dns-records-for-a-zone-list-dns-records";
const ZONE = FAKE.auditZoneId;

const BREAK_P99_MS = Math.max(1, Number(process.env.BREAK_P99_MS || 100) || 100);
const BREAK_ERROR_RATE = Math.min(
  1,
  Math.max(0, Number(process.env.BREAK_ERROR_RATE ?? 0.02) || 0.02)
);
const CONC_STEP_MS = Math.max(1000, Number(process.env.CONC_STEP_MS || 3000) || 3000);
const CONC_WARMUP = Math.max(0, Number(process.env.CONC_WARMUP || 4) || 4);
/** Repeat each arm N times (interleaved by arm order) for range/variance. */
const REPS = Math.max(1, Number(process.env.REPS || 1) || 1);
const AG_TUNED = ["1", "true", "yes"].includes((process.env.AG_TUNED ?? "").trim().toLowerCase());
/** Climb past the primary 100 ms break; publish clients@each threshold + p99 curve. */
const CURVE = ["1", "true", "yes"].includes((process.env.CURVE ?? "").trim().toLowerCase());
/**
 * Loop guard only — not a measured concurrency ceiling.
 * CURVE mode stops on p99 > curve_stop / error_rate / host_censored; this bound
 * exists solely to prevent an infinite ladder if those never fire.
 */
const CONC_HARD_MAX = Math.max(
  2,
  Number(process.env.CONC_HARD_MAX || (CURVE ? 8192 : 256)) || (CURVE ? 8192 : 256)
);
const THRESHOLDS = (
  process.env.THRESHOLDS || (CURVE ? "100,250,500" : String(BREAK_P99_MS))
)
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => a - b);
const CURVE_STOP_P99_MS = Math.max(BREAK_P99_MS, ...THRESHOLDS);
const OUT =
  process.env.OUT ||
  join(ROOT, "docs/benchmarks/cloudflare-multiturn/http-concurrency-heap-ab.json");

function stepOkAtThreshold(step, thresholdMs) {
  if (step.error_rate > BREAK_ERROR_RATE) return false;
  const p99 = step.latency_ms?.p99;
  if (p99 == null) return false;
  return p99 <= thresholdMs;
}

/** Last sustained / first break clients for one p99 threshold from recorded steps. */
function ceilingAtThreshold(allSteps, thresholdMs) {
  const sorted = [...allSteps].sort((a, b) => a.concurrency - b.concurrency);
  let lastOk = null;
  let firstBreak = null;
  let breakReason = null;
  for (const s of sorted) {
    if (stepOkAtThreshold(s, thresholdMs)) {
      lastOk = s.concurrency;
    } else if (firstBreak == null) {
      firstBreak = s.concurrency;
      const reasons = [];
      if (s.error_rate > BREAK_ERROR_RATE) reasons.push(`error_rate ${s.error_rate.toFixed(3)}`);
      if (s.latency_ms?.p99 != null && s.latency_ms.p99 > thresholdMs) {
        reasons.push(`p99 ${s.latency_ms.p99.toFixed(1)}ms`);
      }
      breakReason = reasons.join(" + ") || "unknown";
    }
  }
  const atOk = sorted.find((s) => s.concurrency === lastOk);
  return {
    threshold_p99_ms: thresholdMs,
    sustained_concurrency: lastOk ?? 0,
    first_break_clients: firstBreak,
    break_reason: breakReason,
    rps_at_sustained: atOk?.rps ?? null,
    p99_at_sustained: atOk?.latency_ms?.p99 ?? null,
  };
}

/** Peak successful RPS on the measured curve (threshold-independent capacity). */
function saturationThroughput(allSteps) {
  const ok = allSteps.filter((s) => s.error_rate <= BREAK_ERROR_RATE && s.rps != null);
  if (!ok.length) return null;
  const best = ok.reduce((a, b) => (b.rps > a.rps ? b : a));
  return {
    peak_rps: best.rps,
    at_clients: best.concurrency,
    p99_ms: best.latency_ms?.p99 ?? null,
  };
}

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
async function waitTcp(port, ms = 60000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const ok = await new Promise((r) => {
      const c = createConnection({ host: "127.0.0.1", port }, () => {
        c.end();
        r(true);
      });
      c.on("error", () => r(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`tcp timeout :${port}`);
}
async function waitHttpOk(url, ms = 60000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404 || r.status === 401) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`http timeout ${url}`);
}
function smaps(pid) {
  const p = `/proc/${pid}/smaps_rollup`;
  if (!existsSync(p) || pid == null) return null;
  const text = readFileSync(p, "utf8");
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}:\\s+(\\d+)\\s+kB`, "m"));
    return m ? Number((Number(m[1]) / 1024).toFixed(2)) : null;
  };
  return { rss_mb: get("Rss"), anonymous_mb: get("Anonymous"), pss_mb: get("Pss") };
}
function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}
function resolveTool(tools, operationId) {
  const bare = operationId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const hit =
    tools.find((t) => t.name === bare) ||
    tools.find((t) => t.name.endsWith(bare) || t.name.includes(bare));
  return hit?.name || bare;
}

async function startMock() {
  const child = spawn(process.execPath, [MOCK_JS], {
    env: { ...process.env, FIXTURE, MT_UPSTREAM_LATENCY: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buf = "";
  const ready = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("mock timeout")), 30000);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      const line = buf.split("\n").find((l) => l.includes('"ready"'));
      if (!line) return;
      try {
        clearTimeout(t);
        resolve(JSON.parse(line));
      } catch {
        /* keep */
      }
    });
    child.stderr.on("data", () => {});
    child.on("exit", (c) => reject(new Error(`mock exited ${c}`)));
  });
  await waitTcp(Number(new URL(ready.baseUrl).port));
  return {
    baseUrl: ready.baseUrl,
    close: async () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    },
  };
}

async function connectHttpMcp(mcpUrl, name, { headers } = {}) {
  const transport = new StreamableHTTPClientTransport(
    new URL(mcpUrl),
    headers ? { requestInit: { headers } } : undefined
  );
  const client = new Client({ name, version: "1" }, {});
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

function cmdlineOf(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim();
  } catch {
    return "";
  }
}

/** Sum smaps over PPID tree (Executor: serve + sandbox; exclude motel diagnostics). */
function treeSmaps(rootPid, { excludeMotel = false } = {}) {
  if (rootPid == null) return null;
  const kids = (pid) => {
    const out = [];
    try {
      for (const ent of readdirSync("/proc")) {
        if (!/^\d+$/.test(ent)) continue;
        try {
          const text = readFileSync(`/proc/${ent}/status`, "utf8");
          const m = text.match(/^PPid:\s+(\d+)/m);
          if (m && Number(m[1]) === pid) out.push(Number(ent));
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    return out;
  };
  const seen = new Set();
  const q = [rootPid];
  let rss = 0;
  let anon = 0;
  let pss = 0;
  let counted = 0;
  while (q.length) {
    const pid = q.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const cmd = cmdlineOf(pid);
    const motel = /motel\.capnp|motel-data|motel-assets/.test(cmd);
    q.push(...kids(pid));
    if (excludeMotel && motel) continue;
    const s = smaps(pid);
    if (s) {
      if (s.rss_mb != null) rss += s.rss_mb;
      if (s.anonymous_mb != null) anon += s.anonymous_mb;
      if (s.pss_mb != null) pss += s.pss_mb;
      counted += 1;
    }
  }
  return {
    rss_mb: Number(rss.toFixed(2)),
    anonymous_mb: Number(anon.toFixed(2)),
    pss_mb: Number(pss.toFixed(2)),
    process_count: counted,
    tree_process_count: seen.size,
  };
}

async function startClawql(mockBase, { id, oldMb = null, bunSmol = false } = {}) {
  const home = join(tmpdir(), `http-conc-${id}-${process.pid}-${Date.now()}`);
  mkdirSync(home, { recursive: true });
  const port = await pickPort();
  const env = clawqlEqualArmEnv({ home, specPath: CURATED, apiBase: mockBase });
  Object.assign(env, {
    PORT: String(port),
    MCP_PORT: String(port),
    MCP_HOST: "127.0.0.1",
    CLOUDFLARE_API_TOKEN: "bench-fake-token",
    CLAWQL_CATALOG_SQLITE: "1",
    CLAWQL_CATALOG_SQLITE_BUILD: "oop",
    CLAWQL_SEARCH_COMPACT: "0",
    CLAWQL_HTTP_SKIP_PAYMENTS: "1",
    CLAWQL_HTTP_SKIP_GRAPHQL: "1",
    CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE: "1",
    CLAWQL_ENABLE_PROGRAMS: "0",
  });
  const server = join(ROOT, "dist/server-http.js");
  let bin;
  let args;
  if (bunSmol) {
    bin = BUN_BIN;
    args = ["--smol", server];
  } else {
    bin = process.execPath;
    args = oldMb != null ? [`--max-old-space-size=${oldMb}`, server] : [server];
  }
  const logPath = join(home, "clawql.log");
  const fd = openSync(logPath, "w");
  const child = spawn(bin, args, { env, stdio: ["ignore", fd, fd] });
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`${id} exited early\n${readFileSync(logPath, "utf8").slice(-800)}`);
    }
    if (existsSync(logPath) && readFileSync(logPath, "utf8").includes("listening on")) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await waitTcp(port);
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  const probe = await connectHttpMcp(mcpUrl, `${id}-probe`);
  const listed = await probe.client.listTools();
  await probe.close();
  return {
    id,
    kind: "clawql",
    runtime: bunSmol ? "bun" : "node",
    node_max_old_space_mb: bunSmol ? null : oldMb,
    bun_smol: bunSmol || null,
    mcpUrl,
    pid: child.pid,
    toolName: "execute",
    callArgs: {
      operationId: OP_ID,
      args: { zone_id: ZONE, per_page: 50 },
      where: "{aRecordCount: length(result[?type==`A`])}",
    },
    close: async () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
      try {
        rmSync(home, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

async function startMcpjungle(mockBase) {
  const work = join(tmpdir(), `http-conc-mj-${process.pid}-${Date.now()}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const port = await pickPort();
  const confPath = join(work, "cf-stdio.json");
  writeFileSync(
    confPath,
    JSON.stringify(
      {
        name: "cloudflare",
        transport: "stdio",
        description: "curated Cloudflare REST→MCP",
        command: process.execPath,
        args: [REST_MCP],
        session_mode: "stateful",
        env: {
          CF_MOCK_BASE: mockBase,
          CF_CURATED_OPENAPI: CURATED,
          CF_ACCOUNT_ID: FAKE.accountId,
          CF_ZONE_ID: FAKE.auditZoneId,
        },
      },
      null,
      2
    )
  );
  const logFd = openSync(join(work, "server.log"), "w");
  const child = spawn(
    MCPJUNGLE,
    ["start", "--host", "127.0.0.1", "--port", String(port), "--sqlite-db-path", join(work, "mj.db")],
    { cwd: work, stdio: ["ignore", logFd, logFd] }
  );
  const registry = `http://127.0.0.1:${port}`;
  await waitHttpOk(`${registry}/`, 60000);
  const reg = spawnSync(MCPJUNGLE, ["register", "-c", confPath, "--registry", registry, "--force"], {
    encoding: "utf8",
    cwd: work,
  });
  if (reg.status !== 0) {
    throw new Error(`mcpjungle register failed: ${reg.stderr || reg.stdout}`);
  }
  const mcpUrl = `${registry}/mcp`;
  const probe = await connectHttpMcp(mcpUrl, "mj-probe");
  const listed = await probe.client.listTools();
  const toolName = resolveTool(listed.tools, OP_ID);
  await probe.close();
  return {
    id: "mcpjungle",
    kind: "aggregator",
    runtime: "go",
    mcpUrl,
    pid: child.pid,
    toolName,
    callArgs: { zone_id: ZONE, per_page: 50 },
    note: "No server-side where; response body larger than ClawQL known-op path.",
    close: async () => {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        /* ignore */
      }
      try {
        closeSync(logFd);
      } catch {
        /* ignore */
      }
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

async function startAgentgateway(mockBase) {
  const work = join(tmpdir(), `http-conc-ag-${process.pid}-${Date.now()}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const port = await pickPort();
  const adminPort = await pickPort();
  const readyPort = await pickPort();
  const statsPort = await pickPort();
  const bashCmd = `CF_MOCK_BASE=${JSON.stringify(mockBase)} CF_CURATED_OPENAPI=${JSON.stringify(CURATED)} CF_ACCOUNT_ID=${JSON.stringify(FAKE.accountId)} CF_ZONE_ID=${JSON.stringify(FAKE.auditZoneId)} exec ${JSON.stringify(process.execPath)} ${JSON.stringify(REST_MCP)}`;
  const cfgPath = join(work, "config.yaml");
  // Unique admin/readiness/stats — defaults (15000/15021/15020) collide with the CF board's AG.
  // AG_TUNED=1 raises stock pool / worker / in-flight limits for a production-ish smoke.
  const tunedBlock = AG_TUNED
    ? `
  workerThreads: 4
  backend:
    poolMaxSize: 256
    poolIdleTimeout: "2m"
frontendPolicies:
  http:
    maxConcurrentRequests: 1024
`
    : "";
  writeFileSync(
    cfgPath,
    `config:
  adminAddr: "127.0.0.1:${adminPort}"
  readinessAddr: "127.0.0.1:${readyPort}"
  statsAddr: "127.0.0.1:${statsPort}"${tunedBlock}
mcp:
  port: ${port}
  targets:
  - name: cloudflare
    stdio:
      cmd: "/bin/bash"
      args: ["-c", ${JSON.stringify(bashCmd)}]
`
  );
  const logFd = openSync(join(work, "server.log"), "w");
  const child = spawn(AGENTGATEWAY, ["-f", cfgPath], {
    cwd: work,
    stdio: ["ignore", logFd, logFd],
  });
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  // Do not require TCP accept before MCP probe — AG can race listen vs accept under load.
  const t0 = Date.now();
  let toolName = null;
  let lastErr = null;
  for (;;) {
    if (child.exitCode != null) {
      const log = existsSync(join(work, "server.log"))
        ? readFileSync(join(work, "server.log"), "utf8").slice(-2000)
        : "";
      throw new Error(`agentgateway exited ${child.exitCode}\n${log}`);
    }
    try {
      const p = await connectHttpMcp(mcpUrl, "ag-probe");
      const listed = await p.client.listTools();
      toolName = resolveTool(listed.tools, OP_ID);
      await p.close();
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (Date.now() - t0 > 120000) {
        const log = existsSync(join(work, "server.log"))
          ? readFileSync(join(work, "server.log"), "utf8").slice(-2000)
          : "";
        throw new Error(`agentgateway connect failed: ${lastErr}\n${log}`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return {
    id: AG_TUNED ? "agentgateway_tuned" : "agentgateway",
    kind: "aggregator",
    runtime: "rust",
    mcpUrl,
    pid: child.pid,
    toolName,
    callArgs: { zone_id: ZONE, per_page: 50 },
    note: AG_TUNED
      ? "Tuned: workerThreads=4, backend.poolMaxSize=256, frontendPolicies.http.maxConcurrentRequests=1024. Still no where (larger body)."
      : "Stock defaults. No server-side where; response body larger than ClawQL known-op path.",
    ag_tuned: AG_TUNED,
    close: async () => {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        /* ignore */
      }
      try {
        closeSync(logFd);
      } catch {
        /* ignore */
      }
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

async function startExecutorV2(mockBase) {
  if (!existsSync(CURATED)) throw new Error(`missing ${CURATED}`);
  const openapiDoc = JSON.parse(readFileSync(CURATED, "utf8"));
  const meta = ensureExecutorOpenapiApp({ mockBase, openapiDoc });
  const key = executorV2ApiKey();
  if (!key) throw new Error("EXECUTOR_V2_API_KEY or /tmp/executor-v2-data/api_key.txt required");
  const mcpUrl = process.env.EXECUTOR_V2_URL?.trim() || "http://127.0.0.1:4312/mcp";
  const pid = findExecutorV2ServeRootPid();
  if (pid == null) {
    console.warn(
      "[http-conc] WARN executor_v2: empty process tree (pid=null) — set EXECUTOR_V2_PID; memory samples may be null"
    );
  }
  const headers = { Authorization: `Bearer ${key}` };
  const probe = await connectHttpMcp(mcpUrl, "exec-probe", { headers });
  const listed = await probe.client.listTools();
  const executeTool = listed.tools.find((t) => t.name === "execute");
  if (!executeTool) throw new Error("executor_v2: execute tool missing");
  await probe.close();
  const scripts = executorV2ToolScripts({ appSlug: meta.slug });
  // Same DNS list + A-count as ClawQL known-op / aggregator OP_ID (step 4).
  const code = scripts[4];
  return {
    id: "executor_v2",
    kind: "executor",
    runtime: "executor_v2_http",
    mcpUrl,
    pid,
    toolName: "execute",
    callArgs: { code },
    authHeaders: headers,
    memoryTree: true,
    note: `OpenAPI tools host (${meta.slug}); code-mode execute of DNS list (no where). External serve — close() does not kill host.`,
    executor: {
      slug: meta.slug,
      deployment: meta.deploymentId,
      origin: meta.origin,
    },
    close: async () => {
      /* shared Executor host — do not SIGTERM */
    },
  };
}

function memAvailableMb() {
  try {
    const txt = readFileSync("/proc/meminfo", "utf8");
    const m = txt.match(/^MemAvailable:\s+(\d+)\s+kB/m);
    return m ? Number(m[1]) / 1024 : null;
  } catch {
    return null;
  }
}

/** Wait for RSS to return after a heavy arm so the next arm is not host-starved. */
async function waitForHostReclaim({ minMb = 8000, maxWaitMs = 90000 } = {}) {
  const t0 = performance.now();
  let avail = memAvailableMb();
  while (avail != null && avail < minMb && performance.now() - t0 < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 2000));
    avail = memAvailableMb();
  }
  console.error(
    `[http-conc] host reclaim: avail_mb=${avail?.toFixed?.(0) ?? "?"} waited_ms=${Math.round(performance.now() - t0)}`
  );
}

async function chaosStep(arm, n) {
  const clients = [];
  const connectOpts = arm.authHeaders ? { headers: arm.authHeaders } : {};
  try {
    for (let i = 0; i < n; i++) {
      clients.push(await connectHttpMcp(arm.mcpUrl, `${arm.id}-${n}-${i}`, connectOpts));
    }
    for (const c of clients) {
      for (let w = 0; w < CONC_WARMUP; w++) {
        try {
          await c.client.callTool({ name: arm.toolName, arguments: arm.callArgs });
        } catch {
          /* warmup */
        }
      }
    }
    const latencies = [];
    let ok = 0;
    let err = 0;
    const tEnd = performance.now() + CONC_STEP_MS;
    await Promise.all(
      clients.map(async (c) => {
        while (performance.now() < tEnd) {
          try {
            const t0 = performance.now();
            const res = await c.client.callTool({ name: arm.toolName, arguments: arm.callArgs });
            latencies.push(performance.now() - t0);
            if (res?.isError) err += 1;
            else ok += 1;
          } catch {
            err += 1;
          }
        }
      })
    );
    const sorted = [...latencies].sort((a, b) => a - b);
    const total = ok + err;
    const errorRate = total > 0 ? err / total : 1;
    const p99 = percentile(sorted, 99);
    const broken =
      errorRate > BREAK_ERROR_RATE || (p99 != null && p99 > BREAK_P99_MS);
    const reasons = [];
    if (errorRate > BREAK_ERROR_RATE) reasons.push(`error_rate ${errorRate.toFixed(3)}`);
    if (p99 != null && p99 > BREAK_P99_MS) reasons.push(`p99 ${p99.toFixed(1)}ms`);
    return {
      concurrency: n,
      ok,
      err,
      error_rate: Number(errorRate.toFixed(4)),
      rps: Number((ok / (CONC_STEP_MS / 1000)).toFixed(1)),
      latency_ms: {
        p50: percentile(sorted, 50),
        p99,
        p999: percentile(sorted, 99.9),
      },
      memory: arm.memoryTree
        ? treeSmaps(arm.pid, { excludeMotel: true })
        : smaps(arm.pid),
      broken,
      break_reason: broken ? reasons.join(" + ") : null,
    };
  } finally {
    await Promise.all(
      clients.map(async (c) => {
        try {
          await c.close();
        } catch {
          /* ignore */
        }
      })
    );
    // Give gateway/worker RSS a beat to reclaim before the next step.
    if (n >= 64) await new Promise((r) => setTimeout(r, 2000));
  }
}

async function chaosArm(arm) {
  console.error(
    `[http-conc] === ${arm.id}${CURVE ? " (curve)" : ""} === (climb until p99/errors; loop_guard=${CONC_HARD_MAX})`
  );
  const stopP99 = CURVE ? CURVE_STOP_P99_MS : BREAK_P99_MS;
  let lastOkPrimary = null;
  let firstBreakPrimary = null;
  let censoredAt = null;
  /** Optional: resume refine from a prior ladder (exit-137 recovery). */
  const seedPath = (process.env.SEED_STEPS_JSON || "").trim();
  let steps = [];
  let skipLadder = false;
  if (seedPath && existsSync(seedPath)) {
    const seed = JSON.parse(readFileSync(seedPath, "utf8"));
    if (seed.arm_id && seed.arm_id !== arm.id) {
      throw new Error(`SEED_STEPS_JSON arm_id=${seed.arm_id} != ${arm.id}`);
    }
    steps = [...(seed.steps || [])];
    skipLadder = steps.length > 0;
    console.error(
      `[http-conc] ${arm.id} seeded ${steps.length} steps from ${seedPath} (refine-only; skip ladder)`
    );
  }
  // Power-of-two until 64, then denser steps in CURVE mode so we find the p99
  // break between 128 and 256 instead of leaping to a host-OOM mid-step.
  // This is denser sampling, not a client ceiling.
  for (let n = 1; !skipLadder && n <= CONC_HARD_MAX; ) {
    // Do not abort the climb on soft MemAvailable thresholds — that understates
    // later arms after a heavy Bun run. Only record host_censored if a step
    // cannot even connect (thrown) or the process is killed (exit 137).
    console.error(`[http-conc] ${arm.id} clients=${n} avail_mb=${memAvailableMb()?.toFixed?.(0) ?? "?"}`);
    let step;
    try {
      step = await chaosStep(arm, n);
    } catch (e) {
      console.error(`[http-conc] ${arm.id} step failed at n=${n}: ${e?.message || e}`);
      censoredAt = n;
      break;
    }
    steps.push(step);
    console.error(
      `[http-conc] ${arm.id} n=${n} p99=${step.latency_ms.p99?.toFixed?.(1)} err=${step.error_rate} broken@${BREAK_P99_MS}=${step.broken} anon=${step.memory?.anonymous_mb}`
    );
    // Checkpoint after every step so exit-137 mid-arm does not lose the ladder.
    try {
      writeFileSync(
        OUT + ".checkpoint.json",
        JSON.stringify(
          {
            measuredAt: new Date().toISOString(),
            arm_id: arm.id,
            steps,
            refine: [],
            avail_mb: memAvailableMb(),
          },
          null,
          2
        ) + "\n"
      );
    } catch {
      /* ignore */
    }
    if (stepOkAtThreshold(step, BREAK_P99_MS)) lastOkPrimary = n;
    else if (firstBreakPrimary == null) {
      firstBreakPrimary = { concurrency: n, reason: step.break_reason };
    }
    // Stop when the thing under test breaks — never because we invented a cap.
    if (step.error_rate > BREAK_ERROR_RATE) break;
    if (step.latency_ms?.p99 != null && step.latency_ms.p99 > stopP99) break;
    if (!CURVE && step.broken) break;
    // Denser sampling as concurrency grows (not a ceiling): find p99 break
    // between 128–160 before a host-OOM leap. Still climbs until break.
    if (CURVE && n >= 96) n += 16;
    else if (CURVE && n >= 64) n += 32;
    else n *= 2;
  }
  const refine = [];
  const thresholdsToRefine = CURVE ? THRESHOLDS : [BREAK_P99_MS];
  for (const T of thresholdsToRefine) {
    const bounds = () => {
      const sorted = [...steps, ...refine].sort((a, b) => a.concurrency - b.concurrency);
      let lo = null;
      let hi = null;
      for (const s of sorted) {
        if (stepOkAtThreshold(s, T)) lo = s.concurrency;
        else if (hi == null && (lo == null || s.concurrency > lo)) hi = s.concurrency;
      }
      return { lo, hi };
    };
    let { lo, hi } = bounds();
    if (lo == null || hi == null || hi - lo <= 1) continue;
    let guard = 0;
    while (hi - lo > 1 && guard++ < 32) {
      const mid = Math.floor((lo + hi) / 2);
      const existing = [...steps, ...refine].find((s) => s.concurrency === mid);
      if (existing) {
        if (stepOkAtThreshold(existing, T)) lo = mid;
        else hi = mid;
        continue;
      }
      console.error(`[http-conc] ${arm.id} refine@${T}ms mid=${mid} (lo=${lo} hi=${hi})`);
      const step = await chaosStep(arm, mid);
      refine.push(step);
      console.error(
        `[http-conc] ${arm.id} refine@${T}ms n=${mid} p99=${step.latency_ms.p99?.toFixed?.(1)} ok=${stepOkAtThreshold(step, T)}`
      );
      if (stepOkAtThreshold(step, T)) lo = mid;
      else hi = mid;
    }
  }
  const allSteps = [...steps, ...refine];
  const byThreshold = Object.fromEntries(
    THRESHOLDS.map((T) => [String(T), ceilingAtThreshold(allSteps, T)])
  );
  const primary = byThreshold[String(BREAK_P99_MS)] || ceilingAtThreshold(allSteps, BREAK_P99_MS);
  const curve = allSteps
    .slice()
    .sort((a, b) => a.concurrency - b.concurrency)
    .map((s) => ({
      clients: s.concurrency,
      rps: s.rps,
      p50: s.latency_ms?.p50 ?? null,
      p99: s.latency_ms?.p99 ?? null,
      p999: s.latency_ms?.p999 ?? null,
      error_rate: s.error_rate,
      ok: s.ok,
      err: s.err,
    }));
  return {
    id: arm.id,
    kind: arm.kind,
    runtime: arm.runtime,
    node_max_old_space_mb: arm.node_max_old_space_mb ?? null,
    bun_smol: arm.bun_smol ?? null,
    toolName: arm.toolName,
    note: arm.note ?? null,
    loop_guard: CONC_HARD_MAX,
    host_censored_at_clients: censoredAt,
    sustained_concurrency_before_break: primary.sustained_concurrency,
    first_break_clients: primary.first_break_clients ?? firstBreakPrimary?.concurrency ?? null,
    break_reason: primary.break_reason ?? firstBreakPrimary?.reason ?? null,
    thresholds: byThreshold,
    saturation_throughput: saturationThroughput(allSteps),
    curve,
    steps,
    refine,
  };
}

/** Aggregate + write so a later arm OOM cannot erase completed ClawQL rows. */
function writeReport(results, { partial = false } = {}) {
  const byArm = new Map();
  for (const r of results) {
    if (!byArm.has(r.id)) byArm.set(r.id, []);
    byArm.get(r.id).push(r.sustained_concurrency_before_break);
  }
  const ranges = Object.fromEntries(
    [...byArm.entries()].map(([id, vals]) => {
      const sorted = [...vals].sort((a, b) => a - b);
      return [
        id,
        {
          reps: vals,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          median: sorted[Math.floor(sorted.length / 2)],
        },
      ];
    })
  );
  const ranges_by_threshold = {};
  for (const T of THRESHOLDS) {
    const key = String(T);
    const by = new Map();
    for (const r of results) {
      const sus = r.thresholds?.[key]?.sustained_concurrency;
      if (sus == null) continue;
      if (!by.has(r.id)) by.set(r.id, []);
      by.get(r.id).push(sus);
    }
    ranges_by_threshold[key] = Object.fromEntries(
      [...by.entries()].map(([id, vals]) => {
        const sorted = [...vals].sort((a, b) => a - b);
        return [
          id,
          {
            reps: vals,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            median: sorted[Math.floor(sorted.length / 2)],
          },
        ];
      })
    );
  }
  const saturation_by_arm = {};
  for (const r of results) {
    if (!r.saturation_throughput) continue;
    if (!saturation_by_arm[r.id]) saturation_by_arm[r.id] = [];
    saturation_by_arm[r.id].push(r.saturation_throughput);
  }
  for (const [id, vals] of Object.entries(saturation_by_arm)) {
    const rps = vals.map((v) => v.peak_rps).sort((a, b) => a - b);
    saturation_by_arm[id] = {
      reps: vals,
      peak_rps_median: rps[Math.floor(rps.length / 2)],
      peak_rps_min: rps[0],
      peak_rps_max: rps[rps.length - 1],
    };
  }
  const uncapped = ranges.clawql_node_uncapped;
  const n256 = ranges.clawql_node_256;
  const n384 = ranges.clawql_node_384;
  const bun = ranges.clawql_bun_smol;
  const mj = ranges.mcpjungle;
  const ag = ranges.agentgateway || ranges.agentgateway_tuned;
  const exec = ranges.executor_v2;

  let heapCapVerdict = null;
  if (uncapped && n256 && n384 && REPS >= 3) {
    const overlap256 = uncapped.min <= n256.max && n256.min <= uncapped.max;
    const overlap384 = uncapped.min <= n384.max && n384.min <= uncapped.max;
    if (overlap256 && overlap384) {
      heapCapVerdict =
        `within_run_variance — uncapped [${uncapped.min},${uncapped.max}] overlaps 256 [${n256.min},${n256.max}] and 384 [${n384.min},${n384.max}]; do not claim cap costs concurrency`;
    } else if (!overlap384 && n384.max < uncapped.min) {
      heapCapVerdict =
        `flag_changes_behavior_below_limit — 384 plateau (~296 MB uncapped) should not bind, yet sustained [${n384.min},${n384.max}] stays below uncapped [${uncapped.min},${uncapped.max}] across ${REPS} reps`;
    } else if (!overlap256 && n256.max < uncapped.min) {
      heapCapVerdict =
        `cap_or_flag_effect — 256 [${n256.min},${n256.max}] below uncapped [${uncapped.min},${uncapped.max}] across ${REPS} reps (384 ${n384 ? `[${n384.min},${n384.max}]` : "n/a"})`;
    } else {
      heapCapVerdict = `mixed_ranges — uncapped [${uncapped.min},${uncapped.max}] 256 [${n256.min},${n256.max}] 384 [${n384.min},${n384.max}]`;
    }
  } else if (uncapped && n256) {
    heapCapVerdict =
      `single_pass_only — uncapped ${uncapped.median} vs 256 ${n256.median}${n384 ? ` vs 384 ${n384.median}` : ""}; need REPS≥3 before claiming cap cost (384 may be unbound)`;
  }

  const report = {
    measuredAt: new Date().toISOString(),
    partial,
    topology: "A_single_instance_http_multiplex",
    claim_rules: [
      "One Streamable HTTP MCP process per arm; N concurrent clients.",
      "Comparable across arms in this file only (same host, same mock, same session).",
      "Not equal-arm stdio chaos (gateway-multi 63/204); not NATS 4-replica (135).",
      "ClawQL uses known-op execute+where; aggregators/Executor call the same DNS op without where (larger body).",
      "Do not claim heap-cap concurrency cost from a single pass — 384 sits above the uncapped plateau (~296 MB).",
      "No predetermined client ceiling: climb until p99/errors break. CONC_HARD_MAX is a loop guard only. host_censored only if a step throws (connect/OOM), never a soft MemAvailable abort.",
      ...(CURVE
        ? [
            "CURVE=1: p99 recorded at every client step; clients reported at each THRESHOLDS cutoff (default 100/250/500).",
            "Headline capacity: saturation_throughput (peak RPS) — does not depend on a latency cutoff.",
          ]
        : []),
    ],
    slo: {
      break_p99_ms: BREAK_P99_MS,
      break_error_rate: BREAK_ERROR_RATE,
      step_ms: CONC_STEP_MS,
      warmup: CONC_WARMUP,
      loop_guard: CONC_HARD_MAX,
      hard_max: CONC_HARD_MAX, // legacy alias — loop guard, not a measured ceiling
      reps: REPS,
      curve: CURVE,
      thresholds_p99_ms: THRESHOLDS,
      curve_stop_p99_ms: CURVE ? CURVE_STOP_P99_MS : BREAK_P99_MS,
    },
    operationId: OP_ID,
    ranges,
    ranges_by_threshold,
    saturation_by_arm,
    board: Object.fromEntries(
      results.map((r) => [
        `${r.id}${REPS > 1 ? `_rep${r.rep}` : ""}`,
        {
          sustained: r.sustained_concurrency_before_break,
          first_break: r.first_break_clients,
          break_reason: r.break_reason,
          thresholds: r.thresholds ?? null,
          saturation_throughput: r.saturation_throughput ?? null,
          loop_guard: r.loop_guard ?? CONC_HARD_MAX,
          host_censored_at_clients: r.host_censored_at_clients ?? null,
          runtime: r.runtime,
          node_max_old_space_mb: r.node_max_old_space_mb,
          bun_smol: r.bun_smol,
          rep: r.rep ?? 1,
        },
      ])
    ),
    interpretation: {
      heap_cap_vs_concurrency: heapCapVerdict,
      bun_vs_node:
        bun && n256
          ? `bun_holds_more — Bun median ${bun.median} [${bun.min},${bun.max}] vs Node256 median ${n256.median} [${n256.min},${n256.max}]`
          : null,
      vs_peers_http: {
        clawql_node_uncapped: uncapped ?? null,
        clawql_node_256: n256 ?? null,
        clawql_node_384: n384 ?? null,
        clawql_bun_smol: bun ?? null,
        mcpjungle: mj ?? null,
        agentgateway: ag ?? null,
        executor_v2: exec ?? null,
        note: "Like-for-like HTTP multiplex; aggregator/Executor payloads are larger (no where). Executor is external serve + Bearer. No predetermined client caps — ceilings come from p99/errors (or host_censored).",
      },
      multi_threshold:
        CURVE
          ? "Publish clients@100/250/500 from ranges_by_threshold; lead capacity with saturation_by_arm peak RPS; curves in arms[].curve."
          : null,
      cloud_profile_hint:
        "Bun --smol remains the Cloud HTTP default (highest clients + ~130 MB). Do not cite Node cap concurrency tax until REPS≥3 settles variance vs flag-behavior.",
      related:
        "Open HTTP tail stalls (300–700 ms) likely amplify under concurrency — same investigation track.",
    },
    arms: results,
  };

  mkdirSync(join(OUT, ".."), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  try {
    writeFileSync("/opt/cursor/artifacts/" + OUT.split("/").pop(), JSON.stringify(report, null, 2));
  } catch {
    /* ignore */
  }
  return report;
}

async function main() {
  if (!existsSync(join(ROOT, "dist/server-http.js"))) {
    throw new Error("dist/server-http.js missing — build first");
  }
  for (const [bin, label] of [
    [MCPJUNGLE, "MCPJUNGLE_BIN"],
    [AGENTGATEWAY, "AGENTGATEWAY_BIN"],
  ]) {
    if (!existsSync(bin)) throw new Error(`${label} not found at ${bin}`);
  }

  const mock = await startMock();
  const results = [];
  const want = new Set(
    (
      process.env.ARMS ||
      "clawql_bun_smol,clawql_node_256,mcpjungle,agentgateway,executor_v2"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  // Preserve ARMS= env order when set; otherwise default order below.
  // Prefer measuring memory-heavy peers early on a clean host (still no client caps).
  const starterFns = new Map([
    ["agentgateway", () => startAgentgateway(mock.baseUrl)],
    ["executor_v2", () => startExecutorV2(mock.baseUrl)],
    ["clawql_bun_smol", () => startClawql(mock.baseUrl, { id: "clawql_bun_smol", bunSmol: true })],
    ["clawql_node_256", () => startClawql(mock.baseUrl, { id: "clawql_node_256", oldMb: 256 })],
    ["clawql_node_uncapped", () => startClawql(mock.baseUrl, { id: "clawql_node_uncapped", oldMb: null })],
    ["clawql_node_384", () => startClawql(mock.baseUrl, { id: "clawql_node_384", oldMb: 384 })],
    ["mcpjungle", () => startMcpjungle(mock.baseUrl)],
  ]);
  const armOrder = (
    process.env.ARMS ||
    "agentgateway,executor_v2,clawql_bun_smol,clawql_node_256,mcpjungle"
  )
    .split(",")
    .map((s) => s.trim())
    .filter((id) => want.has(id) && starterFns.has(id));
  const starters = armOrder.map((id) => [id, starterFns.get(id)]);
  try {
    // Round-robin reps across arms (same mock) so host drift hits each arm similarly.
    for (let rep = 1; rep <= REPS; rep++) {
      for (const [id, start] of starters) {
        console.error(`[http-conc] === ${id} rep ${rep}/${REPS} ===`);
        const arm = await start();
        try {
          const row = await chaosArm(arm);
          row.rep = rep;
          results.push(row);
          writeReport(results, { partial: true });
          console.error(`[http-conc] wrote partial ${OUT} after ${id} rep ${rep}`);
        } finally {
          try {
            await arm.close();
          } catch {
            /* ignore */
          }
          await waitForHostReclaim();
        }
      }
    }
  } finally {
    await mock.close();
  }

  const report = writeReport(results, { partial: false });
  console.log(
    JSON.stringify(
      {
        wrote: OUT,
        loop_guard: report.slo.loop_guard,
        board: report.board,
        interpretation: report.interpretation,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
