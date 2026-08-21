# Ontology specs

Draft domain and index specs that extend [ADR 0009](../../adr/0009-enterprise-ontology.md) and [ADR 0010](../../adr/0010-cq-file-extensions.md).

| Spec                                           | Site                                                                                               | Package / code                                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [legal-domain-v0.1.md](./legal-domain-v0.1.md) | [docs.clawql.com/specs/ontology/legal-domain](https://docs.clawql.com/specs/ontology/legal-domain) | `packages/clawql-ontology/packs/legal/` (entities as `.cqe`) · index + extractors in `packages/clawql-memory` |

**Roadmap:** negative-path `FailedStrategy`, append-only evidentiary field history, coverage lint, and the security↔ontology event bus — [`docs/security/security-ontology-knowledge-loop.md`](../../security/security-ontology-knowledge-loop.md).

**Repo note:** The draft package path `clawql-ontology/domains/legal/` maps to the shipped layout **`packs/legal/`** (scaffold/`import --pack` hardcode packs). Specs keep the logical domain name `legal.*`; on-disk pack path is packs.
