# Changelog — clawql-observability

All notable changes to this package are documented here. The package uses [Semantic Versioning](https://semver.org/) on its **own cadence**, independent of the `clawql-mcp` major line.

**Versioning policy:** [`docs/release/clawql-observability-versioning.md`](../../docs/release/clawql-observability-versioning.md)  
**First publish checklist:** [`docs/release/clawql-observability-0.1.0-checklist.md`](../../docs/release/clawql-observability-0.1.0-checklist.md)

---

## [0.1.0] — 2026-09-01 (first npm publish)

**First public release.** Nothing was published to npm before this version. In-tree development used internal **phase** labels (Phase 1–5) and a temporary `0.7.0` workspace version that tracked implementation progress — not semver releases. **0.1.0** ships the full stack built through Phase 5.

### Included (development phases 1–5)

#### Phase 1 — LGTM+ core

- Local **docker-compose** LGTM+ stack + **Grafana Alloy** collector (`alloy/config.river`)
- Helm **values.yaml** for Kubernetes
- Effect-primary config helpers (`readObservabilityProfileEffect`, `defaultLgtmPlusHelmValues`)
- Error **fingerprint** utilities for Faro proxy
- Grafana datasource provisioning (Loki / Tempo / Mimir / Pyroscope)
- CI **LGTM+ stack smoke** (`scripts/smoke-lgtm-plus.sh`)

#### Phase 2 — Faro + ephemeral-JWT Worker proxy

- **Cloudflare Worker** (`worker/`) — HS256 JWT gate, rate limit, schema validation
- **Exception fingerprint enrichment** before forward to Alloy
- **Backend token mint** — `signTelemetryJwt` / `signTelemetryJwtEffect`
- **Alloy `faro.receiver`** on `:8027/collect` → Loki + Tempo (private ingest; no static public DSN)

#### Phase 3 — Provider registry, Alloy generator, query federation, host wiring

- **3a:** Signal-typed provider registry (logs/metrics/traces/profiles), built-in LGTM+ adapters, ATR scopes, WORM governance hooks, health scheduler
- **3b:** Registry snapshot → River config generator; validate + apply + golden fixture
- **3c:** Effect-native query federation (LogQL, PromQL, TraceQL, profiles)
- **3d:** MCP tools + HTTP routes when `CLAWQL_ENABLE_OBSERVABILITY=1`; WORM bridge; Alloy auto-apply

#### Phase 4 — Langfuse + Panguard correlation

- **Langfuse trace provider** — opt-in via `CLAWQL_ENABLE_LANGFUSE` / `LANGFUSE_ENABLED`; Alloy OTLP dual-export
- **Panguard telemetry** — `emitPanguardTelemetryEffect`; optional Loki push (`CLAWQL_PANGUARD_TELEMETRY_LOKI_URL`); host MCP tool wrap on deny

#### Phase 4b — Security sensors → Loki

- **Falco / Tetragon / Wazuh** Alloy file scrapes (`alloy/security-sensors.river`)
- **Security compose profile** — `npm run compose:security -w clawql-observability`
- Helm overlay (`helm/security-overlay.yaml`); alert rules for sensor rates
- **Grafana dashboard** — Langfuse ↔ Panguard correlation (`dashboards/langfuse-panguard-correlation.json`)

#### Phase 5 — Alerting, Vault JWT keys, Alloy reload

- **Alert catalog** — `alerts/default-alert-rules.yaml`; `ObservabilityAlertingService`
- **MCP / HTTP** — `observability_alerts`, `GET /observability/alerts`, `POST /observability/telemetry/token`
- **Vault-backed signing** — `TelemetrySigningKeyService` (`CLAWQL_TELEMETRY_JWT_VAULT_*` or `TELEMETRY_JWT_SIGNING_KEY`)
- **Alloy reload after apply** — `CLAWQL_ALLOY_RELOAD_PID` or `CLAWQL_ALLOY_RELOAD_K8S_DEPLOYMENT`

### Deferred (documented, not in 0.1.0)

- **N-of-M exporter quorum** — stays out of TypeScript; Alloy-scoped if ever implemented (provider-registry design §9)

### Peer / workspace dependencies (at publish time)

- `clawql-api@0.1.0`, `clawql-audit@0.1.0`, `clawql-core@0.1.0`
- Node `>=22`

### Install

```bash
npm install clawql-observability@0.1.0
```

Monorepo consumers: workspace pin resolves to the same version after `npm install`.
