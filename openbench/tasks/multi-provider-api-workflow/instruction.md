# Deploy a release-tag Worker (offline scaffold)

Create a Cloudflare Worker project in this directory that returns the latest
GitHub release tag for a repository as JSON. You do **not** need live network
access or real credentials — produce a correct offline scaffold.

## Critical first step

If you have a **memory_recall** (or similar vault/memory) tool, call it **before
creating files**. Query for prior release-tag Worker / wrangler / GitHub releases
scaffold decisions. Those notes are **not** in the workspace filesystem.

## Required artifacts

1. `wrangler.toml` with:
   - `name = "release-tag-worker"`
   - `main = "src/index.js"`
   - `compatibility_date` set to any ISO date `YYYY-MM-DD`
2. `src/index.js` exporting a `fetch` handler that:
   - Reads `GITHUB_REPO` from the Worker `env` (format `owner/name`)
   - Calls the GitHub **releases/latest** API for that repo (use the exact URL
     shape recorded in prior session notes when available)
   - Returns JSON `{"tag":"<tag_name>"}` with status 200 on success
3. `package.json` with a `"deploy": "wrangler deploy"` script

Prefer discovering provider operations via structured API tools (search /
execute) when available instead of pasting full OpenAPI corpora into context.

Do not call real APIs in this workspace; the checker only inspects structure.
