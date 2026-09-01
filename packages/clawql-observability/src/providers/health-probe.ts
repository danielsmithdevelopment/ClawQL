import { Effect } from "effect";

import { ObservabilityError } from "../errors.js";
import type { ProviderConfig, ProviderHealth } from "./types.js";

const DEFAULT_PROBE_TIMEOUT_MS = 2_000;

/** Optional HTTP reachability probe for provider health checks. */
export const probeEndpointHealthEffect = (input: {
  readonly config: ProviderConfig;
  readonly readyPath?: string;
  readonly timeoutMs?: number;
}): Effect.Effect<ProviderHealth, ObservabilityError> =>
  Effect.gen(function* () {
    const endpoint = input.config.endpoint?.trim();
    if (!endpoint) {
      return { status: "down", details: "endpoint not configured" };
    }

    if (!input.config.probeReachability) {
      return { status: "healthy", details: "reachability probe disabled" };
    }

    const url = new URL(input.readyPath ?? "/ready", endpoint);
    const timeoutMs = input.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;

    const response = yield* Effect.tryPromise({
      try: () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, { method: "GET", signal: controller.signal }).finally(() =>
          clearTimeout(timer)
        );
      },
      catch: (cause) =>
        new ObservabilityError({
          reason: `health probe failed for ${url.toString()}`,
          cause,
        }),
    }).pipe(
      Effect.catchAll(() => Effect.succeed(undefined as Response | undefined))
    );

    if (!response) {
      return { status: "down", details: `unreachable: ${url.toString()}` };
    }

    if (response.ok) {
      return { status: "healthy", details: `ready: ${response.status}` };
    }

    if (response.status >= 500) {
      return { status: "down", details: `upstream error: ${response.status}` };
    }

    return { status: "degraded", details: `unexpected status: ${response.status}` };
  });
