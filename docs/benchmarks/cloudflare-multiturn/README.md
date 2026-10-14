# Cloudflare multi-turn gateway benchmark

Spec: [`SPEC.md`](./SPEC.md) · Curated ops (frozen): [`curated-subset.json`](./curated-subset.json) · Fixture hashes: [`MANIFEST.json`](./MANIFEST.json) · Arms: [`arms-wiring.md`](./arms-wiring.md)

## Status

| Piece | State |
| --- | --- |
| Spec + fairness rules | Done |
| Curated ~60-op subset | **Frozen** 2026-10-14 |
| Synthetic fixture + replay mock | Done (label: real schemas, synthetic content) |
| 12-step scripted success checks | Done |
| Arms wired (Streamable HTTP) | Done — see `run-board.mjs` |
| Executor OpenAPI → mock | Done — `liveOpenapiRouter` app `cf-zone-audit-mock` (host HTTP; no inlined fixture) |
| ClawQL `CLAWQL_SEARCH_COMPACT` labeled arm | Done — `clawql_compact_search` |
| **Publish board: 3×10k interleaved** | **Done** — [`board-summary-n10000-r3.json`](./board-summary-n10000-r3.json) |
| Real-model 50-session validation | Next |
| CF code-mode self-host | Tokens-only until self-host works |

N&lt;10k or REPS&lt;3 writes `smoke-*` only. Do **not** publish smoke as the board.

## Rebuildable token formula

Every arm row reports:

`definition + discovery + result + code = combined_mean` (per session)

Also `combined_at_n` = Layer-1 once + Σ(discovery+result+code) over N sessions.

## Quick start

```bash
npm run benchmark:cloudflare-multiturn:test

export EXECUTOR_BIN=/tmp/executor-v2/node_modules/.bin/executor
export EXECUTOR_V2_API_KEY="$(cat /tmp/executor-v2-data/api_key.txt)"
export EXECUTOR_API_KEY="$EXECUTOR_V2_API_KEY"
export EXECUTOR_HOST=http://127.0.0.1:4312
export MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway

# Smoke (not publishable)
CF_MT_ITERS=2 CF_MT_REPS=1 npm run benchmark:cloudflare-multiturn:board

# Publish protocol
CF_MT_ITERS=10000 CF_MT_REPS=3 npm run benchmark:cloudflare-multiturn:board
```

## Publish board (3×10k interleaved, zero latency, synthetic fixture)

Artifact: [`board-summary-n10000-r3.json`](./board-summary-n10000-r3.json) · ranges across 3 reps · task success **100%** every arm every rep · `definition + discovery + result + code = combined`.

| Arm | Def | Discovery | Result | Code | Combined | Session p50 / p999 (ms) | Upstream |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `direct` | 0 | 0 | 47361 | 0 | 47361 | 38–40 / 63–74 | mock |
| `clawql_default` | 308 | 16012 | 7030 | 0 | 23350 | 64–68 / 156–399 | mock |
| `clawql_compact_search` | 308 | 4092 | 7030 | 0 | 11430 | 52–54 / 329–373 | mock |
| `clawql_known_op` | 308 | 0 | 7030 | 0 | 7338 | 28–30 / 81–218 | mock |
| `executor_v2` | 181 | 0 | 357 | 958 | 1496 | 216–221 / 532–635 | mock |
| `mcpjungle` | 7760 | 0 | 47361 | 0 | 55121 | 50–51 / 93–136 | mock |
| `agentgateway` | 7344 | 0 | 47361 | 0 | 54705 | 48–49 / 74–103 | mock |
| `cloudflare_codemode` | 1000† | 0 | 357 | 518 | 1875 | N/A‡ | none |

† Documented CF two-tool Layer-1 (~1000).  
‡ Tokens-only — no self-hosted CF code-mode server; latency not comparable.

Executor code tokens (958) are model-written tool-calling scripts only; DNS data returns via OpenAPI tools (host HTTP to mock). Compact search is a **labeled setting** (`CLAWQL_SEARCH_COMPACT=1`), not the default product row.

Memory plateaus (RSS / anon MB median): ClawQL arms ~650–677 / ~596–608; MCPJungle ~169 / ~101; agentgateway ~167–169 / ~98–100.

## Live recording (once)

```bash
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… AUDIT_ZONE_NAME=example.com \
  node scripts/benchmarks/cloudflare-multiturn/record/record-cloudflare-reads.mjs
```

## Open questions

[`open-questions.md`](./open-questions.md)
