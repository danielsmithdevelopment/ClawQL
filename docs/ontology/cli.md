# Ontology CLI (ADR 0009)

Lint entity YAML and generate read-only MCP tool stubs.

```bash
# Validate examples (or .clawql/ontology/entities)
clawql ontology lint --dir examples/ontology/entities

# Generate tools.json + TypeScript stub
clawql ontology generate --dir examples/ontology/entities --out generated/ontology

# Package CLIs
npm run ontology:lint
npm run ontology:generate
npx clawql-ontology lint --dir examples/ontology/entities
```

## What lint checks

1. JSON Schema (`schemas/ontology/entity.schema.json`, Draft 2020-12)
2. Semantic rules:
   - unique `metadata.name`
   - enum properties must have `values`
   - write actions require `kinetic: true` + kinetic fields
   - relationship targets present in the linted set (warning)
   - unique action names across entities (warning)

## What generate emits

| File                      | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| `tools.json`              | Catalog of read MCP tools                               |
| `ontology-plugin.stub.ts` | `ONTOLOGY_READ_TOOLS` constant for future plugin wiring |
| `README.md`               | Notes                                                   |

Write / kinetic actions are listed as `deferredWriteActions` and **not** registered in v1.

## Library

```ts
import { lintOntology, generateOntologyReadTools } from "clawql-ontology";
```

See [ADR 0009](../adr/0009-enterprise-ontology.md) and [enterprise-ontology.md](../architecture/enterprise-ontology.md).
