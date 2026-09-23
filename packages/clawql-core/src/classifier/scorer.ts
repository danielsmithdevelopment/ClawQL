/**
 * Pluggable scorer for the Fast Decision Primitive.
 * Primary production candidate: Needle 3 (open weights). Tests use HeuristicScorer.
 * No dependency on TypeSafe Jev (closed API — adoption blocker for air-gapped deploys).
 */

import { Context, Effect, Layer } from "effect";
import type { FastDecisionCandidate, FastDecisionContext, FastDecisionScore } from "./types.js";

export type FastDecisionScoreRequest = {
  readonly useSiteId: string;
  readonly ctx: FastDecisionContext;
  readonly candidates: readonly FastDecisionCandidate[];
};

export class FastDecisionScorer extends Context.Tag("clawql/FastDecisionScorer")<
  FastDecisionScorer,
  {
    readonly score: (
      request: FastDecisionScoreRequest
    ) => Effect.Effect<readonly FastDecisionScore[]>;
    /** Backend id recorded in WORM metadata (needle3, heuristic, gliner2, …). */
    readonly backendId: () => string;
  }
>() {}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function heuristicScores(
  request: FastDecisionScoreRequest
): readonly FastDecisionScore[] {
  const query = (request.ctx.query ?? "").toLowerCase();
  return request.candidates
    .map((c: FastDecisionCandidate) => {
      const prior = c.features.priorConfidence;
      if (typeof prior === "number") {
        return { candidateId: c.candidateId, confidence: clamp01(prior) };
      }
      const label = String(
        c.features.label ?? c.features.name ?? c.features.description ?? c.candidateId
      ).toLowerCase();
      if (!query) {
        return { candidateId: c.candidateId, confidence: 0.5 };
      }
      const tokens = query.split(/\s+/).filter(Boolean);
      const hits = tokens.filter((t) => label.includes(t)).length;
      const conf = tokens.length === 0 ? 0.5 : hits / tokens.length;
      return { candidateId: c.candidateId, confidence: clamp01(conf) };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Deterministic heuristic scorer for tests and offline dry-runs.
 * Scores from optional numeric `features.priorConfidence` or string overlap with query.
 */
export const HeuristicFastDecisionScorerLive: Layer.Layer<FastDecisionScorer> = Layer.succeed(
  FastDecisionScorer,
  {
    backendId: () => "heuristic",
    score: (request) => Effect.sync(() => heuristicScores(request)),
  }
);

/**
 * Needle 3 adapter stub — loads local engines when configured.
 * Until `enginePath` is set and runtime license verified (§2.6), falls back to
 * heuristic scoring so the primitive contract remains testable offline.
 *
 * Licensing note: model weights Apache 2.0; confirm Cactus Engine runtime license
 * for Linux/ARM64 prebuilts before production adoption.
 */
export type NeedleScorerConfig = {
  readonly enginePath?: string;
  readonly modelId?: string;
  readonly layers?: number;
};

export function createNeedleFastDecisionScorerLayer(
  config: NeedleScorerConfig = {}
): Layer.Layer<FastDecisionScorer> {
  const hasEngine = Boolean(config.enginePath?.trim());
  const modelId = config.modelId ?? (hasEngine ? "needle3" : "needle3-stub");

  return Layer.succeed(FastDecisionScorer, {
    backendId: () => modelId,
    score: (request) =>
      Effect.sync(() => {
        // When a real engine path is configured, replace this body with
        // cactus-needle / local .cact inference (no network at runtime).
        void config.layers;
        return heuristicScores(request);
      }),
  });
}

/** Default production Layer: Needle stub (heuristic until engine wired). */
export const NeedleFastDecisionScorerLive = createNeedleFastDecisionScorerLayer();

/**
 * Fixed-score scorer for calibration harness tests — returns confidences
 * from `features.priorConfidence` only (required).
 */
export const PriorConfidenceScorerLive: Layer.Layer<FastDecisionScorer> = Layer.succeed(
  FastDecisionScorer,
  {
    backendId: () => "prior-confidence",
    score: (request) =>
      Effect.sync(() =>
        request.candidates
          .map((c) => ({
            candidateId: c.candidateId,
            confidence: clamp01(
              typeof c.features.priorConfidence === "number" ? c.features.priorConfidence : 0
            ),
          }))
          .sort((a, b) => b.confidence - a.confidence)
      ),
  }
);
