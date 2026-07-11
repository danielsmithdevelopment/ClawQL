# ClawQL golden host images (Packer)

Immutable VM images with ClawQL installed and `~/.ClawQL` prepared for boot-time team vault seeding.

## Targets

| Build name | Cloud | Artifact |
|------------|-------|----------|
| `validate.docker.clawql` | Docker (CI) | Syntax + bake smoke |
| `aws-ami.amazon-ebs.clawql` | AWS | AMI per region |
| `gcp-image.googlecompute.clawql` | GCP | Custom Compute image |

Cloudflare managed tier uses `scripts/packer/cloudflare-bootstrap.sh` at Worker/container boot (verified R2 state — no AMI).

## Bake vs boot

- **Bake (Packer):** `scripts/packer/bake-clawql.sh` — Node 22, ClawQL install, `sync.json` template, no secrets.
- **Boot (runtime):** `scripts/packer/bootstrap-team-vault.sh` — inject credentials, `clawql sync pull` (SHA-256 verified), `clawql doctor --smoke`.

## Local validate (CI uses the same)

```bash
bash scripts/packer/test-golden-host-scripts.sh
```

## Build examples

```bash
cd packer
packer init .

# CI / PR — docker validate only
packer build -only=validate.docker.clawql -var 'clawql_version=latest' .

# AWS (requires credentials)
packer build -only=aws-ami.amazon-ebs.clawql \
  -var 'clawql_version=7.0.0' \
  -var 'aws_region=us-east-1' .

# GCP (requires project)
packer build -only=gcp-image.googlecompute.clawql \
  -var 'clawql_version=7.0.0' \
  -var 'gcp_project_id=my-project' .
```

## Tier seeding

| Tier | Boot configuration |
|------|-------------------|
| Shared | `CLAWQL_SYNC_PREFIX=shared/` + tenant isolation via operator |
| Dedicated | `CLAWQL_SYNC_PREFIX=tenant/{id}/` from instance metadata |
| Enterprise | Customer bucket + Vault; image unchanged |

See [docs/getting-started/golden-host-images.md](../docs/getting-started/golden-host-images.md) and [ADR 0006](../docs/adr/0006-golden-host-images-packer.md).
