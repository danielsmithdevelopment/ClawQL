# clawql-ontology

Lint, scaffold, and generate tooling for ClawQL’s **enterprise Ontology** ([ADR 0009](../../docs/adr/0009-enterprise-ontology.md)), plus the **three-layer meta-ontology** ([meta-ontology-v0.1](../../docs/specs/ontology/meta-ontology-v0.1.md)).

**Why it matters (OpenBench B-7):** vault memory alone still hard-zeros on institutional enumeration when semantic near-misses become false positives. Typed predicates (`schema` + `filters` over the legal pack / `ontology.db`) closed the set — [Memory Finds. Ontology Decides.](https://pragmaticvectors.com/posts/memory-finds-ontology-decides/).

**Also:** negative-path entities (`FailedStrategy`), append-only evidentiary field history, and coverage lint — plus the security↔ontology event loop — [`docs/security/security-ontology-knowledge-loop.md`](../../docs/security/security-ontology-knowledge-loop.md).

## Commands

```bash
# Prefer .cqe (ADR 0010 §2a); .yaml / .yml / .json still accepted
clawql ontology lint --dir examples/ontology/entities
npx clawql-ontology lint --dir examples/ontology/entities

clawql ontology init
clawql ontology create-entity Matter
clawql ontology import --pack legal

clawql ontology generate --dir examples/ontology/entities --out generated/ontology

# Layer 2 — runtime scaffold from JSON Schema
clawql ontology scaffold --schema invoice-schema.json --document-type invoice --ttl permanent

# Layer 3 — meta-ontology
clawql ontology meta status
clawql ontology meta patterns --document-type invoice
clawql ontology meta promote --check
clawql ontology meta promote --document-type invoice --output packs/invoice/
```

## Live tools

| Flag                              | Tools                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `CLAWQL_ENABLE_ONTOLOGY=1`        | Fixture reads (`get_contract`, relationships, …)                                                                        |
| `CLAWQL_ENABLE_ONTOLOGY_WRITES=1` | LOW/MEDIUM kinetic writes (`update_contract_status`, `adjust_contract_value`) via ATR → snapshot → mandate gate → audit |

Optional: `CLAWQL_ONTOLOGY_FIXTURE`, `CLAWQL_ONTOLOGY_ATR_SCOPE=ontology:write`. MEDIUM tools need `mandate_type` + `mandate_id` (or stay within `change_limit`).

Entity `sources: [{ type: sql, … }]` entries are **declarations** for generate stubs / partners — not a live SQL connection in v1 ([ADR 0009 §9](../../docs/adr/0009-enterprise-ontology.md)).

## Meta-ontology env

See [meta-ontology-v0.1](../../docs/specs/ontology/meta-ontology-v0.1.md) for `CLAWQL_ONTOLOGY_SCAFFOLD_*` and `CLAWQL_ONTOLOGY_META_*`.

## memory_recall (dynamic schemas)

Layer 2/3 entity ids sync into vault `ontology.db` (`dynamic_entities` / `dynamic_records`) and query via `memory_recall`:

```ts
import { runOntologyRecall } from "clawql-memory/ontology";
import { runExtractBenchOntologyPipeline, syncDocumentToMemoryOntology } from "clawql-ontology";
```

See [meta-ontology-v0.1 § memory_recall](../../docs/specs/ontology/meta-ontology-v0.1.md#memory_recall-integration) and [ontology CLI](../../docs/ontology/cli.md).

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
  runKineticTransaction,
  scaffoldFromJsonSchema,
  scaffoldWithMeta,
  ingestOBTTrace,
} from "clawql-ontology";
import { makeOntologyLayer } from "clawql-ontology/plugin";
```
