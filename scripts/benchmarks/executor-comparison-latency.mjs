#!/usr/bin/env node
/**
 * executor-cmp-latency: wall-clock side-by-side with an intentional workload tilt.
 *
 * ClawQL does **more** work than Executor:
 *   - search (catalog resolve) + durable WORM on search
 *   - execute against a large mock body with JMESPath `where` + `fields`
 *   - audit ring append (ephemeral trail)
 *   - optional heavy_turn = search + execute + audit timed as one sample
 *
 * Executor does **less** (when wired): a no-op JS `execute` with no upstream.
 * When unwired, the chart uses the published warm 50–100ms reference band
 * (UsefulSoftwareCo/executor#1519) — still a lighter arm than ClawQL heavy.
 *
 * Usage:
 *   npm run benchmark:executor-comparison:latency
 *   LATENCY_ITERS=100 PET_COUNT=800 MOCK_DELAY_MS=0 \
 *     EXECUTOR_BIN=/path/to/executor npm run benchmark:executor-comparison:latency
 *
 * Env:
 *   LATENCY_ITERS (default 100), LATENCY_WARMUP (default 10), MOCK_DELAY_MS (default 0)
 *   PET_COUNT (default 800) — mock upstream rows ClawQL must filter/project
 *   EXECUTOR_BIN / EXECUTOR_CWD / EXECUTOR_MCP_URL
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
const OUT_PATH = join(OUT_DIR, "executor-cmp-latency.json");

const ITERS = Math.max(5, Number(process.env.LATENCY_ITERS ?? 100) || 100);
const WARMUP = Math.max(0, Number(process.env.LATENCY_WARMUP ?? 10) || 10);
const MOCK_DELAY_MS = Math.max(0, Number(process.env.MOCK_DELAY_MS ?? 0) || 0);
const PET_COUNT = Math.max(50, Number(process.env.PET_COUNT ?? 800) || 800);

const WHERE_EXPR = "pets[?status=='available']";
const PROJECT_FIELDS = ["id", "name", "status"];

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
    // With small n, p99 collapses toward max (ceil(0.99*n)-1).
    p99_ms: Number(percentile(sorted, 99).toFixed(3)),
    mean_ms: Number((sum / sorted.length).toFixed(3)),
    min_ms: Number(sorted[0].toFixed(3)),
    max_ms: Number(sorted[sorted.length - 1].toFixed(3)),
  };
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

function buildPets(n) {
  const pets = [];
  for (let i = 1; i <= n; i++) {
    pets.push({
      id: i,
      name: `pet-${i}`,
      status: i % 3 === 0 ? "available" : i % 3 === 1 ? "pending" : "sold",
      tag: i % 5 === 0 ? "featured" : "std",
      // Extra payload so ClawQL must parse more than Executor's no-op.
      bio: `Synthetic bio for latency pet ${i}. `.repeat(3),
    });
  }
  return pets;
}

async function startMockUpstream() {
  const upstreamSamples = [];
  const pets = buildPets(PET_COUNT);
  const body = JSON.stringify({ pets, count: pets.length });
  const availableCount = pets.filter((p) => p.status === "available").length;

  const server = createServer(async (req, res) => {
    const t0 = performance.now();
    await sleep(MOCK_DELAY_MS);
    res.writeHead(200, {
      "content-type": "application/json",
      "x-mock-delay-ms": String(MOCK_DELAY_MS),
      "x-pet-count": String(PET_COUNT),
    });
    res.end(body);
    upstreamSamples.push(performance.now() - t0);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const specPath = join("/tmp", `clawql-latency-petstore-${process.pid}.json`);
  const spec = {
    openapi: "3.0.3",
    info: { title: "LatencyPetstoreHeavy", version: "1" },
    servers: [{ url: baseUrl }],
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          summary: "List pets (large body for heavy arm)",
          responses: {
            "200": {
              description: "ok",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
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
    petCount: PET_COUNT,
    availableCount,
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
    // Heavy arm: durable WORM on search (execute still skips process WORM by design).
    CLAWQL_WORM_ENABLED: "1",
    CLAWQL_WORM_LOCAL: "memory",
    CLAWQL_WORM_REMOTE: "memory",
    CLAWQL_WORM_RECONCILE_MS: "0",
    // Lifecycle off so the bench measures throughput, not grant denials.
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
  const client = new Client({ name: "executor-cmp-latency", version: "1" }, {});
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
  return { label, ...summarize(samples), samples_ms: samples.map((s) => Number(s.toFixed(3))) };
}

async function callSearch(client) {
  const res = await client.callTool({
    name: "search",
    arguments: { query: "listPets pets GET", limit: 5 },
  });
  if (res.isError) throw new Error(`search failed: ${toolText(res)}`);
}

async function callExecuteHeavy(client) {
  const res = await client.callTool({
    name: "execute",
    arguments: {
      operationId: "listPets",
      args: {},
      where: WHERE_EXPR,
      fields: PROJECT_FIELDS,
    },
  });
  if (res.isError) {
    throw new Error(`execute failed: ${toolText(res) || JSON.stringify(res).slice(0, 400)}`);
  }
}

async function callAudit(client) {
  const res = await client.callTool({
    name: "audit",
    arguments: {
      operation: "append",
      category: "benchmark",
      action: "latency_heavy_probe",
      summary: "executor-cmp-latency-heavy",
    },
  });
  if (res.isError) throw new Error(`audit failed: ${toolText(res)}`);
}

async function measureClawqlArms(mock) {
  const measureHome = join("/tmp", `clawql-latency-${process.pid}`);
  await mkdir(measureHome, { recursive: true });
  const env = clawqlEnv(measureHome, mock.specPath, mock.baseUrl);

  return withClawqlClient(env, async (client) => {
    const search = await bench("clawql_search", ITERS, WARMUP, () => callSearch(client));
    const audit = await bench("clawql_audit_append", ITERS, WARMUP, () => callAudit(client));

    mock.upstreamSamples.length = 0;
    const execute = await bench("clawql_execute_heavy", ITERS, WARMUP, () =>
      callExecuteHeavy(client)
    );

    mock.upstreamSamples.length = 0;
    const heavyTurn = await bench("clawql_heavy_turn", ITERS, WARMUP, async () => {
      await callSearch(client);
      await callExecuteHeavy(client);
      await callAudit(client);
    });

    return { search, audit, execute, heavyTurn };
  });
}

async function measureDirectHttp(baseUrl) {
  return bench("direct_http_mock_large", ITERS, WARMUP, async () => {
    const res = await fetch(`${baseUrl}/pets`);
    if (!res.ok) throw new Error(`direct http ${res.status}`);
    await res.text();
  });
}

async function measureExecutorNoop() {
  const bin = process.env.EXECUTOR_BIN?.trim();
  const url = process.env.EXECUTOR_MCP_URL?.trim();
  if (!bin && !url) {
    return {
      wired: false,
      workload: "light_reference",
      note:
        "EXECUTOR_BIN / EXECUTOR_MCP_URL unset — Executor arm uses published warm 50–100ms " +
        "no-op/self-host band (lighter than ClawQL heavy). Wire EXECUTOR_* for live no-op ms.",
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

  const client = new Client({ name: "executor-cmp-latency", version: "1" }, {});
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

    const noop = await bench("executor_execute_noop", ITERS, WARMUP, async () => {
      const res = await client.callTool({
        name: "execute",
        arguments: {
          code: "return { ok: true, probe: 'executor-cmp-latency-light' };",
          timeoutMs: 30_000,
        },
      });
      if (res.isError) {
        throw new Error(`executor execute failed: ${toolText(res)}`);
      }
    });

    return {
      wired: true,
      endpoint,
      noop,
      workload: "light_noop",
      note:
        "Light arm: no-op program (no HTTP, no filter, no audit). " +
        "ClawQL heavy arm does search + large execute + where/fields + audit + WORM on search.",
    };
  } finally {
    await client.close().catch(() => {});
  }
}

function deriveOverhead(execute, direct, mockDelayMs) {
  if (!execute || !direct) return null;
  return {
    method: "clawql_execute_heavy_p50 − direct_http_p50 (same large mock)",
    mock_delay_ms: mockDelayMs,
    overhead_p50_ms: Number((execute.p50_ms - direct.p50_ms).toFixed(3)),
    overhead_p95_ms: Number((execute.p95_ms - direct.p95_ms).toFixed(3)),
    overhead_p99_ms: Number((execute.p99_ms - direct.p99_ms).toFixed(3)),
    honesty:
      "Gateway+MCP+where/fields overhead vs bare fetch of the same large mock — " +
      "not model time, not Tempo ingest, not the synthetic flamegraph demo (120ms).",
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
    const executor = await measureExecutorNoop();
    const overhead = deriveOverhead(clawql.execute, direct, MOCK_DELAY_MS);

    const report = {
      suite: "executor-cmp-latency",
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
        pet_count: mock.petCount,
        available_count: mock.availableCount,
        body_bytes: mock.bodyBytes,
        where: WHERE_EXPR,
        fields: PROJECT_FIELDS,
      },
      workloadTilt: {
        clawql:
          "HEAVIER — search (+WORM) + execute(large JSON + where + fields) + audit; " +
          "heavy_turn times all three together",
        executor:
          "LIGHTER — live no-op execute when wired, else published warm 50–100ms reference band " +
          "(no upstream HTTP, no filter, no audit)",
        intent:
          "If ClawQL wins while doing more work, the win is definitive — not an easier-arm artifact.",
      },
      honesty: {
        flamegraphDemo120ms:
          "Synthetic fixture in clawql-observability demo-mcp-execute — NOT a measured ClawQL p50.",
        tokenBenchmarks:
          "docs/benchmarks/executor-comparison/executor-cmp-*.json measure tokens, not wall clock.",
        intentionalAsymmetry:
          "ClawQL arm is deliberately heavier than Executor. Compare p50/p95/p99 on the chart; " +
          "do not claim apples-to-apples equal work.",
        lifecycle:
          "CLAWQL_CAPABILITY_LIFECYCLE=0 (throughput path). No panguard-mcp-proxy / JWT-ATR hop.",
        worm:
          "CLAWQL_WORM_ENABLED=1 (memory). search appends durable WORM; execute skips process WORM " +
          "(by design); audit is ring-buffer only.",
        p99Caveat:
          "p99 needs adequate n; default iters=100. Still sensitive to rare GC/scheduling spikes.",
      },
      pathFlags: {
        CLAWQL_TIER: "gateway",
        CLAWQL_CAPABILITY_LIFECYCLE: "0",
        CLAWQL_WORM_ENABLED: "1",
        CLAWQL_WORM_LOCAL: "memory",
        panguard_sidecar: false,
        durable_worm_on_search: true,
        durable_worm_on_execute: false,
        ephemeral_ring_audit: true,
        hook_registry_pre_call: true,
        where_and_fields: true,
      },
      arms: {
        clawql_search: clawql.search,
        clawql_audit_append: clawql.audit,
        clawql_execute_heavy: clawql.execute,
        clawql_heavy_turn: clawql.heavyTurn,
        // Back-compat alias for older chart consumers
        clawql_execute_listPets: clawql.execute,
        direct_http_mock: direct,
        executor,
      },
      derived: {
        clawql_vs_direct: overhead,
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
