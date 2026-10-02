import { appendInferenceAuditToProcessWorm } from "clawql-inference/audit/process-worm";
import type { InferenceAuditEntry } from "clawql-inference";
import type { EventStore } from "../interfaces.js";
import { Effect } from "effect";

async function appendInferenceAuditEventImpl(
  eventStore: EventStore,
  seedId: string,
  entry: InferenceAuditEntry
): Promise<void>  {
  await eventStore.append({
    type: entry.action,
    seed_id: seedId,
    data: {
      ...entry.payload,
      correlationId: entry.correlationId,
      summary: entry.summary,
      ts: entry.ts,
      category: entry.category,
    },
    timestamp: new Date(entry.ts),
  });
  await appendInferenceAuditToProcessWorm(entry);
}

export function appendInferenceAuditEventEffect(
  eventStore: EventStore,
  seedId: string,
  entry: InferenceAuditEntry
): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => appendInferenceAuditEventImpl(eventStore, seedId, entry),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link appendInferenceAuditEventEffect} for Effect callers. */
export async function appendInferenceAuditEvent(
  eventStore: EventStore,
  seedId: string,
  entry: InferenceAuditEntry
): Promise<void>  {
  return Effect.runPromise(appendInferenceAuditEventEffect(eventStore, seedId, entry));
}
