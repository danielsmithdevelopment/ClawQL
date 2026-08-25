import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import { WormStorageError } from "../errors.js";
import type { StorageBackend } from "./types.js";

function matches(entry: WORMEntry, filter: WORMFilter): boolean {
  if (filter.sessionId && entry.sessionId !== filter.sessionId) return false;
  if (filter.type && entry.type !== filter.type) return false;
  if (filter.since && entry.timestamp < filter.since) return false;
  if (filter.until && entry.timestamp > filter.until) return false;
  return true;
}

function uniqueFail(seq: number) {
  return new WormStorageError({ message: `UNIQUE seq ${seq} already exists` });
}

/** In-memory local or remote backend. Outbox is a sidecar map keyed by entry id. */
export function createMemoryBackend(): StorageBackend {
  const bySeq = new Map<number, WORMEntry>();
  const outbox = new Map<string, WORMEntry>();

  const insert = (entry: WORMEntry, withOutbox: boolean) =>
    Effect.suspend(() => {
      if (bySeq.has(entry.seq)) {
        return Effect.fail(uniqueFail(entry.seq));
      }
      bySeq.set(entry.seq, entry);
      if (withOutbox) outbox.set(entry.id, entry);
      return Effect.void;
    });

  return {
    writeCommitted: (entry) => insert(entry, false),
    writeWithOutbox: (entry) => insert(entry, true),
    query: (filter) =>
      Effect.sync(() =>
        [...bySeq.values()].sort((a, b) => a.seq - b.seq).filter((e) => matches(e, filter))
      ),
    all: () => Effect.sync(() => [...bySeq.values()].sort((a, b) => a.seq - b.seq)),
    latestEntry: () =>
      Effect.sync(() => {
        if (bySeq.size === 0) return null;
        return [...bySeq.values()].sort((a, b) => a.seq - b.seq).at(-1) ?? null;
      }),
    outboxList: () => Effect.sync(() => [...outbox.values()].sort((a, b) => a.seq - b.seq)),
    outboxDelete: (id) =>
      Effect.sync(() => {
        outbox.delete(id);
      }),
  };
}

export function createFailingRemoteBackend(message = "remote unavailable"): StorageBackend {
  const inner = createMemoryBackend();
  return {
    ...inner,
    writeCommitted: () => Effect.fail(new WormStorageError({ message })),
  };
}
