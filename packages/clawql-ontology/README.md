# clawql-ontology

Lint and generate tooling for ClawQL’s **enterprise Ontology** ([ADR 0009](../../docs/adr/0009-enterprise-ontology.md)).

## Commands

```bash
# Validate entity YAML against schemas/ontology/entity.schema.json
# (packaged copy: packages/clawql-ontology/schemas/ontology/entity.schema.json)
clawql ontology lint examples/ontology/entities/*.yaml
# or
npx clawql-ontology lint --dir examples/ontology/entities

# Generate read-only MCP tool catalog + TypeScript plugin stub
clawql ontology generate --dir examples/ontology/entities --out generated/ontology
```

## Schema packaging

`entity.schema.json` ships inside this package under `schemas/ontology/` so standalone
`npm install clawql-ontology` can lint without a monorepo checkout. Keep it identical to
the repo-canonical [`schemas/ontology/entity.schema.json`](../../schemas/ontology/entity.schema.json)
(CI diffs the two).

## Library

```ts
import { lintOntology, generateOntologyReadTools } from "clawql-ontology";
```

v1 generate emits **read** tools only. Write / kinetic actions are listed in the catalog as deferred.
