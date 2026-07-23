# clawql-release reference notes

> **Hands-on guide:** [`immutable-releases.md`](./immutable-releases.md) · https://docs.clawql.com/getting-started/immutable-releases  
> **Vision:** https://docs.clawql.com/vision/immutable-releases

Short reference for Layer 0 CLI flags, env knobs, and CI. Prefer the getting-started guide for the full end-to-end path.

## Quick start

```bash
clawql release init

clawql-release immutable-volume snapshot --backend git-worktree --name build-local
clawql-release golden-image build --image-digest clawql-mcp=sha256:YOUR_DIGEST

clawql release publish --tag v7.1.0 \
  --sbom sbom.cdx.json \
  --npm-tgz clawql-mcp-7.1.0.tgz \
  --image-digest clawql-mcp=sha256:YOUR_DIGEST \
  --stage-ipfs --permanent --github

clawql release verify releases/v7.1.0/manifest.json
clawql-release pull <arweave-tx-id> --rift
```

## Dry-run / CI

```bash
CLAWQL_RELEASE_DRY_RUN=1 node scripts/release/ci-pipeline-e2e.mjs
```

Workflow: [`.github/workflows/clawql-release-pipeline.yml`](../../.github/workflows/clawql-release-pipeline.yml)

Do **not** put spendable Arweave wallets in GitHub Actions secrets for that workflow.

## Env knobs

| Env                                                      | Purpose                              |
| -------------------------------------------------------- | ------------------------------------ |
| `CLAWQL_RELEASE_DRY_RUN=1` / `CLAWQL_RELEASE_MODE=local` | Force local backends                 |
| `CLAWQL_ARWEAVE_WALLET_JWK`                              | Enable ar.io / Turbo upload path     |
| `CLAWQL_ARIO_TURBO_URL`                                  | Turbo endpoint for uploads           |
| `CLAWQL_IPFS_GATEWAY`                                    | IPFS HTTP gateway                    |
| `CLAWQL_X402_ENFORCE=1`                                  | Live x402 facilitator verification   |
| `CLAWQL_LIT_NETWORK`                                     | Lit Protocol network for key release |

## Runtime verify

- `clawql doctor --smoke` — auto-resolves `releases/v{version}/manifest.json`
- `CLAWQL_RELEASE_MANIFEST=…` — MCP startup verify; strict with `CLAWQL_RELEASE_MANIFEST_STRICT=1`

Cosign for containers: [`docs/security/golden-image-pipeline.md`](../security/golden-image-pipeline.md)
