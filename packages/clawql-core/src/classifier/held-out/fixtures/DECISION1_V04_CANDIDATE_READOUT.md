# Decision-1 v0.4 routing candidate readout (measure-only)

**Tag:** `candidate` / `not-productionTrusted` / **`decision1-v04-measure`**  
**Suite:** frozen v0.4 routing-fresh (n=40) + frontier labels GHA 36144911649  
**Harness:** `buildDecision1CandidateReport` in `clawql-inference` (fan-out bulk + flip-rate `model=microsoft-decision-1`)  
**Template:** [`frontier-runs/decision1-v04-routing-candidate-TEMPLATE.json`](./frontier-runs/decision1-v04-routing-candidate-TEMPLATE.json)  
**Filled:** [`frontier-runs/decision1-v04-routing-candidate.json`](./frontier-runs/decision1-v04-routing-candidate.json) — Decision-1 bulk 40/40, synonym flip-rate pass (measure-only; see scorecard)

## Honesty (locked)

1. This is a **measure rung** after the flip-rate Decision-1 pin. It does **not** light `calibrated` or held-out `productionTrusted`.
2. Trust remains **GLiNER2-only** on the core held-out path (`PRODUCTION_TRUSTED_SCORER_BACKEND`).
3. Fan-out bulk scores **exact option id match** — not twin-aware held-out scoring. Do not equate bulk accuracy with GLiNER held-out accuracy.
4. Fill the template with a live OpenRouter run before citing any numbers. Empty `reports` arrays are not evidence.

## How to run (operator)

**Marker PR (preferred — uses repo Actions secret, no `actions:write`):**

1. Set `packages/clawql-core/src/classifier/held-out/.run-decision1-v04-candidate` to `v0.4-routing-fresh`.
2. Open PR → workflow `Decision-1 v0.4 candidate measure` runs when `OPENROUTER_API_KEY` is installed.
3. Download artifact `decision1-v04-routing-candidate` and commit under `frontier-runs/` (or leave as Actions artifact).
4. Clear/empty the marker in a follow-up commit.

**Local:**

```bash
OPENROUTER_API_KEY=… npx tsx scripts/run-decision1-v04-candidate.mts
# Optional full flip suite (costly):
CLAWQL_DECISION1_FLIP_FAMILIES=whitespace,case,punctuation,synonym \
  OPENROUTER_API_KEY=… npx tsx scripts/run-decision1-v04-candidate.mts
```

## How to read

- Prefer local when it meets the quality bar cheaper — Decision-1 is a **candidate**, not a pin.
- Flip-rate pass on Decision-1 is necessary-but-not-sufficient for any future trust discussion.
- Do **not** promote Decision-1 into `PRODUCTION_TRUSTED_USE_SITES` from this readout.

## Next

Only after a filled candidate report on this spent suite: discuss whether a dedicated remote scorer / new frozen suite is worth the cost. Until then, keep Decision-1 on the measure path.
