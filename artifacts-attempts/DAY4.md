# Day 4 — judge UX + video prep (no Cloudflare account)

## Shipped

- **`npm run board:serve`** — Node HTTP server on `:8787` (same routes as the Worker API + static board). No Wrangler login.
- **`docs/JUDGE_RUNBOOK.md`** — how judges run the demo and what each witness is.
- **`docs/VIDEO_SCRIPT.md`** — scene list; record only after three consecutive green local demos.

## Still blocked

- Public standalone `artifacts-attempts` GitHub repo (App token cannot create repos)
- Live Artifacts / Turbo / gradual deploy (`ATTEMPTS_E2E=1`)
