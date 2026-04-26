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
