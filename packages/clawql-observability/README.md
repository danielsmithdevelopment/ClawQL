# clawql-observability

Runtime telemetry and security monitoring for ClawQL — the **LGTM+** stack:

- **L**oki — logs
- **G**rafana — correlation and dashboards
- **T**empo — distributed traces
- **M**imir — long-term Prometheus-compatible metrics
- **+** Pyroscope — continuous profiling

**Public docs:** [docs.clawql.com/observability](https://docs.clawql.com/observability) — LGTM+ ingest, governed multi-provider registry, Alloy fan-out, and Faro JWT proxy.

Distinct from:

- **`clawql-audit`** — compliance-grade, tamper-evident logging of consequential actions
- **`clawql-analytics`** — product/marketing interaction tracking (pageviews, funnels)

Full specification: [`docs/design/clawql-observability-package-spec.md`](../../docs/design/clawql-observability-package-spec.md)  
Provider registry: [`docs/design/clawql-observability-provider-registry.md`](../../docs/design/clawql-observability-provider-registry.md)

## Phase 1 (v0.1)

- Local **docker-compose** LGTM+ core + **Grafana Alloy** collector (`alloy/config.river`)
- Helm **values.yaml** for Kubernetes deploys
- Effect-primary **config helpers** (`readObservabilityProfileEffect`, `defaultLgtmPlusHelmValues`)
- Error **fingerprint** utilities for Faro proxy
- Grafana datasource provisioning for Loki / Tempo / Mimir / Pyroscope
- CI **LGTM+ stack smoke** (compose + OTLP + read-back)

## Phase 2 (v0.2) — Faro + ephemeral-JWT Worker proxy

- **Cloudflare Worker** (`worker/`) — HS256 JWT gate, rate limit, schema validation, silent 204 drops
- **Exception fingerprint enrichment** before forward to Alloy
- **Backend token mint** — `signTelemetryJwt` / `signTelemetryJwtEffect` for session-scoped ingest JWTs
- **Alloy `faro.receiver`** on `:8027/collect` → Loki logs + Tempo traces (private; no static public DSN)

## Phase 3a (v0.3) — Provider registry skeleton

- **Signal-typed interfaces** — `LogProvider`, `MetricProvider`, `TraceProvider`, `ProfileProvider`
- **Per-type registries** — multi-provider per signal (register / remove / list / snapshot / updateConfig)
- **Built-in LGTM+ adapters** — Loki, Mimir, Tempo, Pyroscope as default plugins
- **ATR scopes** — `observability:configure`, `observability:query_*`, `observability:export`
- **WORM governance hooks** — provider add/remove/config change (via `ObservabilityGovernanceSink`)
- **Health checks** — `ObservabilityHealthService.runOnce()` and optional scheduler

### Registry quick start

```typescript
import { Effect, Layer } from "effect";
import {
  ObservabilityLive,
  registerBuiltinLgtmProvidersEffect,
  ObservabilityHealthService,
} from "clawql-observability";

const program = Effect.gen(function* () {
  yield* registerBuiltinLgtmProvidersEffect();
  const health = yield* ObservabilityHealthService;
  return yield* health.runOnce();
});

await Effect.runPromise(program.pipe(Effect.provide(ObservabilityLive)));
```

## Phase 3b (v0.4) — Alloy config generator

Registry snapshot → complete River config (exporters, batch fan-out, optional Faro). Apply writes the file, validates braces/required components, and emits `OBSERVABILITY_ALLOY_CONFIG_APPLIED`.

```typescript
import { Effect } from "effect";
import {
  ObservabilityLive,
  ObservabilityGovernanceSinkLive,
  registerBuiltinLgtmProvidersEffect,
  snapshotRegistriesForAlloyEffect,
  applyAlloyConfigEffect,
} from "clawql-observability";

const program = Effect.gen(function* () {
  yield* registerBuiltinLgtmProvidersEffect();
  const generation = yield* snapshotRegistriesForAlloyEffect();
  return yield* applyAlloyConfigEffect({
    session: { sub: "ops", scope: ["observability:configure"] },
    actorId: "ops",
    generation,
    outputPath: "./alloy/config.generated.river",
  });
});

await Effect.runPromise(
  program.pipe(Effect.provide(ObservabilityLive), Effect.provide(ObservabilityGovernanceSinkLive))
);
```

Golden fixture: `src/alloy/__fixtures__/lgtm-default.river.golden`.

## Phase 3c (v0.5) — Query federation (Effect-native)

Governed read facade over registered backends. All IO is Effect (`Context.Tag` + `Layer`); HTTP goes through `TelemetryQueryTransport` so tests substitute a Layer instead of mocking `fetch`.

```typescript
import { Effect, Layer } from "effect";
import {
  ObservabilityWithQueryLive,
  ObservabilityGovernanceSinkLive,
  ObservabilityQueryService,
  registerBuiltinLgtmProvidersEffect,
} from "clawql-observability";

const program = Effect.gen(function* () {
  yield* registerBuiltinLgtmProvidersEffect();
  const query = yield* ObservabilityQueryService;
  return yield* query.queryLogs(
    { sub: "reader", scope: ["observability:query_logs"] },
    {
      logql: '{service="api"} |= "error"',
      timeRange: { startMs: Date.now() - 3_600_000, endMs: Date.now() },
      selection: { mode: "all" },
    }
  );
});

await Effect.runPromise(
  program.pipe(
    Effect.provide(ObservabilityWithQueryLive),
    Effect.provide(ObservabilityGovernanceSinkLive)
  )
);
```

APIs: `queryLogs` (LogQL), `queryMetrics` (PromQL), `queryTraces` (TraceQL), `queryProfiles`. Selection modes: `one` | `all` | `primary`. Raw results emit `OBSERVABILITY_RAW_DATA_ACCESSED`.

## Phase 3d (v0.6) — Host integration

Wires the Phase 3 library into the MCP host and optional HTTP read API.

- **MCP tools** (when `CLAWQL_ENABLE_OBSERVABILITY=1` or CRD `observability.enabled`): `observability_query_logs`, `observability_query_metrics`, `observability_query_traces`, `observability_query_profiles`, `observability_health`, `observability_apply_alloy_config`
- **HTTP routes** (same flag): `GET /observability/health`, `POST /observability/query/*`, `POST /observability/alloy/apply` — optional `CLAWQL_OBSERVABILITY_API_KEY`
- **WORM bridge**: governance events dual-write to process WORM when `CLAWQL_WORM_ENABLED=1`
- **Health scheduler**: background checks every `CLAWQL_OBSERVABILITY_HEALTH_INTERVAL_MS` (default 60000)
- **Alloy auto-apply**: set `CLAWQL_OBSERVABILITY_ALLOY_AUTO_APPLY=1` to regenerate River on boot

Session scopes for MCP/HTTP calls resolve from `CLAWQL_OBSERVABILITY_ATR_SCOPE` (comma/space separated) or default to permissive local `*` for noAuth demos.

```bash
CLAWQL_ENABLE_OBSERVABILITY=1 \
CLAWQL_OBSERVABILITY_ATR_SCOPE="observability:query_logs observability:configure" \
npm run start:http
```

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
  alloy/security-sensors.river — Falco/Tetragon/Wazuh → Loki (Phase 4b)
  docker/docker-compose.yaml   — local LGTM+ stack
  helm/values.yaml             — LGTM+ enable/disable + retention
  worker/                      — Cloudflare Faro proxy (Phase 2)
  src/                         — Effect config, registry, Alloy generator, query federation, JWT mint
  src/alloy/                   — River generate / validate / apply (Phase 3b)
  src/query/                   — Federated LogQL/PromQL/TraceQL/profile reads (Phase 3c)
  src/alerting/                — Health-driven alerts + rule catalog (Phase 5)
  src/correlation/             — Panguard deny/allow telemetry (Phase 4)
  src/secrets/                 — Vault/env Faro JWT signing keys (Phase 5)
  dashboards/                  — Grafana overview + Langfuse/Panguard correlation
  scripts/smoke-lgtm-plus.sh   — CI compose smoke
```

Reference implementation: [DevSecOps-boilerplate](https://github.com/danielsmithdevelopment/DevSecOps-boilerplate)

## Phase 4 (v0.7) — Langfuse + Panguard correlation

- **Langfuse trace provider** (`langfuse-otel`) — opt-in via `CLAWQL_ENABLE_LANGFUSE` / `LANGFUSE_ENABLED`; Alloy dual-exports OTLP traces with `Authorization = sys.env(LANGFUSE_OTLP_AUTH_HEADER)`
- **Panguard telemetry** — `emitPanguardTelemetryEffect` emits shared `clawql.*` attributes (optional Loki push via `CLAWQL_PANGUARD_TELEMETRY_LOKI_URL`); host MCP tool wrap records deny decisions

## Phase 4b — Falco / Tetragon / Wazuh → Loki

Opt-in runtime sensors ship as Alloy file scrapes (Monitor-first):

```bash
npm run compose:security -w clawql-observability
```

- River fragment: `alloy/security-sensors.river` labels `service_name=clawql-falco|clawql-tetragon|clawql-wazuh`
- Helm knobs: `helm/security-overlay.yaml` (`falco.logPath`, `tetragon.exportPath`, `wazuh.alertsPath`)
- Env (documentational for host mounts): `CLAWQL_FALCO_LOG_PATH`, `CLAWQL_TETRAGON_EXPORT_PATH`, `CLAWQL_WAZUH_ALERTS_PATH`
- `UnexpectedAgentToolUse` also fires on Falco/Tetragon Loki rates (join with Panguard denies + Langfuse spans in Grafana)

## Grafana dashboards

Provisioned under folder **ClawQL** after `compose:up`:

| Dashboard                       | UID                         | Purpose                             |
| ------------------------------- | --------------------------- | ----------------------------------- |
| LGTM+ Overview                  | `clawql-lgtm-plus-overview` | Phase 1 stub panels                 |
| Langfuse ↔ Panguard correlation | `clawql-langfuse-panguard`  | Deny rates, sensor logs, Tempo join |

## Deferred — N-of-M quorum

Blocking quorum across exporters stays **out of TypeScript** (provider-registry design §9). If needed later, implement as an Alloy-scoped processor with an explicit SLO impact analysis — do not port the web3 quorum pattern onto the ingest hot path.

## Phase 5 (v0.7) — Alerting, Vault JWT keys, Alloy reload

- **Alert catalog** — `alerts/default-alert-rules.yaml` plus health→alert mapping (`ObservabilityAlertingService`)
- **MCP / HTTP** — `observability_alerts`, `GET /observability/alerts`, `POST /observability/telemetry/token`
- **Vault-backed signing** — `TelemetrySigningKeyService` + `signTelemetryJwtWithResolvedKeyEffect` (`CLAWQL_TELEMETRY_JWT_VAULT_*` or `TELEMETRY_JWT_SIGNING_KEY`)
- **Alloy reload after apply** — `CLAWQL_ALLOY_RELOAD_PID` (SIGHUP) or `CLAWQL_ALLOY_RELOAD_K8S_DEPLOYMENT` (+ optional namespace)

## Implementation phases

| Phase  | Scope                                                                 |
| ------ | --------------------------------------------------------------------- |
| **1**  | LGTM+ core + Alloy _(merged)_                                         |
| **2**  | Faro + ephemeral-JWT Worker proxy _(merged)_                          |
| **3a** | Provider registry skeleton _(shipped)_                                |
| **3b** | Alloy config generator _(shipped)_                                    |
| **3c** | Query federation _(shipped)_                                          |
| **3d** | Host integration (MCP + HTTP + WORM) _(shipped)_                      |
| **4**  | Langfuse work traces + Panguard correlation _(this release)_          |
| **5**  | Alerting + Vault-backed Faro JWT keys + Alloy reload _(this release)_ |

## License

Apache-2.0
