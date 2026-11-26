# Track B — **void, retest** (not keep)

**Date:** 2026-10-01  
**Prior record:** [`codegraph-beat-decision.json`](codegraph-beat-decision.json) / [`TRACK_B_RESULT.md`](TRACK_B_RESULT.md) said `codegraph_beats` / `keep_codegraph_opt_in` with Net=12.  
**Corrected record:** the contrast is **void**. Retest against a working `A-grep` arm. Same precedent as Vectify [`fair-test-void-retest.md`](fair-test-void-retest.md): a locked rule assumes the instrument works.

## Why void

| Signal | Value | Why it voids |
| ------ | ----- | ------------ |
| `A-grep` on no-harm (grep-solvable) | **0/6** | Control arm failed its own solvability gate |
| `A-grep` on prove | **0/12** | Worse than `A-no-tools` (**3/12**) — a working tool must not beat memory downward |
| Final answers | “symbol does not exist / zero matches” | Model believed grep returned empty while local `rg` on the same roots finds the gold files |

A 12–0 “win” over a baseline that could not score is the OpenBench-style flaw: beating a broken comparator is not evidence.

## Root cause (instrument)

`agent_loop_tools.mjs` `grep` treated a missing/`rg` spawn failure as **`(no matches)`** by concatenating empty stdout with stderr and never checking `spawnSync` `error` / exit status. On a runner without a healthy `rg`, every search looked empty; the agent then answered not-found. Tools **were** offered and called (tool_calls>0); the tool result channel was lying.

Fixes for retest:

- Surface `rg` spawn/exit errors instead of fake empty hits  
- Preflight `grep` probe + offline `smoke_grep_no_harm.mjs`  
- Ensure `ripgrep` in GHA  
- Persist `tool_trace` / `tools_offered` on each answer row  
- Gate: `A-grep` alone on no-harm must score **≥5/6** before paired spend  
- Fresh out dir `results/agent-loop-freeze-retest/` (do not resume void answers)

## Retest plan

1. Offline smoke (free): gold paths appear under Track B search roots.  
2. Live gate: `A-grep` × 6 no-harm keys ≥5/6.  
3. Live paired: **18 keys × {A-grep, A-codegraph}** (beat pairs first).  
4. Score with locked Net≥5 + no-harm; publish memory baseline only if re-run.

## What still stands

| Decision | Status |
| -------- | ------ |
| Prior `keep_codegraph_opt_in` from Net=12 | **Withdrawn** — void |
| Locked beat rule (Net≥5 + no-harm) | Stands — requires working grep control |
| CodeGraph 12/12 on prove (void run) | Encouraging but **not decisive** until it beats working grep |
