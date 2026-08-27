import { appendInferenceAuditToProcessWorm } from "clawql-inference/audit/process-worm";
import type { InferenceAuditEntry } from "clawql-inference";
import type { EventStore } from "../interfaces.js";

export async function appendInferenceAuditEvent(
  eventStore: EventStore,
  seedId: string,
  entry: InferenceAuditEntry
): Promise<void> {
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
