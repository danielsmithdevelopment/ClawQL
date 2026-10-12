# Day 2 — local pipeline without Cloudflare credentials

Held: public `artifacts-attempts` GitHub repo create, Workers Paid / Artifacts throwaway verify.

## Built

- **`packages/local-git`** — real bare repos, fork via `git clone --mirror`, repo-scoped tokens that refuse wrong-repo push, evidence via real `git notes` + push/fetch witness.
- **`packages/pipeline`** — `runLocalDemo()`: seed webhooks-service → 3 replay patches → evaluate (vitest + policy) → hash-chained notes → decider trust rule → rebase/merge → dry-run Arweave under `.local/arweave/<id>/`.
- **`e2e/demo-run.test.ts`** — local path on by default (`ATTEMPTS_LOCAL`); live path still gated on `ATTEMPTS_E2E=1`.
- **`npm run demo:local`** — one-shot CLI for the same run.

## Witnesses used (honest, non-mock)

| Step | Witness |
| --- | --- |
| Forks / tokens | On-disk bare repos; wrong token throws |
| Notes | `git notes show` after fetch into a clean clone |
| Tests | Real `npm test` in each worktree |
| Policy | att_3 calls `https://evil.example` → blocked note |
| Release | Merkle verify of dry-run manifest vs bundle files |

## Still blocked on credentials

- Live Artifacts binding / REST
- Live Turbo Arweave upload
- Workers gradual deployment status API
- Public competition repo publish
