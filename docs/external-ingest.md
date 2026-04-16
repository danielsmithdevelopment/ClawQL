# External bulk ingest (`ingest_external_knowledge`)

**Status:** MCP tool **contract** is live; implementation is a **stub** until provider plugins land ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)). Opt in with **`CLAWQL_EXTERNAL_INGEST=1`** to receive roadmap JSON (still **no network I/O**).

## Relationship to vault memory

- **`memory_ingest`** writes agent-curated Markdown under **`Memory/`** and refreshes **`memory.db`** + optional **`_INDEX_*.md`**.
- **`memory_recall`** scans **`CLAWQL_MEMORY_RECALL_SCAN_ROOT`** (default **`Memory/`**), scores keywords, walks **`[[wikilinks]]`**, and optionally runs vector KNN when **`CLAWQL_VECTOR_BACKEND`** is set.
- **Bulk external ingest** (future) would write normalized **`.md`** into the same subtree so **lexical + graph + optional vectors** apply without a parallel storage model.

## Security

- **Secrets** stay in environment or your secret manager (e.g. API tokens for Notion/Confluence/GitHub). ClawQL must **never** echo tokens in logs or MCP responses.
- **Scope** parameters (repo id, space key) should be validated before filesystem writes; paths must stay under the vault root (same rules as **`memory_ingest`** / `vault-utils`).

## Rate limits

- Remote APIs impose per-minute and burst limits; a real provider should use **bounded concurrency**, **retries with backoff**, and **dry-run** modes. The stub does not perform HTTP calls.

## Dedup and scale

- For large imports, approximate **membership / dedup** may use the **Cuckoo** track ([#25](https://github.com/danielsmithdevelopment/ClawQL/issues/25)) beside stable chunk ids in **`memory.db`**.
- **Chunking** follows the same **`paragraph_v1`** contract as **`memory_ingest`** / sync ([#27](https://github.com/danielsmithdevelopment/ClawQL/issues/27)).

## Related

- Epic: [#24](https://github.com/danielsmithdevelopment/ClawQL/issues/24) — hybrid memory beside the vault.
