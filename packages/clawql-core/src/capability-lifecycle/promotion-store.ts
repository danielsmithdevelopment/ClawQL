/**
 * Bucket 3 — gated skills with PROMOTION_ACCEPTED (Unified Capability Lifecycle v0.2).
 * Promotion can only narrow or leave unchanged what a skill may do — never widen S.
 * Accept-time check: validatedScope ⊆ session catalog ATR (fail closed if no catalog).
 */

import { Context, Effect, Layer } from "effect";
import { Data } from "effect";
import { WormAuditSink, type WormAuditEvent } from "../plugin/provider-types.js";
import { SessionCatalogService } from "./session-catalog.js";
import type { PromotedSkillRecord } from "./types.js";

export class PromotionStoreError extends Data.TaggedError("PromotionStoreError")<{
  readonly reason: string;
}> {}

export class PromotionStore extends Context.Tag("clawql/PromotionStore")<
  PromotionStore,
  {
    readonly get: (skillId: string) => Effect.Effect<PromotedSkillRecord | undefined>;
    readonly list: () => Effect.Effect<readonly PromotedSkillRecord[]>;
    /**
     * Record PROMOTION_ACCEPTED. validatedScope must be ⊆ the session's S at
     * acceptance time — this store refuses records that would widen S.
     */
    readonly accept: (
      record: PromotedSkillRecord,
      sessionId: string
    ) => Effect.Effect<
      PromotedSkillRecord,
      PromotionStoreError,
      WormAuditSink | SessionCatalogService
    >;
    readonly revoke: (
      skillId: string,
      sessionId: string
    ) => Effect.Effect<boolean, never, WormAuditSink>;
  }
>() {}

/** True iff every token in validatedScope is in session ATR S. */
export function validatedScopeSubsetOfS(
  validatedScope: readonly string[],
  atrScope: ReadonlySet<string>
): boolean {
  for (const t of validatedScope) {
    if (!atrScope.has(t)) return false;
  }
  return true;
}

export function makeInMemoryPromotionStore(): Context.Tag.Service<typeof PromotionStore> {
  const map = new Map<string, PromotedSkillRecord>();
  return {
    get: (skillId) => Effect.sync(() => map.get(skillId)),
    list: () => Effect.sync(() => [...map.values()]),
    accept: (record, sessionId) =>
      Effect.gen(function* () {
        if (record.validatedScope.length === 0) {
          return yield* Effect.fail(
            new PromotionStoreError({ reason: "validatedScope must be non-empty" })
          );
        }
        const catalogs = yield* SessionCatalogService;
        const catalog = yield* catalogs.get(sessionId);
        if (!catalog) {
          return yield* Effect.fail(
            new PromotionStoreError({
              reason: `no session catalog for ${sessionId} — cannot accept promotion without ⊆ S check`,
            })
          );
        }
        if (!validatedScopeSubsetOfS(record.validatedScope, catalog.atrScope)) {
          return yield* Effect.fail(
            new PromotionStoreError({
              reason: "validatedScope is not ⊆ session ATR S — promotion cannot widen S",
            })
          );
        }
        map.set(record.skillId, record);
        const worm = yield* WormAuditSink;
        yield* worm.append({
          type: "PROMOTION_ACCEPTED",
          sessionId,
          skillId: record.skillId,
          validatedScope: record.validatedScope,
          wormRef: record.wormRef,
          timestamp: new Date().toISOString(),
        } as WormAuditEvent);
        return record;
      }),
    revoke: (skillId, sessionId) =>
      Effect.gen(function* () {
        if (!map.has(skillId)) return false;
        map.delete(skillId);
        const worm = yield* WormAuditSink;
        yield* worm.append({
          type: "PROMOTION_REJECTED",
          sessionId,
          skillId,
          timestamp: new Date().toISOString(),
        } as WormAuditEvent);
        return true;
      }),
  };
}

/** Fresh store per Layer build (tests). Prefer Layer.succeed(make…) for process singletons. */
export const InMemoryPromotionStoreLive: Layer.Layer<PromotionStore> = Layer.sync(
  PromotionStore,
  makeInMemoryPromotionStore
);
