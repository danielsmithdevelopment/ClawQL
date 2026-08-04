# ClawQL — Vision & Roadmap

**Public Edition · July 2026**
Apache 2.0 / MIT · [github.com/danielsmithdevelopment/ClawQL](https://github.com/danielsmithdevelopment/ClawQL)

---

## Read This First

ClawQL is under active development. The horizontal platform through **7.1.0** is shipped and documented in [Getting started](https://docs.clawql.com/getting-started). The table below is the honest current state; everything after it describes where ClawQL is going and why.

| Package                    | Status                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clawql-mcp`               | ✅ Shipped (transport + MCP registration in `src/`)                                                                                                                                                                                                                                                          |
| `clawql-core`              | ✅ Shipped (audit, Merkle, Cuckoo, Plugin types)                                                                                                                                                                                                                                                             |
| `clawql-api`               | ✅ Shipped (spec, execute, gateway, Panguard plugin, custom URL sources)                                                                                                                                                                                                                                     |
| `clawql-memory`            | ✅ Shipped (vault, memory.db, ingest/recall, Memory 2.0)                                                                                                                                                                                                                                                     |
| `clawql-documents`         | ✅ Shipped — ingest + `DEFAULT_IDP_PIPELINE` + `run_idp_pipeline`; 8 bundled IDP vendors; `classify_document` / `extract_document` opt-in                                                                                                                                                                    |
| `clawql-automation`        | ✅ Shipped — schedule, notify, `workflow`, `argocd`; NATS JetStream opt-in                                                                                                                                                                                                                                   |
| `clawql-sandbox`           | ✅ Shipped — `SandboxPlugin`, Kata default in-cluster `auto`                                                                                                                                                                                                                                                 |
| `clawql-ouroboros`         | ✅ Shipped — evolutionary loops + `OuroborosPlugin`; full Effect-native (7.1)                                                                                                                                                                                                                                |
| `clawql-codegraph`         | ✅ Shipped (7.1) — structural code graph; hybrid `memory_recall.sources`                                                                                                                                                                                                                                     |
| `clawql-ontology`          | ✅ Shipped (7.1) — versioned Enterprise Ontology + OKF; ADR 0009/0010                                                                                                                                                                                                                                        |
| `clawql-release`           | ✅ Shipped — workspaces, signing, IPFS→Lit→Arweave, x402, verify/pull CLI                                                                                                                                                                                                                                    |
| `clawql-operator`          | 🚧 Scaffold shipped (0.2.1) — CRD, tier-spec, layer composition; full operator planned                                                                                                                                                                                                                       |
| `mcp-grpc-transport`       | ✅ Shipped                                                                                                                                                                                                                                                                                                   |
| `mcp-openapi-gateway`      | 🚧 MVP (`0.1.0`) — MCP tools → named REST + OpenAPI on-ramp; gRPC `CallTool` backend ([design](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/mcp-openapi-gateway.md), [example](https://github.com/danielsmithdevelopment/ClawQL/blob/main/examples/mcp-openapi-gateway/README.md)) |
| `clawql-auth`              | ✅ Shipped — gateway `noAuth`/`apiKey`, ATR claims, provider headers                                                                                                                                                                                                                                         |
| `clawql-pageindex`         | ✅ Shipped — MIT package + `pageindex_*` MCP tools                                                                                                                                                                                                                                                           |
| `clawql-inference`         | ✅ Shipped — policy manifest, Langfuse + OTel tracing, pgvector semantic cache, OpenBench A/B, BYOK, OpenRouter-first path                                                                                                                                                                                   |
| `clawql-payments`          | ✅ Shipped — Stripe + x402 + MPP + AP2/ACP + PayPal + Adyen; credits/ACH, Connect payouts, USDC, AgentCompensationService, DeductionService                                                                                                                                                                  |
| Managed Edge Gateway       | 🚧 Shipped CLI (`clawql gateway create` / `status` / `destroy`); Helm `managedGateway` (off by default) — production hardening in progress                                                                                                                                                                   |
| `clawql-data`              | 📋 Planned                                                                                                                                                                                                                                                                                                   |
| `clawql-telemetry`         | 📋 Planned                                                                                                                                                                                                                                                                                                   |
| `clawql-printingpress`     | 📋 Planned                                                                                                                                                                                                                                                                                                   |
| `clawql-goose`             | 📋 Planned                                                                                                                                                                                                                                                                                                   |
| Kubernetes Operator (full) | 📋 Planned — NL dashboard, dynamic Deployments, full auth reconciliation                                                                                                                                                                                                                                     |
| Natural Language Dashboard | 📋 Planned                                                                                                                                                                                                                                                                                                   |
| All vertical packages      | 📋 Planned                                                                                                                                                                                                                                                                                                   |

**Detail:** [Modularization implementation status](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/modularization-implementation-status.md). **Horizontal plugins:** [ClawQL plugin model](https://docs.clawql.com/reference/plugins).

The foundation is production-ready today. The full Operator (NL dashboard, dynamic Deployments), Layer 0 permanence hardening, and vertical packages remain ahead.

---

## 1. What ClawQL Is

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.**

It is a modular orchestration platform: an Agentic Gateway that gives autonomous agents a single, secure, auditable surface to search and act across documents, persistent memory, structured data, and workflows — without requiring those agents to know anything about the underlying infrastructure. Enterprise deployments follow the [Zero-Trust Agentic Fabric](https://docs.clawql.com/architecture/agentic-fabric): Regional Hubs (routing/billing), Dedicated Virtual Gateways (Audit-Trail Enforcement Points with NATS JetStream + Valkey), and Edge Gateways on developer machines.

A practical way to think about it: when an agent needs to process a mortgage document, recall what it knows about a client, check a compliance rule, and write an audit record, it makes one call. ClawQL figures out where everything lives, enforces who is allowed to see what, redacts sensitive content before it touches anything persistent, and records a tamper-evident proof of the whole operation. The agent sees a clean result. The compliance team sees a complete trail.

ClawQL is the infrastructure layer that agent frameworks call into, not a reasoning or planning engine itself. Generic MCP servers are point integrations — one tool, one backend. ClawQL hosts and manages many tools under one gateway with consistent security, auditing, and memory across all of them.

---

## 2. The Problem Space

The problems ClawQL addresses are not individually new. What's new is how badly they compound when you try to run autonomous agents in a production environment.

### Fragmented tooling

Agent systems today are assemblies of disconnected pieces: a document store here, a vector database there, a workflow engine bolted on, several MCP servers with different contracts and no shared security model. Each integration is custom, each has its own failure modes, and there is no consistent surface for an agent to work against — which means no consistent place to enforce policy, audit actions, or reason about what happened.

### Context window mismanagement

The instinct when building agent systems is to feed documents into the context window. This fails at scale: documents are too long, context windows are expensive, and naively retrieving full documents means retrieving far more than is needed. The result is either truncation or cost explosion. Neither is acceptable in production.

### Institutional memory loss

Agent state is typically ephemeral. A pod restarts, a task completes, a session ends — and everything the agent learned or produced disappears. This forces agents to re-derive the same information repeatedly, makes long-running workflows fragile, and means valuable outputs vanish rather than accumulating into something useful over time.

### Regulatory and provenance gaps

Regulated industries require chain-of-custody records showing exactly what data was used to reach a decision, evidence that sensitive data was redacted before being stored or transmitted, and audit trails that cannot be tampered with after the fact. Most agent infrastructure produces none of this.

### Why these compound

Each problem makes the others worse. Fragmented tooling means you cannot enforce consistent redaction. Ephemeral memory means you cannot build a provenance chain across sessions. Context window mismanagement means you cannot scale to the document volumes that regulated workflows involve. Solving any one of them in isolation leaves the others as blockers. ClawQL addresses them together, which is why it has to be a platform rather than a library.

---

## 3. The Approach

### Agentic Gateway surface

Everything flows through the Agentic Gateway (`clawql-api` / `clawql-inference`). Agents call `search()` to discover what tools and data exist. They call `execute()` to act. One surface means one place to enforce policy, one audit trail, and one contract for every consumer. At enterprise scale, that surface is deployed as a fabric — Dedicated Virtual Gateways hold policy and WORM while Regional Hubs handle multi-tenant routing and billing.

### Persistent-first design

Every document processed, every piece of memory written, every tool generated by an agent gets stored with a tamper-evident proof of its provenance. Pod restarts, cluster upgrades, and task failures don't destroy state. Agents accumulate knowledge over time rather than starting from zero on every run.

### Defense-in-depth as the default

Security in ClawQL is the baseline, not a configuration option or a tier upgrade. Every request carries a verified identity claim. Sensitive data is redacted before it touches any persistent store. Every write produces a Merkle root. Containers run in hardware-isolated environments by default. The guiding principle is "secure the capabilities, not just the language" — runtime controls that apply regardless of what the model produces.

### Effect-TS as the foundation

The entire platform is built on Effect-TS. For non-technical readers: when a new package is added to ClawQL, the compiler verifies that all its dependencies are satisfied before the code runs. When a package is disabled, it contributes zero code to the running system. Security hooks, error handling, and resource cleanup are structural properties of the codebase. The 7.1 release completed the Effect-native migration across all horizontal packages — ouroboros, documents, automation, sandbox, and schema. Full rationale in the [Contributor Technical Specification](https://docs.clawql.com/contributing/technical-specification).

---

## 4. What Exists Today (7.1.0)

### Shipped — horizontal platform

**`clawql-mcp`** — MCP transport (stdio/HTTP/gRPC) and tool registration adapter.

**`clawql-core`** — Foundational types, Plugin interface, Merkle/Cuckoo, audit ring buffer, cache helpers.

**`clawql-api`** — Intelligent gateway: `search()` / `execute()`, bundled + custom URL sources, REST/GraphQL/gRPC/MCP/CLI protocols, Panguard proxy plugin.

**`clawql-memory`** — Vault, `memory.db`, ingest/recall, embeddings, optional pgvector. Memory 2.0: hybrid `memory_recall.sources` = `vault` | `vector` | `codegraph` | `pageindex` | `onyx`.

**`clawql-codegraph`** — Structural code graph (TypeScript compiler API + tree-sitter); symbol-level import/call graph; hybrid recall integration. Shipped in 7.1.

**`clawql-documents`** — External ingest, `DEFAULT_IDP_PIPELINE`, `run_idp_pipeline`, eight bundled IDP vendors, `classify_document` / `extract_document` opt-in. Full Effect-native in 7.1.

**`clawql-automation`** — Schedule worker, Slack notify, Argo `workflow` / `argocd`, NATS JetStream + HITL when enabled. Effect-native fibers in 7.1.

**`clawql-sandbox`** — `sandbox_exec` via `SandboxPlugin` (Kata default in-cluster). Effect-native in 7.1.

**`clawql-ouroboros`** — Evolutionary self-improvement loops + `OuroborosPlugin`. Effect-native through EventStore → Loop → Poller → engines → seed/revision → measureDrift in 7.1.

**`clawql-ontology`** — Versioned Enterprise Ontology + OKF (Ontology Knowledge Framework); ADR 0009/0010; `.cqe` format; kinetic MCP mandate gates; `clawql ontology lint | generate`. Shipped in 7.1.

**`clawql-inference`** — Policy manifest (`policy.yaml`), Langfuse + OTel tracing, pgvector distributed semantic cache, OpenBench A/B evaluation, BYOK builtins, OpenRouter-first path for aggregator customers.

**`clawql-payments`** — Full economics stack: Stripe + x402 + MPP + AP2/ACP + PayPal Orders (Tier 1) + Adyen Checkout (Tier 2); prepaid credits + Stripe Financial Connections/ACH; Connect payouts + live Base USDC + Ramp agentic + consumer off-ramp; `AgentCompensationService` (SGDOP recruit → pay → cash out); Effect `DeductionService` (sync hold/capture; post-commit NATS/outbox). MCP tools: `CLAWQL_PAYMENTS_MCP_TOOLS=1`.

**`clawql-release`** — Layer 0 immutable release pipeline: workspaces, signatures, IPFS staging, Lit/x402 encryption, Arweave permanence (dry-run), verify/pull CLI.

**`mcp-grpc-transport`** — gRPC MCP transport for cluster deployments (MCP 2026-07-28 protobuf `ListTools` / `CallTool`).

**`mcp-openapi-gateway`** (MVP) — Thin OpenAPI on-ramp: `POST /{toolName}` + `/openapi.json` + Swagger UI, forwarding into gRPC `CallTool`. Funnel for non-MCP clients (Workers, OpenWebUI) onto the TypeScript gRPC transport. Design: [`docs/design/mcp-openapi-gateway.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/mcp-openapi-gateway.md). Example: [`examples/mcp-openapi-gateway/`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/examples/mcp-openapi-gateway/README.md).

**`clawql-auth`** — Gateway modes, ATR claims, provider headers.

**`clawql-pageindex`** — MIT package + `pageindex_*` tools.

**7.0 additions (still in place):** custom sources + harness wrappers, install script, ClawQL Desktop, Tier 1 Compose, Presidio gateway hooks (opt-in), `clawql-operator` scaffold.

### Shipped CLI/surface in 7.1

**Managed Edge Gateway** — `clawql gateway create|status|destroy`; `/mcp` + `/v1`; VK → tenant claims; Helm `managedGateway` (off by default, production hardening in progress).

### Partially delivered

**`clawql-auth` expansion** — OIDC/SAML/OAuth2, RBAC/ABAC beyond gateway `noAuth`/`apiKey`. Phase 1 basics shipped.

**Presidio & gateway depth** — Opt-in gateway redaction shipped (`CLAWQL_ENABLE_PRESIDIO=1`); mandatory uniform redaction on every IDP hop, circuit breakers, and full WORM defaults remain roadmap.

**`clawql-operator`** — Scaffold (0.2.1) shipped; full NL dashboard, dynamic Deployments, and auth reconciliation planned.

### Planned

Vertical packages, the full Kubernetes Operator, and remaining horizontal packages (`clawql-data`, `clawql-telemetry`, `clawql-printingpress`, `clawql-goose`). **`mcp-openapi-gateway`** (MCP tools → OpenAPI REST on-ramp over gRPC — [design](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/mcp-openapi-gateway.md)). Layer 0 permanence production hardening (Arweave, Rift, Radicle primary). Specifications for not-yet-started packages are written and stable.

**Unreleased (post-7.1, on `main`):** OpenBench/BYOK hardening, Managed Edge Gateway production path, Layer 0 pipeline additional durability, Plugins IA, IDP GTM docs, sync ensure, Cloud Agent MCP fixes; **`mcp-openapi-gateway`** design accepted (implementation not started).

---

## 5. What Gets Built Next and Why

There are no fixed delivery dates. Priorities are determined by dependency order and community demand.

### Phase 1: Core Stabilisation — complete (7.0.0)

**What:** `clawql-core`, `clawql-api`, `clawql-auth`, `clawql-documents`, `clawql-memory`, `clawql-pageindex`, Tier 1 Compose, Presidio gateway hooks.

**Exit criteria:** ✅ Shipped — semver-stable horizontal packages, in-memory test layers, `examples/clawql-local-docker-compose`, gateway auth, PageIndex MCP tools, Presidio redaction hooks.

### Phase 1.1: Platform depth — complete (7.1.0)

**What:** Effect-native migration across all horizontal packages; enterprise Ontology + OKF; full payments economics stack; `clawql-codegraph`; Memory 2.0 hybrid recall; inference policy + observability; managed edge gateway CLI; Layer 0 immutable release pipeline; GTM repositioning around Agentic Gateway / Zero-Trust Agentic Fabric.

**Why:** The Effect migration closes the structural correctness guarantees described in §3. Enterprise Ontology and payments unlock the agentic economics story — agents that earn, compensate collaborators, and participate in economic flows, not just tools that execute operations. `clawql-codegraph` makes Memory 2.0 useful for engineering workflows specifically. The managed edge gateway CLI is the first step toward the Dedicated Virtual Gateway tier at production scale.

**Exit criteria:** ✅ Shipped — 107 merged PRs, +71k/−21k lines, `v7.1.0` published 2026-07-20.

### Phase 1.2: MCP OpenAPI on-ramp (MVP in-repo)

**What:** `mcp-openapi-gateway` — generate OpenAPI from MCP `ListTools`, serve `POST /{toolName}` + Swagger UI, forward into **`mcp-grpc-transport` `CallTool`**.

**Why:** Non-MCP clients (Workers, OpenWebUI OpenAPI tools, custom gateways) need tool-name HTTP. Building the facade ourselves — gRPC-first, TypeScript-native — drives adoption of the production gRPC transport rather than ceding the on-ramp to Python/stdio-only proxies. Design: [`docs/design/mcp-openapi-gateway.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/mcp-openapi-gateway.md). Example: [`examples/mcp-openapi-gateway/`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/examples/mcp-openapi-gateway/README.md).

**Exit criteria:** ✅ In-repo MVP — package + e2e + dual-surface example demos. Remaining: independent npm publish; optional Compose/Helm sidecar.

### Phase 2: Operator and Natural Language Surface

**What:** Kubernetes Operator (`ClawQLInstance` CRD), Hermes supervisor, OpenClaw messaging gateway, natural language dashboard.

**Why:** The Operator is what makes ClawQL operationally manageable at Tier 2 and Tier 3. Without it, enabling a vertical means manually composing layers and editing YAML. The natural language surface depends on a stable tool catalog, which requires the gateway to be stable first. This phase turns ClawQL from a developer tool into a platform that operators can run.

**Exit criteria:** Tier 2 Helm deployment works, the Operator reconciles cleanly, and at least five natural language commands translate correctly to CRD patches.

### Phase 3: First Vertical — Lending

**What:** `clawql-lending` — mortgage, auto, BNPL, and commercial lending workflows, deal room automation, credit analysis, underwriting decision engine.

**Why lending first:** It is the most complete specification, it has a known production use case (SeeTheGreens LOS), and it exercises the widest range of platform capabilities: document processing, memory recall, compliance controls, HITL gates, and Merkle auditing. A successful lending vertical validates the full platform.

**Exit criteria:** A complete W-2 processing workflow runs end-to-end with Presidio redaction, Merkle auditing, Memory 2.0 ingest, and deal room creation via natural language command.

### Phase 4: Community Vertical Ecosystem

**What:** Remaining planned verticals (`clawql-legal`, `clawql-healthcare`, `clawql-insurance`, `clawql-supplychain`, `clawql-government`, `clawql-manufacturing`, `clawql-education`, `clawql-engineering`) plus community-contributed verticals.

**Why fourth:** Verticals can be built in parallel once the platform is stable and the lending vertical has validated the contribution model. The 12-step checklist and vertical template exist specifically to make this parallelisable.

**Exit criteria:** At least three verticals beyond lending are merged and running in the unified Helm chart. Community RFC process is active.

---

## 6. Why Trust This Will Be Built

That is a fair question and it deserves a direct answer.

**Execution evidence.** 7.1.0 shipped on July 20, 2026 — 107 merged PRs in 13 days, 979 files changed, the Effect migration complete across all horizontal packages, five new packages or surfaces shipped, and a full payments economics stack that didn't exist at 7.0. Phase 1 exit criteria are met. The architecture is written in working TypeScript with enforced dependency rules, passing tests, and a live CI pipeline.

**The specification is the contract.** This document, the Technical Specification, and the Deployment Guide are public and versioned. Interfaces are stable and semver-governed. A breaking change to a public interface requires a major version bump across all dependents. Contributors can build against the specification today knowing that changes will be signalled clearly.

**Demand-driven means the community sets priorities.** There are no fixed dates — that is an acknowledgment that a small team building open infrastructure should respond to what people actually need rather than committing to a schedule that serves no one. The RFC process, GitHub Discussions, and the phased roadmap above give the community direct influence over what gets prioritised.

**Evaluate today.** Start with [Tier 1 Docker Compose](https://github.com/danielsmithdevelopment/ClawQL/blob/main/examples/clawql-local-docker-compose/README.md) or Helm; see [Getting started](https://docs.clawql.com/getting-started). If you need production verticals or the full Operator before contributing, track Phase 2–4 in §5 above.

---

## 7. How to Get Involved

### Try it

The fastest path to the full IDP stack on Kubernetes is `make local-k8s-up` (Helm + Docker Desktop) or `helm upgrade --install` per [helm.md](https://docs.clawql.com/helm). For Docker Compose on localhost, use `examples/clawql-local-docker-compose`.

```bash
git clone https://github.com/danielsmithdevelopment/ClawQL.git
cd ClawQL/examples/clawql-local-docker-compose
./bootstrap.sh
docker compose up -d
# Dashboard: http://localhost:8080
```

Upload a document or run `@hermes process this document` in the chat to see the document pipeline in action.

### Contribute a vertical

If your organisation works in a domain ClawQL targets — or one it doesn't yet target — the vertical template and 12-step contribution checklist are in the repository. The checklist has acceptance criteria for each step. Verticals can be started now; they cannot be merged until Phase 2 is stable.

### Influence the roadmap

Open an RFC in GitHub Discussions. The RFC process is the mechanism for proposing new verticals, new provider adapters, changes to core interfaces, and significant architectural decisions. RFCs that attract community support move up in priority.

### Follow progress

The public roadmap is tracked in GitHub Discussions with phase-level milestones. Phase entry and exit criteria are documented so you can see exactly where things stand.

---

_ClawQL Vision & Roadmap · July 2026 · Apache 2.0 / MIT_
_For implementation contracts: see the [Contributor Technical Specification](https://docs.clawql.com/contributing/technical-specification)._
_For planned Operator / CRD deployment: see [Operator target architecture](https://docs.clawql.com/design/operator-target-architecture). Shipped installs: [Deployment & Operations Guide](https://docs.clawql.com/deployment/operations-guide)._

© Copyright 2026. All rights reserved. · [ClawQL on GitHub](https://github.com/danielsmithdevelopment/ClawQL)
