# ClawQL — Vision & Roadmap

**Public Edition · July 2026**  
Apache 2.0 / MIT · [github.com/clawql/clawql](https://github.com/clawql/clawql)

---

## Read This First

ClawQL is under active development. The **horizontal platform through Phase 1 (7.0.0)** is shipped and documented in [Getting started](https://docs.clawql.com/getting-started). The table below is the honest current state. Everything after it describes where ClawQL is going and why.

| Package                    | Status                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clawql-mcp`               | ✅ Shipped (transport + MCP registration in `src/`)                                                                                                       |
| `clawql-core`              | ✅ Shipped (audit, Merkle, Cuckoo, Plugin types)                                                                                                          |
| `clawql-api`               | ✅ Shipped (spec, execute, gateway, Panguard plugin, custom URL sources)                                                                                  |
| `clawql-memory`            | ✅ Shipped (vault, memory.db, ingest/recall)                                                                                                              |
| `clawql-documents`         | ✅ Shipped — ingest + **`DEFAULT_IDP_PIPELINE`** + **`run_idp_pipeline`**; 8 bundled IDP vendors; **`classify_document`** / **`extract_document`** opt-in |
| `clawql-automation`        | ✅ Shipped — schedule, notify, **`workflow`**, **`argocd`**; NATS JetStream opt-in ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254))  |
| `clawql-sandbox`           | ✅ Shipped — **`SandboxPlugin`**, Kata default in-cluster **`auto`**                                                                                      |
| `clawql-ouroboros`         | ✅ Shipped — evolutionary loops + **`OuroborosPlugin`**                                                                                                   |
| `clawql-operator`          | 🚧 Scaffold shipped (7.0) — CRD, tier-spec, layer composition; full operator planned                                                                      |
| `clawql-release`           | 🚧 MVP shipped (7.0) — manifest collect/verify/publish; Arweave/Rift roadmap                                                                              |
| `mcp-grpc-transport`       | ✅ Shipped                                                                                                                                                |
| `clawql-auth`              | ✅ Shipped — gateway `noAuth`/`apiKey`, ATR claims, provider headers                                                                                      |
| `clawql-pageindex`         | ✅ Shipped — MIT package + `pageindex_*` MCP tools (opt-out: `CLAWQL_ENABLE_PAGEINDEX=0`)                                                                 |
| `clawql-data`              | 📋 Planned                                                                                                                                                |
| `clawql-telemetry`         | 📋 Planned                                                                                                                                                |
| `clawql-printingpress`     | 📋 Planned                                                                                                                                                |
| `clawql-goose`             | 📋 Planned                                                                                                                                                |
| Kubernetes Operator (full) | 📋 Planned — NL dashboard, dynamic Deployments, full auth reconciliation                                                                                  |
| Natural Language Dashboard | 📋 Planned                                                                                                                                                |
| All vertical packages      | 📋 Planned — none shipped                                                                                                                                 |

**Detail:** [Modularization implementation status](../design/modularization-implementation-status.md) (package contents, MCP flow, extraction PRs, plugin roadmap). **Horizontal plugins:** [ClawQL plugin model](../design/clawql-plugin-model.md).

If you are evaluating ClawQL for immediate production use, the answer today is: the foundation is being built, the shipped pieces work, and the platform is not yet ready for production deployment. If you are evaluating it as something to build on, contribute to, or adopt early, read on.

---

## 1. What ClawQL Is (and Isn’t)

ClawQL is a modular orchestration platform and intelligent MCP gateway. It gives autonomous agents a single, secure, auditable surface to search and act across documents, persistent memory, structured data, and workflows — without requiring those agents to know anything about the underlying infrastructure.

A practical way to think about it: when an agent needs to process a mortgage document, recall what it knows about a client, check a compliance rule, and write an audit record, it makes one call. ClawQL figures out where everything lives, enforces who is allowed to see what, redacts sensitive content before it touches anything persistent, and records a tamper-evident proof of the whole operation. The agent sees a clean result. The compliance team sees a complete trail.

**ClawQL is not an agent framework.** It does not provide reasoning, planning, or LLM orchestration logic. It is the infrastructure layer that agent frameworks call into.

**ClawQL is not a generic MCP server.** Generic MCP servers are point integrations — one tool, one backend. ClawQL hosts and manages many tools under one gateway with consistent security, auditing, and memory across all of them.

**ClawQL is not vaporware with a logo.** The MCP server and workspace packages are shipped and in use; Phase 1 exit (auth, pageindex, Presidio hooks, Tier 1 Compose) is **complete in 7.0.0**. The **full** Operator (NL dashboard, dynamic Deployments), Layer 0 permanence, and vertical packages remain ahead — acknowledged throughout this document and in [Modularization implementation status](../design/modularization-implementation-status.md).

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

### Shipped (horizontal platform)

**`clawql-mcp`** — MCP transport (stdio/HTTP/gRPC) and tool registration adapter in `src/`.

**`clawql-core`** — Foundational types, Plugin interface, Merkle/Cuckoo, audit ring buffer, cache helpers.

**`clawql-api`** — Intelligent gateway: `search()` / `execute()`, bundled + custom URL sources, REST/GraphQL/gRPC/MCP/CLI protocols, `createClawQLApi()`, Panguard proxy plugin.

**`clawql-memory`** — Vault, `memory.db`, ingest/recall, embeddings, optional pgvector.

**`clawql-documents`** — External ingest, **`DEFAULT_IDP_PIPELINE`**, **`run_idp_pipeline`**, eight bundled IDP vendors via `search`/`execute` and Helm — see [`idp-pipeline.md`](../providers/idp-pipeline.md).

**`clawql-automation`** — Schedule worker, Slack notify, Argo **`workflow`** / **`argocd`** (opt-in), NATS JetStream + HITL when enabled.

**`clawql-sandbox`** — **`sandbox_exec`** via **`SandboxPlugin`** (Kata default in-cluster).

**`clawql-ouroboros`** — Evolutionary self-improvement loops + **`OuroborosPlugin`**.

**`mcp-grpc-transport`** — gRPC MCP transport for cluster deployments.

**7.0 additions:** **`clawql-auth`** (gateway modes), **`clawql-pageindex`** + `pageindex_*` tools, Presidio gateway hooks (opt-in), **`clawql-release`** (Layer 0 manifest MVP), **`clawql-operator`** (opt-in K8s scaffold), custom sources + harness wrappers, install script, ClawQL Desktop, Tier 1 Compose. See [Getting started](https://docs.clawql.com/getting-started) and [Migration guide](https://docs.clawql.com/resources/migration).

**Plugin Phase 2:** All horizontal tiers register MCP tools via **`Plugin.onRegister`** and compose through **`composeHorizontalPluginLayers()`** — see [ClawQL plugin model](../design/clawql-plugin-model.md).

### Partially delivered & planned depth

**`clawql-auth` expansion** — OIDC/SAML/OAuth2, RBAC/ABAC beyond gateway `noAuth`/`apiKey` (Phase 1 basics shipped — [MCP clients — gateway auth](https://docs.clawql.com/mcp-clients#gateway-api-key-auth)).

**Presidio & gateway depth** — Opt-in gateway redaction shipped (`CLAWQL_ENABLE_PRESIDIO=1`); mandatory uniform redaction on every IDP hop, circuit breakers, Ouroboros position events on every `execute()`, and full WORM defaults remain roadmap.

**`clawql-telemetry`** — Dedicated observability package (OTEL at MCP transport today).

### Planned

Vertical packages, the **full** Kubernetes Operator (NL dashboard, dynamic Deployments, full auth reconciliation), and remaining horizontal packages (`clawql-data`, `clawql-printingpress`, `clawql-goose`). Layer 0 permanence (Arweave, Rift, Radicle primary). Specifications for not-yet-started packages are written and stable.

**Phase 2 focus:** Operator NL surface, third-party vertical plugin contract, transport-only `clawql-mcp` split — see [modularization implementation status §10](../design/modularization-implementation-status.md#10-phase-1-exit--complete-7000).

---

## 5. What Gets Built Next and Why

There are no fixed delivery dates. Priorities are determined by dependency order and community demand. The phases below reflect the logical sequence — each phase creates the conditions for the next.

### Phase 1: Core Stabilisation — **complete (7.0.0)**

**What:** `clawql-core`, `clawql-api`, `clawql-auth`, `clawql-documents`, `clawql-memory`, `clawql-pageindex`, Tier 1 Compose, Presidio gateway hooks

**Why first:** Everything else depends on these. The gateway cannot route without a stable Plugin interface. Verticals cannot register without a stable ProviderSpec registry. The Operator cannot compose layers without stable Effect Layer contracts. Rushing past this phase to ship verticals would mean rebuilding everything on an unstable foundation.

**Exit criteria:** ✅ Shipped — semver-stable horizontal packages, in-memory test layers, **`examples/clawql-local-docker-compose`**, gateway auth, PageIndex MCP tools, Presidio redaction hooks.

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

**Execution evidence.** Twelve workspace packages are shipped and in use (core, auth, pageindex, api, memory, documents, automation, sandbox, ouroboros, operator scaffold, release MVP, plus transports). Phase 1 exit criteria are met. The architecture is written in working TypeScript with enforced dependency rules, passing tests, and a live CI pipeline. Gateway depth (full Presidio mandate, circuit breakers), Layer 0 permanence, and verticals remain ahead.

**The specification is the contract.** This document, the Technical Specification, and the Deployment Guide are public and versioned. Interfaces are stable and semver-governed. A breaking change to a public interface requires a major version bump across all dependents. Contributors can build against the specification today knowing that changes will be signalled clearly.

**Demand-driven means the community sets priorities.** “No fixed dates” is not evasiveness — it is an acknowledgment that a small team building open infrastructure should respond to what people actually need rather than committing to a schedule that serves no one. The RFC process, GitHub Discussions, and the phased roadmap above give the community direct influence over what gets prioritised.

**Phase 1 is complete.** Evaluate today with [Tier 1 Docker Compose](../../examples/clawql-local-docker-compose/README.md) or Helm; start at [Getting started](https://docs.clawql.com/getting-started).

If you need production verticals or the full Operator before contributing, track Phase 2–4 in §5 above.

---

## 7. How to Get Involved

### Try it

The fastest way to see the full IDP stack on Kubernetes is **`make local-k8s-up`** (Helm + Docker Desktop) or **`helm upgrade --install`** per [helm.md](../deployment/helm.md). For **Docker Compose on localhost**, use **`examples/clawql-local-docker-compose`** ([#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)).

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

_ClawQL Vision & Roadmap · July 2026 · Apache 2.0 / MIT_  
_For implementation contracts: see the [Contributor Technical Specification](../contributing/clawql-contributor-technical-specification.md)._  
_For planned Operator / CRD deployment: see [Operator target architecture](../design/operator-target-architecture.md). Shipped installs: [Deployment & Operations Guide](../deployment/clawql-deployment-operations-guide.md)._
