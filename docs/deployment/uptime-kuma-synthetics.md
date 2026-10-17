# Uptime Kuma + `schedule` synthetics (#199)

**Audience:** Ops enabling a status page and HTTP synthetics next to ClawQL  
**Helm:** `uptimeKuma` in [`manifests/charts/clawql-mcp`](../../manifests/charts/clawql-mcp/)  
**MCP:** [`schedule-synthetic-checks.md`](../mcp/schedule-synthetic-checks.md) · [`notify-tool.md`](../mcp/notify-tool.md)  
**Tracking:** [#199](https://github.com/danielsmithdevelopment/ClawQL/issues/199)

ClawQL does **not** vendor Kuma into the MCP process. The chart ships an **optional** Uptime Kuma Deployment for a human status UI / probe bank; the MCP **`schedule`** tool owns **agent-driven** synthetic checks. Use both: Kuma for always-on status pages, `schedule` for policy-shaped probes that can call **`notify`**.

## Enable in Helm

```bash
helm upgrade --install clawql ./manifests/charts/clawql-mcp -n clawql --create-namespace \
  -f manifests/charts/clawql-mcp/values-uptime-kuma.example.yaml \
  --wait
```

Or minimally:

```yaml
uptimeKuma:
  enabled: true
  ingress:
    enabled: true
    hosts:
      - host: status.clawql.local
        paths:
          - path: /
            pathType: Prefix
```

Service DNS in-cluster: `http://<release>-uptime-kuma.<ns>.svc.cluster.local:3001`  
Public/dev host pattern: **`status.clawql.local`** (matches [`docs/clawql-ecosystem.md`](../clawql-ecosystem.md)).

First boot: open the UI, set the admin password, then add monitors.

## Suggested monitors (map to MCP health)

| Monitor name        | Type | URL / target                                      | Aligns with                   |
| ------------------- | ---- | ------------------------------------------------- | ----------------------------- |
| `clawql-mcp-health` | HTTP | `http://<mcp-svc>:<httpPort>/healthz`             | Chart MCP Service             |
| `clawql-mcp-ready`  | HTTP | same `/healthz` or your readiness path            | Kubernetes probes             |
| `dashboard`         | HTTP | dashboard ingress host                            | When `dashboard.enabled`      |
| `inference`         | HTTP | managed gateway / inference `/health` if deployed | When `inference` / gateway on |

Keep Kuma → in-cluster Service DNS when possible (no public exposure of internal admin ports). Use Ingress only for the Kuma UI / public status page.

## Pair with MCP `schedule` synthetics

1. Set **`enableSchedule: true`** (and optionally **`enableNotify: true`** + Slack secret) on the ClawQL release.
2. Create a synthetic job whose URL matches a Kuma monitor (same hostname or in-cluster URL), e.g. every 300s against `/healthz` with `status_in: [200]` — see [`schedule-synthetic-checks.md`](../mcp/schedule-synthetic-checks.md).
3. On failure, **`notify`** posts to Slack; Kuma can separately alert via its own notification channels (email, Discord, etc.).

**Division of labor**

| Concern                         | Owner                                                     |
| ------------------------------- | --------------------------------------------------------- |
| Public / team status page       | Uptime Kuma                                               |
| Agent-authored probe + assert   | MCP `schedule` (`synthetic`)                              |
| Human paging / Slack from agent | MCP `notify`                                              |
| Incident tool (PagerDuty, …)    | External — OpenAPI via `search` / `execute` (not bundled) |

## On-call ownership (minimum)

1. **Primary:** person/rota that owns `status.clawql.local` and Slack `#clawql-alerts` (or equivalent).
2. **Runbook link:** this page + [`schedule-synthetic-checks.md`](../mcp/schedule-synthetic-checks.md).
3. **Page when:** Kuma monitor down > 2–3 minutes **or** `schedule` synthetic fails twice in a row (tune to noise tolerance).
4. **Do not page on:** single flake during deploys if readiness already gates traffic.

PagerDuty (or similar) is **not** shipped in-tree — add an OpenAPI spec via `CLAWQL_SPEC_PATHS` when you want agents to open incidents.

## Verify

```bash
kubectl -n clawql get deploy,svc,ingress -l app.kubernetes.io/component=uptime-kuma
kubectl -n clawql port-forward svc/<release>-uptime-kuma 3001:3001
# open http://127.0.0.1:3001
```

Template render smoke (no cluster):

```bash
helm template clawql ./manifests/charts/clawql-mcp \
  -f manifests/charts/clawql-mcp/values-uptime-kuma.example.yaml \
  | rg -n 'uptime-kuma|status.clawql.local'
```
