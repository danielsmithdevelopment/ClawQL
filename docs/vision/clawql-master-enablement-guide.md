# ClawQL: The Agent-First Operating System

**Master Architecture & Enablement Guide**  
**Version 2.1 · June 2026**  
**Apache 2.0 / MIT** · [github.com/clawql/clawql](https://github.com/clawql/clawql)

> **Canonical vision.** This document is the unified index for the ClawQL platform. Detailed specifications live in the companion docs linked in [Documentation suite](#documentation-suite) below — when a companion disagrees on package boundaries or implementation contracts, the **Contributor Technical Specification** wins for code; this guide wins for platform intent and architecture.

## Executive Summary

ClawQL is not another agent framework. It is the **secure, persistent, observable, and verifiable operating system** for production-grade autonomous agents.

While the industry has spent the last 18 months building ever-more-elaborate prompt templates and decorator libraries, ClawQL has focused on the hard parts: long-term memory that survives restarts, immutable releases that cannot be silently altered, uniform defense-in-depth that applies even to external LLM calls, mathematical governance of multi-agent swarms, and token efficiency that makes high-volume agent workloads economically viable.

Everything flows through a single intelligent MCP gateway (`clawql-api`). Disabled components cost nothing. All artifacts are verifiable against Layer 0 immutable releases. Observability, security, and strategic coordination are first-class, not afterthoughts.

This document is the single source of truth. It unifies the Vision & Roadmap, Modularization specification, Contributor Technical Specification, Deployment Guide, security modules, observability stack, token-efficiency layers, immutable release system, and Ouroboros strategic coordination.

## I. The Architectural Deficit We Are Solving

Current agentic systems suffer from three fundamental gaps:

1. **Persistence Gap** — Agents are mostly stateless. Context windows are ephemeral. Failures erase progress. There is no institutional memory.
2. **Supply Chain Gap** — Code, tools, model weights, and dependencies lack verifiable provenance. Tags can move. Builds are not reproducible. Supply-chain attacks are trivial.
3. **Strategic Gap** — Scaling from 1 agent to N does not yield N× intelligence. It yields correlated hallucinations, convergence on shared errors, and exploding costs. There is no mechanism to measure or enforce cognitive diversity.

ClawQL closes all three gaps simultaneously through a layered, defense-in-depth architecture that treats agents as first-class, long-lived citizens in a production environment.

## II. The 6-Layer Architecture

| Layer | Name                               | Core Components                                                                                  | Responsibility                                                                |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **0** | Immutable Releases                 | `clawql-release`, Arweave, Rift, Radicle + GitHub mirror                                         | Permanent, verifiable, self-describing artifacts with machine-readable policy |
| **1** | Collaboration                      | Radicle (primary) + GitHub mirror                                                                | Human & agent development surface                                             |
| **2** | Execution & Intelligent Gateway    | `clawql-api`, `clawql-core`, `clawql-auth`                                                       | Single MCP surface, routing, enforcement, token optimization                  |
| **3** | Memory & Documents                 | `clawql-memory` (Vault + Graph + PageIndex), `clawql-documents`, `clawql-pageindex`              | Persistent hybrid knowledge with Merkle stamping                              |
| **4** | Strategic Coordination             | `clawql-ouroboros` evolutionary loop (shipped); DAOS swarm coordination — NSV + SGDOP (roadmap)  | Swarm diversity, reputation, recruitment, convergence control                 |
| **5** | Security & Compliance              | ATRClaims, Presidio, Merkle/WORM, Vault, external-provider policies                              | Uniform zero-trust controls across all boundaries                             |
| **6** | Observability & Runtime Protection | LGTMP (Alloy + Langfuse + Beyla + Faro + Loki/Tempo/Mimir/Pyroscope + Falco/Tetragon/Wazuh + k6) | Full visibility, AI tracing, runtime enforcement, anomaly detection           |

**Dependency Rule**: Strictly acyclic and enforced by CI. Verticals never import other verticals. Everything routes through the gateway.

## III. Layer 0: The Trust Anchor (Immutability)

Every official release is a permanent Arweave bundle containing source, images, SBOMs, signatures, attestations, and a **machine-readable manifest**.

- **Collaboration**: Radicle (p2p, cryptographic identities) with GitHub as read-only mirror.
- **Builds**: Rift (copy-on-write snapshots) or git-worktree fallback.
- **Manifest**: Contains Merkle root, artifact CIDs + hashes, build provenance, and a `policy` block (required signatures, canary percent, rollback rules, etc.).
- **Consumption**: Kubernetes admission controllers, `clawql-api`, and autonomous agents read the manifest directly. Unverified releases are rejected.

Releases are tamper-evident, AI-agent consumable, and support private/paid access via Lit Protocol + x402 micropayments.

_Full design: [Hybrid Decentralized GitHub Alternative](./clawql-hybrid-decentralized-github-alternative.md)._

## IV. Layer 2: The Intelligent Gateway (`clawql-api`)

The single surface for all interactions.

- Agents call `search()` and `execute()` only.
- **Code Mode** (default): Agents write code against generated SDKs instead of loading massive tool schemas → ~99.8% input token reduction.
- Uniform pipeline: ATRClaims validation → Presidio redaction → response projection (`minimumNecessary`) → Merkle audit → observability emission.
- Two-phase commit for high-impact actions.
- Proxy support for external MCP, OpenAPI, GraphQL.
- All operations respect classification levels and cross-vertical purpose requirements.

_Full design: [Modularization v2.1](./clawql-modularization-v2.md) · [Token efficiency (12 layers)](../architecture/clawql-token-efficiency.md)._

## V. Layer 3: Memory 2.0 (Persistence-First)

- **Documents**: Full pipeline with Presidio redaction before any persistence.
- **Storage**: Vault (files) + Graph + vectorless PageIndex (deterministic hierarchical recall) + optional semantic layer.
- Every node is Merkle-stamped. Recalls are filtered by ATRClaims.
- Supports semantic + structural caching and history distillation for long sessions.

## VI. Layer 4: Ouroboros (Strategic Coordination)

**Shipped today:** [`clawql-ouroboros`](../ouroboros/clawql-ouroboros.md) — specification-first seeds, evolutionary loop, ontology convergence gates, optional MCP tools when `CLAWQL_ENABLE_OUROBOROS=1`.

**Roadmap (DAOS coordination — not shipped yet):**

- **NSV (Normalized Semantic Variance)**: Cheap tripwire for cognitive convergence.
- **SGDOP (Semantic GDOP)**: Identifies the exact blind-spot direction in embedding space when convergence is detected, enabling precise recruitment.
- Reputation system, Diversity Dividends, model fingerprinting, and NATS JetStream Coordinator integration.

_Full target design (vision): [DAOS Unified Architecture v2.7](../ouroboros/daos-unified-architecture-specification-v2.7.md). Coordination deep dive: [Coordination layer spec](../ouroboros/daos-coordination-layer-specification.md)._

## VII. Token Efficiency (12 Compounding Layers)

**Tier 1 — Structural (1–4):** Code Mode (~99.8% input reduction) · Response trimming (~80% smaller outputs) · Terse output · Anthropic cache control (stable prefixes)

**Tier 2 — Smart inference (5–8):** Semantic cache · History distillation · Prompt dedupe/truncation · PAL adaptive routing (Frugal → Standard → Frontier)

**Tier 3 — Continuous (9–12):** Structured output hints · Token budget signaling · Assistant prefill · Fine-tuning flywheel (verdict-filtered export → PII scrub → domain adapter → custom Frugal tier)

Layers 1–4 (and gateway defaults for 9–10) deliver the majority of day-one savings; Layer 12 compounds over production traffic.

_Full design: [Token efficiency (12 layers)](../architecture/clawql-token-efficiency.md)._

## VIII. Security & Compliance (Defense-in-Depth)

- **ATRClaims**: Signed, immutable identity + classification + purpose.
- **Presidio**: Mandatory redaction before external calls (including LLMs) or persistence.
- **External Providers**: Per-provider ZDR/retention verification in `ProviderSpec`.
- **Model Weights**: Hash + HSM verification on every load.
- **Runtime**: Tetragon enforcement, Falco detection, Wazuh SIEM.
- **Audit**: Every operation is WORM/Merkle-stamped.
- **Nonce Store**: Fail-closed replay protection.
- **Egress**: Default-deny with explicit allowlist.

**Prioritized Rollout (First Five Controls)**: Digest pinning, ATR/Panguard, Presidio block, WORM audit, egress default-deny.

_Full design: [Defense-in-Depth Security Guide](../security/clawql-defense-in-depth-security-guide.md) · [Security curriculum (32 modules)](../security/security-best-practices-series/README.md)._

## IX. Observability (LGTMP Stack)

Full open-source, AI-native observability:

- **Faro** (frontend) + **Beyla** (zero-code eBPF backend)
- **Langfuse** (LLM chains, tool use, evals, anomaly detection)
- **Alloy** (unified pipeline)
- Loki/Tempo/Mimir/Pyroscope + Falco/Tetragon/Wazuh + k6 synthetics
- **Agent Trust Boundary**: "Client error with no server span", unexpected tool use, and Langfuse anomalies trigger critical alerts.

All observability data is treated as untrusted input — never executed without verification.

## X. Operator, Tiers & Modularity

The Kubernetes Operator manages `ClawQLInstance` CRD for tier, vertical enablement, providers, and feature toggles. Disabled verticals have zero runtime footprint.

**Tiers**:

- Tier 1: Docker Compose (available today for evaluation)
- Tier 2: Helm + Operator (team scale)
- Tier 3: Full enterprise (Kata/gVisor, Istio mTLS, dedicated pools)

_Full design: [Deployment & Operations Guide](../deployment/clawql-deployment-operations-guide.md) · [Operator target architecture (planned)](../design/operator-target-architecture.md) · [Modularization v2.1](./clawql-modularization-v2.md)._

## XI. How It All Works Together

1. Developer works on Radicle/GitHub → tags release.
2. `clawql-release publish` → Arweave bundle + manifest.
3. Operator/admission controller verifies manifest.
4. Agent calls `search()`/`execute()` on gateway.
5. Gateway enforces security → routes to Memory 2.0 or tools.
6. Operation is Merkle-stamped, observed in Langfuse + LGTMP; DAOS/Ouroboros swarm coordination applies when deployed (roadmap).
7. Everything remains auditable and reversible via manifest policy.

## XII. Current Status & Roadmap (July 2026)

**Shipped (Phase 1 complete — 7.0.0):** MCP transport (stdio/HTTP/gRPC), horizontal packages (`clawql-core`, `clawql-auth`, `clawql-pageindex`, `clawql-api`, `clawql-memory`, `clawql-documents`, `clawql-automation`, `clawql-sandbox`, `clawql-ouroboros`), **Plugin Phase 2** (`onRegister` + `composeHorizontalPluginLayers`), Presidio gateway hooks (opt-in), Tier 1 Docker Compose, release manifest MVP, operator scaffold, custom sources — **[Modularization implementation status](../design/modularization-implementation-status.md)** and **[Getting started](https://docs.clawql.com/getting-started)**.

**In progress (Phase 2):** Full Operator NL surface, third-party vertical plugin contract, transport-only `clawql-mcp` split.

**Effect-TS:** `search` / `execute` + `PluginRegistry` + Panguard proxy run on Effect; extracted domain packages remain mostly `async` at IO edges ([Effect plan](../design/effect-ts-modularization-rearchitecture-plan.md)).

**Tier 1:** `examples/clawql-local-docker-compose` — runnable today.

**Next:** Operator dynamic composition → community verticals → Layer 0 permanence (Arweave/Rift).

_Honest shipped vs planned table: [Vision & Roadmap](./clawql-vision-roadmap.md). Implementation ground truth: [Modularization implementation status](../design/modularization-implementation-status.md). Contracts: [Contributor Technical Specification](../contributing/clawql-contributor-technical-specification.md)._

## XIII. Why This Matters

The era of chaotic, ephemeral, experimental agents is ending. The era of the **Agent Operating System** has begun.

ClawQL gives you:

- **Auditable** actions in a WORM trail
- **Portable** logic across models and providers
- **Secure** zero-trust boundaries
- **Efficient** token usage
- **Strategic** swarm intelligence
- **Verifiable** releases that last decades

We are not selling hype. We are shipping infrastructure.

**Welcome to ClawQL.**

Read the full documentation suite, deploy the Tier 1 stack, and begin building production-grade agent systems that enterprises can actually trust.

**Build boldly.** The foundation is ready.

## Documentation suite

| Document                                                                                             | Role                                                                                         |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **[Modularization implementation status](../design/modularization-implementation-status.md)**        | **Ground truth** — monorepo layout, shims, phases, Effect/plugin status (June 2026)          |
| **[ClawQL plugin model](../design/clawql-plugin-model.md)**                                          | Horizontal plugins — MCP tool registration, lifecycle, third-party path                      |
| **[Plugin registry](../reference/clawql-plugin-registry.md)**                                        | Shipped vs planned plugins, MCP tools, enable flags                                          |
| [Vision & Roadmap](./clawql-vision-roadmap.md)                                                       | Public edition — honest shipped vs planned, phased delivery                                  |
| [Modularization v2.1](./clawql-modularization-v2.md)                                                 | Package boundaries, dependency graph, intelligent MCP gateway                                |
| **[IDP Platform (April 2026)](./clawql-idp-platform.md)**                                            | End-to-end IDP: self-hosted + hosted, archive layer, Coneshare VDR, Merkle audit             |
| [Immutable releases (Layer 0)](./clawql-hybrid-decentralized-github-alternative.md)                  | Arweave bundles, Radicle, Rift, `clawql-release`, manifest schema                            |
| [Contributor Technical Specification](../contributing/clawql-contributor-technical-specification.md) | Implementation contracts, Effect-TS patterns, CI rules                                       |
| [Deployment & Operations Guide](../deployment/clawql-deployment-operations-guide.md)                 | Shipped Helm ops — quick start, day-2, health                                                |
| [Operator scaffold (7.0)](../deployment/clawql-operator-helm.md)                                     | Shipped opt-in CRD + reconcile + tier presets                                                |
| [Operator target architecture](../design/operator-target-architecture.md)                            | Full operator roadmap — NL ops, verticals, auth (not shipped)                                |
| [Dashboard Agent Chat](../dashboard/agent-chat.md)                                                   | Browser UI, SSE, vault threads, IDP attachment JSON contract                                 |
| [Defense-in-Depth Security Guide](../security/clawql-defense-in-depth-security-guide.md)             | What to deploy — condensed operator reference                                                |
| [Security curriculum](../security/security-best-practices-series/README.md)                          | 32 modules — why and how to prove controls                                                   |
| [Token efficiency (12 layers)](../architecture/clawql-token-efficiency.md)                           | Code Mode through fine-tuning flywheel                                                       |
| [DAOS Unified Architecture v2.7](../ouroboros/daos-unified-architecture-specification-v2.7.md)       | **Vision / roadmap** — 7-layer platform, Manifest, PEP, Memory 2.0, Circuit Breaker          |
| [Coordination layer spec](../ouroboros/daos-coordination-layer-specification.md)                     | **Vision / roadmap** — transport + NSV/SGDOP, Diversity Dividends, Coordinator (not shipped) |
| [DAOS build plan v2.7.1](../ouroboros/daos-build-plan-v2.7.1.md)                                     | **Vision / roadmap** — P0–P3 engineering contract                                            |
