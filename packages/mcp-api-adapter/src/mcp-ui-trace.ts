/**
 * Context-accumulation flamegraph model for /mcp-ui/trace/:sessionId.
 *
 * Adapter stays standalone: callers inject records shaped like clawql-inference
 * `InferenceRecord` (correlationId ≈ sessionId when aligned by the host).
 */

import {
  TRACE_DEMO_COMPRESSED,
  TRACE_DEMO_FAT,
  TRACE_DEMO_TOKENIZATION,
} from "./fixtures/trace-demo-fixtures.generated.js";
import {
  DEMO_TRACE_SESSION_EXECUTOR_CMP_CLAWQL,
  DEMO_TRACE_SESSION_EXECUTOR_CMP_EXECUTOR,
  demoExecutorCmpRecords,
} from "./executor-cmp-trace-demo.js";

export type TraceSource =
  | "harness_prompt"
  | "vault_seed"
  | "tool_schema"
  | "tool_result"
  | "user"
  | "agent_reasoning"
  | "model_output"
  | "other";

/** Stable legend / stack order (bottom → top metaphor: harness first, output last). */
export const TRACE_SOURCE_ORDER: readonly TraceSource[] = [
  "harness_prompt",
  "vault_seed",
  "tool_schema",
  "user",
  "tool_result",
  "agent_reasoning",
  "model_output",
  "other",
] as const;

export const DEMO_TRACE_SESSION_COMPRESSED = "demo-compressed";
export const DEMO_TRACE_SESSION_FAT = "demo-fat";

export {
  DEMO_TRACE_SESSION_EXECUTOR_CMP_CLAWQL,
  DEMO_TRACE_SESSION_EXECUTOR_CMP_EXECUTOR,
  demoExecutorCmpRecords,
  executorCmpTraceTokenizationMeta,
  executorCmpDerivedStats,
  buildExecutorCmpComparePageOpts,
  executorCmpJsonEnvelope,
  EXECUTOR_CMP_MEASUREMENTS,
  EXECUTOR_CMP_MATCHED_CONDITIONS,
} from "./executor-cmp-trace-demo.js";

export type TraceFrame = {
  turn: number;
  source: TraceSource;
  label: string;
  chars: number;
  /** Estimated tokens (chars/4) unless usage was provided for the call. */
  tokens: number;
  callId?: string;
  modelId?: string;
};

export type TraceCallMessage = {
  role: string;
  content: string;
  /** When set (inference store / tiktoken fixtures), used instead of chars÷4. */
  tokens?: number;
};

export type TraceCallRecord = {
  id: string;
  correlationId?: string;
  timestamp: string;
  modelId: string;
  provider?: string;
  messages: TraceCallMessage[];
  response: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  latencyMs?: number;
};

export type ContextFlamegraph = {
  sessionId: string;
  calls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** How input token breakdown was derived (live meter vs tiktoken fixture vs estimate). */
  tokenization?: {
    encoding?: string;
    method?: string;
    label: string;
  };
  frames: TraceFrame[];
  /** Per-turn totals for the cumulative chart. */
  turns: Array<{
    turn: number;
    callId: string;
    timestamp: string;
    modelId: string;
    latencyMs?: number;
    inputTokens: number;
    outputTokens: number;
    frames: TraceFrame[];
  }>;
  bySource: Record<TraceSource, number>;
};

export function estimateTokensFromChars(chars: number): number {
  if (chars <= 0) return 0;
  return Math.max(1, Math.ceil(chars / 4));
}

function classifyMessage(msg: TraceCallMessage): { source: TraceSource; label: string } {
  const role = (msg.role || "other").toLowerCase();
  const content = msg.content || "";
  const head = content.slice(0, 240).toLowerCase();

  if (role === "system") {
    if (
      /\b(memory\/|obsidian|vault|agent\.md|system-seed|wikilink)\b/.test(head) ||
      head.includes("[[")
    ) {
      return { source: "vault_seed", label: "vault / system-seed memory" };
    }
    return { source: "harness_prompt", label: "harness / system prompt" };
  }
  if (role === "user") {
    if (/\b(tool|function)\b.*\bschema\b/.test(head) || head.trimStart().startsWith("{")) {
      if (/\"properties\"|\"type\"\s*:\s*\"object\"/.test(content.slice(0, 800))) {
        return { source: "tool_schema", label: "tool schema" };
      }
    }
    return { source: "user", label: "user" };
  }
  if (role === "tool" || role === "function") {
    return { source: "tool_result", label: "tool result" };
  }
  if (role === "assistant") {
    return { source: "agent_reasoning", label: "assistant / agent" };
  }
  return { source: "other", label: role || "other" };
}

function emptyBySource(): Record<TraceSource, number> {
  return {
    harness_prompt: 0,
    vault_seed: 0,
    tool_schema: 0,
    tool_result: 0,
    user: 0,
    agent_reasoning: 0,
    model_output: 0,
    other: 0,
  };
}

type RawMessagePart = {
  source: TraceSource;
  label: string;
  chars: number;
  tokens: number;
};

/**
 * Allocate input tokens per message. Non-tool sources keep char/4 estimates so
 * harness/vault/schema do not shrink when a fat tool_result dominates raw size.
 * Remaining metered input (if any) goes to tool_result frames only.
 */
/**
 * Prefer tokenized transcript totals when provider usage under-reports input
 * (common with truncated local models) so flamegraphs reflect context sent.
 */
export function resolveMeteredInputTokens(
  rawParts: RawMessagePart[],
  usageInput: number | undefined
): number | undefined {
  if (usageInput == null) return undefined;
  const tokenizedSum = rawParts.reduce((s, p) => s + p.tokens, 0);
  if (tokenizedSum <= 0) return usageInput;
  if (usageInput < tokenizedSum * 0.75) return tokenizedSum;
  return usageInput;
}

export function allocateInputFrameTokens(
  rawParts: RawMessagePart[],
  meteredIn: number | undefined
): number[] {
  if (rawParts.length === 0) return [];

  const base = rawParts.map((p) =>
    p.chars > 0 ? Math.max(1, p.tokens) : 0
  );

  if (meteredIn == null || meteredIn <= 0) {
    return base;
  }

  const toolIndices: number[] = [];
  let nonToolTotal = 0;
  rawParts.forEach((p, i) => {
    if (p.source === "tool_result") {
      toolIndices.push(i);
    } else {
      nonToolTotal += base[i]!;
    }
  });

  if (toolIndices.length === 0) {
    const rawSum = base.reduce((s, t) => s + t, 0);
    if (rawSum <= 0) return base;
    if (rawSum === meteredIn) return base;
    const scale = meteredIn / rawSum;
    return base.map((t, i) =>
      rawParts[i]!.chars > 0 ? Math.max(1, Math.round(t * scale)) : 0
    );
  }

  const allocated = [...base];
  let toolBudget = meteredIn - nonToolTotal;
  if (toolBudget < toolIndices.reduce((s, i) => s + (base[i] ?? 0), 0)) {
    toolBudget = toolIndices.reduce((s, i) => s + (base[i] ?? 0), 0);
  }

  // Prefer explicit per-message counts; put OpenAI chat priming (+3) on tool_result.
  const explicitSum = base.reduce((s, t) => s + t, 0);
  if (explicitSum + 3 === meteredIn || Math.abs(explicitSum - meteredIn) <= 3) {
    for (const i of toolIndices) {
      allocated[i] = base[i]!;
    }
    const drift = meteredIn - explicitSum;
    if (drift !== 0) {
      allocated[toolIndices[toolIndices.length - 1]!]! += drift;
    }
    return allocated;
  }

  if (toolBudget < toolIndices.length) {
    toolBudget = toolIndices.length;
  }

  const toolRawSum = toolIndices.reduce((s, i) => s + rawParts[i]!.tokens, 0);
  if (toolRawSum <= 0) {
    const each = Math.floor(toolBudget / toolIndices.length);
    for (const i of toolIndices) allocated[i] = each;
  } else {
    let assigned = 0;
    for (let t = 0; t < toolIndices.length; t++) {
      const i = toolIndices[t]!;
      if (t === toolIndices.length - 1) {
        allocated[i] = toolBudget - assigned;
      } else {
        const share = Math.round((rawParts[i]!.tokens / toolRawSum) * toolBudget);
        const tok = Math.max(1, share);
        allocated[i] = tok;
        assigned += tok;
      }
    }
  }

  const sum = allocated.reduce((s, t) => s + t, 0);
  const drift = meteredIn - sum;
  if (drift !== 0) {
    allocated[toolIndices[toolIndices.length - 1]!]! += drift;
  }

  return allocated;
}

/**
 * Derive metered input from message bodies (non-tool fixed + tool at char/4).
 */
export function meteredInputFromMessages(messages: TraceCallMessage[]): number {
  return allocateInputFrameTokens(
    messages.map((msg) => {
      const { source, label } = classifyMessage(msg);
      const chars = msg.content?.length ?? 0;
      const tokens =
        msg.tokens != null && msg.tokens >= 0
          ? msg.tokens
          : estimateTokensFromChars(chars);
      return { source, label, chars, tokens };
    }),
    undefined
  ).reduce((s, t) => s + t, 0);
}

/**
 * Build a turn×source stack from inference-shaped call records.
 * Non-tool messages keep char/4 estimates; tool_result absorbs metered remainder.
 */
export function buildContextFlamegraph(
  sessionId: string,
  records: TraceCallRecord[],
  opts?: { tokenization?: ContextFlamegraph["tokenization"] }
): ContextFlamegraph {
  const sorted = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const bySource = emptyBySource();
  const frames: TraceFrame[] = [];
  const turns: ContextFlamegraph["turns"] = [];
  let totalIn = 0;
  let totalOut = 0;

  sorted.forEach((rec, idx) => {
    const turn = idx + 1;
    const turnFrames: TraceFrame[] = [];
    const rawParts: RawMessagePart[] = rec.messages.map((msg) => {
      const { source, label } = classifyMessage(msg);
      const chars = msg.content?.length ?? 0;
      const tokens =
        msg.tokens != null && msg.tokens >= 0
          ? msg.tokens
          : estimateTokensFromChars(chars);
      return { source, label, chars, tokens };
    });
    const meteredIn = resolveMeteredInputTokens(rawParts, rec.usage?.inputTokens);
    const tokenAlloc = allocateInputFrameTokens(rawParts, meteredIn);

    rawParts.forEach((part, partIdx) => {
      const tokens = tokenAlloc[partIdx] ?? 0;
      const frame: TraceFrame = {
        turn,
        source: part.source,
        label: part.label,
        chars: part.chars,
        tokens,
        callId: rec.id,
        modelId: rec.modelId,
      };
      turnFrames.push(frame);
      frames.push(frame);
      bySource[part.source] += tokens;
    });

    const outChars = rec.response?.length ?? 0;
    const outTokens =
      rec.usage?.outputTokens ?? (outChars > 0 ? estimateTokensFromChars(outChars) : 0);
    if (outTokens > 0) {
      const outFrame: TraceFrame = {
        turn,
        source: "model_output",
        label: "model output",
        chars: outChars,
        tokens: outTokens,
        callId: rec.id,
        modelId: rec.modelId,
      };
      turnFrames.push(outFrame);
      frames.push(outFrame);
      bySource.model_output += outTokens;
    }

    const inputTokens =
      meteredIn ?? turnFrames.filter((f) => f.source !== "model_output").reduce((s, f) => s + f.tokens, 0);
    totalIn += inputTokens;
    totalOut += outTokens;

    turns.push({
      turn,
      callId: rec.id,
      timestamp: rec.timestamp,
      modelId: rec.modelId,
      latencyMs: rec.latencyMs,
      inputTokens,
      outputTokens: outTokens,
      frames: turnFrames,
    });
  });

  return {
    sessionId,
    calls: sorted.length,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    tokenization: opts?.tokenization,
    frames,
    turns,
    bySource,
  };
}

export function demoTraceTokenizationMeta(): ContextFlamegraph["tokenization"] {
  return {
    encoding: TRACE_DEMO_TOKENIZATION.encoding,
    method: TRACE_DEMO_TOKENIZATION.method,
    label: `Token counts: ${TRACE_DEMO_TOKENIZATION.encoding} (OpenAI tiktoken)`,
  };
}

function cloneDemoRecords(
  records: TraceCallRecord[],
  sessionId: string
): TraceCallRecord[] {
  return records.map((r) => ({ ...r, correlationId: sessionId }));
}

/** Demo session: compressed vs fat tool-result shapes for the Both-Sides argument. */
export function demoCompressedVsFatRecords(sessionId: string): {
  compressed: TraceCallRecord[];
  fat: TraceCallRecord[];
} {
  return {
    compressed: cloneDemoRecords(TRACE_DEMO_COMPRESSED, sessionId),
    fat: cloneDemoRecords(TRACE_DEMO_FAT, sessionId),
  };
}

/**
 * Resolve records for a session id: built-in demos, else optional host callback.
 * Returns `null` when nothing is available (caller renders 404).
 */
export async function resolveTraceRecords(
  sessionId: string,
  listTraceCalls?: (
    sessionId: string
  ) => TraceCallRecord[] | Promise<TraceCallRecord[]>
): Promise<TraceCallRecord[] | null> {
  const id = sessionId.trim();
  if (!id) return null;

  if (id === DEMO_TRACE_SESSION_COMPRESSED) {
    return demoCompressedVsFatRecords(id).compressed;
  }
  if (id === DEMO_TRACE_SESSION_FAT) {
    return demoCompressedVsFatRecords(id).fat;
  }
  if (id === DEMO_TRACE_SESSION_EXECUTOR_CMP_CLAWQL) {
    return demoExecutorCmpRecords(id).clawql;
  }
  if (id === DEMO_TRACE_SESSION_EXECUTOR_CMP_EXECUTOR) {
    return demoExecutorCmpRecords(id).executor;
  }
  if (!listTraceCalls) return null;
  const records = await listTraceCalls(id);
  if (!records || records.length === 0) return null;
  return records;
}

/** Coalesce adjacent same-source frames for stacked-bar rendering. */
export function coalesceFramesBySource(frames: TraceFrame[]): TraceFrame[] {
  const out: TraceFrame[] = [];
  for (const f of frames) {
    const prev = out[out.length - 1];
    if (prev && prev.source === f.source) {
      prev.tokens += f.tokens;
      prev.chars += f.chars;
      prev.label = `${prev.label}; ${f.label}`;
    } else {
      out.push({ ...f });
    }
  }
  return out;
}
