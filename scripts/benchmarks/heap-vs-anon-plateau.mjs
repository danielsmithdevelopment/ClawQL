#!/usr/bin/env node
/**
 * Reach a known-op load plateau and compare live V8 heap vs smaps Anonymous.
 *
 *   N=4000 node scripts/benchmarks/heap-vs-anon-plateau.mjs
 *   NODE_MAX_OLD_SPACE_MB=256 N=4000 OUT=.../heap-vs-anon-old256.json \
 *     node scripts/benchmarks/heap-vs-anon-plateau.mjs
 *
 * Distinguishes GC headroom (small heap, large anon) from retained live heap.
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  openSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { clawqlEqualArmEnv } from "./lib/clawql-bench-env.mjs";

const ROOT = "/workspace";
const N = Math.max(50, Number(process.env.N || 4000) || 4000);
const OLD_MB =
  process.env.NODE_MAX_OLD_SPACE_MB === "0" || process.env.NODE_MAX_OLD_SPACE_MB === "false"
    ? null
    : process.env.NODE_MAX_OLD_SPACE_MB
      ? Math.max(64, Number(process.env.NODE_MAX_OLD_SPACE_MB) || 0)
      : null;
const TRACE_GC = !["0", "false", "no"].includes((process.env.TRACE_GC ?? "1").trim().toLowerCase());

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/** Parse Node `--trace-gc` lines for pause durations (ms). */
function parseTraceGc(logText) {
  const pauses = [];
  for (const line of logText.split("\n")) {
    // e.g. "... 12.3 / 0.0 ms ..." or "Scavenge ... 1.2 ms"
    const m =
      line.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*ms/) ||
      line.match(/,\s*(\d+(?:\.\d+)?)\s*ms\b/) ||
      line.match(/\b(\d+(?:\.\d+)?)\s+ms:\s*(?:Scavenge|Mark-sweep|Mark-Compact|Minor|Major)/i);
    if (!m) continue;
    const dur = Number(m[1]);
    if (Number.isFinite(dur) && dur >= 0 && dur < 60_000) {
      pauses.push(dur);
    }
  }
  return pauses;
}
const OUT =
  process.env.OUT ||
  join(
    ROOT,
    "docs/benchmarks/cloudflare-multiturn",
    OLD_MB ? `heap-vs-anon-plateau-old${OLD_MB}-n${N}.json` : `heap-vs-anon-plateau-n${N}.json`
  );
const CURATED = join(ROOT, "scripts/benchmarks/cloudflare-multiturn/fixtures/curated-openapi.json");
const MOCK_JS = join(ROOT, "scripts/benchmarks/cloudflare-multiturn/mock/cloudflare-replay-mock.mjs");
const FIXTURE = join(ROOT, "scripts/benchmarks/cloudflare-multiturn/fixtures/recording.synthetic.json");

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
function smaps(pid) {
  const p = `/proc/${pid}/smaps_rollup`;
  if (!existsSync(p)) return null;
  const text = readFileSync(p, "utf8");
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}:\\s+(\\d+)\\s+kB`, "m"));
    return m ? Number((Number(m[1]) / 1024).toFixed(2)) : null;
  };
  return { rss_mb: get("Rss"), anonymous_mb: get("Anonymous"), pss_mb: get("Pss") };
}
async function healthz(port) {
  const res = await fetch(`http://127.0.0.1:${port}/healthz`);
  return res.json();
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

async function main() {
  const mock = await startMock();
  const home = join(tmpdir(), `heap-plateau-${process.pid}-${Date.now()}`);
  mkdirSync(home, { recursive: true });
  const port = await pickPort();
  const env = clawqlEqualArmEnv({
    home,
    specPath: CURATED,
    apiBase: mock.baseUrl,
  });
  Object.assign(env, {
    PORT: String(port),
    MCP_HOST: "127.0.0.1",
    CLOUDFLARE_API_TOKEN: "bench-fake-token",
    CLAWQL_CATALOG_SQLITE: "1",
    CLAWQL_CATALOG_SQLITE_BUILD: "oop",
    CLAWQL_BENCH_STATS: "1",
    CLAWQL_SEARCH_COMPACT: "0",
    CLAWQL_HTTP_SKIP_PAYMENTS: "1",
    CLAWQL_HTTP_SKIP_GRAPHQL: "1",
  });
  const nodeArgs = [join(ROOT, "dist/server-http.js")];
  if (OLD_MB) nodeArgs.unshift(`--max-old-space-size=${OLD_MB}`);
  if (TRACE_GC) nodeArgs.unshift("--trace-gc");
  const logPath = join(home, "clawql.log");
  const fd = openSync(logPath, "w");
  const child = spawn(process.execPath, nodeArgs, { env, stdio: ["ignore", fd, fd] });
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (existsSync(logPath) && readFileSync(logPath, "utf8").includes("listening on")) break;
    if (child.exitCode != null) throw new Error(readFileSync(logPath, "utf8").slice(-800));
    await new Promise((r) => setTimeout(r, 50));
  }
  await waitTcp(port);

  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  const client = new Client({ name: "heap-plateau", version: "1" }, {});
  await client.connect(transport);

  const series = [];
  const sampleEvery = Math.max(1, Math.floor(N / 40));
  const latencies = [];
  async function sample(i) {
    const h = await healthz(port);
    const s = smaps(child.pid);
    const heap = h?.bench?.heap_used_mb ?? null;
    const anon = s?.anonymous_mb ?? null;
    series.push({
      i,
      rss_mb: s?.rss_mb ?? null,
      anonymous_mb: anon,
      pss_mb: s?.pss_mb ?? null,
      heap_used_mb: heap,
      external_mb: h?.bench?.external_mb ?? null,
      native_anon_minus_heap_mb:
        anon != null && heap != null ? Number((anon - heap).toFixed(2)) : null,
    });
  }

  await sample(0);
  // known-op style: same board DNS list + length where
  let operationId = process.env.OP_ID || "dns-records-for-a-zone-list-dns-records";
  try {
    const listed = await client.listTools();
    const execTool = listed.tools.find((t) => t.name === "execute");
    if (!execTool) throw new Error("no execute tool");
  } catch (e) {
    console.error(e);
  }

  for (let i = 1; i <= N; i++) {
    const t0 = performance.now();
    try {
      const res = await client.callTool({
        name: "execute",
        arguments: {
          operationId,
          args: { zone_id: "z0z0z0z0z0z0z0z0z0z0z0z0z0z0z0z0", per_page: 500 },
          where: "{aRecordCount: length(result[?type==`A`])}",
        },
      });
      if (res?.isError && i === 1) {
        throw new Error(JSON.stringify(res.content?.slice?.(0, 1) ?? res).slice(0, 200));
      }
    } catch (err) {
      if (i === 1) throw err;
    }
    latencies.push(performance.now() - t0);
    if (i === 1 || i === N || i % sampleEvery === 0) await sample(i);
    if (i % Math.max(1, Math.floor(N / 10)) === 0) {
      const last = series.at(-1);
      console.error(`[heap-plateau] ${i}/${N} anon=${last?.anonymous_mb} heap=${last?.heap_used_mb}`);
    }
  }

  await client.close().catch(() => {});
  const plateau = series.slice(-5);
  const anonP = plateau.map((x) => x.anonymous_mb).filter((x) => x != null);
  const heapP = plateau.map((x) => x.heap_used_mb).filter((x) => x != null);
  const med = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  const latSorted = [...latencies].sort((a, b) => a - b);
  const gcPauses = TRACE_GC && existsSync(logPath) ? parseTraceGc(readFileSync(logPath, "utf8")) : [];
  const gcSorted = [...gcPauses].sort((a, b) => a - b);
  const report = {
    measuredAt: new Date().toISOString(),
    n: N,
    operationId,
    node_max_old_space_mb: OLD_MB,
    trace_gc: TRACE_GC,
    plateau: {
      anonymous_mb_median: med(anonP),
      heap_used_mb_median: med(heapP),
      native_anon_minus_heap_mb_median:
        med(anonP) != null && med(heapP) != null
          ? Number((med(anonP) - med(heapP)).toFixed(2))
          : null,
      samples: plateau.length,
    },
    series_ends: { first: series[0], last: series.at(-1) },
    latency_ms: {
      p50: percentile(latSorted, 50),
      p99: percentile(latSorted, 99),
      p999: percentile(latSorted, 99.9),
    },
    gc: {
      pause_count: gcPauses.length,
      pause_ms_p50: percentile(gcSorted, 50),
      pause_ms_p99: percentile(gcSorted, 99),
      pause_ms_max: gcSorted.length ? gcSorted[gcSorted.length - 1] : null,
      pause_ms_sum: gcPauses.length
        ? Number(gcPauses.reduce((a, b) => a + b, 0).toFixed(2))
        : null,
    },
    interpretation:
      med(heapP) != null && med(anonP) != null
        ? med(heapP) < med(anonP) * 0.45
          ? "live_heap_small_vs_anon — likely GC/allocator headroom; try tighter old-space A/B"
          : med(heapP) > med(anonP) * 0.7
            ? "live_heap_large — retained objects; diff early/late heap snapshots"
            : "mixed — inspect native_anon_minus_heap and snapshots"
        : "incomplete_samples",
    series,
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
        plateau: report.plateau,
        interpretation: report.interpretation,
        latency_ms: report.latency_ms,
        gc: report.gc,
      },
      null,
      2
    )
  );

  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  await mock.close();
  try {
    rmSync(home, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
