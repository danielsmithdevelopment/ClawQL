import { Effect } from "effect";
import { LokiLogPush, lokiLogPushLiveLayer } from "clawql-core";
import type { InferenceRecord } from "../store/types.js";

export type InferenceLokiLine = {
  readonly kind: "inference_call";
  readonly id: string;
  readonly timestamp: string;
  readonly provider: string;
  readonly modelId: string;
  readonly latencyMs: number;
  readonly messageCount: number;
  readonly roles: string[];
  readonly responseChars: number;
  readonly usage?: { inputTokens: number; outputTokens: number };
  readonly cacheHit?: boolean;
  readonly evaluatorVerdict: string;
  readonly correlationId?: string;
  readonly team?: string;
  readonly tier?: string;
};

export const inferenceRecordToLokiLine = (
  record: InferenceRecord
): Effect.Effect<InferenceLokiLine> =>
  Effect.sync(() => ({
    kind: "inference_call" as const,
    id: record.id,
    timestamp: record.timestamp,
    provider: record.provider,
    modelId: record.modelId,
    latencyMs: record.latencyMs,
    messageCount: record.messages.length,
    roles: record.messages.map((m) => m.role),
    responseChars: record.response.length,
    ...(record.usage ? { usage: record.usage } : {}),
    ...(record.cacheHit !== undefined ? { cacheHit: record.cacheHit } : {}),
    evaluatorVerdict: record.evaluatorVerdict,
    ...(record.correlationId ? { correlationId: record.correlationId } : {}),
    ...(record.team ? { team: record.team } : {}),
    ...(record.tier ? { tier: record.tier } : {}),
  }));

export const pushInferenceRecordToLokiEffect = (
  record: InferenceRecord,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const payload = yield* inferenceRecordToLokiLine(record);
    const job = env.CLAWQL_LOKI_INFERENCE_JOB?.trim() || "clawql-inference";
    const loki = yield* LokiLogPush;
    yield* loki.push({
      job,
      service: "clawql-inference",
      ts: record.timestamp,
      line: JSON.stringify(payload),
    });
  }).pipe(
    Effect.provide(lokiLogPushLiveLayer(env)),
    Effect.catchAll((err) =>
      Effect.sync(() => {
        console.error("[clawql-inference-loki] push failed:", err.reason);
      })
    )
  );

/** Store/gateway host façade — never throws. */
export function maybePushInferenceRecordToLoki(
  record: InferenceRecord,
  env: NodeJS.ProcessEnv = process.env
): void {
  void Effect.runPromise(pushInferenceRecordToLokiEffect(record, env));
}
