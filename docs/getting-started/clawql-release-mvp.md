# clawql-release — CLI reference

Friendly walkthrough: **[Immutable releases](./immutable-releases.md)** · https://docs.clawql.com/getting-started/immutable-releases

This page is a compact cheat sheet for flags and env vars.

## Commands

```bash
clawql-release init
clawql-release immutable-volume snapshot --backend git-worktree|rift --name NAME
clawql-release immutable-volume list
clawql-release golden-image build --image-digest NAME=sha256:…
clawql-release publish --tag vX.Y.Z [--sbom …] [--npm-tgz …] [--stage-ipfs] [--permanent] [--encrypt] [--price "0.50 USDC"] [--github] [--dry-run]
clawql-release verify <manifest.json|bundle-dir|tx-id>
clawql-release pull <target> [--rift]
```

Same via `clawql release …`.

## Dry-run / CI

```bash
CLAWQL_RELEASE_DRY_RUN=1 node scripts/release/ci-pipeline-e2e.mjs
```

Do **not** put spendable Arweave wallets in GitHub Actions secrets for that workflow.

## Env

| Env                         | Purpose                   |
| --------------------------- | ------------------------- |
| `CLAWQL_RELEASE_DRY_RUN=1`  | Local backends            |
| `CLAWQL_ARWEAVE_WALLET_JWK` | Live ar.io / Turbo upload |
| `CLAWQL_ARIO_TURBO_URL`     | Turbo endpoint            |
| `CLAWQL_IPFS_GATEWAY`       | IPFS gateway              |
| `CLAWQL_X402_ENFORCE=1`     | Live x402 facilitator     |
| `CLAWQL_LIT_NETWORK`        | Lit network label         |

## Runtime

- `clawql doctor --smoke` — checks `releases/v{version}/manifest.json` when present
- `CLAWQL_RELEASE_MANIFEST=…` — verify at MCP startup

Cosign: [`docs/security/golden-image-pipeline.md`](../security/golden-image-pipeline.md)
