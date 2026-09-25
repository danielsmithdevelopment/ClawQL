# Ontology enrichment eval log (Fast Decision)

## Contaminated smoke — DO NOT CITE AS HELD-OUT LIFT

| Field       | Value                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| Tag         | **`contaminated-smoke`**                                                                                         |
| Suite       | `fast-decision-held-out-v0.2-harvey` (routing site `search_provider_tool_routing`, n=7)                          |
| Date (UTC)  | 2026-09-25                                                                                                       |
| Branch / PR | `cursor/ontology-enriched-classifier-088d` / [#1146](https://github.com/danielsmithdevelopment/ClawQL/pull/1146) |
| Ontology    | hand fixture `clawql-capability-ontology.json` **v0.2**                                                          |
| Scorer      | live `gliner2` (`fastino/gliner2.5-base-v1`)                                                                     |
| Labels      | live Sonnet 4.6 frontier labels (24 cases; routing subset n=7)                                                   |

### Headline numbers (contaminated)

| Condition    | Routing accuracy | Routing MCE |
| ------------ | ---------------- | ----------- |
| ontology off | 4/7 = 0.571      | 0.483       |
| ontology on  | 5/7 = 0.714      | 0.383       |

**Net +1 on n=7 is a 14-point swing from one net case.** Flip matrix: **3 gains, 2 regressions, 2 unchanged.** Gains were bash/grep→`mcp.data_query`. Regressions were cases that were **already correct without ontology**.

### Why this is contaminated

The capability fixture, anti-pattern rewrite, and bait-neutralization were authored **while looking at failures on these same Harvey routing cases** (aliases for `tool.bash_*` / `tool.grep_*`, springing-lien / HSR wording). That violates §7 held-out integrity: nothing tuned against the evaluation set counts as held-out lift.

**Allowed reading:** enrichment _can_ change GLiNER scores in the direction of anti-pattern avoidance (contaminated smoke).  
**Forbidden reading:** “ontology enrichment improved held-out routing by 14 points.”

Artifacts: `/opt/cursor/artifacts/ontology-ab-rescore.json`, `classify-payload-*-ontology.json`, `sibling-regression-diagnosis.json`.

---

## Sibling regression diagnosis (pre-catalog fix; historical)

Both Harvey regressions were **correct without ontology**. Shared alias paragraphs / `STRUCTURED_CORPUS_PREFERRED` collapsed siblings. Catalog-sourced per-ID enrichment + `distinguishFrom` were specified to close that path. See [`capability-ontology-from-catalog-v0.1.md`](../../../../../../docs/specs/classifier/capability-ontology-from-catalog-v0.1.md).

---

## Fresh routing set (frozen)

| Field                    | Value                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Suite                    | `fast-decision-held-out-v0.3-routing-fresh`                                        |
| Cases                    | 34 (`search_provider_tool_routing`)                                                |
| Suite digest (SHA-256)   | `02aa28eaf9f4d74f41e048c6735484cfab80a57c9c73f5a85402809d57a700aa`                 |
| Catalog digest (SHA-256) | `45a3899ce0b3f6efb3621b47db46daf640843ed7282fc2a372ce425c0e266cbf`                 |
| Frozen at (UTC)          | `2026-09-25T02:48:42Z`                                                             |
| Drafter                  | isolated session `bc-c622daec-7440-5141-950b-6caf06ea173d` (catalog + schema only) |

Provenance: [`FREEZE-v0.3-routing-fresh.md`](./FREEZE-v0.3-routing-fresh.md).

---

## v0.3 clean dual-arm result — NEGATIVE (no evidence of benefit)

| Field                    | Value                                                                           |
| ------------------------ | ------------------------------------------------------------------------------- |
| Tag                      | **`clean-held-out` / `negative`**                                               |
| Suite                    | `fast-decision-held-out-v0.3-routing-fresh` (n=34)                              |
| Process                  | Pre-registered readout → catalog-only overlay → regenerate → both arms one run  |
| Pre-register commit      | before hint overlay (see git history / `V03_DUAL_ARM_READOUT_PREREGISTERED.md`) |
| `ontologyDigest` (arm B) | `bf3e0e038a3f423f753f55375f9aa09179bd64483bf4b3da38797b7c7cd3d4f9`              |
| Scorer                   | live `gliner2` both arms                                                        |
| GT                       | provisional fixture (`adjudicated=false`) — not frontier labels                 |
| Artifact                 | `/opt/cursor/artifacts/v03-dual-arm-readout.json`                               |

### Pre-registered metrics

| Field                | Arm A (off) | Arm B (on) | Δ (B−A) |
| -------------------- | ----------- | ---------- | ------- |
| n                    | 34          | 34         | —       |
| accuracy             | 0.794       | 0.706      | −0.088  |
| MCE                  | 0.391       | 0.375      | −0.015  |
| sibling-pair n / acc | 18 / 0.722  | 18 / 0.722 | 0       |
| shell-bait n / acc   | 9 / 0.778   | 9 / 0.778  | 0       |

Flip matrix: gains=2; regressions=5; unchanged_correct=22; unchanged_incorrect=5. Discordant pairs = 7.

### How to read (locked)

1. **Defensible statement:** no evidence of benefit from ontology enrichment on this clean held-out routing set; point estimate is negative; with only 7 discordant pairs a McNemar-style reading is not significant (p ≈ 0.45). **Not** “enrichment hurts” as a confirmed claim. GT remains provisional.
2. **Target failure modes did not move.** Sibling-pair and shell-bait accuracies were identical in both arms. Enrichment did not fix what it was built to fix.
3. **Calibration is poor in both arms** (MCE ≈ 0.38). Neither arm can gate a fast path. That blocks productionTrusted regardless of enrichment.
4. **Contaminated smoke did not reproduce.** Harvey’s +14-point swing was contamination; the clean v0.3 run did not show benefit. Keep both on the record.

### Consequences

1. **Enrichment default off for routing** — `CLAWQL_FAST_DECISION_ONTOLOGY` must be explicitly `1`/`true`/`on` to enrich; unset/empty = off.
2. **v0.3 is spent for tuning.** Inspecting the 5 regressions for diagnosis is fine; any hint changes after that require a new frozen set (**v0.4**) to evaluate, or it is Harvey-style contamination again.
3. **Question the lever, not only the hint text (hypothesis).** GLiNER matches against label embeddings; long packed label strings may dilute what made labels distinct. Not a finding. Points toward fine-tuning on ClawQL traces (FD §2.7) and temperature calibration more than further label prose.

---

## Overnight calibration — production path (clean)

| Field                    | Value                                                                       |
| ------------------------ | --------------------------------------------------------------------------- |
| Tag                      | **`clean-held-out` / `calibration-pass`**                                   |
| Date (UTC)               | 2026-09-25                                                                  |
| Branch                   | `cursor/fast-decision-calib-overnight-088d`                                 |
| Fit                      | Harvey v0.2 all use sites (n=24) → `temperature_softmax` **T=3**            |
| Eval                     | v0.3 routing-fresh (n=34), enrichment off                                   |
| Baseline (no calib)      | acc 0.794 / MCE 0.391 — fail §7                                             |
| Calibrated               | acc 0.794 / MCE **0.149** — **pass §7 criteria**                            |
| Also tried               | `margin` passes eval but fails Harvey fit (MCE 0.286) — rejected as default |
| Contaminated upper bound | T fit on v0.3 → T≈25 MCE≈0.05 — do not cite                                 |
| Freeze                   | [`CALIBRATION_FREEZE_v0.1.md`](./CALIBRATION_FREEZE_v0.1.md)                |
| Artifact                 | `/opt/cursor/artifacts/overnight-calib/grid-results.json`                   |

### Ship decision

Default calibration **ON** (`temperature_softmax`, T=3). Opt out: `CLAWQL_FAST_DECISION_CALIBRATION=0`. Argmax unchanged. `productionTrusted` still requires live frontier adjudication (JUDGE) on top of this calibrated live `gliner2` path.

### Packing ablation (same night)

| Mode                  | Acc   | MCE   | Pass     |
| --------------------- | ----- | ----- | -------- |
| full (fixture labels) | 0.794 | 0.149 | yes      |
| short (desc≤80)       | 0.794 | 0.149 | yes      |
| id_only               | 0.647 | 0.130 | no (acc) |

No packing change shipped — `id_only` regresses accuracy; short ≡ full on this set.

### Routing threshold (fast-path coverage) — follow-up

See [`ROUTING_THRESHOLD_READOUT_v0.1.md`](./ROUTING_THRESHOLD_READOUT_v0.1.md). Harvey routing n=7 cannot meet precision≥0.9 at any τ after T=3 → no new τ shipped. At builtin τ=0.75 on v0.3: coverage **0.647**, accuracy-among-accepted **0.909** (20/22; ~Wilson 95% CI ~0.72–0.97). Both FPs are specialized→generic search, not sibling collapses. **v0.3 spent for choosing τ** — see [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md).

### Three-set completion + productionTrusted (routing closed)

Fit = spent v0.3 + Harvey routing (n=41) → locked **T=4**, **τ=0.70**. v0.4 scored once then frontier-adjudicated (GHA [36144911649](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36144911649)): live Sonnet + gliner2 → **`productionTrusted=true`** (frontier GT ≡ provisional **40/40**).

**Citable claim (always include n + LB):** on a frozen, catalog-only held-out set of **n=40** routing decisions, calibrated GLiNER fires on **45%** (**nAccepted=18**) with **zero errors among those**; one-sided 95% lower bound on precision ≈ **82%**.

**v0.4 is spent** — do not retune T/τ or hints against it. Next retune starts from a frozen **v0.5**. The same **fit → freeze → score-once → adjudicate** sequence is the template for the other Fast Decision use sites. See [`FIT_TAU_FREEZE_v0.1.md`](./FIT_TAU_FREEZE_v0.1.md), [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md).

### Stock GLiNER 2.5 vs Decide — do not collapse metrics

| Artifact                                | What it is                                                                                                                                                                                                      | What our v0.4 number is **not**                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stock GLiNER 2.5** (small/base/multi) | General boundary-encoder family (extraction + classification). Our live path uses this family (`fastino/gliner2.5-base-v1`) with a **reject rule** (T=4, τ=0.70).                                               | Not Decide. Not a forced-answer leaderboard score.                                                                                              |
| **GLiNER2.5-Decide**                    | Specialist classification checkpoint (~340M DeBERTa-v3-large), fine-tuned from `gliner2-large-v1` for operational decisions. Fastino reports ~60% forced exact-match on Fast Decisions (5,100 ex / 17 domains). | Now measured on our frozen 40 (below). Do **not** write “2.5 already matches Decide” or collapse Decide forced EM with stock reject-rule CP LB. |

**Two different scores.** Fastino’s ~60% is Decide, forced exact-match, always answer. Our productionTrusted result is calibrated stock 2.5 on **n=40** catalog-only routing: fire **18/40**, **0/18** errors, CP 95% LB ≈**82%**. Neither number implies the other. v0.4 is a **policy** result (abstain-capable on-ramp), not a model-vs-Decide leaderboard result.

### Stock vs Decide four-arm — DONE (score-once; does not rewrite closeout)

| Field        | Value                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag          | **`clean-held-out` / `stock-vs-decide-compare`**                                                                                                                                                                    |
| Date (UTC)   | 2026-09-25                                                                                                                                                                                                          |
| GHA          | [36165019073](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36165019073) (tip `53bea37f`)                                                                                                           |
| Workflow     | `fast-decision-stock-vs-decide.yml` + `scripts/compare-stock-vs-decide-v04.mts`                                                                                                                                     |
| Labels       | frontier-adjudicated `v0.4-routing-fresh-gha-36144911649-labels.json`                                                                                                                                               |
| Fit (Decide) | same off-set `fast-decision-fit-routing-v0.1` → Decide **T=0.75**, **τ=0.60** (stock T/τ stay locked at 4 / 0.70)                                                                                                   |
| Artifact     | [`frontier-runs/v0.4-stock-vs-decide-gha-36165019073-report.json`](./frontier-runs/v0.4-stock-vs-decide-gha-36165019073-report.json)                                                                                |
| Public docs  | [`docs/specs/classifier/fast-decision-routing-closeout-v0.4.md`](../../../../../../docs/specs/classifier/fast-decision-routing-closeout-v0.4.md) → [docs.clawql.com](https://docs.clawql.com/specs/classifier/fast-decision-routing-closeout) |

Clopper–Pearson 95% two-sided lower bounds verified against the table:

| Arm                  | Model               | Calibration    | Fire            | Errors | Prec among fired | CP 95% LB | Forced EM |
| -------------------- | ------------------- | -------------- | --------------- | ------ | ---------------- | --------- | --------- |
| `stock_forced`       | `gliner2.5-base-v1` | none           | 40/40 (100%)    | 8      | 80.0%            | **64.4%** | **80.0%** |
| `decide_forced`      | `GLiNER2.5-Decide`  | none           | 40/40 (100%)    | 3      | 92.5%            | **79.6%** | **92.5%** |
| `stock_locked_T_tau` | `gliner2.5-base-v1` | T=4, τ=0.70    | **18/40 (45%)** | **0**  | **100%** (18/18) | **81.5%** | 80.0%     |
| `decide_refit_T_tau` | `GLiNER2.5-Decide`  | T=0.75, τ=0.60 | **34/40 (85%)** | **1**  | 97.1% (33/34)    | **84.7%** | 92.5%     |

**What is now measured.** Same frozen 40, four arms, one scoring pass each. Stock reject reproduces the shipped claim (18/40, 0 errors, ≈82% LB). Decide forced beats stock forced on this catalog (92.5% vs 80% EM; 3 errors vs 8). Decide+reject raises coverage from 45% to 85% at one error (33/34, ≈85% LB). That is a different operating point, not a replacement closeout.

**Why not cut over to Decide tonight (shape is right; timing is not).** The instinct to put the *same* confidence gate on Decide is correct — that is v0.5. The reason not to swap tonight is the **one miss and the protocol**, not a preference for 45% coverage.

- **Arms are different operating points.** Stock reject: speak less, never wrong on held-out fires (18/40, 0 errors). Decide+reject: speak more, wrong once (34/40, 1 error).
- **Coverage is not the decision.** Wrong route is costly; abstention is not. +16 local decisions and +1 misroute on the same 40. If a bad tool call is worse than an extra frontier call, 0-error at 45% can beat 1-error at 85% until that miss is understood.
- **Intervals do not settle it.** CP LBs ≈82% (18/18) vs ≈85% (33/34) overlap. Decide+reject is not “more precise” — higher coverage, slightly higher LB, and a realized error. 85% coverage is not a free upgrade.
- **`productionTrusted` does not transfer.** Stock earned it (off-set fit → freeze → score once → 0 errors among fires → fail-closed remaps → frontier 40/40). Decide used different knobs (T=0.75, τ=0.60). One GHA arm is a candidate result, not a new trusted path.

**v0.5 instead of a hot-swap.** Keep stock reject live. Then: (1) confirm Decide (T,τ) fit only on the off-set; (2) pull the one miss (input, candidates, scores, chosen tool, GT, remap?); (3) frontier-adjudicate the 34 fires under v0.4 rules; (4) predeclare the production rule before chasing coverage (e.g. ship Decide reject only if errors among fires stay 0, or allow 1 if labeled hard + fallback would have caught it); (5) score once — if the miss remains, keep stock or raise Decide’s τ until fires are 0-error again (coverage will land between 45% and 85%).

**Team sentence.** We *will* put the same confidence gate on Decide — that is the point of v0.5 — but we do not replace a 0-error CPU on-ramp with an 85% gate that already misrouted once on the frozen set just because coverage looks better.

**Locked reading**

1. Stock reject arm = productionTrusted claim (unchanged).
2. Decide forced >> stock forced on this catalog — forced-answer gap, not an 82% reject-rule inheritance.
3. Decide+reject is +16 fires and +1 error vs stock reject. Coverage is better; the zero-error property is not.
4. Honesty: v0.4 remains spent for stock T/τ. Decide (T,τ) fit only on the shared off-set; applied once to frozen v0.4. Quote \(n_{\text{fired}}\) + CP LB whenever citing precision among fired.

**Audience lines (add to docs.clawql.com)**

- _Engineering:_ four-arm GHA 36165019073 green; PR #1147. Do not hot-swap weights or thresholds. Confidence-gate Decide as v0.5 after the miss is understood.
- _Product:_ users should see fewer frontier routing calls on common tools, same behavior when the gate abstains.
- _Risk:_ Decide+reject is +16 fires and +1 error vs stock reject. Coverage is better; the zero-error property is not. Intervals overlap — not “more precise.”
- _Cost:_ the live gate still runs on CPU with no GPU required; each fire is a local encoder pass.

**Do not say.** Decide is now productionTrusted. Decide is 82% on our catalog. 85% coverage with one error is the same claim as 45% coverage with zero errors. Stock 80% forced EM is the shipped precision number. Higher coverage alone justifies cutting over tonight.

**Next.** v0.5 checklist above. Until that lands, the closeout sentence stays: ship stock reject because it is the precision-first CPU on-ramp that takes 45% of catalog routing off the expensive path with a clean 0-error held-out fire set.

### Why ship the 45% gate now (canonical narrative)

**Canonical line.** We should ship it because it is a precision-first on-ramp that safely takes nearly half of catalog routing off the expensive path — with a clean held-out chain, fail-closed remaps, and a known abstain fallback — not because GLiNER solves routing.

**What you are deploying.** A first-pass filter on stock GLiNER 2.5, not a full router. Calibrated 2.5 may answer **45%** of catalog routing cases and must abstain on the rest. On the 18 held-out fires it matched frontier GT every time. Quote precision as **18/18 on (n=40)**, 95% CP lower bound ≈**82%** (exact two-sided LB **81.5%**) — not 100%. The other **55%** stays on the path you already trust.

**Why this is the right shape.** Wrong route is expensive. Abstention is cheap when fallback exists. Decide’s forced exact-match on this catalog is **92.5%** (measured); Fastino’s ~60% marketing figure is a different product shape (always answer). You only let the classifier speak after (T,τ) were fit on a separate set, the catalog eval was frozen, scoring was one pass, and remaps that change the counted tool fail the run.

**Why 45% is enough to include.** Coverage is traffic taken off the expensive path, not a grade. High-confidence catalog hits cut frontier cost, latency, and egress now. Waiting for 90% coverage usually means 100% of traffic stays on fallback.

**Audience lines.**

- _Engineering:_ reject rule in front of the catalog; easy 45% local; misses → existing path; 0/18 wrong-tool on held-out fires; quote the 82% lower bound; tool-changing remaps fail the run; four-arm GHA green — do not hot-swap to Decide.
- _Product:_ not a new brain — fewer frontier routing calls on common tools; same behavior when the gate abstains.
- _Risk:_ high-precision on-ramp, not a router replacement; Decide+reject trades +16 fires for +1 error — do not treat that as the same claim.
- _Cost:_ live gate is CPU-only; each fire is a local encoder pass instead of a frontier routing call.

**Do not say.** Decide is now productionTrusted. Decide is 82% on our catalog. 85% coverage with one error is the same claim as 45% coverage with zero errors. Stock 80% forced EM is the shipped precision number. Precision is 100% without (n=18) and the ~82% bound.

Public copy: [`fast-decision-routing-closeout-v0.4.md`](../../../../../../docs/specs/classifier/fast-decision-routing-closeout-v0.4.md). Also in [`FIT_TAU_FREEZE_v0.1.md`](./FIT_TAU_FREEZE_v0.1.md).

### Judge sidecar remap policy (current protocol property)

Cosmetic-only (`quote`/`case` → allowlisted id): logged `before→after` in the run summary (`candidateIdRemaps`). Semantic remaps (label→id / suffix) that change which tool counts as the model’s answer **fail the run** — never counted. This is a **property of the current protocol**, not a follow-up.

---

## Related

- Contaminated smoke vs clean negative: this file (both sections)
- Calibration freeze: [`CALIBRATION_FREEZE_v0.1.md`](./CALIBRATION_FREEZE_v0.1.md)
- Pre-registered readout: [`V03_DUAL_ARM_READOUT_PREREGISTERED.md`](./V03_DUAL_ARM_READOUT_PREREGISTERED.md)
- Freeze: [`FREEZE-v0.3-routing-fresh.md`](./FREEZE-v0.3-routing-fresh.md)
- Catalog ontology spec: [`docs/specs/classifier/capability-ontology-from-catalog-v0.1.md`](../../../../../../docs/specs/classifier/capability-ontology-from-catalog-v0.1.md)
- Fast Decision §7: [`docs/specs/classifier/fast-decision-primitive-v0.4.md`](../../../../../../docs/specs/classifier/fast-decision-primitive-v0.4.md)
- Public closeout: [`docs/specs/classifier/fast-decision-routing-closeout-v0.4.md`](../../../../../../docs/specs/classifier/fast-decision-routing-closeout-v0.4.md)
