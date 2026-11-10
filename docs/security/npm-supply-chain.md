# npm supply chain (publish hardening)

This complements the **container** golden-image flow in [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml). npm packages are **different artifacts** (tarballs + manifest metadata), but the same principles apply: **one built artifact**, **gates before publish**, **no moving “latest” without green CI**.

## Goals

- Nothing reaches the **npm registry** until **dependency and policy gates** you care about have passed on the **exact tarball** users will install.
- Prefer **short-lived credentials** (OIDC **trusted publishing**) over long-lived **`NPM_TOKEN`** secrets — no stealer-friendly publish token in CI secrets when packages are linked on npmjs.com.
- Anyone can verify **which workflow** built a release (`npm publish --provenance` attestations).

## Recommended release pipeline

1. **Same repo gates as containers (already in CI):** OSV-Scanner + Trivy filesystem + Syft SBOM on the workspace (see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) **`supply-chain`**).
2. **Publish workspace packages in order:** [`scripts/release/npm-publish-order.json`](../../scripts/release/npm-publish-order.json) — `clawql-core` → … → `clawql-mcp` last. Script: [`scripts/release/npm-publish-workspace.mjs`](../../scripts/release/npm-publish-workspace.mjs).
3. **One tarball per package:** `npm pack -w <workspace>` (or root `npm pack` for `clawql-mcp`) produces **one `.tgz`**.
4. **Release-matches-source + artifact RE gates:** [`scripts/security/run-artifact-release-gates.sh`](../../scripts/security/run-artifact-release-gates.sh) — digests vs workspace, Gitleaks on unpacked packs, budgets, pack inventory BOM.
5. **Independent rebuild:** a second clean job rebuilds from the same commit and compares pack `contentId`s ([`independent-rebuild-compare.sh`](../../scripts/security/independent-rebuild-compare.sh)).
6. **Trivy** on the clawql-mcp tarball root (**HIGH/CRITICAL**).
7. **Publish once** with **`--provenance`** under OIDC (`permissions: id-token: write`).
8. **Registry re-fetch:** download each published version from the registry and compare SHA-256 to the local pack ([`verify-npm-registry-matches-pack.mjs`](../../scripts/security/verify-npm-registry-matches-pack.mjs)). Catches post-upload replacement.
9. **Immutability:** never overwrite a semver; move dist-tags only after the same gates.

**Source maps:** published packs **must not** include `dist/**/*.map` (npm `files` negation). Local builds may still emit maps for debugging; CI fails if a pack contains `.map` files.

**Monorepo dev:** each `clawql-*` workspace package has **independent semver**; npm workspaces link them locally. **`clawql-mcp`** no longer uses **`bundledDependencies`**. Never stamp a new package with the gateway’s major.

## Trusted publishing (OIDC) — operator checklist

1. On [npmjs.com](https://www.npmjs.com/) for **each** `clawql-*` / `clawql-mcp` package: **Settings → Trusted Publisher → GitHub Actions** → this repository + workflow `npm-publish.yml`.
2. Workflow already sets `permissions: id-token: write` and always passes `--provenance`.
3. Keep `secrets.NPM_TOKEN` only as a **temporary** fallback for packages not yet linked; remove it once every publish row is OIDC-only.
4. Consumers: `npm audit signatures` / npm’s provenance UI for the version they install.

## What not to do

- Publishing from a maintainer laptop **without** the same gates that `main` enforces.
- Relying on a long-lived **`NPM_TOKEN`** when OIDC trusted publishing is available.
- Shipping source maps in production packs (attacker-readable paths/routes).

## Shipped in this repo

[`.github/workflows/npm-publish.yml`](../../.github/workflows/npm-publish.yml): **`repo-supply-chain`** → **`pack-and-gate`** → **`independent-rebuild`** → **`publish`** (Trivy → `--provenance` → registry re-fetch). Operator-facing summary: [supply-chain-posture.md](supply-chain-posture.md).
