# Fan-out / join board — SPEC

**Status:** harness + smoke  
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
| known-op | Sum of six `where` (+fields) strings | **Cumulative re-reads:** turn *k* charges the sum of MCP texts from calls `1..k` (the model re-reads prior observations each turn). Session total = Σₖ Σᵢ≤ₖ resultᵢ |
| program | Plan JSON source | **One** `execute_program` MCP response text (the model sees one tool result) |
| executor / CF code-mode | Published script source | Returned card JSON (tokens-only for CF; live tool results for Executor) |

Do **not** attribute program result tokens as the sum of inner call values — that
would erase the one-turn observation win. Do **not** charge known-op as a flat sum
of six texts without re-reads — that would erase the turn cost the board exists to measure.

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

### Smoke finding (2026-10-16, N=5, cumulative re-reads, arm-specific defs)

Artifact: [`smoke-summary-n5-r1.json`](./smoke-summary-n5-r1.json)

| Arm | Weighted | Result mean | Code mean | Defs | Turns |
| --- | ---: | ---: | ---: | ---: | ---: |
| known-op | **1 064** | 433 (cumulative) | 70 | 281 (`execute`) | **6** |
| program | **3 351** | 812 (one envelope) | 432 | 379 (`execute_program`) | **1** |

**`turns_win`: true. `token_promotion`: false** on v0 plan runner — plan JSON at 5× plus
the full `execute_program` envelope still outweigh six compact `where` observations even
with cumulative re-reads. Token promotion needs cheaper plans and/or a compact joined
return (not the full call envelope). That is a product gap the board is meant to surface,
not a reason to weaken known-op accounting.

## What this board does not claim

- Filter-only workflows (zone-audit board already covers those).
- Real-model gate (follow-up; freeze rules before the first session).
- celld isolate / crash survival (separate spike).
- That programs should become the single core tool (still needs cheap one-step plans
  per measured-defaults).
