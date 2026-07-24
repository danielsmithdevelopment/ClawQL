export type {
  InferenceProviderPlugin,
  InferenceProviderRegistrationContext,
  CreateProviderRegistryOptions,
} from "../providers/types.js";

export {
  composeDefaultProviderPlugins,
  composeProviderPlugins,
  type ComposeProviderPluginsOptions,
} from "./compose.js";

export {
  createOpenAiProviderPlugin,
  createAnthropicProviderPlugin,
  createOllamaProviderPlugin,
  createOpenRouterProviderPlugin,
  createOpenAiCompatByokProviderPlugin,
  createOpenAiCompatByokProviderPlugins,
  OPENAI_COMPAT_BYOK_PROVIDERS,
  OPENAI_PROVIDER_PLUGIN_ID,
  ANTHROPIC_PROVIDER_PLUGIN_ID,
  OLLAMA_PROVIDER_PLUGIN_ID,
  OPENROUTER_PROVIDER_PLUGIN_ID,
} from "./builtins.js";

export { createOpenAiAdapter } from "./adapters/openai.js";
export { createAnthropicAdapter } from "./adapters/anthropic.js";
export { createOllamaAdapter } from "./adapters/ollama.js";
export { createOpenRouterAdapter } from "./adapters/openrouter.js";
export { createOpenAiCompatibleAdapter } from "./adapters/openai-compatible.js";
export type { OpenAiCompatibleAdapterConfig } from "./adapters/openai-compatible.js";
export type { OpenAiCompatProviderSpec } from "./builtins.js";
