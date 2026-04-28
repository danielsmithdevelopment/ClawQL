# Repository scripts

Operational and maintenance scripts live under grouped subdirectories. Prefer **`package.json`** `scripts` entries (e.g. `npm run fetch-provider-specs`, `npm run workflow:gcp-multi`) so paths stay stable.

| Directory        | Purpose |
| ---------------- | ------- |
| **`deploy/`**    | Cloud Run (`deploy-cloud-run.sh`), Kustomize overlays (`deploy-k8s.sh`), docs site → Cloudflare Worker (`deploy-docs-to-cloudflare.sh`). |
| **`kubernetes/`** | Docker Desktop cluster bootstrap (`local-k8s-docker-desktop.sh`), MCP delete, Kyverno/Helm UI checks (`test-helm-ui-templates.sh`), Secret sync for local MCP (`k8s-docker-desktop-set-mcp-auth.sh`; `k8s-docker-desktop-set-github-token.sh` is a deprecated alias). |
| **`providers/`** | Download / normalize vendor specs (`fetch-*.mjs`) and pregenerate bundled GraphQL (`pregenerate-*.ts`). |
| **`workflows/`** | Benchmarks, smoke tests, multi-provider MCP harnesses, and markdown/json report helpers. |
| **`release/`**   | Git tag helpers aligned with npm releases (`git-release-tag.sh`, `git-backfill-npm-release-tags.sh`). |
| **`dev/`**       | Ad hoc developer utilities (e.g. `grpc-memory-recall.mjs`, `assert-lighthouse-scores.mjs`, GitHub repo description patcher). |

Shell scripts that need the repo root compute it from their own path and `cd` there where required, so you can invoke them from any working directory.
