# Escape the scheduler strategy flip-flop

`scheduler_lib/limiter.py` is broken. Notes under `decoy/` disagree on the
correct algorithm. OpenCode’s identical-tool `doom_loop` guard is **off** for
this experiment — you can thrash. A hard **50-turn** / **180s** / **8000-token**
cap still auto-fails the trial (spend backstop).

## Hard spend / loop caps (auto-fail)

- Wall clock: **180 seconds**
- Tool turns: **≤ 50**
- Fresh tokens: **≤ 8000** (when recorded)
- If using Ouroboros: `maxGenerations` **≤ 4** (server clamps)

## Workspace notes

Read `decoy/token_bucket.md` and `decoy/sliding_window.md`. They conflict.
Do **not** invent a third algorithm unless a crystallized seed / prior decision
tells you otherwise.

## If you have `ouroboros_*` tools (ouroboros-on)

1. Use any **seed source text** provided in this prompt (appendix) with
   `ouroboros_create_seed_from_document`.
2. `ouroboros_run_evolutionary_loop` with **`maxGenerations: 4`** — stop when the
   loop reports convergence, oscillation, stagnation, or max generations.
3. Implement `scheduler_lib/limiter.py` **once** from the converged / final seed
   decision. Prefer one decisive `write` over alternating decoy edits.
4. Run `python3 -m scheduler_lib.selftest` and stop when green.

## If you do **not** have `ouroboros_*` tools (ouroboros-off)

You MUST call tools — planning-only scores zero.

1. Read both decoy notes.
2. Implement token-bucket in `scheduler_lib/limiter.py`, run
   `python3 -m scheduler_lib.selftest`.
3. On failure, rewrite with sliding-window and re-test.
4. Keep alternating decoys until selftest passes or you hit the turn/time cap.
   Do not stop after the first failed attempt.

## Done when

`python3 -m scheduler_lib.selftest` exits 0 and no hard cap is breached.
