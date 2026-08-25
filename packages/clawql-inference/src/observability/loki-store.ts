import type { InferenceListQuery, InferenceRecord, InferenceStore } from "../store/types.js";
import { maybePushInferenceRecordToLoki } from "./loki.js";

/** Decorator: persist then fire-and-forget a Loki log line (no prompt/response bodies). */
export function withInferenceLokiPush(
  store: InferenceStore,
  env: NodeJS.ProcessEnv = process.env
): InferenceStore {
  return {
    append: async (record: InferenceRecord) => {
      await store.append(record);
      maybePushInferenceRecordToLoki(record, env);
    },
    list: (query?: InferenceListQuery) => store.list(query),
    getByCorrelationId: (correlationId: string) => store.getByCorrelationId(correlationId),
    spendRollup: (options?: { since?: Date; groupBy?: import("../store/types.js").SpendGroupBy }) =>
      store.spendRollup(options),
  };
}
