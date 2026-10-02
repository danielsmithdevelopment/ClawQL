## clawql-mcp 6.0.0

**npm:** [clawql-mcp@6.0.0](https://www.npmjs.com/package/clawql-mcp)  
**Full changelog:** [CHANGELOG.md#600---2026-05-03](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#600---2026-05-03)

### Highlights

- **Helm breaking — Dragonfly only:** `stores.redis` → `stores.dragonfly`, `onyx.redis` → `onyx.dragonfly`; in-chart **DragonflyDB** replaces Redis OSS defaults ([ADR 0003](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0003-tempo-dragonfly-local-operations.md)). Expect Service/Deployment renames on `helm upgrade`.
- **`sandbox_exec` opt-in:** register only with **`CLAWQL_ENABLE_SANDBOX=1`** — same default-off band as **`schedule`**, **`notify`**, **`ouroboros_*`** ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)).
- **Docker Desktop Istio lab:** **Grafana Tempo** for traces (Jaeger sample removed); optional **Grafana Loki**; OTel collector → **Tempo** ([docker-desktop-istio-observability.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/docker-desktop-istio-observability.md)).
- **`audit` observability:** Prometheus aggregates on **`GET /metrics`**; optional **Loki** push via **`CLAWQL_LOKI_PUSH_URL`** per **`audit.append`**.
- **Optional HITL:** **`hitl_enqueue_label_studio`** + HTTP webhook when **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`** ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)).
- **Metrics & traces:** **`prom-client`** on **`/metrics`**; **`CLAWQL_ENABLE_OTEL_TRACING`** + OTLP; Helm **Prometheus scrape annotations** / optional **ServiceMonitor**; richer **`/healthz`** native-protocol metrics when enabled.
- **Docs site — Learn hub:** **`/learn`** guides including **OpenClaw with ClawQL** ([#238](https://github.com/danielsmithdevelopment/ClawQL/issues/238)); bundled provider **pregenerated GraphQL** where supported ([#125](https://github.com/danielsmithdevelopment/ClawQL/issues/125)); optional **Ouroboros** Onyx ingest after Paperless ([#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)).

### Install

```bash
npm install clawql-mcp@6.0.0
```

**Node:** `>=22` (see `package.json` `engines`).

### Announcement drafts

Social / long-form copy: [docs/announcements/announcement-drafts-v6.0.0.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/announcements/announcement-drafts-v6.0.0.md)
