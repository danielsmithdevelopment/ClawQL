import type { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import type { WormStorageError } from "../errors.js";

export type StorageBackend = {
  readonly writeCommitted: (entry: WORMEntry) => Effect.Effect<void, WormStorageError>;
  readonly writeWithOutbox: (entry: WORMEntry) => Effect.Effect<void, WormStorageError>;
  readonly query: (filter: WORMFilter) => Effect.Effect<WORMEntry[], WormStorageError>;
  readonly all: () => Effect.Effect<WORMEntry[], WormStorageError>;
  readonly latestEntry: () => Effect.Effect<WORMEntry | null, WormStorageError>;
  readonly outboxList: () => Effect.Effect<WORMEntry[], WormStorageError>;
  readonly outboxDelete: (id: string) => Effect.Effect<void, WormStorageError>;
};
