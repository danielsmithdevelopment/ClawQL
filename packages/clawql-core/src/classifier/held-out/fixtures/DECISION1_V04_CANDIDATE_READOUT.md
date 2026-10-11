# Decision-1 v0.4 routing candidate readout (measure-only)

**Tag:** `candidate` / `not-productionTrusted` / **`decision1-v04-measure`**  
**Suite:** frozen v0.4 routing-fresh (n=40) + frontier labels GHA 36144911649  
**Harness:** `buildDecision1CandidateReport` in `clawql-inference` (fan-out bulk + flip-rate `model=microsoft-decision-1`)  
**Template:** [`frontier-runs/decision1-v04-routing-candidate-TEMPLATE.json`](./frontier-runs/decision1-v04-routing-candidate-TEMPLATE.json)

## Honesty (locked)

1. This is a **measure rung** after the flip-rate Decision-1 pin. It does **not** light `calibrated` or held-out `productionTrusted`.
2. Trust remains **GLiNER2-only** on the core held-out path (`PRODUCTION_TRUSTED_SCORER_BACKEND`).
3. Fan-out bulk scores **exact option id match** — not twin-aware held-out scoring. Do not equate bulk accuracy with GLiNER held-out accuracy.
4. Fill the template with a live OpenRouter run before citing any numbers. Empty `reports` arrays are not evidence.

## How to run (operator)

```bash
# With OPENROUTER_API_KEY present, load v0.4 suite + labels, then:
# buildDecision1CandidateReport({ suite, labels, env: process.env })
# Write filled JSON next to the TEMPLATE under frontier-runs/.
```

## How to read

- Prefer local when it meets the quality bar cheaper — Decision-1 is a **candidate**, not a pin.
- Flip-rate pass on Decision-1 is necessary-but-not-sufficient for any future trust discussion.
- Do **not** promote Decision-1 into `PRODUCTION_TRUSTED_USE_SITES` from this readout.

## Next

Only after a filled candidate report on this spent suite: discuss whether a dedicated remote scorer / new frozen suite is worth the cost. Until then, keep Decision-1 on the measure path.
