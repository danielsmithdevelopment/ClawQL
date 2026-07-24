# Deploy a release-tag Worker (offline scaffold)

Create a Cloudflare Worker project in this directory that returns the latest
GitHub release tag for a repository as JSON. You do **not** need live network
access or real credentials — produce a correct offline scaffold.

## Required artifacts

1. `wrangler.toml` with:
   - `name = "release-tag-worker"`
   - `main = "src/index.js"`
   - `compatibility_date` set to any ISO date `YYYY-MM-DD`
2. `src/index.js` exporting a `fetch` handler that:
   - Reads `GITHUB_REPO` from the Worker `env` (format `owner/name`)
   - Calls `https://api.github.com/repos/${owner}/${name}/releases/latest`
   - Returns JSON `{"tag":"<tag_name>"}` with status 200 on success
3. `package.json` with a `"deploy": "wrangler deploy"` script

Prefer discovering provider operations via structured API tools (search /
execute) when available instead of pasting full OpenAPI corpora into context.

Do not call real APIs in this workspace; the checker only inspects structure.
