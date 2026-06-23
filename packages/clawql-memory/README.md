# clawql-memory

Vault memory primitives extracted from `clawql-mcp` (modularization order 4, #307): chunking, artifact cache, ingest file IO, vault config/utils/slug index, and title slug helpers. Prefer subpath imports (`clawql-memory/vault/config`, etc.) at server startup to avoid loading the full barrel.

Phase 2 scaffold: chunking, artifact cache, ingest-file helpers, vault markdown utils.
