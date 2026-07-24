import type { InferenceProviderPlugin } from "../providers/types.js";
import { createAnthropicAdapter } from "./adapters/anthropic.js";
import { createOllamaAdapter } from "./adapters/ollama.js";
import { createOpenAiAdapter } from "./adapters/openai.js";
import { createOpenAiCompatibleAdapter } from "./adapters/openai-compatible.js";
import { createOpenRouterAdapter } from "./adapters/openrouter.js";

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434";
const DEFAULT_OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export const OPENAI_PROVIDER_PLUGIN_ID = "openai";
export const ANTHROPIC_PROVIDER_PLUGIN_ID = "anthropic";
export const OLLAMA_PROVIDER_PLUGIN_ID = "ollama";
export const OPENROUTER_PROVIDER_PLUGIN_ID = "openrouter";

/** Direct BYOK OpenAI-compatible upstreams (disintermediate OpenRouter). */
export type OpenAiCompatProviderSpec = {
  id: string;
  apiKeyEnv: string;
  baseUrlEnv: string;
  defaultBaseUrl: string;
};

export const OPENAI_COMPAT_BYOK_PROVIDERS: readonly OpenAiCompatProviderSpec[] = [
  {
    id: "deepseek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "CLAWQL_DEEPSEEK_BASE_URL",
    defaultBaseUrl: "https://api.deepseek.com",
  },
  {
    id: "groq",
    apiKeyEnv: "GROQ_API_KEY",
    baseUrlEnv: "CLAWQL_GROQ_BASE_URL",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
  },
  {
    id: "fireworks",
    apiKeyEnv: "FIREWORKS_API_KEY",
    baseUrlEnv: "CLAWQL_FIREWORKS_BASE_URL",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
  },
  {
    id: "together",
    apiKeyEnv: "TOGETHER_API_KEY",
    baseUrlEnv: "CLAWQL_TOGETHER_BASE_URL",
    defaultBaseUrl: "https://api.together.xyz/v1",
  },
  {
    id: "mistral",
    apiKeyEnv: "MISTRAL_API_KEY",
    baseUrlEnv: "CLAWQL_MISTRAL_BASE_URL",
    defaultBaseUrl: "https://api.mistral.ai/v1",
  },
  {
    id: "xai",
    apiKeyEnv: "XAI_API_KEY",
    baseUrlEnv: "CLAWQL_XAI_BASE_URL",
    defaultBaseUrl: "https://api.x.ai/v1",
  },
  {
    id: "google",
    apiKeyEnv: "GOOGLE_API_KEY",
    baseUrlEnv: "CLAWQL_GOOGLE_OPENAI_BASE_URL",
    // Gemini OpenAI-compatible endpoint
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
];

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

export function createOpenAiCompatByokProviderPlugin(
  spec: OpenAiCompatProviderSpec
): InferenceProviderPlugin {
  return {
    id: spec.id,
    version: "1.0.0",
    builtin: true,
    onRegister({ env, registry }) {
      registry.set(
        spec.id,
        createOpenAiCompatibleAdapter({
          provider: spec.id,
          apiKey: env[spec.apiKeyEnv]?.trim() || undefined,
          baseUrl: env[spec.baseUrlEnv]?.trim() || spec.defaultBaseUrl,
          apiKeyEnvName: spec.apiKeyEnv,
        })
      );
    },
  };
}

export function createOpenAiCompatByokProviderPlugins(): InferenceProviderPlugin[] {
  return OPENAI_COMPAT_BYOK_PROVIDERS.map(createOpenAiCompatByokProviderPlugin);
}
