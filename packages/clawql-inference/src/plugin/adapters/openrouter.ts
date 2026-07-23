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

export type OpenRouterAdapterConfig = ProviderAdapterConfig & {
  /** Optional OpenRouter app attribution (HTTP-Referer). */
  httpReferer?: string;
  /** Optional OpenRouter app title (X-Title). */
  appTitle?: string;
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

function authHeaders(config: OpenRouterAdapterConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (config.httpReferer?.trim()) {
    headers["HTTP-Referer"] = config.httpReferer.trim();
  }
  if (config.appTitle?.trim()) {
    headers["X-Title"] = config.appTitle.trim();
  }
  return headers;
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

/**
 * OpenRouter is OpenAI-compatible chat completions with multi-segment model ids
 * (`deepseek/deepseek-chat`, `qwen/qwen3.6-plus`, …). ClawQL model refs are
 * `openrouter/<vendor>/<model>` — the adapter receives the suffix after the
 * first slash as `model`.
 */
export function createOpenRouterAdapter(config: OpenRouterAdapterConfig): InferenceProviderAdapter {
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  return {
    provider: "openrouter",
    async complete(model, messages, options) {
      if (!config.apiKey) {
        throw new Error("OPENROUTER_API_KEY is required for openrouter provider");
      }
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify(buildRequestBody(model, messages, options)),
        signal: options?.signal,
      });
      if (!res.ok) {
        throw new Error(`openrouter HTTP ${res.status}: ${await readHttpError(res)}`);
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
        throw new Error("OPENROUTER_API_KEY is required for openrouter provider");
      }
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify(buildRequestBody(model, messages, { ...options, stream: true })),
        signal: options?.signal,
      });
      if (!res.ok) {
        throw new Error(`openrouter HTTP ${res.status}: ${await readHttpError(res)}`);
      }
      if (!res.body) {
        throw new Error("openrouter stream response missing body");
      }
      yield* parseOpenAiSseStream(res.body);
    },
  };
}
