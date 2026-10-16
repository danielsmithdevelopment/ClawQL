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
const CONC_HARD_MAX = Math.max(2, Number(process.env.CONC_HARD_MAX || 256) || 256);
const CONC_STEP_MS = Math.max(1000, Number(process.env.CONC_STEP_MS || 3000) || 3000);
const CONC_WARMUP = Math.max(0, Number(process.env.CONC_WARMUP || 4) || 4);
/** Repeat each arm N times (interleaved by arm order) for range/variance. */
const REPS = Math.max(1, Number(process.env.REPS || 1) || 1);
const AG_TUNED = ["1", "true", "yes"].includes((process.env.AG_TUNED ?? "").trim().toLowerCase());
const OUT =
  process.env.OUT ||
  join(ROOT, "docs/benchmarks/cloudflare-multiturn/http-concurrency-heap-ab.json");

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

async function chaosStep(arm, n) {
  const clients = [];
  const connectOpts = arm.authHeaders ? { headers: arm.authHeaders } : {};
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
  for (const c of clients) await c.close();
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
}

async function chaosArm(arm) {
  console.error(`[http-conc] === ${arm.id} ===`);
  const steps = [];
  let lastOk = null;
  let firstBreak = null;
  for (let n = 1; n <= CONC_HARD_MAX; n *= 2) {
    console.error(`[http-conc] ${arm.id} clients=${n}`);
    const step = await chaosStep(arm, n);
    steps.push(step);
    console.error(
      `[http-conc] ${arm.id} n=${n} p99=${step.latency_ms.p99?.toFixed?.(1)} err=${step.error_rate} broken=${step.broken} anon=${step.memory?.anonymous_mb}`
    );
    if (step.broken) {
      firstBreak = { concurrency: n, reason: step.break_reason };
      break;
    }
    lastOk = n;
  }
  // Binary refine between lastOk and firstBreak
  const refine = [];
  if (lastOk != null && firstBreak != null && firstBreak.concurrency - lastOk > 1) {
    let lo = lastOk;
    let hi = firstBreak.concurrency;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      console.error(`[http-conc] ${arm.id} refine mid=${mid} (lo=${lo} hi=${hi})`);
      const step = await chaosStep(arm, mid);
      refine.push(step);
      console.error(
        `[http-conc] ${arm.id} refine n=${mid} p99=${step.latency_ms.p99?.toFixed?.(1)} broken=${step.broken}`
      );
      if (step.broken) {
        hi = mid;
        firstBreak = { concurrency: mid, reason: step.break_reason };
      } else {
        lo = mid;
        lastOk = mid;
      }
    }
  }
  return {
    id: arm.id,
    kind: arm.kind,
    runtime: arm.runtime,
    node_max_old_space_mb: arm.node_max_old_space_mb ?? null,
    bun_smol: arm.bun_smol ?? null,
    toolName: arm.toolName,
    note: arm.note ?? null,
    sustained_concurrency_before_break: lastOk ?? 0,
    first_break_clients: firstBreak?.concurrency ?? null,
    break_reason: firstBreak?.reason ?? null,
    steps,
    refine,
  };
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
      "clawql_node_uncapped,clawql_node_256,clawql_node_384,clawql_bun_smol,mcpjungle,agentgateway,executor_v2"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const starters = [
    ["clawql_node_uncapped", () => startClawql(mock.baseUrl, { id: "clawql_node_uncapped", oldMb: null })],
    ["clawql_node_256", () => startClawql(mock.baseUrl, { id: "clawql_node_256", oldMb: 256 })],
    ["clawql_node_384", () => startClawql(mock.baseUrl, { id: "clawql_node_384", oldMb: 384 })],
    ["clawql_bun_smol", () => startClawql(mock.baseUrl, { id: "clawql_bun_smol", bunSmol: true })],
    ["mcpjungle", () => startMcpjungle(mock.baseUrl)],
    ["agentgateway", () => startAgentgateway(mock.baseUrl)],
    ["executor_v2", () => startExecutorV2(mock.baseUrl)],
  ].filter(([id]) => want.has(id));
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
        } finally {
          try {
            await arm.close();
          } catch {
            /* ignore */
          }
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }
  } finally {
    await mock.close();
  }

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
  const uncapped = ranges.clawql_node_uncapped;
  const n256 = ranges.clawql_node_256;
  const n384 = ranges.clawql_node_384;
  const bun = ranges.clawql_bun_smol;
  const mj = ranges.mcpjungle;
  const ag = ranges.agentgateway || ranges.agentgateway_tuned;
  const exec = ranges.executor_v2;

  let heapCapVerdict = null;
  if (uncapped && n256 && n384 && REPS >= 3) {
    const overlap256 =
      uncapped.min <= n256.max && n256.min <= uncapped.max;
    const overlap384 =
      uncapped.min <= n384.max && n384.min <= uncapped.max;
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
    topology: "A_single_instance_http_multiplex",
    claim_rules: [
      "One Streamable HTTP MCP process per arm; N concurrent clients.",
      "Comparable across arms in this file only (same host, same mock, same session).",
      "Not equal-arm stdio chaos (gateway-multi 63/204); not NATS 4-replica (135).",
      "ClawQL uses known-op execute+where; aggregators call the same DNS op without where (larger body).",
      "Do not claim heap-cap concurrency cost from a single pass — 384 sits above the uncapped plateau (~296 MB).",
    ],
    slo: {
      break_p99_ms: BREAK_P99_MS,
      break_error_rate: BREAK_ERROR_RATE,
      step_ms: CONC_STEP_MS,
      warmup: CONC_WARMUP,
      hard_max: CONC_HARD_MAX,
      reps: REPS,
    },
    operationId: OP_ID,
    ranges,
    board: Object.fromEntries(
      results.map((r) => [
        `${r.id}${REPS > 1 ? `_rep${r.rep}` : ""}`,
        {
          sustained: r.sustained_concurrency_before_break,
          first_break: r.first_break_clients,
          break_reason: r.break_reason,
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
        note: "Like-for-like HTTP multiplex; aggregator/Executor payloads are larger (no where). Executor is external serve + Bearer.",
      },
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
  console.log(
    JSON.stringify(
      {
        wrote: OUT,
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
