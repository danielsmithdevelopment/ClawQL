---
title: "Data Classification and PII Redaction: Tagging, Anonymisation, and Residency Controls"
series: "Agentic AI Security Curriculum"
level: intermediate
tags:
  - pii
  - presidio
  - classification
  - gdpr
  - residency
part: 15
total_parts: 32
date: "May 2026"
slug: "data-classification-pii-redaction-residency"
canonical_path: "/security/best-practices/data-classification-pii-redaction-residency"
description: "Four-level taxonomy, Presidio at write boundaries, and classification-gated recall."
prev: "multi-agent-trust-orchestrator-security"
next: "model-weight-integrity-verification"
---

# Data Classification and PII Redaction: Tagging, Anonymisation, and Residency Controls

Tagging, Anonymisation, and Residency Controls

Hello and welcome to Module 15!

Modules 1–14 have secured our supply chain, cluster, network, gateway, identities, secrets, authentication, lifecycle, sandboxing, runtime enforcement, input validation, and multi-agent pipelines. Now we protect the data itself — the most valuable asset an agent touches.

An agent that reads sensitive information and writes to memory, logs, or external APIs is implicitly classifying that data by what it does with it. Without deliberate classification, sensitive data ends up wherever the agent decides to send it: memory stores, log aggregators, external APIs, or even the WORM audit trail.

In this module we make classification an architectural property of the platform, not a manual review step. By the end you will have automatic tagging at ingestion, Presidio-based redaction at every write boundary, classification-gated tool access, residency enforcement, and safe anonymisation for analytics and testing.

---

The Accidental Data Classification Problem

Every agent becomes a data classifier the moment it processes information — whether the platform was designed that way or not.

Without explicit classification:

- PII or credentials leak into logs

- Sensitive documents are written to public memory stores

- Regulated data crosses geographic boundaries

The damage is already done by the time a human reviews a log. Classification must therefore be enforced by the system at ingestion time, before any tool call processes the data.

---

Classification Taxonomy

We use a simple four-level taxonomy applied at every data ingestion point:

- public — Safe to share externally and include in any output.

- internal — Available within the organization; never sent to external APIs or public memory stores.

- confidential — Restricted to specific agent roles with declared need-to-know; requires HITL for any external disclosure.

- secret — Never written to any persistent store; never transmitted to any external endpoint; key-deleted on session end.

Classification is assigned at the moment data enters the platform (user message, tool result, retrieved document, or API response) and travels with the data as metadata for the rest of its lifecycle.

---

Presidio Entity Detection

Presidio runs as a Panguard-integrated service and is invoked at every memory write, log emission, and external API call.

Detected entity types include:

- PERSON, EMAIL_ADDRESS, PHONE_NUMBER, CREDIT_CARD, US_SSN, IBAN_CODE, IP_ADDRESS, DATE_OF_BIRTH, MEDICAL_LICENSE, URL (conditional)

- Custom recognizers for domain-specific PII: employee IDs, internal project codes, contract numbers

Action on detection:

- Replace the sensitive value with a structured placeholder: [REDACTED:{entity_type}] (preserves format for downstream processing).

- For secret-classified content or credential patterns: the entire write is blocked, not redacted.

Partial redaction of a secret is never sufficient — we reject the operation entirely.

---

Classification-Gated Tool Access

An agent’s ATR claims include a maxClassificationLevel (e.g., internal).

The gateway enforces this at recall time:

- A summarizer agent with max_classification: internal cannot retrieve confidential memory entries.

- Every memory query includes a server-side predicate: tenantId + maxClassification.

Classification level is stored as metadata alongside every memory entry and is enforced server-side, never client-side.

---

Residency Controls

Certain data must remain in a specific geographic region (EU data under GDPR, PHI under HIPAA).

Enforcement:

- Memory store bucket policy restricts confidential entries to the correct region (EU-region buckets for EU tenants).

- Panguard tool-call rule blocks any memory_write that would place residency-controlled data in a non-compliant region.

- Cross-region replication (Module 28) must respect these constraints — GDPR data stays within EU regions.

Residency is enforced at the infrastructure layer, not just documented in policy.

---

Anonymisation for Analytics and Testing

Production data must never be used directly in development, testing, or analytics.

Techniques:

- Synthetic data generation: replace production data with realistic but non-identifying data.

- Pseudonymisation: replace identifying fields with consistent tokens (same person always maps to the same token, but the token is not reversible without the key).

- k-anonymity enforcement: for datasets used in model training or analytics, each record must be indistinguishable from at least _k_-1 other records across quasi-identifying attributes.

These processes run automatically in CI pipelines and test environments.

---

Key Takeaways (Memorize These!)

- Classification at ingestion is the only approach that works — classification applied after the fact misses data that has already propagated.

- Presidio redaction with structured placeholders preserves data format for downstream processing while removing the sensitive value.

- Classification-gated tool access makes over-privileged data access structurally impossible rather than policy-dependent.

- Residency controls must be enforced at the infrastructure layer, not just documented in policy — Panguard + bucket policies are the enforcement mechanism.

You now have data classification as a built-in platform property. Sensitive information is tagged once at ingestion, redacted automatically at every boundary, and only accessible to agents that are explicitly allowed to see it. Residency and anonymisation complete the picture, turning data handling from an accidental risk into a controlled, auditable, and regulation-friendly system.
