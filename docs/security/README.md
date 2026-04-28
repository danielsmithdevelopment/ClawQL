# Security docs

This section tracks ClawQL security architecture, shipped controls, and roadmap items in one place.

## Golden image pipeline (start here)

- **End-to-end** (CI gates → single OCI build → Trivy → skopeo → Cosign → tag promotion) **and** how **Kyverno + Helm** enforce signatures at deploy: **[`golden-image-pipeline.md`](golden-image-pipeline.md)**

## Core references

- Defense-in-depth reference guide: `clawql-security-defense-in-depth.md`
- Engineering deliverables matrix (shipped/partial/planned): `clawql-security-defense-deliverables.md`
- **npm** publish hardening (pack → scan → publish, provenance / OIDC): [`npm-supply-chain.md`](npm-supply-chain.md)
- **Deploy-time** Cosign enforcement (Kyverno policy fields, digest pins, forks): [`image-signature-enforcement.md`](image-signature-enforcement.md)

## Supply-chain pipeline (summary)

- `docker-publish` runs **repo** gates (**OSV-Scanner**, **Trivy** fs, **Syft** SBOM) like CI, then **one BuildKit build** per image (**MCP** + **website**) to a **local OCI layout** → **Trivy** on that layout → **`skopeo copy`** to GHCR (**same artifact**, no second build) → **Cosign** → promotion of **`latest`** / **`nightly`** / **`nightly-YYYYMMDD`**. Full narrative: [`golden-image-pipeline.md`](golden-image-pipeline.md).
- `ci` uploads a repository CycloneDX SBOM artifact with **Syft** (`sbom-cyclonedx-repository`) and runs OSV/Trivy checks.
- Operator verification commands and workflow references live in `docker/README.md`.

## Tracking

- Primary tracking (**CI + publish + security docs / deliverables matrix**): [#156](https://github.com/danielsmithdevelopment/ClawQL/issues/156) — follow-ups: [#202](https://github.com/danielsmithdevelopment/ClawQL/issues/202) (MCP OSV provider), [#203](https://github.com/danielsmithdevelopment/ClawQL/issues/203) (Helm rescan job), [#204](https://github.com/danielsmithdevelopment/ClawQL/issues/204) (audit / memory scan-hash hooks)
- Admission/verification follow-up (digest pin + policy): [#132](https://github.com/danielsmithdevelopment/ClawQL/issues/132)
- Matrix maintenance issue: [#164](https://github.com/danielsmithdevelopment/ClawQL/issues/164)
