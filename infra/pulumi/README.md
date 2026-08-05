# ClawQL provision (Pulumi)

TypeScript Pulumi programs for ClawQL hosted infra. **Packer** builds golden host AMIs; **Pulumi** provisions cloud resources; **Argo CD** GitOps the cluster (Helm + `.cqw` WorkflowTemplates).

Live runbook: [`docs/deployment/hosted-live-bootstrap.md`](../../docs/deployment/hosted-live-bootstrap.md)

## Profiles (`clawql:profile`)

| Profile | Cloud | What it creates |
| --- | --- | --- |
| `edge` | cloudflare | R2 vault, KV cache, D1 tenants, Queues, optional Worker stub (Developer/Teams) |
| `team-vault` | cloudflare | R2 team-vault bucket only (legacy) |
| `golden-host` | aws / gcp | EC2/GCE from Packer image |
| `idp-k3s` | aws | `r7i.2xlarge` + EBS + K3s bootstrap user-data (first IDP customer) |
| `eks` | aws | EKS + reserved node group + Karpenter IAM (shared tenancy) |

If `clawql:profile` is omitted: `cloudflare` → `team-vault`, `aws`/`gcp` → `golden-host`.

## Layout

| Path | Role |
|------|------|
| `src/index.ts` | Stack entry — routes by profile |
| `src/cloudflare-edge.ts` | Edge launch stack |
| `src/cloudflare.ts` | R2 team-vault only |
| `src/aws-idp-k3s.ts` | K3s bootstrap EC2 |
| `src/aws-eks.ts` | EKS + Karpenter roles |
| `src/aws.ts` / `src/gcp.ts` | Golden hosts |
| `src/k3s-user-data.ts` | K3s install script |
| `src/profiles.ts` | Profile enum + defaults |
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

# --- Phase 1: Cloudflare edge ---
cp Pulumi.edge.example.yaml Pulumi.edge-prod.yaml
pulumi stack init edge-prod
pulumi config set cloudflare:apiToken --secret
pulumi config set cloudflare:accountId <account-id>
pulumi preview && pulumi up

# --- Phase 2: IDP K3s ---
cp Pulumi.idp-k3s.example.yaml Pulumi.idp-k3s.yaml
pulumi stack init idp-k3s-bootstrap
pulumi config set aws:region us-east-1
pulumi preview && pulumi up
# Then Argo CD → deployment/gitops (see hosted-live-bootstrap.md)

# --- Phase 3: EKS ---
cp Pulumi.eks.example.yaml Pulumi.eks-prod.yaml
pulumi stack init eks-prod
pulumi preview && pulumi up
```

## GitOps after Pulumi

1. Install Argo CD on the cluster  
2. Apply `deployment/gitops/projects/clawql.yaml`  
3. Apply `deployment/gitops/applications/root.yaml`  
4. Sync IDP Helm + `deployment/workflows/*.cqw`  

Deterministic pipelines are **`.cqw` → WorkflowTemplate → Argo Workflows**; agents submit via MCP `workflow` (template-ref only).

## State backend (self-hosted only)

See [ADR 0007](../../docs/adr/0007-pulumi-provisioning-managed-tiers.md). **No Pulumi Cloud.**

## Automation API

```typescript
import { edgeStackName, upProvisionStack } from "clawql-provision/automation";

await upProvisionStack({
  workDir: "infra/pulumi",
  stackName: edgeStackName("prod"),
  config: {
    cloud: "cloudflare",
    profile: "edge",
    tier: "shared",
    syncBucket: "clawql-vault-prod",
    deployWorkerStub: true,
  },
});
```

## Related

- [Hosted live bootstrap](../../docs/deployment/hosted-live-bootstrap.md)
- [GitOps README](../../deployment/gitops/README.md)
- [GTM playbook](../../docs/gtm/clawql-gtm-playbook.md)
- [ADR 0006: Packer](../../docs/adr/0006-golden-host-images-packer.md)
- [ADR 0007: Pulumi](../../docs/adr/0007-pulumi-provisioning-managed-tiers.md)
