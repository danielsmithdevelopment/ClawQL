/**
 * Pluggable scorer for the Fast Decision Primitive.
 *
 * Primary production backend: **GLiNER2 / GLiNER2.5** (Apache 2.0, mature IE +
 * classification family — NAACL 2024 / EMNLP 2025). Optional secondary: Needle 3
 * stub. Tests use HeuristicScorer. No TypeSafe Jev (closed API).
 */

import { Context, Effect, Layer } from "effect";
import {
  DEFAULT_GLINER_MODEL_ID,
  type GlinerScorerConfig,
  readGlinerScorerConfigFromEnv,
} from "./gliner-config.js";
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
    /** Backend id recorded in WORM metadata (gliner2, needle3-stub, heuristic, …). */
    readonly backendId: () => string;
  }
>() {}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function heuristicScores(request: FastDecisionScoreRequest): readonly FastDecisionScore[] {
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

/** ClawQL-owned sidecar request shape (Python gliner2 / Pioneer / custom). */
export type GlinerClassifyRequestBody = {
  readonly useSiteId: string;
  readonly text: string;
  readonly labels: readonly { readonly id: string; readonly description: string }[];
  readonly model: string;
};

export type GlinerClassifyResponseBody = {
  readonly scores: readonly { readonly id: string; readonly confidence: number }[];
};

function candidateDescription(c: FastDecisionCandidate): string {
  return String(c.features.description ?? c.features.label ?? c.features.name ?? c.candidateId);
}

function requestText(ctx: FastDecisionContext): string {
  if (typeof ctx.query === "string" && ctx.query.trim()) return ctx.query;
  if (ctx.extras && typeof ctx.extras.text === "string") return ctx.extras.text;
  return JSON.stringify(ctx.extras ?? {});
}

/**
 * Live HTTP call to a GLiNER sidecar. Effect-primary; host may wrap with runPromise.
 * Returns scores plus whether the sidecar actually answered (vs heuristic fallback).
 */
export type GlinerHttpScoreResult = {
  readonly scores: readonly FastDecisionScore[];
  readonly source: "live" | "fallback-heuristic" | "no-endpoint";
};

export function scoreViaGlinerHttp(
  config: GlinerScorerConfig,
  request: FastDecisionScoreRequest,
  fetchImpl: typeof fetch = fetch
): Effect.Effect<GlinerHttpScoreResult> {
  const base = config.endpointUrl?.replace(/\/$/, "");
  if (!base) {
    return Effect.sync(() => ({
      scores: heuristicScores(request),
      source: "no-endpoint" as const,
    }));
  }

  const body: GlinerClassifyRequestBody = {
    useSiteId: request.useSiteId,
    text: requestText(request.ctx),
    labels: request.candidates.map((c) => ({
      id: c.candidateId,
      description: candidateDescription(c),
    })),
    model: config.modelId,
  };

  return Effect.gen(function* () {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const res = yield* Effect.tryPromise({
        try: () =>
          fetchImpl(`${base}/v1/fast-decision/classify`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(config.apiToken ? { authorization: `Bearer ${config.apiToken}` } : {}),
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          }),
        catch: (e) => e,
      });
      if (!res.ok) {
        return {
          scores: heuristicScores(request),
          source: "fallback-heuristic" as const,
        };
      }
      const parsed = (yield* Effect.tryPromise({
        try: () => res.json() as Promise<GlinerClassifyResponseBody>,
        catch: (e) => e,
      })) as GlinerClassifyResponseBody;
      const byId = new Map((parsed.scores ?? []).map((s) => [s.id, clamp01(Number(s.confidence))]));
      return {
        scores: request.candidates
          .map((c) => ({
            candidateId: c.candidateId,
            confidence: byId.get(c.candidateId) ?? 0,
          }))
          .sort((a, b) => b.confidence - a.confidence),
        source: "live" as const,
      };
    } finally {
      clearTimeout(timer);
    }
  }).pipe(
    Effect.catchAll(() =>
      Effect.sync(() => ({
        scores: heuristicScores(request),
        source: "fallback-heuristic" as const,
      }))
    )
  );
}

export type GlinerScorerLayerOptions = {
  readonly config?: GlinerScorerConfig;
  /** Injected fetch for tests. */
  readonly fetchImpl?: typeof fetch;
};

/**
 * GLiNER2 Fast Decision scorer — **primary** production Layer.
 *
 * - No `CLAWQL_FAST_DECISION_GLINER_URL` → `backendId: gliner2-stub`
 * - URL set + live HTTP success → `backendId: gliner2`
 * - URL set + HTTP/parse failure → `backendId: gliner2-http-fallback-heuristic`
 *   (never claim live GLiNER when the sidecar did not answer)
 */
export function createGlinerFastDecisionScorerLayer(
  options: GlinerScorerLayerOptions = {}
): Layer.Layer<FastDecisionScorer> {
  const config = options.config ?? readGlinerScorerConfigFromEnv();
  const liveConfigured = Boolean(config.endpointUrl?.trim());
  const fetchImpl = options.fetchImpl ?? fetch;
  let lastBackendId = liveConfigured ? "gliner2" : "gliner2-stub";

  return Layer.succeed(FastDecisionScorer, {
    backendId: () => lastBackendId,
    score: (request) => {
      if (!liveConfigured) {
        lastBackendId = "gliner2-stub";
        return Effect.sync(() => heuristicScores(request));
      }
      return scoreViaGlinerHttp(config, request, fetchImpl).pipe(
        Effect.map((result) => {
          lastBackendId = result.source === "live" ? "gliner2" : "gliner2-http-fallback-heuristic";
          return result.scores;
        })
      );
    },
  });
}

/** Default production Layer: GLiNER2 (stub until sidecar URL configured). */
export const GlinerFastDecisionScorerLive = createGlinerFastDecisionScorerLayer();

/**
 * Needle 3 adapter — **secondary / optional** (edge / tiny deployments).
 * Not the default primary; kept for operators who prefer cactus-needle.
 */
export type NeedleScorerConfig = {
  readonly enginePath?: string;
  readonly modelId?: string;
  readonly layers?: number;
};

export function createNeedleFastDecisionScorerLayer(
  config: NeedleScorerConfig = {}
): Layer.Layer<FastDecisionScorer> {
  const wired = false;
  const modelId =
    config.modelId ?? (wired && config.enginePath?.trim() ? "needle3" : "needle3-stub");

  return Layer.succeed(FastDecisionScorer, {
    backendId: () => modelId,
    score: (request) =>
      Effect.sync(() => {
        void config.enginePath;
        void config.layers;
        return heuristicScores(request);
      }),
  });
}

/** Optional Needle stub Layer (not the default production stack). */
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

export { DEFAULT_GLINER_MODEL_ID };
