/**
 * Skill fast-path (§4): high-confidence match + live validity check.
 * Validity is never cached — checked on every invocation.
 */

import { Context, Effect, Layer, Ref } from "effect";
import { WormAuditSink, type WormAuditEvent } from "../plugin/provider-types.js";
import { runFastDecision } from "./run.js";
import type {
  FastDecisionContext,
  FastDecisionResult,
  SkillFastPathDecision,
  SkillValidityStatus,
} from "./types.js";

export class SkillValidityStore extends Context.Tag("clawql/SkillValidityStore")<
  SkillValidityStore,
  {
    /** Live status — must be called on every fast-path attempt; never cache externally. */
    readonly getStatus: (skillId: string) => Effect.Effect<SkillValidityStatus | undefined>;
    readonly setStatus: (
      skillId: string,
      status: SkillValidityStatus
    ) => Effect.Effect<void>;
    readonly list: () => Effect.Effect<ReadonlyMap<string, SkillValidityStatus>>;
  }
>() {}

export const InMemorySkillValidityStoreLive: Layer.Layer<SkillValidityStore> = Layer.effect(
  SkillValidityStore,
  Effect.gen(function* () {
    const ref = yield* Ref.make(new Map<string, SkillValidityStatus>());
    return {
      getStatus: (skillId) =>
        Effect.gen(function* () {
          const m = yield* Ref.get(ref);
          return m.get(skillId);
        }),
      setStatus: (skillId, status) =>
        Ref.update(ref, (m) => {
          const next = new Map(m);
          next.set(skillId, status);
          return next;
        }),
      list: () => Ref.get(ref),
    };
  })
);

/**
 * Discovery/execution decision: search routing already happened upstream.
 * Here we decide fast path vs slow path for skill execution.
 */
export function decideSkillFastPath(
  ctx: FastDecisionContext
): Effect.Effect<
  SkillFastPathDecision,
  never,
  import("./registry.js").FastDecisionRegistry |
    import("./scorer.js").FastDecisionScorer |
    import("./threshold-policy.js").FastDecisionThresholdPolicyService |
    SkillValidityStore |
    WormAuditSink
> {
  return Effect.gen(function* () {
    const validity = yield* SkillValidityStore;
    const worm = yield* WormAuditSink;

    const decision: FastDecisionResult = yield* runFastDecision(
      "skill_fast_path_match",
      ctx
    ).pipe(
      Effect.catchTag("FastDecisionUseSiteNotFoundError", () =>
        Effect.succeed({
          useSiteId: "skill_fast_path_match",
          candidatesScored: 0,
          scores: [],
          thresholdApplied: 0.85,
          costlyErrorDirection: "false_positive" as const,
          outcome: "below_threshold_fallback" as const,
        } satisfies FastDecisionResult)
      )
    );

    if (decision.outcome !== "above_threshold" || !decision.selectedCandidateId) {
      const result: SkillFastPathDecision = {
        path: "slow",
        reason: decision.candidatesScored === 0 ? "no_candidates" : "below_threshold",
        skillId: decision.selectedCandidateId,
        confidence: decision.selectedConfidence,
      };
      return result;
    }

    const skillId = decision.selectedCandidateId;
    // Live check — never reuse a prior cached status for this decision.
    const status = yield* validity.getStatus(skillId);

    if (status === undefined) {
      return {
        path: "slow",
        reason: "missing_validity",
        skillId,
        confidence: decision.selectedConfidence,
      } satisfies SkillFastPathDecision;
    }

    if (status === "rejected" || status === "rolled_back") {
      yield* worm.append({
        type: "SKILL_FAST_PATH_REJECTED_STALE_SKILL",
        useSiteId: "skill_fast_path_match",
        sessionId: ctx.sessionId,
        agentId: ctx.agentId,
        skillId,
        validityStatus: status,
        confidence: decision.selectedConfidence ?? 0,
        timestamp: new Date().toISOString(),
      } as WormAuditEvent);

      return {
        path: "slow",
        reason: status === "rejected" ? "rejected" : "stale_or_rolled_back",
        skillId,
        confidence: decision.selectedConfidence,
        validityStatus: status,
      } satisfies SkillFastPathDecision;
    }

    yield* worm.append({
      type: "SKILL_FAST_PATH_EXECUTED",
      useSiteId: "skill_fast_path_match",
      sessionId: ctx.sessionId,
      agentId: ctx.agentId,
      skillId,
      validityStatus: status,
      confidence: decision.selectedConfidence ?? 0,
      timestamp: new Date().toISOString(),
    } as WormAuditEvent);

    return {
      path: "fast",
      skillId,
      confidence: decision.selectedConfidence ?? 0,
      validityStatus: "accepted",
    } satisfies SkillFastPathDecision;
  });
}
