/**
 * Optional bridge: clawql-inference store → /mcp-ui/trace flamegraph records.
 * Uses dynamic import so mcp-api-adapter stays standalone on npm.
 */

import type { TraceCallRecord } from "./mcp-ui-trace.js";

/** Minimal inference record shape (matches clawql-inference InferenceRecord). */
export type InferenceRecordLike = {
  id: string;
  correlationId?: string;
  timestamp: string;
  modelId: string;
  provider?: string;
  messages: Array<{ role: string; content: string; tokens?: number }>;
  response: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  latencyMs?: number;
};

/** Build `listTraceCalls` from an existing inference store (same process or shared jsonl/pg). */
export function createListTraceCallsFromStore(store: {
  getByCorrelationId(correlationId: string): Promise<InferenceRecordLike[]>;
}): (sessionId: string) => Promise<TraceCallRecord[]> {
  return async (sessionId: string) => {
    const records = await store.getByCorrelationId(sessionId.trim());
    return inferenceRecordsToTraceCalls(records);
  };
}

export function inferenceRecordsToTraceCalls(
  records: InferenceRecordLike[]
): TraceCallRecord[] {
  return records.map((r) => ({
    id: r.id,
    correlationId: r.correlationId,
    timestamp: r.timestamp,
    modelId: r.modelId,
    provider: r.provider,
    messages: r.messages.map((m) => ({
      role: m.role,
      content: m.content,
      tokens: m.tokens,
    })),
    response: r.response,
    usage: r.usage
      ? {
          inputTokens: r.usage.inputTokens,
          outputTokens: r.usage.outputTokens,
        }
      : undefined,
    latencyMs: r.latencyMs,
  }));
}

function inferenceTraceEnabled(env: NodeJS.ProcessEnv): boolean {
  const explicit = env.MCP_API_ADAPTER_INFERENCE_TRACE?.trim().toLowerCase();
  if (explicit === "0" || explicit === "false" || explicit === "off") return false;
  if (explicit === "1" || explicit === "true" || explicit === "on") return true;
  const store = env.CLAWQL_INFERENCE_STORE?.trim().toLowerCase();
  if (store && store !== "off") return true;
  if (env.CLAWQL_HOME?.trim() || env.CLAWQL_INFERENCE_STORE_PATH?.trim()) return true;
  return false;
}

/**
 * When clawql-inference is installed and store env is configured, return
 * `listTraceCalls` for `startMcpApiAdapter` / CLI.
 */
export async function resolveListTraceCallsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Promise<((sessionId: string) => Promise<TraceCallRecord[]>) | undefined> {
  if (!inferenceTraceEnabled(env)) return undefined;

  let createInferenceStore: (
    options?: { env?: NodeJS.ProcessEnv }
  ) => import("clawql-inference").InferenceStore | null;

  try {
    const mod = await import("clawql-inference");
    createInferenceStore = mod.createInferenceStore;
  } catch {
    return undefined;
  }

  const store = createInferenceStore({ env });
  if (!store) return undefined;

  return createListTraceCallsFromStore({
    getByCorrelationId: (correlationId) =>
      store.getByCorrelationId(correlationId) as Promise<InferenceRecordLike[]>,
  });
}

export function liveTraceTokenizationMeta(): {
  label: string;
  encoding?: string;
  method?: string;
} {
  return {
    label: "Live inference store — provider usage totals; per-message tokens when recorded",
    encoding: "cl100k_base",
    method: "clawql-inference store + optional message tokenization",
  };
}
