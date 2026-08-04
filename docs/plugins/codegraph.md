---
title: Code graph (structural)
description: Structural code indexing via codegraph_* MCP tools. Opt-in with CLAWQL_ENABLE_CODEGRAPH=1.
slug: codegraph
status: opt-in
package: clawql-codegraph
order: 3.5
prev: memory
next: documents
---

# Code graph (structural)

**Package:** `packages/clawql-codegraph` (MIT) — registered by **`MemoryPlugin`** when **`CLAWQL_ENABLE_CODEGRAPH=1`**

Complements ClawQL vault memory (wikilinks + semantic recall) with **precise structural relationships**. Fully TypeScript-native: **TS/JS via the compiler API** (deepest fidelity) plus **30+ languages via tree-sitter WASM** (Python, Go, Rust, Java, C/C++, C#, Ruby, Kotlin, Scala, PHP, Swift, Lua, Zig, Elixir, ObjC, Bash, Dart, Solidity, …). Louvain clustering via graphology. For TypeScript, ClawQL aims to be the strongest option (enclosing-scope calls, heritage, cross-file linking, React/Next tags, `codegraph_explore` / `codegraph_impact`). Optional Graphify `graph.json` import — **no Python runtime**.

## Why add this?

| Layer               | ClawQL today                          | Code graph                      |
| ------------------- | ------------------------------------- | ------------------------------- |
| Narrative knowledge | Obsidian vault, wikilinks, embeddings | —                               |
| Document hierarchy  | PageIndex (heading trees)             | —                               |
| **Code structure**  | Text chunks + manual wikilinks        | AST-derived imports/calls/paths |

Use **`memory_recall`** for decisions and cross-session narrative context. Use **`codegraph_*`** before grepping or re-reading dozens of files for architecture tracing. Non-code docs/PDFs stay in the vault / PageIndex / document pipeline — not in this graph.

## MCP tools

| Tool                            | Purpose                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| **`codegraph_sync`**            | **Preferred:** native index → Louvain communities → `GRAPH_REPORT.md` / `graph.html` → vault ingest |
| **`codegraph_explore`**         | **One-shot agent context:** explain + neighbors + blast radius + local subgraph                     |
| **`codegraph_impact`**          | Upstream blast radius (who depends on this symbol)                                                  |
| **`codegraph_index`**           | Native index (TS/JS compiler + 30+ tree-sitter languages)                                            |
| **`codegraph_sync_graphify`**   | Import an **existing** `graph.json` (or fall back to native sync). Never spawns Python.             |
| **`codegraph_import_graphify`** | Low-level import of Graphify / node-link `graph.json`                                               |
| **`codegraph_query`**           | Find symbols by name or concept                                                                     |
| **`codegraph_neighbors`**       | List edges for a node (`imports`, `calls`, `contains`, …)                                           |
| **`codegraph_path`**            | Shortest path between two symbols                                                                   |
| **`codegraph_explain`**         | Summarize a symbol and its connections                                                              |
| **`codegraph_subgraph`**        | BFS subgraph around a seed query                                                                    |

Edges are labeled **`EXTRACTED`**, **`INFERRED`**, or **`AMBIGUOUS`**. Nodes may carry a Louvain **`community`** id after sync.

## Enable

| Env                                           | Default         | Effect                                                    |
| --------------------------------------------- | --------------- | --------------------------------------------------------- |
| **`CLAWQL_ENABLE_CODEGRAPH=1`**               | off             | Register `codegraph_*` tools via memory tier              |
| **`CLAWQL_CODEGRAPH_ROOT`**                   | cwd             | Default repo root for index / sync                        |
| **`CLAWQL_CODEGRAPH_PATH`**                   | `./data`        | Base path for `codegraph.db.json`                         |
| **`CLAWQL_CODEGRAPH_OUT_DIR`**                | `codegraph-out` | Artifact directory for `codegraph_sync`                   |
| **`CLAWQL_CODEGRAPH_BACKEND`**                | `native`        | Set `graphify` only when loading an external `graph.json` |
| **`CLAWQL_CODEGRAPH_GRAPHIFY_JSON`**          | —               | Optional path to an external Graphify export              |
| **`CLAWQL_CODEGRAPH_GRAPHIFY_MCP_URL`**       | —               | Optional HTTP MCP delegate for live queries               |
| **`CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1`** | off             | Merge code graph hits into `memory_recall`                |

Requires **`CLAWQL_ENABLE_MEMORY`**.

## Languages

| Path | Languages | Notes |
| --- | --- | --- |
| **TypeScript compiler API** | `.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs` | Deepest: enclosing calls, heritage, exports, React/Next tags, cross-file link |
| **tree-sitter WASM** | Python, Go, Rust, Java, C/C++, C#, Ruby, Kotlin, Scala, PHP, Swift, Lua, Zig, Elixir, Objective-C, Bash, Dart, Solidity, OCaml, Elm, ReScript, QL, Emacs Lisp, Vue, JSON/YAML/TOML/HTML/CSS, … | Structural symbols + imports + calls; grammars from `tree-sitter-wasms` |

Not yet (no WASM in-tree / need dedicated extractors): Fortran, Verilog, PowerShell, Julia, Terraform/HCL, SQL schemas, Markdown semantic edges — use vault/PageIndex/Docling for docs, or import a Graphify `graph.json` if you already produce one.

## TypeScript / JavaScript depth

ClawQL’s TS pipeline is designed so agents should not need a separate Graphify/CodeGraph install for TypeScript repos:

| Capability     | Behavior                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Symbols        | Functions, methods, classes, interfaces, types, arrow/`const` functions, constructors           |
| Calls          | Attached to **enclosing** function/method (not file-only); `foo()`, `obj.method()`, `new Foo()` |
| Heritage       | `extends` / `implements` edges                                                                  |
| Modules        | Relative imports resolved to file nodes; unique exported callees linked cross-file (`INFERRED`) |
| Framework tags | `react-component`, `next-app-router`, `next-app-dir`, `exported`, `default-export`              |
| Agent UX       | Prefer **`codegraph_explore`** over multi-hop query→neighbors→path                              |

## Preferred workflow: `codegraph_sync`

Pure TypeScript — no Graphify CLI / pip install:

1. **Native index** (TS/JS compiler API + tree-sitter for Python/Go)
2. **Louvain clustering** (graphology) — community ids on nodes
3. Write **`codegraph-out/graph.json`**, **`GRAPH_REPORT.md`**, **`graph.html`**
4. **Auto-ingest** the report via `memory_ingest` with append + stable title  
   `Codegraph Architecture Report — {repo} ({date})`  
   Wikilinks: `[[Codebase Architecture]]`, `[[{repo}]]`, `[[Codegraph Sync History]]`, plus named communities when present
5. Day-to-day queries use `codegraph_*` / hybrid `memory_recall`

`graph.html` stays on disk for human review.

## Optional external Graphify import

If you already produce a Graphify `graph.json` elsewhere:

1. Point `CLAWQL_CODEGRAPH_GRAPHIFY_JSON` or pass `outDir` / `jsonPath`
2. Call **`codegraph_import_graphify`** or **`codegraph_sync_graphify`** (import-only; no Python spawn)

## Hybrid recall

When **`CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1`**, `memory_recall` returns vault Markdown hits **and** a `codeGraphHits` array. Pass `includeCodeGraph: true` on a single call to force hybrid mode when the env flag is off.

## Typical workflow

1. **`codegraph_sync`** after major structural changes
2. **`codegraph_path`** / **`codegraph_query`** instead of repeated file reads
3. **`memory_recall`** with hybrid enabled for narrative + structural context
4. Open `codegraph-out/graph.html` locally for the interactive view
