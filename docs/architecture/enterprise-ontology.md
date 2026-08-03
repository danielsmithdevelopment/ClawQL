**Open enterprise Ontology.** Typed objects for agents (entity · graph · kinetic actions), versioned in Git with OKF memory, not a proprietary console. Foundation CLI (`clawql ontology lint` / `generate`) ships; graph, kinetic sandbox, and Command Deck builder are phased. Source: [docs/architecture/enterprise-ontology.md](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/architecture/enterprise-ontology.md). Related: [Token efficiency](https://docs.clawql.com/architecture/token-efficiency) · [Agentic Fabric](https://docs.clawql.com/architecture/agentic-fabric) · [Memory](https://docs.clawql.com/learn/memory).

# Enterprise Ontology — open, versioned, kinetic

**Status:** Architecture decision ([ADR 0009](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0009-enterprise-ontology.md)) · July 2026
**Audience:** architects, design partners, implementers of ontology lint/generate and kinetic governance
**Related:** [Zero-Trust Agentic Fabric](https://docs.clawql.com/architecture/agentic-fabric) · [Token efficiency (12 layers)](https://docs.clawql.com/architecture/token-efficiency) · [Memory / Obsidian](https://docs.clawql.com/learn/memory) · [OKF decision rationale](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/memory/okf-decision-rationale.md) · [Command Deck ontology builder UX](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/architecture/command-deck-ontology-builder-ux.md) · [Team vault sync](https://docs.clawql.com/getting-started/for-teams) · [ADR 0004](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0004-argo-cd-workflows-clawql-pipelines.md) · [ADR 0007](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0007-pulumi-provisioning-managed-tiers.md)

> **Shipped vs target:** This document is the source of truth for design intent. Entity schema format and examples in-repo are provisional. Automatic MCP generation, graph traversal, kinetic Transaction Sandbox, and the Command Deck builder are phased — verify against [modularization implementation status](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/design/modularization-implementation-status.md) before external claims.

---

## One-Sentence Pitch

The Ontology is what happens when you apply a TypeScript-grade type system to the enterprise data model, give it to AI agents instead of only application code, version it in Git alongside deployments, and make every write auditable and kinetically governed — with a schema your team owns and can export as a file tree.

---

## Ontology Enables Token Efficiency (Tier 1)

Typed entity / relationship / action schemas are not only a grounding story — they are how ClawQL keeps agent context lean. Without them, Code Mode and projection have nothing precise to generate or trim against, and vault recall falls back to paste-the-notebook.

| Token-efficiency layer | Ontology / OKF role |
|---|---|
| **1 Code Mode** | `.cqe` / entity YAML → generated read tools; full catalogs stay server-side |
| **2 Response trim** | Project only declared properties (ATR-visible) |
| **6 History distill** | Compact transcripts into [`type: decision` rationale](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/memory/okf-decision-rationale.md) / `.cqk` |
| **7–9** | Graph-aware recall + structured OKF output instead of free prose |
| **8 Routing** | `kinetic_level` / risk informs Frugal → Frontier |

Full stack: [Twelve layers of LLM cost](https://docs.clawql.com/architecture/token-efficiency). Ontology without those layers becomes a typed landfill; layers without ontology answer cheaply about the wrong objects.

---

## Why Formalize — and Why Differently from Palantir

Palantir's Ontology is a genuine asset: agents operate on `Turbine`, `Contract`, and `Patient` objects with known types, relationships, and business meaning. That grounding is what makes production agents useful.

ClawQL takes the same core insight and addresses the properties that make Palantir's implementation difficult to adopt or leave.

| Property | ClawQL approach |
|---|---|
| Portable format | Open YAML / OKF Markdown + JSON Schema; export is a file tree |
| Self-service build | Derive from SQL, OpenAPI, document classifiers; refine, don't construct from scratch |
| Pipeline-native | Schema in Git; schema changes are manifest version events (signed / WORM) |

Competitive wedge: *"Your Ontology is a YAML/OKF tree in Git, signed with your release. If you leave, you take it with you."*

---

## OOP Taken Seriously for Enterprise AI

| Layer | Analogy |
|---|---|
| OOP class | `Contract { parties, status, sign() }` |
| Database schema | `CREATE TABLE contracts (...)` |
| Enterprise Ontology | Typed object + sources + graph edges + kinetic methods |

Three properties distinguish the Enterprise Ontology from ordinary OOP:

**Provenance.** Property values trace to source row or document. The chain is in WORM.

**Permission-awareness.** ATRClaims are structural. Unauthorized entities are invisible to the agent, not merely denied at method return.

**Kinetic designation.** Writes differ from reads in the type system (`kinetic: true` / `@kinetic`), not only by convention. The safety boundary is encoded in the schema.

---

## Three-Layer Architecture

### Layer 1 — Entity Schema

Typed objects agents operate on. Each entity declares properties, PII fields (Presidio), sources (Onyx indexing), and mutability / kinetic level for fields.

Provisional shape (YAML or OKF frontmatter + body). Full example: [`examples/ontology/`](https://docs.clawql.com/examples/ontology/).

```yaml
# .clawql/ontology/entities/Contract.cqe  (Git — schema)
apiVersion: clawql.dev/ontology/v1alpha1
kind: Entity
metadata:
  name: Contract
spec:
  description: Legal agreement between two or more parties
  properties:
    contract_id:
      type: string
      required: true
      indexed: true
    status:
      type: enum
      values: [draft, active, expired, terminated]
      mutable: true
      kinetic_level: LOW
    value:
      type: money
      mutable: true
      kinetic_level: HIGH
      requires_mandate: AP2_FINANCIAL
    parties:
      type: array
      items: { $ref: Organization }
      mutable: false # schema encodes business rule — no mutation generated
  pii_fields: [parties.contact_email, parties.contact_phone]
  sources:
    - type: sql
      connection: ${VAULT:contracts_db}
      table: contracts
      id_column: contract_id
  relationships:
    - entity: Organization
      type: many_to_many
      via: contract_parties
```

JSON Schema for validation: [`schemas/ontology/entity.schema.json`](https://docs.clawql.com/schemas/ontology/entity.schema.json).

### Layer 2 — Relationship Graph

Edges from the schema become traversable, permission-aware graph tools. Target store: Onyx layer over Neo4j or a Postgres graph extension. Graph-aware `memory_recall` can expand related entities within ATRClaims. Phased after entity schema and read-tool generation.

### Layer 3 — Action Schema

Read tools generate from the entity schema. Write tools require explicit kinetic metadata:

```text
search_contracts(query, status?) → Contract[]
get_contract(contract_id) → Contract
update_contract_status(...) → void   # kinetic
initiate_payment(...) → PaymentResult  # kinetic + AP2
```

---

## Kinetic Governance: MCP First, GraphQL as Transport Later

**What GraphQL gets right:** query vs mutation is a schema-level semantic contract; introspection lets agents and PEPs discover side-effecting operations.

**What it lacks:** graded risk, AP2 mandate binding, blast-radius caps, rollback protocols, progressive canary.

**v1 decision ([ADR 0009 §10](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0009-enterprise-ontology.md)):** ship kinetic writes as MCP tools from Entity actions (`kinetic: true` + graded fields). PEP + Transaction Sandbox intercept MCP. GraphQL `@kinetic` remains the fabric-aligned transport target — not a v1 ship gate.

Illustrative GraphQL shape (target — not shipped until **3.8**):

```graphql
type Mutation {
  initiatePayment(
    accountId: ID!
    amount: Money!
    recipient: ID!
  ): PaymentResult
    @kinetic(
      riskLevel: HIGH
      requiresMandate: true
      mandateType: AP2_PAYMENT
      blastRadius: FINANCIAL
      transactionLimit: "50000.00"
      rollbackProtocol: REVERSAL
      auditLevel: FORENSIC
      requiresHumanInLoop: true
      executor: NATIVE
    )
}
```

Equivalent v1 authoring is YAML on `.cqe` write actions; generate emits MCP tool defs (gated until LOW sandbox).

High-risk execution path (conceptual):

```text
Agent mutation
  → GraphQL / MCP boundary (mutation + @kinetic)
  → PEP (ATRClaims)
  → AP2 MandateService
  → Transaction Sandbox (plan → stage → canary? → commit)
  → Human-in-loop if required
  → Execute + WORM (KINETIC_*)
  → Register rollback hook
```

Low-risk field updates skip mandate and HITL but still stage a field snapshot for `FIELD_RESTORE`.

`mutable: false` on a property means no mutation is generated — schema validation error, not an auth error.

---

## Kinetic Executors (the Triad + Native)

Stateful production changes need plans, observability, and rollback — the same lesson as deployments and IaC.

| Executor | Lesson from | ClawQL use |
|---|---|---|
| **Pulumi** | Plan / state / surgical rollback | Infrastructure kinetic actions (ADR 0007) |
| **Argo Workflows** | DAG, retries, artifacts, suspend | IDP pipeline + multi-step agent tasks (ADR 0004) |
| **Argo Rollouts** | Canary, analysis, promote/rollback | Deployment kinetic actions |
| **Native sandbox** | Same state machine in Effect-TS | SAP / CRM / payments and other app writes |

Routing is schema-driven (`executor` on `@kinetic`). Agents call typed mutations; PEP + Transaction Sandbox choose the executor. WORM records which executor ran.

### Transaction Sandbox State (Conceptual)

Modeled on Pulumi state + Argo progressive execution:

- **Plan** before execute (`pulumi preview` analogue)
- **Completed steps** for surgical rollback
- **Analysis gates** between canary batches
- **Drift refresh** before commit (state changed underfoot triggers replan or halt)
- **Suspension** for HITL — prefer Argo durable suspend when executor is Workflows

Bulk high-blast-radius actions use canary progression (`initial_batch`, analysis metrics, `progression: [10, 100, ALL]`).

### Argo Workflows Today

Document IDP DAGs (Tika → ... → Onyx) are already Workflow-shaped. Kinetic wrapping adds mandate + WORM around existing workflow submission. Do not reimplement DAG execution in the agent loop.

---

## OKF and the Memory Vault

[Open Knowledge Format (OKF) v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) is a thin convention: directory of Markdown files, YAML frontmatter, path as identity, `type` required ([announcement](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)). Community critique ("rebrand of wiki/Obsidian") is partly fair; the value is interoperable frontmatter, not a new runtime.

**Decision:** OKF-compatible serialization for memory and ontology definition docs; Obsidian remains the human UI.

**Shipped:** `memory_ingest` writes OKF frontmatter; `Memory/index.md` + `Memory/log.md`; legacy append upgrade. Details: [`docs/memory/okf.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/memory/okf.md).

**Next (extensions):** [ADR 0010](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0010-cq-file-extensions.md) — `.cqe` is primary in docs/examples; lint/generate still dual-accept `.yaml` / `.yml` / `.json`. Specs: [`docs/specs/cq-extensions/`](https://docs.clawql.com/specs/cq-extensions/).

```text
memory_ingest writes:
---
type: decision          # OKF required
title: …
tags: …
timestamp: …
correlation_id: …
worm_ref: <hash>        # ClawQL extension
---
<body>
```

ClawQL `type` taxonomy (extension until ecosystem standardizes): `decision`, `context`, `error`, `runbook`, `entity`, `relationship`, `task_result`, `ontology_entity`, `ontology_relationship`, `ontology_action`, `index`, `log`, `digest`.

`index.md` / `log.md` patterns give catalog and changelog without loading the full vault into context.

---

## Git vs R2 — What Lives Where

The vault cannot all live in GitHub. Separate definition from instance.

### Git (small, versioned, PR-reviewed)

```text
repo/
  .clawql/
    ontology/           # Entity / relationship / action schemas
    policy/             # HIPAA, residency, …
    knowledge/          # Static OKF: runbooks, ADRs, metric defs
    manifest.yaml       # Governance + ontology schema version pin
```

### Object Storage — R2 Default (large, synced)

```text
s3://clawql-org-vault/
  memory/               # Dynamic OKF memory entries
  ontology/instances/   # Populated entity instances (optional)
  indexes/              # FTS / vectors (derived)
```

| Path | Store | Sync |
|---|---|---|
| Schema + static knowledge | Git → R2 on release | Propagates with release / `ontology generate` |
| Memory + instances | R2 only | `clawql sync` / `memory_sync` |
| Hot tier (recent / active) | Edge cache | Sub-ms local recall |
| Cold tier (archive) | R2 on demand | Queried when needed |

Onyx indexes R2 content; it is never the source of truth.

This matches existing team vault sync ([getting-started-for-teams](https://docs.clawql.com/getting-started/for-teams)): OKF standardizes file shape inside the bucket; it does not change the storage model.

---

## Ontology Builder (Yes — Sequenced)

1. **Now — format + CLI:** `clawql ontology lint` / `generate` (read tools); CI with `clawql-release lint`; derivation from SQL/OpenAPI.
2. **Next — visual builder in Command Deck:** entity / relationship / action panels; kinetic fields non-accidental; emits YAML → Git PR. UX quests and inspector layout: [`command-deck-ontology-builder-ux.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/architecture/command-deck-ontology-builder-ux.md) (Fabric Ontology Playground as reference only).
3. **Later — vertical packs:** Legal, Healthcare, Financial Services, Real Estate as OKF bundles teams adopt and customize.

Builder surfaces executor choice (Argo Workflow template vs Pulumi resource) for non-engineers without replacing engineer YAML authoring.

---

## Try It Today

Foundation tooling is available now:

```bash
# Validate example entities (.cqe primary; .yaml still accepted)
npm run ontology:lint

# Generate read MCP tool catalog + OKF index + Onyx stubs
npm run ontology:generate

# Live typed reads (v1 = fixture store — ADR 0009 §9)
CLAWQL_ENABLE_ONTOLOGY=1
```

CLI reference: [`docs/ontology/cli.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/ontology/cli.md). Examples: [`examples/ontology/`](https://docs.clawql.com/examples/ontology/). SQL `sources:` are declarations / stubs in v1 — not a live query path.

---

## Industry Context (Not Dependencies)

Enterprises and researchers are converging on the same problem — typed meaning for agents.

| Effort | Overlap with ClawQL | Difference |
|---|---|---|
| **Microsoft Fabric IQ Ontology** | Entity types, relationships, agent grounding, visual playground | Platform-bound (OneLake); ClawQL stays Git + open YAML/OKF + kinetic PEP |
| **AIF (Argument Interchange Format)** | Structured rationale so understanding transfers without ambiguity | Argumentation-specific; ClawQL reuses the idea in [OKF `type: decision`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/memory/okf-decision-rationale.md) for enterprise decisions |
| **Palantir Ontology** | Typed digital twin for agents | Proprietary console; ClawQL is portable and pipeline-native ([ADR 0009](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0009-enterprise-ontology.md)) |

These validate the direction. They are not runtime dependencies.

---

## Design-Partner Gate

Do not publish the property-type / relationship / source DSL as a frozen standard until 3–5 design partners validate against real enterprise schemas. In-repo schema is `v1alpha1` — provisional.

---

## Phased Delivery Checklist

| Phase | Scope | Depends on |
|---|---|---|
| Foundation | `v1alpha1` schema, lint, read-tool generate, source derivation, manifest version pin | This ADR — schema + `clawql ontology lint` / `generate` shipped; derivation / manifest pin still open |
| Graph | Relationship traversal, ATRClaim-aware edges, graph-aware recall | Foundation |
| Kinetic | Write tools, `@kinetic`, Transaction Sandbox, AP2, canary | Foundation + PEP |
| Builder UI | Command Deck schema editor | Stable format |
| Verticals | Industry OKF packs | Builder + design partners |

---

## See Also

- [ADR 0009](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0009-enterprise-ontology.md) — decision record
- [Ontology CLI](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/ontology/cli.md) — `clawql ontology lint` / `generate`
- [Token efficiency (12 layers)](https://docs.clawql.com/architecture/token-efficiency)
- [OKF decision rationale template](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/memory/okf-decision-rationale.md)
- [Command Deck ontology builder UX](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/architecture/command-deck-ontology-builder-ux.md)
- [Essay gap closure backlog](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/ontology/essay-gap-closure.md)
- Example entity: [`examples/ontology/entities/Contract.cqe`](https://docs.clawql.com/examples/ontology/entities/Contract.cqe)
- Example decision note: [`examples/ontology/okf/decision-rationale-template.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/examples/ontology/okf/decision-rationale-template.md)
- JSON Schema: [`schemas/ontology/entity.schema.json`](https://docs.clawql.com/schemas/ontology/entity.schema.json)
- Ouroboros Seed ontology (task loop — different artifact): [ADR 0001](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0001-ouroboros-workflow-engine.md)

© Copyright 2026. All rights reserved. · [ClawQL on GitHub](https://github.com/danielsmithdevelopment/ClawQL)
