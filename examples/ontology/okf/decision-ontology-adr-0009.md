---
type: decision
title: Enterprise Ontology — open and versioned
description: Adopt open YAML/OKF ontology in Git; instances in R2; kinetic via @kinetic
tags:
  - ontology
  - okf
  - kinetic
timestamp: 2026-07-20T00:00:00Z
correlation_id: example-ontology-adr-0009
worm_ref: null
---

# Enterprise Ontology — open and versioned

Example **OKF-compatible** memory note. Production `memory_ingest` should write similar frontmatter (required `type`, ClawQL extensions such as `correlation_id` / `worm_ref`).

See [ADR 0009](../../../docs/adr/0009-enterprise-ontology.md) and the [Enterprise Ontology architecture](../../../docs/architecture/enterprise-ontology.md).

## Decisions

- Formalize Ontology; do not copy Palantir’s proprietary console model.
- Schema in Git; instances in object storage.
- GraphQL mutations + `@kinetic` for graded write governance.
