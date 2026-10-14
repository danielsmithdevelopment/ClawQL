# Cloudflare multi-turn gateway benchmark

Spec: [`SPEC.md`](./SPEC.md) · Curated ops (frozen): [`curated-subset.json`](./curated-subset.json) · Fixture hashes: [`MANIFEST.json`](./MANIFEST.json) · Arms: [`arms-wiring.md`](./arms-wiring.md)

## Status

| Piece | State |
| --- | --- |
| Spec + fairness rules | Done |
| Curated ~60-op subset | **Frozen** 2026-10-14 |
| Synthetic fixture + replay mock | Done (label: real schemas, synthetic content) |
| Observation-sized `where` (server-side JMESPath) | Done — harness builds args only; see scrutiny notes |
| `where` / plan args counted as code tokens | Done — same bucket as code-mode scripts |
| `clawql_program` (ADR 0015 v0 plan runner) | Done |
| **Publish board: 3×10k** | **Pending** (re-run with code-arg accounting) |
| **Real-model 50 sessions / arm** | **Harness ready; blocked on `OPENAI_API_KEY` + `CF_MT_MODEL`** |
| Blog / public headline | **Hold** until publish board + real-model land |

N&lt;10k or REPS&lt;3 writes `smoke-*` only. Do **not** publish smoke as the board. Do **not** ship the reversed-headline blog until both gates pass.

## Scrutiny (must hold before believing the reversal)

### 1. Shaping is on the ClawQL server

`lib/clawql-shapes.mjs` only builds `execute` / `execute_program` **arguments** (the ClawQL peer of harness-authored code-mode scripts). The board counts `resultTokens` from **MCP response text** (`toolText(eRes)`). There is no client-side reshape of rows into counts. Aggregates use standard JMESPath **`length()`** via product `execute.where` ([docs](../../mcp/mcp-tools.md#execute), [jmespath.org](https://jmespath.org/specification.html)).

### 2. Model-written `where` / plan count as code

| Arm | What counts as `code` |
| --- | --- |
| `clawql_*` execute steps | tokens of `where` (+ `fields` if any) |
| `clawql_program` | tokens of the JSON plan `source` |
| `executor_v2` / `cloudflare_codemode` | tokens of published JS |

`weighted_mean = definition + discovery + result + 5×code` is on every arm row.

### 3. Real-model gate

Set secrets **in the environment** (never paste keys into chat):

- `OPENAI_API_KEY` (required)
- `OPENAI_BASE_URL` (optional)
- `CF_MT_MODEL_FRONTIER` and `CF_MT_MODEL_SMALL` (run both)

```bash
CF_MT_REAL_ITERS=50 \
  CF_MT_REAL_ARMS=clawql_known_op,clawql_program,executor_v2 \
  npm run benchmark:cloudflare-multiturn:real-model
```

Fixed settings: temperature 0, shared system prompt, each arm’s tool descriptions from `listTools`. Reports malformed `where`, retries, turns, failure counts — not just averages.

## Rebuildable token formula

`definition + discovery + result + code = combined_mean`  
`definition + discovery + result + 5×code = weighted_mean`

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

## Smoke evidence (N=2 — not the board; `where` charged as code)

Artifact: [`smoke-summary-n2-r1.json`](./smoke-summary-n2-r1.json) · 100% task success · **not publishable**.

| Arm | Def | Disc | Result | Code | Combined | Weighted (5×) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `clawql_known_op` | 308 | 0 | 480 | 191 | **979** | **1743** |
| `executor_v2` | 181 | 0 | 357 | 958 | 1496 | 5328 |
| `clawql_program` | 685 | 0 | 357 | **811** | 1853 | 5097 |
| `cloudflare_codemode` | 1000 | 0 | 357 | 518 | 1875 | 3947 |

Compact plan (tool omitted when `operationId` set; short ids; empty args dropped): program code **872 → 811**. Program remains the costliest ClawQL arm on this filter workflow — expected; fan-out/join benches are where it should win. Hold the public claim until 3×10k + dual-model real-model.

## Framing (if full board + real-model clear)

Declarative `where` is the strong position: server-enforced, cheap to express, no interpreter to secure, every call individually governed. Programs handle fan-out, joins, and governed multi-step reads (ADR 0015). Hold the blog headline until both gates land.

## Open questions

[`open-questions.md`](./open-questions.md)
