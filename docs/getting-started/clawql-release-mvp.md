# clawql-release (Layer 0)

Immutable, verifiable release manifests — GitHub/GHCR anchor plus optional IPFS staging, Lit encryption, Arweave permanence (ar.io), Radicle collaboration, and x402-gated access.

## Quick start

```bash
clawql release init

clawql-release immutable-volume snapshot --backend git-worktree --name build-local
# or: --backend rift   (uses `rift` CLI when installed; otherwise local CoW fallback)

clawql-release golden-image build --image-digest clawql-mcp=sha256:YOUR_DIGEST

clawql release publish --tag v7.1.0 \
  --sbom sbom-cyclonedx-repo.cdx.json \
  --npm-tgz clawql-mcp-7.1.0.tgz \
  --image-digest clawql-mcp=sha256:YOUR_DIGEST \
  --stage-ipfs --permanent --github

clawql release verify releases/v7.1.0/manifest.json
# or: clawql-release verify <arweave-tx-id>
clawql-release pull <arweave-tx-id> --rift
```

## What gets recorded

| Field                | Source                                                 |
| -------------------- | ------------------------------------------------------ |
| `repository.commit`  | `git rev-parse HEAD`                                   |
| `artifacts.*`        | SHA-256 (+ Ed25519 signature) of SBOM / npm tarball    |
| `images.*`           | GHCR ref + `sha256:` digest                            |
| `merkleRoot`         | Merkle tree over artifact/image leaves                 |
| `buildEnvironment`   | `git-worktree` / `rift` snapshot ancestry when present |
| `collaboration`      | Radicle primary + GitHub mirror banner metadata        |
| `staging.ipfs`       | Temporary content-addressed staging CID                |
| `permanence.arweave` | Permanent tx id via ar.io (or local dry-run store)     |
| `access`             | Public or x402 + Lit decrypt conditions                |

## Signed commits (default)

`clawql-release init` sets `commit.gpgsign=true` when a signing identity exists, or configures an SSH signing key under `.clawql/keys/`. Set `requireSignedCommits: false` in `.clawql/release.json` to opt out.

## Permanence & paid releases

```bash
# Stage on IPFS (or `.clawql/ipfs-staging/`), then permanent Arweave upload
clawql-release publish --tag v7.1.0 --sbom sbom.cdx.json --stage-ipfs --permanent --dry-run

# Encrypt + x402 gate (Lit releases CEK after payment receipt)
clawql-release publish --tag v7.1.0 --sbom sbom.cdx.json --encrypt --price "0.50 USDC" --permanent
```

Live network knobs:

| Env                                                      | Purpose                              |
| -------------------------------------------------------- | ------------------------------------ |
| `CLAWQL_RELEASE_DRY_RUN=1` / `CLAWQL_RELEASE_MODE=local` | Force local backends                 |
| `CLAWQL_ARWEAVE_WALLET_JWK`                              | Enable ar.io / Turbo upload path     |
| `CLAWQL_ARIO_TURBO_URL`                                  | Turbo endpoint for uploads           |
| `CLAWQL_IPFS_GATEWAY`                                    | IPFS HTTP gateway                    |
| `CLAWQL_X402_ENFORCE=1`                                  | Live x402 facilitator verification   |
| `CLAWQL_LIT_NETWORK`                                     | Lit Protocol network for key release |

## CI

After `npm pack` in [`.github/workflows/npm-publish.yml`](../../.github/workflows/npm-publish.yml):

```bash
npm run release:manifest
```

Set `CLAWQL_RELEASE_IMAGE_DIGESTS` to a JSON object of image name → digest from the docker-publish workflow.

## Verify at runtime

**`clawql doctor --smoke`** auto-resolves `releases/v{version}/manifest.json` and verifies Merkle + artifact digests when the bundle exists.

**MCP startup (optional):** set **`CLAWQL_RELEASE_MANIFEST`** to a manifest path. Strict mode: **`NODE_ENV=production`** or **`CLAWQL_RELEASE_MANIFEST_STRICT=1`**.

## Verify cosign (containers)

```bash
cosign verify ghcr.io/danielsmithdevelopment/clawql-mcp@sha256:...
```

See [`docs/security/golden-image-pipeline.md`](../security/golden-image-pipeline.md).

## CI (no wallet)

GitHub Actions runs [`.github/workflows/clawql-release-pipeline.yml`](../../.github/workflows/clawql-release-pipeline.yml):

- Builds `clawql-release`, runs unit tests
- Creates **3 git-worktree** + **3 rift** workspaces in parallel on the ClawQL checkout
- Optionally installs `rift-snapshot`; on typical GHA `ext4` runners true CoW is unavailable — the workflow still validates the clawql-release rift backend (CLI or local fallback)
- Publishes with `--stage-ipfs --permanent --encrypt` under **`CLAWQL_RELEASE_DRY_RUN=1`**
- Verifies and pulls by dry-run Arweave tx id (decrypt via dry-run x402 receipt)

**Do not** put `CLAWQL_ARWEAVE_WALLET_JWK` (or other spendable keys) in Actions secrets for this workflow. Local dry-run stores under `.clawql/` cover Merkle, signatures, staging CID, access policy, and pull/decrypt without spending AR or talking to Lit/x402 facilitators.

| Layer                              | CI coverage                                                     | Needs wallet / daemon                            |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Workspaces (git-worktree)          | Full                                                            | No                                               |
| Workspaces (rift CoW)              | CLI install attempt + fallback; true CoW only on btrfs/APFS/XFS | No                                               |
| Signed commits / Ed25519 artifacts | Full (SSH signing key under `.clawql/keys`)                     | No                                               |
| IPFS staging                       | Local `clawql-cid:sha256:…`                                     | Real CID needs `ipfs` daemon                     |
| Lit + x402                         | Dry-run receipt → escrow CEK release                            | Live needs `CLAWQL_X402_ENFORCE` + Lit network   |
| Arweave / ar.io                    | Local `.clawql/arweave/<tx>/`                                   | Live needs `CLAWQL_ARWEAVE_WALLET_JWK` (+ Turbo) |

Run locally:

```bash
CLAWQL_RELEASE_DRY_RUN=1 node scripts/release/ci-pipeline-e2e.mjs
```

## Architecture

Full vision: [`docs/vision/clawql-hybrid-decentralized-github-alternative.md`](../vision/clawql-hybrid-decentralized-github-alternative.md) · https://docs.clawql.com/vision/immutable-releases
