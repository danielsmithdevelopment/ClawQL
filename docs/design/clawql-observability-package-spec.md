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

## 5–16. Later phases

Phases 2–5 (Faro JWT proxy, Langfuse, security layer, alerting, secrets) are specified in full in the authoring brief and tracked in the package README implementation table. Phase 1 ships the LGTM+ core, Alloy config, Helm values, docker-compose, and Grafana datasource wiring so operators can connect dashboards immediately.

---

## Relationship to clawql-audit and clawql-analytics

**vs. `clawql-audit`:** observability is for noticing something now; the audit trail is for proving what happened later.

**vs. `clawql-analytics`:** LGTM+ Faro RUM is for engineers (errors, performance); analytics pageviews are for product decisions. Different questions from the same underlying moment.

---

_clawql-observability Package Specification · v0.1 · August 2026_
_Location: packages/clawql-observability/_
_Reference implementation: github.com/danielsmithdevelopment/DevSecOps-boilerplate_
