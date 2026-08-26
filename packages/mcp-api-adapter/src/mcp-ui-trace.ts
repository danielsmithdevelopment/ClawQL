/**
 * Context-accumulation flamegraph model for /mcp-ui/trace/:sessionId.
 *
 * Adapter stays standalone: callers inject records shaped like clawql-inference
 * `InferenceRecord` (correlationId ≈ sessionId when aligned by the host).
 */

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
    const scale = meteredIn / rawSum;
    return base.map((t, i) =>
      rawParts[i]!.chars > 0 ? Math.max(1, Math.round(t * scale)) : 0
    );
  }

  const allocated = [...base];
  let toolBudget = Math.max(toolIndices.length, meteredIn - nonToolTotal);
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
      return { source, label, chars, tokens: estimateTokensFromChars(chars) };
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
  records: TraceCallRecord[]
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
      return { source, label, chars, tokens: estimateTokensFromChars(chars) };
    });
    const meteredIn = rec.usage?.inputTokens;
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
    frames,
    turns,
    bySource,
  };
}

/** Demo session: compressed vs fat tool-result shapes for the Both-Sides argument. */
export function demoCompressedVsFatRecords(sessionId: string): {
  compressed: TraceCallRecord[];
  fat: TraceCallRecord[];
} {
  const base = new Date("2026-08-26T12:00:00.000Z").getTime();
  const systemHarness = {
    role: "system",
    content:
      "You are ClawQL harness. Prefer search() then execute(). Keep tool results compact.",
  };
  const systemVault = {
    role: "system",
    content:
      "Obsidian vault system-seed memory: [[MCP UI ClawQL Demo]] agent.md notes for this session.",
  };
  const user = {
    role: "user",
    content: "List GitHub repos then summarize the first one.",
  };
  const schema = {
    role: "user",
    content: JSON.stringify({
      name: "search",
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
    }),
  };

  const compressedResult = {
    role: "tool",
    content: JSON.stringify({
      results: [{ id: "repos.list", method: "GET", path: "/user/repos", score: 12 }],
    }),
  };
  const fatResult = {
    role: "tool",
    content: JSON.stringify({
      results: Array.from({ length: 40 }, (_, i) => ({
        id: `repos.list.${i}`,
        method: "GET",
        path: "/user/repos",
        full: "x".repeat(800),
        description: "Untrimmed OpenAPI dump ".repeat(20),
      })),
    }),
  };

  const mk = (
    id: string,
    offsetMs: number,
    toolMsg: TraceCallMessage,
    outputTokens: number,
    /** Turn 2+ simulates prior fat tool context still in window. */
    priorFatToolTurns = 0
  ): TraceCallRecord => {
    const messages = [systemHarness, systemVault, user, schema, toolMsg];
    let inputTokens = meteredInputFromMessages(messages);
    if (priorFatToolTurns > 0 && toolMsg === fatResult) {
      const oneTurnTool = meteredInputFromMessages([toolMsg]);
      inputTokens += oneTurnTool * priorFatToolTurns;
    }
    return {
      id,
      correlationId: sessionId,
      timestamp: new Date(base + offsetMs).toISOString(),
      modelId: "demo/gpt",
      provider: "demo",
      messages,
      response: "First repo looks active; next hop is execute(repos.get).",
      usage: { inputTokens, outputTokens },
      latencyMs: 120 + offsetMs / 10,
    };
  };

  const compressed = [
    mk("c1", 0, compressedResult, 48),
    mk("c2", 30_000, compressedResult, 52, 0),
  ];
  const fat = [
    mk("f1", 0, fatResult, 48),
    mk("f2", 30_000, fatResult, 52, 1),
  ];
  return { compressed, fat };
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
