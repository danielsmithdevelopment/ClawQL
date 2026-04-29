# OpenClaw + ClawQL MCP — bootstrap and smoke tests

This runbook supports **[#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226)** (Phase 0 wiring). OpenClaw itself is **not** built in this repo; track the umbrella narrative in **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)**.

**After this path is green:** comment on **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)** with a pointer here + PR link so Phase 0 stays traceable.

**IDP skill profile (agents/operators):** **[`openclaw-idp-skill-profile.md`](openclaw-idp-skill-profile.md)** ([#227](https://github.com/danielsmithdevelopment/ClawQL/issues/227)) — canonical tools, provider matrix, and workflow contract.

## What “green” means

1. ClawQL MCP serves tools over **stdio** or **Streamable HTTP** with a documented env matrix.
2. OpenClaw (or any MCP client) registers that server using the **same** command/URL shape as Cursor’s `mcp.json`.
3. You complete the **smoke checklist** below (or run the repo script) with clear pass/fail.

## Register ClawQL in OpenClaw

Follow **your OpenClaw version’s** MCP docs for `mcp set` / UI equivalent. The ClawQL side mirrors **[`docs/readme/deployment.md`](../readme/deployment.md)**:

| Mode | What you register |
|------|-------------------|
| **Stdio** | Command: `npx` (or `node` to `dist/server.js` after `npm run build`), args: `-y`, `clawql-mcp` — plus env vars below. Working directory: optional; use repo root if developing from source. |
| **HTTP** | URL ending in **`/mcp`** (e.g. `http://localhost:8080/mcp`). Run **`npm run start:http`** or your Helm/K8s Service URL. |

Cursor template: **`.cursor/mcp.json.example`** at repo root.

**OpenClaw CLI-shaped registration (illustrative — align with your OpenClaw version):**

```bash
# Stdio from published package (adjust env file path)
openclaw mcp set clawql -- \
  env -i HOME="$HOME" PATH="$PATH" \
  bash -lc 'set -a; [ -f ~/.config/clawql/idp.env ] && . ~/.config/clawql/idp.env; exec npx -y clawql-mcp'

# HTTP MCP already listening on port 8080
openclaw mcp set clawql-url --url 'http://localhost:8080/mcp'
```

**Private tailnets:** use MagicDNS or Tailscale Serve HTTPS URLs for **`/mcp`**, aligned with **`docs/deployment/tailscale-and-headscale-for-clawql.md`**.

## Baseline env matrix (IDP-oriented)

Unset typically means **on** for memory and documents; see **[`docs/readme/configuration.md`](../readme/configuration.md)**.

| Goal | Variables (examples) |
|------|----------------------|
| Core **`search` / `execute`** | Default; optional **`CLAWQL_PROVIDER=all-providers`** |
| Document pipeline tools (**`ingest_external_knowledge`**, bundled Tika/Gotenberg/Stirling/Paperless in index) | **`CLAWQL_ENABLE_DOCUMENTS=1`** (default). To hide: **`CLAWQL_ENABLE_DOCUMENTS=0`**. |
| Onyx **`knowledge_search_onyx`** | **`CLAWQL_ENABLE_ONYX=1`** and documents still enabled; set **`ONYX_BASE_URL`** + auth per **[`docs/onyx-knowledge-tool.md`](../onyx-knowledge-tool.md)** |
| Ouroboros **`ouroboros_*`** | **`CLAWQL_ENABLE_OUROBOROS=1`** |
| Vault memory **`memory_*`** | Writable **`CLAWQL_OBSIDIAN_VAULT_PATH`** for real I/O |
| External ingest (non-stub imports) | **`CLAWQL_EXTERNAL_INGEST=1`**; optional **`CLAWQL_EXTERNAL_INGEST_FETCH=1`** for URL fetch |
| Privacy filter (deployment-specific) | If **your** stack defines **`CLAWQL_ENABLE_PRIVACY_FILTER=1`** (or equivalent), document it **beside** ClawQL — not in core **`.env.example`** today. |

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

| Step | Action | Pass |
|------|--------|------|
| 1 | In OpenClaw, send a prompt that triggers **`search`** for a GitHub operation (e.g. list commits) and then **`execute`** with lean **`fields`**. | JSON result; no MCP transport error. |
| 2 | **Document path:** call **`ingest_external_knowledge`** per **[`docs/external-ingest.md`](../external-ingest.md)** (vault path + **`CLAWQL_EXTERNAL_INGEST=1`** as needed). | Success payload or documented preview when dry-run. |
| 3 | **Privacy:** confirm your deployment’s redaction/policy behavior (if any) on a sample doc — align with ops runbooks. | Matches expected policy. |
| 4 | **Transform (optional):** **`execute`** a Stirling/Gotenberg **`operationId`** only when those bases are up. | PDF/transform response as expected. |

## Troubleshooting

| Symptom | Check |
|---------|--------|
| OpenClaw cannot connect to MCP | Stdio: command on `PATH`, **`npx`** can resolve **`clawql-mcp`**. HTTP: firewall, **`PORT`**, URL includes **`/mcp`**. |
| **`listTools`** missing document tools | **`CLAWQL_ENABLE_DOCUMENTS=0`** not set; rebuild/restart server. |
| **`execute`** 401 from GitHub | **`CLAWQL_BEARER_TOKEN`** / **`gh auth token`** for private repos. |
| gRPC native protocols | **[`ENABLE_GRPC=1`](../readme/deployment.md#optional-grpc-transport)** — separate from OpenClaw MCP bridge over HTTP/stdio. |

## Related issues

- **[#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226)** — bootstrap acceptance (this doc + **`npm run smoke:openclaw-bootstrap`**).
- **[#227](https://github.com/danielsmithdevelopment/ClawQL/issues/227)** — **[IDP skill profile](openclaw-idp-skill-profile.md)** (canonical matrix + workflow).
- **[#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)** — ecosystem / OpenClaw + Agent umbrella (**cross-link Phase 0 here when closing #226**).
