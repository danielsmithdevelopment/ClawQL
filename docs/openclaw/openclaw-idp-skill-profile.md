# OpenClaw IDP skill profile (ClawQL document pipeline)

This is the **canonical** operator + agent contract for **OpenClaw-triggered intelligent document processing (IDP)** on ClawQL MCP. It satisfies **[#227](https://github.com/danielsmithdevelopment/ClawQL/issues/227)**. End-to-end OpenClaw install + MCP registration: **[`using-openclaw-with-clawql.md`](using-openclaw-with-clawql.md)**. Bootstrap wiring and smokes: **[`clawql-bootstrap.md`](clawql-bootstrap.md)** ([#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226)). Umbrella tracking: **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)**. **Epic checklist (IDP + platform #241–#258):** [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259).

## Profile summary

| Field                      | Value                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Profile id**             | `clawql-openclaw-idp`                                                                                                                                                                  |
| **MCP server**             | `clawql-mcp` (stdio or Streamable HTTP `…/mcp`)                                                                                                                                        |
| **Default provider merge** | `all-providers` (or explicit **`CLAWQL_BUNDLED_PROVIDERS`** listing document vendors)                                                                                                  |
| **Primary tools**          | **`search`** → **`execute`** on bundled REST/OpenAPI providers; **`ingest_external_knowledge`**; optional **`knowledge_search_onyx`**; vault **`memory_ingest`** / **`memory_recall`** |
| **Dashboard Agent Chat**   | HTTP via OpenClaw bridge → rich JSON for IDP cards — **[`docs/dashboard/agent-chat.md`](../dashboard/agent-chat.md)**                                                                  |

Agents should **always** prefer **`search`** with a tight natural-language **`query`**, then **`execute`** with **`operationId`** + minimal **`fields`**. First-class wrappers (**`knowledge_search_onyx`**, **`ingest_external_knowledge`**) exist where documented — use them instead of re-discovering the same paths via raw **`execute`** when the workflow matches.

When the operator uses the **ClawQL dashboard Agent Chat** panel, format completion payloads for the **[dashboard response contract](../dashboard/agent-chat.md#7-agent-response-contract-rich-idp-ui)** (`reply`, `steps`, `attachments`, `citations`, `pipelineStatus`) so Paperless docs, Onyx cites, pipeline/Merkle badges, and Coneshare links render as cards — not only plain text.

## Compatibility matrix (toolchain)

Legend: **Ready** = shipped in this repo with bundled or refreshed OpenAPI; **Partial** = env-dependent or roadmap; **Not MCP** = outside MCP tool surface today.

| Layer                           | Mechanism                                                  | Required env / base URLs                                   | Status  | Notes                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Extract / parse**             | **`execute`** on **`tika`** spec (`TIKA_BASE_URL`)         | **`TIKA_BASE_URL`**                                        | Ready   | [`tika-onboarding.md`](../providers/tika-onboarding.md) |
| **HTML → PDF / renders**        | **`execute`** on **`gotenberg`**                           | **`GOTENBERG_BASE_URL`**                                   | Ready   | [`gotenberg-onboarding.md`](../providers/gotenberg-onboarding.md) |
| **PDF transforms / redact**     | **`execute`** on **`stirling`**                            | **`STIRLING_BASE_URL`**, optional **`STIRLING_API_KEY`**   | Ready   | [`stirling-onboarding.md`](../providers/stirling-onboarding.md) |
| **Archive / metadata**          | **`execute`** on **`paperless`**                           | **`PAPERLESS_BASE_URL`**, **`PAPERLESS_API_TOKEN`**        | Ready   | [`paperless-onboarding.md`](../providers/paperless-onboarding.md) |
| **Enterprise search**           | **`knowledge_search_onyx`** or **`execute`** on **`onyx`** | **`CLAWQL_ENABLE_ONYX=1`**, **`ONYX_BASE_URL`**, token     | Ready   | [`onyx-onboarding.md`](../providers/onyx-onboarding.md), [`onyx-knowledge-tool.md`](../mcp/onyx-knowledge-tool.md) |
| **Collaboration storage**       | **`execute`** on **`nextcloud`**                           | **`NEXTCLOUD_BASE_URL`**, username + app password          | Ready   | [`nextcloud-onboarding.md`](../providers/nextcloud-onboarding.md) |
| **Secure sharing / VDR**        | **`execute`** on **`coneshare`** + webhook                 | **`CONESHARE_BASE_URL`**, token; **`CLAWQL_ENABLE_CONESHARE=1`** | Ready   | [`coneshare-onboarding.md`](../providers/coneshare-onboarding.md) |
| **Pipeline recipe**             | **`DEFAULT_IDP_PIPELINE`** in **`clawql-documents`**       | All vendor base URLs above                                 | Ready   | [`idp-pipeline.md`](../providers/idp-pipeline.md) — agent-composed **`search`/`execute`**; automated runner still roadmap |
| **Post-Paperless → Onyx index** | **`execute`** (Onyx ingestion API)                         | Same as Onyx                                               | Partial | Tracked as product glue ([#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)).                                                                                                                                                                                                                                     |
| **Bulk ingest + vault**         | **`ingest_external_knowledge`**                            | **`CLAWQL_EXTERNAL_INGEST=1`**, vault path, optional fetch | Ready   | **[`docs/mcp/external-ingest.md`](../mcp/external-ingest.md)**.                                                                                                                                                                                                                                                                    |
| **Privacy / redaction**         | Local MoE mask pipeline (planned) + policy controls        | Helm / sidecar / gateway                                   | Partial | Tracked: [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245). Until shipped, align with **[`docs/mcp/enterprise-mcp-tools.md`](../mcp/enterprise-mcp-tools.md#regulated-deployments)** and deployment controls.                                                                                                    |
| **Structured workflows**        | **`ouroboros_*`** MCP tools                                | **`CLAWQL_ENABLE_OUROBOROS=1`**                            | Ready   | **[`docs/ouroboros/clawql-ouroboros.md`](../ouroboros/clawql-ouroboros.md)** — optional overlay on linear IDP chains.                                                                                                                                                                                                              |
| **Dashboard Agent Chat**        | OpenClaw bridge → Next.js SSE + vault threads              | **`CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL`**, dashboard Helm  | Ready   | **[`docs/dashboard/agent-chat.md`](../dashboard/agent-chat.md)** — rich JSON (`attachments`, `steps`, `pipelineStatus`).                                                                                                                                                                                                            |
| **LangExtract / Docling**       | N/A in MCP catalog (today)                                 | —                                                          | Partial | LangExtract: [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246). Docling + classifier: [#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248). Matrix: [IDP master requirements](../roadmap/idp-master-requirements-matrix.md). Until shipped, **`execute`** on merged custom OpenAPI remains valid. |

## Reference workflow contract (chat-shaped)

Use this as the **default narrative** for OpenClaw system prompts and eval harnesses. Steps are **logical**; skip or reorder when data or policy requires it.

1. **Ingest** — **`ingest_external_knowledge`**, **`nextcloud::nextcloud_webdav_download`**, or Paperless/Tika **`execute`** as appropriate (see **`DEFAULT_IDP_PIPELINE`** in [`idp-pipeline.md`](../providers/idp-pipeline.md)).
2. **Redact / policy** — apply **deployment-specific** redaction (sidecar, gateway, or human review); no single ClawQL env toggle documents “privacy filter” for all stacks.
3. **Classify / route** — **`search`** for the right **`operationId`** across pipeline vendors; **`execute`** with lean **`fields`**.
4. **Extract** — Tika/Stirling/Gotenberg **`execute`** paths for text/PDF/HTML transforms per spec.
5. **Optional sign / seal** — Stirling/Paperless/Gotenberg routes where the OpenAPI exposes them; attest later via Merkle/Ouroboros ([#114](https://github.com/danielsmithdevelopment/ClawQL/issues/114)).
6. **Archive / index** — Paperless **`execute`** for durable doc store; **`knowledge_search_onyx`** (or Onyx **`execute`**) for enterprise retrieval and citations.
7. **Share** — **`coneshare::*`** share links / data rooms; webhook **`POST /idp/coneshare/webhook`** for viewer follow-up when **`CLAWQL_ENABLE_CONESHARE=1`**.

Pair durable operator trails with **`memory_ingest`** / **`memory_recall`** when using an Obsidian vault (**[#130](https://github.com/danielsmithdevelopment/ClawQL/issues/130)** citation patterns).

## Dashboard Agent Chat response contract

When the workflow is triggered from the **ClawQL dashboard** Agent Chat panel (OpenClaw bridge → `POST /v1/chat` or `/v1/chat/stream`), the HTTP layer carries structured metadata the UI renders as cards. The bridge **auto-enriches** from OpenClaw session tool audit (`clawql__*` MCP calls); agents may also embed a fenced JSON override in the reply. Canonical spec: **[`docs/dashboard/agent-chat.md`](../dashboard/agent-chat.md)** (§8).

### Minimum useful payload

```json
{
  "reply": "Human-readable summary of what was done.",
  "steps": [{ "label": "execute paperless::documents_create", "state": "done" }]
}
```

### IDP-rich payload (recommended after multi-hop runs)

```json
{
  "reply": "Redacted and archived 3 invoices; Onyx indexed; Merkle root recorded.",
  "steps": [
    { "label": "execute tika::…", "state": "done" },
    { "label": "execute stirling::…", "state": "done" },
    { "label": "execute paperless::…", "state": "done" }
  ],
  "attachments": [
    { "kind": "pipeline", "id": "p1", "stage": "stirling-redact", "status": "done", "merkleRoot": "<hex>" },
    { "kind": "document", "id": "d1", "title": "invoice-001.pdf", "provider": "paperless", "paperlessId": 42 }
  ],
  "citations": [
    { "kind": "onyx_citation", "id": "c1", "title": "Vendor rate card", "snippet": "…", "score": 0.9 }
  ],
  "pipelineStatus": { "phases": ["tika", "gotenberg", "stirling", "paperless", "onyx"] }
}
```

### Attachment kinds

| `kind` | Use when |
| ------ | -------- |
| `document` | Paperless or Nextcloud artifact (`provider`, optional `paperlessId` / `url`) |
| `onyx_citation` | `knowledge_search_onyx` or ingest citation handoff |
| `coneshare` | Secure share / VDR link (`roomUrl`) |
| `pipeline` | Stage status + optional `merkleRoot` after Stirling/audit |

Always pair **`reply`** prose with **`memory_ingest`** for durable vault notes when decisions must survive beyond the chat thread.

### OpenClaw system prompt addendum

```markdown
For ClawQL dashboard operators: after IDP tool runs, summarize in plain language and list Paperless ids,
Onyx sources, Merkle roots, and share links explicitly. The dashboard renders structured attachment JSON
when the HTTP bridge supplies it (see docs/dashboard/agent-chat.md).
```

## Missing / follow-up (explicit)

| Gap                                                   | Track                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pregenerated introspection for all document providers | [#125](https://github.com/danielsmithdevelopment/ClawQL/issues/125)                                                                                                                                                                      |
| Post-Paperless push to Onyx automation                | [#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)                                                                                                                                                                      |
| Bundled LangExtract / Docling as providers            | [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246), [#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248); full stack map: [IDP master requirements matrix](../roadmap/idp-master-requirements-matrix.md) |
| IDP observability + Slack runbooks + Argo/HITL glue   | [#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252)–[#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258) (see matrix)                                                                                     |

## Where operators start

1. **[`using-openclaw-with-clawql.md`](using-openclaw-with-clawql.md)** — full OpenClaw + ClawQL guide (install, **`openclaw mcp set`**, validation).
2. **[`clawql-bootstrap.md`](clawql-bootstrap.md)** — MCP registration + **`npm run smoke:openclaw-bootstrap`**.
3. This page — **IDP** defaults and matrix.
4. **[`docs/providers/idp-pipeline.md`](../providers/idp-pipeline.md)** — full seven-vendor stack, env, Helm, **`DEFAULT_IDP_PIPELINE`**.
5. **[`docs/dashboard/agent-chat.md`](../dashboard/agent-chat.md)** — dashboard Agent Chat API, SSE, vault schema, rich JSON contract.
6. **[`docs/mcp/mcp-tools.md`](../mcp/mcp-tools.md)** — authoritative tool catalog.
7. **[`providers/README.md`](../providers/README.md)** — bundled **`operationId`** sources.
