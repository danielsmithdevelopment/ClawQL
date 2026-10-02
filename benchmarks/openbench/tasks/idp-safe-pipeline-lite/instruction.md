# IDP safe-pipeline lite (stubbed)

Orchestrate a **stubbed** multi-stage IDP-style pipeline with ClawQL tools only.
No live Stirling / Docling / ConeShare / Argo — map each stage to tools already
proven in OpenBench.

Use fixed correlation id: `idp-lite-openbench-01`.

## Stages (in order)

1. **discover** — `clawql_search` for GitHub global security advisories list.
2. **plan_extract** — `clawql_execute` with `"dry_run": true` (placeholder
   `ghsa_id` like `GHSA-xxxx-xxxx-xxxx` is fine).
3. **plan_redact** — second `clawql_execute` with `"dry_run": true` (another
   advisory op or the same get with dry_run).
4. **audit_trail** — `clawql_audit` append with
   `correlationId=idp-lite-openbench-01` summarizing the dry-run plan
   (Merkle / WORM stand-in).
5. **onyx_cite** — `clawql_knowledge_search_onyx` query about enterprise pricing
   policy; capture `CLAWQL_ONYX_CODE=quartz-21` from the result (Onyx index stand-in).
6. **notify_handoff** — `clawql_notify` channel `C-OPENBENCH` with text containing
   `CLAWQL_NOTIFY_MARKER=nebula-55` (ConeShare / handoff stand-in).
7. **persist** — `clawql_memory_ingest` title `OpenBench IDP Pipeline Lite`
   mentioning `CLAWQL_IDP=ok` and `deal_id=deal-idp-lite-01`.

Then write relative path `pipeline.json`.

## Artifact

```json
{
  "correlation_id": "idp-lite-openbench-01",
  "deal_id": "deal-idp-lite-01",
  "dryRunOnly": true,
  "stages_passed": 7,
  "stages": [
    "discover",
    "plan_extract",
    "plan_redact",
    "audit_trail",
    "onyx_cite",
    "notify_handoff",
    "persist"
  ],
  "onyx_code": "quartz-21",
  "notify_marker": "nebula-55",
  "source": "idp-safe-pipeline-lite"
}
```

## Rules

- Ignore `decoy/`.
- Passing requires real tool_use for all seven stages (search, ≥2 dry_run
  execute, audit, knowledge_search_onyx, notify, memory_ingest).
- Inventing `pipeline.json` without those tools fails.
- Stop after writing `pipeline.json`.
