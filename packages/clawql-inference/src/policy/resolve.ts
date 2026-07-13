import { loadFallbackConfig } from "../fallback/config.js";
import { loadKeysConfig } from "../keys/config.js";
import { loadSemanticCacheConfig } from "../cache/types.js";
import { loadModelEscalationConfig } from "../routing/config.js";
import { resolveInferenceStoreBackend, resolveInferenceStorePath } from "../store/create.js";
import type { InferenceStoreBackend } from "../store/types.js";
import { loadTokenEfficiencyConfig, listEfficiencyLayerStatus } from "../efficiency/config.js";
import {
  inferenceTracingEnabled,
  langfuseTracingEnabled,
  otelInfraTracingEnabled,
  resolveObservabilityProfile,
} from "../observability/profile.js";
import { resolveSemanticCacheBackend } from "../cache/postgres-pgvector-store.js";

export type InferencePolicyView = {
  source: "env";
  policyVersion?: string;
  escalation: ReturnType<typeof loadModelEscalationConfig>;
  cache: ReturnType<typeof loadSemanticCacheConfig>;
  fallback: ReturnType<typeof loadFallbackConfig>;
  keys: ReturnType<typeof loadKeysConfig>;
  store: {
    backend: InferenceStoreBackend | "postgres";
    path?: string;
    postgresConfigured: boolean;
  };
  export: {
    defaultVerdict: "passed";
    piiScrubDefault: true;
    writeManifestDefault: true;
  };
  pipelineWorker: {
    enabled: boolean;
    pollMs: number;
  };
  agentCoordination: {
    enabled: boolean;
    hermesBaseUrl?: string;
  };
  efficiency: ReturnType<typeof loadTokenEfficiencyConfig>;
  layers: ReturnType<typeof listEfficiencyLayerStatus>;
  observability: {
    profile: ReturnType<typeof resolveObservabilityProfile>;
    otelInfra: boolean;
    langfuse: boolean;
    tracing: boolean;
    semanticCacheBackend: ReturnType<typeof resolveSemanticCacheBackend>;
  };
};

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolveStoreBackend(env: NodeJS.ProcessEnv): InferenceStoreBackend | "postgres" {
  const raw = env.CLAWQL_INFERENCE_STORE?.trim().toLowerCase();
  if (raw === "postgres" || raw === "pg") return "postgres";
  return resolveInferenceStoreBackend(env);
}

function postgresConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.CLAWQL_INFERENCE_DATABASE_URL?.trim() ||
    (env.CLAWQL_INFERENCE_DB_HOST?.trim() &&
      env.CLAWQL_INFERENCE_DB_USER?.trim() &&
      env.CLAWQL_INFERENCE_DB_NAME?.trim())
  );
}

export function resolveInferencePolicy(env: NodeJS.ProcessEnv = process.env): InferencePolicyView {
  const backend = resolveStoreBackend(env);
  return {
    source: "env",
    policyVersion: env.CLAWQL_RELEASE_MANIFEST?.trim() || undefined,
    escalation: loadModelEscalationConfig(env),
    cache: loadSemanticCacheConfig(env),
    fallback: loadFallbackConfig(env),
    keys: loadKeysConfig(env),
    store: {
      backend,
      path: backend === "jsonl" ? resolveInferenceStorePath(env) : undefined,
      postgresConfigured: postgresConfigured(env),
    },
    export: {
      defaultVerdict: "passed",
      piiScrubDefault: true,
      writeManifestDefault: true,
    },
    pipelineWorker: {
      enabled: parseTruthy(env.CLAWQL_INFERENCE_PIPELINE_WORKER),
      pollMs: Number.parseInt(env.CLAWQL_INFERENCE_PIPELINE_POLL_MS?.trim() || "60000", 10),
    },
    agentCoordination: {
      enabled: parseTruthy(env.CLAWQL_INFERENCE_AGENT_COORDINATION_ENABLED),
      hermesBaseUrl: env.HERMES_BASE_URL?.trim() || undefined,
    },
    efficiency: loadTokenEfficiencyConfig(env),
    layers: listEfficiencyLayerStatus(env),
    observability: {
      profile: resolveObservabilityProfile(env),
      otelInfra: otelInfraTracingEnabled(env),
      langfuse: langfuseTracingEnabled(env),
      tracing: inferenceTracingEnabled(env),
      semanticCacheBackend: resolveSemanticCacheBackend(env),
    },
  };
}
