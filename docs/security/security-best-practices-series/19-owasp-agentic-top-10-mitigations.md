---
title: "OWASP Agentic Top 10: Mapping Risks to Architectural Controls"
series: "Agentic AI Security Curriculum"
course_type: "instructor-ready / self-study"
audience: "Security architects, platform engineers, and teams adopting AI agents"
estimated_minutes: 35
level: advanced
tags:
  - owasp
  - agents
  - llm-security
  - risk-mapping
part: 19
total_parts: 20
date: "May 2026"
slug: "owasp-agentic-top-10-mitigations"
canonical_path: "/security/best-practices/owasp-agentic-top-10-mitigations"
prev: "threat-modeling-stride-agentic-ai"
next: "quarterly-security-review-checklist"
description: "Navigate the OWASP Agentic risk list and map items to layered controls."
---

# OWASP Agentic Top 10: Mapping Risks to Architectural Controls

_Module 19 of 20 · Agentic AI Security Curriculum · May 2026_

## How to use this module

Use it as **self-paced** study or as **instructor-led** training. YAML, commands, and policy excerpts are **illustrative**; map them to your cloud, mesh, identity provider, and agent runtime—substitute your own names, namespaces, and tools while preserving the **control intent**.

**Estimated time:** ~35 minutes reading; add time for linked standards and team discussion.

## Learning objectives

By the end of this module, you should be able to:

1. Navigate the OWASP Agentic risk list and map items to layered controls.
2. Explain why multiple compensating controls beat single-point prompt filters.
3. Communicate residual risk to product and compliance stakeholders.

## Prerequisites

- Prior module: [Threat Modeling with STRIDE for Agentic AI Systems](18-threat-modeling-stride-agentic-ai.md)

**Suggested discussion / lab:** Pick one diagram in your environment (build, deploy, runtime) and mark where this module’s controls apply; note gaps versus the checklist in the body.

---

The OWASP Agentic Top 10 highlights the most critical risks in autonomous AI agent systems. These risks apply to any autonomous agent architecture. This module maps each major risk to the specific controls and architecture patterns that mitigate it.

### 1. Prompt Injection / Jailbreaking

**Risk**: Malicious instructions that override agent behavior.  
**Example control patterns**: ATR scoping + Panguard synchronous enforcement. Capabilities are restricted at the tool level, not through prompt filtering. Natural language is never the security boundary.

### 2. Sensitive Information Disclosure

**Risk**: Leakage of PII, credentials, or proprietary data.  
**Example control patterns**: Presidio redaction in the Fluent Bit pipeline before any log write, combined with GraphQL projection and Memory 2.0 token-budget trimming. Redaction-before-write ensures sensitive data never reaches persistent stores.

### 3. Privilege Escalation

**Risk**: Agent gaining unauthorized access to tools or data.  
**Example control patterns**: JWT ATR claims validated on every MCP call, explicit tool scoping per role/vertical, and least-privilege RBAC. Cross-vertical actions require elevated claims.

### 4. Model Denial of Service

**Risk**: Resource exhaustion through runaway loops or heavy inference.  
**Example control patterns**: GPU ResourceQuota + LimitRange, Panguard rate limiting, and token-budget controls in Memory 2.0 recall.

### 5. Supply Chain Vulnerabilities

**Risk**: Compromised dependencies, images, or model weights.  
**Example control patterns**: Harbor as single trust root with allowlist-only resolution, Cosign keyless signing, golden distroless images, and init-container model weight verification.

### 6. Insecure Output Handling

**Risk**: Agent output leading to command injection or unsafe actions.  
**Example control patterns**: Structured tool calling through the intelligent MCP gateway. All outputs are validated and scoped before execution. No raw shell or direct code execution outside Kata sandboxes.

### 7. Training Data / Memory Poisoning

**Risk**: Contaminated knowledge graph or RAG corpus.  
**Example control patterns**: Merkle-rooted provenance on every Memory 2.0 ingest, Cuckoo filter deduplication, and Presidio redaction on document intake. Cross-vertical recall requires explicit elevated ATR.

### 8. Unauthorized Code Execution

**Risk**: Agent executing arbitrary code.  
**Example control patterns**: Kata Containers as default runtime for all MCP/sandbox workloads, combined with explicit sandbox_exec tool gating and read-only root filesystems.

### 9. Overreliance on Agent Autonomy

**Risk**: Blind trust in agent decisions without oversight.  
**Example control patterns**: Human-in-the-loop via HITL approval gates in automation, audit logging of all decisions, and Merkle-rooted workflow trails for full accountability.

### 10. Multi-Step Tool Chaining Attacks

**Risk**: Agents chaining tools in harmful sequences.  
**Example control patterns**: Intelligent routing engine with historical success scoring and sensitivity checks, plus Panguard session-level ATR rules that evaluate cumulative risk across chained calls.

### Key Takeaways

Defense in depth mitigates the OWASP Agentic Top 10 through defense-in-depth rather than single-point solutions.
The majority of risks are addressed at the architectural level (ATR scoping, sandboxing, cryptographic provenance) rather than reactive prompt filtering.
Every major risk has multiple overlapping controls from different layers of the stack.
This mapping is reviewed quarterly as part of the living STRIDE process (Module 18).

The complete series equips you with both tactical implementation details and strategic understanding of agentic security.

**Next module (final):** Quarterly Security Review Checklist – Keeping Defense-in-Depth Alive.

## Further reading (vendor-neutral)

These resources are independent of any single product; use them to deepen the topic for audits, architecture reviews, or procurement discussions.

- [OWASP Top 10 for Agentic Applications (2026)](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework)

## Commercial training use

You may reuse this curriculum internally or in **paid consulting / training** engagements. Keep examples aligned to the customer’s actual stack; substitute your own runbooks, tool names, and compliance frameworks (SOC 2, ISO 27001, sector regulators) where cited examples use a reference architecture only.

---
