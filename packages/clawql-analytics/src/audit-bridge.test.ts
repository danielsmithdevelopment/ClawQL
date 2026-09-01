import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const appendProcessWormEffect = vi.fn(() => Effect.void);

vi.mock("clawql-audit", () => ({
  appendProcessWormEffect: (...args: unknown[]) => appendProcessWormEffect(...args),
}));

import { logProviderAddedEffect } from "./audit-bridge.js";
import { createNoopAnalyticsProvider } from "./providers/posthog.js";
import { AnalyticsRegistryService, createAnalyticsRegistryLayer } from "./registry.js";
import { AnalyticsService, createAnalyticsLayer } from "./service.js";

describe("clawql-analytics governance WORM boundary", () => {
  beforeEach(() => {
    appendProcessWormEffect.mockClear();
  });

  it("writes WORM entries for provider governance events", async () => {
    await Effect.runPromise(logProviderAddedEffect({ actorId: "admin-1", providerId: "posthog" }));

    expect(appendProcessWormEffect).toHaveBeenCalledTimes(1);
    expect(appendProcessWormEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ANALYTICS_PROVIDER_ADDED",
        sessionId: "admin-1",
        metadata: expect.objectContaining({
          source: "analytics",
          providerId: "posthog",
        }),
      })
    );
  });

  it("does not write WORM entries when capturing pageviews", async () => {
    const registryLayer = createAnalyticsRegistryLayer();
    const layer = createAnalyticsLayer(registryLayer);

    await Effect.runPromise(
      Effect.gen(function* () {
        const registry = yield* AnalyticsRegistryService;
        yield* registry.register(createNoopAnalyticsProvider(), {});
        const analytics = yield* AnalyticsService;
        yield* analytics.pageview({
          path: "/pricing",
          sessionId: "sess-anon",
          timestamp: new Date().toISOString(),
        });
      }).pipe(Effect.provide(layer))
    );

    expect(appendProcessWormEffect).not.toHaveBeenCalled();
  });
});
