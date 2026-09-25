# Freeze scaffold: fast-decision-held-out-v0.5-routing-fresh

## Status

**NOT FROZEN** — placeholder only. Do not score for a Decide `productionTrusted` claim until an isolated draft is frozen with digests below.

## Docs one-liner

Decide is measured and confidence-gated as a candidate; stock remains the 0-error CPU on-ramp until a frozen v0.5 closeout says otherwise.

## Why v0.5 is required

- **v0.4 is spent for choosing knobs** (stock T/τ **and** Decide reject — see [`DECIDE_TAU_080_PROVENANCE.md`](./DECIDE_TAU_080_PROVENANCE.md)).
- The 23/40 @ τ=0.80 slice is a **candidate projection on a spent set**, not evidence Decide already passed the ship rule.
- Ontology enrichment stays **off**; temperature softmax stays the calibration that made the reject rule usable. Neither is reopened by the Decide table.

## Size the suite for the claim (locked before draft)

With **zero errors among k accepted** cases, a rough 95% lower bound on precision is ~0.05^(1/k):

| Accepted, 0 errors | ~95% LB |
| --- | --- |
| 18 | ~85% |
| 30 | ~90% |
| 60 | ~95% |

| Goal | Implication for n |
| --- | --- |
| Decide ≥90% LB at 0 errors among fires | need ~**30** accepted; at ~57% coverage ⇒ **n ≳ 55** |
| Stock comparable accepted count at ~45% coverage | aim **n = 70–80** |
| n=40 (v0.4 size) | **insufficient** — reproduces overlapping LBs; cannot settle stock vs Decide |

**Target case count for v0.5: 70–80** catalog-only routing cases (`search_provider_tool_routing`).

## Ship rule for Decide on v0.5 (predeclared — do not change after seeing fires)

Keep: **ship Decide reject only if errors among fires stay 0** after freeze → lock knobs from fit → score once → frontier-adjudicate.

Be aware: this rule **favors low coverage** (more fires ⇒ harder to stay at zero errors at equal true precision). A later round may compare “CP LB at least as high as stock’s” more fairly. **Changing the rule now would be post-hoc — leave it.**

## Drafter blindness (hard)

1. Isolated drafter sees **catalog-only** semantics (same discipline as v0.4).
2. **Banned:** spent suites, ontology eval log, Decide miss query / `route-v04-004`, four-arm report, FIT/τ freezes used as templates.
3. **Do not nudge** the drafter toward the `search` vs `execute` confusion from `route-v04-004`. If that confusion is common, a catalog-derived set will contain it on its own.
4. Schema review only (unique caseIds, GT ∈ candidates, no query rewrites by reviewer).
5. Token-overlap check vs v0.4 and the fit set: zero high-overlap / exact copies.
6. Write digests into this file; flip status to **FROZEN** **before** any Decide τ re-lock for citation.
7. Score **once**: stock (T=4, τ=0.70) and Decide (T=0.75, τ re-locked from fit under the predeclared 0-error rule after freeze). Frontier-adjudicate. Swap live only if Decide still has 0 errors among fires.

## Locked inputs (already done — do not redo for freeze)

| Item | Ref |
| --- | --- |
| Production rule | [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md) |
| τ=0.80 provenance (spent) | [`DECIDE_TAU_080_PROVENANCE.md`](./DECIDE_TAU_080_PROVENANCE.md) |
| Candidate readout (not closeout) | [`DECIDE_V05_CANDIDATE_READOUT.md`](./DECIDE_V05_CANDIDATE_READOUT.md) |
| Miss under prior τ=0.60 | [`frontier-runs/decide-v05-route-v04-004-miss.json`](./frontier-runs/decide-v05-route-v04-004-miss.json) |
| Stock live path | T=4, τ=0.70 — **unchanged** |

## Digests (fill at freeze)

| Artifact | SHA-256 |
| --- | --- |
| Suite `fast-decision-held-out-v0.5-routing-fresh.json` | _pending_ |
| Source catalog | _pending_ |
| Case count | _pending_ (target 70–80) |

## Related

- [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md)
- [`FREEZE-v0.4-routing-fresh.md`](./FREEZE-v0.4-routing-fresh.md) (spent)
- [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md)
- [`DECIDE_TAU_080_PROVENANCE.md`](./DECIDE_TAU_080_PROVENANCE.md)
