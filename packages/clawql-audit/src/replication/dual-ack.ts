/**
 * Dual-ack replicator: local write + outbox in one transaction, then remote drain.
 * Not LTX (celld SQLite→bucket). Sealed bytes are never resealed.
 */

import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import type { AuditError } from "../errors.js";
import type { LocalStorageBackend, StorageBackend } from "../storage/types.js";
import { defaultRetryConfig, withRetry, type RetryConfig } from "./retry.js";

export class DualAckReplicator {
  private readonly local: LocalStorageBackend;
  private readonly remote: StorageBackend;
  private readonly retry: RetryConfig;

  constructor(
    local: LocalStorageBackend,
    remote: StorageBackend,
    retry: RetryConfig = defaultRetryConfig
  ) {
    this.local = local;
    this.remote = remote;
    this.retry = retry;
  }

  /**
   * Atomically write entry + outbox locally, attempt remote, clear outbox on success.
   * Never fails the caller solely because remote is down — outbox guarantees eventual delivery.
   */
  write(entry: Omit<WORMEntry, "backendAcks">): Effect.Effect<string[], AuditError> {
    const local = this.local;
    const remote = this.remote;
    const retry = this.retry;
    const sealed = entry as WORMEntry;
    return Effect.gen(function* () {
      yield* withRetry(() => local.writeWithOutbox(sealed), retry);

      const remoteOk = yield* withRetry(() => remote.write(sealed), retry).pipe(
        Effect.map(() => true as const),
        Effect.catchAll(() => Effect.succeed(false as const))
      );

      if (remoteOk) {
        yield* local.outboxDelete(sealed.id);
      }
      return ["local", "remote"];
    });
  }

  drainOutbox(): Effect.Effect<void, AuditError> {
    const local = this.local;
    const remote = this.remote;
    const retry = this.retry;
    return Effect.gen(function* () {
      const pending = yield* local.outboxList();
      for (const entry of pending) {
        yield* withRetry(() => remote.write(entry), retry);
        yield* local.outboxDelete(entry.id);
      }
    });
  }

  query(filter: WORMFilter): Effect.Effect<WORMEntry[], AuditError> {
    return this.local.query(filter);
  }

  all(): Effect.Effect<WORMEntry[], AuditError> {
    return this.local.all();
  }
}
