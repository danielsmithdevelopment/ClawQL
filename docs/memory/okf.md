# OKF memory vault serialization (v0.2)

ClawQL stores vault memory as [Open Knowledge Format (OKF) v0.2](https://okf.io)–compatible Markdown: YAML frontmatter + body. Obsidian remains the human UI.

**Decision:** [ADR 0009](../adr/0009-enterprise-ontology.md) · [Enterprise Ontology](../architecture/enterprise-ontology.md) · Convergence context: [PragmaticVectors — Convergence Week](https://pragmaticvectors.com/posts/convergence-week/)

## What ships

| Surface               | Behavior                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| **`memory_ingest`**   | Writes OKF v0.2 frontmatter (`type` required; defaults to `context`) plus trust signals + ClawQL extensions |
| **`Memory/index.md`** | OKF catalog (alongside legacy `_INDEX_{Provider}.md`)                                                       |
| **`Memory/log.md`**   | Append-only OKF changelog of successful ingests                                                             |
| **Append upgrade**    | Legacy notes missing `type` / v0.2 fields are upgraded on append                                            |
| **Recall**            | Excludes `status: retracted`; down-weights `stale` / past `stale_after`                                     |
| **Lint**              | `lintOkfMarkdown` / `lintOkfFrontmatter` validate status, stale_after, verified.\*                          |

## Frontmatter contract (OKF v0.2)

```yaml
---
type: "decision" # OKF required (ClawQL taxonomy)
title: "Authentication: JWT over sessions"
description: "JWT chosen for stateless auth" # OKF recommended
resource: null # OKF recommended URI when applicable
tags: ["clawql-ingest", "okf", "auth"]
timestamp: "2026-07-28T14:32:00.000Z"

# OKF v0.2 trust signals
generated:
  by: "agent-daniel-dev-01"
  at: "2026-07-28T14:32:00.000Z"
  tool: "memory_ingest"
  model: "anthropic/claude-sonnet-4"
  session: "sess-8821"
verified:
  by: "human" # human | evaluator | agent
  at: "2026-07-28T15:10:00.000Z"
  method: "pr-review" # pr-review | evaluator | auto
  reviewer: "ops@example.com"
sources:
  - session_id: "sess-8821"
    turn: "14"
stale_after: "2026-10-28T00:00:00.000Z"
status: "current" # current | stale | superseded | retracted
superseded_by: null

# ClawQL extensions (alongside OKF, not replacing it)
correlation_id: "sess-8821-tool-047"
worm_ref: "sha256:…"
agent_id: "agent-daniel-dev-01"
verdict: "passed"
confidence_score: 0.94

date: 2026-07-28T14:32:00.000Z # legacy Obsidian alias (= timestamp)
clawql_ingest: true
clawql_ingest_created: "…"
clawql_okf: true
okf_version: "0.2"
---
```

### Trust signals (v0.2)

| Field           | Role                                                              |
| --------------- | ----------------------------------------------------------------- |
| `generated`     | Who/what wrote the entry (agent, tool, model, session, timestamp) |
| `verified`      | Human / evaluator / agent confirmation                            |
| `sources`       | URLs or session turns that grounded the entry                     |
| `stale_after`   | Soft expiry — lint warns when past and status still `current`     |
| `status`        | Lifecycle: `current` · `stale` · `superseded` · `retracted`       |
| `superseded_by` | Path of the replacement entry                                     |

### ClawQL `type` taxonomy

`decision`, `context`, `error`, `runbook`, `entity`, `relationship`, `task_result`, `ontology_entity`, `ontology_relationship`, `ontology_action`, `index`, `log`, `digest`

OKF does not register types centrally — consumers must tolerate unknown values.

For **`type: decision`**, prefer the AIF-inspired body sections in [**OKF decision rationale**](./okf-decision-rationale.md).

### MCP input fields

| Field                         | Frontmatter                              |
| ----------------------------- | ---------------------------------------- |
| `type`                        | `type` (default `context`)               |
| `description`                 | `description` (else first insights line) |
| `resource`                    | `resource`                               |
| `tags`                        | `tags` (+ always `clawql-ingest`)        |
| `correlationId` / `sessionId` | `correlation_id` + `generated.session`   |
| `wormRef`                     | `worm_ref`                               |
| `agentId`                     | `agent_id` + `generated.by`              |
| `verdict`                     | `verdict`                                |
| `confidenceScore`             | `confidence_score`                       |
| `staleAfter`                  | `stale_after`                            |
| `status`                      | `status` (default `current`)             |
| `supersededBy`                | `superseded_by`                          |
| `model`                       | `generated.model`                        |
| `verified`                    | `verified`                               |
| `sources`                     | `sources`                                |

## Migration

Existing pre-v0.2 notes are upgraded non-destructively on append (`ensureOkfFrontmatter` / `migrateOkfFrontmatterToV02`):

- Adds `status: current` and `okf_version: "0.2"` when missing
- Adds a default `generated` block from available agent/session fields
- Does **not** rewrite Markdown body content

Bulk CLI:

```bash
clawql memory migrate --okf-version 0.2 [--vault DIR] [--dry-run]
clawql memory lint [--vault DIR] [--check-stale] [--open-prs]
clawql memory query --filter 'verified.by != human AND type == decision'
```

```ts
import { migrateOkfFrontmatterToV02, lintOkfMarkdown } from "clawql-memory/okf";

const next = migrateOkfFrontmatterToV02(markdown, title);
const issues = lintOkfMarkdown(next, { checkStale: true, requireWormRef: path.endsWith(".cqk") });
```

## Env knobs

| Env                                          | Default | Effect                                                                |
| -------------------------------------------- | ------- | --------------------------------------------------------------------- |
| `CLAWQL_MEMORY_INDEX_PAGE=0`                 | on      | Disables `_INDEX_*` **and** OKF `index.md`                            |
| `CLAWQL_MEMORY_OKF_INDEX=0`                  | on      | Disables only OKF `index.md` (keeps `_INDEX_*`)                       |
| `CLAWQL_MEMORY_OKF_LOG=0`                    | on      | Disables `log.md` append                                              |
| `CLAWQL_MEMORY_RECALL_INDEX_FIRST=0`         | on      | Disables index-first survey (`index.md` + `log.md` before bodies)     |
| `CLAWQL_MEMORY_RECALL_INDEX_FIRST_THRESHOLD` | `48`    | Above this file count, load bodies only for catalog/vector candidates |
| `CLAWQL_MEMORY_RECALL_MIN_SCORE`             | `0.05`  | Minimum keyword/IDF score to seed recall (fractional under IDF)       |
| `CLAWQL_MEMORY_BACKEND=git`                  | fs      | Git-native vault: commit after each successful `memory_ingest`        |
| `CLAWQL_MEMORY_GIT_COMMIT_ON`                | ingest* | `off` disables commits; `*` default when backend=git                  |
| `CLAWQL_MEMORY_GIT_PUSH_MODE`                | async†  | `async` \| `sync` \| `off` — †async when `GIT_REMOTE` set, else off   |
| `CLAWQL_MEMORY_GIT_REMOTE`                   | —       | Remote URL (adds `origin` on first `git init`)                        |

## Flywheel export filters (planned / next)

```bash
clawql inference export \
  --verdict passed \
  --okf-verified human \
  --okf-status current \
  --format portal-bundle \
  --output ./adapters/clawql-legal-v1/
```

See [PorTAL + Intelligence Flywheel](../inference/portal-flywheel.md).

## Backward compatibility

- Notes without `type` still recall normally (frontmatter stripped for search).
- Digest and tooling prefer OKF `timestamp`, then `clawql_ingest_created`, then `date`.
- `_INDEX_{Provider}.md` remains for [#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38); `index.md` is the OKF-native catalog.
- Custom extensions (`.cqk`, etc.) are **optional promotions** after OKF — see [ADR 0010](../adr/0010-cq-file-extensions.md).

## Code

- `packages/clawql-memory/src/okf/` — types, frontmatter, lint, log
- `packages/clawql-memory/src/ingest/ingest.ts` — writer
- `packages/clawql-memory/src/effect/memory-recall-effect.ts` — retracted/stale handling
- `packages/clawql-memory/src/vault/provider-index.ts` — index pages

## See also

- [memory-obsidian.md](./memory-obsidian.md)
- [okf-decision-rationale.md](./okf-decision-rationale.md)
- [mcp-tools.md](../mcp/mcp-tools.md) § `memory_ingest`
- [ADR 0010 — `.cq*` extensions](../adr/0010-cq-file-extensions.md)
- [`.cqk` draft spec](../specs/cq-extensions/cqk.md)
- [PorTAL flywheel intentions](../inference/portal-flywheel.md)
