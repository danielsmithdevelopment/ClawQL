# OpenClaw IDP skill profile (ClawQL document pipeline)

This is the **canonical** operator + agent contract for **OpenClaw-triggered intelligent document processing (IDP)** on ClawQL MCP. It satisfies **[#227](https://github.com/danielsmithdevelopment/ClawQL/issues/227)**. Bootstrap wiring and smokes: **[`clawql-bootstrap.md`](clawql-bootstrap.md)** ([#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226)). Umbrella tracking: **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)**.

## Profile summary

| Field | Value |
|-------|--------|
| **Profile id** | `clawql-openclaw-idp` |
| **MCP server** | `clawql-mcp` (stdio or Streamable HTTP `…/mcp`) |
| **Default provider merge** | `all-providers` (or explicit **`CLAWQL_BUNDLED_PROVIDERS`** listing document vendors) |
| **Primary tools** | **`search`** → **`execute`** on bundled REST/OpenAPI providers; **`ingest_external_knowledge`**; optional **`knowledge_search_onyx`**; vault **`memory_ingest`** / **`memory_recall`** |

Agents should **always** prefer **`search`** with a tight natural-language **`query`**, then **`execute`** with **`operationId`** + minimal **`fields`**. First-class wrappers (**`knowledge_search_onyx`**, **`ingest_external_knowledge`**) exist where documented — use them instead of re-discovering the same paths via raw **`execute`** when the workflow matches.

## Compatibility matrix (toolchain)

Legend: **Ready** = shipped in this repo with bundled or refreshed OpenAPI; **Partial** = env-dependent or roadmap; **Not MCP** = outside MCP tool surface today.

| Layer | Mechanism | Required env / base URLs | Status | Notes |
|-------|-----------|---------------------------|--------|--------|
| **Extract / parse** | **`execute`** on **`tika`** spec (`TIKA_BASE_URL`) | **`TIKA_BASE_URL`** | Ready | Discover ops with **`search`** (e.g. Tika put/post resources). |
| **HTML → PDF / renders** | **`execute`** on **`gotenberg`** | **`GOTENBERG_BASE_URL`** | Ready | Chromium/Chromium routes per bundled spec. |
| **PDF transforms / sign** | **`execute`** on **`stirling`** | **`STIRLING_BASE_URL`**, optional **`STIRLING_API_KEY`** | Ready | Minimal bundled spec; refresh from live `/v3/api-docs` when possible ([#125](https://github.com/danielsmithdevelopment/ClawQL/issues/125)). |
| **Archive / metadata** | **`execute`** on **`paperless`** | **`PAPERLESS_BASE_URL`**, **`PAPERLESS_API_TOKEN`** | Ready | See **[`docs/providers/paperless-onboarding.md`](../providers/paperless-onboarding.md)**. |
| **Enterprise search** | **`knowledge_search_onyx`** or **`execute`** on **`onyx`** | **`CLAWQL_ENABLE_ONYX=1`**, **`ONYX_BASE_URL`**, token | Ready | Wrapper vs raw **`execute`**: **[`docs/onyx-knowledge-tool.md`](../onyx-knowledge-tool.md)** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)). |
| **Post-Paperless → Onyx index** | **`execute`** (Onyx ingestion API) | Same as Onyx | Partial | Tracked as product glue ([#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)). |
| **Bulk ingest + vault** | **`ingest_external_knowledge`** | **`CLAWQL_EXTERNAL_INGEST=1`**, vault path, optional fetch | Ready | **[`docs/external-ingest.md`](../external-ingest.md)**. |
| **Privacy / redaction** | Policy **outside** a single MCP flag | Helm / sidecar / gateway | Partial | No **`CLAWQL_ENABLE_PRIVACY_FILTER`** in core **`.env.example`** — align with **[`docs/enterprise-mcp-tools.md`](../enterprise-mcp-tools.md#regulated-deployments)** and your deployment’s controls. |
| **Structured workflows** | **`ouroboros_*`** MCP tools | **`CLAWQL_ENABLE_OUROBOROS=1`** | Ready | **[`docs/clawql-ouroboros.md`](../clawql-ouroboros.md)** — optional overlay on linear IDP chains. |
| **LangExtract / Docling** | N/A in MCP catalog | — | Not MCP | Use **`execute`** only if you merge a **custom OpenAPI** for those services; not bundled as first-class providers today. |

## Reference workflow contract (chat-shaped)

Use this as the **default narrative** for OpenClaw system prompts and eval harnesses. Steps are **logical**; skip or reorder when data or policy requires it.

1. **Ingest** — **`ingest_external_knowledge`** (Markdown bulk and/or URL fetch with **`CLAWQL_EXTERNAL_INGEST_FETCH`**) or **`execute`** on Paperless/Tika as appropriate.
2. **Redact / policy** — apply **deployment-specific** redaction (sidecar, gateway, or human review); no single ClawQL env toggle documents “privacy filter” for all stacks.
3. **Classify / route** — **`search`** for the right **`operationId`** across pipeline vendors; **`execute`** with lean **`fields`**.
4. **Extract** — Tika/Stirling/Gotenberg **`execute`** paths for text/PDF/HTML transforms per spec.
5. **Optional sign / seal** — Stirling/Paperless/Gotenberg routes where the OpenAPI exposes them; attest later via Merkle/Ouroboros ([#114](https://github.com/danielsmithdevelopment/ClawQL/issues/114)).
6. **Archive / index** — Paperless **`execute`** for durable doc store; **`knowledge_search_onyx`** (or Onyx **`execute`**) for enterprise retrieval and citations.

Pair durable operator trails with **`memory_ingest`** / **`memory_recall`** when using an Obsidian vault (**[#130](https://github.com/danielsmithdevelopment/ClawQL/issues/130)** citation patterns).

## Missing / follow-up (explicit)

| Gap | Track |
|-----|--------|
| Pregenerated introspection for all document providers | [#125](https://github.com/danielsmithdevelopment/ClawQL/issues/125) |
| Post-Paperless push to Onyx automation | [#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120) |
| Bundled LangExtract / Docling as providers | Not filed as default — merge custom specs if needed |

## Where operators start

1. **[`clawql-bootstrap.md`](clawql-bootstrap.md)** — MCP registration + **`npm run smoke:openclaw-bootstrap`**.
2. This page — **IDP** defaults and matrix.
3. **[`docs/mcp-tools.md`](../mcp-tools.md)** — authoritative tool catalog.
4. **[`providers/README.md`](../providers/README.md)** — bundled **`operationId`** sources.
