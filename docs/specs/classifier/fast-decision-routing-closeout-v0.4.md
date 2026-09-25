# Fast Decision routing closeout v0.4

**Status:** productionTrusted on stock GLiNER 2.5 + reject rule. Decide measured, not live.

**Suite:** frozen catalog-only routing `v0.4-routing-fresh` (n=40).  
**Frontier labels:** GHA [36144911649](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36144911649).  
**Four-arm compare:** GHA [36165019073](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36165019073) · PR [#1147](https://github.com/danielsmithdevelopment/ClawQL/pull/1147).

## What is live

GLiNER 2.5 is a CPU-first on-ramp, not the full router. On a frozen catalog of 40 routing cases, calibrated stock 2.5 (T=4, τ=0.70) fires on **18/40** and was correct on all 18 (95% Clopper–Pearson two-sided lower bound **≈81.5%**, cited as ≈**82%**). The other 22 abstain to the existing fallback. Forced-answer stock 2.5 is **80%** exact-match (8/40 wrong). GLiNER2.5-Decide, scored on the same 40, is **92.5%** forced exact-match (3/40 wrong). Decide with its own reject rule (T=0.75, τ=0.60) fires on **34/40** with **1** error. Production still uses the stock reject arm. Decide is the measured next candidate, not the live path.

## Verified four-arm table

Same frozen 40, four arms, one scoring pass each. Clopper–Pearson 95% two-sided lower bounds:

| Arm | Fire | Correct / fired | Errors | CP 95% LB | Forced EM |
| --- | --- | --- | --- | --- | --- |
| stock forced | 40/40 | 32/40 | 8 | **64.4%** | **80%** |
| Decide forced | 40/40 | 37/40 | 3 | **79.6%** | **92.5%** |
| stock T=4 / τ=0.70 | **18/40 (45%)** | **18/18** | **0** | **81.5%** | 80% |
| Decide T=0.75 / τ=0.60 | **34/40 (85%)** | **33/34** | **1** | **84.7%** | 92.5% |

**Locked reading.** Stock reject reproduces the shipped claim (18/40, 0 errors, ≈82% LB). Decide forced beats stock forced on this catalog (92.5% vs 80% EM; 3 errors vs 8). Decide+reject raises coverage from 45% to 85% at one error (33/34, ≈85% LB). That is a different operating point, not a replacement closeout.

## Why not cut over to Decide tonight (even though coverage looks great)

Your instinct about the *shape* is right: put the same confidence gate on Decide. The reason not to cut over tonight is the **one miss and the protocol**, not a preference for 45% coverage.

**What the four arms actually say.** Decide is the stronger catalog model when it must answer (92.5% vs 80% forced exact-match). Gating Decide is also the right product idea: same reject rule, more fires. On this frozen 40 that gate went **34/40 with 1 wrong tool**. Stock reject went **18/40 with 0 wrong tools**. Those are not the same operating point. You are comparing “speak less, never wrong on the held-out fires” to “speak more, wrong once.”

**Why coverage is not the decision.** Wrong route is the costly event. Abstention is not. Stock reject takes 45% of catalog hits off the frontier path at 0/18 errors. Decide+reject takes 85% off at 1/34 errors. That is **+16 local decisions and +1 misroute** on the same 40. If a bad tool call is worse than an extra frontier call, 0-error at 45% can beat 1-error at 85% until that miss is understood.

**The intervals do not settle it.** Precision lower bounds are ≈82% (18/18) vs ≈85% (33/34). They overlap. Decide+reject is not “more precise.” It is higher coverage with a slightly higher lower bound and a **realized error**. You cannot read 85% coverage as a free upgrade.

**Why `productionTrusted` does not automatically transfer.** That label was earned by stock 2.5: thresholds fit off-set, freeze, score once, 0 errors among fires, remaps fail-closed, frontier agreed on all 40 labels. Decide used different knobs (T=0.75, τ=0.60 vs T=4, τ=0.70). Unless those Decide knobs were fit on the *same* held-out-from-eval set and then frozen before this run, the 34/40 slice is a **candidate result**, not the same closeout. One GHA arm is not a new trusted path.

## What to do instead of swapping (v0.5)

Keep stock reject in production. Treat Decide+reject as **v0.5**, not as a hot-swap:

1. Confirm Decide (T,τ) were fit only on the off-set (if they were tuned on these 40, discard the reject arm and refit).
2. Pull the one miss: input, catalog candidates, scores, chosen tool, GT, whether a remap touched it.
3. Frontier-adjudicate that case (and the 33 fires) under the same rules as v0.4.
4. Decide the production rule *before* looking at a new coverage number — e.g. “ship Decide reject only if errors among fires stay 0 on this 40 after freeze,” or “allow 1 error if the miss is a labeled hard case and fallback would have caught it.”
5. Then score once. If it still has the miss under a predeclared rule, either keep stock or raise Decide’s threshold until fires are 0-error again (coverage will drop toward something between 45% and 85%).

**One sentence for the team.** We *will* put the same confidence gate on Decide — that is the point of v0.5 — but we do not replace a 0-error CPU on-ramp with an 85% gate that already misrouted once on the frozen set just because coverage looks better.

## Audience lines

- **Engineering:** four-arm GHA 36165019073 green; PR #1147. Do not hot-swap weights or thresholds. Confidence-gate Decide as v0.5 after the miss is understood.
- **Product:** users should see fewer frontier routing calls on common tools, same behavior when the gate abstains.
- **Risk:** Decide+reject is +16 fires and +1 error vs stock reject. Coverage is better; the zero-error property is not. Intervals overlap — not “more precise.”
- **Cost:** the live gate still runs on CPU with no GPU required; each fire is a local encoder pass.

## Do not say

- Decide is now productionTrusted.
- Decide is 82% on our catalog.
- 85% coverage with one error is the same claim as 45% coverage with zero errors.
- Stock 80% forced EM is the shipped precision number.
- Higher coverage alone justifies cutting over tonight.

## Closeout sentence (unchanged until Decide earns its own closeout)

Ship stock reject because it is the precision-first CPU on-ramp that takes **45%** of catalog routing off the expensive path with a clean **0-error** held-out fire set.

## v0.5 progress (Decide candidate — not live)

| Step | Status |
| --- | --- |
| Confirm Decide T / prior τ off-set-only | **done** — T=0.75; prior τ=0.60 from fit during four-arm |
| Pull the one miss | **done** — `route-v04-004` (execute GT → Decide chose search @ ≈0.739) |
| Predeclare ship rule | **done** — 0 errors among fires (leave it; favors low coverage) |
| τ=0.80 provenance | **honest** — selected **after** miss known; **v0.4 spent for Decide reject** ([`DECIDE_TAU_080_PROVENANCE.md`](../../../packages/clawql-core/src/classifier/held-out/fixtures/DECIDE_TAU_080_PROVENANCE.md)) |
| 23/40 @ τ=0.80 | **candidate projection on spent set only** — not a closeout |
| Freeze v0.5 | **next** — target **n=70–80**, blind drafter, no search/execute nudge |
| Live path | **still stock** (T=4, τ=0.70) |

**Docs one-liner.** Decide is measured and confidence-gated as a candidate; stock remains the 0-error CPU on-ramp until a frozen v0.5 closeout says otherwise.

Ontology enrichment stays off; temperature softmax stays the calibration that made the reject rule usable — not reopened by the Decide table.

Details: [`V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md`](../../../packages/clawql-core/src/classifier/held-out/fixtures/V05_DECIDE_PRODUCTION_RULE_PREREGISTERED.md) · [`FREEZE-v0.5-routing-fresh.md`](../../../packages/clawql-core/src/classifier/held-out/fixtures/FREEZE-v0.5-routing-fresh.md)

## Related

- Spec: [`fast-decision-primitive-v0.4.md`](./fast-decision-primitive-v0.4.md) §7
- Fit freeze: [`FIT_TAU_FREEZE_v0.1.md`](../../../packages/clawql-core/src/classifier/held-out/fixtures/FIT_TAU_FREEZE_v0.1.md)
- Eval log: [`ONTOLOGY_ENRICHMENT_EVAL_LOG.md`](../../../packages/clawql-core/src/classifier/held-out/fixtures/ONTOLOGY_ENRICHMENT_EVAL_LOG.md)
- Report JSON: [`v0.4-stock-vs-decide-gha-36165019073-report.json`](../../../packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/v0.4-stock-vs-decide-gha-36165019073-report.json)
