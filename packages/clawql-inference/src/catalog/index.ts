import { readFile } from "node:fs/promises";
import { DEFAULT_INFERENCE_MODEL_CATALOG, type InferenceModelCatalog } from "./default-catalog.js";

export type {
  CatalogModel,
  InferenceModelCatalog,
} from "./default-catalog.js";
export { DEFAULT_INFERENCE_MODEL_CATALOG } from "./default-catalog.js";

/**
 * Load catalog from `CLAWQL_INFERENCE_CATALOG_PATH` when set; otherwise the
 * built-in curated BYOK catalog.
 */
export async function loadInferenceModelCatalog(
  env: NodeJS.ProcessEnv = process.env
): Promise<InferenceModelCatalog> {
  const path = env.CLAWQL_INFERENCE_CATALOG_PATH?.trim();
  if (!path) return DEFAULT_INFERENCE_MODEL_CATALOG;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as InferenceModelCatalog;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.models)) {
      return DEFAULT_INFERENCE_MODEL_CATALOG;
    }
    return {
      version: 1,
      models: parsed.models,
      aliases: parsed.aliases ?? {},
    };
  } catch {
    return DEFAULT_INFERENCE_MODEL_CATALOG;
  }
}

export function resolveCatalogAlias(
  modelId: string,
  catalog: InferenceModelCatalog
): string {
  const trimmed = modelId.trim();
  return catalog.aliases[trimmed] ?? trimmed;
}

export function findCatalogModel(modelId: string, catalog: InferenceModelCatalog) {
  const resolved = resolveCatalogAlias(modelId, catalog);
  return catalog.models.find((m) => m.id === resolved);
}

/** Env var that supplies credentials for a provider id. */
export const PROVIDER_API_KEY_ENV: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
  together: "TOGETHER_API_KEY",
  mistral: "MISTRAL_API_KEY",
  xai: "XAI_API_KEY",
  google: "GOOGLE_API_KEY",
};

export function providerCredentialPresent(
  provider: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const id = provider.trim().toLowerCase();
  if (id === "ollama") return true; // local runtime — no cloud key
  const envName = PROVIDER_API_KEY_ENV[id];
  if (!envName) return Boolean(env[`${id.toUpperCase()}_API_KEY`]?.trim());
  return Boolean(env[envName]?.trim());
}
