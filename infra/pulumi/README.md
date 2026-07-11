# ClawQL provision (Pulumi)

TypeScript Pulumi programs to provision managed-tier infrastructure. **Packer** builds the golden host artifact; **Pulumi** creates the cloud resources that run it.

## Layout

| Path | Role |
|------|------|
| `src/index.ts` | Stack entry — routes by `clawql:cloud` |
| `src/aws.ts` | EC2 instance, IAM, security group, user-data |
| `src/gcp.ts` | GCE instance + startup-script metadata |
| `src/cloudflare.ts` | R2 team-vault bucket |
| `src/tiers.ts` | Tier → sync prefix mapping |
| `src/user-data.ts` | Boot bash for golden images |
| `src/automation.ts` | Automation API (`stack.up` from Node) |

## Quick start

```bash
cd infra/pulumi
npm ci
npm test
npm run build

# Self-hosted state (R2 preferred — see State backend below)
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
pulumi login 's3://clawql-pulumi-state?region=auto&endpoint=https://<accountid>.r2.cloudflarestorage.com&awssdk=v2'

# Cloudflare R2 only (no VM / no golden image)
cp Pulumi.cloudflare.example.yaml Pulumi.dev-r2.yaml
pulumi stack init dev-r2
pulumi config set cloudflare:apiToken --secret
pulumi config set cloudflare:accountId <account-id>
pulumi config set clawql:cloud cloudflare
pulumi config set clawql:tier dedicated
pulumi config set clawql:tenantId <your-handle>
pulumi config set clawql:syncBucket clawql-team-vault
pulumi preview && pulumi up

# AWS / GCP golden host (requires Packer AMI / image)
cp Pulumi.example.yaml Pulumi.dev.yaml
pulumi stack init dev
pulumi config set clawql:cloud aws
pulumi config set clawql:tier shared
pulumi config set clawql:syncBucket acme-clawql-team
pulumi config set clawql:goldenImageId ami-xxxxxxxx   # from Packer output
pulumi preview   # needs cloud credentials
```

## Tier config

| Tier | Required config | Sync prefix |
|------|-----------------|-------------|
| `shared` | `syncBucket`, `goldenImageId` (AWS/GCP only) | `shared/` |
| `dedicated` | + `tenantId` | `tenant/{tenantId}/` |
| `enterprise` | + `syncPrefix` | custom |
| `cloudflare` (R2 only) | `syncBucket`, `cloudflare:accountId` — **no** `goldenImageId` | per tier |

Dedicated AWS stacks default `useSsmSecrets=true`; user-data reads sync credentials from SSM at boot.

## State backend (self-hosted only)

See [ADR 0007](../../docs/adr/0007-pulumi-provisioning-managed-tiers.md). **No Pulumi Cloud.**

**Preferred:** Cloudflare R2 (S3-compatible, same stack as team vault).

```bash
export AWS_ACCESS_KEY_ID=...          # R2 API token
export AWS_SECRET_ACCESS_KEY=...
pulumi login 's3://clawql-pulumi-state?region=auto&endpoint=https://<accountid>.r2.cloudflarestorage.com&awssdk=v2'
```

**Alternative:** AWS S3 — `pulumi login s3://clawql-pulumi-state`

Stack secrets are encrypted with your Pulumi secrets passphrase and stored in the same object-store backend.

## Automation API (operator / CLI)

```typescript
import { dedicatedStackName, upProvisionStack } from "clawql-provision/automation";

await upProvisionStack({
  workDir: "infra/pulumi",
  stackName: dedicatedStackName("acme"),
  config: {
    cloud: "aws",
    tier: "dedicated",
    tenantId: "acme",
    syncBucket: "acme-clawql-team",
    goldenImageId: "ami-xxxxxxxx",
  },
});
```

Future: `clawql operator provision --tier dedicated --tenant acme`.

## Related

- [Cloud Agent + R2 + Tailscale runbook](../../docs/deployment/cloud-agent-r2-tailscale-runbook.md)
- [Golden host images (Packer)](../../docs/getting-started/golden-host-images.md)
- [ADR 0006: Packer](../../docs/adr/0006-golden-host-images-packer.md)
- [ADR 0007: Pulumi](../../docs/adr/0007-pulumi-provisioning-managed-tiers.md)
