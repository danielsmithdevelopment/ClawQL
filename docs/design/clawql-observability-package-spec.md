---
title: "clawql-observability — Package Specification"
status: "August 2026"
version: "0.1"
package: "packages/clawql-observability/"
source: "pragmaticvectors.com/posts/serverless-observability-stack/ (LGTM+ stack, as declared)"
---

# clawql-observability — Package Specification

**August 2026 · v0.1**

---

## 1. Purpose

`clawql-observability` is the ClawQL monorepo package that packages the **LGTM+** stack (Loki, Grafana, Tempo, Mimir, **plus** Pyroscope) and its collection, frontend, security, and alerting layers into a deployable ClawQL component — runtime telemetry and security monitoring for ClawQL's own infrastructure and for any agent traffic passing through it.

This is distinct from `clawql-audit` (compliance-grade, tamper-evident logging of consequential actions, hash-chained and externally anchored) and `clawql-analytics` (product/marketing interaction tracking — pageviews, funnels, retention). `clawql-observability` answers: is the system healthy, what is slow, what broke, and — critically for agent deployments — is something behaving in a way it shouldn't be.

The full architecture and reasoning behind every component below is documented in ["Why Serverless Isn't a Mistake"](https://pragmaticvectors.com/posts/serverless-observability-stack/). This spec packages that architecture as a ClawQL component with Helm values, default dashboards, and integration points into `clawql-audit` and Panguard specifically.

---

## 2. Why This Exists as Its Own Package

The originating incident behind this stack — a company's AI coding agent nearly executing an exfiltration command it read from a fake bug report submitted through a public, unauthenticated Sentry DSN — is a direct illustration of why observability infrastructure for agent deployments needs different defaults than observability infrastructure for traditional web applications.

Two failures compound in that incident, and `clawql-observability` addresses both structurally:

**The ingest vector was a static public write endpoint.** Anyone who found the DSN could submit arbitrary content. `clawql-observability` never exposes a static public ingest endpoint — every ingest path is gated behind an ephemeral, short-lived credential validated per request.

**The agent treated untrusted data as trusted instructions.** No amount of ingest hardening fixes this on its own — it's an agent-architecture problem, not an infrastructure problem. `clawql-observability` closes the loop by making agent tool-use itself an observable, alertable signal (via Langfuse), correlated against the same trace and log data as everything else, so an agent's anomalous action is visible in the same dashboard as a slow database query — and by providing an enforcement backstop (Tetragon) that contains damage even if the trust-boundary layer fails.

---

## 3. The LGTM+ Core

Five components, as declared in the source architecture:

**Loki** — log storage, indexed by labels rather than full-text, content compressed in object storage. Queried via LogQL. Frontend errors land here with fingerprint-based grouping (see §6) providing Sentry-style issue deduplication.

**Grafana** — the correlation and visualization layer. Its value is chaining signals: elevated error rate → relevant logs → trace ID → full distributed trace → CPU profile from the same time window.

**Tempo** — distributed trace storage (OpenTelemetry, Jaeger, Zipkin compatible), stored as Parquet in object storage.

**Mimir** — long-term, horizontally-scalable, Prometheus-compatible metrics storage.

**Pyroscope** — continuous profiling and flame graphs, so a 3am CPU spike has a queryable historical answer rather than requiring the incident to still be happening when someone looks.

```yaml
# helm/clawql-observability/values.yaml (excerpt)
lgtmPlus:
  loki:
    enabled: true
    retentionPeriod:
      744h # NOTE: must match maxLookBackPeriod exactly —
      # a shorter look-back silently returns empty
      # results on older queries
  grafana:
    enabled: true
  tempo:
    enabled: true
  mimir:
    enabled: true
    ingestionRate:
      10000 # default; watch cortex_discarded_samples_total
      # and raise if Beyla-instrumented services
      # or high-cardinality labels hit this silently
  pyroscope:
    enabled: true
```

---

## 4. Collection: Grafana Alloy

All signals route through Alloy — Grafana's OTel-based collector, configured via River — before landing in Loki, Tempo, Mimir, or Pyroscope. This is the single pipeline; nothing writes directly to a backend without passing through Alloy first, which is what makes batching, transformation, and routing configurable in one place rather than scattered per-source.

See `packages/clawql-observability/alloy/config.river` for the Phase 1 pipeline including delta-to-cumulative conversion for Mimir compatibility.

---

## 5. Phase 2 — Faro + ephemeral-JWT Worker proxy

Browser RUM (Grafana Faro) never writes to a static public DSN. Flow:

1. **Backend** mints a short-lived HS256 JWT (`signTelemetryJwt` in `src/telemetry-token.ts`) bound to `sub` (session), `project`, and `origin`.
2. **Browser** sends Faro JSON to the **Cloudflare Worker** (`worker/`) with `Authorization: Bearer <jwt>`.
3. **Worker** validates JWT, rate-limits by session, validates payload shape, enriches exceptions with `error_fingerprint`, forwards to private **Alloy `faro.receiver`** (`:8027/collect`).
4. **Alloy** routes Faro logs to Loki and traces to Tempo (same LGTM+ stack as Phase 1 OTLP).

Invalid or missing credentials return **HTTP 204** with no body — silent drop, no attacker feedback.

Deploy secrets via `wrangler secret put JWT_SIGNING_KEY`; never commit signing keys. Vault-backed rotation ships in Phase 5 (`TelemetrySigningKeyService` / `CLAWQL_TELEMETRY_JWT_VAULT_*`).

## 6. Error fingerprinting

Exception events receive a 16-char SHA-256 fingerprint (`src/fingerprint.ts`) normalising dynamic message segments before hash. Labels land in Loki for Sentry-style grouping. The Worker attaches `error_fingerprint` on forward; the browser SDK may also pre-compute via `createErrorFingerprint`.

## 7. Phase 3 — Provider registry

Multi-backend observability (redundant fan-out per signal type, governed registration, Alloy config generation, query federation) is specified in **[`clawql-observability-provider-registry.md`](./clawql-observability-provider-registry.md)**.

**Phase 3a (v0.3, shipped):** signal-typed interfaces (`LogProvider`, `MetricProvider`, `TraceProvider`, `ProfileProvider`), per-type registries, built-in LGTM+ adapters, ATR scopes, WORM governance hooks, and health checks in `packages/clawql-observability/src/`.

**Phase 3b (v0.4, shipped):** Alloy River config generator (`generateAlloyRiverEffect`, `applyAlloyConfigEffect`, `snapshotRegistriesForAlloyEffect`) with golden-file tests against default LGTM+ exporters and multi-provider fan-out.

**Phase 3c (v0.5, shipped):** Effect-native query federation (`ObservabilityQueryService` + `TelemetryQueryTransport`) for LogQL / PromQL / TraceQL / profiles, with scope gates and raw-access WORM.

Summary: **Alloy** owns runtime ingest fan-out; the **TypeScript registry** owns auth scopes, WORM config audit, health checks, River config generation, and read-side query federation. LGTM+ backends are default built-in plugins, not special-cased infra.

Public overview: [docs.clawql.com/observability](https://docs.clawql.com/observability).

## 8–16. Later phases

Phases 4–5 ship in package v0.7 — see README Phase 4/5 sections:

- **4:** Langfuse dual-export + Panguard correlation attributes / optional Loki push
- **4b:** Falco / Tetragon / Wazuh → Alloy → Loki (`alloy/security-sensors.river`, compose profile `security`, Helm `security-overlay.yaml`); Grafana Langfuse ↔ Panguard correlation dashboard
- **5:** Alert catalog, Vault/env Faro JWT signing keys, Alloy reload after apply

**Still deferred:** blocking N-of-M exporter quorum (provider-registry design §9 — Alloy-scoped only if ever needed).

---

## Relationship to clawql-audit and clawql-analytics

**vs. `clawql-audit`:** observability is for noticing something now; the audit trail is for proving what happened later.

**vs. `clawql-analytics`:** LGTM+ Faro RUM is for engineers (errors, performance); analytics pageviews are for product decisions. Different questions from the same underlying moment.

---

_clawql-observability Package Specification · v0.1 · August 2026_
_Location: packages/clawql-observability/_
_Reference implementation: github.com/danielsmithdevelopment/DevSecOps-boilerplate_
