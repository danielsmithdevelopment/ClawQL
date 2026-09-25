# Freeze scaffold: fast-decision-held-out-v0.5-routing-fresh

## Status

**NOT FROZEN** — placeholder only. Do not score for a Decide `productionTrusted` claim until an isolated draft is frozen with digests below.

## Why v0.5 is required

v0.4 is **spent** for stock T/τ and for citing the stock reject closeout. Decide candidate knobs (T=0.75, τ=0.80 under the fit-only 0-error rule) were selected on the shared fit set; a spent-v0.4 readout (23/40, 0 errors) is **candidate evidence only**. Citing Decide as live needs a new frozen eval set authored **before** that τ is treated as locked for the claim.

## Locked inputs (already done — do not redo for freeze)

| Item | Ref |
| --- | --- |
| Production rule | [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md) |
| Decide candidate readout | [`DECIDE_V05_CANDIDATE_READOUT.md`](./DECIDE_V05_CANDIDATE_READOUT.md) |
| Miss under prior τ=0.60 | `route-v04-004` → [`frontier-runs/decide-v05-route-v04-004-miss.json`](./frontier-runs/decide-v05-route-v04-004-miss.json) |
| Stock live path | T=4, τ=0.70 (`FIT_TAU_FREEZE_v0.1.md`) — unchanged |

## Freeze checklist (when drafting)

1. Isolated drafter sees **catalog-only** semantics (same discipline as v0.4). Banned: spent suites, ontology eval log, Decide miss query as a template.
2. Schema review only (unique caseIds, GT ∈ candidates, no query rewrites by reviewer).
3. Token-overlap check vs v0.4 (and fit set): zero high-overlap / exact copies.
4. Write digests (SHA-256 canonical JSON) into this file; flip status to **FROZEN**.
5. Score **once** Decide (T=0.75, τ=0.80) + stock (T=4, τ=0.70); frontier-adjudicate; apply predeclared 0-error rule.

## Digests (fill at freeze)

| Artifact | SHA-256 |
| --- | --- |
| Suite `fast-decision-held-out-v0.5-routing-fresh.json` | _pending_ |
| Source catalog | _pending_ |

## Related

- [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md)
- [`FREEZE-v0.4-routing-fresh.md`](./FREEZE-v0.4-routing-fresh.md) (spent)
- [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](./V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md)
