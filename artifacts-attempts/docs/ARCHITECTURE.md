# Architecture — artifacts-attempts

```
task
  ├─ fork ×3 (Artifacts / local bare repos) + repo-scoped tokens
  ├─ agents or --replay patches push to forks
  ├─ push event → intake → evaluator
  │     tests (Sandbox / vitest) + policy allowlist + git notes (hash chain)
  ├─ one attempt blocked (egress off allowlist)
  ├─ /v1/decisions → auto-merge only if calibrated ∧ confidence ≥ 0.9 ∧ clean
  │     else approval page
  ├─ merge queue: rebase winner → re-test → stand down losers
  └─ release (never cut): Merkle manifest → Arweave (or dry-run dir)
        + canary % status (Workers gradual deploy live / status.json dry-run)
        + live board (SSE)
```

## Local witnesses (no Cloudflare account)

| Step | Where |
| --- | --- |
| Forks / tokens | `.local/…/artifacts/repos/` via `@artifacts-attempts/local-git` |
| Notes | `git notes` pushed and re-fetched |
| Tests | `npm test` in each worktree |
| Release | `.local/…/arweave/<id>/manifest.json` |
| Canary | `.local/…/canary/status.json` |
| Board | `npm run board:serve` + `board:hydrate` / `board:hydrate-from` |

## Packages

| Package | Role |
| --- | --- |
| `notes` | RFC 8785 evidence notes + chain verify |
| `manifest` | Merkle release manifest |
| `local-git` | Bare-repo forks, tokens, notes |
| `decider` | `/v1/decisions` client + trust rule |
| `pipeline` | `runLocalDemo` end-to-end |
| `mcp-tools` | Agent tools (`task_get`, …) |
| `verify` CLI | notes / manifest / canary witnesses |

Live Artifacts + Turbo remain behind `ATTEMPTS_E2E=1` and Workers Paid credentials.
