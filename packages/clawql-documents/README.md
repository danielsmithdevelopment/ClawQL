# clawql-documents

Document ingest pipeline extracted from `clawql-mcp` (modularization order 5): bulk Markdown import and optional URL fetch into the Obsidian vault via `ingest_external_knowledge`. Prefer subpath imports (`clawql-documents/ingest/external-ingest`) at server startup to avoid loading the full barrel.

Phase 8 scaffold: `external-ingest` + URL response formatting. Provider registry remains in `clawql-api`; bundled specs stay under repo `providers/`.
