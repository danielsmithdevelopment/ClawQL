import {
  createAnthropicProviderPlugin,
  createOllamaProviderPlugin,
  createOpenAiProviderPlugin,
} from "./builtins.js";
import type { InferenceProviderPlugin } from "../providers/types.js";

/** Built-in defaults from the inference plan: OpenAI, Anthropic, Ollama. */
export function composeDefaultProviderPlugins(): InferenceProviderPlugin[] {
  return [
    createOpenAiProviderPlugin(),
    createAnthropicProviderPlugin(),
    createOllamaProviderPlugin(),
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
