import type { ChatMessage } from "../../gateway.js";
import { readHttpError } from "../../providers/http.js";
import type { InferenceProviderAdapter, ProviderAdapterConfig } from "../../providers/types.js";

type OpenAiChatResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export function createOpenAiAdapter(config: ProviderAdapterConfig): InferenceProviderAdapter {
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  return {
    provider: "openai",
    async complete(model, messages, options) {
      if (!config.apiKey) {
        throw new Error("OPENAI_API_KEY is required for openai provider");
      }
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ model, messages }),
        signal: options?.signal,
      });
      if (!res.ok) {
        throw new Error(`openai HTTP ${res.status}: ${await readHttpError(res)}`);
      }
      const body = (await res.json()) as OpenAiChatResponse;
      const content = body.choices?.[0]?.message?.content ?? "";
      return {
        content,
        model: body.model ?? model,
        usage:
          body.usage?.prompt_tokens !== undefined || body.usage?.completion_tokens !== undefined
            ? {
                inputTokens: body.usage?.prompt_tokens ?? 0,
                outputTokens: body.usage?.completion_tokens ?? 0,
              }
            : undefined,
      };
    },
  };
}

export function toOpenAiMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages;
}
