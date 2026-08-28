import { Context, Effect, Layer } from "effect";

import { AnalyticsError } from "./errors.js";
import {
  AnalyticsRegistryService,
  AnalyticsRegistryServiceLive,
  createAnalyticsRegistryLayer,
} from "./registry.js";
import type { AnalyticsProvider, CustomEvent, PageviewEvent, ProviderHealth } from "./types.js";

export class AnalyticsService extends Context.Tag("clawql/AnalyticsService")<
  AnalyticsService,
  {
    readonly pageview: (event: PageviewEvent) => Effect.Effect<void, AnalyticsError>;
    readonly capture: (event: CustomEvent) => Effect.Effect<void, AnalyticsError>;
    readonly identify: (
      sessionId: string,
      traits?: Record<string, unknown>
    ) => Effect.Effect<void, AnalyticsError>;
    readonly health: () => Effect.Effect<ProviderHealth, AnalyticsError>;
  }
>() {}

export const AnalyticsServiceLive = Layer.effect(
  AnalyticsService,
  Effect.gen(function* () {
    const registry = yield* AnalyticsRegistryService;

    const withActive = <A>(
      run: (provider: AnalyticsProvider) => Effect.Effect<A, AnalyticsError>
    ): Effect.Effect<A, AnalyticsError> =>
      Effect.gen(function* () {
        const active = yield* registry.getActive();
        if (!active) {
          return yield* Effect.fail(
            new AnalyticsError({ reason: "No active analytics provider configured" })
          );
        }
        return yield* run(active);
      });

    return AnalyticsService.of({
      pageview: (event) => withActive((provider) => provider.pageview(event)),
      capture: (event) => withActive((provider) => provider.capture(event)),
      identify: (sessionId, traits) => withActive((provider) => provider.identify(sessionId, traits)),
      health: () => withActive((provider) => provider.health()),
    });
  })
);

/** Composed live layer: registry + capture service (both tags exported). */
export const AnalyticsLive = Layer.merge(
  AnalyticsRegistryServiceLive,
  AnalyticsServiceLive.pipe(Layer.provide(AnalyticsRegistryServiceLive))
);

export function createAnalyticsLayer(
  registryLayer: Layer.Layer<AnalyticsRegistryService>
): Layer.Layer<AnalyticsRegistryService | AnalyticsService> {
  return Layer.merge(
    registryLayer,
    AnalyticsServiceLive.pipe(Layer.provide(registryLayer))
  );
}

export { createAnalyticsRegistryLayer };
