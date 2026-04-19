# Case study: Deploying `docs.clawql.com` with ClawQL MCP (`search`, `execute`, `memory_recall`, `memory_ingest`)

This document is an **end-to-end narrative** of shipping the ClawQL documentation site to **Cloudflare Workers** (`https://docs.clawql.com`) while using the **same MCP server** that powers day-to-day API work: **`search`**, **`execute`**, **`memory_recall`**, and **`memory_ingest`**. It records **failures**, **fixes**, and **insights** for future agents and humans.

**Related:** GitHub tracking issue ([#87](https://github.com/danielsmithdevelopment/ClawQL/issues/87)), repo [`website/`](../../website/) (Next.js + OpenNext + Wrangler).

## Goals

1. **Authenticate** to Cloudflare and wire tokens for local **Kubernetes** MCP and **Cursor** (HTTP MCP).
2. **Deploy** the docs app (`website/`) to a **custom domain** on the **free tier**.
3. **Operate** Cloudflare APIs (Workers, domains, routes) via **ClawQL** instead of ad-hoc `curl` where possible.
4. **Persist** setup, mistakes, and lessons in the **Obsidian vault** (and optional **`memory.db`**) so later sessions do not repeat the same failures.

## Environment and stack

| Piece | Role |
| ----- | ---- |
| **ClawQL MCP** | Bundled **Cloudflare** provider (`CLAWQL_PROVIDER=cloudflare` or merged presets) for **`search`** / **`execute`** against Cloudflare’s REST surface. |
| **`CLAWQL_CLOUDFLARE_API_TOKEN`** | Bearer for `execute` (and for humans, **Wrangler** deploy). Must be present on the **MCP process** (stdio or HTTP), not only in a laptop `.env` used by the IDE. |
| **`memory_recall` / `memory_ingest`** | Require **`CLAWQL_OBSIDIAN_VAULT_PATH`** (see [`docs/memory-obsidian.md`](../memory-obsidian.md)). |
| **Website** | Next.js App Router + **OpenNext** for Cloudflare (`@opennextjs/cloudflare`), **Wrangler** Worker **`clawql-docs`**, route **`docs.clawql.com`**. |

## How the four tools worked together

### `search()`

Used to **discover** operations and parameters without pasting large OpenAPI fragments into the chat:

- Find operations for **Workers**, **routes**, **custom domains** (e.g. paths matching `workers`, `domains`, `routes`).
- Narrow down which **`execute`** call matches the intent (attach hostname, list bindings, etc.).

### `execute()`

Used for **Cloudflare REST** actions once the operation id and path/body shape were known:

- **Custom domains** and Worker routing: e.g. `workers.domains.update` — **path + body** fields must follow what ClawQL expects (`account_id` in path; `hostname`, `service`, `environment`, `zone_id`, `zone_name` in body where applicable).
- Listing or inspecting domain attachments to confirm **`docs.clawql.com`** points at the right Worker.

**Note:** `execute` is only as good as the **token’s permissions**. A token that works for **Wrangler OAuth** may still fail API calls until **Account** / **Workers** / **DNS** scopes align with the task.

### `memory_recall()`

Used **at the start of non-trivial work** and when the user referenced **past decisions** or **vault** context:

- Concrete **`query`** (e.g. “Cloudflare docs deploy”, “Workers 1101”) with a reasonable **`limit`**.
- **`maxDepth`** raised when **graph** relationships between notes mattered.

If the vault path is unset, recall fails fast — **note it briefly** and continue without blocking the main task.

### `memory_ingest()`

Used **after meaningful outcomes**:

- **Decisions** (custom domain vs Pages, token strategy).
- **Debugging conclusions** (Worker **1101**, **500**, `fs.readdir` in Workers).
- **User preferences** (e.g. **append** with **`append: true`** to **consolidate** runbooks on stable pages instead of many one-line notes).
- **Links** between topics via **`wikilinks`** for Obsidian graph navigation.

**Never store secrets** in ingests. Summarize redacted configuration only.

## End-to-end workflow (chronological)

1. **Recall** prior vault notes (`memory_recall`) on Cloudflare + docs + MCP auth.
2. **Configure** `CLAWQL_CLOUDFLARE_API_TOKEN` on the **MCP server process** (k8s Secret or HTTP MCP env).
3. **Search** Cloudflare operations; **execute** domain/Worker updates as needed.
4. **Deploy** from `website/` (`opennextjs-cloudflare` build + deploy), set **`NEXT_PUBLIC_SITE_URL=https://docs.clawql.com`** for canonical URLs.
5. **Verify** `https://docs.clawql.com` and **`wrangler tail clawql-docs`** for runtime errors.
6. **Fix** app code if the Worker throws (see failures below).
7. **Ingest** session summary (`memory_ingest`, `append: true`) into a stable note title.

## Failures and symptoms

| Symptom | Likely cause | What helped |
| ------- | ------------ | ----------- |
| **Missing / invalid auth** on Cloudflare calls | **No `Authorization`** on the MCP process | Set **`CLAWQL_CLOUDFLARE_API_TOKEN`** on the **server** running MCP, not only local `.env` for Cursor UI. |
| **HTTP 403 / blocked** from Cloudflare API | Token **IP allowlist** | Add egress IP (or widen policy) for the environment where MCP runs. |
| **API errors** despite Wrangler working | Token **scope** too narrow for **custom domains** / Workers | **Account** / **Workers** / **DNS**-style permissions; align token with **Wrangler** vs **REST** needs. |
| Browser **500** / Cloudflare **1101** (“Worker threw exception”) | Worker runtime exception | **`wrangler tail <worker>`** — e.g. **`[unenv] fs.readdir is not implemented yet!`** when app code called **filesystem** APIs on Workers. |
| **Prerender** crash on `/concepts` | **`React.Children.only`** in **`CodePanel`** | MDX + Shiki can yield multiple nodes under **`code`**; **`Children.only`** throws. |

## Fixes and verification

### 1) Workers runtime: no `fs.readdir` on the request path

- **Root cause:** `src/app/layout.tsx` used **`fast-glob`** at **request time** to discover `**/*.mdx` and build the sidebar map. **`fast-glob`** uses **`fs.readdir`**, which **unenv** does not implement on Cloudflare Workers.
- **Fix:** Remove runtime globbing. **Predefine** section metadata for routes that need it (e.g. shared `homePageSections` in a small TS module imported by **`layout.tsx`** and **`page.mdx`**). See [`website/src/lib/home-page-sections.ts`](../../website/src/lib/home-page-sections.ts).

### 2) Prerender: `CodePanel` and `Children.only`

- **Fix:** Normalize `children` with **`Children.toArray`**, pick the **`code` / `Code`** element, and avoid **`Children.only`** when MDX can emit multiple nodes.

### 3) Verification

- **`curl -I`** / **`curl -sS -o /dev/null -w "%{http_code}"`** against **`https://docs.clawql.com/`** returns **200** after deploy.
- **`wrangler tail`** clean on normal page loads (no `fs.readdir` / `Children.only` stack traces).

## Insights for future work

1. **Workers ≠ Node:** Any **server** code that runs on Workers must avoid **unsupported `fs`** APIs on the hot path; prefer **build-time** generation or **static** maps.
2. **Token parity:** Treat **Wrangler success** and **REST `execute` success** as **independent** — validate scopes explicitly for the operations you automate.
3. **Vault cadence:** **`memory_ingest`** after **decisions and failures**; use **`append: true`** and **stable titles** to build durable runbooks instead of fragmented notes.
4. **Case study hygiene:** When adding new **case studies**, link them from [`README.md`](../../README.md) and [`docs/case_studies/README.md`](README.md), then **`memory_ingest`** the canonical doc so **recall** can find “how we did X” later.

## References

- [`docs/mcp-tools.md`](../mcp-tools.md) — MCP tool surface.
- [`docs/cursor-vault-memory.md`](../cursor-vault-memory.md) — Cursor rules + vault skill.
- [`docs/website-caching.md`](../website-caching.md) — CDN / browser caching for **`docs.clawql.com`** (`next.config` + `public/_headers`).
- [`docs/case_studies/README.md`](README.md) — index of case studies.
- Website (this study): **`https://docs.clawql.com/case-studies/cloudflare-docs-mcp`**
