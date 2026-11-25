/**
 * Audit 6.06: regulated / CLAWQL_INFERENCE_LOCAL_ONLY refuse non-local providers.
 */

import { parseModelId } from "../providers/parse-model-id.js";

const LOCAL_PROVIDERS = new Set([
  "ollama",
  "mlx",
  "local",
  "clawql",
  "clawql-auto",
  "gliner-decide",
]);

function envFlagOn(env: NodeJS.ProcessEnv, key: string): boolean {
  const v = env[key]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function inferenceLocalOnlyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CLAWQL_TIER?.trim().toLowerCase() === "regulated") return true;
  return envFlagOn(env, "CLAWQL_INFERENCE_LOCAL_ONLY");
}

export function isLocalInferenceProvider(provider: string): boolean {
  return LOCAL_PROVIDERS.has(provider.trim().toLowerCase());
}

export function isLocalInferenceModelId(modelId: string): boolean {
  const { provider } = parseModelId(modelId);
  return isLocalInferenceProvider(provider);
}

/** Operator allowlist of extra model ids (comma-separated) when local-only is on. */
export function inferenceLocalOnlyAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.CLAWQL_INFERENCE_LOCAL_ALLOWLIST?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function assertInferenceModelAllowed(
  modelId: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!inferenceLocalOnlyEnabled(env)) return;
  const key = modelId.trim().toLowerCase();
  if (inferenceLocalOnlyAllowlist(env).has(key)) return;
  if (isLocalInferenceModelId(modelId)) return;
  throw new Error(
    `Inference local-only (regulated or CLAWQL_INFERENCE_LOCAL_ONLY=1) refuses model ` +
      `"${modelId}". Use ollama/mlx/local or CLAWQL_INFERENCE_LOCAL_ALLOWLIST.`
  );
}

export function filterLocalOnlyModelIds(
  modelIds: string[],
  env: NodeJS.ProcessEnv = process.env
): string[] {
  if (!inferenceLocalOnlyEnabled(env)) return modelIds;
  const allow = inferenceLocalOnlyAllowlist(env);
  return modelIds.filter((id) => allow.has(id.trim().toLowerCase()) || isLocalInferenceModelId(id));
}
