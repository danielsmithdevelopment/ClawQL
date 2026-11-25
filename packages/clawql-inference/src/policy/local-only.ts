/**
 * Audit 6.06 / X4: regulated / CLAWQL_INFERENCE_LOCAL_ONLY refuse non-local providers.
 * Aliases like clawql / clawql-auto are NOT local — check the resolved upstream model.
 */

import { parseModelId } from "../providers/parse-model-id.js";

/** True local backends only (not routing aliases). */
const LOCAL_PROVIDERS = new Set(["ollama", "mlx", "local"]);

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
  try {
    const { provider } = parseModelId(modelId);
    return isLocalInferenceProvider(provider);
  } catch {
    return false;
  }
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

/**
 * Refuse cloud / alias models under local-only. Call at the gateway on the
 * actual upstream model id immediately before the provider adapter runs (X4).
 */
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
      `"${modelId}". Use ollama/… or mlx/… (or CLAWQL_INFERENCE_LOCAL_ALLOWLIST).`
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
