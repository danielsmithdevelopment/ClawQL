#!/usr/bin/env node
/**
 * Render shareable ClawQL vs Executor wall-clock latency HTML
 * with p50 / p95 / p99 for every tool arm.
 *
 *   node scripts/benchmarks/generate-executor-cmp-latency-html.mjs
 *
 * Writes:
 *   docs/benchmarks/executor-comparison/latency.html
 *   apps/www/public/benchmarks/executor-comparison/latency.html
 *   apps/www/public/benchmarks/executor-comparison/latency.json
 *   docs/benchmarks/executor-comparison/executor-cmp-latency-chart.json
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LATENCY_JSON = join(
  ROOT,
  "docs",
  "benchmarks",
  "executor-comparison",
  "executor-cmp-latency.json"
);
const OUT_DOCS = join(ROOT, "docs", "benchmarks", "executor-comparison", "latency.html");
const OUT_WWW_DIR = join(ROOT, "apps", "www", "public", "benchmarks", "executor-comparison");
const OUT_WWW_HTML = join(OUT_WWW_DIR, "latency.html");
const OUT_WWW_JSON = join(OUT_WWW_DIR, "latency.json");
const CANONICAL = "https://clawql.com/benchmarks/executor-comparison/latency.html";

const EXECUTOR_WARM_REFERENCE = {
  id: "executor_execute",
  source: "reference",
  label: "Executor execute",
  workload: "lighter",
  subtitle: "warm no-op band · no HTTP / filter / audit",
  p50_ms: 75,
  p95_ms: 100,
  p99_ms: 100,
  band_low_ms: 50,
  band_high_ms: 100,
  citation:
    "UsefulSoftwareCo/executor#1519 — self-hosted warm execution ~50–100ms (not same-host live)",
  url: "https://github.com/UsefulSoftwareCo/executor/issues/1519",
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function armStats(arm, fallbacks = {}) {
  if (!arm) return null;
  return {
    p50_ms: arm.p50_ms,
    p95_ms: arm.p95_ms,
    p99_ms: arm.p99_ms ?? arm.max_ms,
    min_ms: arm.min_ms,
    max_ms: arm.max_ms,
    n: arm.n,
    ...fallbacks,
  };
}

function buildChartEnvelope(report) {
  const arms = report.arms ?? {};
  const execute =
    arms.clawql_execute_heavy ?? arms.clawql_execute_listPets;
  const search = arms.clawql_search;
  const audit = arms.clawql_audit_append;
  const heavyTurn = arms.clawql_heavy_turn;
  const execArm = arms.executor;

  let executorSeries;
  if (execArm?.wired && execArm.noop) {
    executorSeries = {
      id: "executor_execute",
      source: "live",
      label: "Executor execute",
      workload: "lighter",
      subtitle: "live no-op · no upstream",
      ...armStats(execArm.noop),
      endpoint: execArm.endpoint,
      citation: execArm.note,
    };
  } else {
    executorSeries = { ...EXECUTOR_WARM_REFERENCE };
  }

  const tools = [
    search
      ? {
          id: "clawql_search",
          source: "live",
          label: "ClawQL search",
          workload: "heavier",
          subtitle: "catalog resolve + durable WORM",
          ...armStats(search),
        }
      : null,
    execute
      ? {
          id: "clawql_execute",
          source: "live",
          label: "ClawQL execute",
          workload: "heavier",
          subtitle: `large mock (${report.config?.pet_count ?? "?"} rows) + where + fields`,
          ...armStats(execute),
        }
      : null,
    audit
      ? {
          id: "clawql_audit",
          source: "live",
          label: "ClawQL audit",
          workload: "heavier",
          subtitle: "ephemeral ring append",
          ...armStats(audit),
        }
      : null,
    heavyTurn
      ? {
          id: "clawql_heavy_turn",
          source: "live",
          label: "ClawQL heavy turn",
          workload: "heavier",
          subtitle: "search + execute + audit (one sample)",
          ...armStats(heavyTurn),
          headline: true,
        }
      : null,
    executorSeries,
  ].filter(Boolean);

  const clawHeavy = heavyTurn ?? execute;
  const clawP50 = clawHeavy?.p50_ms ?? null;
  const clawP99 = clawHeavy?.p99_ms ?? clawHeavy?.max_ms ?? null;
  const ratio =
    clawP50 > 0 ? Number((executorSeries.p50_ms / clawP50).toFixed(2)) : null;
  const execHigh = executorSeries.band_high_ms ?? executorSeries.p99_ms ?? executorSeries.p50_ms;
  const p99Beats = clawP99 != null && clawP99 < execHigh;
  const p50Beats = clawP50 != null && clawP50 < (executorSeries.band_low_ms ?? executorSeries.p50_ms);

  return {
    suite: "executor-cmp-latency-chart",
    canonical: CANONICAL,
    measuredAt: report.measuredAt,
    host: report.host,
    config: report.config,
    pathFlags: report.pathFlags ?? null,
    workloadTilt: report.workloadTilt ?? null,
    tools,
    series: {
      // keep older keys for consumers
      clawql_execute: execute
        ? {
            source: "live",
            label: "ClawQL execute",
            ...armStats(execute),
            citation: "MCP stdio → listPets heavy (where+fields) against local mock",
          }
        : null,
      clawql_search: search ? { source: "live", label: "ClawQL search", ...armStats(search) } : null,
      clawql_audit: audit ? { source: "live", label: "ClawQL audit", ...armStats(audit) } : null,
      clawql_heavy_turn: heavyTurn
        ? { source: "live", label: "ClawQL heavy turn", ...armStats(heavyTurn) }
        : null,
      executor: executorSeries,
    },
    headline: {
      clawql_p50_ms: clawP50,
      clawql_p95_ms: clawHeavy?.p95_ms ?? null,
      clawql_p99_ms: clawP99,
      clawql_arm: heavyTurn ? "heavy_turn" : "execute",
      executor_p50_ms: executorSeries.p50_ms,
      executor_p95_ms: executorSeries.p95_ms,
      executor_p99_ms: executorSeries.p99_ms,
      ratio_executor_over_clawql: ratio,
      executor_source: executorSeries.source,
      p50_beats_executor_band_low: p50Beats,
      p99_beats_executor_band_high: p99Beats,
    },
    honesty: {
      ...(report.honesty ?? {}),
      executorReference:
        executorSeries.source === "reference"
          ? "Executor uses the published warm 50–100ms self-host band until EXECUTOR_BIN/URL is wired."
          : "Executor bar is live no-op execute on this host (lighter than ClawQL heavy).",
      notTokenFlamegraph:
        "Distinct from /mcp-ui/trace/compare/executor (token context). This page is wall-clock ms.",
      p99VsExecutor: p99Beats
        ? `ClawQL ${heavyTurn ? "heavy turn" : "execute"} p99 ${clawP99}ms stays under the Executor high (${execHigh}ms) while doing more work.`
        : `ClawQL ${heavyTurn ? "heavy turn" : "execute"} p99 ${clawP99}ms does not beat Executor high (${execHigh}ms); check p50/p95 and sample n.`,
    },
  };
}

function pctWidth(ms, maxMs) {
  return Math.max(2.5, Math.min(100, (ms / maxMs) * 100));
}

function renderToolRow(tool, maxMs) {
  const pills = [
    { key: "p50", ms: tool.p50_ms, cls: "p50" },
    { key: "p95", ms: tool.p95_ms, cls: "p95" },
    { key: "p99", ms: tool.p99_ms, cls: "p99" },
  ];
  const barClass = tool.workload === "lighter" ? "exec" : "claw";
  const workBadge =
    tool.workload === "lighter"
      ? `<span class="badge light">lighter</span>`
      : `<span class="badge heavy">heavier</span>`;

  return `
      <div class="tool ${tool.headline ? "headline-tool" : ""}" data-tool="${escapeHtml(tool.id)}">
        <div class="tool-head">
          <div class="name">${escapeHtml(tool.label)} ${workBadge}
            <span class="sub">${escapeHtml(tool.subtitle || "")}</span>
          </div>
          <div class="nums">
            <span><em>p50</em> ${tool.p50_ms.toFixed(1)}</span>
            <span><em>p95</em> ${tool.p95_ms.toFixed(1)}</span>
            <span><em>p99</em> ${tool.p99_ms.toFixed(1)}</span>
            <span class="unit">ms</span>
          </div>
        </div>
        <div class="tracks">
          ${pills
            .map(
              (p) => `
            <div class="track-row">
              <span class="p-label">${p.key}</span>
              <div class="track">
                ${
                  tool.source === "reference" && tool.band_low_ms != null
                    ? `<span class="band" style="left:${pctWidth(tool.band_low_ms, maxMs).toFixed(2)}%;width:${(pctWidth(tool.band_high_ms, maxMs) - pctWidth(tool.band_low_ms, maxMs)).toFixed(2)}%"></span>`
                    : ""
                }
                <span class="bar ${barClass} ${p.cls}" style="width:${pctWidth(p.ms, maxMs).toFixed(2)}%"></span>
              </div>
            </div>`
            )
            .join("")}
        </div>
      </div>`;
}

function renderHtml(chart) {
  const tools = chart.tools;
  const maxMs = Math.max(
    100,
    ...tools.flatMap((t) => [t.p50_ms, t.p95_ms, t.p99_ms, t.band_high_ms ?? 0])
  );
  const h = chart.headline;
  const ratioLabel =
    h.ratio_executor_over_clawql != null
      ? chart.series.executor.source === "reference"
        ? `~${h.ratio_executor_over_clawql}× vs Executor mid (ClawQL heavier)`
        : `${h.ratio_executor_over_clawql}× vs Executor no-op (ClawQL heavier)`
      : "—";
  const petCount = chart.config?.pet_count ?? "?";
  const iters = chart.config?.iters ?? "?";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>ClawQL vs Executor — latency p50 / p95 / p99</title>
  <link rel="canonical" href="${escapeHtml(CANONICAL)}"/>
  <meta name="description" content="Wall-clock MCP latency with p50/p95/p99. ClawQL runs a heavier workload and still wins on p50."/>
  <meta property="og:title" content="ClawQL vs Executor — p50/p95/p99 latency"/>
  <meta property="og:description" content="ClawQL heavy turn p50 ${h.clawql_p50_ms}ms · Executor ${h.executor_p50_ms}ms · ${ratioLabel}"/>
  <meta property="og:url" content="${escapeHtml(CANONICAL)}"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,650;9..144,750&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --ink: #0c1a1a;
      --muted: #3d5454;
      --paper: #f3f7f5;
      --card: #ffffff;
      --claw: #0b6e63;
      --claw-deep: #084f48;
      --exec: #b45309;
      --exec-band: rgba(180, 83, 9, 0.18);
      --line: #d5e0dc;
      --font-display: "Fraunces", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
      --font-body: "Source Sans 3", "Source Sans Pro", "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      font-family: var(--font-body);
      background:
        radial-gradient(1200px 600px at 10% -10%, #d8f0ea 0%, transparent 55%),
        radial-gradient(900px 500px at 100% 0%, #f6e7d4 0%, transparent 50%),
        linear-gradient(180deg, #eef5f2 0%, var(--paper) 40%, #e8efec 100%);
    }
    .wrap { max-width: 920px; margin: 0 auto; padding: 2rem 1.25rem 3.5rem; }
    .brand {
      font-family: var(--font-display);
      font-size: clamp(2.4rem, 6vw, 3.4rem);
      font-weight: 750;
      letter-spacing: -0.03em;
      margin: 0 0 0.35rem;
      color: var(--claw-deep);
      line-height: 1.05;
    }
    h1 {
      font-family: var(--font-display);
      font-size: clamp(1.35rem, 3.2vw, 1.75rem);
      font-weight: 650;
      margin: 0 0 0.5rem;
      letter-spacing: -0.02em;
    }
    .lead { color: var(--muted); font-size: 1.05rem; margin: 0 0 1.35rem; max-width: 42rem; }
    .tilt {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      margin: 0 0 1.25rem;
    }
    .tilt div {
      background: rgba(255,255,255,0.7);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 0.75rem 0.9rem;
      font-size: 0.88rem;
      color: var(--muted);
    }
    .tilt strong { display: block; color: var(--ink); margin-bottom: 0.2rem; font-size: 0.95rem; }
    .chart {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 1.1rem 1.15rem 0.85rem;
      box-shadow: 0 18px 40px rgba(12, 40, 36, 0.06);
    }
    .tool { padding: 0.85rem 0; border-bottom: 1px solid var(--line); }
    .tool:last-child { border-bottom: 0; }
    .tool.headline-tool { background: rgba(11, 110, 99, 0.05); margin: 0 -0.55rem; padding: 0.85rem 0.55rem; border-radius: 8px; border-bottom: 0; }
    .tool-head {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
      margin-bottom: 0.55rem;
    }
    .name { font-weight: 700; font-size: 0.98rem; }
    .sub { display: block; font-weight: 400; color: var(--muted); font-size: 0.78rem; margin-top: 0.15rem; }
    .badge {
      display: inline-block;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 0.12rem 0.4rem;
      border-radius: 4px;
      vertical-align: middle;
      margin-left: 0.35rem;
    }
    .badge.heavy { background: #d8f0ea; color: var(--claw-deep); }
    .badge.light { background: #ffedd5; color: #9a3412; }
    .nums {
      display: flex;
      gap: 0.65rem;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      font-size: 0.95rem;
      white-space: nowrap;
    }
    .nums em { font-style: normal; color: var(--muted); font-weight: 600; font-size: 0.72rem; margin-right: 0.2rem; }
    .nums .unit { color: var(--muted); font-weight: 500; }
    .track-row {
      display: grid;
      grid-template-columns: 2.2rem 1fr;
      gap: 0.45rem;
      align-items: center;
      margin: 0.28rem 0;
    }
    .p-label { font-size: 0.72rem; color: var(--muted); font-weight: 600; text-transform: uppercase; }
    .track {
      position: relative;
      height: 14px;
      background: #eef3f1;
      border-radius: 4px;
      overflow: hidden;
    }
    .bar {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      border-radius: 4px;
      transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .bar.claw { background: linear-gradient(90deg, var(--claw-deep), var(--claw)); }
    .bar.claw.p95 { opacity: 0.78; }
    .bar.claw.p99 { opacity: 0.55; }
    .bar.exec { background: linear-gradient(90deg, #92400e, var(--exec)); }
    .bar.exec.p95 { opacity: 0.78; }
    .bar.exec.p99 { opacity: 0.55; }
    .band {
      position: absolute;
      top: 2px; bottom: 2px;
      background: var(--exec-band);
      border-radius: 3px;
      border: 1px dashed rgba(180, 83, 9, 0.45);
    }
    .score {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.25rem;
      margin: 1.1rem 0 0;
      padding-top: 0.9rem;
      border-top: 1px solid var(--line);
      font-size: 0.92rem;
    }
    .score strong { color: var(--claw-deep); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
    .score .warn strong { color: #92400e; }
    .honesty {
      margin: 1.25rem 0 0;
      padding: 0.85rem 1rem;
      border-left: 3px solid #94a3b8;
      color: var(--muted);
      font-size: 0.88rem;
      background: rgba(255,255,255,0.55);
    }
    .honesty ul { margin: 0.45rem 0 0; padding-left: 1.1rem; }
    .honesty li { margin: 0.3rem 0; }
    .links { margin-top: 1.5rem; font-size: 0.9rem; color: var(--muted); }
    .links a { color: var(--claw); }
    @media (max-width: 720px) {
      .tilt { grid-template-columns: 1fr; }
      .tool-head { flex-direction: column; gap: 0.4rem; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <p class="brand">ClawQL</p>
    <h1>Latency · p50 / p95 / p99</h1>
    <p class="lead">
      Wall-clock MCP tool latency. ClawQL runs the <strong>heavier</strong> arm
      (search + ${escapeHtml(String(petCount))}-row execute with <code>where</code>/<code>fields</code> + audit + WORM on search).
      Executor runs the <strong>lighter</strong> arm (warm no-op / published band).
      n=${escapeHtml(String(iters))}.
    </p>

    <div class="tilt">
      <div>
        <strong>ClawQL — heavier on purpose</strong>
        ${escapeHtml(chart.workloadTilt?.clawql || "search + large execute + where/fields + audit")}
      </div>
      <div>
        <strong>Executor — lighter arm</strong>
        ${escapeHtml(chart.workloadTilt?.executor || "no-op / reference warm band")}
      </div>
    </div>

    <section class="chart" aria-label="Latency p50 p95 p99 by tool">
      ${tools.map((t) => renderToolRow(t, maxMs)).join("")}
      <div class="score">
        <div>Heavy turn p50 <strong>${h.clawql_p50_ms != null ? h.clawql_p50_ms.toFixed(1) : "—"}ms</strong></div>
        <div>Heavy turn p95 <strong>${h.clawql_p95_ms != null ? h.clawql_p95_ms.toFixed(1) : "—"}ms</strong></div>
        <div class="${h.p99_beats_executor_band_high ? "" : "warn"}">Heavy turn p99 <strong>${h.clawql_p99_ms != null ? h.clawql_p99_ms.toFixed(1) : "—"}ms</strong></div>
        <div>Executor p50 <strong>${h.executor_p50_ms.toFixed(0)}ms</strong></div>
        <div>Ratio <strong>${escapeHtml(ratioLabel)}</strong></div>
      </div>
    </section>

    <div class="honesty">
      <div><strong>Honesty</strong> — ${escapeHtml(chart.honesty.p99VsExecutor)}</div>
      <ul>
        <li>${escapeHtml(chart.honesty.intentionalAsymmetry || chart.workloadTilt?.intent || "")}</li>
        <li>${escapeHtml(chart.honesty.executorReference)}</li>
        <li>${escapeHtml(chart.honesty.worm || "")}</li>
        <li>${escapeHtml(chart.honesty.lifecycle || "")}</li>
        <li>${escapeHtml(chart.honesty.p99Caveat || "")}</li>
      </ul>
      <p style="margin:0.65rem 0 0">
        Measured ${escapeHtml(chart.measuredAt)} (${escapeHtml(chart.host?.platform ?? "")}/${escapeHtml(chart.host?.arch ?? "")}, Node ${escapeHtml(chart.host?.node ?? "")}).
        ${
          chart.series.executor.source === "reference"
            ? `Citation: <a href="${escapeHtml(chart.series.executor.url)}">${escapeHtml(chart.series.executor.citation)}</a>.`
            : escapeHtml(chart.series.executor.citation || "")
        }
        Distinct from <a href="https://clawql.com/mcp-ui/trace/compare/executor">token compare</a>.
      </p>
    </div>

    <p class="links">
      <a href="./latency.json">latency.json</a> ·
      <a href="./">token benchmark notes</a> ·
      <a href="https://github.com/danielsmithdevelopment/ClawQL">GitHub</a> ·
      Reproduce: <code>npm run benchmark:executor-comparison:latency</code>
      ${chart.series.executor.source === "reference" ? " · Live Executor: <code>EXECUTOR_BIN=… npm run benchmark:executor-comparison:latency</code>" : ""}
    </p>
  </main>
  <script>
    requestAnimationFrame(() => {
      document.querySelectorAll(".bar").forEach((el, i) => {
        const w = el.style.width;
        el.style.width = "0%";
        setTimeout(() => { el.style.width = w; }, 60 + i * 40);
      });
    });
  </script>
</body>
</html>
`;
}

async function main() {
  const report = JSON.parse(await readFile(LATENCY_JSON, "utf8"));
  const chart = buildChartEnvelope(report);
  const html = renderHtml(chart);

  await mkdir(dirname(OUT_DOCS), { recursive: true });
  await mkdir(OUT_WWW_DIR, { recursive: true });
  await writeFile(OUT_DOCS, html);
  await writeFile(OUT_WWW_HTML, html);
  await writeFile(OUT_WWW_JSON, JSON.stringify(chart, null, 2) + "\n");
  await writeFile(
    join(ROOT, "docs", "benchmarks", "executor-comparison", "executor-cmp-latency-chart.json"),
    JSON.stringify(chart, null, 2) + "\n"
  );

  console.log(
    JSON.stringify(
      {
        wrote: [OUT_DOCS, OUT_WWW_HTML, OUT_WWW_JSON],
        headline: chart.headline,
        tools: chart.tools.map((t) => ({
          id: t.id,
          p50: t.p50_ms,
          p95: t.p95_ms,
          p99: t.p99_ms,
          workload: t.workload,
        })),
        canonical: CANONICAL,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
