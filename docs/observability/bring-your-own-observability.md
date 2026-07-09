# Bring your own observability stack

**Tracking:** [#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252) · **ADR:** [0005 Langfuse default work-trace store](../adr/0005-langfuse-default-work-trace-store.md)

Use this guide when you **already run** Prometheus, Loki, Tempo, Datadog, or Langfuse — and do **not** want ClawQL to install bundled observability charts or Compose services.

## Profile: `external`

```bash
CLAWQL_OBSERVABILITY_PROFILE=external
```

ClawQL **emits** signals to URLs you provide. It does **not** start Grafana, Loki, Tempo, or Langfuse containers.

## Minimal wiring

### Metrics (usually keep on)

Prometheus (or any scraper) polls MCP HTTP:

```text
GET http://<mcp-host>:8080/metrics
```

Disable only if policy requires it:

```bash
CLAWQL_ENABLE_HTTP_METRICS=0
```

Helm — use your Prometheus Operator `ServiceMonitor` instead of `prometheus.io` annotations:

```yaml
metrics:
  prometheusScrapeAnnotations:
    enabled: false
  serviceMonitor:
    enabled: true
    labels:
      release: your-prometheus-stack
```

### Infra traces (OTLP)

Point MCP at **your** OpenTelemetry Collector (recommended) or trace backend OTLP ingress:

```bash
CLAWQL_ENABLE_OTEL_TRACING=1
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.obs.svc.cluster.local:4318
OTEL_SERVICE_NAME=clawql-mcp
```

Your collector routes spans to Tempo, Jaeger, Datadog, etc.

### Audit logs (Loki)

```bash
CLAWQL_LOKI_PUSH_URL=https://loki.obs.svc.cluster.local:3100/loki/api/v1/push
# Optional:
CLAWQL_LOKI_BEARER_TOKEN=...
CLAWQL_LOKI_TENANT_ID=...
```

### Work traces (Langfuse) — opt-out

Langfuse is ClawQL’s default **work-trace store** for token savings and eval correlation. With an existing Langfuse deployment:

```bash
LANGFUSE_HOST=https://langfuse.corp.example
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

**Opt out** (infra traces only):

```bash
CLAWQL_ENABLE_LANGFUSE=0
```

**Alternative:** configure your collector to export LLM spans to Langfuse OTLP (`/api/public/otel`) and set `CLAWQL_ENABLE_LANGFUSE=0` on MCP to avoid duplicate export. See [Langfuse OpenTelemetry](https://langfuse.com/integrations/native/opentelemetry).

## Helm example

Save as `values-observability-external.yaml`:

```yaml
observability:
  profile: external
  bundled:
    enabled: false
  langfuse:
    enabled: false # do not install Langfuse subchart

clawql-mcp:
  metrics:
    prometheusScrapeAnnotations:
      enabled: false
    serviceMonitor:
      enabled: true
      labels:
        release: kube-prometheus-stack

  extraEnv:
    CLAWQL_OBSERVABILITY_PROFILE: external
    CLAWQL_ENABLE_OTEL_TRACING: "1"
    OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector.obs.svc:4318"
    CLAWQL_LOKI_PUSH_URL: "http://loki.obs.svc:3100/loki/api/v1/push"
    LANGFUSE_HOST: "https://langfuse.corp.example"
  extraEnvFrom:
    - secretRef:
        name: clawql-langfuse-keys
```

```bash
helm upgrade --install clawql charts/clawql-mcp \
  -f values.yaml \
  -f values-observability-external.yaml \
  --namespace clawql
```

## Grafana dashboards

Import ClawQL JSON dashboards into **your** Grafana — no need to run the repo’s Grafana:

| Dashboard | File                                                                                       |
| --------- | ------------------------------------------------------------------------------------------ |
| Core MCP  | [`docs/grafana/clawql-core-observability.json`](../grafana/clawql-core-observability.json) |
| IDP       | [`docs/grafana/clawql-idp-observability.json`](../grafana/clawql-idp-observability.json)   |

## Langfuse eval → Ouroboros (unchanged)

Work-trace emission does **not** enable seed mutation. Explicitly enable when ready:

```bash
CLAWQL_ENABLE_OUROBOROS=1
CLAWQL_ENABLE_LANGFUSE_EVAL=1
CLAWQL_LANGFUSE_WEBHOOK_TOKEN=...   # required in production
# CLAWQL_LANGFUSE_EVAL_AUTO_APPLY=1  # only after you trust the gate
```

See [`docs/mcp/langfuse-eval-ouroboros.md`](../mcp/langfuse-eval-ouroboros.md).

## Regulated / air-gapped

```bash
CLAWQL_OBSERVABILITY_PROFILE=minimal
CLAWQL_ENABLE_LANGFUSE=0
```

Metrics and audit ring buffer still work; synthetic-data export features require a policy-approved trace store.

## Related

- [Bundled observability](./bundled-observability.md) — greenfield Compose / lab
- [7.0 implementation plan](./7.0-observability-profiles-plan.md)
- [IDP trace and metrics guide](./idp-trace-and-metrics-guide.md)
