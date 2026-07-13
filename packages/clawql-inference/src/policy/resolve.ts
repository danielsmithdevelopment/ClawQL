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
import {
  loadInferencePolicyManifestSync,
  mergeEnvWithPolicyManifest,
  type InferencePolicyManifestBlock,
} from "./manifest.js";

export type InferencePolicyView = {
  source: "env" | "manifest+env";
  manifestPath?: string;
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
    piiScrubDefault: boolean;
    writeManifestDefault: boolean;
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

function resolveExportDefaults(
  manifestExport: InferencePolicyManifestBlock["export"] | undefined
): InferencePolicyView["export"] {
  return {
    defaultVerdict: "passed",
    piiScrubDefault: manifestExport?.piiScrubDefault ?? true,
    writeManifestDefault: manifestExport?.writeManifestDefault ?? true,
  };
}

export function resolveInferencePolicy(env: NodeJS.ProcessEnv = process.env): InferencePolicyView {
  const loaded = loadInferencePolicyManifestSync(env);
  const effectiveEnv = mergeEnvWithPolicyManifest(env, loaded?.manifest ?? null);
  const backend = resolveStoreBackend(effectiveEnv);
  const policyVersion =
    env.CLAWQL_RELEASE_MANIFEST?.trim() ||
    env.CLAWQL_INFERENCE_POLICY_VERSION?.trim() ||
    loaded?.manifest.policyVersion ||
    undefined;

  return {
    source: loaded ? "manifest+env" : "env",
    manifestPath: loaded?.path,
    policyVersion,
    escalation: loadModelEscalationConfig(effectiveEnv),
    cache: loadSemanticCacheConfig(effectiveEnv),
    fallback: loadFallbackConfig(effectiveEnv),
    keys: loadKeysConfig(effectiveEnv),
    store: {
      backend,
      path: backend === "jsonl" ? resolveInferenceStorePath(effectiveEnv) : undefined,
      postgresConfigured: postgresConfigured(effectiveEnv),
    },
    export: resolveExportDefaults(loaded?.manifest.inference.export),
    pipelineWorker: {
      enabled: parseTruthy(effectiveEnv.CLAWQL_INFERENCE_PIPELINE_WORKER),
      pollMs: Number.parseInt(
        effectiveEnv.CLAWQL_INFERENCE_PIPELINE_POLL_MS?.trim() || "60000",
        10
      ),
    },
    agentCoordination: {
      enabled: parseTruthy(effectiveEnv.CLAWQL_INFERENCE_AGENT_COORDINATION_ENABLED),
      hermesBaseUrl: effectiveEnv.HERMES_BASE_URL?.trim() || undefined,
    },
    efficiency: loadTokenEfficiencyConfig(effectiveEnv),
    layers: listEfficiencyLayerStatus(effectiveEnv),
    observability: {
      profile: resolveObservabilityProfile(effectiveEnv),
      otelInfra: otelInfraTracingEnabled(effectiveEnv),
      langfuse: langfuseTracingEnabled(effectiveEnv),
      tracing: inferenceTracingEnabled(effectiveEnv),
      semanticCacheBackend: resolveSemanticCacheBackend(effectiveEnv),
    },
  };
}
