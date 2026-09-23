/**
 * GLiNER2 Fast Decision scorer config (Effect-primary).
 * Primary production backend for the Fast Decision Primitive — mature Apache-2.0
 * encoder family (GLiNER → GLiNER2/2.5), not Needle/Laya/Jev.
 */

import { Context, Effect, Layer } from "effect";

export type GlinerScorerConfig = {
  /** Sidecar base URL, e.g. http://gliner:8080 — when set, live HTTP classify is used. */
  readonly endpointUrl?: string;
  /** HF model id served by the sidecar (default: fastino/gliner2.5-base-v1). */
  readonly modelId: string;
  readonly apiToken?: string;
  readonly timeoutMs: number;
};

export const DEFAULT_GLINER_MODEL_ID = "fastino/gliner2.5-base-v1";

export class GlinerScorerConfigService extends Context.Tag("clawql/GlinerScorerConfig")<
  GlinerScorerConfigService,
  {
    readonly get: () => Effect.Effect<GlinerScorerConfig>;
  }
>() {}

/** Read env at call time (tests can mutate process.env). */
export function readGlinerScorerConfigFromEnv(): GlinerScorerConfig {
  const endpointUrl = process.env.CLAWQL_FAST_DECISION_GLINER_URL?.trim() || undefined;
  const modelId =
    process.env.CLAWQL_FAST_DECISION_GLINER_MODEL?.trim() || DEFAULT_GLINER_MODEL_ID;
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

export function glinerEndpointConfigured(config: GlinerScorerConfig = readGlinerScorerConfigFromEnv()): boolean {
  return Boolean(config.endpointUrl?.trim());
}
