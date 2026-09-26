# Decide v0.5 production rule (pre-registered)

**Status:** locked before any Decide live-path swap. Does **not** change stock `productionTrusted`.

**Date (UTC):** 2026-09-25  
**Branch:** `cursor/fast-decision-decide-v05-088d`  
**Parent evidence:** four-arm GHA [36165019073](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36165019073)

## Why this exists

Decide is the stronger forced-answer model on the frozen catalog (92.5% vs 80% EM). Putting the **same confidence gate** on Decide is the right product shape. Cutover is blocked by one miss under the prior Decide reject arm (T=0.75, τ=0.60 → 34/40 fire, 1 error) and by protocol: `productionTrusted` does not transfer across different (T,τ) without fit → freeze → score-once → adjudicate.

## Confirmed (step 1)

- Decide **T=0.75** and prior **τ=0.60** for the four-arm reject path were fit **only** on `fast-decision-fit-routing-v0.1` (n=41). That off-set lock for T / prior τ stands.
- **τ=0.80 was not locked before the four-arm.** It was selected after the v0.4 miss (conf ≈0.739) was known. See [`DECIDE_TAU_080_PROVENANCE.md`](./DECIDE_TAU_080_PROVENANCE.md). **v0.4 is spent for Decide reject selection** as well as for stock.

## Production rule (predeclared — do not change after looking at v0.5 fires)

1. **Keep stock reject live** (T=4, τ=0.70) until a Decide path earns its own closeout.
2. **Ship Decide reject only if errors among fires stay 0** on the designated final-eval set after freeze + score-once + frontier adjudication.
3. **After v0.5 is frozen**, select Decide τ on the fit set only, under:

   > Among thresholds with fit precision ≥ 0.90 **and** fit `nErrorsFired = 0`, maximize fire rate; ties → higher τ.

   Re-lock τ under this rule with a freeze timestamp that **predates** any v0.5 scores. Do not treat the post-miss τ=0.80 projection as already locked for citation.

4. Keep Decide **T=0.75** (`temperature_softmax`) from the off-set temperature fit unless a new fit set is cut.
5. Remap policy unchanged: semantic tool-changing remaps **fail the run**.
6. The 23/40 @ τ=0.80 slice is a **candidate projection on a spent set** — not a closeout. Promoting it or retuning τ after seeing v0.5 fires is a new spend.

**Coverage bias (noted, not changed):** zero-errors-among-fires favors low coverage. A later round may use “CP LB ≥ stock’s.” Changing the rule now would be post-hoc — **leave it.**

## Rejected alternatives

| Option                                              | Why rejected                                           |
| --------------------------------------------------- | ------------------------------------------------------ |
| Hot-swap Decide @ τ=0.60                            | Realized 1/34 error on frozen 40; not a 0-error gate   |
| Hot-swap Decide @ τ=0.80 from spent-v0.4 projection | τ moved after miss known; v0.4 spent for Decide reject |
| Allow 1 error if “hard case”                        | Not predeclared for this cutover                       |
| Nudge v0.5 drafter toward search/execute            | Contaminates the suite; keep catalog-blind             |

## Miss to pull (step 2) — diagnosis allowed on spent suite

See [`frontier-runs/decide-v05-route-v04-004-miss.json`](./frontier-runs/decide-v05-route-v04-004-miss.json). Summary: `route-v04-004` — GT `mcp.execute`, Decide chose `mcp.search` at calibrated conf ≈0.739 (τ=0.60 fires it). Frontier labels already agree GT = execute. No remap.

## Next locked steps

1. Freeze **v0.5** at **n=70–80** (see [`FREEZE-v0.5-routing-fresh.md`](./FREEZE-v0.5-routing-fresh.md)) — blind drafter, no search/execute nudge.
2. Re-lock Decide τ from fit under the rule above (freeze first).
3. Score once stock (T=4/τ=0.70) + Decide (T=0.75/τ_fit); frontier-adjudicate.
4. Swap live only if Decide still has 0 errors among fires.

## Team / docs one-liner

Decide is measured and confidence-gated as a candidate; stock remains the 0-error CPU on-ramp until a frozen v0.5 closeout says otherwise.
