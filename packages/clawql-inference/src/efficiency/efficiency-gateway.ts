import type {
  InferenceGateway,
  InferenceRequest,
  InferenceResponse,
} from "../gateway.js";
import { loadTokenEfficiencyConfig, type TokenEfficiencyConfig } from "./config.js";
import { applyTerseOutput } from "./layer-3-terse.js";
import { applyPromptCacheMarkers } from "./layer-4-prompt-cache.js";
import { compressHistory } from "./layer-6-history.js";
import { compressPrompt } from "./layer-7-prompt.js";
import { resolveHttpRoutingDecision } from "./layer-8-routing.js";
import { applyExtensionLayers } from "./layer-9-11-extensions.js";

export type TokenEfficiencyGatewayOptions = {
  env?: NodeJS.ProcessEnv;
  config?: TokenEfficiencyConfig;
};

export class TokenEfficiencyGateway implements InferenceGateway {
  private readonly config: TokenEfficiencyConfig;

  constructor(
    private readonly inner: InferenceGateway,
    options: TokenEfficiencyGatewayOptions = {}
  ) {
    this.config = options.config ?? loadTokenEfficiencyConfig(options.env);
  }

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    const routing =
      request.routing ??
      resolveHttpRoutingDecision({
        model: request.model,
        config: this.config,
        seedId: request.correlationId,
      });

    let messages = [...request.messages];

    if (this.config.historyCompress.enabled) {
      messages = compressHistory(messages, this.config.historyCompress);
    }

    if (this.config.promptCompress.enabled) {
      messages = compressPrompt(messages, this.config.promptCompress);
    }

    if (this.config.promptCache.enabled) {
      ({ messages } = applyPromptCacheMarkers(messages));
    }

    const extensions = applyExtensionLayers({
      messages,
      maxTokens: request.maxTokens,
      structuredOutputEnabled: this.config.structuredOutput.enabled,
      tokenBudgetEnabled: this.config.tokenBudget.enabled,
      prefillEnabled: this.config.prefill.enabled,
      prefillOpener: this.config.prefill.opener,
    });
    messages = extensions.messages;

    const model = routing?.modelId ?? request.model;
    const response = await this.inner.complete({
      ...request,
      model,
      routing,
      messages,
      promptCacheEnabled: this.config.promptCache.enabled,
    });

    const content = this.config.terse.enabled
      ? applyTerseOutput(response.content)
      : response.content;

    return {
      ...response,
      content,
      model: response.model || model || "",
      routing: response.routing ?? routing,
    };
  }
}

export function withTokenEfficiency(
  gateway: InferenceGateway,
  options: TokenEfficiencyGatewayOptions = {}
): InferenceGateway {
  return new TokenEfficiencyGateway(gateway, options);
}
