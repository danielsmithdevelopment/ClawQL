import { randomUUID } from "node:crypto";
import type { DeliverableEvent, DeliveryOutcome } from "./types.js";

export type McpEventsProcessEmitter = (
  event: DeliverableEvent
) => Promise<readonly DeliveryOutcome[]> | readonly DeliveryOutcome[];

let processEmitter: McpEventsProcessEmitter | null = null;

/** Host registers the live service emit at MCP boot. */
export function setMcpEventsProcessEmitter(emitter: McpEventsProcessEmitter | null): void {
  processEmitter = emitter;
}

export function getMcpEventsProcessEmitter(): McpEventsProcessEmitter | null {
  return processEmitter;
}

function stamp(
  partial: Omit<DeliverableEvent, "eventId" | "timestamp"> &
    Partial<Pick<DeliverableEvent, "eventId" | "timestamp">>
): DeliverableEvent {
  return {
    eventId: partial.eventId ?? `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    name: partial.name,
    timestamp: partial.timestamp ?? new Date().toISOString(),
    data: partial.data,
    cursor: partial.cursor ?? null,
  };
}

/**
 * Fire-and-forget emit for production producers. No-op when host has not configured
 * the process emitter (e.g. unit tests without MCP HTTP boot).
 */
export function emitMcpEventBestEffort(
  partial: Omit<DeliverableEvent, "eventId" | "timestamp"> &
    Partial<Pick<DeliverableEvent, "eventId" | "timestamp">>
): void {
  const emitter = processEmitter;
  if (!emitter) return;
  const event = stamp(partial);
  void Promise.resolve()
    .then(() => emitter(event))
    .catch(() => undefined);
}

/** Awaitable emit for tests / producers that need delivery outcomes. */
export async function emitMcpEvent(
  partial: Omit<DeliverableEvent, "eventId" | "timestamp"> &
    Partial<Pick<DeliverableEvent, "eventId" | "timestamp">>
): Promise<readonly DeliveryOutcome[]> {
  const emitter = processEmitter;
  if (!emitter) return [];
  return emitter(stamp(partial));
}
