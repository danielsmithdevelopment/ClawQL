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

## Live read tools (v1 = fixture mode)

Set `CLAWQL_ENABLE_ONTOLOGY=1` to register typed demo tools (`get_contract`, `search_contracts`, …). Optional `CLAWQL_ONTOLOGY_FIXTURE` points at a JSON store.

Entity `sources: [{ type: sql, … }]` entries are **declarations** for generate stubs / partners — they do **not** open a live SQL connection in v1 ([ADR 0009 §9](../../docs/adr/0009-enterprise-ontology.md)).

## Schema packaging

`entity.schema.json` ships inside this package under `schemas/ontology/` so standalone
`npm install clawql-ontology` can lint without a monorepo checkout. Keep it identical to
the repo-canonical [`schemas/ontology/entity.schema.json`](../../schemas/ontology/entity.schema.json)
(CI diffs the two).

## Library

```ts
import { lintOntology, generateOntologyReadTools, initOntologyTree } from "clawql-ontology";
import { makeOntologyLayer } from "clawql-ontology/plugin";
```

v1 generate emits **read** + relationship tools. Write / kinetic actions stay deferred until Transaction Sandbox.
