# Bundled observability (Tier 1 Compose and lab)

**Tracking:** [#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252) · **ADR:** [0005 Langfuse default work-trace store](../adr/0005-langfuse-default-work-trace-store.md)

Greenfield installs get a **batteries-included** observability stack: Prometheus, Loki, Tempo, Grafana, OpenTelemetry Collector, and **Langfuse** (work-trace store, **opt-out**).

> **Implementation status:** Compose profile and Helm bundled values are tracked in [`7.0-observability-profiles-plan.md`](./7.0-observability-profiles-plan.md). Until shipped, use the Docker Desktop Istio lab for LGTM and deploy Langfuse separately via [`langfuse-values.example.yaml`](./langfuse-values.example.yaml).

## Profile: `bundled`

```bash
CLAWQL_OBSERVABILITY_PROFILE=bundled
```

Set automatically in Tier 1 Compose when using the `observability` profile.

## What you get

| Component | Role |
| --------- | ---- |
| **Prometheus** | Scrapes MCP `/metrics` (`clawql_audit_*`, `clawql_native_protocol_*`) |
| **Loki** | Audit log push from MCP |
| **Tempo** | Infra / MCP tool distributed traces |
| **Grafana** | Dashboards from [`docs/grafana/`](../grafana/) |
| **OTEL Collector** | Single OTLP ingress; fans out to Tempo + Langfuse |
| **Langfuse** | **Work traces** — token usage, tool spans, scores, future synthetic export |

## Quick start (planned — Tier 1 Compose)

```bash
cd examples/clawql-local-docker-compose
./bootstrap.sh
docker compose --profile observability up -d
```

Open:

| UI | URL (default) |
| -- | ------------- |
| Grafana | http://localhost:3001 |
| Langfuse | http://localhost:3002 |
| MCP metrics | http://localhost:8080/metrics |

## Opt out of Langfuse only

Langfuse is **on by default** in the bundled profile. Disable work-trace export (Tempo/Loki/metrics remain):

```bash
CLAWQL_DISABLE_LANGFUSE=1 docker compose --profile observability up -d
```

Or in `.env`:

```bash
CLAWQL_DISABLE_LANGFUSE=1
```

## Minimal observability

Metrics and audit ring buffer only — no bundled containers:

```bash
CLAWQL_OBSERVABILITY_PROFILE=minimal docker compose up -d
```

## Token savings in Langfuse

ADR 0005 standardizes span metadata for dashboards and export:

| Attribute / score | Meaning |
| ----------------- | ------- |
| `clawql.planning_bytes` | Planning-context size on `search` |
| `clawql.token_savings_estimate` | Estimated savings vs full-spec baseline |
| Score `token_savings_ratio` | Langfuse score for workflow comparisons |

Correlate with Prometheus using `clawql.correlation_id`.

## Docker Desktop Istio lab (shipped today)

Full LGTM without Langfuse in the install script:

[`docs/deployment/docker-desktop-istio-observability.md`](../deployment/docker-desktop-istio-observability.md)

Add Langfuse:

```bash
helm upgrade --install langfuse langfuse/langfuse \
  -f docs/observability/langfuse-values.example.yaml \
  --namespace langfuse --create-namespace
```

Wire MCP `extraEnv` to the collector and set `LANGFUSE_HOST` (see implementation plan Phase 3).

## Eval → Ouroboros

Tracing to Langfuse does **not** auto-mutate seeds. Enable explicitly:

```bash
CLAWQL_ENABLE_OUROBOROS=1
CLAWQL_ENABLE_LANGFUSE_EVAL=1
```

See [`docs/mcp/langfuse-eval-ouroboros.md`](../mcp/langfuse-eval-ouroboros.md).

## Related

- [Bring your own observability](./bring-your-own-observability.md)
- [7.0 implementation plan](./7.0-observability-profiles-plan.md)
- [Observability README](./README.md)
