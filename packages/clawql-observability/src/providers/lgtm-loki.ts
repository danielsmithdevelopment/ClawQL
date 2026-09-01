import { Effect, Ref } from "effect";

import { probeEndpointHealthEffect } from "./health-probe.js";
import type { LogProvider, ProviderConfig } from "./types.js";

export const LGTM_LOKI_PROVIDER_ID = "lgtm-loki";

export const defaultLokiProviderConfig = (): ProviderConfig => ({
  endpoint: "http://loki:3100",
  enabled: true,
  probeReachability: false,
});

export const createLokiLogProvider = (): LogProvider => {
  const configRef = Ref.unsafeMake<ProviderConfig>(defaultLokiProviderConfig());

  return {
    id: LGTM_LOKI_PROVIDER_ID,
    name: "LGTM+ Loki",
    signalType: "log",
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
