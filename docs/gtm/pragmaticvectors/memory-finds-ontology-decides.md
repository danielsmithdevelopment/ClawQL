---
canonical: https://pragmaticvectors.com/posts/memory-finds-ontology-decides/
meta-description: OpenBench B-7 showed that vault memory alone still scores zero on institutional enumeration. Typed predicates via clawql-ontology are what finally turned recall into complete, false-positive-free answers.
---

Architecture · August 2026

# Memory Finds. Ontology Decides.

[Daniel Smith](https://pragmaticvectors.com/about) · [@danielsmithdev](https://x.com/danielsmithdev) · [ClawQL](https://clawql.com)

Harvey’s published failure mode for institutional-knowledge agents is brutally simple: the agent finds _some_ of the matters, stops confidently, and files an incomplete answer. We rebuilt that failure inside OpenBench. Vault memory alone didn’t fix it. Typed predicates did.

- [Agents](https://pragmaticvectors.com/tags/agents)
- [Memory](https://pragmaticvectors.com/tags/memory)
- [Ontology](https://pragmaticvectors.com/tags/ontology)
- [Benchmarks](https://pragmaticvectors.com/tags/benchmarks)
- [Legal Tech](https://pragmaticvectors.com/tags/legal-tech)

---

## The false win

The most important failure we recorded wasn’t “the agent forgot to use memory.”

It was the opposite. The ClawQL-on arm called `memory_recall` successfully. The tool returned. The agent wrote a `matters.json`. The grader scored **zero**.

Why? Semantic recall is approximate. Approximate recall produces near-misses. Our grader — matching the product requirement for firm-knowledge enumeration — hard-zeros on **any** false positive. Eighteen near-misses is not “almost right.” It is a complete miss of the only metric that matters: _the exact set, nothing else._

That is the same shape as Harvey’s story. Not “couldn’t search.” **Confident incompleteness.**

If you only remember one sentence from this post:

> Memory without typed predicates is still guessing.

---

## What institutional knowledge actually asks for

“Institutional knowledge” sounds like a retrieval problem. In practice — Calderwood & Harkness–style firm DMS work — it is an **enumeration-under-constraints** problem:

- Find every matter where escrow ≥ some threshold.
- Reconstruct a client’s governing-law / dispute-resolution preference across matters.
- Answer five related questions in one session without re-reading the corpus each time.

Three things break naive agent loops:

1. **Field-name chaos.** Escrow shows up as `escrow`, `Escrow %`, `escrow_percent`, `CLAWQL_ESCROW_PCT`. Keyword search and embeddings treat those as different worlds.
2. **Near-miss semantics.** “High escrow” and “escrow ≥ 10%” feel similar to a model. They are not the same set.
3. **Scale.** Exhaustive `read` of 120–250 matter notes burns the turn budget before the agent finishes. The agent stops. The answer looks done.

Vault memory solves storage and recall. It does not, by itself, solve **set closure**.

---

## What we thought would be enough

Earlier OpenBench cells already showed ClawQL memory helping: continuation across turns, token-budget discipline, multi-provider workflows, Ouroboros escaping oscillation. The natural bet for B-7 was: seed a mini-firm vault, give the agent `memory_recall`, watch the on-arm win.

That bet failed in instructive ways.

On smaller, machine-tagged fixtures, a stubborn bare agent could still finish by reading files. On larger fixtures, ClawQL-on sometimes recalled _everything_ and still failed the write path. And in one early cell that looked like a clean win, we later found a confound: the on-arm didn’t even see the same workspace files as the off-arm. We retired that claim.

That cleanup mattered. If you are going to argue ontology unlocked the win, the harness has to be honest first.

---

## The fair cell

The redesign that stuck:

| Arm                | What it gets                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `clawql-on`        | **Identical prose corpus on disk** + ClawQL MCP + seeded vault (`CLAWQL_*` enrichment → `ontology.db`) |
| `clawql-no-memory` | Same prose + ClawQL MCP, **no vault**                                                                  |
| `clawql-off`       | Same prose, bare agent, no ClawQL                                                                      |

Grader rule that drives the narrative: report `MATTERS_FOUND: k/5`, score `k/5` as a float, and **any false positive → 0**.

No hidden files. No “on-arm gets a cheat sheet the off-arm never sees.” Same notes. Different _decision machinery_.

---

## The unlock: clawql-ontology

`clawql-ontology` is not a second memory system. It is the typed layer that makes memory _decidable_.

For the legal domain pack we shipped:

- Matter (and related) fields are normalized at ingest — escrow becomes `escrowPct: Percentage`, not six spellings of the same fact.
- Those typed rows land in `ontology.db` beside `memory.db`.
- `memory_recall` grows structured arguments: `schema` + `filters`.

The agent stops guessing “notes that mention escrow.” It asks:

```json
{
  "schema": "Matter",
  "filters": { "escrowPct": { "gte": 0.1 } }
}
```

That is an exact predicate evaluation over an index, not a similarity sort over prose. Turn count collapses: one structured recall, one write. The set either closes or it doesn’t — and near-misses stop leaking into the artifact.

Two specs carry the contract:

- Legal Domain Spec v0.1
- `memory_recall` Structured Filter Extension v0.1

The package name people will care about in the stack is **`clawql-ontology`**. The product feeling is simpler: **typed predicates over vault notes.**

---

## Before / after on the same task

Keyword / semantic recall on the fair cell (DeepSeek):

| Arm                        | Result                                                |
| -------------------------- | ----------------------------------------------------- |
| clawql-on (keyword recall) | **0** — false positives from near-misses              |
| clawql-off                 | **0** — couldn’t finish a honest prose scan under cap |

Structured filters on the same fair design:

| Arm              | Success | Mean score | Notes                             |
| ---------------- | ------- | ---------- | --------------------------------- |
| clawql-on        | **3/3** | **1.0**    | `structured_predicate` → 5/5      |
| clawql-off       | 0/3     | 0.133      |                                   |
| clawql-no-memory | 0/3     | 0.0        | tools without vault still useless |

Run: [31255172649](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31255172649).  
Prior keyword FAIL on the same problem class: [31244644204](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31244644204).

Memory was present in both eras. The difference was whether recall could express **exact membership**.

---

## The evidence ladder

We did not stop at one green cell. We stacked claims carefully.

**B-7.1 — exhaustive enumeration (fair + structured filters)**  
On 1.0 / off ~0.13 / no-memory 0. Ontology efficiency twin (tighter spend, require `schema`+`filters`): [31256241850](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31256241850) — WIN.

**B-7.1-blind — no taught filter JSON**  
Same fixture; the agent has to invent the predicate shape. WIN: [31267585806](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31267585806).  
This is the cell that answers “did we just prompt-engineer the filter?” No. The ontology made the _right move available_; the model still had to take it.

**B-7.2 — client preference reconstruction**  
Synthesize a client’s historical preference across matters (Meridian Capital prose; top-1 term sheet). WIN: [31268782329](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31268782329).  
Enumeration is set closure. Preference is _synthesis under identity_ — still ontology-shaped, still memory-backed.

**B-7.3 — amortized multi-question session**  
Five related prompts against the same vault; score completeness _and_ reuse. WIN: [31274484721](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31274484721) — on ≈ **0.933**, off **0.0** (replicate [31277018489](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31277018489)).  
This is where typed memory stops being a one-shot trick and starts looking like a session substrate.

**Epistemic hygiene.** These are OpenBench / mini-firm mechanism results — reproducible GitHub Actions runs with linked IDs. They are **not** Harvey LAB criterion pass rates. Harvey LAB firm-knowledge (250 tasks, shared DMS, Opus-vs-Opus ledger) is the next evidence tier. Do not blur them.

---

## Why “just add memory” is the wrong abstraction

Memory answers: _what have we stored, and what looks relevant?_

Ontology answers: _which entities satisfy this predicate, under this schema, with this field semantics?_

Agents fail institutional tasks when they optimize for relevance. Firms care about **closure**: every matching matter, no extras, provenance intact.

That is why `clawql-no-memory` stayed at zero even with ClawQL tools in process — there was nothing typed to query. And why clawql-on with keyword recall could call the right tool and still score zero — the tool returned a similarity neighborhood, not a set.

Recall is the surface. Ontology is the decision layer.

---

## What this unlocks next

Three doors open once structured predicates are real:

1. **Harvey LAB.** Same failure mode, real DMS, real rubric. OpenBench proved the mechanism; LAB is the scoreboard you publish to the firm.
2. **Training flywheel.** Traces that used `schema` + `filters` are the preferred chosen arm for DPO; Harvey rubric F1 is a verifiable GRPO reward. You can fine-tune models to _reach for_ structured recall instead of prose thrash.
3. **Telemetry that doesn’t lie.** RTP / OpenBenchTrace can record `queryType: structured_predicate`. If a future adapter regresses to keyword search, you see it in the trace — not only in a mysterious score drop.

---

## Close

The agent that used memory and still scored zero is the story.

We did not need a larger context window. We did not need a louder embedding model. We needed the stack to stop treating “probably related notes” as “the answer set.”

`clawql-ontology` is how ClawQL makes that distinction enforceable: typed fields at ingest, exact filters at recall, graders that refuse near-misses.

Memory finds.  
Ontology decides.  
And for institutional knowledge, only the second one closes the set.

---

_OpenBench B-7 ledger and run links: ClawQL [`docs/benchmarks/openbench-b7-calderwood.md`](../../benchmarks/openbench-b7-calderwood.md) and [`docs/benchmarks/openbench-results-ledger.md`](../../benchmarks/openbench-results-ledger.md). Legal domain + structured filter specs: [`docs/specs/ontology/legal-domain-v0.1.md`](../../specs/ontology/legal-domain-v0.1.md), [`docs/specs/memory/memory-recall-structured-filter-v0.1.md`](../../specs/memory/memory-recall-structured-filter-v0.1.md)._
