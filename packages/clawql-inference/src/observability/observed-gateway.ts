import { randomUUID } from "node:crypto";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import { parseModelId } from "../providers/parse-model-id.js";
import { buildInferenceRecord } from "../store/types.js";
import type { InferenceStore } from "../store/types.js";

/** Gateway decorator that persists every successful completion to an {@link InferenceStore}. */
export class ObservedInferenceGateway implements InferenceGateway {
  constructor(
    private readonly inner: InferenceGateway,
    private readonly store: InferenceStore
  ) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    const started = Date.now();
    const response = await this.inner.complete(request);
    const modelId = request.model ?? request.routing?.modelId ?? response.model;
    const { provider, model } = parseModelId(modelId);
    await this.store.append(
      buildInferenceRecord({
        id: randomUUID(),
        request,
        response,
        provider,
        model,
        latencyMs: Date.now() - started,
      })
    );
    return response;
  }
}

export function withInferenceStore(
  gateway: InferenceGateway,
  store: InferenceStore | null | undefined
): InferenceGateway {
  if (!store) return gateway;
  return new ObservedInferenceGateway(gateway, store);
}
