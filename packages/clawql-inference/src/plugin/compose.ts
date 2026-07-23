import {
  createAnthropicProviderPlugin,
  createOllamaProviderPlugin,
  createOpenAiCompatByokProviderPlugins,
  createOpenAiProviderPlugin,
  createOpenRouterProviderPlugin,
} from "./builtins.js";
import type { InferenceProviderPlugin } from "../providers/types.js";

/**
 * Built-in defaults: direct BYOK providers + local Ollama + optional OpenRouter
 * escape hatch. OpenRouter is never required — operators bring vendor keys.
 */
export function composeDefaultProviderPlugins(): InferenceProviderPlugin[] {
  return [
    createOpenAiProviderPlugin(),
    createAnthropicProviderPlugin(),
    createOllamaProviderPlugin(),
    ...createOpenAiCompatByokProviderPlugins(),
    // Optional aggregator — keep last so direct BYOK is the default narrative.
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
