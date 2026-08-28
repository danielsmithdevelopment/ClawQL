# clawql-analytics

Product and site analytics for ClawQL deployments — page views, custom events, provider adapters — **distinct from**:

- **`clawql-audit`** — compliance-grade, tamper-evident logging of consequential actions
- **`clawql-observability`** — runtime telemetry (logs, metrics, traces) for ClawQL infrastructure

## v0 (Phase 1)

- `AnalyticsProvider` interface (Effect-primary)
- PostHog MIT core adapter (`posthog-node` optional dependency)
- `clawql-auth` scope checks for config / raw data / export
- `clawql-audit` WORM entries for **governance events only** (not per-pageview)

Full specification: [`docs/design/clawql-analytics-package-spec.md`](../../docs/design/clawql-analytics-package-spec.md)

## Quick start

```typescript
import { Effect, Layer } from "effect";
import {
  AnalyticsLive,
  AnalyticsRegistryService,
  AnalyticsService,
  createPostHogProvider,
  logProviderAddedEffect,
} from "clawql-analytics";

const program = Effect.gen(function* () {
  const registry = yield* AnalyticsRegistryService;
  yield* registry.register(createPostHogProvider(), {
    apiKey: process.env.POSTHOG_API_KEY!,
    host: process.env.POSTHOG_HOST,
  });
  yield* logProviderAddedEffect({ actorId: "admin-1", providerId: "posthog" });

  const analytics = yield* AnalyticsService;
  yield* analytics.pageview({
    path: "/auth",
    sessionId: "anon-session",
    timestamp: new Date().toISOString(),
  });
});

await Effect.runPromise(program.pipe(Effect.provide(AnalyticsLive)));
```

## Scopes

| Scope                      | Purpose                          |
| -------------------------- | -------------------------------- |
| `analytics:view_aggregate` | Dashboards / aggregates only     |
| `analytics:view_raw`       | Underlying event data            |
| `analytics:configure`      | Add/remove/reconfigure providers |
| `analytics:export`         | Export raw data                  |

## Governance audit (WORM)

Logged: provider add/remove/config change, raw data access, export, access grant/revoke.

**Not logged:** individual pageviews or custom capture events.

## License

Apache-2.0
