# Three-set protocol (Fast Decision routing) — v0.4 onward

## Why

v0.3 is **spent for choosing τ** (and for hint/ontology tuning). The coverage curve is known; any future τ chosen by someone who has seen that curve is contaminated for held-out citation. Harvey routing (n=7) cannot justify a τ after T=3 (max precision 0.50). Calibration T=3 remains the frozen default from the prior Harvey fit — retuning T also needs a fresh fit set under this protocol.

## The three sets

| Set                   | Role                                                       | May choose T / τ? | May be scored repeatedly?        |
| --------------------- | ---------------------------------------------------------- | ----------------- | -------------------------------- |
| **Fit**               | Larger routing set (≫7) used only to choose T and τ        | **yes**           | yes (during fit)                 |
| **Final eval (v0.4)** | Frozen before any fit on it; scored **once** for the claim | **no**            | **once** (after fit locked)      |
| **Frontier labels**   | Live adjudication on the eval set                          | n/a               | required for `productionTrusted` |

## Locked order

1. **Build and freeze v0.4** (catalog-only isolated draft → schema review → digest → `FREEZE-v0.4-*.md`). No T/τ fitting yet. No scoring for selection.
2. **Build the fit set** (larger routing corpus; may include newly drafted fit-only cases and/or non-v0.4 sources). Must not include v0.4 queries.
3. **Fit** T (if retuning) and τ on the fit set only, with selection rules locked before looking at v0.4 scores.
4. **Score v0.4 once** with locked (T, τ), preferably after frontier labels are applied. That single score is the §7 / fast-path claim.

## Integrity rules

- Nothing tuned against the eval set counts as held-out lift (FD §7.2a).
- Diagnosing spent suites (v0.3 FPs, etc.) is allowed; do not feed those query texts into the v0.4 drafter.
- Tool IDs in a frozen suite are immutable.
- Report bucket **counts** with MCE; report coverage **and** accuracy-among-accepted with nAccepted; treat small-n precision as interval-uncertain.

## Current status

| Step                              | Status                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| v0.3 spent (tuning + τ selection) | done                                                                                                                   |
| FP diagnosis on v0.3 @ τ=0.75     | see `ROUTING_THRESHOLD_READOUT_v0.1.md`                                                                                |
| Freeze v0.4                       | **done** — `FREEZE-v0.4-routing-fresh.md`                                                                              |
| Fit set (≫7 routing)              | **done** — v0.3+Harvey routing n=41                                                                                    |
| Fit T/τ                           | **done** — T=4, τ=0.70 (`FIT_TAU_FREEZE_v0.1.md`)                                                                      |
| Score v0.4 once + frontier labels | scored once (provisional GT); **v0.4 spent** for T/τ selection; frontier labels still required for `productionTrusted` |
| Future T/τ retune                 | freeze **v0.5** before fit                                                                                             |

## Related

- [`FREEZE-v0.3-routing-fresh.md`](./FREEZE-v0.3-routing-fresh.md)
- [`FREEZE-v0.4-routing-fresh.md`](./FREEZE-v0.4-routing-fresh.md)
- [`FIT_TAU_FREEZE_v0.1.md`](./FIT_TAU_FREEZE_v0.1.md)
- [`CALIBRATION_FREEZE_v0.1.md`](./CALIBRATION_FREEZE_v0.1.md)
- [`ROUTING_THRESHOLD_READOUT_v0.1.md`](./ROUTING_THRESHOLD_READOUT_v0.1.md)
