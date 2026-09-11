# Deploy a release-tag Worker (offline scaffold)

Create a Cloudflare Worker project in this directory that returns the latest
GitHub release tag for a repository as JSON. You do **not** need live network
access or real credentials — produce a correct offline scaffold.

## Critical first step

If you have a **memory_recall** (or similar vault/memory) tool, call it **before
creating files**. Query for prior release-tag Worker / wrangler / GitHub releases
scaffold decisions. The prior session chose the **Worker name**, **GitHub API
URL shape**, **JSON response field**, and **deploy script** — those values are
**not** in the workspace filesystem. Do not invent them when notes exist.

After recall, you **must** call the **`write` tool** for each artifact below.
Markdown code fences in chat do **not** create files and score zero. Do not stop
after recalling.

## Required artifacts

Create these files with **relative paths only** (e.g. `wrangler.toml`,
`src/index.js`, `package.json` — never `/tmp/...` and never absolute `/src/...`):

1. `wrangler.toml` with the recalled Worker `name`, `main = "src/index.js"`, and
   any ISO `compatibility_date` (`YYYY-MM-DD`)
2. `src/index.js` exporting a `fetch` handler that:
   - Reads `GITHUB_REPO` from Worker `env` (`owner/name`)
   - Calls the recalled GitHub releases URL
   - Returns the recalled JSON tag shape with status 200 on success
3. `package.json` with the recalled `"deploy"` script

Prefer discovering provider operations via structured API tools (search /
execute) when available instead of pasting full OpenAPI corpora into context.

Do not call real APIs in this workspace; the checker only inspects structure.
