import { randomUUID } from "node:crypto";
import { appendInferenceCallToWormEffect, appendInferenceResultToWormEffect } from "clawql-audit";
import { Effect } from "effect";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import { estimateCostUsd } from "../keys/budget.js";
import { recordKeySpend } from "../keys/store.js";
import { parseModelId } from "../providers/parse-model-id.js";
import { buildInferenceRecord } from "../store/types.js";
import type { InferenceStore } from "../store/types.js";
import { tokenizeChatMessagesAsync } from "../tokenize/messages.js";

function resolveRequestModelId(request: InferenceRequest): string {
  return request.model ?? request.routing?.modelId ?? "unknown";
}

function appendInferenceCallWorm(
  request: InferenceRequest,
  modelId: string,
  provider: string,
  model: string
): Effect.Effect<void> {
  return appendInferenceCallToWormEffect({
    correlationId: request.correlationId,
    modelId,
    provider,
    model,
    tier: request.routing?.tier,
    team: request.team,
    tenantId: request.tenantId,
    virtualKeyId: request.virtualKeyId,
    messageCount: request.messages.length,
    cacheIntent: request.cacheIntent,
  }).pipe(
    Effect.catchAll(() => Effect.void),
    Effect.asVoid
  );
}

function appendInferenceResultWorm(input: {
  request: InferenceRequest;
  response?: InferenceResponse;
  modelId: string;
  provider: string;
  ok: boolean;
  latencyMs: number;
  detail?: string;
}): Effect.Effect<void> {
  return appendInferenceResultToWormEffect({
    correlationId: input.request.correlationId ?? input.response?.correlationId,
    modelId: input.response?.model ?? input.modelId,
    provider: input.provider,
    tier: input.request.routing?.tier ?? input.response?.routing?.tier,
    virtualKeyId: input.request.virtualKeyId,
    ok: input.ok,
    latencyMs: input.latencyMs,
    cacheHit: input.response?.cacheHit,
    inputTokens: input.response?.usage?.inputTokens,
    outputTokens: input.response?.usage?.outputTokens,
    detail: input.detail,
  }).pipe(
    Effect.catchAll(() => Effect.void),
    Effect.asVoid
  );
}

/** Gateway decorator that persists every completion to an {@link InferenceStore}. */
export class ObservedInferenceGateway implements InferenceGateway {
  constructor(
    private readonly inner: InferenceGateway,
    private readonly store: InferenceStore,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    const started = Date.now();
    const modelId = resolveRequestModelId(request);
    const { provider, model } = parseModelId(modelId);

    await Effect.runPromise(appendInferenceCallWorm(request, modelId, provider, model));

    try {
      const response = await this.inner.complete(request);
      const resolvedModelId = request.model ?? request.routing?.modelId ?? response.model;
      const parsed = parseModelId(resolvedModelId);
      const messages = await tokenizeChatMessagesAsync(request.messages, this.env);

      await this.store.append(
        buildInferenceRecord({
          id: randomUUID(),
          request: { ...request, messages },
          response,
          provider: parsed.provider,
          model: parsed.model,
          latencyMs: Date.now() - started,
        })
      );

      if (request.virtualKeyId) {
        const cost = estimateCostUsd(response.usage);
        await recordKeySpend(request.virtualKeyId, cost, this.env);
      }

      await Effect.runPromise(
        appendInferenceResultWorm({
          request,
          response,
          modelId: resolvedModelId,
          provider: parsed.provider,
          ok: true,
          latencyMs: Date.now() - started,
        })
      );

      return response;
    } catch (err: unknown) {
      await Effect.runPromise(
        appendInferenceResultWorm({
          request,
          modelId,
          provider,
          ok: false,
          latencyMs: Date.now() - started,
          detail: err instanceof Error ? err.message : String(err),
        })
      );
      throw err;
    }
  }
}

export function withInferenceStore(
  gateway: InferenceGateway,
  store: InferenceStore | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): InferenceGateway {
  if (!store) return gateway;
  return new ObservedInferenceGateway(gateway, store, env);
}
