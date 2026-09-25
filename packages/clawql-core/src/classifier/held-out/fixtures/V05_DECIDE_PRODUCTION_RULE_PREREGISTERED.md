# Decide v0.5 production rule (pre-registered)

**Status:** locked before any Decide live-path swap. Does **not** change stock `productionTrusted`.

**Date (UTC):** 2026-09-25  
**Branch:** `cursor/fast-decision-decide-v05-088d`  
**Parent evidence:** four-arm GHA [36165019073](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36165019073)

## Why this exists

Decide is the stronger forced-answer model on the frozen catalog (92.5% vs 80% EM). Putting the **same confidence gate** on Decide is the right product shape. Cutover is blocked by one miss under the prior Decide reject arm (T=0.75, τ=0.60 → 34/40 fire, 1 error) and by protocol: `productionTrusted` does not transfer across different (T,τ) without fit → freeze → score-once → adjudicate.

## Confirmed (step 1)

Decide (T,τ) for the four-arm reject path were fit **only** on `fast-decision-fit-routing-v0.1` (n=41 = spent v0.3 + Harvey routing). Eval dump `fit` length 41; `eval` length 40. **Not** tuned on v0.4 for selection of T=0.75 / prior τ=0.60.

## Production rule (predeclared — do not change after looking at a new coverage number)

1. **Keep stock reject live** (T=4, τ=0.70) until a Decide path earns its own closeout.
2. **Ship Decide reject only if errors among fires stay 0** on the designated final-eval set after freeze + score-once + frontier adjudication.
3. **Select Decide τ on the fit set only**, under:

   > Among thresholds with fit precision ≥ 0.90 **and** fit `nErrorsFired = 0`, maximize fire rate; ties → higher τ.

   (Stricter than the prior max-coverage / prec≥0.9 rule that allowed fit FPs and produced τ=0.60.)
4. Keep Decide **T** from the existing off-set temperature fit unless a new fit set is cut (**T=0.75**, `temperature_softmax`).
5. Remap policy unchanged: semantic tool-changing remaps **fail the run**.
6. **v0.4 remains spent** for stock closeout citation. Any Decide readout on that same 40 is a **candidate score-once**, not a rewrite of `productionTrusted`, until a **v0.5** suite is frozen before Decide τ is locked for the claim.

## Rejected alternatives

| Option | Why rejected |
| --- | --- |
| Hot-swap Decide @ τ=0.60 | Realized 1/34 error on frozen 40; not a 0-error gate |
| Allow 1 error if “hard case” | Not predeclared for this cutover; would need explicit product acceptance before looking at coverage |
| Raise τ by inspecting the eval miss only | Contaminates held-out citation; τ must come from fit-only rule above |

## Miss to pull (step 2) — diagnosis allowed on spent suite

See [`frontier-runs/decide-v05-route-v04-004-miss.json`](./frontier-runs/decide-v05-route-v04-004-miss.json). Summary: `route-v04-004` — GT `mcp.execute`, Decide chose `mcp.search` at calibrated conf ≈0.739 (τ=0.60 fires it). Frontier labels already agree GT = execute. No remap.

## Next locked steps

3. ~~Pull miss~~ done (artifact above).
4. This file = production rule.
5. Apply fit-only 0-error τ selection → candidate readout on spent v0.4 (honest, non-closeout).
6. Freeze **v0.5** routing-fresh **before** claiming Decide `productionTrusted`.
7. Score once + frontier-adjudicate under this rule; only then consider swapping the live path.

## Team sentence

We will put the same confidence gate on Decide — that is v0.5 — but we do not replace a 0-error CPU on-ramp with an 85% gate that already misrouted once on the frozen set just because coverage looks better.
