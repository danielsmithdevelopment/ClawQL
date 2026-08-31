import { Context, Effect, Layer } from "effect";
import type { ChainVerifyResult, WORMEntry } from "./entry.js";
import { WORM_GENESIS_PREV_HASH } from "./entry.js";
import { AuditError } from "./errors.js";
import { recomputeEntryHash } from "./seal.js";
import type { LocalStorageBackend } from "./storage/types.js";

export class HashChain extends Context.Tag("clawql-audit/HashChain")<
  HashChain,
  {
    readonly loadTip: (local: LocalStorageBackend) => Effect.Effect<void, AuditError>;
    readonly latest: () => Effect.Effect<WORMEntry | null>;
    readonly update: (entry: WORMEntry) => Effect.Effect<void, AuditError>;
    readonly verify: (entries: readonly WORMEntry[]) => Effect.Effect<ChainVerifyResult>;
  }
>() {}

export const HashChainLive = Layer.sync(HashChain, () => {
  let latest_: WORMEntry | null = null;

  return HashChain.of({
    loadTip: (local) =>
      Effect.gen(function* () {
        latest_ = yield* local.latestEntry();
      }),
    latest: () => Effect.succeed(latest_),
    update: (entry) =>
      Effect.gen(function* () {
        if (latest_ && entry.chainIndex !== latest_.chainIndex + 1) {
          return yield* Effect.fail(
            new AuditError({
              reason: `Chain gap: expected ${latest_.chainIndex + 1}, got ${entry.chainIndex}`,
            })
          );
        }
        latest_ = entry;
      }),
    verify: (entries) =>
      Effect.gen(function* () {
        const sorted = [...entries].sort((a, b) => a.chainIndex - b.chainIndex);
        for (let i = 0; i < sorted.length; i++) {
          const entry = sorted[i]!;
          if (i === 0) {
            if (entry.prevHash !== WORM_GENESIS_PREV_HASH && entry.chainIndex !== 0) {
              // First in a partial slice may not be genesis — only enforce when chainIndex===0
            }
            if (entry.chainIndex === 0 && entry.prevHash !== WORM_GENESIS_PREV_HASH) {
              return {
                valid: false,
                invalidAt: entry.chainIndex,
                reason: `Genesis prevHash mismatch at index 0`,
              };
            }
          } else {
            const prev = sorted[i - 1]!;
            if (entry.chainIndex !== prev.chainIndex + 1) {
              return {
                valid: false,
                invalidAt: entry.chainIndex,
                reason: `Gap in chain: expected ${prev.chainIndex + 1}, found ${entry.chainIndex}`,
              };
            }
            if (entry.prevHash !== prev.hash) {
              return {
                valid: false,
                invalidAt: entry.chainIndex,
                reason: `prevHash mismatch at index ${entry.chainIndex}`,
              };
            }
          }
          const recomputed = yield* recomputeEntryHash(entry);
          if (recomputed !== entry.hash) {
            return {
              valid: false,
              invalidAt: entry.chainIndex,
              reason: `Hash mismatch at index ${entry.chainIndex}: stored ${entry.hash}, computed ${recomputed}`,
            };
          }
        }
        return { valid: true };
      }),
  });
});
