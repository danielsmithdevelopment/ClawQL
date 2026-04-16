# ClawQL

MCP server: **core** tools **`search`** and **`execute`** (OpenAPI/Discovery), plus optional **`sandbox_exec`** ([Cloudflare Sandbox](https://developers.cloudflare.com/sandbox/) **bridge Worker**), **`memory_ingest`**, and **`memory_recall`** (Obsidian vault). An internal **GraphQL** layer keeps **`execute`** responses lean; **spec-driven discovery** means agents don’t load full OpenAPI definitions into context. Full tool reference: **[`docs/mcp-tools.md`](docs/mcp-tools.md)**.

**What is MCP?** [Model Context Protocol](https://modelcontextprotocol.io) is how
clients such as [Cursor](https://cursor.com/docs/context/mcp) or Claude Desktop
run this server over **stdio** or **HTTP** and expose **`search`**, **`execute`**, and (when configured) **`sandbox_exec`**, **`memory_ingest`**, **`memory_recall`** to the model.

**Architecture:** **`search`** and **`execute`** run in one MCP process. For single-spec APIs, **`execute`** uses an internal **OpenAPI→GraphQL** path so responses stay field-selected and small; **`clawql-mcp-http`** also exposes **`/graphql`** on the same port for debugging. Multi-spec **`execute`** uses REST only.

**Bring your own OpenAPI 3** (JSON/YAML file or URL), or use **Swagger 2**
(converted automatically), or a **Google Discovery** document URL. If no spec
env is set, ClawQL defaults to a bundled **multi-provider** merge (**Google top 50 +
Cloudflare + GitHub**). Single-provider **`cloudflare`** and other presets are
available via **`CLAWQL_PROVIDER`** (see [`providers/README.md`](providers/README.md)).

**Repo vs npm:** GitHub **`ClawQL`** — published package **`clawql-mcp`**.

**Enterprise agent stack:** **[ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent)** is the local-first Docker platform (LangGraph, Obsidian knowledge graph, optional Cloudflare Sandboxes, Langfuse) that uses **this repo** as the MCP **API engine** — token-efficient **`search` / `execute`** over OpenAPI/Discovery. **ClawQL Parity v1** is complete: this server exposes the same unified MCP surface as the agent README (`sandbox_exec()`, `memory_ingest()`, `memory_recall()` alongside **`search`/`execute`**); see **[#11](https://github.com/danielsmithdevelopment/ClawQL/issues/11)**. **`memory_ingest`** and **`memory_recall`** run when **`CLAWQL_OBSIDIAN_VAULT_PATH`** is set (see [Obsidian vault](#obsidian-vault-optional) and [`docs/memory-obsidian.md`](docs/memory-obsidian.md)). Optional **`CLAWQL_OBSIDIAN_VAULT_PATH`** configures a shared Obsidian vault path (validated at startup when set; Docker/K8s default **`/vault`** — see [Obsidian vault](#obsidian-vault-optional)).

## First 5 minutes

1. Install: `npm install clawql-mcp` (or use `npx -p clawql-mcp` as below; expect **~90 MB** on disk, see [Install](#install-npm--yarn--bun)).
2. Run **`npx -p clawql-mcp clawql-mcp`** (default bundled specs) **or** `CLAWQL_PROVIDER=all-providers npx -p clawql-mcp clawql-mcp`
3. Point your MCP client at **`clawql-mcp`** on stdio — see [Claude Desktop / Cursor config](#claude-desktop--cursor-config).

From there: custom spec via `CLAWQL_SPEC_PATH` / `CLAWQL_SPEC_URL`, or read [Configure the API spec](#configure-the-api-spec) for merged presets and precedence.

## TL;DR

- **Install:** `npm install clawql-mcp` — full [Install](#install-npm--yarn--bun) notes (binaries, `npx`, **~90 MB** on disk).
- **Run** (no global install). **Pick one** spec source:

  1. **Bundled specs** — nothing to download; uses pre-shipped `providers/` in the package (**`CLAWQL_PROVIDER=all-providers`** = every bundled vendor):

     ```bash
     CLAWQL_PROVIDER=all-providers npx clawql-mcp
     ```

  2. **Local OpenAPI** (JSON/YAML; Swagger 2 is converted) — path on disk:

     ```bash
     CLAWQL_SPEC_PATH=./openapi.yaml npx clawql-mcp
     ```

  3. **Remote spec** — HTTPS URL to OpenAPI (or YAML/JSON):

     ```bash
     CLAWQL_SPEC_URL=https://example.com/openapi.json npx clawql-mcp
     ```

  **Google Discovery** (GCP APIs, etc.): use **`CLAWQL_DISCOVERY_URL`** instead of `CLAWQL_SPEC_URL`. Merge many specs or other presets: [Configure the API spec](#configure-the-api-spec).

- **All MCP tools (API + vault + sandbox):** see **[`docs/mcp-tools.md`](docs/mcp-tools.md)** — examples for `sandbox_exec`, `memory_ingest`, `memory_recall`, env vars.

- **Benchmarks & raw artifacts:** [Benchmarks and results](#benchmarks-and-results) — quick links to [all-providers stats](docs/benchmarks/all-providers-complex-workflow/experiment-all-providers-complex-workflow-stats.json), [default multi-provider stats](docs/benchmarks/multi-provider-complex-workflow/experiment-multi-provider-complex-workflow-stats.json), and workflow JSON outputs.

---

## Install (npm / yarn / bun)

```bash
npm install clawql-mcp
# yarn add clawql-mcp
# bun add clawql-mcp
```

**Registry size:** The published package is large (**~10 MB** compressed, **~90+ MB** installed) because it ships **`providers/`** — bundled OpenAPI/Discovery specs for **offline** lookup. That is intentional; expect longer installs and higher disk use than a typical small utility.

Binaries (after install):

| Command | Purpose |
|--------|---------|
| `clawql-mcp` | MCP server on stdio (what Cursor/Claude connect to) |
| `clawql-mcp-http` | MCP over Streamable HTTP (`PORT`, `/mcp`, `/healthz`, `/graphql`) |

Supported **ESM subpaths** (see `package.json` → `exports`): `clawql-mcp` (stdio entry), `clawql-mcp/server-http`, `clawql-mcp/graphql-proxy` (programmatic OpenAPI→GraphQL app builder). Prefer the **binaries** above for normal use.

Example (after `npm install -g clawql-mcp` or with local `node_modules/.bin` on `PATH`):

```bash
export CLAWQL_PROVIDER=all-providers
clawql-mcp
```

Run a published package **without** a global install:

```bash
CLAWQL_PROVIDER=all-providers npx clawql-mcp
```

Same pattern with a **local file** (`CLAWQL_SPEC_PATH=…`) or **URL** (`CLAWQL_SPEC_URL=…` / `CLAWQL_DISCOVERY_URL=…`) — see [TL;DR](#tldr).

### Docker

A multi-stage [Distroless](https://github.com/GoogleContainerTools/distroless) image bundles `dist/`, `bin/`, and `providers/` for local spec lookup. Build and run (stdio) are documented in [`docker/README.md`](docker/README.md). The image sets **`CLAWQL_OBSIDIAN_VAULT_PATH=/vault`** so **`memory_ingest`** / **`memory_recall`** can run when `/vault` is mounted; **`sandbox_exec`** still needs **`CLAWQL_SANDBOX_BRIDGE_URL`** and a deployed [sandbox bridge](cloudflare/sandbox-bridge/README.md) (not bundled in the image).

### Remote MCP (HTTP)

ClawQL can run as a networked MCP server using Streamable HTTP:

```bash
PORT=8080 npm run start:http
```

Default endpoint when running locally as above: `http://localhost:8080/mcp` (health: `/healthz`). **Your real URL may differ** (other port, Docker/K8s, tunnel, Cloud Run). For Cursor, use a remote server entry with `"url": "<your-endpoint>/mcp"` — see [`.cursor/mcp.json.example`](.cursor/mcp.json.example) (copy to gitignored `.cursor/mcp.json`) and [`docker/README.md`](docker/README.md).

**From the npm package** (no clone): `PORT=8080 npx -p clawql-mcp clawql-mcp-http`. **From a repo checkout:** `npm run start:http` runs the same binary.

Point your MCP client at `clawql-mcp` on stdio as in [TL;DR](#tldr) (two terminals).

## Installing from GitHub source (instead of npm registry)

If you install directly from git, run **`npm run build`** once so `dist/` exists (the **npm registry** tarball already includes `dist/`).

```bash
npm i github:danielsmithdevelopment/ClawQL
npm run build
```

## Benchmarks and results

These sections compare **planning-context size** (merged specs on disk vs. small `search` / workflow outputs), **not** a per-call API bill. See [Planning-context numbers vs your API bill](#planning-context-numbers-vs-your-api-bill) for caveats.

**Jump to data:**

| Scenario | Workflow output (JSON) | Stats JSON | Markdown write-up |
|----------|------------------------|------------|-------------------|
| **All-providers** complex release-stack | [`workflow-complex-release-stack-latest.json`](docs/workflow-complex-release-stack-latest.json) | [`experiment-all-providers-complex-workflow-stats.json`](docs/benchmarks/all-providers-complex-workflow/experiment-all-providers-complex-workflow-stats.json) | [`experiment-all-providers-complex-workflow.md`](docs/benchmarks/all-providers-complex-workflow/experiment-all-providers-complex-workflow.md) |
| **Default multi-provider** (GKE + Cloudflare + Jira) | [`workflow-multi-provider-latest.json`](docs/workflow-multi-provider-latest.json) | [`experiment-multi-provider-complex-workflow-stats.json`](docs/benchmarks/multi-provider-complex-workflow/experiment-multi-provider-complex-workflow-stats.json) | [`experiment-multi-provider-complex-workflow.md`](docs/benchmarks/multi-provider-complex-workflow/experiment-multi-provider-complex-workflow.md) |

**More:** phase-1/phase-2 token repro ([`latest.json`](docs/benchmarks/latest.json), [`latest.md`](docs/benchmarks/latest.md)) via `npm run benchmark:tokens` — full steps in [`docs/benchmarks/REPRODUCE.md`](docs/benchmarks/REPRODUCE.md). See also [How the two phases save tokens](#how-the-two-phases-save-tokens) below.

### Highlight: All-providers complex release-stack (largest benchmark)

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

### Strong benchmark: Default multi-provider (GKE + Cloudflare + Jira)

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

Tests use [Vitest](https://vitest.dev/) (`npm test`; `pretest` compiles `dist/` for the stdio smoke test). Coverage (v8): `npm run test:coverage` runs **`build` first**, then Vitest with coverage (text summary + HTML under `coverage/`).

```bash
npm test
npm run test:coverage
```

---

## Configure the API spec

Selection is implemented in **two stages** in [`src/spec-loader.ts`](src/spec-loader.ts) (`resolveMultiSpecItems` → else single-spec). Use this as the single precedence story (see also `.env.example`).

### Stage 1 — Multi-spec merge (merged operation index)

Used when any of the following applies (checked in this order):

1. **`CLAWQL_SPEC_PATHS`** — merge these local files (comma, semicolon, or newline separated).
2. **`CLAWQL_PROVIDER`** — if it names a **merged preset** (`google-top50`, `default-multi-provider`, `all-providers`, `atlassian`, …), load that bundle.
3. **`CLAWQL_GOOGLE_TOP50_SPECS`** (`1` / `true` / `yes`) — merge curated **google-top50** if #1–2 did not already select multi-spec.
4. **Built-in default merge** — only if **`CLAWQL_SPEC_PATHS`**, **`CLAWQL_SPEC_PATH`**, **`CLAWQL_SPEC_URL`**, **`CLAWQL_DISCOVERY_URL`**, **`CLAWQL_PROVIDER`**, and **`CLAWQL_GOOGLE_TOP50_SPECS`** are all unset: **Google top50 + Cloudflare + GitHub** (`default-multi-provider`).

If Stage 1 runs, you get one merged **search** index; **`execute`** uses **REST** per spec (see server logs: GraphQL is not used for multi-spec execute).

### Stage 2 — Single spec (first match wins)

If Stage 1 does **not** apply, one document is loaded in this order:

1. **`CLAWQL_SPEC_PATH`** (or `OPENAPI_SPEC_PATH` / `OPENAPI_FILE`)
2. **`CLAWQL_SPEC_URL`** (or `OPENAPI_SPEC_URL`)
3. **`CLAWQL_DISCOVERY_URL`** (or `GOOGLE_DISCOVERY_URL`)
4. **`CLAWQL_PROVIDER`** — **single** bundled vendor (`cloudflare`, `github`, …), not a merged preset
5. Rare fallback if nothing above matches (see code path `kind: "default"`)

**Examples:** `CLAWQL_SPEC_PATH=./openapi.yaml` skips Stage 1 and loads that file. `CLAWQL_PROVIDER=cloudflare` alone is a **single** bundle (Stage 2). Empty env triggers Stage 1’s **default merge**, not a single-spec default.

| Variable | Meaning |
|----------|---------|
| `CLAWQL_SPEC_PATH` | Path to local OpenAPI JSON/YAML (or `OPENAPI_SPEC_PATH`) |
| `CLAWQL_SPEC_PATHS` | Comma/semicolon/newline-separated paths — **merge** many specs in **one** process (overrides single-spec vars when set) |
| `CLAWQL_GOOGLE_TOP50_SPECS` | Curated Google top50 multi-spec mode (`1`/`true`/`yes`) |
| `CLAWQL_SPEC_URL` | URL to fetch OpenAPI JSON/YAML |
| `CLAWQL_DISCOVERY_URL` | Google Discovery JSON URL (e.g. other GCP APIs) |
| `CLAWQL_PROVIDER` | **Merged** preset in Stage 1, or **single** bundled vendor in Stage 2 — see [Configure the API spec](#configure-the-api-spec) (not both at once) |
| `CLAWQL_INTROSPECTION_PATH` | Pregenerated GraphQL introspection JSON (optional; speeds MCP `execute` field matching) |
| `CLAWQL_API_BASE_URL` | Override REST base URL (if spec has no `servers` or you need a different host) |
| `CLAWQL_OBSIDIAN_VAULT_PATH` | Absolute path to an Obsidian Markdown vault (shared volume/NFS). When set, the server **checks** the path exists and is readable/writable at startup. Omit locally to skip the check; container images default to **`/vault`** (see [Docker](docker/README.md)). Used with **[ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent)** and future memory tools. |
| `CLAWQL_SANDBOX_BRIDGE_URL` | Origin of the [sandbox bridge Worker](cloudflare/sandbox-bridge/README.md) (e.g. `https://….workers.dev`). Required for **`sandbox_exec`**. |
| `CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN` | Bearer token for **`POST /exec`**; must match the Worker `BRIDGE_SECRET`. |
| `CLAWQL_CLOUDFLARE_ACCOUNT_ID` | Optional; sent as `CF-Account-ID` on bridge requests. |
| `CLAWQL_SANDBOX_PERSISTENCE_MODE` | Default `session` / `ephemeral` / `persistent` for sandbox tool calls (overridable per call). |
| `CLAWQL_SANDBOX_TIMEOUT_MS` | Max wait for each bridge request (default `120000`). |
| `CLAWQL_MEMORY_RECALL_SCAN_ROOT` | Subfolder under the vault to scan (default `Memory`). Set to empty to scan the whole vault. |
| `CLAWQL_MEMORY_RECALL_LIMIT` | Default max notes returned by **`memory_recall`** (`10`). |
| `CLAWQL_MEMORY_RECALL_MAX_DEPTH` | Default wikilink hops from a keyword hit (`2`). |
| `CLAWQL_MEMORY_RECALL_MIN_SCORE` | Minimum keyword score to seed a note (`1`). |
| `CLAWQL_MEMORY_RECALL_MAX_FILES` | Safety cap on Markdown files scanned (`2000`). |
| `CLAWQL_MEMORY_RECALL_SNIPPET_CHARS` | Snippet length in characters (`520`). |
| `CLAWQL_MEMORY_DB` | Set to **`0`** to disable the **`memory.db`** sidecar (no sync after ingest, no wikilink merge in recall). |
| `CLAWQL_MEMORY_DB_PATH` | SQLite file path: default **`memory.db`** under the vault; may be an **absolute** path. See [`docs/memory-db-schema.md`](docs/memory-db-schema.md). |
| `CLAWQL_MEMORY_DB_SYNC_ON_RECALL` | Set to **`1`** to rewrite **`memory.db`** from every **`memory_recall`** scan (optional; heavier than ingest-only sync). |
| `CLAWQL_MEMORY_CHUNK_MAX_CHARS` | `paragraph_v1` chunker max window size before hard-split (`2000`). |
| `CLAWQL_VECTOR_BACKEND` | **`sqlite`** — vector recall uses **in-process KNN** over float32 BLOBs in **`memory.db`**. **`postgres`** — recall uses **pgvector** (`<=>`) when Postgres is available; **the same vectors are always written to `memory.db` too** (portability + fallback). Requires **`memory.db`** enabled (not **`CLAWQL_MEMORY_DB=0`**) + embedding API key; postgres mode also needs **`CLAWQL_VECTOR_DATABASE_URL`**. Default: off. |
| `CLAWQL_VECTOR_DATABASE_URL` | Postgres connection string when **`CLAWQL_VECTOR_BACKEND=postgres`** (database must have **`CREATE EXTENSION vector`** — the server runs **`CREATE EXTENSION IF NOT EXISTS vector`** on first use). |
| `CLAWQL_EMBEDDING_DIMENSION` | Vector width for the pgvector column and API validation (default **`1536`**, e.g. `text-embedding-3-small`). See **[`docs/hybrid-memory-backends.md`](docs/hybrid-memory-backends.md)** for SQLite vs Postgres roles. |
| `CLAWQL_EMBEDDING_BASE_URL` | OpenAI-compatible API base (default `https://api.openai.com/v1`). |
| `CLAWQL_EMBEDDING_MODEL` | Embedding model id (default `text-embedding-3-small`). |
| `CLAWQL_EMBEDDING_API_KEY` | API key for embeddings (falls back to **`OPENAI_API_KEY`**). |
| `CLAWQL_MEMORY_VECTOR_MIN_SIM` | Min cosine similarity (0–1) to seed **`memory_recall`** from vectors (`0.28`). |
| `CLAWQL_MEMORY_VECTOR_SCORE_BOOST` | Scale vector similarity into lexical score space for ranking (`50`). |
| `CLAWQL_MEMORY_VECTOR_TOP_CHUNKS` / `CLAWQL_MEMORY_VECTOR_MAX_DOCS` | Caps for vector KNN candidate chunks / distinct notes (`80` / `12`). |
| `CLAWQL_GITHUB_TOKEN` | GitHub PAT / fine-grained token for **`execute`** when the operation is from the **github** spec (or `CLAWQL_PROVIDER=github`). Also accepts **`GITHUB_TOKEN`** / **`GH_TOKEN`**. |
| `CLAWQL_CLOUDFLARE_API_TOKEN` | Cloudflare API token for **`execute`** when the operation is from the **cloudflare** spec (or `CLAWQL_PROVIDER=cloudflare`). Also accepts **`CLOUDFLARE_API_TOKEN`**. |
| `CLAWQL_GOOGLE_ACCESS_TOKEN` | OAuth access token for **Google Cloud** APIs (`compute-v1`, … top50 slugs, or `CLAWQL_PROVIDER=google` / `google-top50`). Also accepts **`GOOGLE_ACCESS_TOKEN`**. |
| `CLAWQL_BEARER_TOKEN` | Fallback bearer when a provider-specific token is not set; also used for non-Google merged vendors (e.g. Jira in **`all-providers`**). |

**GCP multi-service:** use **`CLAWQL_GOOGLE_TOP50_SPECS=1`**, **`CLAWQL_PROVIDER=google-top50`**, or **`CLAWQL_SPEC_PATHS`** so `search` / `execute` see every merged API in one server; `execute` uses REST in that mode. For **every bundled vendor** (Google top50 + Jira, Bitbucket, Cloudflare, GitHub, Slack, Sentry, n8n), use **`CLAWQL_PROVIDER=all-providers`**. See [`docs/workflow-gcp-multi-service.md`](docs/workflow-gcp-multi-service.md).  
**Integration check:** `npm run workflow:gcp-multi` runs **`tools/call` → `search`** over real MCP stdio and writes `docs/workflow-gcp-multi-latest.json` (full `CallToolResult` + parsed body). `npm run workflow:gcp-multi:direct` is a faster in-process-only variant for debugging rankers. One-page results summary: [`docs/gcp-multi-mcp-test-summary.md`](docs/gcp-multi-mcp-test-summary.md). Detailed experiment write-up (queries, APIs, token heuristic, MCP samples): [`docs/experiment-gcp-multi-mcp-workflow.md`](docs/experiment-gcp-multi-mcp-workflow.md); `npm run report:gcp-multi-experiment` refreshes [`docs/experiment-gcp-multi-mcp-stats.json`](docs/experiment-gcp-multi-mcp-stats.json).

The default **first-run** bundle is **Stage 1 #4** above (**Google top50 + Cloudflare + GitHub**). Set **`CLAWQL_GOOGLE_ACCESS_TOKEN`** (or **`GOOGLE_ACCESS_TOKEN`**), **`CLAWQL_CLOUDFLARE_API_TOKEN`**, and **`CLAWQL_GITHUB_TOKEN`** so **`execute`** can call all three. To use another bundled spec or merged preset, set **`CLAWQL_PROVIDER`** — e.g. **`google`**,
**`atlassian`**, **`cloudflare`**, **`github`**, **`slack`**, **`sentry`**, or **`n8n`**
(see `providers/README.md`; **`all-providers`** = top50 + all other bundled vendors).  
Compatibility aliases currently also exist for **`jira`** and **`bitbucket`**.  
If a bundled file is missing, the provider registry **fallback URL** is fetched
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

**Same scenario via real MCP (`search`, dry run by default):** `npm run workflow:complex-release-stack:mcp` runs **`search`** only (no **`execute`** → no upstream REST). Spawns the stdio server, or set **`CLAWQL_MCP_URL`** (e.g. `http://127.0.0.1:8080/mcp`) for an HTTP server that must use **`all-providers`**. For optional **`execute`** smoke tests with placeholder args: **`WORKFLOW_MCP_EXECUTE=1`** or **`npm run workflow:complex-release-stack:mcp:live`**. Writes [`docs/workflow-complex-release-stack-mcp-latest.json`](docs/workflow-complex-release-stack-mcp-latest.json).

See `.env.example` for a full list.

### Obsidian vault (optional)

Set **`CLAWQL_OBSIDIAN_VAULT_PATH`** when you mount a directory for **Obsidian**-compatible Markdown (e.g. alongside **[ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent)** or **`memory_ingest` / `memory_recall`**). If unset or empty, no vault check runs. If set, startup fails fast when the path is missing, not a directory, or not readable/writable. Implementation helpers live in **`src/vault-config.ts`** and **`src/vault-utils.ts`** (safe paths + cooperative write lock under the vault root).

**Concepts (why a vault):** Long-running agents often avoid *only* stuffing context with retrieved chunks. A complementary pattern—sometimes called **Karpathy-style** or an **“LLM wiki”**—is to **compile** durable notes as Markdown on disk and **link** them with **`[[wikilinks]]`**, so memory **compounds** across sessions. **Obsidian** is a common viewer (plain files, graph + backlinks); the agent writes; humans browse and edit. That pattern is sketched in [Karpathy’s `llm-wiki` gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f). ClawQL’s **`memory_ingest`** writes under **`Memory/`** when the vault path is set. See **[`docs/memory-obsidian.md`](docs/memory-obsidian.md)** for a fuller background.

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
  └─▶ MCP Server  (stdio / HTTP)
        ├─▶ search tool  ──▶ In-memory spec search  (zero latency, zero tokens)
        ├─▶ execute tool  ──▶ GraphQL Client ──▶ GraphQL Proxy (localhost:4000) ──▶ REST API
        ├─▶ sandbox_exec  ──▶ HTTPS ──▶ Cloudflare Sandbox bridge Worker (optional)
        └─▶ memory_ingest / memory_recall  ──▶ Obsidian vault on disk (optional)
```
An agent connects to ClawQL over MCP and registers **up to five tools** (see [`docs/mcp-tools.md`](docs/mcp-tools.md)):

- **`search`** — in-memory operation index from the loaded spec(s); no upstream HTTP.
- **`execute`** — GraphQL proxy (single-spec) or REST (multi-spec) for lean responses.
- **`sandbox_exec`** — run snippet in remote Cloudflare Sandbox via **`CLAWQL_SANDBOX_BRIDGE_URL`** (not local execution).
- **`memory_ingest`** / **`memory_recall`** — require **`CLAWQL_OBSIDIAN_VAULT_PATH`**.

Core API workflow remains **`search` → `execute`**. Optional tools do not replace the GraphQL proxy for REST APIs.

In multi-spec mode, ClawQL keeps one merged operation index for discovery and executes each operation against its owning spec.

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

**Core tools:** **`search`** and **`execute`** (see [Architecture](#architecture)). **`sandbox_exec`** runs snippets in **Cloudflare Sandboxes** through the HTTP bridge in [`cloudflare/sandbox-bridge/`](cloudflare/sandbox-bridge/README.md) (set **`CLAWQL_SANDBOX_BRIDGE_URL`** and **`CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN`** — see `.env.example`). The tool name avoids confusion with “coding locally”; arguments still use a **`code`** field for the source string. **`memory_ingest`** / **`memory_recall`** need a configured vault (see [Obsidian vault](#obsidian-vault-optional)). Orchestration-specific features live in **[ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent)**; deeper MCP ideas may be tracked in new issues (e.g. semantic search in **[#16](https://github.com/danielsmithdevelopment/ClawQL/issues/16)**).

| Tool | Description |
|---|---|
| `search` | Search the active OpenAPI/Discovery spec by natural language intent |
| `execute` | Run a discovered operation by `operationId`, with optional GraphQL field selection |
| `sandbox_exec` | Remote sandbox: pass **`code`** (source) + **`language`**; not your local shell |
| `memory_ingest` | Compile insights / tool output / conversation into Obsidian notes (`Memory/…`) when the vault path is set — see [`docs/memory-obsidian.md`](docs/memory-obsidian.md) |
| `memory_recall` | Keyword search over vault Markdown plus `[[wikilinks]]` hops; optional vector KNN when **`CLAWQL_VECTOR_BACKEND`** is **`sqlite`** or **`postgres`** and embeddings are configured (see env table) |

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

### Optional tools (quick examples)

**`sandbox_exec`** (**deploy [cloudflare/sandbox-bridge](cloudflare/sandbox-bridge/README.md) first**). The **`code`** key is the snippet body sent to the remote sandbox:

```json
{ "code": "print('ok')", "language": "python", "sessionId": "s1" }
```

Vault (**set `CLAWQL_OBSIDIAN_VAULT_PATH`**):

```json
{ "title": "Runbook", "insights": "Remember to rotate tokens.", "wikilinks": ["Security"] }
```

```json
{ "query": "rotate token kubernetes", "limit": 5, "maxDepth": 2 }
```

More parameters and env defaults: **[`docs/mcp-tools.md`](docs/mcp-tools.md)**.

---

## Claude Desktop / Cursor config

**Streamable HTTP** (e.g. `npm run start:http`, Docker, or Kubernetes): in Cursor, add an MCP server with a **`url`** (not `command`). Copy [`.cursor/mcp.json.example`](.cursor/mcp.json.example) to **`.cursor/mcp.json`** (ignored by git) and set `url` to your MCP base (defaults in the example match local compose/K8s); or use **`~/.cursor/mcp.json`** for all workspaces. See [`docker/README.md`](docker/README.md) for deployment URLs and [Cursor’s MCP docs](https://cursor.com/docs/context/mcp) for `${env:…}` interpolation.

**stdio** — **Installed from npm** (recommended): use `npx` with `-p clawql-mcp` and the
binary name:

```json
{
  "mcpServers": {
    "clawql": {
      "command": "npx",
      "args": ["-p", "clawql-mcp", "clawql-mcp"],
      "env": {
        "CLAWQL_SPEC_PATH": "/absolute/path/to/openapi.yaml"
      }
    }
  }
}
```

**From a git checkout** (development):

```json
{
  "mcpServers": {
    "clawql": {
      "command": "node",
      "args": ["/absolute/path/to/ClawQL/dist/server.js"],
      "env": {
        "CLAWQL_SPEC_PATH": "/absolute/path/to/openapi.yaml"
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

## Cloud Run deployment (remote MCP)

Run ClawQL in Cloud Run as one service (**`clawql-mcp-http`**: MCP at **`/mcp`**, GraphQL at **`/graphql`** on the same URL).

Use the one-shot deployment script:

```bash
PROJECT_ID="your-project-id" \
REGION="us-central1" \
bash scripts/deploy-cloud-run.sh
```

Or via `make`:

```bash
PROJECT_ID="your-project-id" REGION="us-central1" make deploy-cloud-run
```

After deploy, point agents at:

- `https://<mcp-service-url>/mcp`

Full guide + options are in [`docs/deploy-cloud-run.md`](docs/deploy-cloud-run.md).

---

## Kubernetes (local MCP on Docker Desktop)

Run **MCP Streamable HTTP** in a local cluster so clients can use a fixed URL (typically **`http://localhost:8080/mcp`**) instead of stdio. **`/graphql`** is on the same service.

1. Enable **Kubernetes** in Docker Desktop.
2. From the repo root:

   ```bash
   make local-k8s-up
   # or: bash scripts/local-k8s-docker-desktop.sh
   ```

   This builds **`clawql-mcp:latest`**, applies **`docker/kustomize/overlays/local`**, and waits for rollouts. The script uses the **`docker-desktop`** kubectl context when present.

3. **Health:** `curl -s http://localhost:8080/healthz` should return `{"status":"ok",...}` before connecting the client.
4. **GitHub + Cloudflare + Google auth:** `bash scripts/k8s-docker-desktop-set-github-token.sh` (optional `CLAWQL_CLOUDFLARE_API_TOKEN` and `GOOGLE_ACCESS_TOKEN` / `CLAWQL_GOOGLE_ACCESS_TOKEN` in the environment). See [`docker/README.md`](docker/README.md).

**Teardown:** `kubectl --context docker-desktop delete namespace clawql`

Longer-form docs for operators: [`website/src/app/kubernetes/page.mdx`](website/src/app/kubernetes/page.mdx) (served at **`/kubernetes`** when you run the Next.js site in **`website/`**).

**Remote clusters** (`dev` / `prod` overlays, registry image + tag):

```bash
ENV=dev IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp TAG=<tag> make deploy-k8s
```

See [`docs/deploy-k8s.md`](docs/deploy-k8s.md).

---

## Extending the server

The default API surface is **`search`** and **`execute`**; **`sandbox_exec`** calls **`src/sandbox-bridge-client.ts`**; **`memory_ingest`** / **`memory_recall`** use **`src/memory-ingest.ts`**, **`src/memory-recall.ts`**, and **`src/vault-config.ts`** / **`src/vault-utils.ts`**. To add more tools
(see **[ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent)** for product-level extensions), register them in `src/tools.ts` the same way (`server.tool(...)`).

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
2. Run `npm test` (runs `pretest` → `build`, then Vitest).
3. `@modelcontextprotocol/sdk` is pinned with a **1.27.x–compatible** semver range (`^1.27.1`); bump intentionally when upgrading the SDK.
4. Never commit secrets: use `.env` locally (ignored); see `.env.example` for
   documented variables.
5. `dist/` and `node_modules/` are gitignored — build before release or let CI
   produce `dist/` for consumers who install from npm.