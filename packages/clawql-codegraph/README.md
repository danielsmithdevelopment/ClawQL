# clawql-codegraph

Structural code knowledge graph for ClawQL Memory — complementary to vault wikilinks and semantic recall.

## Why

ClawQL Memory excels at narrative knowledge (Obsidian vault, wikilinks, embeddings). **Codegraph** fills the gap Graphify addresses: precise **structural** relationships (imports, calls, containment) extracted locally from TypeScript/JavaScript sources without vector embeddings.

## MCP tools (via `clawql-memory` when `CLAWQL_ENABLE_CODEGRAPH=1`)

| Tool | Purpose |
|------|---------|
| `codegraph_index` | Build or refresh a repo graph |
| `codegraph_query` | Find symbols by name or concept |
| `codegraph_neighbors` | List inbound/outbound edges for a node |
| `codegraph_path` | Shortest path between two symbols |
| `codegraph_explain` | Summarize a symbol and its connections |
| `codegraph_subgraph` | BFS subgraph around a seed query |

## Configuration

- `CLAWQL_ENABLE_CODEGRAPH=1` — register tools (default **off**)
- `CLAWQL_CODEGRAPH_PATH` — base directory for `codegraph.db.json`
- `CLAWQL_CODEGRAPH_ROOT` — default repo root when indexing
- `CLAWQL_CODEGRAPH_MAX_FILES` — cap indexed files (default 5000)

## Relationship to Graphify

This package implements the same **query-graph-first** workflow in TypeScript/Effect for the ClawQL gateway. It can be extended to import Graphify `graph.json` exports or delegate to the Graphify MCP server when configured.
