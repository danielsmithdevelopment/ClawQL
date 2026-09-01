---
title: "clawql-analytics — Package Specification"
status: "August 2026"
version: "0.1"
package: "packages/clawql-analytics/"
---

# clawql-analytics — Package Specification

**August 2026 · v0.1**

---

## 1. Purpose

`clawql-analytics` is the ClawQL monorepo package for product and site analytics — page views, custom events, funnels, retention — as distinct from `clawql-audit` (compliance-grade, tamper-evident, append-only logging of consequential actions) and `clawql-observability` (runtime telemetry: logs, metrics, traces, profiles, and security signals from ClawQL's own infrastructure).

These three packages answer different questions to different audiences and must not be conflated:

**`clawql-analytics`** answers "are people using this, and how" — product and marketing questions, aimed at whoever operates a ClawQL-powered site or product.

**`clawql-audit`** answers "what happened, provably, and can I prove it to someone who doesn't trust me" — compliance and forensic questions, tamper-evident by design.

**`clawql-observability`** answers "is the system healthy and is an agent doing something it shouldn't" — operational and security questions about ClawQL's own runtime.

`clawql-analytics` wraps third-party analytics providers behind one interface, the same adapter pattern used in `clawql-agents` (wraps agent products) and `clawql-web3` (wraps blockchain networks). Providers are commodity event-storage-and-dashboard engines; the differentiated value ClawQL adds is access control and change-audit on top of them via `clawql-auth` and `clawql-audit`, not a competing analytics engine.

---

## 2. Why Not Just Use a Provider Directly

Nothing prevents anyone from dropping a PostHog or Matomo script tag directly into a site with no ClawQL involvement at all — that remains the fastest path for anyone who just wants pageview numbers today.

`clawql-analytics` exists for the case where analytics needs to sit behind the same governance model as everything else in a ClawQL deployment: who can view raw event data, who can change what's tracked, who can add or remove a provider, and a provable record of when any of that changed. This matters specifically because most open-source analytics engines gate exactly this governance layer — RBAC, SSO enforcement, audit logs — behind a commercial license (PostHog's `ee/` directory is the clearest example: the event-capture and analytics engine itself is MIT, but role-based access control and audit logging require a paid Enterprise Edition agreement).

`clawql-analytics` does not attempt to re-implement or unlock those gated features inside the provider. It wraps the provider's open core and applies ClawQL's own governance layer — `clawql-auth` for access control, `clawql-audit` for the audit trail — in front of it. The provider never needs its own commercial governance tier, because the governance happens one layer up, identically regardless of which provider is plugged in.

---

## 3. Package Structure

```
packages/clawql-analytics/
  src/
    types.ts                 — AnalyticsProvider interface, shared types
    registry.ts               — Provider registration, active-provider config
    providers/
      posthog.ts              — PostHog adapter (v0, first provider)
      matomo.ts                — Matomo adapter (planned)
      plausible.ts             — Plausible adapter (planned)
      umami.ts                 — Umami adapter (planned)
    auth-bridge.ts             — clawql-auth scope checks for config
                                 reads/writes and raw data access
    audit-bridge.ts            — WORM entries for configuration and
                                 access events (not per-pageview — see §6)
    grafana/
      matomo-datasource.md     — notes on using Matomo's official Grafana
                                 plugin directly, since it already exists
      custom-exporter.ts       — optional: exports aggregate metrics from
                                 non-Grafana-native providers (PostHog,
                                 Plausible, Umami) into a Prometheus-
                                 scrapeable format for Grafana/Mimir
  index.ts
  package.json
  tsconfig.json
```

---

## 4. The AnalyticsProvider Interface

Every provider — PostHog first, others following — implements the same minimal interface. The interface is deliberately small: capture events, identify a user/session, record a pageview. Anything beyond that (funnels, retention, cohort analysis) stays inside the provider's own dashboard rather than being re-implemented or proxied through ClawQL, since duplicating a provider's own analysis UI is out of scope for this package.

Production code in the monorepo uses **Effect**-returning methods (see `packages/clawql-analytics/src/types.ts`); the conceptual contract matches:

```typescript
export interface AnalyticsProvider {
  id: string;
  name: string;
  initialize(config: ProviderConfig): Promise<void>;
  pageview(event: PageviewEvent): Promise<void>;
  capture(event: CustomEvent): Promise<void>;
  identify(sessionId: string, traits?: Record<string, unknown>): Promise<void>;
  health(): Promise<{ status: "healthy" | "degraded" | "down"; details?: string }>;
}
```

---

## 5. PostHog Provider (v0)

The first provider implementation, wrapping PostHog's open-core (MIT) capture and analytics engine. No PostHog Enterprise Edition (`ee/`) features are used or required — everything `clawql-analytics` needs from PostHog is in the MIT-licensed core.

**Self-hosting note:** PostHog's own documentation is explicit that self-hosted, open-source deployments are provided without a support guarantee and that PostHog's SOC 2 certification does not extend to self-hosted instances. If the eventual deployment target is self-hosted PostHog rather than PostHog Cloud, that operational and compliance posture is the deploying organization's responsibility — `clawql-analytics` does not change this, it only adds ClawQL's own access-control and audit layer on top of whichever deployment mode is chosen.

---

## 6. Governance: What Gets Audited, and What Doesn't

The single most important design decision in this package: **individual pageview and event capture calls are not written to the WORM audit trail.** A page view is not a compliance-relevant action, and logging every one through `clawql-audit`'s hash-chained, Merkle-batched, multi-chain-anchored trail would be enormous, pointless volume for data that has no forensic or regulatory significance.

What _does_ get audited, because these are the actions that matter for the governance story:

- `ANALYTICS_PROVIDER_ADDED`
- `ANALYTICS_PROVIDER_REMOVED`
- `ANALYTICS_PROVIDER_CONFIG_CHANGED`
- `ANALYTICS_RAW_DATA_ACCESSED`
- `ANALYTICS_EXPORT_REQUESTED`
- `ANALYTICS_ACCESS_GRANTED`
- `ANALYTICS_ACCESS_REVOKED`

---

## 7. Access Control via clawql-auth

Reading or changing analytics configuration goes through the same ATR scope mechanism as any other ClawQL-mediated action:

| Scope                      | Meaning                                    |
| -------------------------- | ------------------------------------------ |
| `analytics:view_aggregate` | View dashboards and aggregate metrics only |
| `analytics:view_raw`       | View underlying, non-aggregated event data |
| `analytics:configure`      | Add, remove, or reconfigure providers      |
| `analytics:export`         | Export raw data out of the provider        |

---

## 8. Grafana Integration

**Matomo — native.** Grafana Labs maintains an official Matomo data source plugin. For Matomo specifically, `clawql-analytics` does not need to build anything beyond documenting how to point that existing plugin at a `clawql-analytics`-managed Matomo instance.

**PostHog, Plausible, Umami — via a custom exporter.** None of these have a native Grafana data source. `clawql-analytics` ships a small exporter (Phase 4) that periodically pulls aggregate metrics from each provider's own API and exposes them in a Prometheus-scrapeable format for Mimir/Grafana.

---

## 9. Provider Comparison Reference

| Provider  | License                     | Grafana              | Depth                    | Notes            |
| --------- | --------------------------- | -------------------- | ------------------------ | ---------------- |
| PostHog   | MIT core, `ee/` proprietary | Custom exporter only | Full product analytics   | v0 provider      |
| Matomo    | GPL                         | Native plugin        | Full-featured            | Best Grafana fit |
| Plausible | AGPL                        | Custom exporter only | Minimal pageviews/events | Lightweight      |
| Umami     | MIT                         | Custom exporter only | Similar to Plausible     | Simple self-host |

---

## 10. Implementation Sequence

1. **Phase 1 — PostHog + governance** (this package v0.1)
2. **Phase 2 — Matomo + Grafana native**
3. **Phase 3 — Plausible and Umami**
4. **Phase 4 — Custom Grafana exporter**

---

## 11. Package Dependencies

```json
{
  "name": "clawql-analytics",
  "version": "0.1.0",
  "dependencies": {
    "clawql-auth": "0.1.0",
    "clawql-audit": "0.1.0"
  },
  "optionalDependencies": {
    "posthog-node": "^4.0.0"
  }
}
```

---

_clawql-analytics Package Specification · v0.1 · August 2026_
