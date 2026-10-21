# ClawQL supply-chain posture

How we reduce risk that a compromised dependency, registry upload, or image tag can become production code or readable secrets — and how you can verify it. This is not a claim that ClawQL is immune to supply-chain attacks. The npm and container ecosystems have had serious compromises; TypeScript and compiled binaries are not exempt. The useful question is what controls you can inspect.

**Related:** [Golden image pipeline](golden-image-pipeline.md) · [npm publish hardening](npm-supply-chain.md) · [Image signature enforcement](image-signature-enforcement.md) · [Vault Transit / provider secrets](../deployment/vault-provider-secrets.md) · [Security status (scan history)](https://docs.clawql.com/security/status)

---

## What you can verify today

| Control                                 | What it does                                                                                                                  | Where to look                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **CI supply-chain gates**               | OSV-Scanner + Trivy (HIGH/CRITICAL) + Syft CycloneDX SBOM on every merge path                                                 | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) job `supply-chain`                                             |
| **Lockfiles with integrity**            | `package-lock.json` records resolved URLs and SHA-512 integrity hashes; installs use `npm ci`                                 | Root lockfile; CI and Docker builds                                                                                         |
| **npm trusted publishing + provenance** | Releases publish from GitHub Actions OIDC (`id-token: write`); `npm publish --provenance` attaches build attestations         | [`.github/workflows/npm-publish.yml`](../../.github/workflows/npm-publish.yml) · [npm-supply-chain.md](npm-supply-chain.md) |
| **One scanned OCI layout → registry**   | BuildKit writes a local OCI layout; Trivy scans those bytes; `skopeo copy` pushes the same layout — no second “release” build | [golden-image-pipeline.md](golden-image-pipeline.md) · [docker-publish.yml](../../.github/workflows/docker-publish.yml)     |
| **Cosign keyless signatures**           | Digests signed with GitHub Actions OIDC (Fulcio/Rekor); `cosign verify` out-of-band                                           | [docker/README.md](../../docker/README.md)                                                                                  |
| **Images pinned by digest at admit**    | Kyverno `verifyImages` defaults on for ClawQL GHCR patterns; rolling tags move only after sign+verify                         | [image-signature-enforcement.md](image-signature-enforcement.md)                                                            |
| **SBOM artifacts**                      | Syft CycloneDX on repo gates and image builds (BuildKit SBOM attestations where attached)                                     | CI artifacts `sbom-cyclonedx-*`; release pipeline                                                                           |
| **Provider keys ciphertext-at-rest**    | Vault / OpenBao Transit wraps `SecretStore`; tenant+path derived-key context; fail-closed decrypt                             | [vault-provider-secrets.md](../deployment/vault-provider-secrets.md) · `clawql-auth` Transit                                |
| **Host IoC scan (operator)**            | Script scans site-packages / pipx / `/tmp` markers on machines the lockfile cannot see                                        | [`scripts/security/scan-litellm-ioc.sh`](../../scripts/security/scan-litellm-ioc.sh)                                        |
| **Secret leak gates**                   | Gitleaks on the working tree in CI; pre-commit hook; scheduled TruffleHog on history                                          | [security README](README.md) · `.gitleaks.toml`                                                                             |

Evidence of gate outcomes (not marketing badges): **[Security status](https://docs.clawql.com/security/status)** — append-only Trivy/OSV history from `main` CI.

---

## Publish path (npm)

1. Tag or `workflow_dispatch` starts **`npm-publish`**.
2. Job **`repo-supply-chain`** must pass (OSV + Trivy fs + Syft SBOM).
3. Packages are packed, scanned, then published **once** with **`--provenance`** under OIDC trusted publishing (short-lived token; prefer this over a long-lived `NPM_TOKEN` in many places).
4. Semver is immutable; dist-tags move only after the same gates.

Details and “what not to do”: [npm-supply-chain.md](npm-supply-chain.md).

---

## Publish path (containers)

1. **`repo-supply-chain`** (same family of gates as CI).
2. One BuildKit build per image → **local OCI layout** (with provenance/SBOM attestations where BuildKit attaches them).
3. **Trivy** on that layout; failure blocks push.
4. **`skopeo copy`** of the scanned layout to GHCR (`sha-*` digests first).
5. **Cosign sign** + **`cosign verify`** on the digest.
6. Only then promote `latest` / `nightly` / date tags.

Full narrative: [golden-image-pipeline.md](golden-image-pipeline.md). Cluster enforcement: [image-signature-enforcement.md](image-signature-enforcement.md).

---

## Secrets if a host or dependency is compromised

Supply-chain malware often steals environment variables, home-directory tokens, and **plaintext credential tables**. ClawQL’s application `SecretStore` can encrypt values with the customer’s **HashiCorp Vault / OpenBao Transit** engine so a database dump yields ciphertext bound to tenant + secret path (derived-key context). Decrypt fails closed when Vault is unreachable; a short in-memory cache rides out brief blips and is never written to disk.

Enable and operate: [vault-provider-secrets.md](../deployment/vault-provider-secrets.md).

This does not replace rotating credentials after a confirmed compromise. It limits what a table dump is worth.

---

## Environments the lockfile does not cover

CI runners, developer laptops, and evaluation harnesses can install packages outside this repository’s `package-lock.json`. After a public registry incident, run:

```bash
bash scripts/security/scan-litellm-ioc.sh
```

Optionally pass extra `site-packages` directories. Treat any hit as compromise until proven otherwise: isolate, remove droppers, rotate secrets that host could reach, review Vault audit logs for that identity.

---

## Honest limits

- **Kyverno** covers ClawQL’s published GHCR image patterns by default — not every sidecar or third-party image in the namespace.
- **Provenance** proves which workflow built an npm package or image digest; it does not prove the dependency graph is free of future zero-days.
- **Transit** protects SecretStore-backed secrets; process env injected via Kubernetes Secrets remains readable to anything that can read that Secret or the pod environment — prefer short-lived Vault auth (K8s / AppRole / JWT) and tight RBAC.
- **No stack is uncompromisable.** Reviewers should prefer reproducible gates and digests over slogans.

---

## Deferred (internal): multi-gateway inference board

A side-by-side inference gateway board (latency overhead vs mock providers, then governance capabilities) is **scheduled separately**, not tied to any single vendor’s bad week. Framing and candidate peers: [`docs/gtm/inference-gateway-board-deferred.md`](../gtm/inference-gateway-board-deferred.md).
