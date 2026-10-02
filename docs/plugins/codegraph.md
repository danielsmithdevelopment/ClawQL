---
title: Code graph (structural)
description: Removed in 8.0.0. Structural code indexing via codegraph_* MCP tools was purged after a tie_purge Track B retest.
slug: codegraph
status: removed
package: clawql-codegraph
order: 3.5
prev: memory
next: documents
---

# Code graph (structural) — removed in 8.0.0

**CodeGraph (`codegraph_*`, Graphify import/sync, `clawql-codegraph`) was removed in ClawQL 8.0.0.**

Track B (the strong-model agent-loop retest pairing grep vs grep+codegraph on grep-insoluble
real-repo questions) closed at **Net=0 beat vs working grep → `tie_purge`**. CodeGraph never
cleared the bar as a default-bundle tool, so the 11 `codegraph_*` MCP tools,
`CLAWQL_ENABLE_CODEGRAPH`, hybrid `memory_recall` codegraph source, and the
`clawql-codegraph` package were all removed.

**Migrating:** see [`migrate-to-8.0.md`](../getting-started/migrate-to-8.0.md) and the
[8.0.0 purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md).

**Conditions for revisiting** (large-monorepo niche, local-model Track B, the `code_change`
vault flywheel that is not replaced): see
[`post-8.0-codegraph-revisit.md`](../backlog/post-8.0-codegraph-revisit.md).

Related: [Memory (vault) plugin](memory.md).
