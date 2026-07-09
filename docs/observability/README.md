# IDP observability bundle

**Tracking:** [#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252) · Epic [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259) · **ADR:** [0005 Langfuse default work-trace store](../adr/0005-langfuse-default-work-trace-store.md)

Operator-facing **metrics + traces + work traces (Langfuse) + LLM eval** wiring for the full IDP stack. ClawQL does **not** embed Langfuse inside the MCP process — deploy as a sidecar stack or use an existing instance.

## Observability profiles (7.0)

| Profile        | Guide                                               | Langfuse emission                                           |
| -------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| **`bundled`**  | [Bundled observability](./bundled-observability.md) | **On by default** (opt-out with `CLAWQL_ENABLE_LANGFUSE=0`) |
| **`external`** | [Bring your own](./bring-your-own-observability.md) | On when `LANGFUSE_HOST` + keys set; opt-out with `=0`       |
| **`minimal`**  | Metrics + audit ring buffer only                    | Off                                                         |

Implementation plan: [`7.0-observability-profiles-plan.md`](./7.0-observability-profiles-plan.md).

## Bundle index

| Layer                         | Shipped in ClawQL repo                                                | Operator action                                                        |
| ----------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Prometheus `/metrics`**     | Yes — `GET /metrics` on MCP HTTP                                      | Enable chart `metrics.prometheusScrapeAnnotations` or `serviceMonitor` |
| **Grafana dashboards**        | Yes — [`docs/grafana/`](../grafana/)                                  | Import JSON; point at your Prometheus                                  |
| **Loki audit push**           | Yes — `CLAWQL_LOKI_PUSH_URL`; opt-out **`CLAWQL_ENABLE_LOKI_PUSH=0`** | Optional; pairs with Grafana Loki datasource                           |
| **Distributed traces (OTLP)** | Partial — `CLAWQL_ENABLE_OTEL_TRACING` on MCP                         | Export to Tempo via collector                                          |
| **Langfuse (work traces)**    | **Opt-out emission** (ADR 0005); BYO deploy                           | Bundled profile or existing `LANGFUSE_HOST`                            |

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

Add Langfuse (bundled profile or BYO): [`bundled-observability.md`](./bundled-observability.md) · [`langfuse-values.example.yaml`](./langfuse-values.example.yaml).

## Umbrella chart wiring

`charts/clawql-idp/values-idp-full.yaml` enables `metrics.serviceMonitor` for kube-prometheus-stack. Langfuse remains a separate Helm install.

## Related issues

- [#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210) — core Grafana (shipped)
- [#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250) — Langfuse → Ouroboros eval seeds (follow-on)
