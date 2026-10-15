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
| Product: `where` examples in execute schema + fix-named `where_invalid` | Done (+37 where-desc tokens; full execute tool def **218**) |
| Product: observation budget (no where/fields → truncated preview) | Done (`truncated:true` + note; opt-in `full:true`) |
| **Publish board: 3×10k** | **Remeasuring** on slim listen (OOP+lazy) — prior board ~630 MB anon; process-tree fairness notes in [`process-tree-memory.md`](./process-tree-memory.md) |
| **Real-model 50 sessions / arm × 2 model families** | **Done** — dual-win `known_op_beats_code_mode_for_real_models` ([`real-model-cursor-gate-frontier_small.json`](./real-model-cursor-gate-frontier_small.json)) |
| **Measured defaults (not program-as-core)** | Locked — [`measured-defaults.md`](./measured-defaults.md): known-op/`where` is the filter winner; programs stay alongside until one-step plans are as cheap as `execute` and a fan-out board clears |
| Blog / public headline | Cleared by pre-committed rules (board + dual-model gate both green) |

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

### 3. Real-model gate (SPEC)

**Compare real-model results only with real-model results.** Scripted Executor / Cloudflare code-mode rows are not a fair peer for Cursor/OpenAI ClawQL sessions — code-mode agents can also dump whole lists or retry broken programs.

| Real-model arm | Upstream | In gate? |
| --- | --- | --- |
| `clawql_known_op` / `clawql_program` | Local mock | **Yes** |
| `executor_v2` | Local mock (OpenAPI app → mock) | **Yes** |
| `cloudflare_codemode` | Hosted CF server → **live API** | **No** — out of gate |

Hosted Cloudflare code-mode is excluded because a real model would use your Cloudflare token against the real account; step 12 could write (enable proxy). Scripted board keeps CF as **tokens-only**. Re-add to the gate only with an explicit **read-only** token policy. Default arms: `clawql_known_op,clawql_program,executor_v2`.

**Pre-committed win rules** (do not edit after seeing results): [`SPEC.md` § Pre-committed gate](./SPEC.md#pre-committed-gate-freeze-before-the-run--do-not-edit-after-seeing-results). Blog / explainer claims follow that table only.

**SPEC gate transport: Cursor Task subagents** (no provider API secrets):

| Pin | Cursor model slug |
| --- | --- |
| Frontier | `gpt-5.6-sol-medium` |
| Small | `composer-2.5-fast` |

```bash
node scripts/benchmarks/cloudflare-multiturn/prepare-real-model-cursor-gate.mjs
# Then run 50 interleaved sessions / arm / model via Task subagents (see WORKFLOW.md under the gate state dir).
# Aggregate + verdict:
node scripts/benchmarks/cloudflare-multiturn/lib/aggregate-cursor-gate.mjs --state /tmp/cf-mt-real-gate
```

Shared workflow prompt across arms; **sessions interleaved across arms**. Artifact freezes `precommit` + computed `verdict`. Per arm: **median / p90 weighted tokens**, **sessions over ceiling** (default 10k), task success. Count steps must use `totalCount` on truncated envelopes. Optional OpenAI Chat Completions harness remains for operators with keys — not this gate.

### 4. Observation budget (product — **default on**)

Board ClawQL arms run with the product default: soft observation budget enabled (~8k chars / ~2k tokens, `CLAWQL_EXECUTE_OBSERVATION_BUDGET_CHARS`; `0` disables). Token numbers on ClawQL rows therefore include this behavior.

| Shape | When over budget (no `where`/`fields`, not `full:true`) |
| --- | --- |
| **List** (`result: [...]` or top-level array) | `truncated: true`, `shape: "list"`, `totalCount` / `previewCount`, note **“N records, first K shown”** + `totalCount=N`, first ~20 rows, suggested `where` |
| **Single object** (large nested blob, no row array) | `truncated: true`, `shape: "object"`, **no row count** — size-truncated preview + note to extract with `where` or pass `full:true` |

Hard `CLAWQL_EXECUTE_RESULT_MAX_CHARS` still applies either way. Session-2’s ~60k unfiltered DNS dump is the list case: short preview + one filtered retry.
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

On weighted tokens, known-op (**1743**) is about **3.1×** cheaper than Executor (**5328**) and about **2.3×** cheaper than Cloudflare code-mode (**3947**). Compact plan (tool omitted when `operationId` set; short ids; empty args dropped): program code **872 → 811**. That **811 vs 191** gap is why a one-step program is not yet a drop-in for known-op — shrink the format before promoting programs to the core tool ([`measured-defaults.md`](./measured-defaults.md)). Fan-out/join boards are where multi-op programs should pull ahead.

## Publish board (3×10k, `where` as code)

Artifact: [`board-summary-n10000-r3.json`](./board-summary-n10000-r3.json) · 100% task success · weighted = definition + discovery + result + 5×code.

| Arm | Weighted mean | Code mean | Result mean |
| --- | ---: | ---: | ---: |
| `clawql_known_op` | **1743** | 191 | 480 |
| `cloudflare_codemode` | 3947 | 518 | 357 |
| `clawql_program` | 5097 | 811 | 357 |
| `executor_v2` | 5328 | 958 | 357 |
| `clawql_compact_search` | 5835 | 191 | 480 |
| `clawql_default` | 17731 | 191 | 480 |
| `direct` | 47361 | 0 | 47361 |
| `agentgateway` | 54705 | 0 | 47361 |
| `mcpjungle` | 55121 | 0 | 47361 |

Known-op stays the cheapest arm on this filter workflow. Gateways that dump full observations pay the unfiltered DNS list (~47k result tokens).

## Dual-model real-model gate (Cursor Task, 50×2×2)

Artifact: [`real-model-cursor-gate-frontier_small.json`](./real-model-cursor-gate-frontier_small.json) · rules: `cf-mt-real-model-gate-v1` · pins: frontier `gpt-5.6-sol-medium`, small `composer-2.5-fast` · hosted CF code-mode excluded (explicit).

| Model | Known-op median / p90 weighted | Executor median / p90 weighted | Over ceiling (KO / EX) | Win |
| --- | ---: | ---: | ---: | --- |
| Frontier | **1658** / **1793** | 15336 / 37977 | 0 / 21 | yes |
| Small | **1499.5** / **1954** | 7326 / 35107 | 1 / 10 | yes |

**Claim (pre-committed):** `known_op_beats_code_mode_for_real_models` — known-op wins median weighted, p90 weighted, task success, and ceiling count on **both** models. Task success 50/50 on every arm.

## Product fix for real models (ship the “shapes” cue)

Harness-visible shapes are not a production condition. The honest path is to put the same cues in the product:

1. **`execute.where` schema description** now includes three short examples (filter / count / extract). Where-description tokens: **19 → 56** (+37). Full execute tool JSON definition: **218** tokens.
2. **`where_invalid` errors** return `fix` (what was wrong) plus a paste-ready `example` chosen from the failed expression.

Then re-measure blind. If malformed filters drop toward zero, known-op’s lead holds for real models, not just scripted ones.

## Cursor-subscription pilots (N=5 each, not the SPEC 50)

Model: `composer-2.5-fast` subagents · arm: `clawql_known_op` · billed via Cursor subscription.

| Pilot | Artifact | Success | where_malformed | tool_errors | turns mean (med) | code tok mean | result tok mean (med) | weighted mean (med) | Honesty |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Shapes visible (pre-fix) | [`real-model-cursor-pilot-n5.json`](./real-model-cursor-pilot-n5.json) | 5/5 | 0 | 1 | 11.2 | n/a | n/a | n/a | harness shapes readable — **not production** |
| Blind (pre-fix) | [`real-model-cursor-blind-pilot-n5.json`](./real-model-cursor-blind-pilot-n5.json) | 5/5 | 2 | 3 | 13.4 | n/a | n/a | n/a | shapes hidden; schema had no examples |
| Blind (post-fix) | [`real-model-cursor-blind-pilot-v2-n5.json`](./real-model-cursor-blind-pilot-v2-n5.json) | **5/5** | 2 | **0** | 15.8 (**13**) | 206 | 13287 (**520**) | 14534 (**1643**) | schema examples + fix-named errors; JSONL tokens |

Post-fix: tool errors cleared (3→0); malformed still 2 (sessions 3 & 5 fixed via `example`). Median weighted **1643** ≈ scripted known-op **1743**. Mean skewed by session 2, which omitted `where` on DNS list (~60k result tokens) — that outlier motivated the **observation budget** product change above. Still not the SPEC dual-model × 50 gate (and do not compare these Composer rows to scripted code-mode).

## Framing

Declarative `where` is the strong position: server-enforced, cheap to express, no interpreter to secure, every call individually governed. Programs handle fan-out, joins, and governed multi-step reads (ADR 0015). Both the 3×10k scripted board and the dual-model Cursor real-model gate clear the pre-committed bar for that claim.

## Open questions

[`open-questions.md`](./open-questions.md)
