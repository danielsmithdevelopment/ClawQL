import { Context, Effect, Layer } from "effect";
import { HashChain, HashChainLive } from "./chain.js";
import type { ChainVerifyResult, WORMAppendInput, WORMEntry, WORMFilter } from "./entry.js";
import { AuditError } from "./errors.js";
import { startAuditHttpServer, type AuditHttpServerHandle } from "./http/server.js";
import { MerkleBatchLayer, type MerkleInclusionProof, type MerkleRoot } from "./merkle.js";
import {
  exportEntries,
  type ExportFormat,
  type ExportOptions,
  type ExportResult,
} from "./query/export.js";
import { DualAckReplicator } from "./replication/dual-ack.js";
import { startOutboxReconciler, type ReconcilerHandle } from "./replication/reconciler.js";
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
  /** Optional HTTP server port (ApiKey auth required). */
  httpPort?: number;
  /** API key for HTTP; defaults to CLAWQL_AUDIT_API_KEY. */
  apiKey?: string;
  /** Background outbox drain interval (ms). Default 2000; 0 disables. */
  reconcileIntervalMs?: number;
  /** Seal + store a Merkle root every N appends (default 100). 0 disables. */
  merkleBatchSize?: number;
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
      format: ExportFormat,
      options?: ExportOptions
    ) => Effect.Effect<ExportResult, AuditError>;
    readonly merkle: MerkleBatchLayer;
    readonly sealMerkleBatch: (
      entries?: readonly WORMEntry[]
    ) => Effect.Effect<MerkleRoot, AuditError>;
    readonly listMerkleRoots: () => Effect.Effect<MerkleRoot[], AuditError>;
    readonly drainOutbox: () => Effect.Effect<void, AuditError>;
    readonly stop: () => Effect.Effect<void, AuditError>;
  }
>() {}

function retryFromConfig(config: WORMAuditTrailConfig): RetryConfig {
  return {
    maxAttempts: config.retryMaxAttempts ?? defaultRetryConfig.maxAttempts,
    backoffMs: config.retryBackoffMs ?? defaultRetryConfig.backoffMs,
    backoffMultiplier: config.retryBackoffMultiplier ?? defaultRetryConfig.backoffMultiplier,
  };
}

/**
 * Live Layer for {@link WORMAuditTrailService}.
 * Loads chain tip and drains outbox before serving appends.
 * Call `stop` to tear down HTTP / reconciler (Layer is not scoped — host owns lifetime).
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
      const batchSize = config.merkleBatchSize ?? 100;
      let sinceLastRoot = 0;
      let lastRootToIndex = -1;

      const existingRoots = yield* config.local
        .listMerkleRoots()
        .pipe(Effect.catchAll(() => Effect.succeed([] as MerkleRoot[])));
      if (existingRoots.length) {
        lastRootToIndex = existingRoots[existingRoots.length - 1]!.toChainIndex;
      }

      let reconciler: ReconcilerHandle | undefined;
      const interval = config.reconcileIntervalMs === undefined ? 2000 : config.reconcileIntervalMs;
      if (interval > 0) {
        reconciler = yield* startOutboxReconciler(replicator, interval);
      }

      const sealMerkleBatch = (
        entries?: readonly WORMEntry[]
      ): Effect.Effect<MerkleRoot, AuditError> =>
        Effect.gen(function* () {
          const batch = entries ?? (yield* replicator.all());
          const root = yield* merkle.buildRoot(batch);
          yield* config.local.storeMerkleRoot(root);
          lastRootToIndex = root.toChainIndex;
          sinceLastRoot = 0;
          return root;
        });

      const service: Context.Tag.Service<typeof WORMAuditTrailService> = WORMAuditTrailService.of({
        merkle,
        drainOutbox: () => replicator.drainOutbox(),
        listMerkleRoots: () => config.local.listMerkleRoots(),
        sealMerkleBatch,
        stop: () =>
          Effect.gen(function* () {
            if (reconciler) yield* reconciler.stop();
            if (http) yield* http.close();
          }),
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
            sinceLastRoot += 1;
            if (batchSize > 0 && sinceLastRoot >= batchSize) {
              const from = lastRootToIndex + 1;
              const all = yield* replicator.all();
              const slice = all.filter((e) => e.chainIndex >= from);
              if (slice.length) yield* sealMerkleBatch(slice);
            }
            return final;
          }),
        query: (filter) => replicator.query(filter),
        verify: (entries) =>
          Effect.gen(function* () {
            const toVerify = entries ?? (yield* replicator.all());
            return yield* chain.verify(toVerify);
          }),
        exportEntries: (filter, format, options) =>
          Effect.gen(function* () {
            const rows = yield* replicator.query(filter);
            return yield* exportEntries(rows, format, options);
          }),
      });

      let http: AuditHttpServerHandle | undefined;
      if (config.httpPort !== undefined) {
        const apiKey = config.apiKey?.trim() || process.env.CLAWQL_AUDIT_API_KEY?.trim();
        if (!apiKey) {
          return yield* Effect.fail(
            new AuditError({
              reason:
                "httpPort set but apiKey / CLAWQL_AUDIT_API_KEY missing — refusing unauthenticated HTTP",
            })
          );
        }
        http = yield* startAuditHttpServer(service, {
          port: config.httpPort,
          apiKey,
        });
      }

      return service;
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
 * Call {@link stop} to tear down HTTP / reconciler.
 */
export class WORMAuditTrail {
  private constructor(
    private readonly service: Context.Tag.Service<typeof WORMAuditTrailService>
  ) {}

  /** Prefer Effect Layers in ClawQL; this factory is the npm-host boundary. */
  static create(config: WORMAuditTrailConfig): Promise<WORMAuditTrail> {
    return Effect.runPromise(
      createWORMAuditTrailEffect(config).pipe(Effect.map((service) => new WORMAuditTrail(service)))
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

  export(filter: WORMFilter, format: ExportFormat, options?: ExportOptions): Promise<ExportResult> {
    return Effect.runPromise(this.service.exportEntries(filter, format, options));
  }

  buildMerkleRoot(entries: readonly WORMEntry[]): Promise<MerkleRoot> {
    return Effect.runPromise(this.service.merkle.buildRoot(entries));
  }

  sealMerkleBatch(entries?: readonly WORMEntry[]): Promise<MerkleRoot> {
    return Effect.runPromise(this.service.sealMerkleBatch(entries));
  }

  listMerkleRoots(): Promise<MerkleRoot[]> {
    return Effect.runPromise(this.service.listMerkleRoots());
  }

  proveInclusion(entry: WORMEntry, batch: readonly WORMEntry[]): Promise<MerkleInclusionProof> {
    return Effect.runPromise(this.service.merkle.prove(entry, batch));
  }

  verifyInclusion(proof: MerkleInclusionProof): Promise<boolean> {
    return Effect.runPromise(this.service.merkle.verify(proof));
  }

  drainOutbox(): Promise<void> {
    return Effect.runPromise(this.service.drainOutbox());
  }

  stop(): Promise<void> {
    return Effect.runPromise(this.service.stop());
  }
}
