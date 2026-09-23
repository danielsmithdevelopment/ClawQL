---
title: "The Fast Decision Primitive — Full Consolidated Specification"
status: "September 2026 — leg 5 of the 8.0.0 release, full build, no deferral"
version: "0.4 (supersedes v0.3, restructures around a general primitive rather than a lettered type list; primary scorer: GLiNER2/2.5)"
package: "packages/clawql-core/classifier/ + packages/clawql-ontology/ + packages/clawql-harness/plugins/ouroboros/ + clawql-audit + DAOS coordination layer"
---

# The Fast Decision Primitive

## Full Consolidated Specification v0.4

**September 2026**

> Implementation: [`packages/clawql-core/src/classifier/`](../../../packages/clawql-core/src/classifier/). Export: `clawql-core/classifier`.

---

## 1. What Changed From v0.3, and Why This Version Exists

v0.1 through v0.3 grew a lettered list of specific applications (Type A through Type H) for a fast, calibrated, closed-category decisioning technique. That approach was correctly identified as a dead end during this version's own drafting: a fixed, lettered enum of use cases forces a breaking interface change every time a new application is found, which directly contradicts this project's stated goal for the release this spec is part of — 8.0.0 is intended to be the last hard break this project makes, with proper backwards compatibility for everything after it. An interface that requires extension by adding new letters to an enum cannot honestly claim that stability.

This version replaces the lettered-type structure with **one general primitive and an open, extensible registry of use sites**. New applications are added by registering against the primitive's fixed contract, not by modifying the primitive itself. Every application previously named as a Type (A through H) is preserved below as a registered use site, alongside a new, extensively developed application — deep, quality-motivated context management, informed by ontology, cache, and audit-trail state — that emerged from a real, substantive technical debate this version documents in full, including a serious external critique of a naive version of this idea and the specific architectural responses that address each of that critique's six points.

**Primary scorer revision (post-v0.4 drafting bakeoff):** After independent evidence review of open-weight candidates (Section 2.8), **GLiNER2 / GLiNER2.5 is the primary production scorer**, not Needle 3. Needle remains an optional secondary Layer for edge/tiny deployments; Laya is not the default; CUA-S1 is a specialist; TypeSafe Jev is excluded. See Sections 2.6–2.8 and the Implementation appendix.

This is leg 5 of the 8.0.0 release, being built in full, with real implementation and real validation against this project's own data, not shipped as a spec alone.

---

## 2. Full Background Context — Every Existing System This Connects To

### 2.1 `search` / `execute` (System 1)

Every provider, tool, and skill in the architecture is discoverable through one two-primitive interface: `search` ranks candidates from a natural-language query; `execute` runs a chosen operation with a field projection shaping what returns before it enters context. Providers bundle tools, skills, vault-seed knowledge, and hooks together. Skills have a two-tier discovery shape: a cheap `SkillIndexEntry` (name, description, digest) that `search` ranks against, and a full `SkillContent` fetched only once a specific skill is selected — mirroring the Skills-over-MCP working group's `skills/list`/`skills/get` shape.

### 2.2 WikiSkill-informed self-learning (System 2)

Raw execution traces accumulate immutably in a Raw Layer. A Wiki Maintainer consolidates recurring patterns from those traces into a persistent Wiki Layer — never reset, permanently recording both accepted and rejected proposals, so a rejected approach is never proposed identically twice. A Skill Proposer, with access to that wiki but deliberately never given live inference-time access (per WikiSkill's own published ablation finding that inference-time wiki access degrades skill quality, because the agent starts pulling answers from the wiki rather than relying on the skill, making trajectories less informative for future refinement), proposes one atomic skill creation or edit at a time. A Gating and Rollback mechanism validates each proposal against held-out data before acceptance. A skill's current validity status (accepted, rejected, or later rolled back) is permanently tracked and can change over time as new evidence accumulates — critically, this status must be checked live on every use, never cached as a stale assumption.

### 2.3 The ontology's layered schema (System 3)

Layer 0 (new, additive) tags document identity/provenance metadata using the Dublin Core 15-element vocabulary at ingest time — standardizing document _identity_, distinct from domain _content_. Layer 1 is pre-built, hand-declared domain schemas (typed fields such as `has_springing_lien`). Layer 2 is a runtime document-inventory fallback (`doc_type`, `key_terms{}`) for content the pre-built schema doesn't cover. Layer 3 is a learned promotion engine: recurring patterns in Layer 2's fallback data are detected, scored for consistency, proposed, gated against held-out data, and — if accepted — promoted into a first-class typed field in Layer 1, effective from that point forward, never retroactively rewriting prior data.

Provider plugins may declare a `preferredVocabulary` (Schema.org for general web entities, FIBO for finance; legal-domain vocabulary — LegalRuleML, LKIF, Akoma Ntoso — is explicitly, deliberately unresolved, since no single standard dominates that domain the way Dublin Core, Schema.org, and FIBO do theirs). When Layer 3 is about to mint a new field, it checks the owning provider's declared vocabulary first; a matching standard term is used in preference to a novel project-local field name.

### 2.4 `clawql-audit`'s WORM trail (System 4)

Every consequential action produces a hash-chained, tip-continuous, dual-ack-replicated, Merkle-batchable audit entry. This is not a logging convenience — it is the mechanism that makes every claim in this specification checkable after the fact rather than merely asserted, and every decision this primitive makes is subject to it without exception.

### 2.5 DAOS's NSV/SGDOP swarm coordination (System 5)

NSV is a cheap, aggregate tripwire measuring whether a swarm of contributing agents is clustering in embedding space rather than genuinely exploring diverse reasoning directions. When NSV trips, SGDOP — adapted from GPS dilution-of-precision mathematics — identifies the specific blind-spot direction the swarm is under-covering, so recruitment can target agents whose historical positions project strongly onto that direction. The exact SGDOP projection computation is expensive; running it against every available peer in a large candidate pool is itself a real cost independent of whether NSV correctly triggered the need for it.

### 2.6 The technique itself, and the explicit choice of implementation

A fast, cheap, calibrated, closed-category decisioning technique: score every candidate in a fixed, known-in-advance set in a single parallel pass, producing a real confidence per candidate, rather than autoregressive text generation. This is the mechanism publicly surfaced by TypeSafe AI's "Jev" launch (a non-autoregressive model producing typed, calibrated-probability decisions, claimed at 70-500ms latency versus 3-329 seconds for comparable frontier-LLM tasks).

**This project builds exclusively on open, self-hostable implementations, never on TypeSafe's own Jev.** This is a structural decision, not a preference: TypeSafe's Jev is confirmed, via direct research, to be closed-API-only, with no open weights, no self-hosting path, and no on-premises or VPC deployment option. Hacker News's own community reaction specifically identified this as "an adoption blocker for financial and security environments that cannot send data externally" — precisely the regulated, air-gapped customer segment this project's entire architecture and business thesis targets. A dependency that cannot be self-hosted cannot be part of this project's core infrastructure, regardless of its performance characteristics.

**Primary implementation: GLiNER2 / GLiNER2.5 (Fastino).** Apache 2.0 encoder family with a multi-year, peer-reviewed lineage (GLiNER at NAACL 2024; GLiNER2 at EMNLP 2025), real production adoption (community fine-tunes, GLiGuard, shipped PII products), CPU-first inference, and native multi-task support for classification, named entity recognition, relation extraction, and structured extraction in one forward pass. Independent bakeoff evidence (Section 2.8) favors GLiNER over newer same-week competitors: Laya's independent zero-shot benches lag claims relative to Jev; Needle 3 is brand-new with middling BFCL-class results and no comparable adoption footprint. ClawQL wires GLiNER as the default `FastDecisionScorer` via an optional HTTP sidecar (`CLAWQL_FAST_DECISION_GLINER_URL`); without a sidecar the stack reports an honest `gliner2-stub` backend id rather than pretending live inference.

**Secondary / optional: Needle 3 (Cactus Compute).** Apache 2.0 model weights; purpose-built tool-calling / span-grounded extraction; attractive for edge / tiny-layer deployments. Retained as an optional secondary Layer (`NeedleFastDecisionScorerLive`), not the production default. **Licensing caveat before any Needle engine binary adoption:** Needle's documentation distinguishes the model (Apache 2.0) from "Cactus Engine," described as available under "its own source-available license" — confirm whether Linux/ARM64 prebuilt engines depend on Apache 2.0 Needle alone or on the separately-licensed runtime.

**Not default: Laya (Convai Innovations).** Apache 2.0 typed `choice`/`score`/`noul` questions; RLCD-trained. Independent zero-shot evaluation does not currently justify default adoption over GLiNER; retained as a documented alternative for typed-question shapes if held-out validation (Section 7) ever favors it for a specific use site.

**Specialist (not general primary): CUA-S1-FORMS (trycua).** MIT; ~706K params; bounded form-filling workflow (FILL/CHECK/CLICK/SKIP). Suitable only where the candidate set is that exact action vocabulary.

**Excluded: TypeSafe Jev.** Closed API only — structural incompatibility with self-hosted / air-gapped deployments.

### 2.7 The fine-tuning plan: GLiNER2 as the foundation, not a from-scratch training effort

An earlier version of this project's thinking considered training an entirely new base model from ClawQL's own WORM-logged decision traces. **That plan is superseded.** GLiNER2 already carries general IE / classification / relation-extraction competence from large-scale structured training; reproducing that from ClawQL's own trace volume alone would be neither necessary nor practical. The correct plan is fine-tuning on ClawQL's WORM-logged decision traces, reformatted into GLiNER's label/span/relation training shape (Hugging Face / PEFT or Fastino's documented fine-tune path), producing adapters or checkpoints per use site or shared across related sites.

Needle's `needle finetune` / `needle build` LoRA workflow remains a documented path **if** a deployment chooses the optional Needle secondary scorer — not the primary path.

This preserves the advantage the original from-scratch plan was reaching for — a model fine-tuned on ClawQL's own real, audited decision history, which TypeSafe's Jev cannot offer regardless of its own performance, since it cannot be trained on data that never leaves this project's own infrastructure — while requiring meaningfully less engineering investment, since general classification / extraction competence, calibration behavior, and abstention (empty / below-threshold) come pretrained.

### 2.8 Four independent candidate implementations, and why convergence across them matters more than any single one's benchmark numbers

In the course of this specification's development, four separate, independently-built open-weight implementations of the same underlying idea — schema-defined, single-forward-pass, calibrated typed decisions in place of autoregressive generation — surfaced from four separate teams, on different timelines, with no apparent coordination between them:

| Candidate                         | License                                                                                      | Params                         | Native task shape                                                                            | Provenance                                                             | ClawQL role                         |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------- |
| **GLiNER2 / GLiNER2.5** (Fastino) | Apache 2.0                                                                                   | 74M–0.3B                       | Multi-task classification, NER, relation extraction, structured extraction, one forward pass | Predates Jev by ~1 year; peer-reviewed EMNLP 2025; production adoption | **Primary production scorer**       |
| **Needle 3** (Cactus Compute)     | Apache 2.0 (model); Cactus Engine separately licensed — verify before engine binary adoption | 25–121M, sliceable 2–20 layers | Tool/function calling, span-grounded structured extraction                                   | New, September 2026                                                    | Optional secondary / edge           |
| **CUA-S1-FORMS** (trycua)         | MIT                                                                                          | 706K                           | Single bounded workflow (form-filling: FILL/CHECK/CLICK/SKIP)                                | New, September 2026                                                    | Specialist only                     |
| **Laya** (Convai Innovations)     | Apache 2.0                                                                                   | 322–421M                       | Typed `choice`/`score`/`noul` over arbitrary state                                           | New, September 2026; RLCD-trained                                      | Documented alternative; not default |

**This convergence is stronger evidence for the underlying architectural approach than any single project's self-reported benchmark, and is treated here as validation of the general primitive design (Section 3), not as a reason to pick a "winner" among marketing claims alone.** Four independent teams arriving at the same solution is a stronger signal than one team's marketing — but it does not exempt any candidate from Section 7's held-out, frontier-judged validation on this project's own task shapes. Independent bakeoff evidence (Laya zero-shot lag; Needle immaturity vs GLiNER's multi-year lineage) **does** justify selecting GLiNER as the default wiring while still requiring Section 7 before any use site is trusted in production.

**Two concrete assignments from GLiNER2's native capability:**

**GLiNER2's native relation-extraction and structured-extraction capability is architecturally the closest fit, among all four candidates, for `relationship_edge_classification` and `field_to_schema_mapping`** (Section 3.3) — these use sites are, respectively, exactly relation extraction and exactly schema-conditioned span extraction.

**`fastino/gliner2-privacy-filter-PII-multi`, an already-fine-tuned, Apache 2.0, publicly available checkpoint, is a concrete, evaluable candidate implementation for Panguard's already-specified PII autoredaction hooks** (the `pii-autoredact-model` and `pii-autoredact-tool-result` hooks in the `clawql-core` plugin architecture specification), which previously had no assigned model. This should be evaluated directly, on this project's own real data, alongside any other PII-detection option already under consideration, using the identical Section 7 validation discipline — not adopted on the strength of Fastino's own claims about it.

**Scope note (deliberately not in this table):** GUI-control / desktop-automation models — including later trycua releases such as Cua-S1-4B that take screen state and emit GUI actions, even when RL-trained on live environments under Apache 2.0 — answer a different question than the text/schema closed-category decisions in Section 3.3 and are out of scope for this survey; they may matter later to `clawql-agents` or a GUI-automation provider plugin, not to this classifier registry.

---

## 3. The Primitive Itself

### 3.0 What this actually is, stated plainly

Stripped of the architectural framing any of Section 2.8's four candidates use to describe themselves, this primitive is a classifier — the same fundamental shape as a digit-recognition network trained on MNIST, or the "hotdog / not hotdog" app: a fixed set of possible categories, one forward pass, a confidence score per category, pick the highest one (or abstain if none clears a threshold). None of the four candidates in Section 2.8 are doing anything conceptually new relative to this decades-old pattern — what is new is applying it to language-conditioned categories (an arbitrary tool list, an arbitrary schema, an arbitrary text-described option set) rather than a fixed pixel grid mapped to ten hardcoded digits.

This framing matters because it inherits a well-known, decades-old failure mode directly: a classifier forced to produce a highest-probability answer over its fixed category set will always produce _some_ answer, even when the real input is nothing like anything it was trained on — the classic "confidently mislabels an out-of-distribution input" failure every practitioner encounters the first time a digit classifier is shown something unusual. This is precisely the mechanism behind Laya's own disclosed Khmer failure (Section 2.8: 0% accuracy at 95% confidence) — not a defect specific to one model, but the generic risk of any classifier asked to answer outside its trained distribution. Section 7's calibration-validation requirement exists specifically to catch this, and it should be read with this framing in mind: this primitive is, at its core, a hotdog/not-hotdog classifier applied to ClawQL's own decisions, and it deserves exactly the scrutiny a domain expert would give any classifier before trusting it on a case unlike its training data.

### 3.1 Core contract

```typescript
interface FastDecisionCandidate {
  candidateId: string;
  features: Record<string, unknown>; // whatever the use site needs
  // to describe this candidate
}

interface FastDecisionUseSite {
  useSiteId: string; // open-ended string, not a
  // fixed enum — new use sites
  // register without touching
  // this interface
  description: string;
  candidateSetProvider: (ctx: FastDecisionContext) => Promise<FastDecisionCandidate[]>;
  costlyErrorDirection: "false_positive" | "false_negative";
  threshold: number; // set per Section 9's
  // principle for THIS use
  // site specifically, never
  // copied from another
  wormEntryType: string;
}

interface FastDecisionResult {
  useSiteId: string;
  candidatesScored: number;
  scores: { candidateId: string; confidence: number }[];
  thresholdApplied: number;
  outcome: "above_threshold" | "below_threshold_fallback";
}

async function runFastDecision(
  useSite: FastDecisionUseSite,
  ctx: FastDecisionContext
): Promise<FastDecisionResult>;
```

Effect-primary implementation: `runFastDecision(useSiteId, ctx)` via `FastDecisionService`; Promise façades only at host boundaries (Express / MCP). Open registry: `FastDecisionRegistry.register` — new use sites do not change this contract.

### 3.2 What makes a candidate application of this primitive, and what does not

A problem is a legitimate candidate for this primitive if and only if it has a **fixed, enumerable candidate set at decision time**, would **benefit from a real calibrated confidence per candidate** rather than a single best guess, and has a **well-defined, safe fallback** for low-confidence cases. A problem that requires understanding content the classifier cannot see (Section 6's compaction debate, Section 6.3 specifically), or that has an unbounded or not-yet-known candidate set, is not a valid application regardless of how attractive the speed/cost profile looks — this is the exact mistake a naive compaction implementation made, corrected in full in Section 6.

### 3.3 Registered use sites (formerly Types A–H, now registry entries)

| useSiteId                             | What it decides                                                                           | Feeds                                                                  | Fit vs. GLiNER2                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `search_provider_tool_routing`        | Which provider/tool is relevant to a query                                                | Accelerates `search`'s existing ranking — does not replace it          | Direct fit (multi-label classify)                                                                                    |
| `skill_fast_path_match`               | Does a currently-valid, committed skill already cover this task                           | Skill execution (Section 4)                                            | Direct fit                                                                                                           |
| `ontology_vocabulary_term_match`      | Does a standard vocabulary term exist for a promotion candidate                           | Ontology Layer 3 promotion                                             | Direct fit                                                                                                           |
| `document_entity_type_classification` | What kind of document/entity is this, at ingest                                           | Upstream of ontology Layers 1–3                                        | Direct fit                                                                                                           |
| `field_to_schema_mapping`             | Which existing Layer 1 field does this extracted value belong to                          | Ontology Layer 1, per-extraction                                       | **Native strength** (schema-conditioned extraction)                                                                  |
| `pattern_consistency_check`           | Does this occurrence match the expected shape for its pattern                             | Feeds the `consistencyScore` computation in Layer 3                    | Direct fit                                                                                                           |
| `relationship_edge_classification`    | What kind of relationship connects two established entities                               | Ontology graph-building, analogous to Uber's Context Graph edge-typing | **Native strength** (relation extraction)                                                                            |
| `sgdop_peer_prefilter`                | Which available peers are plausibly worth the exact SGDOP projection                      | DAOS recruitment (Section 5, expensive-computation gating)             | **Approximate fit only — see Section 3.4**                                                                           |
| `pre_compaction_ontology_cache_check` | What in the current uncompacted context is load-bearing and must be cached before pruning | Context management (Section 6, full design)                            | Fit expected — binary `cache_this` / `dont_cache_this` with enriched features; validate context sizing (Section 6.8) |

This table is illustrative, not closed. Registering a tenth, eleventh, or unforeseen use site requires no change to Section 3.1's contract.

### 3.4 Honest fit assessment: seven direct fits, two requiring specific attention

Seven of the nine registered use sites are direct, clean fits for GLiNER2's native classification / extraction / relation contract without adaptation — a fixed set of labels or schema fields, pick the right one, fill from spans of the input, abstain when nothing matches.

**`pre_compaction_ontology_cache_check` requires reframing but is very likely fully solvable.** This use site becomes classifier-shaped once framed as a two-item choice — `cache_this` or `dont_cache_this`, given a tool call/result plus ontology/cache/audit context as input. The open question is whether the relevant context fits practical inference budgets for the chosen GLiNER checkpoint (and for optional Needle's documented bounded-memory operation if that secondary path is used) — a sizing question to validate empirically (Section 6.8), not a capability gap in the primitive.

**`sgdop_peer_prefilter` has a real, likely-permanent structural limit, and this is stated plainly rather than assumed away.** The underlying operation — does a candidate's continuous embedding-space position project strongly onto a specific geometric direction — is a numerical computation over continuous high-dimensional data, not a discrete classification task. GLiNER's architecture (and Needle's, and Jev's) is built for discrete, symbolic decisions. Fine-tuning can teach a coarse, discretized bucket classification (e.g., high/medium/low projection strength) — but it cannot perform the actual linear-algebra projection the exact SGDOP computation does. **This is not a deficiency specific to GLiNER relative to any alternative implementation of this primitive, including Jev:** Section 12 already states this use site is never meant to replace the exact SGDOP math regardless of which model powers the pre-filter, and Section 8.2's bloom-filter framing already only required a permissive, over-inclusive approximate signal, not exact geometric precision. A coarse, fine-tuned approximation is very likely sufficient for the actual job this use site was designed to do, even without true parity with the exact computation.

**The realistic, honest target after fine-tuning: 8 of 9 use sites at full, direct capability; the 9th (SGDOP pre-filter) at a coarse approximation adequate to its actual bloom-filter role, not at true geometric parity — which was never the requirement for that specific use site in the first place.**

---

## 4. Discovery and Execution Decision Flow (Skill Fast-Path)

```
                    Task or event arrives
                              |
                              v
     search_provider_tool_routing: which provider/tool is relevant?
     (accelerates search's existing ranking, does not bypass it)
                              |
                              v
     skill_fast_path_match: does a currently valid, committed
     skill already cover this specific task?
                              |
              +---------------+---------------+
              |                                       |
     high confidence AND                       low confidence,
     skill status == currently valid            OR skill status ==
              |                                 stale/rolled back
              v                                       |
     FAST PATH: execute committed                     v
     deterministic procedure.                   SLOW PATH: full
     No agent reasoning pass invoked.           exploratory agent
     WORM entry written.                        processing (Hermes,
                                                 Cline, or the
                                                 applicable harness)
                                                        |
                                                        v
                                              Task completes. Raw
                                              trace feeds System 2's
                                              Wiki Maintainer / Skill
                                              Proposer / Gating loop.
                                              May independently also
                                              propose an ontology
                                              promotion candidate —
                                              skill commitment and
                                              ontology promotion are
                                              separate proposals,
                                              gated separately; one
                                              may be accepted while
                                              the other is rejected.
```

**A high-confidence match against a since-invalidated skill must never execute deterministically.** Skill validity status is checked live, on every invocation, never cached from a prior check — the exact safeguard this specification has carried unchanged since v0.1, restated here in full per the instruction not to omit anything already established. Implementation: `SkillValidityStore` read on every `skill_fast_path_match` invocation.

---

## 5. Streams Event Dispatch — Stricter Context, Same Mechanism

Where a `search_provider_tool_routing`- or `skill_fast_path_match`-shaped decision determines which subscription, cell, or handler a Streams event dispatches to, the stakes differ categorically from `search`-assisted task processing: a wrong decision there is recoverable (the full ranked list remains visible to an agent or human); a wrong routing decision in Streams event dispatch may mean an event never reaches its intended handler at all. The confidence threshold for this specific use-site instance must be a configured, context-specific policy value, expected to be set stricter than the `search`-assisted case, following the same context-dependent policy discipline already used for `SpendTier` definitions. Streams dispatch additionally requires a hard architectural guarantee with no exceptions: any confidence below threshold routes through the existing, fully-reliable dispatch path, with no "best guess anyway" behavior permitted regardless of confidence level. Implementation: `streams_event_dispatch` threshold policy with `hardFallbackRequired: true`.

---

## 6. Context Management: The Full Debate, Resolved

This section documents, in full, a real technical disagreement that materially improved this specification, because the resolution — not just the conclusion — is load-bearing for how this use site must be implemented.

### 6.1 The starting proposal and its motivation

An external, independently-built implementation (`fast-jev-compaction`) applied the fast-decision technique to context compaction: score every existing tool-call/result pair in an agent's context as keep-or-drop, using TypeSafe's Jev, dropping low-value entries to shrink context. This was proposed as a candidate use site for this project's own primitive.

### 6.2 The critique, stated in full, all six points preserved

A detailed public critique argued this was "a terrible compaction strategy" on six grounds:

1. **Compaction is not a filter.** Its role is to clean up history to keep an agent focused, used sparingly when context grows too long — not continuously, as a default operating mode.
2. **The classifier does not know what it is deciding on.** Scoring tool calls line-by-line, without the surrounding thread and without even the tool's own result, means decisions are made blind. Deleting the wrong things risks "stupid loops" where an agent repeats actions it has already tried, because the record of having tried them was removed.
3. **Reasoning traces are invisible on frontier APIs.** OpenAI, Anthropic, and Google do not expose raw reasoning tokens over their APIs — only encrypted payloads a classifier cannot see and will often drop. Using this technique against models with opaque reasoning guarantees the agent becomes measurably less capable, and Anthropic specifically requires preserving full history to retain any reasoning data at all.
4. **Frontier labs already tune their own models for compaction.** A year of training investment has produced compaction behavior more effective than "any rudimentary solution," including model-switching behavior in tools like Codex where compaction runs on whichever model was previously active in a thread.
5. **Cache-write economics are severe and directional.** Cache writes, not reads, dominate agent LLM spend — often over 60% of total cost in real usage. Editing content early in a cached prompt invalidates every cached token after that edit point, forcing an expensive rewrite of everything downstream of the change. Deleting one entry from a long history forces re-caching of everything after it.
6. **The stated implementation detail — "whatever is not kept is deleted permanently, but the assistant can always re-run a tool or re-read a file" — was called out directly as an unreliable, unproven fallback ("good luck with that one").**

The critique closed by calling the underlying experiment "genuinely interesting" while recommending against treating probability-threshold filtering, as implemented, as an actual compaction strategy — recommending established defaults (Claude Code, Codex) instead.

### 6.3 Resolving points 1 and 4: this is not compaction, and general-purpose training does not cover this case

Point 1's objection assumes compaction means occasional summarization to manage window size. This project's actual goal is different and should be named as such: **continuous, quality-motivated signal curation**, justified directly by published context rot research (Chroma's 18-model study; the Stanford position-based accuracy study showing 70-75% accuracy at position 1 falling to 55-60% at position 10 for identical information; the TinyFish finding that "one fetch returning 3% article content does more damage on turn one than 40 clean turns") — all of which demonstrate that irrelevant context actively degrades output quality, independent of whether the context window is full and independent of any cost consideration. This is not the operation point 1 is critiquing; it is a different, legitimately continuous operation, correctly named.

Point 4's objection — frontier labs already tune compaction well — does not transfer to this project's actual target case. Frontier labs' compaction training optimizes for general-purpose conversational flow. It has no demonstrated advantage for domain-specific, criteria-heavy, long-horizon technical correctness — exactly the category this project's own Harvey LAB benchmarking work has independently shown frontier models still struggle with (published held-out all-pass rates in the single digits to low twenties; this project's own frozen-protocol Nemotron+ClawQL baseline target is a documented 0%/8.3% published comparison point). General compaction competence and domain-specific-criteria-preserving compaction are different skills, and there is no evidence the former implies the latter.

### 6.4 Resolving point 2: the classifier must have sufficient local context, by design

Point 2's objection is correct as stated against the naive implementation, and is treated as a hard design constraint, not a suggestion: **a candidate for this use site's fast-decision scoring must never be scored in isolation.** The `pre_compaction_ontology_cache_check` use site (Section 3.3, Section 6.7) is fed the task's relevant ontology structure (typed entities, fields, and relationships already established for this task — Systems 3.1 through 3.5's typed knowledge, not raw thread replay), the current cache-tool contents (System-4-adjacent durable task state), and relevant prior audit-trail entries. This satisfies Section 3.2's own precondition for a valid application of the primitive — the candidate set remains fixed and enumerable, but each candidate's _features_ now include genuinely sufficient context to judge relevance correctly, rather than the call's surface shape alone.

### 6.5 Resolving point 3: a structural mitigation, explicitly bounded, never claimed as a full fix

Point 3's objection — reasoning traces are invisible on frontier APIs, and this technique cannot recover what was never exposed — is accepted in full as a **permanent, structural limitation on closed frontier models specifically.** No architectural choice on this project's side changes what a third-party API chooses to expose. The mitigation adopted is real but explicitly partial: agents are instructed to include a compressed chain-of-thought justification alongside any cache entry they write — not the original hidden reasoning tokens (which remain permanently inaccessible), but the agent's own externalized summary of why a given action was taken and what its outcome was. This gives future decisions access to the _rationale_ behind a prior action even without the original opaque reasoning trace, which is a genuine improvement over total loss of that context, but must never be described as equivalent to preserving the actual reasoning. **This risk applies specifically and only to models whose reasoning is API-opaque.** For this project's own primary model stack — open-weight models (Nemotron, Ornith, Qwen) running on infrastructure this project controls — reasoning is not opaque by the same external-API constraint, meaning this specific risk is structurally smaller for the deployment configuration this project's regulated-enterprise thesis is built around, though not necessarily zero depending on how a given open-weight model's own reasoning is exposed or discarded internally.

### 6.6 Resolving point 5: structural cache ordering, plus an explicit statement of priority over cost

Two separate fixes apply to point 5, addressed distinctly because they are different problems:

**The invalidation-cascade mechanism itself is addressed structurally.** Cache-tool writes are append-only, never in-place edits, and are positioned in a stable block ahead of the volatile, frequently-pruned tool-call history region of the context — not interleaved with it. Because compaction operates on the volatile history region specifically, and the cache block sits structurally before it and is never itself edited by a compaction pass, pruning history entries does not invalidate the cache block's own cached prefix. This directly addresses the specific mechanism point 5 describes ("if your history is 1,2,3,4,5,6 and you delete 2, you have to rewrite 3,4,5,6") for the compaction-triggers-cache-rewrite interaction specifically. It does not eliminate all cache cost: the cache block itself grows over a long task's life and carries its own, smaller, bounded cost, worth monitoring but categorically different from the cascading rewrite problem being fixed here.

**Separately, and more importantly: cost and quality/completion-time are different currencies, and this project's stated priority is explicit.** Uber's own published Context Graph comparison (a grounded agent completing a task in 38 seconds versus an ungrounded agent spending 20 minutes, spawning 2 subagents, hitting 3 errors, and reaching a wrong conclusion) is the reference example for why: when task completion time, reliability, or correctness are meaningfully at stake, a modest additional cache cost is not weighed against those outcomes as though they were the same kind of cost. This project's position, stated explicitly rather than left implicit: **for any task where the realistic alternative to well-curated context is materially slower or less correct completion, cache-economics considerations are secondary to completion quality, not primary.** This does not mean cache cost is ignored — Section 6.8's validation requirement measures it explicitly — it means it is measured and reported as a real but secondary cost, not treated as a veto on the whole approach the way a purely cost-first framing would treat it.

### 6.7 The full resolved design

```
Long-running task, context accumulating
        |
        v
pre_compaction_ontology_cache_check fires (a genuine pre-compaction
LIFECYCLE HOOK, blocking, per the plugin architecture's existing
hook contract — not an optional or advisory step):
        |
        v
Candidates: current uncompacted tool-call/result entries, each
enriched with: relevant ontology structure for this task (Section
6.4), current cache-tool contents, relevant audit-trail entries
        |
        v
Fast-decision primitive scores: "does this entry contain something
load-bearing not yet captured elsewhere?"
threshold direction: FALSE NEGATIVE is the costly error (missing
something load-bearing) — same permissive, bloom-filter-style bias
as sgdop_peer_prefilter (Section 3.3), for the identical structural
reason: the cost of over-caching is small and bounded; the cost of
under-caching is a potentially unrecoverable loss of task state
        |
        v
For every candidate scored as load-bearing: extracted fact, PLUS
agent-authored chain-of-thought justification (Section 6.5's partial
mitigation), written to the cache tool's stable, append-only,
structurally-separate block (Section 6.6's ordering fix)
        |
        v
Compaction is now permitted to proceed against the volatile history
region only. The cache block is untouched by the compaction pass
and was never eligible for pruning in the first place.
        |
        v
WORM entries: PRE_COMPACTION_CACHE_CHECK_RUN,
PRE_COMPACTION_CACHE_ITEM_WRITTEN — recording exactly what was
proactively preserved before every compaction event, providing an
auditable record even in the residual case where something
load-bearing is still missed
```

### 6.7a A Structurally Different Alternative Worth Documenting, Not Yet Adopted: LensVLM-Style Selective Expansion

Everything in Sections 6.1–6.7 is built around a token-deletion model: score existing tool-call/result content, decide what to drop, cache anything load-bearing before it is gone. Apple's LensVLM (Xie et al., 2026, arXiv:2605.07019) demonstrates a different, credible answer to the same underlying problem, worth documenting here even though it is not adopted in this version of the specification.

**The mechanism:** rather than deleting content, LensVLM renders long text as compressed images (up to roughly 4.3x compression with accuracy comparable to the full-text upper bound, and up to 10.1x while still outperforming retrieval and other compression baselines), scans the compressed representation cheaply, and _selectively expands only the specific pages that turn out to be relevant_ back to their full, uncompressed form via a learned tool call — never discarding the underlying content at all.

**Why this is a structurally stronger answer to two of the six original compaction-critique objections specifically, worth stating precisely rather than in general terms:** Point 2 of that critique (a classifier scoring content in isolation "doesn't even know what it's deciding on") and Point 6 (the danger of the stated implementation detail that deleted content is gone permanently, with only an unreliable "re-run the tool" fallback) are both addressed by construction here, not by mitigation. Sections 6.4 and 6.7's cache-hook design mitigate the risk of getting a delete-or-keep decision wrong by trying to catch load-bearing content _before_ deletion — a real safeguard, but one that depends on correctly identifying what matters in advance. LensVLM's approach never has to make that binary decision correctly in advance at all: the full content remains available in compressed form indefinitely, and expansion happens on demand when something turns out to matter, rather than requiring a prior classifier decision to have already preserved it.

**Two things must be resolved before this becomes more than a documented direction:**

1. **Licensing.** The published model is released under Apple's Machine Learning Research Model License, not Apache 2.0. This requires the same verification already applied to every other candidate in Section 2.8 before it could be considered for adoption — whether that license permits the self-hosting and modification this project's regulated-enterprise thesis requires has not been checked, and should not be assumed either way.
2. **Applicability to ClawQL's actual content shape.** LensVLM's demonstrated results are on text QA and document/code understanding tasks, rendered as page images. Whether tool-call/result history (structured JSON, not prose documents) compresses and re-expands with comparable fidelity using this same technique is an open, untested question — the mechanism is promising by analogy, not validated for this specific content type.

**This is filed as a real, credible future direction, not adopted in this version.** If pursued, it would be evaluated with the identical Section 7 correctness-and-calibration discipline already required of every other candidate — a structurally elegant mechanism is not exempt from held-out, frontier-judged validation any more than Needle, Laya, GLiNER2, or CUA-S1 are.

### 6.8 Required validation before this use site is trusted in production

Consistent with this specification's standing discipline (Section 9), no claim about this use site's net benefit is valid until measured. The specific test required: fine-tune GLiNER2 (primary) — or the optional Needle secondary if that path is under evaluation — on this use site's real, reformatted ClawQL trace data (Section 2.7), then run the resulting model against a real, repeated task shape from this project's own benchmark corpora — a Harvey LAB firm-knowledge task run many times, or a representative ExtractBench document type processed at volume — and measure **net token count, net dollar cost, and net wall-clock completion time across the full session, with cache-block growth and any residual invalidation cost included**, not the isolated compaction step measured alone. This is the only test that answers the actual question raised during this specification's development: does a real, modest efficiency gain outpace the bounded cache-economics cost at realistic enterprise task volume, and does the fine-tuned model's context budget (Section 3.4's sizing question) actually accommodate the ontology/cache/audit context this use site requires. The specification does not assume TypeSafe's own claimed 40-200x Jev figures apply here, and this use site should not be validated against those numbers, since this project uses GLiNER2 (and optionally Needle), not Jev. Section 6.6's stated priority (quality/completion-time over cost) governs how a positive-cost, positive-quality result should be interpreted if that is what the test shows — it does not exempt the test from being run, or its result from being reported honestly regardless of outcome.

---

## 7. The Primary Gate: Correctness and Calibration, Ranked Above Cost or Speed

Every validation requirement in this specification so far (Section 6.8, and the equivalent requirements implied for every other use site in Section 3.3) has treated cost, latency, and net-efficiency as the thing being measured. **This is the wrong ordering, and it is corrected here explicitly: no use site's fast-decision output may be trusted in production until its correctness and its calibration have been independently validated, and that validation is the primary gate — cost and latency validation (Section 6.8) is secondary, and only meaningful once correctness has already passed.**

### 7.1 Why this ordering matters more than anything else in this document

A fast, cheap, well-calibrated wrong answer is a worse outcome than a slow, expensive right one, for every use site registered against this primitive. This is not a new principle — it is the same principle underlying every benchmark decision made elsewhere in this project (the frozen Harvey LAB protocol's refusal to cite a number before it is judged against a real baseline; the Executor comparison's insistence on live, matched arms rather than favorable estimates; ExtractBench's refusal to call a pipeline-correctness check an agent-competence result). Speed and cost are properties of a _good_ decision. They are not, on their own, evidence that a decision is _correct_, and this specification's entire safety model (Section 3.2's fallback requirement, Section 9's threshold-direction table) depends on confidence scores being genuinely calibrated — meaning a reported 90% confidence must actually correspond to approximately 90% real-world accuracy on held-out data. A model that is fast, cheap, and confidently wrong defeats the fallback mechanism silently, which is the single most dangerous failure mode this primitive could produce.

### 7.2 The required test, per use site, before Section 6.8's cost/latency validation is even relevant

For every use site in Section 3.3's registry, before it is trusted to fire in production:

1. **Assemble a held-out set of real, hard decisions of the exact shape this use site makes** — not synthetic or easy cases, but the genuinely ambiguous ones where a wrong answer is plausible. For use sites with a natural connection to this project's existing benchmark work (ontology field mapping, document classification, skill matching against real Harvey LAB/ExtractBench task shapes), this set should be drawn from or modeled directly on those corpora, using the same frozen-protocol discipline already established (pre-registered cases, no cherry-picking a favorable subset).

2. **Establish ground truth using the same frontier-judge methodology already standard in this project** — Sonnet 4.6, matching the judge already used for Harvey LAB, adjudicating what the correct decision actually was for each held-out case. This is the same discipline as asking "would Fable or Astra have made this same decision" — except operationalized as an actual, reproducible judge call rather than a rhetorical question.

3. **Compare the fine-tuned GLiNER model's actual output against that ground truth, per case**, reporting raw accuracy — not a self-reported benchmark number from Fastino's own suites, and not a number borrowed from TypeSafe's own Jev marketing materials, since neither transfers to this project's own task shapes without being independently measured here. (If a use site is under evaluation on optional Needle or another Section 2.8 candidate, run the identical protocol against that candidate — never mix marketing numbers across models.)

4. **Separately and explicitly validate calibration**, not just accuracy: bucket predictions by reported confidence (e.g., 50–60%, 60–70%, … 90–100%) and confirm that real accuracy within each bucket approximately matches the bucket's stated confidence range. A model that is accurate on average but poorly calibrated (overconfident on its wrong answers) is not safe to deploy behind this primitive's threshold-based fallback mechanism, regardless of its aggregate accuracy score.

5. **Only once steps 1–4 pass at a level judged acceptable for that use site's specific costly-error direction (Section 9)** does Section 6.8's cost/latency/net-efficiency validation become a meaningful, worthwhile measurement to run at all. Running the cost/latency test first, or treating it as equally important, risks optimizing and shipping a fast, cheap, uncalibrated, incorrect system.

Implementation: `FastDecisionValidationService` / `evaluateCorrectnessAndCalibration`.

### 7.3 What this means for GLiNER2 specifically, given capacity and deployment

GLiNER2/2.5's own published benchmark numbers (Section 2.6, Section 3.4) are, like every other figure cited in this specification, unverified against this project's own task shapes and must not be treated as evidence of correctness on ClawQL's own decisions. Parameter count relative to frontier models remains a legitimate reason for caution specifically on hard, ambiguous cases — less capacity can mean weaker handling of genuinely ambiguous decisions, independent of how well a model performs on narrower mechanical benchmarks. This is exactly why Section 7.2's held-out, frontier-judged validation is required before any use site goes live, and why passing that test — not GLiNER's speed, cost, or self-reported benchmark scores — is what actually determines whether GLiNER is the right model for a given use site, or whether that use site should instead route to a larger, slower, more expensive model (including, if held-out validation shows GLiNER underperforming on a specific use site, an open-weight LLM already in this project's own stack — Nemotron, Ornith, or Qwen — used directly rather than through this primitive at all for that specific case). Optional Needle remains available for edge/tiny deployments where Section 7 passes for that backend on the relevant use site.

---

## 8. Swarm-Coordination Application: SGDOP Peer-Recruitment Pre-Filter

### 8.1 The problem

DAOS's NSV tripwire is a cheap, aggregate check for whether a swarm is clustering. Once tripped, the exact SGDOP projection is expensive to run against every available peer in a large candidate pool, independent of whether NSV correctly identified the need for it.

### 8.2 The bloom-filter framing, and why it is the load-bearing design constraint

`sgdop_peer_prefilter` sits between NSV's tripwire and the exact SGDOP projection as a second, distinct cost-reduction gate, explicitly modeled on a bloom filter's specific asymmetric-error guarantee: **false positives (including a candidate that turns out not to matter) are acceptable, costing only a bounded amount of wasted exact computation; false negatives (excluding a candidate the exact math would have flagged as a genuinely strong recruitment fit) are not acceptable, because they silently degrade the swarm's actual blind-spot coverage with no visibility into what was missed.** This governs the threshold direction: low and permissive, biased toward inclusion, the opposite direction from `skill_fast_path_match`'s high, strict threshold — the clearest illustration in this specification of Section 9's general principle.

### 8.3 Composition, unchanged from prior versions

```
Swarm activity observed -> NSV computed (cheap, aggregate)
  -> no clustering: no further action
  -> clustering detected -> sgdop_peer_prefilter scores every
     available peer (cheap, permissive threshold)
     -> candidates passing the filter proceed to the EXACT SGDOP
        projection (now run against a reduced set, not the full pool)
     -> final recruitment decision made from exact results only —
        the prefilter never makes the final recruitment decision
        itself, only determines which candidates are worth the
        exact computation
```

---

## 9. General Principle: Threshold Direction and Strictness Are Set By Which Error Is Costly

No single, universal confidence threshold applies across every use site registered against this primitive. Each requires an explicit answer to "which kind of error is actually costly here" before a threshold is set:

| Use site                                            | Costly error                                             | Threshold tuning                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `skill_fast_path_match`                             | False positive (executing a stale/invalid skill)         | High / strict — bias toward slow-path fallback                                                                                     |
| Streams event dispatch (any use site applied there) | False positive (routing an event incorrectly)            | Highest / strictest — hard fallback guarantee, no exceptions                                                                       |
| `ontology_vocabulary_term_match`                    | False positive (using the wrong standard term)           | Moderate — a wrong match is a correctable quality issue, not a safety issue                                                        |
| `sgdop_peer_prefilter`                              | False negative (wrongly excluding a real candidate)      | Low / permissive — bloom-filter style, bias toward inclusion                                                                       |
| `pre_compaction_ontology_cache_check`               | False negative (failing to cache something load-bearing) | Low / permissive — identical reasoning to the SGDOP prefilter: bounded over-cache cost versus potentially unrecoverable state loss |

This table is illustrative of the principle, not exhaustive of every registered use site — any new use site added to the registry (Section 3.3) must independently answer this question rather than inheriting a threshold from an existing entry. Implementation: `FastDecisionThresholdPolicyService` / per-use-site `costlyErrorDirection`.

---

## 10. WORM Audit Requirements, Complete

```typescript
export type FastDecisionWORMEntryType =
  | "FAST_DECISION_ATTEMPTED" // generic: any use site ran,
  // regardless of outcome
  | "FAST_DECISION_ABOVE_THRESHOLD"
  | "FAST_DECISION_BELOW_THRESHOLD_FALLBACK"
  | "SKILL_FAST_PATH_EXECUTED"
  | "SKILL_FAST_PATH_REJECTED_STALE_SKILL"
  | "ONTOLOGY_STANDARD_TERM_USED"
  | "ONTOLOGY_NOVEL_FIELD_FALLBACK"
  | "SGDOP_PREFILTER_APPLIED"
  | "SGDOP_CANDIDATE_INCLUDED"
  | "PRE_COMPACTION_CACHE_CHECK_RUN"
  | "PRE_COMPACTION_CACHE_ITEM_WRITTEN";
```

Every entry carries: `useSiteId`, candidates scored, top candidate and confidence, threshold applied and its configured direction (Section 9), and outcome. High-volume use sites (`field_to_schema_mapping`, `pattern_consistency_check`, given their per-value, per-occurrence frequency) may warrant batched WORM entries rather than one per occurrence — an implementation detail to resolve during build, not a reason to skip auditing these decision types. This is the same trail, same hash-chain, same dual-ack, same Merkle-batchable discipline as every other consequential action in this project — there is no parallel or lesser audit mechanism for decisions made by this primitive.

---

## 11. Package Boundaries

| Concern                                                            | Package                                                                             | Why                                                                                                                                           |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| The fast-decision primitive itself (registry, contract, execution) | `packages/clawql-core/src/classifier/` (`clawql-core/classifier`)                   | Sits in front of `search`, skill execution, ontology promotion, DAOS recruitment, and context management — owned by none of them individually |
| `search` / `execute`, two-tier skill index                         | `clawql-core`, existing plugin architecture                                         | Unchanged — the primitive reads and accelerates, never replaces                                                                               |
| WikiSkill evolution loop                                           | `clawql-harness`'s Ouroboros plugin                                                 | Unchanged — the primitive is a new consumer of the existing skill-impact log                                                                  |
| Ontology Layers 0–3 + promotion engine                             | `clawql-ontology`                                                                   | Extended: multiple use sites feed into or accelerate existing layer logic; none replace it                                                    |
| `preferredVocabulary` declaration                                  | `ProviderPlugin` interface, `clawql-core`                                           | One optional field on an existing interface                                                                                                   |
| DAOS NSV/SGDOP coordination                                        | Existing DAOS specification                                                         | Extended: `sgdop_peer_prefilter` sits between the NSV tripwire and the exact projection                                                       |
| `pre-compaction` lifecycle event                                   | New event on the existing `LifecycleEvent` union, `clawql-core` plugin architecture | A genuine, blocking hook, following the exact contract already established for every other enforcement hook — not a new hook system           |
| Cache tool's stable, append-only ordering                          | `clawql-memory` / the existing cache tool + classifier `StableCacheBlockService`    | Structural change to write pattern only; no new storage system                                                                                |
| Confidence threshold policy, per use site                          | Configuration, same pattern as `SpendTier` (`FastDecisionThresholdPolicyService`)   | Section 9 establishes threshold direction and strictness are set per use site, never globally                                                 |
| WORM entries, all use sites                                        | `clawql-audit`                                                                      | Same trail, same discipline, no parallel audit mechanism                                                                                      |

---

## 12. What This Specification Deliberately Does Not Claim or Include

- Not a replacement for, or reliance on, TypeSafe's Jev, its architecture, training method, or published performance figures — this project builds on open-weight candidates with **GLiNER2/2.5 as primary** (Needle optional secondary; CUA-S1 specialist; Laya documented alternative), and no claim in this document should be read as validated by Jev's own marketing numbers, nor by any of the several Jev comparisons published by these open-weight projects themselves, none of which have been independently reproduced here.
- Not a claim that any of the four candidate implementations named in Section 2.8 (GLiNER2, Needle 3, CUA-S1, Laya) has been validated as correct or well-calibrated on this project's own decisions — Section 7's held-out, frontier-judged validation applies identically to all four, and none has been exempted from it by virtue of its own published benchmarks, license, or provenance. Selecting GLiNER as the default wiring is an engineering judgment from independent bakeoff evidence, not a Section 7 pass.
- Not a claim that `fastino/gliner2-privacy-filter-PII-multi` has been adopted for Panguard's PII autoredaction hooks — it is documented in Section 2.8 as a concrete, evaluable candidate, not yet evaluated or selected.
- Not a claim that GLiNER2 (or optional Needle), even after fine-tuning, achieves true parity with an exact SGDOP geometric computation for the `sgdop_peer_prefilter` use site — Section 3.4 states plainly this reaches a coarse, adequate approximation for that use site's actual bloom-filter role, not exact numerical parity, and this limitation is architectural, not a fine-tuning-effort shortfall.
- Not yet confirmed whether any optional Needle platform engine binaries this project might depend on rely on Needle's Apache 2.0 package alone or on Cactus Compute's separately-licensed, source-available Cactus Engine runtime — required verification before Needle engine binary adoption (Section 2.6).
- Not a claim that correctness and calibration (Section 7) have been validated for any use site — this is the primary, required gate before any use site goes live, and it has not yet been run.
- Not a new skill-creation, skill-evolution, or ontology-promotion mechanism — Systems 2 and 3 are used exactly as already specced elsewhere; this document adds fast pre-checks and pre-filters in front of them.
- Not a replacement for the exact SGDOP geometric computation — the peer prefilter is exactly and only a prefilter, never a substitute for the real projection math.
- Not a claim that legal-domain vocabulary standardization is solved — explicitly deferred, unresolved, pending further specific research.
- Not a claim that reasoning-trace opacity on closed frontier models is solved — Section 6.5 states plainly this is a permanent, structural limitation, partially and only partially mitigated by agent-authored chain-of-thought cache annotations.
- Not a claim that LensVLM-style selective expansion (Section 6.7a) is adopted — documented future direction only; licensing and JSON-history applicability unresolved.
- Not an inventory of GUI-control / desktop-automation models (e.g. Cua-S1-4B) — Section 2.8's scope note excludes that category from the candidate table; absence of a well-known Apache 2.0 GUI agent from the same lab as CUA-S1-FORMS is intentional, not an oversight.
- Not a claim, anywhere in this document, that any specific performance, latency, cost, or net-efficiency figure has been measured on this project's own infrastructure. Every numeric figure cited (Jev's own claimed speedup, Chroma's context-rot findings, Uber's 38-second-versus-20-minute example, the 60% cache-write cost share) is a third-party published figure, cited for context and motivation, not a validated property of this project's own implementation. Section 6.8 specifies the exact secondary (cost/latency) validation required, and Section 7 specifies the primary (correctness/calibration) validation required, both before any such figure may be cited as this project's own result.
- Live GLiNER inference requires a deployed sidecar (`CLAWQL_FAST_DECISION_GLINER_URL`); without it the default stack is an honest `gliner2-stub`, not pretended live inference.
- This is leg 5 of the 8.0.0 release, being built in full per explicit instruction — not deferred, not spec-only, not optional — but Section 7 validation has not yet been run on production task shapes, and nothing in this document should be read as describing already-validated production behavior.

---

## Implementation appendix (repo)

| Concern                                   | Location                                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primitive (registry, contract, execution) | `packages/clawql-core/src/classifier/`                                                                                                                                                      |
| Primary scorer                            | `GlinerFastDecisionScorerLive` / `FastDecisionGlinerStackLive` (`scorer.ts`, `gliner-config.ts`)                                                                                            |
| Env                                       | `CLAWQL_FAST_DECISION_GLINER_URL`, `CLAWQL_FAST_DECISION_GLINER_MODEL` (default `fastino/gliner2.5-base-v1`), `CLAWQL_FAST_DECISION_GLINER_TOKEN`, `CLAWQL_FAST_DECISION_GLINER_TIMEOUT_MS` |
| Optional Needle secondary                 | `NeedleFastDecisionScorerLive`                                                                                                                                                              |
| Tests / offline                           | `HeuristicFastDecisionScorerLive`                                                                                                                                                           |
| Skill fast path                           | `skill-fast-path.ts` + live `SkillValidityStore`                                                                                                                                            |
| SGDOP prefilter                           | `sgdop-prefilter.ts`                                                                                                                                                                        |
| Pre-compaction hook + stable cache        | `pre-compaction.ts`, `pre-compaction-hook.ts`, `stable-cache-block.ts`                                                                                                                      |
| §7 harness                                | `validation.ts`                                                                                                                                                                             |
| Threshold policy                          | `threshold-policy.ts`                                                                                                                                                                       |
| Built-in use sites                        | `use-sites/builtins.ts`                                                                                                                                                                     |

### Related docs

- Plugin lifecycle: [`docs/design/clawql-core-plugin-architecture.md`](../../design/clawql-core-plugin-architecture.md)
- DAOS coordination: [`docs/ouroboros/daos-coordination-layer-specification.md`](../../ouroboros/daos-coordination-layer-specification.md)
- Ontology meta: [`docs/specs/ontology/meta-ontology-v0.1.md`](../ontology/meta-ontology-v0.1.md)
- Unified Capability Lifecycle: [`docs/specs/classifier/unified-capability-lifecycle-v0.2.md`](./unified-capability-lifecycle-v0.2.md)

---

_The Fast Decision Primitive · Full Consolidated Specification v0.4 · September 2026_
_Location: packages/clawql-core/classifier/, packages/clawql-ontology/, packages/clawql-harness/plugins/ouroboros/, clawql-audit, DAOS coordination layer_
_Primary scorer: GLiNER2 / GLiNER2.5 · Contact: daniel@clawql.com_
