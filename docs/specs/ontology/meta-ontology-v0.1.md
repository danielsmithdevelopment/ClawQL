# Meta-ontology (three-layer) — v0.1

**Status:** Draft · August 2026  
**Package:** [`clawql-ontology`](../../packages/clawql-ontology/)  
**Depends on:** clawql-memory (structured filters) · clawql-inference (RTP/OBT traces) · clawql-streams (future)

Site companion narrative: [Enterprise Ontology](../../architecture/enterprise-ontology.md) · structured recall: [memory-recall-structured-filter-v0.1](../memory/memory-recall-structured-filter-v0.1.md)

---

## Problem

Layer 1 hand-written `.cqe` packs (e.g. `packs/legal/`) are highest quality but limited coverage. One-shot extraction (ExtractBench), novel domains, and workflows where structure emerges from examples need runtime scaffolding and evidence-driven learning.

## Three layers

| Layer | Source | Quality | Coverage |
| ----- | ------ | ------- | -------- |
| **1** Pre-built | Human `.cqe` packs | Highest | Defined domains |
| **2** Runtime scaffold | JSON Schema / Docling structure | Good | Any known output schema |
| **3** Meta-learned | RTP/OBT traces | Improves with evidence | Domains with trace history |

All layers share runtime `CQEEntity` shapes, a dynamic ontology index, and (for Layer 1 legal) `memory_recall` structured filters over `ontology.db`. Layer 3 persists learning in `meta-ontology.db` (sql.js).

## Package layout

```
packages/clawql-ontology/src/
  layer1/          — re-exports pack load / lint / generate
  layer2/scaffold/ — json-schema, document-structure, populate
  layer3/meta/     — store, trace-ingester, meta-scaffold, promote
  shared/          — CQE runtime types, ontology index, CQE→YAML
  effect/          — OntologyError, meta env config
```

## Environment

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `CLAWQL_ONTOLOGY_SCAFFOLD_ENABLED` | on | Layer 2 scaffolding |
| `CLAWQL_ONTOLOGY_SCAFFOLD_TTL` | `session` | `session` \| `permanent` \| seconds |
| `CLAWQL_ONTOLOGY_META_ENABLED` | on | Layer 3 learning |
| `CLAWQL_ONTOLOGY_META_DB_PATH` | `~/.ClawQL/meta-ontology.db` | Meta store |
| `CLAWQL_ONTOLOGY_META_MIN_EVIDENCE` | `10` | Sessions before Layer 3 scaffolds |
| `CLAWQL_ONTOLOGY_META_PROMOTION_EVIDENCE` | `50` | Promotion threshold |
| `CLAWQL_ONTOLOGY_META_PROMOTION_QUALITY` | `0.85` | Min avg criterion pass rate |
| `CLAWQL_ONTOLOGY_META_LEARN_FAILURES` | on | Learn from low-CPR traces |
| `CLAWQL_ONTOLOGY_META_MAX_PATTERNS` | `1000` | Cap query patterns per entity |

## CLI

```bash
clawql ontology scaffold --schema invoice-schema.json --document-type invoice --ttl permanent
clawql ontology meta status
clawql ontology meta patterns --document-type invoice
clawql ontology meta promote --check
clawql ontology meta promote --document-type invoice --output packs/invoice/
```

Also available as `npx clawql-ontology …`.

## Library (Effect-first)

```ts
import { Effect } from "effect";
import {
  OntologyIndexLive,
  scaffoldFromJsonSchema,
  scaffoldWithMeta,
  ingestOBTTrace,
  metaStoreLayerForPath,
} from "clawql-ontology";

const program = scaffoldWithMeta(jsonSchema, "invoice").pipe(
  Effect.provide(OntologyIndexLive),
  Effect.provide(metaStoreLayerForPath("/tmp/meta-ontology.db"))
);
```

## Promotion path

When Layer 3 evidence ≥ promotion thresholds, `meta promote` emits a reviewable `.cqe` under `packs/<document_type>/entities/entity.cqe`. Domain experts refine and register as Layer 1.

## Open questions

Evidence threshold tuning · cross-domain transfer · negative pattern weighting at field-level OBT · Layer 3 drift detection — see the full design draft in the August 2026 meta-ontology proposal.

## Related

- Legal domain index: [legal-domain-v0.1.md](./legal-domain-v0.1.md)
- ExtractBench action plan: [`docs/benchmarks/extractbench-action-plan.md`](../../benchmarks/extractbench-action-plan.md)
- OpenBench trace / RTP: [`docs/benchmarks/openbench-trace-collection.md`](../../benchmarks/openbench-trace-collection.md)
