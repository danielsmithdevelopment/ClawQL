import type { InferenceProviderPlugin } from "../providers/types.js";
import { createAnthropicAdapter } from "./adapters/anthropic.js";
import { createOllamaAdapter } from "./adapters/ollama.js";
import { createOpenAiAdapter } from "./adapters/openai.js";
import { createOpenRouterAdapter } from "./adapters/openrouter.js";

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434";
const DEFAULT_OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export const OPENAI_PROVIDER_PLUGIN_ID = "openai";
export const ANTHROPIC_PROVIDER_PLUGIN_ID = "anthropic";
export const OLLAMA_PROVIDER_PLUGIN_ID = "ollama";
export const OPENROUTER_PROVIDER_PLUGIN_ID = "openrouter";

export function createOpenAiProviderPlugin(): InferenceProviderPlugin {
  return {
    id: OPENAI_PROVIDER_PLUGIN_ID,
    version: "1.0.0",
    builtin: true,
    onRegister({ env, registry }) {
      registry.set(
        OPENAI_PROVIDER_PLUGIN_ID,
        createOpenAiAdapter({
          apiKey: env.OPENAI_API_KEY?.trim() || undefined,
          baseUrl: env.CLAWQL_OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE,
        })
      );
    },
  };
}

export function createAnthropicProviderPlugin(): InferenceProviderPlugin {
  return {
    id: ANTHROPIC_PROVIDER_PLUGIN_ID,
    version: "1.0.0",
    builtin: true,
    onRegister({ env, registry }) {
      registry.set(
        ANTHROPIC_PROVIDER_PLUGIN_ID,
        createAnthropicAdapter({
          apiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
          baseUrl: env.CLAWQL_ANTHROPIC_BASE_URL?.trim() || DEFAULT_ANTHROPIC_BASE,
        })
      );
    },
  };
}

export function createOllamaProviderPlugin(): InferenceProviderPlugin {
  return {
    id: OLLAMA_PROVIDER_PLUGIN_ID,
    version: "1.0.0",
    builtin: true,
    onRegister({ env, registry }) {
      registry.set(
        OLLAMA_PROVIDER_PLUGIN_ID,
        createOllamaAdapter({
          baseUrl: env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE,
        })
      );
    },
  };
}

export function createOpenRouterProviderPlugin(): InferenceProviderPlugin {
  return {
    id: OPENROUTER_PROVIDER_PLUGIN_ID,
    version: "1.0.0",
    builtin: true,
    onRegister({ env, registry }) {
      registry.set(
        OPENROUTER_PROVIDER_PLUGIN_ID,
        createOpenRouterAdapter({
          apiKey: env.OPENROUTER_API_KEY?.trim() || undefined,
          baseUrl: env.CLAWQL_OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE,
          httpReferer: env.CLAWQL_OPENROUTER_HTTP_REFERER?.trim() || "https://clawql.com",
          appTitle: env.CLAWQL_OPENROUTER_APP_TITLE?.trim() || "ClawQL",
        })
      );
    },
  };
}
