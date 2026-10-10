#!/usr/bin/env node
/**
 * executor-cmp-latency: wall-clock side-by-side (ClawQL vs Executor when wired).
 *
 * Clarifies that the OTEL span flamegraph **demo** fixture (120ms) is synthetic —
 * this script measures real MCP tool-call latency on this machine.
 *
 * Arms:
 *   1. ClawQL gateway-only — `audit` append (no upstream HTTP)
 *   2. ClawQL execute — `listPets` against a local mock with known delay
 *   3. Direct HTTP control — same mock, no ClawQL
 *   4. Executor (optional) — no-op `execute` when EXECUTOR_BIN or EXECUTOR_MCP_URL set
 *
 * Derived: clawql_gateway_overhead_ms ≈ execute_e2e − mock_upstream − mock_injected_delay
 *
 * Usage:
 *   npm run benchmark:executor-comparison:latency
 *   LATENCY_ITERS=40 MOCK_DELAY_MS=5 npm run benchmark:executor-comparison:latency
 *   EXECUTOR_BIN=/path/to/executor npm run benchmark:executor-comparison:latency
 *
 * Env:
 *   LATENCY_ITERS (default 30), LATENCY_WARMUP (default 5), MOCK_DELAY_MS (default 0)
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

const ITERS = Math.max(5, Number(process.env.LATENCY_ITERS ?? 30) || 30);
const WARMUP = Math.max(0, Number(process.env.LATENCY_WARMUP ?? 5) || 5);
const MOCK_DELAY_MS = Math.max(0, Number(process.env.MOCK_DELAY_MS ?? 0) || 0);

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
  const server = createServer(async (req, res) => {
    const t0 = performance.now();
    await sleep(MOCK_DELAY_MS);
    const body = JSON.stringify({
      pets: [
        { id: 1, name: "Ada" },
        { id: 2, name: "Grace" },
      ],
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "x-mock-delay-ms": String(MOCK_DELAY_MS),
    });
    res.end(body);
    upstreamSamples.push(performance.now() - t0);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const specPath = join(
    "/tmp",
    `clawql-latency-petstore-${process.pid}.json`
  );
  const spec = {
    openapi: "3.0.3",
    info: { title: "LatencyPetstore", version: "1" },
    servers: [{ url: baseUrl }],
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          summary: "List pets",
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
    // Latency microbench: measure gateway+HTTP, not capability-lifecycle denials.
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

async function measureClawqlArms(mock) {
  const measureHome = join("/tmp", `clawql-latency-${process.pid}`);
  await mkdir(measureHome, { recursive: true });
  const env = clawqlEnv(measureHome, mock.specPath, mock.baseUrl);

  return withClawqlClient(env, async (client) => {
    const audit = await bench("clawql_audit_append", ITERS, WARMUP, async () => {
      const res = await client.callTool({
        name: "audit",
        arguments: {
          operation: "append",
          category: "benchmark",
          action: "latency_probe",
          summary: "executor-cmp-latency",
        },
      });
      if (res.isError) {
        throw new Error(
          `audit failed: ${res.content?.find((c) => c.type === "text")?.text ?? ""}`
        );
      }
    });

    // Reset upstream samples after warmup for cleaner pairing
    mock.upstreamSamples.length = 0;
    const execute = await bench("clawql_execute_listPets", ITERS, WARMUP, async () => {
      const res = await client.callTool({
        name: "execute",
        arguments: {
          operationId: "listPets",
          args: {},
          fields: ["pets"],
        },
      });
      if (res.isError) {
        const text = res.content?.find((c) => c.type === "text")?.text ?? "";
        throw new Error(`execute failed: ${text || JSON.stringify(res).slice(0, 400)}`);
      }
    });

    return { audit, execute };
  });
}

async function measureDirectHttp(baseUrl) {
  return bench("direct_http_mock", ITERS, WARMUP, async () => {
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
      note:
        "EXECUTOR_BIN / EXECUTOR_MCP_URL unset — Executor arm skipped. " +
        "Published/community signals put warm Executor execute roughly in the 50–100ms band; " +
        "wire a live install to measure on this host.",
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
          code: "return { ok: true, probe: 'executor-cmp-latency' };",
          timeoutMs: 30_000,
        },
      });
      if (res.isError) {
        throw new Error(
          `executor execute failed: ${res.content?.find((c) => c.type === "text")?.text ?? ""}`
        );
      }
    });

    return {
      wired: true,
      endpoint,
      noop,
      note: "No-op program (no integration call). Isolates Executor runtime/MCP overhead.",
    };
  } finally {
    await client.close().catch(() => {});
  }
}

function deriveOverhead(execute, direct, mockDelayMs) {
  if (!execute || !direct) return null;
  // Rough gateway overhead: ClawQL e2e p50 minus direct HTTP p50.
  // Direct already includes mock delay; execute includes gateway + HTTP + mock delay.
  const overhead_p50_ms = Number((execute.p50_ms - direct.p50_ms).toFixed(3));
  const overhead_p95_ms = Number((execute.p95_ms - direct.p95_ms).toFixed(3));
  return {
    method: "clawql_execute_p50 − direct_http_p50 (same mock)",
    mock_delay_ms: mockDelayMs,
    overhead_p50_ms,
    overhead_p95_ms,
    honesty:
      "This is gateway+MCP+client overhead relative to a bare fetch of the same mock — " +
      "not model time, not Tempo ingest, and not the synthetic flamegraph demo (120ms).",
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
      },
      honesty: {
        flamegraphDemo120ms:
          "Synthetic fixture in clawql-observability demo-mcp-execute — NOT a measured ClawQL p50.",
        tokenBenchmarks:
          "docs/benchmarks/executor-comparison/executor-cmp-*.json measure tokens, not wall clock.",
        applesToApples:
          "Compare clawql_audit_append (local) and clawql_execute overhead vs executor_execute_noop when wired.",
      },
      arms: {
        clawql_audit_append: clawql.audit,
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

    // Shareable dual-bar HTML for clawql.com / docs
    const { spawnSync } = await import("node:child_process");
    const gen = spawnSync(process.execPath, [join(ROOT, "scripts/benchmarks/generate-executor-cmp-latency-html.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (gen.status !== 0) {
      console.error(gen.stderr || gen.stdout || "latency HTML generate failed");
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
