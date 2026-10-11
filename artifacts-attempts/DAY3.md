# Day 3 — board + agent tools (still no Cloudflare account)

## Shipped

- **`packages/mcp-tools`** — `task_get`, `attempt_status`, `evidence_get`, `claim_paths` (self-contained; README can still list ClawQL gateway as optional).
- **Board UI** — Syne + IBM Plex Mono, SSE-driven table, decision strip.
- **`npm run board:hydrate`** — runs local demo and POSTs the `TaskView` into the API for `/?task=…`.

## Next (when CF creds land)

- Swap `local-git` for Artifacts binding in coordinator DO
- Sandbox `@cloudflare/ci` in evaluator Workflow
- Live Turbo upload + gradual deploy API
