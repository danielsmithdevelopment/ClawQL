/**
 * SGDOP peer-recruitment pre-filter (§8) — bloom-filter asymmetric error.
 * Never makes the final recruitment decision; only gates exact projection.
 */

import { Effect } from "effect";
import { WormAuditSink, type WormAuditEvent } from "../plugin/provider-types.js";
import { runFastDecision } from "./run.js";
import type { FastDecisionContext, SgdopProjectionBucket } from "./types.js";

export type SgdopPeerCandidate = {
  readonly peerId: string;
  /** Optional coarse prior from historical projections. */
  readonly priorBucket?: SgdopProjectionBucket;
  readonly priorConfidence?: number;
  readonly features?: Record<string, unknown>;
};

export type SgdopPrefilterResult = {
  readonly includedPeerIds: readonly string[];
  readonly excludedPeerIds: readonly string[];
  readonly thresholdApplied: number;
  /** Always false — exact SGDOP must still run on `includedPeerIds`. */
  readonly isFinalRecruitmentDecision: false;
};

const BUCKET_PRIOR: Record<SgdopProjectionBucket, number> = {
  high: 0.85,
  medium: 0.55,
  low: 0.25,
};

/**
 * Compose: NSV tripped → this prefilter → exact SGDOP on reduced set → recruit.
 */
export function applySgdopPeerPrefilter(
  ctx: FastDecisionContext,
  peers: readonly SgdopPeerCandidate[]
): Effect.Effect<
  SgdopPrefilterResult,
  never,
  | import("./registry.js").FastDecisionRegistry
  | import("./scorer.js").FastDecisionScorer
  | import("./threshold-policy.js").FastDecisionThresholdPolicyService
  | WormAuditSink
> {
  return Effect.gen(function* () {
    const worm = yield* WormAuditSink;
    const enrichedCtx: FastDecisionContext = {
      ...ctx,
      extras: {
        ...ctx.extras,
        peerCandidates: peers.map((p) => ({
          candidateId: p.peerId,
          features: {
            ...p.features,
            label: p.peerId,
            priorConfidence:
              p.priorConfidence ??
              (p.priorBucket !== undefined ? BUCKET_PRIOR[p.priorBucket] : 0.5),
            projectionBucket: p.priorBucket ?? "medium",
          },
        })),
      },
    };

    const decision = yield* runFastDecision("sgdop_peer_prefilter", enrichedCtx).pipe(
      Effect.catchTag("FastDecisionUseSiteNotFoundError", () =>
        Effect.succeed({
          useSiteId: "sgdop_peer_prefilter",
          candidatesScored: peers.length,
          scores: peers.map((p) => ({
            candidateId: p.peerId,
            confidence:
              p.priorConfidence ??
              (p.priorBucket !== undefined ? BUCKET_PRIOR[p.priorBucket] : 0.5),
          })),
          thresholdApplied: 0.35,
          costlyErrorDirection: "false_negative" as const,
          outcome: "above_threshold" as const,
        })
      )
    );

    // Permissive bloom-filter: include every peer whose score ≥ threshold
    // (not only the top candidate). False negatives are the costly error.
    const threshold = decision.thresholdApplied;
    const included: string[] = [];
    const excluded: string[] = [];
    for (const s of decision.scores) {
      if (s.confidence >= threshold) included.push(s.candidateId);
      else excluded.push(s.candidateId);
    }

    // If scorer returned nothing but peers exist, include all (fail-open for FN bias).
    if (decision.scores.length === 0 && peers.length > 0) {
      for (const p of peers) included.push(p.peerId);
    }

    yield* worm.append({
      type: "SGDOP_PREFILTER_APPLIED",
      useSiteId: "sgdop_peer_prefilter",
      sessionId: ctx.sessionId,
      agentId: ctx.agentId,
      candidatesScored: peers.length,
      includedCount: included.length,
      excludedCount: excluded.length,
      thresholdApplied: threshold,
      timestamp: new Date().toISOString(),
    } as WormAuditEvent);

    for (const peerId of included) {
      yield* worm.append({
        type: "SGDOP_CANDIDATE_INCLUDED",
        useSiteId: "sgdop_peer_prefilter",
        sessionId: ctx.sessionId,
        peerId,
        timestamp: new Date().toISOString(),
      } as WormAuditEvent);
    }

    return {
      includedPeerIds: included,
      excludedPeerIds: excluded,
      thresholdApplied: threshold,
      isFinalRecruitmentDecision: false,
    } satisfies SgdopPrefilterResult;
  });
}
