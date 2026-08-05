# Composed safe-rollout

Run a safe multi-tool rollout with ClawQL tools only (dry-run executes).

## Steps (in order)

1. **`clawql_search`** for GitHub global security advisories list operation.
2. **`clawql_execute`** twice with **`"dry_run": true`** on discovered ops
   (placeholder `ghsa_id` like `GHSA-xxxx-xxxx-xxxx` is fine for get).
3. **`clawql_audit`** append at least one checkpoint about the dry-run.
4. **`clawql_memory_ingest`** a short note titled `OpenBench Composed Rollout`
   mentioning `CLAWQL_COMPOSED=ok`.
5. Write relative path `rollout.json`.

## Artifact

```json
{
  "dryRunOnly": true,
  "composed": true,
  "source": "composed"
}
```

## Rules

- Ignore `decoy/`.
- Passing requires real tool_use for search, ≥2 dry_run execute, audit, and memory_ingest.
- Stop after writing `rollout.json`.
