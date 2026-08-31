import { Effect } from "effect";

import { ObservabilityError } from "../errors.js";
import type {
  ProviderConfig,
  RegisteredProvider,
  SignalProvider,
} from "../providers/types.js";
import type { FederatedQuerySelection } from "./types.js";

export const resolveQueryEndpointEffect = (
  config: ProviderConfig,
  fallbackPath: string
): Effect.Effect<string, ObservabilityError> =>
  Effect.gen(function* () {
    const queryEndpoint =
      typeof config.queryEndpoint === "string" ? config.queryEndpoint.trim() : "";
    if (queryEndpoint !== "") {
      return queryEndpoint.replace(/\/$/, "");
    }
    const endpoint = typeof config.endpoint === "string" ? config.endpoint.trim() : "";
    if (endpoint === "") {
      return yield* Effect.fail(
        new ObservabilityError({ reason: "provider config missing endpoint for query" })
      );
    }
    const base = endpoint.replace(/\/$/, "");
    const path = fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`;
    return `${base}${path}`;
  });

export const tenantHeadersEffect = (
  config: ProviderConfig
): Effect.Effect<Readonly<Record<string, string>>> =>
  Effect.sync(() => {
    const tenantId =
      typeof config.tenantId === "string" && config.tenantId.trim() !== ""
        ? config.tenantId.trim()
        : undefined;
    if (!tenantId) {
      return {} as Readonly<Record<string, string>>;
    }
    return { "X-Scope-OrgID": tenantId } as const;
  });

export const selectProvidersEffect = <T extends SignalProvider>(
  providers: readonly RegisteredProvider<T>[],
  selection: FederatedQuerySelection | undefined
): Effect.Effect<readonly RegisteredProvider<T>[], ObservabilityError> =>
  Effect.gen(function* () {
    const enabled = providers.filter((entry) => entry.enabled);
    if (enabled.length === 0) {
      return yield* Effect.fail(
        new ObservabilityError({
          reason: "no enabled providers registered for this signal",
        })
      );
    }

    const mode = selection?.mode ?? "primary";

    if (mode === "all") {
      return enabled;
    }

    if (mode === "one") {
      const providerId = selection?.providerId;
      if (!providerId) {
        return yield* Effect.fail(
          new ObservabilityError({
            reason: "selection.providerId is required when mode is one",
          })
        );
      }
      const match = enabled.find((entry) => entry.id === providerId);
      if (!match) {
        return yield* Effect.fail(
          new ObservabilityError({
            reason: `enabled provider not found for query: ${providerId}`,
          })
        );
      }
      return [match];
    }

    const preferred = selection?.primaryProviderId;
    if (preferred) {
      const match = enabled.find((entry) => entry.id === preferred);
      if (match) {
        return [match];
      }
    }
    return [enabled[0]!];
  });

export const appendQueryParamsEffect = (
  baseUrl: string,
  params: Readonly<Record<string, string | number | undefined>>
): Effect.Effect<string, ObservabilityError> =>
  Effect.try({
    try: () => {
      const url = new URL(baseUrl);
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
      return url.toString();
    },
    catch: (cause) =>
      new ObservabilityError({
        reason: `invalid query URL: ${baseUrl}`,
        cause,
      }),
  });
