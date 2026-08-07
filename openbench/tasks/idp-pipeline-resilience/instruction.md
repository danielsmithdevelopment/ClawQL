# IDP pipeline resilience (B-2.2)

Orchestrate a **stubbed** IDP-style pipeline where the Onyx cite stage is
**down**. Recover (do not invent codes from `decoy/`), then finish the remaining
stages. No live Stirling / Docling / ConeShare / Argo.

Use fixed correlation id: `idp-resilience-openbench-01`.

## Stages (in order)

1. **discover** — `clawql_search` for GitHub global security advisories list.
2. **plan_extract** — `clawql_execute` with `"dry_run": true`.
3. **plan_redact** — second `clawql_execute` with `"dry_run": true`.
4. **audit_trail** — `clawql_audit` append with
   `correlationId=idp-resilience-openbench-01` noting the dry-run plan.
5. **recover_onyx** — Onyx cite is unavailable (see `failures/onyx_stage_outage.md`).
   Do **not** call `clawql_knowledge_search_onyx`. Do **not** invent a cite code
   from `decoy/`.
   - If you have `ouroboros_*` tools: create a seed from the outage note (and any
     seed-source appendix in this prompt), run `ouroboros_run_evolutionary_loop`
     with `maxGenerations` ≤ 4, then use the crystallized fallback cite code.
   - If you do **not** have `ouroboros_*`: keep retrying / thrashing decoy cite
     codes until the turn or time cap binds. Do not stop after one attempt.
6. **notify_handoff** — `clawql_notify` channel `C-OPENBENCH` with text containing
   `CLAWQL_NOTIFY_MARKER=nebula-55`.
7. **persist** — `clawql_memory_ingest` title `OpenBench IDP Pipeline Resilience`
   mentioning `CLAWQL_IDP=recovered` and `deal_id=deal-idp-resilience-01`.

Then write relative path `pipeline.json`.

## Artifact

```json
{
  "correlation_id": "idp-resilience-openbench-01",
  "deal_id": "deal-idp-resilience-01",
  "dryRunOnly": true,
  "recovered": true,
  "failure_stage": "onyx_cite",
  "stages_passed": 7,
  "stages": [
    "discover",
    "plan_extract",
    "plan_redact",
    "audit_trail",
    "recover_onyx",
    "notify_handoff",
    "persist"
  ],
  "onyx_code": "<crystallized-fallback-cite-code>",
  "notify_marker": "nebula-55",
  "source": "idp-pipeline-resilience"
}
```

## Rules

- Ignore `decoy/` cite codes — they are wrong.
- Passing requires real tool_use for search, ≥2 dry_run execute, audit, notify,
  memory_ingest, and (ouroboros-on) `ouroboros_run_evolutionary_loop`.
- Inventing `pipeline.json` without those tools fails.
- Stop after writing `pipeline.json`.
