import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import { withInferenceSpan } from "./otel-tracing.js";

function estimateMessageChars(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

/** Gateway decorator emitting OTLP spans for each completion (Langfuse + infra backends). */
export class TracedInferenceGateway implements InferenceGateway {
  constructor(
    private readonly inner: InferenceGateway,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    const modelId = request.model ?? request.routing?.modelId ?? "unknown";
    const planningChars = estimateMessageChars(request.messages);

    return withInferenceSpan(
      "inference.complete",
      {
        "clawql.correlation_id": request.correlationId,
        "clawql.tool_name": "inference.complete",
        "clawql.planning_bytes": planningChars,
        "gen_ai.request.model": modelId,
        "gen_ai.system": "clawql-inference",
        "clawql.cache_intent": request.cacheIntent,
        "clawql.team": request.team,
      },
      async (span) => {
        const started = Date.now();
        const response = await this.inner.complete(request);
        const latencyMs = Date.now() - started;

        span.setAttribute("gen_ai.response.model", response.model);
        span.setAttribute("clawql.cache_hit", Boolean(response.cacheHit));
        span.setAttribute("clawql.latency_ms", latencyMs);
        if (response.routing?.tier) {
          span.setAttribute("clawql.routing.tier", response.routing.tier);
        }
        if (response.usage) {
          span.setAttribute("gen_ai.usage.input_tokens", response.usage.inputTokens);
          span.setAttribute("gen_ai.usage.output_tokens", response.usage.outputTokens);
        }
        if (response.cacheHit && response.usage) {
          const saved = response.usage.inputTokens + response.usage.outputTokens;
          span.setAttribute("clawql.token_savings_estimate", saved);
        }

        return response;
      }
    );
  }
}

export function withInferenceTracing(
  gateway: InferenceGateway,
  env: NodeJS.ProcessEnv = process.env
): InferenceGateway {
  if (!gateway) return gateway;
  return new TracedInferenceGateway(gateway, env);
}
