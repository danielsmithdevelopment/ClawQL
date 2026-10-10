# Day 11 — CI workflow + board MCP smoke

## Shipped

- **`.github/workflows/artifacts-attempts.yml`** — path-filtered CI: `npm test`, `npm run build`, `demo:judge-smoke`.
- **`npm run demo:board-mcp-smoke`** — starts local board, hydrates a demo, lists MCP tools, calls `attempt_status`.

## Still blocked

Live Artifacts / Turbo / public competition repo / gradual deploy. Video after `demo:record-prep` GATE PASS.
