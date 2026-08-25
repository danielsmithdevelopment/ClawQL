import { Duration, Effect, Schedule } from "effect";
import type { BackendAck, WORMEntry, WORMFilter } from "../entry.js";
import { WormStorageError } from "../errors.js";
import type { StorageBackend } from "../storage/types.js";

export type RetryConfig = {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly backoffMultiplier: number;
};

function asStored(entry: Omit<WORMEntry, "backendAcks">, acks: BackendAck[]): WORMEntry {
  return { ...entry, backendAcks: acks };
}

function isAlreadyExists(err: WormStorageError): boolean {
  return /UNIQUE seq/.test(err.message);
}

export class DualAckReplicator {
  constructor(
    private readonly local: StorageBackend,
    private readonly remote: StorageBackend,
    private readonly retry: RetryConfig
  ) {}

  private retryRemote(entry: WORMEntry): Effect.Effect<void, WormStorageError> {
    const times = Math.max(0, this.retry.maxAttempts - 1);
    return this.remote
      .writeCommitted(entry)
      .pipe(
        Effect.retry(
          Schedule.recurs(times).pipe(
            Schedule.addDelay(() => Duration.millis(this.retry.backoffMs))
          )
        )
      );
  }

  write(entry: Omit<WORMEntry, "backendAcks">): Effect.Effect<BackendAck[], WormStorageError> {
    const dual = asStored(entry, ["local", "remote"]);
    const queued = asStored(entry, ["local", "remote_queued"]);
    return this.retryRemote(dual).pipe(
      Effect.flatMap(() => this.local.writeCommitted(dual)),
      Effect.as(["local", "remote"] satisfies BackendAck[]),
      Effect.catchAll(() =>
        this.local
          .writeWithOutbox(queued)
          .pipe(Effect.as(["local", "remote_queued"] satisfies BackendAck[]))
      )
    );
  }

  drainOutbox(): Effect.Effect<void, WormStorageError> {
    return Effect.gen(this, function* () {
      const pending = yield* this.local.outboxList();
      for (const entry of pending) {
        const drained = yield* this.retryRemote(entry).pipe(
          Effect.as(true),
          Effect.catchIf(isAlreadyExists, () => Effect.succeed(true)),
          Effect.catchAll(() => Effect.succeed(false))
        );
        if (drained) {
          yield* this.local.outboxDelete(entry.id);
        }
      }
    });
  }

  query(filter: WORMFilter) {
    return this.drainOutbox().pipe(Effect.flatMap(() => this.local.query(filter)));
  }

  all() {
    return this.local.all();
  }

  latestEntry() {
    return this.local.latestEntry();
  }
}
