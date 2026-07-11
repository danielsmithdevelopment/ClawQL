# ADR 0006: Golden host images (Packer) for managed ClawQL tiers

- Status: Accepted
- Date: 2026-07-11
- Related: team vault sync ([`docs/getting-started/team-vault-sync.md`](../getting-started/team-vault-sync.md)), golden image pipeline ([`docs/security/golden-image-pipeline.md`](../security/golden-image-pipeline.md)), Helm `teamSync` ([`charts/clawql-mcp`](../../charts/clawql-mcp/README.md))
- Implementation: [`packer/`](../../packer/), [`scripts/packer/`](../../scripts/packer/), [`.github/workflows/packer-publish.yml`](../../.github/workflows/packer-publish.yml)

## Context

Managed ClawQL offerings on **AWS**, **GCP**, and **Cloudflare** need hosts that boot with:

1. ClawQL installed and onboarded
2. Team agent context (`~/.ClawQL/Memory/`, sources, PageIndex) available via **`clawql sync pull`**
3. Verification before serving traffic (**manifest SHA-256** + **`clawql doctor --smoke`**)

Helm **`teamSync`** already implements boot-time pull for Kubernetes pods. **Packer** is the VM analogue for EC2/GCE managed tiers. **Cloudflare** uses the same bootstrap script against verified R2 state (no AMI).

Users choose **providers** (`CLAWQL_PROVIDER`, team bucket prefix). Protocol routing (gRPC → GraphQL → OpenAPI) stays internal.

## Decision

### 1) Two-phase provisioning (secrets never in the image)

| Phase | When | What |
|-------|------|------|
| **Bake** | Packer build | Ubuntu 24.04, Node 22, `clawql` install, `~/.ClawQL` skeleton, `sync.json` template (`CONFIGURE_AT_BOOT` bucket placeholder) |
| **Boot** | Instance / Worker start | Inject sync credentials (metadata, Vault agent, ESO), `clawql sync pull`, `clawql doctor --smoke` |

`vault/providers.json` and sync credentials **never** ship in the image (same rule as team sync docs).

### 2) Pull verification (fail closed)

`clawql sync pull` verifies each downloaded object against the remote manifest **SHA-256** before writing to disk. Tampered or truncated objects abort pull — required for golden-host and enterprise claims.

### 3) One Packer template, multiple cloud outputs

- **`validate.docker.clawql`** — CI smoke (no cloud credentials)
- **`aws-ami.amazon-ebs.clawql`** — AWS AMI
- **`gcp-image.googlecompute.clawql`** — GCP custom image
- **Cloudflare** — `scripts/packer/cloudflare-bootstrap.sh` (R2 pull at first invocation)

Release CI signs container artifacts today (Cosign on GHCR). VM image signing (e.g. AMI snapshot attestations) is a follow-up; Layer 0 manifest can record AMI/image IDs as **`hostImages`** in a future schema bump.

### 4) Tier seeding via bucket prefix (not image variant)

| Tier | Seeding |
|------|---------|
| **Shared** | `CLAWQL_SYNC_PREFIX=shared/`; tenant isolation via operator |
| **Dedicated** | `CLAWQL_SYNC_PREFIX=tenant/{id}/` from instance metadata |
| **Enterprise** | Customer bucket + Vault; ClawQL ships the signed image only |

## Consequences

### Positive

- **Boot and work** — no post-install shell recipe for managed customers
- **Reproducible** — same bake script across AWS/GCP validate path
- **Aligned with vault-first** — team sync manifest verification at pull time
- **Sales story** — signed ClawQL host + customer-controlled team bucket

### Trade-offs

- **Packer cloud builds** need cloud credentials (release workflow / manual dispatch only)
- **Cloudflare** is bootstrap-script parity, not a Packer target
- **Doctor smoke** at boot requires reachable bucket credentials and non-empty team prefix (empty bucket is a valid fresh team)

## Alternatives considered

- **Bake-time `sync pull` with secrets in Packer vars** — rejected (secrets in AMI layers)
- **cloud-init only without golden AMI** — slower boot, drift between instances
- **Merge into container image only** — does not cover EC2/GCE dedicated tiers
