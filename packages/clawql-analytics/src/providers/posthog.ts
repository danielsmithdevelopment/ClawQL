import { Effect } from "effect";

import { AnalyticsError } from "../errors.js";
import type {
  AnalyticsProvider,
  CustomEvent,
  PageviewEvent,
  ProviderConfig,
  ProviderHealth,
} from "../types.js";

type PostHogClient = {
  capture: (payload: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
    timestamp?: Date;
  }) => void;
  identify: (payload: { distinctId: string; properties?: Record<string, unknown> }) => void;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
};

const loadPostHogConstructor = (): Effect.Effect<
  new (apiKey: string, options?: { host?: string }) => PostHogClient,
  AnalyticsError
> =>
  Effect.tryPromise({
    try: async () => {
      const mod = await import("posthog-node");
      return mod.PostHog as new (apiKey: string, options?: { host?: string }) => PostHogClient;
    },
    catch: (cause) =>
      new AnalyticsError({
        reason:
          "posthog-node is not installed. Add it as a dependency or enable optionalDependencies.",
        cause,
      }),
  });

/** PostHog MIT core capture adapter (v0 provider). No PostHog EE features. */
export function createPostHogProvider(): AnalyticsProvider {
  let client: PostHogClient | null = null;

  const requireClient = (): Effect.Effect<PostHogClient, AnalyticsError> =>
    client
      ? Effect.succeed(client)
      : Effect.fail(new AnalyticsError({ reason: "PostHogProvider not initialized" }));

  return {
    id: "posthog",
    name: "PostHog",

    initialize: (config: ProviderConfig) =>
      Effect.gen(function* () {
        if (!config.apiKey || typeof config.apiKey !== "string") {
          return yield* Effect.fail(
            new AnalyticsError({ reason: "PostHogProvider requires apiKey in config" })
          );
        }
        const PostHog = yield* loadPostHogConstructor();
        client = new PostHog(config.apiKey, {
          host: typeof config.host === "string" ? config.host : "https://app.posthog.com",
        });
      }),

    pageview: (event: PageviewEvent) =>
      Effect.gen(function* () {
        const ph = yield* requireClient();
        yield* Effect.sync(() => {
          ph.capture({
            distinctId: event.sessionId,
            event: "$pageview",
            properties: {
              $current_url: event.path,
              $referrer: event.referrer,
              ...event.properties,
            },
            timestamp: new Date(event.timestamp),
          });
        });
      }),

    capture: (event: CustomEvent) =>
      Effect.gen(function* () {
        const ph = yield* requireClient();
        yield* Effect.sync(() => {
          ph.capture({
            distinctId: event.sessionId,
            event: event.name,
            properties: event.properties,
            timestamp: new Date(event.timestamp),
          });
        });
      }),

    identify: (sessionId, traits) =>
      Effect.gen(function* () {
        const ph = yield* requireClient();
        yield* Effect.sync(() => {
          ph.identify({ distinctId: sessionId, properties: traits });
        });
      }),

    health: (): Effect.Effect<ProviderHealth, AnalyticsError> =>
      Effect.gen(function* () {
        const ph = yield* requireClient();
        return yield* Effect.tryPromise({
          try: () => ph.flush(),
          catch: (cause) =>
            new AnalyticsError({
              reason: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        }).pipe(
          Effect.as({ status: "healthy" as const }),
          Effect.catchAll((err) =>
            Effect.succeed({
              status: "down" as const,
              details: err.reason,
            })
          )
        );
      }),
  };
}

/** Test / no-op provider — never calls upstream. */
export function createNoopAnalyticsProvider(id = "noop"): AnalyticsProvider {
  return {
    id,
    name: "No-op",
    initialize: () => Effect.void,
    pageview: () => Effect.void,
    capture: () => Effect.void,
    identify: () => Effect.void,
    health: () => Effect.succeed({ status: "healthy" }),
  };
}
