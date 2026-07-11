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

# Configure stack (copy and edit)
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
| `shared` | `syncBucket`, `goldenImageId` | `shared/` |
| `dedicated` | + `tenantId` | `tenant/{tenantId}/` |
| `enterprise` | + `syncPrefix` | custom |

Dedicated AWS stacks default `useSsmSecrets=true`; user-data reads sync credentials from SSM at boot.

## State backend

See [ADR 0007](../../docs/adr/0007-pulumi-provisioning-managed-tiers.md).

- **Pulumi Cloud:** `pulumi login` (recommended for dev)
- **Self-hosted (R2/S3):** `pulumi login s3://your-state-bucket` or compatible backend

Stack secrets (if any) are encrypted by the backend you choose.

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

- [Golden host images (Packer)](../../docs/getting-started/golden-host-images.md)
- [ADR 0006: Packer](../../docs/adr/0006-golden-host-images-packer.md)
- [ADR 0007: Pulumi](../../docs/adr/0007-pulumi-provisioning-managed-tiers.md)
