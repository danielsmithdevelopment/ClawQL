import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export type InferencePolicyManifest = {
  policyVersion?: string;
  inference: InferencePolicyManifestBlock;
};

export type InferencePolicyManifestBlock = {
  escalation?: {
    enabled?: boolean;
    modelPin?: string;
    tierMap?: Partial<Record<"frugal" | "standard" | "frontier", string>>;
  };
  cache?: {
    enabled?: boolean;
    threshold?: number;
    ttlMs?: number;
    maxEntries?: number;
  };
  fallback?: { enabled?: boolean };
  keys?: { enabled?: boolean };
  store?: { backend?: string };
  export?: {
    defaultVerdict?: "passed";
    piiScrubDefault?: boolean;
    writeManifestDefault?: boolean;
  };
  pipelineWorker?: { enabled?: boolean; pollMs?: number };
  agentCoordination?: { enabled?: boolean; hermesBaseUrl?: string };
  observability?: {
    profile?: "bundled" | "external" | "minimal";
    otelInfra?: boolean;
    langfuse?: boolean;
    semanticCacheBackend?: "memory" | "postgres" | "pgvector";
  };
  efficiency?: {
    terse?: boolean;
    promptCache?: boolean;
    historyCompress?: boolean;
    historyMaxChars?: number;
    historyKeepRecent?: number;
    promptCompress?: boolean;
    promptCompressMaxChars?: number;
    httpAutoRoute?: boolean;
    structuredOutput?: boolean;
    tokenBudget?: boolean;
    prefill?: boolean;
    prefillOpener?: string;
  };
};

const FILE_NAME = "policy.yaml";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "1" ||
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "on"
    ) {
      return true;
    }
    if (
      normalized === "0" ||
      normalized === "false" ||
      normalized === "no" ||
      normalized === "off"
    ) {
      return false;
    }
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseTierMap(
  raw: unknown
): Partial<Record<"frugal" | "standard" | "frontier", string>> | undefined {
  if (!isRecord(raw)) return undefined;
  const tierMap: Partial<Record<"frugal" | "standard" | "frontier", string>> = {};
  for (const tier of ["frugal", "standard", "frontier"] as const) {
    const model = readString(raw[tier]);
    if (model) tierMap[tier] = model;
  }
  return Object.keys(tierMap).length ? tierMap : undefined;
}

function parseManifestBlock(raw: unknown): InferencePolicyManifestBlock {
  if (!isRecord(raw)) return {};
  const escalationRaw = raw.escalation;
  const cacheRaw = raw.cache;
  const exportRaw = raw.export;
  const pipelineRaw = raw.pipelineWorker;
  const agentRaw = raw.agentCoordination;
  const observabilityRaw = raw.observability;
  const efficiencyRaw = raw.efficiency;

  const escalation = isRecord(escalationRaw)
    ? {
        enabled: readBoolean(escalationRaw.enabled),
        modelPin: readString(escalationRaw.modelPin),
        tierMap: parseTierMap(escalationRaw.tierMap),
      }
    : undefined;

  const cache = isRecord(cacheRaw)
    ? {
        enabled: readBoolean(cacheRaw.enabled),
        threshold: readNumber(cacheRaw.threshold),
        ttlMs: readNumber(cacheRaw.ttlMs),
        maxEntries: readNumber(cacheRaw.maxEntries),
      }
    : undefined;

  const observability = isRecord(observabilityRaw)
    ? {
        profile: readString(observabilityRaw.profile) as
          "bundled" | "external" | "minimal" | undefined,
        otelInfra: readBoolean(observabilityRaw.otelInfra),
        langfuse: readBoolean(observabilityRaw.langfuse),
        semanticCacheBackend: readString(observabilityRaw.semanticCacheBackend) as
          "memory" | "postgres" | "pgvector" | undefined,
      }
    : undefined;

  const efficiency = isRecord(efficiencyRaw)
    ? {
        terse: readBoolean(efficiencyRaw.terse),
        promptCache: readBoolean(efficiencyRaw.promptCache),
        historyCompress: readBoolean(efficiencyRaw.historyCompress),
        historyMaxChars: readNumber(efficiencyRaw.historyMaxChars),
        historyKeepRecent: readNumber(efficiencyRaw.historyKeepRecent),
        promptCompress: readBoolean(efficiencyRaw.promptCompress),
        promptCompressMaxChars: readNumber(efficiencyRaw.promptCompressMaxChars),
        httpAutoRoute: readBoolean(efficiencyRaw.httpAutoRoute),
        structuredOutput: readBoolean(efficiencyRaw.structuredOutput),
        tokenBudget: readBoolean(efficiencyRaw.tokenBudget),
        prefill: readBoolean(efficiencyRaw.prefill),
        prefillOpener: readString(efficiencyRaw.prefillOpener),
      }
    : undefined;

  return {
    escalation,
    cache,
    fallback: isRecord(raw.fallback) ? { enabled: readBoolean(raw.fallback.enabled) } : undefined,
    keys: isRecord(raw.keys) ? { enabled: readBoolean(raw.keys.enabled) } : undefined,
    store: isRecord(raw.store) ? { backend: readString(raw.store.backend) } : undefined,
    export: isRecord(exportRaw)
      ? {
          defaultVerdict:
            readString(exportRaw.defaultVerdict) === "passed" ? ("passed" as const) : undefined,
          piiScrubDefault: readBoolean(exportRaw.piiScrubDefault),
          writeManifestDefault: readBoolean(exportRaw.writeManifestDefault),
        }
      : undefined,
    pipelineWorker: isRecord(pipelineRaw)
      ? {
          enabled: readBoolean(pipelineRaw.enabled),
          pollMs: readNumber(pipelineRaw.pollMs),
        }
      : undefined,
    agentCoordination: isRecord(agentRaw)
      ? {
          enabled: readBoolean(agentRaw.enabled),
          hermesBaseUrl: readString(agentRaw.hermesBaseUrl),
        }
      : undefined,
    observability,
    efficiency,
  };
}

export function parseInferencePolicyManifestDocument(raw: unknown): InferencePolicyManifest | null {
  if (!isRecord(raw)) return null;
  const inferenceRaw = raw.inference ?? raw;
  const inference = parseManifestBlock(inferenceRaw);
  const policyVersion =
    readString(raw.policyVersion) ??
    (isRecord(inferenceRaw) ? readString(inferenceRaw.policyVersion) : undefined);
  return { policyVersion, inference };
}

export function parseInferencePolicyManifestText(text: string): InferencePolicyManifest | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = trimmed.startsWith("{") ? JSON.parse(trimmed) : parseYaml(trimmed);
  return parseInferencePolicyManifestDocument(parsed);
}

export function resolvePolicyManifestPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAWQL_INFERENCE_POLICY_MANIFEST?.trim();
  if (explicit) return explicit;
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Inference", FILE_NAME);
}

export function loadInferencePolicyManifestSync(
  env: NodeJS.ProcessEnv = process.env
): { manifest: InferencePolicyManifest; path: string } | null {
  const path = resolvePolicyManifestPath(env);
  if (!existsSync(path)) return null;
  try {
    const text = readFileSync(path, "utf8");
    const manifest = parseInferencePolicyManifestText(text);
    if (!manifest) return null;
    return { manifest, path };
  } catch {
    return null;
  }
}

function boolToEnv(value: boolean | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value ? "1" : "0";
}

/** Map manifest blocks to env vars; caller merges under process env so env wins. */
export function manifestToEnvOverrides(manifest: InferencePolicyManifest): Record<string, string> {
  const out: Record<string, string> = {};
  const { inference } = manifest;

  if (manifest.policyVersion) out.CLAWQL_INFERENCE_POLICY_VERSION = manifest.policyVersion;

  const escalation = inference.escalation;
  if (escalation) {
    const enabled = boolToEnv(escalation.enabled);
    if (enabled !== undefined) out.CLAWQL_INFERENCE_ROUTING_ENABLED = enabled;
    if (escalation.modelPin) out.CLAWQL_INFERENCE_MODEL_PIN = escalation.modelPin;
    if (escalation.tierMap?.frugal) out.CLAWQL_INFERENCE_MODEL_FRUGAL = escalation.tierMap.frugal;
    if (escalation.tierMap?.standard) {
      out.CLAWQL_INFERENCE_MODEL_STANDARD = escalation.tierMap.standard;
    }
    if (escalation.tierMap?.frontier) {
      out.CLAWQL_INFERENCE_MODEL_FRONTIER = escalation.tierMap.frontier;
    }
  }

  const cache = inference.cache;
  if (cache) {
    const enabled = boolToEnv(cache.enabled);
    if (enabled !== undefined) out.CLAWQL_INFERENCE_SEMANTIC_CACHE = enabled;
    if (cache.threshold !== undefined)
      out.CLAWQL_INFERENCE_CACHE_THRESHOLD = String(cache.threshold);
    if (cache.ttlMs !== undefined) out.CLAWQL_INFERENCE_CACHE_TTL_MS = String(cache.ttlMs);
    if (cache.maxEntries !== undefined) {
      out.CLAWQL_INFERENCE_CACHE_MAX_ENTRIES = String(cache.maxEntries);
    }
  }

  const fallback = inference.fallback;
  if (fallback) {
    const enabled = boolToEnv(fallback.enabled);
    if (enabled !== undefined) out.CLAWQL_INFERENCE_FALLBACK_ENABLED = enabled;
  }

  const keys = inference.keys;
  if (keys) {
    const enabled = boolToEnv(keys.enabled);
    if (enabled !== undefined) out.CLAWQL_INFERENCE_KEYS_ENABLED = enabled;
  }

  if (inference.store?.backend) out.CLAWQL_INFERENCE_STORE = inference.store.backend;

  const pipeline = inference.pipelineWorker;
  if (pipeline) {
    const enabled = boolToEnv(pipeline.enabled);
    if (enabled !== undefined) out.CLAWQL_INFERENCE_PIPELINE_WORKER = enabled;
    if (pipeline.pollMs !== undefined)
      out.CLAWQL_INFERENCE_PIPELINE_POLL_MS = String(pipeline.pollMs);
  }

  const agent = inference.agentCoordination;
  if (agent) {
    const enabled = boolToEnv(agent.enabled);
    if (enabled !== undefined) out.CLAWQL_INFERENCE_AGENT_COORDINATION_ENABLED = enabled;
    if (agent.hermesBaseUrl) out.HERMES_BASE_URL = agent.hermesBaseUrl;
  }

  const observability = inference.observability;
  if (observability) {
    if (observability.profile) out.CLAWQL_OBSERVABILITY_PROFILE = observability.profile;
    const otel = boolToEnv(observability.otelInfra);
    if (otel !== undefined) out.CLAWQL_ENABLE_OTEL_TRACING = otel;
    const langfuse = boolToEnv(observability.langfuse);
    if (langfuse !== undefined) out.CLAWQL_ENABLE_LANGFUSE = langfuse;
    if (observability.semanticCacheBackend) {
      out.CLAWQL_INFERENCE_SEMANTIC_CACHE_BACKEND = observability.semanticCacheBackend;
    }
  }

  const efficiency = inference.efficiency;
  if (efficiency) {
    const terse = boolToEnv(efficiency.terse);
    if (terse !== undefined) out.CLAWQL_INFERENCE_TERSE = terse;
    const promptCache = boolToEnv(efficiency.promptCache);
    if (promptCache !== undefined) out.CLAWQL_INFERENCE_PROMPT_CACHE = promptCache;
    const historyCompress = boolToEnv(efficiency.historyCompress);
    if (historyCompress !== undefined) out.CLAWQL_INFERENCE_HISTORY_COMPRESS = historyCompress;
    if (efficiency.historyMaxChars !== undefined) {
      out.CLAWQL_INFERENCE_HISTORY_MAX_CHARS = String(efficiency.historyMaxChars);
    }
    if (efficiency.historyKeepRecent !== undefined) {
      out.CLAWQL_INFERENCE_HISTORY_KEEP_RECENT = String(efficiency.historyKeepRecent);
    }
    const promptCompress = boolToEnv(efficiency.promptCompress);
    if (promptCompress !== undefined) out.CLAWQL_INFERENCE_PROMPT_COMPRESS = promptCompress;
    if (efficiency.promptCompressMaxChars !== undefined) {
      out.CLAWQL_INFERENCE_PROMPT_COMPRESS_MAX_CHARS = String(efficiency.promptCompressMaxChars);
    }
    const httpAutoRoute = boolToEnv(efficiency.httpAutoRoute);
    if (httpAutoRoute !== undefined) out.CLAWQL_INFERENCE_HTTP_AUTO_ROUTE = httpAutoRoute;
    const structuredOutput = boolToEnv(efficiency.structuredOutput);
    if (structuredOutput !== undefined) out.CLAWQL_INFERENCE_STRUCTURED_OUTPUT = structuredOutput;
    const tokenBudget = boolToEnv(efficiency.tokenBudget);
    if (tokenBudget !== undefined) out.CLAWQL_INFERENCE_TOKEN_BUDGET = tokenBudget;
    const prefill = boolToEnv(efficiency.prefill);
    if (prefill !== undefined) out.CLAWQL_INFERENCE_PREFILL = prefill;
    if (efficiency.prefillOpener !== undefined) {
      out.CLAWQL_INFERENCE_PREFILL_OPENER = efficiency.prefillOpener;
    }
  }

  return out;
}

/** Manifest defaults with explicit env overrides winning. */
export function mergeEnvWithPolicyManifest(
  env: NodeJS.ProcessEnv,
  manifest: InferencePolicyManifest | null
): NodeJS.ProcessEnv {
  if (!manifest) return env;
  const fromManifest = manifestToEnvOverrides(manifest);
  return { ...fromManifest, ...env };
}
