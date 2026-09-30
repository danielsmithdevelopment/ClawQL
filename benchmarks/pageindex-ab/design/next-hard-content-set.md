# Next hard content set (after saturation)

**Status:** current hard-candidate **content** keys are too easy (high question↔gold overlap)  
**Evidence:** [`content-question-overlap.md`](content-question-overlap.md), [`recall-by-question-class.md`](recall-by-question-class.md)

## Diagnosis

- Content R@3 = R@10 = R@20 = **1.0** — no headroom for MaxP / k / rerank.
- Mean question↔gold token overlap ≈ **0.72** (exclusive-to-gold ≈ **0.49**). The builder copies section wording into questions; keyword retrieval is near-trivial.
- More keys from the same templates will saturate the same way.

## Order of work (do not reverse)

1. **External benchmarks first** — questions were not built around any one ClawQL retriever; keys are validated; scores are public.
   - **EnterpriseRAG-Bench** — closest to ClawQL document recall / enterprise pitch; decide MaxP, reranking, and k here. Harness: [`benchmarks/enterpriserag-bench/`](../../enterpriserag-bench/design/README.md) (Confluence + Google Drive slice; hard = semantic+intra_doc, no-harm = basic).
   - **LongMemEval-S** — conversation memory / vault side.
2. **Homegrown paraphrases only as backstop** — another human validation pass; do not lead with them.

## Hard + no-harm gate (method-independent)

`hard_content_key_gate.py` (v2) classifies content keys by **question↔gold word overlap**, not keyword rank:

| Cohort | Rule | Role |
| ------ | ---- | ---- |
| **hard** | `overlap_gold < 0.3` | Difficulty shared across methods (not keyword’s own misses) |
| **no_harm** | `overlap_gold ≥ 0.6` | Easy keys; MaxP/rerank must not regress these (Vectify-style) |
| mid | between bands | Neither cohort |

**Do not** accept keys because keyword ranks gold below 10 — that set is keyword’s failures, so vector/MaxP win by construction (same regression-to-the-mean trap as the 12 deep misses).

**Decision rule:** MaxP / rerank / k wins only if **hard improves AND no-harm passes**. Hard-only lifts do not count.

Outputs: [`hard-content-key-gate.json`](hard-content-key-gate.json), [`maxp-hard-and-no-harm-cohorts.json`](maxp-hard-and-no-harm-cohorts.json).

**Current candidate snapshot (v2 gate on `rerank-candidates.jsonl`):** n_content=100 → **6 hard** / **68 no-harm** / 26 mid. Builder paraphrases (q09/q10) did **not** clear overlap &lt; 0.3 — the builder cannot produce a usable hard set today.

**Do not read the 6 hard keys as retrieval difficulty.** All six are one template (`hc-wk-*-q06`, misleading-heading) on one doc type. Growing that pattern would still measure a single question shape, not hard content retrieval in general. Leave MaxP until **EnterpriseRAG-Bench**.

## Retired: depth / position templates

Evidence headers (`§{n}` + percent through document) made depth questions answerable, but users rarely ask where a heading sits. The builder no longer emits `depth_position_template` keys; detectors in `question_templates.py` remain for legacy rows only.

## Backstop builder tips (after external benches)

1. **Isolate the paraphraser from gold wording.** If the generator sees the full section text, it copies tokens and fails the overlap gate. Feed only a short section summary, or topic + answer; never the raw gold body. Check answerability against the full section afterward (model or human), then run `hard_content_key_gate.py`.
2. Cross-section questions whose answer needs two sections.
3. Call-store mining — scrubbed real `memory_recall` queries with labeled golds.
4. Always pair accepted hard keys with a no-harm cohort; hard-only lifts do not count.

Until EnterpriseRAG-Bench (or a real multi-template hard + no-harm set) exists, **do not** use content accuracy on the soft set to judge MaxP.

## Product evidence headers (shipped)

- Code: `// file: path` (regression in `format_section_evidence.test.mjs` + `read-around.test.ts`).
- Docs (`read_around` + eval harness): `### {doc} · §{n} · {heading} · ~{pct}% through document`.
