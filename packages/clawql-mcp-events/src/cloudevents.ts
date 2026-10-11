/**
 * CloudEvents 1.0 envelope for HTTP `/events` (CNCF; NATS binding-compatible).
 * MCP webhook deliveries stay on the ChatGPT MCP Events JSON body.
 */

import { Effect } from "effect";
import type { DeliverableEvent } from "./types.js";

export const CLOUD_EVENTS_SPEC_VERSION = "1.0" as const;
export const CLAWQL_EVENT_SOURCE = "clawql://events";

export type ClawqlCloudEvent = {
  readonly specversion: typeof CLOUD_EVENTS_SPEC_VERSION;
  readonly id: string;
  readonly source: string;
  readonly type: string;
  readonly time: string;
  readonly datacontenttype: "application/json";
  readonly subject?: string;
  readonly data: Record<string, unknown>;
};

export const cloudEventTypeEffect = (eventName: string): Effect.Effect<string> =>
  Effect.sync(() => `com.clawql.${eventName.trim()}`);

export const cloudEventSubjectEffect = (
  data: Record<string, unknown>
): Effect.Effect<string | undefined> =>
  Effect.sync(() => {
    for (const key of ["topic", "schedule_id", "document_id", "budget_id"] as const) {
      const v = data[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  });

export const toCloudEventEffect = (
  event: DeliverableEvent,
  source: string = CLAWQL_EVENT_SOURCE
): Effect.Effect<ClawqlCloudEvent> =>
  Effect.gen(function* () {
    const type = yield* cloudEventTypeEffect(event.name);
    const subject = yield* cloudEventSubjectEffect(event.data);
    return {
      specversion: CLOUD_EVENTS_SPEC_VERSION,
      id: event.eventId,
      source,
      type,
      time: event.timestamp,
      datacontenttype: "application/json",
      ...(subject ? { subject } : {}),
      data: event.data,
    } satisfies ClawqlCloudEvent;
  });
