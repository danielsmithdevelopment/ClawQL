# IDP observability bundle

**Tracking:** [#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252) · Epic [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259)

Operator-facing **metrics + traces + LLM eval** wiring for the full IDP stack. ClawQL does **not** embed Langfuse inside the MCP process — use sidecar/BYO deployment.

## Bundle index

| Layer                         | Shipped in ClawQL repo                        | Operator action                                                        |
| ----------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| **Prometheus `/metrics`**     | Yes — `GET /metrics` on MCP HTTP              | Enable chart `metrics.prometheusScrapeAnnotations` or `serviceMonitor` |
| **Grafana dashboards**        | Yes — [`docs/grafana/`](../grafana/)          | Import JSON; point at your Prometheus                                  |
| **Loki audit push**           | Yes — `CLAWQL_LOKI_PUSH_URL`                  | Optional; pairs with Grafana Loki datasource                           |
| **Distributed traces (OTLP)** | Partial — `CLAWQL_ENABLE_OTEL_TRACING` on MCP | Export to Tempo/Jaeger collector                                       |
| **Langfuse (LLM spans)**      | **BYO** — values example only                 | Deploy Langfuse; point ClawQL-Agent / LangGraph at it                  |

Deep guide: **[`idp-trace-and-metrics-guide.md`](./idp-trace-and-metrics-guide.md)**.

## Minimal smoke (metrics only)

```bash
# In-cluster or port-forward MCP HTTP
curl -s http://clawql-mcp-http:8080/metrics | grep -E '^clawql_'

# Expect at minimum:
# clawql_audit_*  clawql_native_protocol_*
```

Import dashboards:

| Dashboard     | File                                                                          | UID                         |
| ------------- | ----------------------------------------------------------------------------- | --------------------------- |
| Core MCP      | [`clawql-core-observability.json`](../grafana/clawql-core-observability.json) | `clawql-core-observability` |
| IDP operators | [`clawql-idp-observability.json`](../grafana/clawql-idp-observability.json)   | `clawql-idp-observability`  |

## Full stack smoke (lab)

Docker Desktop + Istio lab (Tempo + Loki + Prometheus): [`docs/deployment/docker-desktop-istio-observability.md`](../deployment/docker-desktop-istio-observability.md).

Add Langfuse (optional): [`langfuse-values.example.yaml`](./langfuse-values.example.yaml).

## Umbrella chart wiring

`charts/clawql-idp/values-idp-full.yaml` enables `metrics.serviceMonitor` for kube-prometheus-stack. Langfuse remains a separate Helm install.

## Related issues

- [#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210) — core Grafana (shipped)
- [#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250) — Langfuse → Ouroboros eval seeds (follow-on)
