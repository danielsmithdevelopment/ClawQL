# Track B — dedicated OpenRouter eval key

## Why

Shared `OPENROUTER_API_KEY` spending limits collide with other pageindex-ab jobs and personal use. OpenRouter lets **each API key** carry its own spending limit, separate from the wallet. Size a Track-B-only key to the freeze run so eval spend cannot steal (or be stolen by) other budgets.

## Setup

1. OpenRouter → create a key labeled e.g. `clawql-track-b-freeze`.
2. Estimate the limit from finished cells:

   ```bash
   # Prefer GHA artifact answers.jsonl (after usage logging lands on tool arms)
   node benchmarks/pageindex-ab/scripts/estimate_track_b_eval_key_limit.mjs \
     /path/to/answers.jsonl
   ```

   Formula: `mean_usd_per_cell × 54 × 1.5`.

3. Set that key’s **spending limit** to `recommended_key_limit_usd` (raise later if tool arms exceed the no-tools lower bound).
4. Add GitHub Actions secret **`OPENROUTER_API_KEY_TRACK_B`** on the ClawQL repo.
5. Ensure the **wallet** has enough Credits for the run (key limit ≠ wallet balance).
6. Re-dispatch: touch `benchmarks/pageindex-ab/.run-agent-loop-freeze` or `workflow_dispatch` `mode=agent-loop-freeze`.

The workflow prefers `OPENROUTER_API_KEY_TRACK_B` and falls back to `OPENROUTER_API_KEY` with a warning.

## Probe caveat

`GET /api/v1/key` → `limit_remaining` is **key accounting**, not the Credits page “TOTAL AVAILABLE”. Always confirm wallet on openrouter.ai/credits before a long spend.

## Cell order (paired beat first)

Live schedule (see `track_b_cell_schedule.mjs`):

1. Prove: `A-grep` then `A-codegraph` per key  
2. No-harm: same pair per key  
3. `A-no-tools` baseline (prove then no-harm)

Resume skips graded rows. Prior `A-no-tools` cells remain valid; beat pairs run next.
