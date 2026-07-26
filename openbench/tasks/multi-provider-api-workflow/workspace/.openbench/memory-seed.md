# Release Tag Worker Scaffold

## Summary

Prior offline scaffold notes for a Cloudflare Worker that returns the latest
GitHub release tag as JSON.

## Decisions

- Write files in the **workspace / current project directory only**
  (`./wrangler.toml`, `./src/index.js`, `./package.json`). Never write under
  `/tmp` or absolute scratch paths.
- `wrangler.toml`: `name = "release-tag-worker"`, `main = "src/index.js"`, and a
  `compatibility_date = "YYYY-MM-DD"`.
- `src/index.js` must call exactly:
  `https://api.github.com/repos/${owner}/${name}/releases/latest`
  (read `GITHUB_REPO` from Worker `env` as `owner/name`).
- Response JSON shape: `{"tag":"<tag_name>"}` using the upstream `tag_name`
  field, status 200.
- `package.json` scripts: `"deploy": "wrangler deploy"`.
- Prefer ClawQL `search` / `execute` for provider discovery when available; do
  not paste full OpenAPI corpora. No live network calls required for grading.

## Tags

#cloudflare #github #wrangler #openbench
