#!/usr/bin/env node
/**
 * Stdio process-per-client concurrency curves (Cloudflare board topology).
 *
 * Fair peer for Executor v1 (stdio MCP) — NOT the HTTP multiplex table.
 * Each "client" is its own stdio MCP process:
 *   - clawql_known_op_stdio: node dist/server.js (known-op + where)
 *   - executor_v1_stdio: executor mcp → local daemon
 *
 *   CURVE=1 THRESHOLDS=100,250,500 REPS=3 CONC_STEP_MS=10000 \
 *     ARMS=clawql_known_op_stdio,executor_v1_stdio \
 *     OUT=docs/benchmarks/cloudflare-multiturn/stdio-concurrency-curves.json \
 *     node scripts/benchmarks/cloudflare-multiturn/stdio-concurrency-curves.mjs
 *
 * Memory at each step = sum of all client process trees (+ v1 daemon once).
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { clawqlEqualArmEnv } from "../lib/clawql-bench-env.mjs";
import { FAKE } from "./lib/fixture-ids.mjs";
import { CLAWQL_STEP_SHAPES } from "./lib/clawql-shapes.mjs";
import { ensureExecutorV1Openapi } from "./lib/ensure-executor-v1-openapi.mjs";
import { executorV1ToolScripts } from "./code-mode/published-scripts.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const HERE = join(ROOT, "scripts/benchmarks/cloudflare-multiturn");
const CURATED = join(HERE, "fixtures/curated-openapi.json");
const MOCK_JS = join(HERE, "mock/cloudflare-replay-mock.mjs");
const FIXTURE = join(HERE, "fixtures/recording.synthetic.json");
const SERVER_JS = join(ROOT, "dist/server.js");

const BREAK_P99_MS = Math.max(1, Number(process.env.BREAK_P99_MS || 100) || 100);
const BREAK_ERROR_RATE = Math.min(
  1,
  Math.max(0, Number(process.env.BREAK_ERROR_RATE ?? 0.02) || 0.02)
);
const CONC_STEP_MS = Math.max(1000, Number(process.env.CONC_STEP_MS || 10000) || 10000);
const CONC_WARMUP = Math.max(0, Number(process.env.CONC_WARMUP || 2) || 2);
const REPS = Math.max(1, Number(process.env.REPS || 1) || 1);
const CURVE = ["1", "true", "yes"].includes((process.env.CURVE ?? "1").trim().toLowerCase());
/** Loop guard only — process-per-client memory grows fast; climb still stops on p99/errors. */
const CONC_HARD_MAX = Math.max(
  2,
  Number(process.env.CONC_HARD_MAX || (CURVE ? 512 : 64)) || (CURVE ? 512 : 64)
);
const THRESHOLDS = (process.env.THRESHOLDS || "100,250,500")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => a - b);
const CURVE_STOP_P99_MS = Math.max(BREAK_P99_MS, ...THRESHOLDS);
const NODE_OLD_MB = Number(process.env.CLAWQL_NODE_OLD_MB || 256) || 256;
const ARMS = (
  process.env.ARMS || "clawql_known_op_stdio,executor_v1_stdio"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const OUT =
  process.env.OUT ||
  join(ROOT, "docs/benchmarks/cloudflare-multiturn/stdio-concurrency-curves.json");

const ZONE = FAKE.auditZoneId;
const DNS_SHAPE = CLAWQL_STEP_SHAPES[4];

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
function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
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
function cmdlineOf(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim();
  } catch {
    return "";
  }
}
function childPids(pid) {
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
}
function processTreePids(rootPid) {
  if (rootPid == null) return [];
  const seen = new Set();
  const q = [rootPid];
  while (q.length) {
    const p = q.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    q.push(...childPids(p));
  }
  return [...seen];
}
function transportPid(transport) {
  if (typeof transport?.pid === "number") return transport.pid;
  if (typeof transport?._process?.pid === "number") return transport._process.pid;
  return null;
}
function findExecutorV1DaemonPid() {
  if (process.env.EXECUTOR_V1_DAEMON_PID) {
    const n = Number(process.env.EXECUTOR_V1_DAEMON_PID);
    return Number.isFinite(n) ? n : null;
  }
  for (const ent of readdirSync("/proc")) {
    if (!/^\d+$/.test(ent)) continue;
    try {
      const cmd = readFileSync(`/proc/${ent}/cmdline`, "utf8").replace(/\0/g, " ");
      if (/\bexecutor\b/.test(cmd) && /\bdaemon\b/.test(cmd)) return Number(ent);
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Sum smaps over many roots (all stdio clients + optional daemon). */
function multiTreeMemory(rootPids) {
  const seen = new Set();
  let rss = 0;
  let anon = 0;
  let pss = 0;
  let counted = 0;
  for (const root of rootPids.filter((p) => p != null)) {
    for (const pid of processTreePids(root)) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const s = smaps(pid);
      if (!s) continue;
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
    root_count: rootPids.filter((p) => p != null).length,
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

function stepOkAtThreshold(step, thresholdMs) {
  if (step.error_rate > BREAK_ERROR_RATE) return false;
  const p99 = step.latency_ms?.p99;
  if (p99 == null) return false;
  return p99 <= thresholdMs;
}

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
    anon_mb_at_sustained: atOk?.memory?.anonymous_mb ?? null,
    rss_mb_at_sustained: atOk?.memory?.rss_mb ?? null,
  };
}

function saturationThroughput(allSteps) {
  const ok = allSteps.filter((s) => s.error_rate <= BREAK_ERROR_RATE && s.rps != null);
  if (!ok.length) return null;
  const best = ok.reduce((a, b) => (b.rps > a.rps ? b : a));
  return {
    peak_rps: best.rps,
    at_clients: best.concurrency,
    p99_ms: best.latency_ms?.p99 ?? null,
    anon_mb: best.memory?.anonymous_mb ?? null,
  };
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

function v1Env() {
  const env = { ...process.env };
  for (const k of [
    "EXECUTOR_API_KEY",
    "EXECUTOR_AUTH_TOKEN",
    "EXECUTOR_V2_API_KEY",
    "EXECUTOR_HOST",
    "EXECUTOR_ENCRYPTION_KEY",
  ]) {
    delete env[k];
  }
  env.EXECUTOR_DATA_DIR =
    process.env.EXECUTOR_V1_DATA_DIR || process.env.EXECUTOR_DATA_DIR || "/tmp/executor-v1-data";
  return env;
}

async function connectClawqlStdio(mockBase, { index, oldMb = NODE_OLD_MB } = {}) {
  const home = join(tmpdir(), `stdio-conc-clawql-${process.pid}-${index}-${Date.now()}`);
  mkdirSync(home, { recursive: true });
  const env = clawqlEqualArmEnv({ home, specPath: CURATED, apiBase: mockBase });
  Object.assign(env, {
    CLOUDFLARE_API_TOKEN: "bench-fake-token",
    CLAWQL_CATALOG_SQLITE: "1",
    CLAWQL_SEARCH_COMPACT: "0",
    CLAWQL_ENABLE_PROGRAMS: "0",
  });
  const args = [];
  if (oldMb > 0) args.push(`--max-old-space-size=${oldMb}`);
  args.push(SERVER_JS);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    cwd: ROOT,
    stderr: "pipe",
    env,
  });
  const client = new Client({ name: `stdio-clawql-${index}`, version: "1" }, {});
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("clawql Ready timeout")), 120_000);
    transport.stderr?.on("data", (chunk) => {
      if (chunk.toString().includes("[clawql-mcp] Ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  await client.connect(transport);
  await ready;
  return {
    client,
    pid: transportPid(transport),
    home,
    close: async () => {
      await client.close().catch(() => {});
      try {
        rmSync(home, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

async function connectExecutorV1Stdio({ index, bin, cwd } = {}) {
  const transport = new StdioClientTransport({
    command: bin,
    args: ["mcp", "--mode", "codemode", "--elicitation-mode", "model"],
    cwd,
    stderr: "pipe",
    env: v1Env(),
  });
  const client = new Client({ name: `stdio-exec-v1-${index}`, version: "1" }, {});
  await client.connect(transport);
  return {
    client,
    pid: transportPid(transport),
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

async function chaosStep(arm, n) {
  const clients = [];
  try {
    // Parallel connect (batch) — sequential N×catalog load is too slow.
    const batch = Math.max(1, Number(process.env.CONNECT_BATCH || 8) || 8);
    for (let i = 0; i < n; i += batch) {
      const slice = [];
      for (let j = i; j < Math.min(n, i + batch); j++) {
        slice.push(arm.connectClient(j));
      }
      clients.push(...(await Promise.all(slice)));
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
            const res = await c.client.callTool({
              name: arm.toolName,
              arguments: arm.callArgs,
            });
            latencies.push(performance.now() - t0);
            if (res?.isError) err += 1;
            else ok += 1;
          } catch {
            err += 1;
          }
        }
      })
    );
    const roots = clients.map((c) => c.pid);
    if (arm.extraMemoryPids) roots.push(...arm.extraMemoryPids());
    const memory = multiTreeMemory(roots);
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
      memory,
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
    if (n >= 16) await new Promise((r) => setTimeout(r, 1500));
  }
}

async function chaosArm(arm) {
  console.error(
    `[stdio-conc] === ${arm.id} === (process-per-client; climb until p99/errors; loop_guard=${CONC_HARD_MAX})`
  );
  const stopP99 = CURVE ? CURVE_STOP_P99_MS : BREAK_P99_MS;
  const steps = [];
  let refine = [];
  let censoredAt = null;
  let firstBreakPrimary = null;

  for (let n = 1; n <= CONC_HARD_MAX; ) {
    console.error(
      `[stdio-conc] ${arm.id} clients=${n} avail_mb=${memAvailableMb()?.toFixed?.(0) ?? "?"}`
    );
    let step;
    try {
      step = await chaosStep(arm, n);
    } catch (e) {
      console.error(`[stdio-conc] ${arm.id} step failed at n=${n}: ${e?.message || e}`);
      censoredAt = n;
      break;
    }
    steps.push(step);
    console.error(
      `[stdio-conc] ${arm.id} n=${n} p99=${step.latency_ms.p99?.toFixed?.(1)} err=${step.error_rate} anon=${step.memory?.anonymous_mb} procs=${step.memory?.process_count}`
    );
    try {
      writeFileSync(
        OUT + ".checkpoint.json",
        JSON.stringify(
          {
            measuredAt: new Date().toISOString(),
            arm_id: arm.id,
            topology: "stdio_process_per_client",
            steps,
            avail_mb: memAvailableMb(),
          },
          null,
          2
        ) + "\n"
      );
    } catch {
      /* ignore */
    }
    if (!stepOkAtThreshold(step, BREAK_P99_MS) && firstBreakPrimary == null) {
      firstBreakPrimary = { concurrency: n, reason: step.break_reason };
    }
    if (step.error_rate > BREAK_ERROR_RATE) break;
    if (step.latency_ms?.p99 != null && step.latency_ms.p99 > stopP99) break;
    if (!CURVE && step.broken) break;
    // Denser steps once memory is climbing hard (stdio topology).
    if (CURVE && n >= 32) n += 8;
    else if (CURVE && n >= 16) n += 8;
    else n *= 2;
  }

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
    while (hi - lo > 1 && guard++ < 24) {
      const mid = Math.floor((lo + hi) / 2);
      const existing = [...steps, ...refine].find((s) => s.concurrency === mid);
      if (existing) {
        if (stepOkAtThreshold(existing, T)) lo = mid;
        else hi = mid;
        continue;
      }
      console.error(`[stdio-conc] ${arm.id} refine@${T}ms mid=${mid} (lo=${lo} hi=${hi})`);
      let step;
      try {
        step = await chaosStep(arm, mid);
      } catch (e) {
        console.error(`[stdio-conc] ${arm.id} refine failed: ${e?.message || e}`);
        hi = mid;
        continue;
      }
      refine.push(step);
      console.error(
        `[stdio-conc] ${arm.id} refine@${T}ms n=${mid} p99=${step.latency_ms.p99?.toFixed?.(1)} ok=${stepOkAtThreshold(step, T)} anon=${step.memory?.anonymous_mb}`
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
      anon_mb: s.memory?.anonymous_mb ?? null,
      rss_mb: s.memory?.rss_mb ?? null,
      process_count: s.memory?.process_count ?? null,
    }));
  return {
    id: arm.id,
    kind: arm.kind,
    runtime: arm.runtime,
    topology: "stdio_process_per_client",
    toolName: arm.toolName,
    note: arm.note ?? null,
    loop_guard: CONC_HARD_MAX,
    host_censored_at_clients: censoredAt,
    sustained_concurrency_before_break: primary.sustained_concurrency,
    first_break_clients: primary.first_break_clients ?? firstBreakPrimary?.concurrency ?? null,
    break_reason: primary.break_reason ?? firstBreakPrimary?.reason ?? null,
    thresholds: byThreshold,
    saturation: saturationThroughput(allSteps),
    curve,
    steps: allSteps,
  };
}

async function main() {
  if (!existsSync(SERVER_JS)) throw new Error("dist/server.js missing");
  if (!existsSync(CURATED)) throw new Error("curated-openapi.json missing");
  mkdirSync(dirname(OUT), { recursive: true });

  const mock = await startMock();
  const closers = [mock.close];
  let executorV1Meta = null;
  const openapiDoc = JSON.parse(readFileSync(CURATED, "utf8"));

  try {
    if (ARMS.includes("executor_v1_stdio")) {
      console.error(`[stdio-conc] ensuring Executor v1 OpenAPI → ${mock.baseUrl}`);
      executorV1Meta = await ensureExecutorV1Openapi({
        mockBase: mock.baseUrl,
        openapiDoc,
      });
      console.error(
        `[stdio-conc] executor_v1 slug=${executorV1Meta.slug} conn=${executorV1Meta.connectionName}`
      );
    }

    const armFactories = {
      clawql_known_op_stdio: () => ({
        id: "clawql_known_op_stdio",
        kind: "clawql",
        runtime: "node_stdio",
        toolName: "execute",
        callArgs: {
          operationId: DNS_SHAPE.operationId,
          args: DNS_SHAPE.args,
          where: DNS_SHAPE.where,
        },
        note: `stdio process-per-client; Node --max-old-space-size=${NODE_OLD_MB}; known-op + where (DNS A-count).`,
        connectClient: (index) =>
          connectClawqlStdio(mock.baseUrl, { index, oldMb: NODE_OLD_MB }),
        extraMemoryPids: () => [],
      }),
      executor_v1_stdio: () => {
        if (!executorV1Meta) throw new Error("executor_v1 meta missing");
        const scripts = executorV1ToolScripts({
          appSlug: executorV1Meta.slug,
          connectionName: executorV1Meta.connectionName,
        });
        const bin = executorV1Meta.bin;
        const cwd = executorV1Meta.cwd;
        return {
          id: "executor_v1_stdio",
          kind: "executor_v1",
          runtime: "executor_1.6_stdio",
          toolName: "execute",
          callArgs: { code: scripts[4], timeoutMs: 30_000 },
          note: "stdio process-per-client; each client = executor mcp; memory includes shared daemon once.",
          connectClient: (index) => connectExecutorV1Stdio({ index, bin, cwd }),
          extraMemoryPids: () => [findExecutorV1DaemonPid()],
        };
      },
    };

    const reps = [];
    for (let r = 1; r <= REPS; r++) {
      console.error(`[stdio-conc] === rep ${r}/${REPS} ===`);
      const arms = {};
      for (const name of ARMS) {
        const factory = armFactories[name];
        if (!factory) throw new Error(`unknown arm ${name}`);
        arms[name] = await chaosArm(factory());
        // Flush partial so a later OOM keeps completed arms.
        const partial = {
          measuredAt: new Date().toISOString(),
          topology: "stdio_process_per_client",
          rep: r,
          arms,
        };
        writeFileSync(OUT + `.rep${r}.partial.json`, JSON.stringify(partial, null, 2) + "\n");
      }
      reps.push({ rep: r, arms });
    }

    const ranges_by_threshold = {};
    for (const T of THRESHOLDS) {
      const key = String(T);
      const byArm = {};
      for (const name of ARMS) {
        const vals = reps
          .map((r) => r.arms[name]?.thresholds?.[key]?.sustained_concurrency)
          .filter((x) => x != null);
        const anons = reps
          .map((r) => r.arms[name]?.thresholds?.[key]?.anon_mb_at_sustained)
          .filter((x) => x != null);
        byArm[name] = {
          sustained: vals,
          median: vals.length
            ? [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)]
            : null,
          min: vals.length ? Math.min(...vals) : null,
          max: vals.length ? Math.max(...vals) : null,
          anon_mb_at_sustained: anons,
          anon_mb_median: anons.length
            ? [...anons].sort((a, b) => a - b)[Math.floor(anons.length / 2)]
            : null,
        };
      }
      ranges_by_threshold[key] = byArm;
    }

    const report = {
      measuredAt: new Date().toISOString(),
      topology: "stdio_process_per_client",
      label: "Clients over stdio (one process per client)",
      honesty: [
        "Different topology from HTTP Streamable multiplex curves — do not place in the same table cells.",
        "Each client owns one stdio MCP OS process. ClawQL: node dist/server.js. Executor v1: executor mcp → shared daemon.",
        "Memory = sum of all client process trees (+ Executor daemon once).",
        "Same Cloudflare DNS list call as HTTP concurrency (ClawQL known-op+where; Executor v1 code-mode step 4).",
        "Climb until p99/errors break; CONC_HARD_MAX is a loop guard only.",
      ],
      slo: {
        break_p99_ms: BREAK_P99_MS,
        break_error_rate: BREAK_ERROR_RATE,
        step_ms: CONC_STEP_MS,
        warmup: CONC_WARMUP,
        loop_guard: CONC_HARD_MAX,
        thresholds_p99_ms: THRESHOLDS,
        curve_stop_p99_ms: CURVE_STOP_P99_MS,
        clawql_node_max_old_space_mb: NODE_OLD_MB,
      },
      reps: REPS,
      arms: ARMS,
      executor_v1: executorV1Meta,
      ranges_by_threshold,
      saturation_by_arm: Object.fromEntries(
        ARMS.map((name) => {
          const peaks = reps
            .map((r) => r.arms[name]?.saturation?.peak_rps)
            .filter((x) => x != null);
          return [
            name,
            {
              peak_rps: peaks,
              median: peaks.length
                ? [...peaks].sort((a, b) => a - b)[Math.floor(peaks.length / 2)]
                : null,
            },
          ];
        })
      ),
      runs: reps,
    };

    writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
    writeFileSync(
      "/opt/cursor/artifacts/stdio-concurrency-curves.json",
      JSON.stringify(report, null, 2) + "\n"
    );
    console.log(JSON.stringify({ wrote: OUT, arms: ARMS, reps: REPS, ranges_by_threshold }, null, 2));
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
