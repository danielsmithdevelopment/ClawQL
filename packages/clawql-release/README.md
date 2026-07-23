# clawql-release

**Layer 0** — immutable, verifiable releases for ClawQL.

Collects git commit, npm tarball hash, CycloneDX SBOM, and GHCR image digests into a **manifest v0.2** with a **Merkle root** (via `clawql-core`). Extends the 7.0 MVP with:

| Capability | Command / flag |
| --- | --- |
| Parallel workspaces | `immutable-volume snapshot --backend git-worktree\|rift` |
| Signed commits (default) | `init` configures `commit.gpgsign` / SSH signing |
| Signed artifacts + golden images | Ed25519 release signatures; `golden-image build` |
| Radicle primary + GitHub mirror | recorded in manifest; banner under `.clawql/github-mirror/` |
| IPFS staging | `publish --stage-ipfs` |
| Lit encryption + x402 access | `publish --encrypt --price "0.50 USDC"` |
| Permanent Arweave (ar.io) | `publish --permanent` |
| Verify / pull | `verify [tx-id]` · `pull [tx-id] [--rift]` |

Network backends default to **local dry-run** stores under `.clawql/` unless wallets / daemons are configured (`CLAWQL_ARWEAVE_WALLET_JWK`, IPFS/`ipfs`, `rad`, `CLAWQL_X402_ENFORCE=1`, `CLAWQL_LIT_NETWORK`).

## CLI

```bash
clawql-release init
clawql-release immutable-volume snapshot --backend git-worktree --name agent-42
clawql-release golden-image build --image-digest clawql-mcp=sha256:...
clawql-release publish --tag v7.1.0 \
  --sbom sbom.cdx.json \
  --npm-tgz clawql-mcp-7.1.0.tgz \
  --image-digest clawql-mcp=sha256:... \
  --stage-ipfs --permanent --github
clawql-release verify <manifest.json|bundle-dir|arweave-tx-id>
clawql-release pull <arweave-tx-id> --rift
```

Also available as `clawql release …`.

## Docs

- Getting started: [`docs/getting-started/clawql-release-mvp.md`](../../docs/getting-started/clawql-release-mvp.md)
- Vision: [`docs/vision/clawql-hybrid-decentralized-github-alternative.md`](../../docs/vision/clawql-hybrid-decentralized-github-alternative.md)
- Site: https://docs.clawql.com/vision/immutable-releases
