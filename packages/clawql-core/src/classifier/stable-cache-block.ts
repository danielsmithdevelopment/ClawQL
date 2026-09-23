/**
 * Append-only stable cache block (§6.6) — sits structurally before volatile history.
 * Compaction must never edit or prune this block; writes are append-only (no in-place mutate).
 */

import { Context, Effect, Layer, Ref } from "effect";

export type StableCacheItem = {
  readonly id: string;
  readonly writtenAt: string;
  readonly fact: string;
  /** Agent-authored CoT justification (§6.5 partial mitigation for opaque reasoning). */
  readonly justification?: string;
  readonly sourceEntryId?: string;
  readonly metadata?: Record<string, unknown>;
};

export type StableCacheAppendResult =
  | { readonly ok: true; readonly item: StableCacheItem }
  | { readonly ok: false; readonly error: string };

export class StableCacheBlockService extends Context.Tag("clawql/StableCacheBlockService")<
  StableCacheBlockService,
  {
    /** Append only — never overwrite an existing id. */
    readonly append: (
      item: Omit<StableCacheItem, "writtenAt"> & { readonly writtenAt?: string }
    ) => Effect.Effect<StableCacheAppendResult>;
    readonly list: () => Effect.Effect<readonly StableCacheItem[]>;
    readonly get: (id: string) => Effect.Effect<StableCacheItem | undefined>;
    /** Stable block is never pruned by compaction. */
    readonly isEligibleForCompactionPrune: () => false;
  }
>() {}

export const InMemoryStableCacheBlockLive: Layer.Layer<StableCacheBlockService> = Layer.effect(
  StableCacheBlockService,
  Effect.gen(function* () {
    const ref = yield* Ref.make<StableCacheItem[]>([]);
    return {
      append: (input) =>
        Effect.gen(function* () {
          const items = yield* Ref.get(ref);
          if (items.some((i) => i.id === input.id)) {
            return {
              ok: false as const,
              error: `stable cache id already exists (append-only): ${input.id}`,
            };
          }
          const item: StableCacheItem = {
            id: input.id,
            fact: input.fact,
            writtenAt: input.writtenAt ?? new Date().toISOString(),
            ...(input.justification !== undefined ? { justification: input.justification } : {}),
            ...(input.sourceEntryId !== undefined ? { sourceEntryId: input.sourceEntryId } : {}),
            ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
          };
          yield* Ref.update(ref, (xs) => [...xs, item]);
          return { ok: true as const, item };
        }),
      list: () => Ref.get(ref),
      get: (id) =>
        Effect.gen(function* () {
          const items = yield* Ref.get(ref);
          return items.find((i) => i.id === id);
        }),
      isEligibleForCompactionPrune: () => false as const,
    };
  })
);
