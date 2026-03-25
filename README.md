# ClawQL

MCP server with **two tools** (`search`, `execute`), an internal **GraphQL**
layer for lean responses, and **spec-driven discovery** so agents don’t load
full OpenAPI definitions into context.

**Bring your own OpenAPI 3** (JSON/YAML file or URL), or use **Swagger 2**
(converted automatically), or a **Google Discovery** document URL. If no spec
env is set, ClawQL defaults to a bundled **multi-provider** merge (**Google top50 +
Cloudflare + Jira**). Single-provider **`cloudflare`** and other presets are
available via **`CLAWQL_PROVIDER`** (see [`providers/README.md`](providers/README.md)).

## Highlight: All-providers complex release-stack (largest benchmark)

> 🏆 **Best benchmark so far** by **absolute planning-context savings**: **~13.83M tokens** not pasted into context vs embedding the **full merged spec corpus** for **`CLAWQL_PROVIDER=all-providers`**.

One end-to-end scenario across **Google top50 + Bitbucket + Cloudflare + GitHub + Jira + n8n + Sentry + Slack** (57 on-disk specs, **8,990** operations): GKE and networking, Cloudflare DNS/cache, Sentry, GitHub Actions, Slack and n8n automation, optional Bitbucket, and a Jira runbook draft.

**Goal (abbreviated)**

- GKE cluster, workload, Service exposure; GCP firewall patterns compatible with Cloudflare source IP ranges.
- Cloudflare DNS (proxied) and caching toward the origin.
- Sentry project/DSN/releases; GitHub Actions scheduled deploy; Slack notifications; n8n workflow toward GitHub releases; optional Bitbucket repos/Pipelines.
- Jira issue draft: sections by vendor, labels, due +7 days, High priority.

**Workflow query sequence (exact)** — `npm run workflow:complex-release-stack`

- `create kubernetes cluster container.googleapis.com regional`
- `node pool create autoscaling kubernetes engine`
- `deploy workload deployment rolling update kubernetes`
- `kubernetes service type load balancer external IP`
- `compute firewall rule create allow tcp source range ingress`
- `network endpoint group kubernetes ingress`
- `dns record create zone A CNAME proxied`
- `zone details get`
- `cache rules configuration`
- `zone settings cache level`
- `tiered cache smart topology`
- `create project organization`
- `dsn key client key`
- `release create deploy`
- `create workflow dispatch repository`
- `repository secrets actions`
- `cron schedule workflow yaml`
- `chat.postMessage channel`
- `conversations.history channel`
- `incoming webhook`
- `create workflow`
- `activate workflow`
- `webhook trigger`
- `repository create project`
- `pipeline run commit`
- `pull request create`
- `create issue rest api`
- `edit issue labels priority duedate`
- `assign issue accountId`

**Specs loaded for this run**

- Google top50 Discovery bundle
- Bitbucket, Cloudflare, GitHub, Jira, n8n, Sentry, Slack OpenAPI (bundled)

**Measured savings (planning context)**

- Full loaded specs: `55,475,059` bytes (~`13,868,765` tokens)
- Workflow output: `144,764` bytes (~`36,191` tokens) — [`docs/workflow-complex-release-stack-latest.json`](docs/workflow-complex-release-stack-latest.json)
- Savings: `13,832,574` tokens (**`99.74%`** reduction, **`383.21x`** smaller)

The **compression ratio** is lower than the lighter three-provider benchmark below because this report is a richer JSON artifact—but the **on-disk spec surface is ~36% larger** and **~3.6M more tokens** are saved vs pasting every spec.

Details and reproducible stats:

- [`docs/benchmarks/all-providers-complex-workflow/experiment-all-providers-complex-workflow.md`](docs/benchmarks/all-providers-complex-workflow/experiment-all-providers-complex-workflow.md)
- [`docs/benchmarks/all-providers-complex-workflow/experiment-all-providers-complex-workflow-stats.json`](docs/benchmarks/all-providers-complex-workflow/experiment-all-providers-complex-workflow-stats.json)

---

## Strong benchmark: Default multi-provider (GKE + Cloudflare + Jira)

> **99.88%** / **861.98x** on a **smaller** three-provider corpus—still an excellent result when you only merge the default install bundle.

One realistic workflow spanning **Google Cloud + Cloudflare + Jira** with a single coherent objective (GKE → Cloudflare → Jira tracking).

**Workflow query sequence (exact)** — `npm run workflow:multi-provider`

- `create kubernetes cluster GKE regional zonal`
- `deploy application workload container image kubernetes engine`
- `kubernetes service load balancer external IP expose`
- `compute firewall rule ingress allow tcp source ip range`
- `container clusters get credentials kubectl`
- `create dns record zone A CNAME proxy`
- `list dns records filter name content`
- `load balancer pool origin health check`
- `cache rules cache reserve ttl bypass`
- `zone settings cache always online`
- `create issue project fields summary`
- `assign issue accountId assignee`
- `edit issue labels duedate priority`
- `get create issue metadata createmeta`

**Specs loaded for this run**

- Google top50 Discovery bundle
- Cloudflare full OpenAPI
- Jira OpenAPI

**Measured savings (planning context)**

- Full loaded specs: `40,835,581` bytes (~`10,208,896` tokens)
- Workflow output: `47,374` bytes (~`11,844` tokens)
- Savings: `10,197,052` tokens (`99.88%` reduction, `861.98x` smaller)

Details and reproducible stats:

- [`docs/benchmarks/multi-provider-complex-workflow/experiment-multi-provider-complex-workflow.md`](docs/benchmarks/multi-provider-complex-workflow/experiment-multi-provider-complex-workflow.md)
- [`docs/benchmarks/multi-provider-complex-workflow/experiment-multi-provider-complex-workflow-stats.json`](docs/benchmarks/multi-provider-complex-workflow/experiment-multi-provider-complex-workflow-stats.json)

Quick context: token estimates use `~4 chars/token`; Phase 1 measures planning-context reduction (`full spec -> top-5 search`), and Phase 2 measures execution-payload reduction (`full REST JSON -> GraphQL JSON`).

### Planning-context numbers vs your API bill

The **~10M / ~14M token** figures in the highlights above are **not** “what one MCP call costs” or a forecast line item on a provider dashboard. They compare two **static blobs**: the byte size of **all merged spec files on disk** (as if you pasted that text into context once) vs the byte size of **one** offline workflow report JSON. It is a **thought experiment** about how big “give the model every operation definition” would be.

**Normal ClawQL usage:** specs live **inside the MCP server**. The model never receives the full OpenAPI pile; it sends **`search` queries** and gets back **short ranked lists** (and later **`execute`** results). So you are **not** automatically charged ~10M input tokens per step from spec loading.

**If you did paste full specs into a chat thread:** on most APIs, that text becomes part of **conversation history**, so **later turns** can still be billed on a **very large input** each request (unless the provider **prompt-caches** a stable prefix—then accounting differs). So yes—**huge pasted context tends to stick around and compound** across turns; that is exactly the failure mode these benchmarks contrast against.

**After completing a full multi-step workflow** (e.g. the 14 `search` intents in the default multi-provider list): billable usage is the **sum over each model request** of (prompt + history + tool **outputs** that round + assistant text). There is no single repo-wide number: it depends on model, tool verbosity, and how large each **`execute`** response is. For a disciplined agent using only **`search`/`execute`** without pasting specs, expect **roughly tens of thousands to low hundreds of thousands** of tokens for such a run—not millions—**unless** responses or transcripts are huge.

#### Hypothetical naive baseline (same 14-query multi-provider workflow)

Assume the agent **never uses ClawQL** and instead keeps the **entire** provider spec in the model context whenever it works on that vendor. Query mix matches [`scripts/workflow-gke-cloudflare-jira.mjs`](scripts/workflow-gke-cloudflare-jira.mjs): **5** Google + **5** Cloudflare + **4** Jira = **14** model steps. Spec sizes match on-disk bundles ([`experiment-multi-provider-complex-workflow-stats.json`](docs/benchmarks/multi-provider-complex-workflow/experiment-multi-provider-complex-workflow-stats.json)): **~5.13M**, **~4.77M**, and **~0.31M** tokens respectively (`ceil(bytes / 4)` per corpus).

| Variant | Assumption | Approx spec-related tokens (workflow) |
|--------|------------|----------------------------------------|
| **A — Exclusive context per provider** | Clear context when switching vendor; each provider’s **full** spec is loaded **once** when that segment starts (no duplicate loads). | **~10.2M** total spec tokens materialized (`5.13M + 4.77M + 0.31M`) — same as “paste each corpus once” across the run. |
| **B — Full spec on every turn** | Each of the **14** requests includes the **full** spec for the **current** provider (common if the API **re-sends** the whole prompt and there is **no** effective prompt cache). Spec-only; ignores extra history and user queries. | **~50.7M** (`5×5.13M + 5×4.77M + 4×0.31M`). |

**ClawQL comparison anchor:** the committed offline workflow capture is **~11.8k** tokens ([`multi-provider-test.md`](multi-provider-test.md) / stats JSON). That is **not** identical to 14 live MCP turns (which add tool envelopes and assistant text), but it is the same order of magnitude as **search-only** planning context.

**Order-of-magnitude savings vs variant B (spec-only vs ~12k artifact):** **~50.7M − ~12k ≈ ~50.7M** fewer tokens attributed to carrying full specs—**>99.97%** on that slice. Versus variant A, **~10.2M − ~12k ≈ ~10.2M** on the same slice. Real dashboards also charge **assistant output**, **tool metadata**, and **history**, so totals are higher on both sides; the table isolates the **spec** component the README highlight is about.

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

## Quick start for agent users

For most users, this is enough to get an agent connected:

```bash
# terminal 1
npx -p clawql-mcp-server clawql-graphql

# terminal 2
CLAWQL_SPEC_PATH=./openapi.yaml npx -p clawql-mcp-server clawql-mcp
```

Then point your MCP client (Cursor/Claude Desktop) to the `clawql-mcp` command.

## Installing from GitHub source (instead of npm registry)

If you install directly from git, `prepare` now runs automatically to build `dist/`.

```bash
npm i github:danielsmithdevelopment/ClawQL
```

If your environment skips lifecycle scripts, run `npm run build` once manually.

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

## Configure the API spec

Set **one mode**. Precedence (highest → lowest):

1. `CLAWQL_SPEC_PATHS` — merge explicit spec files
2. `CLAWQL_PROVIDER` — merge when it names a **preset** (`google-top50`, `default-multi-provider`, `all-providers`, `atlassian`)
3. `CLAWQL_GOOGLE_TOP50_SPECS` — merge **google-top50** if #1–2 did not apply
4. Default merge (`google-top50 + cloudflare + jira`) when no spec env is set
5. `CLAWQL_SPEC_PATH` / `CLAWQL_SPEC_URL` / `CLAWQL_DISCOVERY_URL`, or **single** `CLAWQL_PROVIDER` (`cloudflare`, `github`, …)

| Variable | Meaning |
|----------|---------|
| `CLAWQL_SPEC_PATH` | Path to local OpenAPI JSON/YAML (or `OPENAPI_SPEC_PATH`) |
| `CLAWQL_SPEC_PATHS` | Comma/semicolon/newline-separated paths — **merge** many specs in **one** process (overrides single-spec vars when set) |
| `CLAWQL_GOOGLE_TOP50_SPECS` | Curated Google top50 multi-spec mode (`1`/`true`/`yes`) |
| `CLAWQL_SPEC_URL` | URL to fetch OpenAPI JSON/YAML |
| `CLAWQL_DISCOVERY_URL` | Google Discovery JSON URL (e.g. other GCP APIs) |
| `CLAWQL_PROVIDER` | **Single** bundled spec (`google`, `cloudflare`, …) or **merged** preset (`google-top50`, `default-multi-provider`, `all-providers`, `atlassian`) when no path/URL/discovery env is set |
| `CLAWQL_INTROSPECTION_PATH` | Pregenerated GraphQL introspection JSON (optional; speeds MCP `execute` field matching) |
| `CLAWQL_API_BASE_URL` | Override REST base URL (if spec has no `servers` or you need a different host) |

**GCP multi-service:** use **`CLAWQL_GOOGLE_TOP50_SPECS=1`**, **`CLAWQL_PROVIDER=google-top50`**, or **`CLAWQL_SPEC_PATHS`** so `search` / `execute` see every merged API in one server; `execute` uses REST in that mode. For **every bundled vendor** (Google top50 + Jira, Bitbucket, Cloudflare, GitHub, Slack, Sentry, n8n), use **`CLAWQL_PROVIDER=all-providers`**. See [`docs/workflow-gcp-multi-service.md`](docs/workflow-gcp-multi-service.md).  
**Integration check:** `npm run workflow:gcp-multi` runs **`tools/call` → `search`** over real MCP stdio and writes `docs/workflow-gcp-multi-latest.json` (full `CallToolResult` + parsed body). `npm run workflow:gcp-multi:direct` is a faster in-process-only variant for debugging rankers. One-page results summary: [`docs/gcp-multi-mcp-test-summary.md`](docs/gcp-multi-mcp-test-summary.md). Detailed experiment write-up (queries, APIs, token heuristic, MCP samples): [`docs/experiment-gcp-multi-mcp-workflow.md`](docs/experiment-gcp-multi-mcp-workflow.md); `npm run report:gcp-multi-experiment` refreshes [`docs/experiment-gcp-multi-mcp-stats.json`](docs/experiment-gcp-multi-mcp-stats.json).

If **none** of the spec variables are set, ClawQL loads a default bundled
multi-provider set (**Google top50 + Cloudflare + Jira**) so first-run complex
queries work out-of-the-box. Set **`CLAWQL_PROVIDER=google`**,
**`atlassian`**, **`cloudflare`**, **`github`**, **`slack`**, **`sentry`**, or **`n8n`**
to force a specific bundled spec or merged preset (see `providers/README.md`; **`all-providers`** = top50 + all other bundled vendors).  
Compatibility aliases currently also exist for **`jira`** and **`bitbucket`**.
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

**Complex release-stack (offline):** `npm run workflow:complex-release-stack` runs a broader **`search`** path across **Google (top50)** and **every other bundled vendor** using **`CLAWQL_PROVIDER=all-providers`**. Output: [`docs/workflow-complex-release-stack-latest.json`](docs/workflow-complex-release-stack-latest.json). Details: [`docs/workflow-complex-release-stack.md`](docs/workflow-complex-release-stack.md).

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

**Reproduce / refresh numbers:** `npm run benchmark:tokens` (writes [`docs/benchmarks/latest.json`](docs/benchmarks/latest.json) + [`latest.md`](docs/benchmarks/latest.md)). Full steps (fixtures vs live, golden file): [`docs/benchmarks/REPRODUCE.md`](docs/benchmarks/REPRODUCE.md). `latest.json` also stores `phase2Documentation` (schema vs field-string doc cost) separately.

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

**Offline top 50:** curated Google APIs are pre-downloaded under [`providers/google/apis/`](providers/google/apis/README.md) with optional GraphQL artifacts — see [`providers/google/google-top50-apis.json`](providers/google/google-top50-apis.json).

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