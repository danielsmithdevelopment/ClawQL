# Track B freeze — unblock checklist

Last failed spend: https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36712295504

**Cause:** OpenRouter key spending / credit limit mid-run (not a missing GHA secret). Credits page is source of truth for wallet; `/api/v1/key` `limit_remaining` is key accounting only.

**Checkpoint:** 6 graded `A-no-tools` prove cells in artifact `pageindex-ab-agent-loop-freeze` (2/6 ok — memory baseline; report-only).

## Before re-dispatch

1. **Dedicated eval key** — see [`TRACK_B_EVAL_KEY.md`](TRACK_B_EVAL_KEY.md). Set key spending limit from `estimate_track_b_eval_key_limit.mjs` (≈ mean × 54 × 1.5). Store as `OPENROUTER_API_KEY_TRACK_B`. Top up wallet Credits separately.
2. **Schedule** — beat pairs first (grep↔CodeGraph per key), then no-harm pairs, then remaining no-tools. Resume keeps the 6 no-tools rows and starts prove beat pairs.
3. **Decision rule unchanged** — Net≥5 + no-harm on locked arms. Publish `memory_baseline` from `decide_codegraph_beat.mjs`; do not keep on memory alone.

## Re-dispatch

```bash
# After secrets + Credits are ready:
# touch benchmarks/pageindex-ab/.run-agent-loop-freeze
# or workflow_dispatch mode=agent-loop-freeze
```
