/**
 * Built-in flamegraph demos for executor-cmp-001 (live measurements).
 * Token targets from docs/benchmarks/executor-comparison/executor-cmp-001.live.json
 */

import type { TraceCallRecord } from "./mcp-ui-trace.js";

/** Measured cl100k_base input-side totals (Layer 1 + Layer 2). */
export const EXECUTOR_CMP_MEASUREMENTS = {
  task: "executor-cmp-001",
  repo: "vercel/next.js",
  capturedAt: "2026-08-27",
  clawql: {
    toolDefsTokens: 394,
    toolResultTokens: 907,
    combinedInputTokens: 1301,
    toolNames: ["search", "execute", "cache", "audit"],
    operation: "pulls/list fields=[title,number]",
  },
  executor: {
    toolDefsTokensLive: 115,
    toolDefsTokensPublished: 1044,
    toolResultTokens: 143466,
    combinedInputTokensLive: 143581,
    combinedInputTokensPublished: 144510,
    toolPath: "github.user.githubMain.pulls.list",
    note: "No output projection — full REST list JSON",
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
        '{"name":"search","description":"…"} {"name":"execute","description":"…"} ' +
        "(ClawQL gateway codemode: search + execute + cache + audit)",
      tokens: m.clawql.toolDefsTokens,
    },
    {
      role: "tool",
      content:
        `[ClawQL execute pulls/list · ${m.repo} · fields title,number · ${m.clawql.toolResultTokens} tok measured]`,
      tokens: m.clawql.toolResultTokens,
    },
  ];
  const executorMessages: TraceCallRecord["messages"] = [
    {
      role: "user",
      content:
        '{"name":"execute","description":"…"} ' +
        `(Executor live MCP execute-only · ${m.executor.toolDefsTokensLive} tok; published chart ~${m.executor.toolDefsTokensPublished})`,
      tokens: m.executor.toolDefsTokensLive,
    },
    {
      role: "tool",
      content:
        `[Executor ${m.executor.toolPath} · full REST JSON · ${m.executor.toolResultTokens.toLocaleString()} tok measured · no projection]`,
      tokens: m.executor.toolResultTokens,
    },
  ];

  return {
    clawql: [
      mkMeasuredRecord("ec-c1", sessionId, clawqlMessages, m.clawql.combinedInputTokens),
    ],
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
