# Fan-out / join board — SPEC

**Status:** harness + smoke + **3×10k publish**  
**Parent:** [cloudflare-multiturn](../) · [ADR 0015](../../../adr/0015-program-mode-alongside-search-execute.md) · [measured-defaults](../measured-defaults.md)

## Why this board exists

The zone-audit board is a **filter** workflow. On that board, known-op + `where` wins;
program mode is more expensive (plan boilerplate) for the same one-op-shaped steps.
ADR 0015 and measured-defaults say programs earn promotion only on **fan-out** and
**cross-source joins** — several operations per model turn, plus a join that no single
`where` can express.

This board answers: *when the task needs six independent reads and a join across two
of them, does one `execute_program` beat six known-op executes on weighted tokens and
model turns?*

## Task (one session)

Given known `account_id` and `zone_id` (no discovery), produce one **inventory card**:

| Field | Source |
| --- | --- |
| `ssl` | zone SSL setting |
| `aRecordCount` | DNS list → count of `A` |
| `workers` | worker script ids (sorted) |
| `routesForWorkers` | **join:** routes whose `script` ∈ workers (sorted by script, then pattern) |
| `bucketNames` | R2 bucket names (sorted) |
| `enabledFirewallRules` | count of non-paused firewall rules |

The join (`routesForWorkers`) requires both the workers list and the routes list.
A single JMESPath `where` on one operation cannot produce it.

## Arms

| Arm | How the card is built | Model turns (scripted) |
| --- | --- | ---: |
| `clawql_known_op` | Six sequential `execute` + `where`; harness assembles the card for the check | **6** |
| `clawql_program` | One `execute_program` (`mode: "parallel"`) with six calls; card from plan results | **1** |
| `executor_v2` | One code-mode script: six tool calls + join return (tokens + live tools → mock) | **1** |
| `cloudflare_codemode` | Tokens-only peer: one script returning the same card shape | **1** |

Default arms for smoke/publish: the four above. Pass-through gateways are out of
scope here (they cannot join server-side).

## Token policy

Same weighted formula as the zone-audit board:

`weighted = definition + discovery + result + 5 × code`

| Arm | `code` | `result` (honesty) |
| --- | --- | --- |
| known-op | Sum of six full execute-argument JSON blobs (`operationId` + `args` + `where`) — parity with plan content | **Cumulative re-reads:** turn *k* charges the sum of MCP texts from calls `1..k`. Session total = Σₖ Σᵢ≤ₖ resultᵢ |
| program | Plan JSON source (including optional `return` template) | **One** `execute_program` MCP response text. With `plan.return`, that payload is the projected card + slim call status (no per-call values) |
| executor / CF code-mode | Published script source | Returned card JSON (tokens-only for CF; live tool results for Executor) |

Do **not** attribute program result tokens as the sum of inner call values — that
would erase the one-turn observation win. Do **not** charge known-op as a flat sum
of six texts without re-reads — that would erase the turn cost the board exists to measure.
Do **not** charge known-op code as `where`-only while charging the full plan — that
under-counts known-op model writing on this multi-op board.

## Success

Task success requires every inventory-card field to match fixture-derived expectations
(same style as zone-audit `success-checks`). Failed sessions count against
`task_success_rate`; primary means include all attempted sessions.

## Publish protocol

| Knob | Smoke | Publish |
| --- | --- | --- |
| `CF_MT_ITERS` | 2–50 | ≥ 10 000 |
| `CF_MT_REPS` | 1 | ≥ 3 |
| Artifacts | `fanout-join/smoke-*` | `fanout-join/board-*` |

```bash
CF_MT_ITERS=20 CF_MT_REPS=1 \
  node scripts/benchmarks/cloudflare-multiturn/run-fanout-board.mjs
```

## Pre-committed promotion signals

Claim family: `program_beats_known_op_on_fanout_join`

| Gate | Id field | Requires |
| --- | --- | --- |
| **Turns win** (primary for v0) | `turns_win` | (2) + (3) below |
| **Token promotion** (core-tool bar) | `token_promotion` / `win` | (1) + (2) + (3) |

1. `clawql_program.weighted_mean < clawql_known_op.weighted_mean`
2. `clawql_program.model_turns_mean < clawql_known_op.model_turns_mean`
3. `clawql_program.task_success_rate >= clawql_known_op.task_success_rate`

On publish (3×10k): report both gates across reps. Do not claim token promotion
from smoke alone.

### Smoke finding (2026-10-16, N=5)

Artifact: [`smoke-summary-n5-r1.json`](./smoke-summary-n5-r1.json)

After `plan.return: true` (merge compact card) + fair known-op code (full execute args)
+ cumulative re-reads:

| Arm | Weighted | Result mean | Code mean | Defs | Turns |
| --- | ---: | ---: | ---: | ---: | ---: |
| known-op | **2 694** | 433 (cumulative) | 396 | 281 (`execute`) | **6** |
| program | **2 650** | 256 (compact return) | 403 | 379 (`execute_program`) | **1** |

**`turns_win`: true. `token_promotion`: true** — program leads on weighted tokens and
turns. Margin is small on tokens (~44); the large win is model turns (1 vs 6).

### Publish finding (2026-10-16, 3×10 000)

Artifact: [`board-summary-n10000-r3.json`](./board-summary-n10000-r3.json)  
Arms: `clawql_known_op`, `clawql_program`, `cloudflare_codemode`  
(`executor_v2` deferred — auth/URL wiring against live Executor still open.)

| Arm | Weighted (rep means) | Turns | Success |
| --- | ---: | ---: | ---: |
| known-op | **2 694** / **2 694** / **2 694** | 6 | 1.0 |
| program | **2 650.59** / **2 650.58** / **2 650.59** | 1 | 1.0 |

Across all three reps: **`turns_win`: true**, **`token_promotion`: true**, **`win`: true**.  
Token margin ≈ **43–44** weighted tokens; turn win is 1 vs 6.

## What this board does not claim

- Filter-only workflows (zone-audit board already covers those).
- Real-model gate (follow-up; freeze rules before the first session).
- celld isolate / crash survival (separate spike).
- Live `executor_v2` publish numbers (arm not in this publish set).
- That programs should become the single core tool (still needs cheap one-step plans
  per measured-defaults).
