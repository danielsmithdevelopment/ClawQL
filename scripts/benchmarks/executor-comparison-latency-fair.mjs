#!/usr/bin/env node
/**
 * Fair equal-arm latency (answers Executor-side methodology critique).
 *
 * Definition (identical for both arms):
 *   gateway_cost = MCP_execute_wall − upstream_cost
 *   - ClawQL: upstream_cost = same-host mock HTTP (paired per sample: execute_i − direct_i)
 *   - Executor: upstream_cost = 0 (sandbox cannot fetch; returns same JSON in-process)
 *
 * Default schedule: interleaved closed-loop rounds
 *   clawql execute → executor execute → direct fetch  (repeat)
 * so machine drift hits both arms equally.
 *
 * Optional open-loop (coordinated-omission aware):
 *   LATENCY_OPEN_LOOP=1 LATENCY_ARRIVAL_MS=5
 *   fires rounds on a fixed schedule; latency = completion − scheduled_start.
 *
 * Multi-run spread:
 *   LATENCY_RUNS=3  → report min/median/max of per-run p50/p99/p999
 *
 * Governance arm (optional third ClawQL path):
 *   LATENCY_GOVERNANCE=1 → CLAWQL_WORM_ENABLED=1 + CLAWQL_WORM_LOCAL=memory
 *   Label as **in-memory WORM** — not the production durable write path.
 *   Panguard sidecar still off unless you wire CLAWQL_PANGUARD_*; always disclose.
 *
 * Usage:
 *   EXECUTOR_BIN=…/executor EXECUTOR_CWD=… \
 *     LATENCY_ITERS=2000 LATENCY_RUNS=3 \
 *     node scripts/benchmarks/executor-comparison-latency-fair.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "executor-comparison");
const OUT_NAME = (process.env.LATENCY_OUT ?? "executor-cmp-latency-fair.json").replace(
  /[^a-zA-Z0-9._-]/g,
  ""
);
const OUT_PATH = join(OUT_DIR, OUT_NAME || "executor-cmp-latency-fair.json");

const ITERS = Math.max(5, Number(process.env.LATENCY_ITERS ?? 1000) || 1000);
const WARMUP = Math.max(0, Number(process.env.LATENCY_WARMUP ?? 50) || 50);
const RUNS = Math.max(1, Number(process.env.LATENCY_RUNS ?? 1) || 1);
const MOCK_DELAY_MS = Math.max(0, Number(process.env.MOCK_DELAY_MS ?? 0) || 0);
const OPEN_LOOP = process.env.LATENCY_OPEN_LOOP === "1";
const ARRIVAL_MS = Math.max(0.5, Number(process.env.LATENCY_ARRIVAL_MS ?? 5) || 5);
const GOVERNANCE = process.env.LATENCY_GOVERNANCE === "1";
const KEEP_SAMPLES =
  process.env.LATENCY_KEEP_SAMPLES === "1"
    ? true
    : process.env.LATENCY_KEEP_SAMPLES === "0"
      ? false
      : ITERS * RUNS <= 500;

const EQUAL_PAYLOAD = {
  pets: [
    { id: 1, name: "Ada", status: "available" },
    { id: 2, name: "Grace", status: "available" },
  ],
};
const EXECUTOR_EQUAL_CODE = `return ${JSON.stringify(EQUAL_PAYLOAD)};`;

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

function summarize(samples) {
  if (!samples.length) {
    return {
      n: 0,
      p50_ms: null,
      p95_ms: null,
      p99_ms: null,
      p999_ms: null,
      mean_ms: null,
      min_ms: null,
      max_ms: null,
    };
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

function spreadOf(values) {
  const sorted = [...values].filter((v) => v != null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return {
    min: sorted[0],
    median: percentile(sorted, 50),
    max: sorted[sorted.length - 1],
    n: sorted.length,
  };
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

function readVersions() {
  let clawqlVersion = null;
  let clawqlCommit = null;
  let clawqlBranch = null;
  let executorVersion = null;
  try {
    clawqlVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  } catch {
    /* ignore */
  }
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  if (head.status === 0) clawqlCommit = head.stdout.trim();
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (branch.status === 0) clawqlBranch = branch.stdout.trim();
  const execCwd = process.env.EXECUTOR_CWD?.trim();
  if (execCwd) {
    try {
      executorVersion = JSON.parse(
        readFileSync(join(execCwd, "node_modules/executor/package.json"), "utf8")
      ).version;
    } catch {
      try {
        executorVersion = JSON.parse(readFileSync(join(execCwd, "package.json"), "utf8")).version;
      } catch {
        /* ignore */
      }
    }
  }
  return {
    clawql: { version: clawqlVersion, commit: clawqlCommit, branch: clawqlBranch },
    executor: { version: executorVersion, bin: process.env.EXECUTOR_BIN?.trim() ?? null },
    node: process.version,
    measuredAt: new Date().toISOString(),
  };
}

async function startMockUpstream() {
  const body = JSON.stringify(EQUAL_PAYLOAD);
  const server = createServer(async (_req, res) => {
    await sleep(MOCK_DELAY_MS);
    res.writeHead(200, { "content-type": "application/json", "x-equal-payload": "1" });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const specPath = join("/tmp", `clawql-latency-fair-${process.pid}.json`);
  await writeFile(
    specPath,
    JSON.stringify(
      {
        openapi: "3.0.3",
        info: { title: "LatencyFairPetstore", version: "1" },
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
    bodyBytes: Buffer.byteLength(body),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function clawqlEnv(measureHome, specPath, apiBase, governance) {
  const env = {
    ...process.env,
    CLAWQL_HOME: measureHome,
    CLAWQL_OBSIDIAN_VAULT_PATH: measureHome,
    CLAWQL_SPEC_PATH: specPath,
    CLAWQL_API_BASE_URL: apiBase,
    CLAWQL_BUNDLED_OFFLINE: "1",
    CLAWQL_TIER: "gateway",
    CLAWQL_CAPABILITY_LIFECYCLE: "0",
    CLAWQL_ENABLE_MEMORY: "0",
    CLAWQL_ENABLE_DOCUMENTS: "0",
    CLAWQL_ENABLE_ONYX: "0",
    CLAWQL_ENABLE_SANDBOX: "0",
    CLAWQL_ENABLE_SCHEDULE: "0",
    CLAWQL_ENABLE_NOTIFY: "0",
    CLAWQL_ENABLE_OBSERVABILITY: "0",
    CLAWQL_ENABLE_GOOGLE: "0",
    CLAWQL_ENABLE_AWS: "0",
    CLAWQL_OPENAPI_EXECUTE_PATH: "rest",
    CLAWQL_ALLOW_NO_ENFORCEMENT: "1",
  };
  for (const key of [
    "CLAWQL_PROVIDER",
    "CLAWQL_BUNDLED_PROVIDERS",
    "CLAWQL_INSTANCE_SPEC",
    "CLAWQL_INSTANCE_SPEC_FILE",
    "CLAWQL_SPEC_URL",
    "CLAWQL_SPEC_PATHS",
    "CLAWQL_DISCOVERY_URL",
  ]) {
    delete env[key];
  }
  if (governance) {
    env.CLAWQL_WORM_ENABLED = "1";
    env.CLAWQL_WORM_LOCAL = "memory";
    delete env.CLAWQL_WORM_REMOTE;
  } else {
    delete env.CLAWQL_WORM_ENABLED;
    delete env.CLAWQL_WORM_LOCAL;
    delete env.CLAWQL_WORM_REMOTE;
  }
  return env;
}

function toolText(res) {
  const c = res?.content;
  if (!Array.isArray(c)) return "";
  return c
    .filter((x) => x?.type === "text")
    .map((x) => x.text)
    .join("\n");
}

async function connectClawql(env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "pipe",
    env,
  });
  const client = new Client({ name: "latency-fair-clawql", version: "1" }, {});
  let stderr = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("clawql Ready timeout")), 90_000);
    transport.stderr?.on("data", (chunk) => {
      const s = chunk.toString();
      stderr += s;
      if (s.includes("[clawql-mcp] Ready")) {
        clearTimeout(timer);
        resolve(undefined);
      }
    });
  });
  await client.connect(transport);
  await ready;
  return {
    client,
    stderr: () => stderr,
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

async function connectExecutor() {
  const bin = process.env.EXECUTOR_BIN?.trim();
  if (!bin) throw new Error("EXECUTOR_BIN required for fair harness");
  const transport = new StdioClientTransport({
    command: bin,
    args: ["mcp"],
    cwd: process.env.EXECUTOR_CWD?.trim() || dirname(bin),
    stderr: "pipe",
  });
  const client = new Client({ name: "latency-fair-executor", version: "1" }, {});
  await client.connect(transport);
  return {
    client,
    endpoint: `stdio:${bin} mcp`,
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

async function timeOnce(fn) {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

async function callClawqlExecute(client) {
  const res = await client.callTool({
    name: "execute",
    arguments: { operationId: "listPets", args: {}, fields: ["pets"] },
  });
  if (res.isError) throw new Error(`clawql execute: ${toolText(res)}`);
}

async function callExecutorExecute(client) {
  const res = await client.callTool({
    name: "execute",
    arguments: { code: EXECUTOR_EQUAL_CODE, timeoutMs: 30_000 },
  });
  if (res.isError) throw new Error(`executor execute: ${toolText(res)}`);
}

async function callDirect(baseUrl) {
  const res = await fetch(`${baseUrl}/pets`);
  if (!res.ok) throw new Error(`direct ${res.status}`);
  await res.text();
}

/**
 * One interleaved round: ClawQL → Executor → direct.
 * Paired overhead = clawql − direct (same mock; Executor upstream = 0).
 */
async function roundClosed(clawql, executor, baseUrl) {
  const clawql_ms = await timeOnce(() => callClawqlExecute(clawql));
  const executor_ms = await timeOnce(() => callExecutorExecute(executor));
  const direct_ms = await timeOnce(() => callDirect(baseUrl));
  return {
    clawql_ms,
    executor_ms,
    direct_ms,
    /** Executor synthetic has upstream_cost=0, so gateway_cost = full execute. */
    clawql_gateway_ms: clawql_ms - direct_ms,
    executor_gateway_ms: executor_ms,
  };
}

async function runClosedLoop(clawql, executor, baseUrl, iters, warmup) {
  for (let i = 0; i < warmup; i++) await roundClosed(clawql, executor, baseUrl);
  const clawqlS = [];
  const executorS = [];
  const directS = [];
  const clawqlGatewayS = [];
  const executorGatewayS = [];
  for (let i = 0; i < iters; i++) {
    const r = await roundClosed(clawql, executor, baseUrl);
    clawqlS.push(r.clawql_ms);
    executorS.push(r.executor_ms);
    directS.push(r.direct_ms);
    clawqlGatewayS.push(r.clawql_gateway_ms);
    executorGatewayS.push(r.executor_gateway_ms);
  }
  return { clawqlS, executorS, directS, clawqlGatewayS, executorGatewayS, mode: "closed_loop" };
}

/**
 * Open-loop (single stdio client — no concurrent callTool):
 * schedule rounds at fixed arrival; if the prior round overran, start late and
 * count lateness in `*_from_schedule` (Gilkerson / wrk2 coordinated-omission fix).
 * Pure leg times (clawql_ms etc.) remain closed-loop-style service times.
 */
async function runOpenLoop(clawql, executor, baseUrl, iters, warmup, arrivalMs) {
  for (let i = 0; i < warmup; i++) await roundClosed(clawql, executor, baseUrl);

  const tOrigin = performance.now();
  const clawqlS = [];
  const executorS = [];
  const directS = [];
  const clawqlGatewayS = [];
  const executorGatewayS = [];
  const roundFromScheduleS = [];
  const clawqlFromScheduleS = [];
  const executorFromScheduleS = [];

  for (let i = 0; i < iters; i++) {
    const scheduled = tOrigin + i * arrivalMs;
    const early = scheduled - performance.now();
    if (early > 0) await sleep(early);
    const roundStart = performance.now();
    const r = await roundClosed(clawql, executor, baseUrl);
    const done = performance.now();
    clawqlS.push(r.clawql_ms);
    executorS.push(r.executor_ms);
    directS.push(r.direct_ms);
    clawqlGatewayS.push(r.clawql_gateway_ms);
    executorGatewayS.push(r.executor_gateway_ms);
    roundFromScheduleS.push(done - scheduled);
    // Arm latency from schedule: lateness before that arm starts + arm service time.
    clawqlFromScheduleS.push(roundStart - scheduled + r.clawql_ms);
    executorFromScheduleS.push(roundStart - scheduled + r.clawql_ms + r.executor_ms);
  }
  return {
    clawqlS,
    executorS,
    directS,
    clawqlGatewayS,
    executorGatewayS,
    roundFromScheduleS,
    clawqlFromScheduleS,
    executorFromScheduleS,
    mode: "open_loop",
    arrival_ms: arrivalMs,
  };
}

function packArm(label, samples) {
  const stats = summarize(samples);
  if (!KEEP_SAMPLES) return { label, ...stats };
  return {
    label,
    ...stats,
    samples_ms: samples.map((s) => Number(s.toFixed(3))),
  };
}

async function oneRun(mock, runIndex) {
  const measureHome = join("/tmp", `clawql-latency-fair-${process.pid}-r${runIndex}`);
  await mkdir(measureHome, { recursive: true });
  const env = clawqlEnv(measureHome, mock.specPath, mock.baseUrl, GOVERNANCE);
  const claw = await connectClawql(env);
  const exec = await connectExecutor();
  try {
    const data = OPEN_LOOP
      ? await runOpenLoop(claw.client, exec.client, mock.baseUrl, ITERS, WARMUP, ARRIVAL_MS)
      : await runClosedLoop(claw.client, exec.client, mock.baseUrl, ITERS, WARMUP);

    const clawqlGw = summarize(data.clawqlGatewayS);
    const executorGw = summarize(data.executorGatewayS);
    return {
      runIndex,
      mode: data.mode,
      arrival_ms: data.arrival_ms ?? null,
      arms: {
        clawql_execute_e2e: packArm("clawql_execute_e2e", data.clawqlS),
        executor_execute: packArm("executor_execute", data.executorS),
        direct_http: packArm("direct_http", data.directS),
        clawql_gateway_cost: packArm("clawql_gateway_cost", data.clawqlGatewayS),
        executor_gateway_cost: packArm("executor_gateway_cost", data.executorGatewayS),
        ...(data.roundFromScheduleS
          ? {
              open_loop_round_from_schedule: packArm(
                "open_loop_round_from_schedule",
                data.roundFromScheduleS
              ),
              clawql_execute_from_schedule: packArm(
                "clawql_execute_from_schedule",
                data.clawqlFromScheduleS
              ),
              executor_execute_from_schedule: packArm(
                "executor_execute_from_schedule",
                data.executorFromScheduleS
              ),
            }
          : {}),
      },
      ratios: {
        p50: clawqlGw.p50_ms > 0 ? Number((executorGw.p50_ms / clawqlGw.p50_ms).toFixed(2)) : null,
        p99: clawqlGw.p99_ms > 0 ? Number((executorGw.p99_ms / clawqlGw.p99_ms).toFixed(2)) : null,
        p999:
          clawqlGw.p999_ms > 0 ? Number((executorGw.p999_ms / clawqlGw.p999_ms).toFixed(2)) : null,
      },
      headline_absolute_ms: {
        clawql_oversight_p50_ms: clawqlGw.p50_ms,
        clawql_oversight_p999_ms: clawqlGw.p999_ms,
        note:
          "Absolute cost of ClawQL oversight path (execute − paired mock). " +
          "Primary publish framing — holds regardless of Executor.",
      },
    };
  } finally {
    await claw.close();
    await exec.close();
  }
}

async function main() {
  if (!existsSync(join(ROOT, "dist", "server.js"))) {
    console.error("dist/server.js missing — run npm run build first");
    process.exit(1);
  }
  if (!process.env.EXECUTOR_BIN?.trim()) {
    console.error("EXECUTOR_BIN required");
    process.exit(1);
  }

  const versions = readVersions();
  const mock = await startMockUpstream();
  try {
    const runs = [];
    for (let r = 0; r < RUNS; r++) {
      console.error(`[fair] run ${r + 1}/${RUNS} iters=${ITERS} open_loop=${OPEN_LOOP} governance=${GOVERNANCE}`);
      runs.push(await oneRun(mock, r));
    }

    const primary = runs[0];
    const report = {
      suite: "executor-cmp-latency-fair",
      measuredAt: versions.measuredAt,
      versions,
      config: {
        iters: ITERS,
        warmup: WARMUP,
        runs: RUNS,
        mock_delay_ms: MOCK_DELAY_MS,
        schedule: OPEN_LOOP ? "open_loop_fixed_rate" : "interleaved_closed_loop",
        arrival_ms: OPEN_LOOP ? ARRIVAL_MS : null,
        governance_worm_memory: GOVERNANCE,
        panguard_sidecar: false,
        transport: "stdio_both",
        same_host: true,
        body_bytes: mock.bodyBytes,
        fields: ["pets"],
      },
      method: {
        definition:
          "gateway_cost = MCP_execute_wall − upstream_cost. " +
          "ClawQL upstream_cost = paired same-host mock fetch (execute_i − direct_i). " +
          "Executor upstream_cost = 0 (in-process return of identical JSON; no fetch).",
        interleaving:
          "Each round: ClawQL execute → Executor execute → direct fetch. Drift hits both.",
        notTotalVsOverhead:
          "Not comparing ClawQL overhead to Executor total-with-upstream. " +
          "Executor equal arm has no upstream; subtracting 0 is the same definition.",
        coordinatedOmission:
          OPEN_LOOP
            ? "Open-loop: rounds scheduled at fixed arrival; round_from_schedule includes queueing."
            : "Closed-loop back-to-back (serial agent tool-call model). " +
              "Do not claim load-test tail without LATENCY_OPEN_LOOP=1.",
        framing:
          "Lead with absolute ClawQL oversight cost (p50/p999). Executor ratio is supporting evidence.",
      },
      primary_run: primary,
      runs: RUNS > 1 ? runs : undefined,
      spread:
        RUNS > 1
          ? {
              clawql_gateway_p50_ms: spreadOf(
                runs.map((r) => r.arms.clawql_gateway_cost.p50_ms)
              ),
              clawql_gateway_p999_ms: spreadOf(
                runs.map((r) => r.arms.clawql_gateway_cost.p999_ms)
              ),
              executor_gateway_p50_ms: spreadOf(
                runs.map((r) => r.arms.executor_gateway_cost.p50_ms)
              ),
              executor_gateway_p999_ms: spreadOf(
                runs.map((r) => r.arms.executor_gateway_cost.p999_ms)
              ),
              ratio_p50: spreadOf(runs.map((r) => r.ratios.p50)),
            }
          : null,
      publish_lines: {
        absolute:
          `On local stdio, interleaved + paired: risk gates, ring audit, hooks and field projection add ` +
          `${primary.arms.clawql_gateway_cost.p50_ms} ms at p50 and ` +
          `${primary.arms.clawql_gateway_cost.p99_ms} ms at p99` +
          (ITERS >= 10000
            ? ` (p999 ${primary.arms.clawql_gateway_cost.p999_ms} ms; claim p999 only with n≥10000 and multi-run spread)`
            : ` (p999 not claimed at n=${ITERS}; need interleaved n≥10000 × ≥3 runs)`) +
          (GOVERNANCE
            ? ". In-memory WORM on (not production durable backend). Panguard off."
            : ". Ephemeral ring audit; in-memory/production WORM off. Panguard off."),
        vs_executor_supporting:
          `Supporting: Executor ${versions.executor.version ?? "?"} on same harness — gateway_cost p50 ` +
          `${primary.arms.executor_gateway_cost.p50_ms} ms ` +
          `(ratio ${primary.ratios.p50}× at p50). Rerun when Executor v2 ships.`,
        p999_policy:
          "Publish p50/p95/p99 from interleaved multi-run. Claim p999 only from interleaved n≥10000/run with spread across runs.",
      },
    };

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(OUT_PATH, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
    console.error(`\nWrote ${OUT_PATH}`);
  } finally {
    await mock.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
