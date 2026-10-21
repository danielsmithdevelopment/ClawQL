# Security baselines (release artifact RE)

Optional committed snapshots for CI drift gates.

| File | Used by | Purpose |
| ---- | ------- | ------- |
| `npm-pack-inventory.json` | [`scripts/security/run-artifact-release-gates.sh`](../../../scripts/security/run-artifact-release-gates.sh) | Pack bill-of-materials (name, version, tarball sha256, contentId). When present, CI fails if packages are added/removed beyond `CLAWQL_PACK_MAX_ADDED` / `CLAWQL_PACK_MAX_REMOVED` (defaults **2** / **0**). Content changes are expected on many commits (`CLAWQL_PACK_MAX_CHANGED` default **9999**). |

Repo-level dependency SBOMs (Syft CycloneDX) continue to come from the `supply-chain` CI job (`sbom-cyclonedx-repository`). Dist-only npm tarballs rarely contain nested `node_modules`, so a pack *inventory* is the useful release-to-release BOM.

## Refreshing the npm-pack inventory baseline

After an intentional change to which packages are packed (or their public surface):

```bash
npm ci
npm run build
PACK_DIR="$(mktemp -d)"
node scripts/release/pack-workspace-packages.mjs "${PACK_DIR}"
npm pack --pack-destination "${PACK_DIR}"
CLAWQL_PACK_INVENTORY_KEEP=docs/security/baselines/npm-pack-inventory.json \
  bash scripts/security/run-artifact-release-gates.sh "${PACK_DIR}"
```

Commit the updated `npm-pack-inventory.json` in the same PR. Until the baseline file exists, the inventory step still runs and uploads the `npm-pack-inventory` artifact; only the diff gate is skipped.
