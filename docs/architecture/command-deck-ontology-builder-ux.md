# Command Deck — ontology builder UX notes

**Status:** Design notes (phased; builder **not shipped**) · July 2026  
**Audience:** Command Deck / product implementers  
**Related:** [Enterprise Ontology](./enterprise-ontology.md) · [ADR 0009](../adr/0009-enterprise-ontology.md) · [Ontology CLI](../ontology/cli.md) · [OKF decision rationale](../memory/okf-decision-rationale.md)

## Intent

The visual Ontology builder in Command Deck should teach and author the same three layers as ADR 0009 — **entity schema**, **relationship graph**, **action schema (kinetic)** — and emit **Git-reviewable YAML / `.cqe`**, not a proprietary console dump.

Microsoft’s open [Ontology Playground](https://microsoft.github.io/Ontology-Playground/) (Fabric IQ learning app) is a useful **quest / progressive-disclosure** reference. ClawQL must **not** copy Fabric lock-in, OneLake-only bindings, or RDF/XML as the primary artifact. Primary artifacts remain OKF / YAML in Git + instances in R2.

## Quest sequence (progressive disclosure)

Mirror the playground’s “quests” as Command Deck onboarding steps. Each step has **one job**, one panel, and a clear exit criterion.

| Step | Playground analogy | Command Deck job | Exit criterion |
| ---- | ------------------ | ---------------- | -------------- |
| **1. Meet the entities** | Entity Explorer | List / create entity types (`Contract`, `Organization`, …) with descriptions | ≥1 entity validates via `clawql ontology lint` |
| **2. Trace a path** | Bean Trail / Path Finder | Walk one business path across relationships (e.g. Contract → Organization) | Path highlighted; edge types named |
| **3. Supply-chain / domain graph** | Supply Chain Navigator | Expand the graph for one vertical slice (not the whole enterprise) | Graph view scoped; ATRClaims preview “what an agent can see” |
| **4. Ask in language** | NL2Ontology / Query Explorer | Natural-language → entity/relationship suggestions (assisted authoring) | Suggestions become PR diffs, not silent runtime mutations |
| **5. Bind sources** | Data Binding Discovery | Attach SQL / OpenAPI / document sources to properties | `sources:` block present; secrets via vault refs only |
| **6. Kinetic actions** | _(ClawQL-only — no Fabric equivalent)_ | Mark write methods `kinetic`; set risk, mandate, executor, rollback | Lint fails if HIGH write lacks mandate / executor |

Steps 1–5 are pedagogical parity with the playground. **Step 6 is ClawQL’s differentiator** and must be impossible to skip accidentally for write surfaces.

## Layout principles

Align with Command Deck Action Views (schema-driven, one contract for enforce + present):

1. **Brand / product first** — “ClawQL Ontology” as the hero of the builder surface; not a generic graph dashboard.
2. **One composition per viewport** — graph **or** inspector **or** kinetic form; avoid stuffing stats strips into the first view.
3. **No cards in the hero graph** — nodes/edges are the visual; inspector is a side detail, not floating badges on the canvas.
4. **Emit files, not console state** — Save → branch + PR (`.yaml` / `.cqe` under `.clawql/ontology/`). Runtime never owns the source of truth.
5. **Kinetic fields non-accidental** — risk / mandate / executor use explicit controls (not hidden advanced toggles).
6. **ATRClaims preview** — show which entities vanish for a sample role before the agent runs.

## Inspector fields (entity selected)

| Section | Content |
| ------- | ------- |
| Identity | `metadata.name`, description |
| Properties | type, required, indexed, PII, mutability, `kinetic_level` |
| Relationships | target entity, cardinality, via |
| Sources | sql / openapi / documents + connection refs |
| Generated tools | preview of read MCP tool names from `ontology generate` |

## Competitive framing (for copy / docs, not UI chrome)

| Fabric Ontology Playground / IQ | ClawQL Command Deck builder |
| ------------------------------- | --------------------------- |
| Learn Fabric IQ + OneLake bindings | Learn **open** Git ontology |
| Export RDF/XML as a learning path | Export / commit **YAML + OKF** |
| Agents grounded in Fabric vocabulary | Agents grounded in portable schema + kinetic PEP |
| Platform graph item | Git + R2 instances + optional graph store later |

Positioning line: _open, Git-native ontology builder with kinetic safety — not a OneLake-only semantic layer._

## Implementation notes

- **Now:** CLI lint/generate ([`docs/ontology/cli.md`](../ontology/cli.md)); no builder UI.
- **Next:** Read-only graph explorer over linted examples, then authoring → PR.
- **Later:** Vertical packs + NL assist that only proposes diffs.
- Reuse Action View rendering patterns from DAOS Command Deck notes (JSON Schema → form) for kinetic action panels.

## See also

- [Enterprise Ontology architecture](./enterprise-ontology.md) § Ontology builder
- [Token efficiency](./clawql-token-efficiency.md) — generated tools keep Code Mode lean
- Microsoft Learn: [Fabric ontology (preview)](https://learn.microsoft.com/en-us/fabric/iq/ontology/overview) (competitive context)
- [Ontology Playground](https://microsoft.github.io/Ontology-Playground/) (UX reference only)
