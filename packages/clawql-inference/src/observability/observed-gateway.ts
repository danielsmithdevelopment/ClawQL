import { randomUUID } from "node:crypto";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import { estimateCostUsd } from "../keys/budget.js";
import { recordKeySpend } from "../keys/store.js";
import { parseModelId } from "../providers/parse-model-id.js";
import { buildInferenceRecord } from "../store/types.js";
import type { InferenceStore } from "../store/types.js";
import { tokenizeChatMessagesAsync } from "../tokenize/messages.js";

/** Gateway decorator that persists every successful completion to an {@link InferenceStore}. */
export class ObservedInferenceGateway implements InferenceGateway {
  constructor(
    private readonly inner: InferenceGateway,
    private readonly store: InferenceStore,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    const started = Date.now();
    const response = await this.inner.complete(request);
    const modelId = request.model ?? request.routing?.modelId ?? response.model;
    const { provider, model } = parseModelId(modelId);
    const messages = await tokenizeChatMessagesAsync(request.messages, this.env);
    await this.store.append(
      buildInferenceRecord({
        id: randomUUID(),
        request: { ...request, messages },
        response,
        provider,
        model,
        latencyMs: Date.now() - started,
      })
    );
    if (request.virtualKeyId) {
      const cost = estimateCostUsd(response.usage);
      await recordKeySpend(request.virtualKeyId, cost, this.env);
    }
    return response;
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
