import { createOpenAiCompatibleAdapter, toOpenAiMessages } from "./openai-compatible.js";
import type { ProviderAdapterConfig } from "../../providers/types.js";

export function createOpenAiAdapter(config: ProviderAdapterConfig) {
  return createOpenAiCompatibleAdapter({
    ...config,
    provider: "openai",
    apiKeyEnvName: "OPENAI_API_KEY",
  });
}

export { toOpenAiMessages };
