import type { ChatMessage } from "../../gateway.js";
import { readHttpError } from "../../providers/http.js";
import type { InferenceProviderAdapter, ProviderAdapterConfig } from "../../providers/types.js";

type AnthropicMessageResponse = {
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

function splitSystem(
  messages: ChatMessage[],
  promptCacheEnabled?: boolean
): {
  system?: string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systemParts: string[] = [];
  const rest: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }
    rest.push({ role: message.role, content: message.content });
  }
  const systemText = systemParts.length ? systemParts.join("\n\n") : undefined;
  if (!systemText) return { messages: rest };
  if (promptCacheEnabled) {
    return {
      system: [
        {
          type: "text",
          text: systemText,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: rest,
    };
  }
  return { system: systemText, messages: rest };
}

export function createAnthropicAdapter(config: ProviderAdapterConfig): InferenceProviderAdapter {
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  return {
    provider: "anthropic",
    async complete(model, messages, options) {
      if (!config.apiKey) {
        throw new Error("ANTHROPIC_API_KEY is required for anthropic provider");
      }
      const { system, messages: anthropicMessages } = splitSystem(
        messages,
        options?.promptCacheEnabled
      );
      const res = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: options?.maxTokens ?? 4096,
          ...(system ? { system } : {}),
          messages: anthropicMessages,
        }),
        signal: options?.signal,
      });
      if (!res.ok) {
        throw new Error(`anthropic HTTP ${res.status}: ${await readHttpError(res)}`);
      }
      const body = (await res.json()) as AnthropicMessageResponse;
      const content =
        body.content?.find((block) => block.type === "text")?.text ??
        body.content?.map((block) => block.text ?? "").join("") ??
        "";
      return {
        content,
        model: body.model ?? model,
        usage:
          body.usage?.input_tokens !== undefined || body.usage?.output_tokens !== undefined
            ? {
                inputTokens: body.usage?.input_tokens ?? 0,
                outputTokens: body.usage?.output_tokens ?? 0,
              }
            : undefined,
      };
    },
  };
}
