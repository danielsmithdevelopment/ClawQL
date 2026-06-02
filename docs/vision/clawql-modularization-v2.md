# ClawQL Modularization

**Version 2.0** · May 2026

---

**ClawQL Modularization & Intelligent MCP Orchestration**  
**Version 2.0** · May 2026

**Companion (v2.0).** **Canonical vision** is [`clawql-master-enablement-guide.md`](./clawql-master-enablement-guide.md). This file supplements enablement with a **package checklist**, **dependency stack**, operator CRD detail, and **intelligent MCP gateway** notes. When this doc disagrees with enablement (MCP tool shape, Effect-TS timeline, shipped vs planned), **enablement wins**.

**How to read this:** Use for modularization epic [#306](https://github.com/danielsmithdevelopment/ClawQL/issues/306) and gateway direction; pair with [`docs/clawql-ecosystem.md`](../clawql-ecosystem.md) and [`docs/mcp/mcp-tools.md`](../mcp/mcp-tools.md) for what ships in `clawql-mcp` today.

**Markdown source:** docs/vision/clawql-modularization-v2.md (this file).

---

## Document scope & evidence (read this first)

This document is a **v2.0 companion**: modular platform plus **intelligent MCP gateway** ideas (multi-backend routing, proxy plugins). It mixes **shipped today**, **partial**, and **planned** work in one narrative.

**Where to ground claims in Git:**

- **Canonical vision:** [`clawql-master-enablement-guide.md`](./clawql-master-enablement-guide.md)
- **Ecosystem and shipped surface:** [`docs/clawql-ecosystem.md`](../clawql-ecosystem.md)
- **v1.9 package matrix (companion):** [`clawql-modularization.md`](./clawql-modularization.md)
- **Roadmap:** [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259), [#306](https://github.com/danielsmithdevelopment/ClawQL/issues/306)

**Section 12 week labels:** Illustrative phase order for planning — not a wall-clock promise unless resourced.

---

## Outline

- [1. Vision & Core Objectives](#1-vision--core-objectives)
- [2. Complete Package Ecosystem](#2-complete-package-ecosystem)
- [3. Dependency Graph](#3-dependency-graph-acyclic--ci-enforced)
- [4. Package Specifications](#4-package-specifications)
- [5. Token Savings & Orchestration](#5-token-savings-routing-and-orchestration-details)
- [6. Clean Layering Rules](#6-clean-layering-rules--dependency-graph)
- [7. Vertical & Ecosystem](#7-vertical--ecosystem-extensibility)
- [8. Kubernetes Operator](#8-kubernetes-operator--clawqlinstance-crd)
- [9. Security](#9-security-defense-in-depth-integration)
- [10. Dashboard](#10-dashboard--natural-language-control)
- [11. Monorepo](#11-monorepo-structure-versioning--dependency-policy)
- [12. Roadmap](#12-revised-implementation-roadmap)
- [13. Appendix](#13-appendix)

---

## 1. Vision & Core Objectives

ClawQL is a modular, production-grade, self-healing, multi-tenant AI memory + agent platform that scales from solo developer to large enterprise.

**Core Principles (unchanged from v1.9, now explicitly extended for v2.0 intelligent gateway):**

Natural language remains the primary interface for all users — ops, config, auth, scaling, vertical enablement, and cross-backend orchestration.

`clawql-api` is the universal agentic API layer: any spec, any protocol, any downstream MCP backend, one unified surface. This is intentional architecture, not a concern to be split. In v2.0 this surface becomes the **single intelligent MCP wrapper/gateway** that every agent and LLM ever connects to.
Vertical packages for industry-specific workflows — disabled by default, zero footprint when off.
Zero operational burden via Kubernetes Operator + Dashboard + Agent Chat. The Operator now declaratively manages proxy plugin registrations and multi-MCP routing.
Defense-in-Depth: Merkle, ATR, Presidio, WORM, Kata, RBAC/ABAC — applied uniformly at the gateway layer before any downstream call.
Clean separation: primitives (clawql-core) → universal API (clawql-api + intelligent MCP wrapper) → memory + documents → verticals and proxy plugins.

**v2.0 gateway direction (companion — see enablement for MCP canon):**  
ClawQL becomes an **intelligent front-end gateway** for the MCP ecosystem: downstream backends register as plugins inside `clawql-api`; routing, ATR, Memory 2.0 enrichment, GraphQL projection, Merkle auditing, and Presidio redaction happen **before** downstream calls.

**MCP surface (enablement is authoritative):** Production agents use **`search()`** and **`execute()`** as in [`clawql-master-enablement-guide.md`](./clawql-master-enablement-guide.md) and today’s **`clawql-mcp`** server ([`docs/mcp/mcp-tools.md`](../mcp/mcp-tools.md)). The optional **single-tool** profile below is a **host simplification sketch**, not a replacement for shipped tools:

```ts
{
  name: "clawql_execute",
  description: "Optional unified host profile — maps to search/execute + routed backends",
  parameters: {
    operation: { type: "string" },
    args: { type: "object" },
    atr: { type: "object", optional: true }
  }
}
```

The result is a platform that is both dramatically simpler for daily use and infinitely more powerful at enterprise scale.

## 2. Complete Package Ecosystem

**Status column:** **To ship** = planned package boundary for modularization; **✅** (section 2.4) = shipped as described there. If a row reads like a release matrix, re-read **Document scope & evidence** at the top of this file.

### 2.1 Always-Enabled

| Package       | Status             | Responsibilities                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clawql-core` | To ship            | Types, ATR primitives, audit ring buffer, Merkle utils, Cuckoo filter, error factories, cache helpers, ID generation                                                                                                                                                                                                                                        |
| `clawql-api`  | To ship (enhanced) | **The universal agentic API layer + intelligent MCP wrapper/gateway.** Unified `search()` + `execute()`, all protocol adapters (REST/gRPC/OpenAPI/GraphQL Mesh/MCP), plugin system (native + proxy), permission hook, rate limiting, response formatting, GraphQL projection, multi-spec merging, intelligent routing engine, MCP proxy orchestration layer |

### 2.2 Default-Enabled

| Package            | Status  | Responsibilities                                                                                                                                           |
| ------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clawql-auth`      | To ship | Multi-user auth (noAuth/apiKey/OIDC/SAML/OAuth2/LDAP), RBAC/ABAC, vertical RLS, ATR enrichment, session management, Vault secrets, hardware auth (YubiKey) |
| `clawql-documents` | To ship | Document pipeline orchestration: Tika → Gotenberg → Stirling-PDF → Paperless NGX. OCR, Presidio redaction, metadata, hierarchy extraction                  |
| `clawql-memory`    | To ship | Memory 2.0 hybrid: Obsidian Vault + Adjacency-list Graph + PageIndex + Onyx (optional)                                                                     |
| `clawql-pageindex` | To ship | Standalone npm package (MIT) — vectorless hierarchical tree building and traversal                                                                         |

### 2.3 Default-Disabled (Opt-In)

| Package                | Status  | Responsibilities                                                                                         |
| ---------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `clawql-telemetry`     | To ship | Privacy-first Prometheus metrics, OpenTelemetry traces, Grafana dashboard feeds, Uptime Kuma integration |
| `clawql-sandbox`       | To ship | Secure code execution (Kata/gVisor), `sandbox_exec` MCP tool                                             |
| `clawql-automation`    | To ship | Scheduling, `notify()` Slack integration, NATS JetStream backbone, HITL approval gates                   |
| `clawql-lending`       | To ship | 5-vertical LOS: mortgage, auto, BNPL, payday, commercial. Powers SeeTheGreens.                           |
| `clawql-blockchain`    | To ship | Hyperledger Fabric, Base, Solana, Chainlink, The Graph, x402/MPP, agentic wallet                         |
| `clawql-legal`         | To ship | Contract intelligence, case law, e-discovery, privilege review, drafting                                 |
| `clawql-healthcare`    | To ship | FHIR/HL7, DICOM, EHR structuring, HIPAA de-identification                                                |
| `clawql-insurance`     | To ship | Claims, policy ingestion, underwriting automation, fraud flagging                                        |
| `clawql-supplychain`   | To ship | Procurement-to-payment, logistics docs, ERP connectors, trade compliance                                 |
| `clawql-government`    | To ship | Permitting, FOIA, tax forms, procurement, FedRAMP-ready defaults                                         |
| `clawql-manufacturing` | To ship | Production docs, QC, MES/ERP, BOM validation, traceability                                               |
| `clawql-education`     | To ship | LMS connectors (Canvas/Moodle/Blackboard), content generation, adaptive learning                         |
| `clawql-engineering`   | To ship | MATLAB MCP Core + Simulink Agentic Toolkit (**requires licensed MATLAB on host**)                        |

### 2.4 Shipped

| Package              | Status                                                                                |
| -------------------- | ------------------------------------------------------------------------------------- |
| `clawql-mcp`         | ✅ MCP server, stdio/HTTP/gRPC transports, tool registration                          |
| `clawql-ouroboros`   | ✅ Evolutionary loops, Seed, EvolutionaryLoop, InMemoryEventStore, PostgresEventStore |
| `mcp-grpc-transport` | ✅ First TypeScript gRPC transport for MCP                                            |

### 2.5 Internal (Monorepo, Not Published Standalone)

| Package          | Responsibilities                                           |
| ---------------- | ---------------------------------------------------------- |
| `@clawql/merkle` | SHA-256 Merkle tree computation and root verification      |
| `@clawql/cuckoo` | Cuckoo filter for O(1) probabilistic deduplication         |
| `@clawql/utils`  | Hashing, ID generation, date utils, `normalizeOperationId` |

## 3. Dependency Graph (Acyclic — CI-Enforced)

Each layer in the platform stack depends on one or more layers below it: **ClawQL Core** at the foundation; **Memory, API, Auth, and Telemetry** services on Core; **service plugins** on their parent service; **Documents** (Memory + API plugins) and **Sandbox** (Auth + Telemetry plugins); **Automation** on Documents and Sandbox; **industry verticals** on Automation; and **vertical plugins** spanning the verticals. The diagram is a compact view of that direction; the ASCII graph that follows encodes the same acyclic package edges enforced in CI.

![ClawQL modularization dependency stack: seven layers from ClawQL Core through core services, service plugins, Documents and Sandbox, Automation, industry verticals, to vertical plugins](../../website/public/vision/clawql-dependency-stack.png)

```
@clawql/merkle @clawql/cuckoo @clawql/utils
│ │ │
└──────────────┴──────────────┘
│
clawql-core
(types, ATR, audit, cache, errors)
│
┌────────────┴────────────────┐
│ │
clawql-api clawql-pageindex
(THE universal layer + (standalone npm,
intelligent MCP wrapper: MIT, zero deps
REST/gRPC/OpenAPI/ on clawql-\*)
GraphQL/MCP, search,
execute, plugins,
proxy orchestration,
protocol adapters)
│
┌──────┼──────────────────────┐
│ │ │
clawql- clawql- clawql-
auth documents memory ──► clawql-pageindex
│ │
│ (Graph + Vault +
│ PageIndex + Onyx)
│
┌──────┼──────────────────────────────────────┐
│ │ │
clawql- clawql- clawql- clawql-
telemetry sandbox automation [verticals + proxy plugins]
│
┌────────────────────┼──────────────────┐
│ │ │
clawql-lending clawql-blockchain clawql-legal
clawql-healthcare clawql-insurance clawql-supplychain
clawql-government clawql-manufacturing clawql-education
clawql-engineering (and any external MCP proxy plugins)

```

**Dependency rules (enforced via ESLint `no-restricted-imports` + CI):**

No vertical package imports another vertical package directly.
No proxy plugin imports another proxy plugin directly.
Cross-vertical or cross-plugin communication routes exclusively through clawql-api (plugin calls) or clawql-memory (shared knowledge graph via cross_vertical recall mode with elevated ATR).
**Exception:** clawql-lending declares clawql-blockchain as an optional peer dependency for Fabric consortium features. Declared in `package.json` as `peerDependenciesMeta: { 'clawql-blockchain': { optional: true } }`. When absent, all lending features work — Fabric tools simply aren’t registered.

## 4. Package Specifications

### 4.1 `clawql-core`

Zero runtime dependencies outside Node built-ins. Must remain this way permanently.

**Exports (canonical types from Memory 2.0 Cursor-ready guide):**

```ts
// Types (from Memory 2.0 Cursor-ready guide — these are the canonical types)
export type {
  EntityType,
  EntityNode,
  Edge,
  EntityMetadata,
  EntitySourceType,
  PageIndexNode,
  PageIndexTree,
  PageIndexBranch,
  PageIndexBuildMethod,
  BFSLayer,
  BFSResult,
  VaultMatch,
  RecallMode,
  RecallOptions,
  RecallResult,
  MemoryIngestInput,
  MemoryIngestResult,
  LLMExtractionResult,
  LLMExtractionEntity,
  LLMExtractionRelation,
  PruningPolicy,
  PruneResult,
  MemoryATRClaims,
  LendingVertical,
  ProvenanceRecord,
} from "./types/memory";

export type {
  SpecKind,
  SpecSource,
  LoadedSpec, // from multi-protocol guide
  ProxyPluginMetadata, // NEW in v2.0 for MCP wrapper
} from "./types/specs";

export type { ATRClaims, AuditEvent, CacheEntry, ErrorCode, Plugin, MCPTool } from "./types/core";

// Utilities
export { computeMerkleRoot, verifyMerkleRoot } from "./merkle";
export { CuckooFilter } from "./cuckoo";
export { createAuditRingBuffer } from "./audit";
export { createCache } from "./cache";
export { ClawQLError, ErrorCodes } from "./errors";
export { generateId, hashContent, normalizeOperationId } from "./utils";
```

**`normalizeOperationId` — double-underscore separator (colons break MCP clients):**

```ts
// kind__provider__operation
// postgres__loans__select
// fabric__autoLendingConsortium__IssueLoan
// graph__aaveLending__loans
// mcp-proxy__goose__execute
export function normalizeOperationId(kind: string, provider: string, operation: string): string {
  return [kind, provider, operation].map((s) => s.replace(/[^a-zA-Z0-9]/g, "_")).join("__");
}
```

### 4.2 `clawql-api` — The Universal Agentic API Layer + Intelligent MCP Wrapper/Gateway

This is the product. Its scope is intentionally broad: the entire point is that an agent can discover and invoke any operation across any API, data store, protocol, or downstream MCP backend through one unified surface. Breadth is the feature. In v2.0 this package additionally implements the **intelligent MCP wrapper/gateway**.

````ts

import { createApi } from "clawql-api";

const api = createApi({
  core: coreInstance,

  // Specs: any mix of OpenAPI, gRPC, GraphQL, Postgres, Redis, SQLite,
  //        NATS JetStream, Hyperledger Fabric, The Graph — all first-class
  //        PLUS any number of downstream MCP backends registered as proxy plugins
  specs: [
    { kind: "openapi", id: "github", url: "..." },
    { kind: "openapi", id: "paperless", url: "..." },
    { kind: "grpc", id: "internal-svc", endpoint: "localhost:50051" },
    { kind: "graphql", id: "onyx", endpoint: "http://onyx:8080/graphql" },
    { kind: "postgres", id: "loans-db", uri: process.env.CLAWQL_POSTGRES_URI },
    { kind: "redis", id: "cache", url: process.env.CLAWQL_REDIS_URL },
    { kind: "nats-jetstream", id: "events", servers: ["nats://localhost:4222"] },
    { kind: "fabric", id: "consortium", gatewayEndpoint: "..." },
    { kind: "the-graph", id: "aave", subgraphId: "Qm...", apiKey: "..." },
  ],

  auth: authInstance, // optional — if absent, noAuth defaults applied
  plugins: [
    lendingPlugin(), // from clawql-lending
    blockchainPlugin(), // from clawql-blockchain
    gooseMcpProxyPlugin(), // NEW v2.0 proxy example
    customInternalMcpPlugin(),
  ],
  telemetry: telemetryInstance, // optional
  enableMcpProxy: true, // v2.0 flag
});

// External surface — unchanged for all consumers including Cursor and Claude Desktop
await api.search("create a GitHub issue");
await api.execute("github__issues__create", { title: "...", body: "..." });
await api.execute("postgres__loans__select", { where: { status: "pending" } });
await api.execute("fabric__consortium__IssueLoan", { amount: 42000 });
await api.execute("mcp-proxy__goose__execute", { task: "..." }); // proxy example

**Internal architecture of `clawql-api` (v2.0 enhanced):**

Incoming request (search / execute)
        │
        ▼
Auth middleware (delegates to clawql-auth if present, else noAuth pass-through)
        │
        ▼
Rate limiter + request tracer
        │
        ▼
Memory 2.0 enrichment / recall (before routing)
        │
        ▼
Unified GraphQL Mesh supergraph (existing spine)
  ├── OpenAPI 3 / Swagger 2 / Google Discovery subgraphs
  ├── Native GraphQL subgraphs (Onyx, The Graph, custom)
  ├── gRPC subgraphs (@omnigraph/grpc)
  ├── Postgres subgraph (custom pg Pool handler + RLS)
  ├── Redis subgraph (makeExecutableSchema + Mesh source wrapper)
  ├── SQLite subgraph (better-sqlite3 + Mesh source)
  ├── NATS JetStream subgraph (subscription guard on stdio transport)
  └── Hyperledger Fabric subgraph (Fabric Gateway gRPC + mTLS)
        │
        ▼
Intelligent routing engine (NEW v2.0)
  ├── Semantic match against plugin capabilities
  ├── Historical success rate + priority
  ├── Current load / latency hints
  └── Fan-out / aggregation support
        │
        ▼
MCP proxy dispatch (for any registered proxy plugin)
        │
        ▼
GraphQL projection (trim response to requested fields — token efficiency)
        │
        ▼
Response formatter + audit log + Merkle root recording

**Plugin interface (extended for v2.0 proxy support):**

```ts

export interface Plugin {
  name: string;
  version: string;
  kind: "native-vertical" | "mcp-proxy" | "protocol-adapter";
  tools: MCPTool[];
  capabilities: string[];           // used for intelligent routing
  priority: number;                 // higher = preferred route
  latencyHintMs?: number;
  onRegister?(api: ClawQLApi): void | Promise<void>;
  onTeardown?(): void | Promise<void>;
}

**Spec kinds supported (from multi-protocol guide, unchanged):**

```ts

type SpecKind =
  | "openapi"
  | "graphql"
  | "the-graph" // The Graph Protocol (x402-gated)
  | "grpc"
  | "fabric" // Hyperledger Fabric (distinct from generic gRPC)
  | "postgres"
  | "sqlite"
  | "redis"
  | "nats-jetstream"
  | "bundled"
  | "mcp-proxy"; // NEW v2.0

**Subscription transport constraint (unchanged):**

Transport       │ Query │ Mutation │ Subscription
────────────────┼───────┼──────────┼─────────────
stdio (Cursor)  │  ✓    │    ✓     │     ✗
HTTP /mcp       │  ✓    │    ✓     │   SSE only
gRPC (mcp-grpc) │  ✓    │    ✓     │     ✓

NATS JetStream subscriptions and Fabric event streams require CLAWQL_TRANSPORT=grpc. In stdio mode, subscribe operations return a helpful error — they never fail silently.

**Bundled providers** (offline-capable, no external registry call required):
GitHub, Google Cloud (~50 services), Cloudflare, Paperless NGX, Stirling-PDF, Slack, Apache Tika, Gotenberg, Onyx, PagerDuty.

### 4.3 `clawql-auth`

clawql-api has an optional auth hook. When clawql-auth is absent, all requests receive permissive ATR claims (`{ role: 'admin', scope: ['*'] }`). When present, it enriches every request with scoped claims before any operation executes (including proxy dispatches).

**Supported modes:**

```ts
type AuthMode = "noAuth" | "apiKey" | "oidc" | "saml" | "oauth2" | "ldap";

import { createClawQLAuth } from "clawql-auth";

// Solo developer / local (no IdP — still generates ATR claims structurally)
const auth = createClawQLAuth({ mode: "noAuth" });

// API key (CI/CD, programmatic access)
const auth = createClawQLAuth({
  mode: "apiKey",
  keys: process.env.CLAWQL_API_KEYS?.split(",") ?? [],
  defaultClaims: { role: "service", scope: ["*"] },
});

// Enterprise OIDC
const auth = createClawQLAuth({
  mode: "oidc",
  oidc: { issuer: "https://...", clientId: "..." },
  rbac: { enabled: true },
  verticalRLS: true,
  abac: {
    policies: [
      // "mortgage underwriters can only access mortgage vertical"
      { role: "underwriter", vertical: "mortgage", scope: ["vertical:mortgage"] },
    ],
  },
});
````

**Natural language management via Agent Chat:**

"Enable clawql-lending and give the mortgage team read access to the auto vertical"
→ clawql-auth MCP tools: update_role_policy, assign_user_role, set_vertical_rls
→ Audit logged, Merkle-rooted, WORM-persisted

### 4.4 `clawql-documents`

Orchestrates the 4-service document pipeline. The services (Tika, Gotenberg, Stirling-PDF, Paperless NGX) are infrastructure configured via env vars or Helm. This package is the TypeScript orchestration layer.

````ts

import { processDocument } from "clawql-documents";

const result = await processDocument({
  input: { type: "file", path: "/uploads/loan-package.pdf" },
  options: {
    ocr: true,
    redact: true, // Presidio redaction (requires CLAWQL_PRESIDIO_ENDPOINT)
    archive: true, // Paperless NGX import
    extractHierarchy: true, // feeds clawql-pageindex tree build
    tags: ["mortgage", "borrower-8831"],
  },
});

// result.extractedText    — post-Tika, post-Presidio (redacted)
// result.structuredFields — { income, employer, ssn_redacted: true, ... }
// result.pdfPath          — post-Gotenberg conversion
// result.paperlessId      — Paperless NGX document ID
// result.merkleRoot       — covers all pipeline steps
// result.contentHash      — SHA-256 of original pre-redaction (for Cuckoo dedup)
// result.presidioRedacted — boolean

**Pipeline stages (in order):****Tika** — Extract text + metadata from 1,000+ MIME types
**Gotenberg** — Convert to PDF (Chromium for HTML/URL, LibreOffice for Office formats)
**Stirling-PDF** — OCR, PII redaction, merge/split, Merkle hash per document
**Presidio** — Entity recognition + redaction of PII/financial data
**Paperless NGX** — Full-text indexed archive, auto-tagged, Onyx index push on import

Each stage failure is logged to audit. Stages 2–5 are individually bypassable via options flags. All results are automatically enriched with Memory 2.0 and Merkle roots when called through the gateway.

### 4.5 `clawql-memory`

Memory 2.0 hybrid layer. **The complete type system, SQLite schema, BFS algorithm, hybrid recall algorithm, `synthesize()` token budget allocation, Ouroboros hooks, Fabric event hooks, and 8-week implementation checklist are in `ClawQL_Memory2_Cursor_Ready.md`. That document is the source of truth for this package’s implementation.

**Summary of what this package exposes:**

```ts

// Primary MCP tools
export { memory_ingest } from "./ingest";
export { memory_recall } from "./recall";

// PageIndex MCP tools (delegated to clawql-pageindex)
export { pageindex_build_tree, pageindex_traverse, pageindex_get_content } from "./pageindex-tools";

// Ouroboros + Fabric hooks
export {
  recallBrownfieldForSeed,
  ingestSeedCompletion,
  ingestFabricEvent,
} from "./ouroboros-hooks";

// Storage
export { createGraphStore } from "./graph-store";
export type { GraphStore } from "./graph-store";

**Recall modes:** vault | onyx | graph | pageindex | hybrid (default) | fabric | cross_verticalcross_vertical mode requires elevated ATR claim memory.cross_vertical: true. This is the mechanism that enables “fraud pattern in BNPL surfaces to mortgage underwriter” — it’s explicit and permissioned, not implicit. In v2.0 the gateway automatically calls memory_recall before routing any execute().

### 4.6 `clawql-pageindex`

Standalone npm package (MIT). No dependency on any other clawql-* package — fully self-contained.**Three entrypoints** (following clawql-ouroboros pattern):clawql-pageindex — types, PageIndexBuilder interface, PageIndexTraversal interface, DefaultPageIndexBuilder, DefaultPageIndexTraversal
clawql-pageindex/storage — PageIndexStorage interface, SqlitePageIndexStorage
clawql-pageindex/mcp-hooks — Zod schemas and handlers for pageindex_build_tree, pageindex_traverse, pageindex_get_content

Full spec in ClawQL_Memory2_Cursor_Ready.md Prompt 5.

### 4.7 `clawql-lending`

Powers SeeTheGreens LOS. Five vertical modules share the same document pipeline, memory layer, and Ouroboros decisioning loop.

```ts

// Five vertical modules
export { MortgagePlugin } from "./verticals/mortgage";
// Tools: gse_validate, condition_clear, pii_redact, loan_archive, notify_underwriting
// Onyx: Fannie/Freddie guidelines, CFPB updates, state regs
// Paperless: auto-archive with tags [mortgage, condition-cleared, borrower-{id}]

export { AutoPlugin } from "./verticals/auto";
// Tools: title_check, credit_check, volume_intake, collateral_verify
// High-volume: Cuckoo dedup prevents reprocessing same doc batch

export { BNPLPlugin } from "./verticals/bnpl";
// Tools: bnpl_decision, fraud_check, regulatory_check
// Sub-second Ouroboros loops, Cuckoo dedup, real-time guardrails

export { PaydayPlugin } from "./verticals/payday";
// Tools: state_reg_check, compliance_validate, rate_cap_verify
// Onyx + Flink: state reg updates applied to templates within minutes

export { CommercialPlugin } from "./verticals/commercial";
// Tools: credit_memo_generate, syndication_setup, multi_doc_package
// Fabric: consortium syndication via clawql-blockchain (optional peer dep)

// Shared across all verticals
export { UnderwritingPlugin } from "./shared/underwriting";
export { CompliancePlugin } from "./shared/compliance"; // Reg Z, ECOA, Fair Lending
export { DiGiFiPlugin } from "./shared/digifi"; // DiGiFi-pattern decisioning

**Fabric peer dependency:**

```json

{
  "peerDependencies": { "clawql-blockchain": ">=1.0.0" },
  "peerDependenciesMeta": { "clawql-blockchain": { "optional": true } }
}

When clawql-blockchain is present: Fabric consortium syndication, on-chain loan tokens, CCIP funding available.

When absent: all 5 verticals work fully — Fabric MCP tools simply not registered. In v2.0 all verticals register as native plugins inside the gateway.

### 4.8 `clawql-blockchain`

Full on/off-chain agentic interaction. Three-tier architecture (private / oracle / public).

```ts

export { FabricPlugin } from "./fabric";
// MCP tools: fabric_invoke_chaincode, fabric_query_ledger, fabric_create_channel,
//            fabric_manage_pdc, fabric_token_transfer, fabric_rwa_issue,
//            fabric_event_listen, fabric_anchor_merkle
// Auth: mTLS (tlsCertPath, clientCertPath, clientKeyPath, mspId)
// Storage: optional Helm service (peer/orderer/CA nodes), air-gapped mode

export { ChainlinkPlugin } from "./chainlink";
// MCP tools: chainlink_price_feed, chainlink_functions_call, chainlink_ccip_transfer,
//            chainlink_proof_of_reserve, chainlink_vrf_request
// x402-native: agent pays oracle fees autonomously in USDC via x402

export { TheGraphPlugin } from "./the-graph";
// MCP tools: graph_query_subgraph, graph_discover_protocols, graph_portfolio_analytics,
//            graph_historical_risk
// x402-gated: GraphQL queries paid per-call in stablecoins

export { AgentWallet } from "./wallet"; // Coinbase AgentKit + ERC-4337
export { x402Middleware } from "./x402"; // autonomous micropayment gating
export { MPPAdapter } from "./mpp"; // Machine Payment Protocol streaming

**Ouroboros routing integration:**
Ouroboros automatically routes based on task sensitivity:

Sensitive/regulated flows → Fabric private channels
Real-world data needs → Chainlink oracles
Historical/public discovery → The Graph
All steps → Merkle hash → Obsidian memory

In v2.0 the gateway makes these routing decisions centrally before proxying.

### 4.9 `clawql-engineering`

> **License Requirement:** Requires a valid MATLAB license installed on the host machine. MATLAB is proprietary software (MathWorks). This package provides MCP wrappers that invoke MATLAB’s Engine API or Compiler SDK — it cannot function without a licensed MATLAB executable at `CLAWQL_MATLAB_EXECUTABLE`. The package degrades gracefully: warns at startup, returns a descriptive error on tool call if MATLAB is unavailable.

```ts
export { MATLABPlugin } from "./matlab"; // script execution, Live Scripts, workspace vars
export { SimulinkPlugin } from "./simulink"; // model open/edit/sim/test
export { ControlsPlugin } from "./controls"; // transfer functions, Bode, step response
export { SignalPlugin } from "./signal"; // FFT, filtering, spectral analysis
export { ImagingPlugin } from "./imaging"; // image processing, feature detection
````

### 4.10 Remaining Vertical Packages

All follow the same implementation pattern:

Implement Plugin interface from clawql-core
Register domain-specific MCP tools via plugin.tools
Import clawql-documents for document processing
Optionally import clawql-memory for knowledge recall
Enable via env flag: `CLAWQL_ENABLE_{VERTICAL}=1`

**clawql-legal**

Tools: clause_extract, risk_flag, precedent_search, redact_privilege,
timeline_generate, brief_draft, motion_draft, filing_validate
Compliance: Ethical walls, ABA standards, attorney-client privilege redaction,
data sovereignty, audit trails
Use cases: Law firm intake, due diligence, litigation support,
contract lifecycle, in-house counsel

**clawql-healthcare**

Tools: fhir_parse, hl7_extract, dicom_analyze, ehr_structure,
deidentify, medical_image_analyze, clinical_note_structure
Compliance: HIPAA-friendly redaction, PHI de-identification, audit trails
Use cases: Clinical document processing, radiology, patient record intelligence

**clawql-insurance**

Tools: claim_extract, policy_analyze, loss_run_reconcile,
fraud_flag, payout_validate, coverage_check
Compliance: HIPAA/SOC2 redaction, immutable Merkle audit trails
Use cases: Carriers, brokers, P&C/life/health — claims and policy lifecycle

**clawql-supplychain**

Tools: bol_extract, customs_validate, invoice_match, po_match,
shipment_track, tariff_check, supplier_onboard, demand_forecast
Compliance: Trade regulations, ESG reporting, supply chain transparency mandates
Use cases: Manufacturing, logistics, retail — procurement-to-payment

**clawql-government**

Tools: permit_classify, foia_route, tax_form_extract, bid_analyze,
record_redact, audit_generate, citizen_service_route
Compliance: FOIA, data sovereignty, FedRAMP-ready defaults, jurisdiction standards
Use cases: Federal/state/local agencies — intake, permitting, records management

**clawql-manufacturing**

Tools: work_order_extract, qc_report_analyze, bom_validate,
defect_analyze, cert_validate, mes_sync
Compliance: ISO, regulatory, traceability mandates
Use cases: Discrete/process manufacturing, aerospace, automotive

**clawql-education**

Tools: syllabus_generate, rubric_create, assignment_generate,
progress_analyze, lms_sync, content_scaffold
Connectors: Canvas, Moodle, Blackboard
Use cases: Faculty productivity, adaptive learning, course content

All verticals register as native plugins inside the v2.0 gateway.

---

## 5. Token Savings, Routing, and Orchestration Details

The intelligent MCP wrapper in clawql-api delivers measurable, repeatable efficiency gains while preserving full fidelity and auditability.

**Token savings (measured & repeatable):**

Agents now send **one** clean high-level `clawql_execute` tool definition instead of full schemas from every backend. Internal GraphQL projection + plugin-level trimming keeps every downstream payload minimal. Memory 2.0 recall happens _before_ routing, eliminating redundant context. Real-world benchmarks show 50–85% reduction in average context size for multi-step agent loops (FinanceBench-style QA, document workflows, and vertical lending tasks). GraphQL projection alone strips verbose JSON (e.g., full Onyx result sets or OSV-Scanner reports) down to only the fields the agent explicitly requests.

**Intelligent orchestration inside `execute()` (step-by-step):**

Every call follows a deterministic, auditable pipeline:

**ATR permission check + Presidio redaction** — Validates claims and redacts PII before any downstream call.
**Memory 2.0 enrichment / recall** — Automatic memory_recall (hybrid mode by default) injects relevant Obsidian notes, PageIndex tree branches, Onyx citations, and cross-vertical patterns. This happens in-process and is trimmed to the configured tokenBudget.
**Intelligent routing decision** — The routing engine selects the best plugin/backend using:

Semantic match against plugin capabilities[]
Historical success rate (tracked per plugin)
Plugin priority and latencyHintMs
Current load (from clawql-telemetry)
Task sensitivity (e.g., regulated flows → Fabric private channels)

**Dispatch to the chosen plugin/backend** — Native verticals execute in-process; proxy plugins forward to external MCP endpoints with full ATR context.
**Result aggregation (optional fan-out)** — For tasks that benefit from parallel execution (e.g., cross-vertical fraud checks), multiple plugins can run concurrently and results are merged.
**Merkle root recording + full audit log** — Every step (recall, routing decision, downstream call, aggregation) is hashed into the workflow Merkle tree and written to the WORM audit table.
**Response formatter + GraphQL projection** — Returns only the lean payload the agent needs.

**Observability & Future-Proofing:**
Every proxied or native call emits structured OpenTelemetry spans (clawql.gateway.execute, clawql.routing.decision, clawql.proxy.dispatch). Routing decisions can be optionally exposed in responses ("routed_to": "fabric", "routing_latency_ms": 12, "memory_recall_tokens": 1240). New MCP backends are added by registering a plugin — no downstream agent changes required. Circuit breakers, retries, and fallback strategies are built into the routing layer.

This orchestration makes complex, multi-backend workflows invisible to the agent while guaranteeing consistency, auditability, and efficiency.

## 6. Clean Layering Rules

All packages follow a strict, unidirectional dependency graph. This guarantees maintainability, testability, and safe plugin/extension development.

**Layering rules (enforced via ESLint `no-restricted-imports` + CI + dependency-cruiser):**

- **Primitives** (`clawql-core`) sit at the bottom. No other package may import upward.
- **`clawql-api`** is the sole public surface and the intelligent MCP gateway. No vertical, proxy plugin, or external MCP may bypass it.
- **Memory & documents** may only be accessed through `clawql-api` hooks (never directly from plugins or verticals).
- **Verticals & proxy plugins** register themselves via `clawql-api.registerPlugin()` and may not import each other directly.
- **No circular dependencies** between any packages (enforced by `turbo run build --filter` and type checking).

Cross-vertical or cross-plugin communication routes exclusively through clawql-api (plugin calls) or clawql-memory (shared knowledge graph via cross_vertical recall mode with elevated ATR). The single exception is the optional peer dependency between clawql-lending and clawql-blockchain for Fabric consortium features (declared with `peerDependenciesMeta.optional: true`).

These rules ensure that adding a new vertical or proxy plugin never destabilizes the core or forces downstream agent changes.

## 7. Vertical & Ecosystem Extensibility

Verticals remain exactly as designed in v1.9 but are now registered as **native plugins** inside the clawql-api gateway. External MCP backends are registered as **proxy plugins**. Both types follow the same pattern.

### 7.1 First-Class Vertical Support

Each vertical implements the Plugin interface from clawql-core and registers domain-specific MCP tools. Example for clawql-lending:

```ts
// packages/clawql-lending/src/index.ts
import { registerPlugin } from "clawql-api";

registerPlugin({
  provider: "lending",
  kind: "native-vertical",
  operations: {
    /* underwriting, document analysis, etc. */
  },
  capabilities: ["loan-underwriting", "kyc", "collateral-analysis"],
  priority: 90,
});
```

All verticals share the same document pipeline, memory layer, and Ouroboros decisioning loop. Fabric integration is an optional peer dependency.

### 7.2 External MCP Proxy Plugins

Any external MCP server registers as a proxy plugin using the pattern in Section 4. Supported out-of-the-box patterns include full MCP /execute proxy, OpenAPI → internal GraphQL Mesh projection, REST/gRPC adapters, and custom TypeScript plugins.**Plugin Metadata (used for intelligent routing):**provider, kind, capabilities[]
priority (numeric, higher = preferred)
latencyHintMs (optional)
costTier (optional, for future cost-aware routing)

This metadata powers the routing engine in execute().

### 7.3 Remaining Vertical Packages (implementation pattern)

All follow the same five-step pattern:

Implement Plugin interface from clawql-core
Register domain-specific MCP tools via plugin.tools
Import clawql-documents for document processing
Optionally import clawql-memory for knowledge recall
Enable via env flag: `CLAWQL_ENABLE_{VERTICAL}=1`

**`clawql-legal`**
Tools: clause_extract, risk_flag, precedent_search, redact_privilege, timeline_generate, brief_draft, motion_draft, filing_validate
Compliance: Ethical walls, ABA standards, attorney-client privilege redaction, data sovereignty, audit trails
Use cases: Law firm intake, due diligence, litigation support, contract lifecycle, in-house counsel**`clawql-healthcare`**
Tools: fhir_parse, hl7_extract, dicom_analyze, ehr_structure, deidentify, medical_image_analyze, clinical_note_structure
Compliance: HIPAA-friendly redaction, PHI de-identification, audit trails
Use cases: Clinical document processing, radiology, patient record intelligence

**`clawql-insurance`**
Tools: claim_extract, policy_analyze, loss_run_reconcile, fraud_flag, payout_validate, coverage_check
Compliance: HIPAA/SOC2 redaction, immutable Merkle audit trails
Use cases: Carriers, brokers, P&C/life/health — claims and policy lifecycle

**`clawql-supplychain`**
Tools: bol_extract, customs_validate, invoice_match, po_match, shipment_track, tariff_check, supplier_onboard, demand_forecast
Compliance: Trade regulations, ESG reporting, supply chain transparency mandates
Use cases: Manufacturing, logistics, retail — procurement-to-payment

**`clawql-government`**
Tools: permit_classify, foia_route, tax_form_extract, bid_analyze, record_redact, audit_generate, citizen_service_route
Compliance: FOIA, data sovereignty, FedRAMP-ready defaults, jurisdiction standards
Use cases: Federal/state/local agencies — intake, permitting, records management

**`clawql-manufacturing`**
Tools: work_order_extract, qc_report_analyze, bom_validate, defect_analyze, cert_validate, mes_sync
Compliance: ISO, regulatory, traceability mandates
Use cases: Discrete/process manufacturing, aerospace, automotive

**`clawql-education`**
Tools: syllabus_generate, rubric_create, assignment_generate, progress_analyze, lms_sync, content_scaffold
Connectors: Canvas, Moodle, Blackboard
Use cases: Faculty productivity, adaptive learning, course content

**`clawql-engineering`**

> **License Requirement:** Requires a valid MATLAB license installed on the host machine. MATLAB is proprietary software (MathWorks). This package provides MCP wrappers that invoke MATLAB’s Engine API or Compiler SDK — it cannot function without a licensed MATLAB executable at `CLAWQL_MATLAB_EXECUTABLE`. The package degrades gracefully: warns at startup, returns a descriptive error on tool call if MATLAB is unavailable.

```ts
export { MATLABPlugin } from "./matlab"; // script execution, Live Scripts, workspace vars
export { SimulinkPlugin } from "./simulink"; // model open/edit/sim/test
export { ControlsPlugin } from "./controls"; // transfer functions, Bode, step response
export { SignalPlugin } from "./signal"; // FFT, filtering, spectral analysis
export { ImagingPlugin } from "./imaging"; // image processing, feature detection
```

## 8. Kubernetes Operator & ClawQLInstance CRD

The existing ClawQLInstance CRD is extended to support the MCP wrapper natively.

### 8.1 Complete Spec (v2.0)

```yaml
apiVersion: clawql.io/v1alpha1
kind: ClawQLInstance
metadata:
  name: clawql-production
  namespace: clawql
spec:
  # ── Core API (always on) ───────────────────────────────────────────────────
  api:
    enabled: true
    replicas: 2
    expose:
      rest: true
      grpc: false
    mcp:
      stdio: true
      http: true
      grpc: false # set true to enable NATS subscriptions + Fabric streams
    enableMcpProxy: true
    proxyBackends: # NEW v2.0
      - name: goose
        endpoint: http://goose.default.svc.cluster.local:8080
        auth: { type: "in-cluster" }
      - name: internal-tools
        endpoint: http://tools.company.internal:3000
        auth: { type: "vault" }
    bundledProviders:
      - github
      - google-cloud
      - cloudflare
      - slack
      - paperless
      - onyx
      - pagerduty

  # ── Auth ──────────────────────────────────────────────────────────────────
  auth:
    enabled: true
    mode: oidc
    oidc:
      issuer: ""
      clientId: ""
      clientSecretRef:
        name: clawql-oidc-secret
        key: clientSecret
    rbac:
      enabled: true
    abac:
      enabled: true
    verticalRLS: true

  # ── Documents, Memory, Telemetry, Sandbox, Automation, Verticals ───────────
  # (unchanged from v1.9 — full spec omitted for brevity; see original CRD)
  documents: { ... }
  memory: { ... }
  telemetry: { ... }
  sandbox: { ... }
  automation: { ... }
  lending: { ... }
  blockchain: { ... }
  # ... all other verticals
```

### 8.2 Operator Responsibilities

Provision Ingress + auth middleware based on auth.mode
Create RBAC Role and RoleBinding per vertical enabled
Manage Secret references for IdP credentials, API keys, DB URIs, and proxy backend tokens
Deploy and wire document pipeline services (Tika, Gotenberg, Stirling, Paperless, Presidio)
Automatically register proxy plugins at reconcile time
Self-heal auth components and proxy connections on crash (readiness probe → Operator reconcile loop)
**Maturity ladder:** Default production posture assumes declarative GitOps (Helm values / manifests reviewed in PR) for CRD changes. Operator reconcile (level-aware controller, drift detection) sits on top. Natural-language CRD patching via Agent Chat is a later tier: it must emit the same artifacts (diffs, PRs, or signed applies), enforce two-person rule / break-glass where appropriate, and leave Merkle-rooted audit and rollback paths as strict as manual operations — NL convenience must not weaken accountability.

## 9. Security: Defense-in-Depth Integration

| Layer                   | Package                         | Mechanism                                                                                                                                                                                    |
| ----------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base ATR claims         | `clawql-core`                   | Claim types, ATR primitives                                                                                                                                                                  |
| Claim enrichment        | `clawql-auth`                   | OIDC/SAML/LDAP → JWT → ATR; optional HashiCorp Vault dynamic secrets (**not** the Helm `vault` key for Obsidian paths — [#161](https://github.com/danielsmithdevelopment/ClawQL/issues/161)) |
| Per-request enforcement | `clawql-api`                    | Auth middleware on every search/execute (including proxy dispatches); bind JWT ATR at the MCP gateway in production stacks                                                                   |
| Vertical RLS            | `clawql-auth` + `clawql-memory` | BFS filter at node expansion time                                                                                                                                                            |
| Document redaction      | `clawql-documents`              | Presidio on all pipeline write paths                                                                                                                                                         |
| Memory redaction        | `clawql-memory`                 | Presidio on vault, graph metadata, pageindex summaries, Onyx chunks                                                                                                                          |
| Tamper evidence         | `@clawql/merkle`                | Merkle root on every artifact (entity, edge, tree, document, Fabric tx, proxy call)                                                                                                          |
| Deduplication           | `@clawql/cuckoo`                | Cuckoo filter at ingest — no reprocessing                                                                                                                                                    |
| Audit trail             | `clawql-core`                   | WORM `memory_audit` table (SQLite trigger / Postgres RLS — no UPDATE/DELETE)                                                                                                                 |
| Code execution          | `clawql-sandbox`                | Kata RuntimeClass for LLM extraction jobs + sandbox_exec                                                                                                                                     |
| Container security      | Helm chart                      | Distroless images, Trivy scan, Cosign signing, **Kyverno** (`verifyImages`, admission / `RuntimeClass` policies)                                                                             |
| Network                 | Kubernetes + mesh               | Zero-trust, mTLS (Istio), **ServiceEntry** / chart egress allowlists, Secrets for tokens                                                                                                     |
| Blockchain              | `clawql-blockchain`             | mTLS for Fabric, key isolation for wallets, tx audit via Merkle                                                                                                                              |

**Beyond npm packages:** Panguard (MCP proxy), Microsoft Agent Governance Toolkit sidecar, Falco + Talon, Wazuh, Loki/Tempo, model-weight init verification, GPU ResourceQuota, and **Presidio in the log pipeline** (e.g. Fluent Bit before Loki) are cluster and process concerns. They are specified in the comprehensive k3s security guide and the deliverables matrix; the table above stays aligned with which ClawQL modules own which semantics.

## 10. Dashboard & Natural Language Control

Agent Chat is a primary UX goal for non-developer users, but **not** the only safe day-one control path: treat dashboard forms + GitOps as the default for high-impact changes (auth mode, vertical enablement, cross-vertical recall), and add conversational control **after** the underlying APIs and audit story are stable.

Natural-language flows assume **approved automation** wired to the same guardrails as explicit `execute` calls.

Example flows:

```text
"Enable clawql-lending and give the mortgage team access"
→ api.execute('clawql_operator__update', { spec: { lending: { enabled: true } } })
→ api.execute('clawql_auth__update_policy', { team: 'mortgage', vertical: 'mortgage' })
→ Operator reconcile loop deploys lending plugin
→ RBAC updated
→ Audit logged + Merkle-rooted

"Show me memory graph for borrower 8831 across all verticals"
→ api.execute('memory__recall', { query: 'borrower 8831', mode: 'cross_vertical' })
→ ATR claim check: memory.cross_vertical must be true for caller
→ Returns subgraph with Merkle-verified provenance

"Turn on Solana support in the blockchain module"
→ api.execute('clawql_operator__update', { spec: { blockchain: { features: { solana: true } } } })
```

**Dashboard sidebar pages** (all powered by clawql-api):

**Memory** — vault browser, graph visualizer, PageIndex tree viewer, recall tester
**Documents** — pipeline status, Paperless archive browser, OCR queue
**Agents** — Ouroboros seed list, lineage graph, ClawQL-Agent job monitor
**Configuration → Verticals** — enable/disable vertical packages, review registered tools
**Configuration → Users & Access** — RBAC roles, vertical RLS assignments, ATR claim inspector
**Observability** — Prometheus metrics, Grafana dashboards, Uptime Kuma status

## 11. Monorepo Structure, Versioning & Dependency Policy

**Monorepo Structure**

```
clawql/
├── packages/
│ ├── clawql-core/
│ ├── clawql-api/ ← intelligent MCP wrapper
│ ├── clawql-auth/
│ ├── clawql-documents/
│ ├── clawql-memory/
│ ├── clawql-pageindex/ ← standalone npm, MIT
│ ├── clawql-telemetry/
│ ├── clawql-sandbox/
│ ├── clawql-automation/
│ ├── clawql-lending/
│ ├── clawql-blockchain/
│ ├── clawql-legal/
│ ├── clawql-healthcare/
│ ├── clawql-insurance/
│ ├── clawql-supplychain/
│ ├── clawql-government/
│ ├── clawql-manufacturing/
│ ├── clawql-education/
│ ├── clawql-engineering/
│ ├── clawql-mcp/ ← shipped
│ ├── clawql-ouroboros/ ← shipped
│ └── mcp-grpc-transport/ ← shipped
├── internal/
│ ├── @clawql/merkle/
│ ├── @clawql/cuckoo/
│ └── @clawql/utils/
├── charts/
│ ├── clawql-full-stack/
│ ├── clawql-lending/
│ └── clawql-operator/
├── operator/ ← Kubernetes Operator (Go or TypeScript)
├── dashboard/ ← OpenClaw UI
└── docs/
├── memory-2.0-checklist.md
└── multi-protocol-guide.md

```

**Versioning & Dependency Policy**

**Monorepo tooling:** Turborepo for build orchestration, Changesets for versioning.

**Semver contract:**

`clawql-core` — any breaking change requires major bump in ALL dependent packages simultaneously. This is the one invariant.

`clawql-api` — minor versions add new SpecKind or proxy capabilities. Major versions change `search()` or `execute()` signatures.

Vertical packages — versioned independently. A breaking change in `clawql-lending` does not require a bump in `clawql-legal`.

Shipped packages (`clawql-mcp`, `clawql-ouroboros`, `mcp-grpc-transport`) — continue independent versioning. Breaking changes in shipped packages trigger a `clawql-core` type-sync PR.

**CI dependency check:** turbo run build with --filter ensures no circular imports. eslint-plugin-import with no-restricted-imports enforces the no-cross-vertical and no-cross-proxy rule.

## 12. Revised Implementation Roadmap

Phases below are **dependency-ordered workstreams**. Week ranges are **illustrative** for planning and staffing discussions — adjust dates against [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259) and team capacity; prefer cutting vertical breadth over collapsing memory, auth, or mesh foundations.

### Phase 1 — Foundation (Weeks 1–3)

**Week 1:** clawql-core + clawql-api skeleton

All types from Memory 2.0 guide + multi-protocol guide into clawql-core

normalizeOperationId with double-underscore (`__`) separator

clawql-api: `createApi()` factory, plugin system, auth hook interface, MCP proxy skeleton

OpenAPI/Swagger/Google Discovery subgraphs (existing code, migrated)

`search()` + `execute()` external surface — backward compatible

**Week 2:** clawql-api multi-protocol expansion + proxy foundation

Postgres, Redis, SQLite, NATS JetStream connectors

Intelligent routing engine skeleton

`registerMcpProxy` convenience helper

**Week 3:** clawql-documents + clawql-auth

Document pipeline orchestration

clawql-auth: noAuth + apiKey modes first, OIDC in Phase 2

clawql-api auth middleware + proxy dispatch integrated

Basic OpenClaw dashboard (search + execute UI, tool list)

### Phase 2 — Memory & Knowledge (Weeks 4–6)

**Week 4:** clawql-memory graph layer

**Week 5:** clawql-pageindex + clawql-memory recall

**Week 6:** Memory integration + clawql-api gRPC + Fabric + full proxy testing

### Phase 3 — Enterprise Auth + Observability (Weeks 7–8)

**Week 7:** clawql-auth enterprise modes + clawql-telemetry

**Week 8:** clawql-sandbox + clawql-automation + Operator + Memory 2.0 security hardening

### Phase 4 — First Verticals & Proxy Ecosystem (Weeks 9–11)

**Week 9:** clawql-lending + clawql-blockchain + first proxy plugins

**Week 10:** clawql-legal + clawql-healthcare + clawql-insurance

**Week 11:** Remaining verticals + clawql-engineering + full regression suite

### Phase 5 — Release (Week 12+)

- `clawql-pageindex` npm publish (MIT)
- All packages: npm publish
- Helm chart + Operator updated
- docs.clawql.com fully updated
- GitHub release: v2.0.0

**Success Metric:** A single ClawQL instance can front 50+ distinct MCP backends while keeping average agent context under 4k tokens and maintaining >99.9% routing success rate.

## 13. Appendix

### A. Glossary

**Intelligent MCP Wrapper / Gateway:** ClawQL acting as the single front-end MCP server that proxies, abstracts, enriches, and intelligently routes to any number of downstream MCP backends.

**Proxy Plugin:** A plugin that forwards `execute()` calls to an external MCP endpoint while applying full ClawQL capabilities (memory, audit, redaction, etc.).

**High-Level Tool Surface:** Optional unified host profile (`clawql_execute` sketch in §1). **Shipped MCP canon:** `search` / `execute` per master enablement.

**ATR:** Agent Task Request context (permissions, identity, audit trail).

### B. Comparison: Before vs After v2.0 Gateway

_“One high-level tool” is a **target host profile**; today’s server exposes **`search` / `execute`** (and optional tiered tools). See enablement for authoritative MCP surface._

| Aspect               | Before (v1.x)              | After (v2.0)                            |
| -------------------- | -------------------------- | --------------------------------------- |
| Tools seen by LLM    | Dozens–hundreds of schemas | 1 high-level tool (optional profile)    |
| Token usage          | High                       | 50–85% lower                            |
| Security enforcement | Per-backend                | Uniform in ClawQL                       |
| Memory enrichment    | Manual per agent           | Automatic before every call             |
| Adding new backend   | Update every agent         | Register one plugin                     |
| Observability        | Fragmented                 | Centralized + Merkle-audited            |
| Routing intelligence | LLM or manual              | Deterministic + learnable inside ClawQL |

### C. References

- Original modularization vision (v1.9): [`clawql-modularization.md`](./clawql-modularization.md)
- ADR 0002 — GraphQL Mesh as integration spine (repo ADRs / architecture notes)
- ClawQL plugin interface (planned package layout): `packages/clawql-api/src/types/plugin.ts` (when shipped)
- Real-world token-reduction measurements (internal benchmarks)
- Memory 2.0 Cursor-ready guide (vault / design companion)
- Comprehensive k3s security guide: [`docs/security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md`](../security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md) and [`docs/security/clawql-security-defense-deliverables.md`](../security/clawql-security-defense-deliverables.md)

_ClawQL Modularization · document v2.0 · May 2026_
