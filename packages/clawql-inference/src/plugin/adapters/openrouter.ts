import { createOpenAiCompatibleAdapter } from "./openai-compatible.js";

export type OpenRouterAdapterConfig = {
  apiKey?: string;
  baseUrl: string;
  httpReferer?: string;
  appTitle?: string;
};

/**
 * OpenRouter remains an optional escape hatch — same OpenAI-compatible wire
 * protocol, multi-segment upstream model ids (`deepseek/deepseek-chat`, …).
 */
export function createOpenRouterAdapter(config: OpenRouterAdapterConfig) {
  const extraHeaders: Record<string, string> = {};
  if (config.httpReferer?.trim()) {
    extraHeaders["HTTP-Referer"] = config.httpReferer.trim();
  }
  if (config.appTitle?.trim()) {
    extraHeaders["X-Title"] = config.appTitle.trim();
  }
  return createOpenAiCompatibleAdapter({
    provider: "openrouter",
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    apiKeyEnvName: "OPENROUTER_API_KEY",
    extraHeaders,
  });
}
