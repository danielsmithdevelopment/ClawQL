# clawql-ontology

Lint, scaffold, and generate tooling for ClawQL’s **enterprise Ontology** ([ADR 0009](../../docs/adr/0009-enterprise-ontology.md)).

## Commands

```bash
# Prefer .cqe (ADR 0010 §2a); .yaml / .yml / .json still accepted
clawql ontology lint --dir examples/ontology/entities
npx clawql-ontology lint --dir examples/ontology/entities

clawql ontology init
clawql ontology create-entity Matter
clawql ontology import --pack legal

clawql ontology generate --dir examples/ontology/entities --out generated/ontology
```

## Live tools

| Flag | Tools |
| ---- | ----- |
| `CLAWQL_ENABLE_ONTOLOGY=1` | Fixture reads (`get_contract`, relationships, …) |
| `CLAWQL_ENABLE_ONTOLOGY_WRITES=1` | LOW kinetic writes (`update_contract_status`) via ATR → snapshot → audit |

Optional: `CLAWQL_ONTOLOGY_FIXTURE`, `CLAWQL_ONTOLOGY_ATR_SCOPE=ontology:write`.

Entity `sources: [{ type: sql, … }]` entries are **declarations** for generate stubs / partners — not a live SQL connection in v1 ([ADR 0009 §9](../../docs/adr/0009-enterprise-ontology.md)).

## Schema packaging

`entity.schema.json` ships inside this package under `schemas/ontology/` so standalone
`npm install clawql-ontology` can lint without a monorepo checkout. Keep it identical to
the repo-canonical [`schemas/ontology/entity.schema.json`](../../schemas/ontology/entity.schema.json)
(CI diffs the two).

## Library

```ts
import {
  lintOntology,
  generateOntologyReadTools,
  runLowKineticTransaction,
} from "clawql-ontology";
import { makeOntologyLayer } from "clawql-ontology/plugin";
```
