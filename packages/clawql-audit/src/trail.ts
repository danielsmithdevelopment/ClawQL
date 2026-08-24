import { HASH_CHAIN_GENESIS, sealHashChainRecord, verifyHashChain } from "clawql-merkle";
import { Context, Effect, Layer } from "effect";
import type { WORMAppendInput, WORMEntry, WORMFilter } from "./entry.js";
import { WormChainGapError, type WormStorageError } from "./errors.js";
import { MerkleBatchLayer } from "./merkle.js";
import { DualAckReplicator, type RetryConfig } from "./replication/dual-ack.js";
import type { StorageBackend } from "./storage/types.js";

export type WORMAuditTrailConfig = {
  readonly local: StorageBackend;
  readonly remote: StorageBackend;
  readonly retry?: Partial<RetryConfig>;
};

function defaultRetry(retry?: Partial<RetryConfig>): RetryConfig {
  return {
    maxAttempts: retry?.maxAttempts ?? 10,
    backoffMs: retry?.backoffMs ?? 100,
    backoffMultiplier: retry?.backoffMultiplier ?? 2,
  };
}

export class WORMAuditTrail extends Context.Tag("clawql/WORMAuditTrail")<
  WORMAuditTrail,
  {
    readonly append: (
      entry: WORMAppendInput
    ) => Effect.Effect<WORMEntry, WormChainGapError | WormStorageError>;
    readonly query: (filter: WORMFilter) => Effect.Effect<WORMEntry[], WormStorageError>;
    readonly verify: () => Effect.Effect<ReturnType<typeof verifyHashChain>, WormStorageError>;
    readonly merkle: MerkleBatchLayer;
  }
>() {}

function makeService(
  replicator: DualAckReplicator,
  merkle: MerkleBatchLayer,
  tip: { current: WORMEntry | null }
) {
  return WORMAuditTrail.of({
    merkle,
    append: (entry) =>
      Effect.gen(function* () {
        const prev = tip.current;
        const seq = (prev?.seq ?? -1) + 1;
        const prevHash = prev?.hash ?? HASH_CHAIN_GENESIS;
        const payload = {
          id: crypto.randomUUID(),
          writtenAt: new Date().toISOString(),
          ...entry,
        };
        const sealed = sealHashChainRecord(payload, seq, prevHash);
        const acks = yield* replicator.write(sealed);
        const final: WORMEntry = { ...sealed, backendAcks: acks };
        if (tip.current && final.seq !== tip.current.seq + 1) {
          return yield* Effect.fail(
            new WormChainGapError({ expected: tip.current.seq + 1, got: final.seq })
          );
        }
        tip.current = final;
        return final;
      }),
    query: (filter) => replicator.query(filter),
    verify: () =>
      replicator.all().pipe(
        Effect.map((entries) =>
          verifyHashChain(entries as Array<WORMEntry & Record<string, unknown>>, {
            requireGenesis: true,
          })
        )
      ),
  });
}

export const makeWORMAuditTrailLayer = (config: WORMAuditTrailConfig) =>
  Layer.effect(
    WORMAuditTrail,
    Effect.gen(function* () {
      const replicator = new DualAckReplicator(
        config.local,
        config.remote,
        defaultRetry(config.retry)
      );
      yield* replicator.drainOutbox();
      const tip = { current: yield* replicator.latestEntry() };
      return makeService(replicator, new MerkleBatchLayer(), tip);
    })
  );

/** Thin host façade for SDK callers. Domain API is `WORMAuditTrail` + Layer. */
export const createWORMAuditTrail = (config: WORMAuditTrailConfig) =>
  Effect.runPromise(WORMAuditTrail.pipe(Effect.provide(makeWORMAuditTrailLayer(config))));
