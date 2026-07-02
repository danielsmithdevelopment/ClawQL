# Slack-first IDP runbook (@openclaw process document)

**Tracking:** [#256](https://github.com/danielsmithdevelopment/ClawQL/issues/256) · Epic [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259)

End-to-end operator narrative: one **Slack mention** triggers OpenClaw → ClawQL MCP → document pipeline → optional Argo **`workflow`** → **`notify`** completion. Validated against **shipped** tools only (no fictional `clawql execute` subcommands).

**Prerequisites:** [OpenClaw + ClawQL bootstrap](./clawql-bootstrap.md) ([#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226)), [IDP skill profile](./openclaw-idp-skill-profile.md) ([#227](https://github.com/danielsmithdevelopment/ClawQL/issues/227)).

## Architecture

```
Slack @openclaw mention
        │
        ▼
OpenClaw (ClawQL-Agent runtime — external repo)
        │
        ▼
clawql-mcp  ── search / execute ──► Docling (layout) → Tika → Stirling → Paperless → Onyx
        │      classify_document / extract_document (optional MCP tools)
        │      run_idp_pipeline (optional automated recipe)
        │      ingest_external_knowledge / memory_ingest
        │      workflow (optional Argo DAG)
        │      hitl_enqueue_label_studio (optional review)
        └──── notify ──► Slack thread reply
```

## Required configuration

| Component              | Env / Helm                                                  | Purpose                                                                                             |
| ---------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| ClawQL MCP             | `CLAWQL_ENABLE_DOCUMENTS=1` (default)                       | Document vendor merge                                                                               |
| Docling layout parse   | `DOCLING_BASE_URL`, optional `DOCLING_API_KEY`              | Forms/tables/W-2 ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248))              |
| Classifier (optional)  | `CLAWQL_ENABLE_IDP_CLASSIFIER=1`, `IDP_CLASSIFIER_BASE_URL` | Fine-tuned doc type routing ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248))   |
| LangExtract (optional) | `CLAWQL_ENABLE_LANGEXTRACT=1`, `LANGEXTRACT_BASE_URL`       | Schema extraction + grounding ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)) |
| Slack notify           | `CLAWQL_ENABLE_NOTIFY=1`, `CLAWQL_SLACK_TOKEN`              | Completion message                                                                                  |
| Vault (optional)       | `CLAWQL_OBSIDIAN_VAULT_PATH`                                | Durable `memory_ingest`                                                                             |
| Workflow (optional)    | `CLAWQL_ENABLE_WORKFLOW=1`, namespace allowlist             | Durable Argo run                                                                                    |
| HITL (optional)        | `CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`                         | Human review gate                                                                                   |

Helm full profile: [`charts/clawql-idp/values-idp-full.yaml`](../../charts/clawql-idp/values-idp-full.yaml) with `enableNotify: true`.

## OpenClaw system prompt block (copy-paste)

```markdown
You are an IDP operator assistant wired to ClawQL MCP (profile: clawql-openclaw-idp).

When the user @mentions you with a document request (e.g. "process this W-2.pdf for underwriting"):

1. **Discover** — `search` with a tight query for the right vendor `operationId` (Docling layout parse for forms/W-2, Tika for plain text, Stirling redact, Paperless archive, Onyx index).
2. **Layout parse** — for structured forms (W-2, tax, lending), prefer `execute` on **`docling`** (`docling_convert_file` / `docling_convert_source`) before or instead of Tika — see [`docling-onboarding.md`](../providers/docling-onboarding.md) and [`deployment/samples/lending-w2/`](../../deployment/samples/lending-w2/README.md).
3. **Classify / extract (optional)** — when enabled: `classify_document` for doc-type routing; `extract_document` for schema-grounded fields (W-2 boxes, etc.) — see [`langextract-onboarding.md`](../providers/langextract-onboarding.md).
4. **Execute** — call `execute` with minimal `fields`; never paste full OpenAPI responses into Slack.
5. **Vault** — `memory_ingest` a summary note with Paperless id, Merkle root, and correlation id when vault is configured.
6. **Workflow** — if the operator enabled Argo, `workflow` `submit` + `wait` on template `clawql-vault-daily-digest` or an allowlisted IDP template; pass `correlation_id`.
7. **HITL** — if policy requires human review, `hitl_enqueue_label_studio` then `workflow` `suspend`; resume via webhook when approved ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)).
8. **Notify** — `notify` to the configured Slack channel with: doc title, Paperless link, Onyx citation ids, workflow phase, NO secrets.

Slack replies must be short prose + links. Use `audit.append` with the same `correlationId` for operator grep.
```

## Example user mention

> @openclaw process this W-2.pdf for underwriting — extract, redact SSN, validate fields, archive to Paperless, index in Onyx, and post status here.

## Expected Slack thread artifacts

After a successful run, the thread should contain **links and ids**, not raw PDFs or tokens:

| Artifact       | Example                           | Source tool                    |
| -------------- | --------------------------------- | ------------------------------ |
| Layout parse   | "Docling extracted W-2 boxes"     | `execute` on `docling`         |
| Parse status   | "Tika extracted 2 pages"          | `execute` on `tika`            |
| Classification | "w2_form (0.94 confidence)"       | `classify_document` (optional) |
| Extraction     | "W-2 box 1–6 grounded fields"     | `extract_document` (optional)  |
| Redaction      | "Stirling job succeeded"          | `execute` on `stirling`        |
| Archive        | `Paperless doc #1842`             | `execute` on `paperless`       |
| Search         | "3 Onyx citations"                | `knowledge_search_onyx`        |
| Vault note     | `Memory/underwriting/w2-2026.md`  | `memory_ingest`                |
| Workflow       | `workflow clawql-abc12 Succeeded` | `workflow` `wait`              |
| Completion     | `notify` message in channel       | `notify`                       |

### Sample `notify` payload

```json
{
  "channel": "C01234567",
  "text": "IDP complete: W-2 archived as Paperless #1842; Onyx indexed; workflow clawql-abc12 Succeeded. Vault: Memory/underwriting/w2-2026.md"
}
```

Requires `CLAWQL_ENABLE_NOTIFY=1` and Slack spec in merge. See [`notify-tool.md`](../mcp/notify-tool.md).

### Optional workflow terminal notify

When `CLAWQL_WORKFLOW_NOTIFY_ON_TERMINAL=1`, `workflow` `wait` can Slack-notify on terminal phase without a separate `notify` call — see [`workflow-tool.md`](../mcp/workflow-tool.md).

## Tool sequence (reference)

Logical order from [IDP skill profile](./openclaw-idp-skill-profile.md):

1. **Ingest** — `ingest_external_knowledge` or `nextcloud`/`paperless` `execute` paths
2. **Layout parse** — `execute` `docling::*` for forms/tables (W-2, lending); fall back to Tika for plain text
3. **Classify / extract (optional)** — `classify_document` then `extract_document` when `CLAWQL_ENABLE_IDP_CLASSIFIER=1` / `CLAWQL_ENABLE_LANGEXTRACT=1`
4. **Extract** — `execute` `tika::*` when Docling is not required (or `run_idp_pipeline` for the full recipe)
5. **Redact** — `execute` `stirling::*` per deployment policy
6. **Archive** — `execute` `paperless::documents_create` (or equivalent `operationId` from `search`)
7. **Index** — `knowledge_search_onyx` / Onyx `execute` ingest ops
8. **Durable trail** — `memory_ingest` + `audit.append`
9. **Optional Argo** — `workflow` `submit` / `wait`
10. **Slack completion** — `notify`

## Failure modes

| Symptom                 | Check                                                    |
| ----------------------- | -------------------------------------------------------- |
| No tools in OpenClaw    | [`clawql-bootstrap.md`](./clawql-bootstrap.md) smoke     |
| `notify` not registered | `CLAWQL_ENABLE_NOTIFY=1`; Slack in provider merge        |
| `workflow` denied       | Namespace allowlist; Argo Workflows controller installed |
| Empty Paperless         | `PAPERLESS_API_TOKEN`, `PAPERLESS_BASE_URL`              |
| Agent invents tools     | Reinforce system prompt — only listed MCP tools exist    |

## Observability

Import [`clawql-idp-observability.json`](../grafana/clawql-idp-observability.json); correlate Slack `correlationId` with `audit` events. Full bundle: [`docs/observability/README.md`](../observability/README.md) ([#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252)).

## GitOps self-service (follow-on)

Agent-authored pipeline promotion: [`docs/gitops/agent-pr-argocd-pipeline.md`](../gitops/agent-pr-argocd-pipeline.md) ([#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258)).

## Related

- [#253](https://github.com/danielsmithdevelopment/ClawQL/issues/253) — W-2 sample pack: [`deployment/samples/lending-w2/`](../../deployment/samples/lending-w2/README.md)
- [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246) — LangExtract: [`langextract-onboarding.md`](../providers/langextract-onboarding.md)
- [#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248) — Docling + classifier: [`docling-onboarding.md`](../providers/docling-onboarding.md), [`fine-tuned-classifier.md`](../runbooks/fine-tuned-classifier.md)
- [ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent) — Slack mention driver (external)
