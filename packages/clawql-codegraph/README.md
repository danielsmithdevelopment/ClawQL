# clawql-codegraph

Structural code knowledge graph for ClawQL Memory — complementary to vault wikilinks and semantic recall.

## Why

ClawQL Memory excels at narrative knowledge (Obsidian vault, wikilinks, embeddings). **Codegraph** fills the gap Graphify addresses: precise **structural** relationships (imports, calls, containment) extracted locally from source without vector embeddings.

## MCP tools (via `clawql-memory` when `CLAWQL_ENABLE_CODEGRAPH=1`)

| Tool | Purpose |
|------|---------|
| `codegraph_index` | Build or refresh a repo graph (TS/JS/Python/Go via tree-sitter WASM) |
| `codegraph_import_graphify` | Import Graphify `graph.json` into ClawQL storage |
| `codegraph_query` | Find symbols by name or concept |
| `codegraph_neighbors` | List inbound/outbound edges for a node |
| `codegraph_path` | Shortest path between two symbols |
| `codegraph_explain` | Summarize a symbol and its connections |
| `codegraph_subgraph` | BFS subgraph around a seed query |

## Configuration

| Env | Purpose |
|-----|---------|
| `CLAWQL_ENABLE_CODEGRAPH=1` | Register tools (default **off**) |
| `CLAWQL_CODEGRAPH_ROOT` | Default repo root for `codegraph_index` |
| `CLAWQL_CODEGRAPH_PATH` | Base directory for `codegraph.db.json` |
| `CLAWQL_CODEGRAPH_BACKEND` | `native` (default) or `graphify` |
| `CLAWQL_CODEGRAPH_GRAPHIFY_JSON` | Path to Graphify `graph.json` when using graphify backend |
| `CLAWQL_CODEGRAPH_GRAPHIFY_MCP_URL` | Optional HTTP MCP delegate for live Graphify queries |
| `CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1` | Merge code graph hits into `memory_recall` |

## Graphify integration

1. **Import:** `codegraph_import_graphify` with `jsonPath` → stored in `codegraph.db.json`
2. **Backend:** `CLAWQL_CODEGRAPH_BACKEND=graphify` + `CLAWQL_CODEGRAPH_GRAPHIFY_JSON=...`
3. **Live delegate:** Point `CLAWQL_CODEGRAPH_GRAPHIFY_MCP_URL` at Graphify's HTTP MCP server

## Hybrid recall

With `CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1`, `memory_recall` returns vault hits plus `codeGraphHits` (structural symbol matches) in one response.
