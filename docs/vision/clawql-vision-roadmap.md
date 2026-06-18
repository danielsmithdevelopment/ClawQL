# ClawQL — Vision & Roadmap

**Public Edition · May 2026**  
Apache 2.0 / MIT · [github.com/clawql/clawql](https://github.com/clawql/clawql)

---

## Read This First

ClawQL is under active development. Most of what this document describes is not yet running. The table below is the honest current state. Everything after it describes where ClawQL is going and why.

| Package                    | Status                    |
| -------------------------- | ------------------------- |
| `clawql-mcp`               | ✅ Shipped                |
| `clawql-ouroboros`         | ✅ Shipped                |
| `mcp-grpc-transport`       | ✅ Shipped                |
| `clawql-core`              | 🔨 In development         |
| `clawql-api`               | 🔨 In development         |
| `clawql-auth`              | 🔨 In development         |
| `clawql-documents`         | 🔨 In development         |
| `clawql-memory`            | 🔨 In development         |
| `clawql-pageindex`         | 🔨 In development         |
| `clawql-data`              | 📋 Planned                |
| `clawql-automation`        | 📋 Planned                |
| `clawql-telemetry`         | 📋 Planned                |
| `clawql-sandbox`           | 📋 Planned                |
| `clawql-printingpress`     | 📋 Planned                |
| `clawql-goose`             | 📋 Planned                |
| Kubernetes Operator        | 📋 Planned                |
| Natural Language Dashboard | 📋 Planned                |
| All vertical packages      | 📋 Planned — none shipped |

If you are evaluating ClawQL for immediate production use, the answer today is: the foundation is being built, the shipped pieces work, and the platform is not yet ready for production deployment. If you are evaluating it as something to build on, contribute to, or adopt early, read on.

---

## 1. What ClawQL Is (and Isn’t)

ClawQL is a modular orchestration platform and intelligent MCP gateway. It gives autonomous agents a single, secure, auditable surface to search and act across documents, persistent memory, structured data, and workflows — without requiring those agents to know anything about the underlying infrastructure.

A practical way to think about it: when an agent needs to process a mortgage document, recall what it knows about a client, check a compliance rule, and write an audit record, it makes one call. ClawQL figures out where everything lives, enforces who is allowed to see what, redacts sensitive content before it touches anything persistent, and records a tamper-evident proof of the whole operation. The agent sees a clean result. The compliance team sees a complete trail.

**ClawQL is not an agent framework.** It does not provide reasoning, planning, or LLM orchestration logic. It is the infrastructure layer that agent frameworks call into.

**ClawQL is not a generic MCP server.** Generic MCP servers are point integrations — one tool, one backend. ClawQL hosts and manages many tools under one gateway with consistent security, auditing, and memory across all of them.

**ClawQL is not vaporware with a logo.** Three packages are shipped and in use. The core is in active development. The architecture is fully specified with working code examples and enforced dependency rules. The gap between what is specified and what is shipped is real and acknowledged throughout this document.

---

## 2. The Problem Space

The problems ClawQL addresses are not individually new. What’s new is how badly they compound each other when you try to run autonomous agents in a production environment.

### Fragmented tooling

Agent systems today are assemblies of disconnected pieces: a document store here, a vector database there, a workflow engine bolted on, several MCP servers with different contracts and no shared security model. Each integration is custom. Each has its own failure modes. There is no consistent surface for an agent to work against, which means there is no consistent place to enforce policy, audit actions, or reason about what happened.

### Context window mismanagement

The instinct when building agent systems is to feed documents into the context window. This fails at scale — documents are too long, context windows are expensive, and naively retrieving full documents means retrieving far more than is needed. The result is either truncation (losing information) or cost explosion (retrieving everything). Neither is acceptable in production.

### Institutional memory loss

Agent state is typically ephemeral. A pod restarts, a task completes, a session ends — and everything the agent learned or produced disappears. This forces agents to re-derive the same information repeatedly, makes long-running workflows fragile, and means that valuable outputs (generated tools, processed documents, intermediate reasoning) vanish rather than accumulating into something useful over time.

### Regulatory and provenance gaps

Regulated industries — lending, healthcare, legal, government — require more than logs. They require chain-of-custody records showing exactly what data was used to reach a decision, evidence that sensitive data was redacted before being stored or transmitted, and audit trails that cannot be tampered with after the fact. Most agent infrastructure produces none of this. Retrofitting it is extremely difficult.

### Why these compound

Each problem makes the others worse. Fragmented tooling means you cannot enforce consistent redaction. Ephemeral memory means you cannot build a provenance chain across sessions. Context window mismanagement means you cannot scale to the document volumes that regulated workflows involve. Solving any one of them in isolation leaves the others as blockers. ClawQL addresses them together, which is why it has to be a platform rather than a library.

---

## 3. The Approach

### Single gateway surface

Everything flows through `clawql-api`. Agents call `search()` to discover what tools and data exist. They call `execute()` to act. No direct database access, no per-backend credentials, no bespoke integration code per tool. One surface means one place to enforce policy, one audit trail, and one contract for every consumer — human, agent, or system.

This is a meaningful constraint. It means the gateway has to be intelligent: it needs to route requests to the right backend, project only the fields an agent is allowed to see, handle failures gracefully, and do all of this without the caller knowing the details. The payoff is that adding a new backend, enabling a new vertical, or enforcing a new compliance rule happens in one place.

### Persistent-first design

Nothing in ClawQL is ephemeral by default. Every document processed, every piece of memory written, every tool generated by an agent gets stored with a tamper-evident proof of its provenance. Pod restarts, cluster upgrades, and task failures do not destroy state. Agents accumulate knowledge over time rather than starting from zero on every run.

This requires more than just storage. It requires a memory architecture that can be queried efficiently, a document pipeline that preserves structure as well as content, and a way to link generated artefacts back to the operations that produced them. That is what `clawql-memory`, `clawql-documents`, and `clawql-pageindex` are designed to provide.

### Defense-in-Depth as the default

Security in ClawQL is not a configuration option or a tier upgrade. It is the baseline. Every request carries a verified identity claim. Sensitive data is redacted before it touches any persistent store. Every write produces a Merkle root that cannot be modified after the fact. Containers run in hardware-isolated environments by default.

The guiding principle is “secure the capabilities, not just the language.” Prompt injection, privilege escalation, and data exfiltration are not prevented by hoping the language model behaves correctly. They are prevented by runtime controls that apply regardless of what the model produces.

### Effect-TS as the foundation

The entire platform is built on Effect-TS, a TypeScript library for typed, composable, resource-safe programs. For non-technical readers, the practical consequence is this: when a new package is added to ClawQL, the compiler verifies that all its dependencies are satisfied before the code runs. When a package is disabled, it contributes zero code to the running system. Security hooks, error handling, and resource cleanup are not things developers can forget — they are structural properties of the codebase.

For technical readers, the full rationale and patterns are in the [Contributor Technical Specification](../contributing/clawql-contributor-technical-specification.md).

---

## 4. What Exists Today

### Shipped

**`clawql-mcp`** implements the core Model Context Protocol transport layer. This is the communication foundation that all ClawQL tools run over. It is in use and stable.

**`clawql-ouroboros`** provides evolutionary self-improvement loops for extraction schemas and workflows. It ingests human-in-the-loop corrections and agent feedback, runs seed-based evolution over multiple generations, and produces improved schemas automatically. It is in use and stable.

**`mcp-grpc-transport`** provides gRPC transport for MCP communication, enabling low-latency connections in cluster environments. It is in use and stable.

### In Active Development

**`clawql-core`** defines all foundational types, the Plugin interface, the ProviderSpec registry, Merkle utilities, Cuckoo filter, and base Effect-TS layers. This is the dependency everything else builds on. It needs to stabilise before other packages can ship.

**`clawql-api`** is the intelligent gateway — `search()`, `execute()`, routing, ATR enforcement, redaction hooks, Merkle auditing, and circuit breakers. This is the primary product surface.

**`clawql-auth`** handles authentication modes (OIDC, SAML, OAuth2, API key), RBAC/ABAC policy, and ATR claim enrichment.

**`clawql-documents`** is the document intelligence pipeline: Apache Tika for extraction, Gotenberg for conversion, Stirling-PDF for OCR and manipulation, Presidio for redaction, and Paperless NGX for archiving. Each stage runs in sequence with failure isolation.

**`clawql-memory`** is the hybrid persistent memory system combining a filesystem vault, a graph store, a vectorless hierarchical index (PageIndex), and optional semantic search via Onyx.

**`clawql-pageindex`** is a standalone MIT package for vectorless hierarchical document indexing. It has no dependencies on other ClawQL packages and can be used independently.

### Planned

All vertical packages, the Kubernetes Operator, the natural language dashboard, and the remaining horizontal packages (`clawql-data`, `clawql-automation`, `clawql-sandbox`, `clawql-printingpress`, `clawql-goose`, `clawql-telemetry`) are planned and not yet in development. Their specifications are fully written and stable, and they will not be started until the packages they depend on are stable.

---

## 5. What Gets Built Next and Why

There are no fixed delivery dates. Priorities are determined by dependency order and community demand. The phases below reflect the logical sequence — each phase creates the conditions for the next.

### Phase 1: Core Stabilisation

**What:** `clawql-core`, `clawql-api`, `clawql-auth`, `clawql-documents`, `clawql-memory`, `clawql-pageindex`

**Why first:** Everything else depends on these. The gateway cannot route without a stable Plugin interface. Verticals cannot register without a stable ProviderSpec registry. The Operator cannot compose layers without stable Effect Layer contracts. Rushing past this phase to ship verticals would mean rebuilding everything on an unstable foundation.

**Exit criteria:** Public interfaces are semver-stable, contract tests pass, in-memory test layers work, and a Tier 1 Docker Compose deployment is runnable end-to-end.

### Phase 2: Operator and Natural Language Surface

**What:** Kubernetes Operator (`ClawQLInstance` CRD), Hermes supervisor, OpenClaw messaging gateway, natural language dashboard

**Why second:** The Operator is what makes ClawQL operationally manageable at Tier 2 and Tier 3. Without it, enabling a vertical means manually composing layers and editing YAML. The natural language surface depends on a stable tool catalog, which requires the gateway to be stable first. This phase turns ClawQL from a developer tool into a platform that operators can run.

**Exit criteria:** Tier 2 Helm deployment works, the Operator reconciles cleanly, and at least five natural language commands translate correctly to CRD patches.

### Phase 3: First Vertical — Lending

**What:** `clawql-lending` — mortgage, auto, BNPL, and commercial lending workflows, deal room automation, credit analysis, underwriting decision engine

**Why lending first:** It is the most complete specification, it has a known production use case (SeeTheGreens LOS), and it exercises the widest range of platform capabilities: document processing, memory recall, compliance controls, HITL gates, and Merkle auditing. A successful lending vertical validates the full platform, not just the vertical layer.

**Exit criteria:** A complete W-2 processing workflow runs end-to-end with Presidio redaction, Merkle auditing, Memory 2.0 ingest, and deal room creation via natural language command.

### Phase 4: Community Vertical Ecosystem

**What:** Remaining planned verticals (`clawql-legal`, `clawql-healthcare`, `clawql-insurance`, `clawql-supplychain`, `clawql-government`, `clawql-manufacturing`, `clawql-education`, `clawql-engineering`) plus community-contributed verticals

**Why fourth:** Verticals can be built in parallel once the platform is stable and the lending vertical has validated the contribution model. The 12-step checklist and vertical template exist specifically to make this parallelisable. Community contributors do not need to wait for all planned verticals to ship — they can contribute new ones using the same process.

**Exit criteria:** At least three verticals beyond lending are merged and running in the unified Helm chart. Community RFC process is active.

---

## 6. Why Trust This Will Be Built

That is a fair question and it deserves a direct answer.

**Execution evidence.** Three packages are shipped and in use. The architecture is not speculative — it is written in working TypeScript with enforced dependency rules, passing tests, and a live CI pipeline. The gap between what is specified and what is running is a development gap, not a design gap.

**The specification is the contract.** This document, the Technical Specification, and the Deployment Guide are public and versioned. Interfaces are stable and semver-governed. A breaking change to a public interface requires a major version bump across all dependents. Contributors can build against the specification today knowing that changes will be signalled clearly.

**Demand-driven means the community sets priorities.** “No fixed dates” is not evasiveness — it is an acknowledgment that a small team building open infrastructure should respond to what people actually need rather than committing to a schedule that serves no one. The RFC process, GitHub Discussions, and the phased roadmap above give the community direct influence over what gets prioritised.

**The dependency order is real.** Phase 1 is not taking a long time because of poor execution. It is taking the time it takes because the core abstractions need to be right. Verticals built on a shaky Plugin interface would need to be rebuilt. The investment in getting the foundation correct is what makes Phase 4 parallelisable.

If none of that is sufficient for your use case, the honest advice is to wait for Phase 1 exit criteria to be met and evaluate then. The Tier 1 quick-start is the right way to do that evaluation.

---

## 7. How to Get Involved

### Try it

The Tier 1 Docker Compose deployment is the fastest way to see what ClawQL can do today. It runs `clawql-api`, `clawql-memory` with a SQLite backend, the document pipeline (Tika, Gotenberg, Paperless NGX), and basic authentication.

```bash
git clone https://github.com/clawql/clawql.git
cd clawql/examples/clawql-local-docker-compose
./bootstrap.sh
docker compose up -d
# Dashboard: http://localhost:8080
```

Upload a document or run `@hermes process this document` in the chat to see the document pipeline in action.

### Contribute a vertical

If your organisation works in a domain ClawQL targets — or one it does not yet target — the vertical template and 12-step contribution checklist are in the repository. The checklist has acceptance criteria for each step, not just a list of things to do. Verticals can be started now; they just cannot be merged until Phase 1 is stable.

### Influence the roadmap

Open an RFC in GitHub Discussions. The RFC process is the mechanism for proposing new verticals, new provider adapters, changes to core interfaces, and significant architectural decisions. RFCs that attract community support move up in priority.

### Follow progress

The public roadmap is tracked in GitHub Discussions with phase-level milestones. There are no date commitments, but phase entry and exit criteria are documented so you can see exactly where things stand.

---

_ClawQL Vision & Roadmap · May 2026 · Apache 2.0 / MIT_  
_For implementation contracts: see the [Contributor Technical Specification](../contributing/clawql-contributor-technical-specification.md)._  
_For deployment instructions: see the [Deployment & Operations Guide](../deployment/clawql-deployment-operations-guide.md)._
