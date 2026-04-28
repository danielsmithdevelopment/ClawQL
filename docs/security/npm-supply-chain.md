# npm supply chain (publish hardening)

This complements the **container** golden-image flow in [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml). npm packages are **different artifacts** (tarballs + manifest metadata), but the same principles apply: **one built artifact**, **gates before publish**, **no moving “latest” without green CI**.

## Goals

- Nothing reaches the **npm registry** until **dependency and policy gates** you care about have passed on the **exact tarball** users will install.
- Prefer **short-lived credentials** (OIDC “trusted publishing”) over long-lived **`NPM_TOKEN`** secrets.

## Recommended release pipeline

1. **Same repo gates as containers (already in CI):** OSV-Scanner + Trivy filesystem + Syft SBOM on the workspace (see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) **`supply-chain`**). A dedicated **`npm-publish`** workflow should **`needs`** those jobs (or duplicate the steps if you keep publish separate).
2. **One tarball per package:** `npm pack -w <workspace>` (or `npm pack` at the package root) produces **one `.tgz`**. Treat that file as the **only** artifact npm clients will fetch (modulo npm’s CDN replication).
3. **Scan the tarball (or its unpacked root)** with **Trivy** (`vuln`, **HIGH/CRITICAL**, same **`.trivyignore`** policy as the repo) **before** `npm publish`. Optionally also run **`npm audit --omit=dev`** (or `pnpm audit` / `bun pm`) as a second opinion — it overlaps OSV/Trivy but is cheap.
4. **Publish once:** `npm publish <path-to.tgz>` (or `npm publish` from CI after the pack step) so you do not rebuild between “scan” and “upload”.
5. **Provenance:** enable **[npm provenance](https://docs.npmjs.com/generating-provenance-statements)** (`npm publish --provenance` when using **trusted publishing** / OIDC). That does not replace vuln scanning; it ties the published package to **CI identity + git ref**.
6. **Immutability:** never **overwrite** a semver; use **dist-tags** (`latest`, `next`, `canary`) only after the same gates pass on the version you intend to promote.

## What not to do

- Publishing from a maintainer laptop **without** the same gates that `main` enforces.
- Long-lived **`NPM_TOKEN`** in many places when **OIDC trusted publishing** is available for GitHub-hosted releases.

## Optional next step in this repo

Add a **`npm-publish.yml`** workflow (tag / manual `workflow_dispatch`) that: **`needs`** **`supply-chain`** → **`npm pack`** → **Trivy on `.tgz`** → **`npm publish --provenance`** (OIDC). Wire **`permissions: id-token: write, contents: read`** and configure the package on npmjs.com for **trusted publishers** pointing at this GitHub repo.
