/**
 * In-process event buffer for SSE resume (`Last-Event-ID` → sequence).
 * JetStream sequence is the production mapping; this buffer is the single-process stand-in.
 */

import { Effect } from "effect";
import { toCloudEventEffect, type ClawqlCloudEvent } from "./cloudevents.js";
import type { DeliverableEvent } from "./types.js";

export const DEFAULT_EVENT_STREAM_CAPACITY = 1024;

export type EventStreamRecord = {
  readonly seq: number;
  readonly event: DeliverableEvent;
  readonly cloudEvent: ClawqlCloudEvent;
};

export const parseLastEventIdEffect = (raw: string | undefined): Effect.Effect<number> =>
  Effect.sync(() => {
    const n = Number.parseInt(String(raw ?? "0"), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });

export const formatSseFrameEffect = (record: EventStreamRecord): Effect.Effect<string> =>
  Effect.sync(
    () =>
      `id: ${record.seq}\nevent: ${record.cloudEvent.type}\ndata: ${JSON.stringify(record.cloudEvent)}\n\n`
  );

export type EventStreamBuffer = {
  readonly append: (event: DeliverableEvent) => Effect.Effect<EventStreamRecord>;
  readonly replayFrom: (
    lastSeq: number,
    name?: string
  ) => Effect.Effect<readonly EventStreamRecord[]>;
  readonly subscribe: (listener: (record: EventStreamRecord) => void) => Effect.Effect<() => void>;
};

export function createEventStreamBuffer(
  capacity: number = DEFAULT_EVENT_STREAM_CAPACITY
): EventStreamBuffer {
  const max = Math.max(1, capacity);
  const records: EventStreamRecord[] = [];
  let seq = 0;
  const listeners = new Set<(record: EventStreamRecord) => void>();

  return {
    append: (event) =>
      Effect.gen(function* () {
        const cloudEvent = yield* toCloudEventEffect(event);
        seq += 1;
        const record: EventStreamRecord = { seq, event, cloudEvent };
        records.push(record);
        if (records.length > max) records.splice(0, records.length - max);
        for (const listener of listeners) listener(record);
        return record;
      }),
    replayFrom: (lastSeq, name) =>
      Effect.sync(() => {
        const from = Number.isFinite(lastSeq) ? lastSeq : 0;
        return records.filter((r) => r.seq > from && (!name || r.event.name === name));
      }),
    subscribe: (listener) =>
      Effect.sync(() => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }),
  };
}
