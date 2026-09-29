# Human pass — one sitting (doc keys + CodeGraph) — freeze stretch to 2026-10-15

**Do both gates in one review.** Doc keys unblock `H-idf` + k-sweep the same day; CodeGraph prove keys are the Track B critical path. Splitting them costs a round trip.

| Track | Artifact | Machine gate | Human doc |
| ----- | -------- | ------------ | --------- |
| **Doc / k-sweep** | hard-candidate keys | `keys_with_gold_clean=238`, defective=0, map ghosts=0 | [`../corpus/hard-candidate/HUMAN_PASS.md`](../corpus/hard-candidate/HUMAN_PASS.md) |
| **CodeGraph prove** | 12 real-repo impact/explore keys | oracle `machine_ok` 12/12 | [`codegraph-prove-keys.md`](codegraph-prove-keys.md) |

## Why grow the doc set before signing

n≈72 gold-section keys only detects **~13pp** single-comparison effects — enough for a large k-sweep win, not a subtle default change. The set is now **238** clean gold-section keys (target ≥190 ≈ **~8pp**). Sign this grown set; do not freeze the thin 72.

## Sitting checklist

1. [ ] Doc set: complete [`HUMAN_PASS.md`](../corpus/hard-candidate/HUMAN_PASS.md) (spot-checks + re-run flagger = 0).
2. [ ] CodeGraph: complete [`codegraph-prove-keys.md`](codegraph-prove-keys.md) checklist (grep insolubility + gold verify).
3. [ ] Same day after both signed: cheap offline `H-idf` baseline on clean doc keys; schedule k-sweep `(3, 6, 10)` + union matched-k.
4. [ ] Schedule Track B agent loop only after CodeGraph section signed (no spend before).

## Signer

| Role | Name | Date |
| ---- | ---- | ---- |
| Doc keys human pass | | |
| CodeGraph human pass | | |
| Session (both) | | |
