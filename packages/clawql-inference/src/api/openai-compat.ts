import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import type { ChatMessage, InferenceGateway } from "../gateway.js";
import { getProviderAdapter } from "../providers/registry.js";
import type { InferenceProviderAdapter, ProviderRegistry } from "../providers/types.js";
import type { VirtualKeyRequest } from "./auth.js";
import { resolveRequestModel } from "./model-resolve.js";
import { createModelsHandlers } from "./models.js";
import { sendOpenAiError } from "./openai-errors.js";
import {
  openAiStreamHeaders,
  streamBufferedCompletion,
  streamCompletionAsOpenAiSse,
} from "./stream.js";
import {
  assertInferenceEntitlement,
  EntitlementLimitError,
  isInferenceEntitlementEnforcementActive,
  recordInferenceBilling,
  resolveInferenceTenantId,
} from "../entitlements/enforced-gateway.js";
import { isStripeMeterReportingActive } from "clawql-payments";
import { buildInferenceRecord, type InferenceStore } from "../store/types.js";

type OpenAiChatCompletionRequest = {
  model?: string;
  messages?: Array<Record<string, unknown> & { role?: string; content?: unknown }>;
  user?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  tools?: unknown[];
  tool_choice?: unknown;
  parallel_tool_calls?: boolean;
};

export type CreateOpenAiCompatRouterOptions = {
  gateway: InferenceGateway;
  registry?: ProviderRegistry;
  env?: NodeJS.ProcessEnv;
  /** When set, tool-calling passthrough (and other bypass paths) still append FT/observability records. */
  store?: InferenceStore | null;
};

async function recordPassthroughCall(opts: {
  store?: InferenceStore | null;
  messages: ChatMessage[];
  provider: string;
  model: string;
  publicModelId: string;
  correlationId?: string;
  team?: string;
  virtualKeyId?: string;
  latencyMs: number;
  responseContent: string;
  usage?: { inputTokens: number; outputTokens: number };
}): Promise<void> {
  if (!opts.store) return;
  try {
    await opts.store.append(
      buildInferenceRecord({
        id: randomUUID(),
        request: {
          messages: opts.messages,
          model: opts.publicModelId,
          correlationId: opts.correlationId,
          team: opts.team,
          virtualKeyId: opts.virtualKeyId,
        },
        response: {
          content: opts.responseContent,
          model: opts.publicModelId,
          usage: opts.usage,
          correlationId: opts.correlationId,
        },
        provider: opts.provider,
        model: opts.model,
        latencyMs: opts.latencyMs,
      })
    );
  } catch (error) {
    // Observability must not fail the client completion.
    console.warn(
      "[clawql-inference] failed to append passthrough call-store record:",
      error instanceof Error ? error.message : error
    );
  }
}

function usageFromOpenAiPayload(
  payload: Record<string, unknown>
): { inputTokens: number; outputTokens: number } | undefined {
  const usage = payload.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as Record<string, unknown>;
  const input = Number(u.prompt_tokens ?? u.input_tokens ?? 0);
  const output = Number(u.completion_tokens ?? u.output_tokens ?? 0);
  if (!Number.isFinite(input) && !Number.isFinite(output)) return undefined;
  return {
    inputTokens: Number.isFinite(input) ? input : 0,
    outputTokens: Number.isFinite(output) ? output : 0,
  };
}

function readCorrelationId(req: Request, body?: OpenAiChatCompletionRequest): string | undefined {
  const header =
    req.header("x-correlation-id") ??
    req.header("x-clawql-correlation-id") ??
    req.header("correlation-id");
  if (header?.trim()) return header.trim();
  return body?.user?.trim() || undefined;
}

function parseMessages(body: OpenAiChatCompletionRequest): ChatMessage[] | null {
  if (!Array.isArray(body.messages) || body.messages.length === 0) return null;
  return body.messages.map((message) => ({
    role: (message.role ?? "user") as ChatMessage["role"],
    content:
      typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? ""),
  }));
}

/** True when the client needs OpenAI tool calling that the text gateway strips. */
export function requestUsesToolCalling(body: OpenAiChatCompletionRequest): boolean {
  if (Array.isArray(body.tools) && body.tools.length > 0) return true;
  if (body.tool_choice !== undefined && body.tool_choice !== null && body.tool_choice !== "none") {
    return true;
  }
  if (!Array.isArray(body.messages)) return false;
  for (const message of body.messages) {
    if (!message || typeof message !== "object") continue;
    if (message.role === "tool") return true;
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) return true;
  }
  return false;
}

async function enforceAndBill(opts: {
  env: NodeJS.ProcessEnv;
  team?: string;
  correlationId?: string;
}): Promise<() => Promise<void>> {
  const tenantId = await resolveInferenceTenantId({ team: opts.team }, opts.env);
  const enforcementActive = isInferenceEntitlementEnforcementActive(opts.env);
  const billingActive = enforcementActive || isStripeMeterReportingActive(opts.env);
  if (enforcementActive) {
    await assertInferenceEntitlement({
      tenantId,
      correlationId: opts.correlationId,
      env: opts.env,
    });
  }
  return async () => {
    if (billingActive) {
      await recordInferenceBilling({
        tenantId,
        correlationId: opts.correlationId,
        env: opts.env,
      });
    }
  };
}

function rewritePublicModel(
  payload: Record<string, unknown>,
  publicModelId: string
): Record<string, unknown> {
  return { ...payload, model: publicModelId };
}

async function pipeUpstreamSse(
  res: Response,
  upstream: ReadableStream<Uint8Array>,
  opts: { correlationId?: string; publicModelId: string }
): Promise<void> {
  openAiStreamHeaders(res, opts.correlationId);
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const trimmed = line.replace(/\r$/, "");
        if (!trimmed.startsWith("data:")) {
          res.write(`${line}\n`);
          continue;
        }
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          res.write(`${trimmed}\n`);
          continue;
        }
        try {
          const parsed = JSON.parse(payload) as Record<string, unknown>;
          res.write(`data: ${JSON.stringify(rewritePublicModel(parsed, opts.publicModelId))}\n`);
        } catch {
          res.write(`${trimmed}\n`);
        }
      }
    }
    if (buffer.length > 0) {
      const trimmed = buffer.replace(/\r$/, "");
      if (trimmed.startsWith("data:")) {
        const payload = trimmed.slice(5).trim();
        if (payload && payload !== "[DONE]") {
          try {
            const parsed = JSON.parse(payload) as Record<string, unknown>;
            res.write(`data: ${JSON.stringify(rewritePublicModel(parsed, opts.publicModelId))}\n`);
          } catch {
            res.write(buffer);
          }
        } else {
          res.write(buffer);
        }
      } else {
        res.write(buffer);
      }
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}

async function tryToolCallingPassthrough(opts: {
  adapter: InferenceProviderAdapter;
  resolvedModel: string;
  publicModelId: string;
  body: OpenAiChatCompletionRequest;
  reqBody: Record<string, unknown>;
  res: Response;
  env: NodeJS.ProcessEnv;
  team?: string;
  virtualKeyId?: string;
  correlationId?: string;
  messages: ChatMessage[];
  store?: InferenceStore | null;
}): Promise<boolean> {
  if (!requestUsesToolCalling(opts.body)) return false;
  const stream = Boolean(opts.body.stream);
  const started = Date.now();
  if (stream) {
    if (!opts.adapter.proxyChatCompletionStream) {
      sendOpenAiError(
        opts.res,
        501,
        `Provider '${opts.adapter.provider}' does not support streaming tool calling passthrough`,
        "server_error"
      );
      return true;
    }
    const bill = await enforceAndBill({
      env: opts.env,
      team: opts.team,
      correlationId: opts.correlationId,
    });
    const upstream = await opts.adapter.proxyChatCompletionStream(opts.resolvedModel, opts.reqBody);
    await pipeUpstreamSse(opts.res, upstream, {
      correlationId: opts.correlationId,
      publicModelId: opts.publicModelId,
    });
    await bill();
    // Streaming bodies are not buffered here; record a slim companion line for correlation.
    await recordPassthroughCall({
      store: opts.store,
      messages: opts.messages,
      provider: opts.adapter.provider,
      model: opts.resolvedModel,
      publicModelId: opts.publicModelId,
      correlationId: opts.correlationId,
      team: opts.team,
      virtualKeyId: opts.virtualKeyId,
      latencyMs: Date.now() - started,
      responseContent: "[streamed tool-calling passthrough]",
    });
    return true;
  }

  if (!opts.adapter.proxyChatCompletion) {
    sendOpenAiError(
      opts.res,
      501,
      `Provider '${opts.adapter.provider}' does not support tool calling passthrough`,
      "server_error"
    );
    return true;
  }
  const bill = await enforceAndBill({
    env: opts.env,
    team: opts.team,
    correlationId: opts.correlationId,
  });
  const upstream = await opts.adapter.proxyChatCompletion(opts.resolvedModel, opts.reqBody);
  const rewritten = rewritePublicModel(upstream, opts.publicModelId);
  if (opts.correlationId) opts.res.setHeader("X-Correlation-Id", opts.correlationId);
  opts.res.json(rewritten);
  await bill();
  await recordPassthroughCall({
    store: opts.store,
    messages: opts.messages,
    provider: opts.adapter.provider,
    model: opts.resolvedModel,
    publicModelId: opts.publicModelId,
    correlationId: opts.correlationId,
    team: opts.team,
    virtualKeyId: opts.virtualKeyId,
    latencyMs: Date.now() - started,
    responseContent: JSON.stringify(rewritten),
    usage: usageFromOpenAiPayload(rewritten),
  });
  return true;
}

export function createOpenAiCompatRouter(options: CreateOpenAiCompatRouterOptions): express.Router {
  const router = express.Router();
  const registry = options.registry;
  const store = options.store;
  const models = registry ? createModelsHandlers(registry, options.env) : null;

  if (models) {
    router.get("/v1/models", models.list);
    router.get("/v1/models/:id", models.get);
  }

  router.post("/v1/chat/completions", async (req: VirtualKeyRequest, res: Response) => {
    const body = req.body as OpenAiChatCompletionRequest;
    const correlationId = readCorrelationId(req, body);
    const keyContext = req.virtualKey;
    const modelRaw = body.model?.trim();
    if (!modelRaw) {
      sendOpenAiError(res, 400, "model is required", "invalid_request_error");
      return;
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      sendOpenAiError(res, 400, "messages is required", "invalid_request_error");
      return;
    }

    const messages = parseMessages(body);
    if (!messages) {
      sendOpenAiError(res, 400, "messages is required", "invalid_request_error");
      return;
    }

    const resolved = registry ? resolveRequestModel(modelRaw, registry) : null;
    const gatewayModelId = resolved?.gatewayModelId ?? modelRaw;
    const publicModelId = resolved?.publicModelId ?? modelRaw;

    if (registry && !resolved) {
      sendOpenAiError(res, 404, `Model '${modelRaw}' is not available`, "invalid_request_error");
      return;
    }

    const cacheIntentHeader = req.header("x-clawql-cache-intent")?.trim().toLowerCase();
    const cacheIntent =
      cacheIntentHeader === "read" || cacheIntentHeader === "write" ? cacheIntentHeader : undefined;

    const completeOptions = {
      temperature: body.temperature,
      maxTokens: body.max_tokens,
      topP: body.top_p,
      stop: body.stop,
    };

    try {
      const env = options.env ?? process.env;

      if (resolved && registry && requestUsesToolCalling(body)) {
        const adapter = getProviderAdapter(registry, resolved.provider);
        if (adapter) {
          const handled = await tryToolCallingPassthrough({
            adapter,
            resolvedModel: resolved.model,
            publicModelId,
            body,
            reqBody: (req.body ?? {}) as Record<string, unknown>,
            res,
            env,
            team: keyContext?.team,
            virtualKeyId: keyContext?.id,
            correlationId,
            messages,
            store,
          });
          if (handled) return;
        }
      }

      if (body.stream) {
        const completionId = `chatcmpl-${randomUUID()}`;
        const created = Math.floor(Date.now() / 1000);

        if (resolved && registry) {
          const adapter = getProviderAdapter(registry, resolved.provider);
          if (adapter?.streamComplete) {
            const bill = await enforceAndBill({
              env,
              team: keyContext?.team,
              correlationId,
            });
            const started = Date.now();
            await streamCompletionAsOpenAiSse(res, {
              completionId,
              model: publicModelId,
              created,
              correlationId,
              chunks: adapter.streamComplete(resolved.model, messages, completeOptions),
            });
            await bill();
            await recordPassthroughCall({
              store,
              messages,
              provider: resolved.provider,
              model: resolved.model,
              publicModelId,
              correlationId,
              team: keyContext?.team,
              virtualKeyId: keyContext?.id,
              latencyMs: Date.now() - started,
              responseContent: "[streamed adapter completion]",
            });
            return;
          }
        }

        const result = await options.gateway.complete({
          model: gatewayModelId,
          messages,
          correlationId,
          team: keyContext?.team,
          virtualKeyId: keyContext?.id,
          maxTokens: body.max_tokens,
          cacheIntent,
        });
        await streamBufferedCompletion(res, {
          model: publicModelId,
          correlationId,
          result: { ...result, model: publicModelId },
        });
        return;
      }

      const result = await options.gateway.complete({
        model: gatewayModelId,
        messages,
        correlationId,
        team: keyContext?.team,
        virtualKeyId: keyContext?.id,
        maxTokens: body.max_tokens,
        cacheIntent,
      });

      if (correlationId) res.setHeader("X-Correlation-Id", correlationId);

      res.json({
        id: `chatcmpl-${randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: publicModelId,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: result.content },
            finish_reason: "stop",
          },
        ],
        usage: result.usage
          ? {
              prompt_tokens: result.usage.inputTokens,
              completion_tokens: result.usage.outputTokens,
              total_tokens: result.usage.inputTokens + result.usage.outputTokens,
            }
          : undefined,
      });
    } catch (error) {
      if (error instanceof EntitlementLimitError) {
        sendOpenAiError(res, 402, error.message, "insufficient_quota");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      sendOpenAiError(res, 502, message, "server_error");
    }
  });

  return router;
}
