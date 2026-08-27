import { readHttpError } from "../../providers/http.js";
import type { InferenceProviderAdapter, ProviderAdapterConfig } from "../../providers/types.js";

type OllamaChatResponse = {
  model?: string;
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
};

export function createOllamaAdapter(config: ProviderAdapterConfig): InferenceProviderAdapter {
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  return {
    provider: "ollama",
    async complete(model, messages, options) {
      const requestBody = JSON.stringify({
        model,
        messages,
        stream: false,
        options:
          options?.maxTokens != null
            ? { num_predict: options.maxTokens, temperature: options.temperature }
            : options?.temperature != null
              ? { temperature: options.temperature }
              : undefined,
      });
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        signal: options?.signal,
      });
      if (!res.ok) {
        throw new Error(`ollama HTTP ${res.status}: ${await readHttpError(res)}`);
      }
      const response = (await res.json()) as OllamaChatResponse;
      return {
        content: response.message?.content ?? "",
        model: response.model ?? model,
        usage:
          response.prompt_eval_count !== undefined || response.eval_count !== undefined
            ? {
                inputTokens: response.prompt_eval_count ?? 0,
                outputTokens: response.eval_count ?? 0,
              }
            : undefined,
      };
    },
  };
}
