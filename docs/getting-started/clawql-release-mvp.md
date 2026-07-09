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

## Verify at runtime (7.0)

**`clawql doctor --smoke`** auto-resolves `releases/v{version}/manifest.json` from the running package version and verifies Merkle + artifact digests when the bundle exists (typical in a git checkout after `clawql release publish`). When no bundle is present (e.g. bare `npx` install), doctor reports a **warning** — not a failure.

**MCP startup (optional):** set **`CLAWQL_RELEASE_MANIFEST`** to a manifest path (file or bundle directory). The server verifies before serving:

```bash
export CLAWQL_RELEASE_MANIFEST=releases/v7.0.0/manifest.json
npx clawql-mcp
```

Strict mode (exit on failure): **`NODE_ENV=production`** or **`CLAWQL_RELEASE_MANIFEST_STRICT=1`**. In development, verification warnings are logged but startup continues.

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
