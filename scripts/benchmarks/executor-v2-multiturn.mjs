#!/usr/bin/env node
/**
 * Equal-arm multiturn board for Executor 2.x (HTTP streamable MCP).
 *
 *   EXECUTOR_V2_URL=http://127.0.0.1:4312/mcp \
 *   EXECUTOR_V2_API_KEY=$(cat /tmp/executor-v2-data/api_key.txt) \
 *   MT_ITERS=10000 MT_TURNS=12 \
 *   node scripts/benchmarks/executor-v2-multiturn.mjs
 *
 * Same fatPayload fixture as gateway-multi-multiturn direct/executor arms.
 * Discovery=0 (harness-authored execute). Tokens from flow 1; latency/RSS over all.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { getEncoding } from "js-tiktoken";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "gateway-multi-comparison");
const TURNS = Math.max(1, Number(process.env.MT_TURNS || 12));
const ITERS = Math.max(1, Number(process.env.MT_ITERS || 10000));
const LIMIT = Math.max(1, Number(process.env.MT_LIMIT || 25));
const PROGRESS = Math.max(1, Number(process.env.MT_PROGRESS_EVERY || 500));
const OUT_NAME = process.env.MT_OUT || "gateway-multi-multiturn-executor-v2-10k.json";
const MCP_URL = process.env.EXECUTOR_V2_URL || "http://127.0.0.1:4312/mcp";
const API_KEY =
  process.env.EXECUTOR_V2_API_KEY?.trim() ||
  (existsSync("/tmp/executor-v2-data/api_key.txt")
    ? readFileSync("/tmp/executor-v2-data/api_key.txt", "utf8").trim()
    : "");

const enc = getEncoding("cl100k_base");
const count = (t) => (t == null || t === "" ? 0 : enc.encode(String(t)).length);

function fatRow(i) {
  return {
    id: i,
    name: `Entity-${i}`,
    status: i % 3 === 0 ? "sold" : "available",
    tag: `tag-${i % 10}`,
    meta: {
      kennel: `K${i % 5}`,
      notes: "x".repeat(80),
      history: Array.from({ length: 5 }, (_, j) => ({ at: j, event: `e-${j}` })),
    },
  };
}

function fatPayload(partitionIndex, limit = LIMIT) {
  const rows = [];
  for (let i = 1; rows.length < limit; i++) {
    const row = fatRow(i + (partitionIndex - 1) * 1000);
    if (row.status !== "available") continue;
    rows.push(row);
  }
  return { items: rows, partition: `catalog_list_${String(partitionIndex).padStart(3, "0")}` };
}

function toolText(res) {
  const c = res?.content;
  if (!Array.isArray(c)) return "";
  return c
    .filter((x) => x?.type === "text")
    .map((x) => x.text)
    .join("\n");
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarizeMs(samples) {
  if (!samples.length) {
    return { n: 0, p50_ms: null, p95_ms: null, p99_ms: null, p999_ms: null, mean_ms: null };
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

function readProcRssMb(pid) {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const m = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    return m ? Number(m[1]) / 1024 : null;
  } catch {
    return null;
  }
}

function findServePid() {
  if (process.env.EXECUTOR_V2_PID) return Number(process.env.EXECUTOR_V2_PID);
  for (const ent of readdirSync("/proc")) {
    if (!/^\d+$/.test(ent)) continue;
    try {
      const cmd = readFileSync(`/proc/${ent}/cmdline`, "utf8").replace(/\0/g, " ");
      if (/\bexecutor\b/.test(cmd) && /\bserve\b/.test(cmd)) return Number(ent);
    } catch {
      /* ignore */
    }
  }
  return null;
}

function analyzeRssTrend(series) {
  if (!series?.length) return { classification: "unknown", reason: "no samples" };
  const vals = series.map((s) => s.rss_mb);
  const n = vals.length;
  const early = vals.slice(0, Math.max(1, Math.floor(n * 0.2)));
  const late = vals.slice(Math.floor(n * 0.8));
  const mid = vals.slice(Math.floor(n * 0.4), Math.max(Math.floor(n * 0.4) + 1, Math.floor(n * 0.7)));
  const earlyMed = percentile([...early].sort((a, b) => a - b), 50);
  const lateMed = percentile([...late].sort((a, b) => a - b), 50);
  const midMed = percentile([...mid].sort((a, b) => a - b), 50);
  const riseEarlyToLate = lateMed - earlyMed;
  const riseMidToLate = lateMed - midMed;
  const first = series[0];
  const last = series[series.length - 1];
  const flowSpan = (last.flow ?? n) - (first.flow ?? 1);
  const mbPer1kFlows =
    flowSpan > 0 ? Number((((last.rss_mb - first.rss_mb) / flowSpan) * 1000).toFixed(2)) : null;
  const plateau =
    midMed > 0 &&
    Math.abs(riseMidToLate) / midMed <= 0.05 &&
    riseMidToLate <= Math.max(8, 0.1 * midMed);
  const leak =
    !plateau &&
    riseEarlyToLate > Math.max(32, 0.15 * earlyMed) &&
    riseMidToLate > Math.max(16, 0.05 * midMed) &&
    (mbPer1kFlows == null || mbPer1kFlows > 2);
  let classification = "working_set_or_noise";
  let reason = "no clear monotonic climb after warm-up";
  if (plateau && riseEarlyToLate > Math.max(16, 0.1 * earlyMed)) {
    classification = "rise_then_plateau";
    reason = "RSS rises from ready/early samples then flattens in the last fifth of the run";
  } else if (leak) {
    classification = "steady_climb_possible_leak";
    reason = "RSS keeps rising through mid→late samples; treat as beta leak signal, not a memory headline";
  } else if (plateau) {
    classification = "plateau";
    reason = "late-window RSS stable relative to mid-window";
  }
  return {
    classification,
    reason,
    early_median_mb: Number(earlyMed.toFixed(2)),
    mid_median_mb: Number(midMed.toFixed(2)),
    late_median_mb: Number(lateMed.toFixed(2)),
    rise_early_to_late_mb: Number(riseEarlyToLate.toFixed(2)),
    rise_mid_to_late_mb: Number(riseMidToLate.toFixed(2)),
    mb_per_1000_flows: mbPer1kFlows,
    n_series: n,
  };
}

class ResourceSampler {
  constructor(label, pid) {
    this.label = label;
    this.pid = pid;
    this.samples = [];
    this.series = [];
    this._timer = null;
    this._t0 = performance.now();
    this._flow = 0;
  }
  start(intervalMs = 500) {
    if (!this.pid) return;
    this._t0 = performance.now();
    const tick = () => {
      const rss = readProcRssMb(this.pid);
      if (rss == null) return;
      this.samples.push(rss);
      this.series.push({
        t_s: Number(((performance.now() - this._t0) / 1000).toFixed(2)),
        flow: this._flow,
        rss_mb: Number(rss.toFixed(2)),
      });
    };
    tick();
    this._timer = setInterval(tick, intervalMs);
    if (typeof this._timer.unref === "function") this._timer.unref();
  }
  markFlow(flow) {
    this._flow = flow;
  }
  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (!this.samples.length) {
      return {
        label: this.label,
        pid: this.pid,
        n: 0,
        rss_mb: { min: null, median: null, max: null },
        series: [],
        trend: analyzeRssTrend([]),
      };
    }
    const rss = [...this.samples].sort((a, b) => a - b);
    const step = Math.max(1, Math.ceil(this.series.length / 120));
    const series = this.series.filter((_, i) => i % step === 0 || i === this.series.length - 1);
    return {
      label: this.label,
      pid: this.pid,
      n: rss.length,
      rss_mb: {
        min: Number(rss[0].toFixed(2)),
        median: Number(percentile(rss, 50).toFixed(2)),
        max: Number(rss[rss.length - 1].toFixed(2)),
      },
      series,
      trend: analyzeRssTrend(series),
    };
  }
}

async function main() {
  if (!API_KEY) throw new Error("EXECUTOR_V2_API_KEY or /tmp/executor-v2-data/api_key.txt required");
  await mkdir(OUT_DIR, { recursive: true });

  const pid = findServePid();
  const rssReady = pid != null ? readProcRssMb(pid) : null;
  console.log(`[ex2] url=${MCP_URL} iters=${ITERS} turns=${TURNS} pid=${pid} rss_ready_mb=${rssReady?.toFixed?.(1)}`);

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } },
  });
  const client = new Client({ name: "ex2-multiturn", version: "1" }, {});
  const tConnect = performance.now();
  await client.connect(transport);
  const readyMs = Number((performance.now() - tConnect).toFixed(1));

  const listed = await client.listTools();
  const executeTool = listed.tools.find((t) => t.name === "execute");
  const defs = executeTool ? count(JSON.stringify(executeTool)) : 0;
  const fullList = listed.tools.reduce((n, t) => n + count(JSON.stringify(t)), 0);

  const codes = [];
  for (let n = 1; n <= TURNS; n++) {
    codes.push(`return ${JSON.stringify(fatPayload(n))};`);
  }

  const sampler = new ResourceSampler("executor_v2", pid);
  sampler.start(ITERS > 100 ? 500 : 200);

  const flowE2e = [];
  const turnLat = [];
  let perTurn = null;
  let callErrors = 0;

  for (let iter = 1; iter <= ITERS; iter++) {
    sampler.markFlow(iter);
    const flowT0 = performance.now();
    const thisPerTurn = [];
    for (let ti = 0; ti < TURNS; ti++) {
      const t0 = performance.now();
      let text = "";
      let ok = true;
      try {
        const res = await client.callTool({ name: "execute", arguments: { code: codes[ti] } });
        if (res.isError) throw new Error(toolText(res).slice(0, 300));
        text = toolText(res);
      } catch (e) {
        ok = false;
        callErrors++;
        if (iter === 1) throw e;
      }
      const ms = performance.now() - t0;
      turnLat.push(ms);
      if (iter === 1) {
        const fixture = fatPayload(ti + 1);
        const fixtureJson = JSON.stringify(fixture);
        let valueEqual = false;
        try {
          const parsed = JSON.parse(text);
          const inner = parsed?.execution?.value ?? parsed?.value ?? parsed;
          valueEqual = JSON.stringify(inner) === fixtureJson;
        } catch {
          /* ignore */
        }
        thisPerTurn.push({
          n: ti + 1,
          tool: "execute",
          search_tokens: 0,
          result_tokens: count(text),
          result_chars: text.length,
          fixture_tokens: count(fixtureJson),
          value_equals_fixture: valueEqual,
          layer2_classic: count(text),
          latency_ms: Number(ms.toFixed(3)),
          ok,
        });
      }
    }
    flowE2e.push(performance.now() - flowT0);
    if (iter === 1) perTurn = thisPerTurn;
    if (iter % PROGRESS === 0 || iter === ITERS) {
      console.log(`[ex2] flows ${iter}/${ITERS}`);
    }
  }

  const resources = sampler.stop();
  await client.close().catch(() => {});

  const resultSum = perTurn.reduce((a, t) => a + t.result_tokens, 0);
  const fixtureSum = perTurn.reduce((a, t) => a + t.fixture_tokens, 0);
  const defsPlusEnvelope = defs + (resultSum - fixtureSum);
  const board = {
    runtime: "executor-v2-http",
    runtime_version: "2.0.0-beta.15",
    build: {
      channel: "npm_beta",
      package: "executor@2.0.0-beta.15",
      platform_package: "executor-linux-x64@2.0.0-beta.15-linux-x64",
      command: "executor serve",
      note:
        "Published beta release via npm optional platform package — not a local source/dev checkout. " +
        "workerd --debug-port=:0 is the runtime control socket, not a 'dev tools loaded' mode.",
    },
    ready_ms: readyMs,
    rss_mb_ready: rssReady != null ? Number(rssReady.toFixed(2)) : null,
    rss_mb_min: resources.rss_mb.min,
    rss_mb_median: resources.rss_mb.median,
    rss_mb_max: resources.rss_mb.max,
    rss_trend: resources.trend,
    definitions_tokens: defs,
    discovery_tokens_sum: 0,
    mean_discovery_tokens: 0,
    result_tokens_sum: resultSum,
    mean_result_tokens: Number((resultSum / TURNS).toFixed(1)),
    fixture_result_tokens_sum: fixtureSum,
    envelope_overhead_tokens_sum: resultSum - fixtureSum,
    defs_plus_envelope_over_compact_results: defsPlusEnvelope,
    layer1_once_tokens: defs,
    combined_at_n: defs + resultSum,
    combined_rebuild: defs + resultSum,
    compacted_inner_combined_at_n: defs + fixtureSum,
    flows: ITERS,
    turns_per_flow: TURNS,
    total_turns: ITERS * TURNS,
    flow_e2e_ms: summarizeMs(flowE2e),
    turn_latency_ms: summarizeMs(turnLat),
    call_errors: callErrors,
    task_success_ok: callErrors === 0,
    tools: listed.tools.map((t) => t.name),
    tools_list_full_tokens: fullList,
    transport: "streamable_http",
  };

  const report = {
    suite: "gateway-multi-multiturn-executor-v2",
    measuredAt: new Date().toISOString(),
    config: {
      turns: TURNS,
      iters: ITERS,
      limit: LIMIT,
      url: MCP_URL,
      tokenizer: "cl100k_base",
      discovery: 0,
      discovery_note:
        "Harness-authored execute returns fatPayload each turn; skills/search not called. " +
        "tools/list exposes execute/resume/skills but Layer2 discovery_tokens_sum=0 (same favor as v1).",
      transport: "streamable_http",
      peer_latency_note:
        "Compare latency only to ClawQL HTTP (clawql_http arm), not stdio ClawQL/Executor v1.",
    },
    board: { executor_v2: board },
    arms: {
      executor_v2: {
        id: "executor_v2",
        model: "http_mcp_code_execute_fat_static_v2",
        layer1: {
          once_schema_tokens: defs,
          tools_count: 1,
          tools_list_count_full: listed.tools.length,
          tools_list_schema_tokens_full: fullList,
          note: "execute schema only (v2 exposes execute/resume/skills; skills unused)",
        },
        perTurn,
        resources,
        startup: { ready_ms: readyMs, rss_mb_ready: board.rss_mb_ready },
        board,
      },
    },
    ratios_vs_direct: {
      executor_v2: {
        vs_direct_combined_classic: Number((board.combined_at_n / 35002).toFixed(2)),
        token_delta_vs_direct: board.combined_at_n - 35002,
        flow_e2e_p50_delta_ms_vs_direct: board.flow_e2e_ms.p50_ms != null ? Number((board.flow_e2e_ms.p50_ms - 2.173).toFixed(3)) : null,
      },
    },
    vs_board_peers: {
      note: "Peer numbers from gateway-multi-multiturn-10k.json / clawql_http board (fill after HTTP remeasure)",
      clawql_bun_stdio: { combined: 20539, flow_p50: 15.014, flow_p999: 34.974, turn_p50: 1.115, turn_p999: 4.823, rss_med: 337.09, transport: "stdio" },
      executor_v1_stdio: { combined: 53668, flow_p50: 64.351, flow_p999: 106.552, turn_p50: 5.026, turn_p999: 16.982, rss_med: 213.48, transport: "stdio" },
      agentgateway: { combined: 35002, flow_p50: 13.628, flow_p999: 330.912, turn_p50: 1.005, turn_p999: 3.54, rss_med: 214.08 },
      mcpjungle: { combined: 35322, flow_p50: 15.389, flow_p999: 134.972, turn_p50: 1.175, turn_p999: 3.842, rss_med: 152.55 },
    },
    version_scope: {
      v1_6_10: "pretty-printed results; +18,666 vs fair baseline (combined 53,668)",
      v2_beta_15: "compact envelopes; −5,075 vs baseline (combined 29,927). Credit the fix. ClawQL still leads by 9,388.",
      defs_plus_envelope_check: `combined − compact_results = ${defsPlusEnvelope} (defs ${defs} + envelope ${resultSum - fixtureSum})`,
    },
  };

  const outPath = join(OUT_DIR, OUT_NAME);
  await writeFile(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`[ex2] wrote ${outPath}`);
  console.log(
    JSON.stringify(
      {
        combined: board.combined_at_n,
        defs: board.definitions_tokens,
        results: board.result_tokens_sum,
        envelope: board.envelope_overhead_tokens_sum,
        defs_plus_envelope: defsPlusEnvelope,
        flow_e2e: board.flow_e2e_ms,
        turn: board.turn_latency_ms,
        rss_mb: { ready: board.rss_mb_ready, ...resources.rss_mb },
        rss_trend: resources.trend,
        discovery: 0,
        call_errors: callErrors,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
