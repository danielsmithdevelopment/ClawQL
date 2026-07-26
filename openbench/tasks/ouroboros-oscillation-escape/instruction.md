# Escape the scheduler strategy flip-flop

`scheduler_lib/limiter.py` is broken. Two decoy notes under `decoy/` disagree on the
correct algorithm (token-bucket vs sliding-window). Institutional memory has the
prior decision. Do **not** thrash by alternating decoy strategies.

## Hard spend / loop caps (auto-fail)

These are enforced by the harness + checker. Exceeding any fails the trial:

- Wall clock: **90 seconds** (agent timeout)
- Tool turns: **≤ 20**
- Fresh tokens: **≤ 4000** (when usage is recorded)
- If using Ouroboros: `maxGenerations` **≤ 4** (server also clamps)

OpenCode `doom_loop` is denied (identical tool spam cannot burn the budget).
That does **not** stop A↔B strategy flip-flops — Ouroboros oscillation /
stagnation detection is for that class of thrash.

## If you have `ouroboros_*` tools (ouroboros-on)

1. `ouroboros_create_seed_from_document` with the problem statement (goal: fix
   limiter so `python3 -m scheduler_lib.selftest` passes; acceptance: selftest
   exits 0; mention both decoys as conflicting constraints).
2. `ouroboros_run_evolutionary_loop` with **`maxGenerations: 4`** (do not raise).
3. Optionally `ouroboros_get_lineage_status` — note stagnation / oscillation /
   max_generations exits as success paths for stopping thrash.
4. `memory_recall` for the prior algorithm decision, then **write** the fix to
   `scheduler_lib/limiter.py` (relative path). Stop.

## If you do **not** have `ouroboros_*` tools (ouroboros-off)

Still solve under the same hard caps. Prefer one decisive write over alternating
decoy strategies. Use `memory_recall` when available.

## Done when

`python3 -m scheduler_lib.selftest` exits 0 and no hard cap is breached.
