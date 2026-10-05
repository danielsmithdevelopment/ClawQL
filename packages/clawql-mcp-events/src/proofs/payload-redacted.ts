/**
 * Trusted module: mint PayloadRedacted before JetStream / event-stream publish.
 */

import { defineProof, type Named, type Proof, type EventPayloadId } from "clawql-gdp";
import { Effect } from "effect";

const PayloadRedactedProver = defineProof("PayloadRedacted");

export interface PayloadRedacted<E> extends Proof<"PayloadRedacted", [E]> {}

export type RedactedPayloadBundle = {
  readonly eventId: string;
  readonly data: Record<string, unknown>;
};

/**
 * Mint after screen (+ optional PII redact). The named id must match the event id.
 */
export function payloadRedactedEffect<E>(
  event: Named<E, EventPayloadId>,
  bundle: RedactedPayloadBundle
): Effect.Effect<PayloadRedacted<E> | null> {
  return Effect.sync(() => {
    if (event.value !== bundle.eventId.trim()) return null;
    if (!bundle.data || typeof bundle.data !== "object") return null;
    return PayloadRedactedProver.prove(event) as PayloadRedacted<E>;
  });
}
