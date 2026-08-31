import { Effect, Ref } from "effect";

import { probeEndpointHealthEffect } from "./health-probe.js";
import type { ProfileProvider, ProviderConfig } from "./types.js";

export const LGTM_PYROSCOPE_PROVIDER_ID = "lgtm-pyroscope";

export const createPyroscopeProfileProvider = (): ProfileProvider => {
  const configRef = Ref.unsafeMake<ProviderConfig>(defaultPyroscopeProviderConfig());

  return {
    id: LGTM_PYROSCOPE_PROVIDER_ID,
    name: "LGTM+ Pyroscope",
    signalType: "profile",
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

export const defaultPyroscopeProviderConfig = (): ProviderConfig => ({
  endpoint: "http://pyroscope:4040",
  enabled: true,
  probeReachability: false,
});
