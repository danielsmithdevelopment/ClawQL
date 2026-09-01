---
canonical: https://pragmaticvectors.com/posts/extractbench-long-documents/
meta-description: ExtractBench shows VLMs silently truncate long enterprise documents. ClawQL's IDP pipeline — pdf-inspector routing plus Docling structural extraction — is built to hold recall past 50 pages.
status: draft
---

Architecture · August 2026

# Long Documents Don't Need Bigger Context Windows

[Daniel Smith](https://pragmaticvectors.com/about) · [@danielsmithdev](https://x.com/danielsmithdev) · [ClawQL](https://clawql.com)

LlamaIndex's ExtractBench measured what practitioners already feel: on documents longer than fifty pages, commercial vision-language models keep high precision while **recall collapses**. The content is not "hallucinated wrong." It is silently dropped. That is the same confident incompleteness pattern we see in firm-knowledge agents — different domain, same root cause.

- [Benchmarks](https://pragmaticvectors.com/tags/benchmarks)
- [IDP](https://pragmaticvectors.com/tags/idp)
- [Document AI](https://pragmaticvectors.com/tags/document-ai)
- [Agents](https://pragmaticvectors.com/tags/agents)

---

## The failure mode is truncation, not stupidity

ExtractBench is deterministic. No LLM judge. Schema-guided extraction, exact match after normalization, three metrics: unified value F1, word-level grounding F1, page-level grounding F1.

The long-document story from the public leaderboard is stark:

| System                    | Short F1 |   Long F1 |
| ------------------------- | -------: | --------: |
| LlamaExtract Agentic Plus |    96.56 |     94.41 |
| Reducto Deep Extract      |    94.20 |     92.01 |
| Codex (GPT-5.5)           |    95.68 |     78.88 |
| Qwen3.6 35B               |    93.11 | **26.75** |
| Gemini 3.5 Flash          |    87.87 | **27.90** |

Specialized extraction pipelines hold. General VLMs and cheap flash models do not. Precision often stays respectable while recall falls off a cliff — classic silent list truncation on holdings tables, claim schedules, and multi-page repeated structures (ExtractBench challenge **T1**).

If you only remember one sentence:

> Longer context windows do not fix a pipeline that still tries to "see" a 200-page filing as one attention problem.

---

## What ClawQL's IDP path does differently

ClawQL does not ask a VLM to ingest every page image and emit a giant JSON blob in one shot. The ExtractBench integration routes structurally:

```text
PDF
  → inspect_pdf (TextBased vs Scanned/Mixed)
  → TextBased: local Markdown
  → Scanned/Complex: Docling layout + tables
  → schema map (Qwen over extracted text, or structural-only)
  → schema-valid JSON (+ page evidence when available)
```

Docling processes page by page, table by table. There is no attention window that quietly drops rows 80–400 of a holdings list. The schema-mapping step still has to **preserve** those rows — which is why the ClawQL provider chunks long extracted text and merges array fields instead of truncating at the first context budget.

That is the bet we are measuring:

**Raw Qwen3.6 35B oneshot (leaderboard ~87 overall / ~27 long)**  
vs  
**Same model family as a schema mapper on top of ClawQL IDP extraction.**

If the pipeline adds value, overall F1 rises and — more importantly — long F1 stops looking like a flash-model collapse.

---

## Cost is part of the claim

ExtractBench already shows that expensive frontier coding agents do not dominate. LlamaExtract Cost-Effective sits near **86.8 overall at $1/page**. Opus-class agent loops are multi-dollar-per-page territory on a 4,869-page corpus.

ClawQL's intended entry uses self-hosted Qwen for schema mapping. Token cost is infrastructure, not a metered API. The publishable bar we are holding ourselves to:

1. Beat raw Qwen overall F1 (pipeline value)
2. Long F1 above 80 (collapse addressed)
3. Cost/page at or under $1
4. Two reproducible runs

Scores land in [`docs/benchmarks/extractbench-clawql-results.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/benchmarks/extractbench-clawql-results.md) once the short split clears the gate. Until then this essay is architecture, not a victory lap.

---

## Why this pairs with Harvey LAB

Harvey LAB tests institutional knowledge retrieval under enumeration constraints. ExtractBench tests schema-guided extraction under long-document completeness constraints. Together they cover two of ClawQL's three enterprise surfaces: firm knowledge and document IDP. Neither blocks the other — and ExtractBench does not depend on third-party LLM rate limits for scoring.

Same product thesis in both places: **do not pretend a general model session is a complete system.** Route, extract structurally, constrain outputs, measure with deterministic graders.

---

## What we will publish next

When the ledger has real numbers:

- Per-split F1 and cost/page for `clawql_idp_qwen_extract`
- Ablation vs `clawql_idp_docling_extract` (structural-only)
- Head-to-head delta vs the raw Qwen oneshot pipeline
- Grounding F1 if Docling/page markers produce usable citations (most systems score 0.00 on word grounding)

Until then: the integration lives at [`integrations/extractbench/`](https://github.com/danielsmithdevelopment/ClawQL/tree/main/integrations/extractbench). The benchmark is public. The failure mode is public. The remaining work is to run it honestly — short split first, full corpus only when the cost curve still makes sense.

---

_Draft for pragmaticvectors.com · update with measured ExtractBench scores before publish._
