# Post-8.0 backlog: CodeGraph / Graphify revisit

**Status:** parked. `codegraph_*` (11 tools), `CLAWQL_ENABLE_CODEGRAPH`, Graphify import/sync,
and the `clawql-codegraph` package were purged in 8.0.0 — see
[`8.0.0-purge-inventory-spec-v0.1.md`](../releases/8.0.0-purge-inventory-spec-v0.1.md) and
[`migrate-to-8.0.md`](../getting-started/migrate-to-8.0.md).

## Why it was purged

Track B (the only lever still open for `codegraph_*`) ran a strong-model agent-loop
retest pairing **A-grep** against **A-grep + codegraph_\*** on grep-insoluble real-repo
questions ([`agent-loop-freeze.md`](../../benchmarks/pageindex-ab/design/agent-loop-freeze.md)).
After fixing a broken A-grep baseline from the prior void run, the retest closed at
**Net=0** beat vs the working grep baseline — `tie_purge`. CodeGraph's additive value over
default `grep` + `read_around` never cleared the bar on this cohort.

## Conditions for revisiting

Do not re-propose CodeGraph as a default-bundle tool without new evidence against one of
these two angles. A tie on the current cohort is not evidence that the tool is useless in
general — it's evidence it doesn't beat grep **on this repo at this scale, with this model**.

### 1. Large-monorepo niche (grep floods context)

The Track B cohort ran against ClawQL's own monorepo, which is small enough that `grep`
output rarely exceeds a tool-call context budget. CodeGraph's structural index (symbol →
callers / impact / cross-file edges) is plausibly more valuable once `grep` results flood
the context window on a genuinely large codebase (hundreds of thousands of files, deep
cross-package call graphs). This needs a **fresh test** on a large external monorepo
corpus — not a re-run of the existing 18-question cohort — before any revival discussion.

### 2. Optional local-model Track B before opt-in revival

The retest used a frontier model (Claude Sonnet) for both arms. A cheaper local model
(Qwen 27B-class or similar) may show a different beat/tie pattern — either because a
weaker model benefits more from structured navigation than a strong model that reasons
well over raw grep output, or because tool-call budgets matter more at that model tier.
If CodeGraph is ever reconsidered, it should ship as a **consolidated, opt-in tool**
(not re-split into 11 separate `codegraph_*` registrations) and only after a local-model
Track B pass clears the same beat bar used here.

### 3. `code_change` vault flywheel (not replaced)

`codegraph_impact` fed a `code_change` vault-note flywheel (#808): when an agent ran
`codegraph_impact` on a changed symbol, the result could auto-ingest a `code_change` vault
note recording blast radius for that commit/diff. This flywheel was **removed with the
`codegraph_impact` tool** in this purge and is **not replaced** by anything else in the
current stack. If a future revival wants this capability, it needs a design that doesn't
depend on `codegraph_impact` specifically — e.g. deriving blast radius from commit diffs
directly (via `git diff` + `grep`/AST on changed files) rather than a persistent code graph.

## What was removed (for reference)

- 11 MCP tools: `codegraph_index`, `codegraph_query`, `codegraph_neighbors`, `codegraph_path`,
  `codegraph_explain`, `codegraph_subgraph`, `codegraph_explore`, `codegraph_impact`,
  `codegraph_import_graphify`, `codegraph_sync`, `codegraph_sync_graphify`.
- `CLAWQL_ENABLE_CODEGRAPH` and related `CLAWQL_CODEGRAPH_*` / Graphify env vars.
- `memory_recall` `codegraph` source, `includeCodeGraph`, `codeGraphId`, hybrid
  `CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH`.
- The `clawql-codegraph` package (native tree-sitter indexer + Graphify import/sync +
  blast-radius / community-detection analysis).
- The `code_change` vault-note flywheel built on `codegraph_impact` (#808).

## What was kept (historical eval evidence — do not delete)

- `benchmarks/pageindex-ab/` Track B design docs and decision artifacts
  (`agent-loop-freeze.md`, `codegraph-beat-decision.json`, `codegraph-prove-keys.oracle.json`,
  `codegraph-no-harm-keys.json`).
- `openbench` `codegraph-*` task definitions (`codegraph-feature-api-surface`,
  `codegraph-impact-edit`, `codegraph-guided-edit`) — these now exercise a no-op
  `CLAWQL_ENABLE_CODEGRAPH=1` (ignored post-purge) and are kept only as historical eval
  scaffolding, not as passing checks.
- `benchmarks/pageindex-ab/scripts/agent_loop_tools.mjs` keeps the `codegraph_*` tool
  definitions and arm wiring for Track B replay/archive; the live `ensureCodeGraph` /
  `codegraph_*` runtime path now throws/returns a clear "purged" error instead of
  importing the deleted package.
