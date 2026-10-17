#!/usr/bin/env node
/**
 * executor-cmp-latency: apples-to-apples wall-clock MCP latency.
 *
 * Equal-work arms (default):
 *   1. ClawQL execute — tiny same-host mock (2 pets), no where/WORM/search/audit bundle
 *   2. Direct HTTP   — same mock (control)
 *   3. Executor execute — returns the **same JSON shape** in-process (no network;
 *      Executor sandbox has no fetch — this is the equal logical result)
 *   4. ClawQL audit  — local MCP control (no upstream)
 *
 * Equalized headline metric:
 *   clawql_gateway_overhead = execute_p50 − direct_p50
 *   compared to executor_execute_equal p50
 *
 * Usage:
 *   EXECUTOR_BIN=/path/to/executor npm run benchmark:executor-comparison:latency
 *   LATENCY_ITERS=100 MOCK_DELAY_MS=0 \
 *     EXECUTOR_BIN=… EXECUTOR_CWD=… npm run benchmark:executor-comparison:latency
 *
 * Env:
 *   LATENCY_ITERS (default 100), LATENCY_WARMUP (default 10), MOCK_DELAY_MS (default 0)
 *   LATENCY_KEEP_SAMPLES=0|1 — omit samples_ms from JSON when 0 (default: keep only if iters ≤ 500)
 *   LATENCY_OUT — filename under docs/benchmarks/executor-comparison/ (default executor-cmp-latency.json)
 *   EXECUTOR_BIN / EXECUTOR_CWD / EXECUTOR_MCP_URL  (required for live Executor; else reference)
 */

import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "executor-comparison");
const OUT_NAME = (process.env.LATENCY_OUT ?? "executor-cmp-latency.json").replace(
  /[^a-zA-Z0-9._-]/g,
  ""
);
const OUT_PATH = join(OUT_DIR, OUT_NAME || "executor-cmp-latency.json");

const ITERS = Math.max(5, Number(process.env.LATENCY_ITERS ?? 100) || 100);
const WARMUP = Math.max(0, Number(process.env.LATENCY_WARMUP ?? 10) || 10);
const MOCK_DELAY_MS = Math.max(0, Number(process.env.MOCK_DELAY_MS ?? 0) || 0);
const KEEP_SAMPLES =
  process.env.LATENCY_KEEP_SAMPLES === "1"
    ? true
    : process.env.LATENCY_KEEP_SAMPLES === "0"
      ? false
      : ITERS <= 500;

/** Identical logical result both arms return. */
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
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    p50_ms: Number(percentile(sorted, 50).toFixed(3)),
    p95_ms: Number(percentile(sorted, 95).toFixed(3)),
    p99_ms: Number(percentile(sorted, 99).toFixed(3)),
    /** 99.9th percentile — meaningful when n ≳ 1000 (n=10000 → ~10 samples in the tail). */
    p999_ms: Number(percentile(sorted, 99.9).toFixed(3)),
    mean_ms: Number((sum / sorted.length).toFixed(3)),
    min_ms: Number(sorted[0].toFixed(3)),
    max_ms: Number(sorted[sorted.length - 1].toFixed(3)),
  };
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

async function startMockUpstream() {
  const upstreamSamples = [];
  const body = JSON.stringify(EQUAL_PAYLOAD);
  const server = createServer(async (_req, res) => {
    const t0 = performance.now();
    await sleep(MOCK_DELAY_MS);
    res.writeHead(200, {
      "content-type": "application/json",
      "x-mock-delay-ms": String(MOCK_DELAY_MS),
      "x-equal-payload": "1",
    });
    res.end(body);
    upstreamSamples.push(performance.now() - t0);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const specPath = join("/tmp", `clawql-latency-equal-${process.pid}.json`);
  const spec = {
    openapi: "3.0.3",
    info: { title: "LatencyEqualPetstore", version: "1" },
    servers: [{ url: baseUrl }],
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          summary: "List pets (equal-arm tiny body)",
          responses: {
            "200": {
              description: "ok",
              content: {
                "application/json": { schema: { type: "object" } },
              },
            },
          },
        },
      },
    },
  };
  await writeFile(specPath, JSON.stringify(spec, null, 2));

  return {
    baseUrl,
    specPath,
    upstreamSamples,
    bodyBytes: Buffer.byteLength(body),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function clawqlEnv(measureHome, specPath, apiBase) {
  const env = {
    ...process.env,
    CLAWQL_HOME: measureHome,
    CLAWQL_OBSIDIAN_VAULT_PATH: measureHome,
    CLAWQL_SPEC_PATH: specPath,
    CLAWQL_API_BASE_URL: apiBase,
    CLAWQL_BUNDLED_OFFLINE: "1",
    CLAWQL_TIER: "gateway",
    // Equal arm: no durable WORM, no lifecycle denials, optional tools off.
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
  };
  delete env.CLAWQL_WORM_ENABLED;
  delete env.CLAWQL_WORM_LOCAL;
  delete env.CLAWQL_WORM_REMOTE;
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
  return env;
}

function toolText(res) {
  return res.content?.find((c) => c.type === "text")?.text ?? "";
}

async function withClawqlClient(env, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "pipe",
    env,
  });
  const client = new Client({ name: "executor-cmp-latency-equal", version: "1" }, {});
  let stderr = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("clawql-mcp Ready timeout")), 60_000);
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
  try {
    return await fn(client);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${detail}\n--- clawql stderr (tail) ---\n${stderr.slice(-2000)}`);
  } finally {
    await client.close().catch(() => {});
  }
}

async function bench(label, iters, warmup, runOnce) {
  for (let i = 0; i < warmup; i++) await runOnce();
  const samples = [];
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    await runOnce();
    samples.push(performance.now() - t0);
  }
  const stats = summarize(samples);
  if (!KEEP_SAMPLES) return { label, ...stats };
  return { label, ...stats, samples_ms: samples.map((s) => Number(s.toFixed(3))) };
}

async function measureClawqlArms(mock) {
  const measureHome = join("/tmp", `clawql-latency-equal-${process.pid}`);
  await mkdir(measureHome, { recursive: true });
  const env = clawqlEnv(measureHome, mock.specPath, mock.baseUrl);

  return withClawqlClient(env, async (client) => {
    const audit = await bench("clawql_audit_append", ITERS, WARMUP, async () => {
      const res = await client.callTool({
        name: "audit",
        arguments: {
          operation: "append",
          category: "benchmark",
          action: "latency_equal_probe",
          summary: "executor-cmp-latency-equal",
        },
      });
      if (res.isError) throw new Error(`audit failed: ${toolText(res)}`);
    });

    mock.upstreamSamples.length = 0;
    const execute = await bench("clawql_execute_equal", ITERS, WARMUP, async () => {
      const res = await client.callTool({
        name: "execute",
        arguments: {
          operationId: "listPets",
          args: {},
          // No where — equal arm returns the same tiny body Executor synthesizes.
          fields: ["pets"],
        },
      });
      if (res.isError) {
        throw new Error(`execute failed: ${toolText(res) || JSON.stringify(res).slice(0, 400)}`);
      }
    });

    return { audit, execute };
  });
}

async function measureDirectHttp(baseUrl) {
  return bench("direct_http_equal", ITERS, WARMUP, async () => {
    const res = await fetch(`${baseUrl}/pets`);
    if (!res.ok) throw new Error(`direct http ${res.status}`);
    await res.text();
  });
}

async function measureExecutorEqual() {
  const bin = process.env.EXECUTOR_BIN?.trim();
  const url = process.env.EXECUTOR_MCP_URL?.trim();
  if (!bin && !url) {
    return {
      wired: false,
      workload: "equal_reference",
      note:
        "EXECUTOR_BIN / EXECUTOR_MCP_URL unset — cannot claim equal-arm live numbers. " +
        "Wire EXECUTOR_* (e.g. npm i executor && EXECUTOR_BIN=…/node_modules/.bin/executor).",
    };
  }

  let transport;
  let endpoint;
  if (bin) {
    transport = new StdioClientTransport({
      command: bin,
      args: ["mcp"],
      cwd: process.env.EXECUTOR_CWD?.trim() || dirname(bin),
      stderr: "pipe",
    });
    endpoint = `stdio:${bin} mcp`;
  } else {
    transport = new StreamableHTTPClientTransport(new URL(url));
    endpoint = `http:${url}`;
  }

  const client = new Client({ name: "executor-cmp-latency-equal", version: "1" }, {});
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    const executeTool = tools.tools.find((t) => t.name === "execute");
    if (!executeTool) {
      return {
        wired: true,
        endpoint,
        error: "Executor MCP has no execute tool",
        toolNames: tools.tools.map((t) => t.name),
      };
    }

    const equal = await bench("executor_execute_equal", ITERS, WARMUP, async () => {
      const res = await client.callTool({
        name: "execute",
        arguments: {
          code: EXECUTOR_EQUAL_CODE,
          timeoutMs: 30_000,
        },
      });
      if (res.isError) throw new Error(`executor execute failed: ${toolText(res)}`);
    });

    return {
      wired: true,
      endpoint,
      equal,
      // back-compat for chart generator that looks for .noop
      noop: equal,
      workload: "equal",
      version: "executor (live)",
      code: EXECUTOR_EQUAL_CODE,
      note:
        "Equal arm: MCP execute returns the same pets JSON ClawQL gets from the mock. " +
        "In-process (Executor has no fetch); ClawQL pays same-host mock HTTP (~subtracted in overhead).",
    };
  } finally {
    await client.close().catch(() => {});
  }
}

function deriveEqualized(execute, direct, executorEqual, mockDelayMs) {
  if (!execute || !direct) return null;
  const overhead = {
    p50_ms: Number((execute.p50_ms - direct.p50_ms).toFixed(3)),
    p95_ms: Number((execute.p95_ms - direct.p95_ms).toFixed(3)),
    p99_ms: Number((execute.p99_ms - direct.p99_ms).toFixed(3)),
    p999_ms: Number((execute.p999_ms - direct.p999_ms).toFixed(3)),
  };
  const execP50 = executorEqual?.p50_ms ?? null;
  const execP95 = executorEqual?.p95_ms ?? null;
  const execP99 = executorEqual?.p99_ms ?? null;
  const execP999 = executorEqual?.p999_ms ?? null;
  return {
    method: "clawql_execute_p* − direct_http_p* (same tiny mock); compare to executor execute p*",
    mock_delay_ms: mockDelayMs,
    clawql_gateway_overhead: overhead,
    executor_equal: executorEqual
      ? { p50_ms: execP50, p95_ms: execP95, p99_ms: execP99, p999_ms: execP999 }
      : null,
    ratio_executor_over_clawql_overhead:
      execP50 != null && overhead.p50_ms > 0
        ? Number((execP50 / overhead.p50_ms).toFixed(2))
        : null,
    ratio_clawql_overhead_over_executor:
      execP50 != null && execP50 > 0
        ? Number((overhead.p50_ms / execP50).toFixed(2))
        : null,
    clawql_overhead_faster_p50:
      execP50 != null ? overhead.p50_ms < execP50 : null,
    honesty:
      "Equalized apples-to-apples: ClawQL gateway/MCP overhead (execute − same-host mock fetch) " +
      "vs Executor MCP execute returning the same JSON in-process. Raw execute e2e still includes HTTP.",
  };
}

async function main() {
  if (!existsSync(join(ROOT, "dist", "server.js"))) {
    console.error("dist/server.js missing — run npm run build first");
    process.exit(1);
  }

  const mock = await startMockUpstream();
  try {
    const direct = await measureDirectHttp(mock.baseUrl);
    const clawql = await measureClawqlArms(mock);
    const executor = await measureExecutorEqual();
    const executorEqualStats = executor.wired ? executor.equal ?? executor.noop : null;
    const equalized = deriveEqualized(
      clawql.execute,
      direct,
      executorEqualStats,
      MOCK_DELAY_MS
    );

    const report = {
      suite: "executor-cmp-latency",
      mode: "equal",
      measuredAt: new Date().toISOString(),
      host: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      config: {
        iters: ITERS,
        warmup: WARMUP,
        mock_delay_ms: MOCK_DELAY_MS,
        pet_count: EQUAL_PAYLOAD.pets.length,
        body_bytes: mock.bodyBytes,
        equal_payload: EQUAL_PAYLOAD,
        fields: ["pets"],
        where: null,
      },
      workloadTilt: {
        mode: "equal",
        clawql:
          "EQUAL — single MCP execute → tiny same-host mock (2 pets), fields projection only. " +
          "No search bundle, no where, no WORM, no audit in the timed execute sample.",
        executor:
          "EQUAL — single MCP execute returning the same pets JSON in-process " +
          "(Executor sandbox cannot fetch; logical result matched).",
        intent:
          "Apples-to-apples: same result shape, one MCP execute each. " +
          "Headline uses ClawQL gateway overhead (execute − direct) vs Executor execute.",
      },
      honesty: {
        flamegraphDemo120ms:
          "Synthetic fixture in clawql-observability demo-mcp-execute — NOT a measured ClawQL p50.",
        tokenBenchmarks:
          "docs/benchmarks/executor-comparison/executor-cmp-*.json measure tokens, not wall clock.",
        equalArms:
          "Both arms return the same tiny pets JSON via one MCP execute. " +
          "ClawQL goes through same-host mock HTTP; that cost is subtracted for the equalized overhead metric.",
        notHeavyTilt:
          "Previous heavy-tilt chart (800-row where/fields + search/WORM + audit) was retired for this page.",
        referenceBand:
          "Do not use UsefulSoftwareCo/executor#1519 50–100ms as measured — wire EXECUTOR_BIN for live.",
        p99Caveat:
          "p99 needs adequate n; default iters=100. Still sensitive to rare GC/scheduling spikes.",
        p999Caveat:
          "p999 (99.9th) needs large n — prefer LATENCY_ITERS≥1000 (10000 gives ~10 tail samples). Max still informative for rare spikes.",
      },
      pathFlags: {
        CLAWQL_TIER: "gateway",
        CLAWQL_CAPABILITY_LIFECYCLE: "0",
        CLAWQL_WORM_ENABLED: "unset",
        panguard_sidecar: false,
        durable_worm: false,
        ephemeral_ring_audit: true,
        hook_registry_pre_call: true,
        where_and_fields: "fields_only",
        mode: "equal",
      },
      arms: {
        clawql_audit_append: clawql.audit,
        clawql_execute_equal: clawql.execute,
        clawql_execute_listPets: clawql.execute,
        clawql_execute_heavy: clawql.execute,
        direct_http_mock: direct,
        executor,
      },
      derived: {
        equalized,
        clawql_vs_direct: equalized
          ? {
              method: equalized.method,
              mock_delay_ms: MOCK_DELAY_MS,
              overhead_p50_ms: equalized.clawql_gateway_overhead.p50_ms,
              overhead_p95_ms: equalized.clawql_gateway_overhead.p95_ms,
              overhead_p99_ms: equalized.clawql_gateway_overhead.p99_ms,
              overhead_p999_ms: equalized.clawql_gateway_overhead.p999_ms,
              honesty: equalized.honesty,
            }
          : null,
      },
      mockUpstreamHandler: summarize(mock.upstreamSamples.slice(-ITERS)),
    };

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(OUT_PATH, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
    console.error(`\nWrote ${OUT_PATH}`);

    const { spawnSync } = await import("node:child_process");
    const gen = spawnSync(
      process.execPath,
      [join(ROOT, "scripts/benchmarks/generate-executor-cmp-latency-html.mjs")],
      { cwd: ROOT, encoding: "utf8" }
    );
    if (gen.status !== 0) {
      console.error(gen.stderr || gen.stdout || "latency HTML generate failed");
      process.exitCode = 1;
    } else {
      console.error(gen.stdout.trim());
    }
  } finally {
    await mock.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
