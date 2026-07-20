# ADR 0010: ClawQL file extensions (`.cqm`, `.cqe`, `.cqw`, `.cqk`)

- Status: **Accepted** (format strategy — promotion phased)
- Date: 2026-07-20
- Related:
  - [ADR 0009](./0009-enterprise-ontology.md) (enterprise Ontology + OKF memory)
  - Specs: [`docs/specs/cq-extensions/`](../specs/cq-extensions/)
  - OKF vault: [`docs/memory/okf.md`](../memory/okf.md)
  - Ontology CLI: [`docs/ontology/cli.md`](../ontology/cli.md)
  - Release manifests: [ADR 0007](./0007-pulumi-provisioning-managed-tiers.md) / `clawql-release`
- Supersedes: N/A

## Context

ClawQL’s vault and governance surfaces started as **plain Markdown / YAML**. OKF ([ADR 0009](./0009-enterprise-ontology.md)) standardizes frontmatter on those files. Separately, ClawQL needs a small set of **owned file types** so editors, CI, `clawql doctor`, Onyx, and release tooling can treat ClawQL-governed artifacts differently from generic YAML/Markdown — the same ecosystem move Google made with OKF, scoped to governed agentic systems.

Candidate names considered and rejected:

| Extension | Why not                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| `.clawql` | Too long for daily filenames; keep for directory branding (`~/.ClawQL/`) only |
| `.cql`    | Collides with **Cassandra Query Language** (and niche XDCC lists) — avoid     |

## Decision

### 1) Four extensions — earn each one

| Ext        | Name             | Purpose                                            | Base serialization                   |
| ---------- | ---------------- | -------------------------------------------------- | ------------------------------------ |
| **`.cqm`** | ClawQL Manifest  | EnterpriseGovernance / release / policy manifests  | YAML (ClawQL schema)                 |
| **`.cqe`** | ClawQL Entity    | Ontology entity definitions                        | YAML or OKF Markdown (entity schema) |
| **`.cqw`** | ClawQL Workflow  | Argo-compatible workflows with kinetic annotations | YAML                                 |
| **`.cqk`** | ClawQL Knowledge | OKF knowledge entries with ClawQL provenance       | OKF Markdown                         |

**Rule:** create an extension only when ClawQL tooling must treat the file differently from its generic equivalent. Not branding — a functional signal.

### 2) Sequencing — OKF first, then `.cq*`

1. **OKF on `.md` vault** — done / shipping ([`docs/memory/okf.md`](../memory/okf.md)).
2. **Draft open specs** for the four extensions (this ADR + [`docs/specs/cq-extensions/`](../specs/cq-extensions/)).
3. **Dual-accept** in tooling (e.g. `clawql ontology lint` accepts `.yaml` / `.yml` / `.json` **and** `.cqe`).
4. **Documented primary:** **`.cqe`** is the canonical extension in docs, examples, scaffolds, and essay copy. Tooling continues to accept `.yaml` / `.yml` / `.json` as **equivalent Entity content** (no mass-rename requirement; no lint failure on YAML).
5. **Promote** remaining trees / editor associations after OKF + specs are stable (VS Code, doctor hints, Onyx differentiation).

Do **not** block vault/OKF work on finishing VS Code or forcing a mass rename.

### 2a) Amendment (2026-07-20) — `.cqe` primary

**Decision:** For Ontology Entity definitions, **`.cqe` is primary in documentation and examples**. Serialization remains YAML (entity schema); the extension is the ClawQL tooling signal ([`.cqe` spec](../specs/cq-extensions/cqe.md)).

**Non-goals of this amendment:**

- Do **not** deprecate or reject `.yaml` / `.yml` / `.json` Entity files in `clawql ontology lint` / `generate`.
- Do **not** require renaming existing customer trees.
- Do **not** invent a second serialization — `.cqe` files are YAML Entity documents.

**Done-when:** ADR + specs + examples lead with `.cqe`; essay / Getting Started can say “write `Contract.cqe`” without a disclaimer.

### 3) What stays in existing formats

- Config: `sources.json`, `sync.json`, fallback chains — keep JSON/YAML/TOML.
- Generic memory without ClawQL provenance needs — OKF `.md` is enough.
- Plain Argo templates without kinetic annotations — standard Workflow YAML.
- Directory: `~/.ClawQL/` remains the home; no `.clawql` file extension for day-to-day use.

### 4) Open specs under Apache 2.0

Each extension has a one-page public spec (required/optional fields, content-type, tooling hooks). Third parties may produce/consume them. ClawQL defines the format; ClawQL does not lock the data.

## Consequences

### Positive

- Clear CI / doctor / ontology-generate scopes
- Editor extension story (`.tf`-style DX)
- Ecosystem leverage without proprietary lock-in
- Compatible with OKF (`.cqe` / `.cqk` build on it)

### Negative / risks

- Spec drift if promotion happens before field validation with design partners — mitigate with **draft** status and dual-accept
- More formats to teach — mitigate with the “earn it” rule and docs index

### Follow-ups

1. Ship draft specs under `docs/specs/cq-extensions/`. ✅
2. Ontology lint dual-accept `.cqe`. ✅
3. **`.cqe` primary in docs/examples** (essay gap **1.5**). ✅ — see §2a; examples ship as `Contract.cqe` / `Organization.cqe`.
4. VS Code grammar / schema association (later — B2).
5. `clawql-release` / doctor hooks for `.cqm` (MVP lint shipped; deepen later).
6. Optional: doctor warn-only nudge when Entity files use `.yaml` instead of `.cqe` (not required for essay honesty).

## Status language

**Accepted** as strategy. Mass promotion of vault files to `.cq*` is **not** required yet. OKF `.md` remains valid indefinitely for generic knowledge.
