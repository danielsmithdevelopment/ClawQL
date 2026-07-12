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
  OPENAI_PROVIDER_PLUGIN_ID,
  ANTHROPIC_PROVIDER_PLUGIN_ID,
  OLLAMA_PROVIDER_PLUGIN_ID,
} from "./builtins.js";

export { createOpenAiAdapter } from "./adapters/openai.js";
export { createAnthropicAdapter } from "./adapters/anthropic.js";
export { createOllamaAdapter } from "./adapters/ollama.js";
