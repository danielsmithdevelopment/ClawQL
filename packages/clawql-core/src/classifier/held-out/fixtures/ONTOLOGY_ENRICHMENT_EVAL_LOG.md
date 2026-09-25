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

| Condition                         | Routing accuracy | Routing MCE |
| --------------------------------- | ---------------- | ----------- |
| `CLAWQL_FAST_DECISION_ONTOLOGY=0` | 4/7 = 0.571      | 0.483       |
| ontology on (default)             | 5/7 = 0.714      | 0.383       |

**Net +1 on n=7 is a 14-point swing from one net case.** Flip matrix: **3 gains, 2 regressions, 2 unchanged.** Gains were bash/grep→`mcp.data_query`. Regressions were cases that were **already correct without ontology**.

### Why this is contaminated

The capability fixture, anti-pattern rewrite, and bait-neutralization were authored **while looking at failures on these same Harvey routing cases** (aliases for `tool.bash_*` / `tool.grep_*`, springing-lien / HSR wording). That violates §7 held-out integrity: nothing tuned against the evaluation set counts as held-out lift.

**Allowed reading:** enrichment _can_ change GLiNER scores in the direction of anti-pattern avoidance (contaminated smoke).  
**Forbidden reading:** “ontology enrichment improved held-out routing by 14 points.”

Artifacts: `/opt/cursor/artifacts/ontology-ab-rescore.json`, `classify-payload-*-ontology.json`, `sibling-regression-diagnosis.json`.

---

## Sibling regression diagnosis (before more enrichment)

Both regressions were **correct without ontology**. Do not add more shared ontology text until this is fixed — more shared `whenToUse` will keep trading bait fixes for sibling confusion.

### harvey-012 (`mcp.data_query` → `mcp.memory_recall`)

Without enrichment the labels are distinct:

- `mcp.data_query` → “Structured springing-lien / credit-facility flags in DuckDB”
- `mcp.memory_recall` → “Ontology recall for springing lien / CREDIT_FACILITY”

With enrichment **both** become `STRUCTURED_CORPUS_PREFERRED` plus long shared catalog prose. `memory_recall`'s `whenToUse` literally names `CREDIT_FACILITY` / springing-adjacent flags; `data_query`'s `whenToUse` also names `mentions_springing_lien`. The anti-pattern line says “prefer memory_recall or structured SQL,” which does not prefer SQL over recall. Sibling tools collapse toward one “structured” blob; GLiNER picks recall.

### harvey-008 (`mcp.memory_recall_hsr_filing` → `mcp.memory_recall_second_request_only`)

Without enrichment the disambiguation is in the **candidate-specific** text:

- filing: “Recall matters with HSR filing signals (**not only second request**)”
- second-request-only: “Title flag `HSR_SECOND_REQUEST` — **wrong framing for 'filing' prompts**”

With enrichment **both aliases map to one ontology id** `clawql.memory_recall` and receive the **same** `whenToUse`, which name-drops `HSR_SECOND_REQUEST` first. The sibling distinction is diluted; GLiNER prefers the second-request alias.

**Conclusion:** shared catalog text that aliases many candidates to one capability is the regression mechanism. Fix belongs in per-tool / per-sibling declarations (`distinguishFrom`), not more fixture prose tuned on these cases.

---

## Fresh routing set (requirements — not authored here)

Author **before** further ontology edits. Ontology authors must not write the set.

1. Freeze cases + record content hash before any enrichment change.
2. Several cases per tool family (well past n=7) so one flip is not a 14-point swing.
3. Include sibling pairs on purpose (known failure mode) **and** shell-bait cases.
4. Eval runs must record the ontology digest used (pinned harness).
5. Tag any prior contaminated smokes in this log; never promote them to held-out citations.

---

## Related

- Provenance: `HARVEY_V02_PROVENANCE.md`
- Step-3 catalog ontology: [`docs/specs/classifier/capability-ontology-from-catalog-v0.1.md`](../../../../../../docs/specs/classifier/capability-ontology-from-catalog-v0.1.md)
- Fast Decision §7: [`docs/specs/classifier/fast-decision-primitive-v0.4.md`](../../../../../../docs/specs/classifier/fast-decision-primitive-v0.4.md)
