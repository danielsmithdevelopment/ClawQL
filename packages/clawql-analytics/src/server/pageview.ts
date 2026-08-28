/**
 * Server-side pageview capture for Next.js / Worker API routes.
 * Lazy-init PostHog via clawql-analytics; no-op when env is unset.
 */
import { Effect, Layer } from "effect";

import { createPostHogProvider } from "../providers/posthog.js";
import { AnalyticsRegistryService, createAnalyticsRegistryLayer } from "../registry.js";
import { AnalyticsService, createAnalyticsLayer } from "../service.js";
import type { PageviewEvent } from "../types.js";

type AnalyticsRuntime = Layer.Layer<AnalyticsRegistryService | AnalyticsService>;

let runtime: AnalyticsRuntime | null | undefined;

const readPostHogConfig = (): { apiKey: string; host?: string } | null => {
  const enabled =
    process.env.CLAWQL_ANALYTICS_ENABLED?.trim() === "1" ||
    process.env.NEXT_PUBLIC_CLAWQL_ANALYTICS_ENABLED?.trim() === "1";
  if (!enabled) return null;

  const apiKey =
    process.env.CLAWQL_ANALYTICS_POSTHOG_API_KEY?.trim() ??
    process.env.POSTHOG_API_KEY?.trim() ??
    "";
  if (!apiKey) return null;

  const host =
    process.env.CLAWQL_ANALYTICS_POSTHOG_HOST?.trim() ?? process.env.POSTHOG_HOST?.trim();
  return { apiKey, host: host || undefined };
};

const bootRuntime = (): Effect.Effect<AnalyticsRuntime | null> =>
  Effect.gen(function* () {
    if (runtime !== undefined) {
      return runtime;
    }

    const config = readPostHogConfig();
    if (!config) {
      runtime = null;
      return null;
    }

    const registryLayer = createAnalyticsRegistryLayer();
    const provider = createPostHogProvider();
    yield* Effect.gen(function* () {
      const registry = yield* AnalyticsRegistryService;
      yield* registry.register(provider, {
        apiKey: config.apiKey,
        host: config.host,
      });
    }).pipe(Effect.provide(registryLayer));

    runtime = createAnalyticsLayer(registryLayer);
    return runtime;
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

export const capturePageviewEffect = (event: PageviewEvent): Effect.Effect<void> =>
  Effect.gen(function* () {
    const layer = yield* bootRuntime();
    if (!layer) return;
    yield* Effect.gen(function* () {
      const analytics = yield* AnalyticsService;
      yield* analytics.pageview(event);
    }).pipe(Effect.provide(layer));
  }).pipe(Effect.catchAll(() => Effect.void));

/** Thin host façade for Next.js route handlers. */
export async function capturePageview(event: PageviewEvent): Promise<void> {
  await Effect.runPromise(capturePageviewEffect(event));
}

export const analyticsServerConfigured = (): boolean => readPostHogConfig() !== null;

/** Allowed browser origins for cross-site marketing → docs API pageviews. */
export const defaultAnalyticsCorsOrigins = [
  "https://clawql.com",
  "https://www.clawql.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
] as const;

export function resolveAnalyticsCorsOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;
  const extra = process.env.CLAWQL_ANALYTICS_CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = new Set<string>([...defaultAnalyticsCorsOrigins, ...(extra ?? [])]);
  return allowed.has(requestOrigin) ? requestOrigin : null;
}
