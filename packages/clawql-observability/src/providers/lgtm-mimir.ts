import { Effect, Ref } from "effect";

import { probeEndpointHealthEffect } from "./health-probe.js";
import type { MetricProvider, ProviderConfig } from "./types.js";

export const LGTM_MIMIR_PROVIDER_ID = "lgtm-mimir";

export const createMimirMetricProvider = (): MetricProvider => {
  const configRef = Ref.unsafeMake<ProviderConfig>(defaultMimirProviderConfig());

  return {
    id: LGTM_MIMIR_PROVIDER_ID,
    name: "LGTM+ Mimir",
    signalType: "metric",
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

export const defaultMimirProviderConfig = (): ProviderConfig => ({
  endpoint: "http://mimir:9009",
  tenantId: "anonymous",
  enabled: true,
  probeReachability: false,
});
