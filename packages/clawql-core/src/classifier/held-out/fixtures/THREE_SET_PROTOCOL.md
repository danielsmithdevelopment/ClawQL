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

| Step                              | Status                                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| v0.3 spent (tuning + τ selection) | done                                                                                                                                |
| FP diagnosis on v0.3 @ τ=0.75     | see `ROUTING_THRESHOLD_READOUT_v0.1.md`                                                                                             |
| Freeze v0.4                       | **done** — `FREEZE-v0.4-routing-fresh.md`                                                                                           |
| Fit set (≫7 routing)              | **done** — v0.3+Harvey routing n=41                                                                                                 |
| Fit T/τ                           | **done** — T=4, τ=0.70 (`FIT_TAU_FREEZE_v0.1.md`)                                                                                   |
| Score v0.4 once + frontier labels | **done** — provisional + live frontier agree 40/40; GHA 36144911649; **`productionTrusted=true`**; **v0.4 spent** for T/τ selection |
| Citable claim (routing)           | n=40 catalog-only held-out; @τ=0.70 fires on 45% (nAccepted=18) with 0 errors among those; 95% LB ≈82% — always quote n + LB        |
| Stock vs Decide four-arm          | **done** — GHA 36165019073; Decide+reject 34/40 with 1 miss                                                                        |
| Decide v0.5 rule (pre-registered) | **done** — 0 errors among fires; leave rule (favors low coverage) |
| Decide τ=0.80 provenance | **after** four-arm miss — **v0.4 spent for Decide reject** ([`DECIDE_TAU_080_PROVENANCE.md`](./DECIDE_TAU_080_PROVENANCE.md)) |
| Decide candidate projection | 23/40 @ 0.80 on spent v0.4 — **not** closeout ([`DECIDE_V05_CANDIDATE_READOUT.md`](./DECIDE_V05_CANDIDATE_READOUT.md)) |
| Freeze **v0.5** | **FROZEN** — n=75; digests in [`FREEZE-v0.5-routing-fresh.md`](./FREEZE-v0.5-routing-fresh.md); drafter `bc-fa82b86b-9c8d-55ea-941a-90a98da56f33` |
| Decide τ re-lock after freeze | **done** — T=0.75, **τ=0.80** fit-only ([`DECIDE_V05_FIT_TAU_LOCK.md`](./DECIDE_V05_FIT_TAU_LOCK.md)); no v0.5 scores used |
| Score once + frontier adj | **done** — twin-aware rematch: both reject arms **0** fire errors; Decide 45/75 vs stock 32/75 → **Decide wins** under V06 spend rule ([`V06_SHIP_RULE_SPEND.md`](./V06_SHIP_RULE_SPEND.md)) |
| Live path | **Decide** T=0.75 / τ=0.80 ([`DECIDE_V06_CUTOVER.md`](./DECIDE_V06_CUTOVER.md)); cite 45/75 @ ≈92% LB (stock rematch 32/75 @ ≈89%); not a fresh productionTrusted claim |
| Freeze **v0.6** | **FROZEN + scored once** — n=75; digests in [`FREEZE-v0.6-routing-fresh.md`](./FREEZE-v0.6-routing-fresh.md); Decide 39/75 @ τ=0.80 with **2** fire errors (≈83% LB); live cite unchanged ([`DECIDE_V06_CONFIRMATION_CLOSEOUT.md`](./DECIDE_V06_CONFIRMATION_CLOSEOUT.md)) |
| Template for other use sites      | same fit → freeze → score-once → adjudicate sequence                                                                                |

## Related

- [`FREEZE-v0.3-routing-fresh.md`](./FREEZE-v0.3-routing-fresh.md)
- [`FREEZE-v0.4-routing-fresh.md`](./FREEZE-v0.4-routing-fresh.md)
- [`FREEZE-v0.5-routing-fresh.md`](./FREEZE-v0.5-routing-fresh.md)
- [`FREEZE-v0.6-routing-fresh.md`](./FREEZE-v0.6-routing-fresh.md)
- [`FIT_TAU_FREEZE_v0.1.md`](./FIT_TAU_FREEZE_v0.1.md)
- [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md)
- [`DECIDE_TAU_080_PROVENANCE.md`](./DECIDE_TAU_080_PROVENANCE.md)
- [`DECIDE_V05_CANDIDATE_READOUT.md`](./DECIDE_V05_CANDIDATE_READOUT.md)
- [`DECIDE_V05_FIT_TAU_LOCK.md`](./DECIDE_V05_FIT_TAU_LOCK.md)
- [`DECIDE_V06_CUTOVER.md`](./DECIDE_V06_CUTOVER.md)
- [`CALIBRATION_FREEZE_v0.1.md`](./CALIBRATION_FREEZE_v0.1.md)
- [`ROUTING_THRESHOLD_READOUT_v0.1.md`](./ROUTING_THRESHOLD_READOUT_v0.1.md)
