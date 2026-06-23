---
title: "Compliance and Regulatory Mapping: GDPR, HIPAA, SOC 2 Type II, and EU AI Act"
series: "Agentic AI Security Curriculum"
level: advanced
tags:
  - gdpr
  - hipaa
  - soc2
  - eu-ai-act
  - compliance
part: 29
total_parts: 32
date: "May 2026"
slug: "compliance-regulatory-mapping"
canonical_path: "/security/best-practices/compliance-regulatory-mapping"
description: "Map controls to GDPR, HIPAA, SOC 2, and EU AI Act with cryptographic erasure and evidence packages."
prev: "disaster-recovery-business-continuity"
next: "human-operator-security-admin-controls"
---

# Compliance and Regulatory Mapping: GDPR, HIPAA, SOC 2 Type II, and EU AI Act

GDPR, HIPAA, SOC 2 Type II, and EU AI Act

Hello and welcome to Module 29!

Modules 1–28 have given us a complete technical security architecture that is robust, auditable, and agentic-specific. But technical security and regulatory compliance are not the same thing. A system can be genuinely secure and still fail an audit because the evidence of that security was never collected, retained, or packaged in the form an auditor can verify.

In this module we map every control in the platform to its specific obligations under GDPR, HIPAA, SOC 2 Type II, and the EU AI Act. We resolve genuine architectural conflicts (such as GDPR’s right to erasure versus WORM immutability) with cryptographic erasure. And we show how to generate continuous audit evidence packages directly from the infrastructure we have already built. By the end you will have audit readiness as a continuous state — not a last-minute scramble.

---

Why Compliance Mapping Is a Distinct Discipline

Technical controls prove “we are secure.”  
 Regulatory compliance proves “we can demonstrate we are secure over time.”

The difference is evidence:

- Controls must exist.

- Controls must continuously produce verifiable proof that they operate.

Compliance mapping also surfaces real architectural tensions that pure security engineering can miss (e.g., GDPR erasure vs. immutable WORM logs). We treat compliance as an engineering discipline, not an after-the-fact documentation exercise.

---

GDPR: Data Subject Rights vs. WORM Integrity

The central conflict is Article 17 (right to be forgotten / erasure) versus our immutable, append-only memory store and WORM-backed audit logs.

Resolution: Cryptographic erasure

- Each data subject’s memory entries are encrypted with a unique per-subject key stored in Vault’s transit engine.

On erasure request:

vault delete transit/tenant-a/keys/subject-key-${DATA_SUBJECT_ID}

-
- The ciphertext remains in the store (preserving Merkle integrity and forensic history).

- The data is permanently irrecoverable because the key is gone.

This satisfies GDPR Recital 26: data that cannot be attributed to an identified person is no longer personal data, while keeping the audit trail intact.

Additional GDPR mappings:

- Article 30 (records of processing): Generated automatically from the WORM audit trail (agent ID, session, data classification, redacted entity types, timestamp).

- Cross-border transfers: Replication paths are documented in the Record of Processing Activities (RoPA). Standard Contractual Clauses (SCCs) are in place for any EU-to-non-EU DR replication (Module 28).

- Article 32 (technical measures): Mapped explicitly — pseudonymisation (Modules 15 & 18), integrity (Modules 18 & 26), availability (Module 28), testing (Modules 24 & 25).

---

HIPAA: PHI-Handling Deployments

First determine applicability: Does the deployment process health condition, care provision, or payment data that identifies individuals?

When PHI is in scope, we add these controls beyond the standard stack:

- Unique user identification (Module 10) — one identity per agent.

- Automatic logoff: gateway sessions enforce ≤15-minute inactivity timeout.

- Audit controls: 6-year WORM retention for PHI-handling tenants (HIPAA minimum).

- Integrity: Merkle tree (Module 18) satisfies the requirement that PHI cannot be improperly altered without detection.

- Transmission security: mTLS (Module 4) + NATS message encryption (Module 18).

Additional requirements:

- Business Associate Agreement (BAA) must be in place with every data-path component vendor (cloud provider, Vault hosting, external APIs).

- Breach notification: The PICERL process (Module 20) produces the timeline. A Breach Risk Assessment (BRA) determines reportability under the four-factor test. Notification deadline is 60 days.

---

SOC 2 Type II: Control Mapping

SOC 2 Type II requires evidence that controls operated effectively over the audit period. Our platform produces that evidence continuously.

Key mappings:

- CC6 (Logical and Physical Access): Modules 4, 7, 9, 10, 12, 30 — RBAC, mTLS, scoped tokens, agent lifecycle, ATR enforcement, admin controls.

- A1 (Availability): Modules 25 (quarterly review), 26 (patch cadence), 28 (DR/BCP).

- PI1 (Processing Integrity): Modules 12 (schema validation), 18 (Merkle integrity), 14 (signed subagent results).

- C1 (Confidentiality): Modules 15 (classification), 18 (cryptographic erasure), 27 (multi-tenant isolation).

- P (Privacy): Modules 15 (redaction), 29 (GDPR mapping), 18 (erasure).

Type II evidence:

- Quarterly evidence packages are generated automatically from WORM + Merkle roots + Panguard logs.

- These packages form the body of evidence for the audit period.

- Common SOC 2 findings in agentic platforms (e.g., missing evidence of least-privilege enforcement, inadequate audit logging) are directly addressed by the modules above.

---

EU AI Act: High-Risk Classification and Obligations

Determine high-risk status using Annex III categories (employment, essential services, law enforcement, critical infrastructure).

Key obligations and how we meet them:

- Article 9 (Risk Management System): STRIDE model (Module 22) + OWASP mapping (Module 23) + red-team programme (Module 24) + quarterly review (Module 25).

- Article 10 (Data Governance): Classification at ingestion (Module 15) + memory integrity (Module 18) + DLP (Module 6).

- Article 13 (Transparency): Technical summary provided to deployers — intended purpose, capabilities, limitations, HITL mechanisms, performance characteristics.

- Article 14 (Human Oversight): HITL controls (Module 12) — documented which tools are gated, the review process, and escalation path.

- Article 15 (Accuracy and Cybersecurity): Adversarial testing programme (Module 24) + full security stack.

---

Producing Audit Evidence from Existing Infrastructure

We do not build separate compliance systems — we extract evidence from the platform we already run.

- WORM retention policy is set to the longest requirement across all frameworks (7 years satisfies HIPAA 6-year + SOC 2 overlap).

- Chain of custody: WORM Object Lock metadata + Merkle root chain + signing key certificate chain.

- Automated quarterly evidence package: signed, encrypted with the compliance team’s public key, generated before each quarterly review.

- Package contents: Panguard decision logs, Merkle roots, quarterly review reports, red-team reports, patch deployment records, access provisioning records.

Audit readiness is now a continuous state (quarterly evidence packages, WORM retention, Merkle chain) rather than a periodic scramble.

---

Key Takeaways (Memorize These!)

- Cryptographic erasure (key deletion) is the only architecturally coherent solution to the GDPR erasure/WORM conflict.

- HIPAA adds inactivity timeouts, 6-year retention, BAA requirements, and a documented BRA process — all of which must be explicitly verified, not assumed.

- SOC 2 Type II evidence is produced continuously by the infrastructure already built; the compliance task is collecting and retaining it correctly.

- Audit readiness as a continuous state (quarterly evidence packages, WORM retention, Merkle chain) is cheaper than audit preparation as a periodic scramble.

You now have a compliance mapping that turns every technical control into auditable evidence across GDPR, HIPAA, SOC 2 Type II, and the EU AI Act. Regulatory requirements are no longer an afterthought — they are satisfied by the same infrastructure that keeps the platform secure. This completes the governance layer that makes the entire platform audit-ready by design.
