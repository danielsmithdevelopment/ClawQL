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
| **Publish board: 3×10k** | **Pending** (re-run with code-arg accounting; rep 1 matches smoke) |
| **Real-model 50 sessions / arm × 2 model families** | **Harness ready; blocked on secrets; Composer pilots ≠ SPEC gate** |
| Blog / public headline | **Hold** until publish board + dual-model real-model land |

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

**Compare real-model results only with real-model results.** Scripted Executor / Cloudflare code-mode rows are not a fair peer for Cursor/OpenAI ClawQL sessions — code-mode agents can also dump whole lists or retry broken programs. Default arms include `executor_v2`.

Set secrets **in the environment** (never paste keys into chat):

- `OPENAI_API_KEY` (required)
- `OPENAI_BASE_URL` (optional)
- `CF_MT_MODEL_FRONTIER` and `CF_MT_MODEL_SMALL` (run both — **different families**; include a smaller model)

```bash
CF_MT_REAL_ITERS=50 \
  CF_MT_REAL_ARMS=clawql_known_op,clawql_program,executor_v2 \
  npm run benchmark:cloudflare-multiturn:real-model
```

Fixed settings: temperature 0, shared system prompt, each arm’s tool descriptions from `listTools`. Per arm the report includes **median / p90** observation tokens, **sessions over ceiling** (default 10k, `CF_MT_REAL_TOKEN_CEILING`), malformed `where`, observation-budget hits, retries, turns. Cursor-subscription Composer pilots are cheap signal, not this gate.

### 4. Observation budget (product)

Large `execute` responses with neither `where` nor `fields` hit a soft budget (~8k chars / ~2k tokens, `CLAWQL_EXECUTE_OBSERVATION_BUDGET_CHARS`). The server returns `truncated: true`, an honest note (“do not treat the preview as the full answer”), first ~20 rows, and a suggested `where`. Pass `full: true` only when every row is required (hard `CLAWQL_EXECUTE_RESULT_MAX_CHARS` still applies). Session-2’s ~60k unfiltered DNS dump is exactly what this turns into a short preview + one filtered retry.
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

On weighted tokens, known-op (**1743**) is about **3.1×** cheaper than Executor (**5328**) and about **2.3×** cheaper than Cloudflare code-mode (**3947**). Compact plan (tool omitted when `operationId` set; short ids; empty args dropped): program code **872 → 811**. Program remains the costliest ClawQL arm on this filter workflow — expected; fan-out/join benches are where it should win. Hold the public claim until 3×10k + dual-model real-model.

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

## Framing (if full board + real-model clear)

Declarative `where` is the strong position: server-enforced, cheap to express, no interpreter to secure, every call individually governed. Programs handle fan-out, joins, and governed multi-step reads (ADR 0015). Hold the blog headline until both gates land.

## Open questions

[`open-questions.md`](./open-questions.md)
