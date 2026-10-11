/**
 * Built-in flamegraph demos for executor-cmp-001 (live measurements).
 * Token targets from docs/benchmarks/executor-comparison/executor-cmp-001.live.json
 */

import type { TraceCallRecord } from "../mcp-ui-trace.js";
import type { TraceComparePageOpts } from "../mcp-ui-trace-html.js";

/** Measured cl100k_base input-side totals (Layer 1 + Layer 2). */
export const EXECUTOR_CMP_MEASUREMENTS = {
  task: "executor-cmp-001",
  repo: "vercel/next.js",
  /** ISO date from executor-cmp-001.live.json `generatedAt` (date part). */
  capturedAt: "2026-08-27",
  sourceJson: "docs/benchmarks/executor-comparison/executor-cmp-001.live.json",
  /** Headline is a single action (N=1). Multi-turn ranges are separate artifacts. */
  sampleSize: 1,
  clawql: {
    toolDefsTokens: 394,
    toolResultTokens: 907,
    combinedInputTokens: 1301,
    toolNames: ["search", "execute", "cache", "audit"],
    operation: "pulls/list fields=[title,number]",
    /** Schema size as measured in the live artifact (not re-derived from a later commit). */
    note: "Layer1 394 = measured search+execute codemode in artifact",
  },
  executor: {
    toolDefsTokensLive: 115,
    toolDefsTokensPublished: 1044,
    toolResultTokens: 143466,
    combinedInputTokensLive: 143581,
    combinedInputTokensPublished: 144510,
    toolPath: "github.user.githubMain.pulls.list",
    note: "No gateway output projection — full REST list JSON (settled: Both Sides of Context Compression)",
    /** Not recorded inside executor-cmp-001.live.json; pin on remeasure. */
    versionInArtifact: null as string | null,
  },
  /** From executor-cmp-002b / 002 live series (same task family). */
  multiTurn: {
    uniformN5Ratio: 148,
    mixedN5Ratio: 66,
    uniformArtifact: "docs/benchmarks/executor-comparison/executor-cmp-002b.uniform-pulls.live.json",
    mixedArtifact: "docs/benchmarks/executor-comparison/executor-cmp-002.multiturn.live.json",
  },
  ratioCombinedLive: 110.4,
  ratioLayer2: 158.18,
} as const;

export const DEMO_TRACE_SESSION_EXECUTOR_CMP_CLAWQL = "demo-executor-cmp-clawql";
export const DEMO_TRACE_SESSION_EXECUTOR_CMP_EXECUTOR = "demo-executor-cmp-executor";

function mkMeasuredRecord(
  id: string,
  sessionId: string,
  messages: TraceCallRecord["messages"],
  inputTokens: number
): TraceCallRecord {
  return {
    id,
    correlationId: sessionId,
    timestamp: "2026-08-27T12:00:00.000Z",
    modelId: "benchmark/executor-cmp-001",
    provider: "demo",
    messages,
    response: "",
    usage: { inputTokens, outputTokens: 0 },
    latencyMs: 0,
  };
}

/**
 * Single-turn input context after `pulls.list` — tool defs + tool result only so
 * headline totals match measured L1+L2 (1301 vs 143581 live).
 */
export function demoExecutorCmpRecords(sessionId: string): {
  clawql: TraceCallRecord[];
  executor: TraceCallRecord[];
} {
  const m = EXECUTOR_CMP_MEASUREMENTS;
  const clawqlMessages: TraceCallRecord["messages"] = [
    {
      role: "user",
      content:
        '{"type":"object","properties":{"search":{"type":"object"},"execute":{"type":"object"}}} ' +
        "(ClawQL gateway codemode: search + execute + cache + audit)",
      tokens: m.clawql.toolDefsTokens,
    },
    {
      role: "tool",
      content: `[ClawQL execute pulls/list · ${m.repo} · fields title,number · ${m.clawql.toolResultTokens} tok measured]`,
      tokens: m.clawql.toolResultTokens,
    },
  ];
  const executorMessages: TraceCallRecord["messages"] = [
    {
      role: "user",
      content:
        '{"type":"object","properties":{"execute":{"type":"object"}}} ' +
        `(Executor live MCP execute-only · ${m.executor.toolDefsTokensLive} tok; published chart ~${m.executor.toolDefsTokensPublished})`,
      tokens: m.executor.toolDefsTokensLive,
    },
    {
      role: "tool",
      content: `[Executor ${m.executor.toolPath} · full REST JSON · ${m.executor.toolResultTokens.toLocaleString()} tok measured · no projection]`,
      tokens: m.executor.toolResultTokens,
    },
  ];

  return {
    clawql: [mkMeasuredRecord("ec-c1", sessionId, clawqlMessages, m.clawql.combinedInputTokens)],
    executor: [
      mkMeasuredRecord("ec-e1", sessionId, executorMessages, m.executor.combinedInputTokensLive),
    ],
  };
}

export function executorCmpTraceTokenizationMeta() {
  return {
    encoding: "cl100k_base",
    method: "executor-cmp-001-live-measurements",
    label: `Token counts: cl100k_base · live executor-cmp-001 (${EXECUTOR_CMP_MEASUREMENTS.repo})`,
  };
}

/** Derived ratios — recomputed from constants so page + JSON stay self-consistent. */
export function executorCmpDerivedStats() {
  const m = EXECUTOR_CMP_MEASUREMENTS;
  const clawqlCombined = m.clawql.combinedInputTokens;
  const executorLiveCombined = m.executor.combinedInputTokensLive;
  const executorPubCombined = m.executor.combinedInputTokensPublished;
  return {
    ratioCombinedLive: executorLiveCombined / clawqlCombined,
    ratioCombinedPublishedL1: executorPubCombined / clawqlCombined,
    layer2PctExecutor: Math.round((m.executor.toolResultTokens / executorLiveCombined) * 100),
    layer2PctClawql: Math.round((m.clawql.toolResultTokens / clawqlCombined) * 100),
  };
}

export const EXECUTOR_CMP_MATCHED_CONDITIONS = {
  task: EXECUTOR_CMP_MEASUREMENTS.task,
  repo: EXECUTOR_CMP_MEASUREMENTS.repo,
  tokenizer: "cl100k_base",
  focus: "input",
  benchmarkLive: true,
  measuredAt: EXECUTOR_CMP_MEASUREMENTS.capturedAt,
  sampleSize: EXECUTOR_CMP_MEASUREMENTS.sampleSize,
  sourceJson: EXECUTOR_CMP_MEASUREMENTS.sourceJson,
} as const;

function fmtRatio(n: number): string {
  return n >= 100 ? n.toFixed(0) : n.toFixed(1);
}

/** Page copy + guardrails for GET /mcp-ui/trace/compare/executor */
export function buildExecutorCmpComparePageOpts(
  basePath: string,
  focus: "input" | "all"
): TraceComparePageOpts {
  const m = EXECUTOR_CMP_MEASUREMENTS;
  const stats = executorCmpDerivedStats();
  const base = basePath.replace(/\/$/, "") || "/mcp-ui";
  const canonicalPath = `${base}/trace/compare/executor`;
  const inputOnly = focus === "input";

  const methodologyHtml = `<div class="fg-methodology">
    <p><strong>Provenance:</strong> measured <strong>${m.capturedAt}</strong> · N=<strong>${m.sampleSize}</strong> (single action) · artifact <code>${m.sourceJson}</code> · ClawQL Layer1 as measured (<strong>${m.clawql.toolDefsTokens}</strong> tok search+execute) · Executor live MCP execute-only (<strong>${m.executor.toolDefsTokensLive}</strong> tok; package version not recorded in this artifact).</p>
    <p><strong>Layer 1 (tool definitions):</strong> Right column uses <strong>${m.executor.toolDefsTokensLive} tok</strong> from our <em>live</em> Executor MCP install (<code>execute</code> only). <a href="https://executor.sh/">executor.sh</a> publishes <strong>~${m.executor.toolDefsTokensPublished.toLocaleString()} tok</strong> for their codemode chart — a different measurement. ClawQL measured <strong>${m.clawql.toolDefsTokens} tok</strong> (search+execute codemode). <strong>${m.clawql.toolDefsTokens} is smaller than the published Executor figure, not smaller than live execute-only ${m.executor.toolDefsTokensLive}.</strong></p>
    <p><strong>Layer 2 (tool result):</strong> Layer 2 is <strong>${stats.layer2PctExecutor}%</strong> of Executor's input and <strong>${stats.layer2PctClawql}%</strong> of ClawQL's — almost the entire Executor bill is uncacheable tool payload after <code>pulls.list</code>. Executor has <strong>no gateway output projection</strong>; the measured path returns full REST JSON (see <a href="https://pragmaticvectors.com/posts/both-sides-of-context-compression">Both Sides of Context Compression</a>).</p>
    <p><strong>Sample size:</strong> headline is <strong>N=1</strong>. Across N=5: uniform pulls climb <strong>110×→${m.multiTurn.uniformN5Ratio}×</strong>; mixed surfaces land at <strong>${m.multiTurn.mixedN5Ratio}×</strong> at N=5 (see methodology).</p>
    <p><strong>Results-side cost:</strong> both approaches pay some tokens to shrink results — ClawQL's <code>fields</code>/<code>where</code> args (few tokens, server-enforced) vs any model-authored filter code (output tokens, not guaranteed). Headline ratios use <code>focus=input</code>; toggle <em>include outputs</em> to see model-output tokens.</p>
    <p class="fg-meta" style="margin:0.5rem 0 0">Matched conditions: cl100k_base · focus=input (default) · ${m.task} live · ${m.repo}</p>
  </div>`;

  const calloutHtml = inputOnly
    ? `<div class="fg-callout"><strong>Combined (L1+L2, input only, N=1):</strong> Executor <strong>${m.executor.combinedInputTokensLive.toLocaleString()}</strong> vs ClawQL <strong>${m.clawql.combinedInputTokens.toLocaleString()}</strong> = <strong>${fmtRatio(stats.ratioCombinedLive)}×</strong> (live Executor L1 ${m.executor.toolDefsTokensLive}). With Executor's published homepage L1 (~${m.executor.toolDefsTokensPublished.toLocaleString()}), combined would be <strong>${fmtRatio(stats.ratioCombinedPublishedL1)}×</strong> (${m.executor.combinedInputTokensPublished.toLocaleString()} vs ${m.clawql.combinedInputTokens.toLocaleString()}). Layer 2 alone: <strong>${fmtRatio(m.ratioLayer2)}×</strong> (${m.executor.toolResultTokens.toLocaleString()} vs ${m.clawql.toolResultTokens}). Model output omitted — same discipline as the built-in compressed vs fat demos. <strong>N=5 range:</strong> uniform ${fmtRatio(stats.ratioCombinedLive)}×→${m.multiTurn.uniformN5Ratio}× · mixed →${m.multiTurn.mixedN5Ratio}×.</div>`
    : `<div class="fg-callout"><strong>focus=all:</strong> This view includes model output tokens. Blog headline ratios use <strong>focus=input</strong> only (<a href="${canonicalPath}">switch back</a>). Output tokens include any cost of asking for <code>fields</code> or writing filter code.</div>`;

  return {
    basePath: base,
    focus,
    pageTitle: inputOnly
      ? "Executor vs ClawQL — executor-cmp-001 (input focus)"
      : "Executor vs ClawQL — executor-cmp-001 (all tokens)",
    canonicalPath: inputOnly ? canonicalPath : undefined,
    heading: "Executor.sh vs ClawQL — executor-cmp-001 (live)",
    subheading:
      "Same task · vercel/next.js pulls.list · cl100k_base · Layer 1 tool defs + Layer 2 tool result · focus=input by default",
    methodologyHtml,
    calloutHtml,
    leftPanel: {
      title: "ClawQL (search + execute + fields projection)",
      subtitle: `L1 ${m.clawql.toolDefsTokens} + L2 ${m.clawql.toolResultTokens} = ${m.clawql.combinedInputTokens.toLocaleString()} tok input`,
    },
    rightPanel: {
      title: "Executor (live MCP install + full REST list)",
      subtitle: `L1 ${m.executor.toolDefsTokensLive} live (homepage ~${m.executor.toolDefsTokensPublished.toLocaleString()}) + L2 ${m.executor.toolResultTokens.toLocaleString()} = ${m.executor.combinedInputTokensLive.toLocaleString()} tok`,
      emphasis: true,
    },
    footerNote: `Source: <code>executor-cmp-001.live.json</code> · Canonical (blog links): <a href="${canonicalPath}"><code>${canonicalPath}</code></a> · JSON: <a href="${canonicalPath}?format=json">compare</a>
      · Sessions: <a href="${base}/trace/${DEMO_TRACE_SESSION_EXECUTOR_CMP_CLAWQL}">${DEMO_TRACE_SESSION_EXECUTOR_CMP_CLAWQL}</a>
      · <a href="${base}/trace/${DEMO_TRACE_SESSION_EXECUTOR_CMP_EXECUTOR}">${DEMO_TRACE_SESSION_EXECUTOR_CMP_EXECUTOR}</a>
      · Generic compare: <a href="${base}/trace/compare">compressed vs fat</a>${inputOnly ? ` · <a href="${canonicalPath}?focus=all">include outputs (not used in blog headline)</a>` : ""}`,
  };
}

export function executorCmpJsonEnvelope(
  focus: "input" | "all",
  clawql: import("../mcp-ui-trace.js").ContextFlamegraph,
  executor: import("../mcp-ui-trace.js").ContextFlamegraph
) {
  const m = EXECUTOR_CMP_MEASUREMENTS;
  const stats = executorCmpDerivedStats();
  return {
    focus,
    matchedConditions: { ...EXECUTOR_CMP_MATCHED_CONDITIONS, focus },
    preset: "executor-cmp-001",
    measurements: EXECUTOR_CMP_MATCHED_CONDITIONS.sourceJson,
    provenance: {
      measuredAt: m.capturedAt,
      sampleSize: m.sampleSize,
      sourceJson: m.sourceJson,
      clawqlLayer1TokensMeasured: m.clawql.toolDefsTokens,
      executorLiveExecuteTokens: m.executor.toolDefsTokensLive,
      executorPackageVersionInArtifact: m.executor.versionInArtifact,
      multiTurnUniformN5Ratio: m.multiTurn.uniformN5Ratio,
      multiTurnMixedN5Ratio: m.multiTurn.mixedN5Ratio,
    },
    layer1: {
      clawqlCodemodeTokens: m.clawql.toolDefsTokens,
      executorLiveExecuteTokens: m.executor.toolDefsTokensLive,
      executorPublishedHomepageTokens: m.executor.toolDefsTokensPublished,
      note: `${m.clawql.toolDefsTokens} vs published ~${m.executor.toolDefsTokensPublished}; live execute-only ${m.executor.toolDefsTokensLive}`,
    },
    layer2: {
      clawqlProjectedTokens: m.clawql.toolResultTokens,
      executorFullRestTokens: m.executor.toolResultTokens,
      ratio: m.ratioLayer2,
      shareOfInputPct: {
        clawql: stats.layer2PctClawql,
        executor: stats.layer2PctExecutor,
      },
      note: "Executor: no gateway output projection (full REST pass-through)",
    },
    combined: {
      clawqlInputTokens: m.clawql.combinedInputTokens,
      executorLiveInputTokens: m.executor.combinedInputTokensLive,
      executorPublishedL1InputTokens: m.executor.combinedInputTokensPublished,
      ratioLiveL1: stats.ratioCombinedLive,
      ratioPublishedL1: stats.ratioCombinedPublishedL1,
      sampleSize: m.sampleSize,
      multiTurn: m.multiTurn,
    },
    clawql,
    executor,
  };
}
