/**
 * Measure-only FastDecisionScorer backed by Cloudflare Clef / Clef-Flash.
 * backendId is never `gliner2` — cannot light held-out productionTrusted.
 *
 * Official stack path: self-host Apache-2.0 weights (CLAWQL_CLEF_SYSTEMONE_URL).
 * Workers AI is an optional measure fill transport.
 */

import { Effect, Layer } from "effect";
import { FastDecisionScorer, type FastDecisionScoreRequest } from "clawql-core/classifier";
import type { FastDecisionScore } from "clawql-core/classifier";
import {
  callRemoteClefEffect,
  clefBackendId,
  DEFAULT_CLEF_VARIANT,
  resolveClefVariant,
  type CallClefOptions,
  type ClefVariant,
} from "./remote-clef.js";
import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";

export type ClefScorerCall = (
  body: OpenAiDecisionCreateRequest,
  options?: CallClefOptions
) => Effect.Effect<OpenAiDecisionCreateResponse, Error>;

export type ClefFastDecisionScorerLayerOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly apiToken?: string;
  readonly accountId?: string;
  readonly systemOneUrl?: string;
  readonly variant?: ClefVariant;
  /** Injected for tests. */
  readonly callClef?: ClefScorerCall;
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

export function createClefFastDecisionScorerLayer(
  options: ClefFastDecisionScorerLayerOptions = {}
): Layer.Layer<FastDecisionScorer> {
  const env = options.env ?? process.env;
  const variant =
    options.variant ?? resolveClefVariant(env.CLAWQL_CLEF_MODEL?.trim() || DEFAULT_CLEF_VARIANT);
  const backendId = clefBackendId(variant);
  const call: ClefScorerCall = options.callClef ?? callRemoteClefEffect;

  return Layer.succeed(FastDecisionScorer, {
    backendId: () => backendId,
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
          model: variant,
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
          apiToken: options.apiToken,
          accountId: options.accountId,
          systemOneUrl: options.systemOneUrl,
          variant,
        });
        const answer = remote.answers.find((a) => a.name === "route" && a.type === "choice");
        if (!answer || answer.type !== "choice") {
          return zeroScores(request);
        }
        return scoresFromChoice(request, answer.choice, answer.probabilities);
      }).pipe(
        Effect.catch((): Effect.Effect<readonly FastDecisionScore[]> =>
          Effect.succeed(zeroScores(request))
        )
      ),
  });
}
