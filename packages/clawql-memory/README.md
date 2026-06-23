# clawql-memory

Vault memory extracted from `clawql-mcp` (modularization phases 4–7, PRs [#423](https://github.com/danielsmithdevelopment/ClawQL/pull/423)–[#428](https://github.com/danielsmithdevelopment/ClawQL/pull/428)): vault I/O, `memory.db`, embeddings, ingest/recall, enterprise citations, chunking, artifact cache.

Prefer subpath imports (`clawql-memory/vault/config`, `clawql-memory/ingest/...`, `clawql-memory/recall/...`) at server startup to avoid loading the full barrel. MCP wrappers (`logMcpToolShape`) remain in `src/tools.ts`.

Ground truth: [`docs/design/modularization-implementation-status.md`](../../docs/design/modularization-implementation-status.md).
