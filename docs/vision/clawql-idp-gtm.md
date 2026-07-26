# ClawQL IDP — Standalone GTM Strategy, Landing Page Brief & Positioning

**July 2026 · Compiled from competitive research and product docs**

**Audience:** Internal GTM, sales, product marketing  
**Related:** [IDP platform](./clawql-idp-platform.md) · [IDP pipeline](../providers/idp-pipeline.md) · [Plugins](https://docs.clawql.com/plugins) · Public playbook: [clawql.com/idp/gtm](https://clawql.com/idp/gtm) · Inference GTM: [clawql.com/inference/gtm](https://clawql.com/inference/gtm)

> Internal strategy document. Do not distribute without review.

---

## Part 1: The Market Reality That Creates the Opportunity

### What the 2026 IDP Market Actually Looks Like

The IDP category was formally recognized by Gartner in September 2025 — the first-ever Magic Quadrant for Intelligent Document Processing Solutions evaluated 18 vendors and named five as Leaders: ABBYY, Hyperscience, Infrrd, Tungsten Automation, and UiPath.

What the Magic Quadrant also revealed: extraction accuracy has converged. By 2026, the top platforms all advertise 90–99% accuracy on common document formats, with differences increasingly invisible in production. The traditional moat — "our extraction model is more accurate" — is disappearing. The battleground has shifted to **integration depth**, **deployment model**, and **total cost of ownership**.

ClawQL wins all three. Decisively. On verifiable numbers.

### The Pricing Chasm

| Vendor                   | Pricing model               | Real cost                                                                              |
| ------------------------ | --------------------------- | -------------------------------------------------------------------------------------- |
| ABBYY Vantage            | Per-page, custom quote      | $0.02–$0.10/page; median enterprise contract ~$150,000/year + $20–$150K implementation |
| Hyperscience             | Custom quote, not disclosed | Up to $1.50/page; $30,000–$100,000+ to start                                           |
| Kofax TotalAgility       | Custom quote                | Mid-five to seven figures annually                                                     |
| Rossum                   | Tiered, from $18,000/year   | $18,000+ entry; SAP/Coupa-focused                                                      |
| Intralinks VDR           | Per-page, $0.40–$0.85/page  | $15,000–$200,000+ per M&A deal                                                         |
| Datasite VDR             | Custom quote                | Up to $720,000/year for large implementations                                          |
| **ClawQL IDP (Starter)** | **Flat, $299/mo**           | **$3,588/year. Unlimited documents. VDR included.**                                    |

This is not a marginal price advantage. It is a category gap. A team that would pay $150,000/year for ABBYY pays $3,588/year for ClawQL at the Starter tier — for a platform that does more, deploys faster, and doesn't require a dedicated implementation team.

### The Integration Gap No Incumbent Fills

Every incumbent IDP platform stops at extraction and delivery. They extract data from documents and hand it off. What happens next — querying that data, cross-referencing it against institutional knowledge, triggering downstream API actions, archiving with cryptographic provenance, distributing securely to counterparties — is left to the team to build.

ClawQL doesn't stop at extraction. The pipeline runs from document ingestion through to secure external distribution, with every step orchestrated by AI agents through the same MCP endpoint, with Merkle-chained audit trails at every step.

No incumbent can bolt this on. The integration is structural, not additive.

### The Three Buyer Problems Nobody Is Solving

**Problem 1: The SaaS sprawl tax.** A typical document-heavy team in legal, lending, or M&A runs 5–10 disconnected SaaS tools: an OCR vendor, a PDF processor, a document management system, a knowledge search tool, a VDR, and a set of manual handoffs between them. Each tool has separate billing, separate compliance postures, and a separate API contract. Each handoff is a potential breach vector and a guaranteed latency cost.

**Problem 2: The implementation tax.** Enterprise IDP vendors require 3–12 months for full deployment, dedicated implementation teams, and professional services that can add $20,000–$150,000 on top of license fees. A team that needs document processing in Q3 cannot start evaluating ABBYY in Q1 and expect results by Q4.

**Problem 3: The pipeline-VDR gap.** VDR incumbents (Intralinks, Datasite, Ansarada) charge $0.40–$0.85 per page with no pipeline integration. DocSend has engagement analytics but no processing. The documents that end up in a VDR arrived there via a completely separate process — OCR'd by one tool, redacted by another, archived by a third, then manually uploaded to the VDR. There is no platform that closes this loop natively.

ClawQL closes all three gaps simultaneously.

---

## Part 2: The Honest Positioning

### What ClawQL IDP Is

A sovereign, modular Intelligent Document Processing platform that closes the full document lifecycle in a single system:

**Ingest → Classify → Convert → OCR → Redact → Archive → Semantically index → Distribute securely**

Available self-hosted (Apache 2.0 core, free forever) or managed hosted (Starter at $299/mo).

AI agents — accessed via a single MCP endpoint or natural language in Cursor/Claude Code — orchestrate the entire pipeline without custom integration code.

### What ClawQL IDP Is Not (Honest Scope)

- **Not a replacement for ABBYY or Hyperscience at millions-of-documents-per-month enterprise scale.** At that volume, the managed infrastructure investment and vertical-specific extraction model depth of Hyperscience may justify the cost. ClawQL targets teams processing hundreds to tens of thousands of documents per month who need pipeline integration, sovereignty, and price efficiency more than they need a vendor with a 40-year history.
- **Not yet FedRAMP authorized.** Tungsten Automation achieved FedRAMP High ATO in March 2026. ClawQL does not have this. US federal government procurement requires FedRAMP; ClawQL is not in scope for that buyer today.
- **Not a forms-automation RPA platform.** Kofax TotalAgility and UiPath Document Understanding integrate deeply with RPA bot orchestration. ClawQL's agent model is different — AI agents, not RPA bots. For teams already standardized on UiPath RPA, Document Understanding integrates natively in a way ClawQL doesn't.

### The Honest Differentiator Claims

These are claimable now, on verifiable evidence:

1. **Most affordable full-pipeline IDP with VDR on the market.** Starter ($299/mo, $3,588/year) includes unlimited documents, full pipeline (Tika + Gotenberg + Stirling + archive layer + Onyx), ConeShare VDR, Merkle audit trails, MCP-native access, and no per-page or per-document meter.
2. **The only IDP platform that is also an inference gateway and MCP server.** The IDP buyer can start with documents and expand to inference, memory, and agent governance without changing their endpoint or their vendor.
3. **The only IDP with native MCP access from any AI assistant.** "Process these invoices, redact PII, archive, and create a data room" as a natural language instruction — no custom integration work.
4. **Cryptographic audit trail per processing step.** Merkle-chained, independently verifiable, per-step — especially for lending, healthcare, legal, and M&A.
5. **Self-hosted, air-gapped, data-sovereign.** Every processing step can run in the operator's own infrastructure.
6. **Deployment in hours, not months.** `helm install clawql charts/clawql-full-stack --namespace clawql`.

### The Claim to Avoid Until It's Earned

**"Best IDP on the planet"** — not claimable as a blanket statement yet. Claimable with specificity: "the best IDP for teams that need pipeline integration, data sovereignty, agentic access, and price efficiency."

---

## Part 3: The Standalone IDP GTM Motion

### The IDP Buyer Is a Different Person

The inference-first motion targets developers. The IDP buyer is often:

- A **VP of Operations** at a lending company who processes 400 mortgage applications a month
- A **Legal Ops Manager** at a law firm who manages discovery document sets across matters
- A **Transaction Coordinator** at a real estate brokerage who assembles deal packages for 30 transactions at a time
- A **Controller** at a Series C who manually re-enters invoice data from a disconnected OCR tool
- A **Compliance Officer** at a healthcare organization who needs HIPAA-compliant document processing with a verifiable audit trail

None of these people care about PAL routing or the Intelligence Flywheel first. They need: process my documents, redact what needs redacting, archive them properly, share them securely — for less than I'm paying now, without a 6-month implementation.

### The IDP Entry Points

1. **SaaS replacement** — "You're paying for 5–10 tools. We're one system." Target: teams paying $500–$5,000/month across disconnected SaaS.
2. **VDR cost** — "You're paying $0.40–$0.85 per page. We include unlimited VDRs in $299/mo." Target: M&A, real estate, legal deal rooms.
3. **Compliance** — "Your current IDP can't prove how a document was processed." Target: CISO-adjacent, compliance, regulated industries.
4. **Integration** — "Your current IDP extracts and stops. Ours closes the loop from natural language." Target: ops leads, platform engineers.

### The IDP Expansion Ladder

Unlike inference-first (inference → memory → documents), IDP expands documents → everything else:

| Horizon      | Outcome                                                           |
| ------------ | ----------------------------------------------------------------- |
| **Day one**  | Full pipeline operational (`helm install` or hosted trial)        |
| **Week 2**   | Semantic cross-referencing via `knowledge_search_onyx`            |
| **Month 2**  | HITL for low-confidence extractions (`hitl_enqueue_label_studio`) |
| **Month 3**  | MCP access from AI assistants for natural-language ops            |
| **Month 4+** | Inference + memory discovered on the same platform                |

### The IDP Competitive Table for Sales Conversations

| Dimension            | ABBYY Vantage          | Hyperscience          | Rossum               | Intralinks (VDR)       | ClawQL IDP                 |
| -------------------- | ---------------------- | --------------------- | -------------------- | ---------------------- | -------------------------- |
| Entry price          | $15,000+/yr (est)      | $30,000+/yr (est)     | $18,000/yr           | $10,000+/yr            | **$3,588/yr**              |
| Per-document meter   | Yes ($0.02–$0.10/page) | Yes (~$1.50/page est) | Yes                  | Yes ($0.40–$0.85/page) | **No**                     |
| Implementation time  | Weeks to months        | 3–12 months           | Weeks to months      | Days                   | **Hours**                  |
| Self-hosted          | Partial                | Partial               | No                   | No                     | **Yes (free)**             |
| VDR included         | No                     | No                    | No                   | VDR only (no pipeline) | **Yes**                    |
| Pipeline integration | Extraction + handoff   | Extraction + handoff  | Extraction + handoff | Distribution only      | **Full pipeline**          |
| MCP-native           | No                     | No                    | No                   | No                     | **Yes**                    |
| Cryptographic audit  | No                     | No                    | No                   | No                     | **Yes (Merkle)**           |
| AI agent interface   | No                     | No                    | No                   | No                     | **Yes**                    |
| Semantic search      | No                     | No                    | No                   | No                     | **Yes (Onyx)**             |
| Deployment model     | Cloud/partial on-prem  | Cloud/on-prem         | Cloud                | Cloud                  | **Self-hosted or managed** |
| Inference gateway    | No                     | No                    | No                   | No                     | **Yes (same binary)**      |

### IDP Objection Handlers

**"We need a Gartner Magic Quadrant vendor."**  
Gartner's MQ validated the category ClawQL competes in; it did not evaluate open-source IDP platforms in that cycle. Evaluate on your document types, deployment timeline, TCO, and whether the IDP stops at extraction or closes the full pipeline.

**"We need proven enterprise scale — millions of documents per month."**  
At true millions-per-month scale, Hyperscience/Tungsten may be the better fit. ClawQL targets hundreds to tens of thousands of documents per month with pipeline integration, sovereignty, and cost efficiency.

**"We need FedRAMP."**  
ClawQL does not have FedRAMP authorization. Tungsten Automation achieved FedRAMP High ATO in March 2026 — tell buyers this before evaluation.

**"Your pipeline sounds complex to set up."**  
One Helm chart. One command. Competitors require dedicated implementation teams and months of configuration.

**"We already have Paperless-ngx / Nextcloud / Stirling individually."**  
ClawQL is the orchestration layer that connects them, makes them MCP-callable, and closes the loop with Onyx + ConeShare VDR.

---

## Part 4: clawql.com/idp — Landing Page Brief

### Purpose

Convert the IDP buyer who has never heard of ClawQL and doesn't know it's also an inference gateway. Answer "Is this the document processing platform I've been looking for?" in 10 seconds; trial or demo in 60 seconds.

**Do not lead with:** PAL routing, Intelligence Flywheel, inference, WORM call store, or developer-tool framing. Those are expansion reasons, not entry reasons.

### Above the Fold

**Headline (test both):**

- Option A: "Document processing that doesn't stop at extraction."
- Option B: "Your IDP costs $150,000/year. Ours costs $299/month. And it does more."

**Subheadline:** ClawQL is the only document processing platform that closes the full document lifecycle — ingest, convert, OCR, redact, archive, semantic search, and secure distribution — in a single system, orchestrated by AI agents, at a price no incumbent can match.

**CTAs:** `Start free trial` (14-day Starter, no card) · `Deploy self-hosted` → docs quickstart IDP

**Trust anchors:** Apache 2.0 core · 1,000+ formats · Deploys in hours · Merkle audit trail per step

### Page Sections (build order)

1. **Pipeline visual** — Intake → Convert → Process → Archive → Distribute (Nextcloud/Email → Gotenberg → Stirling → Onyx → ConeShare)
2. **Price comparison table** — ABBYY / Hyperscience / Intralinks / ClawQL hard numbers
3. **Three things your current IDP can't do** — cross-reference during processing; close the VDR loop; prove it cryptographically
4. **Five-minute setup** — Helm one-liner + natural-language workflow example + hosted trial link
5. **Supported document types** — industry grid (financial, legal, real estate, healthcare, general)
6. **Vertical callouts** — Lending · Legal/M&A · Real estate → plugins/verticals
7. **Security and compliance** — self-hosted/air-gapped · Merkle · PII redaction · Istio mTLS
8. **Pricing expanded** — Starter callout vs ABBYY median / Intralinks per-page
9. **Footer CTAs** — trial · self-host · enterprise call

---

## Part 5: Where clawql.com/idp Sits in the Site Architecture

**Recommendation: section of clawql.com, not a separate microsite.**

Keep SEO authority, shared pricing/docs/trial, and a natural path from IDP buyer → full platform. Artificial microsite walls slow expansion.

**Navigation (target):**

```
clawql.com/inference    → inference-first motion (developer audience)
clawql.com/idp          → IDP-first motion (operations/compliance audience)
clawql.com/enterprise   → enterprise/sovereign motion (CISO/CTO audience)
```

This playbook lives at **[clawql.com/idp/gtm](https://clawql.com/idp/gtm)**. The public marketing landing (`clawql.com/idp`) should implement Part 4 when ready.

---

## Part 6: The IDP-First GTM as Its Own Revenue Motion

The inference-first motion is product-led. The IDP-first motion often hits budget owners already spending $500–$5,000/month on disconnected SaaS — a cleaner "replace my stack" conversation.

ClawQL IDP is **not** "the document plugin for ClawQL." It is a standalone Intelligent Document Processing platform that competes with ABBYY Vantage, Hyperscience, and Intralinks — and wins on price, deployment speed, pipeline integration, and agentic access. The inference gateway is what happens when an IDP buyer discovers ClawQL does more than documents.

### Funnel

```
PragmaticVectors essays          clawql.com/idp              docs.clawql.com
─────────────────────────    →   ─────────────────────   →   ─────────────────────
"Why Your IDP Doesn't              "This solves it"            Pipeline + Helm
Know About Your APIs"
"The Audit Trail You               Price comparison            Vertical guides
Can't Reconstruct"                 Pipeline diagram            HITL / security
                                   Vertical callouts
                                   Trial CTA
```

### Planned PragmaticVectors essays

- **Essay 9:** "The $150,000 Invoice" — real TCO of ABBYY/Hyperscience vs ClawQL
- **Essay 10:** "The Per-Page Trap" — Intralinks-style VDR pricing opacity vs flat-rate pipeline+VDR

---

## Part 7: The IDP Positioning Statement (One Paragraph)

> ClawQL is the Intelligent Document Processing platform that closes the full document lifecycle — ingest, convert, OCR, redact, archive, semantic search, and secure distribution — in a single system, orchestrated by AI agents, with a cryptographic audit trail at every step. It deploys in hours, starts at $299/month (versus $15,000–$150,000+ for ABBYY or Hyperscience), includes unlimited VDRs (versus $0.40–$0.85 per page for Intralinks), and is available self-hosted for free. It is the only IDP platform that is also a native MCP server — meaning any AI assistant that supports MCP can operate the full pipeline via natural language, without custom integration code. For teams in lending, legal, real estate, healthcare, or M&A who need document intelligence without a six-figure contract, a six-month implementation, or a per-page surprise on every invoice.

---

_July 2026 · ClawQL IDP GTM, Landing Page Brief & Positioning_  
_For internal use. Do not distribute without review._
