# ClawQL

MCP server with **two tools** (`search`, `execute`), an internal **GraphQL**
layer for lean responses, and **spec-driven discovery** so agents don’t load
full OpenAPI definitions into context.

**Bring your own OpenAPI 3** (JSON/YAML file or URL), or use **Swagger 2**
(converted automatically), or a **Google Discovery** document URL. If no spec
env is set, ClawQL defaults to the bundled **Cloudflare** OpenAPI provider
(falls back to Cloudflare's published OpenAPI URL if the local bundle is missing).

### Latest benchmark (bundled `google` · `jira` · `cloudflare`)

Reproducible script: `npm run benchmark:tokens` → [`docs/benchmarks/latest.md`](docs/benchmarks/latest.md) · [`docs/benchmarks/REPRODUCE.md`](docs/benchmarks/REPRODUCE.md).  
Token estimate: **~4 characters per token**. Phase 2 compares **full REST response JSON** vs **GraphQL response JSON** (representative [fixtures](docs/benchmarks/response-examples/); optional live calls with `BENCHMARK_LIVE=1`).

| Provider | Phase 1 — full spec → top-5 `search` | Phase 2 — REST body → GraphQL body |
|----------|--------------------------------------|-------------------------------------|
| **google** (GKE list clusters) | 84,436 → 2,167 (**82,269 saved**, ~39×, **97.4%**) | 421 → 76 (**345 saved**, ~5.5×, **82.0%**) |
| **jira** (get issue) | 266,579 → 901 (**265,678 saved**, ~296×, **99.7%**) | 386 → 40 (**346 saved**, ~9.7×, **89.6%**) |
| **cloudflare** (list DNS records) | 2,206,098 → 2,377 (**2,203,721 saved**, ~928×, **99.9%**) | 177 → 80 (**97 saved**, ~2.2×, **54.8%**) |

Phase 1 = planning context; Phase 2 = execution payloads returned to the agent.

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

Set **one mode**. Precedence (highest → lowest):

1. `CLAWQL_SPEC_PATHS` / `CLAWQL_GOOGLE_TOP20_SPECS` (multi-spec mode)
2. `CLAWQL_SPEC_PATH` / `CLAWQL_SPEC_URL` / `CLAWQL_DISCOVERY_URL`
3. `CLAWQL_PROVIDER` (bundled preset)
4. built-in default provider (`cloudflare`)

| Variable | Meaning |
|----------|---------|
| `CLAWQL_SPEC_PATH` | Path to local OpenAPI JSON/YAML (or `OPENAPI_SPEC_PATH`) |
| `CLAWQL_SPEC_PATHS` | Comma/semicolon/newline-separated paths — **merge** many specs in **one** process (overrides single-spec vars when set) |
| `CLAWQL_GOOGLE_TOP20_SPECS` | Legacy alias (`1`/`true`/`yes`) for the curated Google top20 multi-spec mode |
| `CLAWQL_SPEC_URL` | URL to fetch OpenAPI JSON/YAML |
| `CLAWQL_DISCOVERY_URL` | Google Discovery JSON URL (e.g. other GCP APIs) |
| `CLAWQL_PROVIDER` | Use a **bundled** preset (`google`, `atlassian`, `cloudflare`) when no path/URL/discovery env is set |
| `CLAWQL_INTROSPECTION_PATH` | Pregenerated GraphQL introspection JSON (optional; speeds MCP `execute` field matching) |
| `CLAWQL_API_BASE_URL` | Override REST base URL (if spec has no `servers` or you need a different host) |

**GCP multi-service:** use **`CLAWQL_GOOGLE_TOP20_SPECS=1`** or **`CLAWQL_SPEC_PATHS`** so `search` / `execute` see every merged API in one server; `execute` uses REST in that mode. See [`docs/workflow-gcp-multi-service.md`](docs/workflow-gcp-multi-service.md).  
**Integration check:** `npm run workflow:gcp-multi` runs **`tools/call` → `search`** over real MCP stdio and writes `docs/workflow-gcp-multi-latest.json` (full `CallToolResult` + parsed body). `npm run workflow:gcp-multi:direct` is a faster in-process-only variant for debugging rankers. One-page results summary: [`docs/gcp-multi-mcp-test-summary.md`](docs/gcp-multi-mcp-test-summary.md). Detailed experiment write-up (queries, APIs, token heuristic, MCP samples): [`docs/experiment-gcp-multi-mcp-workflow.md`](docs/experiment-gcp-multi-mcp-workflow.md); `npm run report:gcp-multi-experiment` refreshes [`docs/experiment-gcp-multi-mcp-stats.json`](docs/experiment-gcp-multi-mcp-stats.json).

If **none** of the spec variables are set, ClawQL loads the default bundled
provider (**`cloudflare`**). Set **`CLAWQL_PROVIDER=google`**,
**`atlassian`**, or **`cloudflare`** to pick a bundled preset explicitly (see
`providers/README.md`).  
Compatibility aliases currently also exist for **`jira`**, **`bitbucket`**, and
**`google-top20`**.
if a bundled file is missing, the provider registry **fallback URL** is fetched
unless `CLAWQL_BUNDLED_OFFLINE=1`.

Maintainers: `npm run fetch-provider-specs` downloads specs; `npm run pregenerate-graphql`
(after `npm run build`) writes `introspection.json` / `schema.graphql` for each
provider where **`@omnigraph/openapi`** succeeds (**use Bun** — see `providers/README.md`).

**Multi-provider workflow (offline):** `npm run workflow:multi-provider` runs a
multi-step **`search`** scenario across **Google (GKE)**, **Cloudflare**, and **Jira**
(GKE deploy → Cloudflare DNS/caching → Jira tracking), and writes
[`docs/workflow-multi-provider-latest.json`](docs/workflow-multi-provider-latest.json).
Live Jira issue-create instructions are currently omitted — see [`docs/workflow-multi-provider.md`](docs/workflow-multi-provider.md).

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

## How the two phases save tokens

| | **Phase 1 — planning** | **Phase 2 — execution** |
|---|------------------------|-------------------------|
| **Mechanism** | Two MCP tools (`search`, `execute`) + in-memory index — agents don’t load the full OpenAPI into context. | Internal GraphQL projects only the fields `execute` asks for; lean JSON vs a full REST body. |
| **Typical win** | **Input** tokens: full spec → small `search` hits (see table above). On the default **Cloud Run** spec alone: ~66k → ~2k tokens per lookup (~97% smaller). | **Output** tokens: fat REST JSON → smaller GraphQL-shaped JSON (see table above; side-by-side JSON in [`latest.md`](docs/benchmarks/latest.md)). |
| **Tradeoff** | — | Small **input** cost for the GraphQL query + variables. |

**Why smaller planning context matters:** Long prompts can hurt accuracy even when retrieval is correct — e.g. [Du et al., EMNLP 2025](https://aclanthology.org/2025.findings-emnlp.1264/), [Liu et al., TACL 2024](https://aclanthology.org/2024.tacl-1.9/).

**Pricing:** Many models bill **output** higher than **input**; Phase 2 targets execution payload size.

**Reproduce / refresh numbers:** `npm run benchmark:tokens` (writes [`docs/benchmarks/latest.json`](docs/benchmarks/latest.json) + [`latest.md`](docs/benchmarks/latest.md)). `latest.json` also stores `phase2Documentation` (schema vs field-string doc cost) separately.

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

### 2. Start the GraphQL proxy

The GraphQL proxy must be running before the MCP server makes execution calls.
Run it in a separate terminal or as a background process:

```bash
npm run graphql
# or: bun run graphql
# GraphQL proxy running at http://localhost:4000/graphql
```

### 3. Start the MCP server

```bash
npm run dev          # development (tsx, no build step)
npm run build && npm start  # production
# or: bun run dev / bun run build && bun run start
```

### 4. Run tests

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

Google lists **every** public Discovery API at [`https://www.googleapis.com/discovery/v1/apis`](https://www.googleapis.com/discovery/v1/apis). The repo vendors a snapshot as [`providers/google/google-apis-lookup.json`](providers/google/google-apis-lookup.json) (search by `id` / `title`, copy `discoveryRestUrl`). See [`docs/google-apis-lookup.md`](docs/google-apis-lookup.md) to refresh it.

**Offline top 20:** IAM, Compute, Storage, GKE, Cloud Run, Pub/Sub, BigQuery, and 13 more are pre-downloaded under [`providers/google/apis/`](providers/google/apis/README.md) with optional GraphQL artifacts — see [`providers/google/google-top20-apis.json`](providers/google/google-top20-apis.json).

Point ClawQL at any one Discovery document:

```bash
export CLAWQL_DISCOVERY_URL="https://compute.googleapis.com/\$discovery/rest?version=v1"
```

---

## Maintainer notes (publishing)

1. Confirm `repository.url` in `package.json` matches your GitHub repo.
2. Run `npm run build` (or `bun run build`) and `npm test` (or `bun test`).
3. Never commit secrets: use `.env` locally (ignored); see `.env.example` for
   documented variables.
4. `dist/` and `node_modules/` are gitignored — build before release or let CI
   produce `dist/` for consumers who install from npm.