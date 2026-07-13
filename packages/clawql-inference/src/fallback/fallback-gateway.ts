import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import type { FallbackConfig } from "./types.js";
import { completeWithFallbackProgram, runFallbackEffect } from "./effect/fallback-layer.js";

export class FallbackChainGateway implements InferenceGateway {
  constructor(
    private readonly inner: InferenceGateway,
    private readonly config: FallbackConfig
  ) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    return runFallbackEffect(
      completeWithFallbackProgram(request),
      this.inner,
      this.config
    );
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
