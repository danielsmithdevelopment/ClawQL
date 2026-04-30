# ClawQL Grafana dashboards

**Shipped in-repo:** dashboard JSON + Prometheus scrape path ([#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210) — closed). **Active follow-up:** [#225](https://github.com/danielsmithdevelopment/ClawQL/issues/225) (OpenClaw exposure, extra `/metrics` panels when series land, optional GitOps dashboard wiring).

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

[#225](https://github.com/danielsmithdevelopment/ClawQL/issues/225) references importing community Istio dashboards when mesh metrics matter; typical Grafana.com IDs **7645**, **7639**, **11829** (verify against your Istio version; IDs can drift).

## Follow-up ([#225](https://github.com/danielsmithdevelopment/ClawQL/issues/225)) — OpenClaw + metrics backlog

**OpenClaw** is **not** built in this repository. Governed **iframe or deep-link** entry points from OpenClaw to Grafana (SSO, **`frame-ancestors`**, CSP) are tracked under **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)**; implementation usually lands in **Agent / OpenClaw** repos. This issue stays the **ClawQL-side umbrella** so acceptance does not get dropped.

**Suggested deliverables (cross-repo):**

| Deliverable                                            | Owner            | Notes                                                                                                  |
| ------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------ |
| Short design note (URL patterns, auth, framing policy) | OpenClaw / Agent | Link PRs back to **#225** / **#128**.                                                                  |
| Stable deep links or embedded panels                   | OpenClaw / Agent | After URLs exist, add PR links in a comment on **#225**.                                               |
| Cross-links from this repo                             | ClawQL           | This section + [`docs/openclaw/clawql-bootstrap.md`](../openclaw/clawql-bootstrap.md) § Observability. |

**Operators today (no OpenClaw required):**

- **Deep link** to this dashboard after import:  
  `https://<your-grafana>/d/clawql-core-observability/clawql-core-observability`  
  (slug may differ; copy **Share → Link** from Grafana.)
- **Iframe** only when Grafana allows framing and **OIDC/session** policies match your IdP story (see [`docs/security/clawql-security-defense-in-depth.md`](../security/clawql-security-defense-in-depth.md) § central IdP).

**Optional GitOps:** provisioning dashboards from cluster config (ConfigMap sidecar, Grafana Helm dependency) is nice-to-have under **#225** — not required for single-cluster manual import.

## Roadmap metrics (not in `/metrics` yet)

The following PromQL from [#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210) / [#225](https://github.com/danielsmithdevelopment/ClawQL/issues/225) planning is **not** wired to Prometheus today; they are documented on the dashboard as markdown until implemented:

- `clawql_mcp_tool_calls_total` …
- `clawql_ouroboros_phase_duration_seconds_bucket` …
- Merkle / document pipeline / sandbox / Cuckoo **Prometheus** series (Cuckoo today exposes **JSON** via **`/healthz`** when enabled, not Prom counters — see [`src/memory-cuckoo-metrics.ts`](../../src/memory-cuckoo-metrics.ts)).

When those land, extend **`clawql-core-observability.json`** or add sibling dashboards under this directory.
