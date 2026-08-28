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

- Local **docker-compose** LGTM+ core + **Grafana Alloy** collector (`alloy/config.river`)
- Helm **values.yaml** for Kubernetes deploys
- Effect-primary **config helpers** (`readObservabilityProfileEffect`, `defaultLgtmPlusHelmValues`)
- Error **fingerprint** utilities for Faro proxy
- Grafana datasource provisioning for Loki / Tempo / Mimir / Pyroscope
- CI **LGTM+ stack smoke** (compose + OTLP + read-back)

## Phase 2 (v0.2) — Faro + ephemeral-JWT Worker proxy

Shipped in this release:

- **Cloudflare Worker** (`worker/`) — HS256 JWT gate, rate limit, schema validation, silent 204 drops
- **Exception fingerprint enrichment** before forward to Alloy
- **Backend token mint** — `signTelemetryJwt` / `signTelemetryJwtEffect` for session-scoped ingest JWTs
- **Alloy `faro.receiver`** on `:8027/collect` → Loki logs + Tempo traces (private; no static public DSN)

### Worker deploy

```bash
cd packages/clawql-observability/worker
echo "$JWT_SIGNING_KEY" | npx wrangler secret put JWT_SIGNING_KEY
npm run deploy
```

Set `ALLOY_INGEST_URL` to your private Alloy Faro endpoint (not public). Browsers hit the Worker; the Worker forwards to Alloy.

### Backend token issuance

```ts
import { signTelemetryJwt } from "clawql-observability";

const { token, expiresAt } = await signTelemetryJwt({
  signingKey: process.env.TELEMETRY_JWT_SIGNING_KEY!,
  claims: {
    sub: sessionId,
    project: "frontend-prod",
    origin: "https://app.example.com",
  },
});
// Return { token, expires_at: expiresAt } from POST /api/telemetry/token
```

## Quick start (local Grafana)

```bash
npm run build -w clawql-observability
npm run compose:up -w clawql-observability
```

CI smoke: workflow **LGTM+ stack smoke** runs `scripts/smoke-lgtm-plus.sh`.

```bash
npm run smoke:compose -w clawql-observability
```

Open **http://localhost:3000** (anonymous admin — local dev only).

Send OTLP to Alloy:

- gRPC `localhost:4317`
- HTTP `http://localhost:4318`

Faro ingest (private, local):

- `http://localhost:8027/collect` — use via Worker in production; direct only for dev

## Package layout

```
packages/clawql-observability/
  alloy/config.river           — OTLP + Faro collection pipeline
  docker/docker-compose.yaml   — local LGTM+ stack
  helm/values.yaml             — LGTM+ enable/disable + retention
  worker/                      — Cloudflare Faro proxy (Phase 2)
  src/                         — Effect config, fingerprint, telemetry JWT mint
  scripts/smoke-lgtm-plus.sh     — CI compose smoke
```

Reference implementation: [DevSecOps-boilerplate](https://github.com/danielsmithdevelopment/DevSecOps-boilerplate)

## Implementation phases

| Phase | Scope                                      |
| ----- | ------------------------------------------ |
| **1** | LGTM+ core + Alloy _(merged)_              |
| **2** | Faro + ephemeral-JWT Worker proxy _(this)_ |
| 3     | Langfuse + Panguard correlation            |
| 4     | Falco / Tetragon / Wazuh security layer    |
| 5     | Full alerting + Vault-backed signing keys  |

## License

Apache-2.0
