# clawql-memory

Vault memory extracted from `clawql-mcp` (modularization phases 4–7, PRs [#423](https://github.com/danielsmithdevelopment/ClawQL/pull/423)–[#428](https://github.com/danielsmithdevelopment/ClawQL/pull/428)): vault I/O, `memory.db`, embeddings, ingest/recall, enterprise citations, chunking, artifact cache.

Prefer subpath imports (`clawql-memory/vault/config`, `clawql-memory/ingest/...`, `clawql-memory/recall/...`, `clawql-memory/erase/erase`, `clawql-memory/crypto/shred`) at server startup to avoid loading the full barrel. MCP wrappers (`logMcpToolShape`) remain in `src/mcp/tools.ts`.

**Erasure / crypto-shredding:** git-native vaults encrypt Memory notes with per-note AES keys (`.clawql/note-keys/`). Erase destroys the key so git/R2 history stays ciphertext-only; WORM uses opaque `pathId`; erased content hashes feed the inference export deny-list. Docs: [`docs/memory/memory-obsidian.md`](../../docs/memory/memory-obsidian.md#erasure-crypto-shredding) · [`docs/specs/inference/gateway-ladder-v0.1.md`](../../docs/specs/inference/gateway-ladder-v0.1.md#erasure).

Ground truth: [`docs/design/modularization-implementation-status.md`](../../docs/design/modularization-implementation-status.md).
