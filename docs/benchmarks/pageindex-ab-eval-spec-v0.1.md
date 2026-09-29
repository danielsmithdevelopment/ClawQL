---
title: "PageIndex A/B: Does It Earn Its Place?"
status: "spec-frozen-pending-corpus"
version: "0.1"
date: "2026-09-28"
author: "@Daniel"
tag: "pageindex-ab-v1"
---

# PageIndex A/B: Does It Earn Its Place? (Eval Spec v0.1)

Sep 28, 2026 · @Daniel

Harness scaffold: [`benchmarks/pageindex-ab/`](../../benchmarks/pageindex-ab/). Related WINs that this eval **supersedes for product decisions**: `pageindex-section-qa`, `hybrid-recall-source-pin`, `memory-recall-pageindex-pin` (retired tooling proofs, not retrieval superiority).

## The question and the decision

PageIndex has never been shown to beat a simpler way of finding things in a long document. This test answers one question: **on long-document questions, does PageIndex give better answers, cheaper answers, or neither, compared with vector recall, plain full-text search, and just reading the document?**

What we have today does not answer it:

- **OpenBench `pageindex-section-qa` (August 2026): on 1.0, off 0.0.** The grader required real ClawQL tool-call evidence in both arms, so the off arm, which had no PageIndex tools, could not score by design. Most cells were a single trial. This proves the tools work end to end, not that they help.
- **ExtractBench (August 19): PageIndex never ran.** The pipeline sent Docling text through chunked Qwen, 120 LLM calls for one 10-page document. The 70.5% score measures that path. Wiring PageIndex in was proposed; no later run used it.
- **Everything else is design description**: layer 3 of the memory-stack post and the `clawql-memory` docs.

The result feeds one decision about the `pageindex_*` tools, which have shipped since 7.0.0 and appear in the MCP catalog:

1. **Default route.** PageIndex becomes the first retrieval hop for long documents in `memory_recall` and the IDP locate step.
2. **Specialist tool.** It stays available for the question types where it wins, off the default path.
3. **Demote.** It leaves the default catalog and becomes internal-only, which also settles the September 23 note that `pageindex_*` internals were visible to demo prospects.

## Arms

Six arms share one model, one harness and one budget, and every arm has a real way to find the answer, so any arm can win. The August flaw, an off arm with no retrieval at all, cannot recur.

| Arm                                             | What the model gets                                                                                                                   | What it tells us                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **A. PageIndex**                                | `pageindex_traverse`, `pageindex_get_content`, `pageindex_synthesize` over a tree built once per document with `pageindex_build_tree` | Does heading-tree navigation find the right section?        |
| **B. Vector recall**                            | `memory_recall` with `sources: ["vector"]`, plus a read-around tool that returns the section a chunk sits in                          | Does semantic chunk search do as well?                      |
| **C. Full-text search**                         | `memory_recall` with `sources: ["vault"]` (keyword), plus the same read-around tool                                                   | Is the simplest competent baseline enough?                  |
| **C+. Grep baseline** _(optional, recommended)_ | Harness-local `grep` + `read_range` over the shared Markdown                                                                          | Stronger simple baseline if vault TF scoring looks too weak |
| **D. Whole document**                           | The full document in context, no tools; only documents that fit with 30% headroom                                                     | The accuracy ceiling, and what skipping retrieval costs     |
| **E. Hybrid with PageIndex**                    | `memory_recall` with `sources: ["vault", "vector", "pageindex"]` (explicit; see open-question resolution)                             | Whether hybrid-including-PageIndex wins                     |
| **E−. Hybrid minus PageIndex**                  | `memory_recall` with `sources: ["vault", "vector"]`                                                                                   | Whether PageIndex adds anything inside hybrid recall        |

A against B and C answers "is PageIndex a better retriever?" E against E− answers "should it stay in the default route?" D bounds both.

Held constant across arms:

- **Model:** `openrouter/deepseek/deepseek-chat`, pinned to one version, as in the August OpenBench runs. A second pass on a subset uses a frontier model, so the result isn't specific to a frugal model.
- **Harness:** OpenCode → `clawql-inference`, one system prompt that differs only in the tool list.
- **Budget per question:** 12 tool calls, 8,000 retrieved tokens, 180 s. Arm D is exempt from the retrieval cap by definition; its tokens are reported, not capped.
- **Text:** one Docling conversion per document, one Markdown file, one set of section IDs, used by every arm.
- **Setup cost:** tree builds and embeddings happen once per document and are reported separately, not charged per question.

### Arm conformance (allowed tools)

| Arm | Allowed tools                                                                                                                   | Forbidden                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A   | `pageindex_traverse`, `pageindex_get_content`, `pageindex_synthesize` (tree pre-built)                                          | `memory_recall`, other `pageindex_*` at query time except listed |
| B   | `memory_recall` (`sources: ["vector"]` only), `read_around`                                                                     | `pageindex_*`, vault source                                      |
| C   | `memory_recall` (`sources: ["vault"]` only), `read_around`                                                                      | `pageindex_*`, vector source                                     |
| C+  | `grep`, `read_range`                                                                                                            | MCP recall / pageindex                                           |
| D   | none                                                                                                                            | any retrieval tool                                               |
| E   | `memory_recall` (`sources: ["vault","vector","pageindex"]`), optional `pageindex_*` follow-ups from recall hints, `read_around` | other sources                                                    |
| E−  | `memory_recall` (`sources: ["vault","vector"]`), `read_around`                                                                  | `pageindex` source / `pageindex_*`                               |

A violation voids and reruns the cell rather than scoring it zero.

## Corpus and questions

24 long documents and 192 questions, balanced so no arm gets only its home turf. PageIndex navigates by headings, so document structure is the variable most likely to decide the result, and the corpus spans it on purpose.

**Documents: 8 per structure stratum, 20K to 150K tokens each.**

| Stratum               | Examples (public sources)                                                                     | Why it's here                                                 |
| --------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Well-structured**   | SEC 10-K filings, IETF RFCs, agency rulebooks                                                 | PageIndex's home turf: deep, accurate heading trees           |
| **Converted PDFs**    | Credit agreements and contracts from EDGAR exhibits, regulatory guidance, run through Docling | The real IDP path: headings exist but conversion is imperfect |
| **Weakly structured** | Hearing transcripts, long email threads, OCR'd scans with flat or wrong headings              | Where a heading tree should struggle                          |

About a third of the documents fit the model's context with headroom, so Arm D has enough cases to set a ceiling. Harvey LAB and ExtractBench documents are excluded, so those benchmarks stay clean.

**Questions: 8 per document, 32 of each type.**

1. **Section lookup:** the answer sits in one section whose heading matches the question.
2. **Buried detail:** the answer is in a table, footnote or schedule inside a section.
3. **Cross-section:** the answer needs two or more sections combined.
4. **Misleading heading:** the answer sits under a heading that shares no words with the question. This is the case that should hurt PageIndex most.
5. **Exact term:** a defined term, ID or figure that keyword search should nail.
6. **Not in the document:** the correct answer is to say it isn't there. This catches arms that guess.

**Answer keys.** Each question gets a short normalized answer, accepted variants, and the gold section IDs that contain the evidence. Writers see only the document text, never a PageIndex tree or any arm's output. A second annotator checks every key, and disagreements go to frontier adjudication before the freeze.

**Freeze and spend.** The manifest records a SHA-256 for every document, the question file and the harness commit, tagged `pageindex-ab-v1`. It is scored once. After that it is spent: any tuning prompted by the results needs a fresh v2 set.

## Harness and grading

The test runs as suite `pageindex-ab` (scaffold under [`benchmarks/pageindex-ab/`](../../benchmarks/pageindex-ab/); OpenBench task wrappers land when the corpus freezes), on GitHub Actions like the August runs, with one matrix cell per arm, question and trial. **Graders score the answer and its citations, never which tools were used.** That is the fix for the August result.

**Answer contract.** Every arm ends with the same JSON:

```json
{"answer": "…", "sections": ["<section id>", …], "not_found": false}
```

Section IDs come from the shared Docling conversion, so every arm can cite the same way. Schema: [`benchmarks/pageindex-ab/schema/answer-contract.schema.json`](../../benchmarks/pageindex-ab/schema/answer-contract.schema.json).

**Grading, in two tiers.**

1. **Deterministic (tier 1).** Normalized exact match for exact-term and numeric answers, set overlap between cited and gold section IDs, and a correct `not_found` for unanswerable questions. Script: `scripts/grade_tier1.py`.
2. **Semantic (tier 2).** A frontier judge scores free-text answers as correct, partial or wrong against the key. It sees the question, the key and the answer, with arm names and tool traces stripped.

**Adjudication.** When the tiers disagree or the judge is unsure, a second frontier judge (different model family) rules. A person reviews what they still disagree on. A blind human re-grade of 10% of cells reports judge agreement alongside the results.

**Infrastructure failures.** Timeouts and runner hangs are logged as noise and rerun, not scored as failures. If more than 5% of one arm's cells fail on infrastructure, scoring waits until that's fixed.

**Traces.** Every cell writes its tool calls, tokens and latency to the call store as an OpenBenchTrace, so any result can be traced back to exactly what the model did. Multi-arm labeling must use `arm_label` (OpenBench trace `arm` enum remains binary `on`/`off` until a schema bump).

## Metrics

**Strict accuracy is the one primary metric; everything else explains it or prices it.** Choosing it now means the decision can't be re-argued around whichever number looks best afterward.

| Metric                        | Definition                                                                                               | Role                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Strict accuracy**           | Share of questions graded fully correct, with `not_found` counted correct only on unanswerable questions | Primary; the decision rules use this                 |
| Partial credit                | Correct = 1, partial = 0.5                                                                               | Reported, not decisive                               |
| Citation precision and recall | Cited section IDs against gold section IDs                                                               | Shows whether an arm found the evidence or got lucky |
| Abstention                    | Correct `not_found` on unanswerable questions; false `not_found` on answerable ones                      | Catches guessing, and catches refusing too easily    |
| Tokens per question           | Input, output and retrieved tokens, priced at the pinned model's list price                              | The cost side of the trade                           |
| Tool calls per question       | Count of retrieval calls                                                                                 | Efficiency, and agent loop risk                      |
| Latency                       | p50 and p95 wall-clock seconds per question                                                              | What users feel                                      |
| Setup cost                    | Tree build and embedding time and tokens, once per document                                              | Separates index cost from query cost                 |

Every metric is reported three ways: overall, by structure stratum, and by question type. The strata and types are where a specialist result, the second decision outcome, would show up.

## Statistics

**192 paired questions with 3 trials each can reliably detect an accuracy difference of about 8 points.** A smaller real difference will usually read as "no clear difference", which is itself an answer: extra machinery that can't show an 8-point gain has to earn its place on cost instead.

- **Paired design.** Every arm answers the same questions, so each question is its own control. The unit of analysis is the question, scored as the mean of its 3 trials.
- **Three confirmatory comparisons, fixed now:** A vs B, A vs C, and E vs E−, Holm-corrected at α = 0.05. Everything else is exploratory, reported with intervals but never used for the decision.
- **Intervals.** A paired bootstrap over questions, 10,000 resamples, for each accuracy difference. McNemar on per-question majority votes as a cross-check. Clopper–Pearson bounds for single-arm rates, as in the classifier evals. Scripts: `scripts/bootstrap_paired.py`, `scripts/mcnemar_paired.py`.

| True accuracy gain | Power at 3 trials per question |
| ------------------ | ------------------------------ |
| 5 points           | 0.36                           |
| 8 points           | 0.80                           |
| 10 points          | 0.93                           |
| 12 points          | 0.99                           |

These powers come from a simulation that assumes a spread of question difficulty; the real spread will move them somewhat. With single trials, the standard McNemar formula needs a 10–13 point gain for 80% power, which is why each question runs three times.

**Subgroups are underpowered on purpose.** Each structure stratum holds 64 questions, enough to detect only roughly 14-point differences. A stratum result can justify the specialist outcome as a hypothesis, but it needs its own fresh confirmatory set before it changes the product.

**Frontier-model subset.** 64 questions, stratified across strata and types, 1 trial, all arms. It checks that the direction holds on a stronger model; it is not powered for significance.

## Decision rules

The result maps mechanically to one outcome, checked top to bottom. The first whose conditions all hold wins, and these rules are frozen with the question set.

| Outcome                | Every condition must hold                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Default route**   | E beats E− on strict accuracy, with the Holm-adjusted interval excluding zero. A is no more than 3 points below B or C. E costs no more than 1.25× E−'s tokens per question.                                |
| **2. Specialist tool** | Outcome 1 fails, and either: A beats both B and C by at least 8 points in one stratum or question type, confirmed later on a fresh set; or A is within 3 points of the best of B and C at 30% fewer tokens. |
| **3. Demote**          | Neither holds. `pageindex_*` leaves the default catalog and becomes internal-only.                                                                                                                          |

**The 3-point margin is a screen, not a proof.** With an 8-point detectable difference, the test can't show two arms are equal within 3 points. It can only refuse to reward an arm that looks worse.

**Two findings get reported whichever outcome wins.**

- **If Arm D beats every retrieval arm by 10 or more points** on documents that fit in context, the router should skip retrieval for documents that fit. That is a routing change independent of PageIndex.
- **If any arm answers more than 10% of the unanswerable questions** instead of returning `not_found`, it's flagged as a hallucination risk whatever its accuracy.

## Contamination and gating controls

The same rules that kept the classifier evals honest apply here, plus one for this test: **we built PageIndex, so it gets no more tuning attention than the arms it competes with.**

- **Freeze before hints.** Documents, questions, keys and decision rules are frozen and hashed before any arm's prompt or tool settings are tuned. Question writers never see arm outputs.
- **A separate pilot set.** Three documents and 20 questions for harness debugging, tagged `contaminated-smoke` and never cited, like the n=7 Harvey routing A/B.
- **Equal tuning budget.** Each arm gets the same number of pilot iterations to tune its prompt and parameters, including PageIndex's traversal token budget. Tuning after the scored run needs a v2 set.
- **Score once.** The frozen set is run and scored once, then marked spent.
- **Read-only harness.** Whoever tunes the arms cannot write to the grader or harness, and the harness commit is pinned in the manifest.
- **Implausible results get audited first.** Any arm scoring above 0.98 or below 0.02, or any gap over 40 points, is audited by hand before it's reported.
- **Pinned model.** If the provider updates the model mid-run, every arm is rerun together, never mixed across versions.
- **Predictions on record.** Before scoring, write down which outcome you expect and why, so the result can surprise us.

## Run plan and budget

**About 8 working days of human+agent effort and roughly $120 of compute; the long pole is writing questions, not running them.**

1. **Corpus (1 day).** Pick the 24 documents, convert them with Docling, spot-check headings, and hash them.
2. **Questions and keys (2–3 days).** Write the 192 questions and keys, run the second-annotator pass, adjudicate disagreements, then freeze `pageindex-ab-v1` together with the decision rules.
3. **Suite (2 days).** Finish `pageindex-ab` runner wiring: the six arms, the answer contract, both grading tiers, and the conformance check. (Scaffold landed with this spec.)
4. **Pilot (1 day).** Debug on the `contaminated-smoke` set and spend each arm's equal tuning budget.
5. **Scored run (half a day).** Record predictions, then run the frozen set once: 2.5 to 5 hours on GitHub Actions at 20 parallel jobs.
6. **Grading (1 day).** Tier-2 judging, adjudication, and the blind 10% human re-grade.
7. **Decision (half a day).** Apply the rules, add the results to `docs/benchmarks/openbench-results-ledger.md`, and act on the outcome.

| Item                            | Size                                               | Approximate cost |
| ------------------------------- | -------------------------------------------------- | ---------------- |
| Main run                        | 3,072 cells, about 127M input and 6M output tokens | $45              |
| Tier-2 judging and adjudication | 3,072 answers                                      | $18              |
| Frontier-model subset           | 342 cells                                          | $53              |
| **Total**                       |                                                    | **about $120**   |

Costs assume about 40,000 input tokens per retrieval cell, since the agent re-sends context each turn, plus DeepSeek-class and Sonnet-class list prices. Confirm current prices before running; even at double, the compute is under $250.

## Preconditions (product / harness gaps)

These must land before the scored run, or the corresponding arms are blocked:

| Gap                                     | Why it blocks                                                                                                   | Proposed fix                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No `read_around` MCP tool**           | Arms B and C need a section-window read after chunk hits                                                        | Add harness-local (or MCP) `read_around({ chunkId \| path, sectionId? })` returning the shared Docling section for a hit                                                                      |
| **Arm E ≠ bare default today**          | `resolveMemoryRecallSources({})` returns `vault`+`vector` only unless `CLAWQL_MEMORY_RECALL_HYBRID_PAGEINDEX=1` | Define Arm E as **explicit** `sources: ["vault","vector","pageindex"]` (or hybrid env on). Treat enabling hybrid-by-default as the **product action** after Outcome 1, not as today's default |
| **OpenBenchTrace `arm` enum is binary** | Six arms need distinct labels                                                                                   | Use `arm_label`; optionally bump schema later                                                                                                                                                 |
| **No paired stats scripts previously**  | Decision rules need bootstrap + McNemar                                                                         | Landed under `benchmarks/pageindex-ab/scripts/`                                                                                                                                               |

## Open questions — resolutions (pre-freeze)

| Question                     | Resolution                                                                                                                                                                                                                                         | Evidence                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Primary model**            | Keep `openrouter/deepseek/deepseek-chat` (pinned version) for continuity with August OpenBench and advanced-suite methodology. Frontier subset is the generalization check.                                                                        | Matches `docs/benchmarks/openbench-advanced-specs.md` shared setup              |
| **Judge independence**       | Tier-2 judge must be a **different model family** from the frontier subset runner. If the subset uses Sonnet 4.6, judge with GPT-class (or vice versa). Adjudicator is a third family when available.                                              | Spec contamination control                                                      |
| **What "as shipped" means**  | **Today, omit-`sources` does not include PageIndex.** Default = Arm E−. Arm E is the candidate default (explicit three-source / hybrid flag). Outcome 1 is the gate to flip `CLAWQL_MEMORY_RECALL_HYBRID_PAGEINDEX` (or product default) on.       | `packages/clawql-memory/src/recall/recall-sources.ts`, `recall-sources.test.ts` |
| **Is Arm C a straw man?**    | Vault is **token TF (+ optional corpus IDF)** via case-insensitive substring occurrence counts — not Okapi BM25. Keep Arm C as the product baseline; **add optional Arm C+** (`grep` + `read_range`) as exploratory. C+ never decides Outcome 1–3. | `packages/clawql-memory/src/recall/recall.ts` `keywordScore`                    |
| **Who writes the questions** | Human-owned keys. Model-drafted candidates allowed only if the drafting model never sees arm tools, prompts, or outputs. Second annotator + frontier adjudication before freeze.                                                                   | Contamination controls                                                          |
| **IDP locate step**          | Out of scope for v1. Follow-up spec after this result (ExtractBench field location).                                                                                                                                                               | Spec § open questions                                                           |

## Predictions (fill before scored run)

> Record before scoring. Do not edit after freeze.

| Field                        | Value             |
| ---------------------------- | ----------------- |
| Expected outcome (1 / 2 / 3) | _TBD_             |
| Why                          | _TBD_             |
| Recorded by                  | _TBD_             |
| Date                         | _TBD_             |
| Manifest tag                 | `pageindex-ab-v1` |

## Status

| Item               | State                               |
| ------------------ | ----------------------------------- |
| Decision rules     | Frozen in this v0.1 text            |
| Harness scaffold   | Landed (`benchmarks/pageindex-ab/`) |
| Corpus / questions | Not started                         |
| `read_around` tool | Not started (precondition)          |
| Scored run         | Blocked on corpus + preconditions   |
