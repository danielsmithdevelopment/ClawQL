# clawql-observability — Provider Registry Design

**Status:** Phase 3a–3b shipped (August 2026)  
**Audience:** Contributors implementing Phase 3+ of `clawql-observability`  
**Related:** [`clawql-observability-package-spec.md`](./clawql-observability-package-spec.md) · [`clawql-plugin-model.md`](./clawql-plugin-model.md) · `packages/clawql-analytics` (registry/governance pattern) · `packages/clawql-observability/alloy/config.river`

This document specifies the **observability provider registry** — how ClawQL governs multiple backends per signal type, generates Alloy configuration, and federates read-side queries — without reimplementing ingest fan-out in TypeScript.

---

## 1. One-sentence summary

The TypeScript registry is the **authorized front door** to observability configuration (who may register backends, what scopes apply, WORM audit of changes, health status, Alloy River generation, and query federation). **Alloy** is the **runtime ingest plane** — batching, retries, backpressure, and per-exporter failure isolation stay there, not in application code.

---

## 2. Design principle: don't rebuild a solved problem

ClawQL already applies this elsewhere:

| Package                    | Solved elsewhere                            | ClawQL's job                                                                |
| -------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| **`clawql-web3`**          | Chainlink oracle consensus                  | Governance and integration around the oracle — not a second consensus layer |
| **`clawql-cellrt`**        | celld coordination primitives               | Fork/adopt celld — not rebuild DO-style coordination from scratch           |
| **`clawql-observability`** | Alloy OTLP pipeline (batch, retry, fan-out) | Registry, auth, WORM, health, config generation, query federation           |

**Grafana Alloy** already implements hot-path telemetry correctly: receivers → processors → multiple exporters via River `output` lists, with batching, retries, backpressure, and per-exporter failure isolation. Reimplementing that fan-out in TypeScript would produce a second, worse version of the same problem.

The registry's value is **governance and composition** — not becoming a collector.

---

## 3. Scope split: TypeScript vs Alloy

### 3.1 TypeScript registry owns

- **Signal-typed provider registration** — separate interfaces and registries per signal type (see §4).
- **Auth scopes (ATR)** — who may configure providers, read raw telemetry, export, etc. (pattern: `clawql-analytics` `ANALYTICS_SCOPES`).
- **WORM governance audit** — provider add/remove/config change, raw-data access, export requests (not individual telemetry events).
- **Health checks** — periodic upstream reachability and credential validity per registered provider.
- **Alloy River config generation** — registry snapshot → River fragments merged into `config.river` (or sidecar files loaded by Alloy).
- **Query federation** — the read path where TypeScript **earns its keep** (see §7).

### 3.2 Alloy owns (runtime ingest)

- All OTLP-capable ingest: receivers (`otelcol.receiver.otlp`, `faro.receiver`, …), processors (`batch`, transforms), exporters.
- **Fan-out to N backends per signal type** via multiple entries in `output` blocks — e.g. logs to Loki _and_ a remote Loki-compatible endpoint.
- Batching, retry, backpressure, and **per-exporter failure isolation** without blocking the whole pipeline when one exporter is unhealthy.

Nothing in the registry pushes individual spans, log lines, or metric samples in the hot path for OTLP-speaking providers.

---

## 4. Signal-typed interfaces (not one flat provider)

Observability backends differ by signal. A single `ObservabilityProvider` interface would force awkward no-ops (a metrics-only vendor implementing empty `pushTrace`). Instead:

| Interface             | Signal   | Example backends                              |
| --------------------- | -------- | --------------------------------------------- |
| **`LogProvider`**     | Logs     | Loki, Elasticsearch, Datadog logs API         |
| **`MetricProvider`**  | Metrics  | Mimir, Prometheus remote_write, Grafana Cloud |
| **`TraceProvider`**   | Traces   | Tempo, Jaeger, Honeycomb                      |
| **`ProfileProvider`** | Profiles | Pyroscope, Grafana Cloud profiles             |

Each interface defines:

- **`id`**, **`name`**
- **`initialize(config)`** — Effect-based setup
- **`health()`** — `ProviderHealth` (`healthy` | `degraded` | `down`)
- **`alloyFragment(snapshot)`** — optional River block(s) this provider contributes when registered for that signal type (see §6)
- **Query-side hooks** — methods used by federation (§7), not ingest push

**Registries are per signal type**, not a single global list. Registration APIs mirror `clawql-analytics` (`register`, `remove`, `list`, `snapshot`, `updateConfig`) but **without** analytics' single-`setActive` pattern — observability defaults to **multi-provider per signal type**.

### 4.1 Built-in LGTM+ plugins

Loki, Mimir, Tempo, and Pyroscope are the **default first plugins** for their respective signal types. They are not special-cased infrastructure outside the registry; they ship as built-in `LogProvider`, `MetricProvider`, `TraceProvider`, and `ProfileProvider` implementations whose default config matches Phase 1/2 compose and Helm values.

---

## 5. Contrast with `clawql-analytics`

| Aspect           | `clawql-analytics`                         | `clawql-observability` registry              |
| ---------------- | ------------------------------------------ | -------------------------------------------- |
| Active providers | **One** active at a time (`setActive`)     | **Many** per signal type (redundant fan-out) |
| Hot-path capture | TypeScript → provider HTTP API             | Alloy → exporter(s)                          |
| Provider shape   | Single `AnalyticsProvider`                 | Four signal-typed interfaces                 |
| Query            | Provider dashboard / Phase 4 aggregate API | **Federated query layer** in ClawQL (§7)     |

Analytics intentionally picks one product-analytics backend. Observability intentionally duplicates to N backends for resilience and multi-tenant routing — but that duplication happens in Alloy `output` lists, not in TS loops over providers.

---

## 6. Alloy config generator (Phase 3b)

**Input:** immutable registry snapshot (provider id, signal type, config, enabled flag, ordering).

**Output:** River fragments merged into the collector config, e.g.:

```river
otelcol.processor.batch "default" {
  output {
    logs = [
      otelcol.exporter.otlphttp.loki.input,
      otelcol.exporter.otlphttp.loki_replica.input,  // second LogProvider
    ]
  }
}
```

Rules:

1. **Registry is source of truth** — manual edits to generated blocks are overwritten on next apply (same discipline as Helm values from Operator CRD).
2. **Stable component naming** — `{signal}_{providerId}` suffixes to avoid River name collisions.
3. **Secrets by reference** — endpoints and API keys come from env/Vault placeholders in generated config, never committed plaintext.
4. **Apply path** — generate → validate (Alloy `fmt` / dry-run) → reload Alloy (SIGHUP or K8s rollout), with WORM entry on successful apply.

The generator does **not** implement retry/backpressure logic — it only declares which Alloy components exist and how they are wired.

---

## 7. Query federation (Phase 3c — the hard problem)

Ingest fan-out is Alloy's job. **Query federation is where the TypeScript layer earns its keep.**

Each signal type speaks a different query language and HTTP API:

| Signal   | Typical query API          |
| -------- | -------------------------- |
| Logs     | LogQL (Loki)               |
| Metrics  | PromQL (Mimir/Prometheus)  |
| Traces   | TraceQL / Tempo search API |
| Profiles | Pyroscope label/query API  |

The registry exposes a **governed read facade**:

- **Scope checks** before proxying queries (`observability:query_logs`, `observability:query_metrics`, …).
- **Provider selection** — query one registered backend, all backends (merge), or a configured primary with fallback.
- **Normalisation** — common time range, label matchers, and correlation keys (trace_id, service.name) mapped to each backend's dialect.
- **WORM on raw access** — federated queries that return non-aggregated raw telemetry log access events (same pattern as analytics raw-data access).

Federation is intentionally **async and request/response scoped** — unlike ingest, it does not sit on the hot path of every telemetry batch. Latency here is acceptable; correctness and auth are not.

Grafana remains the primary human correlation UI; the federation layer serves ClawQL MCP tools, Operator dashboards, and programmatic "single pane" APIs without forking Grafana itself.

---

## 8. Escape hatch: non-OTLP providers (exceptional, not less governed)

Some vendors cannot accept OTLP and require a **direct TypeScript push adapter** (custom HTTP, proprietary SDK, legacy agent protocol). This path is **exceptional** — expected to be **rare**, not the default.

**Governance rule:** _Exceptional means rare, not less audited._

Any provider on the escape hatch MUST receive the **same** treatment as OTLP-backed providers:

- Registered in the appropriate signal-typed registry with full config schema.
- Subject to the **same ATR scopes** for configure / query / export.
- **WORM entries** on add, remove, and config change.
- **Health checks** on the same schedule and with the same alerting hooks.
- Documented justification in the registration payload (why OTLP/Alloy is insufficient).

The escape hatch is a **controlled sidecar adapter**, not a back door around governance. Code review bar for new escape-hatch providers is higher than for a standard OTLP exporter block.

Implementation note: escape-hatch adapters run **out of band** from Alloy's receive loop (e.g. scheduled pull, webhook receiver, or dedicated worker). They must not block Alloy ingest or substitute for Alloy batching when OTLP is available.

---

## 9. Minimum-success quorum (deferred, Alloy-scoped)

`clawql-analytics` does not need quorum across providers (one active backend). Multi-provider observability raises the question: must **N-of-M exporters** succeed before a push is considered successful?

**Decision for v1:** **No blocking quorum in TypeScript.** Optional quorum semantics, if ever needed, belong at the **Alloy layer** (custom processor or exporter wrapper), not in application TypeScript.

**Why this is harder than `clawql-web3`:** In web3 anchoring, quorum-across-chains is naturally async and slow (block confirmation times). Waiting for N-of-M before completing an anchor matches the domain. Alloy's ingest path is supposed to be **fast and non-blocking** — a processor that waits for quorum across exporters before acknowledging a batch could introduce **backpressure and latency** into the one pipeline that must not become a bottleneck.

If quorum semantics are built later, treat them as a **separate design pass**, not a direct port of the web3 pattern. The likely observability analog is:

- **Fire-and-forget to all N exporters** (Alloy default behavior).
- **Alert if any exporter is unhealthy** via registry health polling and Alloy internal metrics — not blocking the receive path on cross-exporter agreement.

Document any future quorum processor with explicit SLO impact analysis before implementation.

---

## 10. Auth scopes (sketch)

Following `clawql-analytics`, define stable scope keys (exact names TBD in implementation):

| Scope                          | Purpose                                       |
| ------------------------------ | --------------------------------------------- |
| `observability:configure`      | Register, remove, or reconfigure providers    |
| `observability:query_logs`     | Federated LogQL / log read                    |
| `observability:query_metrics`  | Federated PromQL / metric read                |
| `observability:query_traces`   | Federated trace search                        |
| `observability:query_profiles` | Federated profile read                        |
| `observability:export`         | Export raw telemetry out of governed backends |

Ingest credentials (Faro JWT, OTLP mTLS) remain separate from registry scopes — browsers and collectors do not hold configure scopes.

---

## 11. WORM governance events (sketch)

Configuration and access only — **not** individual telemetry events:

- `OBSERVABILITY_PROVIDER_ADDED` / `_REMOVED`
- `OBSERVABILITY_PROVIDER_CONFIG_CHANGED`
- `OBSERVABILITY_ALLOY_CONFIG_APPLIED`
- `OBSERVABILITY_RAW_DATA_ACCESSED` (federated query returning raw series/logs/spans)
- `OBSERVABILITY_EXPORT_REQUESTED`

Bridge to `clawql-audit` using the same Effect patterns as analytics governance helpers.

---

## 12. Implementation sequencing

Order is deliberate — each phase unlocks the next without painting into a corner.

| Phase  | Deliverable                                                                                                                 | Rationale                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **3a** | Signal-typed interfaces, per-type registries, built-in LGTM+ provider adapters, scopes + WORM hooks, health check scheduler | Governance and data model first; no Alloy coupling yet beyond types |
| **3b** | Alloy config generator (snapshot → River), apply/reload integration, tests against `config.river` golden files _(shipped)_  | Runtime fan-out wired from registry without TS push                 |
| **3c** | Query federation facade per signal type, MCP/HTTP read API, raw-access audit                                                | Hard read-path problem; depends on stable provider metadata from 3a |

**Explicitly not in 3a–3c:** blocking N-of-M quorum processor, broad escape-hatch provider catalog, Langfuse/security-layer correlation (later package-spec phases).

---

## 13. Relationship to existing phases

- **Phase 1 (LGTM+ compose + Alloy OTLP):** Single-backend River config; registry replaces hand-edited exporter list as providers multiply.
- **Phase 2 (Faro + JWT Worker):** Ingest auth stays at the Worker/OTLP edge; registry does not mint browser JWTs. Registry may record which log/trace providers receive Faro-derived signals via generated Alloy wiring.
- **Phases 4–5 (Langfuse, security layer, alerting, Vault keys):** Additional providers register through the same signal-typed registries; alerting consumes federation + health, not duplicate provider lists.

---

## 14. Open questions (non-blocking)

1. **Operator CRD shape** — one `ObservabilityProvider` CRD per signal type vs unified CRD with discriminated union.
2. **Cross-signal correlation id** — standardise `trace_id` / `service.name` labels in generated Alloy processors vs leave to application instrumentation.
3. **Multi-tenant Mimir/Loki** — `X-Scope-OrgID` (or equivalent) per provider config vs global tenant header from Alloy.

These do not block Phase 3a registry code or this design doc.

---

_clawql-observability Provider Registry Design · Draft · August 2026_  
_Location: `docs/design/clawql-observability-provider-registry.md`_
