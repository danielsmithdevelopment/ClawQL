# Zero-Trust Agentic Fabric

**Public Edition · July 2026**

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.**

This document is the canonical architecture for that positioning. Product layers (IDP stack, modularization packages, Operator tiers) remain valid — they describe _what_ ships inside the platform. The fabric describes _how_ enterprises deploy and govern it.

---

## Positioning

| Term                          | Meaning                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Agentic Gateway**           | The product entry surface: OpenAI-compatible inference (`/v1`) and MCP (`/mcp`) from one control plane — not a thin proxy |
| **Foundational Platform**     | Memory, model provenance (fine-tuning Flywheel), IDP, payments, and governance integrated at the gateway layer            |
| **Auditable Production AI**   | The business outcome: policy enforcement, WORM trails, and CISO-verifiable agentic activity in production                 |
| **Virtual Gateway**           | The **Audit-Trail Enforcement Point** — isolated policy, WORM, and (on Dedicated deployments) event-driven swarm fabric   |
| **Zero-Trust Agentic Fabric** | Regional Hubs + Dedicated Virtual Gateways + Edge Gateways, federated without a global master                             |

ClawQL is **not** an agent framework. It does not reason or plan. It is the infrastructure agents call into.

---

## Three layers

### Layer 1 — Regional Hub (SaaS / shared)

ClawQL-operated, multi-tenant by default. Customers connect to one or multiple Regional Hubs.

| Aspect         | Detail                                                 |
| -------------- | ------------------------------------------------------ |
| **Function**   | Inference routing, cost attribution, metering, billing |
| **Value**      | Instant-on for Developer/Teams — no VPC required       |
| **Audit role** | Usage audit (what was called, at what cost)            |

Regional Hubs are the transactional plane. They are **not** a single global master for policy.

### Layer 2 — Dedicated Virtual Gateway (governance / private)

The primary enterprise entry point. Deployed into a ClawQL region or the customer’s cloud/VPC. It consumes Regional Hubs for usage and billing; **everything else** — policy, WORM, observability, swarm fabric — couples to the Dedicated Virtual Gateway.

| Aspect         | Detail                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Function**   | Audit-Trail Enforcement Point; EnterpriseGovernance manifests; PII/PHI scrubbing; private WORM; **NATS JetStream + Valkey** for event-driven workflows |
| **Value**      | Private island of governance that still uses Layer 1 routing/billing                                                                                   |
| **Audit role** | Intent audit (policies, tool authorizations, why an action was allowed)                                                                                |
| **Federation** | Customers may run **multiple** Dedicated Virtual Gateways as **peers** — not spokes under a global master                                              |

### Layer 3 — Edge Agentic Gateway (developer laptop / swarm node)

Each engineer’s laptop runs an Edge Agentic Gateway: local MCP, local memory, low-latency tool execution. Nodes sync through company Dedicated Virtual Gateway(s) via mTLS — offline-first locally, online-governed when connected.

| Aspect         | Detail                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------- |
| **Function**   | IDE-native MCP, session memory, local tool runs, fine-grained execution audit                     |
| **Sync**       | Virtual Gateway **pushes** policy; Edge Gateway **pushes** WORM-signed audit bundles on reconnect |
| **Audit role** | Execution audit (what actually ran on the workstation)                                            |

---

## Anti-pattern: global master gateway

A single global gateway as the policy and audit authority is a liability for Auditable Production AI:

- Single point of failure and credential harvest target
- Forces one security overhead profile on every team and region
- Collapses sovereignty boundaries (GDPR, FedRAMP, HIPAA) into one hop

**Prefer federated Virtual Gateways:** shared EnterpriseGovernance truth, local enforcement, local WORM sinks, optional mesh observability that aggregates without centralizing raw sensitive payloads.

---

## Event-driven fabric (NATS JetStream + Valkey)

Each Dedicated Virtual Gateway hosts its own **NATS JetStream** and **Valkey** (plus supporting services) so agents publish and subscribe to topics.

**Emergent parallelism:** when one agent struggles, it publishes state; subscribed Edge nodes pull shared short-term state from Valkey, work in parallel, publish attempts until a breakthrough — then peers stop.

**CTO / CISO as orchestrators:** leadership publishes org tasks (weekly summaries, security patches). Every Edge Gateway pulls, executes locally, and reports back. Mandates are system events. Every publish/subscribe is WORM-logged.

Orchestration loop: **Broadcast → Pull → Execute → Report.**

---

## Three audits, one narrative

| Layer                     | Audit surface   | What the CISO sees                                                     |
| ------------------------- | --------------- | ---------------------------------------------------------------------- |
| Regional Hub              | Usage audit     | Tokens, models, billing signals — not private policy contents          |
| Dedicated Virtual Gateway | Intent audit    | Policies, authorizations, tool invocations, WORM in the audit boundary |
| Edge Agentic Gateway      | Execution audit | Fine-grained local runs, synced as signed bundles when online          |

---

## Glossary vs other “layers”

| Model                        | What it describes                                                     |
| ---------------------------- | --------------------------------------------------------------------- |
| **Fabric L1–L3** (this doc)  | Deploy/governance topology for GTM and enterprise architecture        |
| **IDP / product layers 0–6** | Capability stack inside the platform (releases, documents, memory, …) |
| **Operator Tier 1/2/3**      | Kubernetes compose intensity — not the same as fabric layers          |

---

## Related

- Marketing GTM (primary): [Inference-first GTM playbook](https://clawql.com/inference/gtm/)
- Enterprise / Palantir-facing (secondary): [Enterprise GTM playbook](https://clawql.com/enterprise/gtm/)
- Product entry: [clawql-inference](../inference/clawql-inference.md) · [Getting started](https://docs.clawql.com/getting-started)
- Vision: [Vision & roadmap](../vision/clawql-vision-roadmap.md)
