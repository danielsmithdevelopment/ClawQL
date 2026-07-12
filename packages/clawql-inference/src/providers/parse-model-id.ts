export type ParsedModelId = {
  provider: string;
  model: string;
};

/**
 * Parse `provider/model` ids used by tier maps and CLI flags.
 * Bare model ids default to the openai provider.
 */
export function parseModelId(modelId: string): ParsedModelId {
  const trimmed = modelId.trim();
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return { provider: "openai", model: trimmed };
  }
  const provider = trimmed.slice(0, slash).trim().toLowerCase();
  const model = trimmed.slice(slash + 1).trim();
  if (!provider || !model) {
    throw new Error(`Invalid model id "${modelId}" — expected provider/model`);
  }
  return { provider, model };
}
