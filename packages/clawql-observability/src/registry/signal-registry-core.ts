import { Effect, Ref } from "effect";

import { ObservabilityError } from "../errors.js";
import type {
  RegisteredProvider,
  SignalProvider,
  SignalRegistrySnapshot,
  ProviderConfig,
} from "../providers/types.js";

export type SignalRegistryService<T extends SignalProvider> = {
  readonly register: (
    provider: T,
    config: ProviderConfig
  ) => Effect.Effect<void, ObservabilityError>;
  readonly remove: (providerId: string) => Effect.Effect<void, ObservabilityError>;
  readonly list: () => Effect.Effect<readonly RegisteredProvider<T>[], never>;
  readonly snapshot: () => Effect.Effect<SignalRegistrySnapshot<T>, never>;
  readonly updateConfig: (
    providerId: string,
    config: ProviderConfig
  ) => Effect.Effect<void, ObservabilityError>;
  readonly get: (providerId: string) => Effect.Effect<RegisteredProvider<T>, ObservabilityError>;
};

const cloneSnapshot = <T extends SignalProvider>(
  providers: readonly RegisteredProvider<T>[]
): SignalRegistrySnapshot<T> => ({
  providers: providers.map((entry) => ({
    ...entry,
    config: { ...entry.config },
  })),
});

export const makeSignalRegistryService = <T extends SignalProvider>(
  initial?: SignalRegistrySnapshot<T>
): Effect.Effect<SignalRegistryService<T>> =>
  Effect.gen(function* () {
    const state = yield* Ref.make<readonly RegisteredProvider<T>[]>(initial?.providers ?? []);

    const register = (provider: T, config: ProviderConfig) =>
      Effect.gen(function* () {
        if (provider.id.trim() === "") {
          return yield* Effect.fail(
            new ObservabilityError({ reason: "provider id must not be empty" })
          );
        }

        const existing = yield* Ref.get(state);
        if (existing.some((entry) => entry.id === provider.id)) {
          return yield* Effect.fail(
            new ObservabilityError({
              reason: `provider already registered: ${provider.id}`,
            })
          );
        }

        yield* provider.initialize(config);
        yield* Ref.update(state, (entries) => [
          ...entries,
          {
            id: provider.id,
            name: provider.name,
            config,
            provider,
            enabled: config.enabled !== false,
          },
        ]);
      });

    const remove = (providerId: string) =>
      Effect.gen(function* () {
        const existing = yield* Ref.get(state);
        if (!existing.some((entry) => entry.id === providerId)) {
          return yield* Effect.fail(
            new ObservabilityError({ reason: `provider not found: ${providerId}` })
          );
        }
        yield* Ref.update(state, (entries) => entries.filter((entry) => entry.id !== providerId));
      });

    const list = () =>
      Effect.gen(function* () {
        const providers = yield* Ref.get(state);
        return cloneSnapshot(providers).providers;
      });

    const snapshot = () =>
      Effect.gen(function* () {
        const providers = yield* Ref.get(state);
        return cloneSnapshot(providers);
      });

    const updateConfig = (providerId: string, config: ProviderConfig) =>
      Effect.gen(function* () {
        const existing = yield* Ref.get(state);
        const index = existing.findIndex((entry) => entry.id === providerId);
        if (index < 0) {
          return yield* Effect.fail(
            new ObservabilityError({ reason: `provider not found: ${providerId}` })
          );
        }

        const current = existing[index]!;
        yield* current.provider.initialize(config);
        const next: RegisteredProvider<T> = {
          ...current,
          config,
          enabled: config.enabled !== false,
        };
        yield* Ref.update(state, (entries) =>
          entries.map((entry) => (entry.id === providerId ? next : entry))
        );
      });

    const get = (providerId: string) =>
      Effect.gen(function* () {
        const existing = yield* Ref.get(state);
        const match = existing.find((entry) => entry.id === providerId);
        if (!match) {
          return yield* Effect.fail(
            new ObservabilityError({ reason: `provider not found: ${providerId}` })
          );
        }
        return {
          ...match,
          config: { ...match.config },
        };
      });

    return { register, remove, list, snapshot, updateConfig, get };
  });
