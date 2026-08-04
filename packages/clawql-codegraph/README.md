# clawql-codegraph

Structural code knowledge graph for ClawQL Memory — complementary to vault wikilinks and semantic recall.

**Fully TypeScript-native.** No Python runtime, no Graphify CLI spawn. Index → Louvain communities → report artifacts → optional vault ingest.

## Why

ClawQL Memory excels at narrative knowledge (Obsidian vault, wikilinks, embeddings). **Codegraph** fills the structural gap: precise **imports / calls / containment / heritage** extracted locally from source without vector embeddings.

| Layer                | ClawQL                  | Codegraph         |
| -------------------- | ----------------------- | ----------------- |
| Narrative            | vault + `memory_recall` | —                 |
| Docs / PDFs          | PageIndex / Docling     | —                 |
| **Source structure** | text chunks             | AST-derived graph |

For **TypeScript/JavaScript**, ClawQL aims to be the strongest option (compiler API depth + agent UX). For other languages, tree-sitter WASM covers **30+** grammars from `tree-sitter-wasms`.

## Enable

Requires memory tier on (`CLAWQL_ENABLE_MEMORY` not `0`).

| Env                                       | Default         | Effect                                                    |
| ----------------------------------------- | --------------- | --------------------------------------------------------- |
| `CLAWQL_ENABLE_CODEGRAPH=1`               | off             | Register `codegraph_*` via `MemoryPlugin`                 |
| `CLAWQL_CODEGRAPH_ROOT`                   | cwd             | Default repo root for index / sync                        |
| `CLAWQL_CODEGRAPH_PATH`                   | `./data`        | Base path for `codegraph.db.json`                         |
| `CLAWQL_CODEGRAPH_OUT_DIR`                | `codegraph-out` | Artifact dir for `codegraph_sync`                         |
| `CLAWQL_CODEGRAPH_BACKEND`                | `native`        | Set `graphify` only when loading an external `graph.json` |
| `CLAWQL_CODEGRAPH_GRAPHIFY_JSON`          | —               | Path to an existing Graphify / node-link export           |
| `CLAWQL_CODEGRAPH_GRAPHIFY_MCP_URL`       | —               | Optional HTTP MCP delegate for live queries               |
| `CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1` | off             | Merge code graph hits into `memory_recall`                |

Artifact dirs `codegraph-out/` and `graphify-out/` are gitignored.

## MCP tools

Registered by **`MemoryPlugin`** when `CLAWQL_ENABLE_CODEGRAPH=1`.

| Tool                            | Purpose                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **`codegraph_sync`**            | **Preferred:** native index → Louvain → `GRAPH_REPORT.md` / `graph.html` / `graph.json` → vault ingest |
| **`codegraph_explore`**         | **One-shot agent context:** explain + neighbors + blast radius + local subgraph                        |
| **`codegraph_impact`**          | Upstream blast radius (who depends on this symbol)                                                     |
| **`codegraph_index`**           | Native index only (TS/JS compiler + 30+ tree-sitter languages)                                         |
| **`codegraph_sync_graphify`**   | Import an **existing** `graph.json`, or fall back to native sync. **Never spawns Python.**             |
| **`codegraph_import_graphify`** | Low-level import of Graphify / node-link `graph.json`                                                  |
| **`codegraph_query`**           | Find symbols by name or concept                                                                        |
| **`codegraph_neighbors`**       | List edges (`imports`, `calls`, `contains`, …)                                                         |
| **`codegraph_path`**            | Shortest path between two symbols                                                                      |
| **`codegraph_explain`**         | Summarize a symbol and its connections                                                                 |
| **`codegraph_subgraph`**        | BFS subgraph around a seed query                                                                       |

Edges are labeled **`EXTRACTED`**, **`INFERRED`**, or **`AMBIGUOUS`**. After sync, nodes may carry a Louvain **`community`** id.

## Preferred workflow: `codegraph_sync`

1. **Native index** — TypeScript compiler API for `.ts`/`.tsx`/`.js`/…; tree-sitter for everything else
2. **Louvain clustering** — `graphology` + `graphology-communities-louvain`
3. Write **`codegraph-out/graph.json`**, **`GRAPH_REPORT.md`**, **`graph.html`**
4. **Auto-ingest** the report via `memory_ingest` with append + stable title  
   `Codegraph Architecture Report — {repo} ({date})`  
   Wikilinks: `[[Codebase Architecture]]`, `[[{repo}]]`, `[[Codegraph Sync History]]`, plus named communities when present
5. Day-to-day: prefer **`codegraph_explore`** / **`codegraph_impact`**; open `graph.html` for humans

```text
codegraph_sync({ root?: string, outDir?: string, ingest?: boolean })
codegraph_explore({ query: string, depth?: number })
codegraph_impact({ query: string })
```

## TypeScript / JavaScript depth

TS/JS use the **TypeScript compiler API** (not tree-sitter) for highest fidelity:

| Capability     | Behavior                                                                              |
| -------------- | ------------------------------------------------------------------------------------- |
| Symbols        | Functions, methods, classes, interfaces, types, arrow/`const` functions, constructors |
| Calls          | Attached to **enclosing** function/method; `foo()`, `obj.method()`, `new Foo()`       |
| Heritage       | `extends` / `implements` edges                                                        |
| Modules        | Relative imports → file nodes; unique exported callees linked cross-file (`INFERRED`) |
| Framework tags | `react-component`, `next-app-router`, `next-app-dir`, `exported`, `default-export`    |
| Ranking        | Query prefers exports / functions over import-bindings                                |

Agents should use **`codegraph_explore`** instead of multi-hop `query` → `neighbors` → `path`.

## Languages (tree-sitter)

Structural symbols + imports + calls via declarative profiles over `tree-sitter-wasms`. JS/TS grammars exist as fallback; the compiler path is preferred when available.

| Language                 | Extensions                                            |
| ------------------------ | ----------------------------------------------------- |
| Python                   | `.py` `.pyi`                                          |
| Go                       | `.go`                                                 |
| Rust                     | `.rs`                                                 |
| Java                     | `.java`                                               |
| C                        | `.c` `.h`                                             |
| C++                      | `.cc` `.cpp` `.cxx` `.hpp` `.hh` `.hxx`               |
| C#                       | `.cs`                                                 |
| Ruby                     | `.rb` `.rake`                                         |
| Kotlin                   | `.kt` `.kts`                                          |
| Scala                    | `.scala` `.sc`                                        |
| PHP                      | `.php`                                                |
| Swift                    | `.swift`                                              |
| Lua                      | `.lua`                                                |
| Zig                      | `.zig`                                                |
| Elixir                   | `.ex` `.exs`                                          |
| Objective-C              | `.m` `.mm`                                            |
| Bash                     | `.sh` `.bash` `.zsh`                                  |
| Dart                     | `.dart`                                               |
| Solidity                 | `.sol`                                                |
| OCaml                    | `.ml` `.mli`                                          |
| Elm                      | `.elm`                                                |
| ReScript                 | `.res` `.resi`                                        |
| QL                       | `.ql` `.qll`                                          |
| Emacs Lisp               | `.el`                                                 |
| Vue                      | `.vue`                                                |
| JSON / YAML / TOML       | `.json` `.yml` `.yaml` `.toml`                        |
| HTML / CSS               | `.html` `.htm` `.css`                                 |
| JS / TS / TSX (fallback) | `.js` `.mjs` `.cjs` `.ts` `.mts` `.cts` `.tsx` `.jsx` |

**Not yet** (no in-tree WASM / dedicated extractor): Fortran, Verilog, PowerShell, Julia, Terraform/HCL, SQL schemas. Multimodal docs stay in vault / PageIndex / Docling. If you already produce a Graphify `graph.json` elsewhere, import it — ClawQL will not spawn Python to generate one.

## Optional Graphify import

`codegraph_sync_graphify` and `codegraph_import_graphify` only **load** an existing `graph.json`. Passing `graphifyCmd` throws. If no artifact is found, sync falls back to the native pipeline.

## Hybrid recall

With `CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1`, `memory_recall` returns vault Markdown hits **and** a `codeGraphHits` array. Pass `includeCodeGraph: true` (or `sources` including `codegraph`) on a single call when the env flag is off.

## Dogfood tests

```bash
# Scoped (default CI): clawql-codegraph + clawql-memory
npm run test:dogfood -w clawql-codegraph

# Full monorepo (local)
CLAWQL_CODEGRAPH_DOGFOOD_FULL=1 npm run test:dogfood -w clawql-codegraph
```

| File                                                | Role                                      |
| --------------------------------------------------- | ----------------------------------------- |
| `src/test-utils/clawql-repo-root.ts`                | Resolve monorepo root from any `cwd`      |
| `src/test-utils/dogfood-graph.ts`                   | Merge multi-package indexes; temp storage |
| `src/dogfood/codegraph-dogfood.integration.test.ts` | Index + query + MCP round-trip            |

Unit tests (`src/**/*.test.ts`) stay fast with fixtures. Dogfood uses `*.integration.test.ts` with a 120s timeout.

## Package layout

| Path                                 | Role                                          |
| ------------------------------------ | --------------------------------------------- |
| `src/sync/codegraph-sync.ts`         | Native sync orchestration                     |
| `src/sync/graphify-sync.ts`          | Import-only Graphify path                     |
| `src/analyze/`                       | Louvain cluster, markdown report, HTML export |
| `src/indexer/extract-typescript.ts`  | Compiler API extraction                       |
| `src/indexer/link-typescript.ts`     | Cross-file linking                            |
| `src/indexer/extract-tree-sitter.ts` | Multi-language profiles                       |
| `src/graph/explore.ts`               | `explore` / `impact`                          |
| `src/mcp/handlers.ts`                | MCP tool handlers                             |

## Docs

- Plugin guide: [`docs/plugins/codegraph.md`](../../docs/plugins/codegraph.md)
- MCP tool table: [`docs/mcp/mcp-tools.md`](../../docs/mcp/mcp-tools.md)
- Memory learn page: website `learn/memory`
