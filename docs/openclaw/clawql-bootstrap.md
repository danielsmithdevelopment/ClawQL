# OpenClaw + ClawQL MCP — bootstrap and smoke tests

**Full guide (install OpenClaw, HTTP vs stdio, `openclaw mcp set`, remote access, troubleshooting):** **[`using-openclaw-with-clawql.md`](using-openclaw-with-clawql.md)** — website **`/openclaw`**.

This runbook supports **[#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226)** (Phase 0 wiring). OpenClaw itself is **not** built in this repo; track the umbrella narrative in **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)**.

**After this path is green:** comment on **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)** with a pointer here + PR link so Phase 0 stays traceable.

**IDP skill profile (agents/operators):** **[`openclaw-idp-skill-profile.md`](openclaw-idp-skill-profile.md)** ([#227](https://github.com/danielsmithdevelopment/ClawQL/issues/227)) — canonical tools, provider matrix, and workflow contract.

## What “green” means

1. ClawQL MCP serves tools over **stdio** or **Streamable HTTP** with a documented env matrix.
2. OpenClaw (or any MCP client) registers that server using the **same** command/URL shape as Cursor’s `mcp.json`.
3. You complete the **smoke checklist** below (or run the repo script) with clear pass/fail.

## Hands-on sequence (ClawQL repo → OpenClaw)

Use this when you want OpenClaw to call ClawQL for the first time. OpenClaw itself is installed and updated **outside** this repo.

### 1. Prove ClawQL in this repo

```bash
cd /path/to/ClawQL
npm ci   # or npm install
npm run build
CLAWQL_OPENCLAW_BOOTSTRAP_TOOLS_ONLY=1 npm run smoke:openclaw-bootstrap
```

You should see **`OK (tools-only)`** at the end. That uses the same **stdio** MCP wiring OpenClaw would use for a **local** server (`dist/server.js` + MCP SDK transport).

**Optional — full `search` → `execute` (GitHub list commits):** needs **network** access and **`gh auth login`** or **`CLAWQL_BEARER_TOKEN`** / **`GITHUB_TOKEN`** for the live GitHub API:

```bash
npm run smoke:openclaw-bootstrap
```

### 2. Start Streamable HTTP (often easiest for OpenClaw)

After **`npm run build`**, in a **dedicated terminal** leave this running:

```bash
PORT=8080 npm run start:http
```

- Health: **`GET http://127.0.0.1:8080/healthz`**
- MCP endpoint for OpenClaw: **`http://127.0.0.1:8080/mcp`** (path must be **`/mcp`**)

Published package equivalent: **`npx -p clawql-mcp clawql-mcp-http`** with the same **`PORT`** (see **[`docs/readme/deployment.md`](../readme/deployment.md)**).

### 3. Register that URL in OpenClaw

In OpenClaw’s MCP settings (or CLI — syntax varies by release), add a server whose **base URL** is **`http://localhost:8080/mcp`** or **`http://127.0.0.1:8080/mcp`**. Match **[Register ClawQL in OpenClaw](#register-clawql-in-openclaw)** below.

### 4. Try one prompt in OpenClaw

Ask for a flow that uses **`search`** then **`execute`** (for example GitHub commits), aligned with the **[manual checklist](#manual-checklist-openclaw--clawql)** row 1. If tools fail, confirm the HTTP server from step 2 is still running and the URL includes **`/mcp`**.

### Stdio instead of HTTP

Point OpenClaw at **`npx -y clawql-mcp`** (or **`node /path/to/ClawQL/dist/server.js`** after build), with optional env from **`~/.config/clawql/idp.env`** or your shell — same idea as the illustrative **`openclaw mcp set`** block below.

## Register ClawQL in OpenClaw

Follow **your OpenClaw version’s** MCP docs for `mcp set` / UI equivalent. The ClawQL side mirrors **[`docs/readme/deployment.md`](../readme/deployment.md)**:

| Mode      | What you register                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stdio** | Command: `npx` (or `node` to `dist/server.js` after `npm run build`), args: `-y`, `clawql-mcp` — plus env vars below. Working directory: optional; use repo root if developing from source. |
| **HTTP**  | URL ending in **`/mcp`** (e.g. `http://localhost:8080/mcp`). Run **`npm run start:http`** or your Helm/K8s Service URL.                                                                     |

Cursor template: **`.cursor/mcp.json.example`** at repo root.

**Install OpenClaw CLI** (Node **20+**): **`npm install -g openclaw`**. Verify: **`openclaw --version`**. Docs use **`openclaw mcp`** — run **`openclaw mcp --help`** / **`openclaw mcp set --help`** for your installed version.

**Register ClawQL** — OpenClaw **2026.x** expects **`openclaw mcp set <name> '<json>'`** (not shell-wrapped commands):

```bash
# Streamable HTTP — ClawQL listening on PORT (e.g. start:http → http://127.0.0.1:8080/mcp)
openclaw mcp set clawql '{"url":"http://127.0.0.1:8080/mcp"}'

# Stdio — published package (same as Cursor-style npx clawql-mcp)
openclaw mcp set clawql '{"command":"npx","args":["-y","clawql-mcp"]}'
```

Add **`env`** keys inside the JSON if you need **`CLAWQL_*`** variables (same shape as Cursor **`mcp.json`**). **`openclaw mcp list`** / **`openclaw mcp show clawql`** to confirm; **`openclaw mcp unset clawql`** to remove.

**Note:** **`openclaw-mcp`** on npm is a **different** package (MCP bridge toward an OpenClaw gateway for hosts like Claude Desktop). For **`openclaw mcp set`** pointing at ClawQL, use **`clawql-mcp`** / **`node …/dist/server.js`** / **`url`** as above — see **`npm view openclaw-mcp`** vs **`npm view clawql-mcp`**.

**Private tailnets:** use MagicDNS or Tailscale Serve HTTPS URLs for **`/mcp`**, aligned with **`docs/deployment/tailscale-and-headscale-for-clawql.md`**.

## Baseline env matrix (IDP-oriented)

Unset typically means **on** for memory and documents; see **[`docs/readme/configuration.md`](../readme/configuration.md)**.

| Goal                                                                                                          | Variables (examples)                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core **`search` / `execute`**                                                                                 | Default; optional **`CLAWQL_PROVIDER=all-providers`**                                                                                                                                                                  |
| Document pipeline tools (**`ingest_external_knowledge`**, bundled Tika/Gotenberg/Stirling/Paperless in index) | **`CLAWQL_ENABLE_DOCUMENTS=1`** (default). To hide: **`CLAWQL_ENABLE_DOCUMENTS=0`**.                                                                                                                                   |
| Onyx **`knowledge_search_onyx`**                                                                              | **`CLAWQL_ENABLE_ONYX=1`** and documents still enabled; set **`ONYX_BASE_URL`** + auth per **[`docs/onyx-knowledge-tool.md`](../onyx-knowledge-tool.md)**                                                              |
| Ouroboros **`ouroboros_*`**                                                                                   | **`CLAWQL_ENABLE_OUROBOROS=1`**                                                                                                                                                                                        |
| Vault memory **`memory_*`**                                                                                   | Writable **`CLAWQL_OBSIDIAN_VAULT_PATH`** for real I/O                                                                                                                                                                 |
| External ingest (non-stub imports)                                                                            | **`CLAWQL_EXTERNAL_INGEST=1`**; optional **`CLAWQL_EXTERNAL_INGEST_FETCH=1`** for URL fetch                                                                                                                            |
| Privacy filter (deployment-specific)                                                                          | If **your** stack defines **`CLAWQL_ENABLE_PRIVACY_FILTER=1`** (or equivalent), document it **beside** ClawQL — not in core **`.env.example`** today.                                                                  |
| HITL / Label Studio ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228))                     | **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`**, **`CLAWQL_LABEL_STUDIO_URL`**, **`CLAWQL_LABEL_STUDIO_API_TOKEN`**, webhook **`CLAWQL_HITL_WEBHOOK_TOKEN`** — see **[`docs/hitl-label-studio.md`](../hitl-label-studio.md)**. |

**Privacy / redaction:** Enterprise deployments may inject redaction or policy in front of the document stack (Helm values, sidecars). There is **no single** core-repo **`CLAWQL_ENABLE_*`** toggle for all “privacy filter” stories; validate against **your** chart and **[`docs/enterprise-mcp-tools.md`](../enterprise-mcp-tools.md#regulated-deployments)** for regulated environments.

**Gotenberg / Stirling “transform” smokes:** Require reachable **`GOTENBERG_BASE_URL`**, **`STIRLING_PDF_BASE_URL`**, **`TIKA_BASE_URL`**, etc., when not using defaults from your environment. Without those services, skip extended smokes and stay on **core + ingest stub/preview** paths.

## Automated smoke (CI-friendly)

From repo root after a build:

```bash
npm run build
npm run smoke:openclaw-bootstrap
```

This checks MCP **`listTools`** for **`search`** / **`execute`**, runs **`search` → `execute`** against the **bundled GitHub** provider (offline specs), and asserts **`ingest_external_knowledge`** is listed when documents are enabled.

**Pass:** script exits **0** and prints **`OK`**.  
**Fail:** non-zero exit; stderr shows the failing step.

Optional env (same as **`scripts/workflows/smoke-github-commits.mjs`**): **`GITHUB_OWNER`**, **`GITHUB_REPO`**, **`CLAWQL_BEARER_TOKEN`** / **`gh auth login`**.

To smoke **without** the GitHub execute step (tools-only):

```bash
CLAWQL_OPENCLAW_BOOTSTRAP_TOOLS_ONLY=1 npm run smoke:openclaw-bootstrap
```

## Manual checklist (OpenClaw → ClawQL)

Use this when validating through the OpenClaw UI (mirrors what the script proves against stdio).

| Step | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Pass                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1    | In OpenClaw, send a prompt that triggers **`search`** for a GitHub operation (e.g. list commits) and then **`execute`** with lean **`fields`**.                                                                                                                                                                                                                                                                                                                                                                                                               | JSON result; no MCP transport error.                  |
| 2    | **Document path:** call **`ingest_external_knowledge`** per **[`docs/external-ingest.md`](../external-ingest.md)** (vault path + **`CLAWQL_EXTERNAL_INGEST=1`** as needed).                                                                                                                                                                                                                                                                                                                                                                                   | Success payload or documented preview when dry-run.   |
| 3    | **Privacy:** confirm your deployment’s redaction/policy behavior (if any) on a sample doc — align with ops runbooks.                                                                                                                                                                                                                                                                                                                                                                                                                                          | Matches expected policy.                              |
| 4    | **Transform (optional):** **`execute`** a Stirling/Gotenberg **`operationId`** only when those bases are up.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | PDF/transform response as expected.                   |
| 5    | **Observability (optional):** confirm **`GET /metrics`** is scraped by Prometheus and import **[`docs/grafana/clawql-core-observability.json`](../grafana/clawql-core-observability.json)** per **[`docs/grafana/README.md`](../grafana/README.md)** (Helm **`metrics.prometheusScrapeAnnotations`** defaults help Istio sample Prometheus). Deep-link Grafana from your ops hub; OpenClaw UI embedding is **[#225](https://github.com/danielsmithdevelopment/ClawQL/issues/225)** / **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)**. | Panels show native-protocol series; links documented. |

## Observability (Grafana / Prometheus)

After MCP is healthy, operators typically want **metrics** and a **dashboard**:

1. **Scrape** **`clawql-mcp-http`** **`GET /metrics`** (OpenMetrics). With **Helm**, default **`metrics.prometheusScrapeAnnotations.enabled: true`** annotates the Service for common Prometheus setups; see **[`charts/clawql-mcp/README.md`](../../charts/clawql-mcp/README.md)** and **[`docs/deployment/helm.md`](../deployment/helm.md)**.
2. **Import** **`docs/grafana/clawql-core-observability.json`** into Grafana — full steps and Istio dashboard IDs in **[`docs/grafana/README.md`](../grafana/README.md)**.
3. **OpenClaw:** embedding Grafana or curated deep links in the OpenClaw UI is **not** implemented here; track **[#225](https://github.com/danielsmithdevelopment/ClawQL/issues/225)** (follow-ups) and **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)** (ecosystem). Phase 0 bootstrap ([#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226)) does **not** require Grafana.

## Troubleshooting

| Symptom                                | Check                                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| OpenClaw cannot connect to MCP         | Stdio: command on `PATH`, **`npx`** can resolve **`clawql-mcp`**. HTTP: firewall, **`PORT`**, URL includes **`/mcp`**.      |
| **`listTools`** missing document tools | **`CLAWQL_ENABLE_DOCUMENTS=0`** not set; rebuild/restart server.                                                            |
| **`execute`** 401 from GitHub          | **`CLAWQL_BEARER_TOKEN`** / **`gh auth token`** for private repos.                                                          |
| gRPC native protocols                  | **[`ENABLE_GRPC=1`](../readme/deployment.md#optional-grpc-transport)** — separate from OpenClaw MCP bridge over HTTP/stdio. |

## Related issues

- **[#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226)** — bootstrap acceptance (this doc + **`npm run smoke:openclaw-bootstrap`**).
- **[#227](https://github.com/danielsmithdevelopment/ClawQL/issues/227)** — **[IDP skill profile](openclaw-idp-skill-profile.md)** (canonical matrix + workflow).
- **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)** — ecosystem / OpenClaw + Agent umbrella (**cross-link Phase 0 here when closing #226**).
- **[#225](https://github.com/danielsmithdevelopment/ClawQL/issues/225)** — Grafana follow-ups (OpenClaw exposure + extra `/metrics` panels); umbrella **[#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210)** closed.
