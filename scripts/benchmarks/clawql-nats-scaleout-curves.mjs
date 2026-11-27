#!/usr/bin/env node
/**
 * ClawQL NATS scale-out curves on the Cloudflare zone-audit known-op workload.
 *
 * Does NOT assume K=4. Sweeps replica counts (default 1,2,4,8) with Bun --smol
 * behind NATS queue-group sticky assign, and reports sustained clients at the
 * same p99 cutoffs as the single-instance HTTP curves (100 / 250 / 500 ms).
 *
 * Usage:
 *   SCALEOUT_WORKERS=1,2,4,8 THRESHOLDS=100,250,500 \
 *     node scripts/benchmarks/clawql-nats-scaleout-curves.mjs
 *
 * Env:
 *   SCALEOUT_WORKERS       comma list (default 1,2,4,8) — try beyond 4; stop early if worse
 *   THRESHOLDS             p99 cutoffs ms (default 100,250,500)
 *   SCALEOUT_STEP_MS       per client-step duration (default 4000)
 *   SCALEOUT_WARMUP        per-client warmup calls (default 4)
 *   SCALEOUT_MAX_CLIENTS   power-of-two climb guard (default 2048)
 *   SCALEOUT_EARLY_STOP=1  stop adding workers when last K is worse at all thresholds (default 1)
 *   BUN_BIN                path to bun (default bun)
 *   COMPREHENSIVE_NATS_SERVER  optional nats-server path
 *   SCALEOUT_OUT           output JSON name under docs/benchmarks/cloudflare-multiturn/
 */

import { existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { spawn, spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { connect as natsConnect, Empty, StringCodec } from "nats";
import { clawqlEqualArmEnv } from "./lib/clawql-bench-env.mjs";
import { FAKE } from "./cloudflare-multiturn/lib/fixture-ids.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CF_HERE = join(ROOT, "scripts/benchmarks/cloudflare-multiturn");
const CURATED = join(CF_HERE, "fixtures/curated-openapi.json");
const MOCK_JS = join(CF_HERE, "mock/cloudflare-replay-mock.mjs");
const FIXTURE = join(CF_HERE, "fixtures/recording.synthetic.json");
const OUT_DIR = join(ROOT, "docs/benchmarks/cloudflare-multiturn");
const OUT_NAME = (process.env.SCALEOUT_OUT ?? "nats-scaleout-bun-curves.json").replace(
  /[^a-zA-Z0-9._-]/g,
  ""
);
const OUT_PATH = join(OUT_DIR, OUT_NAME || "nats-scaleout-bun-curves.json");

const BUN_BIN = process.env.BUN_BIN || "bun";
const WORKERS_LIST = (process.env.SCALEOUT_WORKERS || "1,2,4,8")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 1);
const THRESHOLDS = (process.env.THRESHOLDS || "100,250,500")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => a - b);
const STEP_MS = Math.max(1000, Number(process.env.SCALEOUT_STEP_MS ?? 4000) || 4000);
const WARMUP = Math.max(0, Number(process.env.SCALEOUT_WARMUP ?? 4) || 4);
const MAX_CLIENTS = Math.max(2, Number(process.env.SCALEOUT_MAX_CLIENTS ?? 2048) || 2048);
const BREAK_ERROR_RATE = Math.min(
  1,
  Math.max(0, Number(process.env.SCALEOUT_BREAK_ERROR_RATE ?? 0.02) || 0.02)
);
const EARLY_STOP = process.env.SCALEOUT_EARLY_STOP !== "0";
const LOOSEST = Math.max(...THRESHOLDS);
const OP_ID = process.env.OP_ID || "dns-records-for-a-zone-list-dns-records";
const ZONE = FAKE.auditZoneId;
const ASSIGN_SUBJECT = "clawql.chaos.assign";
const ASSIGN_QUEUE = "clawql-chaos-assign";

const CALL_ARGS = {
  operationId: OP_ID,
  args: { zone_id: ZONE, per_page: 50 },
  where: "{aRecordCount: length(result[?type==`A`])}",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(latencies) {
  const s = [...latencies].sort((a, b) => a - b);
  return {
    n: s.length,
    p50: percentile(s, 50),
    p95: percentile(s, 95),
    p99: percentile(s, 99),
    p999: percentile(s, 99.9),
  };
}

function waitTcp(port, host = "127.0.0.1", timeoutMs = 60_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = createConnection({ port, host }, () => {
        sock.end();
        resolve();
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`tcp timeout :${port}`));
        else setTimeout(tryOnce, 40);
      });
    };
    tryOnce();
  });
}

async function pickPort() {
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function startMock() {
  const child = spawn(process.execPath, [MOCK_JS], {
    env: { ...process.env, FIXTURE, MT_UPSTREAM_LATENCY: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buf = "";
  const ready = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("mock timeout")), 30_000);
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

function findNatsServer() {
  const override = process.env.COMPREHENSIVE_NATS_SERVER?.trim();
  if (override && existsSync(override)) return override;
  const which = spawnSync("which", ["nats-server"], { encoding: "utf8" });
  const p = which.stdout?.trim();
  if (p && existsSync(p)) return p;
  return null;
}

async function startNatsServer() {
  const bin = findNatsServer();
  if (!bin) throw new Error("nats-server not found (set COMPREHENSIVE_NATS_SERVER)");
  const port = await pickPort();
  const store = join(tmpdir(), `nats-scaleout-${process.pid}-${port}`);
  mkdirSync(store, { recursive: true });
  const child = spawn(
    bin,
    ["-a", "127.0.0.1", "-p", String(port), "-js", "-sd", store],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  await sleep(400);
  if (child.exitCode != null) throw new Error("nats-server exited early");
  return {
    url: `nats://127.0.0.1:${port}`,
    close: async () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      await sleep(100);
      try {
        rmSync(store, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

async function startBunReplica(port, home, mockBase) {
  mkdirSync(home, { recursive: true });
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
    CLAWQL_DECLINE_CELLD: "1",
  });
  const server = join(ROOT, "dist/server-http.js");
  if (!existsSync(server)) throw new Error("dist/server-http.js missing — build first");
  if (!existsSync(BUN_BIN) && spawnSync("which", [BUN_BIN]).status !== 0) {
    throw new Error(`bun not found (${BUN_BIN})`);
  }
  const logPath = join(home, "clawql.log");
  const fd = openSync(logPath, "w");
  const child = spawn(BUN_BIN, ["--smol", server], { env, stdio: ["ignore", fd, fd] });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`replica :${port} exited\n${readFileSync(logPath, "utf8").slice(-800)}`);
    }
    if (existsSync(logPath) && readFileSync(logPath, "utf8").includes("listening on")) break;
    await sleep(40);
  }
  await waitTcp(port);
  // Probe MCP before handing out to assigner — catch early crashes.
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
      const client = new Client({ name: `probe-${port}`, version: "1" }, {});
      await client.connect(transport);
      await client.callTool({ name: "execute", arguments: CALL_ARGS });
      await client.close().catch(() => {});
      break;
    } catch (err) {
      if (attempt === 7) throw new Error(`replica :${port} probe failed: ${err}`);
      await sleep(200 * (attempt + 1));
    }
  }
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    pid: child.pid,
    close: async () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      await sleep(80);
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    },
  };
}

async function startAssignWorker(natsUrl, baseUrl) {
  const child = spawn(
    process.execPath,
    [join(ROOT, "scripts/benchmarks/lib/nats-chaos-assign-worker.mjs")],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        CLAWQL_NATS_URL: natsUrl,
        CHAOS_WORKER_BASE_URL: baseUrl,
        CHAOS_ASSIGN_SUBJECT: ASSIGN_SUBJECT,
        CHAOS_ASSIGN_QUEUE: ASSIGN_QUEUE,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("assign worker timeout")), 15_000);
    const onData = (chunk) => {
      if (String(chunk).includes("[nats-chaos-assign] ready")) {
        clearTimeout(timer);
        resolve(undefined);
      }
    };
    child.stderr?.on("data", onData);
    child.stdout?.on("data", onData);
    child.on("error", reject);
  });
  return {
    close: async () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    },
  };
}

async function assignBaseUrl(nc, sc) {
  const msg = await nc.request(ASSIGN_SUBJECT, Empty, { timeout: 5000 });
  return JSON.parse(sc.decode(msg.data)).baseUrl;
}

async function callExecute(client) {
  await client.callTool({ name: "execute", arguments: CALL_ARGS });
}

async function connectStickyClient(nc, sc, name) {
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const baseUrl = await assignBaseUrl(nc, sc);
      const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
      const client = new Client({ name, version: "1" }, {});
      await client.connect(transport);
      return client;
    } catch (err) {
      lastErr = err;
      await sleep(100 * (attempt + 1));
    }
  }
  throw lastErr ?? new Error("connectStickyClient failed");
}

async function measureClients(nc, sc, n, breakP99) {
  const clients = [];
  for (let i = 0; i < n; i++) {
    clients.push(await connectStickyClient(nc, sc, `so-${n}-${i}`));
  }
  for (const c of clients) {
    for (let w = 0; w < WARMUP; w++) {
      try {
        await callExecute(c);
      } catch {
        /* warmup */
      }
    }
  }
  const latencies = [];
  let ok = 0;
  let err = 0;
  const tEnd = performance.now() + STEP_MS;
  await Promise.all(
    clients.map(async (c) => {
      while (performance.now() < tEnd) {
        const t0 = performance.now();
        try {
          await callExecute(c);
          latencies.push(performance.now() - t0);
          ok += 1;
        } catch {
          err += 1;
        }
      }
    })
  );
  for (const c of clients) await c.close().catch(() => {});
  const total = ok + err;
  const errorRate = total > 0 ? err / total : 1;
  const stats = summarize(latencies);
  const broken =
    errorRate > BREAK_ERROR_RATE || (stats.p99 != null && stats.p99 > breakP99);
  const reasons = [];
  if (errorRate > BREAK_ERROR_RATE) reasons.push(`error_rate ${errorRate.toFixed(3)}`);
  if (stats.p99 != null && stats.p99 > breakP99) reasons.push(`p99 ${stats.p99.toFixed(1)}ms`);
  return {
    concurrency: n,
    ok,
    err,
    error_rate: Number(errorRate.toFixed(4)),
    rps: Number((ok / (STEP_MS / 1000)).toFixed(1)),
    latency: stats,
    broken,
    break_reason: broken ? reasons.join(" + ") || "slo" : null,
  };
}

function stepOkAt(step, threshold) {
  return (
    !step.broken ||
    (step.latency?.p99 != null &&
      step.latency.p99 <= threshold &&
      step.error_rate <= BREAK_ERROR_RATE)
  );
}

/** Re-evaluate a measured step against a looser threshold (same climb). */
function okAtThreshold(step, threshold) {
  return (
    step.error_rate <= BREAK_ERROR_RATE &&
    step.latency?.p99 != null &&
    step.latency.p99 <= threshold
  );
}

async function refineAtThreshold(nc, sc, lastOk, firstBreak, threshold, refineSteps) {
  let lo = lastOk;
  let hi = firstBreak;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    console.error(`[scaleout] refine @${threshold}ms clients=${mid} (lo=${lo} hi=${hi})`);
    const step = await measureClients(nc, sc, mid, threshold);
    refineSteps.push({ ...step, phase: "refine", threshold_ms: threshold });
    if (okAtThreshold(step, threshold)) lo = mid;
    else hi = mid;
  }
  return { last_ok: lo, first_break: hi };
}

async function runWorkerCount(mock, workers) {
  console.error(`\n[scaleout] === workers=${workers} bun --smol · CF known-op ===`);
  const nats = await startNatsServer();
  const replicas = [];
  const assigners = [];
  const sc = StringCodec();
  let nc;
  const climbSteps = [];
  const refineByThreshold = {};
  const clientsAt = {};

  try {
    // Fresh port block per worker-count so prior runs cannot collide.
    const basePort = 20000 + (workers * 40) + (process.pid % 200);
    for (let i = 0; i < workers; i++) {
      const port = basePort + i;
      const home = join(tmpdir(), `clawql-so-w${workers}-${i}-${process.pid}-${Date.now()}`);
      const replica = await startBunReplica(port, home, mock.baseUrl);
      replicas.push(replica);
      assigners.push(await startAssignWorker(nats.url, replica.baseUrl));
      // Stagger so catalog OOP builds do not stampede.
      await sleep(150);
    }
    await sleep(300);
    nc = await natsConnect({ servers: nats.url });
    const probe = await assignBaseUrl(nc, sc);
    if (!String(probe).startsWith("http://127.0.0.1:")) throw new Error(`bad assign ${probe}`);
    // End-to-end sticky probe before the climb.
    {
      const c = await connectStickyClient(nc, sc, `so-probe-w${workers}`);
      await callExecute(c);
      await c.close().catch(() => {});
    }

    // Climb until break at loosest threshold (records p99 at every step).
    let lastOkLoose = 0;
    let firstBreakLoose = null;
    for (let n = 1; n <= MAX_CLIENTS; n = n < 64 ? n * 2 : n + (n >= 256 ? 64 : 32)) {
      console.error(`[scaleout] w=${workers} climb clients=${n} (break@${LOOSEST}ms)`);
      const step = await measureClients(nc, sc, n, LOOSEST);
      climbSteps.push({ ...step, phase: "climb" });
      console.error(
        `[scaleout] w=${workers} n=${n} p99=${step.latency.p99?.toFixed?.(1)} err=${step.error_rate} rps=${step.rps} broken=${step.broken}`
      );
      if (!step.broken) lastOkLoose = n;
      else {
        firstBreakLoose = n;
        break;
      }
    }
    if (firstBreakLoose == null) {
      firstBreakLoose = lastOkLoose + 1;
    }
    if (lastOkLoose === 0) {
      for (const t of THRESHOLDS) clientsAt[String(t)] = 0;
      return {
        workers,
        clients_at_threshold: clientsAt,
        climb_steps: climbSteps,
        refine: refineByThreshold,
        peak_rps: Math.max(0, ...climbSteps.map((s) => s.rps || 0)),
        host_note: "broke at first client",
      };
    }

    for (const t of THRESHOLDS) {
      // Seed lo/hi from climb steps for this threshold.
      let lo = 0;
      let hi = firstBreakLoose;
      for (const s of climbSteps) {
        if (okAtThreshold(s, t)) lo = Math.max(lo, s.concurrency);
        else if (s.concurrency > lo) {
          hi = Math.min(hi, s.concurrency);
          break;
        }
      }
      if (lo === 0) {
        clientsAt[String(t)] = 0;
        continue;
      }
      if (hi <= lo) hi = lo + 1;
      const refineSteps = [];
      const refined = await refineAtThreshold(nc, sc, lo, hi, t, refineSteps);
      refineByThreshold[String(t)] = { ...refined, steps: refineSteps };
      clientsAt[String(t)] = refined.last_ok;
      console.error(`[scaleout] w=${workers} @${t}ms → ${refined.last_ok} clients`);
    }

    return {
      workers,
      runtime: "bun --smol",
      clients_at_threshold: clientsAt,
      climb_steps: climbSteps,
      refine: refineByThreshold,
      peak_rps: Math.max(0, ...climbSteps.map((s) => s.rps || 0)),
      replica_pids: replicas.map((r) => r.pid),
    };
  } finally {
    if (nc) await nc.close().catch(() => {});
    for (const a of assigners) await a.close().catch(() => {});
    for (const r of replicas) await r.close().catch(() => {});
    await nats.close().catch(() => {});
  }
}

function allThresholdsWorse(prev, next) {
  if (!prev?.clients_at_threshold || !next?.clients_at_threshold) return false;
  return THRESHOLDS.every((t) => {
    const a = prev.clients_at_threshold[String(t)] ?? 0;
    const b = next.clients_at_threshold[String(t)] ?? 0;
    return b <= a;
  });
}

function pickBest(byWorkers) {
  const best = {};
  for (const t of THRESHOLDS) {
    let top = { workers: null, clients: -1 };
    for (const row of byWorkers) {
      const c = row.clients_at_threshold?.[String(t)] ?? 0;
      if (c > top.clients) top = { workers: row.workers, clients: c, peak_rps: row.peak_rps };
    }
    best[String(t)] = top;
  }
  return best;
}

async function main() {
  if (!existsSync(CURATED) || !existsSync(MOCK_JS) || !existsSync(FIXTURE)) {
    throw new Error("cloudflare-multiturn fixtures/mock missing");
  }
  if (!existsSync(join(ROOT, "dist/server-http.js"))) {
    throw new Error("dist/server-http.js missing — npm run build");
  }

  const host = {
    nproc: Number(spawnSync("nproc", { encoding: "utf8" }).stdout?.trim()) || null,
    mem_available_mb: (() => {
      try {
        const t = readFileSync("/proc/meminfo", "utf8");
        const m = t.match(/^MemAvailable:\s+(\d+)/m);
        return m ? Math.round(Number(m[1]) / 1024) : null;
      } catch {
        return null;
      }
    })(),
    bun: spawnSync(BUN_BIN, ["--version"], { encoding: "utf8" }).stdout?.trim() || null,
  };

  console.error(
    `[scaleout] host nproc=${host.nproc} memAvail=${host.mem_available_mb}MB bun=${host.bun}`
  );
  console.error(`[scaleout] workers=${WORKERS_LIST.join(",")} thresholds=${THRESHOLDS.join(",")}`);

  const mock = await startMock();
  const byWorkers = [];
  const writePartial = async () => {
    const best = pickBest(byWorkers);
    const partial = {
      measuredAt: new Date().toISOString(),
      partial: true,
      best_by_threshold: best,
      by_workers: byWorkers.map((r) => ({
        workers: r.workers,
        clients_at_threshold: r.clients_at_threshold,
        peak_rps: r.peak_rps,
        early_stop_reason: r.early_stop_reason ?? null,
        error: r.error ?? null,
      })),
    };
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(OUT_PATH, JSON.stringify({ ...partial, detail: byWorkers }, null, 2) + "\n");
  };
  try {
    let prev = null;
    for (const w of WORKERS_LIST) {
      let row;
      try {
        row = await runWorkerCount(mock, w);
      } catch (err) {
        console.error(`[scaleout] workers=${w} FAILED:`, err);
        row = {
          workers: w,
          clients_at_threshold: Object.fromEntries(THRESHOLDS.map((t) => [String(t), 0])),
          peak_rps: 0,
          error: String(err?.stack || err),
        };
      }
      byWorkers.push(row);
      await writePartial();
      if (row.error) {
        console.error(`[scaleout] continuing after workers=${w} failure`);
        continue;
      }
      if (EARLY_STOP && prev && allThresholdsWorse(prev, row)) {
        console.error(
          `[scaleout] early-stop: workers=${w} ≤ workers=${prev.workers} at every threshold (contention likely)`
        );
        row.early_stop_reason = "not_better_than_previous_worker_count";
        break;
      }
      prev = row;
    }
  } finally {
    await mock.close();
  }

  const best = pickBest(byWorkers);
  const report = {
    measuredAt: new Date().toISOString(),
    topology: "NATS_queue_assign_sticky_http",
    workflow: "cloudflare-multiturn known-op (dns list + where A-count)",
    runtime: "bun --smol",
    claim_rules: [
      "Replica count is measured, not assumed — sweep SCALEOUT_WORKERS (default 1,2,4,8).",
      "Same p99 cutoffs as single-instance HTTP curves (100/250/500).",
      "Old ~135 @100ms was 4× Node on an earlier build; do not cite beside Bun 434 without labels.",
      "Host-bound: if nproc < workers, contention can make more replicas worse.",
    ],
    host,
    slo: {
      thresholds_p99_ms: THRESHOLDS,
      break_error_rate: BREAK_ERROR_RATE,
      step_ms: STEP_MS,
      warmup: WARMUP,
    },
    single_instance_reference: {
      source: "docs/benchmarks/cloudflare-multiturn/http-concurrency-curves.json",
      clawql_bun_smol_at_100_250_500: { 100: 82, 250: 211, 500: 434 },
      note: "Topology A — one Bun process, HTTP multiplex",
    },
    historical_scaleout_reference: {
      source: "docs/benchmarks/executor-comparison/executor-cmp-chaos-clawql-ceiling-refine.json",
      workers: 4,
      runtime: "node",
      workflow: "pets equal-arm (executor-comparison)",
      sustained_at_p99_100ms: 135,
      note: "Different workflow + runtime + build — label or retire beside current Bun curves",
    },
    best_by_threshold: best,
    by_workers: byWorkers.map((r) => ({
      workers: r.workers,
      clients_at_threshold: r.clients_at_threshold,
      peak_rps: r.peak_rps,
      early_stop_reason: r.early_stop_reason ?? null,
    })),
    detail: byWorkers,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ best_by_threshold: best, by_workers: report.by_workers, out: OUT_PATH }, null, 2));
  console.error(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
