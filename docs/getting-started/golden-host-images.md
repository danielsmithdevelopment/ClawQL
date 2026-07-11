# Golden host images (managed tiers)

Provision **ClawQL-ready servers** with team agent context loaded at boot — for AWS, GCP, and Cloudflare managed offerings.

**User model:** pick providers and team bucket. ClawQL handles connection routing internally. You only need **`search`** and **`execute`** after boot.

## What you get

| Component | Bake time (image) | Boot time (runtime) |
|-----------|-------------------|---------------------|
| ClawQL + Node 22 | Yes | — |
| `~/.ClawQL` skeleton | Yes | — |
| `sync.json` (bucket/prefix) | Template only | Overridden from metadata/env |
| Sync credentials | **Never** | Injected (Vault, instance role, secrets manager) |
| Team `Memory/` notes | — | `clawql sync pull` |
| SHA-256 verification | — | Every pulled file vs manifest |
| Health gate | `clawql doctor` (bake) | `clawql doctor --smoke` (boot) |

## Quick start (operators)

### 1. Build or promote a golden image

```bash
cd packer
packer init .
packer build -only=aws-ami.amazon-ebs.clawql -var 'clawql_version=7.0.0' .
```

See [`packer/README.md`](../../packer/README.md) for GCP and CI validate targets.

### 2. Launch with boot-time seeding

Set instance user-data / startup script to run:

```bash
export CLAWQL_SYNC_BUCKET=acme-clawql-team
export CLAWQL_SYNC_PREFIX=teams/production/
export CLAWQL_R2_ACCOUNT_ID=...
export CLAWQL_SYNC_ACCESS_KEY_ID=...
export CLAWQL_SYNC_SECRET_ACCESS_KEY=...
/usr/local/bin/bootstrap-team-vault.sh   # installed on golden images at bake time
```

Or use the repo script path: `scripts/packer/bootstrap-team-vault.sh`.

### 3. Verify

```bash
clawql doctor --smoke
clawql sync status
```

## Tier seeding

| Tier | Configuration |
|------|----------------|
| **Shared** | `CLAWQL_SYNC_PREFIX=shared/` |
| **Dedicated** | `CLAWQL_SYNC_PREFIX=tenant/<tenant-id>/` |
| **Enterprise** | Customer-owned bucket; same image, their credentials |

## Cloudflare managed tier

Workers and containers do not use AMIs. Run `scripts/packer/cloudflare-bootstrap.sh` on first invocation — same pull + verify + doctor gate against **verified R2 state**.

## Kubernetes parity

In-cluster MCP uses Helm **`teamSync`** (`autoPullOnStart`, `autoPull`) — same semantics as golden-host boot. See [team-vault-sync.md](./team-vault-sync.md).

## CI and releases

- **PR / main:** `scripts/packer/test-golden-host-scripts.sh` (ShellCheck + `packer validate`)
- **Release:** [`.github/workflows/packer-publish.yml`](../../.github/workflows/packer-publish.yml) — matrix AWS/GCP on dispatch; docker validate on every run

## Related

- [Team vault sync](./team-vault-sync.md)
- [ADR 0006: Golden host images](../adr/0006-golden-host-images-packer.md)
- [Golden image pipeline (containers)](../security/golden-image-pipeline.md)
