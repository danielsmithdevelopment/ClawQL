import type { InferenceRequest } from "../gateway.js";
import type { ModelTier } from "../routing/types.js";
import type { FallbackChainMap } from "./types.js";

export function normalizeFallbackChain(primaryModelId: string, chain: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (id: string) => {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    ordered.push(trimmed);
  };
  push(primaryModelId);
  for (const id of chain) push(id);
  return ordered;
}

export function resolveFallbackChain(
  request: InferenceRequest,
  chains: FallbackChainMap
): string[] {
  const primary = request.model ?? request.routing?.modelId;
  if (!primary?.trim()) return [];

  const primaryTrimmed = primary.trim();
  const modelChain = chains.byModel[primaryTrimmed];
  if (modelChain?.length) {
    return normalizeFallbackChain(primaryTrimmed, modelChain);
  }

  const tier = request.routing?.tier as ModelTier | undefined;
  if (tier && chains.byTier[tier]?.length) {
    return normalizeFallbackChain(primaryTrimmed, chains.byTier[tier]!);
  }

  return [primaryTrimmed];
}
