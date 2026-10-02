# Ontology JSON Schemas (v1alpha1)

Canonical Draft 2020-12 schemas for ClawQL’s enterprise Ontology. See:

- [ADR 0009](../../../../docs/adr/0009-enterprise-ontology.md)
- [Architecture](../../../../docs/architecture/enterprise-ontology.md)
- [Examples](../../../../docs/examples/ontology/)

| File                                         | Kind                 |
| -------------------------------------------- | -------------------- |
| [`entity.schema.json`](./entity.schema.json) | `Entity` definitions |

Status: **provisional** — evolve with design partners before treating as a public standard.

This directory is the single source of truth and is published with **`clawql-ontology`**
(`package.json` `files: ["schemas"]`). Lint resolves it from the package; a project may
override with `--schema` or a local `<root>/schemas/ontology/entity.schema.json`.

The `$id` (`https://clawql.dev/schemas/ontology/entity.schema.json`) is a schema URI, not
a hosted docs-site path.

## CLI

```bash
clawql ontology lint --dir docs/examples/ontology/entities
clawql ontology generate --dir docs/examples/ontology/entities --out generated/ontology
```

See [`docs/ontology/cli.md`](../../../../docs/ontology/cli.md).
