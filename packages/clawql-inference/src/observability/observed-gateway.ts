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

/**
 * Audit 6.04 / X5: charge the upstream model that answered, preferring a
 * provider-qualified id (gateway already qualifies bare response.model).
 */
function resolveBillableModelId(request: InferenceRequest, response?: InferenceResponse): string {
  const fromResponse = response?.model?.trim();
  if (fromResponse) {
    if (fromResponse.includes("/")) return fromResponse;
    // Bare name: qualify from the request's resolved provider when possible.
    try {
      const requested = resolveRequestModelId(request);
      const { provider } = parseModelId(requested);
      if (provider && provider !== "openai") return `${provider}/${fromResponse}`;
      // Bare openai default from parseModelId is often wrong for ollama — keep response as-is
      // only when request was also bare/openai; otherwise attach request provider.
      if (requested.includes("/")) {
        return `${provider}/${fromResponse}`;
      }
    } catch {
      /* fall through */
    }
    return fromResponse;
  }
  return resolveRequestModelId(request);
}

function wormAppendRequired(env: NodeJS.ProcessEnv): boolean {
  if (env.CLAWQL_TIER?.trim().toLowerCase() === "regulated") return true;
  const raw = env.CLAWQL_WORM_REQUIRED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function appendInferenceCallWorm(
  request: InferenceRequest,
  modelId: string,
  provider: string,
  model: string,
  env: NodeJS.ProcessEnv
): Effect.Effect<void, Error> {
  const write = appendInferenceCallToWormEffect({
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
    Effect.mapError((err) => new Error(err.reason || "inference WORM call append failed")),
    Effect.asVoid
  );
  // Audit 6.05: gated — refuse when required; best-effort otherwise.
  if (wormAppendRequired(env)) return write;
  return write.pipe(Effect.catch(() => Effect.void));
}

function appendInferenceResultWorm(
  input: {
    request: InferenceRequest;
    response?: InferenceResponse;
    modelId: string;
    provider: string;
    ok: boolean;
    latencyMs: number;
    detail?: string;
  },
  env: NodeJS.ProcessEnv
): Effect.Effect<void, Error> {
  const write = appendInferenceResultToWormEffect({
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
    Effect.mapError((err) => new Error(err.reason || "inference WORM result append failed")),
    Effect.asVoid
  );
  if (wormAppendRequired(env)) return write;
  return write.pipe(Effect.catch(() => Effect.void));
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

    await Effect.runPromise(appendInferenceCallWorm(request, modelId, provider, model, this.env));

    try {
      const response = await this.inner.complete(request);
      // Audit 6.04: bill the model that ran, not the alias requested.
      const billableModelId = resolveBillableModelId(request, response);
      const parsed = parseModelId(billableModelId);
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
        const cost = estimateCostUsd(response.usage, billableModelId);
        await recordKeySpend(request.virtualKeyId, cost, this.env);
      }

      await Effect.runPromise(
        appendInferenceResultWorm(
          {
            request,
            response,
            modelId: billableModelId,
            provider: parsed.provider,
            ok: true,
            latencyMs: Date.now() - started,
          },
          this.env
        )
      );

      return response;
    } catch (err: unknown) {
      await Effect.runPromise(
        appendInferenceResultWorm(
          {
            request,
            modelId,
            provider,
            ok: false,
            latencyMs: Date.now() - started,
            detail: err instanceof Error ? err.message : String(err),
          },
          this.env
        )
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
