# `.cqe` — ClawQL Entity (draft)

**Extension:** `.cqe`  
**Media type (proposed):** `application/vnd.clawql.entity+yaml`  
**Status:** Draft v0.1 · [ADR 0010](../../adr/0010-cq-file-extensions.md) · Schema: [`schemas/ontology/entity.schema.json`](../../../schemas/ontology/entity.schema.json)

## Purpose

Ontology **entity definitions** (schema layer in Git). Distinct from populated instances (R2) and from OKF knowledge notes (`.md` / `.cqk`).

## Serialization

Preferred: YAML matching `Entity` `clawql.dev/ontology/v1alpha1`.  
Also allowed: OKF Markdown with frontmatter `type: ontology_entity` and a YAML entity body (or fenced yaml) — tooling should accept both during transition.

## Required fields (YAML form)

Same as [`entity.schema.json`](../../../schemas/ontology/entity.schema.json):

- `apiVersion: clawql.dev/ontology/v1alpha1`
- `kind: Entity`
- `metadata.name`
- `spec.description`
- `spec.properties` (non-empty)

## ClawQL-specific conventions

| Concern | Where |
| ------- | ----- |
| PII | `spec.pii_fields` |
| Sources | `spec.sources` (sql / openapi / nextcloud / …) |
| Relationships | `spec.relationships` |
| Read/write actions | `spec.actions` (`kind: read\|write`; writes require `kinetic: true`) |
| Field mutability | property `mutable`, `kinetic_level`, mandate fields |

## Tooling hooks

- `clawql ontology lint` — validate `.cqe` (and still `.yaml` / `.yml` / `.json`)
- `clawql ontology generate` — emit read MCP tools from `.cqe`
- Future VS Code — autocomplete against entity schema

## Dual-accept period

Until promotion completes, repositories may keep `Contract.yaml`. Lint/generate treat `.cqe` and `.yaml` equivalently when content matches the Entity schema.

## Example

See [`examples/ontology/entities/Contract.yaml`](../../../examples/ontology/entities/Contract.yaml) (same content may be renamed `Contract.cqe` without schema change).
