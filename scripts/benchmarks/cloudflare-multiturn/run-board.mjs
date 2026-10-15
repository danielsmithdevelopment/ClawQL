#!/usr/bin/env node
/**
 * Cloudflare zone-audit multi-arm board (Streamable HTTP).
 *
 *   CF_MT_ITERS=20 CF_MT_ARMS=direct,clawql_default,clawql_compact_search,clawql_known_op,executor_v2,mcpjungle,agentgateway \
 *     node scripts/benchmarks/cloudflare-multiturn/run-board.mjs
 *
 *   CF_MT_ITERS=10000 CF_MT_REPS=3 …  # publish protocol (3 interleaved × 10k)
 *   Smoke (N<10000 or REPS<3) writes smoke-* artifacts; only 3×10k writes board-*.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  openSync,
  closeSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { getEncoding } from "js-tiktoken";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { clawqlEqualArmEnv } from "../lib/clawql-bench-env.mjs";
import { FAKE } from "./lib/fixture-ids.mjs";
import { buildExpectations, checkStep } from "./lib/success-checks.mjs";
import {
  CLOUDFLARE_CODE_MODE,
  CLOUDFLARE_CODEMODE_DEFINITION_TOKENS,
  executorV2ToolScripts,
} from "./code-mode/published-scripts.mjs";
import { ensureExecutorOpenapiApp } from "./lib/ensure-executor-openapi-app.mjs";
import {
  CLAWQL_STEP_SHAPES,
  modelWrittenShapeText,
  programPlanSource,
} from "./lib/clawql-shapes.mjs";

/** Price-weight: model-written code/where/plan at 5× input (blog / board convention). */
const CODE_PRICE_WEIGHT = Number(process.env.CF_MT_CODE_PRICE_WEIGHT || 5) || 5;

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const FIXTURE = process.env.FIXTURE || join(HERE, "fixtures/recording.synthetic.json");
const CURATED_OAS = join(HERE, "fixtures/curated-openapi.json");
const REST_MCP = join(HERE, "lib/cf-rest-mcp.mjs");
const MOCK_JS = join(HERE, "mock/cloudflare-replay-mock.mjs");
const OUT_DIR = process.env.CF_MT_OUT_DIR || join(ROOT, "docs/benchmarks/cloudflare-multiturn");
const ITERS = Math.max(1, Number(process.env.CF_MT_ITERS || 20) || 20);
const REPS = Math.max(1, Number(process.env.CF_MT_REPS || 1) || 1);
const LATENCY = process.env.MT_UPSTREAM_LATENCY || "0";
const IS_PUBLISH_BOARD = ITERS >= 10000 && REPS >= 3;
const ARMS = (
  process.env.CF_MT_ARMS ||
  "direct,clawql_default,clawql_compact_search,clawql_known_op,clawql_program,executor_v2,mcpjungle,agentgateway,cloudflare_codemode"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MCPJUNGLE = process.env.MCPJUNGLE_BIN || "/tmp/gw-bins/mcpjungle";
const AGENTGATEWAY = process.env.AGENTGATEWAY_BIN || "/tmp/gw-bins/agentgateway";
const enc = getEncoding("cl100k_base");

function countTokens(text) {
  if (text == null || text === "") return 0;
  return enc.encode(String(text)).length;
}
function toolText(res) {
  const c = res?.content;
  if (!Array.isArray(c)) return "";
  return c.filter((x) => x?.type === "text").map((x) => x.text).join("\n");
}
function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
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
  const seen = new Set([rootPid]);
  const q = [rootPid];
  while (q.length) {
    const p = q.shift();
    for (const c of childPids(p)) {
      if (!seen.has(c)) {
        seen.add(c);
        q.push(c);
      }
    }
  }
  return [...seen];
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
    rss_mb: rss != null ? rss / 1024 : null,
    anonymous_mb: anon != null ? anon / 1024 : null,
    pss_mb: pss != null ? pss / 1024 : null,
  };
}
function cmdlineOf(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim().slice(0, 160);
  } catch {
    return "";
  }
}

/**
 * Sum smaps over the gateway process tree (PPID walk).
 * MCPJungle/agentgateway must include their REST→MCP stdio child when a
 * stateful session is open — that child does the OpenAPI work ClawQL does
 * in-process. Idle MJ (no session) is Go-only (~10–14 MB anon); do not compare
 * that to ClawQL. Board samples during live sessions.
 */
function treeSmaps(rootPid) {
  let rss = 0;
  let anon = 0;
  let pss = 0;
  for (const pid of processTreePids(rootPid)) {
    const s = smapsRollup(pid);
    if (!s) continue;
    if (s.rss_mb != null) rss += s.rss_mb;
    if (s.anonymous_mb != null) anon += s.anonymous_mb;
    if (s.pss_mb != null) pss += s.pss_mb;
  }
  return {
    rss_mb: Number(rss.toFixed(2)),
    anonymous_mb: Number(anon.toFixed(2)),
    pss_mb: Number(pss.toFixed(2)),
  };
}

/** Per-PID inventory for fairness audits (gateway + REST→MCP child, etc.). */
function treeProcessInventory(rootPid) {
  const processes = [];
  for (const pid of processTreePids(rootPid)) {
    const s = smapsRollup(pid);
    const cmd = cmdlineOf(pid);
    processes.push({
      pid,
      cmd,
      role: /cf-rest-mcp\.mjs|equal-arm-catalog-mcp\.mjs/.test(cmd)
        ? "rest_mcp"
        : /mcpjungle/.test(cmd)
          ? "mcpjungle_gateway"
          : /agentgateway/.test(cmd)
            ? "agentgateway"
            : /server-http\.js|dist\/server/.test(cmd)
              ? "clawql_http"
              : "other",
      rss_mb: s?.rss_mb ?? null,
      anonymous_mb: s?.anonymous_mb ?? null,
      pss_mb: s?.pss_mb ?? null,
    });
  }
  const tree = treeSmaps(rootPid);
  return {
    ...tree,
    process_count: processes.length,
    has_rest_mcp: processes.some((p) => p.role === "rest_mcp"),
    processes,
  };
}

/** ~100 samples on publish boards (flatness); ~10 on smoke. */
function memSampleStride(iters) {
  if (iters >= 1000) return Math.max(1, Math.floor(iters / 100));
  return Math.max(1, Math.floor(iters / 10));
}
function shouldSampleMemory(i, iters) {
  const stride = memSampleStride(iters);
  return i === 1 || i === iters || i % stride === 0;
}
function memorySeriesFlatness(series) {
  const anon = (series || []).map((m) => m.anonymous_mb).filter((x) => x != null);
  if (anon.length < 2) return null;
  const first = anon[0];
  const last = anon[anon.length - 1];
  const min = Math.min(...anon);
  const max = Math.max(...anon);
  return {
    samples: anon.length,
    anonymous_mb_first: first,
    anonymous_mb_last: last,
    anonymous_mb_min: min,
    anonymous_mb_max: max,
    anonymous_mb_range: Number((max - min).toFixed(2)),
    anonymous_mb_drift: Number((last - first).toFixed(2)),
  };
}

async function connectHttpMcp(mcpUrl, name) {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  const client = new Client({ name, version: "1" }, {});
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

async function startMock() {
  const child = spawn(process.execPath, [MOCK_JS], {
    env: { ...process.env, FIXTURE, MT_UPSTREAM_LATENCY: LATENCY },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = null;
  let buf = "";
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("mock ready timeout")), 20000);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      const line = buf.split("\n").find((l) => l.includes('"ready"'));
      if (line) {
        ready = JSON.parse(line);
        clearTimeout(t);
        resolve();
      }
    });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("exit", (c) => reject(new Error(`mock exited ${c}`)));
  });
  await waitTcp(Number(new URL(ready.baseUrl).port));
  return { child, baseUrl: ready.baseUrl, pid: child.pid };
}

async function startClawql(
  mockBase,
  { searchCompact = false, enablePrograms = false, label = "clawql" } = {}
) {
  const home = join(tmpdir(), `cf-${label}-${process.pid}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(home, { recursive: true });
  const port = await pickPort();
  const env = clawqlEqualArmEnv({
    home,
    specPath: CURATED_OAS,
    apiBase: mockBase,
  });
  Object.assign(env, {
    PORT: String(port),
    MCP_HOST: "127.0.0.1",
    CLOUDFLARE_API_TOKEN: "bench-fake-token",
    CLAWQL_CATALOG_SQLITE: process.env.CLAWQL_CATALOG_SQLITE ?? "1",
    // DNS list is large; projection keeps success under budget. Raise hard ceiling as a safety net.
    CLAWQL_EXECUTE_RESULT_MAX_CHARS: process.env.CLAWQL_EXECUTE_RESULT_MAX_CHARS || "2000000",
    // Soft observation budget stays at product default (~8k chars) unless overridden.
    // Scripted shapes always pass where, so publish rows stay observation-sized; the
    // default is recorded so readers know ClawQL token numbers include this behavior.
    ...(process.env.CLAWQL_EXECUTE_OBSERVATION_BUDGET_CHARS != null
      ? { CLAWQL_EXECUTE_OBSERVATION_BUDGET_CHARS: process.env.CLAWQL_EXECUTE_OBSERVATION_BUDGET_CHARS }
      : {}),
    // Labeled setting — default arm leaves compact off; clawql_compact_search turns it on.
    CLAWQL_SEARCH_COMPACT: searchCompact ? "1" : "0",
    // ADR 0015 v0 plan runner — only for clawql_program arm.
    ...(enablePrograms ? { CLAWQL_ENABLE_PROGRAMS: "1" } : { CLAWQL_ENABLE_PROGRAMS: "0" }),
  });
  const logPath = join(home, "clawql.log");
  const logFd = openSync(logPath, "w");
  const child = spawn(process.execPath, [join(ROOT, "dist/server-http.js")], {
    env,
    stdio: ["ignore", logFd, logFd],
  });
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  // Wait for listen line — GET /mcp is often 405/406 on Streamable HTTP.
  const deadline = Date.now() + 120000;
  let ready = false;
  while (Date.now() < deadline) {
    if (!existsSync(logPath)) {
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }
    const log = readFileSync(logPath, "utf8");
    if (log.includes("listening on") || log.includes("Streamable HTTP MCP")) {
      ready = true;
      break;
    }
    if (log.includes("Fatal startup error")) {
      throw new Error(`clawql failed:\n${log.slice(-2000)}`);
    }
    try {
      const alive = process.kill(child.pid, 0);
      if (!alive) throw new Error("clawql exited");
    } catch (e) {
      if (e?.code !== "EPERM" && String(e.message || e).includes("kill")) {
        throw new Error(`clawql died:\n${readFileSync(logPath, "utf8").slice(-2000)}`);
      }
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  if (!ready) {
    throw new Error(`clawql listen timeout:\n${readFileSync(logPath, "utf8").slice(-2000)}`);
  }
  await waitTcp(port, 10000);
  return {
    id: label,
    searchCompact: !!searchCompact,
    enablePrograms: !!enablePrograms,
    mcpUrl,
    pid: child.pid,
    home,
    logPath,
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
        rmSync(home, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

async function startMcpjungle(mockBase) {
  const work = join(tmpdir(), `cf-mj-${process.pid}`);
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
          CF_CURATED_OPENAPI: CURATED_OAS,
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
  return {
    id: "mcpjungle",
    mcpUrl: `${registry}/mcp`,
    pid: child.pid,
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
    },
  };
}

async function startAgentgateway(mockBase) {
  const work = join(tmpdir(), `cf-ag-${process.pid}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const port = await pickPort();
  const bashCmd = `CF_MOCK_BASE=${JSON.stringify(mockBase)} CF_CURATED_OPENAPI=${JSON.stringify(CURATED_OAS)} CF_ACCOUNT_ID=${JSON.stringify(FAKE.accountId)} CF_ZONE_ID=${JSON.stringify(FAKE.auditZoneId)} exec ${JSON.stringify(process.execPath)} ${JSON.stringify(REST_MCP)}`;
  const cfgPath = join(work, "config.yaml");
  writeFileSync(
    cfgPath,
    `mcp:
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
  await waitTcp(port, 60000);
  const t0 = Date.now();
  let lastErr = null;
  for (;;) {
    try {
      const p = await connectHttpMcp(mcpUrl, "ag-probe");
      await p.close();
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (Date.now() - t0 > 90000) {
        const log = existsSync(join(work, "server.log"))
          ? readFileSync(join(work, "server.log"), "utf8").slice(-2000)
          : "";
        throw new Error(`agentgateway connect failed: ${e}\n${log}`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return {
    id: "agentgateway",
    mcpUrl,
    pid: child.pid,
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
    },
  };
}

async function cfGet(baseUrl, path) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const t0 = performance.now();
  const res = await fetch(url);
  const text = await res.text();
  return { text, json: JSON.parse(text), ms: performance.now() - t0, tokens: countTokens(text) };
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.search(/[\[{]/);
    if (start < 0) return null;
    try {
      return JSON.parse(text.slice(start));
    } catch {
      return null;
    }
  }
}

/** Resolve aggregator tool name (MJ prefixes catalog__). */
function resolveTool(tools, operationId) {
  const bare = operationId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const hit =
    tools.find((t) => t.name === bare) ||
    tools.find((t) => t.name.endsWith(bare) || t.name.includes(bare));
  return hit?.name || bare;
}

async function runDirectSession(baseUrl, expectations) {
  return runRestSession(baseUrl, expectations, "direct");
}

async function runRestSession(baseUrl, expectations, armId) {
  const steps = [];
  let ok = true;
  const t0 = performance.now();
  const r1 = await cfGet(baseUrl, "/zones");
  const zone = r1.json?.result?.find((z) => z.name === FAKE.auditZoneName);
  let check = checkStep(1, { zoneId: zone?.id }, expectations);
  ok &&= check.ok;
  steps.push({ step: 1, calls: 1, discoveryTokens: 0, resultTokens: r1.tokens, codeTokens: 0, latency_ms: r1.ms, check });
  const zoneId = zone?.id;

  const r2 = await cfGet(baseUrl, `/zones/${zoneId}`);
  check = checkStep(2, { status: r2.json?.result?.status, planName: r2.json?.result?.plan?.name }, expectations);
  ok &&= check.ok;
  steps.push({ step: 2, calls: 1, discoveryTokens: 0, resultTokens: r2.tokens, codeTokens: 0, latency_ms: r2.ms, check });

  const r3 = await cfGet(baseUrl, `/zones/${zoneId}/settings/ssl`);
  check = checkStep(3, { ssl: r3.json?.result?.value }, expectations);
  ok &&= check.ok;
  steps.push({ step: 3, calls: 1, discoveryTokens: 0, resultTokens: r3.tokens, codeTokens: 0, latency_ms: r3.ms, check });

  const r4 = await cfGet(baseUrl, `/zones/${zoneId}/dns_records?per_page=500`);
  const records = r4.json?.result || [];
  const aCount = records.filter((x) => x.type === "A").length;
  const names = records.filter((x) => x.type === "A" && x.content === FAKE.targetIp).map((x) => x.name);
  const unproxied = records
    .filter((x) => x.type === "A" && x.content === FAKE.targetIp && x.proxied === false)
    .map((x) => x.name);
  check = checkStep(4, { aRecordCount: aCount }, expectations);
  ok &&= check.ok;
  steps.push({ step: 4, calls: 1, discoveryTokens: 0, resultTokens: r4.tokens, codeTokens: 0, latency_ms: r4.ms, check });
  check = checkStep(5, { names }, expectations);
  ok &&= check.ok;
  steps.push({ step: 5, calls: 0, discoveryTokens: 0, resultTokens: 0, codeTokens: 0, latency_ms: 0, check, note: "client filter" });
  check = checkStep(6, { unproxiedNames: unproxied }, expectations);
  ok &&= check.ok;
  steps.push({ step: 6, calls: 0, discoveryTokens: 0, resultTokens: 0, codeTokens: 0, latency_ms: 0, check, note: "client filter" });

  const r7 = await cfGet(baseUrl, `/accounts/${FAKE.accountId}/workers/scripts`);
  check = checkStep(7, { scriptNames: (r7.json?.result || []).map((s) => s.id) }, expectations);
  ok &&= check.ok;
  steps.push({ step: 7, calls: 1, discoveryTokens: 0, resultTokens: r7.tokens, codeTokens: 0, latency_ms: r7.ms, check });

  const r8 = await cfGet(
    baseUrl,
    `/accounts/${FAKE.accountId}/workers/scripts/${FAKE.workerScriptName}/settings`
  );
  check = checkStep(8, { compatibilityDate: r8.json?.result?.compatibility_date }, expectations);
  ok &&= check.ok;
  steps.push({ step: 8, calls: 1, discoveryTokens: 0, resultTokens: r8.tokens, codeTokens: 0, latency_ms: r8.ms, check });

  const r9 = await cfGet(baseUrl, `/zones/${zoneId}/workers/routes`);
  const route = (r9.json?.result || []).find((x) => x.script === FAKE.workerScriptName);
  check = checkStep(9, { routePattern: route?.pattern, script: route?.script }, expectations);
  ok &&= check.ok;
  steps.push({ step: 9, calls: 1, discoveryTokens: 0, resultTokens: r9.tokens, codeTokens: 0, latency_ms: r9.ms, check });

  const r10 = await cfGet(baseUrl, `/accounts/${FAKE.accountId}/r2/buckets`);
  check = checkStep(
    10,
    {
      buckets: (r10.json?.result?.buckets || []).map((b) => ({
        name: b.name,
        creation_date: b.creation_date,
      })),
    },
    expectations
  );
  ok &&= check.ok;
  steps.push({ step: 10, calls: 1, discoveryTokens: 0, resultTokens: r10.tokens, codeTokens: 0, latency_ms: r10.ms, check });

  const r11 = await cfGet(baseUrl, `/zones/${zoneId}/firewall/rules`);
  check = checkStep(
    11,
    { enabledRuleCount: (r11.json?.result || []).filter((x) => x.paused === false).length },
    expectations
  );
  ok &&= check.ok;
  steps.push({ step: 11, calls: 1, discoveryTokens: 0, resultTokens: r11.tokens, codeTokens: 0, latency_ms: r11.ms, check });

  const proposal = { proposal: { recordId: FAKE.unproxiedRecordId, proxied: true }, gated: true };
  check = checkStep(12, proposal, expectations);
  ok &&= check.ok;
  steps.push({
    step: 12,
    calls: 0,
    discoveryTokens: 0,
    resultTokens: countTokens(JSON.stringify(proposal)),
    codeTokens: 0,
    latency_ms: 0,
    check,
    note: "gated",
  });

  return summarizeSession(armId, ok, t0, steps);
}

function summarizeSession(armId, ok, t0, steps) {
  return {
    arm: armId,
    ok,
    session_ms: performance.now() - t0,
    steps,
    discovery_tokens_sum: steps.reduce((n, s) => n + (s.discoveryTokens || 0), 0),
    result_tokens_sum: steps.reduce((n, s) => n + (s.resultTokens || 0), 0),
    code_tokens_sum: steps.reduce((n, s) => n + (s.codeTokens || 0), 0),
    calls_sum: steps.reduce((n, s) => n + (s.calls || 0), 0),
  };
}

async function runClawqlSession(client, expectations, { knownOp = false } = {}) {
  const steps = [];
  let ok = true;
  const t0 = performance.now();

  for (let step = 1; step <= 11; step++) {
    const shape = CLAWQL_STEP_SHAPES[step];
    let discoveryTokens = 0;
    let discoveryMs = 0;
    if (!knownOp) {
      const tS = performance.now();
      const sRes = await client.callTool({
        name: "search",
        arguments: { query: shape.query || shape.operationId, limit: 3 },
      });
      discoveryMs = performance.now() - tS;
      if (sRes.isError) throw new Error(`search ${step}: ${toolText(sRes).slice(0, 200)}`);
      discoveryTokens = countTokens(toolText(sRes));
    }
    const execArgs = {
      operationId: shape.operationId,
      args: shape.args,
      where: shape.where,
    };
    // Model-written shaping (where/fields) — same bucket as code-mode script tokens.
    const codeTokens = countTokens(modelWrittenShapeText(shape));
    const tE = performance.now();
    const eRes = await client.callTool({
      name: "execute",
      arguments: execArgs,
    });
    const execMs = performance.now() - tE;
    if (eRes.isError) throw new Error(`execute ${step}: ${toolText(eRes).slice(0, 300)}`);
    const text = toolText(eRes);
    const json = parseJsonLoose(text);
    if (json?.truncated) {
      throw new Error(`execute ${step} truncated byteCount=${json.byteCount} limit=${json.limit}`);
    }
    if (json?.status === "where_invalid") {
      throw new Error(`execute ${step} where_invalid: ${json.error || text.slice(0, 200)}`);
    }
    // Result tokens = server MCP text only (no client reshape). where ran on ClawQL.
    const observed = json;
    const check = checkStep(step, observed, expectations);
    ok &&= check.ok;
    steps.push({
      step,
      calls: knownOp ? 1 : 2,
      discoveryTokens,
      resultTokens: countTokens(text),
      codeTokens,
      latency_ms: discoveryMs + execMs,
      check,
      where: shape.where,
      model_written: modelWrittenShapeText(shape),
    });
  }

  const proposal = { proposal: { recordId: FAKE.unproxiedRecordId, proxied: true }, gated: true };
  let check = checkStep(12, proposal, expectations);
  ok &&= check.ok;
  steps.push({
    step: 12,
    calls: 0,
    discoveryTokens: 0,
    resultTokens: countTokens(JSON.stringify(proposal)),
    codeTokens: 0,
    latency_ms: 0,
    check,
    note: "gated",
  });

  return summarizeSession(knownOp ? "clawql_known_op" : "clawql_default", ok, t0, steps);
}

/**
 * ADR 0015 v0: one execute_program with a JSON plan (where on every call).
 * Result tokens = filtered call values (code-mode peer); code tokens = plan source.
 */
async function runClawqlProgramSession(client, expectations) {
  const steps = [];
  let ok = true;
  const t0 = performance.now();
  const source = programPlanSource();
  const codeTokens = countTokens(source);
  const t1 = performance.now();
  const res = await client.callTool({
    name: "execute_program",
    arguments: { source, timeoutMs: 60_000 },
  });
  const ms = performance.now() - t1;
  const text = toolText(res);
  if (res.isError) throw new Error(`execute_program: ${text.slice(0, 400)}`);
  const envelope = parseJsonLoose(text);
  if (!envelope?.ok) {
    throw new Error(`execute_program not ok: ${text.slice(0, 400)}`);
  }
  const results = envelope?.result?.results || [];
  for (let step = 1; step <= 11; step++) {
    const row =
      results.find((r) => r.id === String(step) || r.id === `step_${step}`) || results[step - 1];
    let value = row?.value;
    if (typeof value === "string") value = parseJsonLoose(value);
    // Host execute returns MCP text content; runner may stash parsed JSON or raw text.
    if (value && typeof value === "object" && Array.isArray(value.content)) {
      const inner = value.content
        .filter((c) => c?.type === "text")
        .map((c) => c.text)
        .join("\n");
      value = parseJsonLoose(inner);
    }
    const check = checkStep(step, value, expectations);
    ok &&= check.ok;
    steps.push({
      step,
      calls: step === 1 ? 1 : 0,
      discoveryTokens: 0,
      // Program-filtered return for this step (not the full execute_program envelope).
      resultTokens: countTokens(JSON.stringify(value)),
      codeTokens: step === 1 ? codeTokens : 0,
      latency_ms: step === 1 ? ms : 0,
      check,
      note: "execute_program plan-runner-v0",
    });
  }
  const proposal = { proposal: { recordId: FAKE.unproxiedRecordId, proxied: true }, gated: true };
  const check12 = checkStep(12, proposal, expectations);
  ok &&= check12.ok;
  steps.push({
    step: 12,
    calls: 0,
    discoveryTokens: 0,
    resultTokens: countTokens(JSON.stringify(proposal)),
    codeTokens: 0,
    latency_ms: 0,
    check: check12,
    note: "gated",
  });
  return summarizeSession("clawql_program", ok, t0, steps);
}

async function runAggregatorSession(client, tools, expectations, armId) {
  const steps = [];
  let ok = true;
  const t0 = performance.now();

  async function callOp(step, operationId, args, observe) {
    const name = resolveTool(tools, operationId);
    const t1 = performance.now();
    const res = await client.callTool({ name, arguments: args || {} });
    const ms = performance.now() - t1;
    if (res.isError) throw new Error(`${armId} ${name}: ${toolText(res).slice(0, 200)}`);
    const text = toolText(res);
    const json = parseJsonLoose(text);
    const observed = observe(json);
    const check = checkStep(step, observed, expectations);
    ok &&= check.ok;
    steps.push({
      step,
      calls: 1,
      discoveryTokens: 0,
      resultTokens: countTokens(text),
      codeTokens: 0,
      latency_ms: ms,
      check,
      tool: name,
    });
    return json;
  }

  await callOp(1, "zones-get", {}, (j) => {
    const zone = (j?.result || []).find((z) => z.name === FAKE.auditZoneName);
    return { zoneId: zone?.id };
  });
  const zoneId = FAKE.auditZoneId;
  await callOp(2, "zones-0-get", { zone_id: zoneId }, (j) => ({
    status: j?.result?.status,
    planName: j?.result?.plan?.name,
  }));
  await callOp(3, "zone-settings-get-single-setting", { zone_id: zoneId, setting_id: "ssl" }, (j) => ({
    ssl: j?.result?.value,
  }));
  const dns = await callOp(4, "dns-records-for-a-zone-list-dns-records", { zone_id: zoneId, per_page: 500 }, (j) => ({
    aRecordCount: (j?.result || []).filter((x) => x.type === "A").length,
  }));
  const records = dns?.result || [];
  const names = records.filter((x) => x.type === "A" && x.content === FAKE.targetIp).map((x) => x.name);
  const unproxied = records
    .filter((x) => x.type === "A" && x.content === FAKE.targetIp && x.proxied === false)
    .map((x) => x.name);
  let check = checkStep(5, { names }, expectations);
  ok &&= check.ok;
  steps.push({ step: 5, calls: 0, discoveryTokens: 0, resultTokens: 0, codeTokens: 0, latency_ms: 0, check });
  check = checkStep(6, { unproxiedNames: unproxied }, expectations);
  ok &&= check.ok;
  steps.push({ step: 6, calls: 0, discoveryTokens: 0, resultTokens: 0, codeTokens: 0, latency_ms: 0, check });

  await callOp(7, "worker-script-list-workers", { account_id: FAKE.accountId }, (j) => ({
    scriptNames: (j?.result || []).map((s) => s.id),
  }));
  await callOp(
    8,
    "worker-script-get-settings",
    { account_id: FAKE.accountId, script_name: FAKE.workerScriptName },
    (j) => ({ compatibilityDate: j?.result?.compatibility_date })
  );
  await callOp(9, "worker-routes-list-routes", { zone_id: zoneId }, (j) => {
    const route = (j?.result || []).find((x) => x.script === FAKE.workerScriptName);
    return { routePattern: route?.pattern, script: route?.script };
  });
  await callOp(10, "r2-list-buckets", { account_id: FAKE.accountId }, (j) => ({
    buckets: (j?.result?.buckets || []).map((b) => ({ name: b.name, creation_date: b.creation_date })),
  }));
  await callOp(11, "firewall-rules-list-firewall-rules", { zone_id: zoneId }, (j) => ({
    enabledRuleCount: (j?.result || []).filter((x) => x.paused === false).length,
  }));

  const proposal = { proposal: { recordId: FAKE.unproxiedRecordId, proxied: true }, gated: true };
  check = checkStep(12, proposal, expectations);
  ok &&= check.ok;
  steps.push({
    step: 12,
    calls: 0,
    discoveryTokens: 0,
    resultTokens: countTokens(JSON.stringify(proposal)),
    codeTokens: 0,
    latency_ms: 0,
    check,
  });

  return summarizeSession(armId, ok, t0, steps);
}

function unwrapExecutorValue(text) {
  let observed = parseJsonLoose(text);
  if (typeof observed === "string") observed = parseJsonLoose(observed);
  if (!observed || typeof observed !== "object") return observed;
  // Executor MCP: { status, execution: { ok, value, error } }
  if (observed.execution) {
    if (observed.execution.ok === false) {
      const err = observed.execution.error;
      throw new Error(
        typeof err === "string" ? err : err?.message || JSON.stringify(err).slice(0, 300)
      );
    }
    observed = observed.execution.value;
    if (typeof observed === "string") observed = parseJsonLoose(observed);
  }
  return observed;
}

async function runExecutorV2Session(client, scripts, expectations) {
  const steps = [];
  let ok = true;
  const t0 = performance.now();
  for (let step = 1; step <= 12; step++) {
    const code = scripts[step];
    const codeTokens = countTokens(code);
    const t1 = performance.now();
    const res = await client.callTool({
      name: "execute",
      arguments: { code, timeoutMs: 30_000 },
    });
    const ms = performance.now() - t1;
    const text = toolText(res);
    if (res.isError) throw new Error(`executor_v2 step ${step}: ${text.slice(0, 300)}`);
    let observed;
    try {
      observed = unwrapExecutorValue(text);
    } catch (e) {
      throw new Error(`executor_v2 step ${step}: ${e.message}`);
    }
    const check = checkStep(step, observed, expectations);
    ok &&= check.ok;
    steps.push({
      step,
      calls: 1,
      discoveryTokens: 0,
      // Program return value only (code-mode contracts) — not the MCP execute envelope.
      resultTokens: countTokens(JSON.stringify(observed)),
      codeTokens,
      latency_ms: ms,
      check,
      note: "openapi_tools → mock HTTP (host fetch)",
      upstream: "mock",
    });
  }
  return summarizeSession("executor_v2", ok, t0, steps);
}

function expectationObservation(step, expectations) {
  const exp = expectations[step];
  if (!exp) return null;
  if (step === 12) return { proposal: exp.proposal, gated: true };
  return exp;
}

function runCloudflareCodemodeTokensOnly(expectations) {
  // Tokens-only: no self-hosted CF code-mode server — count published code + fixture-derived returns.
  const steps = [];
  let ok = true;
  const t0 = performance.now();
  for (let step = 1; step <= 12; step++) {
    const code = CLOUDFLARE_CODE_MODE[step];
    const codeTokens = countTokens(code);
    const observed = expectationObservation(step, expectations);
    const check = checkStep(step, observed, expectations);
    ok &&= check.ok;
    steps.push({
      step,
      calls: 0,
      discoveryTokens: 0,
      resultTokens: countTokens(JSON.stringify(observed)),
      codeTokens,
      latency_ms: null,
      check,
      note: "tokens-only — CF code-mode server not self-hosted; latency N/A",
      upstream: "none",
    });
  }
  return summarizeSession("cloudflare_codemode", ok, t0, steps);
}

async function runArmSessions({
  arm,
  mock,
  clawqlDefault,
  clawqlCompact,
  clawqlProgram,
  mj,
  ag,
  expectations,
  iters,
  execScripts,
  executorMeta,
}) {
  const sessions = [];
  const memSamples = [];
  let definitionTokens = null;
  let pid = null;
  let settings = {};
  let upstream = "mock";

  if (arm === "direct") {
    definitionTokens = 0; // no MCP Layer-1; rebuildable as 0 + discovery + result + code
    settings = { catalog: "curated_rest", layer1: "none" };
    for (let i = 1; i <= iters; i++) {
      sessions.push(await runDirectSession(mock.baseUrl, expectations));
      if (i === 1 || i % Math.max(1, Math.floor(iters / 5)) === 0 || i === iters) {
        console.log(`[cf-board] ${arm} ${i}/${iters} ok=${sessions.at(-1).ok}`);
      }
    }
  } else if (
    arm === "clawql_default" ||
    arm === "clawql_compact_search" ||
    arm === "clawql_known_op"
  ) {
    const clawql =
      arm === "clawql_compact_search" ? clawqlCompact || clawqlDefault : clawqlDefault;
    if (!clawql) throw new Error(`${arm} requires ClawQL server`);
    pid = clawql.pid;
    settings = {
      CLAWQL_SEARCH_COMPACT: arm === "clawql_compact_search" ? "1" : "0",
      known_op: arm === "clawql_known_op",
      catalog_sqlite: process.env.CLAWQL_CATALOG_SQLITE ?? "1",
      where: "observation_shaped",
    };
    const conn = await connectHttpMcp(clawql.mcpUrl, arm);
    try {
      const listed = await conn.client.listTools();
      definitionTokens = listed.tools
        .filter((t) => t.name === "search" || t.name === "execute")
        .reduce((n, t) => n + countTokens(JSON.stringify(t)), 0);
      for (let i = 1; i <= iters; i++) {
        sessions.push(
          await runClawqlSession(conn.client, expectations, {
            knownOp: arm === "clawql_known_op",
          })
        );
        if (shouldSampleMemory(i, iters)) {
          const inv = treeProcessInventory(pid);
          memSamples.push({
            i,
            rss_mb: inv.rss_mb,
            anonymous_mb: inv.anonymous_mb,
            pss_mb: inv.pss_mb,
            process_count: inv.process_count,
            has_rest_mcp: inv.has_rest_mcp,
            processes: inv.processes,
          });
          console.log(`[cf-board] ${arm} ${i}/${iters} ok=${sessions.at(-1).ok}`);
        }
        if (!sessions.at(-1).ok) {
          console.error(JSON.stringify(sessions.at(-1).steps.filter((s) => !s.check.ok), null, 2));
          throw new Error(`${arm} task success failed at session ${i}`);
        }
      }
    } finally {
      await conn.close();
    }
  } else if (arm === "clawql_program") {
    if (!clawqlProgram) throw new Error("clawql_program requires ClawQL with CLAWQL_ENABLE_PROGRAMS=1");
    pid = clawqlProgram.pid;
    settings = {
      CLAWQL_ENABLE_PROGRAMS: "1",
      interpreter: "plan-runner-v0",
      where: "observation_shaped",
      catalog_sqlite: process.env.CLAWQL_CATALOG_SQLITE ?? "1",
    };
    const conn = await connectHttpMcp(clawqlProgram.mcpUrl, arm);
    try {
      const listed = await conn.client.listTools();
      definitionTokens = listed.tools
        .filter((t) => t.name === "execute_program" || t.name === "search" || t.name === "execute")
        .reduce((n, t) => n + countTokens(JSON.stringify(t)), 0);
      for (let i = 1; i <= iters; i++) {
        sessions.push(await runClawqlProgramSession(conn.client, expectations));
        if (shouldSampleMemory(i, iters)) {
          const inv = treeProcessInventory(pid);
          memSamples.push({
            i,
            rss_mb: inv.rss_mb,
            anonymous_mb: inv.anonymous_mb,
            pss_mb: inv.pss_mb,
            process_count: inv.process_count,
            has_rest_mcp: inv.has_rest_mcp,
            processes: inv.processes,
          });
          console.log(`[cf-board] ${arm} ${i}/${iters} ok=${sessions.at(-1).ok}`);
        }
        if (!sessions.at(-1).ok) {
          console.error(JSON.stringify(sessions.at(-1).steps.filter((s) => !s.check.ok), null, 2));
          throw new Error(`${arm} task success failed at session ${i}`);
        }
      }
    } finally {
      await conn.close();
    }
  } else if (arm === "mcpjungle" || arm === "agentgateway") {
    const gw = arm === "mcpjungle" ? mj : ag;
    pid = gw.pid;
    const conn = await connectHttpMcp(gw.mcpUrl, arm);
    try {
      const listed = await conn.client.listTools();
      definitionTokens = listed.tools.reduce((n, t) => n + countTokens(JSON.stringify(t)), 0);
      for (let i = 1; i <= iters; i++) {
        sessions.push(await runAggregatorSession(conn.client, listed.tools, expectations, arm));
        if (shouldSampleMemory(i, iters)) {
          const inv = treeProcessInventory(pid);
          // Aggregators without a live REST→MCP child under-count vs ClawQL (one process does both).
          if (!inv.has_rest_mcp) {
            console.warn(
              `[cf-board] WARN ${arm} session ${i}: process tree missing REST→MCP child (count=${inv.process_count}) — memory sample may under-count`
            );
          }
          memSamples.push({
            i,
            rss_mb: inv.rss_mb,
            anonymous_mb: inv.anonymous_mb,
            pss_mb: inv.pss_mb,
            process_count: inv.process_count,
            has_rest_mcp: inv.has_rest_mcp,
            processes: inv.processes,
          });
          console.log(
            `[cf-board] ${arm} ${i}/${iters} ok=${sessions.at(-1).ok} tree_procs=${inv.process_count} rest_mcp=${inv.has_rest_mcp} anon=${inv.anonymous_mb}`
          );
        }
        if (!sessions.at(-1).ok) {
          console.error(JSON.stringify(sessions.at(-1).steps.filter((s) => !s.check.ok), null, 2));
          throw new Error(`${arm} task success failed at session ${i}`);
        }
      }
    } finally {
      await conn.close();
    }
  } else if (arm === "executor_v2") {
    if (!executorMeta?.deploymentId) {
      throw new Error("executor_v2 requires ensureExecutorOpenapiApp before sessions");
    }
    settings = {
      model: "openapi_tools_host_http",
      app_slug: executorMeta.slug,
      app_id: executorMeta.appId,
      deployment: executorMeta.deploymentId,
      framework: executorMeta.frameworkVersion,
      mock_origin: executorMeta.origin,
    };
    upstream = "mock";
    const url = process.env.EXECUTOR_V2_URL || "http://127.0.0.1:4312/mcp";
    const key =
      process.env.EXECUTOR_V2_API_KEY?.trim() ||
      (existsSync("/tmp/executor-v2-data/api_key.txt")
        ? readFileSync("/tmp/executor-v2-data/api_key.txt", "utf8").trim()
        : "");
    if (!key) throw new Error("EXECUTOR_V2_API_KEY required");
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    });
    const client = new Client({ name: "cf-exec", version: "1" }, {});
    await client.connect(transport);
    try {
      const listed = await client.listTools();
      const executeTool = listed.tools.find((t) => t.name === "execute");
      definitionTokens = executeTool ? countTokens(JSON.stringify(executeTool)) : 0;
      for (let i = 1; i <= iters; i++) {
        sessions.push(await runExecutorV2Session(client, execScripts, expectations));
        if (i % Math.max(1, Math.floor(iters / 10)) === 0 || i === 1 || i === iters) {
          console.log(`[cf-board] ${arm} ${i}/${iters} ok=${sessions.at(-1).ok}`);
        }
        if (!sessions.at(-1).ok) {
          console.error(JSON.stringify(sessions.at(-1).steps.filter((s) => !s.check.ok), null, 2));
          throw new Error(`${arm} task success failed at session ${i}`);
        }
      }
    } finally {
      await client.close().catch(() => {});
    }
  } else if (arm === "cloudflare_codemode") {
    upstream = "none";
    settings = {
      tokens_only: true,
      latency: "N/A",
      definition_source: "cloudflare_docs_~1000_two_tool",
    };
    for (let i = 1; i <= iters; i++) {
      sessions.push(runCloudflareCodemodeTokensOnly(expectations));
    }
    definitionTokens = CLOUDFLARE_CODEMODE_DEFINITION_TOKENS;
  } else {
    throw new Error(`unknown arm ${arm}`);
  }

  const sessionMs = sessions.map((s) => s.session_ms).filter((x) => x != null).sort((a, b) => a - b);
  const resultTok = sessions.map((s) => s.result_tokens_sum);
  const discoveryTok = sessions.map((s) => s.discovery_tokens_sum);
  const codeTok = sessions.map((s) => s.code_tokens_sum);
  const plateau = memSamples.slice(-Math.min(5, memSamples.length));
  const memRss = plateau.map((m) => m.rss_mb).filter((x) => x != null).sort((a, b) => a - b);
  const memAnon = plateau.map((m) => m.anonymous_mb).filter((x) => x != null).sort((a, b) => a - b);
  const memPss = plateau.map((m) => m.pss_mb).filter((x) => x != null).sort((a, b) => a - b);
  const def = definitionTokens ?? 0;
  const discoveryMean = discoveryTok.reduce((a, b) => a + b, 0) / discoveryTok.length;
  const resultMean = resultTok.reduce((a, b) => a + b, 0) / resultTok.length;
  const codeMean = codeTok.reduce((a, b) => a + b, 0) / codeTok.length;
  const combinedMean = def + discoveryMean + resultMean + codeMean;
  const weightedMean = def + discoveryMean + resultMean + CODE_PRICE_WEIGHT * codeMean;
  const combinedAtN = def + discoveryTok.reduce((a, b) => a + b, 0) + resultTok.reduce((a, b) => a + b, 0) + codeTok.reduce((a, b) => a + b, 0);

  return {
    id: arm,
    iters,
    task_success_rate: sessions.filter((s) => s.ok).length / sessions.length,
    settings,
    upstream,
    definition_tokens: def,
    discovery_tokens_mean: discoveryMean,
    result_tokens_mean: resultMean,
    code_tokens_mean: codeMean,
    code_price_weight: CODE_PRICE_WEIGHT,
    /** Rebuildable: definition + discovery + result + code (per-session means). */
    combined_mean: combinedMean,
    /** Price-weighted: definition + discovery + result + weight×code. */
    weighted_mean: weightedMean,
    /** Rebuildable at N: Layer1 once + sum(discovery+result+code) over sessions. */
    combined_at_n: combinedAtN,
    rebuild_check: {
      combined_mean_ok:
        Math.abs(combinedMean - (def + discoveryMean + resultMean + codeMean)) < 1e-6,
      formula: "definition + discovery + result + code",
      weighted_formula: `definition + discovery + result + ${CODE_PRICE_WEIGHT}*code`,
    },
    calls_mean: sessions.reduce((n, s) => n + s.calls_sum, 0) / sessions.length,
    session_ms: {
      p50: percentile(sessionMs, 50),
      p99: percentile(sessionMs, 99),
      p999: percentile(sessionMs, 99.9),
      comparable: upstream === "mock",
      note:
        upstream === "none"
          ? "latency N/A — tokens-only / no upstream"
          : "upstream=mock (same replay fixture as peers)",
    },
    memory_plateau:
      memRss.length || memAnon.length || memPss.length
        ? {
            rss_mb_median: percentile(memRss, 50),
            anonymous_mb_median: percentile(memAnon, 50),
            pss_mb_median: percentile(memPss, 50),
            samples: plateau.length,
          }
        : null,
    /** Full sample trail (session index → tree RSS/anon/PSS) for flatness checks. */
    memory_series: memSamples,
    memory_flatness: memorySeriesFlatness(memSamples),
    /**
     * Fairness: aggregators must show REST→MCP in-tree during sessions.
     * ClawQL is a single server-http process (has_rest_mcp=false is expected).
     */
    memory_process_tree: memSamples.length
      ? {
          samples_with_inventory: memSamples.filter((m) => m.processes).length,
          rest_mcp_present_frac:
            memSamples.filter((m) => m.processes).length > 0
              ? Number(
                  (
                    memSamples.filter((m) => m.has_rest_mcp).length /
                    memSamples.filter((m) => m.processes).length
                  ).toFixed(3)
                )
              : null,
          last_inventory: memSamples.at(-1)?.processes ?? null,
          note:
            arm === "mcpjungle" || arm === "agentgateway"
              ? "Tree must include cf-rest-mcp.mjs (OpenAPI→tools) while the stateful session is open; idle gateway-only (~10–14 MB anon) is not a peer for ClawQL."
              : "ClawQL serves catalog+execute in one Node process — no separate REST→MCP child.",
        }
      : null,
    first_session: sessions[0],
  };
}

async function main() {
  if (!existsSync(FIXTURE)) {
    throw new Error("fixture missing — run generate-synthetic-fixture.mjs");
  }
  if (!existsSync(CURATED_OAS)) {
    throw new Error("curated-openapi.json missing");
  }
  if (!existsSync(join(ROOT, "dist/server-http.js"))) {
    throw new Error("dist/server-http.js missing");
  }

  const recording = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const expectations = buildExpectations(recording.world);
  const openapiDoc = JSON.parse(readFileSync(CURATED_OAS, "utf8"));
  const execScripts = executorV2ToolScripts();
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(
    `[cf-board] iters=${ITERS} reps=${REPS} publish=${IS_PUBLISH_BOARD} latency=${LATENCY} arms=${ARMS.join(",")} fixture=${recording.source}`
  );

  const mock = await startMock();
  const closers = [async () => mock.child.kill("SIGTERM")];
  let clawqlDefault = null;
  let clawqlCompact = null;
  let clawqlProgram = null;
  let mj = null;
  let ag = null;
  let executorMeta = null;

  try {
    const needDefault =
      ARMS.includes("clawql_default") ||
      ARMS.includes("clawql_known_op") ||
      (ARMS.includes("clawql_compact_search") && !ARMS.includes("clawql_default"));
    if (needDefault || ARMS.includes("clawql_known_op") || ARMS.includes("clawql_default")) {
      clawqlDefault = await startClawql(mock.baseUrl, {
        searchCompact: false,
        label: "clawql-default",
      });
      closers.push(clawqlDefault.close);
      console.log(`[cf-board] clawql_default ${clawqlDefault.mcpUrl} SEARCH_COMPACT=0`);
    }
    if (ARMS.includes("clawql_compact_search")) {
      clawqlCompact = await startClawql(mock.baseUrl, {
        searchCompact: true,
        label: "clawql-compact",
      });
      closers.push(clawqlCompact.close);
      console.log(`[cf-board] clawql_compact_search ${clawqlCompact.mcpUrl} SEARCH_COMPACT=1`);
    }
    if (ARMS.includes("clawql_program")) {
      clawqlProgram = await startClawql(mock.baseUrl, {
        searchCompact: false,
        enablePrograms: true,
        label: "clawql-program",
      });
      closers.push(clawqlProgram.close);
      console.log(`[cf-board] clawql_program ${clawqlProgram.mcpUrl} ENABLE_PROGRAMS=1`);
    }
    if (ARMS.includes("mcpjungle")) {
      mj = await startMcpjungle(mock.baseUrl);
      closers.push(mj.close);
      console.log(`[cf-board] mcpjungle ${mj.mcpUrl}`);
    }
    if (ARMS.includes("agentgateway")) {
      ag = await startAgentgateway(mock.baseUrl);
      closers.push(ag.close);
      console.log(`[cf-board] agentgateway ${ag.mcpUrl}`);
    }
    if (ARMS.includes("executor_v2")) {
      console.log(`[cf-board] deploying Executor OpenAPI app → ${mock.baseUrl}`);
      executorMeta = ensureExecutorOpenapiApp({ mockBase: mock.baseUrl, openapiDoc });
      console.log(
        `[cf-board] executor app ${executorMeta.slug} dpl=${executorMeta.deploymentId} origin=${executorMeta.origin}`
      );
    }

    const repBoards = [];
    for (let rep = 1; rep <= REPS; rep++) {
      console.log(`[cf-board] === rep ${rep}/${REPS} ===`);
      const board = {};
      for (const arm of ARMS) {
        console.log(`[cf-board] run ${arm}`);
        board[arm] = await runArmSessions({
          arm,
          mock,
          clawqlDefault,
          clawqlCompact,
          clawqlProgram,
          mj,
          ag,
          expectations,
          iters: ITERS,
          execScripts,
          executorMeta,
        });
      }
      repBoards.push({ rep, board });
      const prefix = IS_PUBLISH_BOARD ? "board" : "smoke";
      const outRep = join(OUT_DIR, `${prefix}-rep${rep}-n${ITERS}.json`);
      writeFileSync(
        outRep,
        JSON.stringify(
          {
            measuredAt: new Date().toISOString(),
            kind: IS_PUBLISH_BOARD ? "publish_board" : "smoke",
            rep,
            iters: ITERS,
            latency_mode: LATENCY,
            fixture: { source: recording.source, label: recording.label, path: FIXTURE },
            tokenizer: "js-tiktoken cl100k_base",
            executor: executorMeta,
            board,
          },
          null,
          2
        ) + "\n"
      );
      console.log(`[cf-board] wrote ${outRep}`);
    }

    const summary = {
      measuredAt: new Date().toISOString(),
      kind: IS_PUBLISH_BOARD ? "publish_board" : "smoke",
      iters: ITERS,
      reps: REPS,
      latency_mode: LATENCY,
      fixture: { source: recording.source, label: recording.label },
      tokenizer: "js-tiktoken cl100k_base",
      arms: ARMS,
      executor: executorMeta,
      product_defaults: {
        clawql_observation_budget_chars:
          process.env.CLAWQL_EXECUTE_OBSERVATION_BUDGET_CHARS ?? "8000 (package default)",
        clawql_observation_budget_note:
          "Default on for ClawQL arms. Lists over budget without where/fields return truncated:true with totalCount; single objects size-truncate (shape:object). Scripted board shapes always pass where.",
        real_model_excludes_hosted_cloudflare_codemode: true,
      },
      range_across_reps: {},
      latest: repBoards.at(-1)?.board,
    };
    for (const arm of ARMS) {
      const rows = repBoards.map((r) => r.board[arm]).filter(Boolean);
      summary.range_across_reps[arm] = {
        task_success_rate: rows.map((r) => r.task_success_rate),
        definition_tokens: rows.map((r) => r.definition_tokens),
        discovery_tokens_mean: rows.map((r) => r.discovery_tokens_mean),
        result_tokens_mean: rows.map((r) => r.result_tokens_mean),
        code_tokens_mean: rows.map((r) => r.code_tokens_mean),
        combined_mean: rows.map((r) => r.combined_mean),
        weighted_mean: rows.map((r) => r.weighted_mean),
        combined_at_n: rows.map((r) => r.combined_at_n),
        session_p50_ms: rows.map((r) => r.session_ms.p50),
        session_p999_ms: rows.map((r) => r.session_ms.p999),
        memory_rss_median: rows.map((r) => r.memory_plateau?.rss_mb_median ?? null),
        memory_anon_median: rows.map((r) => r.memory_plateau?.anonymous_mb_median ?? null),
        memory_pss_median: rows.map((r) => r.memory_plateau?.pss_mb_median ?? null),
        memory_anon_range: rows.map((r) => r.memory_flatness?.anonymous_mb_range ?? null),
        memory_anon_drift: rows.map((r) => r.memory_flatness?.anonymous_mb_drift ?? null),
      };
    }
    const prefix = IS_PUBLISH_BOARD ? "board" : "smoke";
    const summaryPath = join(OUT_DIR, `${prefix}-summary-n${ITERS}-r${REPS}.json`);
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
    writeFileSync(
      `/opt/cursor/artifacts/cloudflare-mt-${prefix}-summary.json`,
      JSON.stringify(summary, null, 2) + "\n"
    );
    console.log(
      JSON.stringify(
        { wrote: summaryPath, kind: summary.kind, arms: ARMS, iters: ITERS, reps: REPS },
        null,
        2
      )
    );
  } finally {
    for (const c of closers.reverse()) {
      try {
        await c();
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
