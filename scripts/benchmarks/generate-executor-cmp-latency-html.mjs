#!/usr/bin/env node
/**
 * Render shareable equal-arm ClawQL vs Executor latency HTML (p50/p95/p99).
 *
 *   node scripts/benchmarks/generate-executor-cmp-latency-html.mjs
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
  workload: "equal",
  subtitle: "reference band · wire EXECUTOR_* for live equal arm",
  p50_ms: 75,
  p95_ms: 100,
  p99_ms: 100,
  band_low_ms: 50,
  band_high_ms: 100,
  citation:
    "UsefulSoftwareCo/executor#1519 — not measured; wire EXECUTOR_BIN for equal-arm live",
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
    arms.clawql_execute_equal ?? arms.clawql_execute_listPets ?? arms.clawql_execute_heavy;
  const audit = arms.clawql_audit_append;
  const direct = arms.direct_http_mock;
  const execArm = arms.executor;
  const equalized = report.derived?.equalized;
  const overhead = equalized?.clawql_gateway_overhead ??
    (report.derived?.clawql_vs_direct
      ? {
          p50_ms: report.derived.clawql_vs_direct.overhead_p50_ms,
          p95_ms: report.derived.clawql_vs_direct.overhead_p95_ms,
          p99_ms: report.derived.clawql_vs_direct.overhead_p99_ms,
        }
      : null);

  let executorSeries;
  if (execArm?.wired && (execArm.equal || execArm.noop)) {
    const stats = execArm.equal ?? execArm.noop;
    executorSeries = {
      id: "executor_execute",
      source: "live",
      label: "Executor execute",
      workload: "equal",
      subtitle: "live · same pets JSON in-process",
      ...armStats(stats),
      endpoint: execArm.endpoint,
      citation: execArm.note,
    };
  } else {
    executorSeries = { ...EXECUTOR_WARM_REFERENCE };
  }

  const tools = [
    execute
      ? {
          id: "clawql_execute",
          source: "live",
          label: "ClawQL execute (e2e)",
          workload: "equal",
          subtitle: "MCP → tiny same-host mock + fields",
          ...armStats(execute),
        }
      : null,
    overhead
      ? {
          id: "clawql_gateway_overhead",
          source: "derived",
          label: "ClawQL gateway overhead",
          workload: "equalized",
          subtitle: "execute − direct fetch (apples-to-apples)",
          p50_ms: overhead.p50_ms,
          p95_ms: overhead.p95_ms,
          p99_ms: overhead.p99_ms,
          headline: true,
        }
      : null,
    executorSeries
      ? {
          ...executorSeries,
          headline: true,
        }
      : null,
    direct
      ? {
          id: "direct_http",
          source: "live",
          label: "Direct HTTP mock",
          workload: "control",
          subtitle: "bare fetch of the same tiny body",
          ...armStats(direct),
        }
      : null,
    audit
      ? {
          id: "clawql_audit",
          source: "live",
          label: "ClawQL audit",
          workload: "control",
          subtitle: "local ring append (no upstream)",
          ...armStats(audit),
        }
      : null,
  ].filter(Boolean);

  const clawEqualP50 = overhead?.p50_ms ?? execute?.p50_ms ?? null;
  const clawEqualP95 = overhead?.p95_ms ?? execute?.p95_ms ?? null;
  const clawEqualP99 = overhead?.p99_ms ?? execute?.p99_ms ?? null;
  const execP50 = executorSeries.p50_ms;
  const ratioExecOverClaw =
    clawEqualP50 > 0 ? Number((execP50 / clawEqualP50).toFixed(2)) : null;
  const ratioClawOverExec =
    execP50 > 0 && clawEqualP50 != null
      ? Number((clawEqualP50 / execP50).toFixed(2))
      : null;
  const clawFaster =
    clawEqualP50 != null && executorSeries.source === "live"
      ? clawEqualP50 < execP50
      : clawEqualP50 != null && clawEqualP50 < (executorSeries.band_low_ms ?? execP50);

  return {
    suite: "executor-cmp-latency-chart",
    mode: report.mode ?? "equal",
    canonical: CANONICAL,
    measuredAt: report.measuredAt,
    host: report.host,
    config: report.config,
    pathFlags: report.pathFlags ?? null,
    workloadTilt: report.workloadTilt ?? null,
    tools,
    series: {
      clawql_execute: execute
        ? {
            source: "live",
            label: "ClawQL execute",
            ...armStats(execute),
            citation: "MCP stdio → listPets equal tiny mock",
          }
        : null,
      clawql_gateway_overhead: overhead
        ? {
            source: "derived",
            label: "ClawQL gateway overhead",
            ...overhead,
            citation: "execute − direct_http (same mock)",
          }
        : null,
      clawql_audit: audit ? { source: "live", label: "ClawQL audit", ...armStats(audit) } : null,
      direct_http: direct ? { source: "live", label: "Direct HTTP", ...armStats(direct) } : null,
      executor: executorSeries,
    },
    headline: {
      clawql_p50_ms: clawEqualP50,
      clawql_p95_ms: clawEqualP95,
      clawql_p99_ms: clawEqualP99,
      clawql_arm: overhead ? "gateway_overhead" : "execute",
      clawql_execute_e2e_p50_ms: execute?.p50_ms ?? null,
      executor_p50_ms: execP50,
      executor_p95_ms: executorSeries.p95_ms,
      executor_p99_ms: executorSeries.p99_ms,
      ratio_executor_over_clawql: ratioExecOverClaw,
      ratio_clawql_over_executor: ratioClawOverExec,
      executor_source: executorSeries.source,
      clawql_faster_p50: clawFaster,
      p50_beats_executor_band_low: clawFaster,
      p99_beats_executor_band_high:
        clawEqualP99 != null &&
        clawEqualP99 < (executorSeries.p99_ms ?? executorSeries.band_high_ms ?? execP50),
    },
    honesty: {
      ...(report.honesty ?? {}),
      executorReference:
        executorSeries.source === "reference"
          ? "Executor still on the published 50–100ms band — wire EXECUTOR_BIN for equal-arm live."
          : "Executor is LIVE equal-arm MCP execute returning the same pets JSON.",
      notTokenFlamegraph:
        "Distinct from /mcp-ui/trace/compare/executor (token context). This page is wall-clock ms.",
      p99VsExecutor: (() => {
        if (executorSeries.source !== "live") {
          return `ClawQL equalized p50 ${clawEqualP50}ms vs Executor reference mid ${execP50}ms — wire live Executor.`;
        }
        if (clawFaster) {
          return `Equalized ClawQL gateway overhead p50 ${clawEqualP50}ms beats live Executor p50 ${execP50}ms on the same result shape.`;
        }
        return `Live Executor p50 ${execP50}ms is faster than equalized ClawQL gateway overhead p50 ${clawEqualP50}ms on this host.`;
      })(),
    },
  };
}

function pctWidth(ms, maxMs) {
  return Math.max(2.5, Math.min(100, (Math.max(0, ms) / maxMs) * 100));
}

function renderToolRow(tool, maxMs) {
  const pills = [
    { key: "p50", ms: tool.p50_ms, cls: "p50" },
    { key: "p95", ms: tool.p95_ms, cls: "p95" },
    { key: "p99", ms: tool.p99_ms, cls: "p99" },
  ];
  const barClass =
    tool.id === "executor_execute" || tool.workload === "lighter" ? "exec" : "claw";
  const badge =
    tool.workload === "equalized"
      ? `<span class="badge equalized">equalized</span>`
      : tool.workload === "equal"
        ? `<span class="badge equal">equal</span>`
        : `<span class="badge control">control</span>`;

  return `
      <div class="tool ${tool.headline ? "headline-tool" : ""}" data-tool="${escapeHtml(tool.id)}">
        <div class="tool-head">
          <div class="name">${escapeHtml(tool.label)} ${badge}
            <span class="sub">${escapeHtml(tool.subtitle || "")}</span>
          </div>
          <div class="nums">
            <span><em>p50</em> ${Number(tool.p50_ms).toFixed(1)}</span>
            <span><em>p95</em> ${Number(tool.p95_ms).toFixed(1)}</span>
            <span><em>p99</em> ${Number(tool.p99_ms).toFixed(1)}</span>
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
  const observedMax = Math.max(
    ...tools.flatMap((t) => [t.p50_ms, t.p95_ms, t.p99_ms, t.band_high_ms ?? 0]),
    1
  );
  const maxMs =
    chart.series.executor.source === "reference"
      ? Math.max(100, observedMax)
      : observedMax * 1.08;
  const h = chart.headline;
  const ratioLabel = (() => {
    if (h.ratio_executor_over_clawql == null) return "—";
    if (chart.series.executor.source === "reference") {
      return `~${h.ratio_executor_over_clawql}× vs Executor mid (equalized)`;
    }
    if (h.clawql_faster_p50) {
      return `${h.ratio_executor_over_clawql}× — ClawQL overhead faster`;
    }
    return `ClawQL overhead ~${h.ratio_clawql_over_executor}× Executor (equal arm)`;
  })();
  const iters = chart.config?.iters ?? "?";
  const execSourceLabel =
    chart.series.executor.source === "live" ? "live same-host" : "reference band";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>ClawQL vs Executor — equal-arm latency p50 / p95 / p99</title>
  <link rel="canonical" href="${escapeHtml(CANONICAL)}"/>
  <meta name="description" content="Apples-to-apples MCP latency: same pets JSON, ClawQL gateway overhead vs live Executor execute."/>
  <meta property="og:title" content="ClawQL vs Executor — equal-arm latency"/>
  <meta property="og:description" content="Equalized ClawQL overhead p50 ${h.clawql_p50_ms}ms · Executor ${execSourceLabel} ${h.executor_p50_ms}ms · ${ratioLabel}"/>
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
    .lead { color: var(--muted); font-size: 1.05rem; margin: 0 0 1.35rem; max-width: 44rem; }
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
    .badge.equal { background: #d8f0ea; color: var(--claw-deep); }
    .badge.equalized { background: #c7ebe3; color: var(--claw-deep); }
    .badge.control { background: #e8eef0; color: #475569; }
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
    <h1>Equal-arm latency · p50 / p95 / p99</h1>
    <p class="lead">
      Apples-to-apples: both sides return the <strong>same tiny pets JSON</strong> via one MCP <code>execute</code>.
      Headline compares <strong>ClawQL gateway overhead</strong> (execute − same-host mock fetch) to
      <strong>Executor</strong> (${escapeHtml(execSourceLabel)}).
      n=${escapeHtml(String(iters))}.
    </p>

    <div class="tilt">
      <div>
        <strong>ClawQL — equal arm</strong>
        ${escapeHtml(chart.workloadTilt?.clawql || "single execute → tiny mock, fields only")}
      </div>
      <div>
        <strong>Executor — equal arm</strong>
        ${escapeHtml(chart.workloadTilt?.executor || "single execute → same JSON in-process")}
      </div>
    </div>

    <section class="chart" aria-label="Equal-arm latency p50 p95 p99">
      ${tools.map((t) => renderToolRow(t, maxMs)).join("")}
      <div class="score">
        <div>Equalized ClawQL p50 <strong>${h.clawql_p50_ms != null ? Number(h.clawql_p50_ms).toFixed(1) : "—"}ms</strong></div>
        <div>Equalized ClawQL p95 <strong>${h.clawql_p95_ms != null ? Number(h.clawql_p95_ms).toFixed(1) : "—"}ms</strong></div>
        <div class="${h.clawql_faster_p50 || h.p99_beats_executor_band_high ? "" : "warn"}">Equalized ClawQL p99 <strong>${h.clawql_p99_ms != null ? Number(h.clawql_p99_ms).toFixed(1) : "—"}ms</strong></div>
        <div>Executor p50 <strong>${Number(h.executor_p50_ms).toFixed(chart.series.executor.source === "live" ? 1 : 0)}ms</strong><small style="display:block;color:var(--muted);font-weight:400">${escapeHtml(execSourceLabel)}</small></div>
        <div>Executor p99 <strong>${h.executor_p99_ms != null ? Number(h.executor_p99_ms).toFixed(chart.series.executor.source === "live" ? 1 : 0) : "—"}ms</strong></div>
        <div>Compare <strong>${escapeHtml(ratioLabel)}</strong></div>
      </div>
    </section>

    <div class="honesty">
      <div><strong>Honesty</strong> — ${escapeHtml(chart.honesty.p99VsExecutor)}</div>
      <ul>
        <li>${escapeHtml(chart.honesty.equalArms || chart.workloadTilt?.intent || "")}</li>
        <li>${escapeHtml(chart.honesty.executorReference)}</li>
        <li>Raw ClawQL execute e2e p50 ${h.clawql_execute_e2e_p50_ms != null ? Number(h.clawql_execute_e2e_p50_ms).toFixed(1) : "—"}ms still includes same-host mock HTTP; equalized row subtracts it.</li>
        <li>${escapeHtml(chart.honesty.referenceBand || "")}</li>
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
      Reproduce: <code>EXECUTOR_BIN=… npm run benchmark:executor-comparison:latency</code>
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
