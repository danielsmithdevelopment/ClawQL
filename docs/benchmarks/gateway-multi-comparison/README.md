# Multi-gateway equal-arm comparison

Normalized boards across MCP gateways in ClawQL’s neighborhood.

| Artifact | What it proves |
| --- | --- |
| [`gateway-multi-cmp-10k.json`](./gateway-multi-cmp-10k.json) | Interleaved latency / gateway_cost / RSS (n=10 000) |
| [`gateway-multi-multiturn.json`](./gateway-multi-multiturn.json) | **12-turn I/O tokens** on a fat catalog (both sides) |
| [`gateway-multi-multiturn-24.json`](./gateway-multi-multiturn-24.json) | Same board at N=24 (compounding check) |

## Scorecard (what we win)

| Dimension | Verdict |
| --- | --- |
| **Multi-turn I/O tokens** | **Win** — Layer1 schemas ~19× vs aggregators; results ~3.4×; combined @12 ~1.7× (relist-every-turn ~4.8×) |
| **Latency e2e / gateway_cost** | **Win** — best p50/p95/p99 on n=10k interleaved equal-upstream |
| **Chaos scale-out** | **Win vs Executor** (NATS sticky replicas); MJ/AGW also high — remeasure with chaos on |
| **RSS** | **Hold** — cold floor ~261 MB; under long interleaved load median still trails MJ/AGW/Executor |
| **Invoked schema tokens** | Rich `execute` surface intentional (178); not trimmed for parity |

Nontrivial agent work is multi-turn — lead with the token board. Latency is already #1 on the equal-arm microboard; do not lead with RSS until the under-load gap closes.

## Equal-arm contract (latency)

| Lever | Normalization |
| --- | --- |
| Result | Same two-pet JSON (`Ada` / `Grace`) |
| Upstream | Shared mock HTTP `/pets` — ClawQL OpenAPI `execute` + aggregator `list_pets` MCP fetch via `EQUAL_ARM_UPSTREAM` |
| Executor | Static equal JSON in-sandbox (`fetch` disabled) — **upstream_cost = 0** |
| Composition | `CLAWQL_INSTANCE_SPEC` slim Core (memory/documents/ChatGPT off) — `ENABLE_*=0` alone is a no-op in 8.0 |
| Latency schedule | Interleaved closed-loop across live arms |
| Samples | **n = 10 000** (+ warmup 100) for trustworthy p999 |
| Gateway cost | `e2e − paired direct` when the arm paid the HTTP hop; Executor `gateway_cost ≈ e2e` |
| Tokens (primary) | **Invoked tool schema only**; full `tools/list` secondary |
| Chaos | Optional (`MULTI_SKIP_CHAOS=1` on the 10k latency run) |

## Board — n=10 000 interleaved (post composition slim)

| Arm | e2e p50 / p95 / p99 / **p999** (ms) | Gateway cost p50 / p99 / **p999** | RSS med MB | Tools | List tok | Invoked schema | Result tok |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **ClawQL** | **1.02 / 1.95 / 3.82 / 7.41** | **0.70 / 3.48 / 6.87** | 427† | **8** | **1189** | 178 | 59 |
| **Executor** | 2.36 / 5.12 / 6.61 / 11.49 | 2.36 / 6.61 / 11.49‡ | 210 | 7 | 2243 | 90 | 59 |
| **MCPJungle** | 1.34 / 2.72 / 4.36 / 6.86 | 1.02 / 3.99 / 6.52 | **152** | 1 | 46 | 46 | 28 |
| **agentgateway** | 1.17 / 2.38 / 4.21 / 7.29 | 0.84 / 3.81 / 6.87 | 215 | 1 | 37 | 37 | 28 |

† Cold/min RSS ≈261 MB (improved vs prior tool dump); median during long interleaved load still grows — **publish hold**.  
‡ Executor gateway_cost = e2e (upstream=0).

**Delta vs prior 10k (tools=18):** e2e p50 1.08→**1.02**, gateway_cost p50 0.81→**0.70**, p999 cost 9.41→**6.87**, tools 18→**8**, list tok 5334→**1189**.

### Latency run

```bash
export EXECUTOR_BIN=… EXECUTOR_CWD=…
export MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle
export AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway

MULTI_ITERS=10000 MULTI_WARMUP=100 MULTI_SKIP_CHAOS=1 MULTI_EQUAL_UPSTREAM=1 \
  MULTI_OUT=gateway-multi-cmp-10k.json \
  npm run benchmark:gateway-multi-comparison
```

---

## Category win — 12-turn I/O tokens (fat catalog)

Single-tool p50 is a thin slice. The category ClawQL is built for is **multi-turn agents** where **input schemas** and **output payloads** both compound.

### Equal-arm catalog

| Lever | Normalization |
| --- | --- |
| Surface | **40** verbose tools (`catalog_list_001`…`040`) — same names as OpenAPI `operationId`s |
| Fat result | Nested `items[]` + `meta`/`history` (~2411 tok/turn raw) |
| ClawQL path | `search` → `execute` with `where=items` + `fields=["id","name","status"]` (~723 tok result) |
| Aggregators | Full `tools/list` + raw fat `callTool` (no projection) |
| Executor | `execute` code returns the same fat JSON (no fields) |
| Turns | **12** unique partitions (see also N=24 artifact) |

### Board @ N=12 (classic: Layer1 once + Σ Layer2)

| Arm | Layer1 once (tok) | Mean Layer2 (tok) | Mean **result** tok | Combined @12 |
| --- | ---: | ---: | ---: | ---: |
| **ClawQL** | **297** (search+execute only) | **1687** | **723** | **20 539** |
| Executor | 90 | 4465 | 4465 | 53 668 (2.61×) |
| MCPJungle | 5840 | 2457 | 2457 | 35 322 (1.72×) |
| agentgateway | 5520 | 2457 | 2457 | 35 002 (1.70×) |

### Both sides of the equation

| Side | ClawQL | Aggregators | Ratio |
| --- | --- | --- | --- |
| **Input (Layer1 schemas)** | search+execute ≈297 | full fat `tools/list` ≈5.5–5.8k | **~19×** |
| **Output (mean result)** | where+fields ≈723 | fat envelope ≈2457 | **~3.4×** |
| **Combined classic @12** | 20.5k | 35k | **~1.7×** |
| **Combined if agents re-ListTools each turn** | 20.2k | ~99–105k | **~4.7–4.9×** |

### Multiturn run

```bash
MT_TURNS=12 CATALOG_TOOL_COUNT=40 npm run benchmark:gateway-multi-multiturn
```

---

## Code levers landed (this branch)

1. **Bench composition honesty** — `scripts/benchmarks/lib/clawql-bench-env.mjs` sets `CLAWQL_INSTANCE_SPEC` (8.0 ignores bare `ENABLE_*=0`; fake `TIER=gateway` was falling through to `standard`).
2. **Lazy optional imports** — `wireOptionalToolDeps()` + no static `clawql-automation/nats/env` in dynamic compose; pgvector hooks only when memory on (§11.1).

**Next RSS levers:** further lazy `clawql-api` heavy deps; audit/wrap heap growth under long interleaved load; optional dedicated GC/steady-state RSS arm.

---

## Honesty / publish hold

- Host-bound; repeat on a dedicated bench host before publicizing.
- Hold publicizing until ClawQL vs Executor **under-load RAM** gap is closed or scoped (cold floor alone is not enough).
- Do not cite n=200 boards for p999.
- ContextForge nested adapter disclosed when included; MetaMCP skipped without Docker.
- Multiturn ClawQL Layer2 includes per-turn `search` (discovery tax); result-only gap is larger (~3.4×).
