import { parseModelId } from "../providers/parse-model-id.js";
import type { ProviderRegistry } from "../providers/types.js";
import { isAutoRouteModel } from "../efficiency/layer-8-routing.js";
import {
  DEFAULT_INFERENCE_MODEL_CATALOG,
  findCatalogModel,
  resolveCatalogAlias,
  type InferenceModelCatalog,
} from "../catalog/index.js";

export type ResolvedModel = {
  provider: string;
  model: string;
  /** Internal gateway model id (`provider/model`). */
  gatewayModelId: string;
  /** OpenAI-compatible response model field (bare id when conventional). */
  publicModelId: string;
};

export type ResolveRequestModelOptions = {
  /** mlx_lm.server expects the local weights path, not a Hugging Face slug. */
  readonly mlxUpstreamModel?: string;
};

function mlxUpstream(catalogUpstream: string, options?: ResolveRequestModelOptions): string {
  const override = options?.mlxUpstreamModel?.trim();
  return override || catalogUpstream;
}

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
  registry: ProviderRegistry,
  catalog: InferenceModelCatalog = DEFAULT_INFERENCE_MODEL_CATALOG,
  options?: ResolveRequestModelOptions
): ResolvedModel | null {
  const trimmed = model.trim();
  if (!trimmed) return null;

  if (isAutoRouteModel(trimmed)) {
    return {
      provider: "clawql",
      model: trimmed,
      gatewayModelId: trimmed,
      publicModelId: trimmed,
    };
  }

  // Catalog aliases (clawql/cheap-chat → deepseek/deepseek-chat) and entries
  // that remap display ids to upstream model strings.
  const aliased = resolveCatalogAlias(trimmed, catalog);
  const catalogEntry = findCatalogModel(aliased, catalog);
  if (catalogEntry && registry.has(catalogEntry.provider)) {
    const upstream =
      catalogEntry.provider === "mlx"
        ? mlxUpstream(catalogEntry.upstream_model, options)
        : catalogEntry.upstream_model;
    return {
      provider: catalogEntry.provider,
      model: upstream,
      gatewayModelId: catalogEntry.id,
      publicModelId: toPublicModelId(catalogEntry.provider, catalogEntry.upstream_model),
    };
  }

  const resolvedId = aliased;

  if (resolvedId.includes("/")) {
    const parsed = parseModelId(resolvedId);
    if (!registry.has(parsed.provider)) return null;
    return {
      provider: parsed.provider,
      model: parsed.model,
      gatewayModelId: `${parsed.provider}/${parsed.model}`,
      publicModelId: toPublicModelId(parsed.provider, parsed.model),
    };
  }

  if (registry.has("openai") && bareOpenAiModel(resolvedId)) {
    return {
      provider: "openai",
      model: resolvedId,
      gatewayModelId: `openai/${resolvedId}`,
      publicModelId: resolvedId,
    };
  }

  if (registry.has("anthropic") && bareAnthropicModel(resolvedId)) {
    return {
      provider: "anthropic",
      model: resolvedId,
      gatewayModelId: `anthropic/${resolvedId}`,
      publicModelId: resolvedId,
    };
  }

  if (registry.has("ollama")) {
    return {
      provider: "ollama",
      model: resolvedId,
      gatewayModelId: `ollama/${resolvedId}`,
      publicModelId: `ollama/${resolvedId}`,
    };
  }

  for (const provider of registry.keys()) {
    return {
      provider,
      model: resolvedId,
      gatewayModelId: `${provider}/${resolvedId}`,
      publicModelId: toPublicModelId(provider, resolvedId),
    };
  }

  return null;
}
