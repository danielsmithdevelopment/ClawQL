# Where stall / RSS diagnostics belong

Neither **`clawql-data`** nor **`clawql-analytics`** is the right home.

| Package | What it actually is |
| --- | --- |
| [`clawql-data`](../../../../packages/clawql-data) | DuckDB + `data_query` / `data_ingest` — the tier we just **lazy-loaded off HTTP Ready** |
| [`clawql-analytics`](../../../../packages/clawql-analytics) | **Product** analytics (PostHog adapters, auth scopes, governance events) — distinct from runtime observability |
| [`clawql-observability`](../../../../packages/clawql-observability) | LGTM+ / OTel stack (Loki, Grafana, Tempo, Mimir, Pyroscope) — the production instrumentation layer (#1192) |
| [`clawql-harness`](../../../../packages/clawql-harness) | Execution-loop plugin harness (Ouroboros / OpenCode) — **not** the gateway multi-arm bench scripts |

## Three homes (match the tooling)

### 1. Benchmark-only → `scripts/benchmarks/` (+ `docs/benchmarks/…`)

Stays **outside** runtime packages. Opt-in via `MT_*` / probe scripts; never ships to customers.

Examples already there / on this branch:
- `gateway-multi-multiturn.mjs` (`MT_STALL_DIAG`, `MT_STRACE_LOG`, client TTFB/hold logs)
- `catalog-listen-rss-probe.mjs`, `session-rss-phase-probe.mjs`, `interleaved-stall-probe.mjs`
- `bun-ready-memory-probe.mjs`, `summarize-strace-stalls.mjs`
- Board JSON + write-ups under `docs/benchmarks/gateway-multi-comparison/`

### 2. Production-useful signals → `clawql-observability` (+ thin HTTP façades)

Request timing histograms, event-loop delay, slow-request logs, session counts — as **OTel metrics/spans**, cheap enough to leave on. HTTP wiring can stay in `src/http/` / `src/observability/` as a thin host boundary over that package (same pattern as `maybeInitOtelTracing`).

Already nearby: `CLAWQL_HTTP_PERF` ELD/GC in `mcp-http-server.ts`, OTel init in `src/observability/otel-tracing.ts`.

`/healthz` `bench` (`CLAWQL_BENCH_STATS`) is a grey area: keep gated; promote session/RSS gauges into OTel when they prove useful outside benches.

### 3. Heavy / invasive hooks → lazy opt-in (new `clawql-diagnostics` **or** lazy path under observability)

Timer wrapping (`CLAWQL_TIMER_TRACE`), heap snapshots, anything with steady-state cost → **lazy-import only when flagged**, same pattern as `clawql-data`. Prefer a small **`clawql-diagnostics`** package if the surface grows; until then, keep modules under `src/http/mcp-*-trace.ts` but **do not** static-import them from the Ready path without the flag gate (already true for timer trace).

**Do not** put this in `clawql-data` (would re-pull DuckDB onto Ready) or `clawql-analytics` (product events ≠ runtime diagnostics).

## Current PR #1288 placement

| Kind | Today |
| --- | --- |
| Bench harness / probes | `scripts/benchmarks/*` |
| Gated HTTP helpers | `src/http/mcp-bench-stats.ts`, `mcp-timer-trace.ts`, `mcp-session-idle.ts` |
| Docs | `docs/benchmarks/gateway-multi-comparison/stall-memory-round*.md` |

No move into `clawql-data` / `clawql-analytics`. Next productization step (separate from the stall hunt): promote (2) into `clawql-observability` OTel; keep (1) in scripts; lazy-load (3).
