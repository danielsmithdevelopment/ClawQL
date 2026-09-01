import type { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import type { AuditError } from "../errors.js";
import type { MerkleRoot } from "../merkle.js";

/** Remote-capable backend (S3 write-primary; query may fail). */
export type StorageBackend = {
  readonly write: (entry: WORMEntry) => Effect.Effect<void, AuditError>;
  readonly query: (filter: WORMFilter) => Effect.Effect<WORMEntry[], AuditError>;
  readonly all: () => Effect.Effect<WORMEntry[], AuditError>;
  readonly latestEntry: () => Effect.Effect<WORMEntry | null, AuditError>;
};

/**
 * Local backend: authoritative reads + outbox for dual-ack replication.
 * `writeWithOutbox` must be atomic (same SQLite/Postgres transaction when applicable).
 */
export type LocalStorageBackend = StorageBackend & {
  readonly writeWithOutbox: (entry: WORMEntry) => Effect.Effect<void, AuditError>;
  readonly outboxList: () => Effect.Effect<WORMEntry[], AuditError>;
  readonly outboxDelete: (id: string) => Effect.Effect<void, AuditError>;
  readonly storeMerkleRoot: (root: MerkleRoot) => Effect.Effect<void, AuditError>;
  readonly listMerkleRoots: () => Effect.Effect<MerkleRoot[], AuditError>;
};
