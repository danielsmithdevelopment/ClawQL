# OKF memory vault serialization

ClawQL stores vault memory as [Open Knowledge Format (OKF) v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)–compatible Markdown: YAML frontmatter + body. Obsidian remains the human UI.

**Decision:** [ADR 0009](../adr/0009-enterprise-ontology.md) · [Enterprise Ontology](../architecture/enterprise-ontology.md)

## What ships

| Surface               | Behavior                                                                               |
| --------------------- | -------------------------------------------------------------------------------------- |
| **`memory_ingest`**   | Writes OKF frontmatter (`type` required; defaults to `context`) plus ClawQL extensions |
| **`Memory/index.md`** | OKF catalog (alongside legacy `_INDEX_{Provider}.md`)                                  |
| **`Memory/log.md`**   | Append-only OKF changelog of successful ingests                                        |
| **Append upgrade**    | Legacy notes missing `type` are upgraded on append                                     |
| **Vault digest**      | Reads `timestamp` → `clawql_ingest_created` → `date`; writes `type: digest`            |

## Frontmatter contract

```yaml
---
type: "decision" # OKF required (ClawQL taxonomy)
title: "Session notes"
description: "One-line summary" # OKF recommended
resource: null # OKF recommended URI when applicable
tags: ["clawql-ingest", "okf"]
timestamp: "2026-07-20T03:00:00.000Z"
correlation_id: "corr-…" # ClawQL extension
worm_ref: "…" # ClawQL extension (optional)
agent_id: "…" # ClawQL extension (optional)
verdict: "accepted" # ClawQL extension (optional)
date: 2026-07-20T03:00:00.000Z # legacy Obsidian alias (= timestamp)
clawql_ingest: true # legacy marker
clawql_ingest_created: "…" # legacy digest compatibility
clawql_okf: true # marks OKF-complete notes
---
```

### ClawQL `type` taxonomy

`decision`, `context`, `error`, `runbook`, `entity`, `relationship`, `task_result`, `ontology_entity`, `ontology_relationship`, `ontology_action`, `index`, `log`, `digest`

OKF does not register types centrally — consumers must tolerate unknown values.

For **`type: decision`**, prefer the AIF-inspired body sections in [**OKF decision rationale**](./okf-decision-rationale.md) (Claim / Grounds / Supports / Attacks / Preference / Decision / Provenance) so Layer 6 distillation stays structured. Example: [`examples/ontology/okf/decision-rationale-template.md`](../../examples/ontology/okf/decision-rationale-template.md).

### MCP input fields

| Field                         | Frontmatter                              |
| ----------------------------- | ---------------------------------------- |
| `type`                        | `type` (default `context`)               |
| `description`                 | `description` (else first insights line) |
| `resource`                    | `resource`                               |
| `tags`                        | `tags` (+ always `clawql-ingest`)        |
| `correlationId` / `sessionId` | `correlation_id`                         |
| `wormRef`                     | `worm_ref`                               |
| `agentId`                     | `agent_id`                               |
| `verdict`                     | `verdict`                                |

## Env knobs

| Env                          | Default | Effect                                          |
| ---------------------------- | ------- | ----------------------------------------------- |
| `CLAWQL_MEMORY_INDEX_PAGE=0` | on      | Disables `_INDEX_*` **and** OKF `index.md`      |
| `CLAWQL_MEMORY_OKF_INDEX=0`  | on      | Disables only OKF `index.md` (keeps `_INDEX_*`) |
| `CLAWQL_MEMORY_OKF_LOG=0`    | on      | Disables `log.md` append                        |

## Backward compatibility

- Notes without `type` still recall normally (frontmatter stripped for search).
- Digest and tooling prefer OKF `timestamp`, then `clawql_ingest_created`, then `date`.
- `_INDEX_{Provider}.md` remains for [#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38); `index.md` is the OKF-native catalog.
- Custom extensions (`.cqk`, etc.) are **optional promotions** after OKF — see [ADR 0010](../adr/0010-cq-file-extensions.md). Vault stays `.md` by default.

## Code

- `packages/clawql-memory/src/okf/` — types, frontmatter, log
- `packages/clawql-memory/src/ingest/ingest.ts` — writer
- `packages/clawql-memory/src/vault/provider-index.ts` — index pages

## See also

- [memory-obsidian.md](./memory-obsidian.md)
- [okf-decision-rationale.md](./okf-decision-rationale.md) — `type: decision` body template
- [mcp-tools.md](../mcp/mcp-tools.md) § `memory_ingest`
- [ADR 0010 — `.cq*` extensions](../adr/0010-cq-file-extensions.md)
- [`.cqk` draft spec](../specs/cq-extensions/cqk.md)
