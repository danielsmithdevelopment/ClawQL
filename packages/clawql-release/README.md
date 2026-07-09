# clawql-release

**Layer 0 MVP** — verifiable release manifests for ClawQL 7.0+.

Bundles git commit, npm tarball hash, CycloneDX SBOM, and GHCR image digests into a **manifest v0.1** with a **Merkle root** (via `clawql-core`). Supports `verify` to detect tampering after publish.

Permanent **Arweave** anchoring is deferred; this MVP anchors on `releases/vX.Y.Z/` in the repo and optional GitHub Release assets.

## CLI

```bash
clawql release init
clawql release publish --tag v7.0.0 \
  --sbom sbom.cdx.json \
  --npm-tgz clawql-mcp-7.0.0.tgz \
  --image-digest clawql-mcp=sha256:... \
  --github
clawql release verify releases/v7.0.0/
```

Standalone binary: `clawql-release` (same commands without `clawql` prefix).

## Docs

[`docs/getting-started/clawql-release-mvp.md`](../../docs/getting-started/clawql-release-mvp.md)
