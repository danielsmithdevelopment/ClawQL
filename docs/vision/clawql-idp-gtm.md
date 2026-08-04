IDP-first GTM · July 2026

# Document Processing That Doesn't Stop at Extraction

Standalone Intelligent Document Processing motion for ops, compliance, legal, lending, and M&A — full lifecycle from ingest to secure distribution, Merkle audit trails, MCP-native agents, Starter at $299/mo. Developer motion: [inference-first GTM](https://clawql.com/inference/gtm/). Enterprise motion: [enterprise GTM](https://clawql.com/enterprise/gtm/). Live gateway/memory A/B: [OpenBench results ledger](../benchmarks/openbench-results-ledger.md). Dataset protocol: [OpenBench dataset product](../benchmarks/openbench-dataset-product.md).

[View IDP landing](https://clawql.com/idp/) · [Start free trial](https://clawql.com/signup/) · [IDP platform docs](https://docs.clawql.com/vision/idp-platform) · [Deploy with Helm](https://docs.clawql.com/deployment/kubernetes)

> Internal strategy + landing-page brief (July 2026). Do not distribute externally without review. Canonical markdown: `docs/vision/clawql-idp-gtm.md`.

---

## Part 1 — The Market Reality

Gartner's first Magic Quadrant for Intelligent Document Processing (September 2025) named five Leaders among 18 vendors. Extraction accuracy has converged — top platforms advertise 90–99% on common formats. The traditional moat of "our model is more accurate" is disappearing. The battleground is integration depth, deployment model, and TCO. ClawQL wins all three on verifiable numbers.

### The Pricing Chasm

| Vendor                   | Pricing model          | Real cost                                                                  |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------- |
| ABBYY Vantage            | Per-page, custom quote | $0.02–$0.10/page; median enterprise ~$150K/year + $20–$150K implementation |
| Hyperscience             | Custom quote           | Up to $1.50/page; $30K–$100K+ to start                                     |
| Kofax TotalAgility       | Custom quote           | Mid-five to seven figures annually                                         |
| Rossum                   | Tiered from $18K/year  | $18K+ entry; SAP/Coupa-focused                                             |
| Intralinks VDR           | $0.40–$0.85/page       | $15K–$200K+ per M&A deal                                                   |
| Datasite VDR             | Custom quote           | Up to $720K/year for large implementations                                 |
| **ClawQL IDP (Starter)** | **Flat $299/mo**       | **$3,588/year. Unlimited documents. VDR included.**                        |

A team paying $150,000/year for ABBYY pays $3,588/year for ClawQL Starter — for a platform that does more, deploys faster, and requires no dedicated implementation team.

### The Integration Gap No Incumbent Fills

Incumbent IDP stops at extraction and delivery. Cross-referencing institutional knowledge, triggering downstream APIs, Merkle-chained archiving, and secure counterparty distribution are left for the team to build. ClawQL runs ingestion through secure external distribution on one MCP endpoint. That integration is structural, not additive.

### Three Buyer Problems

**SaaS sprawl.** Five to ten disconnected tools (OCR, PDF, DMS, search, VDR) with separate billing, compliance postures, and breach surfaces.

**Implementation overhead.** Three to twelve months, dedicated PS teams, $20K–$150K on top of license fees.

**Pipeline-to-VDR gap.** Intralinks/Datasite charge $0.40–$0.85/page with no pipeline; documents arrive via manual OCR → redact → archive → upload.

ClawQL closes all three simultaneously.

---

## Part 2 — The Honest Positioning

### What ClawQL IDP Is

A sovereign, modular IDP that closes the full document lifecycle in one system: Ingest → Classify → Convert → OCR → Redact → Archive → Semantically index → Distribute securely. Self-hosted (Apache 2.0, free forever) or managed hosted (Starter $299/mo). AI agents orchestrate via MCP / natural language in Cursor or Claude Code — no custom integration code.

### Scope and Limitations

**Millions-of-documents-per-month scale.** Buyers at that volume may need deeper vertical extraction models that ABBYY and Hyperscience carry.

**US federal procurement.** Tungsten Automation achieved FedRAMP High ATO (March 2026). US federal procurement is out of scope for ClawQL today.

**Forms-automation RPA.** ClawQL uses AI agents, not UiPath-style RPA bots.

### Claimable Differentiators (Now)

1. Most affordable full-pipeline IDP with VDR — $299/mo, unlimited documents, no per-page meter; VDR included.
2. The only IDP that is also an inference gateway and MCP server — expand without changing endpoint or vendor.
3. Native MCP from any AI assistant — full pipeline via natural language.
4. Merkle audit trail per step — independently verifiable for regulated industries.
5. Self-hosted / air-gapped / data-sovereign — no document data must leave the environment.
6. Deploy in hours, not months — `helm install clawql charts/clawql-full-stack --namespace clawql`.

7. **Persistent vault memory on frugal models (OpenBench A/B).** Live cells on `openrouter/deepseek/deepseek-chat` show clawql-on **1.0** vs off **0.0** for ingest→recall, **1.0** vs **0.333** after seed removal, and **1.0** vs **0.0** under token-budget pressure ([30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516), [30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811); [results ledger](../benchmarks/openbench-results-ledger.md)).

### Gateway competitive proof (supports IDP → platform expansion)

| Objection | Answer with run evidence |
| --------- | ------------------------ |
| "Does vault memory actually work?" | Yes — frugal DeepSeek A/B WINs above; same model class cheap-router customers use. |
| "Is search/execute just marketing?" | Search-first discovery **1.0/0.0** with graders requiring real `tool:clawql_*` calls ([30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516)). |
| "Will policy actually block bad execute?" | Panguard policy-deny-execute **1.0/0.0** ([30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516)). |
| "Does orchestration reduce thrash/cost?" | Ouroboros on **1.0** in ~78s / 5 turns vs off **0.0** thrashing ~167s ([30863572642](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30863572642)); still wins with production `doom_loop=deny`. |
| "Can agents notify / sandbox / compose safely?" | Stubbed Slack notify, Docker sandbox_exec, and composed dry-run rollout each **1.0/0.0** ([30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305)). |
| "Does Onyx / vault graph memory work on cheap models?" | Stubbed `knowledge_search_onyx` and wikilink-hop `memory_recall` each **1.0/0.0** ([30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189)). |

**Do not overclaim in sales:** most headline cells are still **n=1–2** — expand to n=3–5 before quoting statistical confidence. Live Onyx / live Slack / Argo / R2 sync are ops-integration, not PR OpenBench. Multi-provider remains a margin WIN (on 1.0 / off 0.75). Detail: [OpenBench results ledger — open gaps](../benchmarks/openbench-results-ledger.md#open-gaps-not-yet-headline-win).

Avoid "best IDP on the planet" until earned. Prefer: _best IDP for teams that need pipeline integration, data sovereignty, agentic access, and price efficiency_.

---

## Part 3 — The Standalone IDP GTM Motion

The IDP buyer is often a VP of Ops, Legal Ops Manager, transaction coordinator, controller, or compliance officer — not a developer optimizing PAL routing. Lead with documents, cost, auditability, and time-to-value in their language.

### Entry Points

1. **SaaS replacement** — one system vs 5–10 tools ($500–$5,000/mo current spend).
2. **VDR cost** — unlimited VDRs in $299/mo vs $0.40–$0.85/page.
3. **Compliance** — cryptographic proof of how a document was processed.
4. **Integration** — extract → knowledge → APIs → archive → distribute from one NL instruction.

### Expansion Ladder

| Horizon  | Outcome                                                           |
| -------- | ----------------------------------------------------------------- |
| Day one  | Full pipeline operational (Helm or hosted trial)                  |
| Week 2   | Semantic cross-reference via `knowledge_search_onyx`              |
| Month 2  | HITL for low-confidence extractions (`hitl_enqueue_label_studio`) |
| Month 3  | MCP from AI assistants for natural-language ops                   |
| Month 4+ | Inference + memory discovered on the same platform                |

### Competitive Table

| Dimension         | ABBYY             | Hyperscience      | Rossum            | Intralinks      | ClawQL IDP         |
| ----------------- | ----------------- | ----------------- | ----------------- | --------------- | ------------------ |
| Entry price       | $15K+/yr est      | $30K+/yr est      | $18K/yr           | $10K+/yr        | **$3,588/yr**      |
| Per-doc meter     | Yes               | Yes               | Yes               | Yes             | **No**             |
| Implementation    | Weeks–months      | 3–12 months       | Weeks–months      | Days            | **Hours**          |
| Self-hosted       | Partial           | Partial           | No                | No              | **Yes (free)**     |
| VDR included      | No                | No                | No                | VDR only        | **Yes**            |
| Pipeline          | Extract + handoff | Extract + handoff | Extract + handoff | Distribute only | **Full lifecycle** |
| MCP-native        | No                | No                | No                | No              | **Yes**            |
| Merkle audit      | No                | No                | No                | No              | **Yes**            |
| Inference gateway | No                | No                | No                | No              | **Same binary**    |

### Objection Handlers

**Gartner MQ vendor:** MQ validated the category; evaluate on your docs, timeline, TCO, and whether the IDP stops at extraction.

**Millions of docs/month:** be honest — Hyperscience/Tungsten may fit; ClawQL targets hundreds to tens of thousands per month with pipeline + sovereignty + cost.

**FedRAMP:** we do not have it; say so before evaluation.

**Setup complexity:** one Helm chart vs months of PS.

**Already running Stirling/Paperless/Nextcloud:** ClawQL is the orchestration + MCP + VDR loop on top.

---

## Part 4 — clawql.com/idp Landing Page Brief

Convert an IDP buyer who has never heard of ClawQL. Answer "Is this the document platform I've been looking for?" in ~10 seconds; trial/demo in ~60. Do not lead with PAL, Flywheel, WORM, or developer framing.

### Above the Fold (Test Both Headlines)

- **A:** Document processing that doesn't stop at extraction.
- **B:** Your IDP costs $150,000/year. Ours costs $299/month. And it does more.

Subhead: full lifecycle (ingest → distribute) in one system, AI-agent orchestrated, price incumbents cannot match. CTAs: Start free trial · Deploy self-hosted. Trust: Apache 2.0 · 1,000+ formats · hours not months · Merkle per step.

### Build Sections

1. Pipeline visual (Intake → Convert → Process → Archive → Distribute)
2. Price comparison table (hard numbers)
3. Three things your current IDP can't do (cross-ref · VDR loop · crypto proof)
4. Five-minute setup (Helm + NL example + hosted trial)
5. Supported document types by industry
6. Vertical callouts (Lending · Legal/M&A · Real estate) → [plugins / verticals](https://docs.clawql.com/plugins)
7. Security cards (air-gap · Merkle · Stirling redaction · Istio mTLS)
8. Pricing expanded + Starter callout
9. Footer CTAs by buyer type

Public marketing landing: [`clawql.com/idp`](https://clawql.com/idp/). This playbook is the strategy source of truth at `/idp/gtm`.

---

## Part 5 — Site Architecture

Section of clawql.com, not a separate microsite — shared SEO, pricing, docs, and trial; natural expansion into the broader platform.

```
clawql.com/inference  → inference-first (developers)
clawql.com/idp        → IDP-first (ops / compliance)
clawql.com/enterprise → sovereign / CISO-CTO motion
```

---

## Part 6 — IDP-First as Its Own Revenue Motion

Inference-first is PLG. IDP-first often hits budget owners already spending on SaaS — a cleaner "replace my stack" sale. Starter converters are budget-approved, problem-aware, and warm leads for Business / Professional and eventually inference + memory.

ClawQL IDP is a standalone IDP that competes with ABBYY, Hyperscience, and Intralinks on price, speed, pipeline integration, and agentic access.

Funnel: PragmaticVectors essays → `clawql.com/idp` → docs. Planned essays: "The $150,000 Invoice" and "The Per-Page Trap."

---

## Part 7 — Positioning Statement

ClawQL is the Intelligent Document Processing platform that closes the full document lifecycle — ingest, convert, OCR, redact, archive, semantic search, and secure distribution — in a single system, orchestrated by AI agents, with a cryptographic audit trail at every step. It deploys in hours, starts at $299/month (versus $15,000–$150,000+ for ABBYY or Hyperscience), includes unlimited VDRs (versus $0.40–$0.85 per page for Intralinks), and is available self-hosted for free. It is the only IDP platform that is also a native MCP server — meaning any AI assistant that supports MCP can operate the full pipeline via natural language, without custom integration code. For teams in lending, legal, real estate, healthcare, or M&A who need document intelligence without a six-figure contract, a six-month implementation, or a per-page surprise on every invoice.

---

Land with pipeline + VDR + auditability at a price incumbents cannot match. When buyers are ready, the same endpoint is also an inference gateway and memory system — without a second vendor conversation.

[Start 14-day trial](https://clawql.com/signup/) · [Read IDP docs](https://docs.clawql.com/vision/idp-platform) · [View pricing](https://clawql.com/pricing/)

July 2026 · ClawQL IDP GTM · [IDP platform docs](https://docs.clawql.com/vision/idp-platform) · [Inference GTM](https://clawql.com/inference/gtm/)
