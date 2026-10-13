/**
 * Measure-only FastDecisionScorer backed by self-hosted Convai Laya.
 * backendId is never `gliner-decide` — cannot light held-out productionTrusted.
 *
 * Transport: CLAWQL_LAYA_SYSTEMONE_URL → POST /v1/systemone (CPU-friendly).
 */

import { Effect, Layer } from "effect";
import { FastDecisionScorer, type FastDecisionScoreRequest } from "clawql-core/classifier";
import type { FastDecisionScore } from "clawql-core/classifier";
import { callRemoteLayaEffect, LAYA_BACKEND_ID, type CallLayaOptions } from "./remote-laya.js";
import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";

export type LayaScorerCall = (
  body: OpenAiDecisionCreateRequest,
  options?: CallLayaOptions
) => Effect.Effect<OpenAiDecisionCreateResponse, Error>;

export type LayaFastDecisionScorerLayerOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly systemOneUrl?: string;
  readonly apiToken?: string;
  readonly model?: string;
  readonly callLaya?: LayaScorerCall;
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

function scoresFromChoice(
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

export function createLayaFastDecisionScorerLayer(
  options: LayaFastDecisionScorerLayerOptions = {}
): Layer.Layer<FastDecisionScorer> {
  const env = options.env ?? process.env;
  const call: LayaScorerCall = options.callLaya ?? callRemoteLayaEffect;

  return Layer.succeed(FastDecisionScorer, {
    backendId: () => LAYA_BACKEND_ID,
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
          model: options.model?.trim() || env.CLAWQL_LAYA_MODEL?.trim() || "english",
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
          systemOneUrl: options.systemOneUrl,
          apiToken: options.apiToken,
          model: options.model,
        });
        const answer = remote.answers.find((a) => a.name === "route" && a.type === "choice");
        if (!answer || answer.type !== "choice") {
          return zeroScores(request);
        }
        return scoresFromChoice(request, answer.choice, answer.probabilities);
      }).pipe(
        Effect.catch((err): Effect.Effect<readonly FastDecisionScore[]> => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[laya-scorer] ${request.useSiteId}: ${msg}`);
          return Effect.succeed(zeroScores(request));
        })
      ),
  });
}
