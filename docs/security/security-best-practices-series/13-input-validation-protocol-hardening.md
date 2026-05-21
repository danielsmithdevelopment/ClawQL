---
title: "Input Validation and Protocol Hardening: SSRF Prevention, Token Limits, Encoding Defense, and Replay Prevention"
series: "Agentic AI Security Curriculum"
level: advanced
tags:
  - input-validation
  - ssrf
  - mcp
  - prototype-pollution
part: 13
total_parts: 30
date: "May 2026"
slug: "input-validation-protocol-hardening"
canonical_path: "/security/best-practices/input-validation-protocol-hardening"
description: "Harden the MCP input boundary before Panguard: JSON safety, SSRF, token budgets, and tool manifest integrity."
prev: "mcp-runtime-enforcement-panguard-atr"
next: "multi-agent-trust-orchestrator-security"
---
# Input Validation and Protocol Hardening: SSRF Prevention, Token Limits, Encoding Defense, and Replay Prevention

SSRF Prevention, Token Limits, Encoding Defense, and Replay Prevention

Hello and welcome to Module 13! 

Modules 1–12 have given us trusted images, admission control, vetted skills, zero-trust networking, a hardened gateway, egress controls, scoped identities, dynamic secrets, per-request authentication, agent lifecycle, sandboxing, and Panguard runtime enforcement. Now we harden the very first line of defense: the input boundary itself.

The MCP gateway receives untrusted input from many simultaneous sources — user messages, tool results, retrieved documents, and inbound protocol messages. Each source is a distinct attack surface. If we let malicious input reach Panguard or the model, even the best ATR rules and schema validation can be bypassed before they ever get a chance to act.

In this module we make the input boundary rock-solid so that Panguard’s enforcement layer always sees clean, well-formed data. This is the upstream control that every other runtime defense depends on.



---



The Input Boundary Problem

The gateway is the first place untrusted data enters the system. It arrives in many forms at once:

- Direct user messages  

- Tool results coming back from previous calls  

- Retrieved documents from memory or RAG  

- Inbound MCP protocol messages (notifications, capability negotiation, etc.)  


Each of these is a separate attack vector. Input validation failures here can create bypasses that Panguard never sees. We treat every inbound byte as hostile until it has been explicitly validated, normalized, and schema-checked.



---



JSON Parsing Safety and Prototype Pollution

JSON parsing is the first gate. We defend against prototype pollution and parser exploits before any object is even constructed.

Key protections:

- Reject payloads containing the dangerous keys **proto**, constructor, or prototype at the raw parsing stage.  

- Enforce a strict maximum nesting depth at parse time (default: 20 levels).  

- Enforce a maximum total message size before parsing even begins.  

- After parsing, apply a maximum string length per field.  


Never use deep object merge operations (Object.assign, lodash merge, etc.) on untrusted input — they are the most common prototype-pollution vectors. Structured schema validation (next section) replaces them entirely.



---



SSRF Prevention for URL-Accepting Tools

Any tool that accepts a URL is an SSRF risk. We block it at parse time, before any DNS resolution.

Validation rules (applied in the gateway):

- Block all private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, ::1, fc00::/7).  

- Block link-local range 169.254.0.0/16 (cloud metadata endpoints).  

- Block dangerous schemes: file://, gopher://, dict://, ftp://, ldap://, etc.  

- Disable redirect following by default.  

- After the first DNS lookup, pin the resolved IP for the remainder of the call (prevents TOCTOU rebinding).  


Even if the application-layer check is bypassed, enforce IMDSv2 at the cloud-provider level as the second control. This is the same SSRF defense used in egress filtering (Module 6), now applied at the tool-definition level.



---



Context Window Token Budget Enforcement

Context-window displacement attacks are subtle but devastating: an attacker sends a very large retrieved document that pushes the system prompt out of the model’s effective attention window.

Panguard enforces hard token budgets:

- Maximum tokens per tool result (configurable per tool category — document retrieval tools get tighter limits than internal API responses).  

- Session-level token accounting: total context usage is tracked across all tool calls.  

- Alert when approaching the model’s context limit.  

- Flag any session where retrieved content makes up >70 % of the total context window — this is a classic displacement signal.  


These budgets are enforced before any content enters the model’s context.



---



Encoding-Based Injection Bypass Detection

Attackers love to hide instructions using encoding tricks. We normalize and scan for them:

- Unicode normalization (NFKC) is applied to all inbound text before any pattern matching.  

- Homoglyph detection: flag look-alike characters (Cyrillic а vs Latin a, etc.).  

- Strip zero-width characters (\u200b, \u200c, \u200d, \uFEFF).  

- Strip right-to-left override (\u202e).  

- Base64 and hex decode-and-scan: if a field contains valid base64 or hex, we decode it and run injection pattern matching on both the raw and decoded content.  


A single line of normalization closes an entire class of bypass attacks.



---



Split-Payload Detection

Injection can be split across multiple tool results so each individual result looks clean, but the model concatenates them into a full instruction.

Panguard maintains a rolling window of the last N tool results per session (default: 5).  
 Injection pattern matching is applied to the concatenated content of the window, not to each result in isolation.

This check runs as an async background task with alerting (it is computationally heavier, so we do not block synchronously on it).



---



Tool Definition Integrity

Tool definition poisoning is an attack most operators never consider: an attacker modifies a tool’s description field so the model misuses the tool or calls it with malicious parameters.

Defenses:

- The gateway hashes the full tools manifest at session start.  

- Panguard alerts on any mid-session change to the tools list.  

- The tools manifest is signed at deployment time; any deviation from the signed manifest triggers an immediate block.  

- Tool descriptions in production are human-reviewed and signed — never auto-generated from code comments.  




---



MCP Protocol-Level Controls

We also harden the protocol itself:

- Notification rate limiting: server-to-client notifications are capped per session to prevent client event-loop exhaustion.  

- Capability negotiation pinning: the client records the agreed capabilities at session start and refuses any downward re-negotiation mid-session.  

- Tool list integrity: the gateway signs the initial tools list; the client verifies the signature on any subsequent tools/list response.  

- JSON-RPC method allowlist: only declared methods are routed; unknown method names receive method not found — never a routing decision.  




---



Key Takeaways (Memorize These!)

- Input validation must run before JSON parsing for the most dangerous attack classes (prototype pollution, oversized payloads) — Panguard’s ATR rules operate after parsing and cannot catch these.  

- SSRF validation must happen at URL parse time, not after DNS resolution — post-resolution validation is vulnerable to TOCTOU.  

- Unicode normalization before pattern matching is a single line of code that closes an entire class of encoding bypass attacks.  

- Tool definition integrity is the attack surface that most operators don’t know exists — sign the tools manifest and monitor for mid-session changes.  


You now have a hardened input boundary that ensures every piece of data reaching Panguard and the model is clean, normalized, size-bounded, and free of injection tricks. The enforcement layer in Module 12 can now do its job on trustworthy input. This completes the upstream defenses that make the entire runtime stack reliable.



## **MODULE 14**

### **Multi-Agent Trust Hierarchies and Orchestrator Security: Delegation, Result Integrity, and Blast Radius Isolation**

A single agent with strong controls is a solved problem; a pipeline of agents where each one implicitly trusts the last is not. Orchestrators must sign their instructions so subagents can verify authenticity, subagents must sign their results so orchestrators can detect fabrication, and ATR delegation must always scope downward — a subagent can never hold broader claims than the orchestrator that spawned it. This module defines the trust architecture that makes multi-agent pipelines as auditable and blast-radius-bounded as single-agent deployments.

**Why single-agent security controls are insufficient for pipelines**

- Each node in a pipeline has its own Panguard enforcement, ATR claims, and sandboxing  

- But the edges between nodes have no controls by default — agents trust each other implicitly  

- Three attack paths unique to multi-agent systems: inject at orchestrator input (fans out to all subagents), compromise midpoint subagent (fabricate results), lateral movement between nodes  

- Zero trust applies between agents as strictly as between agents and external systems  


**Verifiable agent identity in pipelines**

- Each pipeline node gets a unique X.509 certificate from the cluster CA (Module 4)  

- Certificate SAN encodes the pipeline ID and node position: clawql://pipeline/doc-analysis/node/2  

- Gateway validates the presenting agent’s certificate against the declared pipeline topology  

- An agent presenting a certificate for node/2 cannot send messages on the node/3 subject namespace  

- New pipeline nodes receive certificates through the same cert-manager flow as service workloads  

- Compromised node: certificate revoked immediately; all in-flight messages from that identity rejected within one TTL cycle  


**ATR delegation: scope only downward**

- Orchestrator holds the full ATR scope for the task; delegates subsets to subagents  

- delegated_scope field in the subagent’s session JWT: only the claims needed for that specific step  

- Gateway enforces intersection(orchestrator_claims, delegated_claims) at token exchange  

- Attempting to delegate a claim the orchestrator doesn’t hold: 403 DELEGATION_VIOLATION  

- Delegation chain recorded in every tool call audit log entry — full authorization path reconstructable  


**Authenticating orchestrator instructions at the subagent**

- Instructions travel over NATS JetStream with mTLS + message-level signature  

- Orchestrator signs the instruction payload with its private key before publishing  

- Subagent verifies: correct subject namespace, valid orchestrator certificate, signature over message body  

- Instruction payload validated against JSON Schema — out-of-schema content rejected as potential injection  

- Panguard rule: flag any instruction payload containing injection-pattern keywords  


**Result integrity: subagents cannot fabricate**

- Subagent signs its result payload before publishing back to the orchestrator  

- Orchestrator verifies the signature before incorporating the result into its context  

- Panguard blocks context incorporation if signature verification fails  

- Unverified result: session quarantined, alert fired, signing subagent’s certificate queued for revocation  

- The fabricating subagent is identified from its certificate fingerprint in the message  


**Blast radius isolation between pipeline nodes**

- Each node in its own Kata Container with dedicated NetworkPolicy  

- No direct pod-to-pod communication — all messages route through the NATS broker  

- NATS subject-level ACLs: each agent can only publish to its own subject namespace and subscribe to its declared inputs  

- A compromised node cannot exec into a neighbor even with full node-level code execution  

- Cumulative session risk scoring across the full pipeline: if combined behavior of all nodes crosses the threshold, entire pipeline halts  


**Panguard pipeline-level rules**

- scope: pipeline_session — evaluates metrics across all nodes, not per-node  

- Thresholds: >3 blocked calls, >5 sensitive data accesses, >10MB external egress across the full session  

- On threshold: halt the pipeline, preserve audit trail, alert  

- Slow-moving attacks: an attacker who drips small suspicious actions across many nodes to stay under per-node limits is caught by the pipeline-level cumulative threshold  


**Key takeaways to cover**

- Implicit trust between agents is the fundamental architectural mistake — every edge in the pipeline graph requires explicit authentication  

- ATR delegation must always scope downward — a subagent with broader claims than its orchestrator is a privilege escalation vulnerability  

- Signed instructions and signed results make both instruction injection and result fabrication detectable at the moment they occur  

- Pipeline-level cumulative risk scoring is the control that catches slow-moving attacks that evade per-node rate limits  




---
