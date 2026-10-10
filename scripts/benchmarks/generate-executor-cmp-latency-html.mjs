#!/usr/bin/env node
/**
 * Render shareable ClawQL vs Executor wall-clock latency HTML from
 * docs/benchmarks/executor-comparison/executor-cmp-latency.json
 *
 *   node scripts/benchmarks/generate-executor-cmp-latency-html.mjs
 *
 * Writes:
 *   docs/benchmarks/executor-comparison/latency.html
 *   apps/www/public/benchmarks/executor-comparison/latency.html
 *   apps/www/public/benchmarks/executor-comparison/latency.json  (chart envelope)
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

/** Public self-host signal when EXECUTOR_* is unset (GitHub issue #1519). */
const EXECUTOR_WARM_REFERENCE = {
  source: "reference",
  label: "Executor warm execute",
  p50_ms: 75,
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

function buildChartEnvelope(report) {
  const clawqlExecute = report.arms.clawql_execute_listPets;
  const clawqlAudit = report.arms.clawql_audit_append;
  const overhead = report.derived?.clawql_vs_direct;
  const execArm = report.arms.executor;

  let executorSeries;
  if (execArm?.wired && execArm.noop) {
    executorSeries = {
      source: "live",
      label: "Executor execute (no-op)",
      p50_ms: execArm.noop.p50_ms,
      p95_ms: execArm.noop.p95_ms,
      band_low_ms: execArm.noop.min_ms,
      band_high_ms: execArm.noop.p95_ms,
      endpoint: execArm.endpoint,
      citation: execArm.note,
    };
  } else {
    executorSeries = { ...EXECUTOR_WARM_REFERENCE };
  }

  const clawqlP50 = clawqlExecute.p50_ms;
  const ratio =
    clawqlP50 > 0 ? Number((executorSeries.p50_ms / clawqlP50).toFixed(2)) : null;

  return {
    suite: "executor-cmp-latency-chart",
    canonical: CANONICAL,
    measuredAt: report.measuredAt,
    host: report.host,
    config: report.config,
    series: {
      clawql_execute: {
        source: "live",
        label: "ClawQL execute",
        p50_ms: clawqlExecute.p50_ms,
        p95_ms: clawqlExecute.p95_ms,
        band_low_ms: clawqlExecute.min_ms,
        band_high_ms: clawqlExecute.p95_ms,
        citation: "MCP stdio → listPets against local mock (same host)",
      },
      clawql_audit: {
        source: "live",
        label: "ClawQL audit (local)",
        p50_ms: clawqlAudit.p50_ms,
        p95_ms: clawqlAudit.p95_ms,
      },
      clawql_overhead: overhead
        ? {
            source: "derived",
            label: "ClawQL gateway overhead",
            p50_ms: overhead.overhead_p50_ms,
            p95_ms: overhead.overhead_p95_ms,
            citation: overhead.method,
          }
        : null,
      executor: executorSeries,
    },
    headline: {
      clawql_p50_ms: clawqlP50,
      executor_p50_ms: executorSeries.p50_ms,
      ratio_executor_over_clawql: ratio,
      executor_source: executorSeries.source,
    },
    honesty: {
      ...report.honesty,
      executorReference:
        executorSeries.source === "reference"
          ? "Executor bar uses the published warm 50–100ms self-host band until EXECUTOR_BIN/URL is wired for a same-host live arm."
          : "Executor bar is live no-op execute on this host.",
      notTokenFlamegraph:
        "Distinct from /mcp-ui/trace/compare/executor (token context). This page is wall-clock ms.",
    },
  };
}

function renderHtml(chart) {
  const claw = chart.series.clawql_execute;
  const exec = chart.series.executor;
  const maxMs = Math.max(claw.p50_ms, exec.band_high_ms ?? exec.p50_ms, 1);
  const clawPct = Math.max(2, (claw.p50_ms / maxMs) * 100);
  const execPct = Math.max(2, (exec.p50_ms / maxMs) * 100);
  const execLowPct = Math.max(0, ((exec.band_low_ms ?? exec.p50_ms) / maxMs) * 100);
  const execHighPct = Math.max(execPct, ((exec.band_high_ms ?? exec.p50_ms) / maxMs) * 100);
  const ratio = chart.headline.ratio_executor_over_clawql;
  const ratioLabel =
    ratio != null
      ? exec.source === "reference"
        ? `~${ratio}× (vs reference mid)`
        : `${ratio}× faster`
      : "—";
  const execBadge =
    exec.source === "live" ? "live same-host" : "reference band · wire EXECUTOR_* for live";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>ClawQL vs Executor — tool-call latency p50</title>
  <link rel="canonical" href="${escapeHtml(CANONICAL)}"/>
  <meta name="description" content="Wall-clock MCP tool-call latency: ClawQL ${claw.p50_ms}ms p50 vs Executor ${exec.p50_ms}ms (${exec.source})."/>
  <meta property="og:title" content="ClawQL vs Executor — tool-call latency"/>
  <meta property="og:description" content="ClawQL execute p50 ${claw.p50_ms}ms · Executor ${exec.p50_ms}ms (${exec.source}) · ${ratioLabel}"/>
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
    .wrap { max-width: 880px; margin: 0 auto; padding: 2rem 1.25rem 3.5rem; }
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
    .lead { color: var(--muted); font-size: 1.05rem; margin: 0 0 1.5rem; max-width: 40rem; }
    .chart {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 1.35rem 1.25rem 1.1rem;
      box-shadow: 0 18px 40px rgba(12, 40, 36, 0.06);
    }
    .row {
      display: grid;
      grid-template-columns: minmax(140px, 28%) 1fr minmax(72px, auto);
      gap: 0.65rem 0.85rem;
      align-items: center;
      margin: 1rem 0;
    }
    .name { font-weight: 700; font-size: 0.98rem; }
    .sub { display: block; font-weight: 400; color: var(--muted); font-size: 0.78rem; margin-top: 0.15rem; }
    .track {
      position: relative;
      height: 36px;
      background: #eef3f1;
      border-radius: 6px;
      overflow: hidden;
    }
    .bar {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      border-radius: 6px;
      transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .bar.claw { background: linear-gradient(90deg, var(--claw-deep), var(--claw)); }
    .bar.exec { background: linear-gradient(90deg, #92400e, var(--exec)); }
    .band {
      position: absolute;
      top: 6px; bottom: 6px;
      background: var(--exec-band);
      border-radius: 4px;
      border: 1px dashed rgba(180, 83, 9, 0.45);
    }
    .ms {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      font-size: 1.15rem;
      text-align: right;
    }
    .ms small { display: block; font-weight: 400; color: var(--muted); font-size: 0.72rem; }
    .score {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.25rem;
      margin: 1.25rem 0 0;
      padding-top: 1rem;
      border-top: 1px solid var(--line);
      font-size: 0.92rem;
    }
    .score strong { color: var(--claw-deep); font-size: 1.2rem; font-variant-numeric: tabular-nums; }
    .honesty {
      margin: 1.25rem 0 0;
      padding: 0.85rem 1rem;
      border-left: 3px solid #94a3b8;
      color: var(--muted);
      font-size: 0.88rem;
      background: rgba(255,255,255,0.55);
    }
    .links { margin-top: 1.5rem; font-size: 0.9rem; color: var(--muted); }
    .links a { color: var(--claw); }
    @media (max-width: 640px) {
      .row { grid-template-columns: 1fr; gap: 0.35rem; }
      .ms { text-align: left; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <p class="brand">ClawQL</p>
    <h1>Tool-call latency · side by side</h1>
    <p class="lead">Wall-clock MCP <code>execute</code> p50 on the same chart. Not the token flamegraph — milliseconds to return a tool result.</p>

    <section class="chart" aria-label="Latency comparison chart">
      <div class="row">
        <div class="name">ClawQL execute<span class="sub">live · mock upstream · n=${chart.config.iters}</span></div>
        <div class="track"><span class="bar claw" style="width:${clawPct.toFixed(2)}%"></span></div>
        <div class="ms">${claw.p50_ms.toFixed(1)}<small>p50 · p95 ${claw.p95_ms.toFixed(1)}ms</small></div>
      </div>
      <div class="row">
        <div class="name">Executor execute<span class="sub">${escapeHtml(execBadge)}</span></div>
        <div class="track">
          ${
            exec.source === "reference"
              ? `<span class="band" style="left:${execLowPct.toFixed(2)}%;width:${(execHighPct - execLowPct).toFixed(2)}%" title="50–100ms reference band"></span>`
              : ""
          }
          <span class="bar exec" style="width:${execPct.toFixed(2)}%"></span>
        </div>
        <div class="ms">${exec.p50_ms.toFixed(0)}<small>${
          exec.source === "reference"
            ? `${exec.band_low_ms}–${exec.band_high_ms}ms band`
            : `p50 · p95 ${exec.p95_ms?.toFixed(1) ?? "—"}ms`
        }</small></div>
      </div>
      <div class="score">
        <div>ClawQL p50 <strong>${claw.p50_ms.toFixed(1)}ms</strong></div>
        <div>Executor p50 <strong>${exec.p50_ms.toFixed(0)}ms</strong></div>
        <div>Ratio <strong>${escapeHtml(ratioLabel)}</strong></div>
        ${
          chart.series.clawql_overhead
            ? `<div>Gateway overhead <strong>${chart.series.clawql_overhead.p50_ms.toFixed(1)}ms</strong></div>`
            : ""
        }
      </div>
    </section>

    <p class="honesty">
      ${escapeHtml(chart.honesty.executorReference)}
      ClawQL measured ${escapeHtml(chart.measuredAt)} (${escapeHtml(chart.host?.platform ?? "")}/${escapeHtml(chart.host?.arch ?? "")}, Node ${escapeHtml(chart.host?.node ?? "")}).
      ${exec.source === "reference" ? `Citation: <a href="${escapeHtml(exec.url)}">${escapeHtml(exec.citation)}</a>.` : escapeHtml(exec.citation || "")}
      Distinct from <a href="https://clawql.com/mcp-ui/trace/compare/executor">token compare</a>.
    </p>

    <p class="links">
      <a href="./latency.json">latency.json</a> ·
      <a href="./">token benchmark notes</a> ·
      <a href="https://github.com/danielsmithdevelopment/ClawQL">GitHub</a> ·
      Reproduce: <code>npm run benchmark:executor-comparison:latency</code>
      ${exec.source === "reference" ? " · Live Executor: <code>EXECUTOR_BIN=… npm run benchmark:executor-comparison:latency</code>" : ""}
    </p>
  </main>
  <script>
    // Stagger bar grow on load for share demos
    requestAnimationFrame(() => {
      document.querySelectorAll(".bar").forEach((el, i) => {
        const w = el.style.width;
        el.style.width = "0%";
        setTimeout(() => { el.style.width = w; }, 80 + i * 120);
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

  // Also keep chart envelope next to docs JSON for CI/docs consumers
  await writeFile(
    join(ROOT, "docs", "benchmarks", "executor-comparison", "executor-cmp-latency-chart.json"),
    JSON.stringify(chart, null, 2) + "\n"
  );

  console.log(
    JSON.stringify(
      {
        wrote: [OUT_DOCS, OUT_WWW_HTML, OUT_WWW_JSON],
        headline: chart.headline,
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
