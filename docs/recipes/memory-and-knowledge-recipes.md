# Memory and Knowledge Recipes

## 1) Recall-Before-Action

### Use case

You are about to perform complex work that may have prior context.

### Steps

1. `memory_recall` with focused query.
2. Summarize relevant hits.
3. Execute new work.
4. `memory_ingest` what changed.

---

## 2) Durable Session Hand-off

### Use case

Work spans multiple sessions/people.

### Steps

1. Keep temporary details in `cache` during active session.
2. At hand-off, `memory_ingest` with stable title and `append: true`.
3. Include explicit next actions and blockers.
4. Add `wikilinks` to related notes.

---

## 3) Large Artifact Capture (No Huge MCP Payload)

### Use case

Need to persist long logs/decks/transcripts without oversized tool input.

### Steps

1. Write artifact to a server-readable file path.
2. Call `memory_ingest` with `toolOutputsFile`.
3. Keep `insights` concise and high-signal.
4. Use `memory_recall` to verify later discoverability.

---

## 4) External Knowledge Import Cycle

### Use case

Import external docs to improve recall quality.

### Steps

1. `ingest_external_knowledge` with `dryRun: true`.
2. Validate paths/scope/content.
3. Re-run with `dryRun: false`.
4. `memory_recall` test query against imported content.

---

## 5) Onyx-Grounded Decision Trail

### Use case

Need enterprise-document evidence behind an action.

### Steps

1. `knowledge_search_onyx` with focused query.
2. Summarize key evidence.
3. Execute action.
4. `memory_ingest` with evidence summary (and citations when applicable).

---

## 6) Architecture Trace (Vault + Code Graph)

### Use case

You need both narrative decisions in the vault and precise import/call relationships in source.

### Steps

1. **`codegraph_index`** on the repo root (once per checkout), or **`codegraph_import_graphify`** from a Graphify export.
2. **`memory_recall`** with hybrid enabled (`CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1` or `includeCodeGraph: true`).
3. Use vault **`results[]`** for decisions and **`codeGraphHits`** for symbol locations.
4. **`codegraph_path`** between two symbols when you need a concrete trace.
5. **`memory_ingest`** the architecture conclusion with wikilinks.

See [Code graph plugin](../plugins/codegraph.md) and [Memory plugin](../plugins/memory.md).
