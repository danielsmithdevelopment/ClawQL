# ClawQL 6.0.0 — release announcement drafts (Medium, LinkedIn, HN/Reddit, X)

**After publish:** replace **`v6.0.0`** / **`6.0.0`** links below with the live [GitHub release](https://github.com/danielsmithdevelopment/ClawQL/releases) tag and [npm `clawql-mcp@6.0.0`](https://www.npmjs.com/package/clawql-mcp) once they exist.

**Planned links:** [GitHub release v6.0.0](https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v6.0.0) · [npm: clawql-mcp](https://www.npmjs.com/package/clawql-mcp) · [Docs](https://docs.clawql.com) · [CHANGELOG](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md)

---

## 1) Medium / long blog post (draft)

**Title:** _ClawQL 6.0.0: Helm broker hardening (Dragonfly), gated `sandbox_exec`, and observability that matches how you run_

**Subhead:** A **semver-major** for operators and agents: **breaking Helm value keys** for in-chart brokers, **`sandbox_exec`** only when you opt in, **Tempo + Loki** on the Docker Desktop lab path, **`audit`** metrics + optional **Loki** push, and a **Learn** walkthrough for **OpenClaw + ClawQL**.

**Body:**

**6.0.0** does not change the core promise—**`search`** and **`execute`** over merged specs—but it **does** change defaults that teams may have taken for granted: **Kubernetes installs** must migrate **Helm** keys for Redis-protocol stores, and **MCP hosts** that assumed **`sandbox_exec`** was always advertised need **`CLAWQL_ENABLE_SANDBOX=1`**.

### What is new in 6.0.0

**1. Breaking — Helm: Dragonfly only + values rename ([ADR 0003](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0003-tempo-dragonfly-local-operations.md))**

- **`stores.redis`** → **`stores.dragonfly`**, **`onyx.redis`** → **`onyx.dragonfly`** (and matching Kubernetes **Service/Deployment** name churn on upgrade).
- **No Redis OSS** image in chart defaults—**DragonflyDB** (**Apache 2.0**) for **RESP** / Celery broker workloads; **`redis://`** URLs and env names stay where upstream components expect them.

**2. Breaking — `sandbox_exec` is opt-in**

- Register the tool only with **`CLAWQL_ENABLE_SANDBOX=1`** (same **default off** band as **`schedule`**, **`notify`**, **`ouroboros_*`**). Set the flag if agents relied on **`listTools`** always including **`sandbox_exec`**.

**3. Changed — Docker Desktop Istio lab: Tempo-first traces**

- Istio sample **Jaeger** is removed from the install path; **Grafana Tempo** is the trace backend when heavy addons are on; optional **Grafana Loki** when **`CLAWQL_ISTIO_INSTALL_LOKI_TEMPO`** is not **`0`**. OTel collector forwards **OTLP** to **Tempo**.

**4. Added — `audit` observability + optional Loki**

- Prometheus counters/gauges on **`GET /metrics`** for **`audit`** traffic; optional **`CLAWQL_LOKI_PUSH_URL`** (and related env) for fire-and-forget **Loki** push per **`audit.append`**.

**5. Added — HITL / Label Studio (optional)**

- **`hitl_enqueue_label_studio`** and HTTP webhook path when **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`**—queue human review without bolting on a second product’s MCP.

**6. Added — metrics, traces, and scrape ergonomics**

- **`prom-client`** on **`GET /metrics`** for native GraphQL/gRPC merge + execute counters; optional **`CLAWQL_ENABLE_OTEL_TRACING`** + OTLP endpoints for **Tempo**-style backends; Helm **Prometheus scrape annotations** / optional **ServiceMonitor**; **`GET /healthz`** can expose per-source native protocol metrics when enabled.

**7. Added — docs site **Learn** hub + OpenClaw walkthrough**

- **`/learn`** how-to guides (TOC, sitemap, nav), including **OpenClaw with ClawQL** at **`/learn/openclaw-and-clawql`** ([#238](https://github.com/danielsmithdevelopment/ClawQL/issues/238)).

**8. Smaller shipped slices**

- Pregenerated GraphQL for more bundled providers where **`npm run pregenerate-graphql`** succeeds ([#125](https://github.com/danielsmithdevelopment/ClawQL/issues/125)); optional **Ouroboros** step to **Onyx ingest after Paperless** when configured ([#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)); Istio gateway **grpcurl** smoke helper ([#155](https://github.com/danielsmithdevelopment/ClawQL/issues/155)); plus doc cross-links (OpenClaw, Tailscale/Headscale, Grafana, deployment).

### Why it matters

Production ClawQL installs are not “npm only”—they are **Helm + mesh + observability + agents**. **6.0.0** aligns chart defaults with **license posture** and **operator reality**, tightens the **optional-tool surface** to match documented tiers, and gives you **metrics and traces** where Grafana already lives.

**CTA:** Pin **`clawql-mcp@6.0.0`**, read **[CHANGELOG](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md)** **[6.0.0]**, migrate **`values.yaml`** per **ADR 0003**, set **`CLAWQL_ENABLE_SANDBOX=1`** if you need **`sandbox_exec`**, and for the lab follow **`docs/deployment/docker-desktop-istio-observability.md`**.

---

## 2) LinkedIn (draft)

**Post:**

We shipped **clawql-mcp 6.0.0** on npm (semver-major).

Highlights:

- **Helm breaking:** **`stores.dragonfly`** / **`onyx.dragonfly`** — **Dragonfly** in-chart; no Redis OSS default (**ADR 0003**)
- **`sandbox_exec`** only when **`CLAWQL_ENABLE_SANDBOX=1`** — aligns with other opt-in tools ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207))
- **Observability:** Docker Desktop **Tempo** traces, optional **Loki**; **`audit`** → **Prometheus** + optional **Loki** push
- **Optional HITL:** Label Studio enqueue + webhook (**`CLAWQL_ENABLE_HITL_LABEL_STUDIO`**)
- **Metrics / OTLP:** **`GET /metrics`**, **`CLAWQL_ENABLE_OTEL_TRACING`**, Helm scrape annotations / ServiceMonitor
- **Docs:** **`/learn`** hub + **OpenClaw + ClawQL** walkthrough ([#238](https://github.com/danielsmithdevelopment/ClawQL/issues/238))

**Links:**  
GitHub release: `https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v6.0.0`  
npm: `https://www.npmjs.com/package/clawql-mcp`  
Docs: `https://docs.clawql.com`

#MCP #OpenAPI #Kubernetes #Helm #Grafana #Tempo #Loki #OpenTelemetry #ClawQL

---

## 3) Hacker News + Reddit (draft)

**Hacker News title:**

> ClawQL 6.0.0: Helm Dragonfly broker migration, opt-in sandbox_exec, Tempo/Loki lab + audit metrics

**Submission URL:**  
`https://github.com/danielsmithdevelopment/ClawQL/releases/tag/v6.0.0`

**First comment:**

I maintain **ClawQL**, an MCP server for **`search` / `execute`** over merged OpenAPI / native GraphQL / gRPC.

**6.0.0** is a major release focused on **operators and observability**:

- **Helm:** **`stores.redis` → `stores.dragonfly`**, **`onyx.redis` → `onyx.dragonfly`** — **DragonflyDB** replaces Redis OSS in chart defaults (**ADR 0003**). Expect resource renames on **`helm upgrade`**.
- **`sandbox_exec`** is listed only when **`CLAWQL_ENABLE_SANDBOX=1`** (breaking if you assumed it was always there).
- **Docker Desktop + Istio lab:** **Tempo** for traces, optional **Helm Loki**; Jaeger sample removed.
- **`audit`:** **Prometheus** aggregates on **`/metrics`**; optional **Loki** push via **`CLAWQL_LOKI_PUSH_URL`**.
- **Optional Label Studio HITL**, **OTLP traces** behind **`CLAWQL_ENABLE_OTEL_TRACING`**, **Prometheus scrape** annotations on the chart, **Learn** docs including **OpenClaw** integration.

CHANGELOG: `https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md`

**Reddit title option (r/selfhosted):**  
_ClawQL 6.0.0: Dragonfly-only Helm brokers, opt-in sandbox MCP tool, Grafana Tempo/Loki lab_

---

## 4) X (Twitter) thread (draft)

**1/7**  
**clawql-mcp 6.0.0** is on npm — **semver-major** for Helm + optional MCP surface.

**2/7**  
**Helm:** **`stores.dragonfly`** / **`onyx.dragonfly`** — **Dragonfly** in-chart (**Apache 2.0**), not Redis OSS. Read **ADR 0003** before **`helm upgrade`**.

**3/7**  
**`sandbox_exec`:** set **`CLAWQL_ENABLE_SANDBOX=1`** or it won’t appear in **`listTools`** — same opt-in band as **`schedule`** / **`notify`**.

**4/7**  
**Lab:** **Grafana Tempo** traces, optional **Loki**; OTel collector → **Tempo**. Jaeger sample dropped from the Docker Desktop path.

**5/7**  
**`audit`:** **Prometheus** counters on **`/metrics`**; optional **Loki** line push per append when **`CLAWQL_LOKI_PUSH_URL`** is set.

**6/7**  
**Shipped:** optional **Label Studio HITL**, **OTLP** MCP spans, **Prometheus** scrape annotations on **`clawql-mcp-http`**, **Learn** site hub + **OpenClaw + ClawQL** guide.

**7/7**  
Full notes: **CHANGELOG [6.0.0]** + **Helm README**. Pin **`@6`** when you’re ready to migrate values.
