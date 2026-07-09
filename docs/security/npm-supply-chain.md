# npm supply chain (publish hardening)

This complements the **container** golden-image flow in [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml). npm packages are **different artifacts** (tarballs + manifest metadata), but the same principles apply: **one built artifact**, **gates before publish**, **no moving “latest” without green CI**.

## Goals

- Nothing reaches the **npm registry** until **dependency and policy gates** you care about have passed on the **exact tarball** users will install.
- Prefer **short-lived credentials** (OIDC “trusted publishing”) over long-lived **`NPM_TOKEN`** secrets.

## Recommended release pipeline

1. **Same repo gates as containers (already in CI):** OSV-Scanner + Trivy filesystem + Syft SBOM on the workspace (see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) **`supply-chain`**). The **`npm-publish`** workflow **`needs`** those jobs.
2. **Publish workspace packages in order:** [`scripts/release/npm-publish-order.json`](../../scripts/release/npm-publish-order.json) — `clawql-core` → … → `clawql-mcp` last. Script: [`scripts/release/npm-publish-workspace.mjs`](../../scripts/release/npm-publish-workspace.mjs).
3. **One tarball per package:** `npm pack -w <workspace>` (or root `npm pack` for `clawql-mcp`) produces **one `.tgz`**. Treat each file as the artifact npm clients fetch.
4. **Scan the tarball (or its unpacked root)** with **Trivy** (`vuln`, **HIGH/CRITICAL**, same **`.trivyignore`** policy as the repo) **before** `npm publish`. The workflow scans **`clawql-mcp`** after pack; extend to other packages if policy requires.
5. **Publish once:** `npm publish -w <pkg> --provenance` (workspace packages) or `npm publish clawql-mcp-*.tgz --provenance` (root) — no rebuild between scan and upload.
6. **Provenance:** enable **[npm provenance](https://docs.npmjs.com/generating-provenance-statements)** (`--provenance` when using **trusted publishing** / OIDC).
7. **Immutability:** never **overwrite** a semver; use **dist-tags** (`latest`, `next`, `canary`) only after the same gates pass on the version you intend to promote.

**Monorepo dev:** workspace packages use matching **`7.0.0`** semver in `dependencies`; npm workspaces link them locally. **`clawql-mcp`** no longer uses **`bundledDependencies`**.

## What not to do

- Publishing from a maintainer laptop **without** the same gates that `main` enforces.
- Long-lived **`NPM_TOKEN`** in many places when **OIDC trusted publishing** is available for GitHub-hosted releases.

## Optional next step in this repo

Add a **`npm-publish.yml`** workflow (tag / manual `workflow_dispatch`) that: **`needs`** **`supply-chain`** → **`npm pack`** → **Trivy on `.tgz`** → **`npm publish --provenance`** (OIDC). Wire **`permissions: id-token: write, contents: read`** and configure the package on npmjs.com for **trusted publishers** pointing at this GitHub repo.
