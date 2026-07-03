# Security & compliance

**For:** Chief Compliance Officer, Risk, Internal Audit, Information Security, Vendor Management, and legal counsel conducting **vendor diligence** on See The Greens LOS.

**Not for:** ClawQL MCP or Kubernetes hardening — technical operators should request the **ClawQL security package** separately under NDA.

---

## Summary

See The Greens is built for **regulated lending**. Security and compliance controls are part of the **baseline product**, not a paid add-on.

| Control area | Summary |
| ------------ | ------- |
| **Access** | Role-based access; least privilege for processors, underwriters, admins, and integrations |
| **Data protection** | Encryption in transit and at rest; tenant isolation in multi-tenant deployments |
| **Audit** | Tamper-evident activity records for document touches, system recommendations, and human decisions |
| **Human oversight** | Licensed staff retain credit and underwriting authority; AI pre-processes and suggests |
| **Compliance support** | Configurable rules for TRID, RESPA, ATR/QM, and investor overlays — continuous checks, not only post-close QC |

---

## Who should read which section

| Your role | Start here |
| --------- | ---------- |
| **Compliance / Legal** | [Regulatory alignment](#regulatory-alignment), [Audit & exam support](#audit-and-exam-support) |
| **InfoSec / Vendor risk** | [Data handling](#data-handling), [Identity & access](#identity-and-access), [Infrastructure](#infrastructure-and-operations) |
| **Internal audit / QC** | [Audit and exam support](#audit-and-exam-support), [Human-in-the-loop](#human-in-the-loop) |
| **Production / Ops** | [Human-in-the-loop](#human-in-the-loop) — day-to-day gates and overrides |

---

## Data handling

### What data the system processes

- Loan and borrower **metadata** you provide (loan number, milestone, program, investor)
- **Documents** uploaded to the loan file (PDF, images, common office formats)
- **Extracted fields** derived from those documents (amounts, dates, employer names, etc.)
- **Activity records** (who uploaded, what the system recommended, what a human accepted or changed)

See The Greens does **not** require you to send data to a public LLM for core document validation. Extraction and validation run in **your contracted deployment boundary** (managed cloud, dedicated environment, or self-hosted).

### Sensitive data

- **PII and NPI** are handled according to your policies and applicable law (GLBA, state privacy rules, etc.).
- **Redaction and remediation** can run **before** long-term storage when your overlay requires it (e.g. unnecessary account numbers on statements).
- **Retention** — document and audit retention periods are **configurable** to match your records management policy.

### Encryption

| State | Standard |
| ----- | -------- |
| **In transit** | TLS 1.2+ for all client and API connections |
| **At rest** | Industry-standard encryption for databases and object storage in managed deployments |

Self-hosted customers apply their own key management (KMS/HSM) per their enterprise standards.

### Data residency

Dedicated and self-hosted options support **US-only** or **customer-specified region** requirements. Confirm residency in your order form and DPA.

---

## Identity and access

### Role-based access control (RBAC)

Access is granted by **role**, not shared credentials:

| Typical role | Access pattern |
| ------------ | -------------- |
| **Processor** | Assigned loans; upload docs; clear conditions; no system config |
| **Underwriter** | Read file + extractions; decision authority per your policy |
| **Admin / Ops** | Configure rules, overlays, integrations |
| **Integration service account** | Scoped API keys — read and/or write per integration |
| **Auditor (read-only)** | Export activity and document history; no production changes |

**Separation of duties:** configuration changes (rules, overlays, integration secrets) can require **admin** roles distinct from day-to-day processing — including optional **two-person** patterns for high-risk human-review queues.

### Authentication

- **SSO / SAML / OIDC** for enterprise identity providers (Okta, Azure AD, Google Workspace, etc.)
- **MFA** enforced when your IdP requires it
- **API credentials** rotated on a schedule you define; integration keys are not shared across environments (prod vs UAT)

### Session and integration security

- Short-lived tokens for interactive users
- Webhook endpoints protected by **signed secrets** and allowlisted sources
- Failed authentication attempts logged for security monitoring

---

## Human-in-the-loop

See The Greens is **not** an autonomous underwriting engine.

| Step | System | Human |
| ---- | ------ | ----- |
| Document read & classify | Automated | — |
| Guideline check | Automated against **your** rules | — |
| Low-confidence extraction | Routed to **review queue** | Processor validates or corrects |
| Credit / UW decision | — | **Licensed staff only** |
| Condition cleared | System tracks satisfaction | Processor / UW confirms |

When AI confidence falls below your threshold — or policy always requires review for a doc type (e.g. W-2 in high-touch programs) — the loan **does not silently proceed**. Work waits in a **human review queue** with a full audit of what was suggested and what was changed.

This design supports **fair lending and explainability** discussions: decisions are attributable to **named users**, not a black box.

---

## Audit and exam support

### What gets recorded

For each meaningful event, the system retains:

- **Timestamp** and **actor** (user or integration)
- **Document** or loan object affected
- **System recommendation** (e.g. “create LOX for $48,500 deposit”)
- **Human action** (accepted, modified, rejected)
- **Rule or overlay version** that fired (when applicable)

Records are designed to be **tamper-evident** — suitable for investor repurchase defense, internal QC, and regulatory exam prep — not mutable application logs that can be edited without trace.

### What you can export

- Per-loan **activity timeline** (PDF or structured export)
- **Condition history** — auto-created vs manual
- **Document version chain** — what replaced what, and when
- **Configuration snapshots** — which overlay was active on a given date

### QC starts at intake

Traditional QC samples closed files. See The Greens pushes validation **forward**:

- Defects surface when documents **arrive**
- Conditions tie to **extracted evidence**, not only checklist templates
- Exam questions like *“show me how this LOX was triggered”* map to a **single trace**

---

## Regulatory alignment

See The Greens **supports** compliance programs; it does not replace your compliance officer or legal interpretation.

| Area | How the product helps |
| ---- | --------------------- |
| **TRID / RESPA** | Event-driven disclosure and change-of-circumstance **rules** tied to loan milestones and data changes |
| **ATR/QM** | Document completeness and income documentation checks at intake — configurable to your ATR policy |
| **Investor / GSE overlays** | Separate rule packs per investor; same engine, different thresholds |
| **Fair lending** | Human decisions logged; automated steps rule-based and versioned |
| **Records retention** | Configurable retention and export for your records management |

**Important:** Final compliance determination remains with **your institution**. We provide configurable automation and audit evidence; you own overlay content and sign-off.

---

## Infrastructure and operations

See The Greens runs on infrastructure designed for **regulated workloads**. Under the hood, the platform inherits controls from the **ClawQL** open-source stack (supply-chain scanning, signed container images, secrets management patterns).

### Operational security (typical managed deployment)

| Practice | Purpose |
| -------- | ------- |
| **Vulnerability scanning** | Images and dependencies scanned before release |
| **Signed artifacts** | Deployments reject unverified container images |
| **Secrets management** | Integration tokens and API keys stored in vault-backed secrets — not in source code |
| **Network isolation** | Production environments segmented from development |
| **Monitoring & alerting** | Security-relevant events forwarded to your SIEM (optional) |

Self-hosted customers implement the same patterns in their cluster using the **reference security architecture** provided during onboarding.

### Availability and continuity

- **Backups** — databases and document storage on a schedule defined in your SLA
- **Disaster recovery** — RPO/RTO targets documented in enterprise agreements
- **Incident response** — security contact and notification process in the **MSA / DPA**

---

## Certifications and diligence

| Topic | Status (update before publishing) |
| ----- | -------------------------------- |
| **SOC 2 Type II** | _[ In progress / available under NDA — confirm with legal before claiming on site ]_ |
| **Penetration testing** | _[ Annual third-party test — summary available under NDA ]_ |
| **Questionnaires** | SIG Lite, CAIQ, or custom VRM forms supported for enterprise deals |

**Do not imply certification on the marketing site until complete.** The homepage badge “SOC 2 — Enterprise security standards” should link here and state actual status.

### Standard diligence deliverables

Upon request under NDA:

- Architecture overview (this document + [Architecture](./architecture.md))
- Data flow diagram (tenant boundary)
- Subprocessor list (managed cloud)
- Incident response summary
- ClawQL platform security overview (for technical reviewers)

Contact: **[demo / security@ — fill in]**

---

## Subprocessors and AI

Managed deployments may use **infrastructure subprocessors** (cloud hosting, object storage, monitoring). A current list is provided in the **DPA**.

**Document intelligence** runs in your deployment boundary. If optional **third-party model APIs** are enabled for a specific feature, they are **explicitly configured** — not enabled by default without contract review.

---

## Your responsibilities (shared model)

| You provide | We provide |
| ----------- | ---------- |
| Accurate overlay and investor rule content | Engine to evaluate rules and log results |
| IdP / SSO configuration | RBAC integration |
| Legal and compliance sign-off | Audit exports and configuration versioning |
| Integration credentials (pricing, LOS, etc.) | Secure storage and scoped API access |
| User training on human-review queues | Product documentation and onboarding |

---

## Security FAQ

**Does AI make underwriting decisions?**  
No. AI extracts, classifies, and checks documents against **your** rules. Credit and underwriting decisions stay with licensed staff.

**Can we audit what the system recommended vs what a processor did?**  
Yes. That comparison is a first-class part of the activity record.

**Where is data stored?**  
In the deployment model you contract for (multi-tenant managed, dedicated VPC, or self-hosted). Confirm region in your agreement.

**Can we disable features we don’t want?**  
Yes. Integrations, optional automation, and specific doc types can be toggled per environment.

**How do you handle a security incident?**  
Per the incident response plan in your MSA: notification timelines, point of contact, and cooperation with your forensics process.

**Is the platform open source?**  
The **orchestration platform** (ClawQL) is open source. See The Greens LOS is the **lender product** — UX, lending rules packs, and managed ops — built on that platform.

---

## Related

- [How See The Greens works](./architecture.md) — workflow and integrations for ops and IT
- [seethegreens.com](https://seethegreens.com/) — product overview and demo request
- [ClawQL security documentation](../security/README.md) — for technical platform reviewers (separate from this lender-facing page)

---

**Next step:** Request a **security diligence pack** or [book a demo](https://seethegreens.com/#demo) with your compliance and InfoSec stakeholders on the call.
