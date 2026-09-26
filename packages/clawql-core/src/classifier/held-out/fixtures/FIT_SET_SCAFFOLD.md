# Fit set v0.1 — `fast-decision-fit-routing-v0.1`

## Composition (shortcut)

| Source                   | n      | Notes                                                        |
| ------------------------ | ------ | ------------------------------------------------------------ |
| Spent v0.3 routing-fresh | 34     | spent as **eval**; reusable for **fit**                      |
| Harvey v0.2 routing only | 7      | contaminated-smoke slice; included for size, not as sole fit |
| **Total**                | **41** |                                                              |

Exact query overlap with frozen v0.4: **0**.

Suite file: `fast-decision-fit-routing-v0.1.json`

## Used for

1. Refit temperature (may differ from prior Harvey-only T=3).
2. Select τ under locked FP-costly rule (precision ≥ 0.90 → max coverage; else `null`).
3. Freeze `(T, τ)`, then score v0.4 **once**.

## Status

`ready` — see `scripts/fit-and-score-v04-once.mts` and `FIT_TAU_FREEZE_v0.1.md` after the run.
