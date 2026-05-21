---
title: "Threat Modelling for Agentic AI: STRIDE, Attack Trees, and Living Threat Models"
series: "Agentic AI Security Curriculum"
level: advanced
tags:
  - threat-modeling
  - stride
  - attack-trees
part: 22
total_parts: 30
date: "May 2026"
slug: "threat-modelling-stride-agentic-ai"
canonical_path: "/security/best-practices/threat-modelling-stride-agentic-ai"
description: "Extend STRIDE for agentic threats and maintain a living threat model in version control."
prev: "development-deployment-security"
next: "owasp-agentic-top-10-mitigations"
---
# Threat Modelling for Agentic AI: STRIDE, Attack Trees, and Living Threat Models

STRIDE, Attack Trees, and Living Threat Models

Hello and welcome to Module 22! 

Modules 1–21 have given us a complete technical security stack: trusted images, admission control, zero-trust networking, runtime enforcement, sandboxing, immutable memory, GPU isolation, automated response, and secure development pipelines. Now we step back and ask the most important question of all: “Have we actually defended against the right threats?”

Standard application threat models assume simple request-response architectures with a human in the loop. Agentic AI systems are fundamentally different — they act autonomously across many steps, maintain persistent memory, delegate to sub-agents, and execute real-world actions. In this module we build a living threat model tailored to agentic platforms using an extended STRIDE framework, attack trees, and a defined update cadence so the model stays accurate as the platform evolves rather than becoming obsolete the week after it is written.



---



Why Agentic AI Requires a Distinct Threat Model

Traditional threat models assume:

- A human initiates every request.  

- The system is stateless between requests.  

- The main risk is in the request itself.  


Agentic platforms break all three assumptions:

- Agents act autonomously across many steps without human intervention.  

- They maintain long-term memory and state.  

- They form dynamic pipelines with delegation and inter-agent communication.  


This creates new threat categories that do not appear in standard STRIDE templates:

- Goal hijacking  

- Memory poisoning  

- Inter-agent lateral movement  

- Model inversion  

- Indirect prompt injection  


We must extend STRIDE and make the threat model a living document that evolves with the platform.



---



STRIDE Applied to Each Component

We systematically apply STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) to every major component, highlighting how the categories change in an agentic context.

Model / Inference Layer

- Spoofing: Model inversion via repeated queries.  

- Tampering: Weight tampering or adversarial examples.  

- Information Disclosure: Model inversion attacks that extract training data.  


Memory Store

- Tampering: Memory poisoning via direct write, RAG retrieval, or post-write modification.  

- Information Disclosure: Unauthorized recall of confidential entries.  

- Repudiation: Merkle chain manipulation to hide changes.  


Tool Call Gateway

- Elevation of Privilege: ATR bypass (forged JWT, delegation expansion, scope drift).  

- Tampering: Injection via tool results.  

- Spoofing / Elevation: Replay attacks.  


ClawHub Skills

- Spoofing / Tampering / Elevation: Malicious skill in trusted position, dependency confusion.  


Inter-Agent Communication

- Spoofing: Forged orchestrator instruction.  

- Tampering / Repudiation: Fabricated subagent result.  


Operator Plane

- Spoofing / Elevation: Admin credential theft or insider threat.  

- Tampering / Repudiation: Break-glass abuse.  


Each threat is mapped to current controls and residual risk.



---



Attack Trees

The attack tree is the most practical artifact we maintain.

Root node: “Agent executes unauthorized action”

Major branches:

- Branch 1: Prompt injection (direct, indirect, multi-step, split-payload)  

- Branch 2: ATR bypass (forged JWT, delegation expansion, scope drift)  

- Branch 3: Memory poisoning (direct write, retrieval poisoning, post-write tamper)  

- Branch 4: Supply-chain compromise (base image, skill, model weight, dependency)  

- Branch 5: Operator compromise (credential theft, insider threat, break-glass abuse)  


Each leaf node maps to one or more controls. Any leaf without a corresponding control is a documented gap with a remediation timeline.



---



The Living Threat Model

A threat model written once at launch is a historical document within weeks. Ours is living.

Update triggers (any of these automatically starts a review):

- New agent pipeline deployed  

- New ClawHub skill category approved  

- New external API integration  

- Post-incident review finding  

- New OWASP Agentic Top 10 guidance published  


Update process:

1. Review the attack tree against the change.  

2. Identify new branches or modified leaves.  

3. Assign or update controls.  

4. Document residual risk.  

5. Store the updated model in git with a signed commit.  


Threat model review is a standing agenda item in every quarterly security review (Module 25). Red-team exercises (Module 24) must incorporate findings into the model within 14 days.



---



Threat Model Documentation Format

The model lives in git alongside infrastructure code as version-controlled YAML.

Each threat entry contains:

- id: Unique identifier (e.g., TM-AGENT-004)  

- stride_category: One or more of S/T/R/I/D/E  

- affected_component: e.g., “memory_store”, “pipeline_orchestrator”  

- attack_path_description: Clear narrative  

- current_controls: List of modules/controls that mitigate it  

- residual_risk: Assessment and acceptance (must be reviewed quarterly)  

- last_reviewed: Date + reviewer  


Control gaps are explicitly documented with remediation plans and owners.



---



Key Takeaways (Memorize These!)

- Agentic AI introduces threat categories (goal hijacking, memory poisoning, inter-agent lateral movement) that don’t exist in standard STRIDE templates — the template must be extended.  

- The attack tree is the most useful artifact: it makes the mapping from threat to control explicit and makes gaps visible.  

- A living threat model with defined update triggers is a fundamentally different artifact from a point-in-time assessment.  

- Residual risk must be explicitly accepted and documented — undocumented residual risk is the same as unmitigated risk from a governance perspective.  


You now have a living, agentic-specific threat model that stays current as the platform evolves. It is no longer a dusty document on a shelf — it is an active security control that drives architecture decisions, red-team exercises, and quarterly reviews. This is the strategic layer that ensures all the tactical controls in Modules 1–21 are aimed at the right threats.



## **MODULE 23**

### **OWASP Agentic Top 10: Mitigations and Control Mapping**

The OWASP Agentic Top 10 gives the industry a shared taxonomy for the ten risk categories that matter most for agentic AI — this module gives each one a specific ClawQL control, the configuration required to deploy it, and the evidence that confirms it is working. The mapping is a direct bridge between a published risk framework and operational deployment decisions, making it the fastest route from “we know what could go wrong” to “we have verified that we’ve addressed it.” It is also the foundation for the adversarial test cases in the next module.

**What the OWASP Agentic Top 10 covers**

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


**Control mapping for each risk**

ASI01 (Prompt Injection):

- Module 12: Panguard ATR enforcement at tool call boundary; JSON Schema validation; HITL for high-risk tools  

- Module 13: Unicode normalization, encoding bypass detection, split-payload detection  

- Module 5: DNS rebinding defense (browser-based injection vector)  


ASI02 (Sensitive Data Exposure):

- Module 15: Presidio redaction at write time; classification-gated recall  

- Module 8: Dynamic secrets; no long-lived credentials in context  

- Module 19: DLP inspection of outbound tool call payloads  


ASI03 (Supply Chain):

- Modules 1–3: Image pinning, admission control, skill vetting pipeline  

- Module 16: Model weight integrity verification  

- Module 26: Patch SLOs and dependency automation  


ASI04 (Data and Model Poisoning):

- Module 18: Memory Merkle integrity; WORM storage; poisoning detection rules  

- Module 15: Classification at ingestion; redaction at write  

- Module 16: Weight verification; behavioral monitoring for backdoored weights  


ASI05 (Improper Output Handling):

- Module 12: Output schema validation; response field stripping  

- Module 13: Output encoding enforcement; content type validation  


ASI06 (Excessive Agency):

- Module 12: ATR rules; HITL for irreversible actions  

- Module 7: Least privilege Kubernetes identities  

- Module 10: Provisioning approval workflow; ATR scope expansion governance  


ASI07 (System Prompt Leakage):

- Module 12: System prompt not included in tool call context; negative prompting  

- Module 13: Output content inspection; block responses containing system prompt markers  


ASI08 (Vector and Embedding Weaknesses):

- Module 15: Classification-gated recall; tenant-isolated vector collections  

- Module 18: Merkle integrity over memory store including embedding vectors  

- Note: embedding space adversarial attacks are an active research area; current controls reduce but do not eliminate this risk  


ASI09 (Misinformation):

- Module 12: HITL gates for consequential outputs; human confirmation before high-stakes actions  

- Module 22: Threat model explicitly documents misinformation risk and acceptable use boundaries  

- Note: technical controls are limited for this risk category; policy and HITL are the primary mitigations  


ASI10 (Unbounded Consumption):

- Module 13: Token budget enforcement per tool result and per session  

- Module 17: GPU and compute quotas per tenant; rate limiting per agent role  

- Module 12: Circuit breakers on tool call rate and session duration  


**Evidence of control effectiveness**

- Each control mapping corresponds to a test case in the Module 24 adversarial testing suite  

- Monthly metrics from Panguard: block rate per OWASP category — tracked and trended  

- Quarterly evidence package: OWASP coverage report showing each risk, the control, and the test that verified it  


**Key takeaways to cover**

- The OWASP Agentic Top 10 provides an external accountability framework — being able to map every risk to a deployed control is the deliverable  

- Several risks (ASI08, ASI09) have limited technical mitigations — the honest answer is to document the residual risk and apply HITL as the backstop  

- The control mapping is a living document that updates when new controls are deployed or the OWASP taxonomy is revised  

- Module 24’s test cases provide the evidence that the mapping is operational rather than theoretical  




---
