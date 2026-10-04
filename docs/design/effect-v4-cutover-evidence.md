# Effect v4 cutover — post-merge evidence (#1197)

**Status:** evidence follow-up for the merged v4 cutover ([#1197](https://github.com/danielsmithdevelopment/ClawQL/pull/1197), 2026-10-03).  
**This doc:** live default MCP catalog vs frozen routing digest; which suites were re-run; traces; quoted numbers; remaining v3-based PRs.

#1197 already ran the CI test matrix (Node 22/24/25 `vitest run --coverage`, Docker smokes, LGTM+ compose, streams-celld evidence). The PR body only called out two packages’ _test-fix_ files. This note records the remaining honesty gates.

## 1. Tests (behavior, not just types)

CI on #1197: **Test (Node 22/24/25)** passed (`npx vitest run --coverage` after `npm run build`). That is the full vitest include glob in `vitest.config.ts` (all `packages/*/src/**/*.test.ts` plus `src/**`).

This evidence branch re-ran after the catalog-honesty patch (`ae201cf3` main + this PR):

| Run                                                  | Result                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Full unit (`npx vitest run`)                         | **2162 passed**, 5 skipped, 489 files                                                                            |
| E2E (`npx vitest run --config vitest.e2e.config.ts`) | **14 passed** (adapter gateway/mcp-ui + outbound x402). Auth `xaa-e2e` is `*e2e*.test.ts` (2 passed separately). |
| MCP Events                                           | **24 passed** (includes 10 producer → signed delivery cases)                                                     |
| Schedules                                            | **42 passed** (schedule + schedule-effect + worker; more than the older 31-file count)                           |
| Inference gateway                                    | **163 passed**, 1 skipped (optional Postgres)                                                                    |
| Memory erase                                         | **3 passed** (`erase.test.ts`)                                                                                   |
| Schema v4 decode                                     | **10 passed**                                                                                                    |
| Catalog digest / drift                               | **4 passed**                                                                                                     |
| OTEL unit + in-process OTLP                          | **9 passed**                                                                                                     |

Vitest **excludes** `**/*.e2e.test.ts` from the CI unit job — use `vitest.e2e.config.ts` for those paths.

`catchAll` → `catch` and `Either` → `Result` are compile-checked by the v4 types; remaining `catchAll` hits are comments only.

## 2. Tool catalog digest (routing trust)

Frozen digests (canonical JSON, still match `FREEZE-v0.4` / `FREEZE-v0.6`):

| Artifact                                 | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `routing-fresh-v0.4-source-catalog.json` | `57352fb8b30ffae82343a883bf0bf4e9d2dd0ebfcdff5117ad58db937613db52` |
| `routing-fresh-v0.6-source-catalog.json` | `12838c00d757ea9570bb3afdabac29645f11b951552dda9d6c055136dfd4a660` |

v0.6 reused the same 38 entry _bodies_ as v0.5 (new `catalogId` only). It does **not** include post-calibration catalog changes.

Live default-on Core MCP tools (no `CLAWQL_ENABLE_*`, no instance spec) vs freeze:

| In freeze, not live default                                                                              | Why                                      |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `pageindex_build_tree`                                                                                   | Purged (#1184)                           |
| `clawql_think`, `ouroboros_run_evolutionary_loop`                                                        | Opt-in (`CLAWQL_ENABLE_OUROBOROS_TOOLS`) |
| `data_query`, `sandbox_exec`, `notify`, `schedule`, `ingest_external_knowledge`, `knowledge_search_onyx` | Flag / extra opt-in                      |

| Live default, not in freeze          | Why                           |
| ------------------------------------ | ----------------------------- |
| `resume`                             | Execute pause/resume (#1187)  |
| `sources_propose`, `sources_approve` | Sources propose (#1188)       |
| `read_around`, `memory_sync`         | Memory plugin + host register |

MCP ListTools JSON Schemas are still **Zod at the SDK edge**; Effect Schema v4 is the in-handler decoder. Wire schemas did not switch to Schema v4 JSON Schema generation.

**Honesty:** `routingCatalogAlignedForProductionTrust()` is **false**. `/decision` returns `calibrated: false` even when `useSiteId=search_provider_tool_routing` and the scorer backend is `gliner2`, until a new freeze (or a v0.6-style suite whose catalog is the live default-on set) passes. Code: `packages/clawql-core/src/classifier/held-out/routing-catalog-drift.ts`.

v0.6 already scored is **not** that suite — same 38 bodies, including PageIndex.

## 3. Traces (OTEL after #1192)

| Check                                                | What it proves                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| `src/otel-tracing.test.ts`                           | Flag / wrap / skip paths                                             |
| `src/effect-otel-bridge.test.ts`                     | `@effect/opentelemetry@4.0.0` `Effect.withSpan` → in-memory exporter |
| `src/otel-tracing-otlp-receiver.integration.test.ts` | At least one span reaches a local OTLP HTTP `/v1/traces` receiver    |
| LGTM+ compose smoke (#1197)                          | Alloy OTLP → Tempo (traces) + Mimir Prometheus API (metrics) + Loki  |

Langfuse is an **opt-in** Alloy dual-export (`CLAWQL_ENABLE_LANGFUSE` / `LANGFUSE_OTLP_AUTH_HEADER`). Default LGTM compose does not stand up Langfuse. No live Langfuse tenant is queried in this evidence run.

## 4. Quoted numbers

| Claim                              | Fresh measurement?                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.0 image payoff (Syft/Trivy/size) | Still the 2026-10-02 table in `docs/releases/8.0.0-payoff-measurement.md` (purge/trim, **not** Effect v4). Re-running `measure-8.0-payoff.sh` for v4 vs v3 is a full two-image Docker build; not repeated here.                                                                                                                                                                       |
| Gateway hot path latency           | Local microbench `scripts/release/measure-gateway-hotpath.mts` (n=2000, this VM): `decodeSearchInput` p50 **0.0059 ms** / p95 **0.0093 ms**; `decodeExecuteInput` p50 **0.0027 ms** / p95 **0.0045 ms**. Schema decode only — **not** a loaded gateway p95. Do not paste this into payoff tables as product latency.                                                                  |
| “350K per-cell” celld RSS          | **Not an Effect figure.** celld is Rust (separate evidence jobs: Streams celld smoke / full-stack / evidence — green on #1197). Repo docs quote **~471KB** resident cell (celld v0.2) in `docs/streams/aws-celld-burst.md`. The **~350 KB** line in `docs/streams/clawql-tee-airgap-audit.md` is a **heavy TEE payload** size, not celld RSS. Effect v4 does not change celld memory. |

Do not put a new celld RSS or gateway p95 in release notes until those scripts print it.

## 5. Merge order (v3-based open PRs)

#1183 (inference ladder + erase) **already merged** (2026-10-02) _before_ #1197 (2026-10-03). No rebase of #1183 is required.

Still open against pre-v4 trees:

| PR                                                                                               | Base   | Mergeable            | Action                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ------ | -------------------- | --------------------------------------------------------------------------------------------------------- |
| [#1118](https://github.com/danielsmithdevelopment/ClawQL/pull/1118) Agent Substrate              | `main` | **CONFLICTING**      | Rebase onto post-v4 `main` and re-run Effect v4 codemods (`scripts/effect-v4-codemod-*.mjs`) before merge |
| [#1146](https://github.com/danielsmithdevelopment/ClawQL/pull/1146) ontology-enriched classifier | `main` | stale / unknown      | Likely superseded by later Fast Decision merges; rebase or close                                          |
| [#1147](https://github.com/danielsmithdevelopment/ClawQL/pull/1147) v0.4 productionTrusted       | `main` | stale                | Content largely on `main` via later PRs; close if duplicate                                               |
| [#1148](https://github.com/danielsmithdevelopment/ClawQL/pull/1148) Decide v0.5 closeout         | #1147  | CLEAN vs that branch | Do not merge onto `main` until #1147 is resolved; then rebase onto v4                                     |

Dependabot PRs (#1151–#1171) are dependency bumps, not Effect v3 domain code. Merge independently.

Do **not** land #1118 / #1146–#1148 as hand-fixed stragglers on v3 APIs (`catchAll`, `Either`, `@effect/platform`).
