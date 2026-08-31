import { Context, Effect, Layer } from "effect";

import { ObservabilityError } from "../errors.js";
import type { TelemetryQueryTransportApi } from "./types.js";

export class TelemetryQueryTransport extends Context.Tag("clawql/TelemetryQueryTransport")<
  TelemetryQueryTransport,
  TelemetryQueryTransportApi
>() {}

export const TelemetryQueryTransportLive = Layer.succeed(TelemetryQueryTransport, {
  getJson: ({ url, headers }) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...headers,
          },
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new ObservabilityError({
            reason: `query transport HTTP ${response.status} for ${url}${
              body ? `: ${body.slice(0, 200)}` : ""
            }`,
          });
        }
        return (await response.json()) as unknown;
      },
      catch: (cause) =>
        cause instanceof ObservabilityError
          ? cause
          : new ObservabilityError({
              reason: `query transport failed for ${url}`,
              cause,
            }),
    }),
});
