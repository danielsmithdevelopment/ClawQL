#!/usr/bin/env node
/**
 * Per-core CPU sampler under concurrent MCP execute load.
 * Writes /opt/cursor/artifacts/executor-β37-cpu-lanes.json — not a publish board.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ensureExecutorOpenapiApp } from "./lib/ensure-executor-openapi-app.mjs";
import { executorV2ToolScripts } from "./code-mode/published-scripts.mjs";
import { spawn } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOCK_JS = join(HERE, "mock/cloudflare-replay-mock.mjs");
const FIXTURE = join(HERE, "fixtures/recording.synthetic.json");
const CURATED = join(HERE, "fixtures/curated-openapi.json");
const OUT = "/opt/cursor/artifacts/executor-β37-cpu-lanes.json";
const key = readFileSync("/tmp/executor-v2-data/api_key.txt", "utf8").trim();
const mcpUrl = process.env.EXECUTOR_V2_URL?.trim() || "http://127.0.0.1:4312/mcp";
const CLIENTS = Math.max(1, Number(process.env.CLIENTS || 16) || 16);
const DURATION_MS = Math.max(3000, Number(process.env.DURATION_MS || 12000) || 12000);

function readCpu() {
  const text = readFileSync("/proc/stat", "utf8");
  const cores = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^cpu(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (!m) continue;
    const nums = m.slice(2).map(Number);
    const idle = nums[3] + nums[4];
    const total = nums.reduce((a, b) => a + b, 0);
    cores.push({ core: Number(m[1]), idle, total });
  }
  return cores;
}

function deltaPct(a, b) {
  return a.map((prev, i) => {
    const next = b[i];
    const dTotal = next.total - prev.total;
    const dIdle = next.idle - prev.idle;
    const busy = dTotal > 0 ? (1 - dIdle / dTotal) * 100 : 0;
    return { core: prev.core, busy_pct: +busy.toFixed(1) };
  });
}

async function startMock() {
  const child = spawn(process.execPath, [MOCK_JS], {
    env: { ...process.env, FIXTURE, MT_UPSTREAM_LATENCY: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buf = "";
  const base = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`mock timeout: ${buf.slice(0, 300)}`)), 30000);
    const onData = (d) => {
      buf += d.toString();
      const m = buf.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(t);
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (c) => reject(new Error(`mock exit ${c}: ${buf.slice(0, 300)}`)));
  });
  return {
    base,
    close: () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    },
  };
}

async function openClient() {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  });
  const client = new Client({ name: "cpu-lanes", version: "0.0.0" });
  await client.connect(transport);
  return { client, transport };
}

async function main() {
  const mock = await startMock();
  const meta = ensureExecutorOpenapiApp({
    mockBase: mock.base,
    openapiDoc: JSON.parse(readFileSync(CURATED, "utf8")),
  });
  const scripts = executorV2ToolScripts({ appSlug: meta.slug });
  const code = scripts[4];
  const samples = [];
  let ops = 0;
  let errors = 0;
  const latencies = [];
  const stopAt = performance.now() + DURATION_MS;
  let sampling = true;

  const sampler = (async () => {
    let prev = readCpu();
    while (sampling) {
      await new Promise((r) => setTimeout(r, 250));
      const next = readCpu();
      samples.push({ t_ms: Math.round(performance.now()), cores: deltaPct(prev, next) });
      prev = next;
    }
  })();

  const workers = Array.from({ length: CLIENTS }, async () => {
    const { client, transport } = await openClient();
    try {
      while (performance.now() < stopAt) {
        const t0 = performance.now();
        try {
          await client.callTool({ name: "execute", arguments: { code } });
          ops += 1;
          latencies.push(performance.now() - t0);
        } catch {
          errors += 1;
        }
      }
    } finally {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
      try {
        await transport.close();
      } catch {
        /* ignore */
      }
    }
  });

  await Promise.all(workers);
  sampling = false;
  await sampler;
  mock.close();

  const peakPerCore = [];
  const nCores = samples[0]?.cores.length ?? 0;
  for (let i = 0; i < nCores; i++) {
    const vals = samples.map((s) => s.cores[i]?.busy_pct ?? 0);
    peakPerCore.push({
      core: i,
      peak_busy_pct: Math.max(...vals),
      mean_busy_pct: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1),
    });
  }
  latencies.sort((a, b) => a - b);
  const p = (q) =>
    latencies.length ? +latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))].toFixed(1) : null;

  const out = {
    measured_at: new Date().toISOString(),
    binary: "executor@beta 2.0.0-beta.37",
    mcp_url: mcpUrl,
    clients: CLIENTS,
    duration_ms: DURATION_MS,
    ops,
    errors,
    rps: +(ops / (DURATION_MS / 1000)).toFixed(1),
    latency_ms: { p50: p(0.5), p99: p(0.99), n: latencies.length },
    cores: peakPerCore,
    saturated_cores: peakPerCore.filter((c) => c.mean_busy_pct >= 80).length,
    reading:
      peakPerCore.filter((c) => c.mean_busy_pct >= 80).length <= 1 &&
      peakPerCore.filter((c) => c.mean_busy_pct < 40).length >= Math.max(1, nCores - 1)
        ? "single_lane_signature"
        : "multi_core_busy",
    sample_count: samples.length,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
