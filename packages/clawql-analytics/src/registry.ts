import { Context, Effect, Layer } from "effect";

import { AnalyticsError } from "./errors.js";
import type {
  AnalyticsProvider,
  AnalyticsRegistrySnapshot,
  ProviderConfig,
  RegisteredProvider,
} from "./types.js";

export class AnalyticsRegistryService extends Context.Tag("clawql/AnalyticsRegistryService")<
  AnalyticsRegistryService,
  {
    readonly register: (
      provider: AnalyticsProvider,
      config: ProviderConfig
    ) => Effect.Effect<void, AnalyticsError>;
    readonly remove: (providerId: string) => Effect.Effect<void, AnalyticsError>;
    readonly setActive: (providerId: string) => Effect.Effect<void, AnalyticsError>;
    readonly getActive: () => Effect.Effect<AnalyticsProvider | null, AnalyticsError>;
    readonly getActiveRegistered: () => Effect.Effect<RegisteredProvider | null, AnalyticsError>;
    readonly list: () => Effect.Effect<readonly RegisteredProvider[], AnalyticsError>;
    readonly snapshot: () => Effect.Effect<AnalyticsRegistrySnapshot, AnalyticsError>;
    readonly updateConfig: (
      providerId: string,
      config: ProviderConfig
    ) => Effect.Effect<void, AnalyticsError>;
  }
>() {}

export function createAnalyticsRegistryLayer(
  initial?: AnalyticsRegistrySnapshot
): Layer.Layer<AnalyticsRegistryService> {
  return Layer.sync(AnalyticsRegistryService, () => {
    const state: {
      activeProviderId: string | null;
      providers: Map<string, RegisteredProvider>;
    } = {
      activeProviderId: initial?.activeProviderId ?? null,
      providers: new Map(
        (initial?.providers ?? []).map((p) => [p.id, { ...p, provider: p.provider }])
      ),
    };

    const getRegistered = (providerId: string): Effect.Effect<RegisteredProvider, AnalyticsError> =>
      Effect.gen(function* () {
        const row = state.providers.get(providerId);
        if (!row) {
          return yield* Effect.fail(
            new AnalyticsError({ reason: `Unknown analytics provider: ${providerId}` })
          );
        }
        return row;
      });

    return AnalyticsRegistryService.of({
      register: (provider, config) =>
        Effect.gen(function* () {
          if (state.providers.has(provider.id)) {
            return yield* Effect.fail(
              new AnalyticsError({
                reason: `Analytics provider already registered: ${provider.id}`,
              })
            );
          }
          yield* provider.initialize(config);
          state.providers.set(provider.id, {
            id: provider.id,
            name: provider.name,
            config,
            provider,
          });
          if (state.activeProviderId === null) {
            state.activeProviderId = provider.id;
          }
        }),

      remove: (providerId) =>
        Effect.gen(function* () {
          if (!state.providers.has(providerId)) {
            return yield* Effect.fail(
              new AnalyticsError({ reason: `Unknown analytics provider: ${providerId}` })
            );
          }
          state.providers.delete(providerId);
          if (state.activeProviderId === providerId) {
            state.activeProviderId = state.providers.keys().next().value ?? null;
          }
        }),

      setActive: (providerId) =>
        Effect.gen(function* () {
          yield* getRegistered(providerId);
          state.activeProviderId = providerId;
        }),

      getActive: () =>
        Effect.sync(() => {
          if (!state.activeProviderId) return null;
          return state.providers.get(state.activeProviderId)?.provider ?? null;
        }),

      getActiveRegistered: () =>
        Effect.sync(() => {
          if (!state.activeProviderId) return null;
          return state.providers.get(state.activeProviderId) ?? null;
        }),

      list: () => Effect.sync(() => [...state.providers.values()]),

      snapshot: () =>
        Effect.sync(() => ({
          activeProviderId: state.activeProviderId,
          providers: [...state.providers.values()],
        })),

      updateConfig: (providerId, config) =>
        Effect.gen(function* () {
          const row = yield* getRegistered(providerId);
          yield* row.provider.initialize(config);
          state.providers.set(providerId, { ...row, config });
        }),
    });
  });
}

export const AnalyticsRegistryServiceLive = createAnalyticsRegistryLayer();
