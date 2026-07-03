# How See The Greens works

**For:** Operations leaders, production managers, processing supervisors, and IT integration leads evaluating a modern loan origination system.

**Not for:** Software engineers wiring MCP tools or Kubernetes — see [Powered by ClawQL](#powered-by-clawql) at the bottom.

---

## What you get

See The Greens is a **loan origination system** built around one idea: **catch document and compliance issues when files arrive**, not weeks later in post-close QC.

Your team still makes every credit and underwriting decision. The system handles repetitive work — reading documents, checking them against investor and agency rules, organizing the file room, and opening conditions when data says something needs attention.

| Role | What changes |
| ---- | ------------ |
| **Processors** | Review **exceptions** (large deposits, missing pages, guideline mismatches), not every upload |
| **Underwriters** | Work from a cleaner file with pre-validated extractions and a clear condition list |
| **Ops / QC** | Audit trail starts at **intake**, not after closing |
| **IT** | One API surface for documents, workflows, and notifications instead of a patchwork of OCR vendors |

---

## A loan file, step by step

Below is a **representative purchase-money workflow** — the same pattern shown on the homepage (Loan #4821, bank statement, large deposit → Letter of Explanation).

```text
Borrower / LO uploads documents
        │
        ▼
┌───────────────────────────────────────┐
│ 1. Intake & organize                  │
│    Auto-categorize (W-2, paystub,     │
│    bank statement, purchase contract) │
│    Replace outdated versions          │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│ 2. Extract & validate on arrival      │
│    Read fields (deposits, income,     │
│    dates, employer, tax boxes)        │
│    Check against GSE / investor       │
│    overlays you configure             │
└───────────────────────────────────────┘
        │
        ├── Pass ──► File stays green; conditions clear as docs satisfy rules
        │
        └── Exception ──► Condition created (e.g. LOX for large deposit)
                │
                ▼
        ┌───────────────────────────────────────┐
        │ 3. Human review (when required)       │
        │    Processor accepts, modifies, or    │
        │    escalates — AI does not approve    │
        │    the loan                         │
        └───────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────┐
│ 4. Compliance & disclosure hooks      │
│    Rules fire on loan events (TRID,   │
│    CoC, investor-specific checks)     │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│ 5. Audit record                       │
│    Who touched what, when, and what   │
│    the system recommended vs. what    │
│    your team decided                  │
└───────────────────────────────────────┘
```

**Mortgage-first today.** Auto, BNPL, and commercial use the **same document and rules engine** with different guideline packs — not a separate product rewrite.

---

## Example: large deposit on a bank statement

This is the workflow buyers ask about most often.

1. **Upload** — Processor or borrower drops `BankStatement_Jan2026.pdf` on the loan.
2. **Extract** — System reads transaction lines and balances (not just OCR text).
3. **Validate** — A deposit of **$48,500** on Jan 14 exceeds your configured threshold.
4. **Recommend** — UI shows: *Income verified against W-2 and paystub* ✓ and *Large deposit detected* ⚠.
5. **Condition** — **Letter of Explanation** is **auto-added** to the loan’s condition list with the extracted amount and date pre-filled.
6. **Human** — Processor accepts the recommendation, edits wording, or rejects and writes their own — then clears the condition when the LOX is on file.

No one waited for a QC sample. The exception surfaced **in real time**.

The same pattern applies to missing W-2 pages, income gaps, expired documents, and investor-specific overlays — configured as **rules**, not one-off IT projects.

---

## What AI does — and does not do

| AI handles | Your licensed staff handle |
| ---------- | ------------------------- |
| Document classification and renaming | Credit decisions and approvals |
| Field extraction (W-2, paystub, bank stmt, tax returns) | Final underwriting sign-off |
| Guideline checks against configured overlays | Exceptions that need judgment |
| Condition **suggestions** from extracted data | Clearing conditions and file status |
| File-room hygiene (versions, categories) | Client communication and disclosures |

**Human-in-the-loop is default**, not an upgrade tier. When confidence is low or policy requires it, work routes to a **review queue** before the loan moves forward.

---

## How this differs from a legacy LOS + bolt-on OCR

| Topic | Typical legacy stack | See The Greens |
| ----- | -------------------- | -------------- |
| Document intelligence | Batch OCR or manual indexing | Validated **on upload** against your overlays |
| Conditions | Template checklists + manual entry | Generated from **extracted fields** and loan data |
| File room | Processors rename and sort | Self-organizing categories and version control |
| Memory across sessions | Often lost between tools or users | **Persistent loan context** for the file |
| Audit | Mutable logs, sample QC | **Tamper-evident** activity record per touch |
| Automation changes | IT release cycles | **Ops-configurable rules** for most workflow changes |
| Future agent tools | Siloed vendor APIs | **Unified gateway** — same APIs for people and approved automations |

---

## Integrations (IT view)

See The Greens is designed to sit in a **modern lender stack**, not replace every system on day one.

**Typical connection points:**

- **Document providers** — ingest from email, portal upload, or LOS document APIs
- **Pricing / PPE** — loan events trigger status and milestone updates
- **CRM / POS** — borrower and LO metadata sync via REST
- **Servicing / post-close** — export closed-loan packages and audit bundles
- **Notifications** — Slack, email, or webhook for milestone and exception alerts

**Integration model:** REST APIs and webhooks with role-scoped credentials. Your team defines which systems may **read** loan data vs **write** conditions or documents.

For a technical integration workshop, request a [demo](https://seethegreens.com/#demo) with your stack diagram — we map phases (read-only → bi-directional → cutover).

---

## Deployment options

| Model | Best for |
| ----- | -------- |
| **Managed cloud** | Fastest time to value; we operate the platform; you configure rules and integrations |
| **Dedicated / VPC** | Stricter data residency or network isolation with managed ops |
| **Self-hosted** | Maximum control; your infrastructure team runs the environment with our reference architecture |

All models share the **same product logic** — deployment choice affects **where data lives and who runs the cluster**, not a forked codebase.

---

## Reliability and observability (ops view)

Operations teams get **dashboards and exports** for:

- Document processing volume and error rates
- Condition auto-creation vs manual overrides
- Review-queue depth and turnaround
- Compliance rule hits and disclosure triggers

Your team can answer: *“Why did this loan get a LOX yesterday?”* with a **traceable path** from upload → extraction → rule → condition → processor action.

---

## Frequently asked questions (architecture)

**Do we have to replace our current LOS on day one?**  
Many lenders start with **document intelligence and condition automation** alongside an existing LOS, then expand. Migration planning is part of onboarding.

**Can we use our own investor overlays?**  
Yes. Guideline and investor rules are **configurable** — not hard-coded to a single investor.

**What document types are supported out of the box?**  
W-2s, paystubs, bank statements, tax returns, IDs, purchase agreements, and common mortgage attachments. Custom types use the same classification and extraction pipeline.

**How long does implementation take?**  
Depends on integration scope and overlay complexity. A focused pilot (one doc type + one rule set) is designed to show value quickly before a broad rollout.

---

## Powered by ClawQL

See The Greens is built on **[ClawQL](https://github.com/danielsmithdevelopment/ClawQL)** — an open orchestration platform for production-grade document processing, workflow automation, and audit in regulated environments.

- **Lender buyers** — stay on this page and [Security & compliance](./security-and-compliance.md).
- **Platform / engineering teams** — ClawQL open-source docs, IDP pipeline reference, and Helm deployment guides.

---

**Next step:** [Book a demo](https://seethegreens.com/#demo) — we walk through your document types and a condition workflow on a live file.
