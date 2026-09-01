import { Effect, Ref } from "effect";

import { probeEndpointHealthEffect } from "./health-probe.js";
import type { ProviderConfig, TraceProvider } from "./types.js";

export const LGTM_TEMPO_PROVIDER_ID = "lgtm-tempo";

export const createTempoTraceProvider = (): TraceProvider => {
  const configRef = Ref.unsafeMake<ProviderConfig>(defaultTempoProviderConfig());

  return {
    id: LGTM_TEMPO_PROVIDER_ID,
    name: "LGTM+ Tempo",
    signalType: "trace",
    initialize: (config) =>
      Effect.gen(function* () {
        yield* Ref.set(configRef, config);
      }),
    health: () =>
      Effect.gen(function* () {
        const config = yield* Ref.get(configRef);
        if (config.enabled === false) {
          return { status: "degraded", details: "provider disabled" };
        }
        return yield* probeEndpointHealthEffect({
          config,
          readyPath: "/ready",
        });
      }),
  };
};

export const defaultTempoProviderConfig = (): ProviderConfig => ({
  endpoint: "http://tempo:3200",
  enabled: true,
  probeReachability: false,
});
