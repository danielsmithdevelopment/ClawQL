# ADR 0005: Langfuse as default work-trace store (opt-out emission, profile-based deployment)

- Status: Accepted
- Date: 2026-07-09
- Related: [#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252) (IDP observability bundle), [#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250) (Langfuse eval → Ouroboros), [#160](https://github.com/danielsmithdevelopment/ClawQL/issues/160) (OTLP traces), [#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210) (Grafana), epic [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259)
- Implementation plan: [`docs/observability/7.0-observability-profiles-plan.md`](../observability/7.0-observability-profiles-plan.md)
- Docs: [`docs/observability/README.md`](../observability/README.md), [`docs/observability/idp-trace-and-metrics-guide.md`](../observability/idp-trace-and-metrics-guide.md), [`docs/mcp/langfuse-eval-ouroboros.md`](../mcp/langfuse-eval-ouroboros.md)

## Context

ClawQL’s differentiation includes **token-efficient agent workflows** (planning-context savings, Code Mode, classification-aware routing). Operators need to **prove ROI per session**, compare workflows, and eventually **export high-quality work traces** for synthetic data and fine-tuning.

Today the repo treats observability as mostly **opt-in**:

| Signal                    | Default today                                   |
| ------------------------- | ----------------------------------------------- |
| Prometheus `/metrics`     | On                                              |
| OTLP MCP tool spans       | Off (`CLAWQL_ENABLE_OTEL_TRACING`)              |
| Audit → Loki push         | Off (`CLAWQL_LOKI_PUSH_URL`)                    |
| Langfuse trace ingestion  | Off — BYO deploy + manual `LANGFUSE_*` in Agent |
| Langfuse eval → Ouroboros | Off (`CLAWQL_ENABLE_LANGFUSE_EVAL`)             |

**Langfuse** is not “another dashboard.” It is the natural **work-trace ledger**: prompts, tool spans, scores, metadata (`seed_id`, `correlationId`), and future export jobs for synthetic datasets. **Loki** and **Tempo** remain important for **infra** signals (audit grep, distributed latency); Langfuse owns **agent work product**.

Operators fall into three buckets:

1. **Greenfield / lab / Tier 1 Compose** — want defaults that work without reading 40 env vars.
2. **Existing observability stack** — already run Prometheus/Loki/Tempo/Datadog and may or may not run Langfuse.
3. **Regulated / air-gapped** — cannot store prompts or tool I/O outside policy boundaries.

We need one model that defaults Langfuse **on** for ClawQL-shaped installs while preserving clean **opt-out** and **bring-your-own** paths.

## Decision

### 1) Three observability profiles

Introduce **`CLAWQL_OBSERVABILITY_PROFILE`** (and Helm `observability.profile`):

| Profile        | Purpose                       | Bundled backends                                                            | Langfuse emission                                                                      |
| -------------- | ----------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **`bundled`**  | Tier 1 Compose, local k8s lab | OTEL Collector, Prometheus, Loki, Tempo, Grafana, **Langfuse** (toggleable) | **On by default** (opt-out with `CLAWQL_ENABLE_LANGFUSE=0`)                            |
| **`external`** | Production / existing stack   | **None** — operator supplies URLs                                           | **On by default** when `LANGFUSE_HOST` + keys set; off with `CLAWQL_ENABLE_LANGFUSE=0` |
| **`minimal`**  | Metrics-only / strict policy  | None                                                                        | **Off**                                                                                |

**Default by install path:**

- `examples/clawql-local-docker-compose` → **`bundled`**
- Docker Desktop Istio lab → **`bundled`** (wire MCP to collector + Langfuse when profile services exist)
- `clawql-mcp` Helm (standalone) → **`external`**
- `clawql-idp` full stack → **`bundled`** with subchart toggles

### 2) Langfuse trace emission is opt-out (not opt-in)

In **`bundled`** and **`external`** profiles:

- **Default:** MCP and documented Agent runtimes emit OTLP spans to Langfuse (`/api/public/otel`) when credentials and host are available.
- **Opt-out:** `CLAWQL_ENABLE_LANGFUSE=0` disables Langfuse export only; infra OTLP (Tempo, etc.) and `/metrics` remain governed separately.

Langfuse is **never embedded inside the `clawql-mcp` process** (no ClickHouse/Postgres in the MCP container). Emission uses **OTLP HTTP** to a Langfuse deployment (bundled or external).

### 3) Langfuse **service** deployment is profile-scoped

- **`bundled` profile:** ship Langfuse in Compose `observability` profile and optional Helm umbrella subchart; **opt-out** via `observability.langfuse.enabled: false` or Compose env.
- **`external` profile:** do **not** install Langfuse; wire emission to operator’s `LANGFUSE_HOST`.
- **`minimal` profile:** no Langfuse service, no emission.

### 4) OTEL Collector remains the integration chokepoint

MCP and Agent runtimes send OTLP to a **collector** (bundled or external). The collector fans out:

- **Traces (infra):** Tempo / Jaeger / vendor backend
- **Traces (LLM / work):** Langfuse OTLP endpoint (filter `gen_ai.*`, Langfuse SDK spans, `clawql.*` attributes)
- **Logs (audit):** Loki push from MCP **or** OTLP logs pipeline (MCP direct push stays supported in 7.0)

This matches production OTEL patterns (agent → gateway → backends) and lets external-stack users point at **one** corporate collector.

### 5) Standard work-trace attributes and scores

Instrument MCP tool spans and Agent spans with stable ClawQL metadata for Langfuse queries and future export:

| Key                                    | Purpose                                          |
| -------------------------------------- | ------------------------------------------------ |
| `clawql.correlation_id`                | Tie audit, metrics, traces                       |
| `clawql.seed_id` / `ouroboros_seed_id` | Ouroboros lineage (existing webhook contract)    |
| `clawql.tool_name`                     | MCP tool                                         |
| `clawql.planning_bytes`                | Planning-context size for token-efficiency story |
| `clawql.token_savings_estimate`        | Estimated savings vs naive full-spec paste       |
| `clawql.provider`                      | Active `CLAWQL_PROVIDER`                         |

Langfuse **scores** (e.g. `token_savings_ratio`, eval accuracy) feed dashboards now and **synthetic-data export** later.

### 6) Eval → Ouroboros seed mutation stays cautious (unchanged)

**Tracing on by default ≠ mutating seeds by default.**

| Capability                             | Default                                       |
| -------------------------------------- | --------------------------------------------- |
| Trace emission → Langfuse              | **On** (opt-out) in bundled/external          |
| `POST /observability/langfuse/webhook` | **Off** until `CLAWQL_ENABLE_LANGFUSE_EVAL=1` |
| `CLAWQL_LANGFUSE_EVAL_AUTO_APPLY`      | **Off** — propose-only until operator enables |

This preserves [#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250) safety while making Langfuse the default **read** path for work traces.

### 7) Failure and security behavior

- Langfuse export is **non-blocking** for MCP tool handlers (async/batch OTLP; drop on backend down).
- Audit → Loki remains **fire-and-forget** (existing).
- Production: require `CLAWQL_LANGFUSE_WEBHOOK_TOKEN` when eval webhook is enabled (existing); Langfuse OTLP uses project keys via collector or SDK.
- Regulated deployments: `CLAWQL_OBSERVABILITY_PROFILE=minimal` or `CLAWQL_ENABLE_LANGFUSE=0`; document that synthetic-data features require a trace store.

### 8) Flag naming — all `CLAWQL_ENABLE_*`

Observability and feature gates use **`CLAWQL_ENABLE_<NAME>`** only (no **`CLAWQL_DISABLE_*`**):

| Default | Unset | Opt in | Opt out |
| ------- | ----- | ------ | ------- |
| **On**  | on    | `=1`   | `=0`    |
| **Off** | off   | `=1`   | `=0`    |

Examples: **`CLAWQL_ENABLE_HTTP_METRICS`** (default on), **`CLAWQL_ENABLE_LANGFUSE`** (default on in bundled/external), **`CLAWQL_ENABLE_OTEL_TRACING`**, **`CLAWQL_ENABLE_LOKI_PUSH`**. Legacy **`CLAWQL_DISABLE_HTTP_METRICS`** is removed — use **`CLAWQL_ENABLE_HTTP_METRICS=0`**.

## Consequences

### Positive

- **Token ROI** is measurable out of the box in greenfield installs.
- **Synthetic-data pipeline** has a single durable source of truth (Langfuse observations + scores).
- **External stacks** integrate via collector URLs without duplicating Langfuse.
- Clear separation: **work traces** (Langfuse) vs **infra** (Prometheus/Loki/Tempo).

### Trade-offs

- **Bundled profile** is heavier (Langfuse needs Postgres, ClickHouse, Redis, blob storage).
- **Prompt/tool I/O storage** raises compliance review — mitigated by opt-out, Presidio hooks, and `minimal` profile.
- **Dual backends** (Tempo + Langfuse) require collector routing discipline to control cost/volume.

## Alternatives considered

| Alternative                               | Why not chosen                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Langfuse opt-in globally                  | Undermines token-savings story and synthetic-data foundation; feels like debug tooling. |
| Embed Langfuse in `clawql-mcp`            | Wrong process boundary; couples MCP releases to Langfuse DB migrations.                 |
| Loki/Tempo only for work traces           | Poor fit for prompt-level observations, scores, and LLM eval export.                    |
| Only ClawQL-Agent sends to Langfuse       | Misses MCP-only deployments and tool-span correlation without Agent.                    |
| Auto-apply seed revisions when tracing on | Too risky; kept behind explicit `CLAWQL_LANGFUSE_EVAL_AUTO_APPLY`.                      |

## References

- Langfuse OTLP: [OpenTelemetry integration](https://langfuse.com/integrations/native/opentelemetry)
- Langfuse self-host: [Self-hosting guide](https://langfuse.com/self-hosting)
- ClawQL OTEL MCP spans: `src/otel-tracing.ts`, ADR 0003 (Tempo in lab)
- Eval webhook: `docs/mcp/langfuse-eval-ouroboros.md`
