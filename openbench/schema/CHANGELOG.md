# OpenBenchTrace schema changelog

## 1.0 — 2026-08-04

Initial publish-ready session/trial schema for fine-tune + eventual public release.

- Identity: `trace_id`, `run_id`, `task_id`, `arm` (`on`|`off`), `arm_label`, `phase`
- Model/harness: `model`, `harness`, `clawql_version` (git SHA)
- Conversation: `messages`, `tool_calls` (real `clawql_*` evidence when present)
- Outcome: grader `verdict` / `score` / spend-cap flags
- Privacy: write-time redaction metadata (`presidio_version`, `redaction_policy_hash`, hashes)
- Dataset: `schema_version: "1.0"`, `suitable_for_training`, `manifest_id`

Files: `openbench-trace.v1.json`, `openbench-trace.v1.ts`.
