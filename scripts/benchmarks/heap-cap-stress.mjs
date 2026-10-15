#!/usr/bin/env node
/**
 * Worst-case stress under a Node old-space cap (default 256 MB).
 *
 * Cases (with the cap on):
 *   1. full:true — unfiltered DNS list (largest allowed response)
 *   2. peak concurrency — single-instance multiplexed Streamable HTTP clients
 *   3. heavy in-process — memory_ingest of a long document (+ optional program fan-out)
 *
 *   NODE_MAX_OLD_SPACE_MB=256 node scripts/benchmarks/heap-cap-stress.mjs
 *   BUN_RUNTIME=1 BUN_SMOL=1 node scripts/benchmarks/heap-cap-stress.mjs  # Bun arm
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
import { clawqlEqualArmEnv, clawqlEqualArmInstanceSpec } from "./lib/clawql-bench-env.mjs";

const ROOT = "/workspace";
const OLD_MB =
  process.env.NODE_MAX_OLD_SPACE_MB === "0" || process.env.NODE_MAX_OLD_SPACE_MB === "false"
    ? null
    : Math.max(64, Number(process.env.NODE_MAX_OLD_SPACE_MB || 256) || 256);
const USE_BUN = ["1", "true", "yes"].includes((process.env.BUN_RUNTIME ?? "").trim().toLowerCase());
const BUN_SMOL = !["0", "false", "no"].includes((process.env.BUN_SMOL ?? "1").trim().toLowerCase());
const BUN_BIN = process.env.BUN_BIN || "bun";
const CONC_MAX = Math.max(1, Number(process.env.CONC_MAX || 128) || 128);
const CONC_STEP_MS = Math.max(500, Number(process.env.CONC_STEP_MS || 3000) || 3000);
/** Match gateway-multi single-instance chaos SLO (do not claim vs board without this). */
const BREAK_P99_MS = Math.max(1, Number(process.env.BREAK_P99_MS || 100) || 100);
const BREAK_ERROR_RATE = Math.min(
  1,
  Math.max(0, Number(process.env.BREAK_ERROR_RATE ?? 0.02) || 0.02)
);
const OUT =
  process.env.OUT ||
  join(
    ROOT,
    "docs/benchmarks/cloudflare-multiturn",
    USE_BUN
      ? `heap-cap-stress-bun${BUN_SMOL ? "-smol" : ""}-old${OLD_MB ?? "none"}.json`
      : `heap-cap-stress-node-old${OLD_MB ?? "none"}.json`
  );
const CURATED = join(ROOT, "scripts/benchmarks/cloudflare-multiturn/fixtures/curated-openapi.json");
const MOCK_JS = join(ROOT, "scripts/benchmarks/cloudflare-multiturn/mock/cloudflare-replay-mock.mjs");
const FIXTURE = join(ROOT, "scripts/benchmarks/cloudflare-multiturn/fixtures/recording.synthetic.json");
const OP_ID = process.env.OP_ID || "dns-records-for-a-zone-list-dns-records";
const ZONE = "z0z0z0z0z0z0z0z0z0z0z0z0z0z0z0z0";

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
function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
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

function buildEnv(home, baseUrl, { memory = false, programs = false } = {}) {
  const spec = clawqlEqualArmInstanceSpec();
  if (memory) spec.memory = { enabled: true };
  const env = clawqlEqualArmEnv({ home, specPath: CURATED, apiBase: baseUrl });
  Object.assign(env, {
    CLAWQL_INSTANCE_SPEC: JSON.stringify(spec),
    CLAWQL_ENABLE_MEMORY: memory ? "1" : "0",
    CLAWQL_ENABLE_PROGRAMS: programs ? "1" : "0",
    PORT: undefined, // set by caller
    MCP_HOST: "127.0.0.1",
    CLOUDFLARE_API_TOKEN: "bench-fake-token",
    CLAWQL_CATALOG_SQLITE: "1",
    CLAWQL_CATALOG_SQLITE_BUILD: "oop",
    CLAWQL_BENCH_STATS: "1",
    CLAWQL_SEARCH_COMPACT: "0",
    CLAWQL_HTTP_SKIP_PAYMENTS: "1",
    CLAWQL_HTTP_SKIP_GRAPHQL: "1",
    CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE: "1",
  });
  return env;
}

async function startClawql(env, port) {
  env.PORT = String(port);
  env.MCP_PORT = String(port);
  const server = join(ROOT, "dist/server-http.js");
  let bin;
  let args;
  if (USE_BUN) {
    bin = BUN_BIN;
    args = BUN_SMOL ? ["--smol", server] : [server];
  } else {
    bin = process.execPath;
    args = OLD_MB ? [`--max-old-space-size=${OLD_MB}`, server] : [server];
  }
  const home = env.CLAWQL_HOME;
  const logPath = join(home, "clawql.log");
  const fd = openSync(logPath, "w");
  const child = spawn(bin, args, { env, stdio: ["ignore", fd, fd] });
  let exitInfo = null;
  child.on("exit", (code, signal) => {
    exitInfo = { code, signal };
  });
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (exitInfo) {
      const tail = existsSync(logPath) ? readFileSync(logPath, "utf8").slice(-1200) : "";
      throw new Error(`clawql exited early ${JSON.stringify(exitInfo)}\n${tail}`);
    }
    if (existsSync(logPath) && readFileSync(logPath, "utf8").includes("listening on")) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await waitTcp(port);
  return { child, logPath, getExit: () => exitInfo };
}

async function connectClient(port, name) {
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  const client = new Client({ name, version: "1" }, {});
  await client.connect(transport);
  return { client, transport };
}

function oomOrCrash(logText, exitInfo) {
  const text = logText || "";
  const oom =
    /JavaScript heap out of memory|FATAL ERROR|Allocation failed|out of memory|OOM/i.test(text);
  return {
    crashed: exitInfo != null && exitInfo.code !== 0 && exitInfo.code !== null,
    oom,
    exit: exitInfo,
    log_tail: text.slice(-800),
  };
}

async function caseFullTrue(mock) {
  const home = join(tmpdir(), `heap-stress-full-${process.pid}-${Date.now()}`);
  mkdirSync(home, { recursive: true });
  const port = await pickPort();
  const env = buildEnv(home, mock.baseUrl);
  // Raise hard char limit so full:true is a real large allocation (product default is 64 KiB).
  env.CLAWQL_EXECUTE_RESULT_MAX_CHARS = String(
    Math.max(2_000_000, Number(process.env.CLAWQL_EXECUTE_RESULT_MAX_CHARS || 2_000_000) || 2_000_000)
  );
  let srv;
  const result = {
    case: "full_true_unfiltered_list",
    ok: false,
    crashed: false,
    oom: false,
    byte_count: null,
    truncated: null,
    latency_ms: null,
    memory: null,
  };
  try {
    srv = await startClawql(env, port);
    const { client } = await connectClient(port, "full-true");
    const t0 = performance.now();
    const res = await client.callTool({
      name: "execute",
      arguments: {
        operationId: OP_ID,
        args: { zone_id: ZONE, per_page: 500 },
        full: true,
      },
    });
    result.latency_ms = Number((performance.now() - t0).toFixed(2));
    result.memory = smaps(srv.child.pid);
    const text = res?.content?.find?.((c) => c.type === "text")?.text ?? "";
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* raw */
    }
    result.byte_count = json?.byteCount ?? text.length;
    result.truncated = json?.truncated === true;
    result.truncation_reason = json?.reason ?? null;
    result.is_error = Boolean(res?.isError);
    // Success = survived + returned a large body (not observation-budget truncated).
    result.ok = !res?.isError && !result.truncated && result.byte_count >= 50_000;
    await client.close().catch(() => {});
    const crash = oomOrCrash(
      existsSync(srv.logPath) ? readFileSync(srv.logPath, "utf8") : "",
      srv.getExit()
    );
    Object.assign(result, { crashed: crash.crashed, oom: crash.oom, exit: crash.exit });
  } catch (e) {
    result.error = String(e?.message || e).slice(0, 500);
    if (srv) {
      const crash = oomOrCrash(
        existsSync(srv.logPath) ? readFileSync(srv.logPath, "utf8") : "",
        srv.getExit()
      );
      Object.assign(result, { crashed: crash.crashed || true, oom: crash.oom, exit: crash.exit });
    } else {
      result.crashed = true;
    }
  } finally {
    try {
      srv?.child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  console.error(
    `[stress] full:true ok=${result.ok} crashed=${result.crashed} oom=${result.oom} bytes=${result.byte_count} anon=${result.memory?.anonymous_mb}`
  );
  return result;
}

async function caseConcurrency(mock) {
  const home = join(tmpdir(), `heap-stress-conc-${process.pid}-${Date.now()}`);
  mkdirSync(home, { recursive: true });
  const port = await pickPort();
  const env = buildEnv(home, mock.baseUrl);
  let srv;
  const steps = [];
  let brokeAt = null;
  let processDied = null;
  try {
    srv = await startClawql(env, port);
    for (let n = 1; n <= CONC_MAX; n *= 2) {
      if (srv.getExit()) {
        processDied = {
          at_concurrency: n,
          ...oomOrCrash(readFileSync(srv.logPath, "utf8"), srv.getExit()),
        };
        break;
      }
      console.error(`[stress] concurrency=${n}`);
      const clients = [];
      for (let i = 0; i < n; i++) {
        clients.push(await connectClient(port, `conc-${n}-${i}`));
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
                name: "execute",
                arguments: {
                  operationId: OP_ID,
                  args: { zone_id: ZONE, per_page: 50 },
                  where: "{aRecordCount: length(result[?type==`A`])}",
                },
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
      for (const c of clients) await c.client.close().catch(() => {});
      const sorted = [...latencies].sort((a, b) => a - b);
      const total = ok + err;
      const errorRate = total > 0 ? err / total : 1;
      const mem = smaps(srv.child.pid);
      const exit = srv.getExit();
      const p99 = percentile(sorted, 99);
      const brokenSlo =
        errorRate > BREAK_ERROR_RATE || (p99 != null && p99 > BREAK_P99_MS);
      const step = {
        concurrency: n,
        ok,
        err,
        error_rate: Number(errorRate.toFixed(4)),
        latency_ms: {
          p50: percentile(sorted, 50),
          p99,
          p999: percentile(sorted, 99.9),
        },
        memory: mem,
        process_alive: exit == null,
        broken_slo: brokenSlo,
        break_reason: brokenSlo
          ? [
              errorRate > BREAK_ERROR_RATE ? `error_rate ${errorRate.toFixed(3)}` : null,
              p99 != null && p99 > BREAK_P99_MS ? `p99 ${p99.toFixed(1)}ms` : null,
            ]
              .filter(Boolean)
              .join(" + ")
          : null,
      };
      steps.push(step);
      if (exit) {
        processDied = {
          at_concurrency: n,
          ...oomOrCrash(readFileSync(srv.logPath, "utf8"), exit),
        };
        brokeAt = n;
        break;
      }
      // OOM-survival continues past SLO break; record first SLO break separately.
      if (brokenSlo && brokeAt == null) {
        brokeAt = n;
        // Keep going only if CONC_UNTIL_OOM=1; default stops at first SLO break (board-comparable).
        if (!["1", "true", "yes"].includes((process.env.CONC_UNTIL_OOM ?? "").trim().toLowerCase())) {
          break;
        }
      }
    }
  } catch (e) {
    processDied = {
      error: String(e?.message || e).slice(0, 500),
      ...(srv
        ? oomOrCrash(
            existsSync(srv.logPath) ? readFileSync(srv.logPath, "utf8") : "",
            srv.getExit()
          )
        : { crashed: true }),
    };
  } finally {
    try {
      srv?.child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  const lastOk = [...steps]
    .reverse()
    .find((s) => s.process_alive && !s.broken_slo);
  const result = {
    case: "peak_concurrency_single_instance",
    note:
      "HTTP multiplex Streamable clients on one ClawQL process — not equal-arm stdio chaos. " +
      `SLO matches gateway-multi: p99≤${BREAK_P99_MS}ms and error_rate≤${BREAK_ERROR_RATE}. ` +
      "Do not claim vs board 63/204 without the multi-comparison chaos harness.",
    ok: processDied == null || !processDied.oom,
    crashed: Boolean(processDied?.crashed || processDied?.oom),
    oom: Boolean(processDied?.oom),
    slo: { break_p99_ms: BREAK_P99_MS, break_error_rate: BREAK_ERROR_RATE, step_ms: CONC_STEP_MS },
    sustained_concurrency_before_break: lastOk?.concurrency ?? 0,
    broke_at: brokeAt,
    break_reason: steps.find((s) => s.concurrency === brokeAt)?.break_reason ?? null,
    process_died: processDied,
    steps,
    max_tried: CONC_MAX,
    step_ms: CONC_STEP_MS,
  };
  console.error(
    `[stress] concurrency sustained=${result.sustained_concurrency_before_break} crashed=${result.crashed} oom=${result.oom}`
  );
  return result;
}

async function caseHeavyMemoryIngest(mock) {
  const home = join(tmpdir(), `heap-stress-mem-${process.pid}-${Date.now()}`);
  mkdirSync(home, { recursive: true });
  const port = await pickPort();
  const env = buildEnv(home, mock.baseUrl, { memory: true });
  let srv;
  const result = {
    case: "memory_ingest_long_document",
    ok: false,
    crashed: false,
    oom: false,
    doc_chars: null,
    latency_ms: null,
    memory: null,
  };
  // ~2 MB of prose — heavy for in-process ingest + vault write
  const chunk =
    "ClawQL memory ingest stress paragraph. Wikilink [[Heap Cap Stress]] and [[Measured Defaults]]. ".repeat(
      40
    );
  const insights = Array.from({ length: 80 }, (_, i) => `## Section ${i}\n\n${chunk}`).join("\n");
  result.doc_chars = insights.length;
  try {
    srv = await startClawql(env, port);
    const { client } = await connectClient(port, "mem-ingest");
    const listed = await client.listTools();
    const hasIngest = listed.tools.some((t) => t.name === "memory_ingest");
    if (!hasIngest) {
      result.skipped = true;
      result.skip_reason = "memory_ingest tool not registered";
      await client.close().catch(() => {});
      return result;
    }
    const t0 = performance.now();
    const res = await client.callTool({
      name: "memory_ingest",
      arguments: {
        title: "Heap Cap Stress Long Doc",
        insights,
        wikilinks: ["Heap Cap Stress", "Measured Defaults"],
        append: true,
      },
    });
    result.latency_ms = Number((performance.now() - t0).toFixed(2));
    result.memory = smaps(srv.child.pid);
    result.is_error = Boolean(res?.isError);
    result.ok = !res?.isError;
    result.response_head = (res?.content?.find?.((c) => c.type === "text")?.text ?? "").slice(
      0,
      200
    );
    await client.close().catch(() => {});
    const crash = oomOrCrash(
      existsSync(srv.logPath) ? readFileSync(srv.logPath, "utf8") : "",
      srv.getExit()
    );
    Object.assign(result, { crashed: crash.crashed, oom: crash.oom, exit: crash.exit });
  } catch (e) {
    result.error = String(e?.message || e).slice(0, 500);
    if (srv) {
      const crash = oomOrCrash(
        existsSync(srv.logPath) ? readFileSync(srv.logPath, "utf8") : "",
        srv.getExit()
      );
      Object.assign(result, {
        crashed: crash.crashed || true,
        oom: crash.oom,
        exit: crash.exit,
        log_tail: crash.log_tail,
      });
    } else {
      result.crashed = true;
    }
  } finally {
    try {
      srv?.child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  console.error(
    `[stress] memory_ingest ok=${result.ok} crashed=${result.crashed} oom=${result.oom} chars=${result.doc_chars} anon=${result.memory?.anonymous_mb}`
  );
  return result;
}

async function caseProgramFanout(mock) {
  const home = join(tmpdir(), `heap-stress-prog-${process.pid}-${Date.now()}`);
  mkdirSync(home, { recursive: true });
  const port = await pickPort();
  const env = buildEnv(home, mock.baseUrl, { programs: true });
  let srv;
  const result = {
    case: "program_fanout",
    ok: false,
    crashed: false,
    oom: false,
    steps: 8,
    latency_ms: null,
    memory: null,
  };
  try {
    srv = await startClawql(env, port);
    const { client } = await connectClient(port, "prog-fanout");
    const listed = await client.listTools();
    const toolName = listed.tools.some((t) => t.name === "execute_program")
      ? "execute_program"
      : listed.tools.some((t) => t.name === "program")
        ? "program"
        : null;
    if (!toolName) {
      result.skipped = true;
      result.skip_reason = "execute_program tool not registered";
      await client.close().catch(() => {});
      return result;
    }
    // ADR 0015 v0: MCP tool takes `source` (JSON plan string).
    const source = JSON.stringify({
      v: 1,
      mode: "sequential",
      calls: Array.from({ length: 8 }, (_, i) => ({
        id: String(i + 1),
        operationId: OP_ID,
        args: { zone_id: ZONE, per_page: 100 },
        where: "{n: length(result)}",
      })),
    });
    const t0 = performance.now();
    const res = await client.callTool({
      name: toolName,
      arguments: { source, timeoutMs: 60_000 },
    });
    result.latency_ms = Number((performance.now() - t0).toFixed(2));
    result.memory = smaps(srv.child.pid);
    result.is_error = Boolean(res?.isError);
    result.ok = !res?.isError;
    result.response_head = (res?.content?.find?.((c) => c.type === "text")?.text ?? "").slice(
      0,
      240
    );
    await client.close().catch(() => {});
    const crash = oomOrCrash(
      existsSync(srv.logPath) ? readFileSync(srv.logPath, "utf8") : "",
      srv.getExit()
    );
    Object.assign(result, { crashed: crash.crashed, oom: crash.oom, exit: crash.exit });
  } catch (e) {
    result.error = String(e?.message || e).slice(0, 500);
    if (srv) {
      const crash = oomOrCrash(
        existsSync(srv.logPath) ? readFileSync(srv.logPath, "utf8") : "",
        srv.getExit()
      );
      Object.assign(result, { crashed: crash.crashed || true, oom: crash.oom, exit: crash.exit });
    } else {
      result.crashed = true;
    }
  } finally {
    try {
      srv?.child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  console.error(
    `[stress] program_fanout ok=${result.ok} crashed=${result.crashed} oom=${result.oom} anon=${result.memory?.anonymous_mb}`
  );
  return result;
}

async function main() {
  const mock = await startMock();
  const cases = [];
  try {
    cases.push(await caseFullTrue(mock));
    cases.push(await caseConcurrency(mock));
    cases.push(await caseHeavyMemoryIngest(mock));
    cases.push(await caseProgramFanout(mock));
  } finally {
    await mock.close();
  }

  const anyOom = cases.some((c) => c.oom);
  const anyCrash = cases.some((c) => c.crashed && !c.skipped);
  const memCase = cases.find((c) => c.case === "memory_ingest_long_document");
  const memAnon = memCase?.memory?.anonymous_mb;
  const memTight =
    !USE_BUN &&
    OLD_MB != null &&
    memAnon != null &&
    memAnon > OLD_MB * 0.9 &&
    !anyOom;
  const report = {
    measuredAt: new Date().toISOString(),
    runtime: USE_BUN ? "bun" : "node",
    bun_smol: USE_BUN ? BUN_SMOL : null,
    node_max_old_space_mb: USE_BUN ? null : OLD_MB,
    any_oom: anyOom,
    any_crash: anyCrash,
    memory_profile_anon_mb: memAnon ?? null,
    recommendation: anyOom
      ? "raise_cap_or_isolate_heavy_work — OOM under stress; try 384 MB for memory/program profiles or OOP worker"
      : anyCrash
        ? "investigate_non_oom_crash"
        : memTight
          ? "lean_256_ok_memory_profile_prefer_384 — survived; long memory_ingest anon near old-space cap"
          : "256_mb_survives_stress_cases",
    cases,
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
        any_oom: report.any_oom,
        any_crash: report.any_crash,
        recommendation: report.recommendation,
        summary: cases.map((c) => ({
          case: c.case,
          ok: c.ok,
          crashed: c.crashed,
          oom: c.oom,
          skipped: c.skipped,
          sustained: c.sustained_concurrency_before_break,
          anon: c.memory?.anonymous_mb,
        })),
      },
      null,
      2
    )
  );
  if (anyOom) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
