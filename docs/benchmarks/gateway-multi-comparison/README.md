# Multi-gateway equal-arm comparison

Normalized, interleaved board across MCP gateways in ClawQL’s neighborhood.

**Primary artifact (n=10 000):** [`gateway-multi-cmp-10k.json`](./gateway-multi-cmp-10k.json)

## Equal-arm contract

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

## Run

```bash
export EXECUTOR_BIN=… EXECUTOR_CWD=…
export MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle
export AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway
export PATH="$HOME/.local/bin:$PATH"

MULTI_ITERS=10000 MULTI_WARMUP=100 MULTI_SKIP_CHAOS=1 MULTI_EQUAL_UPSTREAM=1 \
  MULTI_OUT=gateway-multi-cmp-10k.json \
  npm run benchmark:gateway-multi-comparison
```

## Honesty / publish hold

- Host-bound; repeat on a dedicated bench host before publicizing.
- Hold publicizing until ClawQL vs Executor **RAM** gap is closed or scoped.
- Do not cite n=200 boards for p999.
- ContextForge nested adapter is disclosed; bare Node StreamableHTTP was rejected by CF’s registrar.
