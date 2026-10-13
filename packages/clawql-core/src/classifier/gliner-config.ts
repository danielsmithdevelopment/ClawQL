/**
 * GLiNER Decide Fast Decision scorer config (Effect-primary).
 * Primary production backend for the Fast Decision Primitive — mature Apache-2.0
 * encoder family (live checkpoint: GLiNER2.5-Decide), not Needle/Laya/Jev.
 *
 * Backend / model family id (WORM + /v1/decisions): `gliner-decide`
 * (HF default `fastino/GLiNER2.5-Decide`).
 */

import { Context, Effect, Layer } from "effect";

export type GlinerScorerConfig = {
  /** Sidecar base URL, e.g. http://gliner:8080 — when set, live HTTP classify is used. */
  readonly endpointUrl?: string;
  /** HF model id served by the sidecar (default: fastino/GLiNER2.5-Decide). */
  readonly modelId: string;
  readonly apiToken?: string;
  readonly timeoutMs: number;
};

/** Live routing path — Decide cutover (v0.6 spend). See DECIDE_V05_SCORE_ONCE_CLOSEOUT.md. */
export const DEFAULT_GLINER_MODEL_ID = "fastino/GLiNER2.5-Decide";

/** Live scorer / model family id for Decide. */
export const GLINER_DECIDE_BACKEND_ID = "gliner-decide";

export const GLINER_DECIDE_STUB_BACKEND_ID = "gliner-decide-stub";
export const GLINER_DECIDE_HTTP_FALLBACK_BACKEND_ID = "gliner-decide-http-fallback-heuristic";

/** True when `backendId` is the live Decide scorer. */
export function isLiveGlinerDecideBackendId(backendId: string): boolean {
  return backendId === GLINER_DECIDE_BACKEND_ID;
}

/** True when a /v1/decisions `model` names the local Decide family. */
export function isGlinerDecideModelId(model: string): boolean {
  const m = model.trim().toLowerCase();
  return (
    m === GLINER_DECIDE_BACKEND_ID || m === "gliner" || m === GLINER_DECIDE_STUB_BACKEND_ID
  );
}

export class GlinerScorerConfigService extends Context.Service<
  GlinerScorerConfigService,
  {
    readonly get: () => Effect.Effect<GlinerScorerConfig>;
  }
>()("clawql/GlinerScorerConfig") {}

/** Read env at call time (tests can mutate process.env). */
export function readGlinerScorerConfigFromEnv(): GlinerScorerConfig {
  const endpointUrl = process.env.CLAWQL_FAST_DECISION_GLINER_URL?.trim() || undefined;
  const modelId = process.env.CLAWQL_FAST_DECISION_GLINER_MODEL?.trim() || DEFAULT_GLINER_MODEL_ID;
  const apiToken = process.env.CLAWQL_FAST_DECISION_GLINER_TOKEN?.trim() || undefined;
  const timeoutRaw = process.env.CLAWQL_FAST_DECISION_GLINER_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : 5_000;
  return {
    endpointUrl,
    modelId,
    apiToken,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5_000,
  };
}

export const GlinerScorerConfigLive: Layer.Layer<GlinerScorerConfigService> = Layer.succeed(
  GlinerScorerConfigService,
  {
    get: () => Effect.sync(readGlinerScorerConfigFromEnv),
  }
);

export function glinerEndpointConfigured(
  config: GlinerScorerConfig = readGlinerScorerConfigFromEnv()
): boolean {
  return Boolean(config.endpointUrl?.trim());
}
