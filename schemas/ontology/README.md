# Ontology JSON Schemas (v1alpha1)

Provisional schemas for ClawQL’s enterprise Ontology. See:

- [ADR 0009](../../docs/adr/0009-enterprise-ontology.md)
- [Architecture](../../docs/architecture/enterprise-ontology.md)
- [Examples](../../examples/ontology/)

| File                                         | Kind                 |
| -------------------------------------------- | -------------------- |
| [`entity.schema.json`](./entity.schema.json) | `Entity` definitions |

Status: **provisional** — evolve with design partners before treating as a public standard.

The same `entity.schema.json` is packaged with **`clawql-ontology`**
(`packages/clawql-ontology/schemas/ontology/`) for standalone npm installs. Keep both
copies identical (CI diffs them).

## CLI

```bash
clawql ontology lint --dir examples/ontology/entities
clawql ontology generate --dir examples/ontology/entities --out generated/ontology
```

See [`docs/ontology/cli.md`](../../docs/ontology/cli.md).
