import {
  createAnthropicProviderPlugin,
  createOllamaProviderPlugin,
  createOpenAiProviderPlugin,
  createOpenRouterProviderPlugin,
} from "./builtins.js";
import type { InferenceProviderPlugin } from "../providers/types.js";

/** Built-in defaults: OpenAI, Anthropic, Ollama, OpenRouter. */
export function composeDefaultProviderPlugins(): InferenceProviderPlugin[] {
  return [
    createOpenAiProviderPlugin(),
    createAnthropicProviderPlugin(),
    createOllamaProviderPlugin(),
    createOpenRouterProviderPlugin(),
  ];
}

export type ComposeProviderPluginsOptions = {
  /** Extra third-party or in-repo provider plugins appended after builtins. */
  extensions?: readonly InferenceProviderPlugin[];
  /** When true, skip built-in defaults (integrator supplies full plugin list). */
  skipBuiltins?: boolean;
};

export function composeProviderPlugins(
  options: ComposeProviderPluginsOptions = {}
): InferenceProviderPlugin[] {
  const plugins: InferenceProviderPlugin[] = [];
  if (!options.skipBuiltins) {
    plugins.push(...composeDefaultProviderPlugins());
  }
  if (options.extensions?.length) {
    plugins.push(...options.extensions);
  }
  return plugins;
}
