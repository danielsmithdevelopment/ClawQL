# ClawQL — Master Enablement Document
**Unified Living Reference & Technical Bible — May 2026 Edition**
Public Document · Open for Community Review & Contribution · Apache 2.0 / MIT

---

## Document Control

| Field | Value |
|---|---|
| Version | 2026.05 |
| Status | Living Document |
| Last Updated | May 15, 2026 |
| License | Apache 2.0 (core); MIT (clawql-pageindex); CC-BY-SA 4.0 (documentation) |

### Version History

| Version | Summary |
|---|---|
| 2026.05 | Consolidated public master reference. Merged vision, architecture, deployment tiers, and compliance framework. |
| 2026.04 | Initial modular Effect-TS architecture baseline. |
| Earlier | Internal vision documents (April 2026). |

---

## ⚠️ Current Platform Status

**Read this before anything else.**

ClawQL is under active development. Not all components described in this document are shipped. The table below is the canonical reference for what exists today.

| Package | Status |
|---|---|
| `clawql-core` | 🔨 In development |
| `clawql-api` | 🔨 In development |
| `clawql-auth` | 🔨 In development |
| `clawql-documents` | 🔨 In development |
| `clawql-memory` | 🔨 In development |
| `clawql-pageindex` | 🔨 In development |
| `clawql-mcp` | ✅ Shipped |
| `clawql-ouroboros` | ✅ Shipped |
| `mcp-grpc-transport` | ✅ Shipped |
| `clawql-data` | 📋 Planned |
| `clawql-automation` | 📋 Planned |
| `clawql-telemetry` | 📋 Planned |
| `clawql-sandbox` | 📋 Planned |
| `clawql-printingpress` | 📋 Planned |
| `clawql-goose` | 📋 Planned |
| `clawql-lending` | 📋 Planned — not shipped |
| `clawql-legal` | 📋 Planned — not shipped |
| `clawql-healthcare` | 📋 Planned — not shipped |
| `clawql-insurance` | 📋 Planned — not shipped |
| `clawql-supplychain` | 📋 Planned — not shipped |
| `clawql-government` | 📋 Planned — not shipped |
| `clawql-manufacturing` | 📋 Planned — not shipped |
| `clawql-education` | 📋 Planned — not shipped |
| `clawql-engineering` | 📋 Planned — not shipped |
| `clawql-blockchain` | 📋 Planned — not shipped |
| Kubernetes Operator | 📋 Planned |
| Natural Language Dashboard | 📋 Planned |

This document specifies the intended complete design. Implementation is phased and demand-driven; no fixed delivery dates are set. All interfaces, schemas, and patterns described here are stable and intended for broad adoption.

---

## Intended Audience & How to Use This Document

| Audience | Start here |
|---|---|
| Quick evaluators | §2, §4, §17 |
| Developers & contributors | §5, §6, §7, §19 |
| Platform operators | §13, §14, §16 |
| Architects | §6, §7, §8, §9 |
| Compliance & legal teams | §12, §11, §18 |

Cross-references are provided throughout. All YAML, schemas, and code examples are written against the reference implementation.

### Resources

- **GitHub:** https://github.com/clawql/clawql
- **Docs:** https://docs.clawql.com
- **Community:** Discord + GitHub Discussions + RFC process (links in repository)
- **Demo / Pilot Requests:** Open an issue or contact via GitHub

---

## Table of Contents

1. Executive Summary & Vision
2. Core Principles
3. Deployment Tiers & Resource Profiles
4. Complete Package Ecosystem
5. Architecture & Dependency Graph
6. Effect-TS Foundation & Registry System
7. Data & Infrastructure Stack
8. Intelligent MCP Gateway (`clawql-api`)
9. Horizontal Layers
10. Vertical Workflows
11. Security: Defense-in-Depth
12. Kubernetes Operator & ClawQLInstance CRD
13. Natural Language Interface & Dashboard
14. Agent Runtime, Tool Generation & Self-Improvement
15. Testing, Observability & Operations
16. Deployment Guides & Quick-Starts
17. Regulatory & Compliance Readiness
18. Versioning, Contribution & Ecosystem
19. Appendices

---

# 1. Executive Summary & Vision

## 1.1 What ClawQL Is

ClawQL is a single intelligent MCP gateway and modular orchestration platform. It lets any agent securely search, reason over, and execute across documents, persistent hierarchical memory, structured data, workflows, and optional on-chain actions — all through one unified, hardened surface with full Defense-in-Depth, natural language operations, and true opt-in modularity.

## 1.2 Vision Evolution

The original April 2026 concept centred on a unified MCP server as a natural-language gateway to documents and a knowledge graph. By May 2026 this evolved into a rigorous, production-hardened architecture:

- **Effect-TS** as the foundational layer for typed, composable, resource-safe pipelines
- Acyclic modular monorepo with clean Effect Layers
- `clawql-api` as the sole intelligent gateway
- Horizontal layers providing shared capabilities
- 10+ opt-in vertical packages with zero runtime footprint when disabled
- Full Defense-in-Depth integration (Kata Containers, Presidio redaction, Merkle auditing, ATR enforcement)
- Kubernetes Operator with natural-language reconciliation (planned)
- Persistent-first design including Goose runtime abstraction and Printing Press tool generation (planned)

## 1.3 Two Forks, One Core, Zero Drift

ClawQL maintains a single core codebase with two supported forks:

- **Public / Web3 Fork (ClawQL-Web3):** Includes x402 micropayments, ERC-4337 agent wallets, The Graph, Chainlink, and open community verticals.
- **Regulated Enterprise Fork (ClawQL-MCP / SeeTheGreens):** Enhanced compliance controls, full audit provenance, Hyperledger Fabric toggle, and flagship regulated workflows (e.g., lending LOS).

Shared assets make up 95%+ of code. Both forks use the same security baseline, Helm chart, and Operator.

## 1.4 The Problems ClawQL Solves

**Fragmented tooling.** Agent systems today bolt together disconnected document stores, vector DBs, workflow engines, and MCP servers with no coherent contract between them. ClawQL provides a single, consistent surface.

**Context window explosion.** Naively feeding documents into LLM context is expensive and often impossible at scale. ClawQL's PageIndex, GraphQL projection, and token-budgeted recall solve this structurally.

**Institutional memory loss.** Agent state and generated artefacts vanish on pod restart. ClawQL's persistent-first design — Merkle-rooted, bind-mounted, Memory 2.0-indexed — ensures nothing is lost.

**Document intelligence gaps.** Most platforms treat documents as raw text. ClawQL runs a full Tika → Gotenberg → Stirling-PDF → Presidio → Paperless pipeline with per-stage auditing.

**Regulatory and provenance shortfalls.** Regulated industries need chain-of-custody, redaction, and WORM audit trails, not just logs. ClawQL makes this the default, not an afterthought.

**Production hardening deficits.** LLM tooling is commonly research-grade. ClawQL's circuit breakers, chaos-tested failure isolation, Kata Containers, and ATR enforcement target genuine enterprise readiness.

## 1.5 Key Differentiators

| Comparison | How ClawQL differs |
|---|---|
| **vs. base Goose** | Adds persistent memory, document intelligence, compliance controls, and a unified MCP surface. Goose is the execution runtime; ClawQL is the full platform. |
| **vs. Stripe Minions** | ClawQL is self-hostable, open-source, and regulation-first. Minions targets cloud-native payment workflows; ClawQL targets any regulated domain. |
| **vs. Hermes / OpenClaw** | Hermes/OpenClaw are messaging and supervisor layers. ClawQL embeds them as components within a larger orchestration platform. |
| **vs. LangGraph / Semantic Kernel** | ClawQL is not an agent framework — it is the infrastructure layer beneath agents. It provides the tools those frameworks call, not the reasoning logic. |
| **vs. generic MCP servers** | Generic MCP servers are point integrations. ClawQL is a composable, audited, compliance-aware platform that hosts and manages many MCP surfaces under one gateway. |

## 1.6 Ultimate Goal

ClawQL enables any organisation to run production-grade autonomous agent swarms that maintain perfect long-term memory, operate under strict compliance boundaries, self-heal under load, evolve their own tool surface through on-demand Printing Press generation, and remain fully auditable, privacy-first, and insurable against AI operational risks.

---

# 2. Core Principles

These principles are non-negotiable. They are enforced across all packages, the Kubernetes Operator, CI pipelines, admission webhooks, and Effect-TS layer composition.

## 2.1 Natural Language as the Primary Interface

Every operation — configuration, scaling, debugging, governance, tool generation, vertical enablement, and workflow execution — must be reachable via natural language through the Hermes/OpenClaw Agent Chat or the Dashboard. Direct YAML edits or `kubectl` commands are emergency-only. The NL-to-tool-call pipeline (§13) translates intent into audited `clawql-api.execute()` calls.

## 2.2 Single Intelligent MCP Surface

All agent, human, and system interaction occurs exclusively through `clawql-api` via unified `search()` and `execute()` methods. No direct backend access is permitted. `clawql-api` owns intelligent routing, ATR enforcement, Presidio redaction, token optimisation via GraphQL projection, Merkle auditing, and dynamic tool registration.

## 2.3 Effect-TS as the Foundational Effect System

The entire platform is built on Effect-TS for type safety, composable Layers, structured concurrency with Fibers, typed errors, streaming pipelines, and resource management. Traditional `async/await` and OOP decorators are avoided.

## 2.4 Strict Separation of Concerns and Acyclic Dependency Graph

- Primitives live in `clawql-core`.
- Universal access lives in `clawql-api`.
- Horizontal capabilities sit below verticals.
- No vertical may import another vertical.
- All cross-communication routes through `clawql-api` or gated Memory 2.0 recall.

The graph is enforced by ESLint rules, TypeScript project references, Turborepo, Effect-TS Layer validation, and CI checks.

## 2.5 Zero Operational Burden via Kubernetes Operator

The Operator performs continuous reconciliation, self-healing, secret rotation, volume management, dynamic MCP registration, and Effect Layer composition. Natural language commands are translated into safe CRD mutations. Day-to-day operations require no manual YAML or `kubectl` intervention.

## 2.6 Defense-in-Depth as Non-Negotiable Baseline

Security is implemented in overlapping layers under a "secure the capabilities, assume breach" mindset:

- Kata Containers / gVisor runtime isolation
- Panguard MCP proxy with real-time ATR enforcement
- Presidio redaction at every data boundary (always before Merkle rooting)
- Merkle trees + Cuckoo filters for immutable auditing
- ATR claims with vertical RLS and cross-vertical gating
- WORM audit tables and cryptographic erasure for GDPR

No component may bypass these controls.

## 2.7 True Opt-in Modularity with Zero Runtime Footprint

All vertical and non-essential horizontal packages are disabled by default. When disabled, they contribute zero runtime code, zero bundle size (tree-shaking), and zero Docker layers. This guarantee is enforceable at both compile time and deployment time.

## 2.8 Persistent-First Design

Nothing is ephemeral by default. Goose task outputs, Printing Press-generated binaries, document artefacts, and Memory 2.0 graph nodes all persist with full Merkle provenance. Bind-mounted volumes and Memory 2.0 ingestion ensure generated tools and agent state survive pod restarts and cluster upgrades.

## 2.9 Open, Community-Aligned, and Extensible

`clawql-pageindex` ships as a completely standalone MIT package with zero ClawQL dependencies. All core interfaces are fully documented. Goose integration uses a thin abstraction so alternative runtimes can be swapped without core changes. Community verticals follow a documented 12-step contribution checklist.

## 2.10 GDPR + WORM Compliance via Cryptographic Erasure

Personal data is encrypted at ingest with per-subject keys in Vault. Presidio redaction runs before Merkle rooting. WORM audit tables store only non-personal metadata and roots. On erasure request, the subject's key is destroyed, rendering personal data irrecoverable while preserving immutable audit integrity.

---

# 3. Deployment Tiers & Resource Profiles

ClawQL runs from a laptop to a large-scale enterprise cluster on the same codebase. The three tiers help operators right-size infrastructure.

> **Note on resource figures.** The RAM numbers below are measured idle baselines on development hardware (modern x86-64, 2024-era Linux kernel). Active workloads — especially document processing (Tika, Presidio) and Goose tasks — will consume substantially more. Treat these as planning minimums, not ceilings. They will be updated as benchmarks on representative hardware are completed.

## 3.1 Tier 1 — Local Developer

**Purpose:** Local development, prototyping, personal use, evaluation.
**Runtime:** Docker Compose (preferred) or single-node k3s. No Operator required.

**Included:**
- `clawql-api` (single replica)
- `clawql-memory` with SQLite backend
- `clawql-pageindex` (embedded)
- `clawql-auth` in explicit `noAuth` mode
- Paperless-ngx, Apache Tika, Gotenberg
- Redis (Paperless broker only)

**Not included:** Sandbox/Kata, Presidio (optional), NATS JetStream, vertical packages, Printing Press, Goose, full Operator.

**Approximate idle RAM:** ~880 MB
**Recommended hardware:** 4 GB RAM, 2 CPU cores, 40 GB SSD

## 3.2 Tier 2 — Standard Self-Hosted

**Purpose:** Team use, early production, single-vertical workloads.
**Runtime:** 3-node Kubernetes cluster (k3s or kubeadm). Operator enabled.

**Approximate baseline RAM (no active Goose pods):** ~5.5 GB
**Recommended hardware:** 3 × (4-core, 8 GB RAM) nodes, or one 16 GB / 8-core VM for non-HA.

## 3.3 Tier 3 — Enterprise Production

**Purpose:** Multi-tenant, multi-vertical, regulated workloads at scale.
**Runtime:** 5+ node Kubernetes cluster with dedicated node pools, Kata Containers, Istio service mesh.

**Approximate baseline RAM (no active Goose pods):** ~20–28 GB
**Recommended hardware:** 5+ × (8-core, 32 GB RAM) nodes with fast NVMe and 10 Gbps networking.

## 3.4 Per-Component Resource Reference

> These figures are measured at idle under minimal load. "Active" figures are approximate and vary widely with document size, concurrency, and model complexity.

| Component | Idle RAM | Active RAM | CPU at idle / active |
|---|---|---|---|
| `clawql-api` | ~150 MB | 300–500 MB | Low / Medium |
| Postgres + TimescaleDB | ~512 MB | 1–2 GB | Low / Medium |
| Apache Tika | ~200 MB | 800 MB–1.5 GB | Low / High |
| Presidio | ~400 MB | 1.5–2 GB | Medium / High |
| Goose (active task) | — | 512 MB–1 GB | Medium / High |
| NATS JetStream | ~256 MB | 512 MB–2 GB | Low / Medium |

## 3.5 Cost Model

- **Software:** Fully open-source (Apache 2.0 / MIT). No licensing fees.
- **Infrastructure:** Pay only for hardware, storage, and cloud resources you provision.
- **Managed offering (optional):** Includes Operator management, SLAs, compliance consulting, and priority support.

## 3.6 Tier Selection Decision Matrix

| Requirement | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Solo developer / prototyping | ✅ | — | — |
| Team production (single vertical) | — | ✅ | — |
| Multi-tenant / regulated | — | — | ✅ |
| Kata / full isolation | — | Optional | ✅ |
| Goose + Printing Press at scale | — | Limited | ✅ |
| Full vertical ecosystem | — | 1–2 | Unlimited |

---

# 4. Complete Package Ecosystem

ClawQL is organised as a Turborepo-managed monorepo with strict layering. All packages follow the principles in §2.

## 4.1 Always-Enabled Packages

### `clawql-core` 🔨 In development

Foundational types: `EntityNode`, `Edge`, `ATRClaims`, `AuditEvent`, `PageIndexNode`, `RecallMode`, `SpecKind`, `ProviderSpec`, `Plugin`. Also: Merkle utilities, Cuckoo filter, audit ring buffer with WORM semantics, structured error factories, cache helpers, ULID/Snowflake ID generation, `normalizeOperationId` utility, and base Effect-TS Layers and Schemas.

### `clawql-api` 🔨 In development

Universal intelligent MCP gateway and primary product surface. Implements `createApi()` factory, unified `search()` and `execute()` surface, protocol-aware routing, GraphQL projection, dynamic tool registration, ATR enforcement, redaction hooks, Merkle auditing, circuit breakers, and multi-transport support.

## 4.2 Default-Enabled Horizontal Layers

| Package | Status | Responsibilities |
|---|---|---|
| `clawql-auth` | 🔨 In development | Multi-mode authentication, RBAC/ABAC, vertical RLS, ATR claim enrichment, session management |
| `clawql-documents` | 🔨 In development | Complete document intelligence pipeline (Tika, Gotenberg, Stirling-PDF, Presidio, Paperless NGX) |
| `clawql-memory` | 🔨 In development | Memory 2.0 hybrid system (vault + graph + PageIndex + Onyx) |
| `clawql-pageindex` | 🔨 In development | Standalone MIT package — vectorless hierarchical indexing |

## 4.3 Default-Disabled (Opt-In) Horizontal Layers

| Package | Status | Responsibilities |
|---|---|---|
| `clawql-data` | 📋 Planned | Pluggable data providers (Valkey, Postgres, DuckDB, SeaweedFS, etc.) |
| `clawql-automation` | 📋 Planned | NATS JetStream scheduling, HITL gates, notifications, workflows |
| `clawql-telemetry` | 📋 Planned | OpenTelemetry + Prometheus (Operator-injected sidecar) |
| `clawql-sandbox` | 📋 Planned | Kata Containers / gVisor secure execution |
| `clawql-printingpress` | 📋 Planned | On-demand generation of signed Go CLIs and MCP servers |
| `clawql-goose` | 📋 Planned | Management of Goose agent runtimes |

## 4.4 Vertical Packages

**All verticals are planned and not yet shipped.** They are specified here so that contributors, evaluators, and regulated customers can understand the intended scope and begin integration planning.

| Package | Domain |
|---|---|
| `clawql-lending` | Mortgage, auto, BNPL, commercial underwriting (flagship regulated workflow) |
| `clawql-blockchain` | Hyperledger Fabric, Chainlink, The Graph, ERC-4337, x402 |
| `clawql-legal` | Contract intelligence, clause extraction, privilege redaction |
| `clawql-healthcare` | FHIR, HL7, DICOM, HIPAA de-identification |
| `clawql-insurance` | Claims processing, fraud detection |
| `clawql-supplychain` | BOL, customs, invoice matching, tariff compliance |
| `clawql-government` | Permitting, FOIA, procurement |
| `clawql-manufacturing` | Work orders, BOM, traceability |
| `clawql-education` | LMS, syllabus generation, FERPA |
| `clawql-engineering` | MATLAB/Simulink integration |

## 4.5 Already Shipped Packages

- `clawql-mcp` ✅
- `clawql-ouroboros` ✅
- `mcp-grpc-transport` ✅

## 4.6 Internal Monorepo Utilities

- `@clawql/merkle`
- `@clawql/cuckoo`
- `@clawql/utils`

---

# 5. Architecture & Dependency Graph

ClawQL enforces a strict, unidirectional, acyclic architecture for long-term maintainability, compile-time safety, and zero-footprint modularity.

## 5.1 Canonical Layering Order

```
Primitives (Effect-TS base)
        ↓
   clawql-core
        ↓
   clawql-api  (Intelligent MCP Gateway + Layer Composition Root)
        ↓
Horizontal Layers
   ├── clawql-auth
   ├── clawql-documents
   ├── clawql-memory (+ clawql-pageindex)
   ├── clawql-data
   ├── clawql-automation
   ├── clawql-telemetry   (Operator-injected sidecar)
   ├── clawql-sandbox
   ├── clawql-printingpress
   └── clawql-goose
        ↓
Vertical Packages  (all planned, none shipped)
   ├── clawql-lending
   ├── clawql-blockchain
   ├── clawql-legal
   ├── clawql-healthcare
   ├── clawql-insurance
   ├── clawql-supplychain
   ├── clawql-government
   ├── clawql-manufacturing
   ├── clawql-education
   └── clawql-engineering
        ↓
(Community verticals)
```

All arrows represent allowed import directions only. No upward or cross-layer imports are permitted except through explicit Effect-TS Layers or `clawql-api`.

## 5.2 Full Acyclic Dependency Graph

```
@clawql/merkle   @clawql/cuckoo   @clawql/utils
         │              │              │
         └──────────────┴──────────────┘
                        │
                   clawql-core
                        │
           ┌────────────┴────────────────┐
           │                             │
      clawql-api            clawql-pageindex (MIT standalone)
           │
    ┌──────┼──────────────────────┐
    │      │                      │
clawql- clawql-             clawql-
 auth  documents             memory
           │
    ┌──────┼──────────────────────┼──────────────────────┐
    │      │                      │                      │
clawql- clawql-            clawql-               clawql-
sandbox printingpress       goose              automation
                                                    │
                                            [NATS JetStream]
    ┌──────────────────────────────────────────────────────┐
    │                                                      │
[All Vertical Packages]                         clawql-telemetry
```

## 5.3 Strict Dependency Rules & Enforcement

**Rules:**
- No vertical package may import another vertical. Cross-vertical communication must route through `clawql-api.execute()` or gated `clawql-memory` recall using `cross_vertical` mode.
- Horizontal layers may not import other horizontal layers directly (except through `clawql-api`).
- `clawql-telemetry` is never imported; it is injected as an OpenTelemetry sidecar by the Operator.
- `clawql-lending` declares `clawql-blockchain` as an optional peer dependency only.
- All packages import types and utilities exclusively from `clawql-core`.
- `clawql-pageindex` has zero dependencies on any other ClawQL package.

**Enforcement mechanisms:**
- ESLint `no-restricted-imports` + custom architecture rules
- TypeScript project references (`tsconfig.json`)
- Turborepo dependency graph validation
- Effect-TS Layer composition (compile-time dependency checks)
- CI pipeline (madge + architecture diagram diff detection)
- Operator admission webhooks

## 5.4 Plugin Interface

Every vertical and major horizontal package implements this interface from `clawql-core`:

```typescript
export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly vertical?: string;

  onRegister(api: ClawQLApi): Effect.Effect<void, ClawQLError, ClawQLApi>;

  onIngestHook?(
    node: EntityNode,
    context: IngestContext
  ): Effect.Effect<EntityNode, ClawQLError, ClawQLApi>;

  onRecallFilter?(
    claims: ATRClaims,
    options: RecallOptions
  ): Effect.Effect<RecallOptions, ClawQLError, ClawQLApi>;

  onComplianceReport?(): Effect.Effect<ComplianceReport, ClawQLError, ClawQLApi>;

  requiredSpecs?: ProviderSpec[];
  recommendedSpecs?: ProviderSpec[];

  onTeardown?(api: ClawQLApi): Effect.Effect<void, ClawQLError, ClawQLApi>;
}
```

Registration occurs exclusively via Effect Layers.

## 5.5 ProviderSpec & Registry System

```typescript
export interface ProviderSpec {
  kind: SpecKind;          // e.g. "postgres", "duckdb", "valkey", "fabric"
  id: string;              // unique within instance
  enabled: boolean;
  secretRef?: string;
  url?: string;
  capabilities?: string[];
  options?: Record<string, unknown>;
}
```

The registry performs compile-time and runtime validation of required providers for each vertical. Missing providers are rejected by CI and Operator admission webhooks before deployment.

## 5.6 Cross-Vertical Communication Rules & Data Lineage Model

- All cross-vertical operations must use explicit `cross_vertical` ATR claims with a required `purpose` field.
- Results are stamped with lineage metadata: `{ sourceVertical, recallPath, purposeClaim, atrSnapshotAtRecall, timestamp }`.
- Compliance Center provides traceability queries for all decisions influenced by cross-vertical data.

---

# 6. Effect-TS Foundation & Registry System

Effect-TS is the architectural foundation of ClawQL, providing compile-time guarantees for dependencies, errors, resources, and concurrency across dozens of verticals and providers.

## 6.1 Rationale for Effect-TS

Effect-TS was selected for:

- **Full type safety** for errors, resources, and dependencies
- **Composable Layers** for declarative dependency injection
- **Structured concurrency** with Fibers (prevents leaks and races)
- **Native streaming** and backpressure support
- **Excellent testability** with in-memory layer substitution
- **Mature ecosystem** (Schema, Context, Match, etc.)

Runtime surprises become compile-time errors. Traditional `async/await` spaghetti and OOP decorators are eliminated.

## 6.2 Layer Composition Patterns

All functionality is expressed as composable, lazy Effect Layers:

```typescript
export const DataLayer = Layer.mergeAll(
  ValkeyLive,
  PostgresLive,
  DuckDBLive,
  SeaweedFSLive,
  ProviderRegistryLive
);

const AppLayer = Layer.mergeAll(
  CoreLayer,
  DataLayer,
  AuthLayer,
  DocumentsLayer,
  MemoryLayer,
  ...enabledVerticalLayers
);
```

The Operator dynamically composes only enabled layers at startup. Disabled packages are excluded entirely from the bundle and runtime.

## 6.3 Provider Registry & Compile-Time Validation

```typescript
export const LendingVertical = defineVertical({
  name: "lending",
  requiredProviders: [
    createProviderSpec({ kind: "postgres", id: "operational" }),
    createProviderSpec({ kind: "duckdb", id: "analytics" }),
  ],
  layer: LendingLayer
});
```

Validation occurs in CI and via Operator admission webhooks before CRD application.

## 6.4 Vertical & Horizontal Registration Pattern

```typescript
export const LendingLayer = Layer.effect(ClawQLApi, (api) =>
  Effect.gen(function* () {
    yield* api.registerPlugin({
      id: "lending",
      version: "1.0.0",
      onRegister: (api) => Effect.gen(function* () {
        yield* api.registerTools(lendingTools);
        yield* api.registerSpecs(requiredSpecs);
      }),
      requiredSpecs: lendingSpecs,
      onIngestHook: redactionAndMerkleHook,
    });
  })
);
```

## 6.5 Zero Runtime Footprint for Disabled Packages

- Helm CRD toggles control inclusion
- Effect lazy loading + tree-shaking removes disabled code at build time
- No unused Docker layers or CRDs
- A minimal Tier 1 deployment (core + memory + documents) has dramatically lower resource usage than a full regulated deployment — on the exact same codebase

## 6.6 In-Memory Test Layers

```typescript
const TestLayer = Layer.mergeAll(
  ValkeyTestLayer,
  PostgresTestLayer,
  DuckDBInMemoryLayer,
  LendingTestLayer
);

it("creates deal room", () =>
  Effect.gen(function* () {
    const result = yield* createDealRoom(input);
    expect(result).toBeDefined();
  }).pipe(Effect.provide(TestLayer))
);
```

No external services required for most integration tests.

## 6.7 Effect Pipelines in `clawql-api`

Every `execute()` call flows through a typed, observable pipeline:

```typescript
const execute = (action, input) => Effect.gen(function* () {
  const session = yield* validateATR(input.atr);
  yield* Panguard.enforce(session, action);
  const redacted = yield* Presidio.redact(input);
  const route = yield* router.select(action, redacted);
  const result = yield* route.provider.execute(redacted);
  yield* updateMerkle(result);
  return result;
}).pipe(Effect.provide(SecurityLayer));
```

All steps are instrumented with OpenTelemetry traces.

## 6.8 Natural Language Dashboard as Effect Triggers

Dashboard and agent commands are translated into the same Effect pipelines. This guarantees perfect consistency between human operators and autonomous agents.

---

# 7. Data & Infrastructure Stack

ClawQL uses a tiered, open-source, commercially bundle-friendly infrastructure stack. All components register as `ProviderSpec` objects into `clawql-api` via Effect-TS Layers.

## 7.1 Tiered Storage Architecture

```
Hot / In-Memory     → Valkey
Transactional       → Postgres + TimescaleDB + pgvector
Analytical          → DuckDB + SeaweedFS (S3-compatible)
Knowledge           → Onyx (semantic) + clawql-memory (hierarchical graph + PageIndex)
```

Every boundary applies Presidio redaction (where applicable) and Merkle auditing for full provenance.

## 7.2 Component Details

### Hot / In-Memory — Valkey
- Redis-protocol compatible, BSD 3-clause licensed
- Caching, rate limiting, session management, feature stores, vector similarity search
- Primary hot path for ATR claims and transient operation state

### Embedded / Local — SQLite
- Zero-config local memory and per-agent state
- Default for Tier 1 developer deployments and edge scenarios

### Transactional / OLTP — Postgres
- Core operational data, users, sessions, graph store for Memory 2.0
- TimescaleDB extension for temporal queries
- pgvector for hybrid relational + vector search

### Analytical / Lakehouse
- **DuckDB (MIT):** Embedded columnar analytics, zero-ETL Parquet/S3/Iceberg queries, ML features
- **SeaweedFS (Apache 2.0):** S3-compatible object storage for raw files, documents, and generated binaries
- **Iceberg tables** for schema evolution and transactional lakehouse semantics

### Streaming & Real-Time
- **NATS JetStream (Apache 2.0):** Durable messaging, event backbone, and workflow triggers
- **Apache Flink (Apache 2.0):** Real-time ETL, document pipeline materialisation, and sync to DuckDB/Onyx

### Knowledge & Documents
- **Onyx:** Enterprise semantic search with real-time Flink synchronisation (optional)
- **`clawql-documents` pipeline:** Tika → Gotenberg → Stirling-PDF → Presidio → Paperless NGX with hierarchy extraction for PageIndex

## 7.3 Optional Specialised Layers

- **CouchDB (Apache 2.0):** Hyperledger Fabric state DB or edge sync
- **ClickHouse:** High-concurrency analytics or advanced vector workloads

Both are fully optional via `ClawQLInstance` CRD toggles.

## 7.4 Observability & Telemetry

- SigNoz (self-hosted, OpenTelemetry-native, ClickHouse backend)
- Automatic Effect-TS instrumentation for all major operations
- Per-vertical, per-provider, and per-workflow visibility
- Privacy-first with zero-egress enforcement by default

## 7.5 Unified Provider Registration

```typescript
const infrastructureLayer = Layer.mergeAll(
  ValkeyLayer.live({ url: config.valkeyUrl }),
  PostgresLayer.live({ secretRef: "postgres-uri" }),
  DuckDBLayer.live({ s3: seaweedfsSpec }),
  NATSJetStreamLayer.live({ servers: [...] }),
  // vertical and provider layers added dynamically
);
```

---

# 8. Intelligent MCP Gateway (`clawql-api`)

`clawql-api` is the single surface that all agents, humans, and systems interact with. It is the heart of ClawQL.

## 8.1 Unified Surface

```typescript
// Natural language discovery across all registered tools and verticals
const results = await clawql.search("latest lending deals for client ABC123");

// Execution with full security, routing, and auditing
const outcome = await clawql.execute("lending.createDealRoom", input, {
  atr: sessionToken,
  projection: `dealRoom { id title amount status counterparty { name } }`
});
```

## 8.2 Protocol-Aware Routing & GraphQL Projection

- **GraphQL supergraph** for discovery (`search()`) and query-style operations
- **Protocol-native handlers** for stateful/imperative protocols (Postgres, Redis, NATS, Fabric)
- **Automatic GraphQL field projection** for token optimisation and precise data shaping

Projection drastically reduces token usage and prevents over-fetching of sensitive fields.

## 8.3 Pipeline Inside Every `execute()` Call

1. ATR claim validation and enrichment
2. Panguard MCP proxy enforcement (real-time capability scoping)
3. Presidio redaction (vertical-aware policies)
4. Intelligent provider selection based on capabilities and health
5. Execution through the chosen protocol adapter
6. Merkle root generation and audit logging
7. Post-execution hooks (including Ouroboros feedback)

All steps are typed Effect pipelines with full OpenTelemetry tracing.

## 8.4 Dynamic MCP Registration & Circuit Breakers

- Printing Press-generated tools and external MCP servers register dynamically
- Incremental supergraph updates (no full rebuild on registration)
- Every external tool is wrapped in a circuit breaker (5 failures → open for 30 seconds)
- Health-check gating: tools must pass `/healthz` before registration
- Conflict resolution and quarantine for `operationId` collisions

## 8.5 Security Hooks at Every Step

| Phase | Controls |
|---|---|
| `beforeExecute` | ATR + Panguard + Presidio redaction |
| `duringExecution` | Real-time monitoring, resource limiting |
| `afterExecute` | Merkle update + WORM audit write |
| `onError` | Structured error with recovery options |

Verticals may register additional domain-specific hooks.

## 8.6 MCP Tool Surface & Vertical Registration

Tools are dynamically registered using normalised operation IDs (`kind__provider__operation`). Verticals register via Effect Layers.

## 8.7 Failure Modes & Resilience

| Failure | Behaviour |
|---|---|
| `clawql-api` pod restart | Supergraph rebuilt from persisted specs |
| Protocol adapter failure | Degraded status in supergraph |
| Circuit breaker open | Tool temporarily unavailable with automatic recovery |
| Schema conflict on registration | Old tool preserved; conflict flagged in dashboard and audit log |

---

# 9. Horizontal Layers

Horizontal layers provide shared foundational capabilities used by all verticals. They sit below vertical packages and are composed via Effect-TS Layers.

## 9.1 Authentication & Authorization (`clawql-auth`) 🔨 In development

- **Multi-mode authentication:** `noAuth` (explicit flag only), `apiKey`, OIDC, SAML, OAuth2, LDAP
- **RBAC + ABAC** policy engine with natural language policy updates
- **ATR claim enrichment pipeline** (full schema in §11.2)
- **Vertical-specific Row-Level Security (RLS)** enforcement
- **Session management** with Vault dynamic secret injection and hardware token support (YubiKey)
- **Task-scoped token refresh** for long-running Goose workloads

`noAuth` mode is rejected by Operator admission webhooks in any multi-tenant deployment.

## 9.2 Document Intelligence Pipeline (`clawql-documents`) 🔨 In development

Full end-to-end pipeline with failure isolation:

1. **Apache Tika** — extraction for 1,000+ formats
2. **Gotenberg** — reliable PDF/HTML/Office conversion
3. **Stirling-PDF** — OCR, merge, split, visual redaction
4. **Presidio Analyzer** — PII, financial, medical, and privilege redaction (always runs before Merkle rooting)
5. **Paperless NGX** — long-term archive with auto-tagging and Onyx sync

**Key design decisions:**
- Hierarchy tree extraction feeds PageIndex
- Per-stage Merkle roots
- Failure isolation: partial results returned with `stageErrors` array
- Presidio failure policy: `block` — ingest never proceeds with unredacted content

## 9.3 Memory 2.0 (`clawql-memory`) 🔨 In development

Hybrid persistent memory combining multiple storage models:

| Layer | Backend | Purpose |
|---|---|---|
| Vault | Filesystem (Obsidian-style) | Raw document and note storage |
| Graph | Postgres / SQLite | Adjacency-list store with temporal edges |
| PageIndex | SQLite (default) | Vectorless hierarchical tree |
| Onyx | Optional, Flink-synced | Semantic search |

**Recall Modes:** `vault`, `graph`, `pageindex`, `hybrid` (default), `onyx`, `fabric`, `cross_vertical` (ATR-gated)

**Ingest Pipeline (9 steps):** LLM extraction → confidence thresholding (default 0.78) → Cuckoo deduplication → Presidio redaction → Merkle rooting → PageIndex insertion → Graph linking → Onyx sync → Ouroboros hooks

**Performance targets** (measured on Tier 2 hardware: 4-core, 8 GB RAM node; dataset: <250,000 nodes; network: LAN):

| Operation | Target |
|---|---|
| Single-hop recall (≤50 nodes) | < 50 ms p99 |
| Hybrid recall (≤250 nodes, 5 hops) | < 500 ms p99 |
| `cross_vertical` recall | < 1 second p99 |

These are design targets, not measured production results. Benchmarks on representative hardware will be published as the platform matures.

Pruning scheduler runs daily, enforcing `maxGraphNodes` (default 250,000).

## 9.4 PageIndex — Vectorless Hierarchical Indexing (`clawql-pageindex`) 🔨 In development

Standalone MIT package. Designed for structural navigation of documents (contracts, patient records, BOMs, syllabi).

**Capabilities:**
- Vectorless tree construction and weighted traversal (BFS/DFS)
- Token-budgeted content synthesis for LLM context windows
- Multiple storage adapters (SQLite default)
- Builder, traversal, and MCP hook interfaces

Fully functional without any other ClawQL dependency. Complements Onyx semantic search.

## 9.5 Remaining Horizontal Layers

| Package | Status | Summary |
|---|---|---|
| `clawql-data` | 📋 Planned | Unified provider lifecycle for Valkey, Postgres, DuckDB, SeaweedFS |
| `clawql-automation` | 📋 Planned | NATS JetStream scheduling, HITL gates, notifications, workflow blueprints |
| `clawql-telemetry` | 📋 Planned | OpenTelemetry + Prometheus + Grafana; injected as sidecar, never imported |
| `clawql-sandbox` | 📋 Planned | Kata/gVisor execution with persistent volumes and resource quotas |

---

# 10. Vertical Workflows

> **All verticals are planned and not yet shipped.** This section specifies the intended design for contributor planning, regulated customer evaluation, and integration design. Implementation is demand-driven with no fixed dates.

Vertical packages extend ClawQL with domain-specific logic while maintaining strict architectural isolation. They are implemented as opt-in Effect-TS plugins.

## 10.1 Vertical Plugin Philosophy

Verticals are first-class Effect Layers that:

- Implement the `Plugin` interface from `clawql-core`
- Register domain-specific MCP tools via `onRegister`
- Integrate with the shared `clawql-documents` pipeline and Memory 2.0
- Declare required providers and compliance matrices
- Are disabled by default with zero runtime footprint
- Never import other verticals — all cross-vertical communication routes exclusively through `clawql-api` or gated `cross_vertical` recall

## 10.2 `clawql-lending` 📋 Planned — Flagship Vertical

**Scope:** Mortgage, auto, BNPL, payday, and commercial lending workflows.

**Planned capabilities:**
- Deal room automation with document pipeline + Presidio redaction
- Credit analysis and risk scoring (DuckDB + Flink)
- Underwriting decision engine with DiGiFi plugins
- Tokenised asset (RWA) issuance on Hyperledger Fabric (optional)
- Investor reporting and compliance workflows

**Flagship use case:** SeeTheGreens LOS — full regulated lending platform with end-to-end provenance, ATR controls, and Merkle-rooted audit trails.

## 10.3 `clawql-legal` 📋 Planned

**Scope:** Contract intelligence and legal operations.

**Planned tools:** `clause_extract`, `risk_flag`, `precedent_search`, `redact_privilege`, `timeline_generate`, `brief_draft`, `motion_draft`, `filing_validate`, `ethical_wall_check`, `chain_of_custody_export`

**Special controls:** Privilege and ethical wall enforcement at graph traversal level; cold storage retention aligned with statute of limitations; strict cross-vertical restrictions with explicit purpose claims.

## 10.4 `clawql-healthcare` 📋 Planned

**Scope:** Clinical and administrative healthcare workflows.

**Planned tools:** `fhir_parse`, `hl7_extract`, `dicom_analyze`, `ehr_structure`, `deidentify_phi`, `medication_reconcile`, `phi_erasure_request`

**Compliance features:** HIPAA-sensitive Presidio models; patient-level partitioning in Memory 2.0; cryptographic erasure for GDPR/HIPAA right-to-be-forgotten.

## 10.5 `clawql-insurance` 📋 Planned

**Scope:** Policy and claims lifecycle.

**Planned tools:** `claim_extract`, `policy_analyze`, `loss_run_reconcile`, `fraud_flag`, `underwriting_score`, `reserve_calculate`

**Special policies:** Fraud pattern nodes retained indefinitely; NAIC model law compliance matrix.

## 10.6 `clawql-supplychain` 📋 Planned

**Scope:** Procurement-to-payment and trade compliance.

**Planned tools:** `bol_extract`, `customs_validate`, `invoice_match`, `tariff_check`, `supplier_onboard`, `esg_compliance_scan`

Integrates with ERP systems via OpenAPI/gRPC; OFAC/SDN screening at ingest.

## 10.7 `clawql-government` 📋 Planned

**Scope:** Federal, state, and local agency workflows.

**Planned tools:** `permit_classify`, `foia_route`, `tax_form_extract`, `procurement_validate`, `audit_generate`

Built with FedRAMP-ready defaults and classification level enforcement.

## 10.8 `clawql-manufacturing` 📋 Planned

**Scope:** Digital thread and traceability.

**Planned tools:** `work_order_extract`, `bom_validate`, `qc_report_analyze`; traceability query ("which finished goods contain lot 4821-B?")

Maintains full forward and backward traceability in Memory 2.0.

## 10.9 `clawql-education` 📋 Planned

**Scope:** Learning management and adaptive content.

**Planned tools:** `syllabus_generate`, `rubric_create`, `adaptive_path_recommend`; LMS connectors (Canvas, Moodle, Blackboard)

FERPA-compliant student record partitioning.

## 10.10 `clawql-engineering` 📋 Planned

**Scope:** MATLAB/Simulink integration for engineering teams.

**Planned tools:** `matlab_script_execute`, `simulink_simulate`, `controls_bode_plot`

Graceful degradation: falls back to Python (SciPy/Control) with equivalent code when MATLAB license is unavailable.

## 10.11 Community & Future Verticals

Any organisation can contribute new verticals using the standardised template and 12-step checklist (§18). New verticals are merged into the unified Helm chart with toggles.

## 10.12 Cross-Vertical Capabilities

All verticals automatically inherit:

- Presidio redaction profiles
- Merkle auditing and Cuckoo deduplication
- ATR + vertical RLS enforcement
- Compliance matrix registration

Cross-vertical recall requires explicit elevated ATR claims and stamps results with full data lineage for auditability.

---

# 11. Security: Defense-in-Depth

Security in ClawQL is a foundational, overlapping set of controls enforced at every layer. The platform assumes breach and follows one principle: **secure the capabilities, not just the language. Containment over prevention.**

## 11.1 Core Philosophy

- Treat every agent action as potentially malicious
- Enforce explicit, verified capabilities at runtime
- Multiple independent layers must fail simultaneously for a violation to occur
- Full auditability and recoverability are mandatory
- Presidio redaction always runs before Merkle rooting
- No component may bypass core security middleware in `clawql-api`

## 11.2 ATR Claims Schema

All requests carry enriched `ATRClaims` (Actor–Tenant–Role):

```typescript
interface ATRClaims {
  actorId: string;
  actorType: 'human' | 'agent' | 'service';
  sessionId: string;
  issuedAt: number;
  expiresAt: number;

  tenantId: string;
  tenantTier: 'local' | 'standard' | 'enterprise';

  roles: string[];
  scopes: string[];

  verticals: string[];
  crossVertical: boolean;
  crossVerticalPurpose?: string;

  memoryPrivileges: {
    read: boolean;
    write: boolean;
    crossVerticalRead: boolean;
    pruneAccess: boolean;
  };

  classificationLevel?: 'unclassified' | 'cui' | 'secret' | 'top_secret';
  minimumNecessary?: boolean;
  purpose?: string;

  requestId: string;
}
```

Claims are JWT-encoded, verified at every layer, and immutable once issued.

## 11.3 Supply Chain & Build Hardening

- Trivy + OSV-Scanner + Syft SBOM generation on every build
- Cosign keyless signing for all container images
- Kyverno image verification policies in the cluster
- Reproducible builds for Printing Press artefacts
- Gitleaks + TruffleHog in CI and pre-commit hooks

## 11.4 Immutability, Merkle Auditing & Cuckoo Filter

- Every write (document, memory node, Goose output, Printing Press binary) generates a SHA-256 Merkle root
- Cuckoo filter provides O(1) probabilistic deduplication at ingest
- Ring buffer (90 days default) + cold storage bridge for long-term roots
- WORM audit tables (Postgres rules + SQLite triggers) prevent tampering
- Legal hold mode locks roots from eviction

## 11.5 Zero-Trust Identity & Runtime Containment

- Short-lived ATR JWT tokens with dynamic Vault secrets
- Default runtime: Kata Containers (strong isolation) with gVisor fallback
- Default-deny NetworkPolicy + Istio mTLS
- Strict seccomp profiles and resource quotas in sandbox

## 11.6 Panguard MCP Proxy & Presidio Redaction

- **Panguard:** Real-time MCP proxy (<50ms target) enforcing ATR scoping and prompt/response scanning
- **Presidio:** Runs on every document and memory ingest path with vertical-specific models. Failure policy is `block` — unredacted content is never stored or processed

## 11.7 Effect Layer Security Hooks

| Phase | Controls |
|---|---|
| `beforeExecute` | ATR + Panguard + redaction |
| `duringExecution` | Real-time monitoring |
| `afterExecute` | Merkle update + WORM audit |
| Domain hooks | Vertical-specific rules |

## 11.8 GDPR Right-to-Erasure + WORM Compliance

Solved via cryptographic erasure:

1. Personal data encrypted at ingest with per-subject Vault keys
2. Presidio redaction before Merkle rooting
3. WORM tables store only metadata and roots
4. Erasure request destroys the subject's key → data becomes permanently undecipherable while audit records remain intact

## 11.9 Multi-Tenancy Isolation

Enforced at four layers:

| Layer | Mechanism |
|---|---|
| Network | Istio NetworkPolicies + dedicated namespaces |
| Data | `tenantId` filter in every graph traversal |
| Compute | Per-tenant sandbox pods |
| Encryption | Per-tenant keys at rest |

## 11.10 Observability, Incident Response & Recovery

- SigNoz with automatic Effect-TS spans
- Structured audit trails with Merkle roots
- Automated alerts on ATR violations, Presidio failures, or Cuckoo overfill
- Point-in-time recovery via snapshots
- Immutable logs for forensic reconstruction

## 11.11 Security Deliverables Matrix

| Control | clawql-api | Verticals | Sandbox | Documents | Memory |
|---|---|---|---|---|---|
| Kata/gVisor | ✅ | ✅ | ✅ | ✅ | — |
| Panguard Proxy | ✅ | ✅ | — | — | — |
| Presidio Redaction | ✅ | ✅ | — | ✅ | ✅ |
| Merkle Auditing | ✅ | ✅ | ✅ | ✅ | ✅ |
| ATR + RLS | ✅ | ✅ | ✅ | ✅ | ✅ |
| WORM Audit Tables | ✅ | ✅ | — | ✅ | ✅ |

## 11.12 Threat Model Coverage

| Threat | Primary Mitigation |
|---|---|
| Prompt injection / tool misuse | Blocked by Panguard + ATR |
| Supply-chain attack | SBOM + Cosign |
| Data exfiltration | Redaction + egress controls |
| Privilege escalation | RLS + immutable claims |
| Audit tampering | Merkle + WORM |
| Cross-tenant data leakage | Multi-tenancy isolation (§11.9) |

---

# 12. Kubernetes Operator & ClawQLInstance CRD

📋 **Planned — not yet shipped**

The ClawQL Kubernetes Operator is the autonomic control plane for the platform. Written in Go using `controller-runtime`, it continuously reconciles `ClawQLInstance` custom resources, provisions dependent services, composes Effect-TS Layers, and translates natural language commands into safe configuration changes.

## 12.1 Operator Responsibilities

- Full declarative reconciliation with exponential backoff and leader election
- Dynamic Effect-TS Layer composition at API startup
- Provisioning and scaling of document pipeline services
- Management of persistent volumes for Printing Press artefacts and Goose state
- Goose workload pool scaling (default 0 idle replicas)
- Secret rotation, cert-manager integration, and Istio mTLS sidecar injection
- RBAC RoleBindings and vertical RLS policy injection per enabled vertical
- Validation and mutation admission webhooks
- Natural language to CRD patch translation for Hermes/OpenClaw commands
- Merkle root consistency verification and Cuckoo filter warm-up jobs
- Status reporting with detailed `.status.conditions[]`

Reconciliation interval defaults to 15 seconds and is configurable.

## 12.2 Full `ClawQLInstance` CRD Specification

```yaml
apiVersion: clawql.io/v1alpha1
kind: ClawQLInstance
metadata:
  name: clawql-production
  namespace: clawql
spec:
  tier: enterprise                   # local | standard | enterprise

  api:
    enabled: true
    replicas: 3
    minReplicas: 2
    maxReplicas: 12
    expose:
      rest: true
      grpc: true
    mcp:
      stdio: true
      http: true
      grpc: true
    bundledProviders:
      - github
      - slack
      - paperless
      - tika
      - gotenberg
    circuitBreaker:
      failureThreshold: 5
      halfOpenProbeIntervalSeconds: 30

  auth:
    enabled: true
    mode: oidc                       # noAuth requires explicit flag + webhook check
    oidc:
      issuer: https://auth.example.com
      clientId: clawql
      clientSecretRef:
        name: clawql-oidc-secret
        key: clientSecret
    rbac: { enabled: true }
    abac: { enabled: true }
    verticalRLS: true
    multiTenantIsolation: true

  documents:
    enabled: true
    failureIsolation: true
    tika:
      enabled: true
      replicas: 3
    gotenberg:
      enabled: true
      replicas: 3
    stirling: { enabled: true }
    paperless:
      enabled: true
      secretRef: paperless-api-key
    presidio:
      enabled: true
      models: [pii, financial, medical, privilege]
      failurePolicy: block           # never skip redaction
      redactBeforeMerkle: true

  memory:
    hybrid: { enabled: true }
    storage:
      backend: postgres
      postgres:
        secretRef: memory-db
    layers:
      vault: true
      graph: true
      pageindex: true
      onyx: true
    ingest:
      confidenceThreshold: 0.78
      presidioEnabled: true
      failureIsolation: true
    recall:
      defaultMode: hybrid
      maxHops: 5
      maxNodes: 250
      tokenBudget: 32000
    pruning:
      enabled: true
      schedule: "0 4 * * *"
      maxGraphNodes: 250000

  sandbox:
    enabled: true
    runtimeClass: kata               # or gVisor
    persistentVolumes:
      - name: generated-tools
        mountPath: /opt/clawql/generated-tools
        storageClass: standard
        size: 100Gi
      - name: goose-state
        mountPath: /opt/clawql/goose
        storageClass: standard
        size: 50Gi

  goose:
    enabled: true
    replicas: 0                      # default: scale from 0
    maxReplicas: 50
    image: block/goose:v2026.05
    memoryIngest: true
    blueprintSupport: true
    checkpointOnOOM: true

  printingpress:
    enabled: true
    factoryBinaryPath: /usr/local/bin/pp
    outputDir: /opt/clawql/generated-tools
    autoRegisterMcp: true
    autoIngestMemory: true
    binarySigningEnabled: true

  automation:
    enabled: true
    nats: { enabled: true }
    hitl: { enabled: true }

  telemetry:
    enabled: true
    zeroEgress: true

  # Vertical toggles — all planned, none shipped
  lending: { enabled: false }
  blockchain: { enabled: false }
  legal: { enabled: false }
  healthcare: { enabled: false }
  # ... additional verticals follow the same pattern
```

## 12.3 Reconciliation, Admission Webhooks & Self-Healing

The Operator:

- Validates CRD changes against version compatibility and security policies
- Rejects unsafe configurations (e.g., `noAuth` in multi-tenant clusters)
- Performs rolling updates with readiness gates
- Automatically rolls back to the last known-good state on repeated reconciliation failures
- Supports natural language rollback commands ("roll back the last two changes")

## 12.4 Natural Language → CRD Translation

Hermes/OpenClaw commands such as:

- "scale goose replicas to 12 during business hours"
- "enable duckdb analytics on seaweedfs lake"
- "activate healthcare with presidio medical models"

…are parsed, validated, translated into atomic CRD patches, and applied safely through the Operator.

---

# 13. Natural Language Interface & Dashboard

📋 **Planned — not yet shipped**

Natural language is the primary interface for all human and agent interaction with ClawQL.

## 13.1 NL-to-Tool-Call Pipeline

```
User / Agent Input (natural language)
          │
          ▼
   Hermes Supervisor  (LLM with dynamic tool catalog)
          │
   clawql-api.search(query)  →  ranked tools + schemas
          │
   Intent classification + parameter extraction
          │
          ├── Valid     → clawql-api.execute(operationId, params)
          │
          └── Ambiguous → clarification request
          │
   Result formatting  (token-budgeted synthesis)
          │
   Audit log + Merkle entry
```

The Hermes system prompt is assembled at runtime from current ATR claims, the live tool catalog, relevant Memory 2.0 recall, and static behavioural instructions.

## 13.2 Hermes Supervisor & OpenClaw Messaging Gateway

- **Hermes:** Conversational supervisor responsible for intent parsing, tool selection, and multi-turn dialogue
- **OpenClaw:** Stateless messaging gateway handling WebSocket connections, queuing during reconnects, typing indicators, and streaming responses
- Session state lives entirely in `clawql-memory`
- Full gRPC streaming support for low-latency responses

Hallucinated `operationId`s are rejected by `clawql-api.execute()` with structured `TOOL_NOT_FOUND` errors and suggestions. Circular tool calls are automatically detected and halted.

## 13.3 Dashboard Pages & Capabilities

The ClawQL Dashboard uses only `clawql-api.search()` and `clawql-api.execute()` calls. All pages are fully agent-accessible.

| Page | Key capabilities |
|---|---|
| Memory Explorer | Vault browser, force-directed graph, PageIndex tree, hybrid recall tester, provenance chains, pruning editor |
| Documents Pipeline | Ingestion queue, drag-and-drop upload, per-stage Merkle logs, before/after redaction preview, quarantine management |
| Agents & Execution | Live Goose monitor, task queue, blueprint library, Printing Press tool catalog, sandbox job history, HITL approvals |
| Tools Registry | All MCP tools, operationId browser, schemas, usage examples, projected token costs, circuit breaker state |
| Configuration & Verticals | One-click toggles, spec registration wizard, visual CRD editor, Effect Layer composition preview |
| Users & Access | Role/permission manager, ATR claim inspector and simulator, session audit viewer, vertical RLS matrix |
| Observability | Prometheus metrics, OpenTelemetry trace explorer, recall latency heatmaps, Cuckoo filter health |
| Compliance Center | Unified compliance matrices, audit report generator, chain-of-custody exporter, GDPR erasure workflow, data lineage viewer |

## 13.4 Example Natural-Language Commands

**Configuration & Scaling:**
- "enable duckdb analytics on seaweedfs lake with Iceberg support"
- "scale goose replicas to 20 during business hours and 5 at night"
- "activate healthcare claims pipeline with presidio medical redaction"

**Workflow & Operations:**
- "process this W-2.pdf for underwriting — extract, redact, validate, sign, archive"
- "create a new lending deal room for client ABC123 and invite underwriters"
- "run cross_vertical recall between lending and legal for matter XYZ with elevated claims"

**Governance:**
- "generate compliance report for all active verticals with Merkle proofs"
- "roll back the last two configuration changes"
- "rotate all Presidio models to latest version and reprocess last 500 documents"

---

# 14. Agent Runtime, Tool Generation & Self-Improvement

📋 **Planned — not yet shipped**

ClawQL treats agent runtimes and tool generation as first-class, persistent platform citizens, not ephemeral scripts.

## 14.1 `clawql-goose` — Agent Runtime Abstraction

Manages Block's Goose instances as ephemeral or persistent workloads inside the secure sandbox.

**Planned features:**
- Default 0 idle replicas; scales to 1+ on demand and returns to 0 on completion
- Persistent volumes for Goose state that survive pod restarts
- Automatic output capture and ingestion into Memory 2.0
- Blueprint support and verification loops
- Checkpointing on OOM or failure for resumable tasks

**AgentRuntime abstraction** (defined in `clawql-core`):

```typescript
interface AgentRuntime {
  provision(config: AgentConfig): Promise<AgentHandle>;
  execute(handle: AgentHandle, task: Task): Promise<TaskResult>;
  getTools(handle: AgentHandle): Promise<MCPTool[]>;
  captureOutputs(handle: AgentHandle): AsyncIterable<Output>;
  teardown(handle: AgentHandle): Promise<void>;
}
```

This abstraction allows swapping Goose for Hermes, a custom agent, or any other MCP-compatible runtime without modifying core ClawQL packages.

## 14.2 `clawql-printingpress` — On-Demand Tool Generation

Enables agents to create new agent-native tools on demand.

**Planned capabilities:**
- Generates Go CLIs and full MCP servers from natural language descriptions or schemas
- Builds occur in isolated Kubernetes Jobs with network egress disabled
- Every binary is Cosign-signed before installation
- Automatic registration into `clawql-api` after health-check and circuit-breaker gating
- Version lifecycle management: old versions archived with `supersededBy` edges in Memory 2.0
- Pre-installed high-value CLIs (flight-goat, shopify-goat, etc.)

**Security controls:**
- Reproducible builds with pinned base images
- Signature verification before registration
- Persistent volume isolation per tenant/vertical

## 14.3 Ouroboros Evolutionary Loops (`clawql-ouroboros`) ✅ Shipped

Provides the self-improvement layer for extraction schemas, workflows, and tool quality.

**Core mechanism:**
- Seed-based evolutionary loops with clear goals, acceptance criteria, and brownfield context
- Automatic ingestion of HITL corrections, validation set performance, and agent feedback
- Postgres-backed event store for lineage and experiment tracking
- Integration hooks in document ingest and workflow completion paths

**Example seed (W-2 extraction evolution):**

```json
{
  "seedId": "w2-extraction-v3",
  "goal": "Improve LangExtract schema accuracy for W-2 forms",
  "acceptanceCriteria": ["F1 > 0.97 on validation set", "no regression on edge cases"],
  "maxGenerations": 8,
  "ontology": ["employer_name", "ein", "wages", "federal_tax_withheld"]
}
```

## 14.4 Sandbox Integration & Persistence

All Goose executions and Printing Press builds will run inside `clawql-sandbox` with:

- Kata Containers or gVisor isolation
- Resource quotas and default-deny network policy
- Bind-mounted persistent volumes for generated artefacts and Goose state
- Full Merkle auditing and Memory 2.0 ingestion of outputs

---

# 15. Testing, Observability & Operations

## 15.1 Testing Strategy

ClawQL employs a multi-layered testing approach enforced in CI.

**Unit tests** apply to `clawql-core`, `clawql-pageindex`, and internal utilities. Near-100% coverage required for pure functions (Merkle computation, Cuckoo operations, `normalizeOperationId`, ATR validation).

**Integration tests** run against live service containers via Docker Compose, using fixture documents (PDF, DOCX, contracts, W-2s, clinical notes). They verify the end-to-end document pipeline, Memory 2.0 ingest/recall, and Presidio redaction.

**Contract tests** use Pact-style consumer-driven contracts for `clawql-api.search()` and `clawql-api.execute()`. Any breaking change to these surfaces triggers a major version bump.

**End-to-end tests** spin up a minimal Tier 1 Docker Compose stack. Each vertical runs at least one complete workflow (ingest → redaction → recall → workflow execution).

**Chaos engineering** runs weekly on a staging Tier 2 cluster using Chaos Mesh:

- Kill Tika/Gotenberg mid-ingest
- Corrupt Merkle roots
- Fill Cuckoo filter to capacity
- Kill Vault or Presidio
- OOMKill Goose pods
- Exhaust NATS JetStream storage

All chaos scenarios must recover gracefully with proper alerts and partial result handling.

## 15.2 Observability Stack

**Primary tools:**
- **SigNoz** — Unified traces, logs, metrics, and exceptions (OpenTelemetry-native, ClickHouse backend)
- **Prometheus + Grafana** — Operational metrics and dashboards
- **Jaeger / Langfuse** — Distributed tracing (especially for complex workflows)

**Automatic instrumentation:** Every Effect-TS pipeline emits spans. Per-vertical, per-provider, and per-workflow metrics (latency, error rate, token usage, HITL rate, Ouroboros convergence).

**Key dashboards included in Helm chart:**
- IDP Pipeline Overview (documents processed, HITL rate, redaction coverage)
- Memory 2.0 Health (recall latency, node count, pruning status)
- Goose Execution (active tasks, checkpoint recovery rate)
- Security Posture (ATR violations, Presidio failures, circuit breaker trips)

Zero-egress enforcement is on by default.

## 15.3 Day-2 Operations & Natural Language Admin

Common operational commands:

- "scale goose replicas to 20 during business hours"
- "enable duckdb analytics on seaweedfs lake with Iceberg support"
- "rotate all Presidio models and reprocess last 500 documents"
- "generate compliance report for lending vertical with Merkle proofs"
- "roll back the last two configuration changes"

All changes are audited with Merkle roots and visible in the Compliance Center.

**Self-healing features:**
- Automatic pod restarts on Layer composition failure
- Cuckoo filter warm-up on pod restart
- Queue draining after service recovery
- Circuit breaker auto-recovery

---

# 16. Deployment Guides & Quick-Starts

## 16.1 Tier 1: Local Developer Quick-Start (Docker Compose)

```bash
# 1. Clone and bootstrap
git clone https://github.com/clawql/clawql.git
cd clawql/examples/clawql-local-docker-compose
./bootstrap.sh

# 2. Start the stack
docker compose up -d

# 3. Verify
clawql status
# Dashboard: http://localhost:8080
```

**Included:** `clawql-api`, `clawql-memory` (SQLite), Paperless-ngx, Tika, Gotenberg, basic auth (`noAuth`).

**Next step:** Upload a document or run `@hermes process this W-2.pdf` in the chat.

Full `docker-compose.yml` and `clawql.local.yaml` are in the examples directory.

## 16.2 Tier 2 / Tier 3: Helm Chart Deployment

```bash
# Add repository
helm repo add clawql https://charts.clawql.com
helm repo update

# Install with Tier 2 config
helm upgrade --install clawql clawql/clawql-full-stack \
  --namespace clawql --create-namespace \
  --values values-tier2.yaml
```

Full Helm chart templates (including KEDA ScaledObjects, ServiceMonitors, and Kyverno policies) are in the repository.

## 16.3 Vertical Starters

📋 Vertical starters will be published as verticals ship.

**Lending W-2 Pipeline (planned):**

1. Upload W-2 → Tika/Gotenberg → Presidio redaction
2. LangExtract structured output
3. HITL review in Label Studio (optional)
4. Merkle audit + Memory 2.0 ingest
5. Deal room creation via `lending.createDealRoom`

**Trigger via Dashboard/Slack:** `@openclaw process this W-2.pdf for underwriting`

## 16.4 Argo Workflows & LangGraph Integration

Example Argo Workflow templates and LangGraph node integrations are in the repository.

## 16.5 One-Command Starters

- **Tier 1 Full Stack:** `curl -fsSL https://get.clawql.com | sh`
- **Regulated Fork:** Clone regulated fork + enable Fabric toggle

All starters include observability, basic security policies, and natural language verification steps.

---

# 17. Regulatory & Compliance Readiness

ClawQL is engineered for production use in regulated environments. This section covers built-in compliance capabilities. For insurance coverage, see the community-maintained guidance in the repository.

## 17.1 Compliance Frameworks Supported

| Domain | Framework | Primary mechanism |
|---|---|---|
| Healthcare | HIPAA, HITECH | `clawql-healthcare` + Presidio + cryptographic erasure |
| Legal / Finance | ABA Model Rules, NAIC model laws | Privilege enforcement, ethical walls |
| Government | FedRAMP-ready | Classification level handling, `clawql-government` |
| Education | FERPA | FERPA-compliant partitioning, `clawql-education` |
| Manufacturing | ITAR/EAR, ISO 9001, C-TPAT | `clawql-manufacturing` |
| General | GDPR | Cryptographic erasure, SOC 2 Type II controls |
| AI Transparency | EU AI Act | Audit trails, lineage, decision provenance |

Note: Vertical-specific compliance features are gated on those verticals shipping. See §4.4 for current status.

## 17.2 Compliance Center Features

- Unified compliance matrix across enabled verticals
- Automated audit report generation with Merkle proofs
- Data lineage viewer for cross-vertical decisions
- GDPR erasure request workflow with Vault key destruction
- Every vertical registers its own compliance matrix entry, aggregated and queryable via natural language

## 17.3 Self-Hosted Operator Compliance Checklist

1. Configure Presidio, Merkle auditing, and WORM tables
2. Enable Kata/gVisor runtime class
3. Maintain SigNoz audit trails and export procedures
4. Document ATR and RLS controls for auditors
5. Obtain appropriate Tech E&O / Cyber Liability / AI liability coverage for your deployment
6. Review the community insurance guidance in the repository

ClawQL provides templates, evidence packs, and architecture decision records to accelerate regulatory audits and underwriter reviews.

---

# 18. Versioning, Contribution & Ecosystem

## 18.1 Versioning Policy

| Component | Scheme | Notes |
|---|---|---|
| `clawql-core` + `clawql-api` | Strict SemVer | Major bump for any breaking change to public APIs, Effect Layer contracts, or ATR schema |
| Horizontal packages | Independent SemVer | Within the same major as core |
| Vertical packages | Independent SemVer | Declare compatible core version ranges in `peerDependencies` |
| Printing Press artefacts | Own SemVer | Inside persistent volumes; metadata stored in Memory 2.0 |
| Operator & Helm Charts | Calendar versioning (e.g., 2026.5.0) | Aligned with major feature releases |

**Major version coordination:** Any breaking change in `clawql-core` triggers simultaneous major version increases across all dependent packages. A compatibility shim is provided during the transition period.

## 18.2 Dependency & License Policy

- All packages depend only on types and utilities from `clawql-core`
- No circular dependencies (enforced by TypeScript project references and Turborepo)
- Horizontal layers declare optional peer dependencies where appropriate
- Vertical packages never depend directly on other verticals
- External libraries must use permissive licenses (MIT, Apache 2.0, BSD)
- Effect-TS version is pinned across the monorepo
- Core platform: Apache 2.0; `clawql-pageindex`: MIT
- All dependencies scanned with Fossa on every PR; GPL-incompatible licenses are blocked

## 18.3 12-Step Vertical Contribution Checklist

1. Fork the official `clawql-vertical-template` from the monorepo
2. Implement the `Plugin` interface from `clawql-core`
3. Define `requiredSpecs` and `recommendedSpecs`
4. Register domain-specific tools using `normalizeOperationId`
5. Integrate with `clawql-documents` and Memory 2.0 ingest hooks
6. Declare compliance matrix entry
7. Write unit + integration tests (≥80% coverage)
8. Add end-to-end test in Tier 1 Docker Compose
9. Update Operator CRD fragment and Helm values
10. Provide documentation page and example natural-language commands
11. Submit PR with architecture diagram diff check passing
12. Community review → merged into unified Helm chart with toggle

Templates, CI validation scripts, and example PRs are in the repository.

## 18.4 Community & Ecosystem Growth

- Public GitHub repository with templates, examples, and contribution guidelines
- RFC process for major features and new verticals
- Discord and GitHub Discussions for community support
- Marketplace-ready structure for commercial vertical extensions

**Phased priorities (no fixed dates — demand-driven):**
- Core horizontal package stabilisation
- First vertical implementations (lending as flagship)
- Kubernetes Operator and natural language dashboard
- Additional verticals and provider adapters
- Multi-cluster federation
- Advanced governance and policy management

---

# 19. Appendices

## 19.1 Core Schemas

### ATRClaims

```typescript
interface ATRClaims {
  actorId: string;
  actorType: 'human' | 'agent' | 'service';
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
  tenantId: string;
  tenantTier: 'local' | 'standard' | 'enterprise';
  roles: string[];
  scopes: string[];
  verticals: string[];
  crossVertical: boolean;
  crossVerticalPurpose?: string;
  memoryPrivileges: {
    read: boolean;
    write: boolean;
    crossVerticalRead: boolean;
    pruneAccess: boolean;
  };
  classificationLevel?: 'unclassified' | 'cui' | 'secret' | 'top_secret';
  minimumNecessary?: boolean;
  purpose?: string;
  requestId: string;
}
```

### Plugin Interface

```typescript
export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly vertical?: string;
  onRegister(api: ClawQLApi): Effect.Effect<void, ClawQLError, ClawQLApi>;
  onIngestHook?(node: EntityNode, context: IngestContext): Effect.Effect<EntityNode, ClawQLError, ClawQLApi>;
  onRecallFilter?(claims: ATRClaims, options: RecallOptions): Effect.Effect<RecallOptions, ClawQLError, ClawQLApi>;
  onComplianceReport?(): Effect.Effect<ComplianceReport, ClawQLError, ClawQLApi>;
  requiredSpecs?: ProviderSpec[];
  recommendedSpecs?: ProviderSpec[];
  onTeardown?(api: ClawQLApi): Effect.Effect<void, ClawQLError, ClawQLApi>;
}
```

### ProviderSpec

```typescript
export interface ProviderSpec {
  kind: SpecKind;
  id: string;
  enabled: boolean;
  secretRef?: string;
  url?: string;
  capabilities?: string[];
  options?: Record<string, unknown>;
}
```

## 19.2 Operation ID Convention (`normalizeOperationId`)

**Format:** `kind__provider__operation` (double-underscore separator)
**Example:** `lending__underwriting__createDealRoom`

- Single underscores in original names are preserved
- Internal double-underscores are escaped as `__ESC__`
- Published for third-party MCP client compatibility

## 19.3 Cuckoo Filter & Merkle Design Details

**Cuckoo Filter:**
- Must declare capacity at creation (`capacity: 500_000` recommended)
- Default false-positive rate: 0.1%
- Warm-up from audit table on pod restart
- At 95% fill → warning; at 100% → fallback to audit table hash check

**Merkle Auditing:**
- Ring buffer: 90 days default
- Cold storage bridge for long-term retention and legal hold
- Roots generated after Presidio redaction

## 19.4 Comprehensive Failure Modes Catalog

| Failure | Behaviour |
|---|---|
| Presidio unavailable | Ingest blocked — never skipped |
| Tika/Gotenberg timeout | Partial results with `stageErrors` |
| Goose OOM | Checkpoint + resume |
| Circuit breaker open | Tool temporarily unavailable; auto-recovery |
| Cuckoo filter full | Fallback to audit table hash check |
| Vault unavailable | Cached secrets used; alert triggered |
| Supergraph build failure | Previous version remains active |

All failures are structured, observable, and auditable.

## 19.5 Glossary

| Term | Definition |
|---|---|
| **ATR** | Actor–Tenant–Role. The claims schema carried by every request to enforce identity, tenancy, and role-based access at all layers. |
| **Cuckoo filter** | A probabilistic data structure providing O(1) deduplication at ingest with configurable false-positive rates. Used to prevent duplicate nodes entering Memory 2.0. |
| **Effect-TS** | A TypeScript library providing typed effects, composable Layers, structured concurrency, and resource management. The foundational runtime for ClawQL. |
| **Goose** | Block's open-source agent runtime. ClawQL manages Goose instances via `clawql-goose` as ephemeral or persistent workloads. |
| **Hermes** | The conversational supervisor LLM responsible for intent parsing, tool selection, and multi-turn dialogue in the natural language interface. |
| **Kata Containers** | A container runtime using lightweight VMs for strong hardware-level isolation. The default sandbox runtime in Tier 2 and Tier 3. |
| **MCP** | Model Context Protocol. The standard protocol ClawQL uses for all agent-to-tool communication. |
| **Merkle tree** | A hash tree used by ClawQL to produce tamper-evident roots for all writes (documents, memory nodes, generated binaries). Stored in WORM audit tables. |
| **NATS JetStream** | A durable messaging layer (Apache 2.0) used for event streaming, workflow triggers, and HITL gate notifications. |
| **Onyx** | An open-source enterprise semantic search system. Used as the optional semantic recall layer in Memory 2.0. |
| **OpenClaw** | The stateless WebSocket messaging gateway that sits in front of Hermes and handles connection management, queuing, and streaming. |
| **Ouroboros** | ClawQL's evolutionary self-improvement loop system. Evolves extraction schemas, workflows, and tool quality using seed-based iteration and HITL feedback. |
| **PageIndex** | Vectorless hierarchical document indexing. A standalone MIT package that builds and traverses tree structures for structural document navigation without vector embeddings. |
| **Panguard** | ClawQL's real-time MCP proxy. Enforces ATR scoping, scans prompts and responses, and operates in-line with sub-50ms latency targets. |
| **Paperless NGX** | An open-source document management system used as the long-term archive in the `clawql-documents` pipeline. |
| **Presidio** | Microsoft's open-source data anonymisation and PII detection library. Runs at every data boundary in ClawQL; failure policy is always `block`. |
| **Printing Press** | ClawQL's on-demand tool generation system. Produces signed Go CLIs and MCP servers from natural language descriptions or schemas. |
| **RLS** | Row-Level Security. Postgres-level data filtering enforced per vertical and per tenant throughout the platform. |
| **SeaweedFS** | An Apache 2.0-licensed distributed object storage system providing S3-compatible APIs. Used as the analytical lakehouse storage layer. |
| **SeeTheGreens** | The regulated enterprise fork of ClawQL, featuring enhanced compliance controls and the flagship lending LOS. |
| **Stirling-PDF** | An open-source PDF processing tool used in the `clawql-documents` pipeline for OCR, merging, splitting, and visual redaction. |
| **Valkey** | A BSD 3-clause-licensed, Redis-protocol-compatible key-value store. The hot-tier cache and rate-limiting layer in ClawQL. |
| **WORM** | Write Once Read Many. Audit tables that use Postgres rules and SQLite triggers to prevent any modification or deletion of audit records. |

## 19.6 Key References

- Original April 2026 vision deck cross-mapped to this document (available in repository)
- All code examples are production-ready and located in the public repository
- Community RFC index: https://github.com/clawql/clawql/discussions

---

*ClawQL Master Enablement Document · May 2026 Edition · Apache 2.0 / MIT / CC-BY-SA 4.0*
*Single authoritative source of truth — implementation is phased; this document defines the intended design.*
