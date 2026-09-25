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

---

## Related

- Contaminated smoke vs clean negative: this file (both sections)
- Calibration freeze: [`CALIBRATION_FREEZE_v0.1.md`](./CALIBRATION_FREEZE_v0.1.md)
- Pre-registered readout: [`V03_DUAL_ARM_READOUT_PREREGISTERED.md`](./V03_DUAL_ARM_READOUT_PREREGISTERED.md)
- Freeze: [`FREEZE-v0.3-routing-fresh.md`](./FREEZE-v0.3-routing-fresh.md)
- Catalog ontology spec: [`docs/specs/classifier/capability-ontology-from-catalog-v0.1.md`](../../../../../../docs/specs/classifier/capability-ontology-from-catalog-v0.1.md)
- Fast Decision §7: [`docs/specs/classifier/fast-decision-primitive-v0.4.md`](../../../../../../docs/specs/classifier/fast-decision-primitive-v0.4.md)
