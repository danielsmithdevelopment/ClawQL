import type { ChatMessage } from "../../gateway.js";
import { readHttpError } from "../../providers/http.js";
import type {
  InferenceCompleteOptions,
  InferenceProviderAdapter,
  ProviderAdapterConfig,
} from "../../providers/types.js";

type OpenAiChatResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function buildRequestBody(
  model: string,
  messages: ChatMessage[],
  options?: InferenceCompleteOptions & { stream?: boolean }
): Record<string, unknown> {
  const body: Record<string, unknown> = { model, messages };
  if (options?.stream) body.stream = true;
  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
  if (options?.topP !== undefined) body.top_p = options.topP;
  if (options?.stop !== undefined) body.stop = options.stop;
  return body;
}

async function* parseOpenAiSseStream(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const text = parsed.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

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
        body: JSON.stringify(buildRequestBody(model, messages, options)),
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
    async *streamComplete(model, messages, options) {
      if (!config.apiKey) {
        throw new Error("OPENAI_API_KEY is required for openai provider");
      }
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildRequestBody(model, messages, { ...options, stream: true })),
        signal: options?.signal,
      });
      if (!res.ok) {
        throw new Error(`openai HTTP ${res.status}: ${await readHttpError(res)}`);
      }
      if (!res.body) {
        throw new Error("openai stream response missing body");
      }
      yield* parseOpenAiSseStream(res.body);
    },
  };
}

export function toOpenAiMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages;
}
