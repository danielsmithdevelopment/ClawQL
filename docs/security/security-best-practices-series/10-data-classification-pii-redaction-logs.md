---
title: "Data Classification and PII Redaction: Never Let Sensitive Data Hit Logs"
series: "Agentic AI Security Curriculum"
course_type: "instructor-ready / self-study"
audience: "Security architects, platform engineers, and teams adopting AI agents"
estimated_minutes: 30
level: intermediate
tags:
  - privacy
  - logging
  - pii
  - data-classification
part: 10
total_parts: 20
date: "May 2026"
slug: "data-classification-pii-redaction-logs"
canonical_path: "/security/best-practices/data-classification-pii-redaction-logs"
prev: "mcp-runtime-protection-panguard-atr"
next: "model-integrity-verifying-weights"
description: "Distinguish data classification from redaction and logging policy."
---

# Data Classification and PII Redaction: Never Let Sensitive Data Hit Logs

_Module 10 of 20 · Agentic AI Security Curriculum · May 2026_

## How to use this module

Use it as **self-paced** study or as **instructor-led** training. YAML, commands, and policy excerpts are **illustrative**; map them to your cloud, mesh, identity provider, and agent runtime—substitute your own names, namespaces, and tools while preserving the **control intent**.

**Estimated time:** ~30 minutes reading; add time for linked standards and team discussion.

## Learning objectives

By the end of this module, you should be able to:

1. Distinguish data classification from redaction and logging policy.
2. Design redaction-before-write pipelines for SIEM and long-term retention.
3. Balance privacy obligations with forensic usefulness.

## Prerequisites

- Prior module: [MCP Runtime Protection: Panguard, ATR Rules, and Agentic Threat Mitigation](09-mcp-runtime-protection-panguard-atr.md)

**Suggested discussion / lab:** Pick one diagram in your environment (build, deploy, runtime) and mark where this module’s controls apply; note gaps versus the checklist in the body.

---

Even with strong runtime protection and sandboxing (Modules 8–9), sensitive data inevitably flows through agent sessions, documents, and tool calls. This module explains how to prevent PII, financial data, and other sensitive information from ever reaching persistent log stores.

### Classification vs Redaction

Data classification and redaction are distinct but complementary controls:**Classification** tells you _what_ data is sensitive and how it should be handled.
**Redaction** ensures sensitive data is removed or masked _before_ it is written to any queryable or long-term storage.

Both are required. Classification without redaction leaves raw PII in logs. Redaction without classification leaves you unable to reason about your data holdings.Organizations should maintain a formal data classification policy with tiers (Public, Internal, Confidential, Restricted) that maps to redaction rules.

### Presidio in the Fluent Bit Pipeline

Reference stacks often run Microsoft Presidio as a pipeline stage in Fluent Bit — not as per-pod sidecars.

**Why pipeline-level redaction?**

One consistent redaction engine for all log sources.
Fewer failure modes and surfaces to maintain.
Redaction happens before logs reach Loki.

Presidio identifies and redacts PII (names, SSNs, credit cards, medical records, etc.) and financial data in real time as logs are collected.

### Redaction-Before-Write for WORM Compliance

All security-relevant logs are written to WORM storage. Because redaction occurs before write:No raw sensitive data ever lands in persistent stores.
WORM compliance is maintained without needing record deletion (which defeats WORM).
Forensic value is preserved — enough context remains for investigation while PII is removed.

### Forensic-Friendly Logging Design

Redaction rules are tuned to balance privacy and usability:Entity replacement with tokens (e.g., [REDACTED_SSN]) rather than full removal.
Context around redacted fields is retained where possible.
Full unredacted logs (if ever needed for incident response) are available only through strict break-glass procedures with multi-party approval.

### Key Takeaways

Redaction must happen before data reaches any persistent log store — never after.
Pipeline-level Presidio integration provides consistent, maintainable coverage across the entire platform.
Classification policy + redaction-before-write satisfies both privacy regulations and forensic requirements.
This approach ensures sensitive data never becomes a liability in logs, even during full incident investigations.

Proper data handling completes the protection of information in motion and at rest, enabling safe monitoring and response in the following modules.

**Next module:** Model Integrity – Verifying Weights Before Inference.

## Further reading (vendor-neutral)

These resources are independent of any single product; use them to deepen the topic for audits, architecture reviews, or procurement discussions.

- [Microsoft Presidio](https://microsoft.github.io/presidio/)
- [Fluent Bit](https://docs.fluentbit.io/manual/)
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework)

## Commercial training use

You may reuse this curriculum internally or in **paid consulting / training** engagements. Keep examples aligned to the customer’s actual stack; substitute your own runbooks, tool names, and compliance frameworks (SOC 2, ISO 27001, sector regulators) where cited examples use a reference architecture only.

---
