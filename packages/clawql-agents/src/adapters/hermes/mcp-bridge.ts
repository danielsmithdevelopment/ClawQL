import { Effect } from "effect";
import type { ATRScope } from "../../shared/types.js";

export type HermesInferenceProxyConfig = {
  readonly hermesOpenAiBaseUrl: string;
  readonly clawqlInferenceEndpoint: string;
  readonly atrScope: ATRScope;
  readonly note: string;
};

/**
 * Hermes exposes an OpenAI-compatible endpoint; operators point clients at ClawQL
 * inference (or a proxy) so Panguard + WORM apply before the model.
 */
export const buildHermesMcpBridgeConfig = (input: {
  readonly hermesOpenAiBaseUrl: string;
  readonly clawqlInferenceEndpoint: string;
  readonly atrScope: ATRScope;
}): Effect.Effect<HermesInferenceProxyConfig> =>
  Effect.sync(() => ({
    hermesOpenAiBaseUrl: input.hermesOpenAiBaseUrl,
    clawqlInferenceEndpoint: input.clawqlInferenceEndpoint,
    atrScope: input.atrScope,
    note: "Route Hermes OpenAI-compatible traffic via clawql-inference; ATR enforced at MCP/Panguard edge.",
  }));

/** Path to the packaged Python WORMInstrumentedAgent relative to package root. */
export const HERMES_WORM_AGENT_MODULE = "python/hermes/worm_agent.py";

export const hermesRuntimeClassHint = (installPath: string): Effect.Effect<string> =>
  Effect.succeed(`${installPath}.WORMInstrumentedAgent`);
