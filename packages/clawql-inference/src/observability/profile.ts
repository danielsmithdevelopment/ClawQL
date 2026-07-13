export type ObservabilityProfile = "bundled" | "external" | "minimal";

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function resolveObservabilityProfile(
  env: NodeJS.ProcessEnv = process.env
): ObservabilityProfile {
  const raw = env.CLAWQL_OBSERVABILITY_PROFILE?.trim().toLowerCase();
  if (raw === "bundled" || raw === "external" || raw === "minimal") return raw;
  return "external";
}

export function hasOtlpEndpointConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() || env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
  );
}

/** Infra OTLP (Tempo / collector) — opt-in via CLAWQL_ENABLE_OTEL_TRACING=1. */
export function otelInfraTracingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (resolveObservabilityProfile(env) === "minimal") return false;
  if (!parseTruthy(env.CLAWQL_ENABLE_OTEL_TRACING)) return false;
  return hasOtlpEndpointConfigured(env);
}

function langfuseCredentialsPresent(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.LANGFUSE_HOST?.trim() && env.LANGFUSE_PUBLIC_KEY?.trim() && env.LANGFUSE_SECRET_KEY?.trim()
  );
}

/** Langfuse work-trace OTLP — on by default in bundled/external when keys exist (ADR 0005). */
export function langfuseTracingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (resolveObservabilityProfile(env) === "minimal") return false;
  const flag = env.CLAWQL_ENABLE_LANGFUSE?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") return false;
  return langfuseCredentialsPresent(env);
}

export function inferenceTracingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return otelInfraTracingEnabled(env) || langfuseTracingEnabled(env);
}
