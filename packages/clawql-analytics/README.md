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

## Site wiring (docs + marketing)

Both **docs.clawql.com** and **clawql.com** fire anonymous pageviews through a shared collector:

| Site      | Client                                         | Collector                                  |
| --------- | ---------------------------------------------- | ------------------------------------------ |
| docs      | `ClawqlAnalyticsPageview` (`site="docs"`)      | same-origin `POST /api/analytics/pageview` |
| marketing | `ClawqlAnalyticsPageview` (`site="marketing"`) | cross-origin to docs API (static export)   |

Enable at build time: `NEXT_PUBLIC_CLAWQL_ANALYTICS_ENABLED=1`

Server (docs Worker): `CLAWQL_ANALYTICS_ENABLED=1`, `CLAWQL_ANALYTICS_POSTHOG_API_KEY` (or `POSTHOG_API_KEY`), optional `CLAWQL_ANALYTICS_POSTHOG_HOST`.

Optional overrides: `NEXT_PUBLIC_CLAWQL_ANALYTICS_ENDPOINT`, `CLAWQL_ANALYTICS_CORS_ORIGINS` (comma-separated extra origins for marketing → docs CORS).

Optional client debug logging: `NEXT_PUBLIC_CLAWQL_ANALYTICS_DEBUG=1` (or `NODE_ENV=development`) logs failed pageview POSTs to the browser console — network errors, CORS, ad/privacy blockers, and collector `503` responses.

## Deploy failure modes (explicit)

| State | Build/deploy | Runtime |
| ----- | ------------ | ------- |
| Flags unset | Succeeds; no pageview calls | N/A |
| `CLAWQL_ANALYTICS_ENABLED=1` + missing PostHog secret | **Deploy fails** (`verify-analytics-deploy-config.mjs`) | — |
| Client enabled, server flag off | **Deploy fails** (same script) | — |
| Client enabled, collector misconfigured | Build succeeds | POST → `503`; visible in console when debug/dev |
| Ad blocker / privacy mode blocks cross-origin POST | Build succeeds | POST fails silently in production unless debug — **expected**; use PostHog/server-side or observability (LGTM+) for coverage gaps |

When enabling analytics, set repo variable `CLAWQL_ANALYTICS_ENABLED=1` **and** GitHub secret `CLAWQL_ANALYTICS_POSTHOG_API_KEY`, then deploy **docs first** (collector), then landing (client).

## License

Apache-2.0
