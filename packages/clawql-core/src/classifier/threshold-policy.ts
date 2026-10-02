/**
 * Per-use-site threshold policy (§5 Streams, §9).
 * Same discipline as spend governance: context-specific, never a global default.
 */

import { Context, Effect, Layer, Ref } from "effect";
import type { CostlyErrorDirection } from "./types.js";

export type FastDecisionThresholdPolicy = {
  readonly useSiteId: string;
  readonly threshold: number;
  readonly costlyErrorDirection: CostlyErrorDirection;
  /**
   * When true (Streams event dispatch), below-threshold MUST hard-fallback —
   * no "best guess anyway" (§5).
   */
  readonly hardFallbackRequired: boolean;
  /** Human-readable rationale for operators. */
  readonly rationale: string;
};

export class FastDecisionThresholdPolicyService extends Context.Tag(
  "clawql/FastDecisionThresholdPolicyService"
)<
  FastDecisionThresholdPolicyService,
  {
    readonly get: (useSiteId: string) => Effect.Effect<FastDecisionThresholdPolicy | undefined>;
    readonly set: (policy: FastDecisionThresholdPolicy) => Effect.Effect<void>;
    readonly list: () => Effect.Effect<readonly FastDecisionThresholdPolicy[]>;
    /** Effective threshold: policy override if present, else use-site default. */
    readonly resolve: (
      useSiteId: string,
      useSiteDefault: {
        readonly threshold: number;
        readonly costlyErrorDirection: CostlyErrorDirection;
      }
    ) => Effect.Effect<{
      readonly threshold: number;
      readonly costlyErrorDirection: CostlyErrorDirection;
      readonly hardFallbackRequired: boolean;
    }>;
  }
>() {}

/** §9 illustrative defaults — callers may override per deployment. */
export const DEFAULT_THRESHOLD_POLICIES: readonly FastDecisionThresholdPolicy[] = [
  {
    useSiteId: "skill_fast_path_match",
    threshold: 0.85,
    costlyErrorDirection: "false_positive",
    hardFallbackRequired: false,
    rationale: "False positive executes stale/invalid skill — bias to slow path",
  },
  {
    useSiteId: "streams_event_dispatch",
    threshold: 0.95,
    costlyErrorDirection: "false_positive",
    hardFallbackRequired: true,
    rationale: "Wrong Streams routing may drop events — strictest hard fallback",
  },
  {
    useSiteId: "ontology_vocabulary_term_match",
    threshold: 0.7,
    costlyErrorDirection: "false_positive",
    hardFallbackRequired: false,
    rationale: "Wrong standard term is correctable quality issue",
  },
  {
    useSiteId: "sgdop_peer_prefilter",
    threshold: 0.35,
    costlyErrorDirection: "false_negative",
    hardFallbackRequired: false,
    rationale: "Bloom-filter: false negatives silently degrade blind-spot coverage",
  },
  {
    useSiteId: "pre_compaction_ontology_cache_check",
    threshold: 0.35,
    costlyErrorDirection: "false_negative",
    hardFallbackRequired: false,
    rationale: "Bounded over-cache cost vs unrecoverable state loss",
  },
];

export const InMemoryFastDecisionThresholdPolicyLive: Layer.Layer<FastDecisionThresholdPolicyService> =
  Layer.effect(
    FastDecisionThresholdPolicyService,
    Effect.gen(function* () {
      const seed = new Map(DEFAULT_THRESHOLD_POLICIES.map((p) => [p.useSiteId, p]));
      const ref = yield* Ref.make(seed);
      return {
        get: (useSiteId) =>
          Effect.gen(function* () {
            const m = yield* Ref.get(ref);
            return m.get(useSiteId);
          }),
        set: (policy) =>
          Ref.update(ref, (m) => {
            const next = new Map(m);
            next.set(policy.useSiteId, policy);
            return next;
          }),
        list: () =>
          Effect.gen(function* () {
            const m = yield* Ref.get(ref);
            return [...m.values()];
          }),
        resolve: (useSiteId, useSiteDefault) =>
          Effect.gen(function* () {
            const m = yield* Ref.get(ref);
            const policy = m.get(useSiteId);
            if (!policy) {
              return {
                threshold: useSiteDefault.threshold,
                costlyErrorDirection: useSiteDefault.costlyErrorDirection,
                hardFallbackRequired: false,
              };
            }
            return {
              threshold: policy.threshold,
              costlyErrorDirection: policy.costlyErrorDirection,
              hardFallbackRequired: policy.hardFallbackRequired,
            };
          }),
      };
    })
  );
