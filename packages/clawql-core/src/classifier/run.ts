/**
 * runFastDecision — core execution (§3.1) with WORM audit (§10).
 */

import { Data, Effect } from "effect";
import { WormAuditSink, type WormAuditEvent } from "../plugin/provider-types.js";
import { FastDecisionRegistry } from "./registry.js";
import { FastDecisionScorer } from "./scorer.js";
import { FastDecisionThresholdPolicyService } from "./threshold-policy.js";
import type {
  FastDecisionContext,
  FastDecisionResult,
  FastDecisionUseSite,
  FastDecisionWORMEntryType,
} from "./types.js";

export class FastDecisionUseSiteNotFoundError extends Data.TaggedError(
  "FastDecisionUseSiteNotFoundError"
)<{
  readonly useSiteId: string;
}> {}

export type FastDecisionRunError = FastDecisionUseSiteNotFoundError;

function wormPayload(
  type: FastDecisionWORMEntryType,
  result: FastDecisionResult,
  ctx: FastDecisionContext,
  backendId: string,
  extra?: Record<string, unknown>
): WormAuditEvent {
  return {
    type,
    useSiteId: result.useSiteId,
    sessionId: ctx.sessionId,
    agentId: ctx.agentId,
    candidatesScored: result.candidatesScored,
    scores: result.scores,
    thresholdApplied: result.thresholdApplied,
    costlyErrorDirection: result.costlyErrorDirection,
    outcome: result.outcome,
    selectedCandidateId: result.selectedCandidateId,
    selectedConfidence: result.selectedConfidence,
    backendId,
    timestamp: new Date().toISOString(),
    ...extra,
  } as WormAuditEvent;
}

/**
 * Score candidates for a registered use site and apply its threshold policy.
 * Primary gate remains correctness/calibration (§7) before trusting production fire.
 */
export function runFastDecision(
  useSiteId: string,
  ctx: FastDecisionContext
): Effect.Effect<
  FastDecisionResult,
  FastDecisionRunError,
  FastDecisionRegistry | FastDecisionScorer | FastDecisionThresholdPolicyService | WormAuditSink
> {
  return Effect.gen(function* () {
    const registry = yield* FastDecisionRegistry;

    const useSite = yield* registry.get(useSiteId);
    if (!useSite) {
      return yield* Effect.fail(new FastDecisionUseSiteNotFoundError({ useSiteId }));
    }

    return yield* runFastDecisionWithUseSite(useSite, ctx);
  });
}

export function runFastDecisionWithUseSite(
  useSite: FastDecisionUseSite,
  ctx: FastDecisionContext
): Effect.Effect<
  FastDecisionResult,
  never,
  FastDecisionScorer | FastDecisionThresholdPolicyService | WormAuditSink
> {
  return Effect.gen(function* () {
    const scorer = yield* FastDecisionScorer;
    const policySvc = yield* FastDecisionThresholdPolicyService;
    const worm = yield* WormAuditSink;

    const candidates = yield* useSite.candidateSetProvider(ctx);
    const resolved = yield* policySvc.resolve(useSite.useSiteId, {
      threshold: useSite.threshold,
      costlyErrorDirection: useSite.costlyErrorDirection,
    });

    const scores = yield* scorer.score({
      useSiteId: useSite.useSiteId,
      ctx,
      candidates,
    });

    const top = scores[0];
    const passes = top !== undefined && top.confidence >= resolved.threshold;
    // Hard fallback (§5) is already implied: below threshold never selects.

    const outcome = passes ? "above_threshold" : "below_threshold_fallback";

    const result: FastDecisionResult = {
      useSiteId: useSite.useSiteId,
      candidatesScored: candidates.length,
      scores,
      thresholdApplied: resolved.threshold,
      costlyErrorDirection: resolved.costlyErrorDirection,
      outcome,
      ...(passes && top
        ? { selectedCandidateId: top.candidateId, selectedConfidence: top.confidence }
        : {}),
    };

    const backendId = scorer.backendId();

    yield* worm.append(
      wormPayload("FAST_DECISION_ATTEMPTED", result, ctx, backendId, {
        wormEntryType: useSite.wormEntryType,
        hardFallbackRequired: resolved.hardFallbackRequired,
      })
    );

    yield* worm.append(
      wormPayload(
        outcome === "above_threshold"
          ? "FAST_DECISION_ABOVE_THRESHOLD"
          : "FAST_DECISION_BELOW_THRESHOLD_FALLBACK",
        result,
        ctx,
        backendId
      )
    );

    return result;
  });
}
