# External bulk ingest (`ingest_external_knowledge`)

**Status:** Implemented for **Markdown bulk import** and **opt-in URL fetch** ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)). **Full-repo GitHub** and **Notion / Confluence / Linear / Jira** connectors are specified in **[roadmap/knowledge-lake-roadmap.md](roadmap/knowledge-lake-roadmap.md)** (phased implementation).

## Env

| Variable                             | Role                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **`CLAWQL_EXTERNAL_INGEST=1`**       | Enables the tool (must be exactly `1`, same as optional-flags parser).                                                 |
| **`CLAWQL_EXTERNAL_INGEST_FETCH=1`** | Allows **`url`** mode to perform **`fetch()`** (HTTPS; **`http`** only for **`localhost`** / **`127.0.0.1`**).         |
| **`CLAWQL_OBSIDIAN_VAULT_PATH`**     | Required for any **write** or URL import. Without it, a **no-payload** call still returns roadmap JSON (`stub: true`). |

## Modes

### 1. Markdown (`documents[]`)

- **`documents`**: `[{ "path": "Memory/imports/note.md", "markdown": "…" }]` — up to **50** files, ~**2 MiB** UTF-8 per body.
- Paths are vault-relative, must end with **`.md`**, no **`..`** (same rules as **`memory_ingest`** / `resolveVaultPath`).
- **`dryRun`** defaults **`true`**. Set **`dryRun: false`** to write.
- Invalid entries are reported in **`documentErrors`**; valid paths still import.

### 2. URL (`source: "url"` + `url`)

- Requires **`CLAWQL_EXTERNAL_INGEST_FETCH=1`**.
- **`url`**: `https://…` (or **`http://127.0.0.1:…`** / **`localhost`** for local tests).
- Optional **`scope`**: vault-relative **`.md`** path; default **`Memory/external/<slug>.md`** from the URL path.
- Body is stored with frontmatter (`clawql_external_ingest`, `source_url`) and the raw response in a fenced **`text`** block (safe default for HTML/JSON).

### 3. Roadmap preview (no payload)

- Omit **`documents`** and **`url`**: returns **`stub: true`**, **`roadmap[]`**, **`relatedIssues`** — no vault required; with vault + **`memory.db`**, optional **`merkleSnapshot`** / **`cuckooMembershipReady`** mirror the previous preview behavior.

## Pipeline

After successful writes (not dry-run): **`withVaultWriteLock`** → **`syncMemoryDbForVaultScanRoot`** → **`updateProviderIndexPage`** — same sidecar + index behavior as **`memory_ingest`**.

## Security

- **Secrets** for future OAuth/API providers stay in env; this module does not log URLs in **`CLAWQL_MCP_LOG_TOOLS`** beyond shape.
- **URL fetch** is off unless **`CLAWQL_EXTERNAL_INGEST_FETCH=1`**.
- Response size capped at **2 MiB**; **60s** timeout on **`fetch`**.

## How URL bodies are formatted

After **`fetch`**, ClawQL turns the response into readable Markdown **locally** (no web-search API):

| Response                                                                  | What we store                                                                                                                                              |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JSON** (`Content-Type: application/json` or body starts with `{` / `[`) | Pretty-printed in a **`json`** fenced block; frontmatter **`title`** uses **`name`** when present (e.g. **`npm · <package>`** for **registry.npmjs.org**). |
| **HTML**                                                                  | Converted with **[node-html-markdown](https://www.npmjs.com/package/node-html-markdown)** (scripts/styles stripped).                                       |
| **Other**                                                                 | Wrapped in a **`text`** fence under **## Raw text**.                                                                                                       |

Frontmatter includes **`clawql_external_ingest_kind`**: **`json`** \| **`html`** \| **`text`**.

**Web search vs URL ingest:** A **search API** (or MCP web search tool) returns **summarized snippets** tuned for models; **`ingest_external_knowledge`** fetches **one URL** and normalizes the **raw bytes**. Use search when you want a short answer; use URL ingest when you want a **durable archive** of a specific document or JSON API in the vault.

## Limitations (HTML sites)

Many public sites (including **`https://www.npmjs.com/package/...`**) sit behind **Cloudflare** or similar bot challenges. Automated **`fetch`** often receives **403** and an interstitial HTML page — **not** the rendered package UI. For npm packages, use the **registry JSON API** instead (no browser challenge), e.g. **`https://registry.npmjs.org/<package-name>`** — imports as **pretty JSON**, not a single dirty text blob.

## Related

- **[roadmap/knowledge-lake-roadmap.md](roadmap/knowledge-lake-roadmap.md)** — GitHub whole-repo + SaaS knowledge lake (issues, docs, configs; then Notion, Confluence, Linear, Jira).
- Epic: [#24](https://github.com/danielsmithdevelopment/ClawQL/issues/24) — hybrid memory beside the vault.
