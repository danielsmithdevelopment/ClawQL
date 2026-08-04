# Security docs

This section tracks ClawQL security architecture, shipped controls, and roadmap items in one place.

## Golden image pipeline (start here)

- **End-to-end** (CI gates → single OCI build → Trivy → skopeo → Cosign → tag promotion) **and** how **Kyverno + Helm** enforce signatures at deploy: **[`golden-image-pipeline.md`](golden-image-pipeline.md)**

## Core references

- **Security training (32 modules):** [`security-best-practices-series/README.md`](security-best-practices-series/README.md) — canonical; site: `/security/best-practices/*` (sync via `website/scripts/sync-security-training-modules.mjs`). Legacy monolith: [`archive/security-guide-series.md`](archive/security-guide-series.md).
- Defense-in-depth reference guide: `clawql-security-defense-in-depth.md`
- Engineering deliverables matrix (shipped/partial/planned): `clawql-security-defense-deliverables.md`
- **npm** publish hardening (pack → scan → publish, provenance / OIDC): [`npm-supply-chain.md`](npm-supply-chain.md)
- **Deploy-time** Cosign enforcement (Kyverno policy fields, digest pins, forks): [`image-signature-enforcement.md`](image-signature-enforcement.md)
- **Runtime containment** (Kata vs gVisor, **`security.kata`**, Kyverno **`runtimeClassPolicy`**, issue [#274](https://github.com/danielsmithdevelopment/ClawQL/issues/274)): [`runtime-class-containment.md`](runtime-class-containment.md)
- **Local Privacy Filter** (gateway backup after Presidio, [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245)): [`privacy-filter-local.md`](privacy-filter-local.md)

## Supply-chain pipeline (summary)

- `docker-publish` runs **repo** gates (**OSV-Scanner**, **Trivy** fs, **Syft** SBOM) like CI, then **one BuildKit build** per image (**MCP**, **Panguard MCP bridge**, **website**) to a **local OCI layout** → **Trivy** on that layout → **`skopeo copy`** to GHCR (**same artifact**, no second build) → **Cosign** → promotion of **`latest`** / **`nightly`** / **`nightly-YYYYMMDD`**. Full narrative: [`golden-image-pipeline.md`](golden-image-pipeline.md).
- `ci` uploads a repository CycloneDX SBOM artifact with **Syft** (`sbom-cyclonedx-repository`) and runs OSV/Trivy checks.
- **Secrets:** mandatory **Gitleaks** working-tree scan in **`ci.yml`** (`secret-scan`, OSS Docker image); developer **`pre-commit`** hook in [`.pre-commit-config.yaml`](../../.pre-commit-config.yaml) with repo config [`.gitleaks.toml`](../../.gitleaks.toml). **TruffleHog** runs on a schedule for git history in [`trufflehog-scheduled.yml`](../../.github/workflows/trufflehog-scheduled.yml) (bundled **`providers/`** tree excluded as upstream noise). Tracking: [#283](https://github.com/danielsmithdevelopment/ClawQL/issues/283).
- **Private registry (Harbor):** mirror / pull-through patterns and SBOM retention next to images — [`golden-image-pipeline.md`](golden-image-pipeline.md) (Harbor section).
- Operator verification commands and workflow references live in `docker/README.md`.

## Tracking

- Primary tracking (**CI + publish + security docs / deliverables matrix**): [#156](https://github.com/danielsmithdevelopment/ClawQL/issues/156) — follow-ups: [#202](https://github.com/danielsmithdevelopment/ClawQL/issues/202) (MCP OSV provider), [#203](https://github.com/danielsmithdevelopment/ClawQL/issues/203) (Helm rescan job), [#204](https://github.com/danielsmithdevelopment/ClawQL/issues/204) (audit / memory scan-hash hooks)
- Admission/verification follow-up (digest pin + policy): [#132](https://github.com/danielsmithdevelopment/ClawQL/issues/132)
- Matrix maintenance issue: [#164](https://github.com/danielsmithdevelopment/ClawQL/issues/164)
