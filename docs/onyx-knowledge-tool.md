# Onyx `knowledge_search_onyx` MCP tool

The optional **`knowledge_search_onyx`** tool runs **semantic document search** against a self-hosted or cloud **[Onyx](https://www.onyx.app/)** (formerly Danswer) instance. It wraps the bundled OpenAPI operation **`onyx_send_search_message`** (`POST /search/send-search-message`) so agents do not hand-assemble **`execute("onyx::onyx_send_search_message", …)`** for every retrieval.

**Layer:** Part of **ClawQL Documents** in the architecture diagram — **default on** with **`CLAWQL_ENABLE_DOCUMENTS=0`** to opt out (which also removes **`onyx`** from the default **`all-providers`** merge). On top of that, **`CLAWQL_ENABLE_ONYX=1`** registers this wrapper tool (see below).

**Tracking:** Onyx epic [#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118) (closed) · **Post-Paperless index push (workflow + `execute`):** [#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120) — bundled **`onyx_ingest_document`** landed; optional Ouroboros hook remains · **Vault citation handoff:** [#130](https://github.com/danielsmithdevelopment/ClawQL/issues/130) (closed: **`enterpriseCitations`** + helpers) · **Further tests (live/VCR, transport parity):** [#144](https://github.com/danielsmithdevelopment/ClawQL/issues/144) · **Deck / slides accuracy:** [#145](https://github.com/danielsmithdevelopment/ClawQL/issues/145) · Implementation: [`src/knowledge-search-onyx.ts`](../src/knowledge-search-onyx.ts), [`providers/onyx/openapi.yaml`](../providers/onyx/openapi.yaml) · Full MCP matrix: **[mcp-tools.md](mcp-tools.md)**.

---

## `knowledge_search_onyx` vs `execute`

|                  | **`knowledge_search_onyx`**                                                                                | **`execute("onyx::onyx_send_search_message", …)`**     |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Registration** | Only when **`CLAWQL_ENABLE_ONYX=1`**                                                                       | Always when the **`onyx`** spec is in the merged index |
| **Ergonomics**   | **`query`** maps to **`search_query`**; sensible defaults (`num_hits`, `include_content`, `stream: false`) | You pass the raw Onyx JSON body keys yourself          |
| **Spec**         | Same REST call and auth as **`execute`** on the **`onyx`** label                                           | Identical upstream behavior                            |

Use **`knowledge_search_onyx`** when the task is **“find indexed company knowledge”**. Use **`execute`** when you need **other Onyx REST paths** from a larger checked-in OpenAPI (if you replace or extend the bundled spec). Pushing documents into Onyx from ClawQL-side workflows is tracked under **[#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)** and typically needs **additional operations** in the bundle beyond search-only.

---

## Prerequisites

1. **Onyx** reachable over HTTPS (or HTTP in dev), with the **public HTTP API** enabled for your token (API key or PAT as **Bearer**). Hosted example API root: `https://cloud.onyx.app/api` (see [Onyx API docs](https://docs.onyx.app/developers/api_reference/search/document_search)).
2. **ClawQL** loads the **`onyx`** bundled provider so the operation exists in the merged index:
   - Default **`all-providers`** includes **`onyx`**, or
   - Set **`CLAWQL_BUNDLED_PROVIDERS`** to a list that contains **`onyx`** (e.g. `github,onyx`), or
   - **`CLAWQL_PROVIDER=onyx`** for Onyx-only single-vendor mode.
3. **Base URL:** **`ONYX_BASE_URL`** = API root **without** a trailing slash. If Onyx mounts under **`/api`**, include it (e.g. `http://onyx-web:8080/api`).
4. **Auth:** **`ONYX_API_TOKEN`** or **`CLAWQL_ONYX_API_TOKEN`** → `Authorization: Bearer …` for merged label **`onyx`** (see [`src/auth-headers.ts`](../src/auth-headers.ts)). You can instead set a **`onyx`** entry in **`CLAWQL_PROVIDER_AUTH_JSON`**.

---

## Enabling the tool

1. Set **`CLAWQL_ENABLE_ONYX=1`** (or `true` / `yes`). Parsed in [`src/clawql-optional-flags.ts`](../src/clawql-optional-flags.ts) ([#79](https://github.com/danielsmithdevelopment/ClawQL/issues/79)).
2. Ensure **`ONYX_BASE_URL`** and a Bearer token (**`ONYX_API_TOKEN`**, …) are set in the **MCP server** environment (same process that runs **`clawql-mcp`**).
3. Restart the server so **`listTools`** includes **`knowledge_search_onyx`**.

If the **`onyx`** operation is **not** in the loaded index (e.g. you pointed **`CLAWQL_SPEC_PATH`** at a tiny Petstore-only spec), the tool returns a JSON **`error`** explaining that **`onyx`** must be part of the merge.

---

## Tool parameters (reference)

| Parameter                 | Required | Default | Notes                                                                                                                          |
| ------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **`query`**               | yes      | —       | Natural language or keywords; sent as **`search_query`** to Onyx.                                                              |
| **`num_hits`**            | no       | `15`    | Cap between **1** and **100**.                                                                                                 |
| **`include_content`**     | no       | `true`  | Ask Onyx to include chunk/content when the deployment supports it.                                                             |
| **`stream`**              | no       | `false` | Must stay **`false`**; streaming responses are not supported for this tool.                                                    |
| **`run_query_expansion`** | no       | `false` | Onyx-side query expansion.                                                                                                     |
| **`hybrid_alpha`**        | no       | —       | Optional hybrid retrieval tuning (float).                                                                                      |
| **`filters`**             | no       | —       | Optional JSON object for Onyx index filters (source types, document sets, tags, etc.—shape depends on Onyx version).           |
| **`tenant_id`**           | no       | —       | Optional query parameter for multi-tenant deployments.                                                                         |
| **`fields`**              | no       | —       | Same as **`execute`** **`fields`**: keep only these **top-level** keys from the JSON response (useful to trim large payloads). |

---

## Examples

### 1. Minimal question

MCP tool input:

```json
{
  "query": "What is our refund policy for enterprise customers?"
}
```

ClawQL forwards a body like:

```json
{
  "search_query": "What is our refund policy for enterprise customers?",
  "num_hits": 15,
  "include_content": true,
  "stream": false,
  "run_query_expansion": false
}
```

The response body shape **depends on your Onyx version** (search pipeline, Vespa/OpenSearch, etc.). Inspect one successful **`execute`** response in your environment, then use **`fields`** to keep stable keys.

### 2. Tighter hit budget + projection

```json
{
  "query": "SOC2 audit evidence collection 2025",
  "num_hits": 8,
  "include_content": true,
  "fields": ["query", "documents"]
}
```

Adjust **`fields`** to match your instance’s top-level keys (examples only—validate against a real response).

### 3. Same search via `execute` (merged preset)

When **`CLAWQL_BUNDLED_PROVIDERS`** includes **`onyx`** (or **`all-providers`**), **`search("onyx semantic document search")`** should surface **`onyx::onyx_send_search_message`**.

```json
{
  "operationId": "onyx::onyx_send_search_message",
  "args": {
    "search_query": "deployment runbook kubernetes",
    "num_hits": 10,
    "include_content": true,
    "stream": false
  }
}
```

### 4. Pairing with `memory_ingest` (durable trail)

1. Call **`knowledge_search_onyx`** (or **`execute`** on **`onyx::onyx_send_search_message`**).
2. Call **`memory_ingest`** with **`insights`** (decisions) and optionally:
   - **`enterpriseCitations`**: up to **30** small rows (`title`, `url`, `document_id`, `source`, `snippet`) — rendered as an **Enterprise citations (Onyx)** Markdown block in the vault (no full corpora). Build the list manually or derive it from the search JSON using **`enterpriseCitationsFromOnyxSearchToolText`** in [`src/enterprise-citations.ts`](../src/enterprise-citations.ts) (parses common `documents[]` shapes; returns `{ ok, citations }` or `{ ok: false, error }`).
   - **`toolOutputs`**: still supported for a **redacted** raw JSON excerpt if you need provenance beyond the citation rows.

That makes context **recallable** via **`memory_recall`** without re-querying Onyx. See [#130](https://github.com/danielsmithdevelopment/ClawQL/issues/130).

### 5. Post-Paperless → Onyx index (`execute`, #120)

After a document lands in **Paperless**, you can **push the same text** into Onyx’s ingestion API so **`knowledge_search_onyx`** sees it quickly (async indexing on the Onyx side). Bundled operation **`onyx::onyx_ingest_document`** maps to **`POST /onyx-api/ingestion`** (set **`ONYX_BASE_URL`** to the API root that includes **`/api`** when your deployment uses it).

**Idempotency:** use a **stable** `document.id` (e.g. `paperless-{numeric_id}`) and the same **`semantic_identifier`** on retries so Onyx can treat updates as upserts.

**Example `execute` args** (trim `sections[0].text` to your size limits in production):

```json
{
  "operationId": "onyx::onyx_ingest_document",
  "args": {
    "document": {
      "id": "paperless-4242",
      "title": "Signed vendor agreement",
      "semantic_identifier": "paperless-4242",
      "source": "ingestion_api",
      "doc_updated_at": "2026-04-23T12:00:00Z",
      "sections": [
        {
          "text": "Plain text or OCR body here…",
          "link": "https://paperless.example/documents/4242/"
        }
      ]
    }
  }
}
```

Optional top-level **`cc_pair_id`** (integer) if your Onyx admin setup requires tying ingestion to a connector pair. Failures here should **not** roll back Paperless success — log, **`notify`**, or record via **`memory_ingest`** separately.

### 6. Pairing with `notify` (Slack)

After retrieval + any local processing, post a short Slack update that references **stable links** your users can open (Onyx UI, Confluence, or internal doc URLs from hit metadata), e.g. **`notify`** with **`text`** that cites “see thread / Onyx search: …”. See **[notify-tool.md](notify-tool.md)**.

---

## Errors and troubleshooting

| Symptom                                                       | What to check                                                                                                                                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool **`knowledge_search_onyx`** missing from **`listTools`** | **`CLAWQL_ENABLE_ONYX`** not truthy; restart server.                                                                                                                             |
| **`Onyx search operation is not in the loaded API index`**    | Load **`onyx`** (default **`all-providers`**, or add **`onyx`** to **`CLAWQL_BUNDLED_PROVIDERS`**). Avoid Petstore-only **`CLAWQL_SPEC_PATH`** unless you also merge **`onyx`**. |
| **`stream=true` is not supported**                            | Omit **`stream`** or set **`stream`: false**.                                                                                                                                    |
| **`REST HTTP 401` / `403`**                                   | Token scope, user permissions in Onyx, or wrong **`ONYX_BASE_URL`** (missing **`/api`** segment).                                                                                |
| **`REST HTTP 404`** on **`/search/send-search-message`**      | Onyx version or reverse-proxy path mismatch; compare with **`{ONYX_BASE_URL}/openapi.json`** from your server.                                                                   |
| Empty or odd JSON shape                                       | Onyx upgrades change response models; use **`fields`** sparingly after inspecting one raw response.                                                                              |

---

## Tests and maintenance

- **Unit / handler tests:** [`src/knowledge-search-onyx.test.ts`](../src/knowledge-search-onyx.test.ts), [`src/server.test.ts`](../src/server.test.ts) (tool appears when **`CLAWQL_ENABLE_ONYX=1`**).
- **Bundled spec:** minimal subset in **`providers/onyx/openapi.yaml`**. For the **full** Onyx OpenAPI from a running instance, set **`ONYX_BASE_URL`** (and optional Bearer token) and run **`npm run fetch-provider-specs`** — writes **`providers/onyx/openapi.yaml`** from **`/openapi.json`** or **`/openapi.yaml`** (may be very large; trim before committing if needed). See **`providers/README.md`**.
- **Deeper tests:** see **[backlog/onyx-knowledge-tool-test-backlog.md](backlog/onyx-knowledge-tool-test-backlog.md)** / **[#144](https://github.com/danielsmithdevelopment/ClawQL/issues/144)** (stdio **`callTool`** + fetch stub covered in **`src/server.test.ts`**).

---

## Related links

- **[mcp-tools.md § `knowledge_search_onyx` (optional)](mcp-tools.md#knowledge_search_onyx-optional)** — matrix + env flags.
- **[providers/README.md](../providers/README.md)** — **`onyx`** row, **`ONYX_BASE_URL`**, tokens.
- **`.env.example`** — copy-paste env block.
- **[#121](https://github.com/danielsmithdevelopment/ClawQL/issues/121)** — public site / matrix / topology docs umbrella.
