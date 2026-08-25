import { Context, Effect, Layer } from "effect";
import { HashChain, HashChainLive } from "./chain.js";
import type {
  ChainVerifyResult,
  WORMAppendInput,
  WORMEntry,
  WORMFilter,
} from "./entry.js";
import type { AuditError } from "./errors.js";
import { MerkleBatchLayer, type MerkleInclusionProof, type MerkleRoot } from "./merkle.js";
import { exportEntries, type ExportFormat, type ExportResult } from "./query/export.js";
import { DualAckReplicator } from "./replication/dual-ack.js";
import { defaultRetryConfig, type RetryConfig } from "./replication/retry.js";
import { generateUUIDv7, sealHashChainRecord } from "./seal.js";
import type { LocalStorageBackend, StorageBackend } from "./storage/types.js";
import type { TEESigner } from "./tee/signer.js";

export type WORMAuditTrailConfig = {
  local: LocalStorageBackend;
  remote: StorageBackend;
  tee?: TEESigner;
  retryMaxAttempts?: number;
  retryBackoffMs?: number;
  retryBackoffMultiplier?: number;
};

export class WORMAuditTrailService extends Context.Tag("clawql-audit/WORMAuditTrail")<
  WORMAuditTrailService,
  {
    readonly append: (entry: WORMAppendInput) => Effect.Effect<WORMEntry, AuditError>;
    readonly query: (filter: WORMFilter) => Effect.Effect<WORMEntry[], AuditError>;
    readonly verify: (
      entries?: readonly WORMEntry[]
    ) => Effect.Effect<ChainVerifyResult, AuditError>;
    readonly exportEntries: (
      filter: WORMFilter,
      format: ExportFormat
    ) => Effect.Effect<ExportResult, AuditError>;
    readonly merkle: MerkleBatchLayer;
    readonly drainOutbox: () => Effect.Effect<void, AuditError>;
  }
>() {}

function retryFromConfig(config: WORMAuditTrailConfig): RetryConfig {
  return {
    maxAttempts: config.retryMaxAttempts ?? defaultRetryConfig.maxAttempts,
    backoffMs: config.retryBackoffMs ?? defaultRetryConfig.backoffMs,
    backoffMultiplier:
      config.retryBackoffMultiplier ?? defaultRetryConfig.backoffMultiplier,
  };
}

/**
 * Live Layer for {@link WORMAuditTrailService}.
 * Loads chain tip and drains outbox before serving appends.
 */
export const makeWORMAuditTrailLayer = (
  config: WORMAuditTrailConfig
): Layer.Layer<WORMAuditTrailService, AuditError> =>
  Layer.effect(
    WORMAuditTrailService,
    Effect.gen(function* () {
      const chain = yield* HashChain;
      yield* chain.loadTip(config.local);
      const replicator = new DualAckReplicator(
        config.local,
        config.remote,
        retryFromConfig(config)
      );
      yield* replicator.drainOutbox().pipe(Effect.catchAll(() => Effect.void));
      const merkle = new MerkleBatchLayer();
      const tee = config.tee;

      return WORMAuditTrailService.of({
        merkle,
        drainOutbox: () => replicator.drainOutbox(),
        append: (input) =>
          Effect.gen(function* () {
            const prev = yield* chain.latest();
            const id = yield* generateUUIDv7();
            const writtenAt = new Date().toISOString();
            const sealed = yield* sealHashChainRecord({
              prev: prev ? { hash: prev.hash, seq: prev.chainIndex } : null,
              body: {
                id,
                writtenAt,
                ...input,
              },
            });
            let signed: Omit<WORMEntry, "backendAcks"> = sealed;
            if (tee) {
              signed = {
                ...sealed,
                teeSignature: yield* tee.sign(sealed.hash),
              };
            }
            const acks = yield* replicator.write(signed);
            const final: WORMEntry = { ...signed, backendAcks: acks };
            yield* chain.update(final);
            return final;
          }),
        query: (filter) => replicator.query(filter),
        verify: (entries) =>
          Effect.gen(function* () {
            const toVerify = entries ?? (yield* replicator.all());
            return yield* chain.verify(toVerify);
          }),
        exportEntries: (filter, format) =>
          Effect.gen(function* () {
            const rows = yield* replicator.query(filter);
            return yield* exportEntries(rows, format);
          }),
      });
    })
  ).pipe(Layer.provide(HashChainLive));

/** Effect program that constructs the trail service (loads tip + drains outbox). */
export const createWORMAuditTrailEffect = (
  config: WORMAuditTrailConfig
): Effect.Effect<Context.Tag.Service<typeof WORMAuditTrailService>, AuditError> =>
  Effect.gen(function* () {
    return yield* WORMAuditTrailService;
  }).pipe(Effect.provide(makeWORMAuditTrailLayer(config)));

/**
 * Thin host SDK façade for non-Effect callers (LangChain / scripts).
 * Domain logic lives in {@link WORMAuditTrailService}; methods are one-line `runPromise`.
 */
export class WORMAuditTrail {
  private constructor(
    private readonly service: Context.Tag.Service<typeof WORMAuditTrailService>
  ) {}

  /** Prefer Effect Layers in ClawQL; this factory is the npm-host boundary. */
  static create(config: WORMAuditTrailConfig): Promise<WORMAuditTrail> {
    return Effect.runPromise(
      createWORMAuditTrailEffect(config).pipe(
        Effect.map((service) => new WORMAuditTrail(service))
      )
    );
  }

  append(entry: WORMAppendInput): Promise<WORMEntry> {
    return Effect.runPromise(this.service.append(entry));
  }

  query(filter: WORMFilter): Promise<WORMEntry[]> {
    return Effect.runPromise(this.service.query(filter));
  }

  verify(entries?: readonly WORMEntry[]): Promise<ChainVerifyResult> {
    return Effect.runPromise(this.service.verify(entries));
  }

  export(filter: WORMFilter, format: ExportFormat): Promise<ExportResult> {
    return Effect.runPromise(this.service.exportEntries(filter, format));
  }

  buildMerkleRoot(entries: readonly WORMEntry[]): Promise<MerkleRoot> {
    return Effect.runPromise(this.service.merkle.buildRoot(entries));
  }

  proveInclusion(
    entry: WORMEntry,
    batch: readonly WORMEntry[]
  ): Promise<MerkleInclusionProof> {
    return Effect.runPromise(this.service.merkle.prove(entry, batch));
  }

  verifyInclusion(proof: MerkleInclusionProof): Promise<boolean> {
    return Effect.runPromise(this.service.merkle.verify(proof));
  }

  drainOutbox(): Promise<void> {
    return Effect.runPromise(this.service.drainOutbox());
  }
}
