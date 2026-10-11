/**
 * Compile-fail mistakes for JetStream publish PayloadRedacted (gdp-ts).
 */
import { Effect } from "effect";
import { EventPayloadId, name, type Named, type Proof } from "clawql-gdp";
import type { PayloadRedacted } from "./proofs/payload-redacted.js";
import {
  publishEventStreamEffect,
  type EventStreamPublisher,
  type EventStreamPublishInput,
} from "./nats-subjects.js";

interface BogusProof<E> extends Proof<"BogusPublishProof", [E]> {
  readonly __proofBrand?: "BogusPublishProof";
}

declare function mintPayload<E>(
  event: Named<E, ReturnType<typeof EventPayloadId>>
): PayloadRedacted<E>;

declare function mintBogus<E>(event: Named<E, ReturnType<typeof EventPayloadId>>): BogusProof<E>;

declare const publisher: EventStreamPublisher;

function publishInput(eventId: string): EventStreamPublishInput {
  return {
    event: {
      eventId,
      name: "stream.changed",
      timestamp: new Date().toISOString(),
      cursor: null,
      data: {},
    },
    cloudEvent: {} as EventStreamPublishInput["cloudEvent"],
    tenant: "default",
    seq: 1,
  };
}

export function publishMistakes(): Effect.Effect<void> {
  return name(EventPayloadId("evt_a"), EventPayloadId("evt_b"), (eventA, eventB) => {
    const proofA = mintPayload(eventA);
    const wrongProof = mintBogus(eventA);
    const inputA = publishInput(eventA.value);
    const inputB = publishInput(eventB.value);
    const inputRaw = publishInput("evt_raw");

    // @ts-expect-error no proof at all
    void publishEventStreamEffect(eventA);

    // @ts-expect-error a raw id is not a named value; name it first
    void publishEventStreamEffect(EventPayloadId("evt_raw"), proofA, publisher, inputRaw);

    // @ts-expect-error the proof is about event A, not event B
    void publishEventStreamEffect(eventB, proofA, publisher, inputB);

    // @ts-expect-error wrong proof kind
    void publishEventStreamEffect(eventA, wrongProof, publisher, inputA);

    void publishEventStreamEffect(eventA, proofA, publisher, inputA);
    return Effect.void;
  });
}
