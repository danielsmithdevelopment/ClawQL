# ClawQL Modularization & Intelligent MCP Orchestration

**Version 2.2** · July 2026

This document defines package boundaries, the dependency graph, Operator behavior, and the design of the intelligent MCP gateway. It serves as the authoritative reference for contributors and maintainers.

For the full platform vision, see the [Master Enablement Guide](./clawql-master-enablement-guide.md).

**Implementation status (July 2026):** [Modularization implementation status](../design/modularization-implementation-status.md) — what is extracted to `packages/` today vs this document’s target boundaries.

## 1. Vision & Core Objectives

ClawQL is a modular, production-grade, self-healing, multi-tenant AI memory and agent platform.

**Core Principles**

- Natural language is the primary interface for both humans and agents.
- `clawql-api` is the single intelligent MCP gateway. All interactions use `search()` and `execute()`.
- Optional packages and verticals have zero runtime footprint when disabled.
- Defense-in-depth (ATR, Presidio, Merkle rooting, policy enforcement) is applied uniformly at the gateway.
- All consumable artifacts originate from or verify against immutable ClawQL releases (Layer 0).

---

## 2. Unified 6-Layer Architecture

| Layer | Name                               | Key Packages                                                     | Role                                                                          |
| ----- | ---------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 0     | Immutable Releases                 | clawql-release, Arweave bundles, Rift                            | Permanent, verifiable, self-describing artifacts with machine-readable policy |
| 1     | Collaboration                      | Radicle (primary) + GitHub mirror                                | Human and agent development surface                                           |
| 2     | Execution & Intelligent Gateway    | clawql-api, clawql-core, clawql-auth                             | Unified MCP surface, routing, and enforcement                                 |
| 3     | Memory & Documents                 | clawql-memory, clawql-documents, clawql-pageindex                | Persistent hybrid knowledge                                                   |
| 4     | Strategic Coordination             | clawql-ouroboros                                                 | Diversity measurement, reputation, and recruitment                            |
| 5     | Security & Compliance              | ATRClaims, WORM audit, Vault                                     | Uniform zero-trust and compliance controls                                    |
| 6     | Observability & Runtime Protection | LGTMP stack (Alloy, Langfuse, Beyla, Tetragon, Falco, Wazuh, k6) | Full visibility and enforcement                                               |

**Layer 0 today:** **`clawql-release` MVP** (manifest v0.1, Merkle root, SBOM/npm + GHCR digests, `clawql release *`, CI artifact) ships in **7.0.0**. Full permanence (Arweave, Rift, Radicle primary, Kyverno policy from manifest) remains roadmap — see [clawql-release MVP](../getting-started/clawql-release-mvp.md) and [Hybrid Decentralized GitHub Alternative](./clawql-hybrid-decentralized-github-alternative.md).

---

## 3. Package Ecosystem

### 3.1 Always-Enabled (Foundation)

| Package         | Responsibilities                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **clawql-core** | Shared types, ATRClaims, Merkle utilities, Cuckoo filter, Plugin interface, AgentRuntime, error factories                                                                                  |
| **clawql-api**  | The intelligent MCP gateway. Handles search/execute, plugin registration (native + proxy), routing, ATR/Panguard enforcement, Presidio hooks (roadmap), circuit breakers (roadmap), and observability emission |

### 3.2 Default-Enabled

| Package          | Responsibilities                                                                                              | Status today                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| clawql-auth      | Authentication modes, RBAC/ABAC, ATR enrichment                                                               | 📋 Planned package — auth headers + env JSON live in `clawql-api`            |
| clawql-documents | Document pipeline — 8 bundled IDP vendors + ingest + `DEFAULT_IDP_PIPELINE` + `run_idp_pipeline`              | ✅ Shipped — automated runner with retries/Merkle per hop still roadmap      |
| clawql-memory    | Memory 2.0 (Vault + Graph + PageIndex + optional Onyx)                                                        | ✅ Shipped — standalone `clawql-pageindex` not extracted yet                  |
| clawql-pageindex | Standalone MIT vectorless hierarchical indexing                                                               | 📋 Planned                                                                   |

### 3.3 Opt-In Horizontal & Platform

| Package            | Responsibilities                                              | Status today                                      |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------- |
| clawql-automation  | Schedule, notify, Argo workflow/argocd, NATS JetStream, HITL  | ✅ Shipped (workflow/argocd/NATS/HITL opt-in)     |
| clawql-sandbox     | Isolated code execution (`sandbox_exec`)                      | ✅ Shipped                                        |
| clawql-ouroboros   | Evolutionary schema/workflow loops                            | ✅ Shipped                                        |
| clawql-operator    | Kubernetes `ClawQLInstance` CRD, tier-spec, layer composition | 🚧 Scaffold shipped (7.0) — full operator roadmap |
| clawql-release     | Immutable release manifests (Layer 0)                         | 🚧 MVP shipped (7.0) — Arweave/Rift roadmap       |
| clawql-telemetry   | OTEL/Langfuse emission package (never imported by others)     | 📋 Planned — OTEL at MCP transport today          |
| clawql-data        | Structured data / DuckDB leg                                  | 📋 Planned                                        |
| clawql-printingpress | Document generation                                         | 📋 Planned                                        |
| clawql-goose       | Migrations                                                    | 📋 Planned                                        |

**Vertical packages** (`clawql-lending`, `clawql-legal`, …): 📋 Planned — none shipped.

### 3.4 Shipped (workspace packages)

| Package              | Status                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clawql-mcp`         | ✅ MCP transport (`src/`) — stdio/HTTP/gRPC; core tool registration not yet split to transport-only package                                               |
| `clawql-core`        | ✅ Audit, Merkle, Cuckoo, `Plugin` types, cache helpers                                                                                                   |
| `clawql-api`         | ✅ Spec load/search, REST/GraphQL/gRPC/MCP/CLI execute, `createClawQLApi`, Panguard proxy, custom URL sources (7.0)                                       |
| `clawql-memory`      | ✅ Vault + `memory.db` + ingest/recall + embeddings                                                                                                       |
| `clawql-documents`   | ✅ External ingest + **`DEFAULT_IDP_PIPELINE`** + **`run_idp_pipeline`**; 8 bundled IDP vendors via `clawql-api`                                        |
| `clawql-automation`  | ✅ Schedule, notify, **`workflow`**, **`argocd`**; NATS JetStream + HITL when enabled                                                                   |
| `clawql-sandbox`     | ✅ **`SandboxPlugin`**, Kata default in-cluster **`auto`**                                                                                               |
| `clawql-ouroboros`   | ✅ Evolutionary loop library + **`OuroborosPlugin`**                                                                                                      |
| `clawql-operator`    | 🚧 Opt-in scaffold — CRD, tier-spec ConfigMaps, `composeHorizontalPluginLayersFromTierSpec`, auth key reconciliation (7.0)                              |
| `clawql-release`     | 🚧 Layer 0 MVP — manifest collect/verify/publish, Merkle root, CI artifact (7.0)                                                                            |
| `mcp-grpc-transport` | ✅ gRPC MCP transport                                                                                                                                     |
| `panguard-mcp-bridge`| ✅ Enterprise MCP proxy bridge                                                                                                                            |

**Implementation detail:** [Modularization implementation status](../design/modularization-implementation-status.md).

**Still planned as standalone packages or full vision:** `clawql-auth`, `clawql-pageindex`, `clawql-telemetry`, Presidio gateway hooks, automatic release-manifest verification at gateway startup, transport-only `clawql-mcp` split, full Operator (NL dashboard, dynamic Deployments), all verticals.

---

## 4. Dependency Graph

```
internals (merkle, cuckoo, utils)
         ↓
     clawql-core
         ↓
   clawql-api + clawql-pageindex (planned)
         ↓
(auth, documents, memory)
         ↓
(telemetry, sandbox, automation, goose, printingpress, release, operator)
         ↓
     verticals
```

Strict acyclic graph, enforced by CI (ESLint + madge).

No vertical may import another vertical. Cross-vertical operations must route through `clawql-api.execute()`.

Layer 0 (`clawql-release`) depends only on core utilities and produces bundles consumed by all other layers via the gateway. For the full Layer 0 design (Radicle, Arweave, Rift, release manifest, adoption path), see [Hybrid Decentralized GitHub Alternative](./clawql-hybrid-decentralized-github-alternative.md).

---

## 5. Intelligent MCP Gateway (`clawql-api`)

`clawql-api` is the single surface for the entire platform.

**Shipped today**

- Native and proxy plugins (`Plugin.onRegister`, `beforeCallTool` for Panguard)
- OpenAPI, Discovery, GraphQL, gRPC, MCP, and CLI protocol execute paths
- Custom sources from URL (`~/.ClawQL/sources.json`, 7.0)
- `search()` / `execute()` via Effect `SearchService` / `ExecuteService`
- Provider registry, bundled specs, GraphQL field projection

**Roadmap (full gateway vision)**

- Native vertical plugins
- Automatic Memory 2.0 enrichment and **release manifest verification on startup**
- Uniform Presidio redaction on agent I/O
- Emission of Ouroboros position events on every `execute()`
- Circuit breakers on all downstream paths
- Full observability spans (OpenTelemetry + Langfuse package)

All downstream calls (native or proxied) are designed to pass through the same security and auditing pipeline.

**Horizontal plugins:** memory, documents, automation, sandbox, and ouroboros **register MCP tools via `Plugin.onRegister`** when composed — see [ClawQL plugin model](../design/clawql-plugin-model.md).

---

## 6. Operator & Configuration

The Kubernetes Operator manages a `ClawQLInstance` CRD that controls:

- Tier (local / standard / enterprise)
- Vertical enablement
- Provider specs (Postgres, DuckDB, Vault, etc.)
- Resource limits and scaling
- Feature toggles (sandbox, telemetry, documents, memory, …)

When a horizontal tier or vertical is disabled, its Effect Layer is not composed and contributes zero code or resources.

**Shipped in 7.0 (opt-in scaffold):** CRD validation, tier-spec ConfigMaps, continuous reconcile, `composeHorizontalPluginLayersFromTierSpec()`, `ProviderSecretsReady` / auth key expectations, optional MCP overlay. Does **not** yet include NL dashboard, dynamic Deployment management, or full auth reconciliation beyond vault key lists. Deploy: [clawql-operator-helm.md](../deployment/clawql-operator-helm.md).

---

## 7. Cross-Cutting Concerns

**Security**: Classification gating, external model routing, WORM Merkle audit, and runtime enforcement (Tetragon/Falco) are applied at the gateway. ATR/Panguard chokepoint and Vault-backed provider secrets ship in 7.0; Presidio and full WORM remain roadmap.

**Observability**: OTEL wraps MCP tool handlers today. Full LGTMP stack + `clawql-telemetry` package remain roadmap. Langfuse handles LLM/tool chains where configured.

**Releases**: Every artifact consumed by the platform should verify against a ClawQL release manifest containing Merkle root, policy, and build provenance. **`clawql release verify`** ships in 7.0; automatic verification at gateway install/startup is the recommended next 7.0 close-out (see implementation status §10).

---

This document is the authoritative reference for package organization and modular boundaries. It is intentionally focused and kept in sync with the master enablement guide.
