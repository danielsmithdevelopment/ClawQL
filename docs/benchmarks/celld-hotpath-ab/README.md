# celld hot-path A/B

Prove that **celld pin / durable-program env** does not regress the equal-arm ClawQL Core `search`→`execute` pets board (the numbers on clawql.com/benchmarks).

## Why this exists

“Builds on celld” applies to **Streams** (self-hosted DOs) and the **durable program** celld-shaped journal. The publish gateway board is Core OpenAPI execute — it must stay fast when operators enable program/celld flags on the same process.

## Variants

| Id | Env |
| --- | --- |
| `A_baseline` | `clawqlEqualArmEnv` only |
| `B_durable_programs` | + `CLAWQL_ENABLE_DURABLE_PROGRAMS=1` |
| `C_celld_pin_isolate` | B + `CELLD_VERSION=v0.4.0` + `CLAWQL_PROGRAM_CELLD_ISOLATE=1` + `CLAWQL_CELLD_BIN` |

All variants call only `execute` / `listPets`. None spawn celld or run `execute_program`.

## Run

```bash
CELLD_VERSION=v0.4.0 curl -fsSL https://celld.dev/install.sh | CELLD_VERSION=v0.4.0 sh
MULTI_ITERS=2000 CLAWQL_CELLD_BIN=$HOME/.local/bin/celld \
  npm run benchmark:celld-hotpath-ab
```

Gate defaults: gateway_cost p50 regress ≤15%, p99 ≤25% vs A (`CELLD_AB_P50_REGRESS` / `CELLD_AB_P99_REGRESS`).

## Latest

| Artifact | n | Gate |
| --- | ---: | --- |
| [`celld-hotpath-ab-10k.json`](./celld-hotpath-ab-10k.json) | 10000 | **PASS** (publish-grade) |
| [`celld-hotpath-ab.json`](./celld-hotpath-ab.json) | 2000 | PASS (smoke) |

Publish-grade (2026-10-18, n=10k) gateway_cost vs A: B **+2.7%** p50 / **+5.9%** p99; C **+2.7%** p50 / **+0.4%** p99 — well inside ≤15% / ≤25%.

Doctor: `clawql doctor` surfaces celld pin readiness (stand-in vs `isolateReady`). Related: [`../dominance-peers-wiring.md`](../dominance-peers-wiring.md) § Celld.
