/**
 * NATS JetStream subject + message-id helpers for MCP Events.
 * `/events` and MCP Events are two delivery surfaces on the same stream.
 * NATS stays internal — never expose it to customers.
 */

import { Effect } from "effect";
import type { ClawqlCloudEvent } from "./cloudevents.js";
import type { DeliverableEvent } from "./types.js";

export const CLAWQL_EVENTS_NATS_ROOT = "clawql.events";

export type EventStreamPublishInput = {
  readonly event: DeliverableEvent;
  readonly cloudEvent: ClawqlCloudEvent;
  readonly tenant: string;
  readonly seq: number;
};

/** Optional publisher wired by the host when JetStream is enabled. */
export type EventStreamPublisher = (input: EventStreamPublishInput) => Effect.Effect<void>;

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
