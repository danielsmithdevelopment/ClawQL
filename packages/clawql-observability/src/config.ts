import { Effect } from "effect";

import type { LgtmPlusHelmValues, ObservabilityProfileConfig } from "./types.js";

const truthy = (value: string | undefined): boolean =>
  value === "1" || value?.toLowerCase() === "true";

const falsy = (value: string | undefined): boolean =>
  value === "0" || value?.toLowerCase() === "false";

const readEnv = (key: string): string | undefined => {
  const raw = process.env[key];
  const trimmed = raw?.trim();
  return trimmed === "" ? undefined : trimmed;
};

/** Default Helm values for the LGTM+ core (Phase 1). */
export const defaultLgtmPlusHelmValues = (): LgtmPlusHelmValues => ({
  lgtmPlus: {
    loki: {
      enabled: true,
      retentionPeriod: "744h",
    },
    grafana: {
      enabled: true,
    },
    tempo: {
      enabled: true,
    },
    mimir: {
      enabled: true,
      ingestionRate: 10_000,
    },
    pyroscope: {
      enabled: true,
    },
  },
});

/** Resolve ClawQL observability profile flags (aligns with CLAWQL_OBSERVABILITY_PROFILE). */
export const readObservabilityProfileEffect = (): Effect.Effect<ObservabilityProfileConfig> =>
  Effect.sync(() => {
    const profileRaw = readEnv("CLAWQL_OBSERVABILITY_PROFILE");
    const profile =
      profileRaw === "bundled" || profileRaw === "external" || profileRaw === "minimal"
        ? profileRaw
        : profileRaw
          ? "external"
          : "external";

    const enableOtelTracingExplicit = readEnv("CLAWQL_ENABLE_OTEL_TRACING");
    const enableLokiPushExplicit = readEnv("CLAWQL_ENABLE_LOKI_PUSH");
    const enableLangfuseExplicit = readEnv("CLAWQL_ENABLE_LANGFUSE");

    const enableOtelTracing =
      enableOtelTracingExplicit !== undefined
        ? truthy(enableOtelTracingExplicit) && !falsy(enableOtelTracingExplicit)
        : profile === "bundled";

    const lokiPushUrl = readEnv("CLAWQL_LOKI_PUSH_URL");
    const enableLokiPush =
      enableLokiPushExplicit !== undefined
        ? truthy(enableLokiPushExplicit) && !falsy(enableLokiPushExplicit)
        : Boolean(lokiPushUrl);

    const enableLangfuse =
      enableLangfuseExplicit !== undefined
        ? truthy(enableLangfuseExplicit) && !falsy(enableLangfuseExplicit)
        : profile !== "minimal";

    const otelCollectorUrl =
      readEnv("CLAWQL_OTEL_COLLECTOR_URL") ??
      (profile === "bundled" ? "http://alloy:4318" : undefined);

    const resolvedLokiPushUrl =
      lokiPushUrl === "auto"
        ? "http://loki:3100/loki/api/v1/push"
        : lokiPushUrl;

    return {
      profile,
      enableOtelTracing,
      enableLokiPush: enableLokiPush && Boolean(resolvedLokiPushUrl),
      enableLangfuse,
      otelCollectorUrl,
      lokiPushUrl: resolvedLokiPushUrl,
    };
  });

/** Thin host façade for scripts and MCP edges. */
export const readObservabilityProfile = (): ObservabilityProfileConfig =>
  Effect.runSync(readObservabilityProfileEffect());
