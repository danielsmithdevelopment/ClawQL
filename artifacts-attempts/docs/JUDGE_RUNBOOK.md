# Judge runbook — artifacts-attempts

Apache-2.0. No mocked pipeline steps in the demo path: local mode uses **real git**, **real vitest**, and a **dry-run Arweave directory**. Live Cloudflare Artifacts / Turbo require a Workers Paid account (billing for Artifacts starts **Oct 15, 2026**).

## Prerequisites

| Need | Local demo | Live Artifacts |
| --- | --- | --- |
| Node.js ≥ 22 | yes | yes |
| `git` | yes | yes |
| Model API keys | no (`--replay` patches) | yes for live agents |
| Cloudflare Workers Paid + Artifacts | no | yes |
| Arweave / Turbo credits | no (dry-run) | yes for permanent publish |
| `DECISIONS_URL` | optional | ClawQL or OpenAI-compatible |

## Local demo (default for judges without CF)

### 5-minute path

```bash
cd artifacts-attempts
npm ci
npm run demo:judge-smoke       # one demo + verify notes/manifest/canary
npm run demo:board-mcp-smoke   # optional: board + GET/POST /mcp/tools
```

CI (path-filtered): `.github/workflows/artifacts-attempts.yml` runs package tests + judge smoke when this tree changes.

### Full path (recording / thorough)

```bash
cd artifacts-attempts
npm ci
npm test                 # packages + local pipeline
npm run demo:local       # full run → .local/demo-run
npm run demo:gate        # optional: 3 consecutive verified runs
npm run board:serve      # terminal A — http://127.0.0.1:8787/
npm run board:hydrate    # terminal B — run demo + POST TaskView (writes result.json)
# or, after demo:local / judge-smoke:
npm run board:hydrate-from   # POST existing result.json without re-running
```

Flow overview: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · FAQ: [`FAQ.md`](./FAQ.md). Agent tools: `GET http://127.0.0.1:8787/mcp/tools` · Approval UI: `/approve.html?task=…`

Open the printed `/?task=tsk_demo` URL. You should see three attempts, `att_3` blocked, winner `att_1`, task `released`.

Verify witnesses yourself:

```bash
# evidence chain
node cli/verify/dist/cli.js --notes .local/demo-run/notes.jsonl

# dry-run release Merkle root
node cli/verify/dist/cli.js \
  --local-manifest .local/demo-run/.local/arweave/*/manifest.json \
  --bundle-dir <see manifest artifacts paths / main-wt files>
```

After `demo:local`, the dry-run manifest path is printed / under `.local/demo-run/.local/arweave/<id>/manifest.json`. Bundle files used in the demo are `artifacts/main-wt/src/delivery.js` and `artifacts/main-wt/package.json` (paths relative to the demo root).

Canary dry-run (same numbers the board shows after `board:hydrate`):

```bash
cat .local/demo-run/.local/canary/status.json
# or:
node cli/verify/dist/cli.js --canary .local/demo-run/.local/canary/status.json
# expect mode dry-run, canary 10%, rollbackTrigger mentions error_rate
```

### What “real” means here

| Step | Witness |
| --- | --- |
| Forks | bare repos under `.local/demo-run/artifacts/repos/` |
| Tokens | wrong-repo push refused |
| Notes | `git notes` pushed and re-fetched into a clean clone |
| Tests | `npm test` in each worktree |
| Policy | `att_3` calls `https://evil.example` → blocked |
| Decision | calibrated → auto-merge; OpenAI-shaped → approval then continue |
| Release | Merkle verify of dry-run manifest |
| Canary | `.local/canary/status.json` percentage split + rollback trigger (live = Workers gradual deploy API) |

## Decisions endpoint

| `DECISIONS_URL` | Behavior |
| --- | --- |
| ClawQL gateway returning `calibrated: true` | Auto-merge when confidence ≥ 0.9 and winner clean |
| OpenAI-compatible (no `calibrated`) | Always approval page / `approveIfNeeded` |
| unset in local demo | Pipeline uses in-process calibrated or `DECISIONS_MODE=openai` |

## Live Cloudflare (when available)

Set `ATTEMPTS_E2E=1` plus Cloudflare + Artifacts + Turbo secrets (see `.env.example`). The live e2e suite is skipped until those exist.

## License

Apache-2.0 — see `LICENSE`. Do not put personal data into releases (they are permanent when published to Arweave).
