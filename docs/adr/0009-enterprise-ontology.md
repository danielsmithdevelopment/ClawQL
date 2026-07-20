# ADR 0009: Open, versioned, manifest-governed enterprise Ontology

- Status: **Accepted** (architecture decision — implementation phased)
- Date: 2026-07-20
- Related:
  - [ADR 0010](./0010-cq-file-extensions.md) (`.cqm` / `.cqe` / `.cqw` / `.cqk` — after OKF)
  - Architecture: [`docs/architecture/enterprise-ontology.md`](../architecture/enterprise-ontology.md)
  - Fabric: [`docs/architecture/zero-trust-agentic-fabric.md`](../architecture/zero-trust-agentic-fabric.md)
  - Memory vault: [`docs/memory/memory-obsidian.md`](../memory/memory-obsidian.md)
  - Team sync: [`docs/getting-started/getting-started-for-teams.md`](../getting-started/getting-started-for-teams.md)
  - [ADR 0004](./0004-argo-cd-workflows-clawql-pipelines.md) (Argo Workflows / CD)
  - [ADR 0007](./0007-pulumi-provisioning-managed-tiers.md) (Pulumi Automation API)
  - Ouroboros seed ontology: [ADR 0001](./0001-ouroboros-workflow-engine.md) (task-loop ontology — complementary, not this ADR)
- Supersedes: N/A (new surface; does not replace Ouroboros `ontology_schema` on Seeds)

## Context

Enterprises that deploy agentic systems need agents to operate on **typed enterprise entities** (`Contract`, `Patient`, `Invoice`) with known relationships, provenance, and permission boundaries — not raw JSON blobs. Palantir’s Ontology demonstrated that grounding agents in a typed digital twin is what makes production agents useful rather than hallucination-prone.

Palantir’s Ontology also has structural liabilities ClawQL must not inherit:

1. **Proprietary and non-portable** — leave Palantir, leave the Ontology.
2. **Services-heavy construction** — mid-market teams cannot self-serve.
3. **Outside the software delivery pipeline** — runtime console config, not a versioned Git artifact with release-manifest history.

Separately, ClawQL already has:

- Obsidian / Markdown vault memory (`memory_ingest` / `memory_recall`)
- Object-storage team sync (`clawql sync` → R2/S3/GCS)
- EnterpriseGovernance + kinetic guardrails on the fabric
- Pulumi (infra), Argo Workflows (DAGs), and Argo CD / Rollouts-adjacent GitOps paths

The question is how to formalize an **enterprise IDP Ontology** that closes the Palantir gap without lock-in, and how it relates to memory, sync, and kinetic execution.

## Decision

### 1) Formalize — but not like Palantir, and not all at once

ClawQL’s Ontology is an **open, versioned, manifest-governed schema** that travels with the software delivery pipeline.

| Dimension     | Palantir-style          | ClawQL decision                                                |
| ------------- | ----------------------- | -------------------------------------------------------------- |
| Format        | Proprietary             | Open YAML / OKF Markdown + JSON Schema; PR-reviewable          |
| Versioning    | Console / runtime       | Git + EnterpriseGovernance / release manifest version events   |
| Construction  | Professional services   | Derive from SQL / OpenAPI / documents; refine in UI or YAML    |
| Portability   | Vendor-bound            | `git clone` + export YAML/OKF bundle                           |
| Agent surface | Proprietary object APIs | Generated typed MCP tools (+ optional GraphQL with `@kinetic`) |

**Mental model:** OOP applied to the enterprise information space — typed objects, relationships, and methods — plus three enterprise-AI necessities: **provenance**, **permission-awareness** (ATRClaims), and **kinetic designation** (writes are structurally governed).

### 2) Three-layer Ontology architecture

1. **Entity schema** — typed objects, properties, PII fields, sources (SQL / OpenAPI / documents).
2. **Relationship graph** — traversable, permission-aware edges (Onyx + graph store later).
3. **Action schema** — generated MCP / GraphQL tools; writes marked `kinetic` with risk, blast radius, rollback, AP2 mandate binding.

### 3) Kinetic transport: GraphQL mutations + `@kinetic` (not mutations alone)

GraphQL’s query/mutation split is the right **transport** instinct (better than undifferentiated REST). It is **not** sufficient for enterprise kinetic safety: mutations are binary (side effect or not), lack graded risk, mandate binding, blast-radius caps, and rollback protocols.

**Decision:** use GraphQL mutations (and/or generated MCP write tools) as the call surface; encode graded governance with a `@kinetic` directive / schema fields (`riskLevel`, `requiresMandate`, `blastRadius`, `rollbackProtocol`, `executor`, optional canary). The PEP intercepts; the agent call site stays uniform.

### 4) Kinetic executors: Pulumi + Argo Workflows + Argo Rollouts + native

The Transaction Sandbox routes by `executor`:

| Executor       | Domain                         | Existing ADR / surface                         |
| -------------- | ------------------------------ | ---------------------------------------------- |
| Pulumi         | Stateful infrastructure        | ADR 0007 Automation API                        |
| Argo Workflows | Multi-step DAGs / IDP pipeline | ADR 0004 `workflow` tool                       |
| Argo Rollouts  | Progressive deployment         | Roadmap (bundles with Workflows/CD philosophy) |
| Native         | App writes (SAP, CRM, payment) | Effect-TS Transaction Sandbox (phased)         |

One governance layer (`@kinetic` + PEP + WORM); agents do not choose the executor.

### 5) Memory vault serialization: OKF-compatible on Obsidian

**Adopt Open Knowledge Format (OKF) as the serialization convention** for memory entries (YAML frontmatter + Markdown body). Keep Obsidian as the human-facing interface. Do **not** replace the vault with a proprietary store.

- Required OKF `type` plus ClawQL extensions (`correlation_id`, `worm_ref`, agent metadata).
- ClawQL defines its own `type` taxonomy until ecosystem taxonomy stabilizes (`decision`, `context`, `ontology_entity`, …).
- Ontology definitions may live as OKF docs with `type: ontology_entity` under the **schema** tree (Git); instances stay in object storage.

**Implementation status (July 2026):** `memory_ingest` writes OKF frontmatter; append upgrades legacy notes; `Memory/index.md` + `Memory/log.md` ship alongside `_INDEX_*`. See [`docs/memory/okf.md`](../memory/okf.md).

### 6) Storage split: schema in Git, instances in R2/S3

**Git holds definitions** (small, PR-reviewable): entity/relationship/action schemas, policy, static knowledge (runbooks, ADRs).

**Object storage (R2 default) holds instances** (unbounded): memory entries, populated entity instances, generated indexes, FTS/vector sidecars.

`clawql sync` remains the R2↔edge path. Hot/cold tiering (recent memory vs archive) is the scaling model — not “put the whole vault in GitHub.”

### 7) Ontology builder sequencing

| Phase     | Deliverable                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Now**   | YAML/OKF schema format + JSON Schema; `clawql ontology lint` / `generate` (read tools); derive from sources; manifest version events |
| **Later** | Relationship graph + permission-aware traversal                                                                                      |
| **Later** | Kinetic write tools + AP2 + Transaction Sandbox + canary                                                                             |
| **Later** | Command Deck visual builder (non-engineer authoring → Git PRs)                                                                       |
| **Later** | Vertical schema packs (Legal, Healthcare, Financial, Real Estate)                                                                    |

**Do not lock property types / relationship syntax as a public standard** until 3–5 design partners validate against real enterprise schemas.

### 8) Relationship to Ouroboros Seed `ontology_schema`

Ouroboros Seeds ([ADR 0001](./0001-ouroboros-workflow-engine.md)) carry a **task-loop** ontology for evolutionary convergence. This ADR’s **enterprise Ontology** is the org-wide typed entity layer for IDP agents. They may share concepts later; they are not the same artifact. Do not overload Seed ontology for enterprise digital-twin modeling.

## Consequences

### Positive

- Portable Ontology: YAML/OKF in Git; no vendor hostage scenario.
- Aligns with existing Pulumi / Argo / sync / WORM / EnterpriseGovernance investments.
- Mid-market path: derive + refine instead of multi-month services engagements.
- Clear Git vs R2 boundary prevents vault-in-GitHub scale failures.

### Negative / risks

- Early format lock-in if published as standard before design-partner validation — mitigate by marking schema **provisional** and evolving via ADR updates.
- Kinetic / Transaction Sandbox is substantial new surface — must stay phased; foundation is read-only tool generation.
- OKF type taxonomy is ClawQL-specific until community convergence — document as extension, not claim full interchangeability.

### Follow-ups (implementation, not this ADR)

1. Ship provisional JSON Schema + example entities under `schemas/ontology/` and `examples/ontology/`. ✅ (PR foundation)
2. Implement `clawql ontology lint` / `generate` CLI + CI `Ontology lint (examples)` job. ✅ — `packages/clawql-ontology`, `npm run ontology:lint`, `.github/workflows/ci.yml`
3. Wire `memory_ingest` frontmatter to OKF-compatible fields (`type`, optional `worm_ref`). ✅ — see [`docs/memory/okf.md`](../memory/okf.md)
4. Document hot/cold sync tiers when implementing tiered pull.
5. Open tracking issues for graph layer, kinetic sandbox, visual builder, vertical packs.

## Status language

This ADR is **Accepted** as the architectural direction. Runtime Ontology generation, kinetic Transaction Sandbox, and the Command Deck builder are **not claimed shipped** until implementation status docs say otherwise.
