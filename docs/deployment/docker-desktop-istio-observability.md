# Docker Desktop: Istio and the observability stack

This guide explains what ClawQL’s **optional Istio path** installs on **local desktop Kubernetes** (Docker Desktop or Rancher Desktop), how the pieces fit together, and how to **get started with each tool** if you have never used it before.

**Canonical scripts:** [`scripts/kubernetes/local-k8s-docker-desktop.sh`](../../scripts/kubernetes/local-k8s-docker-desktop.sh) (orchestration) and [`scripts/kubernetes/install-istio-docker-desktop.sh`](../../scripts/kubernetes/install-istio-docker-desktop.sh) (Istio + addons). **Operator README:** [`docker/README.md`](../../docker/README.md) (Istio section, port-forwards, env toggles).

**Scope:** **Local** clusters only (Docker Desktop / Rancher). The same upstream **Istio sample YAML** is used by many tutorials; ClawQL adds a small **OpenTelemetry Collector** manifest so application OTLP has a stable in-cluster target.

---

## Audience

- You ran **`make local-k8s-up`** (or **`bash scripts/kubernetes/local-k8s-docker-desktop.sh`**) with **`CLAWQL_LOCAL_K8S_ISTIO=ambient`** or **`sidecar`**.
- You want a **plain-language** map of **Prometheus**, **Grafana**, **Loki**, **Tempo**, **Kiali**, and the **OTel Collector**, plus **first steps** in each UI or API.

If you only need the MCP URL and health checks, start with [`docker/README.md`](../../docker/README.md) and the [Kubernetes](../readme/deployment.md#kubernetes) section in **`docs/readme/deployment.md`**.

---

## What gets installed (at a glance)

When **`CLAWQL_LOCAL_K8S_ISTIO`** is set, the install script runs **before** the ClawQL Helm release:

1. **Istio control plane** in **`istio-system`** (**`istiod`**, and in **ambient** mode **`istio-cni`** + **`ztunnel`**).
2. **Ingress gateway** for MCP (Helm **`istio/gateway`**, **`Gateway`**, **`VirtualService`**) — see [`docker/README.md`](../../docker/README.md).
3. **Sample addons** from the Istio release tag **`CLAWQL_ISTIO_VERSION`** (default **1.29.2**), under **`https://raw.githubusercontent.com/istio/istio/<version>/samples/addons/`**:
   - **`prometheus.yaml`**
   - **`kiali.yaml`**
   - **`grafana.yaml`** — unless you opt out of “heavy” addons (below).
4. **Grafana Tempo** (Helm **`clawql-tempo`** in **`istio-system`**) when heavy addons are on — single-binary **lab** sizing.
5. **Grafana Loki** (Helm **`clawql-loki`**) when **`CLAWQL_ISTIO_INSTALL_LOKI_TEMPO`** is not **`0`**.
6. **ClawQL OTel Collector** — [`docker/istio/docker-desktop/otel-collector.yaml`](../../docker/istio/docker-desktop/otel-collector.yaml): receives **OTLP** and forwards traces to **Tempo**.

| Piece                     | Kubernetes namespace | Main Service (ClusterIP) | You reach it by                                      |
| ------------------------- | -------------------- | ------------------------ | ---------------------------------------------------- |
| **Istio control plane**   | `istio-system`       | (various)                | `kubectl`; not a browser UI by default               |
| **Prometheus**            | `istio-system`       | `prometheus`             | Port-forward **9090**                                |
| **Grafana**               | `istio-system`       | `grafana`                | Port-forward **3000**                                |
| **Loki** (HTTP API)       | `istio-system`       | `clawql-loki`            | Port-forward **3100**; push **`/loki/api/v1/push`**  |
| **Tempo** (HTTP query)    | `istio-system`       | `clawql-tempo`           | Port-forward **3200** (Grafana **Tempo** datasource) |
| **Tempo** (OTLP ingest)   | `istio-system`       | `clawql-tempo`           | In-cluster **4317** / **4318**                       |
| **Kiali**                 | `istio-system`       | `kiali`                  | Port-forward **20001**                               |
| **ClawQL OTel Collector** | `istio-system`       | `clawql-otel-collector`  | In-cluster OTLP **4317** / **4318**                  |
| **ClawQL MCP**            | `clawql` (default)   | `clawql-mcp-http`        | LoadBalancer **8080** and/or Istio gateway **:80**   |

**ClawQL’s own metrics** (OpenMetrics) are still exposed by the MCP pod at **`GET /metrics`** on the HTTP port; that is **separate** from the Prometheus UI inside **`istio-system`**, which scrapes many mesh and addon targets.

---

## Resource and opt-out knobs

- **Docker Desktop:** give Kubernetes enough **CPU and RAM** (full ClawQL + Onyx + Istio + Grafana/Tempo is heavy). If pods stay **Pending**, raise memory or disable heavy pieces.
- **`CLAWQL_ISTIO_INSTALL_KIALI=0`** — skip **all** Istio sample addons (no Prometheus/Kiali/Grafana from this path).
- **`CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS=0`** — keep **Prometheus + Kiali**, skip **Grafana**, **Tempo**, **Loki**, and the **ClawQL OTel Collector** (lighter cluster).
- **`CLAWQL_ISTIO_INSTALL_LOKI_TEMPO=0`** — when heavy addons are **on**, skip **Helm** **`clawql-loki`** only (**Tempo** and the OTel collector remain).
- **`CLAWQL_LOKI_CHART_VERSION`** / **`CLAWQL_TEMPO_CHART_VERSION`** — pin **Grafana** Helm charts (defaults **6.55.0** / **1.24.4** in the install script).
- **`CLAWQL_ISTIO_VERSION`** — pin the Istio chart and raw addon YAML version (must match for sample URLs).

---

## Install and quick verification

```bash
CLAWQL_LOCAL_K8S_ISTIO=ambient make local-k8s-up
```

Check control plane and addons:

```bash
kubectl --context docker-desktop get pods -n istio-system
kubectl --context docker-desktop get svc -n istio-system
```

Expect **Running** pods for Prometheus, Grafana, Kiali (when not skipped), plus **`clawql-tempo`** and **`clawql-otel-collector`** when heavy addons are on. When **`CLAWQL_ISTIO_INSTALL_LOKI_TEMPO`** is not **`0`**, also **`clawql-loki`**.

---

## Getting started: Prometheus (complete beginner)

**What it is:** **Prometheus** stores **numeric time series** (metrics): counters, gauges, histograms. Things you care about (request rate, errors, CPU) are **scraped** over HTTP on a schedule and **queried** with a language called **PromQL**.

**Why it appears here:** Istio’s sample manifest deploys Prometheus **preconfigured** to scrape Istio, Envoy, and related endpoints so you can **debug the mesh** without building your own scrape config first.

### First session (about 5 minutes)

1. In a terminal (repo root optional), run:

   ```bash
   kubectl --context docker-desktop port-forward -n istio-system svc/prometheus 9090:9090
   ```

2. Open **http://localhost:9090** in a browser.
3. Click **Graph** (older UI) or use **Query** depending on version.
4. In the query box, type **`up`** and click **Execute**. You should see time series with value **1** for targets that are reachable (meaning “this scrape job is up”).
5. Try **`istio_requests_total`** (may be empty until there is traffic). Generate traffic to **`http://localhost/mcp`** or your UI, then run the query again.

**Mental model:** Prometheus answers **“what is the rate / count / latency of X?”** It does **not** store full request bodies or distributed traces (that is **Tempo** / Grafana Explore).

---

## Getting started: Grafana (complete beginner)

**What it is:** **Grafana** is a **dashboard** tool. It **does not** invent metrics; it **reads** data sources (here, often **Prometheus**) and draws charts you can save and share.

**Why it appears here:** Istio’s **`grafana.yaml`** ships **datasource** and **dashboard** ConfigMaps so you can see **service mesh** health quickly.

### First session

1. Port-forward:

   ```bash
   kubectl --context docker-desktop port-forward -n istio-system svc/grafana 3000:3000
   ```

2. Open **http://localhost:3000**.
3. Log in with the **default credentials from the Istio sample** (as of common Istio releases): user **`admin`**, password **`admin`**. **Change or disable this in anything beyond a disposable laptop lab.**
4. Open **Connections → Data sources** (or **Configuration → Data sources** in older layouts) and confirm **Prometheus** points at the in-cluster Prometheus service.
5. Open **Dashboards** and browse folders such as **Istio** (names vary by version). Pick any dashboard and watch panels while you send traffic to ClawQL.
6. **ClawQL application metrics:** with the default **Helm** release (**`metrics.prometheusScrapeAnnotations.enabled: true`**) or **Kustomize** base Service, **Istio’s** Prometheus should already scrape **`/metrics`** on **`clawql-mcp-http`** (check **Status → Targets** in the Prometheus UI). Import the bundled dashboard **[`docs/grafana/clawql-core-observability.json`](../grafana/clawql-core-observability.json)** — see **[`docs/grafana/README.md`](../grafana/README.md)** and **`charts/clawql-mcp/README.md`** ([#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210)).

**Mental model:** Grafana answers **“show me a curated picture of metrics.”** Dig into raw series in **Prometheus** if a panel looks wrong.

---

## Getting started: Loki (complete beginner)

**What it is:** **Grafana Loki** is a **log aggregation** system (like a lightweight Elasticsearch for labels + compressed log lines). ClawQL can **`POST`** **`audit.append`** JSON lines here when **`CLAWQL_LOKI_PUSH_URL`** is set — see **[`docs/mcp/mcp-tools.md`](../mcp/mcp-tools.md)** § **`audit`**.

**Why it appears here:** The install script deploys a **single-binary** Loki ([`docker/istio/docker-desktop/loki-values-docker-desktop.yaml`](../../docker/istio/docker-desktop/loki-values-docker-desktop.yaml)) suited to **Docker Desktop** labs (not HA production sizing).

### First session

1. Confirm the pod is running: **`kubectl --context docker-desktop -n istio-system get pods -l app.kubernetes.io/name=loki`** (name may include **`clawql-loki`**).
2. Port-forward the API:

   ```bash
   kubectl --context docker-desktop port-forward -n istio-system svc/clawql-loki 3100:3100
   ```

3. **In-cluster push URL for `clawql-mcp-http`:** **`http://clawql-loki.istio-system.svc.cluster.local:3100/loki/api/v1/push`** (see **`.env.example`**).

4. **Grafana:** add a **Loki** data source with URL **`http://clawql-loki:3100`** (works from the Grafana pod in the same namespace). Explore logs with LogQL.

**Mental model:** Loki answers **“what text lines matched these labels?”** — pair with **`clawql_audit_*`** Prometheus metrics on **`GET /metrics`** for rates and buffer health.

---

## Getting started: Grafana Tempo (complete beginner)

**What it is:** **Grafana Tempo** is a **distributed tracing backend** paired with Grafana so you can **search** and **visualize** traces (waterfall spans) for requests that cross services.

**Why it appears here:** Single-binary Tempo ([`docker/istio/docker-desktop/tempo-values-docker-desktop.yaml`](../../docker/istio/docker-desktop/tempo-values-docker-desktop.yaml)) receives OTLP from the **ClawQL OTel Collector** whenever heavy observability addons are on (independent of whether **Loki** is installed).

### First session

1. Confirm **`kubectl --context docker-desktop -n istio-system get pods -l app.kubernetes.io/name=tempo`** is **Running**.
2. Port-forward the HTTP query port:

   ```bash
   kubectl --context docker-desktop port-forward -n istio-system svc/clawql-tempo 3200:3200
   ```

3. **Grafana:** add a **Tempo** data source with URL **`http://clawql-tempo:3200`** (in-cluster from Grafana). Use **Explore → Tempo** for traces.

**Mental model:** Tempo answers **“which microservice calls happened for this request, and how long did each take?”** — complement **Kiali** (topology) and **Prometheus** (aggregates).

---

## Getting started: Kiali (complete beginner)

**What it is:** **Kiali** is a **console for Istio**: service **graph**, configuration health, **virtual services**, traffic flags, and links out to metrics/traces depending on setup.

**Why it appears here:** It is the fastest way to see **which service talks to which** inside the mesh and whether Istio objects look healthy.

### First session

1. Port-forward:

   ```bash
   kubectl --context docker-desktop port-forward -n istio-system svc/kiali 20001:20001
   ```

2. Open **http://localhost:20001/kiali** (path may vary slightly by version).
3. Open **Graph**. Pick namespace **`clawql`** (and **`istio-system`** if you want the control plane). Click **Display** / **Traffic** options to show HTTP rates, errors, etc.
4. Click a **node** (service) to open the side panel: **health**, **inbound/outbound** metrics shortcuts, **configuration** checks.

**Mental model:** Kiali answers **“what is wired in the mesh, and where is traffic flowing?”** It is not a log archive; use your logging stack for raw logs.

---

## Getting started: OpenTelemetry Collector (ClawQL’s)

**What it is:** The **OpenTelemetry Collector** is a **vendor-neutral agent**: it **receives** telemetry (often **OTLP**) from apps and **exports** it to backends (here, **OTLP gRPC** to **Tempo**).

**Why ClawQL ships one:** A single stable Service (**`clawql-otel-collector`**) gives **`clawql-mcp-http`** a clear **`OTEL_EXPORTER_OTLP_*`** target without coupling MCP to Tempo’s Helm chart Service shape. You may still send OTLP **directly** to **`clawql-tempo`** if you prefer.

### Verify it is running

```bash
kubectl --context docker-desktop -n istio-system get deploy,svc clawql-otel-collector
kubectl --context docker-desktop -n istio-system logs deploy/clawql-otel-collector --tail=50
```

You do **not** need a browser UI for the collector; **Grafana Explore (Tempo)** is where traces appear after MCP emits spans.

**Mental model:** The collector answers **“accept OTLP from my app on a well-known DNS name and forward it.”**

---

## ClawQL MCP metrics vs mesh observability

| Signal                                                       | Where                                                                      | Beginner note                                                                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Application metrics** (merge counts, execute totals, etc.) | **`GET http://<mcp-host>:8080/metrics`** on the MCP Service / port-forward | OpenMetrics text for **Prometheus-style** scraping of the **MCP process**; see [`docs/readme/deployment.md`](../readme/deployment.md).          |
| **Mesh / Istio metrics**                                     | Prometheus in **`istio-system`**                                           | Scraped from Envoy, Istio components, addons — **different** scrape config from the MCP `/metrics` path.                                        |
| **Distributed traces (MCP tool spans)**                      | **Grafana Tempo** (Explore) after OTLP export                              | Opt-in: **`CLAWQL_ENABLE_OTEL_TRACING`**, OTLP env — see [`.env.example`](../../.env.example) and **`src/otel-tracing.ts`**. Collector → Tempo. |
| **Audit / agent logs (JSON lines)**                          | **Loki** (optional **`CLAWQL_LOKI_PUSH_URL`**)                             | MCP **`audit.append`** can push to Loki; explore in Grafana **Explore**.                                                                        |

---

## See also

- [`docker/README.md`](../../docker/README.md) — **Istio + observability** env vars, MCP gateway URLs, port-forward cheat sheet.
- [`docs/readme/deployment.md`](../readme/deployment.md) — Kubernetes entry points and links.
- [`docs/deployment/helm.md`](helm.md) — **`charts/clawql-mcp`** values, including **`extraEnv`** for OTLP.
- Issue [**#155**](https://github.com/danielsmithdevelopment/ClawQL/issues/155) — Istio / mesh tracking.
- [**ADR 0003** — Tempo + Dragonfly for local ops](../adr/0003-tempo-dragonfly-local-operations.md) — why this path is **Tempo-only** for traces (no Jaeger sample addon).
- Broader **full-stack observability** roadmap may be tracked in additional GitHub issues (Helm subcharts, production sizing, etc.); this document focuses on the **Docker Desktop + Istio sample addons** path.
