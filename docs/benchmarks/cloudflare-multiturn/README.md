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
| Executor OpenAPI → mock | Done — `liveOpenapiRouter` app `cf-zone-audit-mock` |
| Observation-sized `where` on ClawQL | Done — `lib/clawql-shapes.mjs` (Layer-2 ≈ code mode) |
| `clawql_program` (ADR 0015 v0 plan runner) | Done — `CLAWQL_ENABLE_PROGRAMS=1` |
| ClawQL `CLAWQL_SEARCH_COMPACT` labeled arm | Done — `clawql_compact_search` |
| **Publish board: 3×10k interleaved** | **Re-run required** after where + program arm (prior board used weak where) |
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

## Smoke evidence (where + program — N=2, not the board)

Artifact: [`smoke-summary-n2-r1.json`](./smoke-summary-n2-r1.json) · task success **100%** · observation-shaped `where` · `clawql_program` via `execute_program`.

| Arm | Def | Discovery | Result | Code | Combined | Price-weighted (5× code) | Upstream |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `clawql_known_op` | 308 | 0 | 480 | 0 | **788** | **788** | mock |
| `executor_v2` | 181 | 0 | 357 | 958 | 1496 | 5328 | mock |
| `cloudflare_codemode` | 1000† | 0 | 357 | 518 | 1875 | 3947 | none |
| `clawql_program` | 685 | 0 | **357** | 872 | 1914 | 5402 | mock |
| `clawql_compact_search` | 308 | 4092 | 480 | 0 | 4880 | 4880 | mock |
| `clawql_default` | 308 | 15988 | 480 | 0 | 16776 | 16776 | mock |
| `direct` | 0 | 0 | 47361 | 0 | 47361 | 47361 | mock |
| `agentgateway` | 7344 | 0 | 47361 | 0 | 54705 | 54705 | mock |
| `mcpjungle` | 7760 | 0 | 47361 | 0 | 55121 | 55121 | mock |

† Documented CF two-tool Layer-1 (~1000). CF latency N/A (tokens-only).

**Finding:** with observation-sized `where`, ClawQL known-op **beats raw code-mode totals** (788 vs 1496 / 1875) and stays competitive when code is price-weighted 5×. `clawql_program` matches code-mode **result tokens (357)** in one round trip; its plan JSON is counted as code. Compact search remains a labeled setting.

ADR 0015: filtering wins belong to declarative `where`; program mode (plan runner today; celld JS later) is for fan-out / joins and governed one-shot plans.

## Prior publish board (pre-where — superseded)

[`board-summary-n10000-r3.json`](./board-summary-n10000-r3.json) measured weak DNS `where` (step 4 returned all A names). Kept for history; do not cite as the current comparison. Re-run 3×10k after this change.

## Live recording (once)

```bash
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… AUDIT_ZONE_NAME=example.com \
  node scripts/benchmarks/cloudflare-multiturn/record/record-cloudflare-reads.mjs
```

## Open questions

[`open-questions.md`](./open-questions.md)
