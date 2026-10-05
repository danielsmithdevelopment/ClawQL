/**
 * Trusted module: mint PayloadRedacted only after screen (+ optional PII redact).
 * The check and the proof are inseparable — callers must not mint without redacting.
 */

import { defineProof, type Named, type Proof, type EventPayloadId } from "clawql-gdp";
import { Effect } from "effect";
import { screenEventPayload } from "../screen.js";

const PayloadRedactedProver = defineProof("PayloadRedacted");

export interface PayloadRedacted<E> extends Proof<"PayloadRedacted", [E]> {
  /** Nominal brand for distinct proof kinds; never set at runtime. */
  readonly __proofBrand?: "PayloadRedacted";
}

export type ScreenAndRedactResult<E> = {
  readonly data: Record<string, unknown>;
  readonly proof: PayloadRedacted<E>;
};

export type ScreenAndRedactOptions = {
  readonly eventId: string;
  readonly data: Record<string, unknown>;
  readonly redactPii: boolean;
  /** PII redactor (e.g. gatewayRedactPayload). Required when redactPii is true. */
  readonly redactFn?: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

/**
 * Screen (and optionally PII-redact) the payload, then mint PayloadRedacted about
 * the named event. Returns null if the named id does not match or redaction fails closed.
 *
 * Never store the returned proof — it is request-scoped only.
 */
export function screenAndRedactForPublishEffect<E>(
  event: Named<E, EventPayloadId>,
  options: ScreenAndRedactOptions
): Effect.Effect<ScreenAndRedactResult<E> | null, Error> {
  return Effect.gen(function* () {
    if (event.value !== options.eventId.trim()) {
      return null;
    }
    const screened = yield* screenEventPayload(options.data);
    let data = screened;
    if (options.redactPii) {
      if (!options.redactFn) {
        return yield* Effect.fail(
          new Error("redactFn required when redactPii is true (cannot mint PayloadRedacted)")
        );
      }
      data = yield* Effect.tryPromise({
        try: () => options.redactFn!(screened),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      });
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    const proof = PayloadRedactedProver.prove(event) as PayloadRedacted<E>;
    return { data, proof };
  });
}
