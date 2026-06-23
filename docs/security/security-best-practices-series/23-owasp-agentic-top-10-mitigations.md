---
title: "OWASP Agentic Top 10: Mitigations and Control Mapping"
series: "Agentic AI Security Curriculum"
level: advanced
tags:
  - owasp
  - compliance
  - controls
part: 23
total_parts: 32
date: "May 2026"
slug: "owasp-agentic-top-10-mitigations"
canonical_path: "/security/best-practices/owasp-agentic-top-10-mitigations"
description: "Map ASI01–ASI10 to deployed ClawQL controls with test evidence from the adversarial suite."
prev: "threat-modelling-stride-agentic-ai"
next: "red-teaming-adversarial-testing"
---

# OWASP Agentic Top 10: Mitigations and Control Mapping

Mitigations and Control Mapping

Hello and welcome to Module 23!

Modules 1–22 have given us a complete technical security stack and a living threat model. Now we map that stack directly to the industry-standard risk framework for agentic AI: the OWASP Agentic Top 10.

The OWASP Agentic Top 10 provides a shared language for the ten risk categories that matter most when agents can act autonomously, maintain memory, and call real-world tools. In this module we walk through each risk, show exactly which controls in our platform address it, and explain the configuration and evidence required to prove it is working. By the end you will have a clear, auditable bridge between the published risk framework and our operational deployment decisions — turning “we know what could go wrong” into “we have verified that we’ve addressed it.”

---

What the OWASP Agentic Top 10 Covers

The OWASP Agentic Top 10 (ASI = Agentic Security Issues) identifies the following risks:

- ASI01: Prompt Injection — direct and indirect injection via user input and retrieved content

- ASI02: Sensitive Data Exposure — PII and credentials in model outputs, memory, and logs

- ASI03: Supply Chain Risks — compromised models, skills, dependencies, and base images

- ASI04: Data and Model Poisoning — training data manipulation, RAG retrieval poisoning, memory poisoning

- ASI05: Improper Output Handling — unsafe code execution, cross-site scripting via agent output

- ASI06: Excessive Agency — agents with more permissions than their task requires

- ASI07: System Prompt Leakage — system prompt extracted via adversarial queries

- ASI08: Vector and Embedding Weaknesses — adversarial inputs crafted to manipulate embedding space

- ASI09: Misinformation — agents generating plausible but false content used in consequential decisions

- ASI10: Unbounded Consumption — token, API, and compute exhaustion attacks

For each risk we provide the specific ClawQL controls, the exact modules that implement them, and the evidence that confirms they are operational.

---

Control Mapping for Each Risk

ASI01: Prompt Injection

- Primary control: Module 12 — Panguard ATR enforcement at the tool-call boundary, JSON Schema validation, and HITL for high-risk tools.

- Supporting controls: Module 13 — Unicode normalization, encoding bypass detection, split-payload detection, and context-window token budgets.

- Module 5 — DNS rebinding defense for browser-based injection vectors.  
  Evidence: Every injection test case in the Module 24 red-team suite is blocked with a Panguard decision logged to WORM.

ASI02: Sensitive Data Exposure

- Primary control: Module 15 — Presidio redaction at every write boundary and classification-gated recall.

- Supporting controls: Module 8 — dynamic secrets (no long-lived credentials in context) and Module 19 — DLP inspection of outbound tool-call payloads.  
  Evidence: Presidio scan results and classification metadata are attached to every memory write and external call in the audit trail.

ASI03: Supply Chain Risks

- Primary controls: Modules 1–3 — container image pinning, distroless golden images, Harbor mirror registry, Cosign signing, Kyverno admission control, and ClawHub skill vetting pipeline (manifest signing + sandbox observation).

- Module 16 — model weight integrity verification at every load.

- Module 26 — patch SLOs and dependency automation.  
  Evidence: All images and skills carry signed digests and manifests; every deployment pipeline blocks on supply-chain verification failures.

ASI04: Data and Model Poisoning

- Primary controls: Module 18 — Merkle-tree integrity over every memory entry, WORM storage, and poisoning detection rules at write time.

- Module 15 — classification at ingestion and redaction at source.

- Module 16 — weight verification plus behavioral monitoring for backdoored weights.  
  Evidence: Weekly Merkle verification reports and poisoning-pattern scans are stored in WORM and reviewed quarterly.

ASI05: Improper Output Handling

- Primary control: Module 12 — output schema validation and automatic stripping of fields that do not match the declared schema.

- Module 13 — output encoding enforcement and content-type validation.  
  Evidence: All tool responses are schema-validated before being returned to the agent; stripping events are logged.

ASI06: Excessive Agency

- Primary controls: Module 12 — ATR rules and HITL gates for irreversible actions.

- Module 7 — least-privilege Kubernetes identities and scoped ServiceAccounts.

- Module 10 — provisioning approval workflow and ATR scope-expansion governance.  
  Evidence: ATR violation logs and HITL approval records for every high-risk action.

ASI07: System Prompt Leakage

- Primary controls: Module 12 — system prompt is never included in tool-call context; negative prompting is used.

- Module 13 — output content inspection blocks responses containing system-prompt markers.  
  Evidence: Prompt-leakage test cases in the red-team suite are blocked at output validation.

ASI08: Vector and Embedding Weaknesses

- Primary controls: Module 15 — classification-gated recall and tenant-isolated vector collections.

- Module 18 — Merkle integrity over memory store (including embedding vectors).  
  Note: Embedding-space adversarial attacks are an active research area; current controls significantly reduce risk, and residual risk is explicitly documented and reviewed quarterly.

ASI09: Misinformation

- Primary controls: Module 12 — HITL gates for consequential outputs and human confirmation before high-stakes actions.

- Module 22 — threat model explicitly documents misinformation risk and acceptable-use boundaries.  
  Note: Technical controls are limited for this category; policy and HITL serve as the primary mitigations. Residual risk is accepted and reviewed quarterly.

ASI10: Unbounded Consumption

- Primary controls: Module 13 — token budget enforcement per tool result and per session.

- Module 17 — GPU and compute quotas per tenant plus Panguard rate limiting.

- Module 12 — circuit breakers on tool-call rate and session duration.  
  Evidence: Session-level token accounting and quota enforcement logs are part of the WORM trail.

---

Evidence of Control Effectiveness

Every control mapping is backed by executable test cases in the Module 24 adversarial testing suite.

Monthly metrics from Panguard track block rate per OWASP category and are trended in the NOC dashboard.

Quarterly evidence packages (generated automatically from WORM + Merkle roots + Panguard logs) show each risk, the deployed control, and the test that verified it. This package is stored in WORM and used for SOC 2, EU AI Act, and other compliance audits (Module 29).

---

Key Takeaways (Memorize These!)

- The OWASP Agentic Top 10 provides an external accountability framework — being able to map every risk to a deployed control is the deliverable.

- Several risks (ASI08, ASI09) have limited technical mitigations — the honest answer is to document the residual risk and apply HITL as the backstop.

- The control mapping is a living document that updates when new controls are deployed or the OWASP taxonomy is revised.

- Module 24’s test cases provide the evidence that the mapping is operational rather than theoretical.

You now have a direct, auditable mapping from the industry’s most important agentic risk framework to the exact controls running in your platform. This turns the OWASP Agentic Top 10 from a list of worries into a verified set of mitigations — and gives you the language and evidence you need for audits, leadership updates, and continuous improvement.
