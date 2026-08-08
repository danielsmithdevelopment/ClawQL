# Legal / M&A ontology pack

**Shipped** pre-built `.cqe` entities for ClawQL (`Contract`, `Organization`, `Matter`, `Party`, plus B-7 domain entities `Client`, `Attorney`, `Document`).

Spec: [`docs/specs/ontology/legal-domain-v0.1.md`](../../../../docs/specs/ontology/legal-domain-v0.1.md)  
Structured recall: [`docs/specs/memory/memory-recall-structured-filter-v0.1.md`](../../../../docs/specs/memory/memory-recall-structured-filter-v0.1.md)

```bash
clawql ontology import --pack legal
clawql ontology lint --dir .clawql/ontology/entities
```

`Matter` includes B-7.1 economics fields (`escrow_pct`, `non_compete_months`, …). Runtime instances land in vault-colocated `ontology.db` via `memory_ingest` / lazy vault sync; query with:

```ts
memory_recall({
  query: "matters matching escrow and non-compete",
  schema: "legal.Matter",
  filters: { escrowPct: { gte: 10 }, nonCompeteMonths: { gt: 18 } },
})
```

Other verticals (healthcare, financial, real-estate) are roadmap placeholders — see [../README.md](../README.md).
