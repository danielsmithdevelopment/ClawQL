# clawql-observability

Runtime telemetry and security monitoring for ClawQL — the **LGTM+** stack:

- **L**oki — logs
- **G**rafana — correlation and dashboards
- **T**empo — distributed traces
- **M**imir — long-term Prometheus-compatible metrics
- **+** Pyroscope — continuous profiling

Distinct from:

- **`clawql-audit`** — compliance-grade, tamper-evident logging of consequential actions
- **`clawql-analytics`** — product/marketing interaction tracking (pageviews, funnels)

Full specification: [`docs/design/clawql-observability-package-spec.md`](../../docs/design/clawql-observability-package-spec.md)

## Phase 1 (v0.1)

Shipped in this package:

- Local **docker-compose** LGTM+ core + **Grafana Alloy** collector (`alloy/config.river`)
- Helm **values.yaml** for Kubernetes deploys
- Effect-primary **config helpers** (`readObservabilityProfileEffect`, `defaultLgtmPlusHelmValues`)
- Error **fingerprint** utilities for Phase 2 Faro proxy
- Grafana datasource provisioning for Loki / Tempo / Mimir / Pyroscope

## Quick start (local Grafana)

```bash
npm run build -w clawql-observability
npm run compose:up -w clawql-observability
```

Open **http://localhost:3000** (anonymous admin — local dev only).

Send OTLP to Alloy:

- gRPC `localhost:4317`
- HTTP `http://localhost:4318`

Point ClawQL MCP at the bundled profile:

```bash
export CLAWQL_OBSERVABILITY_PROFILE=bundled
export CLAWQL_OTEL_COLLECTOR_URL=http://localhost:4318
export CLAWQL_LOKI_PUSH_URL=http://localhost:3100/loki/api/v1/push
```

## Package layout

```
packages/clawql-observability/
  alloy/config.river           — collection pipeline (OTLP → LGTM+ backends)
  docker/docker-compose.yaml   — local LGTM+ stack
  helm/values.yaml             — LGTM+ enable/disable + retention
  dashboards/                  — Grafana provisioning + starter dashboard
  alerts/                      — default alert rules (Phase 5)
  worker/faro-proxy.ts         — Phase 2 JWT-gated Faro ingest (stub)
  src/                         — Effect config + fingerprint helpers
```

Reference implementation: [DevSecOps-boilerplate](https://github.com/danielsmithdevelopment/DevSecOps-boilerplate)

## Implementation phases

| Phase | Scope |
|-------|--------|
| **1** | LGTM+ core + Alloy *(this release)* |
| 2 | Faro + ephemeral-JWT Worker proxy |
| 3 | Langfuse + Panguard correlation |
| 4 | Falco / Tetragon / Wazuh security layer |
| 5 | Full alerting + Vault-backed signing keys |

## License

Apache-2.0
