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
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: false }),
        signal: options?.signal,
      });
      if (!res.ok) {
        throw new Error(`ollama HTTP ${res.status}: ${await readHttpError(res)}`);
      }
      const body = (await res.json()) as OllamaChatResponse;
      return {
        content: body.message?.content ?? "",
        model: body.model ?? model,
        usage:
          body.prompt_eval_count !== undefined || body.eval_count !== undefined
            ? {
                inputTokens: body.prompt_eval_count ?? 0,
                outputTokens: body.eval_count ?? 0,
              }
            : undefined,
      };
    },
  };
}
