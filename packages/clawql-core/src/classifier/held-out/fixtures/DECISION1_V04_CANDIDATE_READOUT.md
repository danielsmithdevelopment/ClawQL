# Decision-1 v0.4 routing candidate readout (measure-only)

**Tag:** `candidate` / `not-productionTrusted` / **`decision1-v04-measure`**  
**Suite:** frozen v0.4 routing-fresh (n=40) + frontier labels GHA 36144911649  
**Harness:** `buildDecision1CandidateReport` in `clawql-inference` (fan-out bulk + flip-rate `model=microsoft-decision-1`)  
**Template:** [`frontier-runs/decision1-v04-routing-candidate-TEMPLATE.json`](./frontier-runs/decision1-v04-routing-candidate-TEMPLATE.json)  
**Filled:** [`frontier-runs/decision1-v04-routing-candidate.json`](./frontier-runs/decision1-v04-routing-candidate.json) — Decision-1 bulk 40/40; full-family flip-rate pass (`totalPerturbations=200`, 0 flips; synonym-only #1273 cite vacated)

## Honesty (locked)

1. This is a **measure rung** after the flip-rate Decision-1 pin. It does **not** light `calibrated` or held-out `productionTrusted`.
2. Trust remains **GLiNER2-only** on the core held-out path (`PRODUCTION_TRUSTED_SCORER_BACKEND`).
3. Fan-out bulk for this candidate uses **twin-aware** `candidatesEquivalent` (`matchMode: twin`). Still not a `productionTrusted` claim — GLiNER held-out remains the only trust path.
4. Fill the template with a live OpenRouter run before citing any numbers. Empty `reports` arrays are not evidence.
5. Flip-rate **fails closed** when `totalPerturbations === 0` (vacuous synonym-only on routing text is not a pass).

## How to run (operator)

**Marker PR (preferred — uses repo Actions secret, no `actions:write`):**

1. Set `packages/clawql-core/src/classifier/held-out/.run-decision1-v04-candidate` to `v0.4-routing-fresh`.
2. Open PR → workflow `Decision-1 v0.4 candidate measure` runs when `OPENROUTER_API_KEY` is installed (default families: full suite).
3. Download artifact `decision1-v04-routing-candidate` and commit under `frontier-runs/` (or leave as Actions artifact).
4. Clear/empty the marker in a follow-up commit.

**Local:**

```bash
# Full suite (default — non-vacuous):
OPENROUTER_API_KEY=… npx tsx scripts/run-decision1-v04-candidate.mts
# Bound spend knowingly (often vacuous on routing text):
CLAWQL_DECISION1_FLIP_FAMILIES=synonym \
  OPENROUTER_API_KEY=… npx tsx scripts/run-decision1-v04-candidate.mts
```

## How to read

- Prefer local when it meets the quality bar cheaper — Decision-1 is a **candidate**, not a pin.
- Cite flip-rate only when `totalPerturbations > 0` and `passed`.
- Do **not** promote Decision-1 into `PRODUCTION_TRUSTED_USE_SITES` from this readout.

## Next

Held-out measure scorer Layer shipped (#1282). Operator path: marker `.run-decision1-held-out-measure` → workflow `Decision-1 held-out measure scorer` (frozen v0.4 labels, `CLAWQL_FLIP_RATE_GATE=0`). Still not a trust transfer — cite only as measure.
