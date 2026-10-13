/**
 * Measure-only FastDecisionScorer backed by OpenRouter Microsoft-Decision-1.
 * backendId is never `gliner-decide` — cannot light held-out productionTrusted.
 */

import { Effect, Layer } from "effect";
import { FastDecisionScorer, type FastDecisionScoreRequest } from "clawql-core/classifier";
import type { FastDecisionScore } from "clawql-core/classifier";
import {
  callRemoteOpenRouterDecisionsEffect,
  DEFAULT_OPENROUTER_DECISIONS_MODEL,
  type CallOpenRouterDecisionsOptions,
} from "./remote-openrouter-decisions.js";
import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";

/** Stable scorer id — must remain ≠ PRODUCTION_TRUSTED_SCORER_BACKEND (`gliner-decide`). */
export const OPENROUTER_DECISION1_SCORER_BACKEND_ID =
  "openrouter/microsoft/microsoft-decision-1" as const;

export type OpenRouterDecision1ScorerCall = (
  body: OpenAiDecisionCreateRequest,
  options?: CallOpenRouterDecisionsOptions
) => Effect.Effect<OpenAiDecisionCreateResponse, Error>;

export type OpenRouterDecision1ScorerLayerOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  /** Injected for tests — defaults to callRemoteOpenRouterDecisionsEffect. */
  readonly callOpenRouter?: OpenRouterDecision1ScorerCall;
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function candidateDescription(features: Record<string, unknown>): string {
  const d = features.description ?? features.label ?? features.name;
  return typeof d === "string" && d.trim() ? d.trim() : "";
}

function zeroScores(request: FastDecisionScoreRequest): readonly FastDecisionScore[] {
  return request.candidates.map((c) => ({ candidateId: c.candidateId, confidence: 0 }));
}

function scoresFromOpenRouterChoice(
  request: FastDecisionScoreRequest,
  choice: string | undefined,
  probabilities: readonly { readonly value: string; readonly probability: number }[] | undefined
): readonly FastDecisionScore[] {
  const byId = new Map<string, number>();
  if (probabilities?.length) {
    for (const p of probabilities) {
      if (typeof p.value === "string" && typeof p.probability === "number") {
        byId.set(p.value, clamp01(p.probability));
      }
    }
  }
  if (choice && !byId.has(choice)) {
    byId.set(choice, 1);
  }
  return request.candidates
    .map((c) => ({
      candidateId: c.candidateId,
      confidence: byId.get(c.candidateId) ?? 0,
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

export function createOpenRouterDecision1FastDecisionScorerLayer(
  options: OpenRouterDecision1ScorerLayerOptions = {}
): Layer.Layer<FastDecisionScorer> {
  const env = options.env ?? process.env;
  const model = options.model?.trim() || DEFAULT_OPENROUTER_DECISIONS_MODEL;
  const call: OpenRouterDecision1ScorerCall =
    options.callOpenRouter ?? callRemoteOpenRouterDecisionsEffect;

  return Layer.succeed(FastDecisionScorer, {
    backendId: () => OPENROUTER_DECISION1_SCORER_BACKEND_ID,
    score: (request) =>
      Effect.gen(function* () {
        const query =
          typeof request.ctx.query === "string" && request.ctx.query.trim()
            ? request.ctx.query.trim()
            : "";
        if (!query || request.candidates.length === 0) {
          return zeroScores(request);
        }
        const framing = request.taskFraming?.trim();
        const input = framing ? `${framing}\n\n${query}` : query;
        const body: OpenAiDecisionCreateRequest = {
          model,
          input,
          use_site_id: request.useSiteId,
          allow_uncalibrated: true,
          questions: [
            {
              type: "choice",
              name: "route",
              instructions: "Select the best tool/route for this query.",
              choices: request.candidates.map((c) => ({
                value: c.candidateId,
                description: candidateDescription(c.features) || undefined,
              })),
            },
          ],
        };
        const remote = yield* call(body, {
          env,
          fetchImpl: options.fetchImpl,
          apiKey: options.apiKey,
          baseUrl: options.baseUrl,
        });
        const answer = remote.answers.find((a) => a.name === "route" && a.type === "choice");
        if (!answer || answer.type !== "choice") {
          return zeroScores(request);
        }
        return scoresFromOpenRouterChoice(request, answer.choice, answer.probabilities);
      }).pipe(
        Effect.catch((): Effect.Effect<readonly FastDecisionScore[]> =>
          Effect.succeed(zeroScores(request))
        )
      ),
  });
}
