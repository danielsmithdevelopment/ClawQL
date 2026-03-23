# ClawQL

MCP server with **two tools** (`search`, `execute`), an internal **GraphQL**
layer for lean responses, and **spec-driven discovery** so agents don’t load
full OpenAPI definitions into context.

**Bring your own OpenAPI 3** (JSON/YAML file or URL), or use **Swagger 2**
(converted automatically), or a **Google Discovery** document URL. If you set
nothing, the demo default is the **Cloud Run v2** discovery spec.

---

## Install (npm / yarn / bun)

```bash
npm install clawql-mcp-server
# yarn add clawql-mcp-server
# bun add clawql-mcp-server
```

Binaries (after install):

| Command | Purpose |
|--------|---------|
| `clawql-mcp` | MCP server on stdio (what Cursor/Claude connect to) |
| `clawql-graphql` | Local GraphQL proxy used by `execute` |

Example (after `npm install -g clawql-mcp-server` or with local `node_modules/.bin` on `PATH`):

```bash
export CLAWQL_SPEC_PATH=./openapi.yaml
export CLAWQL_BEARER_TOKEN=…   # if your API needs auth
clawql-graphql &               # terminal 1 — listens on GRAPHQL_PORT (default 4000)
clawql-mcp                     # terminal 2 — MCP over stdio
```

Run a published package **without** a global install:

```bash
npx -p clawql-mcp-server clawql-graphql
npx -p clawql-mcp-server clawql-mcp
```

(`npx clawql-mcp` alone expects an npm package literally named `clawql-mcp`; this
repo publishes as **`clawql-mcp-server`**, so use `-p` as above.)

### Quick start for agent users

For most users, this is enough to get an agent connected:

```bash
# terminal 1
npx -p clawql-mcp-server clawql-graphql

# terminal 2
CLAWQL_SPEC_PATH=./openapi.yaml npx -p clawql-mcp-server clawql-mcp
```

Then point your MCP client (Cursor/Claude Desktop) to the `clawql-mcp` command.

### Installing from GitHub source (instead of npm registry)

If you install directly from git, `prepare` now runs automatically to build `dist/`.

```bash
npm i github:danielsmithdevelopment/ClawQL
```

If your environment skips lifecycle scripts, run `npm run build` once manually.

---

## Configure the API spec

| Variable | Meaning |
|----------|---------|
| `CLAWQL_SPEC_PATH` | Path to local OpenAPI JSON/YAML (or `OPENAPI_SPEC_PATH`) |
| `CLAWQL_SPEC_URL` | URL to fetch OpenAPI JSON/YAML |
| `CLAWQL_DISCOVERY_URL` | Google Discovery JSON URL (e.g. other GCP APIs) |
| `CLAWQL_PROVIDER` | Use a **bundled** preset (`jira`, `google`, `cloudflare`) when no path/URL/discovery env is set |
| `CLAWQL_INTROSPECTION_PATH` | Pregenerated GraphQL introspection JSON (optional; speeds MCP `execute` field matching) |
| `CLAWQL_API_BASE_URL` | Override REST base URL (if spec has no `servers` or you need a different host) |
| `CLAWQL_BEARER_TOKEN` | `Authorization: Bearer …` for upstream calls (or legacy `GOOGLE_ACCESS_TOKEN`) |
| `CLAWQL_HTTP_HEADERS` | JSON object of extra headers, merged with bearer |

If **none** of the spec variables are set, ClawQL loads the default **Cloud Run
v2** discovery URL. Set **`CLAWQL_PROVIDER=jira`**, **`google`**, or **`cloudflare`** to prefer
the **on-disk** copies under `providers/` (see `providers/README.md`); if a
bundled file is missing, the registry **fallback URL** is fetched instead.

Maintainers: `npm run fetch-provider-specs` downloads specs; `npm run pregenerate-graphql`
(after `npm run build`) writes `introspection.json` / `schema.graphql` for each
provider where **`@omnigraph/openapi`** succeeds (**use Bun** — see `providers/README.md`).

**Multi-provider workflow (offline):** `npm run workflow:multi-provider` runs a
multi-step **`search`** scenario across **Google (GKE)**, **Cloudflare**, and **Jira**
(GKE deploy → Cloudflare DNS/caching → Jira tracking), and writes
[`docs/workflow-multi-provider-latest.json`](docs/workflow-multi-provider-latest.json).
Optional live **Jira issue create** via env vars — see [`docs/workflow-multi-provider.md`](docs/workflow-multi-provider.md).

See `.env.example` for a full list.

**Large / vendor OpenAPI docs:** The design goal is **the full spec** — token
efficiency comes from **search + selective `execute`**, not from trimming the
document. ClawQL therefore applies **normalization** (e.g. shorthand `items`,
`default: null` + `nullable`, refs, empty servers) so huge specs load reliably.
The GraphQL layer uses **`@omnigraph/openapi`** (same engine as [GraphQL Mesh OpenAPI](https://the-guild.dev/graphql/mesh/docs/handlers/openapi));
some mega-specs may still hit **translation** edge cases. When GraphQL
fails, **`execute` falls back to REST** using the same OpenAPI operation map.
Improving resilience means extending sanitization and/or the translator — not
shipping a smaller spec.

Want to **fix translation upstream** (GraphQL Mesh / Omnigraph)? See
**[`docs/OPENAPI_TO_GRAPHQL_UPSTREAM.md`](docs/OPENAPI_TO_GRAPHQL_UPSTREAM.md)** and
**[`CONTRIBUTING.md`](CONTRIBUTING.md)**.

**MVP note:** Search is lightweight keyword scoring over operation metadata.
Very large specs may need a different retrieval strategy later.

---

## Architecture

```
Agent
  └─▶ MCP Server  (stdio)
        ├─▶ search tool  ──▶ In-memory spec search  (zero latency, zero tokens)
        └─▶ execute tool  ──▶ GraphQL Client
                                    └─▶ GraphQL Proxy  (localhost:4000)
                                          │  [@omnigraph/openapi / Mesh, auto-generated]
                                          │  [selects ONLY requested fields]
                                          └─▶ Your REST API  (from OpenAPI servers / CLAWQL_API_BASE_URL)
```

**Key design principles:**

1. **`search` first, `execute` second.** The agent calls `search("…")` to discover
   which operation to run and what parameters it takes — without loading the full
   spec into context upfront.

2. **GraphQL is a private optimization layer.** Agents never see or write
   GraphQL. `execute` constructs a precise internal query that
   fetches only the fields needed, keeping responses lean before they land in
   the agent's context window.

3. **Single source of truth.** The search index and GraphQL schema are derived
   from the same loaded spec (OpenAPI 3, or Discovery → OpenAPI for Google APIs).

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

**Pricing note:** Many providers charge **more per output token** than per input token (rates vary by model and change over time). That makes response shaping especially valuable when execution payloads would otherwise be large.

### Provider benchmark breakdown (Phase 1 + Phase 2)

The script measures **both** phases:

- **Phase 1:** full serialized OpenAPI vs **top-5 `search`** result payload (planning / selection context).
- **Phase 2 (execution payloads):** **full REST response JSON** (unfiltered body) vs **GraphQL response JSON** (same operation with a lean field selection — what `execute` returns). Default bodies come from committed **fixtures** in [`docs/benchmarks/response-examples/`](docs/benchmarks/response-examples/) (no credentials). Set **`BENCHMARK_LIVE=1`** + provider env to swap in **live** REST + GraphQL responses when both calls succeed — [`docs/benchmarks/REPRODUCE.md`](docs/benchmarks/REPRODUCE.md).

`latest.json` also includes **`phase2Documentation`** (OpenAPI response schema vs field-selection string) as a separate *documentation-cost* estimate.

Raw Phase 1 payloads are **omitted** from `latest.md` (too large). **Side-by-side** shows real JSON excerpts for Phase 2: fat REST vs lean GraphQL.

**Reproduce:** `npm run benchmark:tokens` → [`docs/benchmarks/latest.json`](docs/benchmarks/latest.json) and [`docs/benchmarks/latest.md`](docs/benchmarks/latest.md). Snapshot below matches a recent run; re-run after spec changes.

| Provider | Complex query (Phase 1 search) | Operation | Phase 1 (input) | Phase 2 (full REST JSON → GraphQL JSON) |
|---|---|---|---|---|
| `google` | "create gke kubernetes cluster…" | `container.projects.locations.clusters.list` | `84,436 → 2,167` (**82,269 saved**, `39.0x`, `97.4%`) | `421 → 76` (**345 saved**, `5.5x`, `82.0%`) |
| `jira` | "create issue in project…" | `com.atlassian.jira.rest.v2.issue.IssueResource.getIssue_get` | `266,579 → 901` (**265,678 saved**, `295.9x`, `99.7%`) | `386 → 40` (**346 saved**, `9.7x`, `89.6%`) |
| `cloudflare` | "create a DNS record…" | `dns-records-for-a-zone-list-dns-records` | `2,206,098 → 2,377` (**2,203,721 saved**, `928.1x`, `99.9%`) | `177 → 80` (**97 saved**, `2.2x`, `54.8%`) |

**Average across all 3 providers:** Phase 1 `~852,371 → ~1,815` tokens (**~850,556 saved**, ~`99.8%`); Phase 2 **payload** `~328 → ~65` (**~263 saved**, ~`80.2%`).

Token estimate uses `~4 chars/token`. Exact numbers drift with spec versions; re-run the script after changing bundled specs.

---

## Tools

| Tool | Description |
|---|---|
| `search` | Search the active OpenAPI/Discovery spec by natural language intent |
| `execute` | Run a discovered operation by `operationId`, with optional GraphQL field selection |

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

**Installed from npm** (recommended): use `npx` with `-p clawql-mcp-server` and the
binary name:

```json
{
  "mcpServers": {
    "clawql": {
      "command": "npx",
      "args": ["-p", "clawql-mcp-server", "clawql-mcp"],
      "env": {
        "CLAWQL_SPEC_PATH": "/absolute/path/to/openapi.yaml",
        "CLAWQL_BEARER_TOKEN": "your-token-if-needed",
        "GRAPHQL_URL": "http://localhost:4000/graphql"
      }
    }
  }
}
```

Start `clawql-graphql` (same `-p` pattern) in another terminal first, or use a
process manager.

**From a git checkout** (development):

```json
{
  "mcpServers": {
    "clawql": {
      "command": "node",
      "args": ["/absolute/path/to/ClawQL/dist/server.js"],
      "env": {
        "CLAWQL_SPEC_PATH": "/absolute/path/to/openapi.yaml",
        "GRAPHQL_URL": "http://localhost:4000/graphql"
      }
    }
  }
}
```

Or with `tsx`:

```json
{
  "mcpServers": {
    "clawql": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/ClawQL/src/server.ts"],
      "env": {
        "CLAWQL_SPEC_PATH": "/absolute/path/to/openapi.yaml"
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

## Other GCP APIs (Discovery)

Discovery-style APIs can be pointed at without code changes:

```bash
export CLAWQL_DISCOVERY_URL="https://compute.googleapis.com/\$discovery/rest?version=v1"
# plus auth (e.g. CLAWQL_BEARER_TOKEN or CLAWQL_HTTP_HEADERS)
```

---

## Maintainer notes (publishing)

1. Confirm `repository.url` in `package.json` matches your GitHub repo.
2. Run `npm run build` (or `bun run build`) and `npm test` (or `bun test`).
3. Never commit secrets: use `.env` locally (ignored); see `.env.example` for
   documented variables.
4. `dist/` and `node_modules/` are gitignored — build before release or let CI
   produce `dist/` for consumers who install from npm.