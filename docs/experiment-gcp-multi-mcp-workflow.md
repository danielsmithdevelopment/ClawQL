# Experiment: GCP multi-spec MCP workflow (`search` over 20 Google APIs)

This document records a **repeatable experiment**: run ClawQL as a **real MCP server over stdio**, merge **20** bundled Google Discovery specs in one process, then issue **`search`** calls the same way Cursor / Claude Desktop would — and compare **token-ish cost** of tool outputs vs pasting **all** raw `discovery.json` bytes.

## How to reproduce

```bash
npm run workflow:gcp-multi
```

- **Harness:** [`scripts/mcp-workflow-gcp-multi.mjs`](../scripts/mcp-workflow-gcp-multi.mjs) (`Client` + `StdioClientTransport` → `node dist/server.js`).
- **Full captured run (tool results + stderr tail):** [`workflow-gcp-multi-latest.json`](workflow-gcp-multi-latest.json).
- **Recompute size / “token” stats:** `node scripts/report-gcp-multi-experiment.mjs` (writes [`experiment-gcp-multi-mcp-stats.json`](experiment-gcp-multi-mcp-stats.json)).

Stats below match **`meta.generatedAt`:** `2026-03-23T05:22:54.608Z` — re-run the commands above after regenerating the JSON to refresh numbers.

---

## Environment (child process)

| Variable | Value |
|----------|--------|
| `CLAWQL_GOOGLE_TOP20_SPECS` | `1` |
| `CLAWQL_BUNDLED_OFFLINE` | `1` |
| `CLAWQL_PROVIDER` / `CLAWQL_SPEC_PATH` / `CLAWQL_DISCOVERY_URL` | **unset** (so multi-spec merge wins) |

Server startup (stderr) ends with:

```text
[spec-loader] Multi-spec: 20 APIs merged → 1985 operations (REST execution; GraphQL not used for execute)
[tools] Multi-spec mode: skipping GraphQL introspection cache (execute uses REST).
[cloudrun-mcp] Server running on stdio. Ready for connections.
```

---

## Original queries (natural language → `search`)

### Cross-cutting (one query across merged APIs)

**Query**

```text
enable APIs batch GKE cluster firewall logging monitoring DNS bucket BigQuery
```

**MCP tool call:** `search` with `limit: 10`.

### Workflow steps (aligned with [`workflow-gcp-multi-service.md`](workflow-gcp-multi-service.md))

| # | Section | Query | `limit` |
|---|---------|---------|---------|
| 0 | Service Usage — enable APIs | `batch enable services projects serviceusage` | 5 |
| 1 | Resource Manager — project IAM | `get IAM policy project set bindings cloudresourcemanager` | 5 |
| 2 | Networking & firewall | `compute firewall insert network subnet VPC ingress` | 5 |
| 3 | GKE cluster | `create kubernetes cluster regional container locations` | 5 |
| 4 | Logging | `logging sink create export logs BigQuery storage destination` | 5 |
| 5 | Monitoring | `monitoring alert policy notification channel time series` | 5 |
| 6 | Load balancing (Compute) | `global forwarding rule backend service health check url map HTTPS proxy` | 5 |
| 7 | Cloud DNS | `DNS managed zone resource record set create A record` | 5 |
| 8 | Cloud Storage | `storage bucket insert objects upload IAM policy` | 5 |
| 9 | BigQuery | `BigQuery dataset query job insert table` | 5 |

**Total `search` calls:** 1 + 10 = **11**.

---

## Services loaded (merged operation index)

Manifest: [`providers/google/google-top20-apis.json`](../providers/google/google-top20-apis.json). Each API loads `providers/google/apis/<slug>/discovery.json`.

| Slug | Discovery `id` | Title |
|------|----------------|--------|
| `iam-v2` | `iam:v2` | Identity and Access Management (IAM) API |
| `compute-v1` | `compute:v1` | Compute Engine API |
| `storage-v1` | `storage:v1` | Cloud Storage API |
| `container-v1` | `container:v1` | Kubernetes Engine API |
| `run-v2` | `run:v2` | Cloud Run Admin API |
| `pubsub-v1` | `pubsub:v1` | Cloud Pub/Sub API |
| `bigquery-v2` | `bigquery:v2` | BigQuery API |
| `cloudresourcemanager-v3` | `cloudresourcemanager:v3` | Cloud Resource Manager API |
| `logging-v2` | `logging:v2` | Cloud Logging API |
| `monitoring-v3` | `monitoring:v3` | Cloud Monitoring API |
| `secretmanager-v1` | `secretmanager:v1` | Secret Manager API |
| `cloudfunctions-v2` | `cloudfunctions:v2` | Cloud Functions API |
| `cloudbuild-v2` | `cloudbuild:v2` | Cloud Build API |
| `cloudkms-v1` | `cloudkms:v1` | Cloud Key Management Service (KMS) API |
| `sqladmin-v1` | `sqladmin:v1` | Cloud SQL Admin API |
| `gkehub-v2` | `gkehub:v2` | GKE Hub API |
| `artifactregistry-v1` | `artifactregistry:v1` | Artifact Registry API |
| `serviceusage-v1` | `serviceusage:v1` | Service Usage API |
| `dns-v1` | `dns:v1` | Cloud DNS API |
| `servicenetworking-v1` | `servicenetworking:v1` | Service Networking API |

**Merged operations:** **1985** (from [`workflow-gcp-multi-latest.json`](workflow-gcp-multi-latest.json) `meta.mergedOperationCount`).

---

## Token / size “savings” (heuristic)

**Idea:** If a workflow **naïvely** stuffed **all** Discovery JSON into the model context, cost would track the **sum of file sizes**. ClawQL instead keeps specs **server-side** and returns only **`search` hits** (ranked slices with parameter metadata).

**Caveat:** “Tokens” here are **not** from a real tokenizer. We use **`approxTokens = ceil(bytes_utf8 / 4)`** as a cheap scale (same order of magnitude as many English/JSON estimates). Use [`report-gcp-multi-experiment.mjs`](../scripts/report-gcp-multi-experiment.mjs) to refresh.

| Metric | Value |
|--------|-------|
| Sum of 20 × `discovery.json` (on disk) | 11,157,299 bytes (~2,789,325 tok†) |
| Sum of 11 × `search` tool **text** payloads (`content[0].text`) | 120,780 bytes (~30,195 tok†) |
| Ratio (discovery bytes / search-output bytes) | **~92.4×** smaller for the tool-output side |

† Approximate tokens: `ceil(bytes / 4)`.

### Per-call output size (search tool text only)

| Step | Response bytes | ~tokens |
|------|----------------|---------|
| Cross-cutting (limit 10) | 12,963 | 3,241 |
| 0. Service Usage — enable APIs | 6,685 | 1,672 |
| 1. Resource Manager — project IAM | 6,854 | 1,714 |
| 2. Networking & firewall | 10,320 | 2,580 |
| 3. GKE cluster | 7,500 | 1,875 |
| 4. Logging | 12,128 | 3,032 |
| 5. Monitoring | 34,280 | 8,570 |
| 6. Load balancing (Compute) | 7,251 | 1,813 |
| 7. Cloud DNS | 9,238 | 2,310 |
| 8. Cloud Storage | 5,932 | 1,483 |
| 9. BigQuery | 7,629 | 1,908 |

*Largest step:* Monitoring (many parameters/descriptions on top hits).

---

## Raw MCP-style requests / responses (illustrative)

MCP over **stdio** uses **newline-delimited JSON-RPC 2.0** messages (exact framing/IDs/session come from `@modelcontextprotocol/sdk`; the harness does not commit a wire dump). Below are **representative** payloads — same **methods** and **`tools/call` argument/result shapes** the integration test exercises.

### 1. `initialize` (client → server)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "clawql-gcp-multi-workflow",
      "version": "1.0.0"
    }
  }
}
```

### 2. `initialize` result (server → client, abbreviated)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": {} },
    "serverInfo": { "name": "cloudrun-mcp", "version": "1.0.0" }
  }
}
```

### 3. `notifications/initialized` (client → server)

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized",
  "params": {}
}
```

### 4. `tools/call` — `search` (client → server)

Example: workflow step **0** (Service Usage).

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "search",
    "arguments": {
      "query": "batch enable services projects serviceusage",
      "limit": 5
    }
  }
}
```

### 5. `tools/call` result (server → client)

**Shape:** `CallToolResult` — here `content` is one `text` block whose **string value** is JSON from `formatSearchResults` (`{ "results": [ ... ] }`). Top **operation IDs** from the captured run for step 0:

- `serviceusage.services.batchEnable`
- `serviceusage.services.batchGet`
- `serviceusage.services.enable`
- `serviceusage.services.list`
- `compute.projects.enableXpnHost`

**Minimal illustrative result** (truncated; real strings are large — see artifact):

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"results\":[{\"id\":\"serviceusage.services.batchEnable\",\"method\":\"POST\",\"path\":\"v1/{v1Id}/{v1Id1}/services:batchEnable\",\"description\":\"Enable multiple services on a project...\",\"resource\":\"services\",\"parameters\":[…],\"requestBody\":\"BatchEnableServicesRequest\",\"responseSchema\":\"Operation\",\"score\":56,\"specLabel\":\"serviceusage-v1\"}, …]}"
      }
    ],
    "isError": false
  }
}
```

Full **11** responses (full `text` bodies + stderr tail) are in [`workflow-gcp-multi-latest.json`](workflow-gcp-multi-latest.json).

---

## Related

- Multi-service workflow narrative: [`workflow-gcp-multi-service.md`](workflow-gcp-multi-service.md).
- Faster **in-process** ranker check (not MCP): `npm run workflow:gcp-multi:direct`.
