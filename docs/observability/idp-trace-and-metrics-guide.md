# IDP trace and metrics operator guide

**Tracking:** [#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252)

Choose backends for **three signal types** in an IDP deployment:

| Signal                | What it answers                                       | Recommended backend                                                                               |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Metrics**           | Throughput, errors, audit volume, native protocol mix | **Prometheus** (scrape MCP `/metrics`)                                                            |
| **Logs**              | Structured audit events, operator grep                | **Loki** (`CLAWQL_LOKI_PUSH_URL`) or cluster logging                                              |
| **Traces (infra)**    | Request latency across MCP tools, mesh hops           | **Tempo** (lab) or vendor backend via OTLP collector                                              |
| **Work traces (LLM)** | Prompt → tool → token savings → eval → export         | **Langfuse** — **opt-out** default ([ADR 0005](../adr/0005-langfuse-default-work-trace-store.md)) |

## Trace backend choice (ADR 0003)

[ADR 0003: Tempo + Dragonfly local operations](../adr/0003-tempo-dragonfly-local-operations.md) favors **Grafana Tempo** in the Docker Desktop / Istio lab for low ops overhead. Production clusters may prefer **Jaeger** or a managed trace backend — the MCP server exports **OTLP** when enabled:

```bash
CLAWQL_ENABLE_OTEL_TRACING=1
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=clawql-mcp
```

Wire the collector to Tempo or Jaeger. See [`docker/istio/docker-desktop/otel-collector.yaml`](../../docker/istio/docker-desktop/otel-collector.yaml).

**ClawQL-Agent / LangGraph** traces should use the same OTLP endpoint or a dedicated Langfuse project — coordinate in [ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent).

## Prometheus scrape patterns

### Service annotations (default)

Helm `metrics.prometheusScrapeAnnotations.enabled: true` adds:

```yaml
prometheus.io/scrape: "true"
prometheus.io/path: /metrics
prometheus.io/port: "8080"
```

Works with Istio sample Prometheus `kubernetes-service-endpoints` job.

### ServiceMonitor (kube-prometheus-stack)

```yaml
# charts/clawql-mcp/values.yaml or clawql-idp values-idp-full.yaml
metrics:
  serviceMonitor:
    enabled: true
    labels:
      release: kube-prometheus-stack
```

Requires `monitoring.coreos.com/v1` ServiceMonitor CRD.

### Key series today

| Metric family              | Source                      |
| -------------------------- | --------------------------- |
| `clawql_audit_*`           | MCP `audit` tool aggregates |
| `clawql_native_protocol_*` | GraphQL/gRPC execute path   |

Roadmap (not yet on `/metrics`): `clawql_mcp_tool_calls_total`, Ouroboros phase histograms, document pipeline counters — see [`docs/grafana/README.md`](../grafana/README.md).

## Langfuse (work-trace store — opt-out)

ClawQL treats Langfuse as the default **work-trace ledger** for token savings, eval scores, and future synthetic-data export — not optional debug tooling. See [ADR 0005](../adr/0005-langfuse-default-work-trace-store.md).

- **Bundled profile:** Langfuse ships with Tier 1 Compose `observability` profile (planned 7.0) — [`bundled-observability.md`](./bundled-observability.md)
- **External profile:** point at your instance — [`bring-your-own-observability.md`](./bring-your-own-observability.md)
- **Opt-out:** `CLAWQL_ENABLE_LANGFUSE=0` or `CLAWQL_OBSERVABILITY_PROFILE=minimal`

Deploy separately when not using bundled profile:

1. Install Langfuse (cloud or self-hosted) — example values: [`langfuse-values.example.yaml`](./langfuse-values.example.yaml)
2. Set `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` on **clawql-mcp** (OTLP) and **ClawQL-Agent** / LangGraph runtimes
3. Correlate with Prometheus using `clawql.correlation_id` in spans and `audit.append`

Scrape Langfuse's own metrics endpoint if your Langfuse chart exposes `/metrics` for Grafana.

## Grafana dashboards

1. Add Prometheus datasource (and optional Loki + Tempo)
2. Import [`clawql-core-observability.json`](../grafana/clawql-core-observability.json)
3. Import [`clawql-idp-observability.json`](../grafana/clawql-idp-observability.json) for audit + IDP operator panels

## Health checks

| Endpoint       | Purpose                                          |
| -------------- | ------------------------------------------------ |
| `GET /healthz` | Liveness; optional native protocol + Cuckoo JSON |
| `GET /metrics` | Prometheus scrape                                |

Pair with Kubernetes `livenessProbe` / `readinessProbe` on port 8080 (configured in `clawql-mcp` Deployment template).

## Copy-paste lab additions

**Prometheus + Grafana only (no Langfuse):**

```bash
helm upgrade --install clawql-idp charts/clawql-idp \
  -f charts/clawql-idp/values-idp-full.yaml \
  --namespace clawql --create-namespace
# + install kube-prometheus-stack in monitoring namespace
```

**Add Tempo/Loki:** follow [`docker-desktop-istio-observability.md`](../deployment/docker-desktop-istio-observability.md).

**Add Langfuse:** apply [`langfuse-values.example.yaml`](./langfuse-values.example.yaml) in a `langfuse` namespace; do not merge into `clawql-mcp` Deployment.
