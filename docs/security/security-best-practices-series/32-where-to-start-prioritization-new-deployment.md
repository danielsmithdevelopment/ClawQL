---
title: "Where to Start: Prioritization for a New Deployment"
series: "Agentic AI Security Curriculum"
level: foundational
tags:
  - prioritization
  - deployment
  - sequencing
  - onboarding
part: 32
total_parts: 32
date: "May 2026"
slug: "where-to-start-prioritization-new-deployment"
canonical_path: "/security/best-practices/where-to-start-prioritization-new-deployment"
description: "Sequencing guide for new deployments — the five controls to implement first, second tier before scaling, and why partial coverage is worse than focused depth."
prev: "third-party-model-api-security"
---

# Where to Start: Prioritization for a New Deployment

## Why prioritization matters separately from comprehensiveness

The preceding modules describe thirty-plus areas of control, each with real justification. A team starting from zero cannot implement all of them simultaneously, and treating the curriculum as an unordered checklist leads to one of two failure modes: either paralysis (nothing ships because nothing is "done"), or uniform shallow coverage (every control half-implemented, none of them actually providing the protection they're designed for).

This module is not a replacement for the rest of the curriculum. It is a sequencing guide — what to build first, in what order, and why that order matters.

## The five controls to implement before anything else

If a deployment can only implement five things before going live with real data and real tool access, these are the five, in order:

**1. Digest pinning and a private mirror registry (Module 1).** This is the highest-leverage single control in the entire curriculum. It is also one of the cheapest — it requires no new infrastructure beyond a registry you likely already have, and it closes the most common real-world supply chain attack vector (a compromised or maliciously-updated base image). Everything else in the curriculum assumes the images it's protecting are the images you intended to run; without this, that assumption is unfounded.

**2. The structured tool-call enforcement boundary — ATR claims and Panguard (Module 12).** This is the architectural decision that everything else in the agentic-security-specific modules depends on. A deployment without this enforces nothing at the layer where intent becomes action — prompt-level controls alone (Module 12 is explicit about this) are not a substitute. This is more involved to implement than digest pinning, but it is the single most important agentic-specific control, and retrofitting it after a deployment has scaled is significantly harder than building it in from the start.

**3. Presidio redaction at write time, with a `block` failure policy (Module 15).** Once an agent has tool access and is processing real data, sensitive data will enter memory, logs, and external calls within the first sessions of operation — not eventually, immediately. A `block` failure policy means the system is unavailable rather than leaking, which is the correct default to establish before launch. Retrofitting redaction onto data that's already been written unredacted means the damage is already done; the data has to be treated as compromised regardless of subsequent fixes.

**4. WORM audit logging with the canonical event schema (Module 19, Module 8's audit logging).** Every subsequent control in this curriculum — incident response, compliance evidence, red team validation, quarterly reviews — depends on having a tamper-evident record of what happened. A deployment that adds audit logging after an incident has no record of the incident. This needs to exist from the first request the system handles, not from the first incident.

**5. Egress default-deny with an explicit allowlist (Module 6).** This is the control that bounds the damage of every other control's failure. If ATR enforcement has a gap, if a skill is compromised, if a prompt injection succeeds — egress default-deny is what prevents "the agent did something it shouldn't have" from becoming "the agent sent the result of doing something it shouldn't have to an attacker-controlled endpoint." It is the backstop for failures in 1–4, which is why it belongs in the first five rather than waiting until those are mature.

## What deliberately isn't in the first five, and why

Sandboxing (Module 11), zero-trust networking with full service mesh (Module 4), and the multi-agent trust hierarchy controls (Module 14) are not in the first five — not because they're unimportant, but because they're either expensive to retrofit correctly _or_ their value scales with deployment complexity that a new deployment doesn't yet have. A single-agent deployment with one tool surface gets limited additional protection from a full Istio mTLS mesh; that protection becomes load-bearing once there are multiple agents, multiple tenants, or pipeline topologies — which is also when it becomes harder to add without disruption. The guidance is: build the first five now, and build the next tier (sandboxing, zero-trust networking, multi-agent controls) _before_ — not after — the deployment grows into the complexity that makes them necessary.

Similarly, the full red team and adversarial testing program (Module 24) isn't in the first five as a complete program, but a minimal version of it is implicit in implementing the first five correctly: you cannot know that ATR enforcement (item 2) actually rejects out-of-scope calls, or that Presidio (item 3) actually blocks on failure, without testing it. The first five include their own minimal verification; Module 24's full program formalizes and scales that verification as the deployment grows.

## The second tier: before scaling beyond a single agent or a single tenant

Once the first five are operational and verified, the next priorities — before adding multiple agents, multiple tenants, or expanding tool scope significantly — are:

- Least-privilege ServiceAccounts and credential scoping (Module 7) and dynamic secrets via Vault (Module 8) — static, broadly-scoped credentials are tolerable in a single-agent proof of concept and become a real liability the moment there's more than one identity to distinguish between
- Sandboxing for any tool that executes code or processes untrusted external content (Module 11) — this is the point where "an agent with tool access" becomes "an agent that can run arbitrary code," and the isolation boundary needs to exist before that capability is exposed, not after
- Agent identity lifecycle — provisioning, decommissioning, orphan detection (Module 10) — becomes necessary the moment there's more than one agent identity to lose track of
- If calling external model providers (Module 31), the classification and retention-policy verification described there — before, not after, any workflow involving sensitive data is routed externally

## The point of sequencing this way

A deployment that implements the first five completely and correctly, and nothing else, is meaningfully more secure than a deployment that implements all thirty modules at 20% completeness each. Partial implementations of structural controls — an ATR system that's enforced for some tools but not others, redaction that runs on most write paths but not all of them, an egress allowlist with a few too-broad entries left in "temporarily" — provide a false sense of coverage that is often worse than no coverage at all, because the gaps are invisible until they're exploited.

Build the five completely. Verify them. Then expand scope, and let the expanding scope tell you which subsequent modules become load-bearing — rather than trying to anticipate all of them at once.
