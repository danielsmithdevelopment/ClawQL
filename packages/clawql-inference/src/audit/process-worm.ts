/**
 * Dual-write clawql-inference audit rows onto the process clawql-audit trail.
 */

import { appendInferenceAuditEntryToWormEffect } from "clawql-audit";
import { Effect } from "effect";
import type { InferenceAuditEntry } from "./events.js";

export const appendInferenceAuditToProcessWormEffect = (
  entry: InferenceAuditEntry
): Effect.Effect<void> =>
  appendInferenceAuditEntryToWormEffect({
    ts: entry.ts,
    category: entry.category,
    action: entry.action,
    summary: entry.summary,
    correlationId: entry.correlationId,
    payload: entry.payload as unknown as Record<string, unknown>,
  }).pipe(
    Effect.catchAll(() => Effect.void),
    Effect.asVoid
  );

/** Thin host façade for ouroboros / coordination hooks. */
export async function appendInferenceAuditToProcessWorm(entry: InferenceAuditEntry): Promise<void> {
  await Effect.runPromise(appendInferenceAuditToProcessWormEffect(entry));
}
