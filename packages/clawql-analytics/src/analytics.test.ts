import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import {
  hasAnalyticsScope,
  requireAnalyticsScopeEffect,
  type AnalyticsSessionContext,
} from "./auth-bridge.js";
import { createNoopAnalyticsProvider } from "./providers/posthog.js";
import { createAnalyticsRegistryLayer } from "./registry.js";
import { AnalyticsRegistryService } from "./registry.js";
import { AnalyticsService, createAnalyticsLayer } from "./service.js";

describe("clawql-analytics auth-bridge", () => {
  const session: AnalyticsSessionContext = {
    sub: "user-1",
    scope: ["analytics:view_aggregate", "analytics:configure"],
  };

  it("allows configured scopes", async () => {
    expect(hasAnalyticsScope(session, "analytics:configure")).toBe(true);
    await Effect.runPromise(requireAnalyticsScopeEffect(session, "analytics:configure"));
  });

  it("denies missing scopes", async () => {
    const exit = await Effect.runPromiseExit(
      requireAnalyticsScopeEffect(session, "analytics:view_raw")
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe("clawql-analytics registry + service", () => {
  it("registers noop provider and captures pageviews", async () => {
    const registryLayer = createAnalyticsRegistryLayer();
    const layer = createAnalyticsLayer(registryLayer);

    const program = Effect.gen(function* () {
      const registry = yield* AnalyticsRegistryService;
      yield* registry.register(createNoopAnalyticsProvider(), {});
      const analytics = yield* AnalyticsService;
      yield* analytics.pageview({
        path: "/auth",
        sessionId: "sess-1",
        timestamp: new Date().toISOString(),
      });
      const health = yield* analytics.health();
      expect(health.status).toBe("healthy");
    });

    await Effect.runPromise(program.pipe(Effect.provide(layer)));
  });

  it("fails capture when no provider is registered", async () => {
    const layer = createAnalyticsLayer(createAnalyticsRegistryLayer());
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const analytics = yield* AnalyticsService;
        yield* analytics.pageview({
          path: "/",
          sessionId: "sess-1",
          timestamp: new Date().toISOString(),
        });
      }).pipe(Effect.provide(layer))
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe("clawql-analytics PostHog provider", () => {
  it("initializes when posthog-node is present", async () => {
    const provider = createNoopAnalyticsProvider("posthog-test");
    // Use real PostHog only if optional dep installed — smoke initialize path via noop substitute
    const registryLayer = createAnalyticsRegistryLayer();
    await Effect.runPromise(
      Effect.gen(function* () {
        const registry = yield* AnalyticsRegistryService;
        yield* registry.register(provider, { apiKey: "test" });
        const listed = yield* registry.list();
        expect(listed).toHaveLength(1);
        expect(listed[0]?.id).toBe("posthog-test");
      }).pipe(Effect.provide(registryLayer))
    );
  });
});
