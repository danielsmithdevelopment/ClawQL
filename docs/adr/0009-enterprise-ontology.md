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

| Dimension     | Palantir-style          | ClawQL decision                                                            |
| ------------- | ----------------------- | -------------------------------------------------------------------------- |
| Format        | Proprietary             | Open YAML / OKF Markdown + JSON Schema; PR-reviewable                      |
| Versioning    | Console / runtime       | Git + EnterpriseGovernance / release manifest version events               |
| Construction  | Professional services   | Derive from SQL / OpenAPI / documents; refine in UI or YAML                |
| Portability   | Vendor-bound            | `git clone` + export YAML/OKF bundle                                       |
| Agent surface | Proprietary object APIs | Generated typed **MCP** tools first; GraphQL `@kinetic` as later transport |

**Mental model:** OOP applied to the enterprise information space — typed objects, relationships, and methods — plus three enterprise-AI necessities: **provenance**, **permission-awareness** (ATRClaims), and **kinetic designation** (writes are structurally governed).

### 2) Three-layer Ontology architecture

1. **Entity schema** — typed objects, properties, PII fields, sources (SQL / OpenAPI / documents).
2. **Relationship graph** — traversable, permission-aware edges (Onyx + graph store later).
3. **Action schema** — generated **MCP** tools (v1); GraphQL optional later; writes marked `kinetic` with risk, blast radius, rollback, AP2 mandate binding.

### 3) Kinetic transport: MCP write tools first; GraphQL `@kinetic` later

GraphQL’s query/mutation split is the right **transport instinct** (better than undifferentiated REST). It is **not** sufficient for enterprise kinetic safety: mutations are binary (side effect or not), lack graded risk, mandate binding, blast-radius caps, and rollback protocols. The same graded fields apply whether the call arrives as MCP or GraphQL.

**Decision (essay gap 3.1 — see §10):** **v1 call surface = generated MCP write tools** with kinetic metadata on the Entity action schema (`kinetic: true`, `kinetic_level`, mandate / blast-radius / rollback / executor fields). The PEP + Transaction Sandbox intercept the MCP path. **GraphQL mutations + `@kinetic` directive** remain the fabric-aligned **transport target** (introspection, multi-client) — tracked as **3.8** / B4, not a v1 ship gate.

**Governance payload (shared):** `riskLevel` / `kinetic_level`, `requiresMandate`, `blastRadius`, `rollbackProtocol`, `executor`, optional canary — whether expressed as YAML on `.cqe` actions or later as `@kinetic(...)` on GraphQL.

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
- Optional body convention for `type: decision`: [OKF decision rationale](../memory/okf-decision-rationale.md) (AIF-inspired Claim / Grounds / Supports / Attacks).
- Ontology definitions may live as OKF docs with `type: ontology_entity` under the **schema** tree (Git); instances stay in object storage.

**Implementation status (July 2026):** `memory_ingest` writes OKF frontmatter; append upgrades legacy notes; `Memory/index.md` + `Memory/log.md` ship alongside `_INDEX_*`. See [`docs/memory/okf.md`](../memory/okf.md).

### 6) Storage split: schema in Git, instances in R2/S3

**Git holds definitions** (small, PR-reviewable): entity/relationship/action schemas, policy, static knowledge (runbooks, ADRs).

**Object storage (R2 default) holds instances** (unbounded): memory entries, populated entity instances, generated indexes, FTS/vector sidecars.

`clawql sync` remains the R2↔edge path. Hot/cold tiering (recent memory vs archive) is the scaling model — not “put the whole vault in GitHub.”

**Doctor (essay gap 4.4):** `clawql doctor` **warns** (does not hard-fail) when:

- no Entity files under `.clawql/ontology/entities` / `examples/ontology/entities` / `CLAWQL_ONTOLOGY_DIR`, or
- env marks schema as object-storage-only (`CLAWQL_ONTOLOGY_SCHEMA_STORE=r2|s3|…`, `CLAWQL_ONTOLOGY_SCHEMA_IN_OBJECT_STORAGE=1`, or a remote `CLAWQL_ONTOLOGY_SCHEMA_URI`).

Instances may live in R2; **schema must stay in Git** for PR review and release `ontologySchema` pins.

### 7) Ontology builder sequencing

| Phase     | Deliverable                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Now**   | YAML/OKF schema format + JSON Schema; `clawql ontology lint` / `generate` (read tools); derive from sources; manifest version events                                    |
| **Later** | Relationship graph + permission-aware traversal                                                                                                                         |
| **Later** | Kinetic MCP write tools + Transaction Sandbox (LOW first); GraphQL `@kinetic` transport later (§3 / §10)                                                                |
| **Later** | Command Deck visual builder (non-engineer authoring → Git PRs) — UX notes: [`command-deck-ontology-builder-ux.md`](../architecture/command-deck-ontology-builder-ux.md) |
| **Later** | Vertical schema packs (Legal, Healthcare, Financial, Real Estate)                                                                                                       |

**Do not lock property types / relationship syntax as a public standard** until 3–5 design partners validate against real enterprise schemas.

### 8) Relationship to Ouroboros Seed `ontology_schema`

Ouroboros Seeds ([ADR 0001](./0001-ouroboros-workflow-engine.md)) carry a **task-loop** ontology for evolutionary convergence. This ADR’s **enterprise Ontology** is the org-wide typed entity layer for IDP agents. They may share concepts later; they are not the same artifact. Do not overload Seed ontology for enterprise digital-twin modeling.

### 9) Amendment (2026-07-20) — v1 read backend = fixture mode (essay gap **2.3**)

**Decision:** Ontology **read** MCP tools (`CLAWQL_ENABLE_ONTOLOGY=1`) are backed by a **typed fixture / demo store** in v1. Entity `spec.sources` entries with `type: sql` (and peers) remain **declarations** for generate stubs / partner wiring — they do **not** imply a live SQL query path today.

**Rationale:** Typed enums / money objects for the essay demo are already true via fixtures. A general `sources[type=sql]` adapter is connection config, mapping, coercion, secrets, and multi-dialect work — design-partner depth, not a publish gate.

**Non-goals of this amendment:**

- Do **not** claim automatic Postgres/MySQL binding from `sources:` in v1 docs or essay without a separate ship.
- Do **not** block Onyx stub emission (`ontology generate` → `onyx-sources.stub.json`) — stubs stay manual-apply.

**Future (optional):** Narrow partner path (e.g. read-only `DATABASE_URL` + one Contract mapping) or a general SQL adapter — tracked separately; not required for “status: active not 2.”

**Done-when:** Docs + essay gap mark fixture mode as the shipped read backend; SQL disclosed as roadmap / partner.

### 10) Amendment (2026-07-20) — v1 kinetic call surface = MCP (essay gap **3.1**)

**Decision:** Ship kinetic **writes** first as **MCP tools** generated from Entity `actions` with `kind: write` + kinetic fields. Do **not** block LOW Transaction Sandbox (**3.2–3.3**) on GraphQL `@kinetic`.

**Rationale:** ClawQL’s agent surface is already MCP; write actions are already linted and listed as `deferredWriteActions`. Extending that path is the shortest honest route to “kinetic methods.” GraphQL `@kinetic` is valuable for introspection and non-MCP clients but is a second stack (schema, directive, proxy) before any write works.

**Non-goals of this amendment:**

- Do **not** claim GraphQL `@kinetic` ships in v1 essay copy without **3.8**.
- Do **not** implement Argo/Pulumi executor routing or HIGH/CRITICAL paths here — B4 / **3.4–3.7**.
- Do **not** remove GraphQL from the architecture narrative — keep it as the transport target.

**Next implementation:** **3.2** ✅ / **3.3** ✅ (gated write defs + LOW sandbox). Remaining: MEDIUM+ (**3.4–3.7**), GraphQL (**3.8**).

**Done-when:** ADR + essay gap record MCP-first; GraphQL samples framed as target / disclose until 3.8.

### 11) Amendment (2026-07-20) — LOW MCP kinetic shipped (essay gaps **3.2–3.3**)

**Shipped:**

- `ontology generate` emits `writeTools` for `kinetic_level: LOW` + `executor: NATIVE` (e.g. `update_contract_status`).
- Runtime gate: `CLAWQL_ENABLE_ONTOLOGY_WRITES=1` registers write MCP tools.
- Minimal Transaction Sandbox: ATR → field snapshot → native fixture execute/deny → in-memory kinetic audit hash-chain (`KINETIC_COMMITTED` / `KINETIC_DENIED`).

**Still deferred:** Argo/Pulumi routers, MEDIUM+/HIGH/CRITICAL, GraphQL `@kinetic`, permanent WORM store.

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
6. **Essay gap closure** (PragmaticVectors publish path): [`docs/ontology/essay-gap-closure.md`](../ontology/essay-gap-closure.md) — close A/B workstreams or disclose C blockers.
7. **v1 read backend = fixture mode** (essay gap **2.3**). ✅ — see §9; SQL adapters are partner/roadmap.
8. **v1 kinetic call surface = MCP** (essay gap **3.1**). ✅ — see §3 / §10; GraphQL `@kinetic` = transport target (**3.8**).
9. **LOW MCP kinetic** (essay gaps **3.2–3.3**). ✅ — see §11; `CLAWQL_ENABLE_ONTOLOGY_WRITES`.
10. **Schema in Git / doctor warn** (essay gap **4.4**). ✅ — §6 doctor bullets.
11. **Legal-only vertical packs** (essay gap **6.3** / **B6a**). ✅ — `packs/legal` shipped; others roadmap READMEs.
12. **Publish disclosures** (B1–B5, B4a): see [`essay-gap-closure.md`](../ontology/essay-gap-closure.md) § Decisions locked.

## Status language

This ADR is **Accepted** as the architectural direction. Runtime Ontology generation, kinetic Transaction Sandbox, and the Command Deck builder are **not claimed shipped** until implementation status docs say otherwise.
