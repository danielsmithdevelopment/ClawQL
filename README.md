# ClawQL
MCP server that reduces token consumption by abstracting all tool calls into just two top-level functions and utilizes graphql to filter responses to exclusively the data needed. Focused on cloud doc interaction to start but able to be extended into other areas as needed and customized for specific use cases.

MCP server for the GCP Cloud Run API, with a **GraphQL optimization layer** and
**spec-driven endpoint discovery** — so agents can find and query Cloud Run
efficiently without burning context on 54 raw endpoints.

---

## Architecture

```
Agent
  └─▶ MCP Server  (stdio)
        ├─▶ search tool  ──▶ In-memory spec search  (zero latency, zero tokens)
        └─▶ execute tool  ──▶ GraphQL Client
                                    └─▶ GraphQL Proxy  (localhost:4000)
                                          │  [openapi-to-graphql, auto-generated]
                                          │  [selects ONLY requested fields]
                                          └─▶ Cloud Run REST API  (run.googleapis.com)
```

**Key design principles:**

1. **`search` first, `execute` second.** The agent calls `search("list
   services by region")` to discover which operation to run and what parameters it
   takes — without loading all endpoint definitions into context upfront.

2. **GraphQL is a private optimization layer.** Agents never see or write
   GraphQL. `execute` constructs a precise internal query that
   fetches only the fields needed, keeping responses lean before they land in
   the agent's context window.

3. **Single source of truth.** Both the search index and the GraphQL schema are
   derived automatically from the Cloud Run v2 discovery spec at
   `https://run.googleapis.com/$discovery/rest?version=v2`. When Google adds
   endpoints, `search` discovers them automatically.

---

## Two-phase Token Optimization

This project intentionally optimizes in **two separate phases**.

### Phase 1 — Tool surface optimization (54 endpoints -> 2 MCP tools)

Instead of exposing dozens of endpoint-specific tools, ClawQL exposes:

- `search`
- `execute`

The agent discovers operations on demand from the in-memory index, instead of
loading a giant endpoint/tool catalog up front.

Measured on current Cloud Run v2 spec:

- Full generated OpenAPI object: ~`66,296` tokens
- Top-5 search result payload: ~`1,925` tokens
- Approx reduction per lookup: ~`64,371` tokens (~`34x`, ~`97%` smaller)

This is the **first major win**: drastically smaller planning/selection context.

**Beyond cost — agent quality:** Packing huge specs or dozens of tool definitions into
the model’s context isn’t just expensive; it can **hurt task performance**. The
model must route and reason over more text before it gets to the user’s goal.
Recent work shows that **input length alone** can reduce accuracy even when
everything relevant was retrieved correctly — see Du et al., [*Context Length
Alone Hurts LLM Performance Despite Perfect
Retrieval*](https://aclanthology.org/2025.findings-emnlp.1264/) (Findings of
EMNLP 2025). Separately, Liu et al.’s widely cited study [*Lost in the Middle:
How Language Models Use Long
Contexts*](https://aclanthology.org/2024.tacl-1.9/) (TACL 2024; originally
[arXiv:2307.03172](https://arxiv.org/abs/2307.03172)) shows that model accuracy
can depend strongly on **where** evidence sits inside a long prompt. Together,
these motivate keeping planning context small: ClawQL’s two-tool surface plus
on-demand `search` is aimed at **reducing that context bloat** for planning and
tool selection, not only token bills.

### Phase 2 — Response shaping optimization (GraphQL field selection)

After the operation is chosen, GraphQL is used as a private execution layer to
return only requested fields instead of full REST payload shapes.

Measured from current schemas/field selection:

- Full `GoogleCloudRunV2Service` schema shape: ~`2,671` tokens
- Default list-services field selection expression: ~`20` tokens
- Approx shape reduction: ~`2,651` tokens (~`133x`, ~`99%` smaller)

This is the **second win**: smaller execution responses entering the model
context window.

#### How GraphQL saves tokens (before vs after)

GraphQL reduces tokens by projecting only the fields needed for the task.

- **Before (unshaped/full object):**
  - A Cloud Run Service object can include many nested sections (traffic, template,
    scaling, conditions, labels/annotations, etc.).
  - Measured full `GoogleCloudRunV2Service` schema shape: ~`2,671` tokens.

- **After (GraphQL-shaped):**
  - In our list-services test, the resolved query field was
    `googleCloudRunV2ListServicesResponse`.
  - The selected fields were:
    - `services { name uri latestReadyRevision reconciling createTime }`
    - `nextPageToken`
  - Measured field-selection shape: ~`20` tokens.

- **Reduction from shaping alone:**
  - ~`2,671` -> ~`20` tokens
  - ~`2,651` tokens saved
  - ~`133x` smaller (~`99.3%` reduction)

Practical effect: once authenticated, each execution call returns a much leaner
JSON payload to the model than a full REST-style object dump.

> Notes:
> - Token counts are estimated with `~4 chars/token`.
> - Actual runtime savings vary by operation and returned list size/page size.
> - The numbers above were measured from this repo's generated spec on 2026-03-19.

### Input vs output token breakdown

The two phases optimize **different sides** of the bill:

| Phase | Primary win | Approx input impact | Approx output impact |
|------|-------------|---------------------|----------------------|
| **1 — Two tools** | Avoid loading the full spec/catalog | **~64,371 tokens saved** (66,296 → 1,925) | Small / indirect |
| **2 — GraphQL shaping** | Lean execution payloads | Adds **~82 tokens** (GraphQL query + variables for list-services) | **~2,651 tokens saved** per shape (2,671 → 20) |

- **Phase 1** is mostly an **input-token** reduction (planning / selection context).
- **Phase 2** is mostly an **output-token** reduction (what comes back from the API call), with a small **input** cost for the GraphQL document and variables.

**Pricing note:** Many providers charge **more per output token** than per input token (rates vary by model and change over time). That makes Phase 2 especially valuable when execution responses would otherwise be large — even though Phase 1 saves more tokens in absolute count.

---

## Tools

| Tool | Description |
|---|---|
| `search` | Search the Cloud Run spec by natural language intent |
| `execute` | Run a discovered operation by discovery `operationId`, with optional GraphQL field selection |

### Agent workflow example

```
1. Agent: search("delete a service")
   → Returns: run.projects.locations.services.delete
              method: DELETE
              path: v2/projects/{projectsId}/locations/{locationsId}/services/{servicesId}
              parameters: name (path, required), validateOnly (query), etag (query)

2. Agent: (uses the information to call execute, or asks the user for the service name)

3. Agent: execute("run.projects.locations.services.list", {
       parent: "projects/my-proj/locations/us-central1",
       pageSize: 10
     })
   → GraphQL internally maps args + resolves the real field name; returns lean JSON
```

---

## Setup

### 1. Install dependencies

```bash
npm install
# or: bun install
```

### 2. Authenticate with GCP

```bash
# Option A — Application Default Credentials (recommended for local dev)
gcloud auth application-default login

# Option B — Export a token directly
export GOOGLE_ACCESS_TOKEN=$(gcloud auth print-access-token)
```

### 3. Start the GraphQL proxy

The GraphQL proxy must be running before the MCP server makes execution calls.
Run it in a separate terminal or as a background process:

```bash
npm run graphql
# or: bun run graphql
# GraphQL proxy running at http://localhost:4000/graphql
```

### 4. Start the MCP server

```bash
npm run dev          # development (tsx, no build step)
npm run build && npm start  # production
# or: bun run dev / bun run build && bun run start
```

### 5. Run tests

Tests use [Bun](https://bun.sh)’s test runner (`bun test`).

```bash
bun test
# or: npm test  (runs `bun test src` per package.json)
```

---

## Claude Desktop / Cursor config

Add to your MCP config (`claude_desktop_config.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "clawql": {
      "command": "node",
      "args": ["/absolute/path/to/ClawQL/dist/server.js"],
      "env": {
        "GOOGLE_ACCESS_TOKEN": "your-token-here",
        "GRAPHQL_URL": "http://localhost:4000/graphql"
      }
    }
  }
}
```

Or using `tsx` for development:

```json
{
  "mcpServers": {
    "clawql": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/ClawQL/src/server.ts"],
      "env": {
        "GOOGLE_ACCESS_TOKEN": "your-token-here"
      }
    }
  }
}
```

---

## Extending the server

The default surface is **two tools** (`search`, `execute`). To add more MCP tools
(e.g. convenience wrappers), register them in `src/tools.ts` the same way
(`server.tool(...)`).

GraphQL field names are **auto-resolved** in `execute` via schema introspection
(candidates include run-style names, legacy path-derived names, and response-type
names). See `src/tools.ts` for details. You can also introspect the
proxy at `http://localhost:4000/graphql` while it is running.

---

## Extending to other GCP APIs

The same pattern works for any GCP API that exposes a Discovery document:

```typescript
// Just change the discovery URL in spec-loader.ts:
const DISCOVERY_URL = "https://compute.googleapis.com/$discovery/rest?version=v1";
// → Compute Engine MCP server, same two-layer architecture
```

---

## Maintainer notes (publishing)

1. Set `repository.url` in `package.json` to your real GitHub URL (placeholder:
   `YOUR_USERNAME`).
2. Run `npm run build` (or `bun run build`) and `npm test` (or `bun test`).
3. Never commit secrets: use `.env` locally (ignored); see `.env.example` for
   documented variables.
4. `dist/` and `node_modules/` are gitignored — build before release or let CI
   produce `dist/` for consumers who install from npm.