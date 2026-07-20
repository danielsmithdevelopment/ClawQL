# Ontology CLI (ADR 0009)

Lint entity YAML/`.cqe`, scaffold trees/packs, and generate MCP read tools (stubs + live fixture plugin).

```bash
# Validate examples (or .clawql/ontology/entities)
clawql ontology lint --dir examples/ontology/entities

# Day-1 scaffold
clawql ontology init
clawql ontology create-entity Matter
clawql ontology import --pack legal

# Generate tools.json + OKF index + Onyx stubs + TypeScript catalog
clawql ontology generate --dir examples/ontology/entities --out generated/ontology

# Live fixture tools in the gateway (v1 read backend — demo Contract/Organization store)
CLAWQL_ENABLE_ONTOLOGY=1 npx clawql-mcp
# Optional: CLAWQL_ONTOLOGY_DIR=.clawql/ontology/entities
# Optional: CLAWQL_ONTOLOGY_FIXTURE=/path/to/fixtures.json
# Note: sources[type=sql] is a declaration for stubs/partners — not a live DB adapter in v1 (ADR 0009 §9).

# Package CLIs
npm run ontology:lint
npm run ontology:generate
npx clawql-ontology lint --dir examples/ontology/entities
npx clawql-ontology init
npx clawql-ontology import --pack legal
```

## Read backends (v1)

| Backend                     | Status                    | How                                                               |
| --------------------------- | ------------------------- | ----------------------------------------------------------------- |
| **Fixture / demo store**    | **Shipped**               | `CLAWQL_ENABLE_ONTOLOGY=1` (+ optional `CLAWQL_ONTOLOGY_FIXTURE`) |
| **SQL / OpenAPI live bind** | Roadmap / design partners | `sources:` on entities drive generate stubs only today            |

Do not claim automatic SQL binding in essay or Getting Started until a dedicated adapter ships.

## What lint checks

1. JSON Schema (`schemas/ontology/entity.schema.json`, Draft 2020-12)
2. Semantic rules:
   - unique `metadata.name`
   - enum properties must have `values`
   - write actions require `kinetic: true` + kinetic fields
   - relationship targets present in the linted set (warning)
   - unique action names across entities (warning)

## What generate emits

| File                      | Purpose                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `tools.json`              | Catalog of read + relationship MCP tools                             |
| `index.md`                | OKF entity catalog (prefer before loading full `.cqe` bodies)        |
| `onyx-sources.stub.json`  | Onyx connector stubs from `sources:` (manual apply; auto-sync is B5) |
| `ontology-plugin.stub.ts` | `ONTOLOGY_READ_TOOLS` constant                                       |
| `README.md`               | Notes                                                                |

Write / kinetic actions are listed as `deferredWriteActions` and **not** registered until Transaction Sandbox.

Entity files: prefer **`.cqe`** ([ADR 0010 §2a](../adr/0010-cq-file-extensions.md)); `.yaml` / `.yml` / `.json` remain accepted ([`.cqe` spec](https://docs.clawql.com/specs/cq-extensions/cqe)).

## Shipped authoring path (interim — no Command Deck builder yet)

Until the Command Deck visual builder ships, the supported path is:

1. `clawql ontology init` / `create-entity` / `import --pack legal`
2. Edit `.cqe` in Git
3. `clawql ontology lint` in CI / locally
4. Open a PR — same review model the builder would target

See [essay gap closure](./essay-gap-closure.md) **7.3** and [Command Deck UX notes](../architecture/command-deck-ontology-builder-ux.md) (roadmap).

## Release / doctor

- `clawql-release collect` pins `ontologySchema` when entity trees exist
- `clawql-release lint examples/ontology/governance/demo.cqm` validates `.cqm`
- `clawql doctor` reports ontology entity dir presence

## Library

```ts
import { lintOntology, generateOntologyReadTools, initOntologyTree } from "clawql-ontology";
import { makeOntologyLayer } from "clawql-ontology/plugin";
```

See [ADR 0009](../adr/0009-enterprise-ontology.md), [ADR 0010](../adr/0010-cq-file-extensions.md), and [enterprise-ontology.md](../architecture/enterprise-ontology.md).
