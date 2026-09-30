# Next hard content set (after saturation)

**Status:** current hard-candidate **content** keys are too easy for keyword search  
**Evidence:** [`content-question-overlap.md`](content-question-overlap.md), [`recall-by-question-class.md`](recall-by-question-class.md)

## Diagnosis

- Content R@3 = R@10 = R@20 = **1.0** — no headroom for MaxP / k / rerank.
- Mean question↔gold token overlap ≈ **0.72** (exclusive-to-gold ≈ **0.49**). The builder copies section wording into questions; keyword retrieval is near-trivial.
- More keys from the same templates will saturate the same way.

## Build hard keys on purpose

1. **Paraphrase gate** — `hard_content_key_gate.py`: accept a key only if keyword IDF ranks its gold **> 10**. Difficulty is a property of the key.
2. **Cross-section** — questions whose answer needs two sections combined (not “% depth” structure).
3. **Call-store mining** — sample real `memory_recall` queries, scrub PII, label golds. Real vocab mismatch.

Until those land, **do not** use content accuracy on this set to judge MaxP.

## Or use external hard benchmarks

| Suite | Why |
| ----- | --- |
| **EnterpriseRAG-Bench** | Hard enterprise content Qs, larger corpora, published scores |
| **LongMemEval-S** | Long-context memory; industry comparison path already noted in eval spec |

Run MaxP / rerank / k on data with headroom; same runs give the industry comparison the A/B was meant to feed ([`pageindex-ab-eval-spec-v0.1.md`](../../../docs/benchmarks/pageindex-ab-eval-spec-v0.1.md) § industry).

## Product evidence headers (shipped)

- Code: `// file: path` (regression in `format_section_evidence.test.mjs` + `read-around.test.ts`).
- Docs (`read_around` + eval harness): `### {doc} · §{n} · {heading} · ~{pct}% through document`.
- Enables the deferred structural/depth track without waiting on corpus rewrite.
