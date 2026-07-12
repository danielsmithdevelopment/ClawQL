import { createAnthropicAdapter } from "./anthropic.js";
import { createOllamaAdapter } from "./ollama.js";
import { createOpenAiAdapter } from "./openai.js";
import type { InferenceProviderAdapter } from "./types.js";

export { createAnthropicAdapter } from "./anthropic.js";
export { createOllamaAdapter } from "./ollama.js";
export { createOpenAiAdapter } from "./openai.js";
export type { InferenceProviderAdapter, ProviderAdapterConfig } from "./types.js";

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434";

export type ProviderRegistry = Map<string, InferenceProviderAdapter>;

export function createProviderRegistry(env: NodeJS.ProcessEnv = process.env): ProviderRegistry {
  const registry: ProviderRegistry = new Map();

  registry.set(
    "openai",
    createOpenAiAdapter({
      apiKey: env.OPENAI_API_KEY?.trim() || undefined,
      baseUrl: env.CLAWQL_OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE,
    })
  );

  registry.set(
    "anthropic",
    createAnthropicAdapter({
      apiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
      baseUrl: env.CLAWQL_ANTHROPIC_BASE_URL?.trim() || DEFAULT_ANTHROPIC_BASE,
    })
  );

  registry.set(
    "ollama",
    createOllamaAdapter({
      baseUrl: env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE,
    })
  );

  return registry;
}

export function getProviderAdapter(
  registry: ProviderRegistry,
  provider: string
): InferenceProviderAdapter | undefined {
  return registry.get(provider.trim().toLowerCase());
}
