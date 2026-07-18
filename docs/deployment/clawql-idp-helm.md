# ClawQL IDP Helm (umbrella chart)

**Tracking:** [#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)

Install a **k3s-friendly** intelligent document processing stack without forking the lean [`charts/clawql-mcp`](../../charts/clawql-mcp) chart.

## When to use which chart

| Chart            | Footprint            | Use case                                                  |
| ---------------- | -------------------- | --------------------------------------------------------- |
| **`clawql-mcp`** | Minimal → custom     | Production Agentic Gateway, pick your own optional stacks     |
| **`clawql-idp`** | Opinionated full lab | Local IDP + OpenClaw + document pipeline + Argo MCP hooks |

The umbrella chart is a **values wrapper** — all Kubernetes objects still render from `clawql-mcp` templates.

## Quick install (full profile)

```bash
helm dependency update charts/clawql-idp

helm upgrade --install clawql-idp charts/clawql-idp \
  -f charts/clawql-idp/values-idp-full.yaml \
  --namespace clawql --create-namespace \
  --set clawql-mcp.envFromSecret=clawql-provider-env
```

Create `clawql-provider-env` with tokens your profile needs (`PAPERLESS_API_TOKEN`, `CLAWQL_SLACK_TOKEN`, etc.) — see [configuration](../readme/configuration.md).

## Node sizing (MS-A2 class)

| Profile                       | RAM       | CPU | Notes                                                                               |
| ----------------------------- | --------- | --- | ----------------------------------------------------------------------------------- |
| Lean (`values.yaml`)          | 4 GiB     | 2   | MCP + vault only                                                                    |
| Full (`values-idp-full.yaml`) | 12–16 GiB | 4+  | Onyx + Flink + document pipeline; use `deploymentStrategy: Recreate` on single-node |

## What the full profile enables

Under `clawql-mcp:` in `values-idp-full.yaml`:

- **Document pipeline** — Docling (layout), Tika, Gotenberg, Stirling, Paperless
- **OpenClaw + dashboard** — Agent Chat bridge
- **Workflow + Argo CD MCP** — `enableWorkflow`, `enableArgoCd` (RBAC only; controllers are BYO)
- **NATS JetStream** + **Ouroboros Postgres**
- **Prometheus** — `metrics.serviceMonitor` for kube-prometheus-stack

## BYO (install separately)

| Component              | ClawQL integration         | Docs                                                                                                   |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Argo Workflows ≥ 3.4.0 | `workflow` MCP tool        | [`deployment/argo-workflows/README.md`](../../deployment/argo-workflows/README.md)                     |
| Argo CD                | `argocd` MCP tool          | [`docs/mcp/argocd-tool.md`](../mcp/argocd-tool.md)                                                     |
| Langfuse               | Agent/LLM traces (sidecar) | [`docs/observability/idp-trace-and-metrics-guide.md`](../observability/idp-trace-and-metrics-guide.md) |
| Label Studio           | HITL MCP + webhook         | [`docs/mcp/hitl-label-studio.md`](../mcp/hitl-label-studio.md)                                         |
| kube-prometheus-stack  | Scrapes `/metrics`         | [`docs/observability/README.md`](../observability/README.md)                                           |

## Observability smoke

After install:

1. `kubectl port-forward svc/clawql-mcp-http 8080:8080 -n clawql`
2. `curl -s localhost:8080/metrics | head`
3. Import [`docs/grafana/clawql-idp-observability.json`](../grafana/clawql-idp-observability.json) into Grafana

## Related

- [OpenClaw IDP skill profile](../openclaw/openclaw-idp-skill-profile.md)
- [Slack-first IDP runbook](../openclaw/slack-first-idp-runbook.md) ([#256](https://github.com/danielsmithdevelopment/ClawQL/issues/256))
- [Agent → PR → Argo CD](../gitops/agent-pr-argocd-pipeline.md) ([#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258))
