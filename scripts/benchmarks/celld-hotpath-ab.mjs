#!/usr/bin/env node
/**
 * Prove that celld / durable-program env does not move the equal-arm ClawQL
 * search→execute pets hot path (the publish gateway board).
 *
 * Variants (same OpenAPI execute listPets call):
 *   A baseline     — clawqlEqualArmEnv only (publish board shape)
 *   B durable_env  — + CLAWQL_ENABLE_DURABLE_PROGRAMS=1 (programs registered, unused)
 *   C celld_pin    — B + CELLD_VERSION + CLAWQL_PROGRAM_CELLD_ISOLATE=1 + celld on PATH
 *
 * Usage:
 *   MULTI_ITERS=2000 node scripts/benchmarks/celld-hotpath-ab.mjs
 *
 * Gate (defaults): gateway_cost p50 regress ≤15% and p99 ≤25% vs A; else fail.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { clawqlEqualArmEnv } from "./lib/clawql-bench-env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "celld-hotpath-ab");
const OUT_PATH = join(OUT_DIR, process.env.CELLD_AB_OUT || "celld-hotpath-ab.json");

const ITERS = Math.max(50, Number(process.env.MULTI_ITERS ?? 2000) || 2000);
const WARMUP = Math.max(0, Number(process.env.MULTI_WARMUP ?? 50) || 50);
const P50_MAX_REGRESS = Number(process.env.CELLD_AB_P50_REGRESS ?? 0.15);
const P99_MAX_REGRESS = Number(process.env.CELLD_AB_P99_REGRESS ?? 0.25);

const EQUAL_PAYLOAD = {
  pets: [
    { id: 1, name: "Ada", status: "available" },
    { id: 2, name: "Grace", status: "available" },
  ],
};

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    p50_ms: sorted.length ? Number(percentile(sorted, 50).toFixed(3)) : null,
    p95_ms: sorted.length ? Number(percentile(sorted, 95).toFixed(3)) : null,
    p99_ms: sorted.length ? Number(percentile(sorted, 99).toFixed(3)) : null,
    mean_ms: sorted.length ? Number((sum / sorted.length).toFixed(3)) : null,
  };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
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
  const specPath = join("/tmp", `celld-ab-spec-${process.pid}.json`);
  await writeFile(
    specPath,
    JSON.stringify(
      {
        openapi: "3.0.3",
        info: { title: "CelldAbEqual", version: "1" },
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

async function connectClawql(env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "pipe",
    env,
  });
  const client = new Client({ name: "celld-ab", version: "1" }, {});
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Ready timeout")), 90_000);
    transport.stderr?.on("data", (chunk) => {
      if (chunk.toString().includes("[clawql-mcp] Ready")) {
        clearTimeout(timer);
        resolve(undefined);
      }
    });
  });
  await client.connect(transport);
  await ready;
  return {
    client,
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

async function callDirect(baseUrl) {
  const res = await fetch(`${baseUrl}/pets`);
  if (!res.ok) throw new Error(`direct ${res.status}`);
  return res.text();
}

async function measureVariant(id, envExtra, mock) {
  const home = join("/tmp", `celld-ab-${id}-${process.pid}`);
  await rm(home, { recursive: true, force: true });
  await mkdir(home, { recursive: true });
  const env = {
    ...clawqlEqualArmEnv({ home, specPath: mock.specPath, apiBase: mock.baseUrl }),
    ...envExtra,
  };
  const conn = await connectClawql(env);
  const e2e = [];
  const gateway = [];
  let errors = 0;
  try {
    for (let i = 0; i < WARMUP; i++) {
      await conn.client.callTool({
        name: "execute",
        arguments: { operationId: "listPets", args: {}, fields: ["pets"] },
      });
      await callDirect(mock.baseUrl);
    }
    for (let i = 0; i < ITERS; i++) {
      const t0 = performance.now();
      try {
        const res = await conn.client.callTool({
          name: "execute",
          arguments: { operationId: "listPets", args: {}, fields: ["pets"] },
        });
        if (res.isError) throw new Error("execute error");
        const e = performance.now() - t0;
        e2e.push(e);
        const d0 = performance.now();
        await callDirect(mock.baseUrl);
        const d = performance.now() - d0;
        gateway.push(e - d);
      } catch {
        errors++;
      }
      if ((i + 1) % 500 === 0) console.log(`[celld-ab] ${id} ${i + 1}/${ITERS}`);
    }
  } finally {
    await conn.close().catch(() => {});
    await rm(home, { recursive: true, force: true }).catch(() => {});
  }
  return {
    id,
    env_extra_keys: Object.keys(envExtra).sort(),
    errors,
    latency: {
      e2e: summarize(e2e),
      gateway_cost: summarize(gateway),
      note: "gateway_cost = e2e − paired direct HTTP /pets",
    },
  };
}

function regress(base, other) {
  if (base == null || other == null || base <= 0) return null;
  return Number(((other - base) / base).toFixed(4));
}

async function main() {
  if (!existsSync(join(ROOT, "dist", "server.js"))) {
    throw new Error("dist/server.js missing — run npm run build");
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const mock = await startMockHttp();
  const celldBin = process.env.CLAWQL_CELLD_BIN?.trim() || `${process.env.HOME}/.local/bin/celld`;
  const variants = [
    { id: "A_baseline", env: {} },
    {
      id: "B_durable_programs",
      env: { CLAWQL_ENABLE_DURABLE_PROGRAMS: "1" },
    },
    {
      id: "C_celld_pin_isolate",
      env: {
        CLAWQL_ENABLE_DURABLE_PROGRAMS: "1",
        CELLD_VERSION: "v0.4.0",
        CLAWQL_PROGRAM_CELLD_ISOLATE: "1",
        CLAWQL_CELLD_BIN: celldBin,
        PATH: `${dirname(celldBin)}:${process.env.PATH || ""}`,
      },
    },
  ];

  const results = [];
  try {
    for (const v of variants) {
      console.log(`[celld-ab] === ${v.id} ===`);
      results.push(await measureVariant(v.id, v.env, mock));
    }
  } finally {
    await mock.close().catch(() => {});
  }

  const a = results.find((r) => r.id === "A_baseline");
  const comparisons = results
    .filter((r) => r.id !== "A_baseline")
    .map((r) => ({
      id: r.id,
      e2e_p50_regress: regress(a.latency.e2e.p50_ms, r.latency.e2e.p50_ms),
      e2e_p99_regress: regress(a.latency.e2e.p99_ms, r.latency.e2e.p99_ms),
      gateway_p50_regress: regress(a.latency.gateway_cost.p50_ms, r.latency.gateway_cost.p50_ms),
      gateway_p99_regress: regress(a.latency.gateway_cost.p99_ms, r.latency.gateway_cost.p99_ms),
    }));

  const gateFails = [];
  for (const c of comparisons) {
    if (c.gateway_p50_regress != null && c.gateway_p50_regress > P50_MAX_REGRESS) {
      gateFails.push(`${c.id} gateway p50 regress ${c.gateway_p50_regress} > ${P50_MAX_REGRESS}`);
    }
    if (c.gateway_p99_regress != null && c.gateway_p99_regress > P99_MAX_REGRESS) {
      gateFails.push(`${c.id} gateway p99 regress ${c.gateway_p99_regress} > ${P99_MAX_REGRESS}`);
    }
  }

  const out = {
    measuredAt: new Date().toISOString(),
    iters: ITERS,
    warmup: WARMUP,
    gate: {
      p50_max_regress: P50_MAX_REGRESS,
      p99_max_regress: P99_MAX_REGRESS,
      passed: gateFails.length === 0,
      fails: gateFails,
    },
    honesty: [
      "Equal-arm OpenAPI execute listPets — same call as gateway-multi publish board.",
      "Variants only change env; hot path never calls execute_program / celld spawn.",
      "Pass means celld pin + durable-program registration does not hurt Core search/execute boards.",
      "Does NOT prove isolate-hosted kill-node crash survival (separate earned claim).",
    ],
    variants: results,
    comparisons,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`[celld-ab] wrote ${OUT_PATH}`);
  console.log(`[celld-ab] gate ${out.gate.passed ? "PASS" : "FAIL"}`, gateFails);
  if (!out.gate.passed) process.exitCode = 2;
}

main().catch((e) => {
  console.error("[celld-ab] fatal:", e);
  process.exit(1);
});
