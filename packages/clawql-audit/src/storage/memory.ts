import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import type { LocalStorageBackend } from "./types.js";

function matchesFilter(entry: WORMEntry, filter: WORMFilter): boolean {
  if (filter.sessionId && entry.sessionId !== filter.sessionId) return false;
  if (filter.type && entry.type !== filter.type) return false;
  if (filter.agentName && entry.agentName !== filter.agentName) return false;
  if (filter.since && entry.timestamp < filter.since) return false;
  if (filter.until && entry.timestamp > filter.until) return false;
  return true;
}

/** In-memory local backend (tests). */
export class MemoryBackend implements LocalStorageBackend {
  private entries: WORMEntry[] = [];
  private outbox: WORMEntry[] = [];

  write = (entry: WORMEntry): Effect.Effect<void, never> =>
    Effect.sync(() => {
      this.entries.push(entry);
      this.entries.sort((a, b) => a.chainIndex - b.chainIndex);
    });

  writeWithOutbox = (entry: WORMEntry): Effect.Effect<void, never> =>
    Effect.sync(() => {
      this.entries.push(entry);
      this.entries.sort((a, b) => a.chainIndex - b.chainIndex);
      this.outbox.push(entry);
    });

  outboxList = (): Effect.Effect<WORMEntry[], never> => Effect.sync(() => [...this.outbox]);

  outboxDelete = (id: string): Effect.Effect<void, never> =>
    Effect.sync(() => {
      this.outbox = this.outbox.filter((e) => e.id !== id);
    });

  query = (filter: WORMFilter): Effect.Effect<WORMEntry[], never> =>
    Effect.sync(() => {
      let rows = this.entries.filter((e) => matchesFilter(e, filter));
      const offset = filter.offset ?? 0;
      if (offset > 0) rows = rows.slice(offset);
      if (filter.limit !== undefined) rows = rows.slice(0, filter.limit);
      return rows;
    });

  all = (): Effect.Effect<WORMEntry[], never> => Effect.sync(() => [...this.entries]);

  latestEntry = (): Effect.Effect<WORMEntry | null, never> =>
    Effect.sync(() => (this.entries.length ? this.entries[this.entries.length - 1]! : null));
}
