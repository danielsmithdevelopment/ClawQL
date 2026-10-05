/**
 * NATS JetStream subject + message-id helpers for MCP Events.
 * `/events` and MCP Events are two delivery surfaces on the same stream.
 * NATS stays internal — never expose it to customers.
 */

import { Effect } from "effect";
import type { EventPayloadId, Named } from "clawql-gdp";
import type { PayloadRedacted } from "./proofs/payload-redacted.js";
import type { ClawqlCloudEvent } from "./cloudevents.js";
import type { DeliverableEvent } from "./types.js";

export const CLAWQL_EVENTS_NATS_ROOT = "clawql.events";

/**
 * JetStream queue group for webhook delivery workers.
 * Exactly one consumer in the group processes each message across replicas.
 */
export const CLAWQL_EVENTS_WEBHOOK_QUEUE_GROUP = "clawql-events-webhook";

/**
 * JetStream durable consumer prefix for SSE resume (per connection binds to
 * stream sequence via Last-Event-ID — not a queue group; each replica serves
 * its own SSE clients from the shared stream).
 */
export const CLAWQL_EVENTS_SSE_CONSUMER_PREFIX = "clawql-events-sse";

export type EventStreamPublishInput = {
  readonly event: DeliverableEvent;
  readonly cloudEvent: ClawqlCloudEvent;
  readonly tenant: string;
  readonly seq: number;
};

/** Publisher wired by the host when JetStream is enabled (required for managed). */
export type EventStreamPublisher = (input: EventStreamPublishInput) => Effect.Effect<void>;

/**
 * Sensitive: publish to JetStream / event stream. Demands PayloadRedacted about
 * the exact named event id (gdp-ts). Call only after screen (+ optional PII redact).
 */
export function publishEventStreamEffect<E>(
  event: Named<E, EventPayloadId>,
  _proof: PayloadRedacted<E>,
  publisher: EventStreamPublisher,
  input: EventStreamPublishInput
): Effect.Effect<void> {
  return Effect.gen(function* () {
    if (event.value !== input.event.eventId.trim()) {
      // Proof was minted for a different id — refuse silently at the stream edge.
      return;
    }
    return yield* publisher(input);
  });
}

export const natsEventSubjectEffect = (
  eventName: string,
  tenant: string,
  root: string = CLAWQL_EVENTS_NATS_ROOT
): Effect.Effect<string> =>
  Effect.sync(() => {
    const type = eventName.trim() || "unknown";
    const ten = tenant.trim() || "anonymous";
    return `${root}.${type}.${ten}`;
  });

/** Standard Webhooks / JetStream dedup key — same id on publish and webhook retry. */
export const natsMsgIdEffect = (eventId: string): Effect.Effect<string> =>
  Effect.sync(() => eventId.trim());

/**
 * Managed multi-replica gateways must publish to JetStream. The in-process ring
 * buffer cannot resume SSE across replicas or dedupe webhook delivery.
 */
export const eventsJetStreamRequiredEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.sync(() => {
    const flag = (env.CLAWQL_EVENTS_REQUIRE_JETSTREAM ?? "").trim().toLowerCase();
    if (flag === "1" || flag === "true" || flag === "yes") return true;
    const surface = (
      env.CLAWQL_CONSOLE_SURFACE ??
      env.NEXT_PUBLIC_CLAWQL_CONSOLE_SURFACE ??
      env.CLAWQL_MANAGED_GATEWAY ??
      ""
    )
      .trim()
      .toLowerCase();
    return surface === "managed" || surface === "cloud" || surface === "1" || surface === "true";
  });

export const assertEventStreamPublisherForManagedEffect = (
  publisher: EventStreamPublisher | undefined,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const required = yield* eventsJetStreamRequiredEffect(env);
    if (!required) return;
    if (publisher) return;
    return yield* Effect.fail(
      new Error(
        "Managed / multi-replica MCP Events require EventStreamPublisher wired to NATS JetStream " +
          "(set CLAWQL_EVENTS_REQUIRE_JETSTREAM=1 and provide eventStreamPublisher). " +
          "In-process ring buffers do not share Last-Event-ID resume or webhook delivery across replicas; " +
          `webhook workers must join queue group ${CLAWQL_EVENTS_WEBHOOK_QUEUE_GROUP}.`
      )
    );
  });
