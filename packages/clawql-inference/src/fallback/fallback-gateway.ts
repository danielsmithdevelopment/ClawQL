import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import type { FallbackConfig } from "./types.js";
import { resolveFallbackChain } from "./resolve.js";

export class FallbackChainGateway implements InferenceGateway {
  constructor(
    private readonly inner: InferenceGateway,
    private readonly config: FallbackConfig
  ) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    if (!this.config.enabled) {
      return this.inner.complete(request);
    }

    const chain = resolveFallbackChain(request, this.config.chains);
    if (chain.length <= 1) {
      return this.inner.complete(request);
    }

    const attempted: string[] = [];
    let lastError: unknown;

    for (const modelId of chain) {
      attempted.push(modelId);
      try {
        const response = await this.inner.complete({ ...request, model: modelId });
        const primary = request.model ?? request.routing?.modelId ?? modelId;
        if (modelId === primary) {
          return response;
        }
        return {
          ...response,
          model: response.model || modelId,
          fallback: { attempted, succeeded: modelId },
        };
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error(`All fallback models failed (${attempted.join(" → ")}): ${String(lastError)}`);
  }
}

export type WithFallbackChainOptions = {
  env?: NodeJS.ProcessEnv;
  config?: FallbackConfig;
};

export function withFallbackChain(
  gateway: InferenceGateway,
  options: WithFallbackChainOptions = {}
): InferenceGateway {
  const config = options.config;
  if (!config?.enabled) return gateway;
  return new FallbackChainGateway(gateway, config);
}

export function isFallbackChainGateway(gateway: InferenceGateway): gateway is FallbackChainGateway {
  return gateway instanceof FallbackChainGateway;
}
