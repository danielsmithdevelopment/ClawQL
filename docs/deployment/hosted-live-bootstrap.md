# Hosted live bootstrap — Pulumi + Argo CD + `.cqw` Workflows

**Audience:** operators bringing ClawQL hosted tiers live (GTM Phase 1–3).  
**Related:** [GTM playbook](../gtm/clawql-gtm-playbook.md) · [ADR 0007 Pulumi](../adr/0007-pulumi-provisioning-managed-tiers.md) · [ADR 0004 Argo](../adr/0004-argo-cd-workflows-clawql-pipelines.md) · [GitOps agent contract](../gitops/agent-pr-argocd-pipeline.md)

## CI/CD (Cloudflare edge)

Workflow: [`.github/workflows/pulumi-cloudflare-edge.yml`](../../.github/workflows/pulumi-cloudflare-edge.yml)

| Trigger                           | Behavior                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| PR / push touching `infra/pulumi` | Unit tests + typecheck only                                                                                |
| `workflow_dispatch`               | Ensure R2 bucket `clawql-pulumi-state`, `pulumi login` to R2, then `preview` or `up` for stack `edge-prod` |

**Secrets (reuse docs/landing):** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.  
Optional:

- `CLOUDFLARE_API_TOKEN_ID` — required when the token is **account-scoped** (Workers template). Those tokens 401 on `/user/tokens/verify`; the Token ID from the dashboard is the R2 Access Key ID.
- `CLAWQL_R2_ACCESS_KEY_ID` / `CLAWQL_R2_SECRET_ACCESS_KEY` — dedicated R2 S3 keys (clearest for CI).
- `PULUMI_CONFIG_PASSPHRASE` — stable passphrase (recommended).

```bash
gh workflow run pulumi-cloudflare-edge.yml -f action=preview -f stack=edge-prod
gh workflow run pulumi-cloudflare-edge.yml -f action=up -f stack=edge-prod -f deploy_worker_stub=true
```

Token needs **Workers R2 Storage Write** (and Workers Scripts Edit if deploying the stub). If preview fails with HTTP 401 on credential derivation, add `CLOUDFLARE_API_TOKEN_ID` or R2 S3 key secrets and re-run.

## Separation of concerns

| Layer                   | Tool                                                     | Owns                                                      |
| ----------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| Cloud / account infra   | **Pulumi** (`infra/pulumi`)                              | Cloudflare edge bindings, EC2/K3s, EKS + Karpenter IAM    |
| Cluster desired state   | **Argo CD** (`deployment/gitops`)                        | Helm charts, WorkflowTemplates, Karpenter NodePools       |
| Deterministic pipelines | **Argo Workflows** + **`.cqw`** (`deployment/workflows`) | IDP DAGs, vault digest, fair queues                       |
| Agent / MCP             | ClawQL `workflow` + `argocd` tools                       | Submit templates, observe sync (no inline Workflow specs) |

Pulumi does **not** replace Argo CD. Pulumi creates the plane; Argo CD continuously reconciles apps and `.cqw` packs onto it.

```
Cloudflare edge (Pulumi profile=edge)
        │
        ▼
gateway Worker (stub → full MCP) ──proxy──► AWS K3s/EKS ingress
                                              │
                         Argo CD ◄── Git (charts + deployment/workflows/*.cqw)
                                              │
                         Argo Workflows executes WorkflowTemplates
```

## Profiles (`clawql:profile`)

| Profile       | Cloud      | Provisions                                                            |
| ------------- | ---------- | --------------------------------------------------------------------- |
| `edge`        | cloudflare | R2 vault, KV semantic cache, D1 tenants, Queues, optional Worker stub |
| `team-vault`  | cloudflare | R2 only (legacy ADR 0007 path)                                        |
| `golden-host` | aws / gcp  | Packer AMI → EC2/GCE                                                  |
| `idp-k3s`     | aws        | `r7i.2xlarge` + 200GB gp3 + K3s user-data (first IDP customer)        |
| `eks`         | aws        | EKS + reserved node group + Karpenter IAM (Phase 3)                   |

## Phase 1 — Cloudflare edge (Developer/Teams)

```bash
cd infra/pulumi
cp Pulumi.edge.example.yaml Pulumi.edge-prod.yaml
pulumi stack init edge-prod
pulumi config set cloudflare:apiToken --secret
pulumi config set cloudflare:accountId <account-id>
pulumi config set clawql:cloud cloudflare
pulumi config set clawql:profile edge
pulumi config set clawql:syncBucket clawql-vault-prod
pulumi config set clawql:deployWorkerStub true   # optional health/IDP stub
pulumi preview && pulumi up
```

Stack outputs: vault bucket, KV id, D1 id, queue id, optional Worker name. Next product work: real MCP handlers on those bindings (see GTM Phase 1 checklist).

## Phase 2 — First IDP customer (K3s)

```bash
cp Pulumi.idp-k3s.example.yaml Pulumi.idp-k3s.yaml
pulumi stack init idp-k3s-bootstrap
pulumi config set aws:region us-east-1
pulumi config set clawql:cloud aws
pulumi config set clawql:profile idp-k3s
pulumi config set clawql:tier dedicated
pulumi config set clawql:tenantId alpha
pulumi config set clawql:syncBucket clawql-vault-prod
# Restrict SSH/API in production:
# pulumi config set clawql:sshCidrBlocks '203.0.113.0/32'
pulumi preview && pulumi up
```

After instance is Ready:

1. `scp` / SSM → copy `/etc/rancher/k3s/k3s.yaml` (rewrite server IP to public IP).
2. Install Argo CD (upstream Helm) into `argocd`.
3. `kubectl apply -f deployment/gitops/projects/clawql.yaml -n argocd`
4. `kubectl apply -f deployment/gitops/applications/root.yaml -n argocd`
5. Sync **clawql-idp-dev** + **clawql-workflows**.
6. Enable MCP: `CLAWQL_ENABLE_WORKFLOW=1`, `CLAWQL_ENABLE_ARGO_CD=1`.

## Phase 3 — EKS + Karpenter

```bash
cp Pulumi.eks.example.yaml Pulumi.eks-prod.yaml
pulumi stack init eks-prod
pulumi config set clawql:cloud aws
pulumi config set clawql:profile eks
pulumi config set clawql:eksClusterName clawql-prod
pulumi config set clawql:subnetIds 'subnet-aaa,subnet-bbb'  # recommended (tagged for Karpenter)
pulumi up
```

Then:

1. `aws eks update-kubeconfig --name <clusterName>`
2. Install Karpenter Helm (controller SA `karpenter` in ns `karpenter`) using `karpenterControllerRoleArn` output.
3. Patch `deployment/gitops/karpenter/nodepools.yaml` placeholders → commit → Argo syncs **clawql-karpenter-config**.
4. Label/tag subnets + cluster SGs with `karpenter.sh/discovery=<clusterName>`.

## `.cqw` → Argo Workflows

- Author / review WorkflowTemplates as **`.cqw`** under [`deployment/workflows/`](../../deployment/workflows/).
- Argo CD Application **clawql-workflows** syncs them into namespace `argo`.
- Agents call MCP `workflow` with `template_ref` only — never inline specs.
- Per-tenant fair concurrency: semaphore ConfigMap keys (see `idp-document-pipeline.cqw`).

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

Future: `clawql operator provision --profile edge`.

## State backend

Self-hosted only (no Pulumi Cloud) — R2 or S3. See [ADR 0007](../adr/0007-pulumi-provisioning-managed-tiers.md).
