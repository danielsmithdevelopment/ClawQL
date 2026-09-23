/**
 * Bucket 3 — gated skills with PROMOTION_ACCEPTED (Unified Capability Lifecycle v0.2).
 * Promotion can only narrow or leave unchanged what a skill may do — never widen S.
 */

import { Context, Effect, Layer, Ref } from "effect";
import { Data } from "effect";
import { WormAuditSink, type WormAuditEvent } from "../plugin/provider-types.js";
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
     * Record PROMOTION_ACCEPTED. validatedScope must already be ⊆ the session's S
     * at acceptance time; this store does not grant scope beyond S.
     */
    readonly accept: (
      record: PromotedSkillRecord,
      sessionId: string
    ) => Effect.Effect<PromotedSkillRecord, PromotionStoreError, WormAuditSink>;
    readonly revoke: (
      skillId: string,
      sessionId: string
    ) => Effect.Effect<boolean, never, WormAuditSink>;
  }
>() {}

export const InMemoryPromotionStoreLive: Layer.Layer<PromotionStore> = Layer.effect(
  PromotionStore,
  Effect.gen(function* () {
    const ref = yield* Ref.make(new Map<string, PromotedSkillRecord>());
    return {
      get: (skillId) =>
        Effect.gen(function* () {
          const m = yield* Ref.get(ref);
          return m.get(skillId);
        }),
      list: () =>
        Effect.gen(function* () {
          const m = yield* Ref.get(ref);
          return [...m.values()];
        }),
      accept: (record, sessionId) =>
        Effect.gen(function* () {
          if (record.validatedScope.length === 0) {
            return yield* Effect.fail(
              new PromotionStoreError({ reason: "validatedScope must be non-empty" })
            );
          }
          yield* Ref.update(ref, (m) => {
            const next = new Map(m);
            next.set(record.skillId, record);
            return next;
          });
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
          const m = yield* Ref.get(ref);
          if (!m.has(skillId)) return false;
          yield* Ref.update(ref, (cur) => {
            const next = new Map(cur);
            next.delete(skillId);
            return next;
          });
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
  })
);

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
