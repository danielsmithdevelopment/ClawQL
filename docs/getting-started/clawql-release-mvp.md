# clawql-release MVP (Layer 0)

Immutable release manifests for **7.0.0** — GitHub + GHCR anchor (Arweave deferred).

## Quick start

```bash
clawql release init

clawql release publish --tag v7.0.0 \
  --sbom sbom-cyclonedx-repo.cdx.json \
  --npm-tgz clawql-mcp-7.0.0.tgz \
  --image-digest clawql-mcp=sha256:YOUR_DIGEST \
  --image-digest clawql-dashboard=sha256:...

clawql release verify releases/v7.0.0/manifest.json
```

## What gets recorded

| Field               | Source                                     |
| ------------------- | ------------------------------------------ |
| `repository.commit` | `git rev-parse HEAD`                       |
| `artifacts.sbom`    | SHA-256 of CycloneDX file                  |
| `artifacts.npm`     | SHA-256 of `npm pack` tarball              |
| `images.*`          | GHCR ref + `sha256:` digest                |
| `merkleRoot`        | Merkle tree over all artifact/image leaves |

## CI

After `npm pack` in [`.github/workflows/npm-publish.yml`](../../.github/workflows/npm-publish.yml):

```bash
npm run release:manifest
```

Set `CLAWQL_RELEASE_IMAGE_DIGESTS` to a JSON object of image name → digest from the docker-publish workflow.

## Verify cosign (containers)

Manifest records digests; image signatures are verified separately:

```bash
cosign verify ghcr.io/danielsmithdevelopment/clawql-mcp@sha256:...
```

See [`docs/security/golden-image-pipeline.md`](../security/golden-image-pipeline.md).

## Roadmap (not in MVP)

- Arweave `publish --permanent`
- `clawql-manifest-validator` policy blocks for Kyverno
- Rift / Radicle integration

Full vision: [`docs/vision/clawql-hybrid-decentralized-github-alternative.md`](../vision/clawql-hybrid-decentralized-github-alternative.md)
