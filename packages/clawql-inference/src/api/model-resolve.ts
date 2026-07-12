import { parseModelId } from "../providers/parse-model-id.js";
import type { ProviderRegistry } from "../providers/types.js";

export type ResolvedModel = {
  provider: string;
  model: string;
  /** Internal gateway model id (`provider/model`). */
  gatewayModelId: string;
  /** OpenAI-compatible response model field (bare id when conventional). */
  publicModelId: string;
};

function bareOpenAiModel(model: string): boolean {
  return /^(gpt-|o\d|text-|chatgpt-)/i.test(model);
}

function bareAnthropicModel(model: string): boolean {
  return /^claude/i.test(model);
}

export function toPublicModelId(provider: string, model: string): string {
  if (provider === "openai" || provider === "anthropic") return model;
  return `${provider}/${model}`;
}

export function resolveRequestModel(
  model: string,
  registry: ProviderRegistry
): ResolvedModel | null {
  const trimmed = model.trim();
  if (!trimmed) return null;

  if (trimmed.includes("/")) {
    const parsed = parseModelId(trimmed);
    if (!registry.has(parsed.provider)) return null;
    return {
      provider: parsed.provider,
      model: parsed.model,
      gatewayModelId: `${parsed.provider}/${parsed.model}`,
      publicModelId: toPublicModelId(parsed.provider, parsed.model),
    };
  }

  if (registry.has("openai") && bareOpenAiModel(trimmed)) {
    return {
      provider: "openai",
      model: trimmed,
      gatewayModelId: `openai/${trimmed}`,
      publicModelId: trimmed,
    };
  }

  if (registry.has("anthropic") && bareAnthropicModel(trimmed)) {
    return {
      provider: "anthropic",
      model: trimmed,
      gatewayModelId: `anthropic/${trimmed}`,
      publicModelId: trimmed,
    };
  }

  if (registry.has("ollama")) {
    return {
      provider: "ollama",
      model: trimmed,
      gatewayModelId: `ollama/${trimmed}`,
      publicModelId: `ollama/${trimmed}`,
    };
  }

  for (const provider of registry.keys()) {
    return {
      provider,
      model: trimmed,
      gatewayModelId: `${provider}/${trimmed}`,
      publicModelId: toPublicModelId(provider, trimmed),
    };
  }

  return null;
}
