# `.cqk` — ClawQL Knowledge (draft)

**Extension:** `.cqk`  
**Media type (proposed):** `text/vnd.clawql.knowledge+markdown`  
**Status:** Draft v0.1 · [ADR 0010](../../adr/0010-cq-file-extensions.md) · Base: [OKF v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) · [memory/okf.md](../../memory/okf.md)

## Purpose

OKF-compatible knowledge entries that are **ClawQL-produced** and carry provenance / audit linkage. Generic OKF `.md` remains valid for notes that do not need ClawQL-owned tooling.

## Serialization

Markdown with YAML frontmatter (OKF). File path = concept identity.

## Required frontmatter

| Field        | Notes                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| `type`       | OKF required — ClawQL taxonomy (`decision`, `context`, `task_result`, …) |
| `clawql_okf` | `true`                                                                   |
| `worm_ref`   | WORM entry hash or `null` when not yet sealed                            |

## Recommended frontmatter

| Field                                                   | Notes                                         |
| ------------------------------------------------------- | --------------------------------------------- |
| `title`, `description`, `resource`, `tags`, `timestamp` | OKF recommended                               |
| `correlation_id`                                        | Session / request correlation                 |
| `agent_id`                                              | Producing agent                               |
| `verdict`                                               | Optional eval / quality                       |
| `entity_refs`                                           | List of Ontology entity names or instance ids |

## Distinguishing `.cqk` vs `.md` vs `.cqe`

| File        | Role                                                                     |
| ----------- | ------------------------------------------------------------------------ |
| `.md` (OKF) | Portable knowledge; ClawQL can read/write                                |
| `.cqk`      | Same + **required** provenance fields; Onyx/doctor treat as ClawQL-owned |
| `.cqe`      | **Schema** definition (entity type), not an instance note                |

## Tooling hooks

- `memory_ingest` — may write `.cqk` when `wormRef` / provenance requested (future flag); today writes OKF `.md`
- `memory_recall` / Onyx — optional boost or filter on `.cqk`
- `clawql doctor` — verify `worm_ref` resolves when present

## Non-goals

- Replacing Obsidian / OKF interoperability
- Forcing all vault notes to `.cqk`

## Example

```markdown
---
type: decision
title: Adopt OKF then .cq* extensions
description: Sequence OKF before custom extensions
tags: [architecture, okf]
timestamp: 2026-07-20T00:00:00Z
correlation_id: adr-0010
worm_ref: null
clawql_okf: true
---

# Adopt OKF then .cq* extensions

Body…
```
