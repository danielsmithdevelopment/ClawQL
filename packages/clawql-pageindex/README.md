# clawql-pageindex

Standalone MIT package — **no** `@clawql/*` dependencies. Vectorless hierarchical indexing from Markdown headings.

## API

- `buildPageIndexFromMarkdown(docId, markdown)`
- `traversePageIndex(doc, query)`
- `synthesizePageIndex(doc, query, { tokenBudget })`
- `FilePageIndexStorage` — JSON file persistence (`pageindex.db.json`)

MCP handler helpers: `clawql-pageindex/mcp` (`pageindexBuildTree`, `pageindexTraverse`, `pageindexSynthesize`, `pageindexGetContent`).
