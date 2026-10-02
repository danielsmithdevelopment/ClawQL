import { createInferenceStore } from "../store/create.js";
import { parseSinceDuration } from "../observability/parse-since.js";
import type { SpendGroupBy } from "../store/types.js";
import { Effect } from "effect";

export type InferenceLogsOptions = {
  model?: string;
  provider?: string;
  tier?: string;
  since?: string;
  limit?: number;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

async function runInferenceLogsImpl(options: InferenceLogsOptions = {}): Promise<number>  {
  const store = createInferenceStore({ env: options.env });
  if (!store) {
    console.error("Inference store is disabled (CLAWQL_INFERENCE_STORE=off)");
    return 1;
  }
  const records = await store.list({
    modelId: options.model,
    provider: options.provider,
    tier: options.tier,
    since: parseSinceDuration(options.since),
    limit: options.limit ?? 50,
  });
  if (options.json) {
    console.log(JSON.stringify(records, null, 2));
    return 0;
  }
  if (!records.length) {
    console.log("No inference records found.");
    return 0;
  }
  for (const record of records) {
    console.log(
      `${record.timestamp}  ${record.modelId}  ${record.latencyMs}ms  tokens=${record.usage?.inputTokens ?? 0}/${record.usage?.outputTokens ?? 0}  corr=${record.correlationId ?? "-"}`
    );
  }
  return 0;
}

export function runInferenceLogsEffect(options: InferenceLogsOptions = {}): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferenceLogsImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferenceLogsEffect} for Effect callers. */
export async function runInferenceLogs(options: InferenceLogsOptions = {}): Promise<number>  {
  return Effect.runPromise(runInferenceLogsEffect(options));
}

export type InferenceTraceOptions = {
  correlationId: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

async function runInferenceTraceImpl(options: InferenceTraceOptions): Promise<number>  {
  if (!options.correlationId?.trim()) {
    console.error("Usage: clawql inference trace --correlation-id <id>");
    return 1;
  }
  const store = createInferenceStore({ env: options.env });
  if (!store) {
    console.error("Inference store is disabled (CLAWQL_INFERENCE_STORE=off)");
    return 1;
  }
  const records = await store.getByCorrelationId(options.correlationId.trim());
  if (options.json) {
    console.log(JSON.stringify(records, null, 2));
    return 0;
  }
  if (!records.length) {
    console.log(`No records for correlation_id=${options.correlationId}`);
    return 0;
  }
  for (const record of records) {
    console.log(`--- ${record.id} @ ${record.timestamp} ---`);
    console.log(`model: ${record.modelId}  latency: ${record.latencyMs}ms`);
    console.log(
      `response: ${record.response.slice(0, 200)}${record.response.length > 200 ? "…" : ""}`
    );
  }
  return 0;
}

export function runInferenceTraceEffect(options: InferenceTraceOptions): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferenceTraceImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferenceTraceEffect} for Effect callers. */
export async function runInferenceTrace(options: InferenceTraceOptions): Promise<number>  {
  return Effect.runPromise(runInferenceTraceEffect(options));
}

export type InferenceSpendOptions = {
  groupBy?: SpendGroupBy;
  since?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

async function runInferenceSpendImpl(options: InferenceSpendOptions = {}): Promise<number>  {
  const store = createInferenceStore({ env: options.env });
  if (!store) {
    console.error("Inference store is disabled (CLAWQL_INFERENCE_STORE=off)");
    return 1;
  }
  const rows = await store.spendRollup({
    groupBy: options.groupBy ?? "model",
    since: parseSinceDuration(options.since),
  });
  if (options.json) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  if (!rows.length) {
    console.log("No spend data.");
    return 0;
  }
  for (const row of rows) {
    console.log(
      `${row.key.padEnd(28)}  calls=${row.calls}  in=${row.inputTokens}  out=${row.outputTokens}`
    );
  }
  return 0;
}

export function runInferenceSpendEffect(options: InferenceSpendOptions = {}): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runInferenceSpendImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runInferenceSpendEffect} for Effect callers. */
export async function runInferenceSpend(options: InferenceSpendOptions = {}): Promise<number>  {
  return Effect.runPromise(runInferenceSpendEffect(options));
}
