import { Effect, Ref } from "effect";

import { probeEndpointHealthEffect } from "./health-probe.js";
import type { ProviderConfig, TraceProvider } from "./types.js";

/** Langfuse work-trace store — OTLP traces for gen_ai / tool spans (ADR 0005). */
export const LANGFUSE_TRACE_PROVIDER_ID = "langfuse-otel";

export const createLangfuseTraceProvider = (): TraceProvider => {
  const configRef = Ref.unsafeMake<ProviderConfig>(defaultLangfuseProviderConfig());

  return {
    id: LANGFUSE_TRACE_PROVIDER_ID,
    name: "Langfuse (OTLP work traces)",
    signalType: "trace",
    initialize: (config) =>
      Effect.gen(function* () {
        yield* Ref.set(configRef, config);
      }),
    health: () =>
      Effect.gen(function* () {
        const config = yield* Ref.get(configRef);
        if (config.enabled === false) {
          return { status: "degraded", details: "provider disabled" };
        }
        return yield* probeEndpointHealthEffect({
          config,
          readyPath: "/api/public/health",
        });
      }),
  };
};

/**
 * Default Langfuse OTLP HTTP endpoint.
 * Auth: set `authHeaderEnv` to an env var holding `Basic <base64(public:secret)>`.
 * Secrets stay out of ProviderConfig values.
 */
export const defaultLangfuseProviderConfig = (
  env: NodeJS.ProcessEnv = process.env
): ProviderConfig => {
  const base = (env.LANGFUSE_BASE_URL ?? env.CLAWQL_LANGFUSE_URL ?? "http://langfuse:3000").replace(
    /\/$/,
    ""
  );
  return {
    endpoint: base,
    otlpEndpoint: `${base}/api/public/otel/v1/traces`,
    enabled: envTruthy(env.CLAWQL_ENABLE_LANGFUSE) || envTruthy(env.LANGFUSE_ENABLED),
    probeReachability: false,
    /** Route only gen_ai / clawql spans when Alloy filter is generated. */
    spanFilter: "gen_ai_or_clawql",
    authHeaderEnv: "LANGFUSE_OTLP_AUTH_HEADER",
  };
};

const envTruthy = (value: string | undefined): boolean => {
  const t = value?.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
};
