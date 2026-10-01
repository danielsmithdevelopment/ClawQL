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

## 6) Architecture Trace (Vault + grep)

**8.0:** `clawql-codegraph` (`codegraph_*`, hybrid code graph recall) is removed — a strong-model Track B retest tied Net=0 vs working `grep` + `read_around`. See [post-8.0 CodeGraph backlog](../backlog/post-8.0-codegraph-revisit.md).

### Use case

You need both narrative decisions in the vault and precise import/call relationships in source.

### Steps

1. Use `search`/`execute` or shell `grep` to find symbol definitions and call sites, then **`read_around`** to pull context around each hit.
2. Use vault **`results[]`** / **`hits[]`** from **`memory_recall`** for prior decisions on the same area.
3. **`memory_ingest`** the architecture conclusion with wikilinks.

See [Memory plugin](../plugins/memory.md).
