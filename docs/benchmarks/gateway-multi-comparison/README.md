# Multi-gateway equal-arm comparison

Normalized boards across MCP gateways in ClawQL’s neighborhood.

| Artifact | What it proves |
| --- | --- |
| [`gateway-multi-cmp-10k.json`](./gateway-multi-cmp-10k.json) | Interleaved latency / gateway_cost / RSS (n=10 000) |
| [`gateway-multi-multiturn.json`](./gateway-multi-multiturn.json) | **12-turn I/O tokens** on a fat catalog (both sides) |
| [`gateway-multi-multiturn-24.json`](./gateway-multi-multiturn-24.json) | Same board at N=24 (compounding check) |

## Equal-arm contract (latency)

| Lever | Normalization |
| --- | --- |
| Result | Same two-pet JSON (`Ada` / `Grace`) |
| Upstream | Shared mock HTTP `/pets` — ClawQL OpenAPI `execute` + aggregator `list_pets` MCP fetch via `EQUAL_ARM_UPSTREAM` |
| Executor | Static equal JSON in-sandbox (`fetch` disabled) — **upstream_cost = 0** (product-native; same as latency-fair) |
| Latency schedule | Interleaved closed-loop across live arms (host drift hits all equally) |
| Samples | **n = 10 000** (+ warmup 100) for trustworthy p999 |
| Gateway cost | `e2e − paired direct` when the arm paid the HTTP hop; Executor `gateway_cost ≈ e2e` |
| Tokens (primary) | **Invoked tool schema only** (`execute` / `list_pets`); full `tools/list` is secondary |
| Chaos | Optional (`MULTI_SKIP_CHAOS=1` on the 10k latency run) |

## Board — n=10 000 interleaved (this VM)

| Arm | e2e p50 / p95 / p99 / **p999** (ms) | Gateway cost p50 / p99 / **p999** | RSS med MB | Invoked schema tok | Result tok |
| --- | ---: | ---: | ---: | ---: | ---: |
| **ClawQL** | **1.08 / 2.63 / 4.74 / 9.66** | **0.81 / 4.45 / 9.41** | 317 | 178 | 59 |
| **Executor** | 2.58 / 5.32 / 7.21 / 11.78 | 2.58 / 7.21 / 11.78† | 236 | 90 | 59 |
| **MCPJungle** | 1.38 / 3.45 / 5.42 / 9.58 | 1.12 / 5.16 / 8.60 | **148** | **46** | 28 |
| **agentgateway** | 1.20 / 3.17 / 5.54 / 10.21 | 0.93 / 5.26 / 9.85 | 218 | **37** | 28 |
| **ContextForge** | 16.0 / 20.4 / 24.9 / **225** | 15.7 / 24.2 / **225** | 701 | 47 | 28 |
| **MetaMCP** | skipped (no Docker) | — | — | — | — |

† Executor gateway_cost = e2e (upstream=0).  
ContextForge still uses MCPJungle as StreamableHTTP adapter → nested hop (inflates latency/RSS).  
Result-token gap (59 vs 28) is serialization/envelope, not different pets.

### Latency run

```bash
export EXECUTOR_BIN=… EXECUTOR_CWD=…
export MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle
export AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway
export PATH="$HOME/.local/bin:$PATH"

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

Executor wins Layer1 schema size (single `execute` tool) but loses hard on Layer2 without projection → **2.61×** combined vs ClawQL @12.

### Why this wins the category (and when latency boards don’t)

1. **Input** — Catalog stays server-side; agents never ingest 40 fat tool schemas.
2. **Output** — `where` + `fields` cut uncacheable tool results (the bill that dominates as N grows).
3. **Compounding** — Relist-every-turn (common when ListTools isn’t cached) widens the gap to ~5× by N=12.
4. **Honesty** — Raw single-tool p50 still often favors MJ/AGW; **do not** lead with that for category claims. Lead with multiturn I/O + chaos scale-out. Hold public flashy latency until RSS vs Executor is closed/scoped.

### Multiturn run

```bash
export EXECUTOR_BIN=… EXECUTOR_CWD=…
export MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle
export AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway

MT_TURNS=12 CATALOG_TOOL_COUNT=40 \
  npm run benchmark:gateway-multi-multiturn
```

Harness: `scripts/benchmarks/gateway-multi-multiturn.mjs`  
Upstream: `scripts/benchmarks/lib/equal-arm-catalog-mcp.mjs`

---

## Honesty / publish hold

- Host-bound; repeat on a dedicated bench host before publicizing.
- Hold publicizing until ClawQL vs Executor **RAM** gap is closed or scoped.
- Do not cite n=200 boards for p999.
- ContextForge nested adapter is disclosed; bare Node StreamableHTTP was rejected by CF’s registrar.
- Multiturn ClawQL Layer2 includes per-turn `search` (discovery tax); result-only gap is larger (~3.4×).
