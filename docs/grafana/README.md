# ClawQL Grafana dashboards

Tracking: [GitHub #210](https://github.com/danielsmithdevelopment/ClawQL/issues/210) (in-repo slice). Follow-ups (OpenClaw exposure, extra metrics panels, optional GitOps dashboards): [#225](https://github.com/danielsmithdevelopment/ClawQL/issues/225).

## Bundled dashboard

| File                                                                 | UID                         | Description                                                                                                                                             |
| -------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`clawql-core-observability.json`](./clawql-core-observability.json) | `clawql-core-observability` | **Native protocol** counters/gauges exposed on **`GET /metrics`** (see [`src/native-protocol-prometheus.ts`](../../src/native-protocol-prometheus.ts)). |

### Import (any Grafana)

1. **Connections → Data sources**: point Grafana at the **Prometheus** that scrapes **ClawQL MCP HTTP** **`/metrics`** (same OpenMetrics text as `curl http://<mcp-host>:8080/metrics`). When you install **`clawql-mcp`** with **Helm** (default **`metrics.prometheusScrapeAnnotations.enabled: true`**) or **Kustomize** (`docker/kustomize/base/service-mcp-http.yaml`), the MCP Service carries **`prometheus.io/scrape`**, **`path`**, and **`port`** so the **Istio sample** Prometheus in **`istio-system`** picks up the target via its **`kubernetes-service-endpoints`** job — no manual **`scrape_config`** required for that stack. For other Prometheus deployments, add a [`scrape_config`](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#scrape_config) or enable **`metrics.serviceMonitor`** (Prometheus Operator) — see **[`charts/clawql-mcp/README.md`](../../charts/clawql-mcp/README.md)**.
2. **Dashboards → New → Import** → upload **`clawql-core-observability.json`** (or paste JSON).
3. Map **`${DS_PROMETHEUS}`** to your Prometheus that includes the ClawQL job.

For the Docker Desktop + Istio lab, see **[`docs/deployment/docker-desktop-istio-observability.md`](../deployment/docker-desktop-istio-observability.md)** (port-forward Grafana, then import here).

### Upstream Istio dashboards (mesh)

Issue [#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210) suggests importing community Istio dashboards when mesh metrics matter, for example Grafana.com IDs **7645**, **7639**, **11829** (verify against your Istio version; IDs can drift).

## OpenClaw exposure

**OpenClaw** is **not** built in this repository. Human-facing embedding (iframes to Grafana, deep links, SSO alignment) is tracked with the Agent / OpenClaw stack in **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)**.

Recommended patterns for operators:

- **Deep link** from OpenClaw to this dashboard:  
  `https://<your-grafana>/d/clawql-core-observability/clawql-core-observability`  
  (path may include a slug; copy from Grafana UI after import.)
- **Iframe** only when Grafana allows framing and **OIDC/session** policies match your OpenClaw IdP story (see [`docs/security/clawql-security-defense-in-depth.md`](../security/clawql-security-defense-in-depth.md) § central IdP).

## Roadmap metrics (not in `/metrics` yet)

The following PromQL from [#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210) planning is **not** wired to Prometheus today; they are documented on the dashboard as markdown until implemented:

- `clawql_mcp_tool_calls_total` …
- `clawql_ouroboros_phase_duration_seconds_bucket` …
- Merkle / document pipeline / sandbox / Cuckoo **Prometheus** series (Cuckoo today exposes **JSON** via **`/healthz`** when enabled, not Prom counters — see [`src/memory-cuckoo-metrics.ts`](../../src/memory-cuckoo-metrics.ts)).

When those land, extend **`clawql-core-observability.json`** or add sibling dashboards under this directory.
